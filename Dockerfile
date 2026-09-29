# Imagem da Guarusolar para o Fly.io: API + escritório (/) + app dos técnicos (/campo/).
# O Fly compila esta imagem nos servidores dele (fly deploy), não precisa de Docker local.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV TZ=America/Sao_Paulo
# openssl: o Prisma detecta a versão para escolher o motor certo
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------------------------
FROM base AS build
# manifestos primeiro: as dependências só são reinstaladas quando eles mudam
COPY package.json package-lock.json ./
COPY packages/compartilhado/package.json packages/compartilhado/
COPY packages/web/package.json packages/web/
COPY apps/api/package.json apps/api/
COPY apps/escritorio/package.json apps/escritorio/
COPY apps/tecnico/package.json apps/tecnico/
# o postinstall do npm ci roda "prisma generate", que precisa do schema
COPY apps/api/prisma apps/api/prisma
RUN npm ci

COPY . .
RUN npm run build
# só o que a execução precisa (prisma e tsx ficam: migrations e comandos de usuário)
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------------------------
FROM base AS producao
ARG VERSAO=desconhecida
ENV NODE_ENV=production \
    PORT=8080 \
    VERSAO=$VERSAO
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
