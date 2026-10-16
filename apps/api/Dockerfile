# The api's image (spec 12.3): one image, a container per command: `api`, `worker` and `console`, and the one-off
# `migrate`, `first-super-admin` and `demo` (docker-entrypoint.sh). Build it from the repository's root:
#   docker build --file apps/api/Dockerfile --tag travel-crm-api .
# Nothing secret is in it: every setting comes from the environment when a container starts (apps/api/README.md).

# Node 24 on Debian 13, pinned by tag and digest (Renovate updates both). It builds and it runs.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node

FROM node AS build
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
# The bundle carries Prisma's generated client (scripts/bundle.ts).
RUN pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/api-server build
# What the bundle leaves out, installed as the lockfile has it: the adapters' vendor packages, and for `migrate` the
# Prisma CLI with the db package's config. Each deploy's lockfile is a part of the one `pnpm fetch` checked against
# the supply-chain policies (pnpm-workspace.yaml) above, so it is trusted rather than checked again over the network.
# Then everything the runtime holds is moved into /out as /app lays it out, for one COPY.
RUN pnpm deploy --filter @travel-crm/integrations --prod --offline --trust-lockfile /deploy/integrations \
  && pnpm deploy --filter @travel-crm/db --prod --offline --trust-lockfile /deploy/db \
  && mkdir -p /out/apps/api /out/packages/db \
  && mv apps/api/dist apps/api/docker-entrypoint.sh /deploy/integrations/node_modules /out/apps/api/ \
  && mv /deploy/db/package.json /deploy/db/prisma.config.ts /deploy/db/prisma /deploy/db/node_modules /out/packages/db/

FROM node AS runtime
# Node alone: npm, npx, corepack and yarn have no part in running the image.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
# Owned by root: the node user, who runs every command, can read the files but not change them.
COPY --from=build /out ./
USER node
# The api's PORT and the console's CONSOLE_PORT, by default.
EXPOSE 3001 3002
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
CMD ["api"]
