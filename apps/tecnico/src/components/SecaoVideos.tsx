import { lazy, Suspense, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2, RotateCw, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { DICA_DO_VIDEO, formatarDuracao, formatarTamanho, MAXIMO_DE_VIDEOS_POR_SERVICO } from '@guarusolar/compartilhado';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import type { FotoNaFila } from '@/fotos/fila';
import type { VideoEnviado } from '@/lib/tipos';
import { cn } from '@/lib/utils';

// a tela de gravação só é baixada quando o técnico abre (não pesa na abertura do app)
const GravadorDeVideo = lazy(() => import('./GravadorDeVideo').then((m) => ({ default: m.GravadorDeVideo })));

/**
 * Vídeos do serviço (opcionais, até MAXIMO_DE_VIDEOS_POR_SERVICO), separados do roteiro de fotos.
 * Não bloqueiam o envio para validação por falta; um vídeo ainda na fila, sim (ele precisa subir
 * antes de o serviço ir para o gestor), e pode ser descartado.
 */
export function SecaoVideos({
  enviados,
  locais,
  bloqueado,
  onGravado,
  onTentarDeNovo,
  onDescartar,
}: {
  enviados: VideoEnviado[];
  locais: FotoNaFila[];
  /** serviço que não recebe arquivos agora (aguardando outro, armazenamento): sem botão */
  bloqueado: boolean;
  onGravado: (arquivo: Blob, duracaoSegundos: number, capa: Blob | null) => Promise<void>;
  onTentarDeNovo: (idLocal: string) => void;
  onDescartar: (idLocal: string) => void;
}) {
  const [gravando, setGravando] = useState(false);
  // o que já chegou ao servidor sai da fila logo depois: não conta duas vezes
  const naFila = locais.filter((l) => !enviados.some((e) => e.idLocal === l.idLocal));
  const total = enviados.length + naFila.length;
  const noLimite = total >= MAXIMO_DE_VIDEOS_POR_SERVICO;

  return (
    <section aria-labelledby="titulo-videos" className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="titulo-videos" className="font-sans text-[15px] font-semibold tracking-normal">
          Vídeos <span className="font-normal text-muted-foreground">(opcional)</span>
        </h2>
        <span className="font-mono text-sm">
          {total} de {MAXIMO_DE_VIDEOS_POR_SERVICO}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{DICA_DO_VIDEO}</p>

      {(enviados.length > 0 || naFila.length > 0) && (
        <ul className="flex flex-col gap-2">
          {enviados.map((v) => (
            <li key={v.id} className="flex items-center gap-3">
              <Capa>{v.temCapa ? <ImagemProtegida src={`/api/videos/${v.id}/capa`} alt="" className="size-full object-cover" /> : null}</Capa>
              <span className="flex flex-1 flex-col text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Check className="size-4 text-[#17653E]" aria-hidden /> Enviado
                </span>
                <span className="text-xs text-muted-foreground">
                  {v.duracaoSegundos !== null ? `${formatarDuracao(v.duracaoSegundos)} · ` : ''}
                  {formatarTamanho(v.tamanhoBytes)}
                </span>
              </span>
            </li>
          ))}
          {naFila.map((v) => (
            <li key={v.idLocal} className="flex items-center gap-3">
              <Capa>{v.url ? <img src={v.url} alt="" className="size-full object-cover" /> : null}</Capa>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span className={cn('flex items-center gap-1.5 font-medium', v.estado === 'erro' && 'text-destaque-texto')}>
                  {v.estado === 'erro' ? (
                    <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  ) : v.estado === 'enviando' ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Clock className="size-4 shrink-0" aria-hidden />
                  )}
                  {v.estado === 'erro'
                    ? 'Não foi aceito'
                    : v.estado === 'enviando'
                      ? `Enviando${v.progresso !== undefined ? ` ${Math.round(v.progresso * 100)}%` : '…'}`
                      : 'Guardado no celular, na fila'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {v.duracaoSegundos !== undefined ? `${formatarDuracao(v.duracaoSegundos)} · ` : ''}
                  {v.tamanhoBytes !== undefined ? formatarTamanho(v.tamanhoBytes) : ''}
                </span>
                {v.erro && <span className="text-xs text-destaque-texto">{v.erro}</span>}
              </span>
              {v.estado === 'erro' && (
                <button type="button" onClick={() => onTentarDeNovo(v.idLocal)} aria-label="Enviar o vídeo de novo" className="flex size-11 items-center justify-center rounded-xl border">
                  <RotateCw className="size-4" aria-hidden />
                </button>
              )}
              {v.estado !== 'enviando' && (
                <button type="button" onClick={() => onDescartar(v.idLocal)} aria-label="Descartar este vídeo" className="flex size-11 items-center justify-center rounded-xl border">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {noLimite ? (
        <p className="text-xs text-muted-foreground">Limite de {MAXIMO_DE_VIDEOS_POR_SERVICO} vídeos neste serviço.</p>
      ) : (
        !bloqueado && (
          <button
            type="button"
            onClick={() => setGravando(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/40 font-semibold text-primary"
          >
            <Video className="size-5" aria-hidden />
            Gravar vídeo
          </button>
        )
      )}

      {gravando && (
        <Suspense fallback={null}>
          <GravadorDeVideo
            onFechar={() => setGravando(false)}
            onUsar={async ({ arquivo, duracaoSegundos, capa }) => {
              try {
                await onGravado(arquivo, duracaoSegundos, capa);
              } catch (erro) {
                toast.error(erro instanceof Error ? erro.message : 'Não foi possível guardar o vídeo.');
                throw erro;
              }
            }}
          />
        </Suspense>
      )}
    </section>
  );
}

function Capa({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EDF1F6] text-muted-foreground">
      {children ?? <Video className="size-5" aria-hidden />}
    </span>
  );
}
