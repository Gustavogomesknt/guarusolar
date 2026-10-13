import { createHash, createHmac } from 'node:crypto';
import { ArmazenamentoIndisponivel, ArquivoNaoEncontrado } from './sharepoint';
import { ArmazenamentoCheio, FRACAO_DE_AVISO, FRACAO_DE_RECUSA, type RelatorioDoStorage, type UsoDoStorage } from './supabaseStorage';

/*
 * Fotos no Cloudflare R2 (STORAGE_PROVIDER=r2), pela API compatível com S3.
 * Por que R2: 10 GB grátis por mês e SEM cobrança de egress (o Supabase Storage gratuito tem
 * cerca de 1 GB, e a Guarusolar vai passar a enviar vídeo dos serviços).
 *
 * Sem biblioteca: os pedidos são assinados aqui mesmo (AWS Signature V4, com o crypto do Node).
 * O SDK da AWS pesaria na memória do plano gratuito da Render para fazer seis chamadas.
 *
 * Segurança (regra 6 do CLAUDE.md), igual ao Supabase Storage:
 * - o bucket é PRIVADO (no R2 é o padrão): não ligue "Public Development URL" (r2.dev) nem
 *   domínio próprio nele. Pela API S3 não dá para ler essa configuração; fica no painel;
 * - quem fala com o R2 é só esta API, com as chaves R2_*, que ficam só no servidor;
 * - nenhum link do R2 sai da API: as fotos continuam saindo só por GET /api/fotos/:id, com login
 *   e a conferência de papel e de escala. Cada pedido da API ao R2 é assinado e vale poucos
 *   minutos. `linkAssinadoDoR2` (link com expiração) existe e é conferido pelo r2:conferir, mas
 *   NENHUMA rota o usa: entregar link assinado ao navegador é mudança de fluxo, a decidir.
 *
 * Chave no banco: "r2:<caminho no bucket>", com os MESMOS caminhos do Supabase Storage (a
 * migração troca só o prefixo "sb:" por "r2:"):
 *
 *   PRJ-2026-0015/<id do serviço>/01-20260929T170207123.jpg   item 1 do checklist
 *   PRJ-2026-0015/<id do serviço>/extra-….jpg                 foto extra
 *   PRJ-2026-0015/<id do serviço>/substituidas/…              fotos refeitas (nada é apagado)
 *   miniaturas/PRJ-2026-0015/<id do serviço>/….jpg            miniaturas (480 px), geradas uma vez
 *
 * Espaço: o teto vem de R2_STORAGE_LIMITE_MB (padrão 10240 = os 10 GB gratuitos). O R2 não tem
 * tabela no nosso banco: o uso é medido LISTANDO o bucket (1.000 objetos por chamada), no máximo
 * a cada 30 minutos, somando em memória o que esta API gravou no intervalo. Mesmas regras do
 * Supabase: AVISA a partir de 70% e RECUSA fotos novas a partir de 95%.
 */

export const VARIAVEIS_DO_R2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
export const variaveisDoR2Faltando = () => VARIAVEIS_DO_R2.filter((nome) => !process.env[nome]?.trim());

const valor = (nome: (typeof VARIAVEIS_DO_R2)[number]) => process.env[nome]!.trim();
export const bucketDoR2 = () => valor('R2_BUCKET');
/**
 * https://<conta>.r2.cloudflarestorage.com. R2_ENDPOINT (opcional) troca o endereço: bucket com
 * jurisdição (https://<conta>.eu.r2.cloudflarestorage.com) ou um simulador S3 nos testes.
 */
const endpoint = () => new URL(process.env.R2_ENDPOINT?.trim() || `https://${valor('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`);

// ------------------------------------------------------------------------------------------
// Assinatura (AWS Signature V4; no R2 a região é sempre "auto")
// ------------------------------------------------------------------------------------------

const REGIAO = 'auto';
const SERVICO = 's3';
const CORPO_VAZIO = createHash('sha256').update('').digest('hex');

const sha256 = (dados: Buffer | string) => createHash('sha256').update(dados).digest('hex');
const hmac = (chave: Buffer | string, texto: string) => createHmac('sha256', chave).update(texto).digest();
/** Codificação que a assinatura exige: tudo menos letras, números e "-_.~". */
const codificar = (texto: string) => encodeURIComponent(texto).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** /<bucket>/<caminho>, cada parte codificada; as barras ficam. */
const caminhoNaUrl = (caminho?: string) => `/${codificar(bucketDoR2())}${caminho ? `/${caminho.split('/').map(codificar).join('/')}` : ''}`;

