FROM node:18.14.0 as build
WORKDIR /tmp/awala-endpoint
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build && npm prune --omit=dev && rm -r src tsconfig.json

FROM node:18.14.0-slim
LABEL org.opencontainers.image.source="https://github.com/relaycorp/awala-endpoint-internet"
EXPOSE 8080
WORKDIR /opt/awala-endpoint
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_OPTIONS="--experimental-vm-modules --enable-source-maps"
COPY --chown=node:node --from=build /tmp/awala-endpoint ./
RUN npm link --save=false --fund=false
USER node
