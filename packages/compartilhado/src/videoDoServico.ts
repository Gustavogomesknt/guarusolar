/*
 * Vídeo nos serviços: os números ficam SÓ aqui (app de campo, API e telas leem daqui).
 *
 * O vídeo é gravado DENTRO do app (MediaRecorder), em 720p a cerca de 1,5 Mbps: uns 11 MB por
 * minuto. O vídeo da câmera do sistema sai com 100 MB ou mais e o navegador não o comprime.
 * O arquivo vai do celular DIRETO para o bucket, por link assinado de escrita: nunca passa pela
 * memória da API (512 MB na Render gratuita). Orientação do cliente: preferir foto (espaço).
 */

/** Máximo de vídeos por serviço (API recusa o terceiro; o app esconde o botão). */
export const MAXIMO_DE_VIDEOS_POR_SERVICO = 2;
/** Duração máxima da gravação; o app para sozinho aqui. */
export const VIDEO_SEGUNDOS_MAXIMO = 60;
/** Alvo da gravação no app (o navegador pode ficar um pouco acima ou abaixo). */
export const VIDEO_LARGURA = 1280;
export const VIDEO_ALTURA = 720;
export const VIDEO_BITS_POR_SEGUNDO = 1_500_000;
export const VIDEO_AUDIO_BITS_POR_SEGUNDO = 64_000;
/**
 * Maior arquivo aceito: o gravado no app fica perto de 12 MB por minuto; 25 MB dá folga para
 * aparelhos que passam do alvo e para o vídeo escolhido da galeria (quando o aparelho não grava).
 */
export const VIDEO_BYTES_MAXIMO = 25 * 1024 * 1024;
/** Tipos aceitos (o MediaRecorder grava WebM no Android e MP4 no iPhone). */
export const TIPOS_DE_VIDEO = ['video/webm', 'video/mp4', 'video/quicktime'] as const;
export type TipoDeVideo = (typeof TIPOS_DE_VIDEO)[number];
export const EXTENSAO_DO_VIDEO: Record<TipoDeVideo, string> = { 'video/webm': '.webm', 'video/mp4': '.mp4', 'video/quicktime': '.mov' };
/** Linha discreta na seção de vídeos do app. */
export const DICA_DO_VIDEO = 'Use vídeo só para o que a foto não mostra.';
/** Código da API quando o arquivo ainda não está no bucket na hora de confirmar (o app reenvia). */
export const CODIGO_VIDEO_NAO_RECEBIDO = 'VIDEO_NAO_RECEBIDO';

/** "10,9 MB" */
export const formatarTamanho = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
/** "0:58" */
export function formatarDuracao(segundos: number) {
  const total = Math.max(0, Math.round(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
