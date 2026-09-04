FROM node:20-alpine
WORKDIR /app
# openssl: Prisma. python/make/g++ + cairo/pango: node-canvas (face describe) on musl/alpine.
RUN apk add --no-cache \
    openssl \
    python3 \
    make \
    g++ \
    pkgconf \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    pixman-dev
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && NODE_OPTIONS=--max-old-space-size=4096 npm run build \
  && rm -rf /app/.next/cache /root/.npm /tmp/* \
  && npm prune --omit=dev
ENV PORT=3000
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start"]
