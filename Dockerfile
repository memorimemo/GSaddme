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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
