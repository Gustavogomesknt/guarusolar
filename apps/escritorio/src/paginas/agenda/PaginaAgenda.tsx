import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, MapPin, Plus, X } from 'lucide-react';
import { TIPOS_SERVICO } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import type { AgendamentoNaAgenda, EquipeNaAgenda, ProjetoPendente } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogAgendar, type PreAgendamento } from './DialogAgendar';
import { DialogServico } from './DialogServico';
import {
  diaDaApi,
  diaMes,
  diasDaSemana,
  diaDeHoje,
  intervaloEscrito,
  nomeCurto,
  nomeLongo,
  numeroDaSemana,
  segundaDaSemana,
  somarDias,
  type Dia,
} from '@guarusolar/compartilhado';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';

const COLUNAS = 'grid-cols-[170px_repeat(6,minmax(98px,1fr))]';
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

/** Um serviço recortado para a semana visível: coluna inicial e quantas colunas ocupa. */
type Bloco = { servico: AgendamentoNaAgenda; coluna: number; largura: number };

function blocosDaSemana(equipe: EquipeNaAgenda, dias: Dia[]) {
  const blocos: Bloco[] = [];
  const ocupados = new Set<number>();
  for (const servico of equipe.agendamentos) {
    const inicio = diaDaApi(servico.dataInicio);
    const fim = diaDaApi(servico.dataFim);
    const cobertos = dias.map((d, i) => (d >= inicio && d <= fim ? i : -1)).filter((i) => i >= 0);
    if (cobertos.length === 0) continue;
    // colunas seguidas (segunda a sábado); o domingo não aparece, então não quebra o bloco
    blocos.push({ servico, coluna: cobertos[0], largura: cobertos[cobertos.length - 1] - cobertos[0] + 1 });
    cobertos.forEach((i) => ocupados.add(i));
  }
  return { blocos, ocupados };
}

