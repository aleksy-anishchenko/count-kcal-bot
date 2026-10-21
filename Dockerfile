FROM node:24-alpine

WORKDIR /app

# Манифесты отдельно: слой с node_modules пересобирается, только когда меняются зависимости.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# Пустой том при первом запуске возьмёт владельца этой папки — иначе node не смог бы писать в базу.
RUN mkdir -p /app/data && chown node:node /app/data
ENV DB_PATH=/app/data/kcal.db

USER node
CMD ["node", "src/main.ts"]
