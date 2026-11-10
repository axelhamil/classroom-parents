FROM node:26.13.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune api --docker

FROM node:26.13.0-alpine AS builder
COPY --from=oven/bun:1.4.4-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./
RUN pnpm --filter api build \
  && pnpm --filter api --prod deploy --ignore-scripts /deploy \
  && mkdir -p packages/drizzle/migrations \
  && cp -r packages/drizzle/migrations /deploy/migrations

FROM oven/bun:1.4.4-alpine AS runner
WORKDIR /app
COPY --from=builder --chown=bun:bun /deploy ./
USER bun

ENV NODE_ENV=production
ENV MIGRATIONS_FOLDER=/app/migrations
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/livez" || exit 1

CMD ["sh", "-c", "bun dist/migrate.js && exec bun dist/index.js"]
