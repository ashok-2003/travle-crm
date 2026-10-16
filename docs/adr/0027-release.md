# 0027: The release: the images, the whole product in Docker, CI's gates

Date: 2026-10-16 · Status: accepted · Implements spec sections 2.7 (images that build and run with Docker Compose),
12.1 (the CI gates), 12.2 (environments), 12.3 (hosting) and 12.4 (code scanning, Renovate)

## Decision

- **Two images from the lockfile.** `apps/api/Dockerfile` and `apps/web/Dockerfile` build from the repository's root
  on `node:24.21.0-trixie-slim`, pinned by tag and digest: pnpm from corepack in the version `packageManager` names,
  `pnpm fetch` in a layer of its own, then `pnpm install --frozen-lockfile --offline`. They run as the `node` user,
  with Node alone (npm, corepack and yarn removed), write nothing to their own file system and hold no secret: every
  setting comes from the environment when a container starts, and no `.env` from the checkout reaches a build
  (`.dockerignore`).
- **The api runs as a bundle.** esbuild bundles each command (`server`, `worker`, `console`, `console-command`) with
  our packages and every third-party package but the integrations package's own, which the image installs with
  `pnpm deploy --prod` of that package (`apps/api/scripts/bundle.ts`). Production starts plain Node on JavaScript.
- **One api image, a command per service:** `docker-entrypoint.sh` takes `api` (the default), `worker`, `console`,
  `migrate`, `first-super-admin` or `demo`, and `exec`s Node, so Node is the container's first process and SIGTERM
  reaches it. `migrate` runs the Prisma CLI with the db package's config, which `pnpm deploy --prod` of the db package
  installs (`prisma` and `dotenv` are its dependencies for that reason).
- **The web image is Next.js's standalone server**, built without `API_ORIGIN`, so it rewrites nothing. Its build
  arguments are `CACHE_VERSION` and `STORAGE_ORIGIN`, the bucket's origin its Content-Security-Policy allows, so one
  build serves every environment whose files are at the same origin (path-style URLs on one regional endpoint).
- **The whole product in Docker** is a compose file of its own (`docker-compose.product.yml`): Postgres with
  `bootstrap.sql`'s roles and grant, MinIO and its bucket, Mailpit, a one-off `migrate`, the four services, and Caddy
  routing as the load balancer will (`docker/Caddyfile`). Files are stored at `storage.localhost`, which reaches MinIO
  from the containers and from the browser. `pnpm product:up` runs it.
- **Each checkout's own Compose projects.** Every script that runs Compose goes through `scripts/dev/compose.sh`,
  which names the project `COMPOSE_PROJECT_NAME` (from the environment or `.env`), else
  `travel-crm-<the checksum of the checkout's full path>`, with `-product` for the product; the images are tagged
  after that name too. A second clone or worktree, even in a folder of the same name, never recreates the first's
  containers or its volumes, and a checkout with containers from before keeps them with
  `COMPOSE_PROJECT_NAME=travel-crm`. Neither compose file names its project, and both publish their ports on
  127.0.0.1 alone, since their passwords are public.
- **Smoke runs prove both.** `pnpm images:smoke` runs every command of the api image in production mode, read-only,
  against a throwaway Postgres, MinIO and Mailpit: health, a PDF rendered with the brand's fonts, the web app's
  security headers and no `/api` rewrite, every process stopping by itself on SIGTERM, and no `.env` file in either
  image. `pnpm product:smoke` brings the compose project up on free ports, checks each route through the proxy (a
  share link's 404, a webhook's refusal, the console's and the api's tRPC) and the web app's headers passed on once
  each, and signs the demo's Owner in.
- **CI runs a job per gate** (`.github/workflows/ci.yml`): typecheck; lint with the import rules, the product-name
  check and actionlint with ShellCheck; the unit, integration and isolation tests on the runner's Docker; the journeys
  in Playwright's Chromium; Lighthouse; the migrations on an empty Postgres 18 with Prisma's drift check; the images
  and the whole product; the dependency audit. Every step is a pnpm command that runs the same on a laptop, through
  one composite setup action. CodeQL scans the code and the workflows.
