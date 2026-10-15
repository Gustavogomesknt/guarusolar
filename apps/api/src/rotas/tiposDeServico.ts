import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';

/*
 * Tipos de serviço VENDIDOS (instalação fotovoltaica, carregador veicular, manutenção...), o
 * campo obrigatório do orçamento que separa os números do painel. Nos moldes do catálogo:
 * comercial e gestor LEEM (para escolher no orçamento e filtrar); ADMIN e GESTOR cadastram,
 * renomeiam, reordenam e desativam. Nada é apagado: desativar só tira das escolhas novas, e o
 * que já usa o tipo continua com ele.
 * Não confundir com a ETAPA do agendamento (enum TipoServico: instalação, visita técnica...).
 */
export const rotasTiposDeServico = Router();
rotasTiposDeServico.use(autenticar);

const nomeSchema = z.string().trim().min(3, 'Use pelo menos 3 letras').max(80, 'Use até 80 caracteres');

async function conferirNomeLivre(nome: string, ignorarId?: string) {
  const outro = await prisma.tipoDeServico.findFirst({
    where: { nome: { equals: nome, mode: 'insensitive' }, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    select: { nome: true, ativo: true },
  });
  if (outro) throw new ErroHttp(409, `Já existe o tipo "${outro.nome}"${outro.ativo ? '' : ' (desativado: reative-o em vez de criar outro)'}.`);
}

/** Lista na ordem de exibição. Sem incluirInativos, só os ativos (as escolhas do orçamento). */
rotasTiposDeServico.get(
  '/',
  autorizar('COMERCIAL', 'GESTOR'),
  rota(async (req, res) => {
    const incluirInativos = req.query.incluirInativos === 'true';
    const tipos = await prisma.tipoDeServico.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      include: { _count: { select: { orcamentos: true } } },
    });
    res.json(tipos.map(({ _count, ...t }) => ({ ...t, usadoEmOrcamentos: _count.orcamentos })));
  }),
);

rotasTiposDeServico.post(
  '/',
  autorizar('GESTOR'),
  rota(async (req, res) => {
    const { nome } = z.object({ nome: nomeSchema }).parse(req.body);
    await conferirNomeLivre(nome);
    const ultimo = await prisma.tipoDeServico.aggregate({ _max: { ordem: true } });
    const tipo = await prisma.tipoDeServico.create({ data: { nome, ordem: (ultimo._max.ordem ?? 0) + 1 } });
    res.status(201).json({ ...tipo, usadoEmOrcamentos: 0 });
  }),
);

/** Renomear e ativar/desativar. */
rotasTiposDeServico.put(
  '/:id',
  autorizar('GESTOR'),
  rota(async (req, res) => {
    const dados = z.object({ nome: nomeSchema.optional(), ativo: z.boolean().optional() }).parse(req.body);
    const atual = await prisma.tipoDeServico.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Tipo de serviço não encontrado');
    if (dados.nome !== undefined) await conferirNomeLivre(dados.nome, atual.id);
    const tipo = await prisma.tipoDeServico.update({
      where: { id: atual.id },
      data: dados,
      include: { _count: { select: { orcamentos: true } } },
    });
    const { _count, ...resto } = tipo;
    res.json({ ...resto, usadoEmOrcamentos: _count.orcamentos });
  }),
);

/** Sobe ou desce uma posição na ordem de exibição (troca com o vizinho). */
rotasTiposDeServico.post(
  '/:id/mover',
  autorizar('GESTOR'),
  rota(async (req, res) => {
    const { direcao } = z.object({ direcao: z.enum(['acima', 'abaixo']) }).parse(req.body);
    await prisma.$transaction(async (tx) => {
      const todos = await tx.tipoDeServico.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true } });
      const i = todos.findIndex((t) => t.id === req.params.id);
      if (i < 0) throw new ErroHttp(404, 'Tipo de serviço não encontrado');
      const j = direcao === 'acima' ? i - 1 : i + 1;
      if (j < 0 || j >= todos.length) return;
      [todos[i], todos[j]] = [todos[j], todos[i]];
      // regrava 1..n: corrige também ordens repetidas de cadastros antigos
      for (const [posicao, t] of todos.entries()) await tx.tipoDeServico.update({ where: { id: t.id }, data: { ordem: posicao + 1 } });
    });
    res.status(204).end();
  }),
);
