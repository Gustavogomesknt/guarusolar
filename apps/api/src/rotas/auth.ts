import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, conferirSenha, gerarHash, gerarToken } from '../lib/auth';
import { appTecnicoLiberado, AVISO_APP_TECNICO_BLOQUEADO } from '../lib/armazenamento';
import { problemaNaSenhaNova } from '../lib/senha';
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

    // o técnico só entra quando as fotos têm onde ficar (produção sem SharePoint: bloqueado)
    if (usuario.papel === 'TECNICO' && !appTecnicoLiberado()) throw new ErroHttp(403, AVISO_APP_TECNICO_BLOQUEADO);

    const dados = { id: usuario.id, nome: usuario.nome, papel: usuario.papel, equipeId: usuario.equipeId };
    res.json({ token: gerarToken(dados), usuario: { ...dados, senhaTemporaria: usuario.senhaTemporaria } });
  }),
);

/**
 * Quem está logado, lido do BANCO (não só do token): traz a obrigação de trocar a senha e
 * encerra a sessão de quem foi desativado.
 */
rotasAuth.get(
  '/eu',
  autenticar,
  rota(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });
    if (!usuario || !usuario.ativo) throw new ErroHttp(401, 'Sua sessão terminou. Entre de novo.');
    res.json({
      id: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel,
      equipeId: usuario.equipeId,
      senhaTemporaria: usuario.senhaTemporaria,
    });
  }),
);

/**
 * Troca da própria senha (obrigatória no primeiro acesso com senha temporária).
 * Senha atual errada responde 400, não 401: nos apps, 401 encerra a sessão. E conta no mesmo
 * limite de tentativas do login, para esta rota não virar um jeito de testar senhas.
 */
rotasAuth.post(
  '/senha',
  autenticar,
  rota(async (req, res) => {
    const { senhaAtual, novaSenha } = z
      .object({ senhaAtual: z.string().min(1, 'Informe a senha atual'), novaSenha: z.string() })
      .parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });
    if (!usuario || !usuario.ativo) throw new ErroHttp(401, 'Sua sessão terminou. Entre de novo.');
    const origem = req.ip ?? 'desconhecida';

    const bloqueio = bloqueioAtual(usuario.email, origem);
    if (bloqueio) {
      res.set('Retry-After', String(bloqueio.segundos));
      throw new ErroHttp(429, `Muitas tentativas. Tente de novo em ${tempoEscrito(bloqueio.segundos)}.`);
    }
    if (!(await conferirSenha(senhaAtual, usuario.senhaHash))) {
      const falha = registrarFalha(usuario.email, origem);
      registrarNoLog('troca_de_senha_falhou', { email: usuario.email, origem, falhasDoEmail: falha.falhasDoEmail });
      throw new ErroHttp(400, 'A senha atual não confere.');
    }
    const problema = problemaNaSenhaNova(novaSenha, { senhaAtual, email: usuario.email, nome: usuario.nome });
    if (problema) throw new ErroHttp(400, problema);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHash(novaSenha), senhaTemporaria: false },
    });
    registrarSucesso(usuario.email);
    registrarNoLog('senha_trocada', { email: usuario.email, origem });

    const dados = { id: usuario.id, nome: usuario.nome, papel: usuario.papel, equipeId: usuario.equipeId };
    res.json({ token: gerarToken(dados), usuario: { ...dados, senhaTemporaria: false } });
  }),
);
