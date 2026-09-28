import type { CategoriaProduto, Unidade } from './enums.js';

/** Como cada categoria aparece para o usuário (telas, PDF, WhatsApp). */
export const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  PAINEL_SOLAR: 'Painel solar',
  INVERSOR: 'Inversor',
  ESTRUTURA: 'Estrutura',
  CABO: 'Cabo',
  MAO_DE_OBRA: 'Mão de obra',
  OUTROS: 'Outros',
};

/** Unidade abreviada, usada em "por un", "40 m", "1 kit". */
export const ROTULO_UNIDADE: Record<Unidade, string> = {
  UN: 'un',
  KIT: 'kit',
  M: 'm',
  SERVICO: 'serviço',
  KWP: 'kWp',
};
