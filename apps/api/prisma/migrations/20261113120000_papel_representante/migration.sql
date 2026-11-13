-- Papel novo: REPRESENTANTE (vendedor de outro estado; só vê os clientes e orçamentos dele).
-- Separado da migration seguinte: valor novo de enum não pode ser usado na mesma transação.
ALTER TYPE "Papel" ADD VALUE IF NOT EXISTS 'REPRESENTANTE';
