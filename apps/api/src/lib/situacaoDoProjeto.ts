import type { Prisma, StatusAgendamento, StatusProjeto, TipoEventoProjeto, TipoServico } from '@prisma/client';
import { moveOProjeto, ROTULO_STATUS_PROJETO, SERVICO_ANDANDO, TIPOS_SERVICO } from '@guarusolar/compartilhado';

/*
 * TODA mudança de situação do projeto passa por aqui: muda a situação e grava no histórico, na
 * MESMA transação, quem mudou, de qual situação para qual e quando (EventoProjeto.statusAnterior
 * e statusNovo). Nenhum outro lugar faz `projeto.update({ status })`.
 *
 * Quem pode levar a CONCLUIDO: só `POST /api/projetos/:id/concluir` (gestor ou admin), partindo
 * de AGUARDANDO_CONCLUSAO. A validação das fotos NUNCA conclui o projeto: o que ela faz depende do
 * tipo do serviço (packages/compartilhado/src/roteiroDoServico.ts, `aoValidar`). Uma instalação
 * pode levar vários dias, com mais de um agendamento; quem sabe que a obra terminou é o gestor.
 */

/** Só estas passagens existem. A que não está aqui é erro de programação e desfaz a transação. */
const PASSAGENS: Record<StatusProjeto, StatusProjeto[]> = {
  AGUARDANDO_AGENDAMENTO: ['AGENDADO', 'CANCELADO'],
  // adiante (primeira foto, envio) ou de volta ao repouso (o único serviço foi cancelado)
  AGENDADO: ['EM_EXECUCAO', 'AGUARDANDO_VALIDACAO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO', 'CANCELADO'],
  // "AGENDADO" a partir daqui: o serviço que andava foi validado (visita) ou cancelado e ainda
  // sobra outro só agendado
  EM_EXECUCAO: ['AGUARDANDO_VALIDACAO', 'AGENDADO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO'],
  AGUARDANDO_VALIDACAO: ['EM_EXECUCAO', 'AGENDADO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO'],
  // mais um serviço que move o projeto (outro dia de instalação) ou a conclusão pelo gestor
  AGUARDANDO_CONCLUSAO: ['EM_EXECUCAO', 'AGENDADO', 'CONCLUIDO'],
  // só "Reabrir projeto" tira daqui
  CONCLUIDO: ['AGUARDANDO_CONCLUSAO'],
  CANCELADO: [],
};

export async function mudarSituacaoDoProjeto(
  tx: Prisma.TransactionClient,
  mudanca: {
    projetoId: string;
    para: StatusProjeto;
    evento: TipoEventoProjeto;
    descricao: string;
    usuarioId: string | null;
    agendamentoId?: string | null;
    /** outros campos do projeto que mudam junto (datas, quem concluiu…) */
    dados?: Omit<Prisma.ProjetoUncheckedUpdateInput, 'status'>;
  },
) {
  const atual = await tx.projeto.findUniqueOrThrow({ where: { id: mudanca.projetoId }, select: { status: true } });
  // já está na situação pedida (ex.: serviço devolvido de novo): registra o evento, sem passagem
  if (atual.status === mudanca.para) {
    const projeto = mudanca.dados ? await tx.projeto.update({ where: { id: mudanca.projetoId }, data: mudanca.dados }) : null;
    await tx.eventoProjeto.create({
      data: { projetoId: mudanca.projetoId, agendamentoId: mudanca.agendamentoId ?? null, tipo: mudanca.evento, descricao: mudanca.descricao, usuarioId: mudanca.usuarioId },
    });
    return projeto;
  }
  if (!PASSAGENS[atual.status].includes(mudanca.para)) {
    throw new Error(`Passagem de situação não prevista: ${atual.status} -> ${mudanca.para} (projeto ${mudanca.projetoId})`);
  }
  const projeto = await tx.projeto.update({ where: { id: mudanca.projetoId }, data: { ...mudanca.dados, status: mudanca.para } });
  await tx.eventoProjeto.create({
    data: {
      projetoId: mudanca.projetoId,
      agendamentoId: mudanca.agendamentoId ?? null,
      tipo: mudanca.evento,
      descricao: mudanca.descricao,
      usuarioId: mudanca.usuarioId,
      statusAnterior: atual.status,
      statusNovo: mudanca.para,
    },
  });
  return projeto;
}

