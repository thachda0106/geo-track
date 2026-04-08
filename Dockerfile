# ═══════════════════════════════════════════════════════
# GeoTrack — Multi-Stage Dockerfile
# Build: docker build -t geotrack .
# Run:   docker run -p 3000:3000 --env-file .env geotrack
# ═══════════════════════════════════════════════════════

# ─── Stage 1: Install Dependencies ─────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files only (leverage Docker cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Build ───────────────────────────────────
FROM node:20-alpine AS build
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

# ─── Stage 3: Production ──────────────────────────────
FROM node:20-alpine AS production
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

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
