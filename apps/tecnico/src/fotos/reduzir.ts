/*
 * Redução da foto no celular antes do envio (README, "App do técnico"): lado maior com
 * 2000 px, JPEG qualidade 85. Uma foto de 12 MP (4–8 MB) fica entre 400 KB e 1 MB, o que
 * faz diferença com internet móvel fraca. Fotos menores seguem no tamanho original, mas
 * sempre regravadas em JPEG (a API aceita JPG, PNG e WEBP; o JPEG é o menor dos três).
 *
 * O desenho no canvas descarta o EXIF: data/hora e localização são lidas antes
 * (metadados.ts) e vão em campos próprios do envio.
 */

export const LADO_MAXIMO = 2000;
export const QUALIDADE_JPEG = 0.85;

export type FotoReduzida = { blob: Blob; largura: number; altura: number };

/** Proporção mantida; nunca aumenta a foto. */
export function medidasReduzidas(largura: number, altura: number, ladoMaximo = LADO_MAXIMO) {
  const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/** Decodifica já girada conforme o EXIF (foto de celular em pé chega "deitada" no arquivo). */
async function decodificar(arquivo: Blob): Promise<{ imagem: CanvasImageSource; largura: number; altura: number; liberar: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      return { imagem: bitmap, largura: bitmap.width, altura: bitmap.height, liberar: () => bitmap.close() };
    } catch {
      /* formato que o createImageBitmap não abre (ex.: HEIC em alguns aparelhos): tenta pelo <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { imagem: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Não foi possível abrir esta imagem. Tire a foto de novo ou escolha outra.');
  }
}

export async function reduzirFoto(arquivo: Blob): Promise<FotoReduzida> {
  const origem = await decodificar(arquivo);
  try {
    const { largura, altura } = medidasReduzidas(origem.largura, origem.altura);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Este navegador não conseguiu preparar a foto.');
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(origem.imagem, 0, 0, largura, altura);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
    // libera a memória do canvas já (celulares simples têm pouca)
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('Não foi possível preparar a foto. Tente de novo.');
    return { blob, largura, altura };
  } finally {
    origem.liberar();
  }
}
