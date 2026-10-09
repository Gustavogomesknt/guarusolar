import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ROTEIRO_DO_SERVICO, TIPOS_SERVICO_AGENDAVEIS, type TipoServico } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { EquipeNaAgenda, ProjetoPendente } from '@/lib/tipos';
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
import { fimDoServico, diaDeHoje, nomeLongo, type Dia } from '@guarusolar/compartilhado';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import { AvisosDeConflito, escalaPadrao, QuemVai, useAvisosDeConflito, useTecnicos } from './escala';

export const CLASSE_SELECT =
  'h-11 w-full rounded-[10px] border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

export type PreAgendamento = { projetoId?: string; equipeId?: string; dia?: Dia };

/** O que a validação das fotos faz com o projeto, conforme o tipo (o gestor escolhe sabendo). */
export const EFEITO_DA_VALIDACAO: Record<(typeof ROTEIRO_DO_SERVICO)[TipoServico]['aoValidar'], string> = {
  A_AGENDAR: 'Ao validar: sem instalação agendada, o projeto volta para "A agendar".',
  AGUARDANDO_CONCLUSAO: 'Ao validar o último serviço pendente: o projeto fica "Aguardando conclusão"; quem conclui é você.',
  NAO_MEXE: 'Ao validar: a situação do projeto não muda.',
};

/**
 * Agendar um projeto aprovado. Aberto pela grade (dia clicado, já com equipe e data) ou pelo
 * botão "Novo agendamento" (tudo em branco). A duração não existe na API: pergunta quantos
 * dias, com 1 como padrão, e manda o último dia como dataFim.
 * "Quem vai" já vem com os técnicos da equipe (a composição padrão): agendar o caso normal não
 * ganha clique nenhum. Conflito de equipe ou de pessoa AVISA e não bloqueia (regra 8).
 */
export function DialogAgendar({
  aberto,
  inicial,
  projetos,
  equipes,
  onFechar,
  onAgendado,
}: {
  aberto: boolean;
  inicial: PreAgendamento;
  projetos: ProjetoPendente[];
  equipes: EquipeNaAgenda[];
  onFechar: () => void;
  onAgendado: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const tecnicos = useTecnicos();
  const [projetoId, setProjetoId] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [dia, setDia] = useState<Dia>('');
  const [tipo, setTipo] = useState<TipoServico>('INSTALACAO');
  const [dias, setDias] = useState('1');
  const [escala, setEscala] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setProjetoId(inicial.projetoId ?? projetos[0]?.id ?? '');
    setEquipeId(inicial.equipeId ?? equipes[0]?.id ?? '');
    setDia(inicial.dia ?? diaDeHoje());
    setTipo('INSTALACAO');
    setDias('1');
    setErro(null);
  }, [aberto, inicial, projetos, equipes]);

  // a escala começa pela composição padrão da equipe escolhida (e recomeça ao trocar de equipe)
  const todos = tecnicos.data;
  useEffect(() => {
    if (aberto && todos && equipeId) setEscala(escalaPadrao(equipeId, todos));
  }, [aberto, equipeId, todos]);

  const quantidade = Math.max(1, Math.min(30, Math.trunc(Number(dias) || 1)));
  const fim = dia ? fimDoServico(dia, quantidade) : '';
  const projeto = projetos.find((p) => p.id === projetoId);
  const avisos = useAvisosDeConflito({ equipeId, inicio: dia, fim, tecnicos: escala, ativo: aberto });

  const agendar = useMutation({
    mutationFn: () => api.post('/api/agenda', { projetoId, equipeId, tipo, dataInicio: dia, dataFim: fim, tecnicos: escala }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: () => {
      const equipe = equipes.find((e) => e.id === equipeId)?.nome;
      toast.success(`${projeto?.cliente.nome ?? 'Serviço'} agendado para ${equipe} em ${nomeLongo(dia)}`);
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
      onAgendado();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível agendar. Tente novamente.'),
  });

  // sem a lista de técnicos a escala iria vazia: espera carregar
  const podeEnviar = projetoId && equipeId && dia && !agendar.isPending && todos !== undefined;

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !agendar.isPending && onFechar()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto bg-card sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            if (podeEnviar) agendar.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Agendar serviço</DialogTitle>
            <DialogDescription>
              {projeto
                ? `${projeto.cliente.nome} · ${projeto.orcamento.codigo}`
                : 'Escolha o projeto aprovado, a equipe e o dia.'}
            </DialogDescription>
          </DialogHeader>

          <Campo id="ag-projeto" rotulo="Projeto">
            <select id="ag-projeto" value={projetoId} onChange={(e) => setProjetoId(e.target.value)} className={CLASSE_SELECT}>
              {projetos.length === 0 && <option value="">Nenhum projeto aguardando data</option>}
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cliente.nome} · {p.orcamento.codigo}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="ag-tipo" rotulo="Tipo de serviço" obrigatorio ajuda={EFEITO_DA_VALIDACAO[ROTEIRO_DO_SERVICO[tipo].aoValidar]}>
              <select id="ag-tipo" required value={tipo} onChange={(e) => setTipo(e.target.value as TipoServico)} className={CLASSE_SELECT}>
                {TIPOS_SERVICO_AGENDAVEIS.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_SERVICO_AGENDA[t].rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="ag-equipe" rotulo="Equipe">
              <select id="ag-equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className={CLASSE_SELECT}>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="ag-dia" rotulo="Primeiro dia">
              <Input id="ag-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-11 rounded-[10px]" />
            </Campo>
            <Campo id="ag-dias" rotulo="Duração (dias)" ajuda={fim && quantidade > 1 ? `Termina ${nomeLongo(fim)}` : 'Um dia, por padrão'}>
              <Input
                id="ag-dias"
                type="number"
                min={1}
                max={30}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                className="h-11 rounded-[10px]"
              />
            </Campo>
          </div>

          {todos ? (
            <QuemVai equipeId={equipeId} equipes={equipes} tecnicos={todos} selecionados={escala} onChange={setEscala} />
          ) : (
            <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Carregando os técnicos…
            </p>
          )}

          <AvisosDeConflito avisos={avisos.data} />

          {erro && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11 rounded-[10px]" onClick={onFechar} disabled={agendar.isPending}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11 rounded-[10px] font-semibold" disabled={!podeEnviar}>
              {agendar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {avisos.data?.length ? 'Agendar assim mesmo' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
