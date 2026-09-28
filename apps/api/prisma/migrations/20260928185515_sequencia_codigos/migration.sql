-- CreateTable
CREATE TABLE "SequenciaCodigo" (
    "prefixo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "SequenciaCodigo_pkey" PRIMARY KEY ("prefixo","ano")
);

-- Continua a numeração de onde os códigos já gravados pararam (ex.: GS-2026-0001 -> 1),
-- para o próximo código não repetir um existente.
INSERT INTO "SequenciaCodigo" ("prefixo", "ano", "ultimo")
SELECT 'GS', split_part("codigo", '-', 2)::INTEGER, MAX(split_part("codigo", '-', 3)::INTEGER)
FROM "Orcamento"
WHERE "codigo" ~ '^GS-[0-9]{4}-[0-9]+$'
GROUP BY split_part("codigo", '-', 2)
UNION ALL
SELECT 'PRJ', split_part("codigo", '-', 2)::INTEGER, MAX(split_part("codigo", '-', 3)::INTEGER)
FROM "Projeto"
WHERE "codigo" ~ '^PRJ-[0-9]{4}-[0-9]+$'
GROUP BY split_part("codigo", '-', 2);
