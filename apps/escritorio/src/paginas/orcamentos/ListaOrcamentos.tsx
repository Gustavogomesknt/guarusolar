import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, MessageCircle, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatarData,
  ROTULO_STATUS_ORCAMENTO,
  STATUS_ORCAMENTO,
  type StatusOrcamento,
} from '@guarusolar/compartilhado';
import { api, ErroApi } from '@guarusolar/web/api';
import type { OrcamentoNaLista, ResumoOrcamentos } from '@/lib/tipos';
import { formatarBRL } from '@/lib/formatar';
import { enviarPeloWhatsApp } from '@/lib/whatsapp';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MenuStatus, useMudancaDeStatus, type PedirMudanca } from './MenuStatus';
import { AlternadorVisao } from './AlternadorVisao';
import { opcoesDePeriodo, parametrosDoPeriodo, SeletorPeriodo, type Periodo } from './periodo';
import { ValorDaProposta } from '@/components/ValorDaProposta';

type FiltroStatus = StatusOrcamento | 'TODOS';

const COLUNAS = 'grid-cols-[130px_minmax(0,1fr)_100px_100px_136px_170px_96px]';

export function ListaOrcamentos() {
  const [status, setStatus] = useState<FiltroStatus>('TODOS');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('ESTE_MES');
  const buscaAtrasada = useValorAtrasado(busca.trim(), 300);
  const opcoes = useMemo(opcoesDePeriodo, []);
  const mudancaDeStatus = useMudancaDeStatus();

  const filtrosBase = useMemo(() => {
    const p = parametrosDoPeriodo(periodo);
    if (buscaAtrasada) p.set('q', buscaAtrasada);
    return p;
  }, [buscaAtrasada, periodo]);

  // Sem o filtro de status: alimenta as contagens dos chips
  const todos = useQuery({
    queryKey: ['orcamentos', 'lista', filtrosBase.toString()],
    queryFn: ({ signal }) => api.get<OrcamentoNaLista[]>(`/api/orcamentos?${filtrosBase}`, { signal }),
  });
  // Com o filtro de status: a tabela
  const comStatus = useMemo(() => {
    const p = new URLSearchParams(filtrosBase);
    if (status !== 'TODOS') p.set('status', status);
    return p.toString();
  }, [filtrosBase, status]);
  const lista = useQuery({
    queryKey: ['orcamentos', 'lista', comStatus],
    queryFn: ({ signal }) => api.get<OrcamentoNaLista[]>(`/api/orcamentos?${comStatus}`, { signal }),
  });

  const contagem = (s: FiltroStatus) =>
    todos.data ? (s === 'TODOS' ? todos.data.length : todos.data.filter((o) => o.status === s).length) : null;
  const filtrando = status !== 'TODOS' || buscaAtrasada !== '' || periodo !== 'ESTE_MES';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Comercial · {opcoes[0].rotulo}</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Orçamentos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AlternadorVisao />
          <Button asChild className="h-11 rounded-[10px] px-[18px] font-semibold">
            <Link to="/orcamentos/novo">
              <Plus aria-hidden />
              Novo orçamento
            </Link>
          </Button>
        </div>
      </header>

      <Indicadores />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2">
          {(['TODOS', ...STATUS_ORCAMENTO] as FiltroStatus[]).map((s) => {
            const ativo = status === s;
            const n = contagem(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={ativo}
                onClick={() => setStatus(s)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  ativo ? 'border-foreground bg-foreground text-white' : 'border-input bg-card text-foreground hover:bg-muted',
                )}
              >
                {s === 'TODOS' ? 'Todos' : ROTULO_STATUS_ORCAMENTO[s]}
                <span className="font-mono text-xs">{n ?? '–'}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <label className="flex h-10 w-[280px] items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Buscar por cliente ou código</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente ou código"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
        </div>
      </div>

      <Tabela
        orcamentos={lista.data}
        carregando={lista.isPending}
        erro={lista.isError}
        totalSemFiltroDeStatus={todos.data?.length ?? null}
        filtrando={filtrando}
        onVerTodos={() => setPeriodo('TUDO')}
        onLimparFiltros={() => {
          setStatus('TODOS');
          setBusca('');
          setPeriodo('ESTE_MES');
        }}
        pedir={mudancaDeStatus.pedir}
        pendenteId={mudancaDeStatus.pendenteId}
      />
      {mudancaDeStatus.dialogo}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores do mês
// ---------------------------------------------------------------------------
function Indicadores() {
  const resumo = useQuery({
    queryKey: ['orcamentos', 'resumo'],
    queryFn: ({ signal }) => api.get<ResumoOrcamentos>('/api/orcamentos/resumo', { signal }),
  });
  const r = resumo.data;
  const valor = (v: number | undefined) => (r ? formatarBRL(v ?? 0) : '–');

  return (
    <section aria-label="Indicadores do mês" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao titulo="Total orçado no mês" valor={valor(r?.totalOrcadoMes)}>
        {r ? `${r.quantidadeMes} ${r.quantidadeMes === 1 ? 'orçamento emitido' : 'orçamentos emitidos'}` : ' '}
      </Cartao>
      <Cartao titulo="Taxa de aprovação" valor={r ? `${r.taxaAprovacao}%` : '–'}>
        <span
          role="progressbar"
          aria-label="Taxa de aprovação"
          aria-valuenow={r?.taxaAprovacao ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mb-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span className="block h-full rounded-full bg-destaque" style={{ width: `${r?.taxaAprovacao ?? 0}%` }} />
        </span>
        {/* mesma turma no numerador e no denominador: os orçamentos criados no mês */}
        {r
          ? `${r.aprovadosMes} ${r.aprovadosMes === 1 ? 'aprovado' : 'aprovados'} de ${r.enviadosMes} ${r.enviadosMes === 1 ? 'enviado' : 'enviados'} entre os criados no mês`
          : ' '}
      </Cartao>
      <Cartao titulo="Em aberto" valor={r ? String(r.quantidadeEmAberto) : '–'}>
        Enviados e em negociação hoje · {valor(r?.valorEmAberto)}
      </Cartao>
      <Cartao titulo="Valor aprovado no mês" valor={valor(r?.valorAprovadoMes)} escuro>
        Aprovados neste mês, confirmados para instalação
      </Cartao>
    </section>
  );
}

function Cartao({
  titulo,
  valor,
  escuro = false,
  children,
}: {
  titulo: string;
  valor: string;
  escuro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[14px] border px-[22px] py-5',
        escuro ? 'border-sidebar bg-sidebar' : 'bg-card',
      )}
    >
      <p className={cn('text-[13px]', escuro ? 'text-[#CBDBF0]' : 'text-muted-foreground')}>{titulo}</p>
      <p className={cn('font-titulo text-[30px] leading-tight font-bold tracking-[-0.02em]', escuro && 'text-white')}>
        {valor}
      </p>
      <div className={cn('text-xs', escuro ? 'text-destaque-claro' : 'text-muted-foreground')}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------
function Tabela({
  orcamentos,
  carregando,
  erro,
  totalSemFiltroDeStatus,
  filtrando,
  onVerTodos,
  onLimparFiltros,
  pedir,
  pendenteId,
}: {
  orcamentos: OrcamentoNaLista[] | undefined;
  carregando: boolean;
  erro: boolean;
  totalSemFiltroDeStatus: number | null;
  filtrando: boolean;
  onVerTodos: () => void;
  onLimparFiltros: () => void;
  pedir: PedirMudanca;
  pendenteId: string | null;
}) {
  const nenhumAinda = !filtrando && orcamentos?.length === 0;

  return (
    <section aria-label="Lista de orçamentos" className="relative overflow-x-auto rounded-[14px] border bg-card">
      <div role="table" aria-label="Orçamentos" className="min-w-[980px]">
        <div role="rowgroup">
          <div
            role="row"
            className={`grid ${COLUNAS} gap-4 border-b px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}
          >
            <span role="columnheader">Código</span>
            <span role="columnheader">Cliente</span>
            <span role="columnheader">Criado em</span>
            <span role="columnheader">Validade</span>
            <span role="columnheader" className="text-right">
              Valor
            </span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="text-right">
              Ações
            </span>
          </div>
        </div>
        <div role="rowgroup">
          {orcamentos?.map((o) => (
            <Linha key={o.id} orcamento={o} pedir={pedir} pendente={pendenteId === o.id} />
          ))}
        </div>
      </div>

      {carregando && (
        <p role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando orçamentos…
        </p>
      )}
      {erro && !carregando && (
        <p role="alert" className="px-5 py-10 text-center text-sm text-destructive">
          Não foi possível carregar os orçamentos.
        </p>
      )}
      {nenhumAinda && (
        // nada em aberto e nada decidido no período (pode haver decididos em outros meses)
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <FileText className="size-8 text-destaque" aria-hidden />
          <p className="font-titulo text-lg font-bold">Nenhum orçamento neste período</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Os orçamentos em aberto aparecem sempre; aprovados e recusados, pelo mês da decisão.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button asChild className="h-11 rounded-[10px]">
              <Link to="/orcamentos/novo">
                <Plus aria-hidden />
                Novo orçamento
              </Link>
            </Button>
            <Button variant="outline" className="h-11 rounded-[10px]" onClick={onVerTodos}>
              Ver todos os períodos
            </Button>
          </div>
        </div>
      )}
      {filtrando && orcamentos?.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum orçamento encontrado com esses filtros.
          <Button variant="outline" className="h-10 rounded-[10px]" onClick={onLimparFiltros}>
            Limpar filtros
          </Button>
        </div>
      )}

      {orcamentos && orcamentos.length > 0 && (
        <div className="flex flex-wrap justify-between gap-2 px-5 py-3.5 text-[13px] text-muted-foreground">
          <span>
            Mostrando {orcamentos.length} de {totalSemFiltroDeStatus ?? orcamentos.length}{' '}
            {(totalSemFiltroDeStatus ?? orcamentos.length) === 1 ? 'orçamento' : 'orçamentos'}
          </span>
          <span>Clique no status para mudar em 1 clique</span>
        </div>
      )}
    </section>
  );
}

function Linha({
  orcamento: o,
  pedir,
  pendente,
}: {
  orcamento: OrcamentoNaLista;
  pedir: PedirMudanca;
  pendente: boolean;
}) {
  const navegar = useNavigate();
  const clienteConsultas = useQueryClient();
  const abrir = () => navegar(`/orcamentos/${o.id}`);

  const whatsapp = useMutation({
    mutationFn: () => enviarPeloWhatsApp(o.id),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] }),
    onError: (erro) => {
      if (!(erro instanceof ErroApi && erro.status === 401)) {
        toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível montar a mensagem do WhatsApp.');
      }
    },
  });

  return (
    <div
      role="row"
      // o clique na linha abre; para teclado, o código é um link
      onClick={abrir}
      className={`grid min-h-16 cursor-pointer ${COLUNAS} items-center gap-4 border-b px-5 py-2.5 transition-colors hover:bg-background`}
    >
      <span role="cell">
        <Link
          to={`/orcamentos/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[13px] text-foreground/80 underline-offset-2 hover:underline"
        >
          {o.codigo}
        </Link>
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{o.cliente.nome}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[o.cliente.cidade, o.cliente.uf].filter(Boolean).join(' · ') || 'Cidade não informada'}
        </span>
      </span>
      <span role="cell" className="text-sm">
        {formatarData(o.criadoEm)}
      </span>
      <span role="cell" className="text-sm">
        {formatarData(o.validade)}
      </span>
      <span role="cell" className="text-right font-mono text-sm">
        <ValorDaProposta valorTotal={o.valorTotal} valorTotalCliente={o.valorTotalCliente} className="items-end" />
      </span>
      <span role="cell">
        <MenuStatus orcamento={o} pedir={pedir} pendente={pendente} />
      </span>
      <span role="cell" className="flex justify-end gap-1.5">
        <Link
          to={`/orcamentos/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Abrir ${o.codigo}`}
          className="flex size-10 items-center justify-center rounded-[10px] border text-foreground/80 hover:bg-muted"
        >
          <FileText className="size-[18px]" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={`Enviar ${o.codigo} via WhatsApp`}
          disabled={whatsapp.isPending}
          onClick={(e) => {
            e.stopPropagation();
            whatsapp.mutate();
          }}
          className="flex size-10 items-center justify-center rounded-[10px] border border-[#C3D8F0] bg-[#EAF2FB] text-primary hover:bg-[#DCE9F8] disabled:opacity-60"
        >
          {whatsapp.isPending ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden />
          ) : (
            <MessageCircle className="size-[18px]" aria-hidden />
          )}
        </button>
      </span>
    </div>
  );
}
