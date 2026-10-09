import { Router } from 'express';
import multer from 'multer';
import { Prisma, type StatusAgendamento, type StatusProjeto, type TipoEventoProjeto, type TipoServico } from '@prisma/client';
import { z } from 'zod';
import { oa, periodoDoServico, registrarEvento, rotuloDoServico } from '../lib/eventosProjeto';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { operacaoMudou, versaoDaOperacao } from '../lib/versaoDaOperacao';
import path from 'node:path';
import {
  ArmazenamentoCheio,
  ArmazenamentoIndisponivel,
  appTecnicoLiberado,
  AVISO_FOTOS_BLOQUEADAS,
  guardarComoSubstituida,
  salvarFoto,
} from '../lib/armazenamento';
import { TAMANHO_MAXIMO_FOTO } from '../lib/upload';
import { filtroDoTecnico } from '../lib/acesso';
import { diaDeHoje, moveOProjeto, ROTEIRO_DO_SERVICO, TIPOS_SERVICO_AGENDAVEIS } from '@guarusolar/compartilhado';
import { mudarSituacaoDoProjeto, outroServicoAndando, situacaoDevida } from '../lib/situacaoDoProjeto';

// Upload das fotos do técnico (o limite de tamanho fica em src/lib/upload.ts).
const TIPOS_DE_FOTO_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

// ===========================================================================
// AGENDA — escritório (gestor)
// ===========================================================================
export const rotasAgenda = Router();
// agenda é do gestor (ADMIN sempre passa); o comercial acompanha pelo status dos orçamentos
rotasAgenda.use(autenticar, autorizar('GESTOR'));

// ids de equipe não são UUID (o seed usa o nome, ex.: "Equipe A")
const idEquipe = z.string().trim().min(1, 'Escolha a equipe');

/** 2026-09-29 -> 29/09 (datas do agendamento são só dia, sem hora). */
const diaMes = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/');

const EM_ABERTO: StatusAgendamento[] = ['AGENDADO', 'EM_EXECUCAO', 'DEVOLVIDO'];

/**
 * Registra no histórico um passo do serviço, DEPOIS de gravar a mudança no agendamento (mesma
 * transação). Visita técnica e instalação movem a situação do projeto: ela é relida dos serviços
 * (`situacaoDevida`: um projeto pode ter vários agendados) e aplicada por `mudarSituacaoDoProjeto`,
 * o único caminho. Vistoria, manutenção e retrabalho correm por fora e só deixam o evento: um
 * projeto concluído continua concluído enquanto a manutenção é agendada, feita e validada.
 */
async function passoDoServico(
  tx: Prisma.TransactionClient,
  passo: {
    servico: { id: string; projetoId: string; tipo: TipoServico };
    evento: TipoEventoProjeto;
    /** texto do histórico; função quando depende da situação em que o projeto ficou */
    descricao: string | ((projeto: StatusProjeto | null) => string);
    usuarioId: string;
    dados?: Parameters<typeof mudarSituacaoDoProjeto>[1]['dados'];
    /** troca de tipo: o tipo de antes também pode ser um que move o projeto */
    tipoAnterior?: TipoServico;
  },
) {
  const { servico, evento, usuarioId, dados, tipoAnterior } = passo;
  const move = moveOProjeto(servico.tipo) || (tipoAnterior !== undefined && moveOProjeto(tipoAnterior));
  const para = move ? await situacaoDevida(tx, servico.projetoId) : null;
  const descricao = typeof passo.descricao === 'string' ? passo.descricao : passo.descricao(para);
  if (para) {
    await mudarSituacaoDoProjeto(tx, { projetoId: servico.projetoId, agendamentoId: servico.id, para, evento, descricao, usuarioId, dados });
  } else {
    await registrarEvento(tx, { projetoId: servico.projetoId, agendamentoId: servico.id, tipo: evento, descricao, usuarioId });
  }
}

/**
 * Só UM serviço do projeto anda por vez (em execução, devolvido ou em validação); agendados pode
 * haver vários. Começar outro enquanto isso é recusado, com o motivo.
 */
const avisoDeOutroAndando = (outro: { tipo: TipoServico; status: StatusAgendamento; dataInicio: Date; dataFim: Date }) =>
  `Outro serviço deste projeto (${rotuloDoServico(outro.tipo).toLowerCase()} de ${periodoDoServico(outro.dataInicio, outro.dataFim)}) ${
    outro.status === 'AGUARDANDO_VALIDACAO' ? 'está esperando a validação do gestor' : 'está em execução'
  }. Só um serviço do projeto anda por vez: este pode começar depois que aquele for validado.`;

async function conferirQuePodeComecar(servico: { id: string; projetoId: string }) {
  const outro = await outroServicoAndando(prisma, servico);
  if (outro) throw new ErroHttp(409, avisoDeOutroAndando(outro));
}

