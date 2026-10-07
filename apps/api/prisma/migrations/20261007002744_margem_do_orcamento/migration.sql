-- Margem de lucro em reais por orçamento (embutida no total; nunca aparece para o cliente).
-- Orçamentos existentes ficam com margem zero e não mudam de valor.
ALTER TABLE "Orcamento" ADD COLUMN "margem" DECIMAL(12,2) NOT NULL DEFAULT 0;
