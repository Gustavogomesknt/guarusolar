import type { FotoEmValidacao } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/** Como o gestor marcou cada foto nesta tela. "pendente" = ainda não conferida. */
export type Marcacao = 'pendente' | 'ok' | 'refazer';

export const rotuloDaFoto = (foto: FotoEmValidacao) => foto.rotulo ?? 'Foto extra';

/** Marcação inicial vinda do banco: o que já foi conferido antes continua marcado. */
export const marcacaoInicial = (foto: FotoEmValidacao): Marcacao =>
  foto.revisao === 'OK' ? 'ok' : foto.revisao === 'REFAZER' ? 'refazer' : 'pendente';

// Cores do protótipo "Gestor — validação do serviço" (verde = aceita, vermelho = recusada).
const ESTILO = {
  ok: 'border-[#BFE2CC] bg-[#DCF0E3] text-[#17653E]',
  refazer: 'border-[#F0C2BD] bg-[#F8E0DD] text-[#A3231B]',
  inativo: 'border-[#C9D3E0] bg-card text-[#3A4A5E] hover:bg-muted',
};

/** Par de botões "OK" / "Refazer" (tocar de novo no ativo desmarca). */
export function BotoesMarcacao({
  rotulo,
  marcacao = 'pendente',
  onMarcar,
  grande = false,
  largo = false,
}: {
  rotulo: string;
  marcacao?: Marcacao;
  onMarcar: (marcacao: Marcacao) => void;
  grande?: boolean;
  /** ocupa a largura toda, com os dois botões do mesmo tamanho (cartão da foto) */
  largo?: boolean;
}) {
  const botao = (valor: 'ok' | 'refazer', texto: string) => (
    <button
      type="button"
      aria-pressed={marcacao === valor}
      aria-label={`${texto}: ${rotulo}`}
      onClick={() => onMarcar(marcacao === valor ? 'pendente' : valor)}
      className={cn(
        'rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        grande ? 'h-11 px-5 text-sm' : 'h-9 px-2.5 text-xs',
        marcacao === valor ? ESTILO[valor] : ESTILO.inativo,
      )}
    >
      {texto}
    </button>
  );
  return (
    <div role="group" aria-label={`Conferência: ${rotulo}`} className={cn('gap-1.5', largo ? 'grid grid-cols-2' : 'flex shrink-0')}>
      {botao('ok', 'OK')}
      {botao('refazer', 'Refazer')}
    </div>
  );
}
