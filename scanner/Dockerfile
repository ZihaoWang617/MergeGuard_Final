FROM node:22-alpine
RUN apk add --no-cache git ca-certificates
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY scanner.js runner.js ./
RUN mkdir -p /tmp && chown node:node /tmp
USER node
CMD ["node","runner.js"]
