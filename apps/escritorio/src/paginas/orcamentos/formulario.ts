import type {
  CategoriaProduto,
  CondicaoPagamento,
  EntradaCalculo,
  TipoDesconto,
  Unidade,
} from '@guarusolar/compartilhado';
import type { Cliente, Produto } from '@/lib/tipos';
import { formatarDecimal, lerNumero } from '@/lib/formatar';

/*
 * Estado do gerador de orçamentos. Valores digitados ficam como texto (como o usuário
 * escreveu, ex.: "1.234,50") e viram número só no cálculo e no envio para a API.
 */

export type ItemFormulario = {
  produtoId: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: Unidade;
  /** Preço do catálogo no momento em que o item entrou no orçamento. */
  precoTabela: number;
  quantidade: string;
  precoUnitario: string;
};

export type FormularioOrcamento = {
  cliente: Cliente | null;
  itens: ItemFormulario[];
  // Condições: editáveis na parte 2; por enquanto entram no cálculo com os valores padrão.
  descontoTipo: TipoDesconto;
  descontoValor: string;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string;
  entradaPct: string;
  parcelas: string;
};

export const VALORES_INICIAIS: FormularioOrcamento = {
  cliente: null,
  itens: [],
  descontoTipo: 'PERCENTUAL',
  descontoValor: '0',
  condicaoPagamento: 'A_VISTA',
  descontoAVistaPct: '0',
  entradaPct: '0',
  parcelas: '1',
};

export function itemDoProduto(produto: Produto): ItemFormulario {
  const precoTabela = Number(produto.precoVenda);
  return {
    produtoId: produto.id,
    nome: produto.nome,
    categoria: produto.categoria,
    unidade: produto.unidade,
    precoTabela,
    quantidade: '1',
    precoUnitario: formatarDecimal(precoTabela),
  };
}

/** Número digitado, ou 0 quando o campo está vazio ou inválido (a prévia nunca quebra). */
export const numeroOuZero = (valor: string) => {
  const n = lerNumero(valor);
  return Number.isFinite(n) ? n : 0;
};

/** O preço digitado difere do preço de tabela (tolerância de meio centavo). */
export const precoFoiAjustado = (item: Pick<ItemFormulario, 'precoTabela' | 'precoUnitario'>) =>
  Math.abs(numeroOuZero(item.precoUnitario) - item.precoTabela) >= 0.005;

/** Entrada do calcularOrcamento a partir do formulário (prévia em tela). */
export function entradaDoCalculo(f: FormularioOrcamento): EntradaCalculo {
  return {
    itens: f.itens.map((item) => ({
      quantidade: numeroOuZero(item.quantidade),
      precoUnitario: numeroOuZero(item.precoUnitario),
    })),
    descontoTipo: f.descontoTipo,
    descontoValor: numeroOuZero(f.descontoValor),
    condicaoPagamento: f.condicaoPagamento,
    descontoAVistaPct: numeroOuZero(f.descontoAVistaPct),
    entradaPct: numeroOuZero(f.entradaPct),
    parcelas: Math.max(1, Math.trunc(numeroOuZero(f.parcelas))),
  };
}
