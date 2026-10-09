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
} from './supabaseStorage';

export { ArmazenamentoCheio, ArmazenamentoIndisponivel, ArquivoNaoEncontrado };
export type { DestinoDaFoto };

/**
 * Camada de armazenamento das fotos. Três destinos:
 *
 * - "disco" (padrão, desenvolvimento): pasta STORAGE_DIR (uploads/). Chave = caminho relativo.
 * - "supabase" (produção, destino DEFINITIVO): bucket PRIVADO do Supabase Storage
 *   (lib/supabaseStorage.ts). Chave = "sb:<caminho no bucket>".
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
const LADO_DA_MINIATURA = 480;
const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export type Destino = 'disco' | 'sharepoint' | 'supabase';
export const destinoAtual = (): Destino => {
  // maiúsculas e aspas digitadas no painel da hospedagem não mudam o destino
  const valor = process.env.STORAGE_PROVIDER?.trim().replace(/^["']|["']$/g, '').toLowerCase();
  return valor === 'sharepoint' || valor === 'supabase' ? valor : 'disco';
};

/** Em qual destino está guardado o arquivo desta chave. */
export const destinoDaChave = (chave: string): Destino =>
  chave.startsWith(PREFIXO_SHAREPOINT) ? 'sharepoint' : chave.startsWith(PREFIXO_SUPABASE) ? 'supabase' : 'disco';

/**
 * Confere a configuração ao subir a API: STORAGE_PROVIDER desconhecido ou SharePoint sem as
 * variáveis param o servidor com a mensagem (melhor que falhar no primeiro upload em campo).
 */
export function conferirArmazenamentoAoIniciar() {
  const valor = process.env.STORAGE_PROVIDER?.trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (valor && valor !== 'disco' && valor !== 'sharepoint' && valor !== 'supabase') {
    throw new Error(`STORAGE_PROVIDER="${valor}" não existe. Use "disco", "sharepoint" ou "supabase".`);
  }
  if (!appTecnicoLiberado()) {
    console.warn('[armazenamento] ATENÇÃO: produção sem armazenamento persistente de fotos (STORAGE_PROVIDER não é "supabase"). O app de campo abre, mas a API NÃO RECEBE FOTOS até configurar o Supabase Storage. /saude mostra "fotos".');
  }
  if (destinoAtual() === 'supabase') {
    const faltam = variaveisDoSupabaseFaltando();
    if (faltam.length) throw new Error(`STORAGE_PROVIDER=supabase, mas faltam: ${faltam.join(', ')}`);
    // Sem travar a subida da API: confere o bucket e o espaço e deixa no log. Bucket público
    // não derruba o servidor, mas nenhuma foto é gravada nele (conferirBucketPrivado ao gravar).
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
  if (destinoAtual() !== 'sharepoint') return;
  const faltando = variaveisFaltando();
  if (faltando.length) throw new Error(`STORAGE_PROVIDER=sharepoint, mas faltam: ${faltando.join(', ')}`);
  const avisar = () => {
    const aviso = avisoDeValidadeDoSegredo();
    if (aviso) console.warn(`[armazenamento] ${aviso}`);
  };
  avisar();
  setInterval(avisar, 24 * 60 * 60 * 1000).unref(); // e todo dia, com a API no ar
}

/**
 * As fotos sobrevivem a uma publicação? No Supabase Storage (e no SharePoint), sim. No disco, só
 * se ele for persistente (FOTOS_EM_DISCO_PERSISTENTE=sim; na Render, só plano pago com disco): o
 * disco comum do servidor é apagado a cada publicação, reinício e sono. Em produção sem isso, a
 * API NÃO RECEBE FOTOS (melhor não receber do que perder), e só isso: o login e a agenda do app
 * de campo funcionam. Fora de produção, sempre liberado.
 *
 * Isto NADA tem a ver com o técnico ter ou não serviço agendado. Até 09/10/2026 esta condição
 * barrava o LOGIN do técnico com "O app dos técnicos ainda não foi liberado. Fale com o gestor
 * para combinar os serviços", texto que mandava procurar o problema na agenda, e não na
 * variável STORAGE_PROVIDER da hospedagem, onde ele estava.
 */
export const appTecnicoLiberado = () =>
  process.env.NODE_ENV !== 'production' ||
  destinoAtual() === 'sharepoint' ||
  destinoAtual() === 'supabase' ||
  process.env.FOTOS_EM_DISCO_PERSISTENTE?.trim() === 'sim';

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
// Supabase Storage: caminhos (só ASCII: o Storage recusa acento no nome do objeto)
// ------------------------------------------------------------------------------------------

const PASTA_SUBSTITUIDAS_NO_SUPABASE = 'substituidas';

/** PRJ-2026-0015/<serviço>/01-20260929T170207123.jpg; o mesmo instante dá o mesmo nome (reenvio substitui). */
function caminhoNoSupabase(destino: DestinoDaFoto, extensao: string) {
  const quando = destino.capturadaEm.toISOString().replace(/[-:.Z]/g, '');
  const item = destino.item ? String(destino.item.ordem + 1).padStart(2, '0') : 'extra';
  return `${destino.projetoCodigo}/${destino.servico.id}/${item}-${quando}${extensao}`;
}
const miniaturaNoSupabase = (caminho: string) => `miniaturas/${caminho.replace(/\.[^./]+$/, '')}.jpg`;

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
  if (destinoAtual() === 'supabase') {
    const caminho = caminhoNoSupabase(destino, extensao);
    await enviarAoSupabase(caminho, dados, tipo);
    return { chave: `${PREFIXO_SUPABASE}${caminho}`, nome: path.posix.basename(caminho), tamanhoBytes: dados.length };
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
  if (chave.startsWith(PREFIXO_SUPABASE)) {
    const caminho = chave.slice(PREFIXO_SUPABASE.length);
    return { dados: await baixarDoSupabase(caminho), tipo: TIPOS[path.extname(caminho).toLowerCase()] ?? 'image/jpeg' };
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
  if (chave.startsWith(PREFIXO_SUPABASE)) {
    // gerada uma vez e guardada no bucket (o Supabase gratuito não reduz imagens)
    const miniatura = miniaturaNoSupabase(chave.slice(PREFIXO_SUPABASE.length));
    try {
      return { dados: await baixarDoSupabase(miniatura), tipo: 'image/jpeg' };
    } catch (erro) {
      if (!(erro instanceof ArquivoNaoEncontrado)) throw erro;
    }
    const dados = await reduzir((await lerArquivo(chave)).dados);
    // se não der para guardar, a miniatura sai do mesmo jeito (e é refeita no próximo pedido)
    await enviarAoSupabase(miniatura, dados, 'image/jpeg', { conferir: false }).catch((erro) =>
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
  if (chave.startsWith(PREFIXO_SUPABASE)) {
    const caminho = chave.slice(PREFIXO_SUPABASE.length);
    await moverNoSupabase(caminho, `${path.posix.dirname(caminho)}/${PASTA_SUBSTITUIDAS_NO_SUPABASE}/${path.posix.basename(caminho)}`);
    // a miniatura da foto antiga só ocupa espaço
    await apagarDoSupabase([miniaturaNoSupabase(caminho)]).catch(() => undefined);
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
  if (chave.startsWith(PREFIXO_SUPABASE)) {
    const caminho = chave.slice(PREFIXO_SUPABASE.length);
    return apagarDoSupabase([caminho, miniaturaNoSupabase(caminho)]);
  }
  await unlink(caminhoDa(chave));
  await unlink(caminhoDa(chave, path.join(pastaBase(), '.miniaturas'))).catch(() => undefined);
}
