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
COPY package.json ./
COPY src ./src
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8787
CMD ["npm", "run", "multiplayer"]
