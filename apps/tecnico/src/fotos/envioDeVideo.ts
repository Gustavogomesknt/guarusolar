import { api, ErroApi } from '@guarusolar/web/api';

/*
 * Envio do vídeo em três passos (a API explica em apps/api/src/lib/videos.ts): pedir o link
 * assinado de escrita, mandar o arquivo DIRETO ao bucket e avisar a API que terminou.
 */

type LinkDeEnvio = { url: string; expiraEmSegundos: number; metodo: 'PUT'; tipo: string };
export type VideoRecebido = { id: string };

/** 1. Link de escrita (vale 10 min para começar). `jaRecebido`: o vídeo já entrou antes. */
export const pedirLinkDoVideo = (servicoId: string, dados: { idLocal: string; tamanhoBytes: number; tipo: string }) =>
  api.post<LinkDeEnvio | { jaRecebido: VideoRecebido }>(`/api/tecnico/servicos/${servicoId}/videos/envio`, dados);

/**
 * Tempo máximo do envio ao bucket, pelo tamanho: conta com 20 KB/s (uns 160 kbps, sinal ruim),
 * entre 2 e 15 minutos. Um vídeo de 11 MB tem até uns 9 minutos. Estourou: a tentativa para,
 * o vídeo vai para o fim da fila e tenta de novo depois (sem erro).
 */
export const tempoMaximoDoVideo = (bytes: number) => Math.min(15 * 60_000, Math.max(120_000, (bytes / (20 * 1024)) * 1000));

/**
 * 2. O arquivo vai DIRETO ao bucket (XMLHttpRequest: o fetch não informa o progresso do envio).
 * Sem conexão, tempo esgotado e recusa do bucket (link vencido, 5xx) viram erro de "tente de novo":
 * só a API dá recusa definitiva.
 */
export function enviarAoBucket(url: string, arquivo: Blob, limite: AbortSignal, aoProgredir: (fracao: number) => void) {
  return new Promise<void>((ok, falhou) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', arquivo.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? ok()
        : // 403 (link vencido ou relógio), 5xx (bucket fora): a fila tenta de novo com link novo
          falhou(new ErroApi(503, `O armazenamento não aceitou o envio agora (${xhr.status}). Tentando de novo.`));
    const semConexao = () => falhou(new ErroApi(0, 'Sem conexão para enviar o vídeo.'));
    xhr.onerror = semConexao;
    xhr.ontimeout = semConexao;
    const parar = () => xhr.abort();
    xhr.onabort = () => falhou(limite.reason instanceof Error ? limite.reason : new DOMException('Tempo esgotado', 'TimeoutError'));
    if (limite.aborted) return parar();
    limite.addEventListener('abort', parar, { once: true });
    xhr.send(arquivo);
  });
}

/** 3. Avisa a API (com a capa): ela confere no bucket e só então registra o vídeo. */
export function confirmarVideo(
  servicoId: string,
  dados: { idLocal: string; tipo: string; duracaoSegundos: number; gravadoEm: string; capa?: ArrayBuffer },
) {
  const formulario = new FormData();
  formulario.append('idLocal', dados.idLocal);
  formulario.append('tipo', dados.tipo);
  formulario.append('duracaoSegundos', String(Math.round(dados.duracaoSegundos)));
  formulario.append('gravadoEm', dados.gravadoEm);
  if (dados.capa) formulario.append('capa', new Blob([dados.capa], { type: 'image/jpeg' }), 'capa.jpg');
  return api.post<VideoRecebido>(`/api/tecnico/servicos/${servicoId}/videos`, formulario);
}
