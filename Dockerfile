FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci || npm install

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc -p tsconfig.json && npm prune --omit=dev

RUN cp -r src/web dist/web

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server/index.js"]
