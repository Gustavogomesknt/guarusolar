import { Router } from 'express';
import { z } from 'zod';
import type { Papel, Prisma } from '@prisma/client';
import { PAPEIS } from '@guarusolar/compartilhado';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar, esquecerSessao, gerarHash } from '../lib/auth';
import { gerarSenhaTemporaria } from '../lib/senhaTemporaria';

/*
 * Usuários (tela só do ADMIN). Nada é apagado (regra 3): desativar tira o acesso na hora.
 * Proteções: o ADMIN não desativa nem rebaixa a si mesmo, e sempre sobra um ADMIN ativo.
 * Senha temporária: devolvida UMA vez na resposta; o banco guarda só o hash, e a pessoa troca
 * no primeiro acesso. Desativar, trocar papel/equipe e nova senha mudam a versão da sessão:
 * o login antigo da pessoa deixa de valer (lib/auth.ts).
 */
export const rotasUsuarios = Router();
rotasUsuarios.use(autenticar, autorizar()); // sem papéis listados: só o ADMIN passa

const camposPublicos = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  equipeId: true,
  ativo: true,
  senhaTemporaria: true,
  criadoEm: true,
} satisfies Prisma.UsuarioSelect;

/** Linha no log da hospedagem (quem fez o quê), como os eventos de login. Nunca a senha. */
const registrar = (evento: string, dados: Record<string, unknown>) =>
  console.warn(JSON.stringify({ quando: new Date().toISOString(), evento, ...dados }));

async function equipeValida(papel: Papel, equipeId: string | null | undefined) {
  if (papel !== 'TECNICO') return null; // equipe só faz sentido para técnico
  if (!equipeId) throw new ErroHttp(400, 'Técnico precisa de uma equipe');
  const equipe = await prisma.equipe.findFirst({ where: { id: equipeId, ativa: true } });
  if (!equipe) throw new ErroHttp(400, 'Equipe não encontrada');
  return equipe.id;
}

rotasUsuarios.get(
  '/',
  rota(async (_req, res) => {
    const [usuarios, equipes] = await Promise.all([
      prisma.usuario.findMany({ select: camposPublicos, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] }),
      prisma.equipe.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    ]);
    res.json({ usuarios, equipes });
  }),
);

rotasUsuarios.post(
  '/',
  rota(async (req, res) => {
    const dados = z
      .object({
        nome: z.string().trim().min(3, 'Informe o nome completo'),
        email: z.string().trim().toLowerCase().email('E-mail inválido'),
        papel: z.enum(PAPEIS),
        equipeId: z.string().nullish(),
      })
      .parse(req.body);
    if (await prisma.usuario.findUnique({ where: { email: dados.email } })) {
      throw new ErroHttp(409, `Já existe usuário com o e-mail ${dados.email}. Para quem esqueceu a senha, use "Nova senha".`);
    }
    const equipeId = await equipeValida(dados.papel, dados.equipeId);
    const senha = gerarSenhaTemporaria();
    const usuario = await prisma.usuario.create({
      data: { nome: dados.nome, email: dados.email, papel: dados.papel, equipeId, senhaHash: await gerarHash(senha), senhaTemporaria: true },
      select: camposPublicos,
    });
    registrar('usuario_criado', { por: req.usuario!.id, usuario: usuario.id, email: usuario.email, papel: usuario.papel });
    res.status(201).json({ usuario, senhaTemporaria: senha });
  }),
);

/** Sempre sobra ao menos um ADMIN ativo além de `alvoId`? */
async function haOutroAdminAtivo(alvoId: string) {
  return (await prisma.usuario.count({ where: { papel: 'ADMIN', ativo: true, NOT: { id: alvoId } } })) > 0;
}

rotasUsuarios.patch(
  '/:id',
  rota(async (req, res) => {
    const dados = z
      .object({
        nome: z.string().trim().min(3, 'Informe o nome completo').optional(),
        papel: z.enum(PAPEIS).optional(),
        equipeId: z.string().nullish(),
        ativo: z.boolean().optional(),
      })
      .parse(req.body);
    const atual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Usuário não encontrado');

    const proprio = atual.id === req.usuario!.id;
    const papel = dados.papel ?? atual.papel;
    const ativo = dados.ativo ?? atual.ativo;
    if (proprio && !ativo) throw new ErroHttp(409, 'Você não pode desativar o seu próprio usuário.');
    if (proprio && papel !== 'ADMIN') throw new ErroHttp(409, 'Você não pode tirar o seu próprio acesso de ADMIN.');
    // o sistema nunca fica sem ADMIN ativo
    if (atual.papel === 'ADMIN' && atual.ativo && (papel !== 'ADMIN' || !ativo) && !(await haOutroAdminAtivo(atual.id))) {
      throw new ErroHttp(409, 'Este é o único ADMIN ativo. Dê o papel de ADMIN a outra pessoa antes.');
    }

    const equipeId = await equipeValida(papel, dados.equipeId === undefined ? atual.equipeId : dados.equipeId);
    // o que muda o acesso derruba o login antigo (o nome não)
    const mudaAcesso = papel !== atual.papel || ativo !== atual.ativo || equipeId !== atual.equipeId;
    const usuario = await prisma.usuario.update({
      where: { id: atual.id },
      data: { nome: dados.nome, papel, equipeId, ativo, ...(mudaAcesso ? { sessaoVersao: { increment: 1 } } : {}) },
      select: camposPublicos,
    });
    if (mudaAcesso) esquecerSessao(atual.id);
    registrar('usuario_alterado', {
      por: req.usuario!.id,
      usuario: atual.id,
      ...(papel !== atual.papel ? { papel: `${atual.papel} -> ${papel}` } : {}),
      ...(equipeId !== atual.equipeId ? { equipe: `${atual.equipeId ?? '-'} -> ${equipeId ?? '-'}` } : {}),
      ...(ativo !== atual.ativo ? { ativo } : {}),
    });
    res.json(usuario);
  }),
);

/** Nova senha temporária (esqueceu): o login antigo deixa de valer e a pessoa troca no próximo acesso. */
rotasUsuarios.post(
  '/:id/nova-senha',
  rota(async (req, res) => {
    const atual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!atual) throw new ErroHttp(404, 'Usuário não encontrado');
    if (!atual.ativo) throw new ErroHttp(409, 'Usuário desativado: reative antes de gerar uma senha.');
    const senha = gerarSenhaTemporaria();
    const usuario = await prisma.usuario.update({
      where: { id: atual.id },
      data: { senhaHash: await gerarHash(senha), senhaTemporaria: true, sessaoVersao: { increment: 1 } },
      select: camposPublicos,
    });
    esquecerSessao(atual.id);
    registrar('usuario_nova_senha', { por: req.usuario!.id, usuario: atual.id });
    res.json({ usuario, senhaTemporaria: senha });
  }),
);
