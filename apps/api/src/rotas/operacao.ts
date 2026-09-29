import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { salvarArquivo } from '../lib/armazenamento';
import { TAMANHO_MAXIMO_FOTO } from '../lib/upload';

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

/**
 * A mesma equipe não pode ter dois serviços no mesmo período (regra 8 do CLAUDE.md).
 * `ignorarId` deixa de fora o próprio agendamento ao remarcar.
 */
async function conferirConflito(equipeId: string, inicio: Date, fim: Date, ignorarId?: string) {
  const conflito = await prisma.agendamento.findFirst({
    where: {
      equipeId,
      status: { notIn: ['CANCELADO'] },
      dataInicio: { lte: fim },
      dataFim: { gte: inicio },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    include: { equipe: { select: { nome: true } }, projeto: { include: { cliente: { select: { nome: true } } } } },
  });
  if (conflito) {
    const periodo =
      conflito.dataInicio.getTime() === conflito.dataFim.getTime()
        ? `em ${diaMes(conflito.dataInicio)}`
        : `de ${diaMes(conflito.dataInicio)} a ${diaMes(conflito.dataFim)}`;
    throw new ErroHttp(
      409,
      `A ${conflito.equipe.nome} já tem serviço ${periodo} (${conflito.projeto.cliente.nome}). Escolha outro dia ou outra equipe.`,
    );
  }
}

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
            tecnicoResponsavel: { select: { id: true, nome: true } },
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
        tecnicoResponsavelId: z.string().uuid().optional(),
        observacoes: z.string().optional(),
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

    await conferirConflito(dados.equipeId, dados.dataInicio, dados.dataFim);

    const agendamento = await prisma.$transaction(async (tx) => {
      const criado = await tx.agendamento.create({ data: dados });
      await tx.projeto.update({ where: { id: dados.projetoId }, data: { status: 'AGENDADO' } });
      return criado;
    });

    res.status(201).json(agendamento);
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
        tecnicoResponsavelId: z.string().uuid().nullable().optional(),
        status: z.enum(['AGENDADO', 'EM_EXECUCAO', 'CANCELADO']).optional(),
      })
      .parse(req.body);

    const atual = await prisma.agendamento.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Serviço não encontrado');
    if (atual.status === 'CANCELADO') throw new ErroHttp(409, 'Este serviço já foi cancelado.');

    // remarcar: confere a equipe e o período novos, sem contar o próprio serviço
    const equipeId = dados.equipeId ?? atual.equipeId;
    const inicio = dados.dataInicio ?? atual.dataInicio;
    const fim = dados.dataFim ?? atual.dataFim;
    if (fim < inicio) throw new ErroHttp(400, 'A data final não pode ser antes da inicial');
    if (dados.status !== 'CANCELADO' && (dados.equipeId || dados.dataInicio || dados.dataFim)) {
      await conferirConflito(equipeId, inicio, fim, atual.id);
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const ag = await tx.agendamento.update({ where: { id: atual.id }, data: dados });
      // cancelado: o projeto volta para "A agendar" para ganhar outra data
      if (dados.status === 'CANCELADO') {
        await tx.projeto.update({ where: { id: atual.projetoId }, data: { status: 'AGUARDANDO_AGENDAMENTO' } });
      }
      return ag;
    });
    res.json(atualizado);
  }),
);

// ===========================================================================
// VALIDAÇÃO — escritório (gestor confere as fotos)
// ===========================================================================
export const rotasValidacao = Router();
rotasValidacao.use(autenticar, autorizar('GESTOR'));

rotasValidacao.get(
  '/fila',
  rota(async (_req, res) => {
    const fila = await prisma.agendamento.findMany({
      where: { status: { in: ['AGUARDANDO_VALIDACAO', 'DEVOLVIDO'] } },
      orderBy: { enviadoEm: 'asc' },
      include: {
        projeto: { include: { cliente: { select: { nome: true, cidade: true, uf: true } } } },
        tecnicoResponsavel: { select: { nome: true } },
        _count: { select: { fotos: true } },
      },
    });
    res.json(fila);
  }),
);

rotasValidacao.get(
  '/:id',
  rota(async (req, res) => {
    const servico = await prisma.agendamento.findUnique({
      where: { id: req.params.id },
      include: {
        projeto: { include: { cliente: true, orcamento: { select: { codigo: true, id: true } } } },
        tecnicoResponsavel: { select: { nome: true, telefone: true } },
        fotos: { orderBy: { criadoEm: 'asc' }, include: { enviadaPor: { select: { nome: true } } } },
        materiais: { include: { produto: { select: { nome: true, unidade: true } } } },
      },
    });
    if (!servico) throw new ErroHttp(404, 'Serviço não encontrado');
    res.json(servico);
  }),
);

/** Aprova o serviço. Só passa se nenhuma foto estiver marcada como REFAZER. */
rotasValidacao.post(
  '/:id/aprovar',
  rota(async (req, res) => {
    const servico = await prisma.agendamento.findUnique({
      where: { id: req.params.id },
      include: { fotos: true },
    });
    if (!servico) throw new ErroHttp(404, 'Serviço não encontrado');
    if (servico.fotos.some((f) => f.revisao === 'REFAZER')) {
      throw new ErroHttp(409, 'Há fotos marcadas para refazer. Devolva o serviço ao técnico.');
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
        where: { agendamentoId: servico.id, revisao: 'PENDENTE' },
        data: { revisao: 'OK' },
      });
      await tx.projeto.update({
        where: { id: servico.projetoId },
        data: { status: 'CONCLUIDO', concluidoEm: new Date() },
      });
      return ag;
    });

    res.json(atualizado);
  }),
);

