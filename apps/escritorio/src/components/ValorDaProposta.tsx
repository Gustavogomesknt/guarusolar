import { formatarBRL } from '@/lib/formatar';
import { cn } from '@/lib/utils';

/**
 * Valor da proposta (o que a Guarusolar recebe, o mesmo dos indicadores) e, quando o pagamento
 * é no cartão com a taxa repassada, a linha discreta do que o cliente paga: é esse o número do
 * PDF e do WhatsApp, e o vendedor não pode se confundir ao falar com o cliente.
 */
export function ValorDaProposta({
  valorTotal,
  valorTotalCliente,
  className,
  classeValor,
}: {
  valorTotal: string | number;
  valorTotalCliente?: string | number | null;
  className?: string;
  classeValor?: string;
}) {
  const proposta = Number(valorTotal);
  const cliente = valorTotalCliente == null ? proposta : Number(valorTotalCliente);
  return (
    <span className={cn('flex flex-col', className)}>
      <span className={classeValor}>{formatarBRL(proposta)}</span>
      {Math.abs(cliente - proposta) >= 0.005 && (
        <span className="font-sans text-xs font-normal text-muted-foreground">cliente paga {formatarBRL(cliente)} no cartão</span>
      )}
    </span>
  );
}
