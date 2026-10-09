import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { adicionarNaFila, descartar, ouvirFila, retratoDaFila, tentarDeNovo, type EstadoNaFila } from './fila';
import type { Posicao } from './metadados';

export type EstadoFotoLocal = EstadoNaFila;

/** Foto tirada neste aparelho que ainda não foi confirmada pela API. */
export type FotoLocal = {
  idLocal: string;
  chave: string | null;
  /** miniatura local (object URL); null enquanto a foto é preparada */
  url: string | null;
  estado: EstadoFotoLocal;
  /** a foto já foi reduzida: dá para tentar o envio de novo sem tirar outra */
  preparada: boolean;
  erro?: string;
};

/** A fila inteira (todas as fotos do técnico logado), para avisos gerais. */
export const useFila = () => useSyncExternalStore(ouvirFila, retratoDaFila);

/**
 * Fotos de um serviço que ainda estão no aparelho (fila offline em fotos/fila.ts).
 * `miniaturas`: fotos já enviadas nesta sessão continuam com a miniatura local, para não
 * baixar de volta 1 MB por foto só para mostrar que ela existe.
 */
export function useFotos(servicoId: string) {
  const fila = useFila();
  const locais = useMemo<FotoLocal[]>(
    () => fila.fotos.filter((f) => f.servicoId === servicoId),
    [fila.fotos, servicoId],
  );

  const adicionar = useCallback(
    (arquivo: File, chave: string | null, posicao: Promise<Posicao | null>) =>
      adicionarNaFila({ servicoId, chave, arquivo, posicao }),
    [servicoId],
  );

  return {
    locais,
    miniaturas: fila.miniaturas,
    semConexao: fila.semConexao,
    aguardandoServidor: fila.aguardandoServidor,
    conexaoLenta: fila.conexaoLenta,
    adicionar,
    tentarDeNovo,
    descartar,
  };
}
