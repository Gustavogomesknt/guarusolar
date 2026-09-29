import { useState, useSyncExternalStore } from 'react';
import { Share, Smartphone } from 'lucide-react';

/*
 * Convite para pôr o app na tela inicial. Não é "instalar" de verdade (continua sendo o site),
 * mas no iPhone é o que protege a fila de fotos: o Safari apaga dados de sites não usados por
 * 7 dias, e o app da tela inicial fica de fora disso.
 *
 * - Android/Chrome: o navegador avisa que dá para instalar (beforeinstallprompt) e o botão
 *   "Instalar" abre o pedido dele. O aviso pode chegar antes desta tela montar, por isso é
 *   capturado aqui, no carregamento do módulo.
 * - iPhone: não há pedido de instalação; mostra o caminho pelo menu Compartilhar.
 */

type EventoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let eventoGuardado: EventoDeInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvir) => ouvir());

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault(); // o convite aparece no nosso cartão, na hora certa
  eventoGuardado = evento as EventoDeInstalacao;
  avisar();
});
window.addEventListener('appinstalled', () => {
  eventoGuardado = null;
  avisar();
});

const ouvir = (fn: () => void) => {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
};

const jaInstalado = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS se apresenta como Mac; o toque denuncia
const ehIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const CHAVE_DISPENSADO = 'guarusolar.tecnico.convite-instalacao';
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

function dispensadoRecentemente() {
  try {
    const quando = Number(localStorage.getItem(CHAVE_DISPENSADO));
    return Number.isFinite(quando) && Date.now() - quando < SETE_DIAS;
  } catch {
    return false;
  }
}

export function ConviteInstalacao() {
  const evento = useSyncExternalStore(ouvir, () => eventoGuardado);
  const [dispensado, setDispensado] = useState(dispensadoRecentemente);

  if (dispensado || jaInstalado()) return null;
  const android = evento !== null;
  if (!android && !ehIos()) return null; // computador ou navegador sem instalação: nada a sugerir

  const dispensar = () => {
    try {
      localStorage.setItem(CHAVE_DISPENSADO, String(Date.now()));
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    setDispensado(true);
  };

  return (
    <section aria-labelledby="titulo-instalar" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 id="titulo-instalar" className="font-sans text-[15px] font-semibold tracking-normal">
            Coloque o app na tela inicial
          </h2>
          <p className="text-sm text-muted-foreground">
            Abre mais rápido, em tela cheia, e protege as fotos guardadas no celular.
          </p>
          {!android && (
            <p className="mt-1 text-sm">
              No Safari, toque em <Share className="inline size-4 align-text-bottom text-primary" aria-label="Compartilhar" />{' '}
              e depois em <strong className="font-semibold">Adicionar à Tela de Início</strong>.
            </p>
          )}
        </div>
      </div>
      <div className={android ? 'grid grid-cols-2 gap-2' : 'flex'}>
        <button type="button" onClick={dispensar} className="h-12 flex-1 rounded-xl border font-medium text-muted-foreground">
          {android ? 'Agora não' : 'Entendi'}
        </button>
        {android && (
          <button
            type="button"
            onClick={async () => {
              await evento.prompt();
              const { outcome } = await evento.userChoice;
              eventoGuardado = null; // o navegador só deixa usar o aviso uma vez
              avisar();
              if (outcome === 'dismissed') dispensar();
            }}
            className="h-12 rounded-xl bg-primary font-semibold text-primary-foreground"
          >
            Instalar
          </button>
        )}
      </div>
    </section>
  );
}
