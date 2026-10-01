import { MAXIMO_PARCELAS, partesNoFuso, TAXAS_CARTAO } from '@guarusolar/compartilhado';
import type {
  CategoriaProduto,
  CondicaoPagamento,
  EntradaCalculo,
  PagamentoCartao,
  StatusOrcamento,
  TipoDesconto,
  Unidade,
} from '@guarusolar/compartilhado';
import type { Cliente, OrcamentoCompleto, Produto } from '@/lib/tipos';
import { formatarBRL, formatarDecimal, formatarQuantidade, lerNumero } from '@/lib/formatar';

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
  descontoTipo: TipoDesconto;
  descontoValor: string;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string;
  entradaPct: string;
  /** 'D' = débito; '1' a '18' = crédito em N vezes */
  parcelas: string;
  /** a Guarusolar absorve a taxa do cartão (negociação) */
  absorverTaxaCartao: boolean;
  /** AAAA-MM-DD, como o <input type="date"> usa */
  validade: string;
  observacoes: string;
  /** título do serviço no PDF ("Instalação de carregador veicular · Residencial") */
  descricaoServico: string;
  /** PDF com preço unitário e subtotal de cada item (padrão: só item e quantidade) */
  detalharPrecosNoPdf: boolean;
};

/** Modo leitura (fieldset desabilitado): esconde a busca do catálogo e esmaece botões e campos. */
export const ESTILO_SOMENTE_LEITURA =
  '[&:disabled_.busca-catalogo]:hidden [&:disabled_button]:cursor-not-allowed [&:disabled_button]:opacity-40 [&:disabled_input]:opacity-60 [&:disabled_select]:opacity-60';

export const OPCOES_ENTRADA =['0', '10', '20', '30', '40', '50'];
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const DEBITO = 'D';
/** Débito e 1x a 18x no crédito, com a taxa da tabela (compartilhado/taxasCartao.ts). */
export const OPCOES_PARCELAS = [
  { valor: DEBITO, rotulo: `Débito · ${pct(TAXAS_CARTAO.debito)}` },
  ...Array.from({ length: MAXIMO_PARCELAS }, (_, i) => i + 1).map((n) => ({
    valor: String(n),
    rotulo: `${n}x${n === 1 ? ' crédito' : ''} · ${pct(TAXAS_CARTAO.credito[n])}`,
  })),
];
const parcelaValida = (v: string) => OPCOES_PARCELAS.some((o) => o.valor === v);
export const DIAS_DE_VALIDADE = 30;

/** Data AAAA-MM-DD `dias` à frente de hoje, contando "hoje" no fuso da empresa. */
export function dataDaquiA(dias: number) {
  const { ano, mes, dia } = partesNoFuso();
  const d = new Date(Date.UTC(ano, mes, dia + dias));
  return d.toISOString().slice(0, 10);
}

export function valoresIniciais(): FormularioOrcamento {
  return {
    cliente: null,
    itens: [],
    descontoTipo: 'PERCENTUAL',
    descontoValor: '0',
    condicaoPagamento: 'A_VISTA',
    descontoAVistaPct: '0',
    entradaPct: '30',
    parcelas: '6',
    absorverTaxaCartao: false,
    validade: dataDaquiA(DIAS_DE_VALIDADE),
    observacoes: '',
    descricaoServico: '',
    detalharPrecosNoPdf: false,
  };
}

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
    parcelas: f.parcelas === DEBITO ? 1 : Math.max(1, Math.trunc(numeroOuZero(f.parcelas))),
    debito: f.parcelas === DEBITO,
    absorverTaxaCartao: f.absorverTaxaCartao,
  };
}

/**
 * Problema no desconto geral, mostrado enquanto se digita. O cálculo já limita o desconto
 * ao subtotal; a mensagem avisa o vendedor para o valor digitado não enganar.
 */
export function problemaNoDesconto(f: Pick<FormularioOrcamento, 'descontoTipo' | 'descontoValor'>, subtotal: number) {
  const valor = lerNumero(f.descontoValor);
  if (f.descontoValor.trim() === '') return null;
  if (!(valor >= 0)) return 'Informe um valor válido';
  if (f.descontoTipo === 'PERCENTUAL' && valor > 100) return 'O desconto não pode passar de 100%';
  if (f.descontoTipo === 'VALOR' && valor > subtotal) {
    return `O desconto não pode passar do subtotal (${formatarBRL(subtotal)})`;
  }
  return null;
}

