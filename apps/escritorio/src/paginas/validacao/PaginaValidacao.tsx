import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { tempoDesde } from '@guarusolar/compartilhado';
import { SituacaoServico } from '@guarusolar/web/SituacaoServico';
import type { ServicoNaFila } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { DetalheValidacao } from './DetalheValidacao';
import { useFilaDeValidacao, useSemConexao } from './fila';

/**
 * Validação dos serviços (/validacao, GESTOR e ADMIN). À esquerda a fila (aguardando primeiro,
 * depois os devolvidos, que esperam o técnico); à direita o serviço aberto. O serviço aberto
 * fica na URL (?servico=), e ao aprovar ou devolver o próximo da fila abre sozinho.
 */
export function PaginaValidacao() {
  const [parametros, setParametros] = useSearchParams();
  const fila = useFilaDeValidacao();
  const semConexao = useSemConexao();
  const servicos = fila.data ?? [];
  const aguardando = servicos.filter((s) => s.status === 'AGUARDANDO_VALIDACAO');
  const devolvidos = servicos.filter((s) => s.status === 'DEVOLVIDO');
  const aberto = parametros.get('servico');

  const abrir = (id: string | null) => setParametros(id ? { servico: id } : {}, { replace: true });

  // sem serviço escolhido, abre o primeiro aguardando
  useEffect(() => {
    if (!aberto && aguardando.length > 0) abrir(aguardando[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, aguardando[0]?.id]);

  /** Depois de aprovar ou devolver: o próximo aguardando (o seguinte na fila, senão o anterior). */
  const aoResolver = (id: string) => {
    const i = aguardando.findIndex((s) => s.id === id);
    const restantes = aguardando.filter((s) => s.id !== id);
    abrir((i >= 0 ? (restantes[i] ?? restantes[i - 1]) : restantes[0])?.id ?? null);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside aria-label="Fila de validação" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Operação</p>
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">Validação</h1>
          <p className="text-[13px] text-muted-foreground">
            {fila.isPending
              ? 'Carregando…'
              : aguardando.length === 0
                ? 'Nenhum serviço aguardando'
                : `${aguardando.length} ${aguardando.length === 1 ? 'serviço aguardando' : 'serviços aguardando'}`}
          </p>
          {semConexao && (
            <p role="status" className="flex items-center gap-1.5 text-[13px] text-destaque-texto">
              <WifiOff className="size-3.5 shrink-0" aria-hidden />
              Sem conexão. A fila pode estar desatualizada.
            </p>
          )}
        </div>

        {fila.isPending && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando fila…
          </p>
        )}

        <nav aria-label="Serviços para validar" className="flex flex-col gap-2.5">
          {aguardando.map((s) => (
            <ItemDaFila key={s.id} servico={s} aberto={s.id === aberto} onAbrir={() => abrir(s.id)} />
          ))}
          {devolvidos.length > 0 && (
            <p className="mt-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Devolvidos ao técnico
            </p>
          )}
          {devolvidos.map((s) => (
            <ItemDaFila key={s.id} servico={s} aberto={s.id === aberto} onAbrir={() => abrir(s.id)} />
          ))}
        </nav>
      </aside>

      {aberto ? (
        <DetalheValidacao key={aberto} id={aberto} onResolvido={aoResolver} />
      ) : (
        !fila.isPending && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-16 text-center">
            <CheckCircle2 className="size-9 text-primary" aria-hidden />
            <p className="font-semibold">Nada para validar agora</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Quando um técnico enviar um serviço pelo celular, ele aparece aqui.
            </p>
          </section>
        )
      )}
    </div>
  );
}

function ItemDaFila({ servico, aberto, onAbrir }: { servico: ServicoNaFila; aberto: boolean; onAbrir: () => void }) {
  const devolvido = servico.status === 'DEVOLVIDO';
  const cidade = [servico.projeto.cliente.cidade, servico.projeto.cliente.uf].filter(Boolean).join('/');
  const fotos = servico._count.fotos === 1 ? '1 foto' : `${servico._count.fotos} fotos`;
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-current={aberto ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-1 rounded-xl px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        aberto ? 'border-2 border-primary bg-card' : 'border bg-card hover:border-primary/50',
        devolvido && !aberto && 'bg-[#F8FAFD]',
      )}
    >
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-muted-foreground">{servico.projeto.codigo}</span>
        {devolvido ? (
          <SituacaoServico status={servico.status} className="py-0.5 text-[11px]" />
        ) : (
          <span className="text-muted-foreground">{servico.enviadoEm ? tempoDesde(servico.enviadoEm) : ''}</span>
        )}
      </span>
      <span className="text-[15px] font-semibold">{servico.projeto.cliente.nome}</span>
      <span className="text-[13px] text-[#3A4A5E]">
        {devolvido ? 'Aguardando nova foto do técnico' : [fotos, cidade].filter(Boolean).join(' · ')}
      </span>
      {servico.reenviado && (
        <span className="self-start rounded-full border border-destaque bg-destaque-suave px-2 py-0.5 text-[11px] font-semibold text-destaque-texto">
          Reenviado após devolução
        </span>
      )}
    </button>
  );
}
