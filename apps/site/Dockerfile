FROM node:26.13.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune site --docker

FROM node:26.13.0-alpine AS builder
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

ARG PUBLIC_SITE_URL
ARG PUBLIC_APP_URL
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL} \
  PUBLIC_APP_URL=${PUBLIC_APP_URL}
RUN test -n "$PUBLIC_SITE_URL" || (echo "ERROR: --build-arg PUBLIC_SITE_URL is required (e.g. https://example.com)" && exit 1)
RUN test -n "$PUBLIC_APP_URL" || (echo "ERROR: --build-arg PUBLIC_APP_URL is required (e.g. https://app.example.com)" && exit 1)

RUN pnpm --filter site exec astro build

FROM caddy:2.11-alpine AS runner
COPY apps/site/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /repo/apps/site/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-80}/health" || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
