-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "clienteBairro" TEXT,
ADD COLUMN     "clienteCep" TEXT,
ADD COLUMN     "clienteCidade" TEXT,
ADD COLUMN     "clienteComplemento" TEXT,
ADD COLUMN     "clienteCopiadoEm" TIMESTAMP(3),
ADD COLUMN     "clienteDocumento" TEXT,
ADD COLUMN     "clienteEmail" TEXT,
ADD COLUMN     "clienteLogradouro" TEXT,
ADD COLUMN     "clienteNome" TEXT,
ADD COLUMN     "clienteNumero" TEXT,
ADD COLUMN     "clienteTipoPessoa" "TipoPessoa",
ADD COLUMN     "clienteUf" CHAR(2),
ADD COLUMN     "clienteWhatsapp" TEXT;
-- Orçamentos já gravados não têm a cópia: preenche com o cadastro ATUAL do cliente (o melhor que
-- temos; o que o PDF já mostrava). Daqui em diante, editar o cadastro não muda estes documentos.
UPDATE "Orcamento" o SET
  "clienteNome" = c."nome",
  "clienteTipoPessoa" = c."tipoPessoa",
  "clienteDocumento" = c."documento",
  "clienteWhatsapp" = c."whatsapp",
  "clienteEmail" = c."email",
  "clienteCep" = c."cep",
  "clienteLogradouro" = c."logradouro",
  "clienteNumero" = c."numero",
  "clienteComplemento" = c."complemento",
  "clienteBairro" = c."bairro",
  "clienteCidade" = c."cidade",
  "clienteUf" = c."uf",
  "clienteCopiadoEm" = CURRENT_TIMESTAMP
FROM "Cliente" c
WHERE c."id" = o."clienteId" AND o."clienteNome" IS NULL;
