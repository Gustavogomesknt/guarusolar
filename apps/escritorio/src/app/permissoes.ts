import type { Papel } from '@guarusolar/compartilhado';

/** Papéis que usam o executável do escritório. O técnico usa o site no celular. */
export const PAPEIS_DO_ESCRITORIO = ['ADMIN', 'COMERCIAL', 'GESTOR'] as const satisfies readonly Papel[];

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
};
