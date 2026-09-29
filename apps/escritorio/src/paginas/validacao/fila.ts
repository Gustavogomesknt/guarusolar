import { useQuery } from '@tanstack/react-query';
import { api } from '@guarusolar/web/api';
import type { ServicoNaFila } from '@/lib/tipos';

/*
 * Consulta da fila em módulo próprio: o contador do menu usa a mesma consulta (e o mesmo
 * cache) sem puxar a tela de validação, que é carregada sob demanda, para o pacote inicial.
 */
export const CHAVE_FILA = ['validacao', 'fila'] as const;

export const useFilaDeValidacao = () =>
  useQuery({
    queryKey: CHAVE_FILA,
    queryFn: ({ signal }) => api.get<ServicoNaFila[]>('/api/validacao/fila', { signal }),
    // técnicos enviam o tempo todo: a fila (e o contador do menu) se atualiza a cada minuto
    refetchInterval: 60_000,
  });
