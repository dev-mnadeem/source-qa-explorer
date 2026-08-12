# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first: this layer is cached until the lockfile changes.
COPY package*.json ./
RUN npm ci

# Prisma client must be generated before tsc, which type-checks against it.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ripgrep makes the agent's grep tool an order of magnitude faster; the service
# falls back to a pure-Node scan when it is absent, so this is an optimisation
# rather than a hard requirement.
RUN apk add --no-cache ripgrep tini

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Never run application code as root.
RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /tmp/codebase-investigator/repos \
 && chown -R app:app /app /tmp/codebase-investigator
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps the ripgrep child processes the grep tool spawns.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
