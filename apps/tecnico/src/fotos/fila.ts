import { createStore, del, set, values } from 'idb-keyval';
import { ErroApi, SEM_CONEXAO } from '@guarusolar/web/api';
import { clienteConsultas } from '@/lib/consultas';
import { enviarFoto } from './envio';
import { lerMetadados, type Posicao } from './metadados';
import { reduzirFoto } from './reduzir';

/*
 * Fila de fotos do técnico (sinal ruim em campo). Regras:
 *
 * 1. Nada se perde: a foto ORIGINAL vai para o IndexedDB no instante em que é escolhida, antes
 *    de qualquer processamento. Se o app fechar no meio do preparo, ao abrir ele retoma.
 *    (Com a câmera do navegador, muitos Android nem guardam a foto na galeria: esta é a cópia.)
 * 2. Dois trabalhadores independentes, cada um uma foto por vez: um prepara (reduz + metadados),
 *    outro envia. Um envio lento no 3G não segura a miniatura da próxima foto.
 * 3. Falha de rede (sem conexão, tempo esgotado, 5xx) tenta de novo sozinha, com espera
 *    crescente; recusa da API (4xx) vira erro que o técnico resolve na tela; 401 pausa a fila
 *    até o técnico entrar de novo (a sessão cuida do login).
 * 4. Tenta de novo ao abrir o app, quando a conexão volta, quando o app volta para a tela e
 *    no tempo agendado. Não confia só no navigator.onLine, que mente com sinal fraco.
 * 5. Cada foto guarda quem a tirou e só é enviada com a sessão dessa pessoa.
 * 6. A API não duplica: cada envio leva o idLocal, e um reenvio devolve a foto já recebida.
 *
 * Os dados ficam como ArrayBuffer, não Blob: guardar Blob no IndexedDB já falhou em versões
 * do Safari; ArrayBuffer funciona em todos.
 */

const banco = createStore('guarusolar-tecnico', 'fila-de-fotos');

/** Espera entre tentativas depois de falha de rede: 5 s, 15 s, 1 min e depois 5 min. */
const ESPERAS = [5_000, 15_000, 60_000, 300_000];
const TEMPO_MAXIMO_DO_ENVIO = 90_000;

type Registro = {
  idLocal: string;
  usuarioId: string;
  servicoId: string;
  /** item do checklist; null = foto extra */
  chave: string | null;
  criadoEm: number;
  /** a foto como veio da câmera; sai depois do preparo */
  original?: { dados: ArrayBuffer; tipo: string; nome: string; modificadoEm: number };
  /** a foto pronta para envio (2000 px, JPEG 85) */
  foto?: { dados: ArrayBuffer; capturadaEm: string; latitude?: number; longitude?: number };
  tentativas: number;
  proximaTentativa: number;
  /** recusa definitiva (API ou preparo): precisa do técnico */
  erro?: string;
};

export type EstadoNaFila = 'preparando' | 'na_fila' | 'enviando' | 'erro';

export type FotoNaFila = {
  idLocal: string;
  servicoId: string;
  chave: string | null;
  estado: EstadoNaFila;
  /** miniatura (object URL) da foto já preparada */
  url: string | null;
  /** há foto pronta: dá para tentar o envio de novo sem tirar outra */
  preparada: boolean;
  erro?: string;
};

export type RetratoDaFila = {
  carregada: boolean;
  fotos: FotoNaFila[];
  /** miniaturas locais das fotos já enviadas nesta sessão, pelo id da foto na API */
  miniaturas: Record<string, string>;
  /** a última tentativa de envio falhou por rede (e nenhuma deu certo depois) */
  semConexao: boolean;
};

// ---------------------------------------------------------------------------------------
// Estado em memória (espelho do IndexedDB) e avisos para a interface
// ---------------------------------------------------------------------------------------

const registros = new Map<string, Registro>();
const urls = new Map<string, string>();
const miniaturas = new Map<string, string>();
/** posição pedida no toque da câmera; não vai para o banco (Promise não se guarda) */
const posicoes = new Map<string, Promise<Posicao | null>>();
let usuarioAtual: string | null = null;
let carregada = false;
let enviandoId: string | null = null;
let semConexao = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;

const ouvintes = new Set<() => void>();
let retrato: RetratoDaFila = { carregada: false, fotos: [], miniaturas: {}, semConexao: false };

const ordenados = () => [...registros.values()].sort((a, b) => a.criadoEm - b.criadoEm);

function urlDe(r: Registro) {
  if (!r.foto) return null;
  let url = urls.get(r.idLocal);
  if (!url) {
    url = URL.createObjectURL(new Blob([r.foto.dados], { type: 'image/jpeg' }));
    urls.set(r.idLocal, url);
  }
  return url;
}

