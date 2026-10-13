import type { ClienteDoServico } from './tipos';

/*
 * Endereço da instalação. O arquivo se chama "contato" por história: o app de campo não mostra
 * (nem recebe) telefone, WhatsApp ou e-mail do cliente.
 */

/** "Rua X, 120, Apto 3 · Bairro, Cidade/UF" (partes vazias somem). */
export function enderecoEscrito(c: ClienteDoServico) {
  const rua = [c.logradouro, c.numero, c.complemento].filter(Boolean).join(', ');
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/');
  return [rua, [c.bairro, cidade].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

/** Link do mapa só quando há rua: só com a cidade o mapa não ajuda a chegar. */
export function linkDoMapa(c: ClienteDoServico) {
  if (!c.logradouro) return null;
  const consulta = [c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}
