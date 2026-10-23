import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { calcularCondicoesDaProposta } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { DEBITO, entradaDoCalculo, OPCOES_PARCELAS, type FormularioOrcamento } from './formulario';

/*
 * As três condições como saem na página 3 da proposta (modelo novo): investimento, à vista via
 * Pix e cartão. Mesma função que a API usa ao salvar (calcularCondicoesDaProposta), com o que está
 * no formulário: o vendedor vê o que vai oferecer antes de gerar o PDF.
 * O desconto à vista e as parcelas da condição NÃO escolhida se ajustam aqui; os da escolhida,
 * no quadro de condições acima (são os mesmos campos: não há dois lugares para o mesmo número).
 */

const PARCELAS_NO_CREDITO = OPCOES_PARCELAS.filter((o) => o.valor !== DEBITO);
const CLASSE_CAMPO = 'h-8 rounded-[8px] border border-input bg-card px-2 font-mono text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30';

export function CondicoesDaProposta() {
  const { control, register } = useFormContext<FormularioOrcamento>();
  const valores = useWatch({ control }) as FormularioOrcamento;
  const c = useMemo(() => calcularCondicoesDaProposta(entradaDoCalculo(valores)), [valores]);
  const condicao = valores.condicaoPagamento;
  const cartao = c.cartao?.detalhe;

  return (
    <section aria-labelledby="titulo-tres-condicoes" className="flex flex-col gap-2 rounded-[14px] border bg-card px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <h3 id="titulo-tres-condicoes" className="text-[13px] font-semibold">
          Na proposta saem as três condições
        </h3>
        <p className="text-xs text-muted-foreground">É o que o cliente vê no PDF, além da condição escolhida.</p>
      </div>

      <dl className="flex flex-col divide-y text-[13px]">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt className="text-foreground/80">Investimento</dt>
          <dd className="font-mono font-medium">{formatarBRL(c.investimento)}</dd>
        </div>

        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt className="flex items-center gap-1.5 text-foreground/80">
            À vista via Pix
            {condicao === 'A_VISTA' ? (
              <span className="text-xs text-muted-foreground">({c.aVista?.descontoPct ?? 0}%, escolhida)</span>
            ) : (
              <>
                <label htmlFor="tres-avista" className="sr-only">
                  Desconto à vista na proposta, em %
                </label>
                <input id="tres-avista" inputMode="decimal" autoComplete="off" placeholder="%" {...register('descontoAVistaPct')} className={`${CLASSE_CAMPO} w-14 text-right`} />
                <span aria-hidden className="text-xs text-muted-foreground">%</span>
              </>
            )}
          </dt>
          <dd className="font-mono font-medium">{c.aVista ? formatarBRL(c.aVista.valor) : <SemValor />}</dd>
        </div>

        <div className="flex items-start justify-between gap-2 py-1.5">
          <dt className="flex items-center gap-1.5 text-foreground/80">
            Cartão
            {condicao === 'ENTRADA_PARCELAS' ? (
              <span className="text-xs text-muted-foreground">(escolhida)</span>
            ) : (
              <>
                <label htmlFor="tres-parcelas" className="sr-only">
                  Parcelas no cartão na proposta
                </label>
                <select id="tres-parcelas" {...register('parcelas')} className={`${CLASSE_CAMPO} w-[76px]`}>
                  {valores.parcelas === '' && <option value="">—</option>}
                  {PARCELAS_NO_CREDITO.map(({ valor }) => (
                    <option key={valor} value={valor}>
                      {valor}x
                    </option>
                  ))}
                </select>
              </>
            )}
          </dt>
          <dd className="flex flex-col items-end font-mono font-medium">
            {cartao && c.cartao ? (
              <>
                <span>{cartao.debito ? `${formatarBRL(cartao.valorCobrado)} no débito` : `${cartao.parcelas} × ${formatarBRL(cartao.valorParcela)}`}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {!cartao.debito && cartao.valorPrimeiraParcela !== cartao.valorParcela ? `1ª de ${formatarBRL(cartao.valorPrimeiraParcela)} · ` : ''}
                  {c.cartao.entrada > 0 ? `+ entrada ${formatarBRL(c.cartao.entrada)} · ` : ''}total {formatarBRL(c.cartao.total)}
                </span>
              </>
            ) : (
              <SemValor />
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Sem o número e sem padrão: a API não deixa o modelo novo ligar assim, mas a tela não esconde. */
function SemValor() {
  return <span className="font-sans text-xs font-normal text-destaque-texto">informe ao lado</span>;
}
