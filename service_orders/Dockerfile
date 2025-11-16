FROM node:18-alpine

# Установить wget для healthcheck
RUN apk add --no-cache wget

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8002/orders/health || exit 1

CMD ["node", "index.js"]