/*
 * Gera os clipes de tutorial da Guarusolar (MP4 H.264, sem áudio, até 10 MB cada) em
 * scripts/video-tutorial/saida/.
 *
 *   npm run videos:tutorial                     (da raiz: todos)
 *   npm run videos:tutorial -- --so 3,5         (só alguns)
 *   npm run videos:tutorial -- --forcar         (grava mesmo com clientes de uma gravação anterior)
 *
 * SÓ NO AMBIENTE LOCAL: recusa endereço que não seja localhost e banco marcado como produção.
 * Antes, suba a API local com o banco de desenvolvimento e o seed (npm run db:seed).
 * Variáveis (opcionais):
 *   VIDEO_URL        escritório (padrão http://localhost:3333, a API servindo os apps)
 *   VIDEO_URL_CAMPO  app do técnico (padrão VIDEO_URL + /campo)
 *   VIDEO_URL_API    API (padrão VIDEO_URL)
 *   VIDEO_CHROME     caminho do Chrome, se não estiver no lugar padrão
 *   VIDEO_SENHA_SEED senha dos usuários do seed (padrão guarusolar123)
 */
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CLIPES } from './clipes.mjs';
import { Api, CEPS, conferirBancoLimpo, PREPAROS, prepararBase } from './dados.mjs';
import { Estudio } from './estudio.mjs';
import { gerarFotos } from './fotos.mjs';
import { LEGENDAS } from './legendas.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const URL_ESCRITORIO = (process.env.VIDEO_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const URL_CAMPO = (process.env.VIDEO_URL_CAMPO ?? `${URL_ESCRITORIO}/campo`).replace(/\/$/, '');
const URL_API = (process.env.VIDEO_URL_API ?? URL_ESCRITORIO).replace(/\/$/, '');
const CHAVE_TOKEN = { escritorio: 'guarusolar.escritorio.token', campo: 'guarusolar.tecnico.token' };
// posição das fotos tiradas no clipe do celular (Vila Nova Bonsucesso, Guarulhos)
const LOCAL_DO_CELULAR = { latitude: -23.4206, longitude: -46.4001 };
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';

const log = (msg) => console.log(`  ${msg}`);

function argumentos() {
  const args = process.argv.slice(2);
  const so = args.includes('--so') ? args[args.indexOf('--so') + 1] : null;
  return {
    forcar: args.includes('--forcar'),
    escolhidos: so ? so.split(',').map((n) => `clipe${n.trim()}`) : CLIPES.map((c) => c.id),
  };
}

/** Trava de segurança: só localhost, e nunca um banco marcado como produção. */
async function conferirAmbienteLocal() {
  const locais = ['localhost', '127.0.0.1', '[::1]'];
  for (const u of [URL_ESCRITORIO, URL_CAMPO, URL_API]) {
    const host = new URL(u).hostname;
    if (!locais.includes(host) && !host.endsWith('.localhost')) {
      throw new Error(`Os vídeos só rodam contra o ambiente LOCAL. Endereço recusado: ${u}`);
    }
  }
  let saude;
  try {
    saude = await (await fetch(`${URL_API}/saude`)).json();
  } catch {
    throw new Error(`A API local não respondeu em ${URL_API}. Suba a API (npm run dev:api) e tente de novo.`);
  }
  if (saude.producao !== false) throw new Error('O banco desta API está marcado como PRODUÇÃO. Os vídeos só rodam no banco local de desenvolvimento.');
  if (saude.banco !== 'ok') throw new Error('A API local está sem banco. Confira o Postgres local.');
}

/** A tela de cada formato. */
const extrasDoFormato = (formato) =>
  formato === 'celular' ? { userAgent: UA_ANDROID } : {};

/**
 * Localização "de mentira" no clipe do celular: começa como "perguntar" (aparece o botão
 * "Permitir localização") e, no primeiro pedido, responde como se a pessoa tivesse permitido.
 */
