import { ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react';
import { urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import { formatarHora } from '@guarusolar/compartilhado';
import type { FotoEmValidacao } from '@/lib/tipos';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BotoesMarcacao, rotuloDaFoto, type Marcacao } from './marcacao';

/**
 * Foto ampliada. Teclado: ← e → navegam, O marca OK, R marca para refazer, Esc fecha
 * (o Esc e o foco preso dentro vêm do Dialog do Radix).
 */
export function FotoAmpliada({
  fotos,
  indice,
  marcacoes,
  onIndice,
  onMarcar,
  onFechar,
}: {
  fotos: FotoEmValidacao[];
  indice: number | null;
  marcacoes: Record<string, Marcacao>;
  onIndice: (indice: number) => void;
  onMarcar: (fotoId: string, marcacao: Marcacao) => void;
  onFechar: () => void;
}) {
  const foto = indice === null ? null : fotos[indice];
  const ir = (passo: number) => indice !== null && onIndice((indice + passo + fotos.length) % fotos.length);

  return (
    <Dialog open={foto !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      {foto && indice !== null && (
        <DialogContent
          className="flex max-h-[94vh] flex-col gap-3 bg-card p-4 sm:max-w-[min(1100px,94vw)]"
          onKeyDown={(e) => {
            if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
            if (e.key === 'ArrowRight') ir(1);
            else if (e.key === 'ArrowLeft') ir(-1);
            else if (e.key.toLowerCase() === 'o') onMarcar(foto.id, 'ok');
            else if (e.key.toLowerCase() === 'r') onMarcar(foto.id, 'refazer');
            else return;
            e.preventDefault();
          }}
        >
          <div className="flex items-baseline justify-between gap-4 pr-10">
            <DialogTitle className="font-sans text-base font-semibold tracking-normal">{rotuloDaFoto(foto)}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {indice + 1} de {fotos.length}
              {foto.capturadaEm && ` · ${formatarHora(foto.capturadaEm)}`}
            </DialogDescription>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-lg bg-[#0B2F5E]">
            <ImagemProtegida
              key={foto.id}
              src={urlDaFoto(foto.id)}
              alt={rotuloDaFoto(foto)}
              className="max-h-[72vh] max-w-full object-contain"
              carregando={<Loader2 className="my-24 size-8 animate-spin text-white/70" aria-hidden />}
              emErro={
                <span className="my-24 flex flex-col items-center gap-2 text-sm text-white/80">
                  <ImageOff className="size-8" aria-hidden />
                  Não foi possível abrir a foto
                </span>
              }
            />
            <button
              type="button"
              onClick={() => ir(-1)}
              className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-white/90 text-foreground shadow"
            >
              <ChevronLeft className="size-6" aria-hidden />
              <span className="sr-only">Foto anterior</span>
            </button>
            <button
              type="button"
              onClick={() => ir(1)}
              className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-white/90 text-foreground shadow"
            >
              <ChevronRight className="size-6" aria-hidden />
              <span className="sr-only">Próxima foto</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> navegam ·{' '}
              <kbd className="font-mono">O</kbd> marca OK · <kbd className="font-mono">R</kbd> marca refazer ·{' '}
              <kbd className="font-mono">Esc</kbd> fecha
            </p>
            <BotoesMarcacao
              rotulo={rotuloDaFoto(foto)}
              marcacao={marcacoes[foto.id]}
              onMarcar={(m) => onMarcar(foto.id, m)}
              grande
            />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
