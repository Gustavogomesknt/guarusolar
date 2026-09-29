import { mascararTelefone, somenteDigitos } from '@guarusolar/compartilhado';
import type { ClienteDoServico } from './tipos';

/** "Rua X, 120 · Bairro, Cidade/UF" (partes vazias somem). */
export function enderecoEscrito(c: ClienteDoServico) {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ');
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/');
  return [rua, [c.bairro, cidade].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

/** Link do mapa só quando há rua: só com a cidade o mapa não ajuda a chegar. */
export function linkDoMapa(c: ClienteDoServico) {
  if (!c.logradouro) return null;
  const consulta = [c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

const comDdi = (whatsapp: string) => {
  const digitos = somenteDigitos(whatsapp);
  return digitos.startsWith('55') && digitos.length > 11 ? digitos : `55${digitos}`;
};

export const linkDoWhatsApp = (c: ClienteDoServico) => `https://wa.me/${comDdi(c.whatsapp)}`;
export const telefoneEscrito = (c: ClienteDoServico) => mascararTelefone(c.whatsapp);
