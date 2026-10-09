import { ArmazenamentoIndisponivel, ArquivoNaoEncontrado } from './sharepoint';
import { prisma } from './prisma';

/*
 * Fotos no Supabase Storage — o destino DEFINITIVO das fotos (STORAGE_PROVIDER=supabase).
 * O SharePoint saiu do escopo: o cliente usa conta PESSOAL da Microsoft (sem tenant, sem Entra,
 * sem SharePoint), e o provedor "sharepoint" exige tenant corporativo (CLAUDE.md).
 *
 * Segurança (regra 6 do CLAUDE.md):
 * - o bucket tem de ser PRIVADO: a API confere e RECUSA gravar se ele estiver público;
 * - quem fala com o Storage é só esta API, com a chave de serviço, que fica só no servidor;
 * - nenhum link do Supabase (público ou assinado) é gerado nem sai da API: as fotos continuam
 *   saindo só por GET /api/fotos/:id, com login e a conferência de papel e de escala.
 *
 * Chave no banco: "sb:<caminho no bucket>". Caminhos só com letras sem acento, números, "-", "_"
 * e "/": o Storage recusa acento no nome do objeto.
 *
 *   PRJ-2026-0015/<id do serviço>/01-20260929-140207.jpg     item 1 do checklist
 *   PRJ-2026-0015/<id do serviço>/extra-20260929-143502.jpg  foto extra
 *   PRJ-2026-0015/<id do serviço>/substituidas/…             fotos refeitas (nada é apagado)
 *   miniaturas/PRJ-2026-0015/<id do serviço>/….jpg           miniaturas (480 px), geradas uma vez
 *
 * O horário vai até os segundos: reenviar a mesma foto gera o mesmo nome e substitui o arquivo
 * (x-upsert), em vez de duplicar.
 *
 * Espaço: o plano gratuito do Supabase dá cerca de 1 GB de Storage. O teto vem da variável
 * SUPABASE_STORAGE_LIMITE_MB (mude-a se o plano mudar). A API mede o uso (tabela storage.objects
 * do próprio banco), AVISA a partir de 70% e RECUSA fotos novas a partir de 95%, com mensagem
 * para o técnico, antes de o Supabase recusar por conta própria. `npm run storage:relatorio`
 * mostra o crescimento por mês e quantos meses faltam para o teto.
 */

export class ArmazenamentoCheio extends Error {}

export const VARIAVEIS_DO_SUPABASE = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BUCKET'] as const;
export const variaveisDoSupabaseFaltando = () => VARIAVEIS_DO_SUPABASE.filter((nome) => !process.env[nome]?.trim());

const base = () => `${process.env.SUPABASE_URL!.trim().replace(/\/+$/, '')}/storage/v1`;
export const bucketDasFotos = () => process.env.SUPABASE_BUCKET!.trim();
const cabecalhos = () => {
  const chave = process.env.SUPABASE_SERVICE_KEY!.trim();
  return { Authorization: `Bearer ${chave}`, apikey: chave };
};
/** Cada parte do caminho codificada; as barras ficam. */
const naUrl = (caminho: string) => caminho.split('/').map(encodeURIComponent).join('/');

const ESPERAS_MS = [400, 1500];

/** Chamada ao Storage com novas tentativas em falha de rede, 429 e 5xx. */
async function chamar(metodo: string, rota: string, opcoes: { corpo?: Buffer | string; cabecalhos?: Record<string, string> } = {}): Promise<Response> {
  // a API sobe mesmo sem estas variáveis (modo degradado): aqui a falta vira "indisponível" (503)
  const faltam = variaveisDoSupabaseFaltando();
  if (faltam.length) throw new ArmazenamentoIndisponivel(`Supabase Storage sem configuração: faltam ${faltam.join(', ')}`);
  let ultimo = '';
  for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa - 1]));
    let resposta: Response;
    try {
      resposta = await fetch(`${base()}${rota}`, {
        method: metodo,
        headers: { ...cabecalhos(), ...opcoes.cabecalhos },
        // Buffer é um Uint8Array: o fetch do Node aceita como corpo
        body: opcoes.corpo as BodyInit | undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      ultimo = `sem resposta do Supabase Storage (${(erro as Error).message})`;
      continue;
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      ultimo = `Supabase Storage respondeu ${resposta.status}`;
      continue;
    }
    return resposta;
  }
  throw new ArmazenamentoIndisponivel(ultimo);
}

