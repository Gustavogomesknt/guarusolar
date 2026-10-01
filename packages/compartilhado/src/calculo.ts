/*
 * ATENÇÃO: o front usa esta função APENAS para a prévia em tela, enquanto o vendedor monta o
 * orçamento. O valor válido é sempre o que a API calcula e grava: ela recalcula tudo com esta
 * mesma função ao salvar e nunca aceita total vindo do front (regra 1 do CLAUDE.md).
 */
import type { CondicaoPagamento, TipoDesconto } from './enums.js';
import { taxaDoCartao } from './taxasCartao.js';

export type ItemCalculo = {
  quantidade: number;
  precoUnitario: number;
};

export type EntradaCalculo = {
  itens: ItemCalculo[];
  descontoTipo: TipoDesconto;
  descontoValor: number;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct?: number | null;
  entradaPct?: number | null;
  parcelas?: number | null;
  /** ENTRADA_PARCELAS: saldo no débito (taxa do débito, parcela única) */
  debito?: boolean | null;
  /** ENTRADA_PARCELAS: a Guarusolar absorve a taxa (negociação); o cliente paga o valor da proposta */
  absorverTaxaCartao?: boolean | null;
};

/**
 * Saldo pago no cartão (ENTRADA_PARCELAS). A entrada é Pix ou transferência: sem taxa.
 * Valores em reais, já arredondados a centavos.
 */
export type PagamentoCartao = {
  debito: boolean;
  parcelas: number;
  /** taxa da operadora usada (%), gravada no orçamento */
  taxaPct: number;
  absorvida: boolean;
  /** saldo da proposta que vai para o cartão (valor total − entrada) */
  saldo: number;
  /** o que o cliente paga no cartão: saldo ÷ (1 − taxa), arredondado PARA CIMA; absorvida = saldo */
  valorCobrado: number;
  /** parcelas 2 em diante */
  valorParcela: number;
  /** a primeira leva os centavos que sobram: soma das parcelas = valorCobrado */
  valorPrimeiraParcela: number;
  /** o que a Guarusolar recebe do cartão depois da taxa (arredondado para baixo) */
  valorRecebido: number;
  /** quanto a Guarusolar deixa de receber (só com a taxa absorvida; senão 0) */
  valorAbsorvido: number;
};

export type ResultadoCalculo = {
  subtotal: number;
  descontoAplicado: number;
  valorTotal: number;
  entrada: number;
  valorParcela: number;
  resumoPagamento: string;
  /** o que o cliente paga (com a taxa do cartão repassada); igual a valorTotal sem cartão */
  valorTotalCliente: number;
  cartao: PagamentoCartao | null;
};

const cent = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Cartão com a taxa repassada: cobrado = saldo ÷ (1 − taxa). Contas em centavos inteiros.
 * Cobrado arredondado para cima: depois da taxa, a empresa recebe pelo menos o saldo.
 */
export function calcularCartao(saldo: number, parcelas: number, debito: boolean, absorver: boolean): PagamentoCartao {
  const n = debito ? 1 : parcelas;
  const taxaPct = taxaDoCartao(n, debito);
  const taxa = taxaPct / 100;
  const saldoC = Math.round(saldo * 100);
  // tolerância para o ruído do ponto flutuante não subir um centavo à toa
  const cobradoC = absorver ? saldoC : Math.ceil(saldoC / (1 - taxa) - 1e-6);
  const parcelaC = Math.floor(cobradoC / n);
  const primeiraC = cobradoC - parcelaC * (n - 1);
  const recebidoC = Math.floor(cobradoC * (1 - taxa) + 1e-6);
  return {
    debito,
    parcelas: n,
    taxaPct,
    absorvida: absorver,
    saldo: saldoC / 100,
    valorCobrado: cobradoC / 100,
    valorParcela: parcelaC / 100,
    valorPrimeiraParcela: primeiraC / 100,
    valorRecebido: recebidoC / 100,
    valorAbsorvido: absorver ? (saldoC - recebidoC) / 100 : 0,
  };
}

/**
 * Regra de negócio dos totais do orçamento.
 * Fica isolada aqui para ser usada pela API e testada sem banco.
 *
 * Ordem: subtotal dos itens -> desconto geral (% ou R$) ->
 * desconto adicional à vista (quando a condição for A_VISTA).
 */
export function calcularOrcamento(entrada: EntradaCalculo): ResultadoCalculo {
  const subtotal = cent(
    entrada.itens.reduce(
      (soma, item) => soma + Number(item.quantidade) * Number(item.precoUnitario),
      0,
    ),
  );

  const descontoGeral =
    entrada.descontoTipo === 'PERCENTUAL'
      ? (subtotal * Number(entrada.descontoValor || 0)) / 100
      : Number(entrada.descontoValor || 0);

  const descontoGeralLimitado = cent(Math.min(Math.max(descontoGeral, 0), subtotal));
  const aposDesconto = cent(subtotal - descontoGeralLimitado);

  let descontoAVista = 0;
  if (entrada.condicaoPagamento === 'A_VISTA') {
    descontoAVista = cent((aposDesconto * Number(entrada.descontoAVistaPct || 0)) / 100);
  }

  const valorTotal = cent(aposDesconto - descontoAVista);
  const descontoAplicado = cent(descontoGeralLimitado + descontoAVista);

  let entradaValor = 0;
  let valorParcela = 0;
  let resumoPagamento = '';
  let cartao: PagamentoCartao | null = null;

  switch (entrada.condicaoPagamento) {
    case 'A_VISTA': {
      const pct = Number(entrada.descontoAVistaPct || 0);
      resumoPagamento = `À vista (Pix ou transferência)${pct > 0 ? ` com ${pct}% de desconto` : ''}`;
      break;
    }
    case 'ENTRADA_PARCELAS': {
      // entrada no Pix ou transferência (sem taxa); só o saldo vai para o cartão
      const pct = Number(entrada.entradaPct || 0);
      const n = Math.max(1, Math.trunc(Number(entrada.parcelas || 1)));
      entradaValor = cent((valorTotal * pct) / 100);
      cartao = calcularCartao(cent(valorTotal - entradaValor), n, Boolean(entrada.debito), Boolean(entrada.absorverTaxaCartao));
      valorParcela = cartao.valorParcela;
      const noCartao = cartao.debito
        ? `${entradaValor > 0 ? 'débito' : 'Débito'} de ${brl(cartao.valorCobrado)}`
        : `${cartao.parcelas}x de ${brl(cartao.valorParcela)}` +
          (cartao.valorPrimeiraParcela !== cartao.valorParcela ? ` (1ª de ${brl(cartao.valorPrimeiraParcela)})` : '');
      resumoPagamento = (entradaValor > 0 ? `Entrada de ${brl(entradaValor)} + ` : '') + noCartao;
      break;
    }
    case 'FINANCIAMENTO': {
      resumoPagamento = 'Financiamento solar via banco parceiro';
      break;
    }
  }

  const valorTotalCliente = cartao ? cent(entradaValor + cartao.valorCobrado) : valorTotal;
  return { subtotal, descontoAplicado, valorTotal, entrada: entradaValor, valorParcela, resumoPagamento, valorTotalCliente, cartao };
}

export const formatarBRL = brl;
