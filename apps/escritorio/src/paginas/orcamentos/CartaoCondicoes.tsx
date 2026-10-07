import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { TAXAS_CARTAO, type CondicaoPagamento, type TipoDesconto } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Campo, ariaDoCampo } from '@/components/Campo';
import {
  OPCOES_ENTRADA,
  OPCOES_PARCELAS,
  problemaNoDesconto,
  type FormularioOrcamento,
} from './formulario';
import type { Totais } from './ResumoOrcamento';

const CONDICOES: { valor: CondicaoPagamento; titulo: string; descricao: string }[] = [
  { valor: 'A_VISTA', titulo: 'À vista', descricao: 'Pix ou transferência, com desconto' },
  { valor: 'ENTRADA_PARCELAS', titulo: 'Entrada + cartão', descricao: 'Entrada no Pix, saldo no cartão com a taxa repassada' },
  { valor: 'FINANCIAMENTO', titulo: 'Financiamento', descricao: 'Linha de crédito solar do banco parceiro' },
];

const TIPOS_DESCONTO: { valor: TipoDesconto; rotulo: string; nome: string }[] = [
  { valor: 'PERCENTUAL', rotulo: '%', nome: 'Desconto em porcentagem' },
  { valor: 'VALOR', rotulo: 'R$', nome: 'Desconto em reais' },
];

const CLASSE_SELECT =
  'h-10 w-full rounded-[10px] border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

