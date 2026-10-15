import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { AVISO_APP_DESATUALIZADO } from '@guarusolar/compartilhado';
import { motivoParaNaoAtualizarSozinho, useAppDesatualizado } from '@/lib/atualizacao';
import { cn } from '@/lib/utils';

/** Até quanto tempo depois de abrir o app a versão nova ainda conta como "ao abrir". */
const JANELA_DA_ABERTURA = 30_000;

/**
 * O app fica guardado no aparelho (service worker, registerType "prompt"): a versão nova é
 * baixada sozinha, mas só ENTRA quando alguém manda (updateServiceWorker), nunca no meio do uso.
 * Antes disso, o navegador só a trocaria quando todas as janelas do app fechassem de verdade
 * (no Android, tirar o app da lista de recentes), o que um técnico quase nunca faz.
 *
 * - Versão nova e NADA em andamento (motivoParaNaoAtualizarSozinho): atualiza sozinho ao abrir
 *   o app ou ao voltar para ele, sem perguntar.
 * - Versão nova com algo em andamento: faixa "Nova versão disponível" com "Atualizar agora".
 * - A API recusou esta versão (426): faixa "Seu aplicativo está desatualizado. Toque para
 *   atualizar"; o app procura a versão nova na hora e o botão a aplica.
 * A fila de fotos (IndexedDB), o rascunho e a agenda guardada (localStorage) não são do service
 * worker: atualizar recarrega a página e tudo continua lá; a versão nova envia as fotos.
 *
 * Faixa no topo, dentro do fluxo da página: fixa embaixo, cobriria o botão principal do
 * serviço ("Enviar para validação"), que fica preso no rodapé.
 */
export function AvisoAtualizacao() {
  const registro = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [temVersaoNova],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return;
      registro.current = r;
      // confere uma versão nova a cada hora com o app aberto (o técnico quase nunca o fecha)
      setInterval(() => void r.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  const desatualizado = useAppDesatualizado();
  const [procurando, setProcurando] = useState(false);
  const atualizar = useCallback(() => void updateServiceWorker(true), [updateServiceWorker]);

  // voltou para o app: confere se saiu versão nova
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void registro.current?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  // versão nova pronta: sem nada em andamento, entra sozinha ao abrir o app ou ao voltar para ele
  // (no meio do uso, não: recarregar a tela sob o dedo do técnico só atrapalha)
  useEffect(() => {
    if (!temVersaoNova) return;
    const tentar = (aoAbrir: boolean) => {
      if (document.visibilityState !== 'visible') return;
      if (aoAbrir && performance.now() > JANELA_DA_ABERTURA) return;
      if (motivoParaNaoAtualizarSozinho() === null) atualizar();
    };
    tentar(true);
    const aoVoltar = () => tentar(false);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [temVersaoNova, atualizar]);

  // a API recusou esta versão: procura a nova na hora (o botão a aplica)
  useEffect(() => {
    if (desatualizado) void registro.current?.update().catch(() => undefined);
  }, [desatualizado]);

  // tocou em Atualizar antes de a versão nova terminar de baixar: aplica assim que chegar
  useEffect(() => {
    if (procurando && temVersaoNova) atualizar();
  }, [procurando, temVersaoNova, atualizar]);

  const aoTocar = () => {
    if (temVersaoNova) return atualizar();
    const r = registro.current;
    // sem service worker (navegador sem suporte, ou o registro falhou): recarregar já traz a nova
    if (!r) return window.location.reload();
    setProcurando(true);
    void r.update().catch(() => undefined);
    // nada para instalar depois de um tempo (versão nova já ativa em outra aba, por exemplo):
    // recarregar pega o que estiver valendo
    setTimeout(() => {
      if (!r.installing && !r.waiting) window.location.reload();
    }, 15_000);
  };

  if (!desatualizado && !temVersaoNova) return null;
  return (
    <div
      role={desatualizado ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-3 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-sm',
        desatualizado ? 'border-b border-destaque bg-destaque-suave text-destaque-texto' : 'bg-secondary text-secondary-foreground',
      )}
    >
      {desatualizado && <AlertTriangle className="size-5 shrink-0" aria-hidden />}
      <span className="flex flex-1 flex-col">
        <span className={cn(desatualizado && 'font-semibold')}>{desatualizado ? AVISO_APP_DESATUALIZADO : 'Nova versão disponível.'}</span>
        {desatualizado && <span className="text-xs">As fotos guardadas continuam no celular e são enviadas depois.</span>}
      </span>
      <button
        type="button"
        onClick={aoTocar}
        disabled={procurando}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-70"
      >
        {procurando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {desatualizado ? 'Atualizar' : 'Atualizar agora'}
      </button>
    </div>
  );
}
