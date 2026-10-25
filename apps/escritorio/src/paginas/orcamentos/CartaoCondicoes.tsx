import { Controller, useFormContext, useWatch } from 'react-hook-form';
import {
  GARANTIA_MAXIMO_DE_CARACTERES,
  GARANTIA_PADRAO,
  PRAZO_MAXIMO_DE_CARACTERES,
  SUGESTOES_DE_PRAZO,
  REPASSAR_TAXA_DO_CARTAO,
  TAXAS_CARTAO,
  type CondicaoPagamento,
  type TipoDesconto,
} from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Campo, ariaDoCampo } from '@/components/Campo';
import {
  OPCOES_PARCELAS,
  problemaNoDesconto,
  problemaNoImposto,
  type FormularioOrcamento,
} from './formulario';
import type { Totais } from './ResumoOrcamento';

const CONDICOES: { valor: CondicaoPagamento; titulo: string; descricao: string }[] = [
  { valor: 'A_VISTA', titulo: 'À vista', descricao: 'Pix ou transferência, com desconto' },
  {
    valor: 'ENTRADA_PARCELAS',
    titulo: 'Cartão',
    descricao: REPASSAR_TAXA_DO_CARTAO ? 'Valor inteiro no cartão, com a taxa repassada' : 'Valor inteiro no cartão, sem entrada',
  },
  { valor: 'FINANCIAMENTO', titulo: 'Financiamento', descricao: 'Linha de crédito solar do banco parceiro' },
];

const TIPOS_DESCONTO: { valor: TipoDesconto; rotulo: string; nome: string }[] = [
  { valor: 'PERCENTUAL', rotulo: '%', nome: 'Desconto em porcentagem' },
  { valor: 'VALOR', rotulo: 'R$', nome: 'Desconto em reais' },
];

const CLASSE_SELECT =
  'h-10 w-full rounded-[10px] border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

