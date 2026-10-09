/*
 * Cliente HTTP dos fronts (escritório e técnico). Toda chamada à API passa por aqui:
 * - envia o token no cabeçalho Authorization;
 * - transforma qualquer falha em ErroApi, com mensagem pronta para mostrar ao usuário
 *   (a API já responde { erro, detalhes? } com textos para o usuário final);
 * - em 401, avisa a sessão para sair e voltar ao login;
 * - espera o servidor acordar antes do primeiro pedido e distingue "servidor acordando" de
 *   "aparelho sem internet" (veja "Conexão com o servidor", mais abaixo).
 */

export type DetalheErro = { campo: string; mensagem: string };

export class ErroApi extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes: DetalheErro[] = [],
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

/** status 0 = não chegou a falar com o servidor */
export const SEM_CONEXAO = 0;

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Endereço completo de um caminho da API, para links abertos fora do fetch (ex.: PDF). */
export const urlDaApi = (caminho: string) => `${BASE_URL}${caminho}`;

// Cada app guarda o token com a própria chave: no mesmo navegador, a sessão do escritório
// e a do técnico não se misturam. Definida por configurarApi() antes de renderizar o app.
let CHAVE_TOKEN = 'guarusolar.token';
/** "celular" no app do técnico: entra na mensagem de quem ficou sem internet. */
let APARELHO = 'computador';

export function configurarApi(opcoes: { chaveToken: string; aparelho?: 'computador' | 'celular' }) {
  CHAVE_TOKEN = opcoes.chaveToken;
  APARELHO = opcoes.aparelho ?? 'computador';
}

// O armazenamento do navegador pode estar bloqueado; nesse caso a sessão dura só a aba aberta.
let tokenEmMemoria: string | null = null;

export const tokenSalvo = {
  ler(): string | null {
    try {
      return localStorage.getItem(CHAVE_TOKEN) ?? tokenEmMemoria;
    } catch {
      return tokenEmMemoria;
    }
  },
  gravar(token: string) {
    tokenEmMemoria = token;
    try {
      localStorage.setItem(CHAVE_TOKEN, token);
    } catch {
      /* segue só em memória */
    }
  },
  apagar() {
    tokenEmMemoria = null;
    try {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(`${CHAVE_TOKEN}.usuario`);
    } catch {
      /* nada a apagar */
    }
  },
};

/**
 * Último usuário confirmado pela API, para o app abrir sem internet (app do técnico).
 * Sai junto com o token. Não é prova de acesso: quem decide é a API, a cada requisição.
 */
export const usuarioSalvo = {
  ler<T>(): T | null {
    try {
      const texto = localStorage.getItem(`${CHAVE_TOKEN}.usuario`);
      return texto ? (JSON.parse(texto) as T) : null;
    } catch {
      return null;
    }
  },
  gravar(usuario: unknown) {
    try {
      localStorage.setItem(`${CHAVE_TOKEN}.usuario`, JSON.stringify(usuario));
    } catch {
      /* sem armazenamento: o app só não abrirá sem internet */
    }
  },
};

let aoSessaoExpirar: ((mensagem: string) => void) | null = null;

/** A sessão registra aqui o que fazer quando a API responder 401. */
export function quandoSessaoExpirar(acao: (mensagem: string) => void) {
  aoSessaoExpirar = acao;
  return () => {
    if (aoSessaoExpirar === acao) aoSessaoExpirar = null;
  };
}