/** Visita técnica: só antes de a instalação começar, e no máximo uma ainda não validada. */
async function conferirVisitaTecnica(projeto: { id: string; codigo: string; status: StatusProjeto }, ignorarId?: string) {
  const outros = await prisma.agendamento.findMany({
    where: { projetoId: projeto.id, tipo: { in: ['VISITA_TECNICA', 'INSTALACAO'] }, status: { not: 'CANCELADO' }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { tipo: true, status: true, dataInicio: true, dataFim: true },
  });
  const visita = outros.find((o) => o.tipo === 'VISITA_TECNICA' && o.status !== 'APROVADO');
  if (visita) {
    throw new ErroHttp(409, `O projeto ${projeto.codigo} já tem uma visita técnica ainda não validada (${periodoDoServico(visita.dataInicio, visita.dataFim)}). Remarque essa visita, ou agende outra depois que ela for validada.`);
  }
  const instalacaoComecou = outros.some((o) => o.tipo === 'INSTALACAO' && o.status !== 'AGENDADO');
  if (instalacaoComecou || projeto.status === 'AGUARDANDO_CONCLUSAO' || projeto.status === 'CONCLUIDO') {
    throw new ErroHttp(409, `Visita técnica só antes da instalação: no projeto ${projeto.codigo} a instalação já começou. Use manutenção, retrabalho ou vistoria.`);
  }
}
const ESCALA = { escala: { select: { usuario: { select: { id: true, nome: true } } }, orderBy: { usuario: { nome: 'asc' } } } } as const;

type Tecnico = { id: string; nome: string };

/** "Willian", "Willian e Washington", "A, B e C"; lista vazia = ninguém. */
const nomesDe = (tecnicos: Tecnico[]) => {
  const nomes = tecnicos.map((t) => t.nome);
  if (nomes.length === 0) return 'ninguém escalado';
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
};

/** A composição padrão: os técnicos ativos da equipe. É a escala de um serviço novo. */
const tecnicosDaEquipe = (equipeId: string): Promise<Tecnico[]> =>
  prisma.usuario.findMany({ where: { equipeId, papel: 'TECNICO', ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } });

/** Os técnicos que o gestor escolheu: só entram técnicos ativos. */
async function tecnicosEscolhidos(ids: string[]): Promise<Tecnico[]> {
  const unicos = [...new Set(ids)];
  const tecnicos = await prisma.usuario.findMany({
    where: { id: { in: unicos }, papel: 'TECNICO', ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
  if (tecnicos.length !== unicos.length) throw new ErroHttp(400, 'Só técnicos ativos podem ser escalados. Recarregue a tela e escolha de novo.');
  return tecnicos;
}

export type AvisoDeConflito = { quem: 'EQUIPE' | 'TECNICO'; nome: string; texto: string };

/**
 * Regra 8 do CLAUDE.md: conflito AVISA, não bloqueia (decisão da Guarusolar). A agenda trabalha
 * com dias inteiros e uma visita técnica dura cerca de uma hora: a mesma dupla faz duas ou três
 * no mesmo dia. O aviso diz onde a equipe e cada pessoa já estão (projeto e cliente), para o
 * gestor decidir informado. Serviços cancelados não contam. `ignorarId`: o próprio serviço.
 */
async function avisosDeConflito(opcoes: { equipeId: string; tecnicos: string[]; inicio: Date; fim: Date; ignorarId?: string }): Promise<AvisoDeConflito[]> {
  const { equipeId, tecnicos, inicio, fim, ignorarId } = opcoes;
  const outros = await prisma.agendamento.findMany({
    where: {
      status: { not: 'CANCELADO' },
      dataInicio: { lte: fim },
      dataFim: { gte: inicio },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
      OR: [{ equipeId }, ...(tecnicos.length ? [{ escala: { some: { usuarioId: { in: tecnicos } } } }] : [])],
    },
    orderBy: { dataInicio: 'asc' },
    include: { equipe: { select: { nome: true } }, projeto: { select: { codigo: true, cliente: { select: { nome: true } } } }, ...ESCALA },
  });
  const onde = (o: (typeof outros)[number]) =>
    `${o.projeto.codigo} (${o.projeto.cliente.nome}), ${o.dataInicio.getTime() === o.dataFim.getTime() ? `em ${diaMes(o.dataInicio)}` : `de ${diaMes(o.dataInicio)} a ${diaMes(o.dataFim)}`}`;
  // um aviso por serviço: a equipe (se for a mesma linha da agenda) e quem dos escolhidos já está lá
  return outros.map((o) => {
    const mesmaEquipe = o.equipeId === equipeId;
    const pessoas = o.escala.filter((e) => tecnicos.includes(e.usuario.id)).map((e) => e.usuario);
    const texto = mesmaEquipe
      ? `A ${o.equipe.nome} já tem ${onde(o)}${pessoas.length ? `, com ${nomesDe(pessoas)}` : ''}.`
      : `${nomesDe(pessoas)} já ${pessoas.length > 1 ? 'estão' : 'está'} em ${onde(o)}, com a ${o.equipe.nome}.`;
    return { quem: mesmaEquipe ? ('EQUIPE' as const) : ('TECNICO' as const), nome: mesmaEquipe ? o.equipe.nome : nomesDe(pessoas), texto };
  });
}

/** Avisos de conflito para a janela de agendar/remarcar, enquanto o gestor escolhe. */
rotasAgenda.get(
  '/conflitos',
  rota(async (req, res) => {
    const consulta = z
      .object({
        equipeId: idEquipe,
        inicio: z.coerce.date(),
        fim: z.coerce.date(),
        tecnicos: z.string().optional(),
        ignorar: z.string().uuid().optional(),
      })
      .parse(req.query);
    res.json(
      await avisosDeConflito({
        equipeId: consulta.equipeId,
        tecnicos: (consulta.tecnicos ?? '').split(',').filter(Boolean),
        inicio: consulta.inicio,
        fim: consulta.fim,
        ignorarId: consulta.ignorar,
      }),
    );
  }),
);

/** Todos os técnicos ativos, com a equipe padrão de cada um: quem pode ser escalado. */
rotasAgenda.get(
  '/tecnicos',
  rota(async (_req, res) => {
    res.json(
      await prisma.usuario.findMany({
        where: { papel: 'TECNICO', ativo: true },
        select: { id: true, nome: true, equipeId: true },
        orderBy: { nome: 'asc' },
      }),
    );
  }),
);

rotasAgenda.get(
  '/',
  rota(async (req, res) => {
    const { inicio, fim } = z
      .object({ inicio: z.coerce.date(), fim: z.coerce.date() })
      .parse(req.query);

    const equipes = await prisma.equipe.findMany({
      where: { ativa: true },
      orderBy: { nome: 'asc' },
      include: {
        membros: { where: { ativo: true }, select: { id: true, nome: true, papel: true } },
        agendamentos: {
          where: { dataInicio: { lte: fim }, dataFim: { gte: inicio }, status: { not: 'CANCELADO' } },
          orderBy: { dataInicio: 'asc' },
          include: {
            projeto: {
              include: {
                cliente: { select: { nome: true, cidade: true, uf: true } },
                orcamento: { select: { id: true, codigo: true } },
              },
            },
            ...ESCALA,
          },
        },
      },
    });

    res.json(equipes);
  }),
);

/** Projetos aprovados que ainda não têm data: lista "A agendar". */
rotasAgenda.get(
  '/pendentes',
  rota(async (req, res) => {
    // `incluir`: um projeto que não está "A agendar" mas vai ganhar outro serviço (mais um dia
    // de instalação, vistoria, retrabalho ou manutenção), aberto pela ficha dele ou pela agenda
    const { incluir } = z.object({ incluir: z.string().uuid().optional() }).parse(req.query);
    const projetos = await prisma.projeto.findMany({
      where: {
        OR: [{ status: 'AGUARDANDO_AGENDAMENTO' }, ...(incluir ? [{ id: incluir, status: { not: 'CANCELADO' as StatusProjeto } }] : [])],
      },
      orderBy: { criadoEm: 'asc' },
      include: {
        cliente: { select: { nome: true, cidade: true, uf: true } },
        orcamento: { select: { codigo: true, valorTotal: true } },
      },
    });
    res.json(projetos);
  }),
);

rotasAgenda.post(
  '/',
  rota(async (req, res) => {
    const dados = z
      .object({
        projetoId: z.string().uuid(),
        equipeId: idEquipe,
        // obrigatório: é o tipo que decide o roteiro de fotos e o efeito da validação
        tipo: z.enum(TIPOS_SERVICO_AGENDAVEIS, { message: 'Escolha o tipo de serviço' }),
        dataInicio: z.coerce.date(),
        dataFim: z.coerce.date(),
        // quem vai; ausente = os técnicos ativos da equipe (a composição padrão)
        tecnicos: z.array(z.string().uuid()).max(20).optional(),
      })
      .refine((d) => d.dataFim >= d.dataInicio, {
        message: 'A data final não pode ser antes da inicial',
        path: ['dataFim'],
      })
      .parse(req.body);

    const projeto = await prisma.projeto.findUnique({ where: { id: dados.projetoId } });
    if (!projeto) throw new ErroHttp(404, 'Projeto não encontrado');
    if (projeto.status === 'CANCELADO') throw new ErroHttp(409, `O projeto ${projeto.codigo} foi cancelado.`);
    // Um projeto pode ter VÁRIOS serviços agendados (o gestor planeja a semana: os dois dias de
    // uma instalação entram de uma vez). O limite é outro: só um ANDA por vez, conferido quando o
    // técnico começa (conferirQuePodeComecar). O que cabe em cada situação do projeto:
    if (dados.tipo === 'VISITA_TECNICA') await conferirVisitaTecnica(projeto);
    if (dados.tipo === 'INSTALACAO' && projeto.status === 'CONCLUIDO') {
      throw new ErroHttp(409, `O projeto ${projeto.codigo} está concluído. Agende como manutenção, retrabalho ou vistoria, ou reabra o projeto na ficha dele para agendar mais um dia de instalação.`);
    }
    const equipe = await prisma.equipe.findFirst({ where: { id: dados.equipeId, ativa: true } });
    if (!equipe) throw new ErroHttp(404, 'Equipe não encontrada');

    const { tecnicos: escolhidos, ...campos } = dados;
    const escala = escolhidos ? await tecnicosEscolhidos(escolhidos) : await tecnicosDaEquipe(dados.equipeId);
    // conflito não bloqueia (regra 8): volta como aviso junto com o serviço criado
    const avisos = await avisosDeConflito({ equipeId: dados.equipeId, tecnicos: escala.map((t) => t.id), inicio: dados.dataInicio, fim: dados.dataFim });

    const agendamento = await prisma.$transaction(async (tx) => {
      const criado = await tx.agendamento.create({
        data: { ...campos, escala: { create: escala.map((t) => ({ usuarioId: t.id })) } },
      });
      await passoDoServico(tx, {
        servico: { id: criado.id, projetoId: dados.projetoId, tipo: dados.tipo },
        evento: 'SERVICO_AGENDADO',
        descricao: `${rotuloDoServico(dados.tipo)} agendad${oa(dados.tipo)} para ${periodoDoServico(dados.dataInicio, dados.dataFim)} com a ${equipe.nome}: ${nomesDe(escala)}`,
        usuarioId: req.usuario!.id,
      });
      return criado;
    });

    operacaoMudou();
    res.status(201).json({ ...agendamento, avisos });
  }),
);

rotasAgenda.patch(
  '/:id',
  rota(async (req, res) => {
    const dados = z
      .object({
        equipeId: idEquipe.optional(),
        dataInicio: z.coerce.date().optional(),
        dataFim: z.coerce.date().optional(),
        // troca a escala (quem vai); só com o serviço em aberto
        tecnicos: z.array(z.string().uuid()).max(20).optional(),
        // troca o tipo; só antes de o técnico começar (o tipo define o roteiro de fotos)
        tipo: z.enum(TIPOS_SERVICO_AGENDAVEIS).optional(),
        status: z.enum(['AGENDADO', 'EM_EXECUCAO', 'CANCELADO']).optional(),
      })
      .parse(req.body);

    const atual = await prisma.agendamento.findUnique({ where: { id: req.params.id }, include: ESCALA });
    if (!atual) throw new ErroHttp(404, 'Serviço não encontrado');
    if (atual.status === 'CANCELADO') throw new ErroHttp(409, 'Este serviço já foi cancelado.');

    // Trocar o tipo: só com o serviço ainda "Agendado". O tipo decide se o serviço move a
    // situação do projeto, então a troca pode levar o projeto junto (na transação).
    const tipoNovo = dados.tipo && dados.tipo !== atual.tipo ? dados.tipo : null;
    if (tipoNovo) {
      if (atual.status !== 'AGENDADO') throw new ErroHttp(409, 'O tipo do serviço só pode mudar antes de o técnico começar. Cancele este serviço e agende outro.');
      const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: atual.projetoId }, select: { id: true, status: true, codigo: true } });
      if (tipoNovo === 'VISITA_TECNICA') await conferirVisitaTecnica(projeto, atual.id);
      if (tipoNovo === 'INSTALACAO' && projeto.status === 'CONCLUIDO') {
        throw new ErroHttp(409, `O projeto ${projeto.codigo} está concluído. Use manutenção, retrabalho ou vistoria, ou reabra o projeto na ficha dele.`);
      }
    }
    // marcar como "em execução" pelo escritório é começar o serviço: vale o limite de um por vez
    if (dados.status === 'EM_EXECUCAO' && atual.status === 'AGENDADO') await conferirQuePodeComecar(atual);

    // remarcar: confere a equipe e o período novos, sem contar o próprio serviço
    const equipeId = dados.equipeId ?? atual.equipeId;
    const inicio = dados.dataInicio ?? atual.dataInicio;
    const fim = dados.dataFim ?? atual.dataFim;
    if (fim < inicio) throw new ErroHttp(400, 'A data final não pode ser antes da inicial');
    // Escala nova: a que o gestor escolheu; ou, mudando de equipe sem dizer quem vai, a
    // composição padrão da equipe nova. Senão a escala fica como está.
    const { tecnicos: escolhidos, ...campos } = dados;
    const escalaAntes = atual.escala.map((e) => e.usuario);
    let escala: Tecnico[] | null = null;
    if (dados.status !== 'CANCELADO') {
      if (escolhidos) escala = await tecnicosEscolhidos(escolhidos);
      // (serviço já enviado ou concluído muda de linha na agenda, mas a escala fica: é o registro de quem foi)
      else if (dados.equipeId && dados.equipeId !== atual.equipeId && EM_ABERTO.includes(atual.status)) escala = await tecnicosDaEquipe(dados.equipeId);
    }
    const saiu = escala ? escalaAntes.filter((a) => !escala!.some((t) => t.id === a.id)) : [];
    const entrou = escala ? escala.filter((t) => !escalaAntes.some((a) => a.id === t.id)) : [];
    if ((saiu.length || entrou.length) && !EM_ABERTO.includes(atual.status)) {
      throw new ErroHttp(409, 'A escala só pode mudar com o serviço em aberto (agendado, em execução ou devolvido).');
    }
    // conflito não bloqueia (regra 8): volta como aviso
    const avisos =
      dados.status === 'CANCELADO'
        ? []
        : await avisosDeConflito({ equipeId, tecnicos: (escala ?? escalaAntes).map((t) => t.id), inicio, fim, ignorarId: atual.id });

    const atualizado = await prisma.$transaction(async (tx) => {
      if (saiu.length) await tx.escalaServico.deleteMany({ where: { agendamentoId: atual.id, usuarioId: { in: saiu.map((t) => t.id) } } });
      if (entrou.length) await tx.escalaServico.createMany({ data: entrou.map((t) => ({ agendamentoId: atual.id, usuarioId: t.id })) });
      const ag = await tx.agendamento.update({ where: { id: atual.id }, data: campos, include: { equipe: { select: { nome: true } }, ...ESCALA } });
      // histórico do projeto: o que mudou, com os valores de antes
      const servico = rotuloDoServico(atual.tipo);
      const evento = (tipo: 'SERVICO_REMARCADO' | 'SERVICO_INICIADO' | 'SERVICO_CANCELADO', descricao: string) =>
        registrarEvento(tx, { projetoId: atual.projetoId, agendamentoId: atual.id, tipo, descricao, usuarioId: req.usuario!.id });
      if (dados.status === 'CANCELADO') {
        // o projeto passa a seguir os serviços que sobraram; sem nenhum pendente, volta ao repouso:
        // "A agendar" ou, se já tem instalação validada, "Aguardando conclusão"
        await passoDoServico(tx, {
          servico: atual,
          evento: 'SERVICO_CANCELADO',
          descricao: `${servico} de ${periodoDoServico(atual.dataInicio, atual.dataFim)} cancelad${oa(atual.tipo)}`,
          usuarioId: req.usuario!.id,
        });
      } else {
        const antes = periodoDoServico(atual.dataInicio, atual.dataFim);
        const depois = periodoDoServico(ag.dataInicio, ag.dataFim);
        const mudancas: string[] = [];
        if (antes !== depois) mudancas.push(`de ${antes} para ${depois}`);
        if (ag.equipeId !== atual.equipeId) mudancas.push(`equipe: ${ag.equipe.nome}`);
        if (mudancas.length) await evento('SERVICO_REMARCADO', `${servico} remarcad${oa(atual.tipo)}: ${mudancas.join(' · ')}`);
        if (tipoNovo) {
          await passoDoServico(tx, {
            servico: { id: atual.id, projetoId: atual.projetoId, tipo: tipoNovo },
            tipoAnterior: atual.tipo,
            evento: 'SERVICO_REMARCADO',
            descricao: `Tipo do serviço alterado: de ${servico} para ${rotuloDoServico(tipoNovo)}`,
            usuarioId: req.usuario!.id,
          });
        }
        // quem foi escalado fica no histórico: é o que responde depois "quem fez esta obra"
        if (saiu.length || entrou.length) {
          const partes = [saiu.length ? `saiu ${nomesDe(saiu)}` : '', entrou.length ? `entrou ${nomesDe(entrou)}` : ''].filter(Boolean);
          await evento('SERVICO_REMARCADO', `Escala alterada: ${partes.join(', ')}. Vão: ${nomesDe(ag.escala.map((e) => e.usuario))}`);
        }
        if (dados.status === 'EM_EXECUCAO' && atual.status !== 'EM_EXECUCAO') {
          await passoDoServico(tx, { servico: ag, evento: 'SERVICO_INICIADO', descricao: `${rotuloDoServico(ag.tipo)} marcad${oa(ag.tipo)} como em execução`, usuarioId: req.usuario!.id });
        }
      }
      return ag;
    });
    operacaoMudou();
    res.json({ ...atualizado, avisos });
  }),
);

// ===========================================================================
// VALIDAÇÃO — escritório (gestor confere as fotos)
// ===========================================================================
export const rotasValidacao = Router();
rotasValidacao.use(autenticar, autorizar('GESTOR'));

/** Aprovar e devolver só valem para serviço aguardando validação ou já devolvido. */
async function servicoEmValidacao(id: string) {
  const servico = await prisma.agendamento.findUnique({ where: { id }, include: { fotos: true } });
  if (!servico) throw new ErroHttp(404, 'Serviço não encontrado');
  if (servico.status !== 'AGUARDANDO_VALIDACAO' && servico.status !== 'DEVOLVIDO') {
    const motivo: Record<string, string> = {
      AGENDADO: 'ainda não foi feito',
      EM_EXECUCAO: 'ainda está em execução: o técnico não enviou para validação',
      APROVADO: 'já foi aprovado',
      CANCELADO: 'foi cancelado',
    };
    throw new ErroHttp(409, `Este serviço ${motivo[servico.status] ?? 'não está em validação'}.`);
  }
  return servico;
}

/**
 * Fila do gestor: aguardando validação primeiro (mais antigos antes) e, depois, os devolvidos,
 * que esperam o técnico. `reenviado`: já tinha sido devolvido e voltou com fotos novas.
 */
rotasValidacao.get(
  '/fila',
  rota(async (_req, res) => {
    const fila = await prisma.agendamento.findMany({
      where: { status: { in: ['AGUARDANDO_VALIDACAO', 'DEVOLVIDO'] } },
      orderBy: [{ status: 'asc' }, { enviadoEm: 'asc' }],
      include: {
        projeto: { include: { cliente: { select: { nome: true, cidade: true, uf: true } } } },
        _count: { select: { fotos: true } },
      },
    });
    res.json(
      fila.map((s) => ({ ...s, reenviado: s.status === 'AGUARDANDO_VALIDACAO' && s.validadoEm !== null })),
    );
  }),
);

// Versão da operação (sem banco): o escritório pergunta a cada 20 s e só baixa a fila quando muda
rotasValidacao.get('/versao', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ versao: versaoDaOperacao() });
});

