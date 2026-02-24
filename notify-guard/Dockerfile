FROM oven/bun:1.1-alpine AS builder
WORKDIR /build
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install
COPY frontend ./
RUN bun run build

# Use Node.js for production - better sqlite3 native module support in Alpine
FROM node:20-alpine
RUN apk add --no-cache bash curl jq sqlite

WORKDIR /app

COPY package.json bun.lock* ./
# Install build dependencies for sqlite3 native module
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm install --omit=dev && \
    apk del .build-deps

COPY src ./src
COPY tsconfig.json ./
COPY --from=builder /build/dist ./dist

RUN mkdir -p /config/notify_guard

EXPOSE 8000
CMD ["node_modules/.bin/tsx", "src/index.ts"]