FROM node:22-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 AETHERII_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/start.mjs", "--production"]