rotasValidacao.get(
  '/:id',
  rota(async (req, res) => {
    const servico = await prisma.agendamento.findUnique({
      where: { id: req.params.id },
      include: {
        projeto: { include: { cliente: true, orcamento: { select: { codigo: true, id: true } } } },
        equipe: { select: { nome: true } },
        ...ESCALA,
        enviadoPor: { select: { nome: true, telefone: true } },
        fotos: { orderBy: { criadoEm: 'asc' }, include: { enviadaPor: { select: { nome: true } } } },
        materiais: { include: { produto: { select: { nome: true, unidade: true } } } },
      },
    });
    if (!servico) throw new ErroHttp(404, 'Serviço não encontrado');

    // fotos na ordem do checklist do tipo de serviço; extras (sem item) no fim
    const checklist = await prisma.checklistFoto.findMany({ where: { tipoServico: servico.tipo } });
    const ordem = new Map(checklist.map((c) => [c.chave, c.ordem]));
    const fotos = [...servico.fotos].sort(
      (a, b) =>
        (a.chave ? (ordem.get(a.chave) ?? 999) : 1000) - (b.chave ? (ordem.get(b.chave) ?? 999) : 1000) ||
        a.criadoEm.getTime() - b.criadoEm.getTime(),
    );
    res.json({ ...servico, fotos });
  }),
);

