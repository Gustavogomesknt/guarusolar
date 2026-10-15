import { createHash, createHmac } from 'node:crypto';
import { ArmazenamentoIndisponivel, ArquivoNaoEncontrado } from './sharepoint';
import { ArmazenamentoCheio, FRACAO_DE_AVISO, FRACAO_DE_RECUSA, type RelatorioDoStorage, type UsoDoStorage } from './supabaseStorage';

/*
 * Fotos num bucket compatível com S3 (STORAGE_PROVIDER=s3). O MESMO provedor atende o Backblaze
 * B2 (o escolhido: 10 GB sempre gratuitos, sem cartão no cadastro), o Cloudflare R2 e qualquer
 * outro serviço que fale a API do S3: o que muda é só o endereço e a região, que vêm de variável.
 *
 *   S3_ENDPOINT            https://s3.<região>.backblazeb2.com   (B2; ex.: s3.us-west-004.backblazeb2.com)
 *   S3_REGION              us-west-004   (no B2, o trecho do meio do endpoint)
 *   S3_ACCESS_KEY_ID       no B2, o "keyID" da application key
 *   S3_SECRET_ACCESS_KEY   no B2, o "applicationKey" (mostrado uma única vez)
 *   S3_BUCKET              o nome do bucket (PRIVADO)
 *   S3_STORAGE_LIMITE_MB   teto, em MB (padrão 10240 = 10 GB)
 *
 * A REGIÃO FAZ PARTE DA ASSINATURA (Signature V4): com a região errada o serviço pode recusar
 * todos os pedidos, mesmo com as chaves certas. No B2 ela tem de ser igual à do endpoint.
 *
 * "r2" É APELIDO deste provedor (STORAGE_PROVIDER=r2 = s3). As variáveis antigas continuam
 * valendo quando a S3_* correspondente não existe: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET, R2_STORAGE_LIMITE_MB, e R2_ACCOUNT_ID (ou R2_ENDPOINT) no lugar do endpoint; num
 * endereço *.r2.cloudflarestorage.com a região, se não informada, é "auto".
 *
 * Sem biblioteca: os pedidos são assinados aqui mesmo (AWS Signature V4, com o crypto do Node).
 * O SDK da AWS pesaria na memória do plano gratuito da Render para fazer seis chamadas.
 *
 * Segurança (regra 6 do CLAUDE.md), igual ao Supabase Storage:
 * - o bucket é PRIVADO. Isso se escolhe no painel do serviço e não dá para ler pela API S3;
 * - quem fala com o bucket é só esta API, com as chaves, que ficam só no servidor;
 * - nenhum link do bucket sai da API: as fotos continuam saindo só por GET /api/fotos/:id, com
 *   login e a conferência de papel e de escala. Cada pedido da API ao bucket é assinado e vale
 *   poucos minutos. EXCEÇÃO, só para VÍDEO (arquivo grande demais para passar pela API): a API
 *   entrega ao celular um link de ESCRITA (`linkDeEnvioDoS3`, 10 min) e ao gestor, depois de
 *   conferir o login, um de LEITURA (`linkAssinadoDoS3`, 5 min). Nenhum link público.
 *   O envio direto exige CORS no bucket (PUT a partir do endereço do app): ver SOCORRO.md.
 *
 * Chave no banco: "s3:<caminho no bucket>", com os MESMOS caminhos do Supabase Storage (a
 * migração troca só o prefixo "sb:" por "s3:"). "r2:<caminho>" é lida do mesmo jeito (apelido).
 *
 *   PRJ-2026-0015/<id do serviço>/01-20260929T170207123.jpg   item 1 do checklist
 *   PRJ-2026-0015/<id do serviço>/extra-….jpg                 foto extra
 *   PRJ-2026-0015/<id do serviço>/substituidas/…              fotos refeitas (nada é apagado)
 *   PRJ-2026-0015/<id do serviço>/videos/<idLocal>.webm       vídeos (e a capa, …-capa.jpg)
 *   miniaturas/PRJ-2026-0015/<id do serviço>/….jpg            miniaturas (480 px), geradas uma vez
 *
 * Espaço: o teto vem de S3_STORAGE_LIMITE_MB. O bucket não tem tabela no nosso banco: o uso é
 * medido LISTANDO o bucket (1.000 objetos por chamada), no máximo a cada 30 minutos, somando em
 * memória o que esta API gravou no intervalo. Mesmas regras do Supabase: AVISA a partir de 70% e
 * RECUSA fotos novas a partir de 95%.
 * ATENÇÃO (B2): a listagem só enxerga a versão ATUAL de cada arquivo, e o B2 guarda as versões
 * antigas (arquivo regravado ou apagado) até a regra de ciclo de vida do bucket removê-las. O
 * bucket tem de estar em "Keep only the last version of the file"; senão o espaço ocupado fica
 * acima do medido aqui.
 */

