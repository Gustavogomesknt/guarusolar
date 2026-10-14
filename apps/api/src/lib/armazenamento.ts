import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { caminhoDaFoto, PASTA_DAS_SUBSTITUIDAS, type DestinoDaFoto } from './nomesDeArquivo';
import {
  ArmazenamentoIndisponivel,
  ArquivoNaoEncontrado,
  apagarDoSharepoint,
  avisoDeValidadeDoSegredo,
  baixarDoSharepoint,
  enviarAoSharepoint,
  miniaturaDoSharepoint,
  moverNoSharepoint,
  variaveisFaltando,
} from './sharepoint';
import {
  apagarDoSupabase,
  ArmazenamentoCheio,
  baixarDoSupabase,
  conferirBucketPrivado,
  enviarAoSupabase,
  moverNoSupabase,
  usoDoStorage,
  variaveisDoSupabaseFaltando,
  type UsoDoStorage,
} from './supabaseStorage';
import { apagarDoS3, avisoDeRegiaoDoS3, baixarDoS3, conferirBucketDoS3, enviarAoS3, moverNoS3, servicoDoS3, usoDoS3, variaveisDoS3Faltando } from './s3';

export { ArmazenamentoCheio, ArmazenamentoIndisponivel, ArquivoNaoEncontrado };
export type { DestinoDaFoto };

/**
 * Camada de armazenamento das fotos. Quatro destinos:
 *
 * - "disco" (padrão, desenvolvimento): pasta STORAGE_DIR (uploads/). Chave = caminho relativo.
 * - "supabase": bucket PRIVADO do Supabase Storage (lib/supabaseStorage.ts), cerca de 1 GB no
 *   plano gratuito. Chave = "sb:<caminho no bucket>".
 * - "s3": bucket PRIVADO de qualquer serviço compatível com S3 (lib/s3.ts): Backblaze B2 (o
 *   escolhido, 10 GB gratuitos), Cloudflare R2 e outros; o endereço e a região vêm de variável.
 *   Chave = "s3:<caminho no bucket>", com os mesmos caminhos do Supabase. "r2" é APELIDO: como
 *   STORAGE_PROVIDER vale o mesmo que "s3", e chave "r2:<caminho>" é lida do mesmo bucket.
 * - "sharepoint" (FORA DE ESCOPO, mantido no código): biblioteca do SharePoint pelo Microsoft
 *   Graph (lib/sharepoint.ts). EXIGE TENANT CORPORATIVO da Microsoft (Entra ID + SharePoint);
 *   o cliente usa conta pessoal, que não tem nenhum dos dois. Chave = "sp:<id do arquivo>".
 *
 * STORAGE_PROVIDER escolhe onde as fotos NOVAS são gravadas. A leitura segue a chave, então
 * fotos de um destino continuam abrindo depois de trocar para outro, desde que o antigo
 * continue configurado. `npm run fotos:migrar` leva as fotos antigas para o destino atual.
 *
 * O banco guarda só a chave, nunca uma URL: as fotos saem pela rota autenticada /api/fotos/:id.
 */

export type ArquivoSalvo = { chave: string; nome: string; tamanhoBytes: number };
export type ArquivoLido = { dados: Buffer; tipo: string };

const PREFIXO_SHAREPOINT = 'sp:';
const PREFIXO_SUPABASE = 'sb:';
const PREFIXO_S3 = 's3:';
/** Apelido de "s3:" (o provedor nasceu com o nome r2): só para LER; nada novo é gravado assim. */
const PREFIXO_R2 = 'r2:';
const LADO_DA_MINIATURA = 480;
const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export type Destino = 'disco' | 'sharepoint' | 'supabase' | 's3';
export const destinoAtual = (): Destino => {
  // maiúsculas e aspas digitadas no painel da hospedagem não mudam o destino
  const valor = provedorDeclarado();
  if (valor === 'r2') return 's3'; // apelido
  return valor === 'sharepoint' || valor === 'supabase' || valor === 's3' ? valor : 'disco';
};