function instante(agora = new Date()) {
  const amz = agora.toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20261014T120000Z
  return { amz, dia: amz.slice(0, 8) };
}

function assinar(pedido: { metodo: string; caminho: string; consulta: [string, string][]; cabecalhos: Record<string, string>; hashDoCorpo: string; amz: string; dia: string }) {
  const nomes = Object.keys(pedido.cabecalhos).sort();
  const consulta = pedido.consulta
    .map(([k, v]) => [codificar(k), codificar(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonico = [
    pedido.metodo,
    pedido.caminho,
    consulta,
    nomes.map((n) => `${n}:${pedido.cabecalhos[n].trim()}\n`).join(''),
    nomes.join(';'),
    pedido.hashDoCorpo,
  ].join('\n');
  const escopo = `${pedido.dia}/${REGIAO}/${SERVICO}/aws4_request`;
  const chave = hmac(hmac(hmac(hmac(`AWS4${valor('R2_SECRET_ACCESS_KEY')}`, pedido.dia), REGIAO), SERVICO), 'aws4_request');
  const assinatura = createHmac('sha256', chave).update(['AWS4-HMAC-SHA256', pedido.amz, escopo, sha256(canonico)].join('\n')).digest('hex');
  return { assinatura, assinados: nomes.join(';'), escopo, consulta };
}

const ESPERAS_MS = [400, 1500];

/** Chamada assinada ao R2, com novas tentativas em falha de rede, 429 e 5xx. */
async function chamar(
  metodo: string,
  caminho: string | undefined,
  opcoes: { consulta?: Record<string, string>; corpo?: Buffer; cabecalhos?: Record<string, string> } = {},
): Promise<Response> {
  // a API sobe mesmo sem estas variáveis (modo degradado): aqui a falta vira "indisponível" (503)
  const faltam = variaveisDoR2Faltando();
  if (faltam.length) throw new ArmazenamentoIndisponivel(`Cloudflare R2 sem configuração: faltam ${faltam.join(', ')}`);
  const destino = endpoint();
  const hashDoCorpo = opcoes.corpo ? sha256(opcoes.corpo) : CORPO_VAZIO;
  let ultimo = '';
  for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa - 1]));
    // assinado a cada tentativa: a assinatura leva o horário
    const { amz, dia } = instante();
    const cabecalhos: Record<string, string> = { host: destino.host, 'x-amz-content-sha256': hashDoCorpo, 'x-amz-date': amz };
    for (const [nome, v] of Object.entries(opcoes.cabecalhos ?? {})) cabecalhos[nome.toLowerCase()] = v;
    const a = assinar({ metodo, caminho: caminhoNaUrl(caminho), consulta: Object.entries(opcoes.consulta ?? {}), cabecalhos, hashDoCorpo, amz, dia });
    const { host: _host, ...enviados } = cabecalhos; // o fetch põe o Host sozinho, igual ao assinado
    let resposta: Response;
    try {
      resposta = await fetch(`${destino.origin}${caminhoNaUrl(caminho)}${a.consulta ? `?${a.consulta}` : ''}`, {
        method: metodo,
        headers: { ...enviados, Authorization: `AWS4-HMAC-SHA256 Credential=${valor('R2_ACCESS_KEY_ID')}/${a.escopo}, SignedHeaders=${a.assinados}, Signature=${a.assinatura}` },
        body: opcoes.corpo as BodyInit | undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      ultimo = `sem resposta do Cloudflare R2 (${(erro as Error).message})`;
      continue;
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      ultimo = `Cloudflare R2 respondeu ${resposta.status}`;
      continue;
    }
    return resposta;
  }
  throw new ArmazenamentoIndisponivel(ultimo);
}

/** Texto do erro que o R2 devolve (<Code> e <Message> do XML), sem segredo nenhum. */
async function motivo(resposta: Response) {
  const texto = await resposta.text().catch(() => '');
  const codigo = /<Code>([^<]*)<\/Code>/.exec(texto)?.[1] ?? '';
  const mensagem = /<Message>([^<]*)<\/Message>/.exec(texto)?.[1] ?? '';
  const dica =
    codigo === 'InvalidAccessKeyId' || codigo === 'SignatureDoesNotMatch' || resposta.status === 401
      ? ' (confira R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY: são o par do MESMO token)'
      : codigo === 'NoSuchBucket'
        ? ` (o bucket "${bucketDoR2()}" não existe nesta conta: confira R2_BUCKET e R2_ACCOUNT_ID)`
        : codigo === 'AccessDenied' || resposta.status === 403
          ? ' (o token precisa da permissão "Object Read & Write" neste bucket)'
          : '';
  return `${resposta.status} ${codigo} ${mensagem}`.replace(/\s+/g, ' ').trim() + dica;
}

// ------------------------------------------------------------------------------------------
// Listagem (uso, relatório e limpeza)
// ------------------------------------------------------------------------------------------

export type ObjetoDoR2 = { caminho: string; bytes: number; modificadoEm: Date };

const semEntidades = (texto: string) => texto.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);

