import type { PrismaClient, TipoServico } from '@prisma/client';
import { ROTEIRO_DO_SERVICO, TIPOS_SERVICO } from '@guarusolar/compartilhado';

/**
 * Deixa a tabela ChecklistFoto igual ao roteiro do código
 * (packages/compartilhado/src/roteiroDoServico.ts, o único lugar onde ele é editado): cria os
 * itens novos, acerta nome, ordem e obrigatoriedade e DESATIVA os que saíram do roteiro (não
 * apaga: fotos antigas ainda apontam para eles). Roda ao subir a API e no db:seed:base.
 * Uma leitura; só grava o que estiver diferente. Devolve quantas linhas mudou.
 */
export async function sincronizarRoteiroDeFotos(prisma: PrismaClient): Promise<number> {
  const noBanco = await prisma.checklistFoto.findMany();
  const escritas: Promise<unknown>[] = [];
  for (const tipoServico of TIPOS_SERVICO as readonly TipoServico[]) {
    const itens = ROTEIRO_DO_SERVICO[tipoServico].fotos;
    for (const [ordem, item] of itens.entries()) {
      const obrigatoria = item.obrigatoria ?? true;
      const atual = noBanco.find((c) => c.tipoServico === tipoServico && c.chave === item.chave);
      if (!atual) {
        escritas.push(prisma.checklistFoto.create({ data: { tipoServico, chave: item.chave, rotulo: item.rotulo, ordem, obrigatoria } }));
      } else if (atual.rotulo !== item.rotulo || atual.ordem !== ordem || atual.obrigatoria !== obrigatoria || !atual.ativo) {
        escritas.push(prisma.checklistFoto.update({ where: { id: atual.id }, data: { rotulo: item.rotulo, ordem, obrigatoria, ativo: true } }));
      }
    }
    for (const sobrou of noBanco.filter((c) => c.tipoServico === tipoServico && c.ativo && !itens.some((i) => i.chave === c.chave))) {
      escritas.push(prisma.checklistFoto.update({ where: { id: sobrou.id }, data: { ativo: false } }));
    }
  }
  await Promise.all(escritas);
  return escritas.length;
}
