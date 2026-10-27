/*
 * AS TRÊS CONDIÇÕES DA PROPOSTA — padrões editáveis aqui.
 *
 * A proposta (modelo novo, página 3) mostra juntas: o valor do investimento, o valor à vista via
 * Pix e o parcelamento no cartão. O orçamento GRAVA as três ao salvar (a API, com
 * calcularCondicoesDaProposta, pelas mesmas regras de calcularOrcamento); o PDF só imprime.
 *
 * As entradas são do vendedor: o % de desconto à vista e o número de parcelas, que o gerador
 * mostra e deixa ajustar junto das três condições (o cartão da condição "Cartão" sai como ele
 * montou: parcelas ou débito).
 *
 * Os padrões abaixo são VALOR SUGERIDO (27/10/2026): o valor inicial do campo num orçamento
 * novo, que o vendedor vê e muda. Padrão em branco = o campo começa VAZIO e o vendedor preenche;
 * nenhum número é inventado. Sem o número, a condição fica sem valor, e a proposta (modelo novo)
 * NÃO é gerada nem enviada: o gerador e a API dizem o que falta (faltaNasCondicoes).
 * Depois de editar: `npm run build` (confere) e publicar. Orçamento já salvo só muda ao ser salvo
 * de novo (a condição fica gravada, como a taxa do cartão).
 */
import { calcularOrcamento, type EntradaCalculo, type PagamentoCartao } from './calculo.js';
import { MAXIMO_PARCELAS } from './taxasCartao.js';

export const CONDICOES_PADRAO_DA_PROPOSTA: {
  /**
   * % de desconto à vista via Pix sugerido. EM BRANCO DE PROPÓSITO (regra, não pendência,
   * 27/10/2026): a Guarusolar não tem percentual padrão, varia a cada venda; o vendedor informa.
   */
  descontoAVistaPct: number | null;
  /** parcelas no cartão sugeridas (opcional: em branco, o vendedor escolhe em cada orçamento) */
  parcelas: number | null;
} = {
  descontoAVistaPct: null,
  parcelas: null,
};

/**
 * O que falta para a proposta (modelo novo) ter as TRÊS condições, nas palavras do vendedor.
 * Recebe o que está calculado ou gravado: o à vista e o cartão (o investimento sai sempre).
 * Vazio = pode gerar e enviar.
 */
export function faltaNasCondicoes(c: { aVista: unknown; cartao: unknown }): string[] {
  return [...(c.aVista == null ? ['o desconto à vista (%)'] : []), ...(c.cartao == null ? ['o número de parcelas no cartão'] : [])];
}

/** Mesma mensagem na tela e na API (como AVISO_SEM_PRAZO). */
export function avisoSemCondicoes(faltam: string[]): string {
  return `Preencha ${faltam.join(' e ')} da proposta e salve: sem ${faltam.length > 1 ? 'eles' : 'ele'}, a proposta não é gerada nem enviada ao cliente.`;
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

  // o cartão do vendedor, como ele montou (parcelas ou débito); senão o padrão
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
            parcelas: Math.min(Math.max(1, Math.trunc(parcelas)), MAXIMO_PARCELAS),
            debito: false,
            absorverTaxaCartao: false,
          },
    );
    if (r.cartao) cartao = { entrada: r.entrada, total: r.valorTotalCliente, detalhe: r.cartao };
  }
  return { investimento, aVista, cartao };
}

/**
 * Guarda das parcelas: com a parcela arredondada para cima (calcularCartao), um valor muito baixo
 * para o número de parcelas (uns R$ 3 em 12x) deixaria a ÚLTIMA zerada ou negativa. Confere o
 * cartão da condição escolhida e o das três condições; a API recusa o orçamento com esta
 * mensagem e o gerador a mostra no campo de parcelas. null = tudo certo.
 */
export function problemaNasParcelas(
  entrada: EntradaCalculo,
  padroes: typeof CONDICOES_PADRAO_DA_PROPOSTA = CONDICOES_PADRAO_DA_PROPOSTA,
): string | null {
  const cartoes = [calcularOrcamento(entrada).cartao, calcularCondicoesDaProposta(entrada, padroes).cartao?.detalhe ?? null];
  const ruim = cartoes.find((c) => c && !c.debito && c.parcelas > 1 && c.valorCobrado > 0 && c.valorUltimaParcela <= 0);
  return ruim ? `Valor baixo demais para ${ruim.parcelas}x no cartão: use menos parcelas.` : null;
}
