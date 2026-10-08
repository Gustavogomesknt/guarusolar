import { AlertTriangle } from 'lucide-react';
import { ROTULO_STATUS_AGENDAMENTO, type StatusAgendamento } from '@guarusolar/compartilhado';

/*
 * Situação do serviço agendado, IGUAL em todas as telas (agenda e serviço do técnico, agenda,
 * ficha do projeto e validação do escritório). O selo preenchido é do TIPO de serviço (cores da
 * agenda); a situação é texto com uma bolinha, para os dois nunca se confundirem. Só "Refazer
 * fotos" vira selo, porque pede atenção (laranja como borda e fundo claro, nunca fundo laranja
 * com texto branco). Verde só para Concluído, como em orçamento e projeto.
 */
const BOLINHA: Record<StatusAgendamento, string> = {
  AGENDADO: 'bg-[#8593A5]',
  EM_EXECUCAO: 'bg-primary',
  AGUARDANDO_VALIDACAO: 'bg-sidebar',
  DEVOLVIDO: 'bg-destaque',
  APROVADO: 'bg-sucesso',
  CANCELADO: 'bg-muted-foreground/50',
};

export function SituacaoServico({
  status,
  className = '',
  soBolinha = false,
}: {
  status: StatusAgendamento;
  className?: string;
  /** bloco compacto da agenda: só o sinal, com o texto para leitor de tela e na dica do mouse */
  soBolinha?: boolean;
}) {
  if (soBolinha) {
    return (
      <span title={ROTULO_STATUS_AGENDAMENTO[status]} className={`inline-flex shrink-0 items-center ${className}`}>
        {status === 'DEVOLVIDO' ? (
          <AlertTriangle className="size-3.5 text-destaque-texto" aria-hidden />
        ) : (
          <span aria-hidden className={`size-2 rounded-full ${BOLINHA[status]}`} />
        )}
        <span className="sr-only">{ROTULO_STATUS_AGENDAMENTO[status]}</span>
      </span>
    );
  }
  if (status === 'DEVOLVIDO') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-destaque bg-destaque-suave px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-destaque-texto ${className}`}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {ROTULO_STATUS_AGENDAMENTO[status]}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-foreground/80 ${className}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${BOLINHA[status]}`} />
      {ROTULO_STATUS_AGENDAMENTO[status]}
    </span>
  );
}
