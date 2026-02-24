# Build frontend with Node.js
FROM node:20-alpine AS builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# Production image with Node.js
FROM node:20-alpine
RUN apk add --no-cache bash curl jq sqlite

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./
COPY --from=builder /build/dist ./frontend/dist

RUN mkdir -p /config/notify_guard

EXPOSE 8000
CMD ["node_modules/.bin/tsx", "src/index.ts"]