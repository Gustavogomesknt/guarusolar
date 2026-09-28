/*
 * Formatação só para a tela. Para a API vão sempre os dígitos (documento, WhatsApp, CEP)
 * e números JavaScript (valores), como manda o CLAUDE.md.
 * As máscaras ficam no pacote compartilhado, porque o PDF da API usa as mesmas.
 */
import { mascararDocumento, somenteDigitos } from '@guarusolar/compartilhado';

export {
  formatarBRL,
  formatarQuantidade,
  mascararCep,
  mascararDocumento,
  mascararTelefone,
  somenteDigitos,
} from '@guarusolar/compartilhado';

/** CPF com os dígitos do meio ocultos (348.•••.•••-06); CNPJ aparece inteiro. */
export function documentoParaExibir(documento: string) {
  const d = somenteDigitos(documento);
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.•••.•••-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${mascararDocumento(d)}`;
  return mascararDocumento(d);
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
