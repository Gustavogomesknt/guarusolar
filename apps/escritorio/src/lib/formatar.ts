/*
 * Formatação só para a tela. Para a API vão sempre os dígitos (documento, WhatsApp, CEP)
 * e números JavaScript (valores), como manda o CLAUDE.md.
 */
export { formatarBRL } from '@guarusolar/compartilhado';

export const somenteDigitos = (valor: string) => valor.replace(/\D/g, '');

/** CPF (até 11 dígitos) ou CNPJ (12 a 14), formatado enquanto se digita. */
export function mascararDocumento(valor: string) {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** CPF com os dígitos do meio ocultos (348.•••.•••-06); CNPJ aparece inteiro. */
export function documentoParaExibir(documento: string) {
  const d = somenteDigitos(documento);
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.•••.•••-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${mascararDocumento(d)}`;
  return mascararDocumento(d);
}

/** (11) 98734-2215 ou (11) 3456-7890, formatado enquanto se digita. */
export function mascararTelefone(valor: string) {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 07010-000 */
export function mascararCep(valor: string) {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Lê um número digitado no padrão brasileiro: "1.234,56", "1234,5", "789.90" ou "40".
 * Com vírgula, os pontos são separadores de milhar; sem vírgula, um ponto é a casa decimal.
 * Devolve NaN quando não há número.
 */
export function lerNumero(valor: string): number {
  const texto = valor.trim().replace(/\s|R\$/g, '');
  if (!texto) return NaN;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  return /^-?\d*\.?\d+$/.test(normalizado) ? Number(normalizado) : NaN;
}

/** 1234.5 -> "1.234,50" (sem o R$), para preencher campos de valor. */
export const formatarDecimal = (valor: number, casas = 2) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Quantidade sem casas desnecessárias: 10 -> "10", 12.5 -> "12,5". */
export const formatarQuantidade = (valor: number) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
