import type { Prisma, TipoEventoProjeto, TipoServico } from '@prisma/client';
import { ROTULO_TIPO_SERVICO } from '@guarusolar/compartilhado';

/*
 * Histórico do projeto (tabela EventoProjeto): quem muda a obra registra o evento na MESMA
 * transação da mudança, para o histórico nunca ficar diferente do que aconteceu.
 * Gravam: aprovação do orçamento, agenda (agendar, remarcar, cancelar), app do técnico (primeira
 * foto, envio), validação (aprovar, devolver) e a ficha do projeto (editar, cancelar).
 */

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  evento: { projetoId: string; agendamentoId?: string | null; tipo: TipoEventoProjeto; descricao: string; usuarioId?: string | null },
) {
  await tx.eventoProjeto.create({ data: evento });
}

/** "30/09" ou "30/09 a 02/10" (datas do serviço, gravadas como dia sem hora). */
export function periodoDoServico(inicio: Date, fim: Date) {
  const dia = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}`;
  return inicio.getTime() === fim.getTime() ? dia(inicio) : `${dia(inicio)} a ${dia(fim)}`;
}

export const rotuloDoServico = (tipo: TipoServico) => ROTULO_TIPO_SERVICO[tipo];
