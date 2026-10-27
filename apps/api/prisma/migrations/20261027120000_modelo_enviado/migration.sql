-- Modelo da proposta com que o cliente a RECEBEU (27/10/2026): gravado a cada envio (WhatsApp
-- ou passagem para "Enviado"), nunca depois de aprovada. Nula: rascunho (usa a configuração
-- atual) ou enviada antes da coluna (abre no modelo atual, o único que já saiu). Só adição.
ALTER TABLE "Orcamento" ADD COLUMN     "modeloEnviado" TEXT;
