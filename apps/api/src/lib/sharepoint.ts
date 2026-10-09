/*
 * FORA DE ESCOPO (mantido para quem um dia tiver o que ele exige): este provedor precisa de um
 * TENANT CORPORATIVO da Microsoft (Microsoft 365 empresarial, com Entra ID para registrar o
 * aplicativo e SharePoint para a biblioteca). A Guarusolar usa conta PESSOAL da Microsoft, que
 * não tem tenant, Entra nem SharePoint: por isso as fotos ficam no Supabase Storage, em
 * definitivo (lib/supabaseStorage.ts; CLAUDE.md). Não proponha "migrar para o SharePoint".
 *
 * Fotos no SharePoint do cliente, pelo Microsoft Graph, com credencial de APLICATIVO
 * (client credentials: sem login de pessoa). Permissão Sites.Selected, liberada só para o
 * site da Guarusolar (README, "Fotos no SharePoint").
 *
 * - Token guardado em memória até perto de vencer (~1 h).
 * - Cada chamada tem tempo-limite; falha de rede, 429 e 5xx tentam de novo (respeitando o
 *   Retry-After); se não der, ArmazenamentoIndisponivel -> a rota responde 503 e a fila do
 *   celular reenvia a foto depois. Nada fica guardado no disco do servidor.
 * - O arquivo sai sempre pela API (que confere login e equipe); os links diretos de download
 *   do Graph abrem sem login, então nunca vão para as telas.
 */

export class ArmazenamentoIndisponivel extends Error {}
export class ArquivoNaoEncontrado extends Error {}

const TEMPO_MAXIMO = 30_000;
const TENTATIVAS = 3;

type Configuracao = {
  tenant: string;
  clientId: string;
  segredo: string;
  siteUrl: string;
  biblioteca: string;
  graph: string;
  login: string;
};

export const VARIAVEIS_OBRIGATORIAS = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SITE_URL', 'MS_BIBLIOTECA'] as const;

export const variaveisFaltando = () => VARIAVEIS_OBRIGATORIAS.filter((nome) => !process.env[nome]?.trim());

function configuracao(): Configuracao {
  const faltando = variaveisFaltando();
  if (faltando.length) throw new ArmazenamentoIndisponivel(`SharePoint sem configuração: faltam ${faltando.join(', ')}`);
  return {
    tenant: process.env.MS_TENANT_ID!.trim(),
    clientId: process.env.MS_CLIENT_ID!.trim(),
    segredo: process.env.MS_CLIENT_SECRET!.trim(),
    siteUrl: process.env.MS_SITE_URL!.trim(),
    biblioteca: process.env.MS_BIBLIOTECA!.trim(),
    // só para testes com um simulador local; em produção ficam os endereços da Microsoft
    graph: (process.env.MS_GRAPH_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, ''),
    login: (process.env.MS_LOGIN_URL ?? 'https://login.microsoftonline.com').replace(/\/+$/, ''),
  };
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const esperaSugerida = (resposta: Response, tentativa: number) => {
  const segundos = Number(resposta.headers.get('retry-after'));
  return Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, 10) * 1000 : 1000 * 2 ** tentativa;
};

// ------------------------------------------------------------------------------------------
// Token de aplicativo
// ------------------------------------------------------------------------------------------

let token: { valor: string; venceEm: number } | null = null;

