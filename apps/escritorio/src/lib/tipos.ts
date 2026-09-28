import type {
  CategoriaProduto,
  CondicaoPagamento,
  StatusOrcamento,
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
};

/** Linha da lista (GET /api/orcamentos). */
export type OrcamentoNaLista = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  criadoEm: string;
  validade: string;
  valorTotal: string;
  cliente: { id: string; nome: string; cidade: string | null; uf: string | null; whatsapp: string };
};

/** Indicadores do mês (GET /api/orcamentos/resumo). */
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

export type Produto = {
  id: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: Unidade;
  precoVenda: string;
  ativo: boolean;
};
