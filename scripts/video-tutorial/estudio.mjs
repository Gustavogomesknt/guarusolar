/*
 * O "estúdio" dos clipes: abre o app num PALCO (uma página com o app num iframe, o cursor falso
 * e a legenda por cima), grava os quadros que o próprio Chrome entrega (screencast do DevTools)
 * e monta o MP4 H.264 com o ffmpeg.
 *
 * Por que um palco em vez de desenhar dentro do app: o cursor e a legenda ficam numa página que
 * nunca navega (não somem quando o app troca de tela) e não encostam no DOM do app. No formato
 * celular, o palco desenha o aparelho e deixa a faixa da legenda ABAIXO da tela, sem cobrir o
 * botão do rodapé do app.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

/** Ritmo pedido para todos os clipes. */
export const RITMO = {
  legendaMs: 3000, // a legenda fica 3 s na tela
  antesDoPassoMs: 1500, // a legenda aparece um pouco antes da ação começar
  depoisDaAcaoMs: 1500, // pausa depois de cada ação
  teclaMs: 60, // digitação com atraso humano
  cursorMs: 750, // o cursor viaja até o elemento
};

const LIMITE_BYTES = 10 * 1024 * 1024;
const QUADROS_POR_SEGUNDO = 25;

/*
 * palco = o tamanho do vídeo; cena = onde o app, o cursor e a legenda são desenhados, ampliada
 * por `fator` até o palco. O screencast entrega quadros no tamanho CSS da página (ignora o
 * deviceScaleFactor), por isso o celular é uma cena de 432x768 ampliada 2,5x (transform, que
 * o Chrome desenha nítido) num palco de 1080x1920.
 */
const FORMATOS = {
  // 1366x768: a tela mais comum no escritório (o gerador de orçamento já abre em duas colunas)
  computador: { palco: { width: 1366, height: 768 }, cena: { width: 1366, height: 768 }, fator: 1, tela: null },
  // 9:16 em 1080x1920; a tela do app tem 360x640, o tamanho de um Android comum
  celular: { palco: { width: 1080, height: 1920 }, cena: { width: 432, height: 768 }, fator: 2.5, tela: { width: 360, height: 640 } },
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function htmlDoPalco(formato) {
  const celular = formato === 'celular';
  const { tela, cena, fator } = FORMATOS[formato];
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Palco</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; font-family: 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif; }
  body { background: ${celular ? '#0B2F5E' : '#F4F6FA'}; }
  #cena { position: absolute; left: 0; top: 0; width: ${cena.width}px; height: ${cena.height}px; overflow: hidden;
    transform: scale(${fator}); transform-origin: 0 0;
    background: ${celular ? 'radial-gradient(circle at 50% 30%, #17457f, #0B2F5E 70%)' : '#F4F6FA'}; }
  #aparelho { position: absolute; ${
    celular
      ? `left: 50%; top: 14px; transform: translateX(-50%); width: ${tela.width}px; height: ${tela.height}px; padding: 8px;
         background: #0a1320; border-radius: 30px; box-shadow: 0 12px 40px rgba(0,0,0,.45);`
      : 'inset: 0;'
  } }
  #app { border: 0; display: block; width: 100%; height: 100%; background: #fff; ${celular ? 'border-radius: 22px;' : ''} }
  #legenda { position: absolute; left: 50%; transform: translate(-50%, 12px); opacity: 0; transition: opacity .35s, transform .35s;
    bottom: ${celular ? '10px' : '28px'}; width: max-content; max-width: ${celular ? '404px' : '1120px'}; box-sizing: border-box;
    padding: ${celular ? '10px 16px' : '14px 30px'}; border-radius: ${celular ? '14px' : '16px'};
    background: rgba(8, 20, 38, .82); color: #fff; text-align: center; pointer-events: none; z-index: 10;
    font-size: ${celular ? '19px' : '30px'}; line-height: 1.3; font-weight: 600; letter-spacing: .005em;
    box-shadow: 0 6px 24px rgba(0,0,0,.25); }
  #legenda.visivel { opacity: 1; transform: translate(-50%, 0); }
  /* o alvo do clique está embaixo: a legenda sobe para o topo enquanto isso */
  #legenda.topo { bottom: auto; top: 22px; }
  #cursor { position: absolute; left: 0; top: 0; z-index: 20; pointer-events: none; will-change: transform; }
  #cursor svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #dedo { display: none; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
    background: rgba(255,255,255,.55); border: 3px solid rgba(18,87,166,.9); box-sizing: border-box; }
  .toque { position: absolute; z-index: 19; pointer-events: none; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
    border: 3px solid #EE7C12; animation: toque .6s ease-out forwards; }
  @keyframes toque { from { transform: scale(.4); opacity: 1; } to { transform: scale(3.2); opacity: 0; } }
  #painel { position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center;
    background: rgba(11, 47, 94, .55); }
  #painel.visivel { display: flex; }
