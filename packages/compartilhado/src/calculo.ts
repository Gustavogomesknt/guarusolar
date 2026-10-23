/*
 * ATENÇÃO: o front usa esta função APENAS para a prévia em tela, enquanto o vendedor monta o
 * orçamento. O valor válido é sempre o que a API calcula e grava: ela recalcula tudo com esta
 * mesma função ao salvar e nunca aceita total vindo do front (regra 1 do CLAUDE.md).
 */
import type { CondicaoPagamento, TipoDesconto } from './enums.js';
import { REPASSAR_TAXA_DO_CARTAO, taxaDoCartao } from './taxasCartao.js';

export type ItemCalculo = {
  quantidade: number;
  precoUnitario: number;
};

export type EntradaCalculo = {
  itens: ItemCalculo[];
  /** margem de lucro em reais da proposta (margemDoOrcamento.ts); soma aos itens antes dos descontos */
  margem?: number | null;
  descontoTipo: TipoDesconto;
  descontoValor: number;
  /** imposto em %, somado sobre o valor JÁ com todos os descontos (ver a ordem em calcularOrcamento) */
  impostoPct?: number | null;
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
  /** soma dos itens, sem a margem (só para a tela do vendedor) */
  subtotalItens: number;
  margem: number;
  /** itens + margem: o subtotal que o cliente vê e a base dos descontos */
  subtotal: number;
  descontoAplicado: number;
  /** imposto em R$ (base: o valor depois dos descontos) */
  impostoAplicado: number;
  /** com o imposto: é a base do pagamento (entrada, cartão) */
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
export function calcularCartao(saldo: number, parcelas: number, debito: boolean, absorverNoOrcamento: boolean): PagamentoCartao {
  // sem repasse (REPASSAR_TAXA_DO_CARTAO = false, taxasCartao.ts) a taxa é sempre absorvida
  const absorver = absorverNoOrcamento || !REPASSAR_TAXA_DO_CARTAO;
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
 * ORDEM DO CÁLCULO (é a parte que mais confunde; não troque sem combinar com o cliente):
 *   1. subtotal dos itens       soma de quantidade × preço unitário
 *   2. + margem                 em R$; o resultado é o "subtotal" que o cliente vê
 *   3. − desconto geral         % ou R$, sobre o subtotal do passo 2
 *   4. − desconto à vista       só em A_VISTA; %, sobre o valor do passo 3
 *   5. + imposto                %, sobre o valor JÁ com os dois descontos (passo 4)
 *   = valorTotal                a base do pagamento: entrada e cartão (parcelas da maquininha,
 *                               com a taxa repassada) saem daqui, já com o imposto
 * A margem entra ANTES dos descontos (o cliente não a vê: o desconto é sobre o preço que ele vê),
 * e o imposto DEPOIS (é cobrado sobre o que o cliente de fato paga, não sobre o preço cheio).
 */
export function calcularOrcamento(entrada: EntradaCalculo): ResultadoCalculo {
  const subtotalItens = cent(
    entrada.itens.reduce(
      (soma, item) => soma + Number(item.quantidade) * Number(item.precoUnitario),
      0,
    ),
  );
  const margem = cent(Math.max(Number(entrada.margem || 0), 0));
  const subtotal = cent(subtotalItens + margem);

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

  const aposDescontos = cent(aposDesconto - descontoAVista);
  const descontoAplicado = cent(descontoGeralLimitado + descontoAVista);

  // 5. imposto sobre o valor já com os descontos
  const impostoAplicado = cent((aposDescontos * Math.max(Number(entrada.impostoPct || 0), 0)) / 100);
  const valorTotal = cent(aposDescontos + impostoAplicado);

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
  return { subtotalItens, margem, subtotal, descontoAplicado, impostoAplicado, valorTotal, entrada: entradaValor, valorParcela, resumoPagamento, valorTotalCliente, cartao };
}

export const formatarBRL = brl;
