-- Fotos deixam de ter URL pública: o banco guarda só a chave no armazenamento e a foto sai
-- pela rota autenticada GET /api/fotos/:id. Renomeia a coluna (sem perder dados) e tira o
-- prefixo das URLs antigas ("http://localhost:3333/arquivos/PRJ-.../x.jpg" -> "PRJ-.../x.jpg").
ALTER TABLE "FotoServico" RENAME COLUMN "arquivoUrl" TO "arquivoChave";

UPDATE "FotoServico"
SET "arquivoChave" = regexp_replace("arquivoChave", '^.*?/arquivos/', '')
WHERE "arquivoChave" LIKE '%/arquivos/%';
