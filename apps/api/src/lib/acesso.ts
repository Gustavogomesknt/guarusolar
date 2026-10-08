import type { UsuarioToken } from './auth';

/**
 * Regra 6 do CLAUDE.md: o técnico só acessa os serviços em que está ESCALADO (tabela
 * EscalaServico), não mais "os da equipe dele". A equipe é só a composição padrão: quem vai de
 * fato é a escala de cada serviço, que o gestor edita. Usada nas rotas do técnico e na rota das
 * fotos — um lugar só para a regra. Sair da escala tira o acesso na hora, inclusive às fotos.
 */
export const tecnicoPodeVer = (usuario: Pick<UsuarioToken, 'id'>, servico: { escala: { usuarioId: string }[] }) =>
  servico.escala.some((e) => e.usuarioId === usuario.id);

/** O mesmo filtro, para consultas no banco (where do Prisma). */
export const filtroDoTecnico = (usuario: Pick<UsuarioToken, 'id'>) => ({
  escala: { some: { usuarioId: usuario.id } },
});
