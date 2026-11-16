# syntax=docker/dockerfile:1
# Multi-arch (linux/amd64, linux/arm64) image: Next.js standalone server +
# in-process scheduler + headless Chromium for JS-heavy shops.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Toolchain only used if a native module has no prebuilt binary for this arch.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/price-tracker.db \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TZ=Europe/Ljubljana

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

# The standalone trace keeps only part of playwright-core (no browsers.json, no CLI),
# so ship the full package, then install Chromium headless shell + system libraries.
RUN rm -rf ./node_modules/playwright-core
COPY --from=deps --chown=node:node /app/node_modules/playwright-core ./node_modules/playwright-core
RUN node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