function geolocalizacaoSimulada({ latitude, longitude }) {
  const estado = { permitida: false };
  const posicao = () => ({ coords: { latitude, longitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
  const permissoes = navigator.permissions;
  const consultaOriginal = permissoes?.query?.bind(permissoes);
  if (permissoes) {
    permissoes.query = (p) =>
      p?.name === 'geolocation'
        ? Promise.resolve({ name: 'geolocation', get state() { return estado.permitida ? 'granted' : 'prompt'; }, onchange: null, addEventListener() {}, removeEventListener() {} })
        : consultaOriginal(p);
  }
  navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ((estado.permitida = true), ok(posicao())), 350);
  navigator.geolocation.watchPosition = (ok) => (setTimeout(() => ((estado.permitida = true), ok(posicao())), 350), 1);
  navigator.geolocation.clearWatch = () => {};
}

async function gravarClipe(navegador, api, clipe) {
  const pasta = path.join(os.tmpdir(), `guarusolar-video-${clipe.id}`);
  await rm(pasta, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });

  log('preparando os dados (sem gravar)…');
  const dados = await PREPAROS[clipe.id](api, { gerarFotos: (rotulos) => gerarFotos(navegador, path.join(pasta, 'fotos'), rotulos) });

  const estudio = new Estudio({
    navegador,
    formato: clipe.formato,
    base: clipe.app === 'campo' ? URL_CAMPO : URL_ESCRITORIO,
    legendas: LEGENDAS[clipe.id],
    pastaTemporaria: pasta,
  });
  estudio.ceps = CEPS;
  try {
    await estudio.abrir({
      chaveToken: CHAVE_TOKEN[clipe.app],
      token: api.tokens[clipe.usuario],
      caminho: clipe.inicio,
      extrasDoContexto: extrasDoFormato(clipe.formato),
    });
    if (clipe.formato === 'celular') {
      await estudio.contexto.addInitScript(geolocalizacaoSimulada, LOCAL_DO_CELULAR);
      await estudio.irPara(clipe.inicio);
    }
    await estudio.pausa(2500); // a primeira tela carrega antes de a gravação começar
    log('gravando…');
    await estudio.gravar();
    const inicio = Date.now();
    await clipe.roteiro(estudio, dados);
    // nenhum clipe fica abaixo de 60 s: o final segura a última tela
    const segurar = Math.max(2000, 60_500 - (Date.now() - inicio));
    await estudio.parar({ segurarFinalMs: segurar });
    log('montando o MP4…');
    const destino = path.join(SAIDA, clipe.arquivo);
    const { duracao, tamanho } = await estudio.montarMp4(destino);
    return { destino, duracao, tamanho };
  } catch (erro) {
    await estudio.pagina?.screenshot({ path: path.join(SAIDA, `ERRO-${clipe.id}.png`) }).catch(() => {});
    throw erro;
  } finally {
    await estudio.fechar();
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

async function principal() {
  const { forcar, escolhidos } = argumentos();
  await conferirAmbienteLocal();
  await mkdir(SAIDA, { recursive: true });

  console.log(`Ambiente local: ${URL_ESCRITORIO} (técnico: ${URL_CAMPO})`);
  const api = new Api(URL_API);
  await prepararBase(api, log);
  if (!forcar) {
    const repetidos = await conferirBancoLimpo(api);
    if (repetidos.length) {
      throw new Error(
        `Este banco já tem os clientes de uma gravação anterior (${repetidos.join(', ')}). ` +
          'Para a tela não aparecer com repetidos, grave num banco local recém-preparado ' +
          '(o usuário roda: npm run db:limpar e npm run db:seed) ou passe --forcar.',
      );
    }
  }

  const navegador = await chromium.launch(process.env.VIDEO_CHROME ? { executablePath: process.env.VIDEO_CHROME } : { channel: 'chrome' });
  const resultados = [];
  try {
    for (const clipe of CLIPES.filter((c) => escolhidos.includes(c.id))) {
      console.log(`\n${clipe.arquivo} — ${clipe.titulo}`);
      const r = await gravarClipe(navegador, api, clipe);
      resultados.push({ clipe, ...r });
      log(`pronto: ${r.duracao.toFixed(1)} s, ${(r.tamanho / 1024 / 1024).toFixed(2)} MB`);
    }
  } finally {
    await navegador.close();
  }

  console.log('\nArquivos em', SAIDA);
  for (const { clipe, duracao, tamanho } of resultados) {
    const avisos = [duracao > 90.5 && 'PASSOU DE 90 s', tamanho > 10 * 1024 * 1024 && 'PASSOU DE 10 MB'].filter(Boolean);
    console.log(`  ${clipe.arquivo.padEnd(44)} ${duracao.toFixed(1).padStart(5)} s  ${(tamanho / 1024 / 1024).toFixed(2).padStart(5)} MB ${avisos.join(', ')}`);
  }
}

principal().catch((erro) => {
  console.error(`\nNão foi possível gerar os vídeos: ${erro.message}`);
  process.exitCode = 1;
});
