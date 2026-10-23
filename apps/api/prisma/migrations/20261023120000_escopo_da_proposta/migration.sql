-- Proposta em escopo (23/10/2026): terceira seção "Adequação Corpo de Bombeiros · IT 41" e o
-- "aparece na proposta" por item. Só adições. Nenhum item é reclassificado: todos continuam
-- MATERIAL ("Infraestrutura da instalação") e aparecendo na proposta.
ALTER TYPE "GrupoNaProposta" ADD VALUE 'BOMBEIROS';

ALTER TABLE "Produto" ADD COLUMN     "apareceNaProposta" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ItemOrcamento" ADD COLUMN     "apareceNaProposta" BOOLEAN NOT NULL DEFAULT true;
