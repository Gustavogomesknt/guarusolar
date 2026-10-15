import { EXTENSAO_DO_VIDEO, type TipoDeVideo } from '@guarusolar/compartilhado';
import { configuracaoIncompleta, destinoAtual } from './armazenamento';
import { conferirEspaco, enviarAoS3, linkAssinadoDoS3, linkDeEnvioDoS3, somarAoUsoDoS3, tamanhoNoS3 } from './s3';

/*
 * Vídeo dos serviços no bucket S3 (Backblaze B2). O arquivo NUNCA passa pela API (512 MB de
 * memória na Render gratuita; dois envios de 11 MB ao mesmo tempo já pesariam):
 *
 *   1. o celular pede um link de escrita (POST …/videos/envio): a API confere serviço, limite de
 *      vídeos e espaço, e devolve um link assinado de PUT que vale 10 minutos para começar;
 *   2. o celular envia o arquivo DIRETO ao bucket com esse link;
 *   3. o celular avisa que terminou (POST …/videos, com a capa, um JPEG pequeno): a API confere
 *      no bucket que o arquivo está lá, com que tamanho, e só então cria o registro.
 *
 * O caminho sai do idLocal (gerado no celular): reenviar grava no MESMO lugar, sem duplicar.
 * Só o destino "s3" recebe vídeo (o Supabase e o disco, não): fora dele, a API recusa com 409.
 */

const PREFIXO = 's3:';

/** Vídeo exige o bucket S3 configurado; o motivo vai para a tela do técnico. */
export class VideoSemArmazenamento extends Error {}

export function conferirDestinoDoVideo() {
  if (destinoAtual() !== 's3' || configuracaoIncompleta() !== null) {
    throw new VideoSemArmazenamento('O envio de vídeo ainda não está disponível: falta configurar o armazenamento de arquivos grandes. Avise o escritório. As fotos continuam funcionando.');
  }
}

/** PRJ-2026-0015/<id do serviço>/videos/<idLocal>.webm */
export const caminhoDoVideo = (projetoCodigo: string, servicoId: string, idLocal: string, tipo: TipoDeVideo) =>
  `${projetoCodigo}/${servicoId}/videos/${idLocal}${EXTENSAO_DO_VIDEO[tipo]}`;
const caminhoDaCapa = (caminhoDoVideo: string) => caminhoDoVideo.replace(/\.[^./]+$/, '-capa.jpg');

/** Link de escrita para o celular; recusa (ArmazenamentoCheio) se não couber abaixo de 95%. */
export async function linkParaEnviarVideo(caminho: string, tamanhoBytes: number) {
  conferirDestinoDoVideo();
  await conferirEspaco(tamanhoBytes);
  return { url: linkDeEnvioDoS3(caminho, 600), expiraEmSegundos: 600 };
}

/** Tamanho do arquivo no bucket (null = não chegou). */
export async function tamanhoDoVideoEnviado(caminho: string) {
  conferirDestinoDoVideo();
  return tamanhoNoS3(caminho);
}

/** Grava a capa (JPEG pequeno, passa pela API) e devolve a chave. */
export async function salvarCapaDoVideo(caminho: string, jpeg: Buffer) {
  const capa = caminhoDaCapa(caminho);
  await enviarAoS3(capa, jpeg, 'image/jpeg');
  return `${PREFIXO}${capa}`;
}

/** O vídeo entrou no banco: conta no uso medido em memória (ele não passou pela API). */
export const contarVideoNoUso = (bytes: number) => somarAoUsoDoS3(bytes);

export const chaveDoVideo = (caminho: string) => `${PREFIXO}${caminho}`;

/** Link de leitura com expiração curta (5 min), só depois de conferir login e acesso. */
export function linkParaAssistir(arquivoChave: string, segundos = 300) {
  const caminho = arquivoChave.replace(/^(s3|r2):/, '');
  if (caminho === arquivoChave) throw new VideoSemArmazenamento('Este vídeo não está no armazenamento S3.');
  return linkAssinadoDoS3(caminho, segundos);
}
