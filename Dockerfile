FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY scripts ./scripts
COPY compliance ./compliance
COPY public ./public
RUN npm run build

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS runtime-files
# The pinned base already includes the reviewed CA bundle. Avoid fetching
# packages from a moving Alpine index when building the same pinned image.
RUN test -s /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY LICENSE ./LICENSE
COPY compliance ./compliance
COPY scripts/licenses.mjs ./scripts/licenses.mjs
RUN node scripts/licenses.mjs /app/compliance-report \
    && cp /lib/apk/db/installed /app/compliance-report/apk-installed.txt \
    && test "$(node --version)" = "v24.22.0" \
    && cp compliance/licenses/node-v24.22.0.txt /app/compliance-report/node-notices.txt \
    && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/uploads && chown node:node /data/uploads

# Copy the cleaned filesystem so unused package managers are absent from both
# the running filesystem and the layers distributed in release archives.
FROM scratch AS runtime
COPY --from=runtime-files / /
WORKDIR /app
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
ARG VERSION=development
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Little Hint" \
      org.opencontainers.image.source="https://github.com/Affolder-Creative/little-hint" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.licenses="PolyForm-Perimeter-1.0.0"
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server/index.js"]
