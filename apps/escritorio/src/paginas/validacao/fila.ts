import { useQuery } from '@tanstack/react-query';
import { api } from '@guarusolar/web/api';
import type { ServicoNaFila } from '@/lib/tipos';

/*
 * Consulta da fila em módulo próprio: o contador do menu usa a mesma consulta (e o mesmo
 * cache) sem puxar a tela de validação, que é carregada sob demanda, para o pacote inicial.
 *
 * A fila não se recarrega sozinha: quem avisa que ela mudou é a versão da operação
 * (app/AcompanhamentoOperacao), um pedido minúsculo a cada 20 s.
 */
export const CHAVE_FILA = ['validacao', 'fila'] as const;

export const useFilaDeValidacao = () =>
  useQuery({
    queryKey: CHAVE_FILA,
    queryFn: ({ signal }) => api.get<ServicoNaFila[]>('/api/validacao/fila', { signal }),
  });

/** Fora de ['validacao']: invalidar a validação inteira não pode repetir a pergunta da versão. */
export const CHAVE_VERSAO = ['operacao', 'versao'] as const;
export const INTERVALO_DA_VERSAO = 20_000;

const buscarVersao = ({ signal }: { signal: AbortSignal }) =>
  api.get<{ versao: string }>('/api/validacao/versao', { signal });

/**
 * Versão da operação (GET /api/validacao/versao, sem ir ao banco). Pergunta a cada 20 s
 * enquanto o sistema está em uso, também com a aba em segundo plano (o título da aba mostra o
 * contador). Sem aviso flutuante quando falha: a fila mostra "Sem conexão" (useSemConexao).
 */
export const useVersaoDaOperacao = (emUso: boolean) =>
  useQuery({
    queryKey: CHAVE_VERSAO,
    queryFn: buscarVersao,
    refetchInterval: emUso ? INTERVALO_DA_VERSAO : false,
    refetchIntervalInBackground: true,
    retry: false,
    meta: { erroNaTela: true },
  });

/** A versão não responde há mais de 1 minuto: a fila na tela pode estar desatualizada. */
export function useSemConexao() {
  // só observa o cache (quem pergunta é o AcompanhamentoOperacao, montado no Layout)
  const versao = useQuery({ queryKey: CHAVE_VERSAO, queryFn: buscarVersao, enabled: false, meta: { erroNaTela: true } });
  return versao.status === 'error' && versao.errorUpdatedAt - versao.dataUpdatedAt > 60_000;
}