/** Em qual destino está guardado o arquivo desta chave. */
export const destinoDaChave = (chave: string): Destino =>
  chave.startsWith(PREFIXO_SHAREPOINT)
    ? 'sharepoint'
    : chave.startsWith(PREFIXO_SUPABASE)
      ? 'supabase'
      : chave.startsWith(PREFIXO_S3) || chave.startsWith(PREFIXO_R2)
        ? 's3'
        : 'disco';

/**
 * Os dois destinos que são "bucket" (Supabase Storage e o compatível com S3) guardam os arquivos com os
 * MESMOS caminhos e as mesmas regras (miniatura guardada, pasta "substituidas"); só muda quem
 * recebe a chamada. Tudo o que vale para um vale para o outro por aqui.
 */
type Bucket = {
  /** Prefixo das chaves novas. */
  prefixo: string;
  /** Outros prefixos lidos como deste bucket. */
  apelidos?: string[];
  enviar: (caminho: string, dados: Buffer, tipo: string, opcoes?: { conferir?: boolean }) => Promise<void>;
  baixar: (caminho: string) => Promise<Buffer>;
  mover: (de: string, para: string) => Promise<void>;
  apagar: (caminhos: string[]) => Promise<void>;
};
const BUCKETS: Record<'supabase' | 's3', Bucket> = {
  supabase: { prefixo: PREFIXO_SUPABASE, enviar: enviarAoSupabase, baixar: baixarDoSupabase, mover: moverNoSupabase, apagar: apagarDoSupabase },
  s3: { prefixo: PREFIXO_S3, apelidos: [PREFIXO_R2], enviar: enviarAoS3, baixar: baixarDoS3, mover: moverNoS3, apagar: apagarDoS3 },
};
const bucketAtual = (): Bucket | null => {
  const destino = destinoAtual();
  return destino === 'supabase' || destino === 's3' ? BUCKETS[destino] : null;
};
/** O bucket onde está o arquivo desta chave e o caminho dele lá dentro; null se não é de bucket. */
function noBucket(chave: string): { bucket: Bucket; caminho: string } | null {
  for (const bucket of Object.values(BUCKETS)) {
    const prefixo = [bucket.prefixo, ...(bucket.apelidos ?? [])].find((p) => chave.startsWith(p));
    if (prefixo) return { bucket, caminho: chave.slice(prefixo.length) };
  }
  return null;
}

