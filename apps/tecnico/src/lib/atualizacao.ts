import { useSyncExternalStore } from 'react';
import { quandoAppDesatualizado } from '@guarusolar/web/api';
import { filaTemAlgo } from '@/fotos/fila';
import { clienteConsultas } from './consultas';
import type { ServicoNaAgenda } from './tipos';

/*
 * Estado da atualização do app (service worker), lido pela faixa do topo (AvisoAtualizacao).
 */

// A API recusou a versão deste app (426, compartilhado/versaoDoAppDeCampo.ts)
let desatualizado = false;
const ouvintes = new Set<() => void>();
quandoAppDesatualizado(() => {
  if (desatualizado) return;
  desatualizado = true;
  for (const avisar of ouvintes) avisar();
});

function acompanhar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

export const useAppDesatualizado = () => useSyncExternalStore(acompanhar, () => desatualizado);

const PREFIXO_RASCUNHO = 'guarusolar.tecnico.rascunho.';

/**
 * Por que NÃO atualizar sozinho agora (null = nada em andamento, pode atualizar sem perguntar).
 * Atualizar recarrega a página: o que está no aparelho (fila no IndexedDB, rascunho e agenda no
 * localStorage) sobrevive, mas no meio de um serviço a troca de tela atrapalharia o técnico.
 * Em andamento = alguma foto no aparelho (mesmo com erro), a tela de um serviço aberta, rascunho
 * de observações guardado, ou serviço dele em execução ou devolvido na agenda guardada.
 */
export function motivoParaNaoAtualizarSozinho(): string | null {
  const fila = filaTemAlgo();
  if (fila === null) return 'a fila de fotos ainda não foi lida';
  if (fila) return 'há fotos no aparelho';
  if (/\/servico\//.test(window.location.pathname)) return 'a tela de um serviço está aberta';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith(PREFIXO_RASCUNHO)) return 'há rascunho de um serviço';
    }
  } catch {
    // sem localStorage não há rascunho guardado
  }
  const agenda = clienteConsultas.getQueryData<ServicoNaAgenda[]>(['agenda']);
  if (agenda?.some((s) => s.status === 'EM_EXECUCAO' || s.status === 'DEVOLVIDO')) return 'há serviço em execução';
  return null;
}
