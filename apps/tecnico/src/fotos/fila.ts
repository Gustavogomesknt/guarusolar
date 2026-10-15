import { createStore, del, set, values } from 'idb-keyval';
import { CODIGO_VIDEO_NAO_RECEBIDO, STATUS_APP_DESATUALIZADO } from '@guarusolar/compartilhado';
import { acordarServidor, conexaoAtual, ErroApi, ouvirConexao, SEM_CONEXAO } from '@guarusolar/web/api';
import { clienteConsultas } from '@/lib/consultas';
import { enviarFoto } from './envio';
import { confirmarVideo, enviarAoBucket, pedirLinkDoVideo, tempoMaximoDoVideo } from './envioDeVideo';
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
 * 3. A fila NUNCA desiste por causa do servidor ou da rede: sem conexão, tempo esgotado, 502,
 *    503, 504 (servidor dormindo ou subindo na Render) e qualquer 5xx tentam de novo sozinhos,
 *    para sempre, com espera crescente (5 s, 15 s, 1 min e depois de 5 em 5 min). A foto só sai
 *    da fila quando a API confirma que recebeu, ou quando o técnico a descarta.
 *    Erro definitivo, com o motivo na tela, só para RECUSA de verdade da API (4xx: 400, 403,
 *    404, 409, 413, 422…). 401 não é erro da foto: a sessão encerra, o login diz o motivo e a
 *    fila continua quando o técnico entra de novo. 426 também não: é o APP que está antigo
 *    demais para a API (versaoDoAppDeCampo.ts); a foto fica, a faixa do topo pede para
 *    atualizar, e a versão nova envia a mesma foto (a fila mora no IndexedDB, fora do
 *    service worker, e sobrevive à atualização).
 *    Cada envio tem no máximo 120 s: em sinal fraco o navegador não dá erro, o pedido fica
 *    pendurado e a fila pararia atrás dele. Estourou, a foto vai para o FIM da fila (tenta de
 *    novo depois, sem erro) e a próxima tenta: uma foto pendurada nunca bloqueia as outras.
 * 4. Tenta de novo ao abrir o app, quando a conexão volta, quando o app volta para a tela e
 *    no tempo agendado. Não confia só no navigator.onLine, que mente com sinal fraco.
 * 5. Cada foto guarda quem a tirou e só é enviada com a sessão dessa pessoa.
 * 6. A API não duplica: cada envio leva o idLocal, e um reenvio devolve a foto já recebida.
 *
 * 7. VÍDEO (gravado no app, ~11 MB por minuto) entra nesta mesma fila, com as mesmas regras. Não
 *    tem preparo (já sai comprimido) e vai DIRETO ao bucket por link assinado (envioDeVideo.ts),
 *    sem passar pela API. Diferenças: o vídeo sobe numa FAIXA PRÓPRIA, em paralelo às fotos (em
 *    sinal ruim, 12 MB levam minutos, e a foto de 300 KB não pode esperar atrás deles; no teste
 *    a 40 KB/s, a foto esperava 100 s); um vídeo por vez; o tempo máximo de cada envio cresce com
 *    o tamanho (até 15 min); depois de o arquivo chegar ao bucket, a fila só repete o aviso à API,
 *    sem reenviar os megabytes. Um envio interrompido recomeça do zero (o bucket não retoma).
 *
 * Os dados ficam como ArrayBuffer, não Blob: guardar Blob no IndexedDB já falhou em versões
 * do Safari; ArrayBuffer funciona em todos.
 */

const banco = createStore('guarusolar-tecnico', 'fila-de-fotos');

/** Espera entre tentativas depois de falha de rede: 5 s, 15 s, 1 min e depois 5 min. */
const ESPERAS = [5_000, 15_000, 60_000, 300_000];
/** Só o envio da foto; a espera pelo servidor acordando (até 90 s) é contada à parte. */
const TEMPO_MAXIMO_DO_ENVIO = 120_000;

