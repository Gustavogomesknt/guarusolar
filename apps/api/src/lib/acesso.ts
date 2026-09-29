import type { UsuarioToken } from './auth';

/**
 * Regra 6 do CLAUDE.md: o técnico só acessa serviços da própria equipe (ou em que é o técnico
 * responsável). Usada nas rotas do técnico e na rota das fotos — um lugar só para a regra.
 */
export const tecnicoPodeVer = (
  usuario: Pick<UsuarioToken, 'id' | 'equipeId'>,
  servico: { equipeId: string; tecnicoResponsavelId: string | null },
) => servico.tecnicoResponsavelId === usuario.id || (usuario.equipeId !== null && servico.equipeId === usuario.equipeId);

/** O mesmo filtro, para consultas no banco (where do Prisma). */
export const filtroDoTecnico = (usuario: Pick<UsuarioToken, 'id' | 'equipeId'>) => ({
  OR: [{ tecnicoResponsavelId: usuario.id }, ...(usuario.equipeId ? [{ equipeId: usuario.equipeId }] : [])],
});