export const VARIAVEIS_DO_S3 = ['S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'] as const;
/** Nomes antigos (apelido "r2"): valem quando a S3_* correspondente não está definida. */
const VARIAVEIS_DO_R2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

// aspas digitadas no painel da hospedagem não fazem parte do valor
const ler = (nome: string) => process.env[nome]?.trim().replace(/^["']|["']$/g, '').trim() || undefined;

/** O endereço como foi configurado (sem conferir se é válido). */
function enderecoDeclarado(): string | undefined {
  const conta = ler('R2_ACCOUNT_ID');
  return ler('S3_ENDPOINT') ?? ler('R2_ENDPOINT') ?? (conta ? `https://${conta}.r2.cloudflarestorage.com` : undefined);
}
/** Só a origem (https://host): com ou sem "https://" na frente, com ou sem barra no fim. null se não é endereço. */
function enderecoValido(): URL | null {
  const texto = enderecoDeclarado();
  if (!texto) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    return url.hostname.includes('.') || url.hostname === 'localhost' ? new URL(url.origin) : null;
  } catch {
    return null;
  }
}
const EH_R2 = /\.r2\.cloudflarestorage\.com$/i;
const EH_B2 = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i;

// sem S3_ENDPOINT o endereço veio dos nomes antigos do R2, onde a região é sempre "auto"
const regiaoConfigurada = () =>
  ler('S3_REGION') ?? ((!ler('S3_ENDPOINT') && enderecoDeclarado()) || EH_R2.test(enderecoValido()?.hostname ?? '') ? 'auto' : undefined);
const idDaChave = () => ler('S3_ACCESS_KEY_ID') ?? ler('R2_ACCESS_KEY_ID');
const segredoDaChave = () => ler('S3_SECRET_ACCESS_KEY') ?? ler('R2_SECRET_ACCESS_KEY');
const bucketConfigurado = () => ler('S3_BUCKET') ?? ler('R2_BUCKET');

/**
 * O que falta para o provedor funcionar (lista vazia = completo). Com os nomes S3_*; só quem
 * está configurado pelos nomes antigos (nenhuma S3_* e alguma R2_*) recebe os nomes R2_*.
 */
export function variaveisDoS3Faltando(): string[] {
  const antigos = !VARIAVEIS_DO_S3.some(ler) && VARIAVEIS_DO_R2.some(ler);
  const faltam: string[] = [];
  if (!enderecoDeclarado()) faltam.push(antigos ? 'R2_ACCOUNT_ID' : 'S3_ENDPOINT');
  else if (!enderecoValido()) {
    const nome = ler('S3_ENDPOINT') ? 'S3_ENDPOINT' : ler('R2_ENDPOINT') ? 'R2_ENDPOINT' : 'R2_ACCOUNT_ID';
    faltam.push(`${nome} (o valor não é um endereço: use a forma https://s3.<região>.backblazeb2.com)`);
  }
  if (!regiaoConfigurada()) faltam.push('S3_REGION');
  if (!idDaChave()) faltam.push(antigos ? 'R2_ACCESS_KEY_ID' : 'S3_ACCESS_KEY_ID');
  if (!segredoDaChave()) faltam.push(antigos ? 'R2_SECRET_ACCESS_KEY' : 'S3_SECRET_ACCESS_KEY');
  if (!bucketConfigurado()) faltam.push(antigos ? 'R2_BUCKET' : 'S3_BUCKET');
  return faltam;
}

// daqui para baixo, só depois de variaveisDoS3Faltando() vazio (quem garante é `chamar`)
const endpoint = () => enderecoValido()!;
const regiao = () => regiaoConfigurada()!;
export const bucketDoS3 = () => bucketConfigurado()!;

/** Para os avisos e erros: "Backblaze B2", "Cloudflare R2" ou "armazenamento S3". */
export function servicoDoS3(): string {
  const host = enderecoValido()?.hostname ?? '';
  return /\.backblazeb2\.com$/i.test(host) ? 'Backblaze B2' : EH_R2.test(host) ? 'Cloudflare R2' : 'armazenamento S3';
}

/**
 * A região tem de bater com a do endereço (ela entra na assinatura). No B2 dá para conferir sem
 * chamar ninguém: https://s3.<região>.backblazeb2.com. Devolve o aviso, ou null se está certo
 * (ou se o endereço não é do B2 e não há como saber).
 */
export function avisoDeRegiaoDoS3(): string | null {
  const doEndereco = EH_B2.exec(enderecoValido()?.hostname ?? '')?.[1]?.toLowerCase();
  const declarada = regiaoConfigurada();
  if (!doEndereco || !declarada || doEndereco === declarada.toLowerCase()) return null;
  return `S3_REGION="${declarada}" não bate com o endereço (S3_ENDPOINT é da região "${doEndereco}"). A região entra na assinatura: use S3_REGION=${doEndereco}.`;
}

// ------------------------------------------------------------------------------------------
// Assinatura (AWS Signature V4; a região faz parte dela)
// ------------------------------------------------------------------------------------------

const SERVICO = 's3';
const CORPO_VAZIO = createHash('sha256').update('').digest('hex');

const sha256 = (dados: Buffer | string) => createHash('sha256').update(dados).digest('hex');
const hmac = (chave: Buffer | string, texto: string) => createHmac('sha256', chave).update(texto).digest();
/** Codificação que a assinatura exige: tudo menos letras, números e "-_.~". */
const codificar = (texto: string) => encodeURIComponent(texto).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** /<bucket>/<caminho>, cada parte codificada; as barras ficam. */
const caminhoNaUrl = (caminho?: string) => `/${codificar(bucketDoS3())}${caminho ? `/${caminho.split('/').map(codificar).join('/')}` : ''}`;

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
  const escopo = `${pedido.dia}/${regiao()}/${SERVICO}/aws4_request`;
  const chave = hmac(hmac(hmac(hmac(`AWS4${segredoDaChave()!}`, pedido.dia), regiao()), SERVICO), 'aws4_request');
  const assinatura = createHmac('sha256', chave).update(['AWS4-HMAC-SHA256', pedido.amz, escopo, sha256(canonico)].join('\n')).digest('hex');
  return { assinatura, assinados: nomes.join(';'), escopo, consulta };
}

