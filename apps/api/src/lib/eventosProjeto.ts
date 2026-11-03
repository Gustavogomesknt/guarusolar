import type { Prisma, StatusProjeto, TipoEventoProjeto, TipoServico } from '@prisma/client';
import { ROTULO_TIPO_SERVICO } from '@guarusolar/compartilhado';

/*
 * Histórico do projeto (tabela EventoProjeto): quem muda a obra registra o evento na MESMA
 * transação da mudança, para o histórico nunca ficar diferente do que aconteceu.
 * Gravam: aprovação do orçamento, agenda (agendar, remarcar, cancelar), app do técnico (primeira
 * foto, envio), validação (aprovar, devolver) e a ficha do projeto (editar, cancelar).
 * Evento que MUDA A SITUAÇÃO do projeto não passa por aqui: usa mudarSituacaoDoProjeto
 * (lib/situacaoDoProjeto.ts), que grava também a situação anterior e a nova.
 */

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  evento: {
    projetoId: string;
    agendamentoId?: string | null;
    tipo: TipoEventoProjeto;
    descricao: string;
    usuarioId?: string | null;
    /** só na criação do projeto; as demais passagens gravam pelo mudarSituacaoDoProjeto */
    statusNovo?: StatusProjeto;
  },
) {
  await tx.eventoProjeto.create({ data: evento });
}

/**
 * "30/09" ou "30/09 a 02/10" (datas do serviço, gravadas como dia sem hora). Com a hora de
 * início (03/11/2026), ela entra no primeiro dia: "30/09 às 08:30", "30/09 às 08:30 a 02/10".
 */
export function periodoDoServico(inicio: Date, fim: Date, hora?: string | null) {
  const dia = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}`;
  const primeiro = hora ? `${dia(inicio)} às ${hora}` : dia(inicio);
  return inicio.getTime() === fim.getTime() ? primeiro : `${primeiro} a ${dia(fim)}`;
}

export const rotuloDoServico = (tipo: TipoServico) => ROTULO_TIPO_SERVICO[tipo];

/** Final do particípio no texto do histórico: "Instalação agendadA", "Retrabalho agendadO". */
export const oa = (tipo: TipoServico) => (tipo === 'RETRABALHO' ? 'o' : 'a');
