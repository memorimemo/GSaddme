FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat vips-dev fftw-dev build-base

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat vips-dev fftw-dev build-base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

FROM node:22-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 appuser

RUN apk add --no-cache vips

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=appuser:nodejs . .

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Health check for ECS task health monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Default: API server
# Override with: docker run <image> node src/workers/job.worker.js
CMD ["node", "src/server.js"]