const ESPERAS_MS = [400, 1500];

/** Chamada assinada ao bucket, com novas tentativas em falha de rede, 429 e 5xx. */
async function chamar(
  metodo: string,
  caminho: string | undefined,
  opcoes: { consulta?: Record<string, string>; corpo?: Buffer; cabecalhos?: Record<string, string> } = {},
): Promise<Response> {
  // a API sobe mesmo sem estas variáveis (modo degradado): aqui a falta vira "indisponível" (503)
  const faltam = variaveisDoS3Faltando();
  if (faltam.length) throw new ArmazenamentoIndisponivel(`armazenamento S3 sem configuração: faltam ${faltam.join(', ')}`);
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
        headers: { ...enviados, Authorization: `AWS4-HMAC-SHA256 Credential=${idDaChave()!}/${a.escopo}, SignedHeaders=${a.assinados}, Signature=${a.assinatura}` },
        body: opcoes.corpo as BodyInit | undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      ultimo = `sem resposta do ${servicoDoS3()} (${(erro as Error).message})`;
      continue;
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      ultimo = `${servicoDoS3()} respondeu ${resposta.status}`;
      continue;
    }
    return resposta;
  }
  throw new ArmazenamentoIndisponivel(ultimo);
}

/** Texto do erro que o serviço devolve (<Code> e <Message> do XML), sem segredo nenhum. */
export async function motivo(resposta: Response) {
  const texto = await resposta.text().catch(() => '');
  const codigo = /<Code>([^<]*)<\/Code>/.exec(texto)?.[1] ?? '';
  const mensagem = /<Message>([^<]*)<\/Message>/.exec(texto)?.[1] ?? '';
  const regiaoErrada = resposta.status === 400 || resposta.status === 401 || resposta.status === 403 ? avisoDeRegiaoDoS3() : null;
  const dica = regiaoErrada
    ? ` (${regiaoErrada})`
    : /expired/i.test(mensagem)
      ? ' (o link já tinha expirado ao chegar: o horário dele vem do relógio deste computador; confira se está certo)'
      : codigo === 'AuthorizationHeaderMalformed'
      ? ' (a região não é a deste endereço: confira S3_REGION com S3_ENDPOINT)'
      : codigo === 'InvalidAccessKeyId' || codigo === 'SignatureDoesNotMatch' || resposta.status === 401
        ? ' (confira S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY, que são o par da MESMA chave, e S3_REGION, que tem de ser a região do endereço)'
        : codigo === 'NoSuchBucket'
          ? ` (o bucket "${bucketDoS3()}" não existe nesta conta e região: confira S3_BUCKET e S3_ENDPOINT)`
          : codigo === 'AccessDenied' || resposta.status === 403
            ? ' (a chave precisa de leitura e escrita neste bucket)'
            : '';
  return `${resposta.status} ${codigo} ${mensagem}`.replace(/\s+/g, ' ').trim() + dica;
}

