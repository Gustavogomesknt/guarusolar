import { useQuery } from '@tanstack/react-query';
import { TriangleAlert, Users } from 'lucide-react';
import { api } from '@guarusolar/web/api';
import type { EquipeNaAgenda } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/*
 * A ESCALA de um serviço: quem vai de fato. A equipe é a composição padrão (e a linha da
 * agenda); cada serviço nasce com os técnicos da equipe e o gestor troca aqui. É a escala que
 * dá acesso ao técnico no app (regra 6 do CLAUDE.md, conferida na API).
 */

export type TecnicoDaAgenda = { id: string; nome: string; equipeId: string | null };
export type AvisoDeConflito = { quem: 'EQUIPE' | 'TECNICO'; nome: string; texto: string };
type Escalado = { usuario: { id: string; nome: string } };

/** Todos os técnicos ativos, com a equipe padrão de cada um. */
export const useTecnicos = () =>
  useQuery({
    queryKey: ['agenda', 'tecnicos'],
    queryFn: ({ signal }) => api.get<TecnicoDaAgenda[]>('/api/agenda/tecnicos', { signal }),
    staleTime: 5 * 60_000,
  });

/** A composição padrão da equipe: é a escala de um serviço novo. */
export const escalaPadrao = (equipeId: string, tecnicos: TecnicoDaAgenda[]) =>
  tecnicos.filter((t) => t.equipeId === equipeId).map((t) => t.id);

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

/** "Willian + Vitor" (primeiros nomes), para caber no bloco do calendário. */
export const nomesCurtos = (escala: Escalado[]) => escala.map((e) => primeiroNome(e.usuario.nome)).join(' + ');

/** "Willian Souza e Vitor Lima", por extenso. */
export function nomesDaEscala(escala: Escalado[]) {
  const nomes = escala.map((e) => e.usuario.nome);
  if (nomes.length === 0) return 'Ninguém escalado';
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/** A escala do serviço é diferente da composição padrão da equipe dele (houve troca). */
export function escalaTrocada(escala: Escalado[], equipe: Pick<EquipeNaAgenda, 'membros'>) {
  const padrao = equipe.membros.filter((m) => m.papel === 'TECNICO').map((m) => m.id);
  const atual = escala.map((e) => e.usuario.id);
  return padrao.length !== atual.length || padrao.some((id) => !atual.includes(id));
}

/**
 * Onde a equipe e cada pessoa já estão no período. Conflito AVISA, não bloqueia (regra 8): uma
 * visita técnica dura uma hora, e a mesma dupla faz duas ou três no mesmo dia.
 */
export function useAvisosDeConflito(opcoes: { equipeId: string; inicio: string; fim: string; tecnicos: string[]; ignorar?: string; ativo: boolean }) {
  const { equipeId, inicio, fim, tecnicos, ignorar, ativo } = opcoes;
  const parametros = new URLSearchParams({ equipeId, inicio, fim, tecnicos: [...tecnicos].sort().join(',') });
  if (ignorar) parametros.set('ignorar', ignorar);
  return useQuery({
    queryKey: ['agenda', 'conflitos', parametros.toString()],
    queryFn: ({ signal }) => api.get<AvisoDeConflito[]>(`/api/agenda/conflitos?${parametros}`, { signal }),
    enabled: ativo && Boolean(equipeId && inicio && fim),
    placeholderData: (anterior) => anterior,
    staleTime: 0,
  });
}

export function AvisosDeConflito({ avisos }: { avisos: AvisoDeConflito[] | undefined }) {
  if (!avisos?.length) return null;
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-[10px] border border-destaque bg-destaque-suave px-3 py-2.5 text-[13px] text-destaque-texto">
      <p className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        Já há serviço neste período
      </p>
      <ul className="flex list-disc flex-col gap-0.5 pl-5">
        {avisos.map((a) => (
          <li key={a.texto}>{a.texto}</li>
        ))}
      </ul>
      <p className="text-xs">É só um aviso: dá para agendar assim mesmo (por exemplo, duas visitas no mesmo dia).</p>
    </div>
  );
}

/** Aviso laranja de serviço sem ninguém: ninguém o vê no app do técnico. */
export function SemTecnicoEscalado({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold text-destaque-texto', className)}>
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      Sem técnico escalado
    </span>
  );
}

/**
 * "Quem vai": os técnicos da equipe (já marcados ao agendar) e, abaixo, os das outras equipes.
 * Marcar e desmarcar não muda a equipe padrão de ninguém: vale só para este serviço.
 */
export function QuemVai({
  equipeId,
  equipes,
  tecnicos,
  selecionados,
  onChange,
}: {
  equipeId: string;
  equipes: Pick<EquipeNaAgenda, 'id' | 'nome'>[];
  tecnicos: TecnicoDaAgenda[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  const daEquipe = tecnicos.filter((t) => t.equipeId === equipeId);
  const outros = tecnicos.filter((t) => t.equipeId !== equipeId);
  const nomeDaEquipe = (id: string | null) => equipes.find((e) => e.id === id)?.nome ?? 'Sem equipe';
  const alternar = (id: string) => onChange(selecionados.includes(id) ? selecionados.filter((s) => s !== id) : [...selecionados, id]);

  const opcao = (t: TecnicoDaAgenda, comEquipe: boolean) => {
    const marcado = selecionados.includes(t.id);
    return (
      <label
        key={t.id}
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 text-sm transition-colors',
          'focus-within:ring-[3px] focus-within:ring-ring/30',
          marcado ? 'border-primary bg-primary/5 font-medium' : 'border-input bg-card hover:bg-muted',
        )}
      >
        <input type="checkbox" checked={marcado} onChange={() => alternar(t.id)} className="size-4 accent-[#1257A6]" />
        <span className="min-w-0 truncate">{t.nome}</span>
        {comEquipe && <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{nomeDaEquipe(t.equipeId)}</span>}
      </label>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-[13px] font-medium text-foreground/80">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          Quem vai
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {selecionados.length === 0 ? 'ninguém' : selecionados.length === 1 ? '1 pessoa' : `${selecionados.length} pessoas`}
        </span>
      </legend>
      {tecnicos.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum técnico cadastrado. Cadastre em Usuários.</p>
      ) : (
        <>
          {daEquipe.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">{daEquipe.map((t) => opcao(t, false))}</div>
          ) : (
            <p className="text-[13px] text-muted-foreground">A {nomeDaEquipe(equipeId)} não tem técnicos na composição padrão.</p>
          )}
          {outros.length > 0 && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">De outras equipes (só neste serviço)</p>
              <div className="grid grid-cols-2 gap-2">{outros.map((t) => opcao(t, true))}</div>
            </>
          )}
        </>
      )}
      {selecionados.length === 0 && tecnicos.length > 0 && (
        <p className="text-xs text-destaque-texto">
          <SemTecnicoEscalado /> · ninguém vê este serviço no app. Dá para definir depois.
        </p>
      )}
    </fieldset>
  );
}