function notificar() {
  const fotos: FotoNaFila[] = ordenados()
    .filter((r) => r.usuarioId === usuarioAtual)
    .map((r) => ({
      idLocal: r.idLocal,
      servicoId: r.servicoId,
      chave: r.chave,
      estado: r.erro ? 'erro' : r.idLocal === enviandoId ? 'enviando' : r.foto ? 'na_fila' : 'preparando',
      url: urlDe(r),
      preparada: Boolean(r.foto),
      erro: r.erro,
    }));
  retrato = { carregada, fotos, miniaturas: Object.fromEntries(miniaturas), semConexao };
  ouvintes.forEach((ouvir) => ouvir());
}

export function ouvirFila(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}
export const retratoDaFila = () => retrato;

async function gravar(r: Registro) {
  await set(r.idLocal, r, banco);
  registros.set(r.idLocal, r);
}

async function remover(idLocal: string, manterMiniaturaDaFoto?: string) {
  await del(idLocal, banco);
  registros.delete(idLocal);
  posicoes.delete(idLocal);
  const url = urls.get(idLocal);
  urls.delete(idLocal);
  if (url && manterMiniaturaDaFoto) {
    miniaturas.set(manterMiniaturaDaFoto, url);
    // limita a memória: guarda as 60 miniaturas mais recentes
    if (miniaturas.size > 60) {
      const [maisAntiga, urlAntiga] = miniaturas.entries().next().value!;
      miniaturas.delete(maisAntiga);
      URL.revokeObjectURL(urlAntiga);
    }
  } else if (url) {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------------------
// Entrada: o que a interface chama
// ---------------------------------------------------------------------------------------

/** Carrega o que ficou no aparelho (fotos de antes de fechar o app). Chamar uma vez ao abrir. */
export async function iniciarFila() {
  try {
    for (const r of (await values<Registro>(banco)) ?? []) registros.set(r.idLocal, r);
  } catch {
    /* IndexedDB indisponível (navegação privada antiga): a fila funciona só em memória */
  }
  carregada = true;
  notificar();
  window.addEventListener('online', acordar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && acordar());
  // Com sinal fraco o navegador continua "online" e o evento acima não vem. Mas qualquer
  // consulta que dá certo (abrir um serviço, voltar ao app, "Atualizar") prova que a conexão
  // voltou: acorda a fila na hora, em vez de esperar a próxima tentativa (até 5 min).
  clienteConsultas.getQueryCache().subscribe((evento) => {
    if (evento.type === 'updated' && evento.action.type === 'success' && semConexao) acordar();
  });
  void processar();
}

/** Quem está logado: só as fotos dessa pessoa são mostradas e enviadas. null pausa a fila. */
export function definirUsuarioDaFila(usuarioId: string | null) {
  if (usuarioAtual === usuarioId) return;
  usuarioAtual = usuarioId;
  notificar();
  if (usuarioId) {
    // pede ao navegador para não apagar a fila quando faltar espaço (o Safari apaga dados de
    // sites não usados por 7 dias; app instalado na tela inicial fica de fora disso)
    void navigator.storage?.persist?.().catch(() => undefined);
    void processar();
  }
}

export async function adicionarNaFila(entrada: {
  servicoId: string;
  chave: string | null;
  arquivo: File;
  posicao: Promise<Posicao | null>;
}) {
  if (!usuarioAtual) throw new Error('Entre de novo para tirar fotos.');
  // refazendo a foto de um item: a versão anterior que ainda não subiu sai da fila
  // (a que já está sendo enviada termina; a nova vai depois e prevalece no servidor)
  if (entrada.chave) {
    for (const r of registros.values()) {
      if (r.servicoId === entrada.servicoId && r.chave === entrada.chave && r.idLocal !== enviandoId) {
        await remover(r.idLocal);
      }
    }
  }
  const registro: Registro = {
    idLocal: crypto.randomUUID(),
    usuarioId: usuarioAtual,
    servicoId: entrada.servicoId,
    chave: entrada.chave,
    criadoEm: Date.now(),
    original: {
      dados: await entrada.arquivo.arrayBuffer(),
      tipo: entrada.arquivo.type,
      nome: entrada.arquivo.name,
      modificadoEm: entrada.arquivo.lastModified,
    },
    tentativas: 0,
    proximaTentativa: 0,
  };
  posicoes.set(registro.idLocal, entrada.posicao);
  try {
    await gravar(registro);
  } catch {
    throw new Error('Não há espaço no celular para guardar a foto. Libere espaço e tente de novo.');
  }
  notificar();
  void processar();
}

export async function tentarDeNovo(idLocal: string) {
  const r = registros.get(idLocal);
  if (!r) return;
  await gravar({ ...r, erro: undefined, tentativas: 0, proximaTentativa: 0 });
  notificar();
  void processar();
}

export async function descartar(idLocal: string) {
  if (idLocal === enviandoId) return; // já está subindo: não dá mais para desistir
  await remover(idLocal);
  notificar();
}

/** Conexão voltou ou app voltou para a tela: tenta agora, sem esperar o tempo agendado. */
function acordar() {
  for (const r of registros.values()) r.proximaTentativa = 0;
  void processar();
}

// ---------------------------------------------------------------------------------------
// Trabalhadores
// ---------------------------------------------------------------------------------------

function processar() {
  void prepararProximas();
  void enviarProximas();
}

let preparando = false;
async function prepararProximas() {
  if (preparando || !usuarioAtual) return;
  preparando = true;
  try {
    for (;;) {
      const r = ordenados().find((x) => x.usuarioId === usuarioAtual && x.original && !x.foto && !x.erro);
      if (!r || !r.original) break;
      try {
        const arquivo = new File([r.original.dados], r.original.nome, {
          type: r.original.tipo,
          lastModified: r.original.modificadoEm,
        });
        const [reduzida, metadados] = await Promise.all([
          reduzirFoto(arquivo),
          lerMetadados(arquivo, posicoes.get(r.idLocal) ?? Promise.resolve(null)),
        ]);
        // o técnico pode ter refeito ou descartado a foto enquanto ela era preparada
        if (!registros.has(r.idLocal)) continue;
        await gravar({
          ...r,
          original: undefined,
          foto: {
            dados: await reduzida.blob.arrayBuffer(),
            capturadaEm: metadados.capturadaEm.toISOString(),
            latitude: metadados.posicao?.latitude,
            longitude: metadados.posicao?.longitude,
          },
        });
      } catch (erro) {
        if (!registros.has(r.idLocal)) continue;
        await gravar({ ...r, erro: erro instanceof Error ? erro.message : 'Não foi possível preparar a foto. Tire outra.' });
      }
      notificar();
      void enviarProximas();
    }
  } finally {
    preparando = false;
  }
}

let enviando = false;
async function enviarProximas() {
  if (enviando || !usuarioAtual) return;
  enviando = true;
  try {
    for (;;) {
      const agora = Date.now();
      const r = ordenados().find(
        (x) => x.usuarioId === usuarioAtual && x.foto && !x.erro && x.proximaTentativa <= agora,
      );
      if (!r || !r.foto) break;
      const seguir = await enviarUma(r, r.foto);
      if (!seguir) break;
    }
  } finally {
    enviando = false;
    agendarProximaTentativa();
  }
}

/** Envia uma foto. Devolve false quando não adianta tentar as próximas agora (rede, sessão). */
async function enviarUma(r: Registro, foto: NonNullable<Registro['foto']>): Promise<boolean> {
  enviandoId = r.idLocal;
  notificar();
  try {
    const recebida = await enviarFoto(
      {
        servicoId: r.servicoId,
        chave: r.chave,
        idLocal: r.idLocal,
        blob: new Blob([foto.dados], { type: 'image/jpeg' }),
        capturadaEm: new Date(foto.capturadaEm),
        latitude: foto.latitude,
        longitude: foto.longitude,
      },
      AbortSignal.timeout(TEMPO_MAXIMO_DO_ENVIO),
    );
    semConexao = false;
    // um envio que deu certo prova que a conexão voltou: as fotos que esperavam a próxima
    // tentativa (algumas com espera de minutos) vão em seguida, sem esperar o tempo delas
    for (const x of registros.values()) x.proximaTentativa = 0;
    // primeiro o serviço atualizado chega, depois a foto sai da fila: sem piscar "falta a foto".
    // No máximo 5 s: com sinal ruim a consulta pode demorar, e a fila não pode ficar parada.
    await Promise.race([
      clienteConsultas.invalidateQueries({ queryKey: ['servico', r.servicoId] }),
      new Promise((resolver) => setTimeout(resolver, 5_000)),
    ]);
    await remover(r.idLocal, recebida.id);
    return true;
  } catch (erro) {
    const status = erro instanceof ErroApi ? erro.status : SEM_CONEXAO;
    if (status === 401) return false; // a sessão encerra e leva ao login; a foto fica na fila
    if (status === SEM_CONEXAO || status >= 500 || status === 408 || status === 429) {
      semConexao = status === SEM_CONEXAO;
      const tentativas = r.tentativas + 1;
      const espera = ESPERAS[Math.min(tentativas, ESPERAS.length) - 1];
      await gravar({ ...r, tentativas, proximaTentativa: Date.now() + espera });
      return false;
    }
    // recusa da API (ex.: serviço cancelado, item fora do checklist): não adianta repetir
    await gravar({ ...r, erro: erro instanceof ErroApi ? erro.message : 'Não foi possível enviar a foto.' });
    return true;
  } finally {
    enviandoId = null;
    notificar();
  }
}

function agendarProximaTentativa() {
  clearTimeout(temporizador);
  const esperando = [...registros.values()].filter((r) => r.usuarioId === usuarioAtual && r.foto && !r.erro);
  if (esperando.length === 0 || !usuarioAtual) return;
  const proxima = Math.min(...esperando.map((r) => r.proximaTentativa));
  temporizador = setTimeout(() => void enviarProximas(), Math.max(1_000, proxima - Date.now()));
}
