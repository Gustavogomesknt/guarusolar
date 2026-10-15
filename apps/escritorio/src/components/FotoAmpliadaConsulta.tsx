import { ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react';
import { formatarData, formatarHora } from '@guarusolar/compartilhado';
import { urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** O mínimo de uma foto de serviço para mostrar e ampliar (ficha do projeto, visitas técnicas). */
export type FotoParaConsulta = { id: string; chave: string | null; rotulo: string | null; capturadaEm?: string | null };

export const rotuloDaFoto = (f: FotoParaConsulta) => f.rotulo ?? (f.chave ? f.chave.replace(/_/g, ' ') : 'Foto extra');

/** Foto ampliada só para consulta. ← e → navegam; Esc fecha (Dialog do Radix). */
export function FotoAmpliadaConsulta({
  aberta,
  onIndice,
  onFechar,
}: {
  aberta: { fotos: FotoParaConsulta[]; indice: number } | null;
  onIndice: (indice: number) => void;
  onFechar: () => void;
}) {
  const foto = aberta ? aberta.fotos[aberta.indice] : null;
  const ir = (passo: number) => aberta && onIndice((aberta.indice + passo + aberta.fotos.length) % aberta.fotos.length);
  return (
    <Dialog open={foto !== null} onOpenChange={(abrir) => !abrir && onFechar()}>
      {foto && aberta && (
        <DialogContent
          className="flex max-h-[94vh] flex-col gap-3 bg-card p-4 sm:max-w-[min(1100px,94vw)]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') ir(1);
            else if (e.key === 'ArrowLeft') ir(-1);
            else return;
            e.preventDefault();
          }}
        >
          <div className="flex items-baseline justify-between gap-4 pr-10">
            <DialogTitle className="font-sans text-base font-semibold tracking-normal">{rotuloDaFoto(foto)}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {aberta.indice + 1} de {aberta.fotos.length}
              {foto.capturadaEm && ` · ${formatarData(foto.capturadaEm)} ${formatarHora(foto.capturadaEm)}`}
            </DialogDescription>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-lg bg-[#0B2F5E]">
            <ImagemProtegida
              key={foto.id}
              src={urlDaFoto(foto.id)}
              alt={rotuloDaFoto(foto)}
              className="max-h-[72vh] max-w-full object-contain"
              carregando={<Loader2 className="my-24 size-8 animate-spin text-white/70" aria-hidden />}
              emErro={<ImageOff className="my-24 size-8 text-white/70" aria-hidden />}
            />
            {aberta.fotos.length > 1 && (
              <>
                <Button variant="outline" size="icon" className="absolute left-3 rounded-full bg-card" onClick={() => ir(-1)} aria-label="Foto anterior">
                  <ChevronLeft aria-hidden />
                </Button>
                <Button variant="outline" size="icon" className="absolute right-3 rounded-full bg-card" onClick={() => ir(1)} aria-label="Próxima foto">
                  <ChevronRight aria-hidden />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
