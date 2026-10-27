/*
 * Converte PRAZO e GARANTIA dos orçamentos salvos para SÓ A DURAÇÃO (regra de 25/10/2026: os
 * dois viram um selo na arte da proposta; a qualificação é texto fixo em conteudo/proposta.ts).
 *
 *   npm run orcamentos:prazo-garantia                 só lê e relata (não grava nada)
 *   npm run orcamentos:prazo-garantia -- --executar   grava as conversões
 *
 * O QUE CONVERTE: só o texto IGUAL (sem diferença de espaços) ao que o sistema oferecia: a
 * garantia padrão antiga vira "12 meses" e cada sugestão antiga de prazo vira a forma curta
 * (CONVERSOES, abaixo). Nada mais é tocado: o resto que passa de 24 caracteres é LISTADO para
 * revisão um por um, no gerador (o orçamento abre e salva com o texto antigo até alguém mudá-lo).
 * SÓ RASCUNHO (27/10/2026): proposta que já saiu do rascunho está com o cliente e não se
 * reescreve (a mesma regra do modeloEnviado). Elas são só contadas, por status. Se uma delas for
 * reenviada no modelo novo com o texto longo, o envio é recusado com o motivo (conferirCondicoes)
 * e o vendedor encurta de propósito.
 *
 * PODE RODAR DUAS VEZES (ou mais): o convertido não casa mais com o texto antigo e não é tocado.
 * Grava por SQL direto: o update do Prisma mexeria no editadoEm (@updatedAt).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GARANTIA_MAXIMO_DE_CARACTERES, PRAZO_MAXIMO_DE_CARACTERES } from '@guarusolar/compartilhado';

const prisma = new PrismaClient();
const executar = process.argv.includes('--executar');

/** texto antigo exato -> forma curta. São os textos que o gerador oferecia até 25/10/2026. */
const CONVERSOES = {
  garantia: {
    'Garantia de 12 meses sobre os serviços de instalação, a contar da data de conclusão.': '12 meses',
  },
  prazoExecucao: {
    '5 dias úteis após a aprovação': '5 dias úteis',
    '15 dias úteis após a aprovação e o pagamento da entrada': '15 dias úteis',
    // a mesma sugestão, com o texto que ela teve só em 25/10/2026
    '15 dias úteis após a aprovação da proposta': '15 dias úteis',
    '25 dias úteis após a aprovação e liberação do acesso ao local': '25 dias úteis',
    '45 dias após a aprovação, conforme a homologação na concessionária': '45 dias',
  },
} as const;
const LIMITE = { prazoExecucao: PRAZO_MAXIMO_DE_CARACTERES, garantia: GARANTIA_MAXIMO_DE_CARACTERES };
type Campo = keyof typeof CONVERSOES;
const NOME: Record<Campo, string> = { prazoExecucao: 'prazo', garantia: 'garantia' };
const normalizar = (t: string) => t.trim().replace(/\s+/g, ' ');

async function main() {
  console.log(executar ? 'Modo: GRAVAR\n' : 'Modo: só ler e relatar (para gravar: -- --executar)\n');
  const orcamentos = await prisma.orcamento.findMany({
    select: { id: true, codigo: true, status: true, prazoExecucao: true, garantia: true },
    orderBy: { codigo: 'asc' },
  });
  const rascunhos = orcamentos.filter((o) => o.status === 'RASCUNHO');
  const porStatus = new Map<string, number>();
  for (const o of orcamentos) if (o.status !== 'RASCUNHO') porStatus.set(o.status, (porStatus.get(o.status) ?? 0) + 1);

  const converter: { id: string; codigo: string; campo: Campo; de: string; para: string }[] = [];
  const revisar: { codigo: string; campo: Campo; texto: string }[] = [];
  let curtos = 0;
  for (const o of rascunhos) {
    for (const campo of Object.keys(CONVERSOES) as Campo[]) {
      const texto = o[campo];
      if (!texto?.trim()) continue; // em branco: o PDF usa "A combinar" / o padrão novo
      const para = (CONVERSOES[campo] as Record<string, string>)[normalizar(texto)];
      if (para) converter.push({ id: o.id, codigo: o.codigo, campo, de: texto, para });
      else if (texto.trim().length > LIMITE[campo]) revisar.push({ codigo: o.codigo, campo, texto: texto.trim() });
      else curtos++;
    }
  }

  console.log(`Orçamentos no banco: ${orcamentos.length} · rascunhos: ${rascunhos.length}`);
  console.log(
    `Fora do rascunho, NÃO mexidos (já estão com o cliente): ${orcamentos.length - rascunhos.length}` +
      (porStatus.size ? ` (${[...porStatus].map(([s, n]) => `${s} ${n}`).join(', ')})` : ''),
  );
  console.log(`\nNos rascunhos:`);
  console.log(`Campos já curtos (não mudam): ${curtos}`);
  console.log(`${executar ? 'Convertidos' : 'Converteria'}: ${converter.length}`);
  for (const campo of Object.keys(CONVERSOES) as Campo[]) {
    for (const [de, para] of Object.entries(CONVERSOES[campo])) {
      const n = converter.filter((c) => c.campo === campo && normalizar(c.de) === de).length;
      if (n > 0) console.log(`  ${NOME[campo]}: ${n} × "${de}" -> "${para}"`);
    }
  }
  console.log(`\nPara REVISAR um por um (não casam com nenhum texto conhecido e passam do limite): ${revisar.length}`);
  for (const r of revisar) console.log(`  ${r.codigo} · ${NOME[r.campo]} (${r.texto.length} caracteres): "${r.texto}"`);

  if (!executar) return;
  for (const c of converter) {
    if (c.campo === 'garantia') await prisma.$executeRaw`UPDATE "Orcamento" SET "garantia" = ${c.para} WHERE "id" = ${c.id} AND "garantia" = ${c.de} AND "status" = 'RASCUNHO'`;
    else await prisma.$executeRaw`UPDATE "Orcamento" SET "prazoExecucao" = ${c.para} WHERE "id" = ${c.id} AND "prazoExecucao" = ${c.de} AND "status" = 'RASCUNHO'`;
  }
  console.log(`\nRESULTADO: convertidos ${converter.length} · para revisar ${revisar.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
