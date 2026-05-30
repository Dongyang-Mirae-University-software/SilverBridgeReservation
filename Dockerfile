# SilverBridge Reservation API — MCP 브릿지(reservation-mcp)가 호출하는 Nest REST
FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin-ui/package.json ./admin-ui/
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate && pnpm build

ENV NODE_ENV=production
ENV PORT=6015
ENV DATABASE_URL=file:/app/data/dev.db

RUN mkdir -p /app/data

EXPOSE 6015

# 마이그레이션 적용 후 API 기동 (SQLite는 /app/data 볼륨 권장)
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
