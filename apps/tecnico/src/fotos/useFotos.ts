import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErroApi } from '@guarusolar/web/api';
import { enviarFoto } from './envio';
import { lerMetadados, type Posicao } from './metadados';
import { reduzirFoto } from './reduzir';

export type EstadoFotoLocal = 'preparando' | 'enviando' | 'erro';

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

type Preparada = { blob: Blob; capturadaEm: Date; posicao: Posicao | null };

/**
 * Fotos de um serviço tiradas no aparelho: prepara (reduz + metadados) e envia.
 * Nesta versão o envio é direto; a fila offline (IndexedDB) troca só o miolo deste hook.
 *
 * O preparo é feito uma foto por vez: decodificar uma foto de 12 MP ocupa ~50 MB de memória,
 * e várias ao mesmo tempo derrubam a aba em celular simples.
 *
 * `miniaturas`: fotos já enviadas nesta sessão continuam com a miniatura local, para não
 * baixar de volta 1 MB por foto só para mostrar que ela existe.
 */
export function useFotos(servicoId: string) {
  const clienteConsultas = useQueryClient();
  const [locais, setLocais] = useState<FotoLocal[]>([]);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const preparadas = useRef(new Map<string, Preparada>());
  const filaDePreparo = useRef<Promise<unknown>>(Promise.resolve());
  const locaisAtuais = useRef(locais);
  locaisAtuais.current = locais;

  const atualizar = (idLocal: string, mudanca: Partial<FotoLocal>) =>
    setLocais((lista) => lista.map((f) => (f.idLocal === idLocal ? { ...f, ...mudanca } : f)));

  const remover = useCallback((idLocais: string[], manterUrl = false) => {
    for (const idLocal of idLocais) {
      preparadas.current.delete(idLocal);
      const url = locaisAtuais.current.find((f) => f.idLocal === idLocal)?.url;
      if (url && !manterUrl) URL.revokeObjectURL(url);
    }
    setLocais((lista) => lista.filter((f) => !idLocais.includes(f.idLocal)));
  }, []);

  const enviar = useCallback(
    async (idLocal: string, chave: string | null) => {
      const foto = preparadas.current.get(idLocal);
      if (!foto) return;
      atualizar(idLocal, { estado: 'enviando', erro: undefined });
      try {
        const recebida = await enviarFoto({
          servicoId,
          chave,
          idLocal,
          blob: foto.blob,
          capturadaEm: foto.capturadaEm,
          latitude: foto.posicao?.latitude,
          longitude: foto.posicao?.longitude,
        });
        const url = locaisAtuais.current.find((f) => f.idLocal === idLocal)?.url;
        if (url) setMiniaturas((m) => ({ ...m, [recebida.id]: url }));
        // primeiro o serviço atualizado chega, depois a foto local sai: sem piscar "falta a foto"
        await clienteConsultas.invalidateQueries({ queryKey: ['servico', servicoId] });
        remover([idLocal], true);
      } catch (erro) {
        atualizar(idLocal, {
          estado: 'erro',
          erro: erro instanceof ErroApi ? erro.message : 'Não foi possível enviar a foto.',
        });
      }
    },
    [clienteConsultas, servicoId, remover],
  );

  const adicionar = useCallback(
    (arquivo: File, chave: string | null, posicao: Promise<Posicao | null>) => {
      const idLocal = crypto.randomUUID();
      // refazendo a foto de um item: a tentativa anterior que falhou sai da tela
      if (chave) {
        remover(locaisAtuais.current.filter((f) => f.chave === chave && f.estado === 'erro').map((f) => f.idLocal));
      }
      setLocais((lista) => [...lista, { idLocal, chave, url: null, estado: 'preparando', preparada: false }]);

      const preparar = async () => {
        try {
          const [reduzida, metadados] = await Promise.all([reduzirFoto(arquivo), lerMetadados(arquivo, posicao)]);
          preparadas.current.set(idLocal, { blob: reduzida.blob, ...metadados });
          atualizar(idLocal, { url: URL.createObjectURL(reduzida.blob), preparada: true });
          return true;
        } catch (erro) {
          atualizar(idLocal, {
            estado: 'erro',
            erro: erro instanceof Error ? erro.message : 'Não foi possível preparar a foto. Tire outra.',
          });
          return false;
        }
      };
      // o preparo entra na fila; o envio corre em paralelo com o preparo da próxima foto
      const preparo = filaDePreparo.current.then(preparar);
      filaDePreparo.current = preparo;
      void preparo.then((ok) => {
        if (ok) void enviar(idLocal, chave);
      });
    },
    [enviar, remover],
  );

  const tentarDeNovo = useCallback(
    (idLocal: string) => {
      const foto = locaisAtuais.current.find((f) => f.idLocal === idLocal);
      if (foto?.preparada) void enviar(idLocal, foto.chave);
    },
    [enviar],
  );

  const descartar = useCallback((idLocal: string) => remover([idLocal]), [remover]);

  // ao sair da tela, libera as miniaturas da memória
  const urls = useRef<string[]>([]);
  urls.current = [...locais.map((f) => f.url).filter((u): u is string => !!u), ...Object.values(miniaturas)];
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return { locais, miniaturas, adicionar, tentarDeNovo, descartar };
}
