import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ErroApi } from '@guarusolar/web/api';
import type { TipoDeServico } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/*
 * Tipo de serviço VENDIDO (instalação fotovoltaica, carregador veicular, manutenção...): o que o
 * orçamento vende, gerenciado na tela "Tipos de serviço". Não é a ETAPA do agendamento (que a
 * Agenda chama de "Etapa": instalação, visita técnica, vistoria...).
 */

/** Como aparecem os orçamentos e projetos anteriores ao campo. */
export const SEM_TIPO = 'Sem tipo';

/** Lista dos tipos (todos, inclusive desativados: quem filtra e mostra precisa do nome deles). */
export const useTiposDeServico = () =>
  useQuery({
    queryKey: ['tipos-de-servico', 'todos'],
    queryFn: ({ signal }) => api.get<TipoDeServico[]>('/api/tipos-de-servico?incluirInativos=true', { signal }),
    staleTime: 5 * 60_000,
  });

/** Valor do filtro: '' = todos; 'sem' = sem tipo; ou o id de um tipo. */
export type FiltroTipo = string;

const CLASSE_FILTRO =
  'flex h-10 items-center gap-2 rounded-[10px] border border-input bg-card pr-2.5 pl-3 text-[13px] text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30';

export function FiltroDeTipo({ valor, onChange, className }: { valor: FiltroTipo; onChange: (v: FiltroTipo) => void; className?: string }) {
  const tipos = useTiposDeServico();
  return (
    <label className={cn(CLASSE_FILTRO, className)}>
      Tipo
      <select aria-label="Filtrar por tipo de serviço" value={valor} onChange={(e) => onChange(e.target.value)} className="h-full max-w-[220px] bg-transparent text-sm font-medium text-foreground outline-none">
        <option value="">Todos os tipos</option>
        {tipos.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
            {t.ativo ? '' : ' (desativado)'}
          </option>
        ))}
        <option value="sem">{SEM_TIPO} (a classificar)</option>
      </select>
    </label>
  );
}

/**
 * Classifica um orçamento ainda "Sem tipo", em qualquer status (o aprovado não se edita no
 * gerador, mas se classifica aqui). O projeto do orçamento recebe o mesmo tipo.
 */
export function ClassificarTipo({ orcamentoId, codigo }: { orcamentoId: string; codigo: string }) {
  const tipos = useTiposDeServico();
  const clienteConsultas = useQueryClient();
  const classificar = useMutation({
    mutationFn: (tipoDeServicoId: string) => api.patch<{ tipoDeServico: { nome: string } }>(`/api/orcamentos/${orcamentoId}/tipo`, { tipoDeServicoId }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (r) => {
      toast.success(`${codigo} classificado como ${r.tipoDeServico.nome}`);
      void clienteConsultas.invalidateQueries({ queryKey: ['orcamentos'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['projetos'] });
    },
    onError: (erro) => {
      if (!(erro instanceof ErroApi && erro.status === 401)) toast.error(erro instanceof ErroApi ? erro.message : 'Não foi possível classificar.');
    },
  });
  return (
    <select
      aria-label={`Classificar o tipo de serviço de ${codigo}`}
      value=""
      disabled={classificar.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => e.target.value && classificar.mutate(e.target.value)}
      className="h-8 max-w-full rounded-lg border border-dashed border-destaque bg-destaque-suave px-1.5 text-xs font-medium text-destaque-texto outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <option value="">{SEM_TIPO}: classificar…</option>
      {tipos.data
        ?.filter((t) => t.ativo)
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
    </select>
  );
}
