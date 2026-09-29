import { useFilaDeValidacao } from '@/paginas/validacao/fila';

/** Quantos serviços aguardam validação, ao lado do item "Validação" do menu. */
export function ContadorValidacao() {
  const fila = useFilaDeValidacao();
  const quantos = fila.data?.filter((s) => s.status === 'AGUARDANDO_VALIDACAO').length ?? 0;
  if (quantos === 0) return null;
  return (
    // laranja com texto escuro (nunca texto branco sobre laranja)
    <span className="ml-auto rounded-full bg-destaque-claro px-2 py-px font-mono text-xs font-medium text-foreground">
      {quantos}
      <span className="sr-only"> {quantos === 1 ? 'serviço aguardando' : 'serviços aguardando'} validação</span>
    </span>
  );
}
