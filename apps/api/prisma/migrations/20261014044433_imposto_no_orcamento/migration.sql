-- Imposto do orçamento, em %, somado DEPOIS dos descontos (ordem em compartilhado/calculo.ts).
-- Orçamentos existentes ficam com 0% (impostoAplicado 0): os totais gravados não mudam.
-- mostrarImpostosNoPdf: ligado por padrão; desligado, o imposto vai embutido nos preços do PDF.
ALTER TABLE "Orcamento" ADD COLUMN     "impostoAplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "impostoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mostrarImpostosNoPdf" BOOLEAN NOT NULL DEFAULT true;
