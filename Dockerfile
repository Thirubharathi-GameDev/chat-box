FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server/ ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
