import type {
  CategoriaProduto,
  GrupoNaProposta,
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
  /** CPF ou CNPJ, só dígitos; null = não informado (é opcional) */
  documento: string | null;
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
  /** quem vai de fato neste serviço (a equipe é só a composição padrão) */
  escala: { usuario: { id: string; nome: string } }[];
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
  /** "A agendar" ou, quando aberto pela ficha para outro serviço, aguardando conclusão ou concluído */
  status: StatusProjeto;
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
/** Tipo de serviço VENDIDO (GET /api/tipos-de-servico); não é a etapa do agendamento. */
export type TipoDeServico = {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  usadoEmOrcamentos: number;
};

/** Tipo resumido nas listas; null = orçamento ou projeto anterior ao campo ("Sem tipo"). */
export type TipoResumido = { id: string; nome: string } | null;

export type OrcamentoNaLista = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  /** ausente em resposta da versão anterior da API */
  tipoDeServico?: TipoResumido;
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
  /** por tipo de serviço, com os mesmos critérios de data dos cartões (mês da empresa) */
  porTipo?: {
    tipoDeServicoId: string | null;
    nome: string;
    ativo: boolean;
    orcados: { quantidade: number; valor: number };
    aprovados: { quantidade: number; valor: number };
  }[];
};

/** Orçamento completo (GET /api/orcamentos/:id), usado para abrir no gerador. */
export type OrcamentoCompleto = {
  id: string;
  codigo: string;
  status: StatusOrcamento;
  /** null nos orçamentos anteriores ao campo */
  tipoDeServicoId?: string | null;
  tipoDeServico?: { id: string; nome: string; ativo: boolean } | null;
  cliente: Cliente;
  validade: string;
  descontoTipo: TipoDesconto;
  descontoValor: string;
  /** imposto em %, somado depois dos descontos; ausentes em resposta da versão anterior da API */
  impostoPct?: string;
  impostoAplicado?: string;
  mostrarImpostosNoPdf?: boolean;
  condicaoPagamento: CondicaoPagamento;
  descontoAVistaPct: string | null;
  entradaPct: string | null;
  parcelas: number | null;
  observacoes: string | null;
  descricaoServico: string | null;
  detalharPrecosNoPdf: boolean;
  /** texto livre do PDF; null em orçamento anterior aos campos (ou rascunho sem prazo) */
  prazoExecucao?: string | null;
  garantia?: string | null;
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
  /** margem em reais desta proposta; zero em orçamento anterior ao campo */
  margem: string;
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
  /** parte da proposta em PDF; ausente em resposta da versão anterior da API (= MATERIAL) */
  grupoNaProposta?: GrupoNaProposta;
  unidade: Unidade;
  /** null = custo em branco (desconhecido) */
  precoCusto: string | null;
  precoVenda: string;
  descricaoTecnica: string | null;
  /** código que a Guarusolar já usa (113, 320...) */
  codigoFornecedor: string | null;
  ativo: boolean;
  /** calculados pela API com calcularMargem */
  /** null quando não há custo cadastrado */
  margemPercentual: number | null;
  lucroBruto: number | null;
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
/** Vídeo do serviço na validação: capa e link de leitura saem por /api/videos/:id, com login. */
export type VideoEmValidacao = {
  id: string;
  duracaoSegundos: number | null;
  tamanhoBytes: number;
  gravadoEm: string | null;
  criadoEm: string;
  temCapa: boolean;
  enviadoPor: { nome: string };
};

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
  /** quem foi escalado e quem enviou para validação */
  escala: { usuario: { id: string; nome: string } }[];
  enviadoPor: { nome: string; telefone: string | null } | null;
  projetoId: string;
  projeto: {
    codigo: string;
    cliente: Cliente;
    orcamento: { id: string; codigo: string };
  };
  fotos: FotoEmValidacao[];
  /** vídeos opcionais; ausente em resposta da versão anterior da API */
  videos?: VideoEmValidacao[];
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
  /** copiado do orçamento; null nos anteriores ao campo */
  tipoDeServico?: TipoResumido;
  criadoEm: string;
  concluidoEm: string | null;
  /** visita técnica validada: "Visita concluída — agendar instalação" */
  visitaTecnicaConcluidaEm: string | null;
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
  /** serviços ainda não validados (agendados, em execução ou em validação) */
  servicosPendentes: number;
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
  tipoDeServico?: TipoResumido;
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
    escala: { usuario: { id: string; nome: string } }[];
    enviadoPor: { nome: string } | null;
    validadoPor: { nome: string } | null;
    _count: { fotos: number };
    fotos?: FotoDoProjeto[];
  }[];
  /** visita técnica validada (o projeto voltou para "A agendar") */
  visitaTecnicaConcluidaEm: string | null;
  /** a conclusão é sempre uma ação do gestor */
  concluidoPor: { nome: string } | null;
  eventos: {
    id: string;
    tipo: TipoEventoProjeto;
    descricao: string;
    reconstruido: boolean;
    criadoEm: string;
    agendamentoId: string | null;
    usuario: { nome: string } | null;
    /** quando o evento mudou a situação do projeto: de qual para qual */
    statusAnterior: StatusProjeto | null;
    statusNovo: StatusProjeto | null;
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
  /** versão do app de campo vista por último e quando; null = nunca mandou (versão antiga).
   *  Ausentes em resposta da versão anterior da API */
  versaoAppCampo?: number | null;
  versaoAppCampoEm?: string | null;
};

export type ListaDeUsuarios = { usuarios: UsuarioNaLista[]; equipes: { id: string; nome: string }[] };

/** Resposta de criar e de nova senha: a senha aparece SÓ aqui, uma vez. */
export type UsuarioComSenha = { usuario: UsuarioNaLista; senhaTemporaria: string };
