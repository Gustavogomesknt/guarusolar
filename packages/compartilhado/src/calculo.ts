/*
 * ATENÇÃO: o front usa esta função APENAS para a prévia em tela, enquanto o vendedor monta o
 * orçamento. O valor válido é sempre o que a API calcula e grava: ela recalcula tudo com esta
 * mesma função ao salvar e nunca aceita total vindo do front (regra 1 do CLAUDE.md).
 */
import type { CondicaoPagamento, TipoDesconto } from './enums.js';

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
};

export type ResultadoCalculo = {
  subtotal: number;
  descontoAplicado: number;
  valorTotal: number;
  entrada: number;
  valorParcela: number;
  resumoPagamento: string;
};

const cent = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

  switch (entrada.condicaoPagamento) {
    case 'A_VISTA': {
      const pct = Number(entrada.descontoAVistaPct || 0);
      resumoPagamento = `À vista (Pix ou transferência)${pct > 0 ? ` com ${pct}% de desconto` : ''}`;
      break;
    }
    case 'ENTRADA_PARCELAS': {
      const pct = Number(entrada.entradaPct || 0);
      const n = Math.max(1, Number(entrada.parcelas || 1));
      entradaValor = cent((valorTotal * pct) / 100);
      valorParcela = cent((valorTotal - entradaValor) / n);
      resumoPagamento =
        (entradaValor > 0 ? `Entrada de ${brl(entradaValor)} + ` : '') +
        `${n}x de ${brl(valorParcela)}`;
      break;
    }
    case 'FINANCIAMENTO': {
      resumoPagamento = 'Financiamento solar via banco parceiro';
      break;
    }
  }

  return { subtotal, descontoAplicado, valorTotal, entrada: entradaValor, valorParcela, resumoPagamento };
}

export const formatarBRL = brl;
