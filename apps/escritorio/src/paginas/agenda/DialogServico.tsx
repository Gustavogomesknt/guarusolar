import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@/lib/api';
import type { AgendamentoNaAgenda, EquipeNaAgenda } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/Campo';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { diaDaApi, diasUteis, fimDoServico, nomeLongo, type Dia } from './datas';
import { TIPOS_SERVICO_AGENDA } from './tiposServico';
import { CLASSE_SELECT } from './DialogAgendar';

type Modo = 'ver' | 'remarcar' | 'cancelar';

/** Detalhes de um serviço agendado, com remarcar e cancelar (PATCH /api/agenda/:id). */
export function DialogServico({
  servico,
  equipes,
  onFechar,
}: {
  servico: AgendamentoNaAgenda | null;
  equipes: EquipeNaAgenda[];
  onFechar: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const [modo, setModo] = useState<Modo>('ver');
  const [equipeId, setEquipeId] = useState('');
  const [dia, setDia] = useState<Dia>('');
  const [dias, setDias] = useState('1');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!servico) return;
    setModo('ver');
    setEquipeId(servico.equipeId);
    setDia(diaDaApi(servico.dataInicio));
    setDias(String(diasUteis(diaDaApi(servico.dataInicio), diaDaApi(servico.dataFim))));
    setErro(null);
  }, [servico]);

  const alterar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => api.patch(`/api/agenda/${servico!.id}`, corpo),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (_r, corpo) => {
      toast.success(
        corpo.status === 'CANCELADO'
          ? `Serviço de ${servico!.projeto.cliente.nome} cancelado. O projeto voltou para "A agendar".`
          : `Serviço de ${servico!.projeto.cliente.nome} remarcado para ${nomeLongo(dia)}`,
      );
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
      onFechar();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível alterar o serviço.'),
  });

  if (!servico) return null;
  const tipo = TIPOS_SERVICO_AGENDA[servico.tipo];
  const inicio = diaDaApi(servico.dataInicio);
  const fim = diaDaApi(servico.dataFim);
  const equipe = equipes.find((e) => e.id === servico.equipeId);
  const quantidade = Math.max(1, Math.min(30, Math.trunc(Number(dias) || 1)));
  const novoFim = dia ? fimDoServico(dia, quantidade) : '';
  const cidade = [servico.projeto.cliente.cidade, servico.projeto.cliente.uf].filter(Boolean).join('/');

  return (
    <Dialog open onOpenChange={(a) => !a && !alterar.isPending && onFechar()}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <span className={cn('self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold', tipo.fundo, tipo.borda, tipo.texto)}>
            {tipo.rotulo}
          </span>
          <DialogTitle>{servico.projeto.cliente.nome}</DialogTitle>
          <DialogDescription>
            {[cidade, servico.projeto.codigo].filter(Boolean).join(' · ')} ·{' '}
            <Link to={`/orcamentos/${servico.projeto.orcamento.id}`} className="text-primary underline-offset-2 hover:underline">
              {servico.projeto.orcamento.codigo}
            </Link>
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-[10px] bg-background px-4 py-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Equipe</dt>
            <dd className="font-medium">{equipe?.nome ?? servico.equipeId}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Quando</dt>
            <dd className="font-medium">{inicio === fim ? nomeLongo(inicio) : `${nomeLongo(inicio)} a ${nomeLongo(fim)}`}</dd>
          </div>
        </dl>

        {modo === 'remarcar' && (
          <form
            id="form-remarcar"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              alterar.mutate({ equipeId, dataInicio: dia, dataFim: novoFim });
            }}
            className="flex flex-col gap-3"
          >
            <Campo id="rm-equipe" rotulo="Equipe">
              <select id="rm-equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className={CLASSE_SELECT}>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="rm-dia" rotulo="Primeiro dia">
                <Input id="rm-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-11 rounded-[10px]" />
              </Campo>
              <Campo id="rm-dias" rotulo="Duração (dias)" ajuda={novoFim && quantidade > 1 ? `Termina ${nomeLongo(novoFim)}` : undefined}>
                <Input id="rm-dias" type="number" min={1} max={30} value={dias} onChange={(e) => setDias(e.target.value)} className="h-11 rounded-[10px]" />
              </Campo>
            </div>
          </form>
        )}

        {modo === 'cancelar' && (
          <p className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            Cancelar tira o serviço da agenda da equipe e devolve o projeto para "A agendar". O
            orçamento aprovado e o projeto continuam.
          </p>
        )}

        {erro && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <DialogFooter className="gap-2">
          {modo === 'ver' && (
            <>
              <Button variant="ghost" className="h-11 rounded-[10px] text-muted-foreground" onClick={() => setModo('cancelar')}>
                Cancelar serviço
              </Button>
              <Button className="h-11 rounded-[10px] font-semibold" onClick={() => setModo('remarcar')}>
                Remarcar
              </Button>
            </>
          )}
          {modo === 'remarcar' && (
            <>
              <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setModo('ver')} disabled={alterar.isPending}>
                Voltar
              </Button>
              <Button type="submit" form="form-remarcar" className="h-11 rounded-[10px] font-semibold" disabled={alterar.isPending || !dia}>
                {alterar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Salvar nova data
              </Button>
            </>
          )}
          {modo === 'cancelar' && (
            <>
              <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setModo('ver')} disabled={alterar.isPending}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                className="h-11 rounded-[10px]"
                disabled={alterar.isPending}
                onClick={() => alterar.mutate({ status: 'CANCELADO' })}
              >
                {alterar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Cancelar serviço
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
