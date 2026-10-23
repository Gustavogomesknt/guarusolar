-- "Cargo na proposta" do usuário: sai em caixa alta acima do nome de quem montou o orçamento
-- (proposta no modelo novo). Só adição: todos começam como "Consultor".
ALTER TABLE "Usuario" ADD COLUMN     "cargoNaProposta" TEXT NOT NULL DEFAULT 'Consultor';
