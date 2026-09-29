import type { CategoriaProduto, StatusAgendamento, TipoServico, Unidade } from './enums.js';

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

/** Tipo de serviço como aparece na agenda do escritório e no app do técnico. */
export const ROTULO_TIPO_SERVICO: Record<TipoServico, string> = {
  INSTALACAO: 'Instalação',
  VISITA_TECNICA: 'Visita técnica',
  MANUTENCAO: 'Manutenção',
  VISTORIA_CONCESSIONARIA: 'Vistoria da concessionária',
};

/** Situação do serviço agendado, na linguagem de quem está em campo. */
export const ROTULO_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  AGENDADO: 'Agendado',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_VALIDACAO: 'Em validação',
  DEVOLVIDO: 'Refazer fotos',
  APROVADO: 'Concluído',
  CANCELADO: 'Cancelado',
};