/** Texto do erro que o Storage devolve ({ message, error, statusCode }), sem segredo nenhum. */
async function motivo(resposta: Response) {
  const texto = await resposta.text().catch(() => '');
  try {
    const j = JSON.parse(texto) as { message?: string; error?: string };
    return `${resposta.status} ${j.message ?? j.error ?? ''}`.trim();
  } catch {
    return `${resposta.status} ${texto.slice(0, 120)}`.trim();
  }
}

// ------------------------------------------------------------------------------------------
// Bucket privado: conferido antes de gravar (e de novo a cada 10 minutos)
// ------------------------------------------------------------------------------------------

let privadoConferidoEm = 0;

/** Lança erro se o bucket não existir ou estiver PÚBLICO. Usada ao gravar e no storage:conferir. */
export async function conferirBucketPrivado(forcar = false) {
  if (!forcar && Date.now() - privadoConferidoEm < 10 * 60_000) return;
  const resposta = await chamar('GET', `/bucket/${encodeURIComponent(bucketDasFotos())}`);
  if (!resposta.ok) {
    throw new ArmazenamentoIndisponivel(`não foi possível conferir o bucket "${bucketDasFotos()}": ${await motivo(resposta)}`);
  }
  const bucket = (await resposta.json()) as { public?: boolean };
  if (bucket.public !== false) {
    privadoConferidoEm = 0;
    throw new ArmazenamentoIndisponivel(
      `o bucket "${bucketDasFotos()}" está PÚBLICO. As fotos dos clientes não podem ficar em bucket público: ` +
        'no painel do Supabase, Storage › o bucket › Edit bucket › desligue "Public bucket". Nada foi gravado.',
    );
  }
  privadoConferidoEm = Date.now();
}

// ------------------------------------------------------------------------------------------
// Espaço usado
// ------------------------------------------------------------------------------------------

const MB = 1024 * 1024;
/** Usado só se SUPABASE_STORAGE_LIMITE_MB não estiver definida: o plano gratuito (1 GB). */
const LIMITE_SEM_A_VARIAVEL_MB = 1024;
/** Teto do plano: variável SUPABASE_STORAGE_LIMITE_MB (render.yaml e .env.example). */
export const limiteDoStorageBytes = () =>
  (Number(process.env.SUPABASE_STORAGE_LIMITE_MB) > 0 ? Number(process.env.SUPABASE_STORAGE_LIMITE_MB) : LIMITE_SEM_A_VARIAVEL_MB) * MB;
export const FRACAO_DE_AVISO = 0.7;
export const FRACAO_DE_RECUSA = 0.95;

export type UsoDoStorage = { usadoBytes: number; limiteBytes: number; fracao: number; arquivos: number; nivel: 'ok' | 'atencao' | 'cheio' };

let usoEmCache: { em: number; usadoBytes: number; arquivos: number } | null = null;

const montarUso = (usadoBytes: number, arquivos: number): UsoDoStorage => {
  const limiteBytes = limiteDoStorageBytes();
  const fracao = usadoBytes / limiteBytes;
  return { usadoBytes, limiteBytes, fracao, arquivos, nivel: fracao >= FRACAO_DE_RECUSA ? 'cheio' : fracao >= FRACAO_DE_AVISO ? 'atencao' : 'ok' };
};

/**
 * Quanto do Storage está em uso, lido da tabela storage.objects do MESMO banco (o Storage do
 * Supabase guarda ali o tamanho de cada objeto): conta tudo o que ocupa espaço no projeto,
 * inclusive miniaturas e substituídas. A leitura fica 2 minutos em memória (cada ida ao banco
 * custa), somando nela o que esta API gravou nesse meio-tempo.
 * null se a tabela não existir (banco que não é do Supabase): aí não há limite a conferir.
 */
