import { ROTULO_STATUS_PROJETO, type StatusProjeto } from '@guarusolar/compartilhado';
import { cn } from '@/lib/utils';

/**
 * Cores da situação da obra, no mesmo formato dos selos de orçamento: texto escuro sobre fundo
 * claro. Verde só para Concluído (como Aprovado); cancelado fica neutro, sem vermelho.
 */
export const CORES_PROJETO: Record<StatusProjeto, { fundo: string; texto: string }> = {
  AGUARDANDO_AGENDAMENTO: { fundo: 'bg-[#FDEBD6]', texto: 'text-[#8A4B07]' },
  AGENDADO: { fundo: 'bg-[#E1EAF7]', texto: 'text-[#23508F]' },
  EM_EXECUCAO: { fundo: 'bg-[#D6E2F3]', texto: 'text-[#0B2F5E]' },
  AGUARDANDO_VALIDACAO: { fundo: 'bg-[#FFF1C7]', texto: 'text-[#6E4E00]' },
  // quase lá: falta só o gestor concluir (ainda não é verde: verde é só Concluído)
  AGUARDANDO_CONCLUSAO: { fundo: 'bg-[#E3F1EC]', texto: 'text-[#1F5A4A]' },
  CONCLUIDO: { fundo: 'bg-[#DCF0E3]', texto: 'text-[#17653E]' },
  CANCELADO: { fundo: 'bg-[#E7EBF2]', texto: 'text-[#414F60]' },
};

export function SeloProjeto({ status, className }: { status: StatusProjeto; className?: string }) {
  const cores = CORES_PROJETO[status];
  return (
    <span className={cn('inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap', cores.fundo, cores.texto, className)}>
      {ROTULO_STATUS_PROJETO[status]}
    </span>
  );
}