/**
 * Valida o serviço (nunca conclui o projeto): todas as fotos passam a OK.
 * Foto marcada para REFAZER bloqueia, a não ser que o gestor confirme que a aceita
 * (`confirmarFotosMarcadas`: ex. o técnico não conseguiu voltar ao cliente para refazer).
 */
rotasValidacao.post(
  '/:id/aprovar',
  rota(async (req, res) => {
    const { confirmarFotosMarcadas } = z
      .object({ confirmarFotosMarcadas: z.boolean().optional() })
      .parse(req.body ?? {});
    const servico = await servicoEmValidacao(req.params.id);
    const marcadas = servico.fotos.filter((f) => f.revisao === 'REFAZER').length;
    if (marcadas > 0 && !confirmarFotosMarcadas) {
      throw new ErroHttp(
        409,
        marcadas === 1
          ? 'Há 1 foto marcada para refazer. Devolva o serviço ao técnico ou confirme que aceita a foto.'
          : `Há ${marcadas} fotos marcadas para refazer. Devolva o serviço ao técnico ou confirme que aceita as fotos.`,
      );
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const ag = await tx.agendamento.update({
        where: { id: servico.id },
        data: {
          status: 'APROVADO',
          validadoPorId: req.usuario!.id,
          validadoEm: new Date(),
          motivoDevolucao: null,
        },
      });
      await tx.fotoServico.updateMany({
        where: { agendamentoId: servico.id, revisao: { not: 'OK' } },
        data: { revisao: 'OK' },
      });
      // O TIPO decide o efeito da validação (compartilhado/roteiroDoServico.ts). Nenhum tipo
      // conclui o projeto: quem conclui é o gestor, na ficha (POST /api/projetos/:id/concluir).
      const aceitas = marcadas > 0 ? ` (${marcadas} ${marcadas === 1 ? 'foto marcada para refazer foi aceita' : 'fotos marcadas para refazer foram aceitas'})` : '';
      const validada = `${rotuloDoServico(servico.tipo)} validad${oa(servico.tipo)}${aceitas}`;
      // O projeto só vai para "Aguardando conclusão" quando a instalação foi validada e não sobra
      // outro serviço pendente; sobrando, segue a situação deles até o último (situacaoPelosServicos).
      const efeito = ROTEIRO_DO_SERVICO[servico.tipo].aoValidar;
      await passoDoServico(tx, {
        servico,
        evento: 'SERVICO_APROVADO',
        // vistoria, manutenção e retrabalho: a situação do projeto fica como está
        descricao: (projeto) => {
          if (efeito === 'A_AGENDAR') return `${validada}: visita concluída${projeto === 'AGUARDANDO_AGENDAMENTO' ? ', falta agendar a instalação' : ''}`;
          if (efeito === 'AGUARDANDO_CONCLUSAO') {
            return `${validada}: ${projeto === 'AGUARDANDO_CONCLUSAO' ? 'aguardando o gestor concluir o projeto' : 'ainda há outro serviço deste projeto para fazer'}`;
          }
          return validada;
        },
        usuarioId: req.usuario!.id,
        dados: efeito === 'A_AGENDAR' ? { visitaTecnicaConcluidaEm: new Date() } : undefined,
      });
      return ag;
    });

    operacaoMudou();
    res.json(atualizado);
  }),
);

