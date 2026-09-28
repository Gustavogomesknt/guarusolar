/*
 * Cliente HTTP do escritório. Toda chamada à API passa por aqui:
 * - envia o token no cabeçalho Authorization;
 * - transforma qualquer falha em ErroApi, com mensagem pronta para mostrar ao usuário
 *   (a API já responde { erro, detalhes? } com textos para o usuário final);
 * - em 401, avisa a sessão para sair e voltar ao login.
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
const CHAVE_TOKEN = 'guarusolar.escritorio.token';

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
    } catch {
      /* nada a apagar */
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
  corpo?: unknown;
  signal?: AbortSignal;
  /** No login, 401 é "senha errada", não sessão expirada: não redireciona. */
  semRedirecionarEm401?: boolean;
};

async function requisitar<T>(metodo: string, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { corpo, signal, semRedirecionarEm401 } = opcoes;
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  const token = tokenSalvo.ler();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    throw new ErroApi(SEM_CONEXAO, 'Sem conexão com o servidor. Verifique a internet e tente novamente.');
  }

  const dados = await lerCorpo(resposta);
  if (resposta.ok) return dados as T;

  const corpoErro = (dados ?? {}) as { erro?: unknown; detalhes?: unknown };
  const mensagem = typeof corpoErro.erro === 'string' ? corpoErro.erro : mensagemPadrao(resposta.status);
  const detalhes = Array.isArray(corpoErro.detalhes) ? (corpoErro.detalhes as DetalheErro[]) : [];

  if (resposta.status === 401 && !semRedirecionarEm401) aoSessaoExpirar?.(mensagem);
  throw new ErroApi(resposta.status, mensagem, detalhes);
}

export const api = {
  get: <T>(caminho: string, opcoes?: Omit<Opcoes, 'corpo'>) => requisitar<T>('GET', caminho, opcoes),
  post: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('POST', caminho, { ...opcoes, corpo }),
  put: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('PUT', caminho, { ...opcoes, corpo }),
  patch: <T>(caminho: string, corpo?: unknown, opcoes?: Opcoes) =>
    requisitar<T>('PATCH', caminho, { ...opcoes, corpo }),
};
