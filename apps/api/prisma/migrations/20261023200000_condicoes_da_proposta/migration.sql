-- As três condições da proposta (investimento, à vista via Pix, cartão), gravadas ao salvar
-- para o PDF do modelo novo só imprimir. Só adições, todas nulas: orçamento salvo antes fica
-- sem elas até ser salvo de novo.
ALTER TABLE "Orcamento" ADD COLUMN     "propostaInvestimento" DECIMAL(12,2),
ADD COLUMN     "propostaAVistaPct" DECIMAL(5,2),
ADD COLUMN     "propostaAVistaValor" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoParcelas" INTEGER,
ADD COLUMN     "propostaCartaoDebito" BOOLEAN,
ADD COLUMN     "propostaCartaoEntrada" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoParcela" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoPrimeira" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoTotal" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoTaxaPct" DECIMAL(5,2);
