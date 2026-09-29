
/*
 * Dias como texto AAAA-MM-DD (agenda do escritório e app do técnico). O agendamento é só dia
 * (coluna DATE no banco), então não há hora nem fuso: as contas são feitas em UTC puro sobre
 * o dia. Para "hoje", use diaDeHoje() (datas.ts), que já considera o fuso da empresa.
 */
export type Dia = string;

const paraData = (dia: Dia) => new Date(`${dia}T00:00:00Z`);
const paraDia = (d: Date): Dia => d.toISOString().slice(0, 10);

export const somarDias = (dia: Dia, n: number): Dia => {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return paraDia(d);
};

/** 0 = domingo ... 6 = sábado */
export const diaDaSemana = (dia: Dia) => paraData(dia).getUTCDay();

/** Segunda-feira da semana do dia (domingo pertence à semana que termina nele). */
export const segundaDaSemana = (dia: Dia): Dia => {
  const d = diaDaSemana(dia);
  return somarDias(dia, d === 0 ? -6 : 1 - d);
};

/** As seis colunas da grade: segunda a sábado. */
export const diasDaSemana = (segunda: Dia): Dia[] => Array.from({ length: 6 }, (_, i) => somarDias(segunda, i));

/** Último dia de um serviço de `dias` dias úteis (segunda a sábado) a partir de `inicio`. */
export function fimDoServico(inicio: Dia, dias: number): Dia {
  let fim = inicio;
  let restantes = Math.max(1, Math.trunc(dias)) - 1;
  while (restantes > 0) {
    fim = somarDias(fim, 1);
    if (diaDaSemana(fim) !== 0) restantes--;
  }
  return fim;
}

/** Quantos dias úteis (segunda a sábado) há entre início e fim, inclusive. */
export function diasUteis(inicio: Dia, fim: Dia): number {
  let n = 0;
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (diaDaSemana(d) !== 0) n++;
  return Math.max(1, n);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const partes = (dia: Dia) => ({ ano: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) - 1, d: Number(dia.slice(8, 10)) });

/** 29/09 */
export const diaMes = (dia: Dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** Seg */
export const nomeCurto = (dia: Dia) => SEMANA[diaDaSemana(dia)];
/** terça, 29/09 */
export const nomeLongo = (dia: Dia) => `${SEMANA_LONGA[diaDaSemana(dia)]}, ${diaMes(dia)}`;

/** "28 set a 3 out 2026" */
export function intervaloEscrito(inicio: Dia, fim: Dia) {
  const a = partes(inicio);
  const b = partes(fim);
  const esquerda = a.mes === b.mes ? `${a.d}` : `${a.d} ${MESES[a.mes]}${a.ano !== b.ano ? ` ${a.ano}` : ''}`;
  return `${esquerda} a ${b.d} ${MESES[b.mes]} ${b.ano}`;
}

/** Número da semana no padrão ISO 8601. */
export function numeroDaSemana(dia: Dia) {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicioDoAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioDoAno.getTime()) / 864e5 + 1) / 7);
}

/** Data vinda da API ("2026-09-29T00:00:00.000Z") -> "2026-09-29" */
export const diaDaApi = (iso: string): Dia => iso.slice(0, 10);
