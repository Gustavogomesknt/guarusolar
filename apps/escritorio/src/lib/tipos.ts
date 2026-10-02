import type {
  CategoriaProduto,
  CondicaoPagamento,
  Papel,
  StatusAgendamento,
  StatusOrcamento,
  StatusProjeto,
  TipoEventoProjeto,
  TipoServico,
  TipoDesconto,
  TipoPessoa,
  Unidade,
} from '@guarusolar/compartilhado';

/*
 * Formato das respostas da API usadas no escritório.
 * Campos Decimal do Prisma chegam como texto no JSON ("789.9"): converta com Number().
 */

export type Cliente = {
  id: string;
  tipoPessoa: TipoPessoa;
  nome: string;
  documento: string;
  whatsapp: string;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  observacoes?: string | null;
};

/** Serviço na agenda (GET /api/agenda). Datas chegam como "2026-09-29T00:00:00.000Z". */
export type AgendamentoNaAgenda = {
  id: string;
  projetoId: string;
  equipeId: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  projeto: {
    codigo: string;
    cliente: { nome: string; cidade: string | null; uf: string | null };
    orcamento: { id: string; codigo: string };
  };
  tecnicoResponsavel: { id: string; nome: string } | null;
};

/** Uma linha da grade: equipe com membros e serviços da semana. */
export type EquipeNaAgenda = {
  id: string;
  nome: string;
  membros: { id: string; nome: string; papel: string }[];
  agendamentos: AgendamentoNaAgenda[];
};

/** Projeto aprovado sem data (GET /api/agenda/pendentes). */
export type ProjetoPendente = {
  id: string;
  codigo: string;
  cliente: { nome: string; cidade: string | null; uf: string | null };
  orcamento: { codigo: string; valorTotal: string };
};

/** Cliente na tela de clientes (GET /api/clientes com a contagem de orçamentos). */
export type ClienteNaLista = Cliente & { quantidadeOrcamentos: number };

/** Ficha do cliente (GET /api/clientes/:id). */
export type FichaDoCliente = Cliente & {
  orcamentos: {
    id: string;
    codigo: string;
    status: StatusOrcamento;
    criadoEm: string;
    validade: string;
    valorTotal: string;
    valorTotalCliente: string | null;
    /** o projeto (obra) que o orçamento aprovado gerou */
    projeto: { id: string; codigo: string; status: StatusProjeto } | null;
  }[];
};

/** Linha da lista (GET /api/orcamentos). */
export type OrcamentoNaLista = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  criadoEm: string;
  validade: string;
  valorTotal: string;
  /** com a taxa do cartão repassada; null sem cartão */
  valorTotalCliente: string | null;
  enviadoEm: string | null;
  aprovadoEm: string | null;
  recusadoEm: string | null;
  cliente: { id: string; nome: string; cidade: string | null; uf: string | null; whatsapp: string };
};

/**
 * Indicadores (GET /api/orcamentos/resumo). O critério de data de cada um está documentado
 * na rota: total e quantidade por criação, valor aprovado por aprovação no mês, taxa sobre a
 * turma criada no mês, em aberto sem filtro de data.
 */
export type ResumoOrcamentos = {
  totalOrcadoMes: number;
  quantidadeMes: number;
  taxaAprovacao: number;
  aprovadosMes: number;
  enviadosMes: number;
  quantidadeEmAberto: number;
  valorEmAberto: number;
  valorAprovadoMes: number;
};

/** Orçamento completo (GET /api/orcamentos/:id), usado para abrir no gerador. */
export type OrcamentoCompleto = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  cliente: Cliente;
  validade: string;
  descontoTipo: TipoDesconto;
  descontoValor: string;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string | null;
  entradaPct: string | null;
  parcelas: number | null;
  observacoes: string | null;
  descricaoServico: string | null;
  detalharPrecosNoPdf: boolean;
  /** o projeto criado na aprovação */
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
  /** cartão (ENTRADA_PARCELAS), gravado ao salvar */
  pagamentoDebito: boolean;
  absorverTaxaCartao: boolean;
  taxaCartaoPct: string | null;
  valorEntrada: string | null;
  valorParcela: string | null;
  valorPrimeiraParcela: string | null;
  valorTotalCliente: string | null;
  valorTaxaAbsorvida: string | null;
  subtotal: string;
  descontoAplicado: string;
  valorTotal: string;
  /** gravado ao salvar; null só em orçamentos anteriores a essa gravação */
  resumoPagamento: string | null;
  tokenPdf: string;
  itens: {
    produtoId: string;
    descricao: string;
    unidade: Unidade;
    quantidade: string;
    precoUnitario: string;
    precoTabela: string;
    produto: { categoria: CategoriaProduto };
  }[];
};

/** Item do catálogo (GET /api/produtos). Preços chegam como texto (Decimal). */
export type Produto = {
  id: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: Unidade;
  precoCusto: string;
  precoVenda: string;
  descricaoTecnica: string | null;
  /** código que a Guarusolar já usa (113, 320...) */
  codigoFornecedor: string | null;
  ativo: boolean;
  /** calculados pela API com calcularMargem */
  margemPercentual: number;
  lucroBruto: number;
  /** linhas de orçamento que usam o item */
  usadoEmOrcamentos: number;
};

