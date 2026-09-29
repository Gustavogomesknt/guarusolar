import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarX2, Loader2, LogOut, MapPin, MessageCircle, Navigation, RefreshCw } from 'lucide-react';
import { diaDaApi, diaDeHoje, diasUteis, nomeLongo, somarDias, type Dia } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import { useSessao } from '@guarusolar/web/sessao';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import type { ServicoNaAgenda } from '@/lib/tipos';
import { enderecoEscrito, linkDoMapa, linkDoWhatsApp } from '@/lib/contato';
import { cn } from '@/lib/utils';
import { Cabecalho } from '@/components/Cabecalho';
import { SeloStatus } from '@/components/SeloStatus';

const DIAS_A_FRENTE = 7;

function nomeDoDia(dia: Dia, hoje: Dia) {
  if (dia === hoje) return 'Hoje';
  if (dia === somarDias(hoje, 1)) return 'Amanhã';
  const nome = nomeLongo(dia);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/**
 * Agenda do técnico: hoje e os próximos 7 dias. Serviço de vários dias aparece em cada dia
 * ("dia 2 de 3"), porque o técnico pensa no que tem para fazer em cada dia.
 * Serviços devolvidos pelo gestor ficam no topo: são o que precisa de atenção primeiro.
 */
export function Agenda() {
  const { usuario, sair } = useSessao();
  const hoje = diaDeHoje();
  const agenda = useQuery({
    queryKey: ['agenda', hoje],
    queryFn: ({ signal }) =>
      api.get<ServicoNaAgenda[]>(`/api/tecnico/agenda?de=${hoje}&ate=${somarDias(hoje, DIAS_A_FRENTE)}`, { signal }),
  });

  const servicos = agenda.data ?? [];
  const devolvidos = servicos.filter((s) => s.status === 'DEVOLVIDO');
  const dias = Array.from({ length: DIAS_A_FRENTE + 1 }, (_, i) => somarDias(hoje, i))
    .map((dia) => ({
      dia,
      servicos: servicos.filter(
        (s) => s.status !== 'DEVOLVIDO' && diaDaApi(s.dataInicio) <= dia && dia <= diaDaApi(s.dataFim),
      ),
    }))
    .filter((d) => d.servicos.length > 0);

  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <div className="min-h-svh bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Cabecalho
        titulo="Minha agenda"
        subtitulo={primeiroNome ? `Olá, ${primeiroNome}` : undefined}
        acoes={
          <button
            type="button"
            onClick={() => sair()}
            className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/85 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <LogOut className="size-5" aria-hidden />
            Sair
          </button>
        }
      />

      <main className="flex flex-col gap-6 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Hoje e os próximos {DIAS_A_FRENTE} dias</p>
          <button
            type="button"
            onClick={() => agenda.refetch()}
            disabled={agenda.isFetching}
            className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary disabled:opacity-60"
          >
            <RefreshCw className={cn('size-4', agenda.isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>

        {agenda.isPending ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Carregando agenda…
          </p>
        ) : agenda.isError && servicos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center">
            <p className="text-muted-foreground">Não foi possível carregar a agenda.</p>
            <button type="button" onClick={() => agenda.refetch()} className="h-12 rounded-xl px-5 font-semibold text-primary">
              Tentar novamente
            </button>
          </div>
        ) : servicos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
            <CalendarX2 className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">Nenhum serviço nos próximos dias</p>
            <p className="text-sm text-muted-foreground">Quando o gestor agendar sua equipe, o serviço aparece aqui.</p>
          </div>
        ) : (
          <>
            {devolvidos.length > 0 && (
              <section aria-labelledby="titulo-devolvidos" className="flex flex-col gap-3">
                <h2 id="titulo-devolvidos" className="text-lg font-bold text-destaque-texto">
                  Precisa refazer fotos
                </h2>
                {devolvidos.map((s) => (
                  <CartaoServico key={s.id} servico={s} dia={hoje} />
                ))}
              </section>
            )}
            {dias.map(({ dia, servicos: doDia }) => (
              <section key={dia} aria-labelledby={`dia-${dia}`} className="flex flex-col gap-3">
                <h2 id={`dia-${dia}`} className="flex items-baseline gap-2 text-lg font-bold">
                  {nomeDoDia(dia, hoje)}
                  {(dia === hoje || dia === somarDias(hoje, 1)) && (
                    <span className="text-sm font-normal text-muted-foreground">{nomeLongo(dia)}</span>
                  )}
                </h2>
                {doDia.map((s) => (
                  <CartaoServico key={s.id} servico={s} dia={dia} />
                ))}
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

function CartaoServico({ servico, dia }: { servico: ServicoNaAgenda; dia: Dia }) {
  const { cliente } = servico.projeto;
  const tipo = TIPOS_SERVICO_AGENDA[servico.tipo];
  const inicio = diaDaApi(servico.dataInicio);
  const fim = diaDaApi(servico.dataFim);
  const total = diasUteis(inicio, fim);
  const atual = diasUteis(inicio, dia);
  const endereco = enderecoEscrito(cliente);
  const mapa = linkDoMapa(cliente);

  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-card', servico.status === 'DEVOLVIDO' && 'border-destaque')}>
      {/* a área grande abre o serviço; os atalhos ficam fora do link (link dentro de link não vale) */}
      <Link
        to={`/servico/${servico.id}`}
        className="flex flex-col gap-2 p-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset active:bg-muted/60"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', tipo.fundo, tipo.borda, tipo.texto)}>
            {tipo.rotulo}
          </span>
          <SeloStatus status={servico.status} />
          {total > 1 && (
            <span className="text-xs text-muted-foreground">
              dia {atual} de {total}
            </span>
          )}
        </span>
        <span className="text-lg leading-snug font-semibold">{cliente.nome}</span>
        {endereco && (
          <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {endereco}
          </span>
        )}
        {servico.status === 'DEVOLVIDO' && servico.motivoDevolucao && (
          <span className="rounded-xl bg-destaque-suave px-3 py-2 text-sm text-destaque-texto">
            Gestor: {servico.motivoDevolucao}
          </span>
        )}
        <span className="font-mono text-xs text-muted-foreground">{servico.projeto.codigo}</span>
      </Link>

      <div className="grid grid-cols-2 border-t">
        <a
          href={linkDoWhatsApp(cliente)}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-primary active:bg-muted/60"
        >
          <MessageCircle className="size-5" aria-hidden />
          WhatsApp
          <span className="sr-only"> de {cliente.nome}</span>
        </a>
        {mapa ? (
          <a
            href={mapa}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 border-l text-sm font-semibold text-primary active:bg-muted/60"
          >
            <Navigation className="size-5" aria-hidden />
            Como chegar
          </a>
        ) : (
          <span className="flex h-12 items-center justify-center border-l text-xs text-muted-foreground">Sem endereço</span>
        )}
      </div>
    </article>
  );
}
