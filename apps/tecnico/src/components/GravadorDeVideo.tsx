import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Circle, FolderOpen, Loader2, RotateCcw, Square, X } from 'lucide-react';
import {
  formatarDuracao,
  formatarTamanho,
  VIDEO_ALTURA,
  VIDEO_AUDIO_BITS_POR_SEGUNDO,
  VIDEO_BITS_POR_SEGUNDO,
  VIDEO_BYTES_MAXIMO,
  VIDEO_LARGURA,
  VIDEO_SEGUNDOS_MAXIMO,
} from '@guarusolar/compartilhado';
import { corrigirDuracaoDoWebm } from '@/fotos/duracaoDoWebm';

/*
 * Gravação de vídeo DENTRO do app (MediaRecorder): 720p, cerca de 1,5 Mbps, no máximo 60 s, com
 * contador e botão de parar. Fica em torno de 11 MB por minuto. A câmera do sistema (seletor de
 * arquivo com capture) grava 100 MB ou mais por minuto, e o navegador não comprime vídeo.
 * Sem MediaRecorder ou sem câmera (aparelho antigo, permissão negada): seletor de arquivo da
 * galeria, com limite de tamanho e de duração e a mensagem do porquê.
 */

/** VP8 primeiro: grava leve no celular e toca em qualquer navegador; MP4 no iPhone. */
const TIPOS_PREFERIDOS = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
const tipoDeGravacao = () =>
  typeof MediaRecorder === 'undefined' ? null : (TIPOS_PREFERIDOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? '');
const gravaNoApp = () => Boolean(navigator.mediaDevices?.getUserMedia) && tipoDeGravacao() !== null;

/** Capa: um quadro do vídeo, 480 px de largura, JPEG. null se o aparelho não deixar. */
function capaDe(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  const largura = 480;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * largura);
  try {
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/jpeg', 0.7));
}

type Gravado = { arquivo: Blob; duracaoSegundos: number; capa: Blob | null };
type Estado =
  | { tipo: 'abrindo' }
  | { tipo: 'pronto' }
  | { tipo: 'gravando'; segundos: number }
  | { tipo: 'revisando'; gravado: Gravado; url: string }
  | { tipo: 'reserva'; motivo: string; erro?: string };

