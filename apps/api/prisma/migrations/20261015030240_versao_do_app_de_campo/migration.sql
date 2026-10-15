-- Última versão do app de campo vista nos pedidos (cabeçalho X-App-Campo) e quando, por usuário.
-- NULL = nunca mandou o cabeçalho: app instalado antes dele, ou nunca usou o app. A tela de
-- Usuários mostra isso para os técnicos; é o que diz quando é seguro subir a versão mínima.
ALTER TABLE "Usuario" ADD COLUMN     "versaoAppCampo" INTEGER,
ADD COLUMN     "versaoAppCampoEm" TIMESTAMP(3);
