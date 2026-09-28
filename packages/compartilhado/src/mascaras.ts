/*
 * Máscaras de exibição (telas, PDF, mensagens). No banco e na API, documento, WhatsApp e
 * CEP ficam só com dígitos, como manda o CLAUDE.md.
 */

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

/** Quantidade sem casas desnecessárias: 10 -> "10", 12.5 -> "12,5". */
export const formatarQuantidade = (valor: number) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
