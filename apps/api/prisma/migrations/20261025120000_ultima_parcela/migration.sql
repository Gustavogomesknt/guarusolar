-- Parcelas do cartão (25/10/2026): o valor da parcela é o total ÷ parcelas arredondado PARA
-- CIMA e a ÚLTIMA leva a diferença (antes a 1ª levava a sobra). Só adições, nulas: orçamento
-- salvo antes fica com a 1ª gravada em valorPrimeiraParcela / propostaCartaoPrimeira.
ALTER TABLE "Orcamento" ADD COLUMN     "valorUltimaParcela" DECIMAL(12,2),
ADD COLUMN     "propostaCartaoUltima" DECIMAL(12,2);
