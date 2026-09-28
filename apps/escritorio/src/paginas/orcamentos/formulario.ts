import type {
  CategoriaProduto,
  CondicaoPagamento,
  EntradaCalculo,
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
  parcelas: string;
  /** AAAA-MM-DD, como o <input type="date"> usa */
  validade: string;
  observacoes: string;
};

/** Modo leitura (fieldset desabilitado): esconde a busca do catálogo e esmaece botões e campos. */
export const ESTILO_SOMENTE_LEITURA =
  '[&:disabled_.busca-catalogo]:hidden [&:disabled_button]:cursor-not-allowed [&:disabled_button]:opacity-40 [&:disabled_input]:opacity-60 [&:disabled_select]:opacity-60';

export const OPCOES_ENTRADA =['0', '10', '20', '30', '40', '50'];
export const OPCOES_PARCELAS = ['2', '3', '4', '6', '10', '12'];
export const DIAS_DE_VALIDADE = 30;

/** Data local no formato AAAA-MM-DD, `dias` à frente de hoje. */
export function dataDaquiA(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
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
    validade: dataDaquiA(DIAS_DE_VALIDADE),
    observacoes: '',
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
    parcelas: Math.max(1, Math.trunc(numeroOuZero(f.parcelas))),
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
      ? { entradaPct: numeroOuZero(f.entradaPct), parcelas: Math.trunc(numeroOuZero(f.parcelas)) }
      : {}),
    observacoes: f.observacoes.trim() || undefined,
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
};

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
    parcelas: OPCOES_PARCELAS.includes(String(o.parcelas)) ? String(o.parcelas) : '6',
    // gravada ao meio-dia UTC: os 10 primeiros caracteres são a data certa
    validade: o.validade.slice(0, 10),
    observacoes: o.observacoes ?? '',
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
});
