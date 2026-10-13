-- CPF/CNPJ do cliente passa a ser opcional: em branco (NULL) = não informado. A chave única
-- continua: documento preenchido não se repete, e o Postgres aceita vários NULL.
-- Nenhum cliente existente muda.
ALTER TABLE "Cliente" ALTER COLUMN "documento" DROP NOT NULL;

-- Prazo de execução e garantia do serviço, texto livre de cada orçamento (impressos no PDF).
-- Orçamentos existentes ficam com NULL: o PDF usa o texto padrão da garantia, e o prazo tem de
-- ser preenchido antes de a proposta sair de novo.
ALTER TABLE "Orcamento" ADD COLUMN "prazoExecucao" TEXT,
ADD COLUMN "garantia" TEXT;
