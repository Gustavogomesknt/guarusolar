import type { Papel } from '@guarusolar/compartilhado';

/** Papéis que usam o escritório (site no PC). O técnico usa o app no celular. */
export const PAPEIS_DO_ESCRITORIO = ['ADMIN', 'COMERCIAL', 'GESTOR', 'REPRESENTANTE'] as const satisfies readonly Papel[];

/**
 * Telas de venda: o time interno e o REPRESENTANTE (vendedor de outro estado), que nelas vê só os
 * clientes e orçamentos DELE (a API filtra). Visitas a orçar e Projetos ficam só com o interno.
 */
export const PAPEIS_DE_VENDA = ['COMERCIAL', 'GESTOR', 'REPRESENTANTE'] as const satisfies readonly Papel[];
export const ehRepresentante = (papel: Papel | undefined) => papel === 'REPRESENTANTE';

/**
 * Mesma regra do autorizar() da API: ADMIN acessa tudo.
 * Isto só decide o que aparece na tela; quem garante o acesso é sempre a API.
 */
export function podeAcessar(papel: Papel, papeis: readonly Papel[]) {
  return papel === 'ADMIN' || papeis.includes(papel);
}

export const NOME_DO_PAPEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  COMERCIAL: 'Comercial',
  GESTOR: 'Gestor',
  TECNICO: 'Técnico',
  REPRESENTANTE: 'Representante',
};