/**
 * Devolve ao técnico, marcando quais fotos precisam ser refeitas. Pode ser repetido com o
 * serviço já devolvido (ex.: o gestor mudou de ideia): as fotos que saírem da lista voltam a
 * pendentes. O projeto volta a "em execução" — está de novo com o técnico.
 */
rotasValidacao.post(
  '/:id/devolver',
  rota(async (req, res) => {
    const { motivo, fotosParaRefazer } = z
      .object({
        motivo: z.string().trim().min(5, 'Explique ao técnico o que precisa ser refeito'),
        fotosParaRefazer: z.array(z.string().uuid()).min(1, 'Marque ao menos uma foto para refazer'),
      })
      .parse(req.body);
    const servico = await servicoEmValidacao(req.params.id);
    const doServico = new Set(servico.fotos.map((f) => f.id));
    if (!fotosParaRefazer.every((id) => doServico.has(id))) {
      throw new ErroHttp(400, 'Há fotos marcadas que não são deste serviço. Recarregue a tela.');
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      await tx.fotoServico.updateMany({
        where: { agendamentoId: servico.id, revisao: 'REFAZER', id: { notIn: fotosParaRefazer } },
        data: { revisao: 'PENDENTE', comentario: null },
      });
      await tx.fotoServico.updateMany({
        where: { id: { in: fotosParaRefazer }, agendamentoId: servico.id },
        data: { revisao: 'REFAZER', comentario: motivo },
      });
      const devolvido = await tx.agendamento.update({
        where: { id: servico.id },
        data: {
          status: 'DEVOLVIDO',
          motivoDevolucao: motivo,
          validadoPorId: req.usuario!.id,
          validadoEm: new Date(),
        },
      });
      await passoDoServico(tx, {
        servico,
        evento: 'SERVICO_DEVOLVIDO',
        descricao: `${rotuloDoServico(servico.tipo)} devolvid${oa(servico.tipo)} ao técnico (${fotosParaRefazer.length} ${fotosParaRefazer.length === 1 ? 'foto' : 'fotos'} para refazer): ${motivo}`,
        usuarioId: req.usuario!.id,
      });
      return devolvido;
    });

    // TODO: disparar aviso ao técnico (push do PWA ou WhatsApp)
    operacaoMudou();
    res.json(atualizado);
  }),
);

