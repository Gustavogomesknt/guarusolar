import { useEffect, useState } from 'react';
import { ouvirDemora } from './api';

/**
 * Faixa no topo quando o servidor demora a responder (plano gratuito da Render: depois de
 * 15 min parado, o primeiro pedido leva de 30 a 60 s). Some sozinha quando a resposta chega.
 * role="status": leitores de tela anunciam sem roubar o foco.
 */
export function AvisoServidorAcordando() {
  const [demorando, setDemorando] = useState(false);
  useEffect(() => ouvirDemora(setDemorando), []);
  if (!demorando) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <p className="flex max-w-md items-center gap-2.5 rounded-xl bg-sidebar px-4 py-2.5 text-sm text-white shadow-lg">
        <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <span>
          <strong className="font-semibold">Conectando ao sistema…</strong> Depois de um tempo parado, a primeira
          abertura pode levar até 1 minuto. Não precisa recarregar.
        </span>
      </p>
    </div>
  );
}
