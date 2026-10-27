/*
 * TAXAS DO CARTÃO (Mercado Pago) — edite aqui quando forem renegociadas.
 *
 * É o desconto que a operadora faz no recebimento (MDR), em %. A taxa é REPASSADA ao cliente
 * (REPASSAR_TAXA_DO_CARTAO, abaixo): parcelando, ele paga mais que à vista, com a taxa da linha
 * do número de parcelas. O vendedor pode absorvê-la numa proposta ("Absorver a taxa nesta
 * proposta"); aí a tabela grava quanto a empresa deixa de receber (valorTaxaAbsorvida).
 * Pix e transferência: sem taxa (o pagamento à vista).
 *
 * Orçamento salvo GRAVA a taxa que usou: renegociar a tabela não muda proposta já enviada.
 * A tabela nova vale para orçamentos novos e para os que forem editados e salvos de novo.
 * Depois de editar: `npm run build` (confere) e publicar.
 */
export const TAXAS_CARTAO = {
  atualizadoEm: 'outubro/2026',
  debito: 0.99,
  /** parcelas no crédito -> taxa (%); 1 = crédito à vista */
  credito: {
    1: 3.05,
    2: 4.35,
    3: 5.15,
    4: 5.95,
    5: 6.75,
    6: 7.55,
    7: 8.19,
    8: 8.99,
    9: 9.79,
    10: 10.59,
    11: 11.39,
    12: 12.19,
    13: 12.64,
    14: 13.39,
    15: 14.14,
    16: 14.89,
    17: 15.64,
    18: 16.39,
  } as Record<number, number>,
};

/**
 * REPASSE DA TAXA AO CLIENTE: true = o cliente paga  valor ÷ (1 − taxa)  no cartão.
 * false = o cliente paga o valor da proposta e a Guarusolar absorve a taxa em TODO orçamento.
 * DEFINIDO (27/10/2026): true, com o interruptor por orçamento para absorver caso a caso. (Em
 * 25/10/2026 tinha virado false por uma proposta do cliente com as parcelas somando o valor
 * cheio; foi engano deles, não a regra.) A conta está em calcularCartao (calculo.ts).
 */
export const REPASSAR_TAXA_DO_CARTAO = true;

/** Maior número de parcelas da tabela (18). */
export const MAXIMO_PARCELAS = Math.max(...Object.keys(TAXAS_CARTAO.credito).map(Number));

/** Taxa (%) do débito ou do crédito em `parcelas` vezes. */
export function taxaDoCartao(parcelas: number, debito = false): number {
  if (debito) return TAXAS_CARTAO.debito;
  const taxa = TAXAS_CARTAO.credito[parcelas];
  if (taxa === undefined) throw new Error(`Sem taxa de cartão para ${parcelas}x (máximo ${MAXIMO_PARCELAS}x).`);
  return taxa;
}
