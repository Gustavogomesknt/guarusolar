import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Populando o banco da Guarusolar...');

  // --- Equipes -------------------------------------------------------------
  const equipes = await Promise.all(
    ['Equipe A', 'Equipe B', 'Equipe C'].map((nome) =>
      prisma.equipe.upsert({ where: { id: nome }, update: {}, create: { id: nome, nome } }),
    ),
  );

  // --- Usuários iniciais ---------------------------------------------------
  const senha = await bcrypt.hash('guarusolar123', 10);
  const usuarios = [
    { nome: 'Administrador', email: 'admin@guarusolar.com.br', papel: 'ADMIN' as const },
    { nome: 'Vendedor', email: 'comercial@guarusolar.com.br', papel: 'COMERCIAL' as const },
    { nome: 'Gestor de obras', email: 'gestor@guarusolar.com.br', papel: 'GESTOR' as const },
    {
      nome: 'Técnico Equipe A',
      email: 'tecnico.a@guarusolar.com.br',
      papel: 'TECNICO' as const,
      equipeId: equipes[0].id,
    },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, senhaHash: senha },
    });
  }

  // --- Catálogo de itens pré-moldados -------------------------------------
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

  for (const p of produtos) {
    const existe = await prisma.produto.findFirst({ where: { nome: p.nome } });
    if (!existe) await prisma.produto.create({ data: p as never });
  }

  // --- Checklist de fotos por tipo de serviço ------------------------------
  // Esta lista é editável pelo gestor: reflete o que o Alvo exige hoje.
  const checklist = [
    { chave: 'paineis_instalados', rotulo: 'Painéis instalados (visão geral)' },
    { chave: 'estrutura_fixacao', rotulo: 'Estrutura e fixação' },
    { chave: 'inversor', rotulo: 'Inversor instalado' },
    { chave: 'string_box', rotulo: 'String box / quadro CC' },
    { chave: 'aterramento', rotulo: 'Aterramento' },
    { chave: 'padrao_entrada', rotulo: 'Padrão de entrada / medidor' },
  ];
  for (const [ordem, item] of checklist.entries()) {
    await prisma.checklistFoto.upsert({
      where: { tipoServico_chave: { tipoServico: 'INSTALACAO', chave: item.chave } },
      update: { rotulo: item.rotulo, ordem },
      create: { tipoServico: 'INSTALACAO', ordem, obrigatoria: true, ...item },
    });
  }

  const checklistManutencao = [
    { chave: 'antes', rotulo: 'Antes do serviço' },
    { chave: 'depois', rotulo: 'Depois do serviço' },
    { chave: 'leitura_inversor', rotulo: 'Leitura do inversor' },
  ];
  for (const [ordem, item] of checklistManutencao.entries()) {
    await prisma.checklistFoto.upsert({
      where: { tipoServico_chave: { tipoServico: 'MANUTENCAO', chave: item.chave } },
      update: { rotulo: item.rotulo, ordem },
      create: { tipoServico: 'MANUTENCAO', ordem, obrigatoria: true, ...item },
    });
  }

  console.log('Pronto. Senha inicial de todos os usuários: guarusolar123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
