import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

/**
 * O app fica guardado no aparelho (service worker) para abrir sem internet. Quando sai uma
 * versão nova, ela só entra depois que o técnico toca em "Atualizar": trocar sozinho no meio
 * de um serviço recarregaria a tela. A fila de fotos está no IndexedDB e sobrevive à troca.
 *
 * Faixa no topo, dentro do fluxo da página: fixa embaixo, cobriria o botão principal do
 * serviço ("Enviar para validação"), que fica preso no rodapé.
 */
export function AvisoAtualizacao() {
  const {
    needRefresh: [temVersaoNova],
    updateServiceWorker,
  } = useRegisterSW({
    // confere uma versão nova a cada hora com o app aberto (o técnico quase nunca o fecha)
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => void registro.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  if (!temVersaoNova) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-3 bg-secondary px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-sm text-secondary-foreground"
    >
      <span className="flex-1">Nova versão do app disponível.</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
      >
        <RefreshCw className="size-4" aria-hidden />
        Atualizar
      </button>
    </div>
  );
}
