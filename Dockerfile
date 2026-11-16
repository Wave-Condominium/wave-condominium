# Imagem de produção do Wave para o ECS Fargate (ADR 0004).
# Build: docker build -t wave .
# O bundle /_next/static também vai para o S3/CloudFront pelo pipeline; ele fica
# na imagem também para o container funcionar sozinho (ex.: teste local).

FROM node:22-bookworm-slim AS base
# Prisma precisa de OpenSSL para escolher o engine certo (debian-openssl-3.0.x).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Não usa `npm run build`: ele roda `prisma migrate deploy`, e no build da imagem
# não há banco. As migrations rodam no start do container (CMD abaixo).
RUN npx prisma generate && npx next build

# CLI do Prisma isolado só para `migrate deploy`: o output standalone não leva
# o CLI. Manter a versão igual à do package.json.
FROM base AS prisma-cli
ARG PRISMA_VERSION=6.19.3
RUN npm install --prefix /prisma-cli --no-audit --no-fund "prisma@${PRISMA_VERSION}"

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=prisma-cli /prisma-cli /prisma-cli
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
USER node
EXPOSE 3000
CMD ["sh", "-c", "node /prisma-cli/node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
