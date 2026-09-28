import { useFormContext, useWatch } from 'react-hook-form';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { ROTULO_CATEGORIA, ROTULO_UNIDADE } from '@guarusolar/compartilhado';
import { formatarBRL, formatarDecimal, formatarQuantidade, lerNumero } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { numeroOuZero, precoFoiAjustado, type FormularioOrcamento } from './formulario';

/** Mesmas colunas no cabeçalho e nas linhas: item, quantidade, preço, subtotal, remover. */
export const COLUNAS_ITENS = 'grid-cols-[minmax(0,1fr)_132px_140px_124px_40px]';

export function LinhaItem({ indice, onRemover }: { indice: number; onRemover: () => void }) {
  const { control, register, setValue } = useFormContext<FormularioOrcamento>();
  const item = useWatch({ control, name: `itens.${indice}` });
  if (!item) return null;

  const quantidade = numeroOuZero(item.quantidade);
  const preco = numeroOuZero(item.precoUnitario);
  const ajustado = precoFoiAjustado(item);
  const quantidadeInvalida = !(lerNumero(item.quantidade) > 0);
  const precoInvalido = !(lerNumero(item.precoUnitario) >= 0);
  const idBase = `item-${indice}`;
  const campoQuantidade = `itens.${indice}.quantidade` as const;
  const campoPreco = `itens.${indice}.precoUnitario` as const;

  const mudarQuantidade = (delta: number) =>
    setValue(campoQuantidade, formatarQuantidade(Math.max(1, quantidade + delta)), { shouldDirty: true });

  return (
    <div role="row" className={`grid ${COLUNAS_ITENS} items-center gap-3 border-t py-3`}>
      <div role="cell" className="flex min-w-0 flex-col gap-0.5">
        <span id={`${idBase}-nome`} className="text-sm font-semibold">
          {item.nome}
        </span>
        <span className="text-xs text-muted-foreground">
          {ROTULO_CATEGORIA[item.categoria]} · por {ROTULO_UNIDADE[item.unidade]}
        </span>
        {ajustado && (
          <span id={`${idBase}-ajuste`} className="text-xs text-destaque-texto">
            Preço ajustado · padrão {formatarBRL(item.precoTabela)}
          </span>
        )}
      </div>

      <div role="cell">
        <div
          className={cn(
            'flex h-[42px] items-center overflow-hidden rounded-[10px] border',
            quantidadeInvalida ? 'border-destructive' : 'border-input',
          )}
        >
          <button
            type="button"
            aria-label={`Diminuir quantidade de ${item.nome}`}
            onClick={() => mudarQuantidade(-1)}
            disabled={quantidade <= 1}
            className="flex h-full w-10 shrink-0 items-center justify-center bg-background text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Minus className="size-3.5" strokeWidth={2.5} aria-hidden />
          </button>
          <label htmlFor={`${idBase}-quantidade`} className="sr-only">
            Quantidade de {item.nome}
          </label>
          <input
            id={`${idBase}-quantidade`}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={quantidadeInvalida || undefined}
            {...register(campoQuantidade)}
            className="h-full w-0 min-w-0 flex-1 bg-card text-center font-mono text-sm outline-none"
          />
          <button
            type="button"
            aria-label={`Aumentar quantidade de ${item.nome}`}
            onClick={() => mudarQuantidade(1)}
            className="flex h-full w-10 shrink-0 items-center justify-center bg-background text-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      <div role="cell">
        <div
          className={cn(
            'flex h-[42px] items-center gap-1.5 rounded-[10px] border bg-card px-2.5 focus-within:ring-[3px] focus-within:ring-ring/30',
            precoInvalido ? 'border-destructive' : ajustado ? 'border-destaque' : 'border-input',
          )}
        >
          <span className="text-[13px] text-muted-foreground" aria-hidden>
            R$
          </span>
          <label htmlFor={`${idBase}-preco`} className="sr-only">
            Preço unitário de {item.nome}, em reais
          </label>
          <input
            id={`${idBase}-preco`}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={precoInvalido || undefined}
            aria-describedby={ajustado ? `${idBase}-ajuste` : undefined}
            {...register(campoPreco, {
              // ao sair do campo, mostra o valor no formato 1.234,50
              onBlur: (e) => {
                const valor = lerNumero(e.target.value);
                if (valor >= 0) setValue(campoPreco, formatarDecimal(valor), { shouldDirty: true });
              },
            })}
            className="h-full w-0 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
          />
        </div>
      </div>

      <div role="cell" className="text-right font-mono text-sm font-medium">
        {formatarBRL(Math.round(quantidade * preco * 100) / 100)}
      </div>

      <div role="cell">
        <button
          type="button"
          aria-label={`Remover ${item.nome}`}
          onClick={onRemover}
          className="flex size-10 items-center justify-center rounded-lg text-[#8A3B34] hover:bg-destructive/10"
        >
          <Trash2 className="size-[18px]" aria-hidden />
        </button>
      </div>
    </div>
  );
}
