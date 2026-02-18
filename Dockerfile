# =========================
# Stage 1 — Builder
# =========================
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Install openssl (needed by Prisma)
RUN apt-get update && apt-get install -y openssl

# Copy package files first
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy source + prisma
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build


# =========================
# Stage 2 — Production
# =========================
FROM node:18-bullseye-slim

WORKDIR /app

# Install openssl again for runtime Prisma
RUN apt-get update && apt-get install -y openssl

# Copy package files
COPY package*.json ./

# Install production deps ONLY
RUN npm ci --omit=dev

# Copy prisma schema BEFORE generate
COPY prisma ./prisma

# Generate Prisma client for production
RUN npx prisma generate

# Copy built backend
COPY --from=builder /app/dist ./dist

# Non-root user (security)
RUN useradd -m nodeuser
USER nodeuser

# Render provides PORT automatically (usually 10000)
EXPOSE 10000

# Start backend
CMD ["node", "dist/index.js"]
