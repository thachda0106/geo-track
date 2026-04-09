# ═══════════════════════════════════════════════════════
# GeoTrack — Multi-Target Dockerfile
#
# Targets:
#   api     — The main NestJS HTTP API server
#   worker  — Standalone outbox relay worker (no HTTP)
#
# Build:
#   docker build --target api    -t geotrack-api .
#   docker build --target worker -t geotrack-worker .
#
# Run:
#   docker run -p 3000:3000 --env-file .env geotrack-api
#   docker run --env-file .env geotrack-worker
# ═══════════════════════════════════════════════════════

# ─── Stage 1: Install Production Dependencies ─────────
FROM node:20.19-alpine3.20 AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Build ───────────────────────────────────
FROM node:20.19-alpine3.20 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY libs/ ./libs/
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ─── Stage 3: Base Production Image ──────────────────
FROM node:20.19-alpine3.20 AS base
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S geotrack && \
    adduser -S geotrack -u 1001 -G geotrack

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy package.json for metadata
COPY package.json ./

# Switch to non-root user
USER geotrack

# ─── Target: API Server ──────────────────────────────
FROM base AS api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations then start API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

# ─── Target: Outbox Worker ────────────────────────────
FROM base AS worker

# No HTTP port needed
# No health check via HTTP — use process liveness

# Run migrations then start worker
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/workers/outbox-worker.js"]
