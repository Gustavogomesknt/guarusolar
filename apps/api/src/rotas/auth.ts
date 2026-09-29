import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, conferirSenha, gerarToken } from '../lib/auth';
import { bloqueioAtual, registrarFalha, registrarSucesso } from '../lib/limiteLogin';

/** Uma linha JSON por evento de login (fácil de filtrar no log da hospedagem). Nunca a senha. */
const registrarNoLog = (evento: string, dados: Record<string, unknown>) =>
  console.warn(JSON.stringify({ quando: new Date().toISOString(), evento, ...dados }));

const tempoEscrito = (segundos: number) =>
  segundos < 60 ? 'alguns segundos' : `${Math.ceil(segundos / 60)} ${Math.ceil(segundos / 60) === 1 ? 'minuto' : 'minutos'}`;

export const rotasAuth = Router();

rotasAuth.post(
  '/login',
  rota(async (req, res) => {
    const { email, senha } = z
      .object({ email: z.string().email(), senha: z.string().min(6) })
      .parse(req.body);
    const origem = req.ip ?? 'desconhecida';

    // Bloqueado (e-mail ou origem): responde antes de conferir a senha. A mensagem é a mesma
    // para e-mail que existe e que não existe; só diz quanto esperar.
    const bloqueio = bloqueioAtual(email, origem);
    if (bloqueio) {
      registrarNoLog('login_bloqueado', { email, origem, motivo: bloqueio.motivo, faltamSegundos: bloqueio.segundos });
      res.set('Retry-After', String(bloqueio.segundos));
      throw new ErroHttp(429, `Muitas tentativas de entrar. Tente de novo em ${tempoEscrito(bloqueio.segundos)}.`);
    }

    const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
    // a senha é conferida mesmo sem conta ou com conta desativada: o tempo não revela nada
    const senhaConfere = await conferirSenha(senha, usuario?.senhaHash ?? null);
    if (!usuario || !usuario.ativo || !senhaConfere) {
      const falha = registrarFalha(email, origem);
      registrarNoLog('login_falhou', { email, origem, falhasDoEmail: falha.falhasDoEmail, falhasDaOrigem: falha.falhasDaOrigem });
      if (falha.bloqueou) {
        registrarNoLog('login_bloqueio_iniciado', { email, origem, motivo: falha.bloqueou.motivo, segundos: falha.bloqueou.segundos });
      }
      throw new ErroHttp(401, 'E-mail ou senha inválidos');
    }
    registrarSucesso(email);

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
