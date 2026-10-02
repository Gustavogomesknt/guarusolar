import { timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { rota } from '../lib/erros';
import { gerarPdfOrcamento } from '../lib/pdf-orcamento';

/*
 * PDF do orçamento para o CLIENTE FINAL, que abre o link recebido pelo WhatsApp sem login.
 * Por isso fica fora do autenticar(): o acesso é pelo token aleatório gravado no orçamento
 * (tokenPdf) e incluído no link. Sem token válido, não abre.
 */
export const rotasOrcamentoPdf = Router();

/** Compara em tempo constante, para o tempo de resposta não revelar o token. */
function tokenConfere(recebido: string, gravado: string) {
  const a = Buffer.from(recebido);
  const b = Buffer.from(gravado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Página simples para o cliente final (navegador ou celular), em vez de texto técnico. */
function paginaParaOCliente(res: Response, status: number, titulo: string, texto: string) {
  res
    .status(status)
    .type('html')
    .set('Cache-Control', 'no-store')
    .send(
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        `<title>${titulo} · Guarusolar</title></head>` +
        '<body style="font-family:system-ui,sans-serif;background:#F4F6FA;color:#10243D;margin:0;padding:48px 20px">' +
        '<main style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #D9E0EA;border-radius:14px;padding:28px">' +
        `<h1 style="margin:0 0 8px;font-size:20px">${titulo}</h1>` +
        `<p style="margin:0;color:#5A6675;line-height:1.5">${texto}</p></main></body></html>`,
    );
}

const linkInvalido = (res: Response) =>
  paginaParaOCliente(
    res,
    404,
    'Não foi possível abrir este orçamento',
    'O link está incompleto ou não é mais válido. Peça ao seu vendedor da Guarusolar que envie o orçamento novamente.',
  );

rotasOrcamentoPdf.get(
  '/:id/pdf',
  rota(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const orcamento = token
      ? await prisma.orcamento.findUnique({
          where: { id: req.params.id },
          include: {
            cliente: true,
            vendedor: { select: { nome: true, telefone: true } },
            itens: { orderBy: { ordem: 'asc' }, include: { produto: { select: { categoria: true } } } },
          },
        })
      : null;

    // mesma resposta para orçamento inexistente e token errado: não revela quais ids existem
    if (!orcamento || !tokenConfere(token, orcamento.tokenPdf)) return linkInvalido(res);

    let pdf: Buffer;
    try {
      pdf = await gerarPdfOrcamento(orcamento);
    } catch (erro) {
      // o erro completo vai para o log; o cliente vê uma página, não o texto técnico
      console.error(`[pdf] falha ao gerar ${orcamento.codigo}:`, erro);
      return paginaParaOCliente(
        res,
        500,
        'A proposta não pôde ser aberta agora',
        'Tente de novo em alguns minutos. Se continuar, avise o seu vendedor da Guarusolar.',
      );
    }
    res
      .status(200)
      .type('application/pdf')
      .set({
        'Content-Disposition': `inline; filename="Orcamento-${orcamento.codigo}-Guarusolar.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
        'Referrer-Policy': 'no-referrer',
      })
      .send(pdf);
  }),
);
