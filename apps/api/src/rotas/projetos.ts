import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, StatusProjeto } from '@prisma/client';
import { STATUS_PROJETO, TIPOS_EVENTO_PROJETO } from '@guarusolar/compartilhado';
import { filtroDeBusca } from '../lib/busca';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { registrarEvento } from '../lib/eventosProjeto';

/*
 * Projetos (obras): lista e ficha. Comercial CONSULTA (responde "quando vão instalar?"); só o
 * gestor edita e cancela. Agendar, remarcar e validar continuam na Agenda e na Validação.
 * Fotos: só o gestor as vê (regra 6); para o comercial, a ficha traz só a contagem.
 */
export const rotasProjetos = Router();
rotasProjetos.use(autenticar, autorizar('COMERCIAL', 'GESTOR'));

/** "Em andamento" = tudo que ainda não terminou (o filtro padrão da tela). */
const EM_ANDAMENTO: StatusProjeto[] = ['AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'EM_EXECUCAO', 'AGUARDANDO_VALIDACAO'];
const ordemDoStatus = (s: StatusProjeto) => STATUS_PROJETO.indexOf(s);

rotasProjetos.get(
  '/',
  rota(async (req, res) => {
    const { situacao, q, incluirCancelados } = z
      .object({
        situacao: z.enum(['EM_ANDAMENTO', 'TODOS', ...STATUS_PROJETO]).default('EM_ANDAMENTO'),
        q: z.string().trim().optional(),
        incluirCancelados: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);

    // por palavras: código do projeto; código, cliente e cidade do orçamento; nome atual do cliente
    const busca: Prisma.ProjetoWhereInput =
      filtroDeBusca(q, (p) => [
        { textoBusca: { contains: p } },
        { orcamento: { textoBusca: { contains: p } } },
        { cliente: { textoBusca: { contains: p } } },
      ]) ?? {};
    const semCancelados: Prisma.ProjetoWhereInput = incluirCancelados === 'true' ? {} : { status: { not: 'CANCELADO' } };
    const daSituacao: Prisma.ProjetoWhereInput =
      situacao === 'EM_ANDAMENTO' ? { status: { in: EM_ANDAMENTO } } : situacao === 'TODOS' ? semCancelados : { status: situacao };

    const [projetos, porStatus] = await Promise.all([
      prisma.projeto.findMany({
        where: { AND: [busca, daSituacao] },
        include: {
          cliente: { select: { nome: true, cidade: true, uf: true } },
          orcamento: { select: { codigo: true, valorTotal: true, valorTotalCliente: true, clienteNome: true, clienteCidade: true, clienteUf: true } },
          // o serviço que vale: o mais recente que não foi cancelado
          agendamentos: {
            where: { status: { not: 'CANCELADO' } },
            orderBy: { criadoEm: 'desc' },
            take: 1,
            include: { equipe: { select: { nome: true } } },
          },
        },
      }),
      prisma.projeto.groupBy({ by: ['status'], where: busca, _count: true }),
    ]);

    // em andamento: o que está mais para trás no fluxo primeiro, e o mais antigo antes;
    // concluídos e cancelados: os mais recentes primeiro
    projetos.sort((a, b) => {
      const ativoA = EM_ANDAMENTO.includes(a.status);
      const ativoB = EM_ANDAMENTO.includes(b.status);
      if (ativoA !== ativoB) return ativoA ? -1 : 1;
      if (ativoA) return ordemDoStatus(a.status) - ordemDoStatus(b.status) || a.criadoEm.getTime() - b.criadoEm.getTime();
      return (b.concluidoEm ?? b.canceladoEm ?? b.criadoEm).getTime() - (a.concluidoEm ?? a.canceladoEm ?? a.criadoEm).getTime();
    });

    const contagem = Object.fromEntries(STATUS_PROJETO.map((s) => [s, porStatus.find((p) => p.status === s)?._count ?? 0])) as Record<StatusProjeto, number>;
    res.json({
      contagem: { ...contagem, EM_ANDAMENTO: EM_ANDAMENTO.reduce((t, s) => t + contagem[s], 0) },
      itens: projetos.map(({ agendamentos, cliente, orcamento, ...p }) => ({
        ...p,
        // o documento usa a cópia gravada no orçamento; a ficha do cliente segue o cadastro
        clienteNome: orcamento.clienteNome ?? cliente.nome,
        clienteCidade: orcamento.clienteCidade ?? cliente.cidade,
        clienteUf: orcamento.clienteUf ?? cliente.uf,
        orcamentoCodigo: orcamento.codigo,
        valorTotal: orcamento.valorTotal,
        valorTotalCliente: orcamento.valorTotalCliente ?? orcamento.valorTotal,
        servicoAtual: agendamentos[0]
          ? {
              id: agendamentos[0].id,
              tipo: agendamentos[0].tipo,
              status: agendamentos[0].status,
              dataInicio: agendamentos[0].dataInicio,
              dataFim: agendamentos[0].dataFim,
              equipe: agendamentos[0].equipe.nome,
              enviadoEm: agendamentos[0].enviadoEm,
            }
          : null,
      })),
    });
  }),
);

rotasProjetos.get(
  '/:id',
  rota(async (req, res) => {
    const podeVerFotos = req.usuario!.papel === 'GESTOR' || req.usuario!.papel === 'ADMIN';
    const projeto = await prisma.projeto.findUnique({
      where: { id: req.params.id },
      include: {
        cliente: { select: { id: true, nome: true, whatsapp: true, ativo: true } },
        orcamento: {
          select: {
            id: true,
            codigo: true,
            tokenPdf: true,
            aprovadoEm: true,
            valorTotal: true,
            valorTotalCliente: true,
            resumoPagamento: true,
            condicaoPagamento: true,
            descricaoServico: true,
            clienteNome: true,
            clienteDocumento: true,
            clienteWhatsapp: true,
            clienteEmail: true,
            clienteCep: true,
            clienteLogradouro: true,
            clienteNumero: true,
            clienteComplemento: true,
            clienteBairro: true,
            clienteCidade: true,
            clienteUf: true,
            vendedor: { select: { nome: true } },
            _count: { select: { itens: true } },
          },
        },
        agendamentos: {
          orderBy: { criadoEm: 'asc' },
          include: {
            equipe: { select: { nome: true } },
            tecnicoResponsavel: { select: { nome: true } },
            validadoPor: { select: { nome: true } },
            _count: { select: { fotos: true } },
            ...(podeVerFotos
              ? { fotos: { orderBy: { criadoEm: 'asc' }, select: { id: true, chave: true, rotulo: true, revisao: true, capturadaEm: true } } }
              : {}),
          },
        },
        eventos: { include: { usuario: { select: { nome: true } } } },
      },
    });
    if (!projeto) throw new ErroHttp(404, 'Projeto não encontrado');

    // mais recente primeiro; no mesmo instante, na ordem natural do fluxo (aprovado antes de concluído)
    const ordemDoTipo = (t: (typeof TIPOS_EVENTO_PROJETO)[number]) => TIPOS_EVENTO_PROJETO.indexOf(t);
    projeto.eventos.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || ordemDoTipo(b.tipo) - ordemDoTipo(a.tipo));

    res.json({ ...projeto, podeVerFotos });
  }),
);

// ---------------------------------------------------------------------------------------------
// Só o gestor: dados do projeto e cancelamento
// ---------------------------------------------------------------------------------------------

rotasProjetos.patch(
  '/:id',
  autorizar('GESTOR'),
  rota(async (req, res) => {
    const dados = z
      .object({
        potenciaKwp: z.number().nonnegative().max(100000, 'Potência fora do esperado').nullable().optional(),
        observacoes: z.string().trim().max(2000, 'Use até 2.000 caracteres').nullable().optional(),
      })
      .parse(req.body);
    const atual = await prisma.projeto.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Projeto não encontrado');
    if (atual.status === 'CANCELADO') throw new ErroHttp(409, 'Projeto cancelado não pode ser alterado.');

    const observacoes = dados.observacoes === undefined ? undefined : dados.observacoes || null;
    const mudancas: string[] = [];
    if (dados.potenciaKwp !== undefined && Number(atual.potenciaKwp ?? NaN) !== (dados.potenciaKwp ?? NaN)) {
      mudancas.push(dados.potenciaKwp === null ? 'potência removida' : `potência: ${dados.potenciaKwp.toLocaleString('pt-BR')} kWp`);
    }
    if (observacoes !== undefined && (atual.observacoes ?? null) !== observacoes) mudancas.push('observações internas atualizadas');

    const projeto = await prisma.$transaction(async (tx) => {
      const p = await tx.projeto.update({ where: { id: atual.id }, data: { potenciaKwp: dados.potenciaKwp, observacoes } });
      if (mudancas.length) {
        await registrarEvento(tx, { projetoId: atual.id, tipo: 'PROJETO_EDITADO', descricao: `Projeto atualizado: ${mudancas.join(' · ')}`, usuarioId: req.usuario!.id });
      }
      return p;
    });
    res.json(projeto);
  }),
);

/**
 * Cancelar a obra (o cliente desistiu): só antes de a execução começar. Os serviços agendados
 * são cancelados junto; o orçamento continua aprovado; nada é apagado.
 */
rotasProjetos.post(
  '/:id/cancelar',
  autorizar('GESTOR'),
  rota(async (req, res) => {
    const { motivo } = z.object({ motivo: z.string().trim().min(5, 'Explique por que o projeto foi cancelado') }).parse(req.body);
    const atual = await prisma.projeto.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Projeto não encontrado');
    if (atual.status !== 'AGUARDANDO_AGENDAMENTO' && atual.status !== 'AGENDADO') {
      const situacao: Partial<Record<StatusProjeto, string>> = {
        EM_EXECUCAO: 'a execução já começou',
        AGUARDANDO_VALIDACAO: 'o serviço já foi feito e está em validação',
        CONCLUIDO: 'o projeto já foi concluído',
        CANCELADO: 'o projeto já está cancelado',
      };
      throw new ErroHttp(409, `Não dá para cancelar: ${situacao[atual.status]}.`);
    }

    const projeto = await prisma.$transaction(async (tx) => {
      const agendados = await tx.agendamento.findMany({ where: { projetoId: atual.id, status: 'AGENDADO' } });
      if (agendados.length) {
        await tx.agendamento.updateMany({ where: { id: { in: agendados.map((a) => a.id) } }, data: { status: 'CANCELADO' } });
      }
      const p = await tx.projeto.update({
        where: { id: atual.id },
        data: { status: 'CANCELADO', canceladoEm: new Date(), motivoCancelamento: motivo },
      });
      const junto = agendados.length ? ` (${agendados.length} ${agendados.length === 1 ? 'serviço agendado cancelado' : 'serviços agendados cancelados'} junto)` : '';
      await registrarEvento(tx, { projetoId: atual.id, tipo: 'PROJETO_CANCELADO', descricao: `Projeto cancelado: ${motivo}${junto}`, usuarioId: req.usuario!.id });
      return p;
    });
    res.json(projeto);
  }),
);