</style></head>
<body><div id="cena">
  <div id="aparelho"><iframe id="app" title="App"></iframe></div>
  <div id="painel"></div>
  <div id="legenda"></div>
  <div id="cursor">
    <svg id="seta" width="30" height="34" viewBox="0 0 30 34"><path d="M3 2 L3 27 L9.5 21 L14 31 L18.5 29 L14 19.5 L23 19.5 Z" fill="#fff" stroke="#10243D" stroke-width="2" stroke-linejoin="round"/></svg>
    <div id="dedo"></div>
  </div>
</div>
<script>
  const cursor = document.getElementById('cursor');
  const celular = ${celular};
  if (celular) { document.getElementById('seta').style.display = 'none'; document.getElementById('dedo').style.display = 'block'; }
  window.__pos = { x: ${celular ? 300 : 900}, y: ${celular ? 560 : 500} };
  cursor.style.transform = 'translate(' + __pos.x + 'px,' + __pos.y + 'px)';
  // o cursor viaja numa curva suave (ease-in-out) até o alvo
  window.__moverCursor = (x, y, ms) => new Promise((pronto) => {
    const de = { ...__pos }; const inicio = performance.now();
    const curva = (t) => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / ms); const k = curva(t);
      __pos = { x: de.x + (x - de.x) * k, y: de.y + (y - de.y) * k };
      cursor.style.transform = 'translate(' + __pos.x + 'px,' + __pos.y + 'px)';
      t < 1 ? requestAnimationFrame(passo) : pronto();
    };
    requestAnimationFrame(passo);
  });
  window.__toque = () => {
    const r = document.createElement('div'); r.className = 'toque';
    r.style.left = __pos.x + 'px'; r.style.top = __pos.y + 'px';
    document.getElementById('cena').appendChild(r); setTimeout(() => r.remove(), 700);
  };
  let vez = 0;
  window.__legenda = (texto, ms) => {
    const el = document.getElementById('legenda'); const minha = ++vez;
    el.textContent = texto; el.classList.remove('topo'); el.classList.add('visivel');
    setTimeout(() => { if (minha === vez) el.classList.remove('visivel'); }, ms);
  };
  window.__evitar = (topo, base) => {
    const el = document.getElementById('legenda');
    if (!el.classList.contains('visivel') || celular) return;
    const altura = ${cena.height};
    const cobre = base > altura - 150 && topo < altura - 8;
    if (cobre && !el.classList.contains('topo')) el.classList.add('topo');
  };
  window.__painel = (html) => {
    const p = document.getElementById('painel');
    p.innerHTML = html || ''; p.classList.toggle('visivel', Boolean(html));
  };