/** Devolve ao técnico, marcando quais fotos precisam ser refeitas. */
rotasValidacao.post(
  '/:id/devolver',
  rota(async (req, res) => {
    const { motivo, fotosParaRefazer } = z
      .object({
        motivo: z.string().min(5, 'Explique ao técnico o que precisa ser refeito'),
        fotosParaRefazer: z.array(z.string().uuid()).min(1),
      })
      .parse(req.body);

    const atualizado = await prisma.$transaction(async (tx) => {
      await tx.fotoServico.updateMany({
        where: { id: { in: fotosParaRefazer }, agendamentoId: req.params.id },
        data: { revisao: 'REFAZER', comentario: motivo },
      });
      return tx.agendamento.update({
        where: { id: req.params.id },
        data: {
          status: 'DEVOLVIDO',
          motivoDevolucao: motivo,
          validadoPorId: req.usuario!.id,
          validadoEm: new Date(),
        },
      });
    });

    // TODO: disparar aviso ao técnico (push do PWA ou WhatsApp)
    res.json(atualizado);
  }),
);

// ===========================================================================
// TÉCNICO — PWA no celular (único acesso do técnico)
// ===========================================================================
export const rotasTecnico = Router();
rotasTecnico.use(autenticar, autorizar('TECNICO'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_FOTO },
  fileFilter: (_req, arquivo, cb) => {
    if (TIPOS_DE_FOTO_ACEITOS.includes(arquivo.mimetype)) return cb(null, true);
    cb(new ErroHttp(400, 'Formato de arquivo não aceito. Envie a foto em JPG, PNG ou WEBP.'));
  },
});

/** Garante que o técnico só acesse os serviços da própria equipe. */
async function servicoDoTecnico(id: string, usuarioId: string, equipeId: string | null) {
  const servico = await prisma.agendamento.findFirst({
    where: {
      id,
      OR: [{ tecnicoResponsavelId: usuarioId }, ...(equipeId ? [{ equipeId }] : [])],
    },
    include: {
      projeto: { include: { cliente: true } },
      fotos: { orderBy: { criadoEm: 'asc' } },
    },
  });
  if (!servico) throw new ErroHttp(404, 'Serviço não encontrado na sua agenda');
  return servico;
}

rotasTecnico.get(
  '/agenda',
  rota(async (req, res) => {
    const de = req.query.de ? new Date(String(req.query.de)) : new Date();
    const ate = req.query.ate ? new Date(String(req.query.ate)) : new Date(Date.now() + 7 * 864e5);

    const servicos = await prisma.agendamento.findMany({
      where: {
        OR: [
          { tecnicoResponsavelId: req.usuario!.id },
          ...(req.usuario!.equipeId ? [{ equipeId: req.usuario!.equipeId }] : []),
        ],
        dataInicio: { lte: ate },
        dataFim: { gte: de },
        status: { notIn: ['CANCELADO', 'APROVADO'] },
      },
      orderBy: { dataInicio: 'asc' },
      include: {
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
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id, req.usuario!.equipeId);
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
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id, req.usuario!.equipeId);
    if (!req.file) throw new ErroHttp(400, 'Envie o arquivo da foto');

    const { chave, latitude, longitude, capturadaEm } = z
      .object({
        chave: z.string().optional(),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
        capturadaEm: z.coerce.date().optional(),
      })
      .parse(req.body);

    const rotulo = chave
      ? (await prisma.checklistFoto.findFirst({ where: { tipoServico: servico.tipo, chave } }))?.rotulo
      : 'Foto extra';

    const arquivo = await salvarArquivo(
      req.file.buffer,
      req.file.originalname,
      `${servico.projeto.codigo}/${servico.id}`,
    );

    const foto = await prisma.$transaction(async (tx) => {
      // refazendo uma foto: a antiga sai do checklist
      if (chave) {
        await tx.fotoServico.deleteMany({ where: { agendamentoId: servico.id, chave } });
      }
      if (servico.status === 'AGENDADO') {
        await tx.agendamento.update({ where: { id: servico.id }, data: { status: 'EM_EXECUCAO' } });
        await tx.projeto.update({ where: { id: servico.projetoId }, data: { status: 'EM_EXECUCAO' } });
      }
      return tx.fotoServico.create({
        data: {
          agendamentoId: servico.id,
          chave,
          rotulo,
          arquivoUrl: arquivo.url,
          arquivoNome: arquivo.nome,
          tamanhoBytes: arquivo.tamanhoBytes,
          latitude,
          longitude,
          capturadaEm: capturadaEm ?? new Date(),
          enviadaPorId: req.usuario!.id,
        },
      });
    });

    res.status(201).json(foto);
  }),
);

/** Materiais realmente usados (base do comparativo orçado × realizado). */
rotasTecnico.post(
  '/servicos/:id/materiais',
  rota(async (req, res) => {
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id, req.usuario!.equipeId);
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
    const servico = await servicoDoTecnico(req.params.id, req.usuario!.id, req.usuario!.equipeId);
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
          motivoDevolucao: null,
        },
      });
      await tx.projeto.update({
        where: { id: servico.projetoId },
        data: { status: 'AGUARDANDO_VALIDACAO' },
      });
      return ag;
    });

    res.json(atualizado);
  }),
);
