FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p public/vendor /data && cp node_modules/sortablejs/Sortable.min.js public/vendor/ && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/kanban/healthz || exit 1
CMD ["node", "src/server.js"]
