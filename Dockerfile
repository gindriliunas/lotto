FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /root/.npm \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY src ./src
COPY public ./public
COPY certs ./certs
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
