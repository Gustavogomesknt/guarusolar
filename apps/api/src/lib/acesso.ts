import type { Prisma, TipoServico } from '@prisma/client';
import type { UsuarioToken } from './auth';
import { prisma } from './prisma';

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

/**
 * O que a conferência das fotos e vídeos precisa do serviço, carregado JUNTO com a foto (uma ida
 * ao banco): a etapa, o cliente (direto, na visita avulsa, ou pelo projeto) e a linha da escala
 * de quem pede.
 */
export const servicoParaConferirAcesso = (usuarioId: string) =>
  ({
    select: {
      tipo: true,
      clienteId: true,
      projeto: { select: { clienteId: true } },
      escala: { where: { usuarioId }, select: { usuarioId: true } },
    },
  }) satisfies Prisma.AgendamentoDefaultArgs;

type ServicoParaConferir = {
  tipo: TipoServico;
  clienteId: string | null;
  projeto: { clienteId: string } | null;
  escala: { usuarioId: string }[];
};

/**
 * Quem vê as fotos e os vídeos de um serviço (a rota das fotos e a dos vídeos usam só isto):
 * - GESTOR e ADMIN: todos, para validar.
 * - COMERCIAL: SÓ os de VISITA TÉCNICA (avulsa ou de projeto), para montar a proposta com o que
 *   foi medido; instalação, vistoria, manutenção e retrabalho continuam fora (decisão de 15/10/2026).
 * - TECNICO: os de serviço em que está escalado (regra 6) e, além disso, os de VISITA TÉCNICA do
 *   MESMO CLIENTE de uma INSTALAÇÃO (não cancelada) em que está escalado: quem vai instalar vê o
 *   que o colega registrou na visita. Só leitura (as rotas de envio continuam pela escala).
 */
export async function podeVerArquivosDoServico(usuario: Pick<UsuarioToken, 'id' | 'papel'>, servico: ServicoParaConferir) {
  if (usuario.papel === 'ADMIN' || usuario.papel === 'GESTOR') return true;
  if (usuario.papel === 'COMERCIAL') return servico.tipo === 'VISITA_TECNICA';
  if (usuario.papel !== 'TECNICO') return false;
  if (tecnicoPodeVer(usuario, servico)) return true;
  if (servico.tipo !== 'VISITA_TECNICA') return false;
  const clienteId = servico.clienteId ?? servico.projeto?.clienteId;
  if (!clienteId) return false;
  return (await prisma.agendamento.count({ where: filtroDeInstalacaoDoCliente(usuario, clienteId) })) > 0;
}

/** Instalações (não canceladas) do cliente em que o técnico está escalado. */
export const filtroDeInstalacaoDoCliente = (usuario: Pick<UsuarioToken, 'id'>, clienteId: string): Prisma.AgendamentoWhereInput => ({
  tipo: 'INSTALACAO',
  status: { not: 'CANCELADO' },
  projeto: { clienteId },
  ...filtroDoTecnico(usuario),
});

/** As visitas técnicas de um cliente: as avulsas (ligadas a ele) e as dos projetos dele. */
export const filtroDeVisitasDoCliente = (clienteId: string): Prisma.AgendamentoWhereInput => ({
  tipo: 'VISITA_TECNICA',
  OR: [{ clienteId }, { projeto: { clienteId } }],
});
