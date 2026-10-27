import {
  CONDICOES_PADRAO_DA_PROPOSTA,
  GARANTIA_PADRAO,
  MARGEM_PADRAO,
  MAXIMO_PARCELAS,
  partesNoFuso,
  problemaNasParcelas,
  TAXAS_CARTAO,
} from '@guarusolar/compartilhado';
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
  /** listado no PDF do cliente (no preço entra sempre); começa como o catálogo */
  apareceNaProposta: boolean;
};

export type FormularioOrcamento = {
  cliente: Cliente | null;
  /** tipo de serviço vendido (obrigatório para salvar); '' = ainda não escolhido */
  tipoDeServicoId: string;
  itens: ItemFormulario[];
  /** margem de lucro em reais desta proposta (embutida no total; o cliente não vê) */
  margem: string;
  descontoTipo: TipoDesconto;
  descontoValor: string;
  /** imposto em %, somado depois dos descontos (padrão 0) */
  impostoPct: string;
  /** linha "Impostos (X%)" no PDF; desligado, o imposto sai embutido nos preços */
  mostrarImpostosNoPdf: boolean;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string;
  /** 'D' = débito; '1' a '18' = crédito em N vezes */
  parcelas: string;
  /** a Guarusolar absorve a taxa do cartão (negociação) */
  absorverTaxaCartao: boolean;
  /** AAAA-MM-DD, como o <input type="date"> usa */
  validade: string;
  observacoes: string;
  /** título do serviço no PDF ("Instalação de carregador veicular · Residencial") */
  descricaoServico: string;
  /** prazo de execução, texto livre; rascunho pode ficar sem, mas sem ele não há PDF nem envio */
  prazoExecucao: string;
  /** garantia do serviço no PDF; começa no texto padrão (compartilhado/textosDaProposta.ts) */
  garantia: string;
  /** troca a cópia gravada do cliente pelos dados atuais do cadastro, ao salvar */
  atualizarDadosCliente: boolean;
};

/** Modo leitura (fieldset desabilitado): esconde a busca do catálogo e esmaece botões e campos. */
export const ESTILO_SOMENTE_LEITURA =
  '[&:disabled_.busca-catalogo]:hidden [&:disabled_button]:cursor-not-allowed [&:disabled_button]:opacity-40 [&:disabled_input]:opacity-60 [&:disabled_select]:opacity-60';

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

const PADRAO_A_VISTA = CONDICOES_PADRAO_DA_PROPOSTA.descontoAVistaPct == null ? null : formatarQuantidade(CONDICOES_PADRAO_DA_PROPOSTA.descontoAVistaPct);
const PADRAO_PARCELAS = CONDICOES_PADRAO_DA_PROPOSTA.parcelas == null ? null : String(CONDICOES_PADRAO_DA_PROPOSTA.parcelas);

/** Número digitado, ou null com o campo em branco (o cálculo usa o padrão). */
const numeroOuNulo = (valor: string) => {
  const n = lerNumero(valor);
  return Number.isFinite(n) ? n : null;
};

