import type { Prisma, TipoServico } from '@prisma/client';
import type { UsuarioToken } from './auth';
import { prisma } from './prisma';
import { ehEtapaDeVisita, ETAPAS_DE_VISITA } from '@guarusolar/compartilhado';

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
 * - COMERCIAL: SÓ os de VISITA TÉCNICA e LAUDO (avulsos ou de projeto; ETAPAS_DE_VISITA), para
 *   montar a proposta com o que foi medido; instalação, vistoria, manutenção e retrabalho continuam
 *   fora (decisão de 15/10/2026; o laudo entrou em 12/11/2026, visto igual à visita).
 * - TECNICO: os de serviço em que está escalado (regra 6) e, além disso, os de VISITA TÉCNICA e
 *   LAUDO do MESMO CLIENTE de uma INSTALAÇÃO (não cancelada) em que está escalado: quem vai instalar
 *   vê o que o colega registrou. Só leitura (as rotas de envio continuam pela escala).
 */
export async function podeVerArquivosDoServico(usuario: Pick<UsuarioToken, 'id' | 'papel'>, servico: ServicoParaConferir) {
  if (usuario.papel === 'ADMIN' || usuario.papel === 'GESTOR') return true;
  if (usuario.papel === 'COMERCIAL') return ehEtapaDeVisita(servico.tipo);
  if (usuario.papel !== 'TECNICO') return false;
  if (tecnicoPodeVer(usuario, servico)) return true;
  if (!ehEtapaDeVisita(servico.tipo)) return false;
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

/**
 * As visitas técnicas e os LAUDOS de um cliente (ETAPAS_DE_VISITA): os avulsos (ligados a ele) e os
 * dos projetos dele. Alimenta a ficha do cliente, a do projeto e a instalação no app de campo; cada
 * tela diz a etapa de cada um. "Visitas a orçar" NÃO usa este filtro: lá é só visita técnica.
 */
export const filtroDeVisitasDoCliente = (clienteId: string): Prisma.AgendamentoWhereInput => ({
  tipo: { in: [...ETAPAS_DE_VISITA] },
  OR: [{ clienteId }, { projeto: { clienteId } }],
});

// ---------------------------------------------------------------------------------------------
// REPRESENTANTE (vendedor de outro estado, 13/11/2026): só enxerga o que é DELE. O time interno
// (COMERCIAL, GESTOR, ADMIN) vê tudo, inclusive o dele. Mesmo trilho do técnico: o filtro vai no
// where de toda leitura (findFirst com id + filtro), num lugar só. O que não é dele responde 404
// (nunca 403: 403 confirmaria que existe). Cada rota declara como se isola em
// lib/isolamentoDoRepresentante.ts (conferido no build).
// - orçamento: o dele é o que ELE criou (vendedorId);
// - cliente: o dele é o que ELE cadastrou (Cliente.representanteId); nulo = cliente da casa.
// ---------------------------------------------------------------------------------------------
type QuemPede = Pick<UsuarioToken, 'id' | 'papel'>;

export const ehRepresentante = (usuario: QuemPede) => usuario.papel === 'REPRESENTANTE';

export const filtroDoRepresentante = {
  orcamento: (usuario: QuemPede): Prisma.OrcamentoWhereInput => (ehRepresentante(usuario) ? { vendedorId: usuario.id } : {}),
  cliente: (usuario: QuemPede): Prisma.ClienteWhereInput => (ehRepresentante(usuario) ? { representanteId: usuario.id } : {}),
};
