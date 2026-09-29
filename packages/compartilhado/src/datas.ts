/*
 * Datas no fuso da empresa (Guarulhos/SP), independentes do fuso de quem roda o código:
 * servidor em UTC, PC do escritório com relógio errado etc.
 * O deslocamento é obtido do próprio Intl, então segue qualquer mudança de horário de verão.
 */
export const FUSO_EMPRESA = 'America/Sao_Paulo';

type Partes = { ano: number; mes: number; dia: number };

/** Ano, mês (0 a 11) e dia do instante no fuso da empresa. */
export function partesNoFuso(instante: Date = new Date()): Partes {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_EMPRESA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return { ano: valor('year'), mes: valor('month') - 1, dia: valor('day') };
}

/** Diferença do fuso da empresa para UTC, em minutos, naquele instante (ex.: -180). */
function deslocamentoMinutos(instante: Date) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_EMPRESA, timeZoneName: 'longOffset' })
    .formatToParts(instante)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT-03:00" ou "GMT"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nome);
  if (!m) return 0;
  const minutos = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutos : minutos;
}

/**
 * Instante em que começa o dia `dia/mes/ano` no fuso da empresa.
 * Aceita mês e dia fora do intervalo (mes 12 = janeiro do ano seguinte; dia 0 = último do mês anterior).
 */
/**
 * Hoje no fuso da empresa, como "AAAA-MM-DD". É o formato das colunas só de data (DATE),
 * como as do agendamento: compare com elas por este texto, nunca pelo instante atual.
 */
export function diaDeHoje(agora: Date = new Date()): string {
  const { ano, mes, dia } = partesNoFuso(agora);
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function inicioDoDia(ano: number, mes: number, dia: number): Date {
  const meiaNoiteUtc = Date.UTC(ano, mes, dia);
  const aproximado = new Date(meiaNoiteUtc - deslocamentoMinutos(new Date(meiaNoiteUtc)) * 60_000);
  // recalcula no instante aproximado, para acertar dias de troca de horário
  return new Date(meiaNoiteUtc - deslocamentoMinutos(aproximado) * 60_000);
}

/** Início do mês atual (ou deslocado em `meses`) no fuso da empresa. */
export function inicioDoMes(meses = 0, agora: Date = new Date()): Date {
  const { ano, mes } = partesNoFuso(agora);
  return inicioDoDia(ano, mes + meses, 1);
}

/** Ano corrente no fuso da empresa (usado nos códigos GS-2026-0148). */
export const anoNoFuso = (agora: Date = new Date()) => partesNoFuso(agora).ano;

/** 28/09/2026 no fuso da empresa. */
export const formatarData = (instante: Date | string) =>
  new Date(instante).toLocaleDateString('pt-BR', { timeZone: FUSO_EMPRESA });