export async function usoDoStorage(forcar = false): Promise<UsoDoStorage | null> {
  if (!forcar && usoEmCache && Date.now() - usoEmCache.em < 2 * 60_000) return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
  let linhas: { bytes: bigint | number | null; arquivos: bigint | number }[];
  try {
    linhas = await prisma.$queryRaw`select coalesce(sum((metadata->>'size')::bigint), 0) as bytes, count(*) as arquivos from storage.objects`;
  } catch (erro) {
    console.warn(`[armazenamento] não foi possível medir o uso do Storage: ${(erro as Error).message.split('\n').pop()}`);
    return null;
  }
  usoEmCache = { em: Date.now(), usadoBytes: Number(linhas[0]?.bytes ?? 0), arquivos: Number(linhas[0]?.arquivos ?? 0) };
  return montarUso(usoEmCache.usadoBytes, usoEmCache.arquivos);
}

// ------------------------------------------------------------------------------------------
// Relatório (npm run storage:relatorio)
// ------------------------------------------------------------------------------------------

type Grupo = { arquivos: number; bytes: number };
export type RelatorioDoStorage = {
  usadoBytes: number;
  limiteBytes: number;
  fracao: number;
  arquivos: number;
  /** as fotos dos serviços (o que o técnico enviou e está valendo) */
  fotos: Grupo & { mediaBytes: number };
  /** miniaturas de 480 px, geradas na primeira vez que a foto é vista */
  miniaturas: Grupo;
  /** fotos refeitas: a versão anterior fica guardada (nada é apagado) */
  substituidas: Grupo;
  /** o que entrou em cada mês (pela data de criação do arquivo), do mais antigo ao mais novo */
  porMes: { mes: string; arquivos: number; bytes: number }[];
  /** ritmo atual: o que entrou nos últimos 90 dias (ou desde o primeiro arquivo), por mês */
  ritmoMensalBytes: number | null;
  diasMedidos: number;
  /** meses até o teto nesse ritmo; null sem ritmo (bucket vazio ou parado) */
  mesesAteOTeto: number | null;
  /** as fotos (sem miniaturas nem refeitas) que entraram no mês corrente: base da estimativa de egress */
  fotosDoMes: Grupo;
};

/*
 * EGRESS: o segundo teto do plano gratuito do Supabase (cerca de 5 GB por mês). Armazenamento é o
 * que FICA guardado; egress é o que SAI: toda vez que alguém abre uma foto, a API a baixa do
 * Storage de novo (ela não guarda cópia; o navegador de quem viu guarda por 7 dias).
 * O sistema não registra cada abertura e o Supabase não expõe o egress no banco: o número exato
 * só existe no painel (Settings -> Usage). O relatório imprime uma CONTA APROXIMADA, com estas
 * hipóteses por foto que entrou no mês: a foto inteira sai 3 vezes (a API a lê para gerar a
 * miniatura, o gestor a amplia na validação e alguém a reabre depois) e a miniatura 10 vezes.
 */
export const limiteDeEgressBytes = () => (Number(process.env.SUPABASE_EGRESS_LIMITE_MB) > 0 ? Number(process.env.SUPABASE_EGRESS_LIMITE_MB) : 5 * 1024) * MB;
export const ABERTURAS_DA_FOTO_INTEIRA = 3;
export const ABERTURAS_DA_MINIATURA = 10;
const MINIATURA_TIPICA = 30 * 1024;

/** Estimativa do egress do mês corrente causado pelas fotos (não mede: ver o comentário acima). */
export function egressEstimado(r: RelatorioDoStorage) {
  const mediaDaFoto = r.fotosDoMes.arquivos ? r.fotosDoMes.bytes / r.fotosDoMes.arquivos : r.fotos.mediaBytes;
  const mediaDaMiniatura = r.miniaturas.arquivos ? r.miniaturas.bytes / r.miniaturas.arquivos : MINIATURA_TIPICA;
  const bytes = r.fotosDoMes.arquivos * (ABERTURAS_DA_FOTO_INTEIRA * mediaDaFoto + ABERTURAS_DA_MINIATURA * mediaDaMiniatura);
  return { bytes, limiteBytes: limiteDeEgressBytes(), fracao: bytes / limiteDeEgressBytes(), mediaDaFoto, mediaDaMiniatura };
}

