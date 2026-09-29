import { AlertTriangle, Camera, Check, Clock, ImageIcon, Images, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react';
import { FUSO_EMPRESA } from '@guarusolar/compartilhado';
import type { FotoLocal } from '@/fotos/useFotos';
import { cn } from '@/lib/utils';

export type EstadoBloco = 'falta' | 'refazer' | 'preparando' | 'na_fila' | 'enviando' | 'erro' | 'enviada';

const hora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_EMPRESA, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : null;

const DESCRICAO: Record<EstadoBloco, string> = {
  falta: 'falta a foto',
  refazer: 'o gestor pediu para refazer',
  preparando: 'preparando a foto',
  na_fila: 'guardada no celular, aguardando envio',
  enviando: 'enviando',
  erro: 'não foi enviada',
  enviada: 'foto enviada',
};

/** Link secundário "Da galeria": alvo de 44 px, discreto, abaixo do bloco. */
function BotaoGaleria({ onClick, rotulo }: { onClick: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-primary"
    >
      <Images className="size-4" aria-hidden />
      Da galeria
      <span className="sr-only">: {rotulo}</span>
    </button>
  );
}

/**
 * Um item do checklist (protótipo): tocar no quadro abre a câmera, inclusive para refazer uma
 * foto já enviada. A galeria fica como opção secundária logo abaixo.
 */
export function BlocoFoto({
  rotulo,
  opcional,
  estado,
  url,
  capturadaEm,
  comentario,
  erro,
  anteriorValendo = false,
  onCamera,
  onGaleria,
  onTentarDeNovo,
}: {
  rotulo: string;
  opcional: boolean;
  estado: EstadoBloco;
  url?: string | null;
  capturadaEm: string | null;
  comentario: string | null;
  erro?: string;
  /** a foto nova falhou, mas a anterior segue valendo no servidor */
  anteriorValendo?: boolean;
  onCamera: () => void;
  onGaleria: () => void;
  onTentarDeNovo?: () => void;
}) {
  const ocupado = estado === 'preparando' || estado === 'enviando';
  const acao = estado === 'falta' ? 'Tirar foto' : 'Tirar outra foto';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onCamera}
        disabled={ocupado}
        aria-label={`${rotulo}: ${DESCRICAO[estado]}. ${acao}`}
        className="flex flex-col gap-2 text-left focus-visible:outline-none [&:focus-visible>span:first-child]:ring-[3px] [&:focus-visible>span:first-child]:ring-ring/50"
      >
        {estado === 'falta' ? (
          <span className="flex h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#A9B6C6] bg-card text-primary">
            <Camera className="size-7" strokeWidth={1.8} aria-hidden />
            <span className="text-[13px] font-semibold">Tirar foto</span>
          </span>
        ) : (
          <span
            className={cn(
              'relative flex h-[120px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#C6D5E8] text-[#2C5484]',
              (estado === 'refazer' || estado === 'erro') && 'border-2 border-destaque',
            )}
          >
            {url ? (
              <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <ImageIcon className="size-8" strokeWidth={1.6} aria-hidden />
            )}
            {ocupado && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#0B2F5E]/55 text-xs font-semibold text-white">
                <Loader2 className="size-6 animate-spin" aria-hidden />
                {estado === 'preparando' ? 'Preparando…' : 'Enviando…'}
              </span>
            )}
            {estado === 'na_fila' && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[#0B2F5E]/75 py-1 text-[11px] font-semibold text-white">
                <Clock className="size-3.5" aria-hidden />
                Na fila
              </span>
            )}
            {estado === 'enviada' && (
              <span className="absolute top-2 right-2 flex size-[26px] items-center justify-center rounded-full bg-[#17653E] text-white">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
            )}
            {(estado === 'refazer' || estado === 'erro') && (
              <span className="absolute top-2 right-2 flex size-[26px] items-center justify-center rounded-full border border-destaque bg-destaque-suave text-destaque-texto">
                <AlertTriangle className="size-3.5" aria-hidden />
              </span>
            )}
            {estado === 'enviada' && hora(capturadaEm) && (
              <span className="absolute bottom-2 left-2 rounded-md bg-[#0B2F5E]/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
                {hora(capturadaEm)}
              </span>
            )}
          </span>
        )}
        <span className="text-[13px] leading-tight font-medium">
          {rotulo}
          {opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
        </span>
      </button>

      {estado === 'refazer' && comentario && <p className="text-xs text-destaque-texto">Gestor: {comentario}</p>}
      {estado === 'erro' && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-destaque-texto">
            {erro ?? 'A foto não foi enviada.'}
            {anteriorValendo && ' A foto anterior continua valendo.'}
          </p>
          {onTentarDeNovo ? (
            <button type="button" onClick={onTentarDeNovo} className="flex min-h-11 items-center gap-1.5 self-start text-[13px] font-semibold text-primary">
              <RotateCw className="size-4" aria-hidden />
              Enviar de novo
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Toque no quadro para tirar outra.</span>
          )}
        </div>
      )}
      {!ocupado && estado !== 'erro' && <BotaoGaleria onClick={onGaleria} rotulo={rotulo} />}
    </div>
  );
}