// ===========================================================================
// APP DE CAMPO — PWA no celular (único acesso do técnico)
// ===========================================================================
// GESTOR e ADMIN também entram (para ver o que o técnico vê). O que cada um enxerga é sempre
// "os serviços em que está escalado" (filtroDoTecnico, regra 6), de QUALQUER tipo e sem olhar a
// situação do projeto: quem não está escalado em nada vê a agenda vazia.
export const rotasTecnico = Router();
rotasTecnico.use(autenticar, autorizar('TECNICO', 'GESTOR'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_FOTO },
  fileFilter: (_req, arquivo, cb) => {
    if (TIPOS_DE_FOTO_ACEITOS.includes(arquivo.mimetype)) return cb(null, true);
    cb(new ErroHttp(400, 'Formato de arquivo não aceito. Envie a foto em JPG, PNG ou WEBP.'));
  },
});

/** Garante que o técnico só acesse os serviços em que está escalado (regra em lib/acesso.ts). */
async function servicoDoTecnico(id: string, usuarioId: string) {
  const servico = await prisma.agendamento.findFirst({
    where: { id, ...filtroDoTecnico({ id: usuarioId }) },
    include: {
      projeto: { include: { cliente: true } },
      equipe: { select: { nome: true } },
      ...ESCALA,
      fotos: { orderBy: { criadoEm: 'asc' } },
    },
  });
  if (!servico) throw new ErroHttp(404, 'Serviço não encontrado na sua agenda');
  return servico;
}

/**
 * Fotos e envio para validação só valem com o serviço em aberto. Sem esta conferência, um
 * serviço cancelado ou já concluído voltaria para a validação (e o projeto junto).
 */
function conferirServicoAberto(status: StatusAgendamento) {
  if (status === 'AGUARDANDO_VALIDACAO') {
    throw new ErroHttp(409, 'Este serviço já foi enviado para validação. Aguarde a resposta do gestor.');
  }
  if (status === 'APROVADO') throw new ErroHttp(409, 'Este serviço já foi concluído.');
  if (status === 'CANCELADO') throw new ErroHttp(409, 'Este serviço foi cancelado pelo escritório.');
}

