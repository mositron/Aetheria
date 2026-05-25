# Multi-stage Dockerfile for Aetheria.
#   Stage 1 (build):  install all workspaces, build shared + server + client.
#   Stage 2 (runtime): minimal Alpine + prod deps + compiled JS + client dist.
#                       runs prisma migrate deploy before starting node.

# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Manifests first for cache-friendly install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install ALL deps (dev + prod) — needed to build TS + run prisma generate + vite.
RUN pnpm install --frozen-lockfile

# Copy sources + shared tsconfig
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/client packages/client

# Build pipeline
RUN pnpm --filter @game/shared build
RUN cd packages/server && pnpm exec prisma generate
RUN pnpm --filter @game/server build
RUN pnpm --filter @game/client exec vite build

# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
# wget: HEALTHCHECK probe.  tini: proper PID-1 signal handling.
# openssl + libc6-compat: required by Prisma's query engine on Alpine.
RUN apk add --no-cache wget tini openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567

# Copy lockfile + manifests for the prod install in runtime stage.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
# (no client/package.json needed — we only copy its built dist)

# Production deps only (no dev deps → smaller image, faster start)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Compiled output + prisma schema from build stage
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/prisma packages/server/prisma
COPY --from=build /app/packages/client/dist packages/client/dist

# Re-generate Prisma client against the runtime stage's node_modules
# (prisma generate writes into the hoisted pnpm path; doing it here avoids
# fragile cross-stage COPYs of generated files).
RUN cd packages/server && pnpm exec prisma generate

# Entrypoint: run pending Prisma migrations, then start the server.
# Migrations are idempotent — safe on every container start.
RUN printf '#!/bin/sh\nset -e\necho "[entrypoint] applying database migrations..."\ncd /app/packages/server && pnpm exec prisma migrate deploy\necho "[entrypoint] starting server..."\nexec node --enable-source-maps /app/packages/server/dist/index.js\n' > /app/docker-entrypoint.sh \
  && chmod +x /app/docker-entrypoint.sh

# Non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:2567/health > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