/** Todos os objetos do bucket (ou de um prefixo), 1.000 por chamada. */
export async function listarDoR2(prefixo = '', maximo = Infinity): Promise<ObjetoDoR2[]> {
  const objetos: ObjetoDoR2[] = [];
  let continuacao: string | undefined;
  do {
    const resposta = await chamar('GET', undefined, {
      consulta: {
        'list-type': '2',
        'max-keys': String(Math.min(1000, maximo)),
        ...(prefixo ? { prefix: prefixo } : {}),
        ...(continuacao ? { 'continuation-token': continuacao } : {}),
      },
    });
    if (!resposta.ok) throw new ArmazenamentoIndisponivel(`não foi possível listar o bucket "${bucketDoR2()}": ${await motivo(resposta)}`);
    const xml = await resposta.text();
    for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      objetos.push({
        caminho: semEntidades(/<Key>([\s\S]*?)<\/Key>/.exec(item)?.[1] ?? ''),
        bytes: Number(/<Size>(\d+)<\/Size>/.exec(item)?.[1] ?? 0),
        modificadoEm: new Date(/<LastModified>([^<]*)<\/LastModified>/.exec(item)?.[1] ?? Date.now()),
      });
    }
    continuacao = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? semEntidades(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') || undefined : undefined;
  } while (continuacao && objetos.length < maximo);
  return objetos;
}

/** Prova que a conta, o par de chaves e o bucket desta configuração funcionam. Lança erro se não. */
export async function conferirBucketDoR2() {
  await listarDoR2('', 1);
}

// ------------------------------------------------------------------------------------------
// Espaço usado
// ------------------------------------------------------------------------------------------

const MB = 1024 * 1024;
/** Usado só se R2_STORAGE_LIMITE_MB não estiver definida: os 10 GB gratuitos do R2. */
const LIMITE_SEM_A_VARIAVEL_MB = 10 * 1024;
/** Teto do R2: variável R2_STORAGE_LIMITE_MB (render.yaml e .env.example). */
export const limiteDoR2Bytes = () => (Number(process.env.R2_STORAGE_LIMITE_MB) > 0 ? Number(process.env.R2_STORAGE_LIMITE_MB) : LIMITE_SEM_A_VARIAVEL_MB) * MB;

let usoEmCache: { em: number; usadoBytes: number; arquivos: number } | null = null;
const VALIDADE_DA_MEDICAO_MS = 30 * 60_000;

const montarUso = (usadoBytes: number, arquivos: number): UsoDoStorage => {
  const limiteBytes = limiteDoR2Bytes();
  const fracao = usadoBytes / limiteBytes;
  return { usadoBytes, limiteBytes, fracao, arquivos, nivel: fracao >= FRACAO_DE_RECUSA ? 'cheio' : fracao >= FRACAO_DE_AVISO ? 'atencao' : 'ok' };
};

/**
 * Quanto do bucket está em uso (tudo: fotos, miniaturas e substituídas), medido pela listagem.
 * A medição vale 30 minutos em memória, somando nela o que esta API gravou nesse meio-tempo.
 * null se não der para listar agora: aí não há limite a conferir (como no Supabase).
 */
export async function usoDoR2(forcar = false): Promise<UsoDoStorage | null> {
  if (!forcar && usoEmCache && Date.now() - usoEmCache.em < VALIDADE_DA_MEDICAO_MS) return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
  let objetos: ObjetoDoR2[];
  try {
    objetos = await listarDoR2();
  } catch (erro) {
    console.warn(`[armazenamento] não foi possível medir o uso do R2: ${(erro as Error).message}`);
    return null;
  }
  usoEmCache = { em: Date.now(), usadoBytes: objetos.reduce((t, o) => t + o.bytes, 0), arquivos: objetos.length };
  return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
}

