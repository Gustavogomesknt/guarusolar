/*
 * npm run db:diagnostico
 *
 * Diz, SEM mostrar endereço, usuário, identificador do projeto nem senha, qual string de conexão
 * os comandos vão usar nesta janela e se ela entra no banco. Para rodar ANTES de um comando que
 * grava em produção (importar o catálogo, criar usuário), quando houver dúvida.
 *
 * Todos os scripts (usuario, db:seed:base, produtos:importar, db:conferir-producao) e a API usam
 * o mesmo caminho: `import 'dotenv/config'` + `new PrismaClient()`, que lê DATABASE_URL. A
 * variável definida na JANELA vence o apps/api/.env (o dotenv não sobrescreve o que já existe).
 * Só o `prisma migrate deploy` usa a DIRECT_URL.
 *
 * Não grava nada: faz uma única consulta de leitura.
 */
// Sem `import` no topo de propósito: o que já existe no ambiente é anotado ANTES de qualquer
// módulo (dotenv, Prisma) ter a chance de carregar o .env.
const daJanela = { DATABASE_URL: process.env.DATABASE_URL !== undefined, DIRECT_URL: process.env.DIRECT_URL !== undefined };

function descrever(nome: 'DATABASE_URL' | 'DIRECT_URL') {
  const valor = process.env[nome];
  const origem = daJanela[nome] ? 'variável desta JANELA' : valor ? 'arquivo apps/api/.env' : 'NÃO DEFINIDA';
  console.log(`\n${nome}: ${origem}`);
  if (!valor) return;
  const alertas: string[] = [];
  if (valor !== valor.trim()) alertas.push('há espaço no começo ou no fim');
  if (/^["'].*["']$/.test(valor.trim())) alertas.push('a string está com aspas DENTRO do valor');
  let url: URL | null = null;
  try {
    url = new URL(valor.trim());
  } catch {
    alertas.push('não é uma URL válida (confira caracteres especiais na senha)');
  }
  if (url) {
    const usuario = decodeURIComponent(url.username);
    console.log(`  usuário: ${usuario.includes('.') ? 'postgres.<id do projeto> (formato do pooler)' : `"${usuario}" SEM o identificador do projeto`}`);
    console.log(`  servidor: ${/pooler\./.test(url.hostname) ? 'pooler do Supabase' : /supabase/.test(url.hostname) ? 'conexão direta do Supabase' : url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? 'local' : 'outro'} | porta: ${url.port || '(padrão)'}`);
    console.log(`  pgbouncer: ${url.searchParams.get('pgbouncer') ?? 'não'} | connection_limit: ${url.searchParams.get('connection_limit') ?? 'não'}`);
    if (!url.password) alertas.push('a string não tem senha');
    // "@", "/", "?" ou "#" crus na senha quebram a URL: a parte depois deles vira servidor ou é cortada
    if ((valor.match(/@/g) ?? []).length > 1) alertas.push('há mais de um "@": um "@" na senha precisa ser escrito como %40');
    if (url.hash) alertas.push('há um "#": na senha ele precisa ser escrito como %23 (o resto da string está sendo ignorado)');
    if (/[\s]/.test(url.password)) alertas.push('a senha tem espaço ou quebra de linha');
  }
  for (const a of alertas) console.log(`  ATENÇÃO: ${a}`);
}

async function main() {
  console.log('Diagnóstico da conexão (nenhum segredo é mostrado).');
  await import('dotenv/config');
  descrever('DATABASE_URL');
  descrever('DIRECT_URL');
  if (process.env.DATABASE_URL && process.env.DIRECT_URL && daJanela.DATABASE_URL !== daJanela.DIRECT_URL) {
    console.log('\nATENÇÃO: uma das duas veio da janela e a outra do .env. Para produção, defina as DUAS na janela.');
  }
  if (!process.env.DATABASE_URL) {
    process.exitCode = 1;
    return;
  }
  const { PrismaClient } = await import('@prisma/client');
  const { bancoDeProducao } = await import('../src/lib/ambienteDoBanco');
  const prisma = new PrismaClient();
  try {
    const producao = await bancoDeProducao(prisma);
    console.log(`\nConexão com a DATABASE_URL: OK. Este é o banco de ${producao ? 'PRODUÇÃO' : 'desenvolvimento'}.`);
    console.log('Os comandos desta janela (usuario, db:seed:base, produtos:importar) vão usar este mesmo banco.');
  } catch (erro) {
    const texto = String((erro as Error).message).replace(/`[^`]*`/g, '`…`');
    console.log(`\nConexão com a DATABASE_URL: FALHOU.\n  ${texto.split('\n').filter(Boolean).slice(-2).join('\n  ')}`);
    if (/Authentication failed/.test(texto)) {
      console.log(
        '\n  O servidor recusou usuário/senha. O nome de usuário que aparece nessa mensagem é o que o SERVIDOR devolve\n' +
          '  (o pooler do Supabase pode mostrar só "postgres"): não indica que outra string foi usada. Confira a SENHA\n' +
          '  desta string. Depois de algumas recusas seguidas o Supabase bloqueia o seu IP por um tempo: espere antes de tentar de novo.',
      );
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

export {};
