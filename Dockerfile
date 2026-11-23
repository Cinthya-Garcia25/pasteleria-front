FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV PORT=3000 DB_PATH=/data/database.db
RUN mkdir /data && chown node:node /data
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "--require", "./src/telemetry-start.js", "src/index.js"]