// ------------------------------------------------------------------------------------------
// Listagem (uso, relatório e limpeza)
// ------------------------------------------------------------------------------------------

export type ObjetoDoS3 = { caminho: string; bytes: number; modificadoEm: Date };

const semEntidades = (texto: string) => texto.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);

/** Todos os objetos do bucket (ou de um prefixo), 1.000 por chamada. */
export async function listarDoS3(prefixo = '', maximo = Infinity): Promise<ObjetoDoS3[]> {
  const objetos: ObjetoDoS3[] = [];
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
    if (!resposta.ok) throw new ArmazenamentoIndisponivel(`não foi possível listar o bucket "${bucketDoS3()}": ${await motivo(resposta)}`);
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

/** Prova que o endereço, a região, o par de chaves e o bucket desta configuração funcionam. Lança erro se não. */
export async function conferirBucketDoS3() {
  await listarDoS3('', 1);
}

// ------------------------------------------------------------------------------------------
// Espaço usado
// ------------------------------------------------------------------------------------------

const MB = 1024 * 1024;
/** Usado só se S3_STORAGE_LIMITE_MB não estiver definida: os 10 GB gratuitos do B2 (e do R2). */
const LIMITE_SEM_A_VARIAVEL_MB = 10 * 1024;
/** Teto do bucket: variável S3_STORAGE_LIMITE_MB (render.yaml e .env.example); R2_STORAGE_LIMITE_MB é o nome antigo. */
export function limiteDoS3Bytes() {
  const definido = Number(ler('S3_STORAGE_LIMITE_MB') ?? ler('R2_STORAGE_LIMITE_MB'));
  return (definido > 0 ? definido : LIMITE_SEM_A_VARIAVEL_MB) * MB;
}

let usoEmCache: { em: number; usadoBytes: number; arquivos: number } | null = null;
const VALIDADE_DA_MEDICAO_MS = 30 * 60_000;

const montarUso = (usadoBytes: number, arquivos: number): UsoDoStorage => {
  const limiteBytes = limiteDoS3Bytes();
  const fracao = usadoBytes / limiteBytes;
  return { usadoBytes, limiteBytes, fracao, arquivos, nivel: fracao >= FRACAO_DE_RECUSA ? 'cheio' : fracao >= FRACAO_DE_AVISO ? 'atencao' : 'ok' };
};

/**
 * Quanto do bucket está em uso (tudo: fotos, miniaturas e substituídas), medido pela listagem.
 * A medição vale 30 minutos em memória, somando nela o que esta API gravou nesse meio-tempo.
 * null se não der para listar agora: aí não há limite a conferir (como no Supabase).
 */
export async function usoDoS3(forcar = false): Promise<UsoDoStorage | null> {
  if (!forcar && usoEmCache && Date.now() - usoEmCache.em < VALIDADE_DA_MEDICAO_MS) return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
  let objetos: ObjetoDoS3[];
  try {
    objetos = await listarDoS3();
  } catch (erro) {
    console.warn(`[armazenamento] não foi possível medir o uso do bucket: ${(erro as Error).message}`);
    return null;
  }
  usoEmCache = { em: Date.now(), usadoBytes: objetos.reduce((t, o) => t + o.bytes, 0), arquivos: objetos.length };
  return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
}

/** Soma ao uso em memória um arquivo que chegou ao bucket sem passar pela API (vídeo). */
export function somarAoUsoDoS3(bytes: number) {
  if (!usoEmCache) return;
  usoEmCache.usadoBytes += bytes;
  usoEmCache.arquivos += 1;
}

/** Recusa o arquivo novo se ele não couber abaixo dos 95% do limite. */
export async function conferirEspaco(bytesNovos: number) {
  const uso = await usoDoS3();
  if (!uso) return;
  if (uso.usadoBytes + bytesNovos > uso.limiteBytes * FRACAO_DE_RECUSA) {
    throw new ArmazenamentoCheio(`${servicoDoS3()} em ${(uso.fracao * 100).toFixed(1)}% de ${(uso.limiteBytes / MB).toFixed(0)} MB`);
  }
  if (uso.nivel === 'atencao') {
    console.warn(`[armazenamento] ATENÇÃO: ${servicoDoS3()} em ${(uso.fracao * 100).toFixed(1)}% do limite. Rode npm run storage:relatorio e veja "Espaço das fotos" no README.`);
  }
}

// ------------------------------------------------------------------------------------------
// Relatório (npm run storage:relatorio, com STORAGE_PROVIDER=s3)
// ------------------------------------------------------------------------------------------

/**
 * Quando a foto entrou. O bucket só guarda a data em que o objeto foi gravado NELE, e a migração do
 * Supabase regravou tudo no mesmo dia; por isso vale primeiro o instante que está no nome do
 * arquivo (…/01-20260929T170207123.jpg, a hora da captura) e só depois a data do objeto.
 */
function quandoEntrou(o: ObjetoDoS3) {
  const m = /-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\d{0,3}\.[a-z0-9]+$/i.exec(o.caminho);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : o.modificadoEm;
}
const mesDe = (data: Date) => data.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

/** O mesmo relatório do Supabase Storage, montado com a listagem do bucket (só leitura). */
export async function relatorioDoS3(): Promise<RelatorioDoStorage> {
  const objetos = await listarDoS3();
  const tipoDe = (c: string) =>
    c.includes('/videos/') ? 'videos' : c.startsWith('miniaturas/') ? 'miniaturas' : c.includes('/substituidas/') ? 'substituidas' : 'fotos';
  const grupos = {
    fotos: { arquivos: 0, bytes: 0 },
    miniaturas: { arquivos: 0, bytes: 0 },
    substituidas: { arquivos: 0, bytes: 0 },
    videos: { arquivos: 0, bytes: 0 },
  };
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
  const usadoBytes = grupos.fotos.bytes + grupos.miniaturas.bytes + grupos.substituidas.bytes + grupos.videos.bytes;
  const limiteBytes = limiteDoS3Bytes();
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
    videos: grupos.videos,
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
export async function enviarAoS3(caminho: string, dados: Buffer, tipo: string, opcoes: { conferir?: boolean } = {}) {
  if (opcoes.conferir !== false) await conferirEspaco(dados.length);
  const resposta = await chamar('PUT', caminho, { corpo: dados, cabecalhos: { 'Content-Type': tipo } });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`envio recusado pelo ${servicoDoS3()}: ${await motivo(resposta)}`);
  if (usoEmCache) {
    // várias fotos seguidas não passam do limite entre uma medição e outra
    usoEmCache.usadoBytes += dados.length;
    usoEmCache.arquivos += 1;
  }
}

export async function baixarDoS3(caminho: string): Promise<Buffer> {
  const resposta = await chamar('GET', caminho);
  if (resposta.status === 404) throw new ArquivoNaoEncontrado(`Arquivo não encontrado: ${caminho}`);
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`leitura recusada pelo ${servicoDoS3()}: ${await motivo(resposta)}`);
  return Buffer.from(await resposta.arrayBuffer());
}

