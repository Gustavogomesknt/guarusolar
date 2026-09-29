import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

type Estado = { tipo: 'carregando' } | { tipo: 'pronta'; url: string } | { tipo: 'erro' };

/**
 * Imagem que exige login (fotos dos serviços). O navegador não manda o token em <img src>,
 * então o componente busca a imagem com o cabeçalho Authorization (api.baixar), mostra o
 * resultado como object URL e o libera ao sair da tela.
 *
 * O navegador ainda guarda a resposta no cache (a API responde "private, immutable"): abrir
 * a mesma foto de novo não baixa outra vez.
 *
 * `emErro`/`carregando`: o que mostrar no lugar (sem conexão, foto que não abre, carregando).
 */
export function ImagemProtegida({
  src,
  alt,
  className,
  carregando = null,
  emErro = null,
}: {
  src: string;
  alt: string;
  className?: string;
  carregando?: ReactNode;
  emErro?: ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    const controle = new AbortController();
    let url: string | null = null;
    setEstado({ tipo: 'carregando' });
    api
      .baixar(src, { signal: controle.signal })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setEstado({ tipo: 'pronta', url });
      })
      .catch(() => {
        if (!controle.signal.aborted) setEstado({ tipo: 'erro' });
      });
    return () => {
      controle.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (estado.tipo === 'carregando') return <>{carregando}</>;
  if (estado.tipo === 'erro') return <>{emErro}</>;
  return <img src={estado.url} alt={alt} className={className} onError={() => setEstado({ tipo: 'erro' })} />;
}
