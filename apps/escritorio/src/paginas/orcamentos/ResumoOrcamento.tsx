import type { ResultadoCalculo } from '@guarusolar/compartilhado';
import { formatarBRL } from '@/lib/formatar';
import { Selo } from '@/components/Selo';

/**
 * Coluna da direita: condições e o valor total.
 * Os valores são uma PRÉVIA calculada no navegador; o que vale é o que a API
 * calcula e grava ao salvar o orçamento.
 */
export function ResumoOrcamento({ resultado }: { resultado: ResultadoCalculo }) {
  return (
    <aside aria-label="Resumo do orçamento" className="flex flex-col gap-4">
      <section aria-labelledby="titulo-condicoes" className="flex flex-col gap-4 rounded-[14px] border bg-card p-[22px]">
        <h2 id="titulo-condicoes" className="text-xl font-bold">
          3. Condições
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-mono">{formatarBRL(resultado.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Desconto aplicado</dt>
            <dd className="font-mono">− {formatarBRL(resultado.descontoAplicado)}</dd>
          </div>
        </dl>
        <div className="flex flex-col items-start gap-2 rounded-[10px] bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground/80">
          <Selo variante="destaque">Em construção</Selo>
          Desconto, condição de pagamento, validade e observações chegam na próxima etapa. Por
          enquanto, a prévia considera pagamento à vista sem desconto.
        </div>
      </section>

      <section aria-labelledby="titulo-total" className="flex flex-col gap-1.5 rounded-[14px] bg-sidebar p-[22px]">
        <h2 id="titulo-total" className="font-sans text-[13px] font-normal tracking-normal text-[#CBDBF0]">
          Valor total do orçamento
        </h2>
        <p className="font-titulo text-[38px] leading-tight font-bold tracking-[-0.02em] text-white" aria-live="polite">
          {formatarBRL(resultado.valorTotal)}
        </p>
        <p className="text-[13px] leading-snug text-destaque-claro">{resultado.resumoPagamento}</p>
        <p className="pt-1 text-xs text-[#9DB6D6]">Prévia. O valor final é confirmado pelo sistema ao salvar.</p>
      </section>
    </aside>
  );
}
