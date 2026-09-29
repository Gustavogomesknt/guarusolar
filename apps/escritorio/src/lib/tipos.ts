import type {
  CategoriaProduto,
  CondicaoPagamento,
  StatusAgendamento,
  StatusOrcamento,
  TipoServico,
  TipoDesconto,
  TipoPessoa,
  Unidade,
} from '@guarusolar/compartilhado';

/*
 * Formato das respostas da API usadas no escritório.
 * Campos Decimal do Prisma chegam como texto no JSON ("789.9"): converta com Number().
 */

export type Cliente = {
  id: string;
  tipoPessoa: TipoPessoa;
  nome: string;
  documento: string;
  whatsapp: string;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  observacoes?: string | null;
};

/** Serviço na agenda (GET /api/agenda). Datas chegam como "2026-09-29T00:00:00.000Z". */
export type AgendamentoNaAgenda = {
  id: string;
  projetoId: string;
  equipeId: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  projeto: {
    codigo: string;
    cliente: { nome: string; cidade: string | null; uf: string | null };
    orcamento: { id: string; codigo: string };
  };
  tecnicoResponsavel: { id: string; nome: string } | null;
};

/** Uma linha da grade: equipe com membros e serviços da semana. */
export type EquipeNaAgenda = {
  id: string;
  nome: string;
  membros: { id: string; nome: string; papel: string }[];
  agendamentos: AgendamentoNaAgenda[];
};

/** Projeto aprovado sem data (GET /api/agenda/pendentes). */
export type ProjetoPendente = {
  id: string;
  codigo: string;
  cliente: { nome: string; cidade: string | null; uf: string | null };
  orcamento: { codigo: string; valorTotal: string };
};

/** Cliente na tela de clientes (GET /api/clientes com a contagem de orçamentos). */
export type ClienteNaLista = Cliente & { quantidadeOrcamentos: number };

/** Ficha do cliente (GET /api/clientes/:id). */
export type FichaDoCliente = Cliente & {
  orcamentos: { id: string; codigo: string; status: StatusOrcamento; criadoEm: string; validade: string; valorTotal: string }[];
};

/** Linha da lista (GET /api/orcamentos). */
export type OrcamentoNaLista = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  criadoEm: string;
  validade: string;
  valorTotal: string;
  enviadoEm: string | null;
  aprovadoEm: string | null;
  recusadoEm: string | null;
  cliente: { id: string; nome: string; cidade: string | null; uf: string | null; whatsapp: string };
};

/**
 * Indicadores (GET /api/orcamentos/resumo). O critério de data de cada um está documentado
 * na rota: total e quantidade por criação, valor aprovado por aprovação no mês, taxa sobre a
 * turma criada no mês, em aberto sem filtro de data.
 */
export type ResumoOrcamentos = {
  totalOrcadoMes: number;
  quantidadeMes: number;
  taxaAprovacao: number;
  aprovadosMes: number;
  enviadosMes: number;
  quantidadeEmAberto: number;
  valorEmAberto: number;
  valorAprovadoMes: number;
};

/** Orçamento completo (GET /api/orcamentos/:id), usado para abrir no gerador. */
export type OrcamentoCompleto = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  cliente: Cliente;
  validade: string;
  descontoTipo: TipoDesconto;
  descontoValor: string;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string | null;
  entradaPct: string | null;
  parcelas: number | null;
  observacoes: string | null;
  subtotal: string;
  descontoAplicado: string;
  valorTotal: string;
  /** gravado ao salvar; null só em orçamentos anteriores a essa gravação */
  resumoPagamento: string | null;
  tokenPdf: string;
  itens: {
    produtoId: string;
    descricao: string;
    unidade: Unidade;
    quantidade: string;
    precoUnitario: string;
    precoTabela: string;
    produto: { categoria: CategoriaProduto };
  }[];
};

/** Item do catálogo (GET /api/produtos). Preços chegam como texto (Decimal). */
export type Produto = {
  id: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: Unidade;
  precoCusto: string;
  precoVenda: string;
  descricaoTecnica: string | null;
  ativo: boolean;
  /** calculados pela API com calcularMargem */
  margemPercentual: number;
  lucroBruto: number;
  /** linhas de orçamento que usam o item */
  usadoEmOrcamentos: number;
};
