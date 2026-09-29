import exifr from 'exifr/dist/lite.esm.mjs';

/*
 * Data/hora e localização da captura.
 *
 * O EXIF é a primeira fonte, mas os navegadores costumam REMOVER a localização das fotos
 * entregues a uma página (Chrome no Android e Safari no iOS, por privacidade). Por isso a
 * posição também é pedida ao navegador (geolocation) no momento em que o técnico toca em
 * "Tirar foto", e usada quando o EXIF não trouxer.
 */

export type Posicao = { latitude: number; longitude: number };
export type Metadados = { capturadaEm: Date; posicao: Posicao | null };

const ESPERA_MAXIMA_DA_POSICAO = 4_000;

const numeroValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Posição atual, sem travar o fluxo: se o técnico negar, o GPS demorar ou não houver
 * contexto seguro (HTTPS), resolve com null. Nunca rejeita.
 */
export function obterPosicao(tempoMaximo = 15_000): Promise<Posicao | null> {
  if (!('geolocation' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolver({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: tempoMaximo, maximumAge: 60_000 },
    );
  });
}

/**
 * `posicaoDoAparelho`: a posição pedida ao tocar em "Tirar foto" (pode ainda estar chegando).
 * `arquivo.lastModified` é o último recurso para a hora: na câmera é o instante da foto; na
 * galeria costuma ser quando a foto foi salva.
 */
export async function lerMetadados(arquivo: File, posicaoDoAparelho: Promise<Posicao | null>): Promise<Metadados> {
  let capturadaEm: Date | null = null;
  let posicao: Posicao | null = null;
  try {
    // Blocos, não `pick`: na versão enxuta da exifr o `pick` quebra (faltam os dicionários de tags).
    const exif = await exifr.parse(arquivo, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      interop: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
    });
    const data = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (data instanceof Date && !Number.isNaN(data.getTime())) capturadaEm = data;
    if (numeroValido(exif?.latitude) && numeroValido(exif?.longitude)) {
      posicao = { latitude: exif.latitude, longitude: exif.longitude };
    }
  } catch {
    /* sem EXIF legível (PNG, WEBP ou arquivo já sem metadados): segue com as outras fontes */
  }
  // A posição começou a ser buscada no toque; se ainda não chegou, espera no máximo 4 s para
  // não segurar a foto (permissão pendente ou GPS frio). Sem posição, a foto segue sem ela.
  posicao ??= await Promise.race([
    posicaoDoAparelho,
    new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_MAXIMA_DA_POSICAO)),
  ]);
  return { capturadaEm: capturadaEm ?? new Date(arquivo.lastModified || Date.now()), posicao };
}
