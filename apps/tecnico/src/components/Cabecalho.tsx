import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barra azul-escura do topo (protótipo "Técnico — concluir serviço"). Fica presa no alto e
 * respeita o recorte da câmera do iPhone (safe-area).
 */
export function Cabecalho({
  titulo,
  subtitulo,
  voltarPara,
  acoes,
  className,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  voltarPara?: string;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex items-center gap-2 bg-sidebar px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white',
        className,
      )}
    >
      {voltarPara && (
        <Link
          to={voltarPara}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-sidebar-ring"
        >
          <ChevronLeft className="size-6" aria-hidden />
          <span className="sr-only">Voltar</span>
        </Link>
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', !voltarPara && 'pl-1')}>
        <h1 className="truncate text-xl font-bold">{titulo}</h1>
        {subtitulo && <p className="truncate text-xs text-[#CBDBF0]">{subtitulo}</p>}
      </div>
      {acoes}
    </header>
  );
}