/** Recusa o arquivo novo se ele não couber abaixo dos 95% do limite. */
async function conferirEspaco(bytesNovos: number) {
  const uso = await usoDoR2();
  if (!uso) return;
  if (uso.usadoBytes + bytesNovos > uso.limiteBytes * FRACAO_DE_RECUSA) {
    throw new ArmazenamentoCheio(`R2 em ${(uso.fracao * 100).toFixed(1)}% de ${(uso.limiteBytes / MB).toFixed(0)} MB`);
  }
  if (uso.nivel === 'atencao') {
    console.warn(`[armazenamento] ATENÇÃO: R2 em ${(uso.fracao * 100).toFixed(1)}% do limite. Rode npm run storage:relatorio e veja "Espaço das fotos" no README.`);
  }
}

// ------------------------------------------------------------------------------------------
// Relatório (npm run storage:relatorio, com STORAGE_PROVIDER=r2)
// ------------------------------------------------------------------------------------------

/**
 * Quando a foto entrou. O R2 só guarda a data em que o objeto foi gravado NELE, e a migração do
 * Supabase regravou tudo no mesmo dia; por isso vale primeiro o instante que está no nome do
 * arquivo (…/01-20260929T170207123.jpg, a hora da captura) e só depois a data do objeto.
 */
function quandoEntrou(o: ObjetoDoR2) {
  const m = /-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\d{0,3}\.[a-z0-9]+$/i.exec(o.caminho);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : o.modificadoEm;
}
const mesDe = (data: Date) => data.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

/** O mesmo relatório do Supabase Storage, montado com a listagem do bucket (só leitura). */
export async function relatorioDoR2(): Promise<RelatorioDoStorage> {
  const objetos = await listarDoR2();
  const tipoDe = (c: string) => (c.startsWith('miniaturas/') ? 'miniaturas' : c.includes('/substituidas/') ? 'substituidas' : 'fotos');
  const grupos = { fotos: { arquivos: 0, bytes: 0 }, miniaturas: { arquivos: 0, bytes: 0 }, substituidas: { arquivos: 0, bytes: 0 } };
  const meses = new Map<string, { mes: string; arquivos: number; bytes: number }>();
  const mesCorrente = mesDe(new Date());
  const fotosDoMes = { arquivos: 0, bytes: 0 };
  let primeiro: Date | null = null;
  let recentes = 0;
  for (const o of objetos) {
    const tipo = tipoDe(o.caminho);
    grupos[tipo].arquivos++;
    grupos[tipo].bytes += o.bytes;
    const quando = quandoEntrou(o);
    const mes = mesDe(quando);
    const m = meses.get(mes) ?? { mes, arquivos: 0, bytes: 0 };
    m.arquivos++;
    m.bytes += o.bytes;
    meses.set(mes, m);
    if (tipo === 'fotos' && mes === mesCorrente) {
      fotosDoMes.arquivos++;
      fotosDoMes.bytes += o.bytes;
    }
    if (!primeiro || quando < primeiro) primeiro = quando;
    if (Date.now() - quando.getTime() <= 90 * 864e5) recentes += o.bytes;
  }
  const usadoBytes = grupos.fotos.bytes + grupos.miniaturas.bytes + grupos.substituidas.bytes;
  const limiteBytes = limiteDoR2Bytes();
  const diasMedidos = primeiro ? Math.min(90, Math.max(1, (Date.now() - primeiro.getTime()) / 864e5)) : 0;
  const ritmoMensalBytes = diasMedidos > 0 && recentes > 0 ? (recentes / diasMedidos) * 30.44 : null;
  usoEmCache = { em: Date.now(), usadoBytes, arquivos: objetos.length };
  return {
    usadoBytes,
    limiteBytes,
    fracao: usadoBytes / limiteBytes,
    arquivos: objetos.length,
    fotos: { ...grupos.fotos, mediaBytes: grupos.fotos.arquivos ? grupos.fotos.bytes / grupos.fotos.arquivos : 0 },
    miniaturas: grupos.miniaturas,
    substituidas: grupos.substituidas,
    porMes: [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1)),
    fotosDoMes,
    ritmoMensalBytes,
    diasMedidos,
    mesesAteOTeto: ritmoMensalBytes ? Math.max(0, limiteBytes - usadoBytes) / ritmoMensalBytes : null,
  };
}

