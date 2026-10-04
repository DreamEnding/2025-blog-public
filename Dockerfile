FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.2
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
WORKDIR /app
RUN useradd --system --uid 1001 --create-home app && mkdir /data /rsshub-config && chown app:app /data /rsshub-config && chmod 700 /rsshub-config
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app ["/app/docs/API docs.md", "./docs/API docs.md"]
USER app
EXPOSE 3000
CMD ["node", "server.js"]
