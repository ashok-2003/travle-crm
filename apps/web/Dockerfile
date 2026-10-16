# The web app's image (spec 12.3): Next.js's standalone server with the app's build files beside it, as
# test/e2e/support/servers.ts runs it. Build it from the repository's root:
#   docker build --file apps/web/Dockerfile --tag travel-crm-web .
# It is built without API_ORIGIN, so it rewrites nothing: the load balancer sends /api/*, /p/* and /webhooks/* to the
# api's and the console's containers before a request reaches it. One build serves every environment whose files are
# at the same storage origin (STORAGE_ORIGIN, below).

# Node 24 on Debian 13, pinned by tag and digest (Renovate updates both), as for the api.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node

FROM node AS build
# Up to `pnpm install`, these steps are the api's (apps/api/Dockerfile) to the letter, so the two builds share layers.
# Git hooks have no place in an image.
ENV HUSKY=0 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo
# pnpm in the version package.json's packageManager names, through corepack, which checks the download's signature.
COPY package.json ./
RUN corepack enable && corepack install
# Every package the lockfile names, fetched in a layer of its own, so it is fetched again only when the lockfile (or
# package.json) is.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
ENV NEXT_TELEMETRY_DISABLED=1
# The browser drops a query cache saved by another build (next.config.ts): pass the commit, or the build's time is used.
ARG CACHE_VERSION
# Where the browser uploads files and loads logos from, which the Content-Security-Policy allows: the bucket's origin,
# such as https://s3.ap-south-1.amazonaws.com. next.config.ts reads it when the app is built, and refuses to build
# without it. The image takes no API_ORIGIN or CONSOLE_ORIGIN, so it rewrites nothing (above).
ARG STORAGE_ORIGIN
# Prisma's client for the api's types the app checks against, then the brand's files: its icons, brand.css, sw.js.
RUN pnpm --filter @travel-crm/db generate \
  && pnpm --filter @travel-crm/brand build \
  && pnpm --filter @travel-crm/web generate \
  && pnpm --filter @travel-crm/web build

FROM node AS runtime
# Node alone: npm, npx, corepack and yarn have no part in running the image (the same layer as the api's).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# Owned by root: the node user, who runs the server, can read the files but not change them.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
