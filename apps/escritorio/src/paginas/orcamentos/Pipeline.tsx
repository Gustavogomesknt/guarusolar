import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Check, Loader2, Send, X } from 'lucide-react';
import {
  formatarData,
  partesNoFuso,
  podeMudarStatus,
  ROTULO_STATUS_ORCAMENTO,
  STATUS_ORCAMENTO,
  type StatusOrcamento,
} from '@guarusolar/compartilhado';
import { api } from '@guarusolar/web/api';
import type { OrcamentoNaLista } from '@/lib/tipos';
import { formatarBRL } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CORES_STATUS } from './coresStatus';
import { MenuStatus, useMudancaDeStatus, type PedirMudanca } from './MenuStatus';
import { AlternadorVisao } from './AlternadorVisao';
import { textoDoErro } from '@/lib/consultas';
import { deMesAnterior, parametrosDoPeriodo, SeletorPeriodo, type Periodo } from './periodo';
import { ValorDaProposta } from '@/components/ValorDaProposta';

/*
 * Pipeline (Kanban) de orçamentos: uma coluna por status, com a mesma listagem da API
 * usada na lista. Arrastar e soltar usa @atlaskit/pragmatic-drag-and-drop (arrasto nativo,
 * ~5 kB); a alternativa por teclado é o menu de status de cada cartão.
 */

/** Dados que viajam com o cartão arrastado. */
type DadosArrasto = { tipo: 'orcamento'; id: string; codigo: string; status: StatusOrcamento };
const ehArrasto = (d: Record<string | symbol, unknown>): d is DadosArrasto => d.tipo === 'orcamento';

/** Dias de calendário (no fuso da empresa) entre a data e hoje. */
function diasDesde(iso: string) {
  const { ano, mes, dia } = partesNoFuso(new Date(iso));
  const hoje = partesNoFuso();
  return Math.round((Date.UTC(hoje.ano, hoje.mes, hoje.dia) - Date.UTC(ano, mes, dia)) / 864e5);
}

const ha = (iso: string) => {
  const d = diasDesde(iso);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
};

const diaMes = (iso: string) => formatarData(iso).slice(0, 5);

/** Linha de contexto do cartão: "Enviado há 3 dias", "Aprovado em 19/09". */
function contexto(o: OrcamentoNaLista) {
  switch (o.status) {
    case 'RASCUNHO':
      return deMesAnterior(o.criadoEm) ? `Criado em ${diaMes(o.criadoEm)}` : `Criado ${ha(o.criadoEm)}`;
    case 'ENVIADO':
    case 'EM_NEGOCIACAO': {
      const enviado = o.enviadoEm ? `Enviado ${ha(o.enviadoEm)}` : `Criado ${ha(o.criadoEm)}`;
      // aparece em qualquer período: a data de criação mostra que é negociação antiga
      return deMesAnterior(o.criadoEm) ? `Criado em ${diaMes(o.criadoEm)} · ${enviado.toLowerCase()}` : enviado;
    }
    case 'APROVADO':
      return o.aprovadoEm ? `Aprovado em ${diaMes(o.aprovadoEm)}` : 'Aprovado';
    case 'RECUSADO':
      return o.recusadoEm ? `Recusado em ${diaMes(o.recusadoEm)}` : 'Recusado';
  }
}