/** Lê tudo de storage.objects (só leitura). null se a tabela não existir (banco fora do Supabase). */
export async function relatorioDoStorage(): Promise<RelatorioDoStorage | null> {
  type Linha = { mes: string; tipo: 'fotos' | 'miniaturas' | 'substituidas'; arquivos: bigint | number; bytes: bigint | number | null };
  type Recente = { primeiro: Date | null; recentes: bigint | number | null };
  let linhas: Linha[];
  let recente: Recente[];
  try {
    [linhas, recente] = await Promise.all([
      prisma.$queryRaw<Linha[]>`
        select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
               case when name like 'miniaturas/%' then 'miniaturas' when name like '%/substituidas/%' then 'substituidas' else 'fotos' end as tipo,
               count(*) as arquivos, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
        from storage.objects group by 1, 2 order by 1`,
      prisma.$queryRaw<Recente[]>`
        select min(created_at) as primeiro,
               coalesce(sum((metadata->>'size')::bigint) filter (where created_at >= now() - interval '90 days'), 0) as recentes
        from storage.objects`,
    ]);
  } catch {
    return null;
  }
  const soma = (tipo: Linha['tipo']): Grupo =>
    linhas.filter((l) => l.tipo === tipo).reduce((t, l) => ({ arquivos: t.arquivos + Number(l.arquivos), bytes: t.bytes + Number(l.bytes ?? 0) }), { arquivos: 0, bytes: 0 });
  const fotos = soma('fotos');
  const miniaturas = soma('miniaturas');
  const substituidas = soma('substituidas');
  const usadoBytes = fotos.bytes + miniaturas.bytes + substituidas.bytes;
  const limiteBytes = limiteDoStorageBytes();

  const meses = new Map<string, { mes: string; arquivos: number; bytes: number }>();
  for (const l of linhas) {
    const m = meses.get(l.mes) ?? { mes: l.mes, arquivos: 0, bytes: 0 };
    m.arquivos += Number(l.arquivos);
    m.bytes += Number(l.bytes ?? 0);
    meses.set(l.mes, m);
  }

  // "AAAA-MM" de hoje no fuso da empresa, como o banco agrupa
  const mesCorrente = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  const primeiro = recente[0]?.primeiro ?? null;
  const diasMedidos = primeiro ? Math.min(90, Math.max(1, (Date.now() - primeiro.getTime()) / 864e5)) : 0;
  const recentes = Number(recente[0]?.recentes ?? 0);
  const ritmoMensalBytes = diasMedidos > 0 && recentes > 0 ? (recentes / diasMedidos) * 30.44 : null;
  return {
    usadoBytes,
    limiteBytes,
    fracao: usadoBytes / limiteBytes,
    arquivos: fotos.arquivos + miniaturas.arquivos + substituidas.arquivos,
    fotos: { ...fotos, mediaBytes: fotos.arquivos ? fotos.bytes / fotos.arquivos : 0 },
    miniaturas,
    substituidas,
    porMes: [...meses.values()],
    fotosDoMes: linhas
      .filter((l) => l.tipo === 'fotos' && l.mes === mesCorrente)
      .reduce((t, l) => ({ arquivos: t.arquivos + Number(l.arquivos), bytes: t.bytes + Number(l.bytes ?? 0) }), { arquivos: 0, bytes: 0 }),
    ritmoMensalBytes,
    diasMedidos,
    mesesAteOTeto: ritmoMensalBytes ? Math.max(0, limiteBytes - usadoBytes) / ritmoMensalBytes : null,
  };
}

