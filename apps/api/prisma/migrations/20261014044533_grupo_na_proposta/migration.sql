-- Grupo do item na proposta em PDF: "Materiais e equipamentos" ou "Documentação e engenharia".
-- TODOS os produtos e itens de orçamento existentes ficam MATERIAL: ninguém é classificado
-- automaticamente; o cliente marca os de documentação no catálogo. O item do orçamento guarda
-- uma cópia do grupo do produto ao entrar (regra 2): marcar no catálogo não muda proposta salva.
CREATE TYPE "GrupoNaProposta" AS ENUM ('MATERIAL', 'DOCUMENTACAO');

ALTER TABLE "Produto" ADD COLUMN     "grupoNaProposta" "GrupoNaProposta" NOT NULL DEFAULT 'MATERIAL';

ALTER TABLE "ItemOrcamento" ADD COLUMN     "grupoNaProposta" "GrupoNaProposta" NOT NULL DEFAULT 'MATERIAL';
