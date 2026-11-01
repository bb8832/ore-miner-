FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 DATA_FILE=/data/data.json
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js game.js ./
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
