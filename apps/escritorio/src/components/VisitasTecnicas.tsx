import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Loader2 } from 'lucide-react';
import { diaDaApi, formatarDataHora } from '@guarusolar/compartilhado';
import { api, urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import { SituacaoServico } from '@guarusolar/web/SituacaoServico';
import type { VisitaTecnica } from '@/lib/tipos';
import { textoDoErro } from '@/lib/consultas';
import { Selo } from '@/components/Selo';
import { FotoAmpliadaConsulta, rotuloDaFoto, type FotoParaConsulta } from '@/components/FotoAmpliadaConsulta';
import { VideosDoServico } from '@/paginas/validacao/VideosDoServico';

/*
 * Visitas técnicas para o comercial e o gestor: a lista "aguardando orçamento", a ficha do cliente
 * e a ficha do projeto (as visitas do MESMO CLIENTE; sem vínculo rígido entre visita e projeto).
 * Só leitura: validar continua na tela de Validação.
 */

export const CHAVE_VISITAS = ['visitas'] as const;

export const useVisitasAguardandoOrcamento = () =>
  useQuery({
    queryKey: [...CHAVE_VISITAS, 'aguardando'],
    queryFn: ({ signal }) => api.get<VisitaTecnica[]>('/api/visitas/aguardando-orcamento', { signal }),
    staleTime: 60_000,
    // o contador do menu: o gestor recebe a mudança pela versão da operação; o comercial, por aqui
    refetchInterval: 5 * 60_000,
  });

const useVisitasDoCliente = (clienteId: string) =>
  useQuery({
    queryKey: [...CHAVE_VISITAS, 'cliente', clienteId],
    queryFn: ({ signal }) => api.get<VisitaTecnica[]>(`/api/visitas/do-cliente/${clienteId}`, { signal }),
    meta: { erroNaTela: true },
  });

/** Datas do agendamento são só dia (meia-noite UTC): nada de fuso, senão 15/10 vira 14/10. */
const diaBr = (iso: string) => diaDaApi(iso).split('-').reverse().join('/');
const periodo = (v: VisitaTecnica) => (diaDaApi(v.dataInicio) === diaDaApi(v.dataFim) ? diaBr(v.dataInicio) : `${diaBr(v.dataInicio)} a ${diaBr(v.dataFim)}`);

/** Uma visita: quando, quem foi, quem enviou e validou, observações, fotos e vídeos. */
export function CartaoVisita({ visita: v, mostrarCliente = false, acoes }: { visita: VisitaTecnica; mostrarCliente?: boolean; acoes?: ReactNode }) {
  const [aberta, setAberta] = useState<{ fotos: FotoParaConsulta[]; indice: number } | null>(null);
  const cidade = v.cliente ? [v.cliente.cidade, v.cliente.uf].filter(Boolean).join('/') : '';
  const quemFoi = v.escala.map((e) => e.usuario.nome).join(', ') || 'Sem técnico escalado';
  return (
    <article className="flex flex-col gap-3.5 rounded-xl border bg-card px-5 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {mostrarCliente && v.cliente && (
            <Link to={`/clientes/${v.cliente.id}`} className="text-lg font-bold text-foreground hover:text-primary hover:underline">
              {v.cliente.nome}
            </Link>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">Visita técnica de {periodo(v)}</span>
            {mostrarCliente && cidade && <span>· {cidade}</span>}
            {v.projeto ? (
              <Link to={`/projetos/${v.projeto.id}`} className="font-mono text-primary hover:underline">
                {v.projeto.codigo}
              </Link>
            ) : (
              <Selo>Avulsa</Selo>
            )}
            {v.aguardandoOrcamento && <Selo variante="destaque">Aguardando orçamento</Selo>}
          </p>
        </div>
        <SituacaoServico status={v.status} className="text-[13px]" />
      </header>

      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Quem foi</dt>
          <dd className="font-medium">
            {quemFoi} <span className="font-normal text-muted-foreground">· {v.equipe.nome}</span>
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Enviada</dt>
          <dd className="font-medium">
            {v.enviadoEm ? `${formatarDataHora(v.enviadoEm)}${v.enviadoPor ? ` por ${v.enviadoPor.nome}` : ''}` : 'Ainda não enviada'}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">{v.status === 'DEVOLVIDO' ? 'Devolvida' : 'Validada'}</dt>
          <dd className="font-medium">
            {v.validadoEm ? `${formatarDataHora(v.validadoEm)}${v.validadoPor ? ` por ${v.validadoPor.nome}` : ''}` : '—'}
          </dd>
        </div>
      </dl>

      {v.motivoDevolucao &&
        (v.status === 'DEVOLVIDO' ? (
          <p className="rounded-lg border border-destaque bg-destaque-suave px-3 py-2 text-[13px] text-destaque-texto">Motivo da devolução: “{v.motivoDevolucao}”</p>
        ) : (
          // visita avulsa: o motivo da última devolução fica guardado depois de validada
          <p className="text-[13px] text-muted-foreground">Foi devolvida ao técnico antes de ser validada. Motivo: “{v.motivoDevolucao}”</p>
        ))}
      {v.dispensadaEm && (
        <p className="text-[13px] text-muted-foreground">
          Dispensada da lista de orçamento em {formatarDataHora(v.dispensadaEm)}
          {v.dispensadaPor ? ` por ${v.dispensadaPor.nome}` : ''}.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h4 className="text-[13px] font-semibold">Observações de medição</h4>
        <p className="text-sm whitespace-pre-wrap text-foreground/90">{v.observacoesTecnico?.trim() || <span className="text-muted-foreground">Sem observações.</span>}</p>
      </div>

      {v.fotos.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3" aria-label={`Fotos da visita de ${periodo(v)}`}>
          {v.fotos.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAberta({ fotos: v.fotos, indice: i })}
                className="group flex w-full flex-col gap-1.5 text-left"
                aria-label={`Ampliar foto: ${rotuloDaFoto(f)}`}
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                  <ImagemProtegida
                    src={urlDaFoto(f.id, 'miniatura')}
                    alt={rotuloDaFoto(f)}
                    className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                    carregando={<Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" aria-hidden />}
                    emErro={<ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />}
                  />
                </span>
                <span className="truncate text-xs text-foreground/80">{rotuloDaFoto(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <VideosDoServico videos={v.videos} />

      {acoes && <div className="flex flex-wrap items-center gap-2 border-t pt-3">{acoes}</div>}
      <FotoAmpliadaConsulta aberta={aberta} onIndice={(indice) => setAberta((a) => (a ? { ...a, indice } : a))} onFechar={() => setAberta(null)} />
    </article>
  );
}

/**
 * As visitas técnicas de um cliente (avulsas e as dos projetos dele), da mais recente.
 * `ocultarSemVisitas`: na ficha do projeto, a seção só aparece quando há alguma.
 */
export function VisitasDoCliente({ clienteId, titulo, ocultarSemVisitas = true }: { clienteId: string; titulo: string; ocultarSemVisitas?: boolean }) {
  const visitas = useVisitasDoCliente(clienteId);
  if (ocultarSemVisitas && visitas.data?.length === 0) return null;
  return (
    <section aria-labelledby="titulo-visitas-do-cliente" className="flex flex-col gap-3.5 rounded-[14px] border bg-card px-6 py-[22px]">
      <h2 id="titulo-visitas-do-cliente" className="text-xl font-bold">
        {titulo}
        {visitas.data && visitas.data.length > 0 && <span className="font-normal text-muted-foreground"> ({visitas.data.length})</span>}
      </h2>
      {visitas.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando as visitas…
        </p>
      ) : visitas.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as visitas. {textoDoErro(visitas.error)}
        </p>
      ) : visitas.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma visita técnica agendada para este cliente.</p>
      ) : (
        visitas.data.map((v) => <CartaoVisita key={v.id} visita={v} />)
      )}
    </section>
  );
}
