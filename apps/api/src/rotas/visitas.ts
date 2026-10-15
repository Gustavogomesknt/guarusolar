import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ROTEIRO_DO_SERVICO } from '@guarusolar/compartilhado';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { filtroDeVisitasDoCliente } from '../lib/acesso';
import { operacaoMudou } from '../lib/versaoDaOperacao';

/*
 * Visitas técnicas para o COMERCIAL (e o gestor): a visita é gratuita e pode acontecer antes do
 * orçamento (AVULSA, ligada ao cliente) ou depois (do projeto). Depois de validada, a avulsa entra
 * em "aguardando orçamento", para a proposta ser montada com as fotos e as observações em mãos.
 * Sai dessa lista sozinha quando o cliente ganha um orçamento CRIADO DEPOIS da validação, ou pelo
 * "Dispensar" (a visita que não vira proposta). Sair da lista não esconde nada: a ficha do
 * cliente lista todas as visitas dele (GET /do-cliente/:id).
 * As fotos abrem por /api/fotos/:id: o comercial vê as de visita técnica (lib/acesso.ts).
 */
export const rotasVisitas = Router();
rotasVisitas.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

const nome = { select: { nome: true } } as const;

/** O que a lista e a ficha mostram de cada visita. */
const DADOS_DA_VISITA = {
  id: true,
  status: true,
  dataInicio: true,
  dataFim: true,
  projeto: { select: { id: true, codigo: true } },
  cliente: { select: { id: true, nome: true, cidade: true, uf: true } },
  equipe: nome,
  escala: { select: { usuario: nome }, orderBy: { usuario: { nome: 'asc' } } },
  observacoesTecnico: true,
  enviadoEm: true,
  enviadoPor: nome,
  validadoEm: true,
  validadoPor: nome,
  motivoDevolucao: true,
  dispensadaEm: true,
  dispensadaPor: nome,
  fotos: { where: { revisao: { not: 'REFAZER' } }, orderBy: { criadoEm: 'asc' }, select: { id: true, rotulo: true, chave: true, capturadaEm: true } },
  // os mesmos campos da validação: a tela reusa o tocador de lá (link de 5 min por /api/videos/:id)
  videos: {
    orderBy: { criadoEm: 'asc' },
    select: { id: true, duracaoSegundos: true, tamanhoBytes: true, gravadoEm: true, criadoEm: true, capaChave: true, enviadoPor: nome },
  },
} satisfies Prisma.AgendamentoSelect;

type Visita = Prisma.AgendamentoGetPayload<{ select: typeof DADOS_DA_VISITA }>;

const ORDEM_DAS_FOTOS = new Map(ROTEIRO_DO_SERVICO.VISITA_TECNICA.fotos.map((f, i) => [f.chave, i]));
const posicao = (chave: string | null) => (chave ? (ORDEM_DAS_FOTOS.get(chave) ?? 99) : 100);

/** Fotos na ordem do roteiro da visita (extras no fim); vídeo sem a chave do arquivo. */
const paraATela = ({ videos, fotos, ...v }: Visita, aguardandoOrcamento: boolean) => ({
  ...v,
  avulsa: v.projeto === null,
  aguardandoOrcamento,
  fotos: [...fotos].sort((a, b) => posicao(a.chave) - posicao(b.chave)),
  videos: videos.map(({ capaChave, ...video }) => ({ ...video, temCapa: capaChave !== null })),
});

/**
 * A avulsa validada, não dispensada, cujo cliente não tem orçamento criado depois da validação.
 * (O orçamento mais recente do cliente basta: se ele é anterior, todos são.)
 */
const aguardaOrcamento = (v: { status: string; projeto: unknown; dispensadaEm: Date | null; validadoEm: Date | null }, ultimoOrcamento: Date | null) =>
  v.projeto === null && v.status === 'APROVADO' && v.dispensadaEm === null && !(ultimoOrcamento && v.validadoEm && ultimoOrcamento > v.validadoEm);

rotasVisitas.get(
  '/aguardando-orcamento',
  rota(async (_req, res) => {
    const candidatas = await prisma.agendamento.findMany({
      where: { tipo: 'VISITA_TECNICA', projetoId: null, status: 'APROVADO', dispensadaEm: null },
      orderBy: { validadoEm: 'asc' },
      select: { ...DADOS_DA_VISITA, cliente: { select: { id: true, nome: true, cidade: true, uf: true, orcamentos: { orderBy: { criadoEm: 'desc' }, take: 1, select: { criadoEm: true } } } } },
    });
    res.json(
      candidatas
        .filter((v) => aguardaOrcamento(v, v.cliente?.orcamentos[0]?.criadoEm ?? null))
        .map(({ cliente, ...v }) => {
          const { orcamentos: _, ...semOrcamentos } = cliente!;
          return paraATela({ ...v, cliente: semOrcamentos }, true);
        }),
    );
  }),
);

/** Todas as visitas técnicas do cliente (avulsas e dos projetos dele), da mais recente. */
rotasVisitas.get(
  '/do-cliente/:clienteId',
  rota(async (req, res) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid() }).parse(req.params);
    const [visitas, ultimo] = await Promise.all([
      prisma.agendamento.findMany({
        where: { ...filtroDeVisitasDoCliente(clienteId), status: { not: 'CANCELADO' } },
        orderBy: { dataInicio: 'desc' },
        select: DADOS_DA_VISITA,
      }),
      prisma.orcamento.findFirst({ where: { clienteId }, orderBy: { criadoEm: 'desc' }, select: { criadoEm: true } }),
    ]);
    res.json(visitas.map((v) => paraATela(v, aguardaOrcamento(v, ultimo?.criadoEm ?? null))));
  }),
);

/** "Dispensar": a visita validada não vai virar proposta. Sai da lista; continua na ficha do cliente. */
rotasVisitas.post(
  '/:id/dispensar',
  rota(async (req, res) => {
    const visita = await prisma.agendamento.findUnique({
      where: { id: req.params.id },
      select: { tipo: true, projetoId: true, status: true, dispensadaEm: true },
    });
    if (!visita || visita.tipo !== 'VISITA_TECNICA') throw new ErroHttp(404, 'Visita técnica não encontrada');
    if (visita.projetoId !== null) throw new ErroHttp(409, 'Esta visita é de um projeto (o orçamento já foi aprovado): não fica aguardando orçamento.');
    if (visita.status !== 'APROVADO') throw new ErroHttp(409, 'Só a visita já validada pelo gestor pode ser dispensada.');
    if (visita.dispensadaEm) return res.json({ ok: true, jaEstava: true });
    await prisma.agendamento.update({
      where: { id: req.params.id },
      data: { dispensadaEm: new Date(), dispensadaPorId: req.usuario!.id },
    });
    operacaoMudou();
    res.json({ ok: true });
  }),
);
