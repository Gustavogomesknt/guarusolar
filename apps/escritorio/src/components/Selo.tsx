import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Selo curto (status, "Em breve"...). A variante "destaque" usa o laranja só na borda,
 * com fundo claro e texto escuro — nunca laranja de fundo com texto branco.
 */
export function Selo({
  children,
  variante = 'neutro',
  className,
}: {
  children: ReactNode;
  variante?: 'neutro' | 'destaque';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        variante === 'destaque'
          ? 'border-destaque bg-destaque-suave text-destaque-texto'
          : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
