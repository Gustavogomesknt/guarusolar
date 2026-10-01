-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "absorverTaxaCartao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pagamentoDebito" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxaCartaoPct" DECIMAL(5,2),
ADD COLUMN     "valorPrimeiraParcela" DECIMAL(12,2),
ADD COLUMN     "valorTaxaAbsorvida" DECIMAL(12,2),
ADD COLUMN     "valorTotalCliente" DECIMAL(12,2),
ALTER COLUMN "tokenPdf" SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

