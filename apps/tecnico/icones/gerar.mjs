// Gera os ícones do app do técnico a partir de icones/app.svg (npm run icones -w @guarusolar/tecnico).
// Rode de novo quando o cliente enviar o logo oficial (pendência no CLAUDE.md).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const pasta = import.meta.dirname;
const svg = await readFile(path.join(pasta, 'app.svg'));
const destino = path.join(pasta, '..', 'public');

const icones = [
  // Android e Chrome (manifest)
  { arquivo: 'icone-192.png', tamanho: 192 },
  { arquivo: 'icone-512.png', tamanho: 512 },
  // ícone adaptável: o próprio desenho já respeita a zona segura
  { arquivo: 'icone-maskable-512.png', tamanho: 512 },
  // iPhone ("Adicionar à Tela de Início"); o iOS arredonda os cantos sozinho
  { arquivo: 'apple-touch-icon.png', tamanho: 180 },
];

for (const { arquivo, tamanho } of icones) {
  await sharp(svg, { density: 300 }).resize(tamanho, tamanho).png({ compressionLevel: 9 }).toFile(path.join(destino, arquivo));
  console.log(`public/${arquivo} (${tamanho}×${tamanho})`);
}