const provedorDeclarado = () => process.env.STORAGE_PROVIDER?.trim().replace(/^["']|["']$/g, '').toLowerCase();

/**
 * O que falta na configuração do destino escolhido, ou null se está tudo no lugar. Nome de
 * provedor que não existe e destino sem as variáveis dele NÃO derrubam a API: ela sobe em modo
 * degradado (não recebe fotos) e avisa. Ver conferirArmazenamentoAoIniciar.
 */
export function configuracaoIncompleta(): string | null {
  const valor = provedorDeclarado();
  if (valor && valor !== 'disco' && valor !== 'sharepoint' && valor !== 'supabase' && valor !== 's3' && valor !== 'r2') {
    return `STORAGE_PROVIDER="${valor}" não existe (use "s3" ou "supabase"; em desenvolvimento, "disco").`;
  }
  if (destinoAtual() === 's3') {
    const faltam = variaveisDoS3Faltando();
    if (faltam.length) return `STORAGE_PROVIDER=${valor}, mas faltam: ${faltam.join(', ')}.`;
  }
  if (destinoAtual() === 'supabase') {
    const faltam = variaveisDoSupabaseFaltando();
    if (faltam.length) return `STORAGE_PROVIDER=supabase, mas faltam: ${faltam.join(', ')}.`;
  }
  if (destinoAtual() === 'sharepoint') {
    const faltam = variaveisFaltando();
    if (faltam.length) return `STORAGE_PROVIDER=sharepoint, mas faltam: ${faltam.join(', ')}.`;
  }
  return null;
}

/**
 * Confere o armazenamento ao subir a API. NUNCA encerra o processo: no plano gratuito da Render
 * o serviço é derrubado por inatividade e sobe de novo a cada primeiro acesso, sem publicação
 * nenhuma; se uma variável faltasse nessa hora e a API se recusasse a subir, o SISTEMA INTEIRO
 * (orçamentos, agenda, tudo) ficaria fora do ar por causa das fotos. Com a configuração errada
 * ou incompleta ela sobe em MODO DEGRADADO: grita no log (agora e a cada hora), /saude mostra
 * "recebendo": false, o escritório mostra a faixa vermelha e o envio de foto é recusado com o
 * motivo (503: a fila do celular guarda e reenvia). Nenhuma foto se perde.
 *
 * `lerMarcaDoBanco`: a marca de produção do banco (db:marcar-producao). Com destino "disco", ela é
 * lida agora e a cada 5 minutos: banco de produção + disco = modo degradado, MESMO sem
 * NODE_ENV=production (a API rodando num PC, ligada no banco de produção, gravaria a foto no
 * disco do PC e a chave no banco de produção; a produção nunca a acharia).
 */
export function conferirArmazenamentoAoIniciar(lerMarcaDoBanco: () => Promise<boolean>) {
  const local = process.env.NODE_ENV !== 'production';
  const gritar = () => {
    if (appTecnicoLiberado()) return;
    console.error(
      [
        '',
        '################################################################################',
        '##  [armazenamento] AS FOTOS NÃO ESTÃO SENDO ARMAZENADAS                      ##',
        '################################################################################',
        `  ${motivoDoBloqueio()}`,
        '  A API está no ar em MODO DEGRADADO: tudo funciona, menos o envio de fotos, que é RECUSADO (503).',
        ...(local && bancoDeProducaoMarcado
          ? [
              '  Esta API está ligada no banco de PRODUÇÃO. Ou ligue-a num banco de desenvolvimento, ou defina',
              '  STORAGE_PROVIDER=s3 com as cinco S3_* nesta janela. Confira em /saude: "recebendo":true.',
            ]
          : [
              '  Corrija na hospedagem (Render › Environment): STORAGE_PROVIDER=s3, com S3_ENDPOINT, S3_REGION,',
              '  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e S3_BUCKET (ou STORAGE_PROVIDER=supabase, com SUPABASE_URL,',
              '  SUPABASE_SERVICE_KEY e SUPABASE_BUCKET), e publique de novo. Confira em /saude: "recebendo":true.',
            ]),
        '################################################################################',
        '',
      ].join('\n'),
    );
  };

  // a marca só decide alguma coisa com destino disco (sem disco persistente declarado)
  const marcaDecide = destinoAtual() === 'disco' && !discoPersistente() && configuracaoIncompleta() === null;
  if (marcaDecide) {
    const lerMarca = () =>
      lerMarcaDoBanco().then(
        (marcado) => {
          if (bancoDeProducaoMarcado !== null && marcado !== bancoDeProducaoMarcado) {
            console.warn(`[armazenamento] a marca de produção do banco mudou (agora: ${marcado ? 'produção' : 'sem marca'}).`);
            bancoDeProducaoMarcado = marcado;
            gritar();
          }
          bancoDeProducaoMarcado = marcado;
        },
        // banco fora do ar: continua como estava (null = disco não recebe até a marca ser lida)
        () => undefined,
      );
    void lerMarca().then(() => {
      gritar();
      setInterval(gritar, 60 * 60 * 1000).unref();
    });
    setInterval(() => void lerMarca(), 5 * 60 * 1000).unref();
    return;
  }
  if (!appTecnicoLiberado()) {
    gritar();
    setInterval(gritar, 60 * 60 * 1000).unref();
    return;
  }
  if (destinoAtual() === 'supabase') {
    // Confere o bucket e o espaço e deixa no log. Bucket público não derruba o servidor, mas
    // nenhuma foto é gravada nele (conferirBucketPrivado ao gravar).
    const conferir = async () => {
      try {
        await conferirBucketPrivado(true);
        const uso = await usoDoStorage(true);
        const espaco = uso ? `${(uso.fracao * 100).toFixed(1)}% de ${(uso.limiteBytes / 1024 / 1024).toFixed(0)} MB em uso` : 'uso não medido';
        console[uso && uso.nivel !== 'ok' ? 'warn' : 'log'](`[armazenamento] Supabase Storage: bucket privado conferido; ${espaco}.`);
      } catch (erro) {
        console.error(`[armazenamento] Supabase Storage: ${(erro as Error).message}`);
      }
    };
    void conferir();
    setInterval(() => void conferir(), 24 * 60 * 60 * 1000).unref();
    return;
  }
  if (destinoAtual() === 's3') {
    // Confere a região, as chaves e o bucket e deixa o espaço no log. Falha aqui não derruba o servidor.
    const conferir = async () => {
      try {
        const regiaoErrada = avisoDeRegiaoDoS3();
        if (regiaoErrada) console.error(`[armazenamento] ${servicoDoS3()}: ${regiaoErrada}`);
        await conferirBucketDoS3();
        const uso = await usoDoS3(true);
        const espaco = uso ? `${(uso.fracao * 100).toFixed(1)}% de ${(uso.limiteBytes / 1024 / 1024).toFixed(0)} MB em uso` : 'uso não medido';
        console[uso && uso.nivel !== 'ok' ? 'warn' : 'log'](`[armazenamento] ${servicoDoS3()}: bucket conferido; ${espaco}.`);
      } catch (erro) {
        console.error(`[armazenamento] ${servicoDoS3()}: ${(erro as Error).message}`);
      }
    };
    void conferir();
    setInterval(() => void conferir(), 24 * 60 * 60 * 1000).unref();
    return;
  }
  if (destinoAtual() !== 'sharepoint') return;
  const avisar = () => {
    const aviso = avisoDeValidadeDoSegredo();
    if (aviso) console.warn(`[armazenamento] ${aviso}`);
  };
  avisar();
  setInterval(avisar, 24 * 60 * 60 * 1000).unref(); // e todo dia, com a API no ar
}

/**
 * Espaço do destino atual, para o aviso de 70% do escritório. Só os buckets têm teto a medir
 * (SUPABASE_STORAGE_LIMITE_MB e S3_STORAGE_LIMITE_MB); disco e SharePoint devolvem null.
 */
export const usoDoDestinoAtual = (): Promise<UsoDoStorage | null> =>
  // em modo degradado (faltam variáveis) não há o que medir: quem avisa é a faixa vermelha
  configuracaoIncompleta() !== null ? Promise.resolve(null) : destinoAtual() === 'supabase' ? usoDoStorage() : destinoAtual() === 's3' ? usoDoS3() : Promise.resolve(null);

/**
 * As fotos sobrevivem a uma publicação? No Supabase Storage, no bucket S3 (e no SharePoint), sim. No disco, só
 * se ele for persistente (FOTOS_EM_DISCO_PERSISTENTE=sim; na Render, só plano pago com disco): o
 * disco comum do servidor é apagado a cada publicação, reinício e sono. Em produção sem isso, a
 * API NÃO RECEBE FOTOS (melhor não receber do que perder), e só isso: o login e a agenda do app
 * de campo funcionam.
 *
 * "Produção" aqui é NODE_ENV=production OU o banco com a marca de produção: a API rodando num
 * PC (sem NODE_ENV) e ligada no banco de produção também não grava foto em disco. Fora disso, o
 * disco só recebe depois de a marca ser lida e dar "sem marca" (ver conferirArmazenamentoAoIniciar).
 *
 * Isto NADA tem a ver com o técnico ter ou não serviço agendado. Até 09/10/2026 esta condição
 * barrava o LOGIN do técnico com "O app dos técnicos ainda não foi liberado. Fale com o gestor
 * para combinar os serviços", texto que mandava procurar o problema na agenda, e não na
 * variável STORAGE_PROVIDER da hospedagem, onde ele estava.
 */
export const appTecnicoLiberado = () =>
  // destino escolhido sem as variáveis dele (ou nome que não existe): não há onde gravar
  configuracaoIncompleta() === null &&
  (destinoAtual() !== 'disco' ||
    discoPersistente() ||
    (process.env.NODE_ENV !== 'production' && bancoDeProducaoMarcado === false));

const discoPersistente = () => process.env.FOTOS_EM_DISCO_PERSISTENTE?.trim() === 'sim';

/**
 * Marca de produção do banco, lida por conferirArmazenamentoAoIniciar (só com destino disco).
 * null = ainda não lida (API subindo, ou banco fora do ar): disco não recebe foto até ser lida.
 */
let bancoDeProducaoMarcado: boolean | null = null;

/** Por que as fotos estão recusadas (para o log do modo degradado). */
function motivoDoBloqueio() {
  const incompleta = configuracaoIncompleta();
  if (incompleta) return incompleta;
  const declarado = `STORAGE_PROVIDER="${process.env.STORAGE_PROVIDER ?? '(sem valor)'}" (destino: ${destinoAtual()})`;
  if (process.env.NODE_ENV === 'production') return `NODE_ENV=production e ${declarado}: o disco deste servidor é apagado a cada publicação.`;
  if (bancoDeProducaoMarcado) {
    return `o banco tem a marca de PRODUÇÃO e ${declarado}: a foto ficaria no disco deste computador e a chave no banco de produção, que nunca a acharia.`;
  }
  return `${declarado}: não deu para ler a marca do banco (produção ou não); disco só recebe depois. Nova tentativa a cada 5 minutos.`;
}

/** Para o técnico (tela do serviço e fila de fotos): o motivo de verdade, e a quem avisar. */
export const AVISO_FOTOS_BLOQUEADAS =
  'O servidor ainda não está pronto para receber fotos: falta configurar onde elas ficam guardadas. Avise o escritório. As fotos que você tirar ficam guardadas no celular e sobem sozinhas quando isso for resolvido.';

// ------------------------------------------------------------------------------------------
// Disco
// ------------------------------------------------------------------------------------------

const pastaBase = () => path.resolve(process.env.STORAGE_DIR ?? 'uploads');

/** Caminho no disco de uma chave, sem deixar sair da pasta base (ex.: chave com "../"). */
function caminhoDa(chave: string, raiz = pastaBase()) {
  const completo = path.resolve(raiz, chave);
  if (!completo.startsWith(raiz + path.sep)) throw new Error(`Chave de arquivo inválida: ${chave}`);
  return completo;
}

async function lerDoDisco(chave: string): Promise<Buffer> {
  try {
    return await readFile(caminhoDa(chave));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') throw new ArquivoNaoEncontrado(`Arquivo não encontrado: ${chave}`);
    throw erro;
  }
}

// ------------------------------------------------------------------------------------------
// Buckets (Supabase Storage e S3): caminhos (só ASCII: o Supabase recusa acento no nome do objeto)
// ------------------------------------------------------------------------------------------

const PASTA_SUBSTITUIDAS_NO_BUCKET = 'substituidas';

/** PRJ-2026-0015/<serviço>/01-20260929T170207123.jpg; o mesmo instante dá o mesmo nome (reenvio substitui). */
function caminhoNoBucket(destino: DestinoDaFoto, extensao: string) {
  const quando = destino.capturadaEm.toISOString().replace(/[-:.Z]/g, '');
  const item = destino.item ? String(destino.item.ordem + 1).padStart(2, '0') : 'extra';
  return `${destino.projetoCodigo}/${destino.servico.id}/${item}-${quando}${extensao}`;
}
const miniaturaNoBucket = (caminho: string) => `miniaturas/${caminho.replace(/\.[^./]+$/, '')}.jpg`;

// ------------------------------------------------------------------------------------------
// Operações
// ------------------------------------------------------------------------------------------

export async function salvarFoto(dados: Buffer, destino: DestinoDaFoto): Promise<ArquivoSalvo> {
  const tipo = TIPOS[destino.extensao.toLowerCase()] ?? 'image/jpeg';
  if (destinoAtual() === 'sharepoint') {
    const segmentos = caminhoDaFoto(destino);
    const id = await enviarAoSharepoint(segmentos, dados, tipo);
    return { chave: `${PREFIXO_SHAREPOINT}${id}`, nome: segmentos.at(-1)!, tamanhoBytes: dados.length };
  }
  const extensao = TIPOS[destino.extensao.toLowerCase()] ? destino.extensao.toLowerCase() : '.jpg';
  const bucket = bucketAtual();
  if (bucket) {
    const caminho = caminhoNoBucket(destino, extensao);
    await bucket.enviar(caminho, dados, tipo);
    return { chave: `${bucket.prefixo}${caminho}`, nome: path.posix.basename(caminho), tamanhoBytes: dados.length };
  }
  const nome = `${randomUUID()}${extensao}`;
  const chave = `${destino.projetoCodigo}/${destino.servico.id}/${nome}`;
  const arquivo = caminhoDa(chave);
  await mkdir(path.dirname(arquivo), { recursive: true });
  await writeFile(arquivo, dados);
  return { chave, nome, tamanhoBytes: dados.length };
}

/** O arquivo original. ArquivoNaoEncontrado se não existir; ArmazenamentoIndisponivel se o SharePoint falhar. */
export async function lerArquivo(chave: string): Promise<ArquivoLido> {
  if (chave.startsWith(PREFIXO_SHAREPOINT)) {
    return { dados: await baixarDoSharepoint(chave.slice(PREFIXO_SHAREPOINT.length)), tipo: 'image/jpeg' };
  }
  const guardado = noBucket(chave);
  if (guardado) {
    return { dados: await guardado.bucket.baixar(guardado.caminho), tipo: TIPOS[path.extname(guardado.caminho).toLowerCase()] ?? 'image/jpeg' };
  }
  return { dados: await lerDoDisco(chave), tipo: TIPOS[path.extname(chave).toLowerCase()] ?? 'application/octet-stream' };
}

const reduzir = (dados: Buffer) =>
  sharp(dados)
    .rotate() // respeita a orientação do EXIF
    .resize(LADO_DA_MINIATURA, LADO_DA_MINIATURA, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();

/**
 * Miniatura em JPEG (lado maior de 480 px). No SharePoint, a que ele mesmo gera (se ainda não
 * existir, logo após o envio, reduz o original). No disco, gerada uma vez e guardada em
 * .miniaturas/. Lança erro do sharp se a imagem não abrir.
 */
export async function lerMiniatura(chave: string): Promise<ArquivoLido> {
  if (chave.startsWith(PREFIXO_SHAREPOINT)) {
    const pronta = await miniaturaDoSharepoint(chave.slice(PREFIXO_SHAREPOINT.length));
    return { dados: pronta ?? (await reduzir((await lerArquivo(chave)).dados)), tipo: 'image/jpeg' };
  }
  const guardado = noBucket(chave);
  if (guardado) {
    // gerada uma vez e guardada no bucket (nem o Supabase gratuito nem os buckets S3 reduzem imagens)
    const miniatura = miniaturaNoBucket(guardado.caminho);
    try {
      return { dados: await guardado.bucket.baixar(miniatura), tipo: 'image/jpeg' };
    } catch (erro) {
      if (!(erro instanceof ArquivoNaoEncontrado)) throw erro;
    }
    const dados = await reduzir((await lerArquivo(chave)).dados);
    // se não der para guardar, a miniatura sai do mesmo jeito (e é refeita no próximo pedido)
    await guardado.bucket.enviar(miniatura, dados, 'image/jpeg', { conferir: false }).catch((erro) =>
      console.warn(`[armazenamento] miniatura não guardada (${miniatura}): ${(erro as Error).message}`),
    );
    return { dados, tipo: 'image/jpeg' };
  }
  const guardada = caminhoDa(chave, path.join(pastaBase(), '.miniaturas'));
  try {
    return { dados: await readFile(guardada), tipo: 'image/jpeg' };
  } catch {
    const dados = await reduzir(await lerDoDisco(chave));
    await mkdir(path.dirname(guardada), { recursive: true });
    await writeFile(guardada, dados);
    return { dados, tipo: 'image/jpeg' };
  }
}

/**
 * Foto refeita: o arquivo antigo vai para a pasta "Substituídas" ao lado dele (nada é apagado).
 * Quem chama não deve falhar por isso: a foto nova já está gravada.
 */
export async function guardarComoSubstituida(chave: string) {
  if (chave.startsWith(PREFIXO_SHAREPOINT)) {
    await moverNoSharepoint(chave.slice(PREFIXO_SHAREPOINT.length), PASTA_DAS_SUBSTITUIDAS);
    return;
  }
  const guardado = noBucket(chave);
  if (guardado) {
    const { bucket, caminho } = guardado;
    await bucket.mover(caminho, `${path.posix.dirname(caminho)}/${PASTA_SUBSTITUIDAS_NO_BUCKET}/${path.posix.basename(caminho)}`);
    // a miniatura da foto antiga só ocupa espaço
    await bucket.apagar([miniaturaNoBucket(caminho)]).catch(() => undefined);
    return;
  }
  const atual = caminhoDa(chave);
  const destino = path.join(path.dirname(atual), PASTA_DAS_SUBSTITUIDAS, path.basename(atual));
  await mkdir(path.dirname(destino), { recursive: true });
  await rename(atual, destino);
}

/**
 * Apaga o arquivo de uma chave (e a miniatura guardada). Só para a migração entre destinos
 * (scripts/migrar-fotos.ts), depois de a cópia no destino novo ter sido conferida.
 */
export async function apagarArquivo(chave: string) {
  if (chave.startsWith(PREFIXO_SHAREPOINT)) return apagarDoSharepoint(chave.slice(PREFIXO_SHAREPOINT.length));
  const guardado = noBucket(chave);
  if (guardado) return guardado.bucket.apagar([guardado.caminho, miniaturaNoBucket(guardado.caminho)]);
  await unlink(caminhoDa(chave));
  await unlink(caminhoDa(chave, path.join(pastaBase(), '.miniaturas'))).catch(() => undefined);
}

/**
 * Migração de um bucket para outro (Supabase Storage -> S3): grava no destino atual com o MESMO
 * caminho da origem, de modo que a chave só troca de prefixo ("sb:…" vira "s3:…"). Gravar de
 * novo o mesmo caminho substitui o arquivo: rodar a migração duas vezes não duplica nada.
 * null quando a origem ou o destino atual não é bucket (aí a migração usa salvarFoto).
 */
export async function copiarParaOBucketAtual(chaveDeOrigem: string, dados: Buffer, tipo: string): Promise<ArquivoSalvo | null> {
  const origem = noBucket(chaveDeOrigem);
  const destino = bucketAtual();
  if (!origem || !destino || origem.bucket === destino) return null;
  await destino.enviar(origem.caminho, dados, tipo);
  return { chave: `${destino.prefixo}${origem.caminho}`, nome: path.posix.basename(origem.caminho), tamanhoBytes: dados.length };
}