export function valoresIniciais(): FormularioOrcamento {
  return {
    cliente: null,
    tipoDeServicoId: '',
    itens: [],
    // orçamento novo já começa com a margem padrão (compartilhado/margemDoOrcamento.ts)
    margem: formatarDecimal(MARGEM_PADRAO),
    descontoTipo: 'PERCENTUAL',
    descontoValor: '0',
    impostoPct: '0',
    mostrarImpostosNoPdf: true,
    condicaoPagamento: 'A_VISTA',
    // desconto à vista e parcelas começam no VALOR SUGERIDO (compartilhado/condicoesDaProposta.ts);
    // sem sugestão, VAZIOS: o vendedor informa (nenhum número inventado; 27/10/2026)
    descontoAVistaPct: PADRAO_A_VISTA ?? '',
    parcelas: PADRAO_PARCELAS ?? '',
    absorverTaxaCartao: false,
    validade: dataDaquiA(DIAS_DE_VALIDADE),
    observacoes: '',
    descricaoServico: '',
    prazoExecucao: '',
    garantia: GARANTIA_PADRAO,
    atualizarDadosCliente: false,
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
    apareceNaProposta: produto.apareceNaProposta ?? true,
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
    margem: Math.max(numeroOuZero(f.margem), 0),
    descontoTipo: f.descontoTipo,
    descontoValor: numeroOuZero(f.descontoValor),
    impostoPct: numeroOuZero(f.impostoPct),
    condicaoPagamento: f.condicaoPagamento,
    // em branco = null: as três condições da proposta usam o padrão
    descontoAVistaPct: numeroOuNulo(f.descontoAVistaPct),
    parcelas: f.parcelas === DEBITO ? 1 : f.parcelas.trim() === '' ? null : Math.max(1, Math.trunc(numeroOuZero(f.parcelas))),
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

/** Problema no imposto (%), mostrado enquanto se digita. Em branco vale zero. */
export function problemaNoImposto(valorDigitado: string) {
  if (valorDigitado.trim() === '') return null;
  const valor = lerNumero(valorDigitado);
  if (!(valor >= 0)) return 'Informe um percentual válido (use 0 para nenhum)';
  if (valor > 100) return 'O imposto não pode passar de 100%';
  return null;
}

export type ProblemaFormulario = { campo: string; mensagem: string };

/** Confere o que a API exigiria, para mostrar tudo de uma vez antes de enviar. */
export function validarParaSalvar(f: FormularioOrcamento, subtotal: number): ProblemaFormulario[] {
  const problemas: ProblemaFormulario[] = [];
  if (!f.tipoDeServicoId) problemas.push({ campo: 'tipoDeServicoId', mensagem: 'Escolha o tipo de serviço do orçamento' });
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
  if (f.margem.trim() !== '' && !(lerNumero(f.margem) >= 0)) {
    problemas.push({ campo: 'margem', mensagem: 'Informe a margem em reais (use 0 para nenhuma)' });
  }
  const desconto = problemaNoDesconto(f, subtotal);
  if (desconto) problemas.push({ campo: 'descontoValor', mensagem: desconto });
  const imposto = problemaNoImposto(f.impostoPct);
  if (imposto) problemas.push({ campo: 'impostoPct', mensagem: imposto });
  // vale em qualquer condição: é também o desconto do "à vista via Pix" da proposta. Na condição
  // à vista ele é o da própria venda: obrigatório para salvar (0 = sem desconto)
  if (f.condicaoPagamento === 'A_VISTA' && f.descontoAVistaPct.trim() === '') {
    problemas.push({ campo: 'descontoAVistaPct', mensagem: 'Informe o desconto à vista (use 0 para nenhum)' });
  } else if (f.descontoAVistaPct.trim() !== '') {
    const pct = lerNumero(f.descontoAVistaPct);
    if (!(pct >= 0 && pct <= 100)) {
      problemas.push({ campo: 'descontoAVistaPct', mensagem: 'Use um percentual entre 0 e 100' });
    }
  }
  if (f.condicaoPagamento === 'ENTRADA_PARCELAS' && f.parcelas.trim() === '') {
    problemas.push({ campo: 'parcelas', mensagem: 'Escolha o número de parcelas' });
  } else {
    // a mesma guarda da API: a última parcela nunca sai zerada ou negativa
    const parcelas = problemaNasParcelas(entradaDoCalculo(f));
    if (parcelas) problemas.push({ campo: 'parcelas', mensagem: parcelas });
  }
  if (!f.validade) {
    problemas.push({ campo: 'validade', mensagem: 'Informe até quando o orçamento vale' });
  } else if (f.validade < dataDaquiA(0)) {
    problemas.push({ campo: 'validade', mensagem: 'A validade não pode estar no passado' });
  }
  return problemas;
}

/**
 * Corpo do POST/PUT /api/orcamentos. Débito e taxa absorvida só da condição "Cartão" (sem
 * entrada: o valor inteiro vai para o cartão); desconto à vista e parcelas SEMPRE (são as entradas das três condições da proposta;
 * null = em branco, a API usa o padrão).
 */
export function paraApi(f: FormularioOrcamento) {
  return {
    clienteId: f.cliente!.id,
    tipoDeServicoId: f.tipoDeServicoId,
    // meio-dia UTC: a data continua a mesma em qualquer fuso do Brasil
    validade: `${f.validade}T12:00:00Z`,
    margem: Math.max(numeroOuZero(f.margem), 0),
    descontoTipo: f.descontoTipo,
    descontoValor: numeroOuZero(f.descontoValor),
    impostoPct: numeroOuZero(f.impostoPct),
    mostrarImpostosNoPdf: f.mostrarImpostosNoPdf,
    condicaoPagamento: f.condicaoPagamento,
    descontoAVistaPct: f.condicaoPagamento === 'A_VISTA' ? numeroOuZero(f.descontoAVistaPct) : numeroOuNulo(f.descontoAVistaPct),
    parcelas: f.parcelas === DEBITO ? 1 : f.parcelas.trim() === '' ? null : Math.trunc(numeroOuZero(f.parcelas)),
    ...(f.condicaoPagamento === 'ENTRADA_PARCELAS'
      ? {
          pagamentoDebito: f.parcelas === DEBITO,
          absorverTaxaCartao: f.absorverTaxaCartao,
        }
      : {}),
    observacoes: f.observacoes.trim() || undefined,
    descricaoServico: f.descricaoServico.trim() || undefined,
    // sempre enviados, mesmo vazios: vazio apaga o que estava gravado
    prazoExecucao: f.prazoExecucao.trim(),
    garantia: f.garantia.trim(),
    atualizarDadosCliente: f.atualizarDadosCliente,
    itens: f.itens.map((item) => ({
      produtoId: item.produtoId,
      quantidade: lerNumero(item.quantidade),
      precoUnitario: lerNumero(item.precoUnitario),
      apareceNaProposta: item.apareceNaProposta,
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
  margem?: string;
  descontoAplicado: string;
  /** imposto em R$; ausente em resposta da versão anterior da API */
  impostoAplicado?: string;
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
  valorUltimaParcela?: string | null;
  valorTotalCliente?: string | null;
  valorTaxaAbsorvida?: string | null;
  clienteId?: string;
  /** o projeto criado na aprovação (orçamento aprovado) */
  projeto?: { id: string; codigo: string } | null;
  /** cópia dos dados do cliente gravada no orçamento (a do PDF); null só em orçamento antigo */
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  clienteWhatsapp?: string | null;
  clienteEmail?: string | null;
  clienteCep?: string | null;
  clienteLogradouro?: string | null;
  clienteNumero?: string | null;
  clienteComplemento?: string | null;
  clienteBairro?: string | null;
  clienteCidade?: string | null;
  clienteUf?: string | null;
  clienteCopiadoEm?: string | null;
};

/** Dados do cliente como aparecem no documento (a cópia gravada ou o cadastro). */
export type DadosClienteDocumento = Pick<
  Cliente,
  'nome' | 'documento' | 'whatsapp' | 'email' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'
>;

/** A cópia do cliente gravada no orçamento salvo; null se ainda não há (orçamento antigo). */
export function copiaDoSalvo(s: OrcamentoSalvo): (DadosClienteDocumento & { copiadoEm: string | null }) | null {
  if (s.clienteNome == null) return null;
  return {
    nome: s.clienteNome,
    documento: s.clienteDocumento ?? '',
    whatsapp: s.clienteWhatsapp ?? '',
    email: s.clienteEmail ?? null,
    cep: s.clienteCep ?? null,
    logradouro: s.clienteLogradouro ?? null,
    numero: s.clienteNumero ?? null,
    complemento: s.clienteComplemento ?? null,
    bairro: s.clienteBairro ?? null,
    cidade: s.clienteCidade ?? null,
    uf: s.clienteUf ?? null,
    copiadoEm: s.clienteCopiadoEm ?? null,
  };
}

/** O que mudou no cadastro em relação à cópia gravada (para o aviso ao vendedor). */
export function diferencasDoCadastro(copia: DadosClienteDocumento, cadastro: DadosClienteDocumento): string[] {
  const igual = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim() === (b ?? '').trim();
  const grupos: [string, (keyof DadosClienteDocumento)[]][] = [
    ['nome', ['nome']],
    ['CPF/CNPJ', ['documento']],
    ['WhatsApp', ['whatsapp']],
    ['e-mail', ['email']],
    ['endereço', ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']],
  ];
  return grupos.filter(([, campos]) => campos.some((c) => !igual(copia[c], cadastro[c]))).map(([rotulo]) => rotulo);
}

/**
 * O pagamento no cartão como foi GRAVADO (a taxa da época; a tabela atual não entra). A entrada
 * só existe em orçamento salvo antes de 25/10/2026: o que foi ao cliente continua como foi.
 */
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
    valorUltimaParcela: Number(s.valorUltimaParcela ?? s.valorParcela ?? 0),
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
    // orçamento anterior ao campo abre sem tipo: para salvar, é preciso escolher
    tipoDeServicoId: o.tipoDeServicoId ?? '',
    itens: o.itens.map((item) => ({
      produtoId: item.produtoId,
      nome: item.descricao,
      categoria: item.produto.categoria,
      unidade: item.unidade,
      precoTabela: Number(item.precoTabela),
      quantidade: formatarQuantidade(Number(item.quantidade)),
      precoUnitario: formatarDecimal(Number(item.precoUnitario)),
      apareceNaProposta: item.apareceNaProposta ?? true,
    })),
    // a margem GRAVADA: orçamento anterior ao campo abre com zero, não com o padrão
    margem: formatarDecimal(Number(o.margem ?? 0)),
    descontoTipo: o.descontoTipo,
    descontoValor:
      o.descontoTipo === 'VALOR' ? formatarDecimal(Number(o.descontoValor)) : numeroTexto(o.descontoValor, '0'),
    impostoPct: numeroTexto(o.impostoPct, '0'),
    mostrarImpostosNoPdf: o.mostrarImpostosNoPdf ?? true,
    condicaoPagamento: o.condicaoPagamento,
    // fora da condição escolhida, o que está na proposta gravada (propostaAVistaPct /
    // propostaCartaoParcelas); sem ela, o padrão. Valor gravado da condição não escolhida, de antes
    // das três condições, era resto de edição: não vale
    descontoAVistaPct:
      o.condicaoPagamento === 'A_VISTA'
        ? numeroTexto(o.descontoAVistaPct, '')
        : numeroTexto(o.propostaAVistaPct, PADRAO_A_VISTA ?? ''),
    // os selects só têm estas opções; valores fora delas voltam ao padrão
    parcelas:
      o.condicaoPagamento === 'ENTRADA_PARCELAS'
        ? o.pagamentoDebito
          ? DEBITO
          : parcelaValida(String(o.parcelas))
            ? String(o.parcelas)
            : ''
        : o.propostaCartaoParcelas != null && parcelaValida(String(o.propostaCartaoParcelas))
          ? String(o.propostaCartaoParcelas)
          : (PADRAO_PARCELAS ?? ''),
    absorverTaxaCartao: o.absorverTaxaCartao,
    // gravada ao meio-dia UTC: os 10 primeiros caracteres são a data certa
    validade: o.validade.slice(0, 10),
    observacoes: o.observacoes ?? '',
    descricaoServico: o.descricaoServico ?? '',
    prazoExecucao: o.prazoExecucao ?? '',
    // sem garantia gravada (orçamento anterior ao campo), parte do padrão: é o que o PDF mostra
    garantia: o.garantia || GARANTIA_PADRAO,
    atualizarDadosCliente: false,
  };
}

export const salvoDoOrcamento = (o: OrcamentoCompleto, resumoPagamento: string): OrcamentoSalvo => ({
  id: o.id,
  codigo: o.codigo,
  status: o.status,
  subtotal: o.subtotal,
  // sem ela, ao abrir um orçamento salvo a linha "Itens" mostrava o subtotal já com a margem
  margem: o.margem,
  descontoAplicado: o.descontoAplicado,
  impostoAplicado: o.impostoAplicado,
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
  valorUltimaParcela: o.valorUltimaParcela,
  valorTotalCliente: o.valorTotalCliente,
  valorTaxaAbsorvida: o.valorTaxaAbsorvida,
  clienteId: o.cliente.id,
  projeto: o.projeto ?? null,
  clienteNome: o.clienteNome,
  clienteDocumento: o.clienteDocumento,
  clienteWhatsapp: o.clienteWhatsapp,
  clienteEmail: o.clienteEmail,
  clienteCep: o.clienteCep,
  clienteLogradouro: o.clienteLogradouro,
  clienteNumero: o.clienteNumero,
  clienteComplemento: o.clienteComplemento,
  clienteBairro: o.clienteBairro,
  clienteCidade: o.clienteCidade,
  clienteUf: o.clienteUf,
  clienteCopiadoEm: o.clienteCopiadoEm,
});
