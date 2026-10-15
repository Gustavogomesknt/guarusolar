import { useState } from 'react';
import { Loader2, Play, Video } from 'lucide-react';
import { toast } from 'sonner';
import { formatarDataHora, formatarDuracao, formatarTamanho } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import type { VideoEmValidacao } from '@/lib/tipos';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Vídeos do serviço na validação (opcionais; não entram na marcação de "Refazer"). A capa sai
 * pela API, com login. Para tocar, a API confere o login e devolve um link assinado de LEITURA
 * que vale 5 minutos: nenhum link público, e o arquivo não passa pela API.
 */
export function VideosDoServico({ videos }: { videos: VideoEmValidacao[] }) {
  const [tocando, setTocando] = useState<{ video: VideoEmValidacao; url: string } | null>(null);
  const [buscando, setBuscando] = useState<string | null>(null);

  if (videos.length === 0) return null;

  const tocar = async (video: VideoEmValidacao) => {
    setBuscando(video.id);
    try {
      const { url } = await api.get<{ url: string }>(`/api/videos/${video.id}/link`);
      setTocando({ video, url });
    } catch (erro) {
      toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível abrir o vídeo.');
    } finally {
      setBuscando(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Vídeos do serviço</h3>
      <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {videos.map((v) => (
          <li key={v.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => void tocar(v)}
              aria-label={`Assistir ao vídeo de ${formatarDuracao(v.duracaoSegundos ?? 0)}`}
              className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-[#0E2E60] text-white focus-visible:outline-2 focus-visible:outline-ring"
            >
              {v.temCapa ? (
                <ImagemProtegida src={`/api/videos/${v.id}/capa`} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <Video className="size-8 opacity-60" aria-hidden />
              )}
              <span className="relative flex size-12 items-center justify-center rounded-full bg-black/60 group-hover:bg-black/75">
                {buscando === v.id ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5 fill-white" aria-hidden />}
              </span>
              {v.duracaoSegundos !== null && (
                <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs">{formatarDuracao(v.duracaoSegundos)}</span>
              )}
            </button>
            <span className="text-xs text-muted-foreground">
              {formatarTamanho(v.tamanhoBytes)} · {v.enviadoPor.nome} · {formatarDataHora(v.gravadoEm ?? v.criadoEm)}
            </span>
          </li>
        ))}
      </ul>

      <Dialog open={tocando !== null} onOpenChange={(aberto) => !aberto && setTocando(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vídeo do serviço</DialogTitle>
            <DialogDescription>
              {tocando && `${formatarDuracao(tocando.video.duracaoSegundos ?? 0)} · ${formatarTamanho(tocando.video.tamanhoBytes)} · enviado por ${tocando.video.enviadoPor.nome}`}
            </DialogDescription>
          </DialogHeader>
          {/* link de 5 min: se expirar com a janela aberta, fechar e abrir de novo gera outro */}
          {tocando && <video src={tocando.url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
