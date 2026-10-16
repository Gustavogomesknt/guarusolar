import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListFilter, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ErroApi } from '@guarusolar/web/api';
import type { TipoDeServico } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/*
 * Tipo de serviço VENDIDO (instalação fotovoltaica, carregador veicular, manutenção...): o que o
 * orçamento vende, gerenciado na tela "Tipos de serviço". Não é a ETAPA do agendamento (que a
 * Agenda chama de "Etapa": instalação, visita técnica, vistoria...).
 */

/** Nome do filtro dos orçamentos e projetos anteriores ao campo (na tela, só um traço discreto). */
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

/**
 * O tipo NÃO aparece nas listas (decisão do cliente, 15/10/2026: poluía a tela); é só filtro.
 * Fechado, é um botão "Filtrar por tipo"; aberto (ou com um tipo escolhido), a lista dos tipos e o
 * X que limpa e fecha. Nada vem ligado: o padrão é todos os tipos.
 */
export function FiltroDeTipo({ valor, onChange, className }: { valor: FiltroTipo; onChange: (v: FiltroTipo) => void; className?: string }) {
  const tipos = useTiposDeServico();
  const [aberto, setAberto] = useState(false);
  if (!aberto && valor === '') {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(CLASSE_FILTRO, 'cursor-pointer pr-3 font-medium text-foreground/80 hover:bg-muted', className)}
      >
        <ListFilter className="size-4" aria-hidden />
        Filtrar por tipo
      </button>
    );
  }
  return (
    <label className={cn(CLASSE_FILTRO, className)}>
      Tipo
      <select
        aria-label="Filtrar por tipo de serviço"
        value={valor}
        // abriu agora: a lista já recebe o foco
        autoFocus={valor === ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-full max-w-[220px] bg-transparent text-sm font-medium text-foreground outline-none"
      >
        <option value="">Todos os tipos</option>
        {tipos.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
            {t.ativo ? '' : ' (desativado)'}
          </option>
        ))}
        <option value="sem">{SEM_TIPO} (a classificar)</option>
      </select>
      <button
        type="button"
        aria-label="Tirar o filtro por tipo"
        onClick={(e) => {
          e.preventDefault();
          onChange('');
          setAberto(false);
        }}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </label>
  );
}

/** Último tipo que quem está logado escolheu (guardado no servidor); null = nunca escolheu. */
export const usePreferenciaDeTipo = (ligada: boolean) =>
  useQuery({
    // dentro de 'orcamentos': salvar um orçamento invalida e o próximo novo já pega a escolha
    queryKey: ['orcamentos', 'preferencias'],
    queryFn: ({ signal }) => api.get<{ tipoDeServicoId: string | null }>('/api/orcamentos/preferencias', { signal }),
    enabled: ligada,
    staleTime: 0,
  });

/**
 * Classifica um orçamento ainda "Sem tipo", em qualquer status (o aprovado não se edita no
 * gerador, mas se classifica aqui). O projeto do orçamento recebe o mesmo tipo. Discreto de
 * propósito: o "Sem tipo" não fica em destaque (quem quer achá-los usa o filtro).
 */
export function ClassificarTipo({
  orcamentoId,
  codigo,
  onClassificado,
}: {
  orcamentoId: string;
  codigo: string;
  onClassificado?: (tipo: { id: string; nome: string }) => void;
}) {
  const tipos = useTiposDeServico();
  const clienteConsultas = useQueryClient();
  const classificar = useMutation({
    mutationFn: (tipoDeServicoId: string) => api.patch<{ tipoDeServico: { id: string; nome: string } }>(`/api/orcamentos/${orcamentoId}/tipo`, { tipoDeServicoId }),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (r) => {
      toast.success(`${codigo} classificado como ${r.tipoDeServico.nome}`);
      onClassificado?.(r.tipoDeServico);
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
      className="h-8 max-w-full rounded-lg border border-input bg-card px-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <option value="">Classificar…</option>
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