export function PaginaAgenda() {
  const [parametros, setParametros] = useSearchParams();
  const semanaNaUrl = parametros.get('semana');
  const segunda = segundaDaSemana(semanaNaUrl && DIA_VALIDO.test(semanaNaUrl) ? semanaNaUrl : diaDeHoje());
  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const sabado = dias[5];
  const hoje = diaDeHoje();

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [agendando, setAgendando] = useState<PreAgendamento | null>(null);
  const [servicoAberto, setServicoAberto] = useState<AgendamentoNaAgenda | null>(null);

  const agenda = useQuery({
    queryKey: ['agenda', 'semana', segunda],
    queryFn: ({ signal }) => api.get<EquipeNaAgenda[]>(`/api/agenda?inicio=${segunda}&fim=${sabado}`, { signal }),
  });
  const pendentes = useQuery({
    queryKey: ['agenda', 'pendentes'],
    queryFn: ({ signal }) => api.get<ProjetoPendente[]>('/api/agenda/pendentes', { signal }),
  });

  const equipes = agenda.data ?? [];
  const projetos = pendentes.data ?? [];
  const selecionado = projetos.find((p) => p.id === selecionadoId) ?? null;

  // o projeto some da lista quando é agendado (aqui ou em outra tela): desfaz a seleção
  useEffect(() => {
    if (selecionadoId && pendentes.data && !selecionado) setSelecionadoId(null);
  }, [selecionadoId, selecionado, pendentes.data]);

  // /agenda?projeto=<id> (ficha e lista de Projetos): já chega com o projeto escolhido na faixa
  const projetoNaUrl = parametros.get('projeto');
  useEffect(() => {
    if (!projetoNaUrl || !pendentes.data) return;
    if (pendentes.data.some((p) => p.id === projetoNaUrl)) setSelecionadoId(projetoNaUrl);
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais);
        novos.delete('projeto');
        return novos;
      },
      { replace: true },
    );
  }, [projetoNaUrl, pendentes.data, setParametros]);

  // Esc desfaz a seleção (quando nenhum diálogo está aberto; o diálogo trata o próprio Esc)
  useEffect(() => {
    if (!selecionado || agendando || servicoAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setSelecionadoId(null);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [selecionado, agendando, servicoAberto]);

  const irParaSemana = (dia: Dia) =>
    setParametros(dia === segundaDaSemana(hoje) ? {} : { semana: dia }, { replace: true });

  const semanaAtual = segunda === segundaDaSemana(hoje);

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Operação · Semana {numeroDaSemana(segunda)}</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Agenda das equipes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Semana" className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-10 rounded-[10px]" onClick={() => irParaSemana(somarDias(segunda, -7))}>
              <ChevronLeft aria-hidden />
              <span className="sr-only">Semana anterior</span>
            </Button>
            <p aria-live="polite" className="min-w-[150px] px-2 text-center text-sm font-medium">
              {intervaloEscrito(segunda, sabado)}
            </p>
            <Button variant="outline" size="icon" className="size-10 rounded-[10px]" onClick={() => irParaSemana(somarDias(segunda, 7))}>
              <ChevronRight aria-hidden />
              <span className="sr-only">Próxima semana</span>
            </Button>
            {!semanaAtual && (
              <Button variant="ghost" className="h-10 rounded-[10px]" onClick={() => irParaSemana(segundaDaSemana(hoje))}>
                Hoje
              </Button>
            )}
          </nav>
          <div role="group" aria-label="Visualização" className="flex gap-1 rounded-xl bg-[#E7EBF2] p-1">
            {['Dia', 'Semana', 'Mês'].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={v === 'Semana'}
                aria-disabled={v !== 'Semana'}
                title={v === 'Semana' ? undefined : 'Em breve'}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium',
                  v === 'Semana' ? 'bg-card text-foreground shadow-sm' : 'cursor-not-allowed text-foreground/45',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button className="h-11 rounded-[10px] px-[18px] font-semibold" onClick={() => setAgendando({ projetoId: selecionado?.id })}>
            <Plus aria-hidden />
            Novo agendamento
          </Button>
        </div>
      </header>

      {/* ---------- A agendar ---------- */}
      <section aria-labelledby="titulo-a-agendar" className="flex flex-col gap-3 rounded-[14px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-a-agendar" className="text-sm font-semibold">
            A agendar{' '}
            {pendentes.data && <span className="font-normal text-muted-foreground">({projetos.length})</span>}
          </h2>
          <div className="flex items-center gap-2">
            <p aria-live="polite" className="text-[13px] text-muted-foreground">
              {selecionado ? (
                <>
                  <strong className="font-semibold text-foreground">{selecionado.cliente.nome}</strong> selecionado:
                  escolha um dia livre na grade.
                </>
              ) : (
                projetos.length > 0 && 'Selecione um projeto para ver os dias livres.'
              )}
            </p>
            {selecionado && (
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setSelecionadoId(null)}>
                <X aria-hidden />
                Desfazer (Esc)
              </Button>
            )}
          </div>
        </div>

        {pendentes.isPending ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando projetos…
          </p>
        ) : projetos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum projeto aprovado aguardando data.</p>
        ) : (
          <ul className="relative flex gap-3 overflow-x-auto pb-1">
            {projetos.map((p) => {
              const ativo = p.id === selecionadoId;
              const cidade = [p.cliente.cidade, p.cliente.uf].filter(Boolean).join('/');
              // o projeto ainda não tem tipo de serviço: o padrão ao agendar é instalação
              const tipo = TIPOS_SERVICO_AGENDA.INSTALACAO;
              return (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setSelecionadoId(ativo ? null : p.id)}
                    className={cn(
                      'flex w-[230px] flex-col items-start gap-1.5 rounded-[12px] border-2 bg-card px-3.5 py-3 text-left transition-colors',
                      'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      ativo ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', tipo.fundo, tipo.borda, tipo.texto)}>
                      {tipo.rotulo}
                    </span>
                    <span className="w-full truncate text-sm font-semibold">{p.cliente.nome}</span>
                    <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        {cidade || 'Cidade não informada'}
                      </span>
                      <span className="font-mono">{p.orcamento.codigo}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Grade da semana ---------- */}
      <section aria-label={`Agenda de ${intervaloEscrito(segunda, sabado)}`} className="relative min-w-0 overflow-x-auto rounded-[14px] border bg-card">
        <div className="min-w-[760px]">
          <div className={`grid ${COLUNAS} border-b`}>
            <span className="px-4 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">Equipe</span>
            {dias.map((d) => {
              const eHoje = d === hoje;
              return (
                <span key={d} className={cn('flex flex-col items-center gap-0.5 border-l px-2 py-2.5', eHoje && 'bg-primary/5')}>
                  <span className={cn('text-xs font-semibold tracking-[0.06em] uppercase', eHoje ? 'text-primary' : 'text-muted-foreground')}>
                    {nomeCurto(d)}
                  </span>
                  <span className={cn('rounded-full px-2 text-sm font-semibold', eHoje && 'bg-primary text-primary-foreground')}>
                    {diaMes(d)}
                    {eHoje && <span className="sr-only"> (hoje)</span>}
                  </span>
                </span>
              );
            })}
          </div>

          {agenda.isPending ? (
            <p role="status" className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando agenda…
            </p>
          ) : equipes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma equipe ativa.</p>
          ) : (
            <ul aria-label="Equipes">
              {equipes.map((equipe) => (
                <LinhaEquipe
                  key={equipe.id}
                  equipe={equipe}
                  dias={dias}
                  hoje={hoje}
                  selecionado={selecionado}
                  onAgendar={(dia) => setAgendando({ projetoId: selecionado?.id, equipeId: equipe.id, dia })}
                  onAbrirServico={setServicoAberto}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer aria-label="Legenda" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        {TIPOS_SERVICO.map((t) => {
          const tipo = TIPOS_SERVICO_AGENDA[t];
          return (
            <span key={t} className="flex items-center gap-2">
              <span aria-hidden className={cn('size-3.5 rounded-[4px] border-l-4', tipo.fundo, tipo.borda)} />
              {tipo.rotulo}
            </span>
          );
        })}
      </footer>

      <DialogAgendar
        aberto={agendando !== null}
        inicial={agendando ?? {}}
        projetos={projetos}
        equipes={equipes}
        onFechar={() => setAgendando(null)}
        onAgendado={() => {
          setAgendando(null);
          setSelecionadoId(null);
        }}
      />
      <DialogServico servico={servicoAberto} equipes={equipes} onFechar={() => setServicoAberto(null)} />
    </div>
  );
}

function LinhaEquipe({
  equipe,
  dias,
  hoje,
  selecionado,
  onAgendar,
  onAbrirServico,
}: {
  equipe: EquipeNaAgenda;
  dias: Dia[];
  hoje: Dia;
  selecionado: ProjetoPendente | null;
  onAgendar: (dia: Dia) => void;
  onAbrirServico: (servico: AgendamentoNaAgenda) => void;
}) {
  const { blocos, ocupados } = blocosDaSemana(equipe, dias);
  const responsavel = equipe.membros[0]?.nome;

  return (
    <li className={`grid ${COLUNAS} min-h-[88px] border-b last:border-b-0`}>
      <div className="flex flex-col justify-center gap-0.5 px-4 py-3" style={{ gridColumn: 1, gridRow: 1 }}>
        <span className="font-semibold">{equipe.nome}</span>
        <span className="truncate text-xs text-muted-foreground">{responsavel ?? 'Sem técnico cadastrado'}</span>
        <span className="text-xs text-muted-foreground">
          {ocupados.size} de 6 dias ocupados
        </span>
      </div>

      {/* fundo das colunas: dia de hoje destacado e dias livres clicáveis */}
      {dias.map((d, i) => {
        const eHoje = d === hoje;
        const livre = !ocupados.has(i);
        return (
          <div
            key={d}
            className={cn('border-l p-1.5', eHoje && 'bg-primary/5')}
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {livre && selecionado && (
              <button
                type="button"
                onClick={() => onAgendar(d)}
                aria-label={`Agendar ${selecionado.cliente.nome} com a ${equipe.nome} em ${nomeLongo(d)}`}
                className={cn(
                  'flex size-full min-h-[72px] items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-primary/45 bg-primary/5 text-xs font-medium text-primary',
                  'hover:border-primary hover:bg-primary/10 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                Agendar
              </button>
            )}
          </div>
        );
      })}

      {blocos.map(({ servico, coluna, largura }) => {
        const tipo = TIPOS_SERVICO_AGENDA[servico.tipo];
        const inicio = diaDaApi(servico.dataInicio);
        const fim = diaDaApi(servico.dataFim);
        const quando = inicio === fim ? nomeLongo(inicio) : `${nomeLongo(inicio)} a ${nomeLongo(fim)}`;
        const cidade = servico.projeto.cliente.cidade;
        return (
          <button
            key={servico.id}
            type="button"
            // com um projeto selecionado a grade serve para escolher dia livre: serviços ficam só de consulta
            disabled={selecionado !== null}
            onClick={() => onAbrirServico(servico)}
            aria-label={`${tipo.rotulo}: ${servico.projeto.cliente.nome}, ${equipe.nome}, ${quando}. Abrir detalhes`}
            style={{ gridColumn: `${coluna + 2} / span ${largura}`, gridRow: 1 }}
            className={cn(
              'relative z-10 m-1.5 flex min-w-0 flex-col items-start justify-center gap-0.5 rounded-[10px] border-l-4 px-3 py-2 text-left',
              'hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60',
              tipo.fundo,
              tipo.borda,
              tipo.texto,
            )}
          >
            <span className="w-full truncate text-[10px] font-semibold tracking-[0.04em] uppercase">{tipo.rotulo}</span>
            <span className="line-clamp-2 w-full text-sm leading-tight font-semibold break-words">{servico.projeto.cliente.nome}</span>
            <span className="w-full truncate text-xs opacity-80">
              {[cidade, servico.projeto.orcamento.codigo].filter(Boolean).join(' · ')}
            </span>
          </button>
        );
      })}
    </li>
  );
}
