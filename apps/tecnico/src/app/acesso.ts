import type { Papel } from '@guarusolar/compartilhado';

/*
 * Quem entra no app de campo: o técnico e, para ver o que ele vê, o gestor e o admin. Cada um
 * enxerga só os serviços em que está escalado (a API garante): quem não está em nenhum vê a
 * agenda vazia. O comercial não entra: recebe o aviso abaixo, com o caminho do escritório.
 */
export const PAPEIS_ACEITOS = ['TECNICO', 'GESTOR', 'ADMIN'] as const satisfies readonly Papel[];

export const AVISO_PERFIL_COMERCIAL = 'Esta é a área dos técnicos. Sua conta é do perfil Comercial — acesse o sistema do escritório.';
/** O escritório mora na raiz do mesmo endereço (este app, em /campo/). */
export const ENDERECO_DO_ESCRITORIO = '/';