/** Tamanho do objeto, ou null se não existe. Para a migração saber o que já foi copiado. */
export async function tamanhoNoS3(caminho: string): Promise<number | null> {
  const resposta = await chamar('HEAD', caminho);
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`o ${servicoDoS3()} respondeu ${resposta.status} ao consultar ${caminho}`);
  return Number(resposta.headers.get('content-length') ?? 0);
}

/** A API do S3 não tem "mover": copia dentro do bucket e apaga o original. */
export async function moverNoS3(de: string, para: string) {
  const copia = await chamar('PUT', para, { cabecalhos: { 'x-amz-copy-source': caminhoNaUrl(de) } });
  if (!copia.ok) throw new ArmazenamentoIndisponivel(`não foi possível mover ${de}: ${await motivo(copia)}`);
  await copia.arrayBuffer().catch(() => undefined);
  await apagarDoS3([de]);
}

/** Apagar o que não existe não é erro (o serviço responde 204 do mesmo jeito). */
export async function apagarDoS3(caminhos: string[]) {
  for (const caminho of caminhos) {
    const resposta = await chamar('DELETE', caminho);
    if (!resposta.ok && resposta.status !== 404) throw new ArmazenamentoIndisponivel(`não foi possível apagar ${caminho}: ${await motivo(resposta)}`);
  }
  if (caminhos.length) usoEmCache = null;
}

