/*
 * AS TRÊS CONDIÇÕES DA PROPOSTA — padrões editáveis aqui.
 *
 * A proposta (modelo novo, página 3) mostra juntas: o valor do investimento, o valor à vista via
 * Pix e o parcelamento no cartão. O orçamento GRAVA as três ao salvar (a API, com
 * calcularCondicoesDaProposta, pelas mesmas regras de calcularOrcamento); o PDF só imprime.
 *
 * As entradas são do vendedor: o % de desconto à vista e o número de parcelas, que o gerador
 * mostra e deixa ajustar junto das três condições (o cartão da condição "Entrada + cartão" sai
 * como ele montou: entrada, débito, taxa absorvida). Campo em branco usa o padrão abaixo, que
 * também é o valor inicial dos dois campos num orçamento novo.
 *
 * PENDENTE (23/10/2026): os valores dependem de confirmação com a Guarusolar. Com algum padrão
 * em branco o MODELO NOVO NÃO LIGA (a API continua no atual e diz qual falta: faltaNosPadroes).
 * Depois de editar: `npm run build` (confere) e publicar. Orçamento já salvo só muda ao ser salvo
 * de novo (a condição fica gravada, como a taxa do cartão).
 */
import { calcularOrcamento, type EntradaCalculo, type PagamentoCartao } from './calculo.js';
import { MAXIMO_PARCELAS } from './taxasCartao.js';

export const CONDICOES_PADRAO_DA_PROPOSTA: {
  /** % de desconto à vista via Pix quando o vendedor escolheu outra condição */
  descontoAVistaPct: number | null;
  /** parcelas no cartão (sem entrada) quando o vendedor escolheu outra condição */
  parcelas: number | null;
} = {
  descontoAVistaPct: null,
  parcelas: null,
};

/** O que falta nos padrões para o modelo novo poder ser ligado (vazio = pode). */
export function faltaNosPadroes(padroes: typeof CONDICOES_PADRAO_DA_PROPOSTA = CONDICOES_PADRAO_DA_PROPOSTA): string[] {
  return [
    ...(padroes.descontoAVistaPct == null ? ['desconto à vista (descontoAVistaPct)'] : []),
    ...(padroes.parcelas == null ? ['número de parcelas (parcelas)'] : []),
  ];
}

export type CondicoesDaProposta = {
  /** preço depois do desconto geral e com o imposto, sem desconto à vista nem taxa do cartão */
  investimento: number;
  aVista: { descontoPct: number; valor: number } | null;
  cartao: { entrada: number; total: number; detalhe: PagamentoCartao } | null;
};

export function calcularCondicoesDaProposta(
  entrada: EntradaCalculo,
  padroes: typeof CONDICOES_PADRAO_DA_PROPOSTA = CONDICOES_PADRAO_DA_PROPOSTA,
): CondicoesDaProposta {
  // "investimento": a mesma conta sem a condição de pagamento (nem desconto à vista nem cartão)
  const investimento = calcularOrcamento({ ...entrada, condicaoPagamento: 'FINANCIAMENTO' }).valorTotal;

  // o que o vendedor informou vale em qualquer condição; em branco, o padrão
  const pctAVista =
    entrada.condicaoPagamento === 'A_VISTA' ? Number(entrada.descontoAVistaPct || 0) : (entrada.descontoAVistaPct ?? padroes.descontoAVistaPct);
  const aVista =
    pctAVista === null
      ? null
      : { descontoPct: pctAVista, valor: calcularOrcamento({ ...entrada, condicaoPagamento: 'A_VISTA', descontoAVistaPct: pctAVista }).valorTotal };

  // o cartão do vendedor, como ele montou (entrada, débito, taxa absorvida); senão o padrão, sem entrada
  const doVendedor = entrada.condicaoPagamento === 'ENTRADA_PARCELAS';
  const parcelas = doVendedor ? (entrada.parcelas ?? 1) : (entrada.parcelas ?? padroes.parcelas);
  let cartao: CondicoesDaProposta['cartao'] = null;
  if (parcelas != null) {
    const r = calcularOrcamento(
      doVendedor
        ? entrada
        : {
            ...entrada,
            condicaoPagamento: 'ENTRADA_PARCELAS',
            entradaPct: 0,
            parcelas: Math.min(Math.max(1, Math.trunc(parcelas)), MAXIMO_PARCELAS),
            debito: false,
            absorverTaxaCartao: false,
          },
    );
    if (r.cartao) cartao = { entrada: r.entrada, total: r.valorTotalCliente, detalhe: r.cartao };
  }
  return { investimento, aVista, cartao };
}