function mensagemPadrao(status: number) {
  if (status === 401) return 'Sessão expirada, faça login novamente';
  if (status === 403) return 'Seu usuário não tem acesso a esta função';
  if (status === 404) return 'O item procurado não foi encontrado';
  if (status >= 500) return 'O servidor encontrou um problema. Tente novamente em instantes.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}

async function lerCorpo(resposta: Response): Promise<unknown> {
  const texto = await resposta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

type Opcoes = {
  /** Objeto vira JSON; FormData (envio de arquivo) segue como está. */
  corpo?: unknown;
  signal?: AbortSignal;
  /** No login, 401 é "senha errada", não sessão expirada: não redireciona. */
  semRedirecionarEm401?: boolean;
  /** A resposta é um arquivo (foto): devolve o Blob em vez de ler JSON. */
  comoArquivo?: boolean;
};

// ---------------------------------------------------------------------------------------------
// Conexão com o servidor. No plano gratuito da Render o servidor "dorme" depois de 15 min sem
// pedidos e o primeiro acesso leva de 30 a 60 s. Sem tratar isso, a pessoa vê tela branca ou
// "erro de rede" e conclui que o sistema caiu.
//
// - Antes do PRIMEIRO pedido (e de novo depois de 10 min sem resposta do servidor, quando ele
//   pode ter dormido), `acordarServidor` chama /saude?ping=1 (não toca no banco) até responder:
//   novas tentativas com espera de 2, 4, 8 e 15 s, por até 90 s no total. Só então o pedido de
//   verdade é feito, uma vez: nenhum POST é repetido às cegas.
// - Celular sem internet (navigator.onLine === false) é outra situação e outra mensagem: não
//   tenta de novo em loop; o evento `online` do navegador retoma.
// - As telas acompanham por `ouvirConexao` (AvisoDeConexao: tela de espera e faixa no topo).
// - Depois de falhar (90 s), cada pedido novo faz só UMA tentativa curta, para a tela não ficar
//   alternando entre "conectando" e "não foi possível"; "Tentar de novo" (`reconectar`) recomeça.
// ---------------------------------------------------------------------------------------------

export type EstadoDaConexao = 'conectado' | 'conectando' | 'offline' | 'falhou';
export type Conexao = { estado: EstadoDaConexao; /** quando entrou neste estado */ desde: number };

/** Tempo total de espera pelo servidor que está acordando. */
export const TEMPO_PARA_ACORDAR = 90_000;
const ESPERAS_PARA_ACORDAR = [2_000, 4_000, 8_000, 15_000];
/** Depois disso sem resposta do servidor ele pode ter dormido (a Render suspende com 15 min). */
const SERVIDOR_PODE_TER_DORMIDO = 10 * 60_000;
const TENTATIVA_CURTA = 10_000;

const semInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const erroSemInternet = () => new ErroApi(SEM_CONEXAO, `Sem conexão. Verifique a internet do ${APARELHO}.`);

let conexao: Conexao = { estado: semInternet() ? 'offline' : 'conectado', desde: Date.now() };
let ultimaResposta = 0;
let acordando: Promise<void> | null = null;
const ouvintesDaConexao = new Set<() => void>();

function mudarConexao(estado: EstadoDaConexao) {
  if (conexao.estado === estado) return;
  conexao = { estado, desde: Date.now() };
  ouvintesDaConexao.forEach((ouvir) => ouvir());
}

export function ouvirConexao(ouvir: () => void) {
  ouvintesDaConexao.add(ouvir);
  return () => {
    ouvintesDaConexao.delete(ouvir);
  };
}
export const conexaoAtual = () => conexao;

async function servidorResponde(limite: number) {
  try {
    const resposta = await fetch(`${BASE_URL}/saude?ping=1`, { cache: 'no-store', signal: AbortSignal.timeout(limite) });
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Garante que o servidor está respondendo antes de um pedido. Vários pedidos ao mesmo tempo
 * esperam a MESMA tentativa. Rejeita com ErroApi(SEM_CONEXAO) e a mensagem certa para cada caso.
 */
export function acordarServidor(): Promise<void> {
  if (semInternet()) {
    mudarConexao('offline');
    return Promise.reject(erroSemInternet());
  }
  if (Date.now() - ultimaResposta < SERVIDOR_PODE_TER_DORMIDO) return Promise.resolve();
  if (acordando) return acordando;
  const curta = conexao.estado === 'falhou';
  const limite = curta ? TENTATIVA_CURTA : TEMPO_PARA_ACORDAR;
  if (!curta) mudarConexao('conectando');
  const inicio = Date.now();
  acordando = (async () => {
    for (let tentativa = 0; ; tentativa++) {
      if (semInternet()) {
        mudarConexao('offline');
        throw erroSemInternet();
      }
      const resta = limite - (Date.now() - inicio);
      if (resta <= 0) break;
      if (await servidorResponde(resta)) {
        ultimaResposta = Date.now();
        mudarConexao('conectado');
        return;
      }
      const espera = ESPERAS_PARA_ACORDAR[Math.min(tentativa, ESPERAS_PARA_ACORDAR.length - 1)];
      if (curta || Date.now() - inicio + espera >= limite) break;
      await new Promise((seguir) => setTimeout(seguir, espera));
    }
    if (semInternet()) {
      mudarConexao('offline');
      throw erroSemInternet();
    }
    mudarConexao('falhou');
    throw new ErroApi(SEM_CONEXAO, 'Não foi possível conectar ao servidor.');
  })().finally(() => {
    acordando = null;
  });
  return acordando;
}

/** Botão "Tentar de novo": recomeça a espera inteira (90 s). */
export function reconectar() {
  ultimaResposta = 0;
  if (conexao.estado === 'falhou') mudarConexao('conectando');
  return acordarServidor();
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => mudarConexao('offline'));
  // a internet voltou: confere o servidor (ele pode ter dormido enquanto isso)
  window.addEventListener('online', () => {
    ultimaResposta = 0;
    if (conexao.estado === 'offline') mudarConexao('conectando');
    acordarServidor().catch(() => undefined);
  });
}

function requisitar<T>(metodo: string, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  return acordarServidor().then(() => executar<T>(metodo, caminho, opcoes));
}

async function executar<T>(metodo: string, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { corpo, signal, semRedirecionarEm401, comoArquivo } = opcoes;
  const cabecalhos: Record<string, string> = { Accept: comoArquivo ? '*/*' : 'application/json' };
  const formulario = corpo instanceof FormData;
  // no FormData o navegador monta o Content-Type com o separador das partes
  if (corpo !== undefined && !formulario) cabecalhos['Content-Type'] = 'application/json';
  const token = tokenSalvo.ler();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
      signal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    if (semInternet()) {
      mudarConexao('offline');
      throw erroSemInternet();
    }
    // com internet e sem resposta: o servidor caiu ou dormiu; o próximo pedido confere antes
    ultimaResposta = 0;
    throw new ErroApi(SEM_CONEXAO, 'O servidor não respondeu. Tente de novo em instantes.');
  }
  // 502, 503 e 504 vêm da hospedagem enquanto o servidor sobe (ou de uma falha passageira)
  if (resposta.status >= 502 && resposta.status <= 504) ultimaResposta = 0;
  else {
    ultimaResposta = Date.now();
    mudarConexao('conectado');
  }

  if (resposta.ok && comoArquivo) return (await resposta.blob()) as T;
  const dados = await lerCorpo(resposta);
  if (resposta.ok) return dados as T;

  const corpoErro = (dados ?? {}) as { erro?: unknown; detalhes?: unknown };
  const mensagem = typeof corpoErro.erro === 'string' ? corpoErro.erro : mensagemPadrao(resposta.status);
  const detalhes = Array.isArray(corpoErro.detalhes) ? (corpoErro.detalhes as DetalheErro[]) : [];

  if (resposta.status === 401 && !semRedirecionarEm401) aoSessaoExpirar?.(mensagem);
  throw new ErroApi(resposta.status, mensagem, detalhes);
}

/**
 * Endereço (na API) de uma foto de serviço. Não serve em <img src>: a rota exige o token no
 * cabeçalho. Use o componente ImagemProtegida, que busca com o token e exibe.
 */
export const urlDaFoto = (id: string, tamanho: 'original' | 'miniatura' = 'original') =>
  `/api/fotos/${id}${tamanho === 'miniatura' ? '?tamanho=miniatura' : ''}`;

export const api = {
  get: <T>(caminho: string, opcoes?: Omit<Opcoes, 'corpo'>) => requisitar<T>('GET', caminho, opcoes),
  post: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('POST', caminho, { ...opcoes, corpo }),
  put: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('PUT', caminho, { ...opcoes, corpo }),
  patch: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('PATCH', caminho, { ...opcoes, corpo }),
  /** Baixa um arquivo protegido (ex.: foto) com o token no cabeçalho. */
  baixar: (caminho: string, opcoes?: Pick<Opcoes, 'signal'>) =>
    requisitar<Blob>('GET', caminho, { ...opcoes, comoArquivo: true }),
};