export function CartaoCondicoes({ totais }: { totais: Totais }) {
  const { subtotalItens, margem, subtotal, descontoAplicado } = totais;
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
  // o desconto percentual incide também sobre a margem; aqui o vendedor vê quando ela acabou
  const descontoPassaDaMargem = margem > 0 && descontoAplicado > margem + 0.005;

  // aviso ao vivo enquanto digita; o erro da API (se houver) aparece quando não há aviso
  const erroDesconto = problemaNoDesconto({ descontoTipo, descontoValor }, subtotal) ?? errors.descontoValor?.message;

  return (
    <section aria-labelledby="titulo-condicoes" className="flex flex-col gap-4 rounded-[14px] border bg-card p-[22px]">
      <h2 id="titulo-condicoes" className="text-xl font-bold">
        3. Condições
      </h2>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Itens</span>
        <span className="font-mono">{formatarBRL(subtotalItens)}</span>
      </div>

      {/* Margem em reais desta proposta: soma aos itens antes dos descontos */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="margem" className="text-[13px] font-medium text-foreground/80">
            Margem (R$)
          </Label>
          <Input
            {...ariaDoCampo('margem', errors.margem?.message)}
            {...register('margem', { onChange: () => clearErrors('margem') })}
            aria-describedby={errors.margem ? 'margem-erro' : 'margem-ajuda'}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 w-[150px] rounded-[10px] text-right font-mono"
          />
        </div>
        {errors.margem?.message ? (
          <p id="margem-erro" className="text-[13px] text-destructive">
            {errors.margem.message}
          </p>
        ) : (
          <p id="margem-ajuda" className="text-xs text-muted-foreground">
            Embutida no valor total. O cliente não vê a margem no PDF nem no WhatsApp.
          </p>
        )}
      </div>

      <div className="flex justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono font-medium">{formatarBRL(subtotal)}</span>
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
        {descontoPassaDaMargem && (
          <p role="status" className="rounded-[10px] border border-destaque bg-destaque-suave px-3 py-2 text-[13px] text-destaque-texto">
            O desconto ({formatarBRL(descontoAplicado)}) é maior que a margem ({formatarBRL(margem)}): esta proposta sai
            abaixo do preço dos itens.
          </p>
        )}
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
                {OPCOES_PARCELAS.map(({ valor, rotulo }) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        )}

        {condicao === 'ENTRADA_PARCELAS' && totais.cartao && <QuadroDoCartao totais={totais} />}

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

      {/* Proposta em PDF */}
      <Campo id="descricaoServico" rotulo="Serviço (título da proposta em PDF)" erro={errors.descricaoServico?.message}>
        <Input
          {...ariaDoCampo('descricaoServico', errors.descricaoServico?.message)}
          {...register('descricaoServico', { onChange: () => clearErrors('descricaoServico') })}
          maxLength={100}
          placeholder="Ex.: Instalação de carregador veicular · Residencial"
          className="h-11 rounded-[10px]"
        />
      </Campo>

      <Controller
        control={control}
        name="detalharPrecosNoPdf"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-3">
            <Label htmlFor="detalhar-precos" className="flex flex-col items-start gap-0.5 text-[13px] font-medium text-foreground/80">
              Detalhar preços por item no PDF
              <span id="detalhar-precos-ajuda" className="text-xs font-normal text-muted-foreground">
                Desmarcado, o cliente vê só os itens, as quantidades e o valor total.
              </span>
              {field.value && margem > 0 && (
                <span id="detalhar-precos-margem" className="text-xs font-normal text-destaque-texto">
                  No PDF, o preço de cada item sai com a margem distribuída (para a soma fechar com o subtotal de{' '}
                  {formatarBRL(subtotal)}). Por isso fica diferente do preço do catálogo: não é defeito.
                </span>
              )}
            </Label>
            <Switch
              id="detalhar-precos"
              aria-describedby="detalhar-precos-ajuda"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />
    </section>
  );
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * As contas do cartão para o vendedor: parcelas, total do cliente, taxa e o que a Guarusolar
 * recebe. E a opção de absorver a taxa (negociação), com o quanto a empresa deixa de receber.
 */
function QuadroDoCartao({ totais }: { totais: Totais }) {
  const { control } = useFormContext<FormularioOrcamento>();
  const c = totais.cartao!;
  const recebe = totais.valorTotal - c.valorAbsorvido;
  const parcelas = c.debito
    ? `Débito de ${formatarBRL(c.valorCobrado)}`
    : `${c.parcelas}x de ${formatarBRL(c.valorParcela)}` +
      (c.valorPrimeiraParcela !== c.valorParcela ? ` (1ª de ${formatarBRL(c.valorPrimeiraParcela)})` : '');
  const linhas: [string, string][] = [
    ['No cartão', parcelas],
    ['Taxa da operadora', `${pct(c.taxaPct)} · ${c.absorvida ? 'absorvida pela Guarusolar' : 'repassada ao cliente'}`],
    [
      'Cliente paga no total',
      totais.entrada > 0
        ? `${formatarBRL(totais.valorTotalCliente)} (${formatarBRL(totais.entrada)} no Pix + ${formatarBRL(c.valorCobrado)} no cartão)`
        : formatarBRL(totais.valorTotalCliente),
    ],
    ['Guarusolar recebe', formatarBRL(recebe)],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <dl className="flex flex-col gap-1.5 rounded-[10px] bg-background px-3 py-2.5 text-[13px]">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className="font-medium text-foreground">{valor}</dd>
          </div>
        ))}
      </dl>

      <Controller
        control={control}
        name="absorverTaxaCartao"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-3">
            <Label htmlFor="absorver-taxa" className="flex flex-col items-start gap-0.5 text-[13px] font-medium text-foreground/80">
              Absorver a taxa nesta proposta
              <span id="absorver-taxa-ajuda" className="text-xs font-normal text-muted-foreground">
                Para negociação: o cliente paga o valor da proposta e a Guarusolar arca com a taxa.
              </span>
            </Label>
            <Switch id="absorver-taxa" aria-describedby="absorver-taxa-ajuda" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      {c.absorvida && (
        <p role="status" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          A Guarusolar deixa de receber <strong>{formatarBRL(c.valorAbsorvido)}</strong>: recebe {formatarBRL(recebe)} em vez de{' '}
          {formatarBRL(totais.valorTotal)}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Taxas do Mercado Pago atualizadas em {TAXAS_CARTAO.atualizadoEm}. A entrada é no Pix ou na transferência, sem taxa.
      </p>
    </div>
  );
}
