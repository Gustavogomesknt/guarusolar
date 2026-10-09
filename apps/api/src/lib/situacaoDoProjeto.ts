import type { Prisma, StatusProjeto, TipoEventoProjeto } from '@prisma/client';
import { ROTULO_STATUS_PROJETO } from '@guarusolar/compartilhado';

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
  // adiante (primeira foto, envio) ou de volta ao repouso (serviço cancelado; validado estando devolvido)
  AGENDADO: ['EM_EXECUCAO', 'AGUARDANDO_VALIDACAO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO', 'CANCELADO'],
  EM_EXECUCAO: ['AGUARDANDO_VALIDACAO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO'],
  AGUARDANDO_VALIDACAO: ['EM_EXECUCAO', 'AGUARDANDO_AGENDAMENTO', 'AGUARDANDO_CONCLUSAO'],
  // mais um serviço que move o projeto (outro dia de instalação) ou a conclusão pelo gestor
  AGUARDANDO_CONCLUSAO: ['AGENDADO', 'CONCLUIDO'],
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

/**
 * Para onde o projeto volta quando um serviço que o movia é cancelado: "Aguardando conclusão"
 * se já tem instalação validada (era mais um dia de obra); senão, "A agendar".
 */
export async function situacaoDeRepouso(tx: Prisma.TransactionClient, projetoId: string): Promise<StatusProjeto> {
  const instalada = await tx.agendamento.count({ where: { projetoId, tipo: 'INSTALACAO', status: 'APROVADO' } });
  return instalada > 0 ? 'AGUARDANDO_CONCLUSAO' : 'AGUARDANDO_AGENDAMENTO';
}

export const nomeDaSituacao = (s: StatusProjeto) => ROTULO_STATUS_PROJETO[s];
