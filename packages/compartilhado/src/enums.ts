/*
 * Enums do banco para uso fora da API (fronts e cálculo compartilhado), sem depender do
 * @prisma/client. A API confere em tempo de compilação que estes valores batem com o
 * schema do Prisma (apps/api/src/lib/conferencia-enums.ts).
 */

export const PAPEIS = ['ADMIN', 'COMERCIAL', 'GESTOR', 'TECNICO'] as const;
export type Papel = (typeof PAPEIS)[number];

export const TIPOS_PESSOA = ['FISICA', 'JURIDICA'] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

/** Na ordem do catálogo: solar, mobilidade, elétrica, serviços, outros (a mesma do banco). */
export const CATEGORIAS_PRODUTO = [
  'PAINEL_SOLAR',
  'INVERSOR',
  'ESTRUTURA',
  'CARREGADOR',
  'PROTECAO',
  'QUADRO',
  'CABO',
  'CONEXAO',
  'INFRAESTRUTURA',
  'MAO_DE_OBRA',
  'PROJETO',
  'OUTROS',
] as const;
export type CategoriaProduto = (typeof CATEGORIAS_PRODUTO)[number];

export const UNIDADES = ['UN', 'PECA', 'KIT', 'M', 'BARRA', 'ROLO', 'SERVICO', 'KWP'] as const;
export type Unidade = (typeof UNIDADES)[number];

export const STATUS_ORCAMENTO = [
  'RASCUNHO',
  'ENVIADO',
  'EM_NEGOCIACAO',
  'APROVADO',
  'RECUSADO',
] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

export const TIPOS_DESCONTO = ['PERCENTUAL', 'VALOR'] as const;
export type TipoDesconto = (typeof TIPOS_DESCONTO)[number];

export const CONDICOES_PAGAMENTO = ['A_VISTA', 'ENTRADA_PARCELAS', 'FINANCIAMENTO'] as const;
export type CondicaoPagamento = (typeof CONDICOES_PAGAMENTO)[number];

export const STATUS_PROJETO = [
  'AGUARDANDO_AGENDAMENTO',
  'AGENDADO',
  'EM_EXECUCAO',
  'AGUARDANDO_VALIDACAO',
  'CONCLUIDO',
  'CANCELADO',
] as const;
export type StatusProjeto = (typeof STATUS_PROJETO)[number];

export const TIPOS_SERVICO = [
  'INSTALACAO',
  'VISITA_TECNICA',
  'MANUTENCAO',
  'VISTORIA_CONCESSIONARIA',
] as const;
export type TipoServico = (typeof TIPOS_SERVICO)[number];

export const STATUS_AGENDAMENTO = [
  'AGENDADO',
  'EM_EXECUCAO',
  'AGUARDANDO_VALIDACAO',
  'DEVOLVIDO',
  'APROVADO',
  'CANCELADO',
] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

export const REVISOES_FOTO = ['PENDENTE', 'OK', 'REFAZER'] as const;
export type RevisaoFoto = (typeof REVISOES_FOTO)[number];
