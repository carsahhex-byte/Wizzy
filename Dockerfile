FROM node:24-alpine AS build
WORKDIR /app
COPY package.json index.html ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN npm run build:web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV ACCOUNT_DB_PATH=/data/wizzy.sqlite
COPY package.json ./
COPY src ./src
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["npm", "run", "multiplayer"]
