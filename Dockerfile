FROM node:18.14.0 as build
USER node
WORKDIR /tmp/awala-endpoint
COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . ./
RUN npm run build && npm prune --omit=dev && rm -r src

FROM node:18.14.0-slim
LABEL org.opencontainers.image.source="https://github.com/relaycorp/awala-endpoint-internet"
USER node
WORKDIR /opt/awala-endpoint
COPY --from=build /tmp/awala-endpoint ./
ENV NODE_OPTIONS="--unhandled-rejections=strict --experimental-vm-modules --enable-source-maps"
ENTRYPOINT ["npm", "exec"]
EXPOSE 8080
