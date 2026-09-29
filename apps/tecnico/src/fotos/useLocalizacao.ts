import { useCallback, useEffect, useState } from 'react';
import { obterPosicao, type Posicao } from './metadados';

/**
 * - `concedida`: dá para pedir a posição a cada foto, sem nenhuma pergunta na tela;
 * - `perguntar`: o navegador ainda vai perguntar (ou não sabemos);
 * - `negada`: o técnico bloqueou; as fotos seguem sem local;
 * - `indisponivel`: sem GPS ou sem HTTPS (o navegador só libera a localização em HTTPS).
 */
export type EstadoLocalizacao = 'concedida' | 'perguntar' | 'negada' | 'indisponivel';

const disponivel = () => 'geolocation' in navigator && window.isSecureContext;

/**
 * A permissão é pedida num toque próprio ("Permitir localização"), nunca no mesmo toque que
 * abre a câmera: no iPhone o pedido é um alerta do sistema e pode impedir a câmera de abrir.
 * Depois de concedida, cada foto pede a posição em silêncio.
 */
export function useLocalizacao() {
  const [estado, setEstado] = useState<EstadoLocalizacao>(() => (disponivel() ? 'perguntar' : 'indisponivel'));

  // A Permissions API diz se já foi concedida (Chrome e Safari 16+) e avisa quando muda
  // (ex.: o técnico libera nas configurações e volta ao app).
  useEffect(() => {
    if (!disponivel() || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const aplicar = () => {
      if (!status) return;
      setEstado(status.state === 'granted' ? 'concedida' : status.state === 'denied' ? 'negada' : 'perguntar');
    };
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        status = s;
        aplicar();
        s.addEventListener('change', aplicar);
      })
      .catch(() => {
        /* navegador sem consulta de permissão: fica em "perguntar" até o técnico tocar */
      });
    return () => status?.removeEventListener('change', aplicar);
  }, []);

  /** Chamado pelo botão "Permitir localização": mostra a pergunta do navegador. */
  const pedir = useCallback(async () => {
    const posicao = await obterPosicao();
    if (posicao) {
      setEstado('concedida');
      return posicao;
    }
    // Sem posição pode ser recusa, pergunta fechada sem resposta ou GPS lento: quando o
    // navegador deixa consultar, vale o estado real; senão, trata como recusa.
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      setEstado(status.state === 'granted' ? 'concedida' : status.state === 'denied' ? 'negada' : 'perguntar');
    } catch {
      setEstado('negada');
    }
    return null;
  }, []);

  /** Posição para uma foto: só busca se já estiver concedida (nunca abre pergunta aqui). */
  const paraFoto = useCallback(
    (): Promise<Posicao | null> => (estado === 'concedida' ? obterPosicao() : Promise.resolve(null)),
    [estado],
  );

  return { estado, pedir, paraFoto };
}
