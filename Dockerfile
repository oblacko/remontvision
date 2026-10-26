FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000
CMD ["node", "src/server.js"]
