/*
 * Fotos de EXEMPLO para os clipes: cenas desenhadas no canvas (nenhuma foto de cliente).
 * A cena sai do nome do item do roteiro (painel, inversor, padrão de entrada...), então o
 * script continua funcionando se o roteiro de fotos mudar.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CENAS = [
  [/painel|painéis|módulo/i, 'paineis'],
  [/estrutura|fixa/i, 'estrutura'],
  [/inversor/i, 'inversor'],
  [/string|quadro|disjuntor|prote/i, 'quadro'],
  [/aterramento/i, 'aterramento'],
  [/padr[ãa]o|medidor/i, 'padrao'],
  [/carregador|bornes|etiqueta/i, 'carregador'],
  [/cabo|bitola/i, 'cabos'],
  [/vaga|local|vista|amplo|ampla|geral/i, 'local'],
];

export const cenaDoRotulo = (rotulo) => CENAS.find(([re]) => re.test(rotulo))?.[1] ?? 'quadro';

/** Desenha no navegador (roda dentro de page.evaluate). */
function desenhar({ cena, semente }) {
  const W = 1600;
  const H = 1200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  let s = semente;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ret = (x, y, w, h, cor) => ((g.fillStyle = cor), g.fillRect(x, y, w, h));
  const arred = (x, y, w, h, r, cor, borda) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    if (cor) ((g.fillStyle = cor), g.fill());
    if (borda) ((g.strokeStyle = borda), (g.lineWidth = 6), g.stroke());
  };
  const gradV = (y0, y1, a, b) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    return gr;
  };
  const parede = (a = '#e9e4da', b = '#d6cfc2') => ret(0, 0, W, H, gradV(0, H, a, b));
  const eletroduto = (x, y0, y1, larg = 34) => {
    ret(x, y0, larg, y1 - y0, gradV(y0, y1, '#9aa3ad', '#7d8691'));
    ret(x + larg * 0.2, y0, larg * 0.18, y1 - y0, 'rgba(255,255,255,.25)');
  };
  const disjuntores = (x, y, n, cor = '#f4f4f2') => {
    for (let i = 0; i < n; i++) {
      arred(x + i * 62, y, 52, 120, 6, cor, '#b8bcc2');
      ret(x + i * 62 + 18, y + 40, 16, 34, '#2d3138');
    }
  };

  if (cena === 'paineis' || cena === 'estrutura') {
    ret(0, 0, W, H, gradV(0, H * 0.45, '#7fb2e5', '#cfe3f5'));
    // telhado de cerâmica
    g.save();
    g.transform(1, 0, -0.35, 1, 0, 0);
    for (let y = 380; y < H + 40; y += 46) {
      for (let x = 100; x < W + 600; x += 70) {
        const t = 120 + Math.floor(rnd() * 30);
        arred(x + (y % 92 ? 35 : 0), y, 66, 52, 18, `rgb(${t + 70},${t - 10},${t - 60})`);
      }
    }
    if (cena === 'paineis') {
      for (let l = 0; l < 2; l++) {
        for (let k = 0; k < 4; k++) {
          const x = 560 + k * 250;
          const y = 470 + l * 330;
          arred(x, y, 236, 316, 6, '#c7ccd2');
          ret(x + 8, y + 8, 220, 300, gradV(y, y + 300, '#1d3c6e', '#0f2547'));
          g.strokeStyle = 'rgba(160,190,230,.35)';
          g.lineWidth = 2;
          for (let i = 1; i < 6; i++) (g.beginPath(), g.moveTo(x + 8 + i * 36.6, y + 8), g.lineTo(x + 8 + i * 36.6, y + 308), g.stroke());
          for (let i = 1; i < 10; i++) (g.beginPath(), g.moveTo(x + 8, y + 8 + i * 30), g.lineTo(x + 228, y + 8 + i * 30), g.stroke());
          ret(x + 8, y + 8, 220, 90, 'rgba(255,255,255,.10)');
        }
      }
    } else {
      for (let k = 0; k < 2; k++) {
        const y = 560 + k * 300;
        ret(380, y, 1300, 34, gradV(y, y + 34, '#d9dde2', '#9ea6ae'));
        for (let i = 0; i < 5; i++) {
          arred(470 + i * 260, y - 22, 40, 78, 6, '#b5bcc4', '#8a929b');
          ret(480 + i * 260, y + 34, 20, 70, '#8a929b');
        }
      }
    }
    g.restore();
  } else if (cena === 'aterramento') {
    ret(0, 0, W, H, gradV(0, H, '#8a6a4a', '#5b4430'));
    for (let i = 0; i < 2500; i++) ret(rnd() * W, rnd() * H, 3 + rnd() * 6, 3 + rnd() * 6, `rgba(${40 + rnd() * 60},${30 + rnd() * 40},20,.5)`);
    for (let i = 0; i < 400; i++) ret(rnd() * W, rnd() * 260, 4, 30 + rnd() * 40, `rgba(60,${110 + rnd() * 60},50,.8)`);
    arred(560, 360, 480, 480, 12, '#9aa1a8', '#6f777f');
    ret(590, 390, 420, 420, '#3f3326');
    ret(770, 300, 60, 640, gradV(300, 940, '#d9893d', '#b8662a'));
    ret(783, 300, 12, 640, 'rgba(255,255,255,.3)');
    arred(740, 520, 120, 70, 10, '#c9ccd0', '#8f959b');
    g.strokeStyle = '#2f8a3a';
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(860, 555);
    g.bezierCurveTo(1100, 560, 1150, 300, 1400, 120);
    g.stroke();
  } else if (cena === 'local') {
    ret(0, 0, W, H * 0.55, gradV(0, H * 0.55, '#ece7df', '#d8d0c4'));
    ret(0, H * 0.55, W, H * 0.45, gradV(H * 0.55, H, '#9b9b98', '#6f6f6c'));
    g.strokeStyle = '#f2d24b';
    g.lineWidth = 16;
    for (const x of [260, 1340]) (g.beginPath(), g.moveTo(x, H * 0.58), g.lineTo(x + (x < 800 ? -160 : 160), H), g.stroke());
    arred(700, 230, 200, 260, 14, '#fafafa', '#c4c8cc');
    eletroduto(790, 0, 230, 26);
    ret(735, 300, 130, 16, '#d0d4d8');
  } else {
    parede();
    for (let i = 0; i < 1800; i++) ret(rnd() * W, rnd() * H, 2, 2, `rgba(120,110,95,${rnd() * 0.18})`);
    if (cena === 'inversor') {
      eletroduto(560, 820, H);
      eletroduto(980, 820, H);
      arred(420, 220, 760, 620, 24, '#f7f8f8', '#cfd3d7');
      arred(470, 280, 660, 120, 12, '#e3e6e9');
      arred(660, 450, 280, 150, 10, '#1d2733');
      ret(690, 480, 220, 30, '#6fd18b');
      ret(690, 525, 150, 20, '#4a88c7');
      for (let i = 0; i < 3; i++) arred(560 + i * 180, 690, 90, 60, 8, '#d8dbdf');
      g.fillStyle = '#2e7d4f';
      g.beginPath();
      g.arc(1100, 320, 14, 0, Math.PI * 2);
      g.fill();
    } else if (cena === 'padrao') {
      eletroduto(1130, 0, 360, 44);
      arred(560, 300, 620, 760, 16, '#8f979f', '#6b737b');
      arred(600, 340, 540, 680, 10, '#a9b0b7');
      arred(700, 420, 340, 300, 160, '#e9ece9', '#525a62');
      ret(780, 520, 180, 50, '#151a20');
      for (let i = 0; i < 6; i++) ret(790 + i * 28, 530, 18, 30, '#e4e4e4');
      disjuntores(760, 800, 3);
    } else if (cena === 'carregador') {
      eletroduto(780, 0, 300, 30);
      arred(600, 300, 400, 560, 60, '#20262e', '#0f1318');
      g.strokeStyle = '#38c7a8';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(800, 520, 90, 0, Math.PI * 2);
      g.stroke();
      arred(700, 700, 200, 70, 14, '#3a424c');
      g.strokeStyle = '#1b1f24';
      g.lineWidth = 34;
      g.beginPath();
      g.moveTo(800, 860);
      g.bezierCurveTo(820, 1050, 1200, 1000, 1180, 760);
      g.stroke();
      arred(1120, 620, 120, 170, 20, '#2b323b');
    } else if (cena === 'cabos') {
      arred(360, 160, 880, 900, 14, '#c3c8cd', '#8d949b');
      ret(400, 200, 800, 820, '#e6e8ea');
      disjuntores(470, 300, 7);
      const cores = ['#c0392b', '#1f3b73', '#2f8a3a', '#151515'];
      cores.forEach((cor, i) => {
        g.strokeStyle = cor;
        g.lineWidth = 26;
        g.beginPath();
        g.moveTo(520 + i * 120, 420);
        g.bezierCurveTo(520 + i * 120, 700, 640 + i * 60, 760, 700 + i * 60, 1020);
        g.stroke();
      });
      arred(560, 600, 480, 70, 10, '#fff7c2', '#d1b93d');
    } else {
      // quadro de proteção / string box / disjuntores
      eletroduto(780, 0, 200, 36);
      arred(380, 200, 840, 760, 16, '#cfd4d9', '#8d949b');
      ret(420, 240, 760, 680, '#eceef0');
      disjuntores(470, 320, 10);
      disjuntores(470, 560, 6, '#f6f1e7');
      ret(470, 760, 640, 40, '#9aa3ad');
    }
  }
  // luz e "lente": vinheta, leve granulado e brilho
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.35)');
  ret(0, 0, W, H, v);
  for (let i = 0; i < 9000; i++) ret(rnd() * W, rnd() * H, 2, 2, `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.06})`);
  return c.toDataURL('image/jpeg', 0.86);
}

/** Gera uma foto por rótulo (JPEG 1600x1200) e devolve os caminhos, na mesma ordem. */
export async function gerarFotos(navegador, pasta, rotulos) {
  await mkdir(pasta, { recursive: true });
  const pagina = await navegador.newPage();
  const caminhos = [];
  try {
    for (const [i, rotulo] of rotulos.entries()) {
      const dataUrl = await pagina.evaluate(desenhar, { cena: cenaDoRotulo(rotulo), semente: 1000 + i * 7919 });
      const arquivo = path.join(pasta, `foto-${String(i + 1).padStart(2, '0')}-${cenaDoRotulo(rotulo)}.jpg`);
      await writeFile(arquivo, Buffer.from(dataUrl.split(',')[1], 'base64'));
      caminhos.push(arquivo);
    }
  } finally {
    await pagina.close();
  }
  return caminhos;
}
