import { useVisitasAguardandoOrcamento } from '@/components/VisitasTecnicas';

/** Visitas técnicas avulsas validadas esperando a proposta, ao lado do item "Visitas" do menu. */
export function ContadorVisitas() {
  const visitas = useVisitasAguardandoOrcamento();
  const quantas = visitas.data?.length ?? 0;
  if (quantas === 0) return null;
  return (
    // laranja com texto escuro (nunca texto branco sobre laranja)
    <span className="ml-auto rounded-full bg-destaque-claro px-2 py-px font-mono text-xs font-medium text-foreground">
      {quantas}
      <span className="sr-only"> {quantas === 1 ? 'visita aguardando' : 'visitas aguardando'} orçamento</span>
    </span>
  );
}
