/*
 * Regra de CORS do bucket S3 (Backblaze B2), para o celular enviar o vídeo DIRETO ao bucket:
 *   npm run s3:cors                mostra a regra e pede confirmação antes de gravar
 *   npm run s3:cors -- --executar  grava sem perguntar
 * Usa as S3_* do ambiente (ou do .env) e API_URL_PUBLICA (o endereço do sistema: a origem
 * liberada sai dela, nunca fica fixa no código).
 *
 * A regra libera, só para essa origem: PUT (envio do vídeo pelo link assinado), GET e HEAD
 * (o gestor assistindo), o cabeçalho que o envio manda (Content-Type) e os que o navegador
 * precisa ler na resposta (ETag, tamanho, faixa).
 *
 * CUIDADOS:
 * - PutBucketCors SUBSTITUI a configuração de CORS inteira: o comando lê a atual e mantém as
 *   regras que não são desta (de outra origem ou com outro nome). Rodar de novo não duplica: a
 *   regra desta origem é trocada, e se já está igual, nada é gravado.
 * - Lifecycle ("Keep only the last version of the file") é OUTRA configuração do bucket
 *   (subrecurso ?lifecycle, com permissão própria): o PutBucketCors não a envia nem a altera. O
 *   comando lê o Lifecycle antes e depois e compara, para provar.
 * - No Backblaze, gravar CORS exige uma chave com a permissão writeBuckets, e chave restrita a um
 *   bucket (a do sistema) NÃO tem. Para este comando, use na SUA janela uma chave temporária sem
 *   restrição de bucket e apague-a depois (SOCORRO.md, item 9). A Render continua com a dela.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { bucketDoS3, gravarCorsDoS3, lerCorsDoS3, lerLifecycleDoS3, servicoDoS3, variaveisDoS3Faltando } from '../src/lib/s3';

const NOME_DA_REGRA = 'guarusolar-envio-de-video';
const METODOS = ['GET', 'HEAD', 'PUT'];
const CABECALHOS_DO_ENVIO = ['content-type'];
const CABECALHOS_LIDOS = ['ETag', 'Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges'];
const VALIDADE_DA_CONFERENCIA = 3600; // o navegador guarda a resposta do CORS por 1 hora

type Regra = { id?: string; origens: string[]; metodos: string[]; cabecalhos: string[]; expostos: string[]; maxAge?: number };

const todos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1].trim());
const decodificar = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const codificar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lerRegras(xml: string | null): Regra[] {
  if (!xml) return [];
  return [...xml.matchAll(/<CORSRule>([\s\S]*?)<\/CORSRule>/g)].map(([, r]) => ({
    id: todos(r, 'ID')[0] ? decodificar(todos(r, 'ID')[0]) : undefined,
    origens: todos(r, 'AllowedOrigin').map(decodificar),
    metodos: todos(r, 'AllowedMethod'),
    cabecalhos: todos(r, 'AllowedHeader').map(decodificar),
    expostos: todos(r, 'ExposeHeader').map(decodificar),
    maxAge: todos(r, 'MaxAgeSeconds')[0] ? Number(todos(r, 'MaxAgeSeconds')[0]) : undefined,
  }));
}

function xmlDasRegras(regras: Regra[]) {
  const linha = (tag: string, valor: string | number) => `    <${tag}>${codificar(String(valor))}</${tag}>`;
  const corpo = regras.map((r) =>
    [
      '  <CORSRule>',
      ...(r.id ? [linha('ID', r.id)] : []),
      ...r.origens.map((o) => linha('AllowedOrigin', o)),
      ...r.metodos.map((m) => linha('AllowedMethod', m)),
      ...r.cabecalhos.map((c) => linha('AllowedHeader', c)),
      ...r.expostos.map((e) => linha('ExposeHeader', e)),
      ...(r.maxAge !== undefined ? [linha('MaxAgeSeconds', r.maxAge)] : []),
      '  </CORSRule>',
    ].join('\n'),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n${corpo.join('\n')}\n</CORSConfiguration>`;
}

const mesmoConjunto = (a: string[], b: string[]) => {
  const x = new Set(a.map((v) => v.toLowerCase()));
  const y = new Set(b.map((v) => v.toLowerCase()));
  return x.size === y.size && [...x].every((v) => y.has(v));
};
/** A regra deste comando: pelo nome, ou (o B2 pode trocar o nome) por ser só desta origem e liberar PUT. */
const ehDesteComando = (r: Regra, origem: string) => r.id === NOME_DA_REGRA || (mesmoConjunto(r.origens, [origem]) && r.metodos.includes('PUT'));
const equivalente = (r: Regra, d: Regra) =>
  mesmoConjunto(r.origens, d.origens) &&
  mesmoConjunto(r.metodos, d.metodos) &&
  (r.cabecalhos.includes('*') || d.cabecalhos.every((c) => r.cabecalhos.map((x) => x.toLowerCase()).includes(c))) &&
  d.expostos.every((e) => r.expostos.map((x) => x.toLowerCase()).includes(e.toLowerCase()));

