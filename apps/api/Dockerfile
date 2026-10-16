# The api's image (spec 12.3): one image, a container per command: `api`, `worker` and `console`, and the one-off
# `migrate`, `first-super-admin` and `demo` (docker-entrypoint.sh). Build it from the repository's root:
#   docker build --file apps/api/Dockerfile --tag travel-crm-api .
# Nothing secret is in it: every setting comes from the environment when a container starts (apps/api/README.md).

# Node 24 on Debian 13, pinned by tag and digest (Renovate updates both). It builds and it runs.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node

FROM node AS build
# The version package.json's packageManager names. Git hooks have no place in an image.
RUN npm install --global pnpm@12.11.2
ENV HUSKY=0 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo
# Every package the lockfile names, fetched in a layer of its own, so it is fetched again only when the lockfile is.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
# The bundle carries Prisma's generated client (scripts/bundle.ts).
RUN pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/api-server build
# What the bundle leaves out, installed as the lockfile has it: the adapters' vendor packages, and for `migrate` the
# Prisma CLI with the db package's config. Each deploy's lockfile is a part of the one `pnpm fetch` checked against
# the supply-chain policies (pnpm-workspace.yaml) above, so it is trusted rather than checked again over the network.
RUN pnpm deploy --filter @travel-crm/integrations --prod --offline --trust-lockfile /deploy/integrations \
  && pnpm deploy --filter @travel-crm/db --prod --offline --trust-lockfile /deploy/db

FROM node AS runtime
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
# Owned by root: the node user, who runs every command, can read the files but not change them.
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /deploy/integrations/node_modules apps/api/node_modules
COPY --from=build /deploy/db/package.json /deploy/db/prisma.config.ts packages/db/
COPY --from=build /deploy/db/prisma packages/db/prisma
COPY --from=build /deploy/db/node_modules packages/db/node_modules
COPY apps/api/docker-entrypoint.sh apps/api/
USER node
# The api's PORT and the console's CONSOLE_PORT, by default.
EXPOSE 3001 3002
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
CMD ["api"]