export function Pipeline() {
  const [periodo, setPeriodo] = useState<Periodo>('ESTE_MES');
  const mudanca = useMudancaDeStatus();
  const [arrastando, setArrastando] = useState<DadosArrasto | null>(null);

  const parametros = useMemo(() => parametrosDoPeriodo(periodo).toString(), [periodo]);

  // mesma chave da lista: as duas telas compartilham o cache e a atualização otimista
  const consulta = useQuery({
    queryKey: ['orcamentos', 'lista', parametros],
    queryFn: ({ signal }) => api.get<OrcamentoNaLista[]>(`/api/orcamentos?${parametros}`, { signal }),
    meta: { erroNaTela: true },
  });

  const porStatus = useMemo(() => {
    const grupos = Object.fromEntries(STATUS_ORCAMENTO.map((s) => [s, [] as OrcamentoNaLista[]])) as Record<
      StatusOrcamento,
      OrcamentoNaLista[]
    >;
    for (const o of consulta.data ?? []) grupos[o.status].push(o);
    return grupos;
  }, [consulta.data]);

  // Observa todos os arrastos da página: marca colunas e, ao soltar, pede a mudança
  const pedirRef = useRef(mudanca.pedir);
  pedirRef.current = mudanca.pedir;
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => ehArrasto(source.data),
        onDragStart: ({ source }) => setArrastando(source.data as DadosArrasto),
        onDrop: ({ source, location }) => {
          setArrastando(null);
          const alvo = location.current.dropTargets[0];
          const cartao = source.data as DadosArrasto;
          const destino = alvo?.data.status as StatusOrcamento | undefined;
          if (destino && destino !== cartao.status) {
            pedirRef.current({ id: cartao.id, codigo: cartao.codigo, status: cartao.status }, destino);
          }
        },
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">Comercial</p>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">Pipeline de orçamentos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
          <AlternadorVisao />
        </div>
      </header>

      <p id="instrucoes-pipeline" className="-mt-2 text-[13px] text-muted-foreground">
        Em aberto aparecem sempre; o período vale para aprovados e recusados. Arraste o cartão para
        outra coluna ou use o menu do status no próprio cartão (também pelo teclado).
      </p>

      {consulta.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando orçamentos…
        </p>
      ) : consulta.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os orçamentos. {textoDoErro(consulta.error)}
        </p>
      ) : (
        <div className="relative flex gap-4 overflow-x-auto pb-2">
          {STATUS_ORCAMENTO.map((status) => (
            <Coluna
              key={status}
              status={status}
              orcamentos={porStatus[status]}
              arrastando={arrastando}
              pedir={mudanca.pedir}
              pendenteId={mudanca.pendenteId}
            />
          ))}
        </div>
      )}

      {mudanca.dialogo}
    </div>
  );
}

function Coluna({
  status,
  orcamentos,
  arrastando,
  pedir,
  pendenteId,
}: {
  status: StatusOrcamento;
  orcamentos: OrcamentoNaLista[];
  arrastando: DadosArrasto | null;
  pedir: PedirMudanca;
  pendenteId: string | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const [sobre, setSobre] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    return dropTargetForElements({
      element: elemento,
      getData: () => ({ status }),
      // só aceita cartões que podem ir para este status pelo mapa de transições
      canDrop: ({ source }) => ehArrasto(source.data) && podeMudarStatus(source.data.status, status),
      onDragEnter: () => setSobre(true),
      onDragLeave: () => setSobre(false),
      onDrop: () => setSobre(false),
    });
  }, [status]);

  const total = orcamentos.reduce((soma, o) => soma + Number(o.valorTotal), 0);
  const origem = arrastando?.status === status;
  const aceita = arrastando !== null && !origem && podeMudarStatus(arrastando.status, status);
  const bloqueada = arrastando !== null && !origem && !aceita;
  const cores = CORES_STATUS[status];

  return (
    <section
      ref={ref}
      aria-labelledby={`coluna-${status}`}
      className={cn(
        'flex w-[272px] shrink-0 flex-col gap-3 rounded-[14px] border-2 p-3 transition-colors',
        !arrastando && 'border-transparent bg-[#EBEFF5]',
        aceita && (sobre ? 'border-primary bg-[#EAF2FB]' : 'border-dashed border-primary/50 bg-[#EAF2FB]/60'),
        bloqueada && 'border-dashed border-border bg-[#EBEFF5] opacity-45',
        origem && 'border-transparent bg-[#EBEFF5]',
      )}
    >
      <header className="flex flex-col gap-1 px-1">
        <div className="flex items-center gap-2">
          <span className={cn('size-2.5 rounded-full', cores.ponto)} aria-hidden />
          <h2 id={`coluna-${status}`} className="font-sans text-sm font-semibold tracking-normal">
            {ROTULO_STATUS_ORCAMENTO[status]}
          </h2>
          <span className="rounded-full bg-card px-2 font-mono text-xs text-muted-foreground">{orcamentos.length}</span>
        </div>
        <p className="font-mono text-[13px] text-foreground/80">{formatarBRL(total)}</p>
        {bloqueada && <p className="text-xs text-muted-foreground">Não pode ir para cá</p>}
      </header>

      <ul className="flex min-h-24 flex-col gap-2.5">
        {orcamentos.map((o) => (
          <Cartao key={o.id} orcamento={o} pedir={pedir} pendente={pendenteId === o.id} />
        ))}
        {orcamentos.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
            Nenhum orçamento {ROTULO_STATUS_ORCAMENTO[status].toLowerCase()}
          </li>
        )}
      </ul>
    </section>
  );
}

