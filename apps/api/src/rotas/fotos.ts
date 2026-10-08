import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { tecnicoPodeVer } from '../lib/acesso';
import { ArmazenamentoIndisponivel, ArquivoNaoEncontrado, lerArquivo, lerMiniatura } from '../lib/armazenamento';

/*
 * Única saída das fotos dos serviços (casa e telhado do cliente, com localização): exige login
 * e confere quem pede, a cada foto. Não existe link que funcione sem sessão.
 *
 * - GESTOR (e ADMIN): todas, para validar.
 * - TECNICO: só as de serviços da própria equipe (mesma regra das rotas do técnico); de outra
 *   equipe responde 404, como se não existisse.
 * - COMERCIAL: não vê fotos de serviço (403).
 *
 * O navegador não manda o token em <img src>: as telas buscam a foto com o cabeçalho
 * Authorization e exibem o resultado (componente ImagemProtegida, em packages/web).
 */
export const rotasFotos = Router();
rotasFotos.use(autenticar, autorizar('GESTOR', 'TECNICO'));

rotasFotos.get(
  '/:id',
  rota(async (req, res) => {
    const { tamanho } = z.object({ tamanho: z.enum(['original', 'miniatura']).default('original') }).parse(req.query);
    const usuario = req.usuario!;
    const foto = await prisma.fotoServico.findUnique({
      where: { id: req.params.id },
      // só a linha da escala de quem pede: basta para saber se está escalado no serviço da foto
      select: { arquivoChave: true, agendamento: { select: { escala: { where: { usuarioId: usuario.id }, select: { usuarioId: true } } } } },
    });
    if (!foto || (usuario.papel === 'TECNICO' && !tecnicoPodeVer(usuario, foto.agendamento))) {
      throw new ErroHttp(404, 'Foto não encontrada');
    }

    let arquivo;
    try {
      arquivo = tamanho === 'miniatura' ? await lerMiniatura(foto.arquivoChave) : await lerArquivo(foto.arquivoChave);
    } catch (erro) {
      if (erro instanceof ArquivoNaoEncontrado) throw new ErroHttp(404, 'O arquivo desta foto não foi encontrado');
      if (erro instanceof ArmazenamentoIndisponivel) {
        console.error(`[armazenamento] foto ${req.params.id} não lida: ${erro.message}`);
        throw new ErroHttp(503, 'As fotos estão indisponíveis no momento. Tente de novo em instantes.');
      }
      // arquivo corrompido ou que não é imagem: a miniatura não sai
      throw new ErroHttp(422, 'Não foi possível abrir esta foto');
    }

    res
      .status(200)
      .type(arquivo.tipo)
      .set({
        // Cada foto nunca muda (refazer cria outra, com outro id): o navegador pode guardar.
        // "private": só o navegador de quem pediu, nunca um cache compartilhado no caminho.
        'Cache-Control': 'private, max-age=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      })
      .send(arquivo.dados);
  }),
);
