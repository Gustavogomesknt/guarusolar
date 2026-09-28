import type { StatusOrcamento } from '@guarusolar/compartilhado';

/**
 * Cores dos selos de status (protótipo aprovado). Texto sempre escuro sobre fundo claro;
 * o ponto (`ponto`) é a cor viva usada no menu de transições.
 * Verde e vermelho só para Aprovado e Recusado, como define o CLAUDE.md.
 */
export const CORES_STATUS: Record<StatusOrcamento, { fundo: string; texto: string; ponto: string }> = {
  RASCUNHO: { fundo: 'bg-[#E7EBF2]', texto: 'text-[#414F60]', ponto: 'bg-[#8391A5]' },
  ENVIADO: { fundo: 'bg-[#E1EAF7]', texto: 'text-[#23508F]', ponto: 'bg-[#3A6FC0]' },
  EM_NEGOCIACAO: { fundo: 'bg-[#FDEBD6]', texto: 'text-[#8A4B07]', ponto: 'bg-destaque' },
  APROVADO: { fundo: 'bg-[#DCF0E3]', texto: 'text-[#17653E]', ponto: 'bg-[#2E9A5F]' },
  RECUSADO: { fundo: 'bg-[#F8E0DD]', texto: 'text-[#A3231B]', ponto: 'bg-[#D2463B]' },
};
