# Multi-stage Dockerfile for Aetheria.
# Stage 1: install + build all workspaces.
# Stage 2: minimal runtime — just the server, prebuilt client static, prisma client.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy lockfile + workspace manifests first for cache-friendly install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Now copy sources and build.
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/client packages/client
COPY tsconfig.base.json ./

RUN pnpm --filter @game/shared build
RUN cd packages/server && pnpm exec prisma generate
RUN pnpm --filter @game/client exec vite build

# Stage 2: runtime
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=2567

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/server ./packages/server
COPY --from=build /app/packages/client/dist ./packages/client/dist

EXPOSE 2567
CMD ["node", "--enable-source-maps", "packages/server/src/index.ts"]
