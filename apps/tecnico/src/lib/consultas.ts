import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ComponentProps } from 'react';
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

/**
 * Aviso global de erro. 401 não avisa (a sessão já leva ao login com a mensagem) e falta de
 * conexão também não: em campo isso é normal, e a tela continua com os dados guardados.
 */
function avisarErro(erro: unknown) {
  if (erro instanceof ErroApi) {
    if (erro.status !== 401 && erro.status !== SEM_CONEXAO) toast.error(erro.message);
    return;
  }
  toast.error('Algo deu errado. Tente novamente.');
}

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

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
      // guardado no aparelho por até 7 dias (ver OPCOES_DE_PERSISTENCIA): o que sai da memória
      // antes disso também sairia do aparelho
      gcTime: SETE_DIAS,
      // em campo o técnico troca de app o tempo todo (câmera, WhatsApp, mapa): ao voltar, atualiza
      refetchOnWindowFocus: true,
      retry: (tentativas, erro) =>
        erro instanceof ErroApi && (erro.status === SEM_CONEXAO || erro.status >= 500) && tentativas < 2,
    },
  },
});

function armazenamentoLocal() {
  try {
    return window.localStorage;
  } catch {
    return undefined; // bloqueado: o app funciona, só não abre sem internet
  }
}

/**
 * Agenda e serviços abertos ficam guardados no aparelho: sem sinal, o técnico abre o app e vê
 * o serviço do dia e o checklist. Só esses dois tipos de consulta, e só as que deram certo.
 * `buster`: troque quando o formato das respostas mudar, para descartar o que estiver guardado.
 */
export const OPCOES_DE_PERSISTENCIA: ComponentProps<typeof PersistQueryClientProvider>['persistOptions'] = {
  persister: createSyncStoragePersister({ storage: armazenamentoLocal(), key: 'guarusolar.tecnico.consultas' }),
  maxAge: SETE_DIAS,
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (consulta) =>
      consulta.state.status === 'success' && ['agenda', 'servico'].includes(String(consulta.queryKey[0])),
  },
};