async function obterToken(renovar = false): Promise<string> {
  if (!renovar && token && token.venceEm > Date.now()) return token.valor;
  const c = configuracao();
  let resposta: Response;
  try {
    resposta = await fetch(`${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: c.clientId,
        client_secret: c.segredo,
        scope: 'https://graph.microsoft.com/.default',
      }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO),
    });
  } catch {
    throw new ArmazenamentoIndisponivel('Sem conexão com a Microsoft para obter o token');
  }
  const corpo = (await resposta.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!resposta.ok || !corpo.access_token) {
    // credencial errada ou vencida: problema de configuração, não de rede
    throw new ArmazenamentoIndisponivel(
      `A Microsoft recusou a credencial do aplicativo (${resposta.status} ${corpo.error ?? ''}). Confira MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET (e a validade do segredo).`,
    );
  }
  // renova 5 min antes de vencer
  token = { valor: corpo.access_token, venceEm: Date.now() + ((corpo.expires_in ?? 3600) - 300) * 1000 };
  return token.valor;
}

// ------------------------------------------------------------------------------------------
// Chamada ao Graph com novas tentativas
// ------------------------------------------------------------------------------------------

type Pedido = { metodo?: string; corpo?: BodyInit; tipo?: string; json?: unknown };

async function graph(caminho: string, pedido: Pedido = {}): Promise<Response> {
  const c = configuracao();
  const url = caminho.startsWith('http') ? caminho : `${c.graph}${caminho}`;
  let renovou = false;
  let ultimoErro = 'sem resposta';

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const cabecalhos: Record<string, string> = { authorization: `Bearer ${await obterToken()}` };
    let corpo = pedido.corpo;
    if (pedido.json !== undefined) {
      cabecalhos['content-type'] = 'application/json';
      corpo = JSON.stringify(pedido.json);
    } else if (pedido.tipo) {
      cabecalhos['content-type'] = pedido.tipo;
    }

    let resposta: Response;
    try {
      resposta = await fetch(url, { method: pedido.metodo ?? 'GET', headers: cabecalhos, body: corpo, signal: AbortSignal.timeout(TEMPO_MAXIMO) });
    } catch (erro) {
      ultimoErro = (erro as Error).name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede';
      await esperar(1000 * 2 ** tentativa);
      continue;
    }

    if (resposta.ok) return resposta;
    if (resposta.status === 404) throw new ArquivoNaoEncontrado(`Não encontrado no SharePoint: ${caminho}`);
    if (resposta.status === 401 && !renovou) {
      renovou = true;
      await obterToken(true);
      tentativa--; // renovar o token não conta como tentativa
      continue;
    }
    const detalhe = await resposta.text().catch(() => '');
    ultimoErro = `${resposta.status} ${detalhe.slice(0, 200)}`;
    if (resposta.status === 429 || resposta.status >= 500) {
      await esperar(esperaSugerida(resposta, tentativa));
      continue;
    }
    if (resposta.status === 409) {
      const erro = new ArmazenamentoIndisponivel(`Conflito no SharePoint: ${ultimoErro}`);
      (erro as ArmazenamentoIndisponivel & { conflito: true }).conflito = true;
      throw erro;
    }
    // 400/403: pedido ou permissão errados (ex.: site não liberado para o aplicativo)
    throw new ArmazenamentoIndisponivel(`O SharePoint recusou o pedido (${ultimoErro}). Confira a permissão do aplicativo no site.`);
  }
  throw new ArmazenamentoIndisponivel(`SharePoint indisponível depois de ${TENTATIVAS} tentativas (${ultimoErro})`);
}

// ------------------------------------------------------------------------------------------
// Site e biblioteca (descobertos uma vez)
// ------------------------------------------------------------------------------------------

let biblioteca: { siteId: string; driveId: string } | null = null;

export async function bibliotecaDasFotos() {
  if (biblioteca) return biblioteca;
  const c = configuracao();
  const site = new URL(c.siteUrl);
  const caminhoDoSite = site.pathname.replace(/\/+$/, '');
  const { id: siteId } = (await (await graph(`/sites/${site.hostname}:${caminhoDoSite}`)).json()) as { id: string };
  const { value: drives } = (await (await graph(`/sites/${siteId}/drives?$select=id,name`)).json()) as {
    value: { id: string; name: string }[];
  };
  const drive = drives.find((d) => d.name.toLocaleLowerCase('pt-BR') === c.biblioteca.toLocaleLowerCase('pt-BR'));
  if (!drive) {
    throw new ArmazenamentoIndisponivel(
      `A biblioteca "${c.biblioteca}" não existe no site. Bibliotecas encontradas: ${drives.map((d) => d.name).join(', ')}`,
    );
  }
  biblioteca = { siteId, driveId: drive.id };
  return biblioteca;
}

const codificar = (segmentos: string[]) => segmentos.map(encodeURIComponent).join('/');

// ------------------------------------------------------------------------------------------
// Operações usadas pelo armazenamento
// ------------------------------------------------------------------------------------------

/** Envia (ou substitui, se o mesmo nome já existir) e devolve o id do arquivo no SharePoint. */
export async function enviarAoSharepoint(segmentos: string[], dados: Buffer, tipo: string): Promise<string> {
  const { driveId } = await bibliotecaDasFotos();
  // as pastas que faltarem são criadas pelo próprio Graph no envio por caminho
  const resposta = await graph(`/drives/${driveId}/root:/${codificar(segmentos)}:/content?@microsoft.graph.conflictBehavior=replace`, {
    metodo: 'PUT',
    corpo: new Uint8Array(dados),
    tipo,
  });
  const item = (await resposta.json()) as { id: string };
  return item.id;
}

export async function baixarDoSharepoint(itemId: string): Promise<Buffer> {
  const { driveId } = await bibliotecaDasFotos();
  // o Graph redireciona para um link de download; o fetch segue sem levar o token adiante
  const resposta = await graph(`/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`);
  return Buffer.from(await resposta.arrayBuffer());
}

/** Miniatura gerada pelo próprio SharePoint (até 480 px). null se ainda não existir. */
export async function miniaturaDoSharepoint(itemId: string): Promise<Buffer | null> {
  const { driveId } = await bibliotecaDasFotos();
  try {
    const resposta = await graph(`/drives/${driveId}/items/${encodeURIComponent(itemId)}/thumbnails/0/c480x480/content`);
    return Buffer.from(await resposta.arrayBuffer());
  } catch (erro) {
    if (erro instanceof ArquivoNaoEncontrado) return null; // logo depois do envio ainda não há
    throw erro;
  }
}

/** Move o arquivo para a pasta "Substituídas" ao lado dele (foto refeita: nada é apagado). */
export async function moverNoSharepoint(itemId: string, nomeDaPasta: string) {
  const { driveId } = await bibliotecaDasFotos();
  const item = (await (await graph(`/drives/${driveId}/items/${encodeURIComponent(itemId)}?$select=id,parentReference`)).json()) as {
    parentReference: { id: string };
  };
  const pai = item.parentReference.id;
  let pastaId: string;
  try {
    const criada = await graph(`/drives/${driveId}/items/${pai}/children`, {
      metodo: 'POST',
      json: { name: nomeDaPasta, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    });
    pastaId = ((await criada.json()) as { id: string }).id;
  } catch (erro) {
    if (!(erro as { conflito?: boolean }).conflito) throw erro;
    const existente = await graph(`/drives/${driveId}/items/${pai}:/${encodeURIComponent(nomeDaPasta)}`);
    pastaId = ((await existente.json()) as { id: string }).id;
  }
  await graph(`/drives/${driveId}/items/${encodeURIComponent(itemId)}?@microsoft.graph.conflictBehavior=rename`, {
    metodo: 'PATCH',
    json: { parentReference: { id: pastaId } },
  });
}

/** Só para a conferência (npm run sharepoint:conferir): apaga o arquivo de teste. */
export async function apagarDoSharepoint(itemId: string) {
  const { driveId } = await bibliotecaDasFotos();
  await graph(`/drives/${driveId}/items/${encodeURIComponent(itemId)}`, { metodo: 'DELETE' });
}

/** Aviso da validade do segredo (MS_CLIENT_SECRET_EXPIRA=AAAA-MM-DD): null se estiver longe. */
export function avisoDeValidadeDoSegredo(agora = new Date()): string | null {
  const texto = process.env.MS_CLIENT_SECRET_EXPIRA?.trim();
  if (!texto) return 'MS_CLIENT_SECRET_EXPIRA não informada: anote a validade do segredo para ser avisado antes de vencer.';
  const vence = new Date(`${texto}T00:00:00-03:00`);
  if (Number.isNaN(vence.getTime())) return `MS_CLIENT_SECRET_EXPIRA inválida ("${texto}"): use AAAA-MM-DD.`;
  const dias = Math.ceil((vence.getTime() - agora.getTime()) / 86_400_000);
  if (dias <= 0) return `O segredo do aplicativo no Microsoft 365 VENCEU em ${texto}: as fotos não sobem nem abrem até um novo ser criado.`;
  if (dias <= 30) return `O segredo do aplicativo no Microsoft 365 vence em ${dias} dias (${texto}). Peça um novo ao administrador.`;
  return null;
}
