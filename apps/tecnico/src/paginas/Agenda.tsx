import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarX2, Clock, KeyRound, Loader2, LogOut, MapPin, MessageCircle, Navigation, RefreshCw } from 'lucide-react';
import { diaDaApi, diaDeHoje, diasUteis, nomeLongo, somarDias, type Dia } from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import { useSessao } from '@guarusolar/web/sessao';
import { TIPOS_SERVICO_AGENDA } from '@guarusolar/web/tiposServico';
import type { ServicoNaAgenda } from '@/lib/tipos';
import { enderecoEscrito, linkDoMapa, linkDoWhatsApp } from '@/lib/contato';
import { cn } from '@/lib/utils';
import { Cabecalho } from '@/components/Cabecalho';
import { SituacaoServico } from '@guarusolar/web/SituacaoServico';
import { useFila } from '@/fotos/useFotos';
import { ConviteInstalacao } from '@/components/ConviteInstalacao';

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
 * No topo, o que precisa de atenção primeiro: os devolvidos pelo gestor e os que ficaram em
 * aberto de dias anteriores (a API os mantém na agenda até serem enviados).
 */
export function Agenda() {
  const { usuario, sair } = useSessao();
  const fila = useFila();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const hoje = diaDeHoje();
  const agenda = useQuery({
    // sem a data na chave: aberto sem sinal num dia novo, mostra o que ficou guardado
    queryKey: ['agenda'],
    queryFn: ({ signal }) =>
      api.get<ServicoNaAgenda[]>(`/api/tecnico/agenda?de=${hoje}&ate=${somarDias(hoje, DIAS_A_FRENTE)}`, { signal }),
  });

  const servicos = agenda.data ?? [];
  const devolvidos = servicos.filter((s) => s.status === 'DEVOLVIDO');
  const atrasados = servicos.filter((s) => s.status !== 'DEVOLVIDO' && diaDaApi(s.dataFim) < hoje);
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
          <>
          <Link
            to="/senha"
            className="flex size-11 items-center justify-center rounded-xl text-white/85 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <KeyRound className="size-5" aria-hidden />
            <span className="sr-only">Trocar senha</span>
          </Link>
          <button
            type="button"
            // com fotos ainda no aparelho, confirma antes (elas ficam guardadas para quando voltar)
            onClick={() => (fila.fotos.length > 0 ? setConfirmarSaida(true) : sair())}
            className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/85 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <LogOut className="size-5" aria-hidden />
            Sair
          </button>
          </>
        }
      />

      <main className="flex flex-col gap-6 px-4 pt-4">
        {confirmarSaida && (
          <section role="alertdialog" aria-labelledby="titulo-sair" className="flex flex-col gap-3 rounded-2xl border border-destaque bg-card p-4">
            <h2 id="titulo-sair" className="font-sans text-base font-semibold tracking-normal">
              {fila.fotos.length === 1 ? 'Há 1 foto' : `Há ${fila.fotos.length} fotos`} ainda no celular
            </h2>
            <p className="text-sm text-muted-foreground">
              Se sair, {fila.fotos.length === 1 ? 'ela fica guardada e é enviada' : 'elas ficam guardadas e são enviadas'}{' '}
              quando você entrar de novo neste celular.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmarSaida(false)} className="h-12 rounded-xl border font-semibold" autoFocus>
                Continuar aqui
              </button>
              <button type="button" onClick={() => sair()} className="h-12 rounded-xl font-semibold text-destaque-texto">
                Sair mesmo assim
              </button>
            </div>
          </section>
        )}

        <AvisoDaFila />

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
            {atrasados.length > 0 && (
              <section aria-labelledby="titulo-atrasados" className="flex flex-col gap-3">
                <h2 id="titulo-atrasados" className="text-lg font-bold">
                  De dias anteriores
                </h2>
                {atrasados.map((s) => (
                  <CartaoServico key={s.id} servico={s} dia={diaDaApi(s.dataFim)} atrasado />
                ))}
              </section>
            )}
            {dias.length === 0 && (
              <p className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                Nada agendado de hoje aos próximos {DIAS_A_FRENTE} dias.
              </p>
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
        {/* por último: o trabalho do dia vem primeiro */}
        <ConviteInstalacao />
      </main>
    </div>
  );
}

function CartaoServico({ servico, dia, atrasado = false }: { servico: ServicoNaAgenda; dia: Dia; atrasado?: boolean }) {
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
          <SituacaoServico status={servico.status} />
          {atrasado ? (
            <span className="text-xs text-destaque-texto">
              {inicio === fim ? `era para ${nomeLongo(inicio)}` : `de ${nomeLongo(inicio)} a ${nomeLongo(fim)}`}
            </span>
          ) : (
            total > 1 && (
              <span className="text-xs text-muted-foreground">
                dia {atual} de {total}
              </span>
            )
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

/** Resumo da fila de fotos: tranquiliza quando está sem sinal e aponta o que precisa de ação. */
function AvisoDaFila() {
  const fila = useFila();
  const naFila = fila.fotos.filter((f) => f.estado !== 'erro').length;
  const comErro = fila.fotos.filter((f) => f.estado === 'erro').length;
  if (naFila === 0 && comErro === 0) return null;
  const quantas = (n: number) => (n === 1 ? '1 foto' : `${n} fotos`);
  return (
    <section role="status" className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm">
      {naFila > 0 && (
        <p className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {fila.semConexao
            ? `${quantas(naFila)} guardada${naFila === 1 ? '' : 's'} no celular, aguardando sinal para enviar.`
            : `Enviando ${quantas(naFila)}…`}
        </p>
      )}
      {comErro > 0 && (
        <p className="flex items-start gap-2 text-destaque-texto">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {quantas(comErro)} não {comErro === 1 ? 'foi aceita' : 'foram aceitas'}: abra o serviço para ver o motivo.
        </p>
      )}
    </section>
  );
}