rotasTecnico.get(
  '/agenda',
  rota(async (req, res) => {
    // As datas do agendamento são só dia (DATE, meia-noite UTC). Comparar com o instante
    // atual escondia o serviço de hoje; por isso o período é contado em dias, no fuso da empresa.
    const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD');
    const consulta = z.object({ de: dia.optional(), ate: dia.optional() }).parse(req.query);
    const de = new Date(`${consulta.de ?? diaDeHoje()}T00:00:00Z`);
    const ate = consulta.ate ? new Date(`${consulta.ate}T00:00:00Z`) : new Date(de.getTime() + 7 * 864e5);

    const servicos = await prisma.agendamento.findMany({
      where: {
        AND: [
          filtroDoTecnico(req.usuario!),
          {
            OR: [
              { dataInicio: { lte: ate }, dataFim: { gte: de }, status: { notIn: ['CANCELADO', 'APROVADO'] } },
              // Em aberto de dias anteriores (não terminado ou devolvido pelo gestor): continua na
              // agenda até ser enviado para validação, senão sumiria na virada do dia.
              { dataFim: { lt: de }, status: { in: ['AGENDADO', 'EM_EXECUCAO', 'DEVOLVIDO'] } },
            ],
          },
        ],
      },
      orderBy: { dataInicio: 'asc' },
      include: {
        // com quem ele vai: a equipe (linha da agenda) e os colegas escalados
        equipe: { select: { nome: true } },
        ...ESCALA,
        projeto: {
          include: {
            cliente: {
              select: {
                nome: true, whatsapp: true, logradouro: true, numero: true,
                bairro: true, cidade: true, uf: true, cep: true,
              },
            },
          },
        },
      },
    });

    res.json(servicos);
  }),
);

/** Detalhe do serviço com o checklist de fotos e o que já foi enviado. */
rotasTecnico.get(
  '/servicos/:id',
  rota(async (req, res) => {
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id);
    const checklist = await prisma.checklistFoto.findMany({
      where: { tipoServico: servico.tipo, ativo: true },
      orderBy: { ordem: 'asc' },
    });

    // ainda não começou e outro serviço do mesmo projeto está andando: o app avisa antes da foto
    const outro = servico.status === 'AGENDADO' ? await outroServicoAndando(prisma, servico) : null;

    res.json({
      ...servico,
      aguardandoOutro: outro ? avisoDeOutroAndando(outro) : null,
      // produção sem lugar seguro para as fotos: o app avisa antes de o técnico fotografar
      fotosBloqueadas: appTecnicoLiberado() ? null : AVISO_FOTOS_BLOQUEADAS,
      checklist: checklist.map((item) => {
        const foto = servico.fotos.find((f) => f.chave === item.chave && f.revisao !== 'REFAZER');
        return { ...item, enviada: Boolean(foto), foto: foto ?? null };
      }),
    });
  }),
);

/** Upload de uma foto do checklist (ou extra, quando não vier a chave). */
rotasTecnico.post(
  '/servicos/:id/fotos',
  upload.single('arquivo'),
  rota(async (req, res) => {
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id);
    // Sem lugar seguro para guardar (produção com STORAGE_PROVIDER=disco), a API não recebe a
    // foto: 503, para a fila do celular guardar e reenviar sozinha quando for configurado.
    if (!appTecnicoLiberado()) throw new ErroHttp(503, AVISO_FOTOS_BLOQUEADAS);
    if (!req.file) throw new ErroHttp(400, 'Envie o arquivo da foto');

    const { chave, latitude, longitude, capturadaEm, idLocal } = z
      .object({
        chave: z.string().optional(),
        // id gerado no celular: o reenvio da fila (resposta perdida no caminho) não duplica
        idLocal: z.string().uuid().optional(),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
        capturadaEm: z.coerce.date().optional(),
      })
      .parse(req.body);

    // Reenvio de uma foto que já chegou (a resposta se perdeu no caminho): devolve a mesma,
    // antes de qualquer outra regra — inclusive se o serviço já foi enviado depois disso.
    const fotoJaRecebida = async () => {
      if (!idLocal) return null;
      const foto = await prisma.fotoServico.findUnique({ where: { idLocal } });
      if (foto && foto.agendamentoId !== servico.id) {
        throw new ErroHttp(409, 'Esta foto já foi enviada para outro serviço');
      }
      return foto;
    };
    const jaRecebida = await fotoJaRecebida();
    if (jaRecebida) return res.status(200).json(jaRecebida);

    conferirServicoAberto(servico.status);
    // a primeira foto COMEÇA o serviço: só um do projeto anda por vez
    if (servico.status === 'AGENDADO') await conferirQuePodeComecar(servico);

    let rotulo = 'Foto extra';
    let item: { ordem: number; rotulo: string } | null = null;
    if (chave) {
      const doChecklist = await prisma.checklistFoto.findFirst({ where: { tipoServico: servico.tipo, chave } });
      if (!doChecklist) throw new ErroHttp(400, 'Este item não faz parte do checklist deste serviço.');
      rotulo = doChecklist.rotulo;
      item = { ordem: doChecklist.ordem, rotulo: doChecklist.rotulo };
    }
    const quando = capturadaEm ?? new Date();

    // Grava no armazenamento (disco ou SharePoint). Se o SharePoint não responder, 503: a foto
    // continua na fila do celular, que reenvia sozinha. Nada fica guardado no servidor.
    let arquivo;
    try {
      arquivo = await salvarFoto(req.file.buffer, {
        cliente: { nome: servico.projeto.cliente.nome, cidade: servico.projeto.cliente.cidade },
        projetoCodigo: servico.projeto.codigo,
        servico: { id: servico.id, dataInicio: servico.dataInicio, tipo: servico.tipo },
        item,
        capturadaEm: quando,
        extensao: path.extname(req.file.originalname) || '.jpg',
      });
    } catch (erro) {
      // Sem espaço (Supabase Storage, provisório): recusa com 4xx, que a fila do celular mostra na
      // tela em vez de tentar de novo sozinha. A foto continua guardada no aparelho.
      if (erro instanceof ArmazenamentoCheio) {
        console.error(`[armazenamento] SEM ESPAÇO para fotos (serviço ${servico.id}): ${erro.message}`);
        throw new ErroHttp(409, 'O espaço das fotos do sistema está cheio. Avise o escritório. A foto continua guardada no celular: toque em "Enviar de novo" depois que liberarem espaço.');
      }
      if (!(erro instanceof ArmazenamentoIndisponivel)) throw erro;
      console.error(`[armazenamento] foto não gravada (serviço ${servico.id}): ${erro.message}`);
      throw new ErroHttp(503, 'Não foi possível guardar a foto agora. Ela continua no celular e será enviada de novo sozinha.');
    }

    // refazendo uma foto do checklist: as anteriores deste item saem do banco e o arquivo vai
    // para "Substituídas" (depois de gravar a nova, fora da transação)
    const anteriores = chave
      ? await prisma.fotoServico.findMany({ where: { agendamentoId: servico.id, chave }, select: { arquivoChave: true } })
      : [];

    const gravarFoto = () =>
      prisma.$transaction(async (tx) => {
        // refazendo uma foto: a antiga sai do checklist
        if (chave) {
          await tx.fotoServico.deleteMany({ where: { agendamentoId: servico.id, chave } });
        }
        if (servico.status === 'AGENDADO') {
          await tx.agendamento.update({ where: { id: servico.id }, data: { status: 'EM_EXECUCAO' } });
          await passoDoServico(tx, {
            servico,
            evento: 'SERVICO_INICIADO',
            descricao: `${rotuloDoServico(servico.tipo)} em execução: primeira foto enviada`,
            usuarioId: req.usuario!.id,
          });
        }
        return tx.fotoServico.create({
          data: {
            agendamentoId: servico.id,
            chave,
            rotulo,
            arquivoChave: arquivo.chave,
            arquivoNome: arquivo.nome,
            tamanhoBytes: arquivo.tamanhoBytes,
            latitude,
            longitude,
            capturadaEm: quando,
            enviadaPorId: req.usuario!.id,
            idLocal,
          },
        });
      });

    let foto;
    try {
      foto = await gravarFoto();
    } catch (erro) {
      // Dois envios da mesma foto ao mesmo tempo (a fila reenviou antes da primeira resposta):
      // os dois passaram pela conferência acima e o segundo bate na chave única do idLocal.
      const repetida = idLocal && erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
      const existente = repetida ? await fotoJaRecebida() : null;
      if (!existente) throw erro;
      return res.status(200).json(existente);
    }

    // Mesma chave = mesmo arquivo (reenvio simultâneo gravou por cima, no SharePoint): não move.
    for (const antiga of anteriores.filter((a) => a.arquivoChave !== arquivo.chave)) {
      guardarComoSubstituida(antiga.arquivoChave).catch((erro) =>
        console.error(`[armazenamento] não foi possível mover ${antiga.arquivoChave} para Substituídas: ${(erro as Error).message}`),
      );
    }

    // primeira foto: o serviço passou a "Em execução" (agenda e projetos mostram a situação)
    if (servico.status === 'AGENDADO') operacaoMudou();
    res.status(201).json(foto);
  }),
);