function mostrar(titulo: string, regras: Regra[]) {
  if (regras.length === 0) return console.log(`\n${titulo} nenhuma regra`);
  console.log(`\n${titulo}`);
  for (const r of regras) {
    console.log(`  - ${r.id ?? '(sem nome)'}`);
    console.log(`      origem:    ${r.origens.join(', ')}`);
    console.log(`      métodos:   ${r.metodos.join(', ')}`);
    console.log(`      cabeçalhos enviados: ${r.cabecalhos.join(', ') || '(nenhum)'} · lidos: ${r.expostos.join(', ') || '(nenhum)'}`);
    if (r.maxAge !== undefined) console.log(`      validade da conferência: ${r.maxAge} s`);
  }
}

function resumoDoLifecycle(lido: { xml: string | null; erro?: string }) {
  if (lido.erro) return `não deu para ler pela API S3 (${lido.erro})`;
  if (!lido.xml) return 'nenhuma regra de Lifecycle visível pela API S3';
  const regras = [...lido.xml.matchAll(/<Rule>([\s\S]*?)<\/Rule>/g)].map(([, r]) => {
    const prefixo = todos(r, 'Prefix')[0] ?? '';
    const partes = [
      todos(r, 'NoncurrentDays')[0] && `versões antigas apagadas em ${todos(r, 'NoncurrentDays')[0]} dia(s)`,
      todos(r, 'Days')[0] && !r.includes('<NoncurrentVersionExpiration>') && `arquivo escondido em ${todos(r, 'Days')[0]} dia(s)`,
      r.includes('<ExpiredObjectDeleteMarker>true') && 'marcadores órfãos removidos',
    ].filter(Boolean);
    return `${prefixo ? `"${prefixo}"` : 'bucket inteiro'}: ${partes.join(', ') || '(regra)'} [${todos(r, 'Status')[0] ?? '?'}]`;
  });
  return regras.join(' · ');
}

class Parar extends Error {}

