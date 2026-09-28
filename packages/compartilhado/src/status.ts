import type { StatusOrcamento } from './enums.js';

/**
 * Para quais status um orçamento pode ir a partir de cada status.
 * A API valida o PATCH /status com este mapa, e a lista do escritório usa o mesmo mapa
 * para montar o menu de mudança de status. APROVADO não sai mais (vira projeto).
 */
export const TRANSICOES_STATUS: Record<StatusOrcamento, readonly StatusOrcamento[]> = {
  RASCUNHO: ['ENVIADO'],
  ENVIADO: ['EM_NEGOCIACAO', 'APROVADO', 'RECUSADO'],
  EM_NEGOCIACAO: ['ENVIADO', 'APROVADO', 'RECUSADO'],
  APROVADO: [],
  RECUSADO: ['EM_NEGOCIACAO'],
};

export const podeMudarStatus = (de: StatusOrcamento, para: StatusOrcamento) =>
  TRANSICOES_STATUS[de].includes(para);

export const ROTULO_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  EM_NEGOCIACAO: 'Em negociação',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
};