/** Materiais realmente usados (base do comparativo orçado × realizado). */
rotasTecnico.post(
  '/servicos/:id/materiais',
  rota(async (req, res) => {
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id);
    const { materiais } = z
      .object({
        materiais: z
          .array(
            z.object({
              produtoId: z.string().uuid(),
              quantidade: z.number().positive(),
              observacao: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    await prisma.$transaction([
      prisma.materialUtilizado.deleteMany({ where: { agendamentoId: servico.id } }),
      prisma.materialUtilizado.createMany({
        data: materiais.map((m) => ({ ...m, agendamentoId: servico.id })),
      }),
    ]);

    res.status(201).json({ ok: true });
  }),
);

/** Botão "Enviar para validação": só passa com o checklist completo. */
rotasTecnico.post(
  '/servicos/:id/concluir',
  rota(async (req, res) => {
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id);
    conferirServicoAberto(servico.status);
    if (servico.status === 'AGENDADO') await conferirQuePodeComecar(servico);
    const { observacoesTecnico, sistemaTestado } = z
      .object({ observacoesTecnico: z.string().max(4000, 'Use até 4.000 caracteres').optional(), sistemaTestado: z.boolean().default(false) })
      .parse(req.body);

    // o que o roteiro deste tipo exige (compartilhado/roteiroDoServico.ts)
    const roteiro = ROTEIRO_DO_SERVICO[servico.tipo];
    if (roteiro.exigeTesteDoSistema && !sistemaTestado) throw new ErroHttp(400, 'Confirme o teste do sistema antes de enviar');
    if (roteiro.observacoes.obrigatorias && (observacoesTecnico ?? '').trim().length < 10) {
      throw new ErroHttp(400, `Preencha o campo "${roteiro.observacoes.rotulo}" antes de enviar (${roteiro.observacoes.dica.charAt(0).toLowerCase()}${roteiro.observacoes.dica.slice(1)})`);
    }

    const obrigatorias = await prisma.checklistFoto.findMany({
      where: { tipoServico: servico.tipo, obrigatoria: true, ativo: true },
      orderBy: { ordem: 'asc' },
    });
    const enviadas = new Set(
      servico.fotos.filter((f) => f.revisao !== 'REFAZER').map((f) => f.chave),
    );
    const faltando = obrigatorias.filter((o) => !enviadas.has(o.chave));
    if (faltando.length) {
      throw new ErroHttp(
        400,
        `Faltam ${faltando.length} fotos obrigatórias: ${faltando.map((f) => f.rotulo).join(', ')}`,
      );
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const ag = await tx.agendamento.update({
        where: { id: servico.id },
        data: {
          status: 'AGUARDANDO_VALIDACAO',
          observacoesTecnico,
          sistemaTestado,
          enviadoEm: new Date(),
          enviadoPorId: req.usuario!.id,
          motivoDevolucao: null,
        },
      });
      await passoDoServico(tx, {
        servico,
        evento: 'SERVICO_ENVIADO',
        descricao: `${rotuloDoServico(servico.tipo)} ${servico.status === 'DEVOLVIDO' ? 'reenviad' : 'enviad'}${oa(servico.tipo)} para validação${roteiro.exigeTesteDoSistema ? ' com o teste do sistema confirmado' : ''}`,
        usuarioId: req.usuario!.id,
      });
      return ag;
    });

    operacaoMudou();
    res.json(atualizado);
  }),
);
