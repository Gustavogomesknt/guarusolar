import type { CategoriaProduto, GrupoNaProposta, StatusAgendamento, StatusProjeto, TipoServico, Unidade } from './enums.js';

/** Como cada categoria aparece para o usuário (telas, PDF, WhatsApp). */
export const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  PAINEL_SOLAR: 'Painel solar',
  INVERSOR: 'Inversor',
  ESTRUTURA: 'Estrutura',
  CARREGADOR: 'Carregador veicular',
  PROTECAO: 'Proteção e aterramento',
  QUADRO: 'Quadros e caixas',
  CABO: 'Cabos e fios',
  CONEXAO: 'Conectores e terminais',
  INFRAESTRUTURA: 'Eletrodutos e fixação',
  MAO_DE_OBRA: 'Mão de obra',
  PROJETO: 'Projeto e documentação',
  OUTROS: 'Outros',
};

/** Grupo do item: rótulo curto (catálogo) e título da seção na proposta em PDF. */
export const ROTULO_GRUPO_NA_PROPOSTA: Record<GrupoNaProposta, string> = {
  MATERIAL: 'Material',
  DOCUMENTACAO: 'Documentação',
};
export const TITULO_GRUPO_NA_PROPOSTA: Record<GrupoNaProposta, string> = {
  MATERIAL: 'Materiais e equipamentos',
  DOCUMENTACAO: 'Documentação e engenharia',
};

/** Unidade abreviada, usada em "por un", "40 m", "1 kit". */
export const ROTULO_UNIDADE: Record<Unidade, string> = {
  UN: 'un',
  PECA: 'pç',
  KIT: 'kit',
  M: 'm',
  BARRA: 'barra',
  ROLO: 'rolo',
  SERVICO: 'serviço',
  KWP: 'kWp',
};

/** ETAPA do serviço agendado (na tela: "Etapa"), na agenda do escritório e no app do técnico. Não é o tipo de serviço vendido do orçamento (tabela TipoDeServico). */
export const ROTULO_TIPO_SERVICO: Record<TipoServico, string> = {
  INSTALACAO: 'Instalação',
  VISITA_TECNICA: 'Visita técnica',
  MANUTENCAO: 'Manutenção',
  VISTORIA_CONCESSIONARIA: 'Vistoria da concessionária',
  RETRABALHO: 'Retrabalho',
};

/** Situação da obra (projeto), como aparece na lista e na ficha. */
export const ROTULO_STATUS_PROJETO: Record<StatusProjeto, string> = {
  AGUARDANDO_AGENDAMENTO: 'A agendar',
  AGENDADO: 'Agendado',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_VALIDACAO: 'Em validação',
  AGUARDANDO_CONCLUSAO: 'Aguardando conclusão',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

/**
 * Situação do serviço agendado, na linguagem de quem está em campo. APROVADO = "Validado": o
 * gestor validou as fotos DESTE serviço; quem diz que a obra terminou é o gestor, no projeto.
 */
export const ROTULO_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  AGENDADO: 'Agendado',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_VALIDACAO: 'Em validação',
  DEVOLVIDO: 'Refazer fotos',
  APROVADO: 'Validado',
  CANCELADO: 'Cancelado',
};