// ------------------------------------------------------------------------------------------
// Operações
// ------------------------------------------------------------------------------------------

/** Grava (ou substitui) um objeto. `conferir: false` só para a miniatura, que é pequena e derivada. */
export async function enviarAoR2(caminho: string, dados: Buffer, tipo: string, opcoes: { conferir?: boolean } = {}) {
  if (opcoes.conferir !== false) await conferirEspaco(dados.length);
  const resposta = await chamar('PUT', caminho, { corpo: dados, cabecalhos: { 'Content-Type': tipo } });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`envio recusado pelo Cloudflare R2: ${await motivo(resposta)}`);
  if (usoEmCache) {
    // várias fotos seguidas não passam do limite entre uma medição e outra
    usoEmCache.usadoBytes += dados.length;
    usoEmCache.arquivos += 1;
  }
}

export async function baixarDoR2(caminho: string): Promise<Buffer> {
  const resposta = await chamar('GET', caminho);
  if (resposta.status === 404) throw new ArquivoNaoEncontrado(`Arquivo não encontrado: ${caminho}`);
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`leitura recusada pelo Cloudflare R2: ${await motivo(resposta)}`);
  return Buffer.from(await resposta.arrayBuffer());
}

/** Tamanho do objeto, ou null se não existe. Para a migração saber o que já foi copiado. */
export async function tamanhoNoR2(caminho: string): Promise<number | null> {
  const resposta = await chamar('HEAD', caminho);
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`o Cloudflare R2 respondeu ${resposta.status} ao consultar ${caminho}`);
  return Number(resposta.headers.get('content-length') ?? 0);
}

/** O R2 não tem "mover": copia dentro do bucket e apaga o original. */
export async function moverNoR2(de: string, para: string) {
  const copia = await chamar('PUT', para, { cabecalhos: { 'x-amz-copy-source': caminhoNaUrl(de) } });
  if (!copia.ok) throw new ArmazenamentoIndisponivel(`não foi possível mover ${de}: ${await motivo(copia)}`);
  await copia.arrayBuffer().catch(() => undefined);
  await apagarDoR2([de]);
}

/** Apagar o que não existe não é erro (o R2 responde 204 do mesmo jeito). */
export async function apagarDoR2(caminhos: string[]) {
  for (const caminho of caminhos) {
    const resposta = await chamar('DELETE', caminho);
    if (!resposta.ok && resposta.status !== 404) throw new ArmazenamentoIndisponivel(`não foi possível apagar ${caminho}: ${await motivo(resposta)}`);
  }
  if (caminhos.length) usoEmCache = null;
}

/**
 * Link assinado, com expiração, para LER um objeto sem as chaves (URL pré-assinada do S3).
 * NENHUMA rota usa isto hoje: as fotos saem só por /api/fotos/:id (regra 6). Fica pronto, e
 * conferido pelo `npm run r2:conferir`, para quando um arquivo grande (vídeo) não puder passar
 * pela memória da API. Antes de entregar um link destes a um navegador, decida com o cliente:
 * quem tem o link abre o arquivo sem login até ele expirar.
 */
export function linkAssinadoDoR2(caminho: string, segundos = 300): string {
  const destino = endpoint();
  const { amz, dia } = instante();
  const escopo = `${dia}/${REGIAO}/${SERVICO}/aws4_request`;
  const consulta: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${valor('R2_ACCESS_KEY_ID')}/${escopo}`],
    ['X-Amz-Date', amz],
    ['X-Amz-Expires', String(Math.min(Math.max(1, Math.round(segundos)), 7 * 24 * 3600))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const a = assinar({ metodo: 'GET', caminho: caminhoNaUrl(caminho), consulta, cabecalhos: { host: destino.host }, hashDoCorpo: 'UNSIGNED-PAYLOAD', amz, dia });
  return `${destino.origin}${caminhoNaUrl(caminho)}?${a.consulta}&X-Amz-Signature=${a.assinatura}`;
}

/**
 * Para o r2:conferir: o objeto abre pela API S3 SEM assinatura? Tem de ser não. (true = abriu.)
 * Não enxerga o "Public Development URL" (r2.dev) nem domínio próprio: isso se confere no painel.
 */
export async function abreSemAssinatura(caminho: string): Promise<boolean> {
  const resposta = await fetch(`${endpoint().origin}${caminhoNaUrl(caminho)}`, { signal: AbortSignal.timeout(15_000) });
  return resposta.ok;
}
