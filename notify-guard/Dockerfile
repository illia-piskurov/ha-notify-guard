FROM oven/bun:1.1-alpine AS builder
WORKDIR /build
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install
COPY frontend ./
RUN bun run build

FROM oven/bun:1.1-alpine
RUN apk add --no-cache bash curl jq sqlite

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY src ./src
COPY tsconfig.json ./
COPY --from=builder /build/dist ./dist

RUN mkdir -p /config/notify_guard

EXPOSE 8000
CMD ["bun", "run", "src/index.ts"]