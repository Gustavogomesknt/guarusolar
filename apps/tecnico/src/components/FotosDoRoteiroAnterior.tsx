import { useState } from 'react';
import { History, ImageIcon, X } from 'lucide-react';
import { urlDaFoto } from '@guarusolar/web/api';
import { ImagemProtegida } from '@guarusolar/web/ImagemProtegida';
import type { FotoEnviada } from '@/lib/tipos';

const rotuloDaFoto = (f: FotoEnviada) => f.rotulo ?? 'Foto';

/**
 * Fotos deste serviço tiradas em itens que SAÍRAM do roteiro (compartilhado/roteiroDoServico.ts;
 * a API desativa o item e a foto continua gravada e visível no escritório). Sem este bloco, o
 * técnico que já tinha fotografado via o contador voltar a zero sem entender por quê.
 * SÓ LEITURA: nada de refazer, apagar ou enviar; não contam para as fotos pedidas.
 * `naFila`: fotos dessas chaves ainda no celular; a API as recebe e elas aparecem aqui depois.
 */
export function FotosDoRoteiroAnterior({ fotos, naFila }: { fotos: FotoEnviada[]; naFila: number }) {
  const [aberta, setAberta] = useState<FotoEnviada | null>(null);
  if (fotos.length === 0 && naFila === 0) return null;
  return (
    <section aria-labelledby="titulo-roteiro-anterior" className="flex flex-col gap-2.5 rounded-2xl border border-dashed bg-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <h2 id="titulo-roteiro-anterior" className="text-sm font-semibold">
            Fotos do roteiro anterior
          </h2>
          <p className="text-[13px] leading-snug text-muted-foreground">
            A lista de fotos deste tipo de serviço mudou. Estas foram tiradas antes e continuam com o escritório, mas não
            contam para as fotos pedidas acima.
          </p>
        </div>
      </div>

      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setAberta(f)} className="flex w-full flex-col gap-1 text-left" aria-label={`Ampliar: ${rotuloDaFoto(f)}`}>
                <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted opacity-80">
                  <ImagemProtegida
                    src={urlDaFoto(f.id, 'miniatura')}
                    alt=""
                    className="size-full object-cover"
                    carregando={<ImageIcon className="size-5 text-muted-foreground" aria-hidden />}
                    emErro={<ImageIcon className="size-5 text-muted-foreground" aria-hidden />}
                  />
                </span>
                <span className="line-clamp-2 text-[11px] leading-tight text-foreground/70">{rotuloDaFoto(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {naFila > 0 && (
        <p className="text-[13px] text-muted-foreground">
          {naFila === 1 ? '1 foto do roteiro anterior ainda está no celular' : `${naFila} fotos do roteiro anterior ainda estão no celular`}: vão
          para o escritório sozinhas e aparecem aqui.
        </p>
      )}

      {aberta && (
        <div role="dialog" aria-modal="true" aria-label={rotuloDaFoto(aberta)} className="fixed inset-0 z-50 flex flex-col bg-[#0B2F5E]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <span className="truncate font-semibold">{rotuloDaFoto(aberta)}</span>
            <button type="button" onClick={() => setAberta(null)} className="flex size-11 items-center justify-center rounded-full bg-white/10" aria-label="Fechar">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <ImagemProtegida
              key={aberta.id}
              src={urlDaFoto(aberta.id)}
              alt={rotuloDaFoto(aberta)}
              className="max-h-full max-w-full object-contain"
              carregando={<ImageIcon className="size-8 text-white/60" aria-hidden />}
              emErro={<p className="text-sm text-white/80">Não foi possível abrir a foto (sem sinal?).</p>}
            />
          </div>
        </div>
      )}
    </section>
  );
}
