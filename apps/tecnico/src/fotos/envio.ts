import { api } from '@guarusolar/web/api';
import type { FotoEnviada } from '@/lib/tipos';

export type DadosDoEnvio = {
  servicoId: string;
  /** chave do item do checklist; null = foto extra */
  chave: string | null;
  /** gerado no celular: a API não duplica se a mesma foto chegar duas vezes */
  idLocal: string;
  blob: Blob;
  capturadaEm: Date;
  latitude?: number;
  longitude?: number;
};

/** POST /api/tecnico/servicos/:id/fotos (multipart, campo "arquivo"). */
export function enviarFoto(dados: DadosDoEnvio, signal?: AbortSignal) {
  const formulario = new FormData();
  // quase sempre JPEG (a foto comprimida); o original, quando a compressão falhou, vai como veio
  const extensao = { 'image/png': 'png', 'image/webp': 'webp' }[dados.blob.type] ?? 'jpg';
  formulario.append('arquivo', dados.blob, `${dados.chave ?? 'extra'}.${extensao}`);
  formulario.append('idLocal', dados.idLocal);
  formulario.append('capturadaEm', dados.capturadaEm.toISOString());
  if (dados.chave) formulario.append('chave', dados.chave);
  if (dados.latitude !== undefined && dados.longitude !== undefined) {
    formulario.append('latitude', String(dados.latitude));
    formulario.append('longitude', String(dados.longitude));
  }
  return api.post<FotoEnviada>(`/api/tecnico/servicos/${dados.servicoId}/fotos`, formulario, { signal });
}
