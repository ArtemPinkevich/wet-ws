FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY echo-demo/server.mjs ./echo-demo/server.mjs
USER node
EXPOSE 9000 9001
CMD ["node", "echo-demo/server.mjs"]

