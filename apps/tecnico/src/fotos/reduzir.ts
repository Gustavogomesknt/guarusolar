/*
 * Compressão da foto no celular, antes de entrar na fila de envio. As fotos ficam no Supabase
 * Storage, com cerca de 1 GB no plano gratuito (destino definitivo: CLAUDE.md), então cada foto
 * precisa ser pequena: lado maior com 1600 px, JPEG qualidade 0,75, alvo de 300 KB. Se passar
 * muito do alvo, a qualidade desce em passos até 0,6 (nunca abaixo: a foto serve para o gestor
 * conferir o serviço). Uma foto de 12 MP (3–7 MB) fica entre 200 e 400 KB.
 * Fotos menores que 1600 px não são ampliadas, mas sempre regravadas em JPEG (a API aceita JPG,
 * PNG e WEBP; o JPEG é o menor dos três).
 *
 * A foto é decodificada já girada conforme o EXIF: foto tirada em pé não chega deitada.
 * O desenho no canvas descarta o EXIF: data/hora e localização são lidas antes (metadados.ts)
 * e vão em campos próprios do envio.
 *
 * Se algo aqui falhar, a fila envia a foto original (fila.ts): nunca se perde uma foto por
 * causa da compressão.
 */

export const LADO_MAXIMO = 1600;
export const QUALIDADE_JPEG = 0.75;
export const QUALIDADE_MINIMA = 0.6;
const PASSO_DA_QUALIDADE = 0.05;
export const TAMANHO_ALVO = 300 * 1024;
/** "Passar muito" do alvo: mais de 15% acima. Abaixo disso não vale perder qualidade. */
const FOLGA_DO_ALVO = 1.15;

export type FotoReduzida = { blob: Blob; largura: number; altura: number; qualidade: number };

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

const emJpeg = (canvas: HTMLCanvasElement, qualidade: number) =>
  new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade));

export async function reduzirFoto(arquivo: Blob): Promise<FotoReduzida> {
  const origem = await decodificar(arquivo);
  const canvas = document.createElement('canvas');
  try {
    const { largura, altura } = medidasReduzidas(origem.largura, origem.altura);
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Este navegador não conseguiu preparar a foto.');
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(origem.imagem, 0, 0, largura, altura);

    let qualidade = QUALIDADE_JPEG;
    let blob = await emJpeg(canvas, qualidade);
    // passou muito do alvo (cena com muito detalhe: telhas, folhagem): desce a qualidade em passos
    while (blob && blob.size > TAMANHO_ALVO * FOLGA_DO_ALVO && qualidade - PASSO_DA_QUALIDADE >= QUALIDADE_MINIMA - 0.001) {
      qualidade = Math.round((qualidade - PASSO_DA_QUALIDADE) * 100) / 100;
      blob = (await emJpeg(canvas, qualidade)) ?? blob;
    }
    if (!blob) throw new Error('Não foi possível preparar a foto. Tente de novo.');
    return { blob, largura, altura, qualidade };
  } finally {
    // libera a memória do canvas já (celulares simples têm pouca)
    canvas.width = canvas.height = 0;
    origem.liberar();
  }
}
