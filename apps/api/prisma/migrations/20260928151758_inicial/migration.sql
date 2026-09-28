-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'COMERCIAL', 'GESTOR', 'TECNICO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "CategoriaProduto" AS ENUM ('PAINEL_SOLAR', 'INVERSOR', 'ESTRUTURA', 'CABO', 'MAO_DE_OBRA', 'OUTROS');

-- CreateEnum
CREATE TYPE "Unidade" AS ENUM ('UN', 'KIT', 'M', 'SERVICO', 'KWP');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'EM_NEGOCIACAO', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "TipoDesconto" AS ENUM ('PERCENTUAL', 'VALOR');

-- CreateEnum
CREATE TYPE "CondicaoPagamento" AS ENUM ('A_VISTA', 'ENTRADA_PARCELAS', 'FINANCIAMENTO');

-- CreateEnum
CREATE TYPE "StatusProjeto" AS ENUM ('AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'EM_EXECUCAO', 'AGUARDANDO_VALIDACAO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoServico" AS ENUM ('INSTALACAO', 'VISITA_TECNICA', 'MANUTENCAO', 'VISTORIA_CONCESSIONARIA');

-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('AGENDADO', 'EM_EXECUCAO', 'AGUARDANDO_VALIDACAO', 'DEVOLVIDO', 'APROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RevisaoFoto" AS ENUM ('PENDENTE', 'OK', 'REFAZER');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "equipeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'FISICA',
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaProduto" NOT NULL,
    "unidade" "Unidade" NOT NULL DEFAULT 'UN',
    "precoCusto" DECIMAL(12,2) NOT NULL,
    "precoVenda" DECIMAL(12,2) NOT NULL,
    "descricaoTecnica" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descontoTipo" "TipoDesconto" NOT NULL DEFAULT 'PERCENTUAL',
    "descontoValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descontoAplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "condicaoPagamento" "CondicaoPagamento" NOT NULL DEFAULT 'ENTRADA_PARCELAS',
    "descontoAVistaPct" DECIMAL(5,2),
    "entradaPct" DECIMAL(5,2),
    "parcelas" INTEGER,
    "bancoFinanciamento" TEXT,
    "validade" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "aprovadoEm" TIMESTAMP(3),
    "recusadoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrcamento" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" "Unidade" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "precoUnitario" DECIMAL(12,2) NOT NULL,
    "precoTabela" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoStatus" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "de" "StatusOrcamento",
    "para" "StatusOrcamento" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projeto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "StatusProjeto" NOT NULL DEFAULT 'AGUARDANDO_AGENDAMENTO',
    "potenciaKwp" DECIMAL(8,2),
    "observacoes" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "tipo" "TipoServico" NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'AGENDADO',
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "tecnicoResponsavelId" TEXT,
    "observacoesTecnico" TEXT,
    "sistemaTestado" BOOLEAN NOT NULL DEFAULT false,
    "enviadoEm" TIMESTAMP(3),
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "motivoDevolucao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistFoto" (
    "id" TEXT NOT NULL,
    "tipoServico" "TipoServico" NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistFoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FotoServico" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "chave" TEXT,
    "rotulo" TEXT,
    "arquivoUrl" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "tamanhoBytes" INTEGER,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "capturadaEm" TIMESTAMP(3),
    "enviadaPorId" TEXT NOT NULL,
    "revisao" "RevisaoFoto" NOT NULL DEFAULT 'PENDENTE',
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUtilizado" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialUtilizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_papel_ativo_idx" ON "Usuario"("papel", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_documento_key" ON "Cliente"("documento");

-- CreateIndex
CREATE INDEX "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX "Cliente_whatsapp_idx" ON "Cliente"("whatsapp");

-- CreateIndex
CREATE INDEX "Produto_categoria_ativo_idx" ON "Produto"("categoria", "ativo");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_codigo_key" ON "Orcamento"("codigo");

-- CreateIndex
CREATE INDEX "Orcamento_status_criadoEm_idx" ON "Orcamento"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "Orcamento_clienteId_idx" ON "Orcamento"("clienteId");

-- CreateIndex
CREATE INDEX "ItemOrcamento_orcamentoId_idx" ON "ItemOrcamento"("orcamentoId");

-- CreateIndex
CREATE INDEX "HistoricoStatus_orcamentoId_criadoEm_idx" ON "HistoricoStatus"("orcamentoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Projeto_codigo_key" ON "Projeto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Projeto_orcamentoId_key" ON "Projeto"("orcamentoId");

-- CreateIndex
CREATE INDEX "Projeto_status_idx" ON "Projeto"("status");

-- CreateIndex
CREATE INDEX "Agendamento_equipeId_dataInicio_idx" ON "Agendamento"("equipeId", "dataInicio");

-- CreateIndex
CREATE INDEX "Agendamento_status_idx" ON "Agendamento"("status");

-- CreateIndex
CREATE INDEX "Agendamento_tecnicoResponsavelId_dataInicio_idx" ON "Agendamento"("tecnicoResponsavelId", "dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistFoto_tipoServico_chave_key" ON "ChecklistFoto"("tipoServico", "chave");

-- CreateIndex
CREATE INDEX "FotoServico_agendamentoId_idx" ON "FotoServico"("agendamentoId");

-- CreateIndex
CREATE INDEX "MaterialUtilizado_agendamentoId_idx" ON "MaterialUtilizado"("agendamentoId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_tecnicoResponsavelId_fkey" FOREIGN KEY ("tecnicoResponsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoServico" ADD CONSTRAINT "FotoServico_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoServico" ADD CONSTRAINT "FotoServico_enviadaPorId_fkey" FOREIGN KEY ("enviadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUtilizado" ADD CONSTRAINT "MaterialUtilizado_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUtilizado" ADD CONSTRAINT "MaterialUtilizado_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
