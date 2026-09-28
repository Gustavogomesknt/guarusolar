import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, conferirSenha, gerarToken } from '../lib/auth';

export const rotasAuth = Router();

rotasAuth.post(
  '/login',
  rota(async (req, res) => {
    const { email, senha } = z
      .object({ email: z.string().email(), senha: z.string().min(6) })
      .parse(req.body);

    const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
    if (!usuario || !usuario.ativo || !(await conferirSenha(senha, usuario.senhaHash))) {
      throw new ErroHttp(401, 'E-mail ou senha inválidos');
    }

    const dados = {
      id: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel,
      equipeId: usuario.equipeId,
    };
    res.json({ token: gerarToken(dados), usuario: dados });
  }),
);

rotasAuth.get('/eu', autenticar, (req, res) => res.json(req.usuario));
