/**
 * Margem bruta de um item do catálogo: quanto do preço de venda sobra depois do custo.
 * A API devolve estes valores na listagem, e o painel de edição recalcula enquanto se digita.
 * Venda abaixo do custo dá margem negativa (permitido: pode ser promoção).
 */
export function calcularMargem(precoCusto: number, precoVenda: number) {
  const custo = Number(precoCusto) || 0;
  const venda = Number(precoVenda) || 0;
  return {
    /** em %, com uma casa decimal; 0 quando não há preço de venda */
    margemPercentual: venda ? Math.round(((venda - custo) / venda) * 1000) / 10 : 0,
    /** em R$, por unidade */
    lucroBruto: Math.round((venda - custo) * 100) / 100,
  };
}
