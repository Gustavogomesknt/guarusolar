import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@guarusolar/web/api';
import { SituacaoServico } from '@guarusolar/web/SituacaoServico';
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
import { diaDaApi, diasUteis, fimDoServico, nomeLongo, ROTEIRO_DO_SERVICO, TIPOS_SERVICO_AGENDAVEIS, type Dia, type TipoServico } from '@guarusolar/compartilhado';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import { CLASSE_SELECT, EFEITO_DA_VALIDACAO } from './DialogAgendar';
import { AvisosDeConflito, escalaPadrao, nomesDaEscala, QuemVai, SemTecnicoEscalado, useAvisosDeConflito, useTecnicos } from './escala';

type Modo = 'ver' | 'remarcar' | 'escala' | 'cancelar';
const EM_ABERTO = ['AGENDADO', 'EM_EXECUCAO', 'DEVOLVIDO'];

/**
 * Detalhes de um serviço agendado: quem vai (com "Trocar"), remarcar e cancelar
 * (PATCH /api/agenda/:id). A escala só muda com o serviço em aberto.
 */
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
  const tecnicos = useTecnicos();
  const [modo, setModo] = useState<Modo>('ver');
  const [equipeId, setEquipeId] = useState('');
  const [dia, setDia] = useState<Dia>('');
  const [dias, setDias] = useState('1');
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoServico>('INSTALACAO');
  const [escala, setEscala] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!servico) return;
    setModo('ver');
    setEquipeId(servico.equipeId);
    setDia(diaDaApi(servico.dataInicio));
    setDias(String(diasUteis(diaDaApi(servico.dataInicio), diaDaApi(servico.dataFim))));
    setEscala(servico.escala.map((e) => e.usuario.id));
    setTipoEscolhido(servico.tipo);
    setErro(null);
  }, [servico]);

  const quantidade = Math.max(1, Math.min(30, Math.trunc(Number(dias) || 1)));
  const novoFim = dia ? fimDoServico(dia, quantidade) : '';
  const mudouDeEquipe = servico !== null && equipeId !== servico.equipeId;
  // Remarcando para outra equipe, a escala passa a ser a composição padrão dela (a API faz o mesmo)
  const escalaDepois =
    modo === 'remarcar' && mudouDeEquipe && tecnicos.data ? escalaPadrao(equipeId, tecnicos.data) : modo === 'escala' ? escala : (servico?.escala.map((e) => e.usuario.id) ?? []);
  const avisos = useAvisosDeConflito({
    equipeId,
    inicio: modo === 'remarcar' ? dia : servico ? diaDaApi(servico.dataInicio) : '',
    fim: modo === 'remarcar' ? novoFim : servico ? diaDaApi(servico.dataFim) : '',
    tecnicos: escalaDepois,
    ignorar: servico?.id,
    ativo: servico !== null && (modo === 'remarcar' || modo === 'escala'),
  });

  const alterar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => api.patch(`/api/agenda/${servico!.id}`, corpo),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (_r, corpo) => {
      const cliente = servico!.projeto.cliente.nome;
      toast.success(
        corpo.status === 'CANCELADO'
          ? `Serviço de ${cliente} cancelado. O projeto voltou para "A agendar".`
          : corpo.tecnicos
            ? `Escala de ${cliente} atualizada`
            : `Serviço de ${cliente} atualizado: ${nomeLongo(dia)}`,
      );
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['projetos'] });
      onFechar();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível alterar o serviço.'),
  });

  if (!servico) return null;
  const tipo = TIPOS_SERVICO_AGENDA[servico.tipo];
  const inicio = diaDaApi(servico.dataInicio);
  const fim = diaDaApi(servico.dataFim);
  const equipe = equipes.find((e) => e.id === servico.equipeId);
  const cidade = [servico.projeto.cliente.cidade, servico.projeto.cliente.uf].filter(Boolean).join('/');
  const emAberto = EM_ABERTO.includes(servico.status);
  const equipeNova = equipes.find((e) => e.id === equipeId);

  return (
    <Dialog open onOpenChange={(a) => !a && !alterar.isPending && onFechar()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto bg-card sm:max-w-lg">
        <DialogHeader>
          <span className={cn('self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold', tipo.fundo, tipo.borda, tipo.texto)}>
            {tipo.rotulo}
          </span>
          <DialogTitle>{servico.projeto.cliente.nome}</DialogTitle>
          <DialogDescription>
            {cidade && `${cidade} · `}
            <Link to={`/projetos/${servico.projetoId}`} className="text-primary underline-offset-2 hover:underline">
              {servico.projeto.codigo}
            </Link>{' '}
            ·{' '}
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
          <div className="col-span-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Quem vai</dt>
              <dd className="font-medium">{servico.escala.length > 0 ? nomesDaEscala(servico.escala) : <SemTecnicoEscalado className="text-sm" />}</dd>
            </div>
            {modo === 'ver' && emAberto && (
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 rounded-[10px] bg-card" onClick={() => setModo('escala')}>
                Trocar
              </Button>
            )}
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Situação</dt>
            <dd className="mt-0.5">
              <SituacaoServico status={servico.status} />
            </dd>
          </div>
        </dl>

        {modo === 'escala' && (
          <form
            id="form-escala"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              alterar.mutate({ tecnicos: escala });
            }}
            className="flex flex-col gap-3"
          >
            {tecnicos.data ? (
              <QuemVai equipeId={servico.equipeId} equipes={equipes} tecnicos={tecnicos.data} selecionados={escala} onChange={setEscala} />
            ) : (
              <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Carregando os técnicos…
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Quem sair deixa de ver este serviço no app na hora; quem entrar passa a ver, com as fotos já enviadas.
            </p>
          </form>
        )}

        {modo === 'remarcar' && (
          <form
            id="form-remarcar"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              alterar.mutate({ equipeId, dataInicio: dia, dataFim: novoFim, ...(tipoEscolhido !== servico.tipo ? { tipo: tipoEscolhido } : {}) });
            }}
            className="flex flex-col gap-3"
          >
            {/* o tipo define o roteiro de fotos: só muda antes de o técnico começar */}
            <Campo
              id="rm-tipo"
              rotulo="Tipo de serviço"
              obrigatorio
              ajuda={servico.status === 'AGENDADO' ? EFEITO_DA_VALIDACAO[ROTEIRO_DO_SERVICO[tipoEscolhido].aoValidar] : 'O tipo só pode mudar antes de o técnico começar.'}
            >
              <select
                id="rm-tipo"
                required
                value={tipoEscolhido}
                disabled={servico.status !== 'AGENDADO'}
                onChange={(e) => setTipoEscolhido(e.target.value as TipoServico)}
                className={CLASSE_SELECT}
              >
                {/* tipo antigo que não é mais oferecido continua aparecendo no serviço que já o tem */}
                {[...new Set<TipoServico>([...TIPOS_SERVICO_AGENDAVEIS, servico.tipo])].map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_SERVICO_AGENDA[t].rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              id="rm-equipe"
              rotulo="Equipe"
              ajuda={
                mudouDeEquipe && emAberto
                  ? `A escala passa a ser a da ${equipeNova?.nome ?? 'equipe'}. Depois dá para trocar quem vai.`
                  : undefined
              }
            >
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

        {(modo === 'remarcar' || modo === 'escala') && <AvisosDeConflito avisos={avisos.data} />}

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
          {modo === 'escala' && (
            <>
              <Button variant="outline" className="h-11 rounded-[10px]" onClick={() => setModo('ver')} disabled={alterar.isPending}>
                Voltar
              </Button>
              <Button type="submit" form="form-escala" className="h-11 rounded-[10px] font-semibold" disabled={alterar.isPending || !tecnicos.data}>
                {alterar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Salvar quem vai
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
                Salvar alterações
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