/**
 * Link assinado, com expiração, para LER um objeto sem as chaves (URL pré-assinada do S3).
 * NENHUMA rota usa isto hoje: as fotos saem só por /api/fotos/:id (regra 6). Fica pronto, e
 * conferido pelo `npm run s3:conferir`, para quando um arquivo grande (vídeo) não puder passar
 * pela memória da API. Antes de entregar um link destes a um navegador, decida com o cliente:
 * quem tem o link abre o arquivo sem login até ele expirar.
 *
 * O prazo conta a partir do relógio DESTE servidor, e o serviço compara com o dele: com prazo
 * de poucos segundos, um relógio atrasado faz o link chegar já vencido. Use minutos, não segundos.
 * `agora` só existe para o s3:conferir montar um link sabidamente vencido.
 */
export function linkAssinadoDoS3(caminho: string, segundos = 300, agora = new Date(), metodo: 'GET' | 'PUT' = 'GET'): string {
  const destino = endpoint();
  const { amz, dia } = instante(agora);
  const escopo = `${dia}/${regiao()}/${SERVICO}/aws4_request`;
  const consulta: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${idDaChave()!}/${escopo}`],
    ['X-Amz-Date', amz],
    ['X-Amz-Expires', String(Math.min(Math.max(1, Math.round(segundos)), 7 * 24 * 3600))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const a = assinar({ metodo, caminho: caminhoNaUrl(caminho), consulta, cabecalhos: { host: destino.host }, hashDoCorpo: 'UNSIGNED-PAYLOAD', amz, dia });
  return `${destino.origin}${caminhoNaUrl(caminho)}?${a.consulta}&X-Amz-Signature=${a.assinatura}`;
}

/**
 * Link assinado de ESCRITA (PUT) num caminho: o celular envia o vídeo direto ao bucket, sem
 * passar pela API. Só o host entra na assinatura: o Content-Type vai livre no pedido do celular
 * e fica gravado no objeto. Vale `segundos` (padrão 10 min) para COMEÇAR o envio; a fila pede um
 * link novo a cada tentativa. Exige CORS no bucket liberando PUT a partir do endereço do app.
 */
export const linkDeEnvioDoS3 = (caminho: string, segundos = 600) => linkAssinadoDoS3(caminho, segundos, new Date(), 'PUT');

/**
 * Para o s3:conferir: o objeto abre pela API S3 SEM assinatura? Tem de ser não. (true = abriu.)
 * No R2, o endereço público é outro (r2.dev ou domínio próprio) e só se confere no painel.
 */
export async function abreSemAssinatura(caminho: string): Promise<boolean> {
  const resposta = await fetch(`${endpoint().origin}${caminhoNaUrl(caminho)}`, { signal: AbortSignal.timeout(15_000) });
  return resposta.ok;
}

// ------------------------------------------------------------------------------------------
// Configuração do bucket: CORS (npm run s3:cors) e leitura do Lifecycle (para conferir que o
// CORS não mexeu nele). Mesma assinatura dos outros pedidos.
// ------------------------------------------------------------------------------------------

/** Resposta de uma configuração do bucket: o XML, ou null quando o bucket não tem nenhuma. */
type ConfiguracaoLida = { xml: string | null; erro?: string };

async function lerConfiguracaoDoBucket(subrecurso: 'cors' | 'lifecycle', semConfiguracao: string): Promise<ConfiguracaoLida> {
  let resposta: Response;
  try {
    resposta = await chamar('GET', undefined, { consulta: { [subrecurso]: '' } });
  } catch (erro) {
    // sem resposta, ou 5xx depois das novas tentativas (ex.: 501, serviço que não implementa)
    return { xml: null, erro: (erro as Error).message };
  }
  if (resposta.ok) return { xml: await resposta.text() };
  const texto = await resposta.text().catch(() => '');
  if (resposta.status === 404 && texto.includes(semConfiguracao)) return { xml: null };
  const codigo = /<Code>([^<]*)<\/Code>/.exec(texto)?.[1] ?? '';
  const mensagem = /<Message>([^<]*)<\/Message>/.exec(texto)?.[1] ?? '';
  return { xml: null, erro: `${resposta.status} ${codigo} ${mensagem}`.replace(/\s+/g, ' ').trim() };
}

/** GetBucketCors: as regras de CORS do bucket (as da API S3; as da API nativa do B2 não aparecem). */
export const lerCorsDoS3 = () => lerConfiguracaoDoBucket('cors', 'NoSuchCORSConfiguration');

/** GetBucketLifecycleConfiguration: só leitura, para comparar antes e depois. */
export const lerLifecycleDoS3 = () => lerConfiguracaoDoBucket('lifecycle', 'NoSuchLifecycleConfiguration');

/**
 * PutBucketCors: SUBSTITUI a configuração de CORS do bucket inteira (quem chama manda também as
 * regras que quer manter). Não mexe no Lifecycle nem em outra configuração: cada uma é um
 * subrecurso separado (?cors, ?lifecycle) e o Lifecycle exige outra permissão para ser gravado.
 * No Backblaze, exige uma chave com `writeBuckets`, que chave restrita a um bucket NÃO tem.
 */
export async function gravarCorsDoS3(xml: string) {
  const corpo = Buffer.from(xml, 'utf8');
  const resposta = await chamar('PUT', undefined, {
    consulta: { cors: '' },
    corpo,
    cabecalhos: { 'content-type': 'application/xml', 'content-md5': createHash('md5').update(corpo).digest('base64') },
  });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(await motivo(resposta));
}