</script>
</body></html>`;
}

export class Estudio {
  /**
   * @param {object} o
   * @param {import('playwright-core').Browser} o.navegador
   * @param {'computador'|'celular'} o.formato
   * @param {string} o.base  endereço do app, ex.: http://localhost:3333 (escritório) ou http://localhost:3333/campo
   * @param {string[]} o.legendas  os textos do clipe, na ordem em que aparecem
   * @param {string} o.pastaTemporaria
   */
  constructor({ navegador, formato, base, legendas, pastaTemporaria }) {
    Object.assign(this, { navegador, formato, legendas, pastaTemporaria });
    this.base = base.replace(/\/$/, '');
    this.origem = new URL(this.base).origin;
    this.proximaLegenda = 0;
    this.quadros = [];
    this.popups = [];
  }

  get urlDoPalco() {
    return `${this.origem}/__palco-do-video__`;
  }

  async abrir({ chaveToken, token, caminho, extrasDoContexto = {} }) {
    const f = FORMATOS[this.formato];
    this.contexto = await this.navegador.newContext({
      viewport: f.palco,
      deviceScaleFactor: 1,
      hasTouch: this.formato === 'celular',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      // sem service worker: tudo passa pela rede e pelas rotas abaixo
      serviceWorkers: 'block',
      ...extrasDoContexto,
    });
    const origem = this.origem;
    // o palco é servido na MESMA origem do app (o iframe divide o localStorage com ele)
    await this.contexto.route(this.urlDoPalco, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: htmlDoPalco(this.formato) }));
    // a API manda X-Frame-Options: DENY (proteção contra clickjacking); só neste navegador de
    // gravação o cabeçalho sai, para o app abrir dentro do palco
    await this.contexto.route(
      // páginas dos apps e o PDF da proposta (mostrado no palco); o resto da API passa direto
      (url) => url.origin === origem && (!url.pathname.startsWith('/api/') || url.pathname.endsWith('/pdf')) && url.pathname !== '/__palco-do-video__',
      async (r) => {
        if (r.request().resourceType() !== 'document') return r.continue();
        const resposta = await r.fetch();
        const cabecalhos = { ...resposta.headers() };
        delete cabecalhos['x-frame-options'];
        await r.fulfill({ response: resposta, headers: cabecalhos });
      },
    );
    // nada sai para a internet: CEP respondido aqui, WhatsApp interceptado
    await this.contexto.route('https://viacep.com.br/**', (r) => {
      const cep = r.request().url().match(/ws\/(\d{8})/)?.[1];
      const e = this.ceps?.[cep];
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(e ? { cep, localidade: 'Guarulhos', uf: 'SP', ...e } : { erro: true }) });
    });
    for (const padrao of ['https://wa.me/**', 'https://api.whatsapp.com/**', 'https://web.whatsapp.com/**']) {
      await this.contexto.route(padrao, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>WhatsApp</title>' }));
    }
    this.contexto.on('page', (p) => this.popups.push(p));

    this.pagina = await this.contexto.newPage();
    await this.pagina.goto(this.urlDoPalco);
    if (token) await this.pagina.evaluate(([k, v]) => localStorage.setItem(k, v), [chaveToken, token]);
    await this.irPara(caminho);
  }

  /** O app, dentro do iframe do palco. */
  get app() {
    return this.pagina.frameLocator('#app');
  }

  async irPara(caminho) {
    const quadro = await (await this.pagina.$('#app')).contentFrame();
    if (quadro && quadro.url() !== 'about:blank') {
      await quadro.goto(this.base + caminho);
    } else {
      await this.pagina.evaluate((url) => (document.getElementById('app').src = url), this.base + caminho);
      await this.pagina.waitForFunction(() => document.getElementById('app').contentDocument?.readyState === 'complete');
    }
  }

  // ------------------------------------------------------------------ gravação

  async gravar() {
    this.pastaQuadros = path.join(this.pastaTemporaria, 'quadros');
    await rm(this.pastaQuadros, { recursive: true, force: true });
    await mkdir(this.pastaQuadros, { recursive: true });
    const f = FORMATOS[this.formato];
    this.cdp = await this.contexto.newCDPSession(this.pagina);
    this.gravacoes = [];
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const arquivo = path.join(this.pastaQuadros, `q${String(this.quadros.length).padStart(6, '0')}.jpg`);
      this.quadros.push({ t: metadata.timestamp, arquivo });
      this.gravacoes.push(writeFile(arquivo, Buffer.from(data, 'base64')));
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: f.palco.width,
      maxHeight: f.palco.height,
      everyNthFrame: 1,
    });
    // força um primeiro quadro
    await this.pagina.evaluate(() => (window.__pos = { ...window.__pos }));
    await this.mover(FORMATOS[this.formato].palco.width * 0.66, FORMATOS[this.formato].palco.height * 0.62, 50);
    this.inicio = Date.now() / 1000;
  }

  /** Para a gravação e devolve a duração em segundos. */
  async parar({ segurarFinalMs = 1500 } = {}) {
    await espera(segurarFinalMs);
    const fim = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
    await Promise.all(this.gravacoes);
    this.fim = fim;
    if (this.proximaLegenda !== this.legendas.length) {
      throw new Error(`O clipe usou ${this.proximaLegenda} legendas, mas o array tem ${this.legendas.length}. Confira o array de legendas.`);
    }
    return fim - this.quadros[0].t;
  }

  /** Monta o MP4 (H.264, sem áudio). Se passar de 10 MB, refaz com a taxa calculada para caber. */
  async montarMp4(destino) {
    const lista = [];
    const q = this.quadros.filter((x, i, todos) => i === 0 || x.t > todos[i - 1].t);
    for (let i = 0; i < q.length; i++) {
      const duracao = (i + 1 < q.length ? q[i + 1].t : this.fim) - q[i].t;
      lista.push(`file '${q[i].arquivo.replaceAll('\\', '/')}'`, `duration ${Math.max(0.001, duracao).toFixed(4)}`);
    }
    lista.push(`file '${q.at(-1).arquivo.replaceAll('\\', '/')}'`);
    const arquivoLista = path.join(this.pastaTemporaria, 'quadros.txt');
    await writeFile(arquivoLista, lista.join('\n'));
    const duracao = this.fim - q[0].t;

    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', arquivoLista];
    const saida = ['-vf', `fps=${QUADROS_POR_SEGUNDO},format=yuv420p`, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-tune', 'stillimage', '-an', '-movflags', '+faststart'];
    await rodarFfmpeg([...base, ...saida, '-crf', '23', destino]);
    let tamanho = (await stat(destino)).size;
    if (tamanho > LIMITE_BYTES * 0.97) {
      // taxa média para caber em ~9,3 MB, em duas passagens
      const kbps = Math.floor((9.3 * 8 * 1024) / duracao);
      const log = path.join(this.pastaTemporaria, 'passagem');
      await rodarFfmpeg([...base, ...saida, '-b:v', `${kbps}k`, '-pass', '1', '-passlogfile', log, '-f', 'mp4', process.platform === 'win32' ? 'NUL' : '/dev/null']);
      await rodarFfmpeg([...base, ...saida, '-b:v', `${kbps}k`, '-pass', '2', '-passlogfile', log, destino]);
      tamanho = (await stat(destino)).size;
    }
    return { duracao, tamanho };
  }

  async fechar() {
    await this.contexto?.close().catch(() => {});
    if (this.pastaQuadros) await rm(this.pastaQuadros, { recursive: true, force: true }).catch(() => {});
  }

  // ------------------------------------------------------------------ o que aparece no vídeo

  /** Mostra a PRÓXIMA legenda do array do clipe (3 s) e espera um pouco antes do passo. */
  async legenda() {
    const texto = this.legendas[this.proximaLegenda++];
    if (texto === undefined) throw new Error('Faltou texto no array de legendas deste clipe.');
    await this.pagina.evaluate(([t, ms]) => window.__legenda(t, ms), [texto, RITMO.legendaMs]);
    await espera(RITMO.antesDoPassoMs);
  }

  /** x e y na tela do vídeo (o palco); o cursor anda na cena. */
  async mover(x, y, ms = RITMO.cursorMs) {
    const { fator } = FORMATOS[this.formato];
    await this.pagina.evaluate(([a, b, c]) => window.__moverCursor(a, b, c), [x / fator, y / fator, ms]);
  }

  /** Rola o app suavemente até o elemento ficar no meio da tela. */
  async trazerParaTela(alvo) {
    const dentro = await alvo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 70 && r.bottom <= window.innerHeight - 130;
    });
    if (dentro) return;
    await alvo.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await espera(800);
  }

  /** Leva o cursor ao centro do elemento (ou a um ponto dentro dele). */
  async apontar(alvo, { x = 0.5, y = 0.5 } = {}) {
    await alvo.waitFor({ state: 'visible' });
    await this.trazerParaTela(alvo);
    const caixa = await alvo.boundingBox();
    if (!caixa) throw new Error('Elemento sem posição na tela');
    const { fator } = FORMATOS[this.formato];
    await this.pagina.evaluate(([a, b]) => window.__evitar(a, b), [caixa.y / fator, (caixa.y + caixa.height) / fator]);
    await this.mover(caixa.x + caixa.width * x, caixa.y + caixa.height * y);
  }

  /** Cursor até o elemento, clique (com o anel do toque) e a pausa de 1,5 s. */
  async clicar(alvo, { pausa = RITMO.depoisDaAcaoMs, ...opcoes } = {}) {
    await this.apontar(alvo, opcoes);
    await this.pagina.evaluate(() => window.__toque());
    await espera(120);
    await alvo.click();
    await espera(pausa);
  }

  /** Clica no campo e digita com atraso humano. */
  async digitar(alvo, texto, { limpar = false, pausa = RITMO.depoisDaAcaoMs } = {}) {
    await this.apontar(alvo, { x: 0.25 });
    await this.pagina.evaluate(() => window.__toque());
    await alvo.click();
    if (limpar) {
      await alvo.press('Control+A');
      await alvo.press('Backspace');
    }
    await alvo.pressSequentially(texto, { delay: RITMO.teclaMs });
    await espera(pausa);
  }

  /** <select> nativo: o menu do sistema não aparece na gravação, então o valor muda à vista. */
  async escolher(alvo, opcao, { pausa = RITMO.depoisDaAcaoMs } = {}) {
    await this.apontar(alvo);
    await this.pagina.evaluate(() => window.__toque());
    await espera(250);
    await alvo.selectOption(opcao);
    await espera(pausa);
  }

  async pausa(ms = RITMO.depoisDaAcaoMs) {
    await espera(ms);
  }

  /** Espera uma condição do app (ex.: o CEP preencher a rua). */
  async esperarAte(condicao, { tempo = 15000, descricao = 'condição' } = {}) {
    const limite = Date.now() + tempo;
    while (!(await condicao())) {
      if (Date.now() > limite) throw new Error(`Tempo esgotado esperando: ${descricao}`);
      await espera(150);
    }
  }

  /** Um quadro por cima do app (prévia do PDF ou da mensagem do WhatsApp). null fecha. */
  async painel(html) {
    await this.pagina.evaluate((h) => window.__painel(h), html);
  }

  /** Espera a próxima aba que o app abrir (PDF, WhatsApp) e devolve o endereço final dela. */
  async capturarAba(acao, { esperarUrl = (u) => u !== 'about:blank' } = {}) {
    const antes = this.popups.length;
    await acao();
    const inicio = Date.now();
    while (this.popups.length === antes) {
      if (Date.now() - inicio > 15000) throw new Error('O app não abriu a aba esperada');
      await espera(100);
    }
    const aba = this.popups.at(-1);
    while (!esperarUrl(aba.url())) {
      if (Date.now() - inicio > 15000) throw new Error(`A aba não chegou ao endereço esperado (${aba.url()})`);
      await espera(100);
    }
    const url = aba.url();
    await aba.close().catch(() => {});
    return url;
  }
}

function rodarFfmpeg(args) {
  return new Promise((ok, falha) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let erro = '';
    p.stderr.on('data', (d) => (erro += d));
    p.on('close', (codigo) => (codigo === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${codigo}: ${erro.slice(-800)}`))));
  });
}

/** Apaga quadros de uma gravação interrompida. */
export async function limparPasta(pasta) {
  for (const nome of await readdir(pasta).catch(() => [])) await rm(path.join(pasta, nome), { recursive: true, force: true });
}