export type ProblemaFormulario = { campo: string; mensagem: string };

/** Confere o que a API exigiria, para mostrar tudo de uma vez antes de enviar. */
export function validarParaSalvar(f: FormularioOrcamento, subtotal: number): ProblemaFormulario[] {
  const problemas: ProblemaFormulario[] = [];
  if (!f.cliente) problemas.push({ campo: 'root.cliente', mensagem: 'Escolha o cliente do orçamento' });
  if (f.itens.length === 0) {
    problemas.push({ campo: 'root.itens', mensagem: 'Inclua ao menos um item do catálogo' });
  }
  f.itens.forEach((item, i) => {
    if (!(lerNumero(item.quantidade) > 0)) {
      problemas.push({ campo: `itens.${i}.quantidade`, mensagem: 'A quantidade deve ser maior que zero' });
    }
    if (!(lerNumero(item.precoUnitario) >= 0)) {
      problemas.push({ campo: `itens.${i}.precoUnitario`, mensagem: 'Informe um preço válido' });
    }
  });
  const desconto = problemaNoDesconto(f, subtotal);
  if (desconto) problemas.push({ campo: 'descontoValor', mensagem: desconto });
  if (f.condicaoPagamento === 'A_VISTA') {
    const pct = lerNumero(f.descontoAVistaPct || '0');
    if (!(pct >= 0 && pct <= 100)) {
      problemas.push({ campo: 'descontoAVistaPct', mensagem: 'Use um percentual entre 0 e 100' });
    }
  }
  if (!f.validade) {
    problemas.push({ campo: 'validade', mensagem: 'Informe até quando o orçamento vale' });
  } else if (f.validade < dataDaquiA(0)) {
    problemas.push({ campo: 'validade', mensagem: 'A validade não pode estar no passado' });
  }
  return problemas;
}

/** Corpo do POST/PUT /api/orcamentos. Só manda os campos da condição escolhida. */
export function paraApi(f: FormularioOrcamento) {
  return {
    clienteId: f.cliente!.id,
    // meio-dia UTC: a data continua a mesma em qualquer fuso do Brasil
    validade: `${f.validade}T12:00:00Z`,
    descontoTipo: f.descontoTipo,
    descontoValor: numeroOuZero(f.descontoValor),
    condicaoPagamento: f.condicaoPagamento,
    ...(f.condicaoPagamento === 'A_VISTA' ? { descontoAVistaPct: numeroOuZero(f.descontoAVistaPct) } : {}),
    ...(f.condicaoPagamento === 'ENTRADA_PARCELAS'
      ? {
          entradaPct: numeroOuZero(f.entradaPct),
          parcelas: f.parcelas === DEBITO ? 1 : Math.trunc(numeroOuZero(f.parcelas)),
          pagamentoDebito: f.parcelas === DEBITO,
          absorverTaxaCartao: f.absorverTaxaCartao,
        }
      : {}),
    observacoes: f.observacoes.trim() || undefined,
    descricaoServico: f.descricaoServico.trim() || undefined,
    detalharPrecosNoPdf: f.detalharPrecosNoPdf,
    itens: f.itens.map((item) => ({
      produtoId: item.produtoId,
      quantidade: lerNumero(item.quantidade),
      precoUnitario: lerNumero(item.precoUnitario),
    })),
  };
}

/** Campo da API -> campo do formulário (os de itens já vêm no mesmo formato: itens.0.quantidade). */
export function campoDoFormulario(campoApi: string) {
  if (campoApi === 'clienteId') return 'root.cliente';
  if (campoApi === 'itens') return 'root.itens';
  return campoApi;
}

/** Resposta do POST/PUT: os totais que valem (Decimal do Prisma chega como texto). */
export type OrcamentoSalvo = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  subtotal: string;
  descontoAplicado: string;
  valorTotal: string;
  resumoPagamento: string;
  /** chave do link público do PDF */
  tokenPdf: string;
  // cartão, como a API gravou (nulos sem cartão ou em orçamento antigo)
  parcelas?: number | null;
  pagamentoDebito?: boolean;
  absorverTaxaCartao?: boolean;
  taxaCartaoPct?: string | null;
  valorEntrada?: string | null;
  valorParcela?: string | null;
  valorPrimeiraParcela?: string | null;
  valorTotalCliente?: string | null;
  valorTaxaAbsorvida?: string | null;
};

