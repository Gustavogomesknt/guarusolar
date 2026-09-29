import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  podeMudarStatus,
  ROTULO_STATUS_ORCAMENTO,
  TRANSICOES_STATUS,
  type StatusOrcamento,
} from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { OrcamentoNaLista } from '@/lib/tipos';
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

export type OrcamentoComStatus = { id: string; codigo: string; status: StatusOrcamento };
export type PedirMudanca = (orcamento: OrcamentoComStatus, destino: StatusOrcamento) => void;

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
 * Mudança de status compartilhada pela lista e pelo pipeline (menu, botões rápidos e
 * arrastar e soltar). Recusar pede o motivo; aprovar pede confirmação, porque cria o
 * projeto e não tem volta. A tela muda na hora (otimista); se a API recusar, volta ao
 * status anterior com um aviso.
 */
export function useMudancaDeStatus(): { pedir: PedirMudanca; dialogo: ReactNode; pendenteId: string | null } {
  const clienteConsultas = useQueryClient();
  const [pedindo, setPedindo] = useState<{ orcamento: OrcamentoComStatus; destino: 'RECUSADO' | 'APROVADO' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);

  const mudar = useMutation({
    mutationFn: ({ orcamento, destino, observacao }: { orcamento: OrcamentoComStatus; destino: StatusOrcamento; observacao?: string }) =>
      api.patch(`/api/orcamentos/${orcamento.id}/status`, { status: destino, observacao }),
    meta: { erroTratadoNoFormulario: true },
    onMutate: async ({ orcamento, destino }) => {
      // atualização otimista em todas as listagens carregadas (lista e pipeline)
      await clienteConsultas.cancelQueries({ queryKey: ['orcamentos', 'lista'] });
      const anteriores = clienteConsultas.getQueriesData<OrcamentoNaLista[]>({ queryKey: ['orcamentos', 'lista'] });
      clienteConsultas.setQueriesData<OrcamentoNaLista[]>({ queryKey: ['orcamentos', 'lista'] }, (lista) =>
        lista?.map((o) => (o.id === orcamento.id ? { ...o, status: destino } : o)),
      );
      return { anteriores };
    },
    onSuccess: (_r, { orcamento, destino }) => {
      toast.success(`${orcamento.codigo} agora está ${ROTULO_STATUS_ORCAMENTO[destino].toLowerCase()}`);
      setPedindo(null);
      setMotivo('');
    },
    onError: (erro, { orcamento }, contexto) => {
      // devolve o cartão/linha ao status anterior
      contexto?.anteriores.forEach(([chave, dados]: [QueryKey, OrcamentoNaLista[] | undefined]) =>
        clienteConsultas.setQueryData(chave, dados),
      );
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(`Não foi possível mudar ${orcamento.codigo}: ${erro instanceof ErroApi ? erro.message : 'tente novamente.'}`);
      }
    },
    // lista, contagens dos filtros, pipeline e indicadores
    onSettled: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] });
      // aprovar cria o projeto: ele passa a aparecer em "A agendar"
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
    },
  });

  const pedir: PedirMudanca = (orcamento, destino) => {
    if (orcamento.status === destino || !podeMudarStatus(orcamento.status, destino)) return;
    if (destino === 'RECUSADO' || destino === 'APROVADO') {
      setErroMotivo(null);
      setMotivo('');
      setPedindo({ orcamento, destino });
      return;
    }
    mudar.mutate({ orcamento, destino });
  };

  function confirmar() {
    if (!pedindo) return;
    if (pedindo.destino === 'RECUSADO') {
      if (motivo.trim().length < 3) {
        setErroMotivo('Conte em poucas palavras por que o cliente recusou');
        return;
      }
      mudar.mutate({ orcamento: pedindo.orcamento, destino: 'RECUSADO', observacao: motivo.trim() });
    } else {
      mudar.mutate({ orcamento: pedindo.orcamento, destino: 'APROVADO' });
    }
  }

  const codigo = pedindo?.orcamento.codigo;
  const idMotivo = 'motivo-recusa';

  const dialogo = (
    <Dialog open={pedindo !== null} onOpenChange={(aberto) => !aberto && !mudar.isPending && setPedindo(null)}>
      <DialogContent className="bg-card sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        {pedindo?.destino === 'RECUSADO' ? (
          <>
            <DialogHeader>
              <DialogTitle>Recusar {codigo}?</DialogTitle>
              <DialogDescription>O motivo fica no histórico e ajuda a entender as recusas.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idMotivo}>Motivo da recusa</Label>
              <Textarea
                id={idMotivo}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setErroMotivo(null);
                }}
                rows={3}
                placeholder="Ex.: fechou com outra empresa, achou o valor alto…"
                aria-invalid={erroMotivo ? true : undefined}
                aria-describedby={erroMotivo ? `${idMotivo}-erro` : undefined}
                className="rounded-[10px]"
              />
              {erroMotivo && (
                <p id={`${idMotivo}-erro`} className="text-[13px] text-destructive">
                  {erroMotivo}
                </p>
              )}
            </div>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>Aprovar {codigo}?</DialogTitle>
            <DialogDescription>
              O orçamento vira um projeto na fila de agendamento e não pode mais ser editado nem mudar
              de status.
            </DialogDescription>
          </DialogHeader>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setPedindo(null)} disabled={mudar.isPending}>
            Cancelar
          </Button>
          <Button
            variant={pedindo?.destino === 'RECUSADO' ? 'destructive' : 'default'}
            className="h-11 rounded-[10px]"
            disabled={mudar.isPending}
            onClick={confirmar}
          >
            {mudar.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {pedindo?.destino === 'RECUSADO' ? 'Recusar orçamento' : 'Aprovar e criar projeto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pedir, dialogo, pendenteId: mudar.isPending ? mudar.variables?.orcamento.id ?? null : null };
}

/**
 * Selo que abre o menu com as transições válidas (mesmo mapa da API). Funciona por
 * teclado (Enter/Espaço abre, setas escolhem): é a alternativa acessível ao arrasto.
 */
export function MenuStatus({
  orcamento,
  pedir,
  pendente = false,
}: {
  orcamento: OrcamentoComStatus;
  pedir: PedirMudanca;
  pendente?: boolean;
}) {
  const destinos = TRANSICOES_STATUS[orcamento.status];
  const cores = CORES_STATUS[orcamento.status];

  if (destinos.length === 0) return <SeloStatus status={orcamento.status} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${ROTULO_STATUS_ORCAMENTO[orcamento.status]}. Alterar status de ${orcamento.codigo}`}
          disabled={pendente}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex h-[34px] items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[13px] font-semibold',
            'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            cores.fundo,
            cores.texto,
          )}
        >
          {ROTULO_STATUS_ORCAMENTO[orcamento.status]}
          {pendente ? (
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
          <DropdownMenuItem
            key={destino}
            onSelect={() => pedir(orcamento, destino)}
            className="h-10 gap-2.5 rounded-lg text-sm"
          >
            <span className={cn('size-2.5 rounded-full', CORES_STATUS[destino].ponto)} aria-hidden />
            {ROTULO_STATUS_ORCAMENTO[destino]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
