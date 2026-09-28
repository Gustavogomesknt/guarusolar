import { useSessao } from '@/lib/sessao';
import { Selo } from '@/components/Selo';

export function Inicio() {
  const { usuario } = useSessao();
  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <section className="max-w-2xl space-y-3">
      <h1 className="text-3xl font-bold text-sidebar">Olá, {primeiroNome}</h1>
      <p className="text-muted-foreground">
        As telas do escritório vão entrar aqui, começando pelo gerador de orçamentos.
      </p>
      <Selo variante="destaque">Em construção</Selo>
    </section>
  );
}