/** O pagamento no cartão como foi GRAVADO (a taxa da época; a tabela atual não entra). */
export function cartaoDoSalvo(s: OrcamentoSalvo): PagamentoCartao | null {
  if (s.taxaCartaoPct == null || s.valorTotalCliente == null) return null;
  const entrada = Number(s.valorEntrada ?? 0);
  const saldo = Math.round((Number(s.valorTotal) - entrada) * 100) / 100;
  const absorvido = Number(s.valorTaxaAbsorvida ?? 0);
  return {
    debito: Boolean(s.pagamentoDebito),
    parcelas: s.parcelas ?? 1,
    taxaPct: Number(s.taxaCartaoPct),
    absorvida: Boolean(s.absorverTaxaCartao),
    saldo,
    valorCobrado: Math.round((Number(s.valorTotalCliente) - entrada) * 100) / 100,
    valorParcela: Number(s.valorParcela ?? 0),
    valorPrimeiraParcela: Number(s.valorPrimeiraParcela ?? s.valorParcela ?? 0),
    valorRecebido: Math.round((saldo - absorvido) * 100) / 100,
    valorAbsorvido: absorvido,
  };
}

/** Caminho do PDF na API (o mesmo link que vai para o cliente pelo WhatsApp). */
export const caminhoDoPdf = (o: Pick<OrcamentoSalvo, 'id' | 'tokenPdf'>) =>
  `/api/orcamentos/${o.id}/pdf?token=${encodeURIComponent(o.tokenPdf)}`;

/** Orçamento gravado -> formulário do gerador (para abrir e editar). */
export function valoresDoOrcamento(o: OrcamentoCompleto): FormularioOrcamento {
  const numeroTexto = (v: string | number | null | undefined, padrao: string) =>
    v === null || v === undefined ? padrao : formatarQuantidade(Number(v));
  return {
    cliente: o.cliente,
    itens: o.itens.map((item) => ({
      produtoId: item.produtoId,
      nome: item.descricao,
      categoria: item.produto.categoria,
      unidade: item.unidade,
      precoTabela: Number(item.precoTabela),
      quantidade: formatarQuantidade(Number(item.quantidade)),
      precoUnitario: formatarDecimal(Number(item.precoUnitario)),
    })),
    descontoTipo: o.descontoTipo,
    descontoValor:
      o.descontoTipo === 'VALOR' ? formatarDecimal(Number(o.descontoValor)) : numeroTexto(o.descontoValor, '0'),
    condicaoPagamento: o.condicaoPagamento,
    descontoAVistaPct: numeroTexto(o.descontoAVistaPct, '0'),
    // os selects só têm estas opções; valores fora delas voltam ao padrão
    entradaPct: OPCOES_ENTRADA.includes(String(Number(o.entradaPct))) ? String(Number(o.entradaPct)) : '30',
    parcelas: o.pagamentoDebito ? DEBITO : parcelaValida(String(o.parcelas)) ? String(o.parcelas) : '6',
    absorverTaxaCartao: o.absorverTaxaCartao,
    // gravada ao meio-dia UTC: os 10 primeiros caracteres são a data certa
    validade: o.validade.slice(0, 10),
    observacoes: o.observacoes ?? '',
    descricaoServico: o.descricaoServico ?? '',
    detalharPrecosNoPdf: o.detalharPrecosNoPdf,
  };
}

export const salvoDoOrcamento = (o: OrcamentoCompleto, resumoPagamento: string): OrcamentoSalvo => ({
  id: o.id,
  codigo: o.codigo,
  status: o.status,
  subtotal: o.subtotal,
  descontoAplicado: o.descontoAplicado,
  valorTotal: o.valorTotal,
  resumoPagamento,
  tokenPdf: o.tokenPdf,
  parcelas: o.parcelas,
  pagamentoDebito: o.pagamentoDebito,
  absorverTaxaCartao: o.absorverTaxaCartao,
  taxaCartaoPct: o.taxaCartaoPct,
  valorEntrada: o.valorEntrada,
  valorParcela: o.valorParcela,
  valorPrimeiraParcela: o.valorPrimeiraParcela,
  valorTotalCliente: o.valorTotalCliente,
  valorTaxaAbsorvida: o.valorTaxaAbsorvida,
});
