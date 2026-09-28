import 'dotenv/config';
import './lib/zod-pt'; // mensagens de validação em português; antes de qualquer rota
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { tratadorDeErros } from './lib/erros';
import { rotasAuth } from './rotas/auth';
import { rotasClientes } from './rotas/clientes';
import { rotasProdutos } from './rotas/produtos';
import { rotasOrcamentos } from './rotas/orcamentos';
import { rotasOrcamentoPdf } from './rotas/orcamentoPdf';
import { rotasAgenda, rotasTecnico, rotasValidacao } from './rotas/operacao';

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  }),
);
app.use(express.json({ limit: '2mb' }));

// arquivos locais durante o desenvolvimento (em produção: OneDrive/SharePoint)
app.use('/arquivos', express.static(process.env.STORAGE_DIR ?? path.resolve('uploads')));

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

app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use(tratadorDeErros);

const porta = Number(process.env.PORT ?? 3333);
app.listen(porta, () => console.log(`API da Guarusolar rodando em http://localhost:${porta}`));