export function GravadorDeVideo({ onFechar, onUsar }: { onFechar: () => void; onUsar: (gravado: Gravado) => Promise<void> }) {
  const [estado, setEstado] = useState<Estado>(() =>
    gravaNoApp() ? { tipo: 'abrindo' } : { tipo: 'reserva', motivo: 'Este aparelho não grava vídeo dentro do app.' },
  );
  const [salvando, setSalvando] = useState(false);
  const previa = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const capa = useRef<Promise<Blob | null> | null>(null);

  const desligarCamera = useCallback(() => {
    for (const trilha of fluxo.current?.getTracks() ?? []) trilha.stop();
    fluxo.current = null;
  }, []);

  const ligarCamera = useCallback(async () => {
    setEstado({ tipo: 'abrindo' });
    try {
      const f = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: VIDEO_LARGURA }, height: { ideal: VIDEO_ALTURA }, frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      fluxo.current = f;
      if (previa.current) {
        previa.current.srcObject = f;
        await previa.current.play().catch(() => undefined);
      }
      setEstado({ tipo: 'pronto' });
    } catch (erro) {
      const nome = (erro as DOMException).name;
      setEstado({
        tipo: 'reserva',
        motivo:
          nome === 'NotAllowedError'
            ? 'O app não tem permissão para usar a câmera e o microfone. Libere nas configurações do navegador, ou escolha um vídeo já gravado.'
            : 'Não foi possível abrir a câmera para gravar.',
      });
    }
  }, []);

  useEffect(() => {
    if (estado.tipo === 'abrindo' && !fluxo.current) void ligarCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ao fechar: câmera desligada, contador parado, endereço temporário do vídeo liberado
  useEffect(
    () => () => {
      clearInterval(relogio.current);
      if (gravador.current?.state === 'recording') gravador.current.stop();
      desligarCamera();
    },
    [desligarCamera],
  );
  useEffect(() => () => void (estado.tipo === 'revisando' && URL.revokeObjectURL(estado.url)), [estado]);

  const gravar = () => {
    const f = fluxo.current;
    if (!f) return;
    const tipo = tipoDeGravacao() ?? '';
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(f, { ...(tipo ? { mimeType: tipo } : {}), videoBitsPerSecond: VIDEO_BITS_POR_SEGUNDO, audioBitsPerSecond: VIDEO_AUDIO_BITS_POR_SEGUNDO });
    } catch {
      setEstado({ tipo: 'reserva', motivo: 'Este aparelho não grava vídeo dentro do app.' });
      return;
    }
    const pedacos: Blob[] = [];
    const inicio = performance.now();
    r.ondataavailable = (e) => e.data.size > 0 && pedacos.push(e.data);
    r.onstop = async () => {
      clearInterval(relogio.current);
      const duracaoSegundos = Math.min(VIDEO_SEGUNDOS_MAXIMO, (performance.now() - inicio) / 1000);
      const gravado = new Blob(pedacos, { type: r.mimeType || tipo || 'video/webm' });
      // o WebM do MediaRecorder sai sem duração: o player do gestor não deixaria avançar
      const arquivo = gravado.type.startsWith('video/webm') ? await corrigirDuracaoDoWebm(gravado, duracaoSegundos * 1000) : gravado;
      const imagem = (await capa.current) ?? null;
      desligarCamera();
      setEstado({ tipo: 'revisando', gravado: { arquivo, duracaoSegundos, capa: imagem }, url: URL.createObjectURL(arquivo) });
    };
    gravador.current = r;
    capa.current = null;
    r.start(1000);
    setEstado({ tipo: 'gravando', segundos: 0 });
    // capa: um quadro com 1 s de gravação (antes disso a câmera ainda está ajustando a luz)
    setTimeout(() => {
      if (previa.current && r.state === 'recording') capa.current = capaDe(previa.current);
    }, 1000);
    relogio.current = setInterval(() => {
      const segundos = (performance.now() - inicio) / 1000;
      if (segundos >= VIDEO_SEGUNDOS_MAXIMO) return parar();
      setEstado({ tipo: 'gravando', segundos });
    }, 250);
  };

  const parar = () => {
    clearInterval(relogio.current);
    const r = gravador.current;
    if (r && r.state === 'recording') {
      if (!capa.current && previa.current) capa.current = capaDe(previa.current);
      r.stop();
    }
  };

  const gravarDeNovo = () => {
    void ligarCamera();
  };

  // ---- reserva: vídeo escolhido da galeria, com limite de tamanho e de duração
  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    const motivo = estado.tipo === 'reserva' ? estado.motivo : '';
    if (!arquivo.type.startsWith('video/')) return setEstado({ tipo: 'reserva', motivo, erro: 'Escolha um arquivo de vídeo.' });
    if (arquivo.size > VIDEO_BYTES_MAXIMO) {
      return setEstado({
        tipo: 'reserva',
        motivo,
        erro: `Este vídeo tem ${formatarTamanho(arquivo.size)}; o limite é ${formatarTamanho(VIDEO_BYTES_MAXIMO)}. Vídeo da câmera do celular fica grande demais: grave um mais curto ou em qualidade menor.`,
      });
    }
    const url = URL.createObjectURL(arquivo);
    const elemento = document.createElement('video');
    elemento.muted = true;
    elemento.playsInline = true;
    elemento.src = url;
    const duracao = await new Promise<number>((ok) => {
      elemento.onloadedmetadata = () => ok(Number.isFinite(elemento.duration) ? elemento.duration : 0);
      elemento.onerror = () => ok(0);
      setTimeout(() => ok(0), 5000);
    });
    if (duracao > VIDEO_SEGUNDOS_MAXIMO + 1) {
      URL.revokeObjectURL(url);
      return setEstado({ tipo: 'reserva', motivo, erro: `Este vídeo tem ${formatarDuracao(duracao)}; o limite é ${formatarDuracao(VIDEO_SEGUNDOS_MAXIMO)}.` });
    }
    // capa: um quadro perto de 1 s (se o aparelho deixar)
    const imagem = await new Promise<Blob | null>((ok) => {
      elemento.onseeked = () => void capaDe(elemento).then(ok);
      elemento.currentTime = Math.min(1, duracao / 2);
      setTimeout(() => ok(null), 3000);
    });
    setEstado({ tipo: 'revisando', gravado: { arquivo, duracaoSegundos: duracao, capa: imagem }, url });
  };

  const usar = async (gravado: Gravado) => {
    setSalvando(true);
    try {
      await onUsar(gravado);
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const segundos = estado.tipo === 'gravando' ? estado.segundos : 0;
  return (
    <div role="dialog" aria-modal="true" aria-label="Gravar vídeo" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="text-sm font-semibold">Vídeo do serviço</span>
        <button type="button" onClick={onFechar} aria-label="Fechar sem salvar" className="flex size-11 items-center justify-center rounded-full bg-white/10">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {estado.tipo === 'revisando' ? (
          <video src={estado.url} controls playsInline className="max-h-full w-full" />
        ) : (
          <video ref={previa} muted playsInline autoPlay className={estado.tipo === 'reserva' ? 'hidden' : 'max-h-full w-full'} />
        )}
        {estado.tipo === 'abrindo' && (
          <p role="status" className="absolute flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Abrindo a câmera…
          </p>
        )}
        {estado.tipo === 'gravando' && (
          <p aria-live="off" className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1 font-mono text-lg">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            {formatarDuracao(segundos)} / {formatarDuracao(VIDEO_SEGUNDOS_MAXIMO)}
          </p>
        )}
        {estado.tipo === 'reserva' && (
          <div className="flex max-w-sm flex-col gap-3 px-6 text-center">
            <p className="font-semibold">{estado.motivo}</p>
            <p className="text-sm text-white/80">
              Escolha um vídeo já gravado de até {formatarDuracao(VIDEO_SEGUNDOS_MAXIMO)} e {formatarTamanho(VIDEO_BYTES_MAXIMO)}.
            </p>
            {estado.erro && (
              <p role="alert" className="rounded-xl bg-red-500/20 px-3 py-2 text-sm">
                {estado.erro}
              </p>
            )}
            <label className="mx-auto flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-5 font-semibold text-black">
              <FolderOpen className="size-5" aria-hidden />
              Escolher vídeo
              <input type="file" accept="video/*" onChange={aoEscolher} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {estado.tipo === 'pronto' && (
          <>
            <button type="button" onClick={gravar} aria-label="Começar a gravar" className="flex size-[72px] items-center justify-center rounded-full border-4 border-white">
              <Circle className="size-12 fill-red-500 text-red-500" aria-hidden />
            </button>
            <p className="text-xs text-white/70">Até {formatarDuracao(VIDEO_SEGUNDOS_MAXIMO)}. Para sozinho no limite.</p>
          </>
        )}
        {estado.tipo === 'gravando' && (
          <button type="button" onClick={parar} aria-label="Parar a gravação" className="flex size-[72px] items-center justify-center rounded-full border-4 border-white">
            <Square className="size-8 fill-white" aria-hidden />
          </button>
        )}
        {estado.tipo === 'revisando' && (
          <>
            <p className="text-sm">
              Tamanho: <strong>{formatarTamanho(estado.gravado.arquivo.size)}</strong> · Duração: <strong>{formatarDuracao(estado.gravado.duracaoSegundos)}</strong>
            </p>
            <div className="flex w-full gap-2">
              <button type="button" onClick={gravaNoApp() ? gravarDeNovo : () => setEstado({ tipo: 'reserva', motivo: 'Escolha outro vídeo.' })} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white/15 font-semibold">
                <RotateCcw className="size-4" aria-hidden />
                {gravaNoApp() ? 'Gravar de novo' : 'Escolher outro'}
              </button>
              <button
                type="button"
                onClick={() => void usar(estado.gravado)}
                disabled={salvando}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-black disabled:opacity-70"
              >
                {salvando && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Usar este vídeo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
