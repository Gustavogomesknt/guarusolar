import { useState } from 'react';
import { ChevronDown, ClipboardList, ImageIcon, X } from 'lucide-react';
import { diaDaApi, nomeLongo } from '@guarusolar/compartilhado';
import { urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import type { VisitaDoCliente } from '@/lib/tipos';
import { cn } from '@/lib/utils';

const rotuloDaFoto = (f: VisitaDoCliente['fotos'][number]) => f.rotulo ?? 'Foto extra';

/**
 * Na tela de uma INSTALAÇÃO: as visitas técnicas do mesmo cliente, para quem vai instalar ver o
 * que o colega mediu e fotografou. Só leitura (nada de refazer ou enviar); a API só manda para
 * quem está escalado nesta instalação, e a foto confere o mesmo direito ao abrir.
 */
export function VisitasDoCliente({ visitas }: { visitas: VisitaDoCliente[] }) {
  const [aberta, setAberta] = useState(false);
  const [foto, setFoto] = useState<VisitaDoCliente['fotos'][number] | null>(null);
  if (visitas.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-card">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((a) => !a)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">{visitas.length === 1 ? 'Visita técnica deste cliente' : `Visitas técnicas deste cliente (${visitas.length})`}</span>
          <span className="text-[13px] text-muted-foreground">O que o colega mediu e fotografou. Só para consulta.</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', aberta && 'rotate-180')} aria-hidden />
      </button>

      {aberta && (
        <div className="flex flex-col gap-4 border-t px-4 py-4">
          {visitas.map((v) => (
            <article key={v.id} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {nomeLongo(diaDaApi(v.dataInicio))}
                {v.enviadoPor && <span className="font-normal text-muted-foreground"> · {v.enviadoPor.nome}</span>}
              </h3>
              <p className="rounded-xl bg-background px-3 py-2 text-sm whitespace-pre-wrap">
                {v.observacoesTecnico?.trim() || <span className="text-muted-foreground">Sem observações.</span>}
              </p>
              {v.fotos.length > 0 && (
                <ul className="grid grid-cols-3 gap-2">
                  {v.fotos.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => setFoto(f)} className="flex w-full flex-col gap-1 text-left" aria-label={`Ampliar: ${rotuloDaFoto(f)}`}>
                        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted">
                          <ImagemProtegida
                            src={urlDaFoto(f.id, 'miniatura')}
                            alt=""
                            className="size-full object-cover"
                            carregando={<ImageIcon className="size-5 text-muted-foreground" aria-hidden />}
                            emErro={<ImageIcon className="size-5 text-muted-foreground" aria-hidden />}
                          />
                        </span>
                        <span className="line-clamp-2 text-[11px] leading-tight text-foreground/80">{rotuloDaFoto(f)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      {foto && (
        <div role="dialog" aria-modal="true" aria-label={rotuloDaFoto(foto)} className="fixed inset-0 z-50 flex flex-col bg-[#0B2F5E]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <span className="truncate font-semibold">{rotuloDaFoto(foto)}</span>
            <button type="button" onClick={() => setFoto(null)} className="flex size-11 items-center justify-center rounded-full bg-white/10" aria-label="Fechar">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <ImagemProtegida
              key={foto.id}
              src={urlDaFoto(foto.id)}
              alt={rotuloDaFoto(foto)}
              className="max-h-full max-w-full object-contain"
              carregando={<ImageIcon className="size-8 text-white/60" aria-hidden />}
              emErro={<p className="text-sm text-white/80">Não foi possível abrir a foto (sem sinal?).</p>}
            />
          </div>
        </div>
      )}
    </section>
  );
}
