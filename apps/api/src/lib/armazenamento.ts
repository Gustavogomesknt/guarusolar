import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Camada de armazenamento das fotos.
 *
 * Implementação atual: disco local. Em produção entra o OneDrive/SharePoint do cliente via
 * Microsoft Graph, trocando só o corpo destas funções — o resto do sistema não muda.
 *
 * O banco guarda a CHAVE do arquivo (ex.: "PRJ-2026-0015/<serviço>/<uuid>.jpg"), nunca uma URL:
 * as fotos só saem pela rota autenticada GET /api/fotos/:id, que confere quem pede e lê daqui.
 * (No OneDrive, a chave vira o caminho ou o id do item no drive.)
 */

export type ArquivoSalvo = { chave: string; nome: string; tamanhoBytes: number };
export type ArquivoLido = { dados: Buffer; tipo: string };

/** Lado maior das miniaturas (grade do gestor, quadros do app do técnico). */
const LADO_DA_MINIATURA = 480;

const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const pastaBase = () => path.resolve(process.env.STORAGE_DIR ?? 'uploads');

/** Caminho no disco de uma chave, sem deixar sair da pasta base (ex.: chave com "../"). */
function caminhoDa(chave: string, raiz = pastaBase()) {
  const completo = path.resolve(raiz, chave);
  if (!completo.startsWith(raiz + path.sep)) throw new Error(`Chave de arquivo inválida: ${chave}`);
  return completo;
}

export async function salvarArquivo(buffer: Buffer, nomeOriginal: string, pasta: string): Promise<ArquivoSalvo> {
  const extensao = path.extname(nomeOriginal).toLowerCase() || '.jpg';
  const nome = `${randomUUID()}${extensao}`;
  const chave = `${pasta}/${nome}`;
  const destino = caminhoDa(chave);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, buffer);
  return { chave, nome, tamanhoBytes: buffer.length };
}

/** O arquivo original. Lança erro com code "ENOENT" se não existir. */
export async function lerArquivo(chave: string): Promise<ArquivoLido> {
  const dados = await readFile(caminhoDa(chave));
  return { dados, tipo: TIPOS[path.extname(chave).toLowerCase()] ?? 'application/octet-stream' };
}

/**
 * Miniatura em JPEG (lado maior de 480 px). Gerada na primeira vez e guardada numa pasta à
 * parte (.miniaturas/), para não refazer a cada pedido. Lança erro se a imagem não abrir.
 */
export async function lerMiniatura(chave: string): Promise<ArquivoLido> {
  const guardada = caminhoDa(chave, path.join(pastaBase(), '.miniaturas'));
  try {
    return { dados: await readFile(guardada), tipo: 'image/jpeg' };
  } catch {
    const original = await lerArquivo(chave);
    const dados = await sharp(original.dados)
      .rotate() // respeita a orientação do EXIF
      .resize(LADO_DA_MINIATURA, LADO_DA_MINIATURA, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    await mkdir(path.dirname(guardada), { recursive: true });
    await writeFile(guardada, dados);
    return { dados, tipo: 'image/jpeg' };
  }
}
