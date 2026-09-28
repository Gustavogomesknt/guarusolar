import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ROTULO_STATUS_ORCAMENTO,
  TRANSICOES_STATUS,
  type StatusOrcamento,
} from '@guarusolar/compartilhado';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CORES_STATUS } from './coresStatus';

type Orcamento = { id: string; codigo: string; status: StatusOrcamento };

/** Selo do status (texto escuro sobre fundo claro). */
export function SeloStatus({ status, className }: { status: StatusOrcamento; className?: string }) {
  const cores = CORES_STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex h-[34px] items-center rounded-full px-3 text-[13px] font-semibold',
        cores.fundo,
        cores.texto,
        className,
      )}
    >
      {ROTULO_STATUS_ORCAMENTO[status]}
    </span>
  );
}

/**
 * Selo que abre o menu com as transições válidas (mesmo mapa da API).
 * Recusar pede o motivo; aprovar pede confirmação, porque cria o projeto e não tem volta.
 */
export function MenuStatus({ orcamento }: { orcamento: Orcamento }) {
  const clienteConsultas = useQueryClient();
  const [pedindo, setPedindo] = useState<'RECUSADO' | 'APROVADO' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const destinos = TRANSICOES_STATUS[orcamento.status];
  const cores = CORES_STATUS[orcamento.status];

  const mudar = useMutation({
    mutationFn: ({ status, observacao }: { status: StatusOrcamento; observacao?: string }) =>
      api.patch(`/api/orcamentos/${orcamento.id}/status`, { status, observacao }),
    onSuccess: (_resposta, { status }) => {
      toast.success(`${orcamento.codigo} agora está ${ROTULO_STATUS_ORCAMENTO[status].toLowerCase()}`);
      setPedindo(null);
      setMotivo('');
      // lista, contagens dos filtros e indicadores
      return clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] });
    },
  });

  function escolher(status: StatusOrcamento) {
    if (status === 'RECUSADO' || status === 'APROVADO') {
      setErroMotivo(null);
      setPedindo(status);
      return;
    }
    mudar.mutate({ status });
  }

  function confirmarRecusa() {
    if (motivo.trim().length < 3) {
      setErroMotivo('Conte em poucas palavras por que o cliente recusou');
      return;
    }
    mudar.mutate({ status: 'RECUSADO', observacao: motivo.trim() });
  }

  if (destinos.length === 0) {
    return <SeloStatus status={orcamento.status} />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Status: ${ROTULO_STATUS_ORCAMENTO[orcamento.status]}. Alterar status de ${orcamento.codigo}`}
            disabled={mudar.isPending}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex h-[34px] items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[13px] font-semibold',
              'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
              cores.fundo,
              cores.texto,
            )}
          >
            {ROTULO_STATUS_ORCAMENTO[orcamento.status]}
            {mudar.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" strokeWidth={2.5} aria-hidden />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Mover para
          </DropdownMenuLabel>
          {destinos.map((destino) => (
            <DropdownMenuItem key={destino} onSelect={() => escolher(destino)} className="h-10 gap-2.5 rounded-lg text-sm">
              <span className={cn('size-2.5 rounded-full', CORES_STATUS[destino].ponto)} aria-hidden />
              {ROTULO_STATUS_ORCAMENTO[destino]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pedindo !== null} onOpenChange={(aberto) => !aberto && !mudar.isPending && setPedindo(null)}>
        <DialogContent className="bg-card sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          {pedindo === 'RECUSADO' ? (
            <>
              <DialogHeader>
                <DialogTitle>Recusar {orcamento.codigo}?</DialogTitle>
                <DialogDescription>O motivo fica no histórico e ajuda a entender as recusas.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`motivo-${orcamento.id}`}>Motivo da recusa</Label>
                <Textarea
                  id={`motivo-${orcamento.id}`}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    setErroMotivo(null);
                  }}
                  rows={3}
                  placeholder="Ex.: fechou com outra empresa, achou o valor alto…"
                  aria-invalid={erroMotivo ? true : undefined}
                  aria-describedby={erroMotivo ? `motivo-${orcamento.id}-erro` : undefined}
                  className="rounded-[10px]"
                />
                {erroMotivo && (
                  <p id={`motivo-${orcamento.id}-erro`} className="text-[13px] text-destructive">
                    {erroMotivo}
                  </p>
                )}
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>Aprovar {orcamento.codigo}?</DialogTitle>
              <DialogDescription>
                O orçamento vira um projeto na fila de agendamento e não pode mais ser editado nem
                mudar de status.
              </DialogDescription>
            </DialogHeader>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setPedindo(null)} disabled={mudar.isPending}>
              Cancelar
            </Button>
            <Button
              variant={pedindo === 'RECUSADO' ? 'destructive' : 'default'}
              className="h-11 rounded-[10px]"
              disabled={mudar.isPending}
              onClick={() => (pedindo === 'RECUSADO' ? confirmarRecusa() : mudar.mutate({ status: 'APROVADO' }))}
            >
              {mudar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {pedindo === 'RECUSADO' ? 'Recusar orçamento' : 'Aprovar e criar projeto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
