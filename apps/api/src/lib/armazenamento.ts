import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ArquivoSalvo = { url: string; nome: string; tamanhoBytes: number };

/**
 * Camada de armazenamento das fotos e PDFs.
 *
 * Implementação atual: disco local (desenvolvimento).
 * Em produção entra o OneDrive/SharePoint do cliente via Microsoft Graph,
 * bastando trocar o corpo desta função — o resto do sistema não muda.
 */
export async function salvarArquivo(
  buffer: Buffer,
  nomeOriginal: string,
  pasta: string,
): Promise<ArquivoSalvo> {
  const base = process.env.STORAGE_DIR ?? path.resolve('uploads');
  const destino = path.join(base, pasta);
  await mkdir(destino, { recursive: true });

  const extensao = path.extname(nomeOriginal) || '.jpg';
  const nome = `${randomUUID()}${extensao}`;
  await writeFile(path.join(destino, nome), buffer);

  const publico = process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3333/arquivos';
  return { url: `${publico}/${pasta}/${nome}`, nome, tamanhoBytes: buffer.length };
}
