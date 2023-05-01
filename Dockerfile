FROM node:18.14.0 as build
WORKDIR /tmp/awala-endpoint
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build && npm prune --omit=dev && rm -r src

FROM node:18.14.0-slim
LABEL org.opencontainers.image.source="https://github.com/relaycorp/awala-endpoint-internet"
WORKDIR /opt/awala-endpoint
COPY --from=build /tmp/awala-endpoint ./
USER node
ENTRYPOINT [ \
  "node", \
  "--unhandled-rejections=strict", \
  "--experimental-vm-modules", \
  "--enable-source-maps", \
  "build/main/bin/server.js" \
  ]
EXPOSE 8080
