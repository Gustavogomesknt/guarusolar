import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ErroHttp, rota } from '../lib/erros';
import { autenticar, autorizar } from '../lib/auth';
import { tecnicoPodeVer } from '../lib/acesso';
import { FRACAO_DE_AVISO, FRACAO_DE_RECUSA } from '../lib/supabaseStorage';
import { linkParaAssistir, VideoSemArmazenamento } from '../lib/videos';
import { appTecnicoLiberado, ArmazenamentoIndisponivel, ArquivoNaoEncontrado, destinoAtual, lerArquivo, lerMiniatura, usoDoDestinoAtual } from '../lib/armazenamento';

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
 *
 * Cache: uma foto nunca muda (refazer apaga o registro e cria outro, com outro id), então o
 * navegador guarda por um ano e o ETag sai do id, sem abrir o arquivo. Quem já tem a foto recebe
 * 304 ANTES de a API buscar no armazenamento (cada busca conta no limite diário de downloads da
 * conta gratuita do bucket). A conferência de login e de equipe vem sempre antes do 304.
 * Vale só para estas respostas (original e miniatura), não para o restante da API.
 */
export const rotasFotos = Router();

const CACHE_DA_FOTO = 'private, max-age=31536000, immutable';

/** A miniatura pode ser gerada de novo com outros bytes (mesma imagem): validador fraco. */
const etagDaFoto = (id: string, tamanho: 'original' | 'miniatura') => (tamanho === 'miniatura' ? `W/"${id}-m"` : `"${id}-o"`);

/** If-None-Match (RFC 9110): lista de ETags ou "*"; a comparação ignora o W/ dos dois lados. */
function navegadorJaTem(cabecalho: string | undefined, etag: string) {
  if (!cabecalho) return false;
  const semFraco = (e: string) => e.trim().replace(/^W\//, '');
  return cabecalho.trim() === '*' || cabecalho.split(',').some((e) => semFraco(e) === semFraco(etag));
}
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

    const cabecalhos = {
      // "private": só o navegador de quem pediu, nunca um cache compartilhado no caminho
      'Cache-Control': CACHE_DA_FOTO,
      ETag: etagDaFoto(req.params.id, tamanho),
    };
    // já conferido quem pede: se o navegador tem a foto, responde sem tocar no armazenamento
    if (navegadorJaTem(req.get('If-None-Match'), cabecalhos.ETag)) {
      return void res.status(304).set(cabecalhos).end();
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
        ...cabecalhos,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      })
      .send(arquivo.dados);
  }),
);

/**
 * Espaço das fotos (só GESTOR e ADMIN), para o aviso do escritório. Só há o que medir nos buckets
 * (Supabase Storage: SUPABASE_STORAGE_LIMITE_MB; bucket S3: S3_STORAGE_LIMITE_MB): com disco
 * ou SharePoint, `limitado: false`.
 */
export const rotasArmazenamento = Router();
rotasArmazenamento.use(autenticar, autorizar('GESTOR'));

// tamanho de uma foto comprimida pelo app (alvo de 300 KB) mais a miniatura
const BYTES_POR_FOTO = 330 * 1024;

rotasArmazenamento.get(
  '/uso',
  rota(async (_req, res) => {
    const provedor = destinoAtual();
    // false = produção sem lugar seguro para as fotos: a API as recusa (faixa vermelha no escritório)
    const recebendo = appTecnicoLiberado();
    const uso = await usoDoDestinoAtual();
    if (!uso) return res.json({ provedor, recebendo, limitado: false });
    res.json({
      provedor,
      recebendo,
      limitado: true,
      usadoBytes: uso.usadoBytes,
      limiteBytes: uso.limiteBytes,
      percentual: Math.round(uso.fracao * 1000) / 10,
      nivel: uso.nivel,
      avisaEm: FRACAO_DE_AVISO * 100,
      recusaEm: FRACAO_DE_RECUSA * 100,
      // quantas fotos ainda cabem antes de a API recusar (estimativa)
      fotosRestantes: Math.max(0, Math.floor((uso.limiteBytes * FRACAO_DE_RECUSA - uso.usadoBytes) / BYTES_POR_FOTO)),
    });
  }),
);

/**
 * Vídeos dos serviços: a mesma conferência das fotos (login; gestor vê todos; técnico só os de
 * serviço em que está escalado, senão 404; comercial não). O arquivo NÃO passa pela API: depois
 * de conferir, ela entrega um link assinado de LEITURA que vale 5 minutos. A capa (JPEG pequeno)
 * sai como as fotos, pela API, com o mesmo cache privado.
 */
export const rotasVideos = Router();
rotasVideos.use(autenticar, autorizar('GESTOR', 'TECNICO'));

async function videoQuePodeVer(req: Request) {
  const usuario = req.usuario!;
  const video = await prisma.videoServico.findUnique({
    where: { id: req.params.id },
    select: { arquivoChave: true, capaChave: true, agendamento: { select: { escala: { where: { usuarioId: usuario.id }, select: { usuarioId: true } } } } },
  });
  if (!video || (usuario.papel === 'TECNICO' && !tecnicoPodeVer(usuario, video.agendamento))) {
    throw new ErroHttp(404, 'Vídeo não encontrado');
  }
  return video;
}

rotasVideos.get(
  '/:id/capa',
  rota(async (req, res) => {
    const video = await videoQuePodeVer(req);
    if (!video.capaChave) throw new ErroHttp(404, 'Este vídeo não tem capa');
    const cabecalhos = { 'Cache-Control': CACHE_DA_FOTO, ETag: `"${req.params.id}-capa"` };
    if (navegadorJaTem(req.get('If-None-Match'), cabecalhos.ETag)) return void res.status(304).set(cabecalhos).end();
    let capa;
    try {
      capa = await lerArquivo(video.capaChave);
    } catch (erro) {
      if (erro instanceof ArquivoNaoEncontrado) throw new ErroHttp(404, 'A capa deste vídeo não foi encontrada');
      if (erro instanceof ArmazenamentoIndisponivel) throw new ErroHttp(503, 'Os arquivos estão indisponíveis no momento. Tente de novo em instantes.');
      throw erro;
    }
    res.status(200).type('image/jpeg').set({ ...cabecalhos, 'X-Content-Type-Options': 'nosniff' }).send(capa.dados);
  }),
);

/** Link assinado de leitura, 5 minutos, só para quem pode ver o serviço. Nunca em cache. */
rotasVideos.get(
  '/:id/link',
  rota(async (req, res) => {
    const video = await videoQuePodeVer(req);
    let url: string;
    try {
      url = linkParaAssistir(video.arquivoChave, 300);
    } catch (erro) {
      if (erro instanceof VideoSemArmazenamento) throw new ErroHttp(409, erro.message);
      throw erro;
    }
    res.set('Cache-Control', 'no-store').json({ url, expiraEmSegundos: 300 });
  }),
);
