import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bancoDeProducao } from '../src/lib/ambienteDoBanco';
import { sincronizarRoteiroDeFotos } from '../src/lib/roteiroDeFotos';

/*
 * Dados de BASE, iguais em qualquer banco (produção inclusive): equipes, catálogo inicial e
 * checklist de fotos. Pode rodar de novo sem duplicar nada (npm run db:seed:base).
 * Em banco marcado como produção, o catálogo de EXEMPLO não entra: o catálogo real vem da cópia
 * dos dados, e produto não se apaga (os exemplos ficariam para sempre, desativados).
 * Usuários NÃO entram aqui: em produção, cada pessoa é criada com npm run usuario.
 */

const prisma = new PrismaClient();

async function main() {
  console.log('Dados de base da Guarusolar (equipes, catálogo, checklist)...');

  // --- Equipes -------------------------------------------------------------
  for (const nome of ['Equipe A', 'Equipe B', 'Equipe C']) {
    await prisma.equipe.upsert({ where: { id: nome }, update: {}, create: { id: nome, nome } });
  }

  // --- Catálogo de itens pré-moldados (só cria o que não existe: não mexe em preço editado) --
  const produtos = [
    { nome: 'Painel solar 550 W monocristalino', categoria: 'PAINEL_SOLAR', unidade: 'UN', precoCusto: 612, precoVenda: 789.9 },
    { nome: 'Painel solar 610 W bifacial', categoria: 'PAINEL_SOLAR', unidade: 'UN', precoCusto: 735, precoVenda: 949 },
    { nome: 'Inversor string 5 kW monofásico', categoria: 'INVERSOR', unidade: 'UN', precoCusto: 4180, precoVenda: 5290 },
    { nome: 'Inversor string 8 kW trifásico', categoria: 'INVERSOR', unidade: 'UN', precoCusto: 5920, precoVenda: 7450 },
    { nome: 'Microinversor 2 kW (4 MPPT)', categoria: 'INVERSOR', unidade: 'UN', precoCusto: 1690, precoVenda: 2190 },
    { nome: 'Estrutura telhado cerâmico (4 painéis)', categoria: 'ESTRUTURA', unidade: 'KIT', precoCusto: 498, precoVenda: 689 },
    { nome: 'Estrutura solo/laje (4 painéis)', categoria: 'ESTRUTURA', unidade: 'KIT', precoCusto: 720, precoVenda: 980 },
    { nome: 'Cabo solar 6 mm²', categoria: 'CABO', unidade: 'M', precoCusto: 6.2, precoVenda: 9.9 },
    { nome: 'String box CC 1 entrada / 1 saída', categoria: 'OUTROS', unidade: 'UN', precoCusto: 262, precoVenda: 389 },
    { nome: 'Instalação e homologação (até 6 kWp)', categoria: 'MAO_DE_OBRA', unidade: 'SERVICO', precoCusto: 1900, precoVenda: 3200 },
  ] as const;
  if (await bancoDeProducao(prisma)) {
    console.log('Catálogo de exemplo pulado: banco de produção (o catálogo real vem da cópia dos dados).');
  } else {
    for (const p of produtos) {
      const existe = await prisma.produto.findFirst({ where: { nome: p.nome } });
      if (!existe) await prisma.produto.create({ data: p as never });
    }
  }

  // --- Roteiro de fotos por tipo de serviço ---------------------------------
  // Os itens ficam num lugar só: packages/compartilhado/src/roteiroDoServico.ts
  await sincronizarRoteiroDeFotos(prisma);

  console.log('Pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
