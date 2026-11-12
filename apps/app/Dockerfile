FROM node:26.13.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune app --docker

FROM node:26.13.0-alpine AS builder
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

ARG VITE_API_URL
ARG VITE_CONTACT_EMAIL
ARG VITE_SITE_URL
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_GIT_SHA
ENV VITE_API_URL=${VITE_API_URL} \
  VITE_CONTACT_EMAIL=${VITE_CONTACT_EMAIL} \
  VITE_SITE_URL=${VITE_SITE_URL} \
  VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
  VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT} \
  VITE_GIT_SHA=${VITE_GIT_SHA}
RUN test -n "$VITE_API_URL" || (echo "ERROR: --build-arg VITE_API_URL is required (e.g. https://api.example.com)" && exit 1)
RUN test -n "$VITE_SITE_URL" || (echo "ERROR: --build-arg VITE_SITE_URL is required (e.g. https://example.com)" && exit 1)
RUN test -n "$VITE_CONTACT_EMAIL" || (echo "ERROR: --build-arg VITE_CONTACT_EMAIL is required (e.g. contact@example.com)" && exit 1)

RUN pnpm --filter app exec vite build

FROM caddy:2.11-alpine AS runner
ARG VITE_API_URL
ENV API_ORIGIN=${VITE_API_URL}
COPY apps/app/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /repo/apps/app/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-80}/health" || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
