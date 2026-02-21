# ─── Base ────────────────────────────────────────────────────
# Use Debian slim (not Alpine) — @kreuzberg/node ships glibc native binaries
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
ENV DATABASE_URL="file:./placeholder.db"
RUN npm ci --ignore-scripts && npx prisma generate

# ─── Build ───────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client & build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy DATABASE_URL for prisma generate (it only reads the schema, no DB connection)
ENV DATABASE_URL="file:./placeholder.db"
RUN npx prisma generate
RUN npm run build

# ─── Prisma CLI (isolated install with all transitive deps) ──
FROM base AS prisma-cli
WORKDIR /prisma-cli
RUN npm init -y && npm install prisma@^6.3.0 --save-exact

# ─── Production ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server + static assets + public
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema + migrations for runtime
COPY --from=builder /app/prisma ./prisma

# Copy Prisma CLI with all transitive deps (for `prisma db push` at startup)
# Kept at a separate top-level path so Node's standard module resolution works
# for both CJS and ESM imports within the prisma dependency tree.
COPY --from=prisma-cli /prisma-cli /prisma-cli

# Copy kreuzberg native bindings (needed at runtime)
COPY --from=builder /app/node_modules/@kreuzberg ./node_modules/@kreuzberg

# Database directory (volume mount point) — must be writable by nextjs
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Uploads directory
RUN mkdir -p .uploads && chown nextjs:nodejs .uploads

# Entrypoint: run Prisma db push then start server
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./docker-entrypoint.sh"]
