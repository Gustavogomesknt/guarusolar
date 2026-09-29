import { AlertTriangle } from 'lucide-react';
import { ROTULO_STATUS_AGENDAMENTO, type StatusAgendamento } from '@guarusolar/compartilhado';
import { cn } from '@/lib/utils';

/*
 * O selo preenchido é do tipo de serviço (cores da agenda). O status é texto com uma bolinha,
 * para os dois nunca se confundirem. Só "Refazer fotos" vira selo: é o que pede atenção
 * (laranja como borda e fundo claro, nunca fundo laranja com texto branco).
 */
const BOLINHA: Partial<Record<StatusAgendamento, string>> = {
  AGENDADO: 'bg-[#8593A5]',
  EM_EXECUCAO: 'bg-primary',
  AGUARDANDO_VALIDACAO: 'bg-sidebar',
};

export function SeloStatus({ status, className }: { status: StatusAgendamento; className?: string }) {
  if (status === 'DEVOLVIDO') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-destaque bg-destaque-suave px-2.5 py-1 text-xs font-semibold text-destaque-texto',
          className,
        )}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {ROTULO_STATUS_AGENDAMENTO[status]}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80', className)}>
      <span aria-hidden className={cn('size-2 rounded-full', BOLINHA[status] ?? 'bg-muted-foreground')} />
      {ROTULO_STATUS_AGENDAMENTO[status]}
    </span>
  );
}
