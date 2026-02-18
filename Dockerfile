# ---------- BUILDER ----------
FROM node:18 AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

COPY src ./src

RUN npx prisma generate
RUN npm run build


# ---------- PRODUCTION ----------
FROM node:18

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/    

RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

RUN useradd -m nodejs
USER nodejs

EXPOSE 3001

CMD ["node","dist/index.js"]
