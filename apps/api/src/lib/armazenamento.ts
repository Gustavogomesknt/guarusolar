import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { caminhoDaFoto, PASTA_DAS_SUBSTITUIDAS, type DestinoDaFoto } from './nomesDeArquivo';
import {
  ArmazenamentoIndisponivel,
  ArquivoNaoEncontrado,
  avisoDeValidadeDoSegredo,
  baixarDoSharepoint,
  enviarAoSharepoint,
  miniaturaDoSharepoint,
  moverNoSharepoint,
  variaveisFaltando,
} from './sharepoint';

export { ArmazenamentoIndisponivel, ArquivoNaoEncontrado };
export type { DestinoDaFoto };

/**
 * Camada de armazenamento das fotos. Dois destinos:
 *
 * - "disco" (padrão, desenvolvimento): pasta STORAGE_DIR (uploads/). Chave = caminho relativo.
 * - "sharepoint" (produção): biblioteca do SharePoint do cliente (lib/sharepoint.ts).
 *   Chave = "sp:<id do arquivo no SharePoint>".
 *
 * STORAGE_PROVIDER escolhe onde as fotos NOVAS são gravadas. A leitura segue a chave, então
 * fotos gravadas no disco continuam abrindo depois de ligar o SharePoint (e vice-versa, desde
 * que o SharePoint esteja configurado).
 *
 * O banco guarda só a chave, nunca uma URL: as fotos saem pela rota autenticada /api/fotos/:id.
 */

export type ArquivoSalvo = { chave: string; nome: string; tamanhoBytes: number };
export type ArquivoLido = { dados: Buffer; tipo: string };

const PREFIXO_SHAREPOINT = 'sp:';
const LADO_DA_MINIATURA = 480;
const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export type Destino = 'disco' | 'sharepoint';
export const destinoAtual = (): Destino => (process.env.STORAGE_PROVIDER?.trim() === 'sharepoint' ? 'sharepoint' : 'disco');

/**
 * Confere a configuração ao subir a API: STORAGE_PROVIDER desconhecido ou SharePoint sem as
 * variáveis param o servidor com a mensagem (melhor que falhar no primeiro upload em campo).
 */
export function conferirArmazenamentoAoIniciar() {
  const valor = process.env.STORAGE_PROVIDER?.trim();
  if (valor && valor !== 'disco' && valor !== 'sharepoint') {
    throw new Error(`STORAGE_PROVIDER="${valor}" não existe. Use "disco" ou "sharepoint".`);
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
  const atual = caminhoDa(chave);
  const destino = path.join(path.dirname(atual), PASTA_DAS_SUBSTITUIDAS, path.basename(atual));
  await mkdir(path.dirname(destino), { recursive: true });
  await rename(atual, destino);
}
