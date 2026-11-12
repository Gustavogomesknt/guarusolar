-- Etapa LAUDO (12/11/2026): uma visita técnica que não vira orçamento nem move o projeto.
-- Só adição. Fica numa migration SEPARADA da troca da restrição (20261112120100_laudo_avulso): o
-- Postgres não deixa usar um valor de enum na mesma transação em que ele foi criado.
ALTER TYPE "TipoServico" ADD VALUE IF NOT EXISTS 'LAUDO' AFTER 'VISITA_TECNICA';
