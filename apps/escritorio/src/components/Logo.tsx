import { Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícone de sol provisório até o cliente enviar o arquivo do logo (pendência no CLAUDE.md).
export function Logo({ claro = false, className }: { claro?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Sun className="size-7 text-destaque" strokeWidth={2.25} aria-hidden />
      <span
        className={cn(
          'font-titulo text-xl font-bold tracking-tight',
          claro ? 'text-white' : 'text-sidebar',
        )}
      >
        Guarusolar
      </span>
    </div>
  );
}
