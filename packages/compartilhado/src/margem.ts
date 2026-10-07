/**
 * Margem bruta de um item do catálogo: quanto do preço de venda sobra depois do custo.
 * A API devolve estes valores na listagem, e o painel de edição recalcula enquanto se digita.
 * Venda abaixo do custo dá margem negativa (permitido: pode ser promoção).
 *
 * Custo EM BRANCO (null) é diferente de custo zero: sem custo cadastrado não há margem para
 * mostrar (os dois valores voltam null e a tela mostra "—"); custo R$ 0,00 dá 100% de verdade.
 * O catálogo importado da planilha da Guarusolar só tem preço de venda: o custo fica em branco.
 */
export function calcularMargem(
  precoCusto: number | null | undefined,
  precoVenda: number,
): { margemPercentual: number | null; lucroBruto: number | null } {
  if (precoCusto === null || precoCusto === undefined) return { margemPercentual: null, lucroBruto: null };
  const custo = Number(precoCusto) || 0;
  const venda = Number(precoVenda) || 0;
  return {
    /** em %, com uma casa decimal; 0 quando não há preço de venda */
    margemPercentual: venda ? Math.round(((venda - custo) / venda) * 1000) / 10 : 0,
    /** em R$, por unidade */
    lucroBruto: Math.round((venda - custo) * 100) / 100,
  };
}
