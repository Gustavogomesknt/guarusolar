import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { CondicaoPagamento, TipoDesconto } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Campo, ariaDoCampo } from '@/components/Campo';
import {
  OPCOES_ENTRADA,
  OPCOES_PARCELAS,
  problemaNoDesconto,
  type FormularioOrcamento,
} from './formulario';

const CONDICOES: { valor: CondicaoPagamento; titulo: string; descricao: string }[] = [
  { valor: 'A_VISTA', titulo: 'À vista', descricao: 'Pix ou transferência, com desconto' },
  { valor: 'ENTRADA_PARCELAS', titulo: 'Entrada + parcelas', descricao: 'Boleto ou cartão, sem juros' },
  { valor: 'FINANCIAMENTO', titulo: 'Financiamento', descricao: 'Linha de crédito solar do banco parceiro' },
];

const TIPOS_DESCONTO: { valor: TipoDesconto; rotulo: string; nome: string }[] = [
  { valor: 'PERCENTUAL', rotulo: '%', nome: 'Desconto em porcentagem' },
  { valor: 'VALOR', rotulo: 'R$', nome: 'Desconto em reais' },
];

const CLASSE_SELECT =
  'h-10 w-full rounded-[10px] border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

export function CartaoCondicoes({ subtotal, descontoAplicado }: { subtotal: number; descontoAplicado: number }) {
  const {
    control,
    register,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FormularioOrcamento>();
  const [descontoTipo, descontoValor, condicao] = useWatch({
    control,
    name: ['descontoTipo', 'descontoValor', 'condicaoPagamento'],
  });

  // aviso ao vivo enquanto digita; o erro da API (se houver) aparece quando não há aviso
  const erroDesconto = problemaNoDesconto({ descontoTipo, descontoValor }, subtotal) ?? errors.descontoValor?.message;

  return (
    <section aria-labelledby="titulo-condicoes" className="flex flex-col gap-4 rounded-[14px] border bg-card p-[22px]">
      <h2 id="titulo-condicoes" className="text-xl font-bold">
        3. Condições
      </h2>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{formatarBRL(subtotal)}</span>
      </div>

      {/* Desconto geral */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="desconto-valor" className="text-[13px] font-medium text-foreground/80">
          Desconto geral
        </Label>
        <div className="flex gap-2">
          <div role="group" aria-label="Tipo de desconto" className="flex h-11 shrink-0 overflow-hidden rounded-[10px] border border-input">
            {TIPOS_DESCONTO.map(({ valor, rotulo, nome }) => (
              <button
                key={valor}
                type="button"
                aria-pressed={descontoTipo === valor}
                aria-label={nome}
                onClick={() => {
                  setValue('descontoTipo', valor, { shouldDirty: true });
                  clearErrors('descontoValor');
                }}
                className={cn(
                  'w-12 text-sm font-semibold transition-colors',
                  descontoTipo === valor ? 'bg-foreground text-white' : 'bg-card text-foreground hover:bg-muted',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Input
            {...ariaDoCampo('desconto-valor', erroDesconto)}
            {...register('descontoValor', { onChange: () => clearErrors('descontoValor') })}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-[10px] font-mono"
          />
        </div>
        {erroDesconto && (
          <p id="desconto-valor-erro" className="text-[13px] text-destructive">
            {erroDesconto}
          </p>
        )}
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">Desconto aplicado</span>
          <span className="font-mono text-destructive">− {formatarBRL(descontoAplicado)}</span>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Condição de pagamento */}
      <div className="flex flex-col gap-2">
        <span id="rotulo-condicao" className="text-[13px] font-medium text-foreground/80">
          Condição de pagamento
        </span>
        <Controller
          control={control}
          name="condicaoPagamento"
          render={({ field }) => (
            <RadioGroup
              aria-labelledby="rotulo-condicao"
              value={field.value}
              onValueChange={(valor) => field.onChange(valor as CondicaoPagamento)}
              className="gap-2"
            >
              {CONDICOES.map(({ valor, titulo, descricao }) => {
                const marcada = field.value === valor;
                return (
                  <Label
                    key={valor}
                    htmlFor={`condicao-${valor}`}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 font-normal transition-colors',
                      'has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/30',
                      marcada ? 'border-primary bg-[#EAF2FB]' : 'border-border bg-card hover:bg-muted/60',
                    )}
                  >
                    <RadioGroupItem
                      id={`condicao-${valor}`}
                      value={valor}
                      aria-describedby={`condicao-${valor}-descricao`}
                      className="mt-0.5 size-[18px] border-2 border-[#A9B6C6] data-[state=checked]:border-primary"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{titulo}</span>
                      <span id={`condicao-${valor}-descricao`} className="text-xs text-muted-foreground">
                        {descricao}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          )}
        />

        {condicao === 'A_VISTA' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2.5">
              <Label htmlFor="desconto-avista" className="text-[13px] font-normal text-foreground/80">
                Desconto à vista (%)
              </Label>
              <Input
                {...ariaDoCampo('desconto-avista', errors.descontoAVistaPct?.message)}
                {...register('descontoAVistaPct', { onChange: () => clearErrors('descontoAVistaPct') })}
                inputMode="decimal"
                autoComplete="off"
                className="h-10 w-[90px] rounded-[10px] font-mono"
              />
            </div>
            {errors.descontoAVistaPct && (
              <p id="desconto-avista-erro" className="text-[13px] text-destructive">
                {errors.descontoAVistaPct.message}
              </p>
            )}
          </div>
        )}

        {condicao === 'ENTRADA_PARCELAS' && (
          <div className="grid grid-cols-2 gap-2.5">
            <Campo id="entrada-pct" rotulo="Entrada" erro={errors.entradaPct?.message}>
              <select {...ariaDoCampo('entrada-pct', errors.entradaPct?.message)} {...register('entradaPct', { onChange: () => clearErrors('entradaPct') })} className={CLASSE_SELECT}>
                {OPCOES_ENTRADA.map((pct) => (
                  <option key={pct} value={pct}>
                    {pct === '0' ? 'Sem entrada' : `${pct}%`}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="parcelas" rotulo="Parcelas" erro={errors.parcelas?.message}>
              <select {...ariaDoCampo('parcelas', errors.parcelas?.message)} {...register('parcelas', { onChange: () => clearErrors('parcelas') })} className={CLASSE_SELECT}>
                {OPCOES_PARCELAS.map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        )}

        {condicao === 'FINANCIAMENTO' && (
          <p className="rounded-[10px] bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground/80">
            A simulação é feita pelo banco parceiro. O PDF sai com o valor total e a observação de
            financiamento.
          </p>
        )}
      </div>

      <Campo id="validade" rotulo="Validade do orçamento" erro={errors.validade?.message}>
        <Input
          {...ariaDoCampo('validade', errors.validade?.message)}
          {...register('validade', { onChange: () => clearErrors('validade') })}
          type="date"
          className="h-11 rounded-[10px]"
        />
      </Campo>

      <Campo id="observacoes" rotulo="Observações" erro={errors.observacoes?.message}>
        <Textarea
          {...ariaDoCampo('observacoes', errors.observacoes?.message)}
          {...register('observacoes', { onChange: () => clearErrors('observacoes') })}
          rows={3}
          placeholder="Prazo de instalação, garantias, condições especiais…"
          className="rounded-[10px] text-sm leading-relaxed"
        />
      </Campo>
    </section>
  );
}
