import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErroApi, SEM_CONEXAO } from '@guarusolar/web/api';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** A tela mostra o erro no próprio lugar; não precisa de aviso global. */
      erroTratadoNaTela?: boolean;
    };
  }
}

/** Aviso global de erro. 401 não avisa: a sessão já leva de volta ao login com a mensagem. */
function avisarErro(erro: unknown) {
  if (erro instanceof ErroApi) {
    if (erro.status !== 401) toast.error(erro.message);
    return;
  }
  toast.error('Algo deu errado. Tente novamente.');
}

export const clienteConsultas = new QueryClient({
  queryCache: new QueryCache({ onError: avisarErro }),
  mutationCache: new MutationCache({
    onError: (erro, _variaveis, _contexto, mutacao) => {
      if (!mutacao.meta?.erroTratadoNaTela) avisarErro(erro);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // em campo o técnico troca de app o tempo todo (câmera, WhatsApp, mapa): ao voltar, atualiza
      refetchOnWindowFocus: true,
      retry: (tentativas, erro) =>
        erro instanceof ErroApi && (erro.status === SEM_CONEXAO || erro.status >= 500) && tentativas < 2,
    },
  },
});