export function CartaoCondicoes({ totais }: { totais: Totais }) {
  const { subtotalItens, margem, subtotal, descontoAplicado, impostoAplicado } = totais;
  const {
    control,
    register,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FormularioOrcamento>();
  const [descontoTipo, descontoValor, condicao, garantia, impostoPct, prazo] = useWatch({
    control,
    name: ['descontoTipo', 'descontoValor', 'condicaoPagamento', 'garantia', 'impostoPct', 'prazoExecucao'],
  });
  const preencher = (campo: 'prazoExecucao' | 'garantia', texto: string) => {
    setValue(campo, texto, { shouldDirty: true });
    clearErrors(campo);
  };
  // o desconto percentual incide também sobre a margem; aqui o vendedor vê quando ela acabou
  const descontoPassaDaMargem = margem > 0 && descontoAplicado > margem + 0.005;

  // aviso ao vivo enquanto digita; o erro da API (se houver) aparece quando não há aviso
  const erroDesconto = problemaNoDesconto({ descontoTipo, descontoValor }, subtotal) ?? errors.descontoValor?.message;
  const erroImposto = problemaNoImposto(impostoPct) ?? errors.impostoPct?.message;

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

      {/* Impostos: espelho do desconto, somando. Incide sobre o valor JÁ com os descontos
          (inclusive o à vista), e o pagamento (à vista e cartão) é calculado com ele */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="imposto-pct" className="text-[13px] font-medium text-foreground/80">
            Impostos (%)
          </Label>
          <Input
            {...ariaDoCampo('imposto-pct', erroImposto)}
            {...register('impostoPct', { onChange: () => clearErrors('impostoPct') })}
            aria-describedby={erroImposto ? 'imposto-pct-erro' : 'imposto-pct-ajuda'}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 w-[150px] rounded-[10px] text-right font-mono"
          />
        </div>
        {erroImposto ? (
          <p id="imposto-pct-erro" className="text-[13px] text-destructive">
            {erroImposto}
          </p>
        ) : (
          <p id="imposto-pct-ajuda" className="text-xs text-muted-foreground">
            Sobre o valor já com os descontos (inclusive o à vista). As parcelas do cartão saem do total com o imposto.
          </p>
        )}
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">Impostos aplicados</span>
          <span className="font-mono">+ {formatarBRL(impostoAplicado)}</span>
        </div>
        <Controller
          control={control}
          name="mostrarImpostosNoPdf"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-3">
              <Label htmlFor="mostrar-impostos" className="flex flex-col items-start gap-0.5 text-[13px] font-medium text-foreground/80">
                Mostrar impostos na proposta
                <span id="mostrar-impostos-ajuda" className="text-xs font-normal text-muted-foreground">
                  {field.value
                    ? 'O PDF mostra a linha "Impostos (X%)" junto com o desconto.'
                    : 'O imposto sai embutido nos preços do PDF, sem linha própria. O total é o mesmo.'}
                </span>
              </Label>
              <Switch id="mostrar-impostos" aria-describedby="mostrar-impostos-ajuda" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
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
          placeholder="Condições especiais, o que está incluso, detalhes do local…"
          className="rounded-[10px] text-sm leading-relaxed"
        />
      </Campo>

      {/* Prazo e garantia: SÓ A DURAÇÃO (selo da arte da proposta); a qualificação é texto fixo */}
      <Campo
        id="prazoExecucao"
        rotulo="Prazo de execução"
        erro={errors.prazoExecucao?.message}
        ajuda="Só a duração. Obrigatório para gerar o PDF e enviar ao cliente; o rascunho pode ficar sem."
      >
        <Input
          {...ariaDoCampo('prazoExecucao', errors.prazoExecucao?.message)}
          {...register('prazoExecucao', { onChange: () => clearErrors('prazoExecucao') })}
          maxLength={PRAZO_MAXIMO_DE_CARACTERES}
          autoComplete="off"
          placeholder="Ex.: 15 dias úteis"
          className="h-11 rounded-[10px]"
        />
        <Contador texto={prazo} maximo={PRAZO_MAXIMO_DE_CARACTERES} />
        <div role="group" aria-label="Sugestões de prazo" className="flex flex-wrap gap-1.5">
          {SUGESTOES_DE_PRAZO.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              onClick={() => preencher('prazoExecucao', sugestao)}
              className="rounded-full border bg-background px-2.5 py-1 text-left text-xs text-foreground/80 hover:bg-muted"
            >
              {sugestao}
            </button>
          ))}
        </div>
      </Campo>

      <Campo id="garantia" rotulo="Garantia do serviço" erro={errors.garantia?.message} ajuda="Só a duração.">
        <Input
          {...ariaDoCampo('garantia', errors.garantia?.message)}
          {...register('garantia', { onChange: () => clearErrors('garantia') })}
          maxLength={GARANTIA_MAXIMO_DE_CARACTERES}
          autoComplete="off"
          className="h-11 rounded-[10px]"
        />
        <Contador texto={garantia} maximo={GARANTIA_MAXIMO_DE_CARACTERES} />
        {garantia.trim() !== GARANTIA_PADRAO && (
          <p className="text-xs text-muted-foreground">
            {garantia.trim() ? 'Diferente do padrão.' : 'Em branco, o PDF sai com o padrão.'}{' '}
            <button type="button" onClick={() => preencher('garantia', GARANTIA_PADRAO)} className="font-medium text-primary underline-offset-2 hover:underline">
              Usar o padrão ({GARANTIA_PADRAO})
            </button>
          </p>
        )}
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

      {/* "Detalhar preços por item no PDF" saiu em 23/10/2026: a proposta lista o escopo, sem
          quantidade nem preço por item, e o preço aparece uma vez, no total. A coluna
          detalharPrecosNoPdf continua no banco (e o histórico do git tem esta parte da tela). */}
    </section>
  );
}

/**
 * Caracteres usados do campo, enquanto se digita. Acima do limite só um orçamento de antes de
 * 25/10/2026 (o campo não deixa digitar mais): salva assim, mas ao mudar o texto a API pede o curto.
 */
function Contador({ texto, maximo }: { texto: string; maximo: number }) {
  const usados = texto.trim().length;
  if (usados > maximo) {
    return (
      <p className="text-xs text-destaque-texto">
        {usados} de {maximo} caracteres: texto de antes da regra nova. Deixe só a duração, como "15 dias úteis".
      </p>
    );
  }
  return (
    <p className="text-right font-mono text-xs text-muted-foreground">
      {usados}/{maximo}
    </p>
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
      (c.valorUltimaParcela !== c.valorParcela ? ` (última de ${formatarBRL(c.valorUltimaParcela)})` : '') +
      // orçamento salvo antes de 25/10/2026: a 1ª levava a sobra
      (c.valorPrimeiraParcela !== c.valorParcela ? ` (1ª de ${formatarBRL(c.valorPrimeiraParcela)})` : '');
  const linhas: [string, string][] = [
    ['No cartão', parcelas],
    ['Taxa da operadora', `${pct(c.taxaPct)} · ${c.absorvida ? 'absorvida pela Guarusolar' : 'repassada ao cliente'}`],
    ['Cliente paga no total', formatarBRL(totais.valorTotalCliente)],
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

      {/* com a taxa sempre absorvida (REPASSAR_TAXA_DO_CARTAO = false) não há o que escolher */}
      {REPASSAR_TAXA_DO_CARTAO && (
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
      )}
      <p className="text-xs text-muted-foreground">
        Taxas do Mercado Pago atualizadas em {TAXAS_CARTAO.atualizadoEm}.
      </p>
    </div>
  );
}
