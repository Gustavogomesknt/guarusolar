import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Loader2, Search } from 'lucide-react';
import {
  formatarData,
  intervaloEscrito,
  ROTULO_STATUS_PROJETO,
  ROTULO_TIPO_SERVICO,
  segundaDaSemana,
  tempoDesde,
  type StatusProjeto,
} from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import { useSessao } from '@guarusolar/web/sessao';
import type { ListaDeProjetos, ProjetoNaLista } from '@/lib/tipos';
import { textoDoErro } from '@/lib/consultas';
import { useValorAtrasado } from '@/hooks/useValorAtrasado';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { SeloProjeto } from './SeloProjeto';
import { ValorDaProposta } from '@/components/ValorDaProposta';

type Filtro = 'EM_ANDAMENTO' | StatusProjeto;
const FILTROS: Filtro[] = ['EM_ANDAMENTO', 'AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'EM_EXECUCAO', 'AGUARDANDO_VALIDACAO', 'AGUARDANDO_CONCLUSAO', 'CONCLUIDO'];
const COLUNAS = 'grid-cols-[minmax(0,1.3fr)_150px_130px_150px_minmax(0,1.2fr)]';

const dia = (iso: string) => iso.slice(0, 10);

/**
 * Projetos (obras), do orçamento aprovado à conclusão. Padrão: "Em andamento". O comercial
 * consulta; os atalhos para agendar e validar aparecem só para o gestor.
 */
export function ListaProjetos() {
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const gestor = usuario?.papel === 'GESTOR' || usuario?.papel === 'ADMIN';
  const [filtro, setFiltro] = useState<Filtro>('EM_ANDAMENTO');
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useValorAtrasado(busca.trim(), 300);

  const parametros = useMemo(() => {
    const p = new URLSearchParams({ situacao: filtro });
    if (buscaAtrasada) p.set('q', buscaAtrasada);
    if (incluirCancelados) p.set('incluirCancelados', 'true');
    return p.toString();
  }, [filtro, buscaAtrasada, incluirCancelados]);

  const lista = useQuery({
    queryKey: ['projetos', 'lista', parametros],
    queryFn: ({ signal }) => api.get<ListaDeProjetos>(`/api/projetos?${parametros}`, { signal }),
    meta: { erroNaTela: true },
    placeholderData: (anterior) => anterior,
  });
  const contagem = lista.data?.contagem;
  const filtros: Filtro[] = incluirCancelados ? [...FILTROS, 'CANCELADO'] : FILTROS;

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">Obras do orçamento aprovado à conclusão</p>
        <h1 className="text-4xl font-bold tracking-[-0.02em]">Projetos</h1>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
          {filtros.map((f) => {
            const ativo = filtro === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(f)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  ativo ? 'border-foreground bg-foreground text-white' : 'border-input bg-card text-foreground hover:bg-muted',
                )}
              >
                {f === 'EM_ANDAMENTO' ? 'Em andamento' : ROTULO_STATUS_PROJETO[f]}
                {contagem && (
                  <span className={cn('font-mono text-xs', ativo ? 'text-white/80' : 'text-muted-foreground')}>{contagem[f]}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-10 w-[300px] max-w-full items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Buscar por código, cliente ou cidade</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por PRJ, cliente ou cidade"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label htmlFor="mostrar-cancelados" className="flex h-10 cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
            <Switch
              id="mostrar-cancelados"
              checked={incluirCancelados}
              onCheckedChange={(sim) => {
                setIncluirCancelados(sim);
                if (!sim && filtro === 'CANCELADO') setFiltro('EM_ANDAMENTO');
              }}
            />
            Mostrar cancelados
          </label>
        </div>
      </div>

      <section aria-label="Projetos" className="relative min-w-0 overflow-x-auto rounded-[14px] border bg-card">
        <div role="table" aria-label="Lista de projetos" aria-busy={lista.isFetching} className="min-w-[860px]">
          <div role="row" className={`grid ${COLUNAS} gap-4 border-b px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`}>
            <span role="columnheader">Projeto</span>
            <span role="columnheader">Cidade</span>
            <span role="columnheader" className="text-right">
              Valor
            </span>
            <span role="columnheader">Situação</span>
            <span role="columnheader">Próximo passo</span>
          </div>
          {lista.isPending ? (
            <p role="status" className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando projetos…
            </p>
          ) : lista.isError ? (
            <p role="alert" className="px-5 py-8 text-sm text-destructive">
              Não foi possível carregar os projetos. {textoDoErro(lista.error)}
            </p>
          ) : lista.data.itens.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
              <FolderKanban className="size-6" aria-hidden />
              {buscaAtrasada ? 'Nenhum projeto encontrado com essa busca.' : 'Nenhum projeto nesta situação.'}
            </div>
          ) : (
            <div role="rowgroup">
              {lista.data.itens.map((p) => (
                <div
                  key={p.id}
                  role="row"
                  onClick={() => navegar(`/projetos/${p.id}`)}
                  className={`grid min-h-[62px] cursor-pointer ${COLUNAS} items-center gap-4 border-b px-5 py-2.5 last:border-b-0 hover:bg-background`}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      to={`/projetos/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[13px] font-medium underline-offset-2 hover:underline"
                    >
                      {p.codigo}
                    </Link>
                    <span className="truncate text-sm font-semibold">{p.clienteNome}</span>
                  </span>
                  <span role="cell" className="truncate text-sm">
                    {[p.clienteCidade, p.clienteUf].filter(Boolean).join('/') || '—'}
                  </span>
                  <span role="cell" className="text-right font-mono text-sm">
                    <ValorDaProposta valorTotal={p.valorTotal} valorTotalCliente={p.valorTotalCliente} className="items-end" />
                  </span>
                  <span role="cell">
                    <SeloProjeto status={p.status} />
                  </span>
                  <span role="cell" className="min-w-0 text-[13px]">
                    <ProximoPasso projeto={p} gestor={gestor} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** O que falta acontecer e, para o gestor, o atalho para a tela que resolve. */
function ProximoPasso({ projeto: p, gestor }: { projeto: ProjetoNaLista; gestor: boolean }) {
  const s = p.servicoAtual;
  // um projeto pode ter vários serviços agendados: a linha mostra o da vez e quantos mais faltam
  const mais = p.servicosPendentes > 1 ? ` · mais ${p.servicosPendentes - 1} ${p.servicosPendentes === 2 ? 'serviço' : 'serviços'}` : '';
  const atalho = (para: string, texto: string) =>
    gestor ? (
      <Link to={para} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary underline-offset-2 hover:underline">
        {texto} →
      </Link>
    ) : null;
  switch (p.status) {
    case 'AGUARDANDO_AGENDAMENTO':
      // visita técnica validada: o projeto voltou para cá, agora para a instalação
      if (p.visitaTecnicaConcluidaEm) {
        return (
          <span className="flex flex-col">
            <span className="font-medium text-[#0E3F7E]">Visita concluída — agendar instalação</span>
            {gestor && atalho(`/agenda?projeto=${p.id}`, 'Agendar instalação')}
          </span>
        );
      }
      return gestor ? atalho(`/agenda?projeto=${p.id}`, 'Agendar') : <span className="text-muted-foreground">Aguardando data</span>;
    case 'AGUARDANDO_CONCLUSAO':
      // instalação validada: quem conclui é o gestor, na ficha
      return (
        <span className="flex flex-col">
          <span className="text-muted-foreground">Instalação validada</span>
          {gestor && atalho(`/projetos/${p.id}`, 'Concluir projeto')}
        </span>
      );
    case 'AGENDADO':
      return s ? (
        <span className="flex flex-col">
          <span className="font-medium">
            {ROTULO_TIPO_SERVICO[s.tipo]} · {intervaloEscrito(dia(s.dataInicio), dia(s.dataFim))}
          </span>
          <span className="text-muted-foreground">
            {s.equipe}
            {mais}
          </span>
        </span>
      ) : null;
    case 'EM_EXECUCAO':
      return s ? (
        <span className="flex flex-col">
          <span className="font-medium">
            {s.status === 'DEVOLVIDO'
              ? 'Técnico refazendo fotos'
              : s.status === 'AGENDADO'
                ? // obra em andamento: um dia já foi validado e este é o próximo
                  `Próximo: ${ROTULO_TIPO_SERVICO[s.tipo]} · ${intervaloEscrito(dia(s.dataInicio), dia(s.dataFim))}`
                : `${ROTULO_TIPO_SERVICO[s.tipo]} em execução`}
          </span>
          <span className="text-muted-foreground">
            {s.equipe}
            {mais}
          </span>
        </span>
      ) : null;
    case 'AGUARDANDO_VALIDACAO':
      return (
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">{s?.enviadoEm ? `Enviado ${tempoDesde(s.enviadoEm)}` : 'Aguardando validação'}</span>
          {s && atalho(`/validacao?servico=${s.id}`, 'Validar')}
        </span>
      );
    case 'CONCLUIDO':
      return <span className="text-muted-foreground">Concluído{p.concluidoEm ? ` em ${formatarData(p.concluidoEm)}` : ''}</span>;
    case 'CANCELADO':
      return <span className="text-muted-foreground">Cancelado{p.canceladoEm ? ` em ${formatarData(p.canceladoEm)}` : ''}</span>;
  }
}

/** Semana da agenda (segunda-feira) em que o serviço começa. */
export const semanaNaAgenda = (dataInicio: string) => `/agenda?semana=${segundaDaSemana(dia(dataInicio))}`;
