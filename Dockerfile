FROM node:18.14.0 as build
WORKDIR /tmp/awala-endpoint
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build && npm prune --omit=dev && rm -r src

FROM node:18.14.0-slim
LABEL org.opencontainers.image.source="https://github.com/relaycorp/awala-endpoint-internet"
USER node
WORKDIR /opt/awala-endpoint
COPY --chown=node:node --from=build /tmp/awala-endpoint ./
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_OPTIONS="--unhandled-rejections=strict --experimental-vm-modules --enable-source-maps"
ENTRYPOINT ["npm", "exec", "--offline", "--loglevel=warn"]
EXPOSE 8080