async function main() {
  const executar = process.argv.includes('--executar');
  const faltando = variaveisDoS3Faltando();
  if (faltando.length) {
    console.error(`Faltam no ambiente (ou no .env): ${faltando.join(', ')}`);
    throw new Parar();
  }
  let origem: string;
  try {
    origem = new URL(process.env.API_URL_PUBLICA ?? '').origin;
  } catch {
    console.error('Defina API_URL_PUBLICA nesta janela: o endereço do sistema (ex.: https://guarusolar.onrender.com). A regra libera só essa origem.');
    throw new Parar();
  }
  if (origem === 'null') {
    console.error('API_URL_PUBLICA precisa ser um endereço completo, com https://');
    throw new Parar();
  }

  console.log(`Regra de CORS do bucket "${bucketDoS3()}" (${servicoDoS3()}) para ${origem}`);

  const corsAntes = await lerCorsDoS3();
  // bucket sem nenhuma regra (404 NoSuchCorsConfiguration) chega aqui como lista vazia, sem erro;
  // erro é falha de verdade (403, 5xx, rede, bucket errado): aí gravar poderia apagar o que não se leu
  if (corsAntes.erro) {
    console.error(`\nNão deu para ler o CORS atual: ${corsAntes.erro}`);
    console.error('Sem ler, gravar apagaria regras que já existam. Nada foi alterado.');
    throw new Parar();
  }
  const atuais = lerRegras(corsAntes.xml);
  mostrar('CORS atual:', atuais);
  const lifecycleAntes = await lerLifecycleDoS3();
  console.log(`\nLifecycle antes: ${resumoDoLifecycle(lifecycleAntes)}`);

  const desejada: Regra = {
    id: NOME_DA_REGRA,
    origens: [origem],
    metodos: METODOS,
    cabecalhos: CABECALHOS_DO_ENVIO,
    expostos: CABECALHOS_LIDOS,
    maxAge: VALIDADE_DA_CONFERENCIA,
  };
  const outras = atuais.filter((r) => !ehDesteComando(r, origem));
  const nossas = atuais.filter((r) => ehDesteComando(r, origem));
  if (nossas.length === 1 && equivalente(nossas[0], desejada)) {
    console.log('\nA regra desta origem já está no bucket, igual. Nada a gravar.');
    return;
  }
  const final = [...outras, desejada];
  mostrar('Regras que vão ficar no bucket:', final);
  if (outras.length) console.log(`\n(${outras.length} regra(s) de outra origem ou com outro nome continuam como estão.)`);
  console.log(`\nXML que será enviado (PutBucketCors substitui o CORS inteiro por este):\n${xmlDasRegras(final)}`);

  if (!executar) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = (await terminal.question('\nGravar esta regra no bucket? Digite "sim" para gravar: ')).trim().toLowerCase();
    terminal.close();
    if (resposta !== 'sim') {
      console.log('Nada foi gravado.');
      return;
    }
  }

  try {
    await gravarCorsDoS3(xmlDasRegras(final));
  } catch (erro) {
    const texto = (erro as Error).message;
    console.error(`\nO bucket NÃO aceitou a regra: ${texto}`);
    if (/403|AccessDenied|Unauthorized|not entitled/i.test(texto)) {
      console.error(
        [
          'A chave desta janela não pode alterar a configuração do bucket. No Backblaze, isso exige a',
          'permissão writeBuckets, que chave restrita a um bucket (como a do sistema) NÃO tem.',
          'Crie uma chave TEMPORÁRIA sem restrição de bucket (Application Keys → Add a New Application Key,',
          '"All" em Allow access to Bucket(s), Read and Write), use o keyID e a applicationKey dela',
          'nas S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY só desta janela, rode de novo e APAGUE a chave',
          'depois. A Render continua com a chave dela, sem mudança. Nada foi alterado no bucket.',
        ].join('\n'),
      );
    }
    throw new Parar();
  }

  const corsDepois = await lerCorsDoS3();
  if (corsDepois.erro) {
    console.error(`\nGravou, mas não deu para ler de volta: ${corsDepois.erro}`);
    throw new Parar();
  }
  const gravadas = lerRegras(corsDepois.xml);
  mostrar('CORS lido de volta do bucket (GetBucketCors):', gravadas);
  const ok = gravadas.some((r) => equivalente(r, desejada));
  console.log(ok ? '\nA regra desta origem está gravada.' : '\nATENÇÃO: a regra lida de volta não confere com a enviada. Veja acima.');

  const lifecycleDepois = await lerLifecycleDoS3();
  console.log(`\nLifecycle depois: ${resumoDoLifecycle(lifecycleDepois)}`);
  if (lifecycleAntes.erro || lifecycleDepois.erro) {
    console.log('Não deu para comparar o Lifecycle por aqui: confira no painel (bucket → Lifecycle Settings) que continua "Keep only the last version of the file".');
  } else if (lifecycleAntes.xml === lifecycleDepois.xml) {
    console.log('Lifecycle intacto: idêntico ao de antes.');
  } else {
    console.error('ATENÇÃO: o Lifecycle lido depois é DIFERENTE do de antes. Confira no painel do Backblaze. O de antes era:');
    console.error(lifecycleAntes.xml ?? '(nenhum)');
    process.exitCode = 1;
  }
  if (!ok) process.exitCode = 1;
  console.log('\nPara conferir que o navegador consegue enviar: npm run s3:conferir (com API_URL_PUBLICA nesta janela).');
}

main().catch((erro) => {
  if (!(erro instanceof Parar)) console.error(`Erro: ${(erro as Error).message}`);
  process.exitCode = 1;
});