/** Serviço na fila de validação (GET /api/validacao/fila). */
export type ServicoNaFila = {
  id: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  enviadoEm: string | null;
  motivoDevolucao: string | null;
  /** já tinha sido devolvido e voltou com fotos novas */
  reenviado: boolean;
  projeto: { codigo: string; cliente: { nome: string; cidade: string | null; uf: string | null } };
  _count: { fotos: number };
};

export type FotoEmValidacao = {
  id: string;
  chave: string | null;
  rotulo: string | null;
  /** a imagem sai por GET /api/fotos/:id (com login): use urlDaFoto(id) + ImagemProtegida */
  capturadaEm: string | null;
  latitude: string | null;
  longitude: string | null;
  revisao: 'PENDENTE' | 'OK' | 'REFAZER';
  comentario: string | null;
  enviadaPor: { nome: string };
};

/** Serviço aberto na validação (GET /api/validacao/:id). Fotos já na ordem do checklist. */
export type ServicoEmValidacao = {
  id: string;
  tipo: TipoServico;
  status: StatusAgendamento;
  dataInicio: string;
  dataFim: string;
  enviadoEm: string | null;
  sistemaTestado: boolean;
  observacoesTecnico: string | null;
  motivoDevolucao: string | null;
  equipe: { nome: string };
  tecnicoResponsavel: { nome: string; telefone: string | null } | null;
  projetoId: string;
  projeto: {
    codigo: string;
    cliente: Cliente;
    orcamento: { id: string; codigo: string };
  };
  fotos: FotoEmValidacao[];
  materiais: { id: string; quantidade: string; observacao: string | null; produto: { nome: string; unidade: Unidade } }[];
};

// ---------------------------------------------------------------------------------------------
// Projetos (obras)
// ---------------------------------------------------------------------------------------------

/** Linha da lista (GET /api/projetos). */
export type ProjetoNaLista = {
  id: string;
  codigo: string;
  status: StatusProjeto;
  criadoEm: string;
  concluidoEm: string | null;
  canceladoEm: string | null;
  clienteNome: string;
  clienteCidade: string | null;
  clienteUf: string | null;
  orcamentoCodigo: string;
  valorTotal: string;
  valorTotalCliente: string;
  servicoAtual: {
    id: string;
    tipo: TipoServico;
    status: StatusAgendamento;
    dataInicio: string;
    dataFim: string;
    equipe: string;
    enviadoEm: string | null;
  } | null;
};

export type ListaDeProjetos = {
  contagem: Record<StatusProjeto | 'EM_ANDAMENTO', number>;
  itens: ProjetoNaLista[];
};

export type FotoDoProjeto = { id: string; chave: string | null; rotulo: string | null; revisao: 'PENDENTE' | 'OK' | 'REFAZER'; capturadaEm: string | null };

export type FichaDoProjeto = {
  id: string;
  codigo: string;
  status: StatusProjeto;
  potenciaKwp: string | null;
  observacoes: string | null;
  criadoEm: string;
  concluidoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  /** só o gestor vê as fotos (regra 6); o comercial recebe a contagem */
  podeVerFotos: boolean;
  cliente: { id: string; nome: string; whatsapp: string; ativo: boolean };
  orcamento: {
    id: string;
    codigo: string;
    tokenPdf: string;
    aprovadoEm: string | null;
    valorTotal: string;
    valorTotalCliente: string | null;
    resumoPagamento: string | null;
    condicaoPagamento: CondicaoPagamento;
    descricaoServico: string | null;
    clienteNome: string | null;
    clienteDocumento: string | null;
    clienteWhatsapp: string | null;
    clienteEmail: string | null;
    clienteCep: string | null;
    clienteLogradouro: string | null;
    clienteNumero: string | null;
    clienteComplemento: string | null;
    clienteBairro: string | null;
    clienteCidade: string | null;
    clienteUf: string | null;
    vendedor: { nome: string };
    _count: { itens: number };
  };
  agendamentos: {
    id: string;
    tipo: TipoServico;
    status: StatusAgendamento;
    dataInicio: string;
    dataFim: string;
    enviadoEm: string | null;
    validadoEm: string | null;
    motivoDevolucao: string | null;
    observacoesTecnico: string | null;
    equipe: { nome: string };
    tecnicoResponsavel: { nome: string } | null;
    validadoPor: { nome: string } | null;
    _count: { fotos: number };
    fotos?: FotoDoProjeto[];
  }[];
  eventos: {
    id: string;
    tipo: TipoEventoProjeto;
    descricao: string;
    reconstruido: boolean;
    criadoEm: string;
    agendamentoId: string | null;
    usuario: { nome: string } | null;
  }[];
};

// ---------------------------------------------------------------------------------------------
// Usuários (tela só do ADMIN)
// ---------------------------------------------------------------------------------------------

export type UsuarioNaLista = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  equipeId: string | null;
  ativo: boolean;
  /** ainda não trocou a senha temporária */
  senhaTemporaria: boolean;
  criadoEm: string;
};

export type ListaDeUsuarios = { usuarios: UsuarioNaLista[]; equipes: { id: string; nome: string }[] };

/** Resposta de criar e de nova senha: a senha aparece SÓ aqui, uma vez. */
export type UsuarioComSenha = { usuario: UsuarioNaLista; senhaTemporaria: string };
