FROM node:22-alpine

WORKDIR /app

# Install deps as a separate layer so source edits do not re-run npm ci.
# --omit=dev: there are no dev deps, but this keeps the image honest if any are added.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY *.js ./
COPY set.json ./

# The token cache lives on a volume at /data, not in the image - see token.js.
ENV TOKEN_CACHE=/data/.token-cache.json

# Drop root. node:alpine ships this uid 1000 user already.
USER node

CMD ["node", "bot.js"]