/** Recusa a foto nova se ela não couber abaixo dos 95% do limite. */
async function conferirEspaco(bytesNovos: number) {
  const uso = await usoDoStorage();
  if (!uso) return;
  if (uso.usadoBytes + bytesNovos > uso.limiteBytes * FRACAO_DE_RECUSA) {
    throw new ArmazenamentoCheio(`Storage em ${(uso.fracao * 100).toFixed(1)}% de ${(uso.limiteBytes / MB).toFixed(0)} MB`);
  }
  if (uso.nivel === 'atencao') {
    console.warn(`[armazenamento] ATENÇÃO: Storage em ${(uso.fracao * 100).toFixed(1)}% do limite. Rode npm run storage:relatorio e veja "Espaço das fotos" no README.`);
  }
}

/** Conta o que acabou de ser gravado no uso em memória, para várias fotos seguidas não passarem do limite. */
function contarGravado(bytes: number) {
  if (usoEmCache) {
    usoEmCache.usadoBytes += bytes;
    usoEmCache.arquivos += 1;
  }
}

// ------------------------------------------------------------------------------------------
// Operações
// ------------------------------------------------------------------------------------------

/** Grava (ou substitui) um objeto. `conferir: false` só para a miniatura, que é pequena e derivada. */
export async function enviarAoSupabase(caminho: string, dados: Buffer, tipo: string, opcoes: { conferir?: boolean } = {}) {
  if (opcoes.conferir !== false) {
    await conferirBucketPrivado();
    await conferirEspaco(dados.length);
  }
  const resposta = await chamar('POST', `/object/${encodeURIComponent(bucketDasFotos())}/${naUrl(caminho)}`, {
    corpo: dados,
    cabecalhos: { 'Content-Type': tipo, 'x-upsert': 'true', 'Cache-Control': 'private, max-age=0' },
  });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`envio recusado pelo Supabase Storage: ${await motivo(resposta)}`);
  contarGravado(dados.length);
}

/** Lê um objeto com a chave de serviço (rota autenticada do Storage; nunca a rota pública). */
export async function baixarDoSupabase(caminho: string): Promise<Buffer> {
  const resposta = await chamar('GET', `/object/authenticated/${encodeURIComponent(bucketDasFotos())}/${naUrl(caminho)}`);
  if (resposta.status === 404 || resposta.status === 400) {
    // o Storage responde 400 com "Object not found" para objeto que não existe
    const texto = await motivo(resposta);
    if (resposta.status === 404 || /not.?found/i.test(texto)) throw new ArquivoNaoEncontrado(`Arquivo não encontrado: ${caminho}`);
    throw new ArmazenamentoIndisponivel(`leitura recusada pelo Supabase Storage: ${texto}`);
  }
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`leitura recusada pelo Supabase Storage: ${await motivo(resposta)}`);
  return Buffer.from(await resposta.arrayBuffer());
}

export async function moverNoSupabase(de: string, para: string) {
  const resposta = await chamar('POST', '/object/move', {
    corpo: JSON.stringify({ bucketId: bucketDasFotos(), sourceKey: de, destinationKey: para }),
    cabecalhos: { 'Content-Type': 'application/json' },
  });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`não foi possível mover ${de}: ${await motivo(resposta)}`);
}

export async function apagarDoSupabase(caminhos: string[]) {
  if (caminhos.length === 0) return;
  const resposta = await chamar('DELETE', `/object/${encodeURIComponent(bucketDasFotos())}`, {
    corpo: JSON.stringify({ prefixes: caminhos }),
    cabecalhos: { 'Content-Type': 'application/json' },
  });
  if (!resposta.ok) throw new ArmazenamentoIndisponivel(`não foi possível apagar: ${await motivo(resposta)}`);
  usoEmCache = null;
}

/**
 * Para o storage:conferir: o objeto abre SEM login pela rota pública do Storage? Tem de ser não.
 * (true = está exposto.)
 */
export async function abreSemLogin(caminho: string): Promise<boolean> {
  const url = `${base()}/object/public/${encodeURIComponent(bucketDasFotos())}/${naUrl(caminho)}`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return resposta.ok;
}