/** Fotos extras (opcionais): detalhes e problemas encontrados. */
export function FotosExtras({
  enviadas,
  locais,
  onCamera,
  onGaleria,
  onTentarDeNovo,
  onDescartar,
}: {
  /** `refazer`: o gestor marcou esta extra para refazer (tire outra e mande de novo) */
  enviadas: { id: string; url?: string; refazer?: boolean }[];
  locais: FotoLocal[];
  onCamera: () => void;
  onGaleria: () => void;
  onTentarDeNovo: (idLocal: string) => void;
  onDescartar: (idLocal: string) => void;
}) {
  const total = enviadas.length + locais.length;
  return (
    <section aria-labelledby="titulo-extras" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="titulo-extras" className="font-sans text-[15px] font-semibold tracking-normal">
            Fotos extras {total > 0 && <span className="font-normal text-muted-foreground">({total})</span>}
          </h2>
          <span className="text-xs text-muted-foreground">Opcional · detalhes, problemas encontrados</span>
        </div>
        <button
          type="button"
          onClick={onCamera}
          className="flex h-11 shrink-0 items-center gap-1 rounded-xl border border-[#C9D3E0] bg-card px-3.5 text-sm font-medium"
        >
          <Plus className="size-4" aria-hidden />
          Adicionar
        </button>
      </div>

      {total > 0 && (
        <ul className="flex flex-wrap gap-2">
          {enviadas.map((f) => (
            <li
              key={f.id}
              className={cn(
                'relative flex size-16 items-center justify-center overflow-hidden rounded-lg bg-[#C6D5E8] text-[#2C5484]',
                f.refazer && 'border-2 border-destaque',
              )}
            >
              {f.url ? <img src={f.url} alt="" className="size-full object-cover" /> : <ImageIcon className="size-6" aria-hidden />}
              {f.refazer ? (
                <span className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full border border-destaque bg-destaque-suave text-destaque-texto">
                  <AlertTriangle className="size-3" aria-hidden />
                </span>
              ) : (
                <span className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-[#17653E] text-white">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
              )}
              <span className="sr-only">{f.refazer ? 'Foto extra que o gestor pediu para refazer' : 'Foto extra enviada'}</span>
            </li>
          ))}
          {locais.map((f) => (
            <li key={f.idLocal} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'relative flex size-16 items-center justify-center overflow-hidden rounded-lg bg-[#C6D5E8]',
                  f.estado === 'erro' && 'border-2 border-destaque',
                )}
              >
                {f.url && <img src={f.url} alt="" className="size-full object-cover" />}
                {f.estado === 'na_fila' ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-[#0B2F5E]/75 py-0.5 text-white">
                    <Clock className="size-3.5" aria-hidden />
                    <span className="sr-only">Foto extra na fila, aguardando envio</span>
                  </span>
                ) : (
                  f.estado !== 'erro' && (
                    <span className="absolute inset-0 flex items-center justify-center bg-[#0B2F5E]/55 text-white">
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      <span className="sr-only">{f.estado === 'preparando' ? 'Preparando' : 'Enviando'} foto extra</span>
                    </span>
                  )
                )}
              </span>
              {f.estado === 'erro' && (
                <span className="flex">
                  <button type="button" onClick={() => onTentarDeNovo(f.idLocal)} className="flex size-11 items-center justify-center text-primary">
                    <RotateCw className="size-4" aria-hidden />
                    <span className="sr-only">Enviar a foto extra de novo</span>
                  </button>
                  <button type="button" onClick={() => onDescartar(f.idLocal)} className="flex size-11 items-center justify-center text-muted-foreground">
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Descartar a foto extra</span>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <BotaoGaleria onClick={onGaleria} rotulo="foto extra" />
    </section>
  );
}
