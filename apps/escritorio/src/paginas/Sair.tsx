import { useEffect } from 'react';
import { useSessao } from '@guarusolar/web/sessao';
import { TelaCarregando } from '@/components/TelaCheia';

/**
 * O botão "Sair" navega para cá em vez de encerrar a sessão direto. Assim a saída passa
 * pela mesma confirmação das outras navegações (useBlocker) quando há algo não salvo.
 */
export function Sair() {
  const { sair } = useSessao();
  useEffect(() => sair(), [sair]);
  return <TelaCarregando />;
}
