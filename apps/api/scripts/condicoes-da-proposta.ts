/*
 * Grava as TRÊS CONDIÇÕES DA PROPOSTA (colunas proposta*: investimento, à vista via Pix, cartão)
 * nos orçamentos salvos antes de elas existirem, para o modelo novo do PDF não sair com
 * "[A DEFINIR]" quando alguém reabrir um link antigo. Rode UMA VEZ, antes de ligar o modelo novo.
 *
 *   npm run orcamentos:condicoes                 só mostra quantos tocaria (não grava nada)
 *   npm run orcamentos:condicoes -- --executar   grava
 *
 * O QUE MUDA: só as colunas proposta*. NENHUM valor já gravado da condição escolhida é alterado
 * (valorTotal, entrada, parcelas, taxa, resumo, cópia do cliente, itens...). E a condição
 * escolhida, na página 3, sai COPIADA do que está gravado, não recalculada: o cartão de um
 * orçamento de "Entrada + cartão" fica com a taxa e as parcelas que o cliente já recebeu, mesmo
 * que a tabela de taxas tenha mudado depois. Só a OUTRA condição é calculada, com os padrões de
 * compartilhado/condicoesDaProposta.ts (recusa se algum estiver em branco).
 *
 * CONFERÊNCIA: antes de gravar, refaz o total do orçamento com os dados gravados (itens, margem,
 * descontos, imposto). Se não bater com o valorTotal gravado (orçamento de uma regra antiga), o
 * orçamento é PULADO e listado: melhor ficar no modelo atual do que mostrar outro número.
 * Orçamento sem as três condições sai no modelo atual (pdf-orcamento.ts), nunca com colchetes.
 *
 * PODE RODAR DUAS VEZES (ou mais): grava o mesmo resultado, e o que já está certo não é tocado
 * ("já corretos"). Orçamento salvo depois pelo gerador já tem as três: também não é tocado.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  calcularCondicoesDaProposta,
  calcularOrcamento,
  CONDICOES_PADRAO_DA_PROPOSTA,
  faltaNosPadroes,
  formatarBRL,
  type EntradaCalculo,
} from '@guarusolar/compartilhado';

const prisma = new PrismaClient();
const executar = process.argv.includes('--executar');
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));

type Condicoes = {
  propostaInvestimento: number | null;
  propostaAVistaPct: number | null;
  propostaAVistaValor: number | null;
  propostaCartaoParcelas: number | null;
  propostaCartaoDebito: boolean | null;
  propostaCartaoEntrada: number | null;
  propostaCartaoParcela: number | null;
  propostaCartaoPrimeira: number | null;
  propostaCartaoTotal: number | null;
  propostaCartaoTaxaPct: number | null;
};
const CAMPOS = [
  'propostaInvestimento',
  'propostaAVistaPct',
  'propostaAVistaValor',
  'propostaCartaoParcelas',
  'propostaCartaoDebito',
  'propostaCartaoEntrada',
  'propostaCartaoParcela',
  'propostaCartaoPrimeira',
  'propostaCartaoTotal',
  'propostaCartaoTaxaPct',
] as const;

async function main() {
  const faltam = faltaNosPadroes();
  if (faltam.length > 0) {
    console.error(`Recusado: falta preencher em packages/compartilhado/src/condicoesDaProposta.ts o padrão de ${faltam.join(' e o de ')}.`);
    process.exitCode = 1;
    return;
  }
  const P = CONDICOES_PADRAO_DA_PROPOSTA;
  console.log(`Padrões: desconto à vista ${P.descontoAVistaPct}% · cartão em ${P.parcelas}x sem entrada`);
  console.log(executar ? 'Modo: GRAVAR\n' : 'Modo: só mostrar (para gravar: -- --executar)\n');

  const orcamentos = await prisma.orcamento.findMany({
    include: { itens: { select: { quantidade: true, precoUnitario: true } } },
    orderBy: { codigo: 'asc' },
  });

  let corretos = 0;
  const pulados: string[] = [];
  const tocar: { id: string; codigo: string; dados: Condicoes }[] = [];

  for (const o of orcamentos) {
    const entrada: EntradaCalculo = {
      itens: o.itens.map((i) => ({ quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) })),
      margem: num(o.margem) ?? 0,
      descontoTipo: o.descontoTipo,
      descontoValor: num(o.descontoValor) ?? 0,
      impostoPct: num(o.impostoPct) ?? 0,
      condicaoPagamento: o.condicaoPagamento,
      // as entradas do vendedor só valem para a condição que ele escolheu: a outra usa o padrão
      // (antes das três condições, um valor gravado da condição NÃO escolhida era resto de edição)
      descontoAVistaPct: o.condicaoPagamento === 'A_VISTA' ? num(o.descontoAVistaPct) : null,
      entradaPct: num(o.entradaPct),
      parcelas: o.condicaoPagamento === 'ENTRADA_PARCELAS' ? o.parcelas : null,
      debito: o.pagamentoDebito,
      absorverTaxaCartao: o.absorverTaxaCartao,
    };

    // conferência: o total refeito com os dados gravados tem de bater com o gravado
    const refeito = calcularOrcamento(entrada).valorTotal;
    if (Math.abs(refeito - Number(o.valorTotal)) >= 0.005) {
      pulados.push(`${o.codigo}: total gravado ${formatarBRL(Number(o.valorTotal))}, refeito ${formatarBRL(refeito)}`);
      continue;
    }

    const c = calcularCondicoesDaProposta(entrada);
    const dados: Condicoes = {
      propostaInvestimento: c.investimento,
      propostaAVistaPct: c.aVista?.descontoPct ?? null,
      propostaAVistaValor: c.aVista?.valor ?? null,
      propostaCartaoParcelas: c.cartao?.detalhe.parcelas ?? null,
      propostaCartaoDebito: c.cartao?.detalhe.debito ?? null,
      propostaCartaoEntrada: c.cartao?.entrada ?? null,
      propostaCartaoParcela: c.cartao?.detalhe.valorParcela ?? null,
      propostaCartaoPrimeira: c.cartao?.detalhe.valorPrimeiraParcela ?? null,
      propostaCartaoTotal: c.cartao?.total ?? null,
      propostaCartaoTaxaPct: c.cartao?.detalhe.taxaPct ?? null,
    };
    // a condição ESCOLHIDA sai do que está gravado (é o que o cliente recebeu), nunca recalculada
    if (o.condicaoPagamento === 'A_VISTA') {
      dados.propostaAVistaPct = num(o.descontoAVistaPct) ?? 0;
      dados.propostaAVistaValor = Number(o.valorTotal);
    }
    if (o.condicaoPagamento === 'ENTRADA_PARCELAS') {
      const parcela = num(o.valorParcela);
      dados.propostaCartaoParcelas = o.pagamentoDebito ? 1 : (o.parcelas ?? 1);
      dados.propostaCartaoDebito = o.pagamentoDebito;
      dados.propostaCartaoEntrada = num(o.valorEntrada) ?? 0;
      dados.propostaCartaoParcela = parcela;
      dados.propostaCartaoPrimeira = num(o.valorPrimeiraParcela) ?? parcela;
      dados.propostaCartaoTotal = num(o.valorTotalCliente) ?? Number(o.valorTotal);
      dados.propostaCartaoTaxaPct = num(o.taxaCartaoPct);
    }

    const igual = CAMPOS.every((k) => {
      const atual = o[k] as Prisma.Decimal | number | boolean | null;
      const novo = dados[k];
      if (atual == null || novo == null) return atual == null && novo == null;
      return typeof novo === 'boolean' ? atual === novo : Math.abs(Number(atual) - Number(novo)) < 0.005;
    });
    if (igual) corretos++;
    else tocar.push({ id: o.id, codigo: o.codigo, dados });
  }

  console.log(`Orçamentos no banco: ${orcamentos.length}`);
  console.log(`Já corretos (não mudam): ${corretos}`);
  console.log(`${executar ? 'Gravados' : 'Tocaria'}: ${tocar.length}`);
  if (pulados.length > 0) {
    console.log(`Pulados (o total refeito não bate com o gravado; ficam no modelo atual): ${pulados.length}`);
    for (const p of pulados) console.log(`  ${p}`);
  }
  if (!executar) {
    for (const t of tocar.slice(0, 20)) {
      const d = t.dados;
      console.log(
        `  ${t.codigo}: investimento ${formatarBRL(d.propostaInvestimento!)} · à vista ${formatarBRL(d.propostaAVistaValor!)} (${d.propostaAVistaPct}%) · cartão ${d.propostaCartaoParcelas}x de ${formatarBRL(d.propostaCartaoParcela!)} (total ${formatarBRL(d.propostaCartaoTotal!)})`,
      );
    }
    if (tocar.length > 20) console.log(`  … e mais ${tocar.length - 20}`);
    return;
  }
  // um por vez: se parar no meio, rodar de novo continua (os gravados viram "já corretos")
  // SQL direto: o update do Prisma mexeria no editadoEm (@updatedAt), e o orçamento não foi editado
  for (const t of tocar) {
    const d = t.dados;
    await prisma.$executeRaw`
      UPDATE "Orcamento" SET
        "propostaInvestimento" = ${d.propostaInvestimento}, "propostaAVistaPct" = ${d.propostaAVistaPct},
        "propostaAVistaValor" = ${d.propostaAVistaValor}, "propostaCartaoParcelas" = ${d.propostaCartaoParcelas},
        "propostaCartaoDebito" = ${d.propostaCartaoDebito}, "propostaCartaoEntrada" = ${d.propostaCartaoEntrada},
        "propostaCartaoParcela" = ${d.propostaCartaoParcela}, "propostaCartaoPrimeira" = ${d.propostaCartaoPrimeira},
        "propostaCartaoTotal" = ${d.propostaCartaoTotal}, "propostaCartaoTaxaPct" = ${d.propostaCartaoTaxaPct}
      WHERE "id" = ${t.id}`;
  }
  console.log('\nRESULTADO: gravados', tocar.length, '· já corretos', corretos, '· pulados', pulados.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
