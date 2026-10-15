import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ROTEIRO_DO_SERVICO, TIPOS_SERVICO_AGENDAVEIS, type TipoServico } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { Cliente, EquipeNaAgenda, ProjetoPendente } from '@/lib/tipos';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { CampoBusca } from '@/components/CampoBusca';
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

/** `avulsa`: visita técnica de pré-venda, ligada ao CLIENTE (sem projeto, sem orçamento aprovado). */
export type PreAgendamento = { projetoId?: string; equipeId?: string; dia?: Dia; avulsa?: boolean };

/** O que a validação das fotos faz com o projeto, conforme o tipo (o gestor escolhe sabendo). */
export const EFEITO_DA_VALIDACAO: Record<(typeof ROTEIRO_DO_SERVICO)[TipoServico]['aoValidar'], string> = {
  A_AGENDAR: 'Ao validar: sem instalação agendada, o projeto volta para "A agendar".',
  AGUARDANDO_CONCLUSAO: 'Ao validar o último serviço pendente: o projeto fica "Aguardando conclusão"; quem conclui é você.',
  NAO_MEXE: 'Ao validar: a situação do projeto não muda.',
};

/**
 * Agendar um projeto aprovado. Aberto pela grade (dia clicado, já com equipe e data) ou pelo
 * botão "Novo agendamento" (tudo em branco). Com `avulsa`, é a VISITA TÉCNICA AVULSA (botão
 * "Agendar visita técnica"): escolhe um cliente já cadastrado, sem projeto, e a etapa é fixa. A duração não existe na API: pergunta quantos
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
  const avulsa = inicial.avulsa === true;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [equipeId, setEquipeId] = useState('');
  const [dia, setDia] = useState<Dia>('');
  const [tipo, setTipo] = useState<TipoServico>('INSTALACAO');
  const [dias, setDias] = useState('1');
  const [escala, setEscala] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setProjetoId(inicial.avulsa ? '' : (inicial.projetoId ?? projetos[0]?.id ?? ''));
    setCliente(null);
    setEquipeId(inicial.equipeId ?? equipes[0]?.id ?? '');
    setDia(inicial.dia ?? diaDeHoje());
    setTipo(inicial.avulsa ? 'VISITA_TECNICA' : 'INSTALACAO');
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
    mutationFn: () =>
      api.post('/api/agenda', {
        ...(avulsa ? { clienteId: cliente?.id } : { projetoId }),
        equipeId,
        tipo,
        dataInicio: dia,
        dataFim: fim,
        tecnicos: escala,
      }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: () => {
      const equipe = equipes.find((e) => e.id === equipeId)?.nome;
      const nome = avulsa ? `Visita técnica de ${cliente?.nome}` : (projeto?.cliente.nome ?? 'Serviço');
      toast.success(`${nome} agendad${avulsa ? 'a' : 'o'} para ${equipe} em ${nomeLongo(dia)}`);
      void clienteConsultas.invalidateQueries({ queryKey: ['agenda'] });
      onAgendado();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível agendar. Tente novamente.'),
  });

  // sem a lista de técnicos a escala iria vazia: espera carregar
  const podeEnviar = (avulsa ? cliente : projetoId) && equipeId && dia && !agendar.isPending && todos !== undefined;

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
            <DialogTitle>{avulsa ? 'Agendar visita técnica' : 'Agendar serviço'}</DialogTitle>
            <DialogDescription>
              {avulsa
                ? 'Visita avulsa, antes ou depois do orçamento: escolha um cliente já cadastrado. O endereço é o do cadastro.'
                : projeto
                  ? `${projeto.cliente.nome} · ${projeto.orcamento.codigo}`
                  : 'Escolha o projeto aprovado, a equipe e o dia.'}
            </DialogDescription>
          </DialogHeader>

          {avulsa ? (
            <EscolherCliente cliente={cliente} onEscolher={setCliente} />
          ) : (
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo
              id="ag-tipo"
              rotulo="Etapa"
              obrigatorio
              ajuda={avulsa ? 'Sem projeto, só visita técnica. Validada, vai para o comercial montar a proposta.' : EFEITO_DA_VALIDACAO[ROTEIRO_DO_SERVICO[tipo].aoValidar]}
            >
              <select id="ag-tipo" required value={tipo} disabled={avulsa} onChange={(e) => setTipo(e.target.value as TipoServico)} className={CLASSE_SELECT}>
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

const MINIMO_BUSCA = 2;

/** Cliente da visita avulsa: busca no cadastro (só os ativos, como no gerador de orçamento). */
function EscolherCliente({ cliente, onEscolher }: { cliente: Cliente | null; onEscolher: (c: Cliente | null) => void }) {
  const [termo, setTermo] = useState('');
  const termoBusca = useValorAtrasado(termo.trim(), 300);
  const busca = useQuery({
    queryKey: ['clientes', 'busca', termoBusca],
    queryFn: ({ signal }) => api.get<Cliente[]>(`/api/clientes?q=${encodeURIComponent(termoBusca)}`, { signal }),
    enabled: termoBusca.length >= MINIMO_BUSCA,
    staleTime: 60_000,
  });
  if (cliente) {
    const endereco = [[cliente.logradouro, cliente.numero].filter(Boolean).join(', '), cliente.bairro, [cliente.cidade, cliente.uf].filter(Boolean).join('/')]
      .filter(Boolean)
      .join(' · ');
    return (
      <div className="flex items-start justify-between gap-3 rounded-[10px] border bg-background px-3.5 py-2.5">
        <span className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">Cliente</span>
          <span className="truncate text-sm font-semibold">{cliente.nome}</span>
          <span className="text-xs text-muted-foreground">{endereco || 'Sem endereço no cadastro: complete na ficha do cliente antes da visita.'}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" onClick={() => onEscolher(null)} aria-label="Trocar o cliente">
          <X aria-hidden /> Trocar
        </Button>
      </div>
    );
  }
  return (
    <CampoBusca<Cliente>
      rotulo="Cliente"
      placeholder="Buscar por nome, CPF/CNPJ ou WhatsApp"
      termo={termo}
      onTermoChange={setTermo}
      resultados={termoBusca === termo.trim() ? busca.data : undefined}
      carregando={termo.trim().length >= MINIMO_BUSCA && (termo.trim() !== termoBusca || busca.isFetching)}
      minimo={MINIMO_BUSCA}
      chave={(c) => c.id}
      onEscolher={onEscolher}
      renderItem={(c) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <span className="truncate text-sm font-medium">{c.nome}</span>
          <span className="text-xs text-muted-foreground">{[c.cidade, c.uf].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      vazio={<span>Nenhum cliente encontrado. Cadastre-o em Clientes e volte aqui.</span>}
    />
  );
}
