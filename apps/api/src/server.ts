import 'dotenv/config';
import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import express from 'express';
import cors from 'cors';
import { tratadorDeErros } from './lib/erros';
import { rotasAuth } from './rotas/auth';
import { rotasClientes } from './rotas/clientes';
import { rotasProdutos } from './rotas/produtos';
import { rotasOrcamentos } from './rotas/orcamentos';
import { rotasOrcamentoPdf } from './rotas/orcamentoPdf';
import { rotasAgenda, rotasTecnico, rotasValidacao } from './rotas/operacao';
import { rotasFotos } from './rotas/fotos';
import { conferirArmazenamentoAoIniciar } from './lib/armazenamento';

// armazenamento mal configurado para a API ao subir, com a mensagem (não no primeiro upload em campo)
conferirArmazenamentoAoIniciar();

const app = express();

// IP de quem chama (limite de tentativas de login). Atrás de proxy (hospedagem, Cloudflare),
// TRUST_PROXY diz quantos saltos confiar no X-Forwarded-For; sem isso, todos chegam com o IP
// do proxy. Nunca "true": qualquer um poderia inventar o próprio IP no cabeçalho.
const saltosDeProxy = Number(process.env.TRUST_PROXY ?? 0);
if (Number.isInteger(saltosDeProxy) && saltosDeProxy > 0) app.set('trust proxy', saltosDeProxy);

app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  }),
);
app.use(express.json({ limit: '2mb' }));

// Nada de pasta pública de arquivos: as fotos só saem por /api/fotos/:id, com login (rotas/fotos.ts).

app.get('/saude', (_req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

app.use('/api/auth', rotasAuth);
app.use('/api/clientes', rotasClientes);
app.use('/api/produtos', rotasProdutos);
// antes das rotas com login: o PDF é aberto pelo cliente final, com token no link
app.use('/api/orcamentos', rotasOrcamentoPdf);
app.use('/api/orcamentos', rotasOrcamentos);
app.use('/api/agenda', rotasAgenda);
app.use('/api/validacao', rotasValidacao);
app.use('/api/tecnico', rotasTecnico);
app.use('/api/fotos', rotasFotos);

app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use(tratadorDeErros);

const porta = Number(process.env.PORT ?? 3333);
app.listen(porta, () => console.log(`API da Guarusolar rodando em http://localhost:${porta}`));
