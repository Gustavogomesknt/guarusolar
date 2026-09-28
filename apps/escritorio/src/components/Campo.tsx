import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Rótulo + campo + mensagem de erro, com os ids ligados para leitores de tela. */
export function Campo({
  id,
  rotulo,
  obrigatorio = false,
  erro,
  ajuda,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground/80">
        {rotulo}
        {obrigatorio && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-[13px] text-destructive">
          {erro}
        </p>
      ) : (
        ajuda && <p className="text-[13px] text-muted-foreground">{ajuda}</p>
      )}
    </div>
  );
}

/** Props de acessibilidade para o input dentro de um <Campo>. */
export const ariaDoCampo = (id: string, erro?: string) => ({
  id,
  'aria-invalid': erro ? true : undefined,
  'aria-describedby': erro ? `${id}-erro` : undefined,
});