function Cartao({ orcamento: o, pedir, pendente }: { orcamento: OrcamentoNaLista; pedir: PedirMudanca; pendente: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const navegar = useNavigate();
  const [emArrasto, setEmArrasto] = useState(false);
  const abrir = () => navegar(`/orcamentos/${o.id}`);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    return draggable({
      element: elemento,
      // aprovado não sai mais (vira projeto): não arrasta
      canDrag: () => o.status !== 'APROVADO' && !pendente,
      getInitialData: (): DadosArrasto => ({ tipo: 'orcamento', id: o.id, codigo: o.codigo, status: o.status }),
      onDragStart: () => setEmArrasto(true),
      onDrop: () => setEmArrasto(false),
    });
  }, [o.id, o.codigo, o.status, pendente]);

  const cidade = [o.cliente.cidade, o.cliente.uf].filter(Boolean).join(' · ');
  const negociando = o.status === 'ENVIADO' || o.status === 'EM_NEGOCIACAO';

  return (
    <li
      ref={ref}
      onClick={abrir}
      aria-describedby="instrucoes-pipeline"
      className={cn(
        'flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,36,61,0.06)] transition-shadow hover:shadow-md',
        o.status !== 'APROVADO' && 'active:cursor-grabbing',
        emArrasto && 'opacity-40',
        pendente && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/orcamentos/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-foreground/70 underline-offset-2 hover:underline"
        >
          {o.codigo}
        </Link>
        <MenuStatus orcamento={o} pedir={pedir} pendente={pendente} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-sm font-semibold">{o.cliente.nome}</p>
        {cidade && <p className="truncate text-xs text-muted-foreground">{cidade}</p>}
      </div>
      <ValorDaProposta
        valorTotal={o.valorTotal}
        valorTotalCliente={o.valorTotalCliente}
        classeValor="font-titulo text-xl leading-tight font-bold tracking-[-0.01em]"
      />
      <p className="text-xs text-muted-foreground">{contexto(o)}</p>

      {negociando && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() => pedir(o, 'APROVADO')}
            aria-label={`Aprovar ${o.codigo}`}
            className="h-10 flex-1 rounded-[10px] border-[#9FD3B4] text-[#17653E] hover:bg-[#DCF0E3]"
          >
            <Check aria-hidden /> Aprovar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() => pedir(o, 'RECUSADO')}
            aria-label={`Recusar ${o.codigo}`}
            className="h-10 flex-1 rounded-[10px] border-[#EBB9B3] text-[#A3231B] hover:bg-[#F8E0DD]"
          >
            <X aria-hidden /> Recusar
          </Button>
        </div>
      )}
      {o.status === 'RASCUNHO' && (
        <Button asChild size="sm" variant="outline" className="h-10 rounded-[10px]">
          <Link to={`/orcamentos/${o.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Enviar ${o.codigo} ao cliente`}>
            <Send aria-hidden /> Enviar ao cliente
          </Link>
        </Button>
      )}
    </li>
  );
}