type Registro = {
  idLocal: string;
  usuarioId: string;
  servicoId: string;
  /** item do checklist; null = foto extra */
  chave: string | null;
  criadoEm: number;
  /** a foto como veio da câmera; sai depois do preparo */
  original?: { dados: ArrayBuffer; tipo: string; nome: string; modificadoEm: number };
  /** a foto pronta para envio (comprimida: reduzir.ts). `tipo` só existe quando a compressão
   *  falhou e o que vai é o arquivo original (sem `tipo` = JPEG) */
  foto?: { dados: ArrayBuffer; tipo?: string; capturadaEm: string; latitude?: number; longitude?: number };
  tentativas: number;
  proximaTentativa: number;
  /** o envio estourou o tempo: a foto foi para o fim da fila (ordena por aqui, não por criadoEm) */
  adiadaEm?: number;
  /** recusa definitiva (API ou preparo): precisa do técnico */
  erro?: string;
  /** VÍDEO gravado no app: vai direto ao bucket (sem `original` nem `foto`) */
  video?: { dados: ArrayBuffer; tipo: string; duracaoSegundos: number; gravadoEm: string; capa?: ArrayBuffer };
  /** o arquivo do vídeo já está no bucket: falta só a API confirmar (não reenvia os megabytes) */
  videoNoBucket?: boolean;
};

export type EstadoNaFila = 'preparando' | 'na_fila' | 'enviando' | 'erro';

