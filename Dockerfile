FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production RAKEN_DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY web ./web
COPY scripts ./scripts
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
