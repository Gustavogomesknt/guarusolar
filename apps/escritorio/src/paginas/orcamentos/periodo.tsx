import { useMemo } from 'react';
import { FUSO_EMPRESA, inicioDoDia, inicioDoMes, partesNoFuso } from '@guarusolar/compartilhado';

/*
 * Período da lista e do pipeline de orçamentos. Vale para os DECIDIDOS (aprovado e recusado,
 * pela data da decisão); os em aberto aparecem sempre (parâmetro abertosSempre da API).
 * Ver parametrosDoPeriodo.
 * Os limites são calculados no fuso da empresa (America/Sao_Paulo), qualquer que seja o
 * fuso do computador.
 */
export type Periodo = 'ESTE_MES' | 'MES_PASSADO' | 'ULTIMOS_90' | 'ESTE_ANO' | 'TUDO';

const nomeDoMes = (instante: Date) =>
  instante
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: FUSO_EMPRESA })
    .replace(/^./, (c) => c.toUpperCase());

export function opcoesDePeriodo(): { valor: Periodo; rotulo: string }[] {
  return [
    { valor: 'ESTE_MES', rotulo: nomeDoMes(new Date()) },
    // meio do mês passado: qualquer instante dele serve para o nome
    { valor: 'MES_PASSADO', rotulo: nomeDoMes(new Date(inicioDoMes(-1).getTime() + 15 * 864e5)) },
    { valor: 'ULTIMOS_90', rotulo: 'Últimos 90 dias' },
    { valor: 'ESTE_ANO', rotulo: `Ano de ${partesNoFuso().ano}` },
    { valor: 'TUDO', rotulo: 'Todo o período' },
  ];
}

/** Intervalo de criação (de/até) enviado à API. */
export function intervalo(periodo: Periodo): { de?: string; ate?: string } {
  const { ano, mes, dia } = partesNoFuso();
  switch (periodo) {
    case 'ESTE_MES':
      return { de: inicioDoMes(0).toISOString() };
    case 'MES_PASSADO':
      return {
        de: inicioDoMes(-1).toISOString(),
        ate: new Date(inicioDoMes(0).getTime() - 1).toISOString(),
      };
    case 'ULTIMOS_90':
      return { de: inicioDoDia(ano, mes, dia - 90).toISOString() };
    case 'ESTE_ANO':
      return { de: inicioDoDia(ano, 0, 1).toISOString() };
    case 'TUDO':
      return {};
  }
}

/** Parâmetros da API para o período: em aberto sempre, decididos pelo período. */
export function parametrosDoPeriodo(periodo: Periodo): URLSearchParams {
  const p = new URLSearchParams();
  const { de, ate } = intervalo(periodo);
  if (de) p.set('de', de);
  if (ate) p.set('ate', ate);
  if (de || ate) p.set('abertosSempre', 'true');
  return p;
}

/** O orçamento em aberto é de um mês anterior ao atual (negociação que atravessou o mês). */
export const deMesAnterior = (criadoEm: string) => new Date(criadoEm) < inicioDoMes(0);

/** Seletor "Período" com as mesmas opções na lista e no pipeline. */
export function SeletorPeriodo({ valor, onChange }: { valor: Periodo; onChange: (p: Periodo) => void }) {
  const opcoes = useMemo(opcoesDePeriodo, []);
  return (
    <label
      title="Aprovados e recusados no período. Os em aberto aparecem sempre."
      className="flex h-10 items-center gap-2 rounded-[10px] border border-input bg-card pr-2.5 pl-3 text-[13px] text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/30"
    >
      Período
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as Periodo)}
        className="h-full bg-transparent text-sm font-medium text-foreground outline-none"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