export type FotoNaFila = {
  idLocal: string;
  /** foto ou vídeo (a tela de fotos ignora os vídeos e vice-versa) */
  midia: 'foto' | 'video';
  /** vídeo: tamanho e duração, para mostrar ao técnico */
  tamanhoBytes?: number;
  duracaoSegundos?: number;
  /** vídeo sendo enviado: quanto já subiu (0 a 1) */
  progresso?: number;
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
  /** a última tentativa falhou porque o CELULAR está sem internet (e nenhuma deu certo depois) */
  semConexao: boolean;
  /** a última tentativa falhou com internet: é o servidor (dormindo, subindo ou fora do ar) */
  aguardandoServidor: boolean;
  /** o último envio estourou o tempo (sinal fraco): a foto voltou para a fila e tenta de novo */
  conexaoLenta: boolean;
  /** a API recusou a versão deste app (426): as fotos esperam a atualização */
  appDesatualizado: boolean;
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
/** a foto e o vídeo que estão subindo agora (cada um na sua faixa) */
let enviandoId: string | null = null;
let enviandoVideoId: string | null = null;
const subindo = (idLocal: string) => idLocal === enviandoId || idLocal === enviandoVideoId;
let semConexao = false;
let aguardandoServidor = false;
let conexaoLenta = false;
let appDesatualizado = false;
let progressoDoEnvio: number | undefined;
let temporizador: ReturnType<typeof setTimeout> | undefined;

const ouvintes = new Set<() => void>();
let retrato: RetratoDaFila = { carregada: false, fotos: [], miniaturas: {}, semConexao: false, aguardandoServidor: false, conexaoLenta: false, appDesatualizado: false };

const ordenados = () => [...registros.values()].sort((a, b) => a.criadoEm - b.criadoEm);

function urlDe(r: Registro) {
  // vídeo: a miniatura é a capa (quando o aparelho conseguiu gerar)
  const imagem = r.foto ? new Blob([r.foto.dados], { type: r.foto.tipo ?? 'image/jpeg' }) : r.video?.capa ? new Blob([r.video.capa], { type: 'image/jpeg' }) : null;
  if (!imagem) return null;
  let url = urls.get(r.idLocal);
  if (!url) {
    url = URL.createObjectURL(imagem);
    urls.set(r.idLocal, url);
  }
  return url;
}

function notificar() {
  const fotos: FotoNaFila[] = ordenados()
    .filter((r) => r.usuarioId === usuarioAtual)
    .map((r) => ({
      idLocal: r.idLocal,
      midia: r.video ? ('video' as const) : ('foto' as const),
      servicoId: r.servicoId,
      chave: r.chave,
      estado: r.erro ? 'erro' : subindo(r.idLocal) ? 'enviando' : r.foto || r.video ? 'na_fila' : 'preparando',
      url: urlDe(r),
      preparada: Boolean(r.foto || r.video),
      erro: r.erro,
      ...(r.video
        ? {
            tamanhoBytes: r.video.dados.byteLength,
            duracaoSegundos: r.video.duracaoSegundos,
            progresso: r.idLocal === enviandoVideoId ? (r.videoNoBucket ? 1 : progressoDoEnvio) : undefined,
          }
        : {}),
    }));
  retrato = { carregada, fotos, miniaturas: Object.fromEntries(miniaturas), semConexao, aguardandoServidor, conexaoLenta, appDesatualizado };
  ouvintes.forEach((ouvir) => ouvir());
}

/**
 * Há alguma foto no aparelho (de qualquer usuário, preparando, na fila ou com erro)? null enquanto
 * a fila ainda não foi lida do IndexedDB: quem decide atualizar o app sozinho trata como "sim".
 */
export function filaTemAlgo(): boolean | null {
  return carregada ? registros.size > 0 : null;
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
    if (evento.type === 'updated' && evento.action.type === 'success' && (semConexao || aguardandoServidor || conexaoLenta)) acordar();
  });
  // o servidor acordou (ou a internet voltou e ele respondeu): as fotos vão agora
  ouvirConexao(() => {
    if (conexaoAtual().estado === 'conectado' && (semConexao || aguardandoServidor)) acordar();
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

/** Vídeo gravado no app: entra na fila já pronto (não há preparo). */
export async function adicionarVideoNaFila(entrada: {
  servicoId: string;
  arquivo: Blob;
  duracaoSegundos: number;
  capa: Blob | null;
}) {
  if (!usuarioAtual) throw new Error('Entre de novo para gravar vídeos.');
  const registro: Registro = {
    idLocal: crypto.randomUUID(),
    usuarioId: usuarioAtual,
    servicoId: entrada.servicoId,
    chave: null,
    criadoEm: Date.now(),
    video: {
      dados: await entrada.arquivo.arrayBuffer(),
      // o MediaRecorder informa "video/webm;codecs=vp8,opus": a API quer só o tipo
      tipo: entrada.arquivo.type.split(';')[0] || 'video/webm',
      duracaoSegundos: entrada.duracaoSegundos,
      gravadoEm: new Date().toISOString(),
      capa: entrada.capa ? await entrada.capa.arrayBuffer() : undefined,
    },
    tentativas: 0,
    proximaTentativa: 0,
  };
  try {
    await gravar(registro);
  } catch {
    throw new Error('Não há espaço no celular para guardar o vídeo. Libere espaço e tente de novo.');
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
  if (subindo(idLocal)) return; // já está subindo: não dá mais para desistir
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
  void enviarProximosVideos();
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
        // A compressão não pode custar a foto: se falhar por qualquer motivo (formato que o
        // navegador não abre, falta de memória no aparelho), vai o arquivo ORIGINAL.
        const [reduzida, metadados] = await Promise.all([
          reduzirFoto(arquivo).catch(() => null),
          lerMetadados(arquivo, posicoes.get(r.idLocal) ?? Promise.resolve(null)),
        ]);
        // o técnico pode ter refeito ou descartado a foto enquanto ela era preparada
        if (!registros.has(r.idLocal)) continue;
        await gravar({
          ...r,
          original: undefined,
          foto: {
            dados: reduzida ? await reduzida.blob.arrayBuffer() : r.original.dados,
            ...(reduzida ? {} : { tipo: r.original.tipo || 'image/jpeg' }),
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

/** Próxima da faixa: a ordem em que foram feitas; a que estourou o tempo vai para o fim. */
const proximaDaFaixa = (video: boolean) =>
  [...registros.values()]
    .filter((x) => x.usuarioId === usuarioAtual && (video ? x.video : x.foto) && !x.erro && x.proximaTentativa <= Date.now())
    .sort((a, b) => (a.adiadaEm ?? a.criadoEm) - (b.adiadaEm ?? b.criadoEm))[0];

let enviando = false;
async function enviarProximas() {
  if (enviando || !usuarioAtual) return;
  enviando = true;
  try {
    for (;;) {
      const r = proximaDaFaixa(false);
      if (!r) break;
      const seguir = await enviarUma(r);
      if (!seguir) break;
    }
  } finally {
    enviando = false;
    agendarProximaTentativa();
  }
}

/** A faixa dos vídeos: um por vez, em paralelo às fotos. */
let enviandoVideos = false;
async function enviarProximosVideos() {
  if (enviandoVideos || !usuarioAtual) return;
  enviandoVideos = true;
  try {
    for (;;) {
      const r = proximaDaFaixa(true);
      if (!r) break;
      const seguir = await enviarUma(r);
      if (!seguir) break;
    }
  } finally {
    enviandoVideos = false;
    agendarProximaTentativa();
  }
}

/**
 * Vídeo: link assinado, arquivo direto ao bucket e aviso à API. Depois que o arquivo chegou ao
 * bucket, a fila guarda isso (videoNoBucket) e uma nova tentativa só repete o aviso.
 */
async function enviarVideo(r: Registro, definirLimite: (limite: AbortSignal) => void) {
  const video = r.video!;
  if (!r.videoNoBucket) {
    const link = await pedirLinkDoVideo(r.servicoId, { idLocal: r.idLocal, tamanhoBytes: video.dados.byteLength, tipo: video.tipo });
    if ('jaRecebido' in link) return; // já tinha entrado (a resposta da confirmação se perdeu)
    const limite = AbortSignal.timeout(tempoMaximoDoVideo(video.dados.byteLength));
    definirLimite(limite);
    progressoDoEnvio = 0;
    let avisado = 0;
    await enviarAoBucket(link.url, new Blob([video.dados], { type: video.tipo }), limite, (fracao) => {
      progressoDoEnvio = fracao;
      // a tela acompanha o progresso sem redesenhar a cada pacote
      if (fracao - avisado >= 0.05 || fracao === 1) {
        avisado = fracao;
        notificar();
      }
    });
    r = { ...r, videoNoBucket: true };
    await gravar(r);
  }
  await confirmarVideo(r.servicoId, { idLocal: r.idLocal, tipo: video.tipo, duracaoSegundos: video.duracaoSegundos, gravadoEm: video.gravadoEm, capa: video.capa });
}

/** Envia uma foto ou um vídeo. Devolve false quando não adianta tentar as próximas agora (rede, sessão). */
async function enviarUma(r: Registro): Promise<boolean> {
  if (r.video) {
    enviandoVideoId = r.idLocal;
    progressoDoEnvio = undefined;
  } else {
    enviandoId = r.idLocal;
  }
  notificar();
  // o relógio dos 120 s só começa com o servidor de pé (a espera por ele tem o tempo dela)
  let limite: AbortSignal | undefined;
  try {
    await acordarServidor();
    let recebidaId: string | undefined;
    if (r.video) {
      await enviarVideo(r, (l) => (limite = l));
    } else {
      const foto = r.foto!;
      limite = AbortSignal.timeout(TEMPO_MAXIMO_DO_ENVIO);
      const recebida = await enviarFoto(
        {
          servicoId: r.servicoId,
          chave: r.chave,
          idLocal: r.idLocal,
          blob: new Blob([foto.dados], { type: foto.tipo ?? 'image/jpeg' }),
          capturadaEm: new Date(foto.capturadaEm),
          latitude: foto.latitude,
          longitude: foto.longitude,
        },
        limite,
      );
      recebidaId = recebida.id;
    }
    semConexao = false;
    aguardandoServidor = false;
    conexaoLenta = false;
    appDesatualizado = false;
    // um envio que deu certo prova que a conexão voltou: as fotos que esperavam a próxima
    // tentativa (algumas com espera de minutos) vão em seguida, sem esperar o tempo delas
    for (const x of registros.values()) x.proximaTentativa = 0;
    // primeiro o serviço atualizado chega, depois a foto sai da fila: sem piscar "falta a foto".
    // No máximo 5 s: com sinal ruim a consulta pode demorar, e a fila não pode ficar parada.
    await Promise.race([
      clienteConsultas.invalidateQueries({ queryKey: ['servico', r.servicoId] }),
      new Promise((resolver) => setTimeout(resolver, 5_000)),
    ]);
    await remover(r.idLocal, recebidaId);
    return true;
  } catch (erro) {
    const status = erro instanceof ErroApi ? erro.status : SEM_CONEXAO;
    if (status === 401) return false; // a sessão encerra e leva ao login; a foto fica na fila
    // vídeo que a API não achou no bucket (envio interrompido): manda o arquivo de novo, sem erro
    if (erro instanceof ErroApi && erro.codigo === CODIGO_VIDEO_NAO_RECEBIDO) {
      const atual = registros.get(r.idLocal) ?? r;
      await gravar({ ...atual, videoNoBucket: false, tentativas: atual.tentativas + 1, proximaTentativa: Date.now() + 5_000 });
      return true;
    }
    if (status === STATUS_APP_DESATUALIZADO) {
      // app antigo demais: a foto fica, sem erro, e tenta de novo depois (a versão nova é quem a
      // envia; a faixa do topo pede para atualizar). As outras também esperariam: para aqui.
      appDesatualizado = true;
      await gravar({ ...(registros.get(r.idLocal) ?? r), proximaTentativa: Date.now() + 60_000 });
      return false;
    }
    // recusa de verdade: a API recebeu o pedido e disse não (o motivo vai para a tela)
    const recusa = status >= 400 && status < 500 && status !== 408 && status !== 429;
    if (!recusa) {
      // rede, tempo esgotado, 502/503/504 e qualquer 5xx: a foto fica e tenta de novo, sempre
      const estourou = limite?.aborted === true;
      semConexao = !estourou && status === SEM_CONEXAO && navigator.onLine === false;
      conexaoLenta = estourou;
      aguardandoServidor = !estourou && !semConexao;
      const atual = registros.get(r.idLocal) ?? r;
      const tentativas = atual.tentativas + 1;
      const espera = ESPERAS[Math.min(tentativas, ESPERAS.length) - 1];
      await gravar({ ...atual, tentativas, proximaTentativa: Date.now() + espera, ...(estourou ? { adiadaEm: Date.now() } : {}) });
      // estourou o tempo: esta foi para o fim da fila e a próxima tenta agora; nos outros casos
      // (sem sinal, servidor fora) não adianta tentar as próximas
      return estourou;
    }
    // recusa da API (ex.: serviço cancelado, item fora do checklist): não adianta repetir
    await gravar({ ...(registros.get(r.idLocal) ?? r), erro: erro instanceof ErroApi ? erro.message : 'Não foi possível enviar a foto.' });
    return true;
  } finally {
    if (r.video) {
      enviandoVideoId = null;
      progressoDoEnvio = undefined;
    } else {
      enviandoId = null;
    }
    notificar();
  }
}

function agendarProximaTentativa() {
  clearTimeout(temporizador);
  const esperando = [...registros.values()].filter((r) => r.usuarioId === usuarioAtual && (r.foto || r.video) && !r.erro);
  if (esperando.length === 0 || !usuarioAtual) return;
  const proxima = Math.min(...esperando.map((r) => r.proximaTentativa));
  temporizador = setTimeout(() => {
    void enviarProximas();
    void enviarProximosVideos();
  }, Math.max(1_000, proxima - Date.now()));
}
