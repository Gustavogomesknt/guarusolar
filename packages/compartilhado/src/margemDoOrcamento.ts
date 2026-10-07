/*
 * MARGEM DO ORÇAMENTO — edite aqui quando o valor padrão mudar.
 *
 * A Guarusolar aplica uma margem de lucro em REAIS por proposta (não um percentual sobre os
 * itens). O valor abaixo já vem preenchido em todo orçamento NOVO; o vendedor pode mudar em cada
 * orçamento (por exemplo, para cobrir a concorrência).
 *
 * Como entra na conta (calcularOrcamento): itens + margem = subtotal -> desconto geral ->
 * desconto à vista -> total. Ou seja, o desconto percentual incide também sobre a margem: o
 * cliente não vê a margem, e "10% de desconto" tem de ser 10% do preço que ele vê.
 *
 * O cliente NUNCA vê a margem como linha: ela está embutida no total do PDF e do WhatsApp. Com
 * "detalhar preços" ligado, o PDF distribui a margem nos preços dos itens (distribuirMargem).
 *
 * Orçamento salvo GRAVA a margem que usou: mudar o padrão não altera proposta existente.
 * Orçamentos anteriores a este campo têm margem zero.
 * Depois de editar: `npm run build` (confere) e publicar.
 */
export const MARGEM_PADRAO = 1200;

/**
 * Subtotais dos itens com a margem distribuída na proporção de cada um, para o PDF detalhado.
 * Contas em centavos inteiros: a soma do resultado é EXATAMENTE soma dos itens + margem (os
 * centavos que sobram do arredondamento vão para o item de maior valor).
 */
export function distribuirMargem(subtotaisDosItens: number[], margem: number): number[] {
  const itens = subtotaisDosItens.map((v) => Math.round(Number(v) * 100));
  const margemC = Math.round(Number(margem || 0) * 100);
  const somaC = itens.reduce((s, v) => s + v, 0);
  if (margemC <= 0 || itens.length === 0) return itens.map((v) => v / 100);
  // itens todos a zero: não há proporção; divide em partes iguais
  const partes = itens.map((v) => Math.floor(somaC > 0 ? (margemC * v) / somaC : margemC / itens.length));
  const sobra = margemC - partes.reduce((s, v) => s + v, 0);
  const maior = itens.indexOf(Math.max(...itens));
  partes[maior] += sobra;
  return itens.map((v, i) => (v + partes[i]) / 100);
}
