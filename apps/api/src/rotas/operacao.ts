import { Router } from 'express';
import multer from 'multer';
import { Prisma, type StatusAgendamento } from '@prisma/client';
import { z } from 'zod';
import { periodoDoServico, registrarEvento, rotuloDoServico } from '../lib/eventosProjeto';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { operacaoMudou, versaoDaOperacao } from '../lib/versaoDaOperacao';
import path from 'node:path';
import {
  ArmazenamentoCheio,
  ArmazenamentoIndisponivel,
  appTecnicoLiberado,
  AVISO_APP_TECNICO_BLOQUEADO,
  guardarComoSubstituida,
  salvarFoto,
} from '../lib/armazenamento';
import { TAMANHO_MAXIMO_FOTO } from '../lib/upload';
import { filtroDoTecnico } from '../lib/acesso';
import { diaDeHoje } from '@guarusolar/compartilhado';

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
  rota(async (_req, res) => {
    const projetos = await prisma.projeto.findMany({
      where: { status: 'AGUARDANDO_AGENDAMENTO' },
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
        tipo: z.enum(['INSTALACAO', 'VISITA_TECNICA', 'MANUTENCAO', 'VISTORIA_CONCESSIONARIA']),
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
    if (projeto.status !== 'AGUARDANDO_AGENDAMENTO') {
      throw new ErroHttp(409, `O projeto ${projeto.codigo} já está agendado. Para mudar a data, remarque o serviço.`);
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
      await tx.projeto.update({ where: { id: dados.projetoId }, data: { status: 'AGENDADO' } });
      await registrarEvento(tx, {
        projetoId: dados.projetoId,
        agendamentoId: criado.id,
        tipo: 'SERVICO_AGENDADO',
        descricao: `${rotuloDoServico(dados.tipo)} agendada para ${periodoDoServico(dados.dataInicio, dados.dataFim)} com a ${equipe.nome}: ${nomesDe(escala)}`,
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
        status: z.enum(['AGENDADO', 'EM_EXECUCAO', 'CANCELADO']).optional(),
      })
      .parse(req.body);

    const atual = await prisma.agendamento.findUnique({ where: { id: req.params.id }, include: ESCALA });
    if (!atual) throw new ErroHttp(404, 'Serviço não encontrado');
    if (atual.status === 'CANCELADO') throw new ErroHttp(409, 'Este serviço já foi cancelado.');

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
      // cancelado: o projeto volta para "A agendar" para ganhar outra data
      if (dados.status === 'CANCELADO') {
        await tx.projeto.update({ where: { id: atual.projetoId }, data: { status: 'AGUARDANDO_AGENDAMENTO' } });
      }
      // histórico do projeto: o que mudou, com os valores de antes
      const servico = rotuloDoServico(atual.tipo);
      const evento = (tipo: 'SERVICO_REMARCADO' | 'SERVICO_INICIADO' | 'SERVICO_CANCELADO', descricao: string) =>
        registrarEvento(tx, { projetoId: atual.projetoId, agendamentoId: atual.id, tipo, descricao, usuarioId: req.usuario!.id });
      if (dados.status === 'CANCELADO') {
        await evento('SERVICO_CANCELADO', `${servico} de ${periodoDoServico(atual.dataInicio, atual.dataFim)} cancelada`);
      } else {
        const antes = periodoDoServico(atual.dataInicio, atual.dataFim);
        const depois = periodoDoServico(ag.dataInicio, ag.dataFim);
        const mudancas: string[] = [];
        if (antes !== depois) mudancas.push(`de ${antes} para ${depois}`);
        if (ag.equipeId !== atual.equipeId) mudancas.push(`equipe: ${ag.equipe.nome}`);
        if (mudancas.length) await evento('SERVICO_REMARCADO', `${servico} remarcada: ${mudancas.join(' · ')}`);
        // quem foi escalado fica no histórico: é o que responde depois "quem fez esta obra"
        if (saiu.length || entrou.length) {
          const partes = [saiu.length ? `saiu ${nomesDe(saiu)}` : '', entrou.length ? `entrou ${nomesDe(entrou)}` : ''].filter(Boolean);
          await evento('SERVICO_REMARCADO', `Escala alterada: ${partes.join(', ')}. Vão: ${nomesDe(ag.escala.map((e) => e.usuario))}`);
        }
        if (dados.status === 'EM_EXECUCAO' && atual.status !== 'EM_EXECUCAO') {
          await evento('SERVICO_INICIADO', `${servico} marcada como em execução`);
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
 * Aprova o serviço e conclui o projeto: todas as fotos passam a OK.
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
      await tx.projeto.update({
        where: { id: servico.projetoId },
        data: { status: 'CONCLUIDO', concluidoEm: new Date() },
      });
      const aceitas = marcadas > 0 ? ` (${marcadas} ${marcadas === 1 ? 'foto marcada para refazer foi aceita' : 'fotos marcadas para refazer foram aceitas'})` : '';
      await registrarEvento(tx, {
        projetoId: servico.projetoId,
        agendamentoId: servico.id,
        tipo: 'SERVICO_APROVADO',
        descricao: `${rotuloDoServico(servico.tipo)} aprovada na validação${aceitas}`,
        usuarioId: req.usuario!.id,
      });
      await registrarEvento(tx, { projetoId: servico.projetoId, tipo: 'PROJETO_CONCLUIDO', descricao: 'Projeto concluído', usuarioId: req.usuario!.id });
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
      await tx.projeto.update({ where: { id: servico.projetoId }, data: { status: 'EM_EXECUCAO' } });
      await registrarEvento(tx, {
        projetoId: servico.projetoId,
        agendamentoId: servico.id,
        tipo: 'SERVICO_DEVOLVIDO',
        descricao: `${rotuloDoServico(servico.tipo)} devolvida ao técnico (${fotosParaRefazer.length} ${fotosParaRefazer.length === 1 ? 'foto' : 'fotos'} para refazer): ${motivo}`,
        usuarioId: req.usuario!.id,
      });
      return tx.agendamento.update({
        where: { id: servico.id },
        data: {
          status: 'DEVOLVIDO',
          motivoDevolucao: motivo,
          validadoPorId: req.usuario!.id,
          validadoEm: new Date(),
        },
      });
    });

    // TODO: disparar aviso ao técnico (push do PWA ou WhatsApp)
    operacaoMudou();
    res.json(atualizado);
  }),
);

// ===========================================================================
// TÉCNICO — PWA no celular (único acesso do técnico)
// ===========================================================================
export const rotasTecnico = Router();
rotasTecnico.use(autenticar, autorizar('TECNICO'), (_req, _res, next) => {
  // sem lugar seguro para as fotos em produção, o app dos técnicos fica fechado (armazenamento.ts)
  if (!appTecnicoLiberado()) throw new ErroHttp(403, AVISO_APP_TECNICO_BLOQUEADO);
  next();
});

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

    res.json({
      ...servico,
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
          await tx.projeto.update({ where: { id: servico.projetoId }, data: { status: 'EM_EXECUCAO' } });
          await registrarEvento(tx, {
            projetoId: servico.projetoId,
            agendamentoId: servico.id,
            tipo: 'SERVICO_INICIADO',
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
    const { observacoesTecnico, sistemaTestado } = z
      .object({ observacoesTecnico: z.string().optional(), sistemaTestado: z.boolean() })
      .parse(req.body);

    if (!sistemaTestado) throw new ErroHttp(400, 'Confirme o teste do sistema antes de enviar');

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
      await tx.projeto.update({
        where: { id: servico.projetoId },
        data: { status: 'AGUARDANDO_VALIDACAO' },
      });
      await registrarEvento(tx, {
        projetoId: servico.projetoId,
        agendamentoId: servico.id,
        tipo: 'SERVICO_ENVIADO',
        descricao: `${rotuloDoServico(servico.tipo)} ${servico.status === 'DEVOLVIDO' ? 'reenviada' : 'enviada'} para validação com o teste do sistema confirmado`,
        usuarioId: req.usuario!.id,
      });
      return ag;
    });

    operacaoMudou();
    res.json(atualizado);
  }),
);
