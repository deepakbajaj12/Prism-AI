# ── Builder stage: compile Vite frontend ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer-cached unless package*.json changes)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and server source
COPY --from=builder /app/dist ./dist
COPY server ./server

# tsx is needed to run TypeScript server directly in production
# (avoids a separate tsc build step while keeping the image small)
RUN npm install --save-dev tsx

# Cloud Run injects PORT; default to 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Health check so Cloud Run marks the revision healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/healthz || exit 1

CMD ["node", "--loader", "tsx/esm", "server/index.ts"]