- **Lighthouse 13 directly**, three runs per public page (`/sign-in`, `/offline`) on its phone, the median held to
  budgets in a tested module: performance ≥ 0.8, accessibility 1, best practices ≥ 0.95, cumulative layout shift
  ≤ 0.01.
- **The dependency audit is `pnpm audit --audit-level=high`.** Its fixes are `overrides` in `pnpm-workspace.yaml`, its
  exceptions `auditConfig.ignoreGhsas`, each with its advisory and the reason beside it.
- **Everything is pinned:** npm packages by version, images by tag and digest, actions by commit with their version
  beside it. Renovate keeps all three, waits a day before proposing anything (as pnpm's `minimumReleaseAge` does), and
  reads the scripts' images from `scripts/docker/images.sh`.
- **One command for development:** `pnpm dev` starts the services, applies the migrations, then runs the api, the
  worker, the console and the web app together (Turborepo); `pnpm demo` builds the demo.

## Context

- **Bundle or tsx.** The api image started in 0.61-0.63 seconds from `docker run` to an answer on `/health`, against
  1.6-2.1 seconds for `node --import tsx` on the same code. tsx would also need every third-party package installed:
  `pnpm deploy --prod` of the api server is 1.5 GB, because the lockfile resolves better-auth's optional peers to the
  workspace's Next.js, React and Prisma's studio. The integrations package's own deploy is 82 MB.
- **What stays outside the bundle.** React-PDF's pdfkit loads its standard fonts with `require("#standard-fonts/…")`
  and its colour profile through `import.meta.url`, and the PDF fonts are found with `require.resolve`
  (`packages/integrations/src/pdf/fonts.ts`): a bundle would break all three. React must be the copy React-PDF renders
  with. Taking the integrations package's whole list keeps it free of a hand-kept list. The worker's container renders
  the sample quotation with EB Garamond, Figtree and IBM Plex Mono embedded, on every image smoke run.
- **The image's size** is 881 MB (181 MB compressed): the base 270 MB, the bundle 9 MB, the adapters' packages 82 MB
  and the Prisma CLI 325 MB, which `migrate` needs and which brings its studio and `prisma dev` packages with it.
- **LHCI.** `@lhci/cli` 0.15.1, its newest (June 2025), runs Lighthouse 12.6.1 and brings 11 high advisories (`tmp`,
  `external-editor`, `inquirer` and others) that the audit would refuse. Lighthouse 13.5.0 itself has none. Lighthouse
  12 removed the PWA category and its gatherers, so the manifest and the service worker are the journeys' to check
  (plan 5A's install and offline journeys).
- **The budgets** were set at: sign-in 0.87-0.88 for performance (its largest paint at 4.0 seconds on slow 4G),
  offline 0.91, accessibility 1 on both, best practices 0.96 (Chrome logs a CSP issue over plain http). The floor
  leaves room for CI's slower machines.
- **The audit** found three high advisories: mysql2 3.15.3 and deepmerge-ts 7.1.5, inside Prisma's CLI and its config
  loader (overridden to 3.24.5 and 8.0.2, whose `deepmerge` is unchanged; Prisma's commands and the db tests pass on
  it), and braces 3.0.3, which has no fixed version and is reached only by the Next.js ESLint plugin's globbing.
- **Caddy overwrites `X-Forwarded-For`** with the address it saw, whatever the request said, which is what the api's
  rate limits trust when no `AUTH_TRUSTED_PROXIES` is set.

## Consequences

- A package the integrations package adds is installed in the image without further change; one added anywhere else
  is bundled. One that reads its own files at run time must come through the integrations package, or the bundle
  breaks only when it runs: `apps/api/test/bundle.test.ts` and the image smoke are the guards.
- The image smoke issues a document from the checkout (`apps/api/scripts/issue-sample-document.ts`) until an endpoint
  issues one, so CI's images job installs the workspace.
- A separate migrator image would take 325 MB off the api's image; spec 12.3 runs migrations from the api image, so it
  waits for the owner.
- The product in Docker runs the api in development mode, because it serves plain http on localhost with the example
  secret; production settings are the image smoke's.
- CodeQL's results on a private repository need GitHub Code Security.
- The images' `corepack install` reads the root `package.json`, so a change to it fetches the packages again.
- Each override and exception in `pnpm-workspace.yaml` goes when the package holding the old version moves past it;
  re-run the audit after every dependency change.