/** Só visita técnica e instalação entram na conta da situação do projeto. */
const TIPOS_QUE_MOVEM: TipoServico[] = TIPOS_SERVICO.filter(moveOProjeto);

/**
 * A situação do projeto DECORRE dos serviços dele (visita técnica e instalação; cancelados e os
 * que correm por fora não contam). Um projeto pode ter vários serviços agendados e, no máximo,
 * um andando:
 *  - um em validação                      -> "Aguardando validação"
 *  - um em execução (ou devolvido)        -> "Em execução"
 *  - só agendados, sem instalação validada-> "Agendado"
 *  - só agendados, com instalação validada-> "Em execução" (a obra começou e ainda falta dia)
 *  - nenhum pendente                      -> "Aguardando conclusão" se há instalação validada;
 *                                            senão "A agendar"
 * Ou seja: o projeto só chega a "Aguardando conclusão" quando a instalação foi validada E não
 * sobra nenhum outro pendente. Nunca devolve CONCLUIDO: concluir é ação do gestor.
 */
export function situacaoPelosServicos(servicos: { tipo: TipoServico; status: StatusAgendamento }[]): StatusProjeto {
  const contam = servicos.filter((s) => TIPOS_QUE_MOVEM.includes(s.tipo) && s.status !== 'CANCELADO');
  const instalado = contam.some((s) => s.tipo === 'INSTALACAO' && s.status === 'APROVADO');
  if (contam.some((s) => s.status === 'AGUARDANDO_VALIDACAO')) return 'AGUARDANDO_VALIDACAO';
  if (contam.some((s) => s.status === 'EM_EXECUCAO' || s.status === 'DEVOLVIDO')) return 'EM_EXECUCAO';
  if (contam.some((s) => s.status === 'AGENDADO')) return instalado ? 'EM_EXECUCAO' : 'AGENDADO';
  return instalado ? 'AGUARDANDO_CONCLUSAO' : 'AGUARDANDO_AGENDAMENTO';
}

/**
 * A situação que o projeto deve ter AGORA, lida dos serviços gravados (chame depois de gravar a
 * mudança do serviço, na mesma transação). `null`: projeto concluído ou cancelado, em que nenhum
 * serviço mexe.
 */
export async function situacaoDevida(tx: Prisma.TransactionClient, projetoId: string): Promise<StatusProjeto | null> {
  const projeto = await tx.projeto.findUniqueOrThrow({
    where: { id: projetoId },
    select: { status: true, agendamentos: { where: { tipo: { in: TIPOS_QUE_MOVEM } }, select: { tipo: true, status: true } } },
  });
  if (projeto.status === 'CONCLUIDO' || projeto.status === 'CANCELADO') return null;
  return situacaoPelosServicos(projeto.agendamentos);
}

const ANDANDO: StatusAgendamento[] = [...SERVICO_ANDANDO];

/** O outro serviço do projeto que está com o técnico ou em validação (só pode haver um). */
export const outroServicoAndando = (tx: Prisma.TransactionClient, servico: { id: string; projetoId: string }) =>
  tx.agendamento.findFirst({
    where: { projetoId: servico.projetoId, id: { not: servico.id }, status: { in: ANDANDO } },
    select: { tipo: true, status: true, dataInicio: true, dataFim: true },
  });

export const nomeDaSituacao = (s: StatusProjeto) => ROTULO_STATUS_PROJETO[s];
