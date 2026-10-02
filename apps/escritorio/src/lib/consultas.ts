import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErroApi, SEM_CONEXAO } from '@guarusolar/web/api';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** O formulário mostra o erro nos campos; não precisa de aviso global. */
      erroTratadoNoFormulario?: boolean;
    };
    queryMeta: {
      /** A tela mostra o erro no próprio quadro (com textoDoErro); sem aviso flutuante repetido. */
      erroNaTela?: boolean;
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

/** Motivo do erro para mostrar na tela (as mensagens da API já são escritas para o usuário). */
export const textoDoErro = (erro: unknown) =>
  erro instanceof ErroApi ? erro.message : 'Algo deu errado. Tente novamente.';

export const clienteConsultas = new QueryClient({
  queryCache: new QueryCache({
    onError: (erro, consulta) => {
      if (!consulta.meta?.erroNaTela) avisarErro(erro);
    },
  }),
  mutationCache: new MutationCache({
    onError: (erro, _variaveis, _contexto, mutacao) => {
      if (!mutacao.meta?.erroTratadoNoFormulario) avisarErro(erro);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Repetir só quando o servidor não respondeu; erro de regra (4xx) não muda tentando de novo.
      retry: (tentativas, erro) =>
        erro instanceof ErroApi && (erro.status === SEM_CONEXAO || erro.status >= 500) && tentativas < 2,
    },
  },
});
