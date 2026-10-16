# Foundation 05C: The Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The four tasks run in order on one branch; the plan runs apart from plan 5B (the remaining screens) and merges before, after or beside it.

**Goal:** The Foundation ships: the api and the web app as Docker images built from the lockfile (spec 12.3), the whole product running in Docker Compose behind a proxy that routes as the load balancer will (spec 2.7), CI running every gate of spec 12.1 as a job of its own, with Lighthouse, a migration check, a dependency audit and CodeQL (spec 12.4), one command for local development, and a deploy checklist that says what every process needs and how a deploy runs them, on whichever serverless platform in Mumbai the owner chooses.

**Architecture:**
- **Two images, one lockfile.** `apps/api/Dockerfile` and `apps/web/Dockerfile` build from the repository's root on `node:24.21.0-trixie-slim`, pinned by tag and digest: `pnpm fetch` in a layer of its own, then `pnpm install --frozen-lockfile --offline`. Both run as the `node` user on a read-only file system and hold no secret.
- **The api runs as an esbuild bundle**, one entry per command (`server`, `worker`, `console`, `console-command`, as `.mjs`), with our packages and every third-party package inside it but the integrations package's own, which the image installs with `pnpm deploy --prod` of that package: React-PDF and the fonts read their own files at run time. The same image's `migrate` runs the real Prisma CLI, installed by `pnpm deploy --prod` of the db package. `docker-entrypoint.sh` maps `api | worker | console | migrate | first-super-admin | demo` to Node with `exec`, so SIGTERM reaches the process's own drain.
- **The web image is Next.js's standalone server**, built without `API_ORIGIN`, so it rewrites nothing; its one address, `STORAGE_ORIGIN` (the bucket's origin, which plan 5B's Content-Security-Policy allows), is a build argument, so one build serves every environment whose files are at the same origin. The load balancer routes `/api/platform/*` to the console, `/api/*`, `/p/*` and `/webhooks/*` to the api, the rest to the web app.
- **The whole product in Docker** is a compose project of its own (`docker-compose.product.yml`, `travel-crm-product`) with Caddy as the load balancer's stand-in (`docker/Caddyfile`); files are stored at `storage.localhost`, an address that reaches MinIO from the containers and from the browser.
- **Each gate is a pnpm command that runs the same on a laptop:** `pnpm images:smoke`, `pnpm product:smoke`, `pnpm lighthouse`, `pnpm migrations:check`, `pnpm workflows:lint`, `pnpm audit --audit-level=high`, beside `pnpm check`'s parts. CI (`.github/workflows/ci.yml`) runs them a job each through one composite setup action; the shell scripts live in `scripts/`.

**Tech Stack:**
- Plans 1-5A's stack, unchanged: Node 24.21.0, pnpm 12.11.2 (2026-10-09), Turborepo 2.11.8, TypeScript 6.0.3, Prisma 7.10.0, Postgres 18, Vitest 5.0.4, Next.js 16.4.0 (16.4.1, with React 19.3.1, once plan 5A's security bump is on `main`: the images build either), @playwright/test 1.64.0, esbuild 0.28.2 (2026-08-08; already in the lockfile, now also the api server's own development dependency).
- New npm packages: lighthouse 13.5.0 (2026-09-18), a development dependency of the web app. Overrides for the audit: mysql2 3.24.5 (2026-09-29, inside Prisma's CLI) and deepmerge-ts 8.0.2 (2026-08-21, inside Prisma's config loader).
- Images, by tag and digest: `node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66` (2026-10-06), `postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` (2026-09-21), `pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372` (2026-08-04), `axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea` (2026-10-11), `caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f` (Caddy 2.11.7, 2026-10-03; the image 2026-10-06), `rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667` (2026-03-30; ShellCheck 0.11.0 inside).
- GitHub Actions, by commit: actions/checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1` (2026-07-20), actions/setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1` (2026-10-08), pnpm/action-setup v6.1.0 `ea17c68df8912ef543352723c149a84f56e3d413` (2026-09-05), actions/upload-artifact v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (2026-10-07), github/codeql-action v4.38.3 `24c54180a607b1449ed407dd24f251e4e9147c8d` (2026-10-08).
- Checked with, not added: Renovate 44.158.0 (2026-10-14), whose `renovate-config-validator --strict` passes `renovate.json`.
- Newer versions left out as under a day old when built: Node 24.22.0's images (2026-10-14 20:40 UTC), github/codeql-action v4.39.0 (2026-10-15).

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md`, sections 2.7 (images that build and run with Docker Compose), 12.1 (the CI gates), 12.2 (environments), 12.3 (hosting: stateless containers, health and SIGTERM, migrations as a one-off job, secrets, backups, logs) and 12.4 (Renovate, code scanning, HTTPS and headers); with plan 4's and 5A's notes for the deploy. This is plan 5C, the last part of plan 5 of the Foundation:

1. Repo and data isolation (done; merged to `main`)
2. API and identity (done; merged to `main`)
3. Shared services (done)
4. Platform and subscriptions (done)
5. Web app and release: 5A (the web foundation, done), 5B (the remaining screens), **5C, this plan** (the release)

**How this plan was checked.**
- Every file in it was written and run in a scratch clone of `replay/5b` at `7e4e940` (`main` with plans 3, 4 and 5A merged, and the journeys' subscribed agencies). The four tasks were built there in order, test first, each committed with its gate green: Task R1 `761e7ac`, R2 `2e1198d`, R3 `c93ec0b`, R4 `9d6e710`.
- Each task's "Expected: FAIL" was replayed: the task's new tests or scripts alone on its parent commit. The checks with no "before" (the migration check, the workflows' lint) were shown to refuse a planted fault.
- The code blocks are the committed files after Prettier and ESLint, copied from the commits by script and compared with them byte for byte (`verify_plan.py`, OK for each task).
- Each CI job's commands were run on macOS with Docker Desktop (linux/arm64): the setup action's, then typecheck, lint, the tests, the journeys, Lighthouse, the migrations, both smoke runs and the audit. GitHub's own runner (ubuntu-24.04, amd64) and CodeQL were not run.
- The branch was then proven from a fresh clone: `pnpm install --frozen-lockfile`, the generate steps, `format:check`, typecheck, lint, every package's tests, the import rules, the audit, `pnpm workflows:lint` and `pnpm migrations:check`, all green.

---

## Shared files and merge notes

Plan 5C touches none of plan 5B's files but these, and keeps its edits there to new lines and new sections:

| File | Task | Change |
| --- | --- | --- |
| `package.json` (root) | R1-R4 | new scripts: `dev`, `demo` (before `format`); `images:smoke`, `product:up`, `product:down`, `product:smoke`, `lighthouse`, `migrations:check`, `workflows:lint` (after `e2e`, which gains a comma) |
| `README.md` | R4 | four new subsections at the end of "Run it locally" (`Everything at once`, `The demo agency`, `The whole product in Docker`, `Mail and files`) and two bullets in "Where things are"; no existing line changes |
| `CLAUDE.md` | R4 | eight new command-table rows (three after the console's row, five after `pnpm check`'s) within the table's widths, a line under the table, a new last section "The release (ADR 0027)" |
| `docs/adr/README.md` | R4 | one row, 0027, after 5B's 0025 and 0026 |
| `apps/web/package.json` | R3 | the `lighthouse` script after `e2e`; the `lighthouse` 13.5.0 development dependency |
| `pnpm-workspace.yaml` | R3 | new last blocks `overrides` and `auditConfig` |
| `apps/api/package.json`, `apps/api/tsconfig.json` | R1 | the `build` script and esbuild; `scripts` in `include` |
| `packages/db/package.json` | R1 | `prisma` and `dotenv` move from devDependencies to dependencies |
| `.dependency-cruiser.cjs` | R1 | `exclude` gains our packages' `dist/` |
| `turbo.json` | R4 | `dev` waits for the generated code; new `worker` and `console` tasks |
| `.editorconfig` | R2 | a `[Caddyfile]` section (tabs) |
| `renovate.json`, `.github/workflows/ci.yml` | R1, R3 | presets, rules and a custom manager; the workflow replaced |
| `pnpm-lock.yaml` | R1, R3 | regenerate with `pnpm install` after merging; never merge it by hand |

**Merging with plan 5B.** Proven in a scratch clone (plan 5C merged onto plan 5B's finished branch): three
conflicts, each kept on both sides, then every gate of both plans green together (2,369 tests, 142 journeys passed and
2 skipped, both Lighthouse pages within budget at 0.87 and 0.9 performance, the audit's one exception, the import
rules, `pnpm images:smoke`: "The images are good.").
- `CLAUDE.md`: 5B's four bullets and its section "The platform console", then this plan's section "The release (ADR
  0027)"; the command-table rows merge on their own. `docs/adr/README.md`: the rows 0025, 0026, then 0027.
- Merge in either order; resolve `pnpm-lock.yaml` by taking either side and running `pnpm install`, then run `pnpm audit --audit-level=high` (5B adds no package: the one exception stays the only finding).
- 5B's rewrites (`/api/platform/*` to `CONSOLE_ORIGIN`, `/p/*` and `/webhooks/*` to the api) must stay development-only, as `API_ORIGIN` is (`production ? null`): the web image is built without them. `pnpm images:smoke` checks `/api/trpc/me.get` is a 404 on the web image; add the three new paths to that check on the merge.
- 5B's Task G2 reads `STORAGE_ORIGIN` in `next.config.ts` at build time: the web Dockerfile already takes it as a build argument (no default), and the product compose builds with `http://storage.localhost:<port>`. Before 5B it is unused.
- 5B's branding preview issues a sample document over the api; the image smoke can then issue one through it instead of `apps/api/scripts/issue-sample-document.ts`.
- After the merge, run `pnpm lighthouse`: on the merge it measured sign-in 0.87, 1, 0.96 and the offline page 0.9,
  1, 0.96, layout shift 0 on both.

## Rulings made in planning

Each with why, and the cost if it is wrong. The tasks' `.meta` files give the evidence.

- Ruling: production runs an esbuild bundle per command, not tsx — the api's container answers `/health` 0.61-0.63 s after `docker run`, against 1.6-2.1 s with tsx; tsx would need every third-party package installed, and `pnpm deploy --prod` of the api server is 1.5 GB because the lockfile resolves better-auth's optional peers to Next.js, React and Prisma's studio — cost if wrong: a dynamic import or file read the bundler can't see fails only at run time; the bundle test and the image smoke guard it.
- Ruling: the integrations package's third-party dependencies stay outside the bundle, installed by `pnpm deploy --prod` of that package (82 MB) — pdfkit's standard fonts and colour profile and the PDF fonts' woff files are read at run time, and React must be React-PDF's copy; the whole list, so no hand-kept list and nothing installed twice — cost if wrong: ~25 MB of adapters that would bundle.
- Ruling: `migrate` runs the real Prisma CLI from the api image; `prisma` and `dotenv` become the db package's dependencies — spec 12.3 runs migrations from the api image — cost if wrong: 325 MB of the image's 881 MB (181 MB compressed); a separate migrator image would drop it (owner question 1).
- Ruling: no tini — `exec` makes Node the first process, our processes handle SIGTERM, and Node reaps Prisma's schema engine — cost if wrong: zombies from a later command that spawns children.
- Ruling: Debian 13 slim, not Alpine — glibc for Prisma's schema engine and the prebuilt binaries — cost if wrong: ~60 MB.
- Ruling: `pnpm deploy --offline --trust-lockfile` — a deploy's lockfile is a part of the one `pnpm fetch` just checked against the supply-chain policies — cost if wrong: none found.
- Ruling: the image smoke runs in production mode, read-only, and issues a document from the checkout for the worker to render — production is what deploys run, and no endpoint issues documents before 5B — cost if wrong: CI's images job installs the workspace.
- Ruling: a second compose file and project, not a profile in `docker-compose.yml` — the product's `down --volumes` must never drop the development services' data, and its ports must not collide with theirs — cost if wrong: merge with `include:`.
- Ruling: Caddy 2.11.7 as the proxy — six `handle` blocks read as the routing table, and it replaces `X-Forwarded-For` with the client's address, which the api's rate limits trust — cost if wrong: a short nginx.conf.
- Ruling: files at `storage.localhost` in the product — presigned links go from the browser straight to storage (ADR 0011) — cost if wrong: a hosts-file line where `*.localhost` doesn't resolve.
- Ruling: Lighthouse 13.5.0 with a tested budgets module, not @lhci/cli — @lhci/cli 0.15.1 is its newest, still runs Lighthouse 12.6.1 and brings 11 high advisories the audit would refuse; Lighthouse 13 has none and no PWA audits left (the journeys check the manifest and the service worker) — cost if wrong: LHCI's presets and report server later.
- Ruling: budgets performance ≥ 0.8, accessibility 1, best practices ≥ 0.95, layout shift ≤ 0.1, medians of three runs — measured 0.88 and 0.91, 1, 0.96, 0 — cost if wrong: a flaky score on a busy runner.
- Ruling: the audit at `--audit-level=high`, fixing two advisories by override and excepting one with no fix, each named beside its line — cost if wrong: a Prisma CLI path we don't use breaks on the newer deepmerge-ts.
- Ruling: Renovate pins actions and images by digest, waits a day for every update and keeps Node at 24 — cost if wrong: a day's delay on a security fix.
- Ruling: `pnpm dev` is Turborepo running `dev`, `worker` and `console` after `services:up` and `db:migrate` — cost if wrong: none found.
- Ruling: the demo signs in by organization code (`/api/auth/sign-in/org`) — the demo's Owner has a username and no email — cost if wrong: none.

## Global Constraints

- **Node 24 for every command, from the plan's worktree.** Prefix each command with `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`. Node 22 remains the machine default; do not change it.
- **Before Task R1**, make the worktree and branch from `main` once plans 4 and 5A are merged (this plan was built on
  `replay/5b` at `7e4e940`: those merges and the journeys' subscribed agencies, the commit plan 5B starts from too):
  ```bash
  cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05c -b foundation/05c-release main
  cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
  ```
- **Docker must be running** and is shared: run heavy checks with `--concurrency=3`, never restart Docker, and if it is down, wait and retry. Remove only the containers and images your runs make: the smoke runs remove their own, however they end. The first image build takes about three minutes per image (pnpm checks the lockfile's packages against its supply-chain policies).
- **`pnpm dev` and `pnpm services:up` share one Docker project** (`travel-crm`, fixed ports): never run them in a second checkout while another's services are up, or Compose recreates that checkout's containers. The smoke runs use projects and ports of their own.
- **Pinned versions.** Use exactly the versions in the Tech Stack; images by tag and digest (`docker buildx imagetools inspect`), actions by commit with the version beside it. Never anything published in the last 24 hours.
- **The product's name** is read from `@travel-crm/brand`, never typed (`packages/brand/test/product-name.test.ts`); the image names are `travel-crm-api` and `travel-crm-web`, the repository's.
- **Readable code.** A one-line purpose comment at the top of every file, the shell scripts' included; comments say why. Shell scripts are bash with `set -euo pipefail`, compatible with macOS's bash 3.2, and pass ShellCheck (`pnpm workflows:lint`).
- **Commits.** Conventional Commits, a header of at most 100 characters, staged by name (never `git add -A`, `.` or `-a`), the hooks run (never `--no-verify`), **no `Co-Authored-By` trailer**. No secrets or `.env` files in git: `.dockerignore` keeps `.env*` out of the images too.
- **Hosting-neutral.** Nothing in this plan names a cloud account; `docs/deploy-checklist.md` names only what differs between Cloud Run and ECS on Fargate.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each is pinned by the check named.

1. **A package that reads its own files at run time bundled away**, so PDFs (React-PDF's fonts, pdfkit's data) fail only in the worker, in production. Expected: only the integrations package's vendor packages stay outside the bundle, installed as they are, and the worker's container renders a PDF with the brand's three fonts. Pinned in R1 (`apps/api/test/bundle.test.ts`: "leaves out only Node's own modules, the integrations package's vendor packages and pg's native driver"; `scripts/docker/smoke-images.sh`: "the PDF embeds EB Garamond, Figtree and IBM Plex Mono").
2. **SIGTERM never reaching Node** (a shell or a wrapper in between), so plans 3 and 4's drains never run and every deploy kills jobs mid-way. Expected: api, worker and console exit 0 on `docker stop`, the web app 143, none 137. Pinned in R1 (`stop_gracefully` in `scripts/docker/smoke-images.sh`).
3. **A request reaching the wrong process**: the console's `/api/platform/*` reaching the api, or the web image quietly rewriting `/api` to a localhost. Expected: the proxy's routes answer from the right process and a session made through it works; the web image answers `/api` with 404. Pinned in R2 (`scripts/docker/smoke-product.sh`: `whoAmI` 401 from the console, `me.get` 401 then 200 after the demo Owner's sign-in) and R1 (`/api/trpc/me.get answers 404` on the web image).
4. **A schema change merged without its migration**, or migrations that only apply to a database the tests prepared. Expected: every migration applies to an empty Postgres 18 with `bootstrap.sql`'s roles, and drift fails the gate by name. Pinned in R3 (`scripts/ci/check-migrations.sh`, shown failing on a column with no migration) and R1 (the image's own `migrate` on an empty database in `smoke-images.sh`).
5. **An image that only works in development**: a secret baked in, a file written at run time, production settings refused. Expected: every container runs read-only with a scratch `/tmp`, in production mode with https addresses and a fresh 32-byte secret, and the web app's security headers are on `/sign-in`. Pinned in R1 (`scripts/docker/smoke-images.sh`'s `api_image` and its header checks; `.dockerignore`).

## File Structure

```
travel-crm/
├── .dockerignore                      what neither image's build sees: dependencies, build output, .env*, docs
├── docker-compose.product.yml         the whole product in Docker: services, a one-off migrate, the four processes, a proxy
├── docker/Caddyfile                   the proxy's routes, the load balancer's stand-in
├── scripts/docker/                    images.sh (pins), support.sh (helpers), smoke-images.sh, smoke-product.sh
├── scripts/ci/                        check-migrations.sh, lint-workflows.sh
├── .github/actions/setup/             the jobs' shared start: pnpm, Node, install, generate
├── .github/workflows/                 ci.yml (a job per gate), codeql.yml
├── apps/api/Dockerfile                one image, a command per service (docker-entrypoint.sh)
├── apps/api/scripts/                  bundle.ts and build.ts (the image's bundle), issue-sample-document.ts (the smoke's)
├── apps/web/Dockerfile                Next.js's standalone server
├── apps/web/scripts/                  lighthouse.ts, lighthouse-budgets.ts
└── docs/                              deploy-checklist.md extended; adr/0027-release.md
```

---

---

## The tasks

The four run in order on `foundation/05c-release` in `/Users/ak/personal/travel-crm-05c`.

### Task R1: The api and the web app run from Docker images built from the lockfile

Spec 12.3 runs the product as containers, and spec 12.1's seventh gate builds the images. This task makes the two
images: the api's, one image whose commands are `api`, `worker`, `console`, `migrate`, `first-super-admin` and
`demo`, and the web app's, Next.js's standalone server built without `API_ORIGIN`, so it rewrites nothing; the
storage origin its Content-Security-Policy allows (plan 5B) is a build argument, `STORAGE_ORIGIN`. The api runs as an esbuild bundle on plain Node: our packages and every third-party
package but the integrations package's own (React-PDF and the fonts read their own files), which the image installs
from the lockfile with `pnpm deploy`. `pnpm images:smoke` proves them as a deploy runs them: production settings and a
read-only file system against a throwaway Postgres, MinIO and Mailpit, every command once, the worker rendering a PDF
with the brand's fonts, the web app's security headers, and each process stopping by itself on SIGTERM.

**Files:**
- Create: `apps/api/scripts/bundle.ts`, `apps/api/scripts/build.ts`, `apps/api/scripts/issue-sample-document.ts`,
  `apps/api/Dockerfile`, `apps/api/docker-entrypoint.sh`, `apps/web/Dockerfile`, `.dockerignore`,
  `scripts/docker/images.sh`, `scripts/docker/support.sh`, `scripts/docker/smoke-images.sh`
- Modify: `apps/api/package.json` (the `build` script; esbuild 0.28.2), `apps/api/tsconfig.json` (`scripts`),
  `packages/db/package.json` (`prisma` and `dotenv` move to `dependencies`, for `migrate`), `package.json` (the
  `images:smoke` script), `.dependency-cruiser.cjs` (our packages' `dist/` excluded), `renovate.json` (a custom
  manager for `scripts/docker/images.sh`), `apps/api/test/browser-safe-kernel.test.ts` (imports esbuild directly)
- Test: `apps/api/test/bundle.test.ts`, `scripts/docker/smoke-images.sh`

**Interfaces:**
- Consumes: the four entry points `apps/api/src/{server,worker,console,console-command}.ts` and their SIGTERM drains
  (plans 2-4); `issueDocument(tx, actor, input)`, `sampleQuotation({ recipient, supplierStateCode,
  placeOfSupplyStateCode, lines, branding })` (`@travel-crm/domain/documents`), `money(paise)`,
  `systemActor(organizationId)` (`@travel-crm/domain/kernel`), `createDatabase(url, { maxConnections })`
  (`@travel-crm/db`); `packages/db/sql/bootstrap.sql`; Next.js's `output: "standalone"` and `securityHeaders()`
  (plan 5A).
- Produces: `bundleApi({ apiDirectory, outdir }): Promise<Metafile>` and `runtimePackages(apiDirectory):
  Promise<string[]>` (`apps/api/scripts/bundle.ts`); `pnpm --filter @travel-crm/api-server build`, which writes
  `apps/api/dist/{server,worker,console,console-command}.mjs`; the images `travel-crm-api:local` (entrypoint
  `docker-entrypoint.sh <api | worker | console | migrate | first-super-admin | demo>`, default `api`, ports 3001
  and 3002) and `travel-crm-web:local` (`node apps/web/server.js` on `0.0.0.0:3000`, build arguments
  `CACHE_VERSION` and `STORAGE_ORIGIN`); `pnpm images:smoke`; the shell helpers `fail`, `wait_until`, `status_of`, `wait_for_status`,
  `wait_for_log`, `expect_status`, `expect_header` and `stop_gracefully <container> [exit code]`
  (`scripts/docker/support.sh`) and the pins `postgres_image`, `minio_image`, `mailpit_image`
  (`scripts/docker/images.sh`), which Task R2 and R3 source.

- [ ] **Step 1: Write the failing tests**

The bundle's test: one file per command, nothing left out but Node's modules, the integrations package's vendor
packages and pg's native driver, and no test code inside.

**Create `apps/api/test/bundle.test.ts`:**

```ts
// The bundle the api's Docker image runs (scripts/bundle.ts, ADR 0027): one entry per command, our code and every
// third-party package in it but the integrations package's own, which the image installs from the lockfile, and none
// of the tests' code.
import { mkdtemp, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Metafile } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundleApi, runtimePackages } from "../scripts/bundle.js";

const apiDirectory = path.resolve(import.meta.dirname, "..");

/** "@react-pdf/renderer/lib/x" is "@react-pdf/renderer"; "util/types" is "util". */
function packageOf(specifier: string): string {
  const parts = specifier.replace(/^node:/, "").split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
}

/** The package an input file of the bundle comes from, when it comes from node_modules. */
function installedPackageOf(input: string): string | null {
  const after = input.split("node_modules/").at(-1);
  return input.includes("node_modules/") && after !== undefined ? packageOf(after) : null;
}

describe("the api's bundle", () => {
  let outdir = "";
  let metafile: Metafile;

  beforeAll(async () => {
    outdir = await mkdtemp(path.join(tmpdir(), "api-bundle-"));
    metafile = await bundleApi({ apiDirectory, outdir });
  });

  afterAll(async () => {
    await rm(outdir, { recursive: true, force: true });
  });

  it("has a file for each of the image's commands", () => {
    const entries = Object.fromEntries(
      Object.entries(metafile.outputs).map(([file, output]) => [path.basename(file), output.entryPoint]),
    );
    expect(entries).toMatchObject({
      "server.mjs": "src/server.ts",
      "worker.mjs": "src/worker.ts",
      "console.mjs": "src/console.ts",
      "console-command.mjs": "src/console-command.ts",
    });
  });

  it("leaves out only Node's own modules, the integrations package's vendor packages and pg's native driver", async () => {
    const leftOut = new Set([...(await runtimePackages(apiDirectory)), "pg-native"]);
    const imported = Object.values(metafile.outputs).flatMap((output) =>
      output.imports.filter((entry) => entry.external).map((entry) => entry.path),
    );
    const unexpected = imported.filter(
      (specifier) => !builtinModules.includes(specifier.replace(/^node:/, "")) && !leftOut.has(packageOf(specifier)),
    );
    expect(unexpected).toEqual([]);
    expect(imported).toEqual(expect.arrayContaining(["@react-pdf/renderer", "pg-boss", "react"]));
  });

  it("carries every other package itself, so the image needs no other node_modules", async () => {
    const leftOut = await runtimePackages(apiDirectory);
    const carried = new Set(Object.keys(metafile.inputs).flatMap((input) => installedPackageOf(input) ?? []));
    expect([...carried]).toEqual(expect.arrayContaining(["better-auth", "hono", "@prisma/client", "pg", "zod"]));
    expect(leftOut.filter((name) => carried.has(name))).toEqual([]);
  });

  it("holds none of the tests' code", () => {
    const fromTests = Object.keys(metafile.inputs).filter(
      (input) => installedPackageOf(input) === null && /(^|\/)test\//.test(input),
    );
    expect(fromTests).toEqual([]);
  });
});
```

The smoke run, with the helpers and image pins Tasks R2 and R3 reuse:

**Create `scripts/docker/images.sh`:**

```bash
# The images the scripts start beside ours, pinned by tag and digest, one per line, so Renovate updates them
# (renovate.json's custom manager). Sourced by the scripts, never run.
# shellcheck shell=bash disable=SC2034
postgres_image="postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"
minio_image="pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372"
mailpit_image="axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"
```

**Create `scripts/docker/support.sh`:**

```bash
# What the smoke runs share: failing with a reason, waiting for an address to answer, checking answers, and stopping
# a container the way a container platform does. Sourced by the scripts, never run.
# shellcheck shell=bash

# Prints the reason on stderr and ends the script (its EXIT trap cleans up).
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Runs a command every half second until it succeeds, for up to a minute: `wait_until "<what>" <command...>`.
wait_until() {
  local what="$1" attempt
  shift
  for attempt in $(seq 1 120); do
    "$@" >/dev/null 2>&1 && return 0
    [ "$attempt" -lt 120 ] && sleep 0.5
  done
  fail "$what took more than a minute"
}

# The status code `curl` gets from an address, 000 when nothing answers. Extra arguments go to curl.
status_of() {
  local url="$1"
  shift
  curl --silent --output /dev/null --write-out "%{http_code}" --max-time 5 "$@" "$url" || true
}

# Waits up to a minute and a half for an address to answer with the status given, failing at once, with the container's
# log, if the container serving it stops.
wait_for_status() {
  local url="$1" expected="$2" container="$3" attempt
  for attempt in $(seq 1 180); do
    [ "$(status_of "$url")" = "$expected" ] && return 0
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
      docker logs "$container" >&2 || true
      fail "$container stopped before $url answered $expected"
    fi
    [ "$attempt" -lt 180 ] && sleep 0.5
  done
  docker logs "$container" >&2 || true
  fail "$url didn't answer $expected within a minute and a half"
}

# Waits up to a minute for a line in a container's log.
wait_for_log() {
  local container="$1" line="$2" attempt logs
  for attempt in $(seq 1 120); do
    logs="$(docker logs "$container" 2>&1)"
    case "$logs" in *"$line"*) return 0 ;; esac
    [ "$(docker inspect --format '{{.State.Running}}' "$container")" = "true" ] || break
    [ "$attempt" -lt 120 ] && sleep 0.5
  done
  docker logs "$container" >&2 || true
  fail "$container never logged \"$line\""
}

# Expects an address to answer with the status given. Extra arguments go to curl.
expect_status() {
  local url="$1" expected="$2" actual
  shift 2
  actual="$(status_of "$url" "$@")"
  [ "$actual" = "$expected" ] || fail "$url answered $actual, not $expected"
  echo "ok: $url answers $expected"
}

# Expects a response header (headers as `curl --dump-header` writes them) to hold the value given.
expect_header() {
  local headers="$1" name="$2" value="$3" line
  line="$(grep --ignore-case "^$name:" "$headers" || true)"
  case "$line" in *"$value"*) ;; *) fail "the $name header doesn't hold \"$value\"" ;; esac
}

# Stops a container as a container platform does (SIGTERM, then SIGKILL after the grace period) and expects the
# process to have handled the SIGTERM: drained and exited with the code given (0 unless said), never killed (137).
stop_gracefully() {
  local container="$1" expected="${2:-0}" code
  docker stop --time 35 "$container" >/dev/null
  code="$(docker inspect --format '{{.State.ExitCode}}' "$container")"
  [ "$code" = "$expected" ] || {
    docker logs "$container" >&2 || true
    fail "$container exited $code on SIGTERM, not $expected"
  }
  echo "ok: $container drained and exited $expected on SIGTERM"
}
```

**Create `scripts/docker/smoke-images.sh`:**

```bash
#!/usr/bin/env bash
# `pnpm images:smoke` (spec 12.1, gate 7): builds the api's and the web app's images, then runs every command of the
# api's image as a deploy does (production settings, a read-only file system) against a throwaway Postgres, MinIO and
# Mailpit. Expects the api and the console to answer /health, the worker to render a PDF with the brand's fonts, the
# web app to serve /sign-in with its security headers and no /api rewrite, and each process to stop on SIGTERM by
# itself. Everything it starts is removed again, however it ends.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh
source scripts/docker/support.sh

run="travel-crm-smoke-$$"
work="$(mktemp -d)"
cleanup() {
  docker ps --all --quiet --filter "label=$run" | xargs docker rm --force --volumes >/dev/null 2>&1 || true
  docker network rm "$run" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Building the images"
docker build --file apps/api/Dockerfile --tag travel-crm-api:local .
docker build --file apps/web/Dockerfile --tag travel-crm-web:local .

docker network create "$run" >/dev/null
# A container of this run, on its network, removed by cleanup.
start() {
  local name="$1"
  shift
  docker run --detach --name "$run-$name" --label "$run" --network "$run" --network-alias "$name" "$@" >/dev/null
}
# The host port a container's port is published on (each is published on 127.0.0.1 alone).
port_of() {
  docker port "$run-$1" "$2" | sed -n '1s/.*://p'
}
# One value from the throwaway database, as its superuser.
query() {
  docker exec "$run-postgres" psql --username postgres --dbname travel_crm --tuples-only --no-align --command "$1"
}

echo "Starting Postgres (with bootstrap.sql's roles), MinIO and Mailpit"
start postgres --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=travel_crm --publish 127.0.0.1::5432 \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" "$postgres_image"
start minio --env MINIO_ROOT_USER=minio-dev --env MINIO_ROOT_PASSWORD=minio-dev-secret "$minio_image" server /data
start mailpit "$mailpit_image"
# Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
wait_until "Postgres starting" docker exec "$run-postgres" pg_isready --host 127.0.0.1 --username postgres
wait_until "MinIO starting" docker exec "$run-minio" mc alias set local http://localhost:9000 minio-dev minio-dev-secret
docker exec "$run-minio" mc mb --ignore-existing local/travel-crm >/dev/null

# Production settings, as a deploy sets them: https addresses, rate limiting, a strong secret made for this run.
secret="$(node --eval 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
cat >"$work/api.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://app_runtime:runtime@postgres:5432/travel_crm
BETTER_AUTH_SECRET=$secret
BETTER_AUTH_URL=https://app.example.test
APP_URL=https://app.example.test
S3_ENDPOINT=http://minio:9000
S3_BUCKET=travel-crm
S3_ACCESS_KEY_ID=minio-dev
S3_SECRET_ACCESS_KEY=minio-dev-secret
S3_FORCE_PATH_STYLE=true
SMTP_HOST=mailpit
SMTP_PORT=1025
EMAIL_FROM_ADDRESS=no-reply@travel-crm.localhost
$(grep '^VAPID_' .env.example)
EOF
cp "$work/api.env" "$work/console.env"
cat >>"$work/console.env" <<EOF
DATABASE_PLATFORM_URL=postgresql://app_platform:platform@postgres:5432/travel_crm
DEMO_ORGANIZATION_CODE=DEMO
DEMO_PASSWORD=demo-only-password
EOF
# The api's image, read-only like a container platform's, with a scratch /tmp for Node.
api_image() {
  docker run --label "$run" --network "$run" --read-only --tmpfs /tmp "$@"
}

echo "migrate, first-super-admin and demo, once each"
api_image --rm --env DATABASE_MIGRATOR_URL=postgresql://app_migrator:migrator@postgres:5432/travel_crm \
  travel-crm-api:local migrate | tee "$work/migrate.log"
grep --quiet "All migrations have been successfully applied" "$work/migrate.log" || fail "migrate applied nothing"
password="$(api_image --rm --env-file "$work/console.env" travel-crm-api:local \
  first-super-admin --email ops@example.test --name "Smoke Admin")"
[ -n "$password" ] || fail "first-super-admin printed no temporary password"
echo "ok: first-super-admin made the first super admin"
api_image --rm --env-file "$work/console.env" travel-crm-api:local demo | grep --fixed-strings "The demo is ready" ||
  fail "demo didn't build the demo"

echo "api, console and worker"
api_image --detach --name "$run-api" --env-file "$work/api.env" --publish 127.0.0.1::3001 \
  travel-crm-api:local >/dev/null
api_image --detach --name "$run-console" --env-file "$work/console.env" --publish 127.0.0.1::3002 \
  travel-crm-api:local console >/dev/null
api_image --detach --name "$run-worker" --env-file "$work/api.env" travel-crm-api:local worker >/dev/null
wait_for_status "http://127.0.0.1:$(port_of api 3001)/health" 200 "$run-api"
echo "ok: the api answers /health"
wait_for_status "http://127.0.0.1:$(port_of console 3002)/health" 200 "$run-console"
echo "ok: the console answers /health"
wait_for_log "$run-worker" "worker running"

echo "The worker renders a PDF with the brand's fonts"
organization="$(query "SELECT id FROM organization WHERE code = 'DEMO'")"
document="$(DATABASE_URL="postgresql://app_runtime:runtime@127.0.0.1:$(port_of postgres 5432)/travel_crm" \
  ORGANIZATION_ID="$organization" pnpm --filter @travel-crm/api-server exec tsx scripts/issue-sample-document.ts)"
attachment=""
for _ in $(seq 1 60); do
  attachment="$(query "SELECT pdf_attachment_id FROM issued_document WHERE id = '$document'")"
  [ -n "$attachment" ] && break
  sleep 0.5
done
[ -n "$attachment" ] || fail "the worker didn't render the document's PDF"
docker exec "$run-minio" mc cat "local/travel-crm/organizations/$organization/attachments/$attachment" \
  >"$work/sample.pdf"
for font in EBGaramond Figtree IBMPlexMono; do
  grep --quiet --text "/FontName /[A-Z]*+$font" "$work/sample.pdf" || fail "the PDF doesn't embed $font"
done
echo "ok: the PDF embeds EB Garamond, Figtree and IBM Plex Mono"

echo "web"
docker run --detach --name "$run-web" --label "$run" --read-only --tmpfs /tmp --publish 127.0.0.1::3000 \
  travel-crm-web:local >/dev/null
web="http://127.0.0.1:$(port_of web 3000)"
wait_for_status "$web/sign-in" 200 "$run-web"
curl --silent --fail --dump-header "$work/headers" --output /dev/null "$web/sign-in"
expect_header "$work/headers" Content-Security-Policy "default-src 'self'"
expect_header "$work/headers" Content-Security-Policy "frame-ancestors 'none'"
expect_header "$work/headers" Strict-Transport-Security "max-age=63072000; includeSubDomains"
expect_header "$work/headers" X-Content-Type-Options nosniff
expect_header "$work/headers" X-Frame-Options DENY
expect_header "$work/headers" Referrer-Policy strict-origin-when-cross-origin
expect_header "$work/headers" Cross-Origin-Opener-Policy same-origin
expect_header "$work/headers" Permissions-Policy "camera=()"
grep --quiet --ignore-case "^x-powered-by:" "$work/headers" && fail "the web app says what it runs on"
echo "ok: /sign-in carries the security headers"
# Built without API_ORIGIN: the load balancer routes /api, so a request that reaches the app is its 404.
expect_status "$web/api/trpc/me.get" 404

echo "SIGTERM"
for name in api console worker; do
  stop_gracefully "$run-$name"
done
# Next.js's server closes on SIGTERM itself and then exits 143 (128 + SIGTERM), on purpose.
stop_gracefully "$run-web" 143
echo "The images are good."
```

**`package.json`**:

Replace:

```json
    "db:migrate": "pnpm --filter @travel-crm/db db:migrate:deploy",
    "e2e": "turbo run e2e"
  },
```

with:

```json
    "db:migrate": "pnpm --filter @travel-crm/db db:migrate:deploy",
    "e2e": "turbo run e2e",
    "images:smoke": "scripts/docker/smoke-images.sh"
  },
```

Then make the script runnable: `chmod +x scripts/docker/smoke-images.sh`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/bundle.test.ts; pnpm images:smoke`

Expected: FAIL: `Error: Cannot find module '../scripts/bundle.js' imported from …/apps/api/test/bundle.test.ts`, then
`ERROR: failed to build: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory`.

- [ ] **Step 3: Bundle the api's commands**

Add esbuild, already in the lockfile through tsx, as the api's own development dependency:
`pnpm add -D esbuild@0.28.2 --filter @travel-crm/api-server` (the second pair below), then add the `build` script
(the first):

**`apps/api/package.json`**:

Replace:

```json
    "demo": "tsx --env-file-if-exists=../../.env src/console-command.ts demo",
    "typecheck": "tsc --noEmit",
```

with:

```json
    "demo": "tsx --env-file-if-exists=../../.env src/console-command.ts demo",
    "build": "tsx scripts/build.ts",
    "typecheck": "tsc --noEmit",
```

**`apps/api/package.json`**:

Replace:

```json
    "@types/node": "catalog:",
    "eslint": "catalog:",
```

with:

```json
    "@types/node": "catalog:",
    "esbuild": "0.28.2",
    "eslint": "catalog:",
```

- `pnpm-lock.yaml`: regenerated by `pnpm install`; never edited by hand.

**Create `apps/api/scripts/bundle.ts`:**

```ts
// Bundles the api's commands for its Docker image (ADR 0027): the api, the worker, the console and the console's
// one-off commands, as plain JavaScript that Node runs without a TypeScript loader. Our packages and every third-party
// package are in the bundle but the integrations package's own, which the image installs from the lockfile.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build, type Metafile } from "esbuild";

/** One entry per command: each file in src/ that a container starts. */
const ENTRY_POINTS = ["server", "worker", "console", "console-command"] as const;

/**
 * The integrations package's vendor packages, left out of the bundle and installed as they are (`pnpm deploy` of that
 * package, in the Dockerfile). React-PDF and the fonts read files of their own at run time: pdfkit its standard fonts
 * and colour profile, the PDF fonts their woff files (packages/integrations/src/pdf/fonts.ts). React must be the copy
 * React-PDF renders with. The other adapters' packages follow, so no package is in the image twice.
 */
export async function runtimePackages(apiDirectory: string): Promise<string[]> {
  const manifest = await readFile(path.join(apiDirectory, "../../packages/integrations/package.json"), "utf8");
  const { dependencies = {} } = JSON.parse(manifest) as { dependencies?: Record<string, string> };
  return Object.keys(dependencies).filter((name) => !name.startsWith("@travel-crm/"));
}

/** Writes the bundle to outdir: <command>.mjs for each command, and the chunks they share. */
export async function bundleApi({ apiDirectory, outdir }: { apiDirectory: string; outdir: string }): Promise<Metafile> {
  const leftOut = await runtimePackages(apiDirectory);
  const result = await build({
    absWorkingDir: apiDirectory,
    entryPoints: ENTRY_POINTS.map((name) => `src/${name}.ts`),
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    // The code the four commands share goes in chunks once, rather than in each of them.
    splitting: true,
    // pg-native is pg's optional native driver: never installed, and only loaded when asked for.
    external: [...leftOut.flatMap((name) => [name, `${name}/*`]), "pg-native"],
    // Bundled CommonJS packages (pg among them) call require(), which an ES module doesn't have.
    banner: {
      js: 'import { createRequire as createRequireForBundle } from "node:module"; const require = createRequireForBundle(import.meta.url);',
    },
    // Names that clash between modules are renamed in a bundle; their functions and classes keep their own names.
    keepNames: true,
    metafile: true,
    logLevel: "warning",
  });
  return result.metafile;
}
```

**Create `apps/api/scripts/build.ts`:**

```ts
// `pnpm --filter @travel-crm/api-server build`: the bundle the api's Docker image runs, written to dist/
// (scripts/bundle.ts). Run `pnpm --filter @travel-crm/db generate` first: the bundle carries Prisma's generated client.
import { rm } from "node:fs/promises";
import path from "node:path";
import { bundleApi } from "./bundle.js";

const apiDirectory = path.resolve(import.meta.dirname, "..");
const outdir = path.join(apiDirectory, "dist");

await rm(outdir, { recursive: true, force: true });
const metafile = await bundleApi({ apiDirectory, outdir });
console.log(`Wrote ${String(Object.keys(metafile.outputs).length)} files to dist/`);
```

**`apps/api/tsconfig.json`**, the whole file:

```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "scripts", "test", "vitest.config.ts"]
}
```

With esbuild a dependency of this package, the kernel's browser check imports it directly:

**`apps/api/test/browser-safe-kernel.test.ts`**, the whole file:

```ts
// The domain kernel (money, GST, dates, ids) is imported by the web app's client code (plan 5A's lib/format.ts), so it
// must bundle for a browser: no Node built-ins, no pg-boss, nothing from @travel-crm/integrations. This bundles it
// with esbuild for the browser and expects no errors. It lives here because esbuild is this package's own dependency:
// it bundles the api for its Docker image (scripts/bundle.ts).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("the domain kernel in a browser", () => {
  it("bundles for platform browser, with no Node built-in or server-only package", async () => {
    const result = await build({
      stdin: {
        contents: 'export * from "@travel-crm/domain/kernel";',
        resolveDir: fileURLToPath(new URL(".", import.meta.url)),
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    expect(result.errors).toEqual([]);
    expect(result.outputFiles[0]?.text).toContain("formatMoney");
  });
});
```

A local `pnpm --filter @travel-crm/api-server build` writes `apps/api/dist`, which imports packages only the image
installs; dependency-cruiser leaves our packages' build output out (the ESLint config and Prettier already do):

**`.dependency-cruiser.cjs`**:

Replace:

```js
    // Which modules to exclude
    // The web app's public/ holds files served as they are (icons, the bundled service worker), never imported.
    exclude: { path: "(^|/)\\.next/|next-env\\.d\\.ts$|^apps/web/public/" },

```

with:

```js
    // Which modules to exclude
    // The web app's public/ holds files served as they are (icons, the bundled service worker), never imported. A
    // package's own dist/ holds build output (the api's bundle for its image), which imports what only the image
    // installs; node_modules' dist folders stay, so the rules still see what each package imports.
    exclude: { path: "(^|/)\\.next/|^(apps|packages)/[^/]+/dist/|next-env\\.d\\.ts$|^apps/web/public/" },

```

- [ ] **Step 4: The two images**

`migrate` runs the Prisma CLI from the image with the db package's config, so the CLI and the `dotenv` that
`prisma.config.ts` loads become the db package's dependencies (then `pnpm install`):

**`packages/db/package.json`**, the whole file:

```json
{
  "name": "@travel-crm/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./identity": "./src/identity.ts",
    "./platform": "./src/platform.ts",
    "./rate-limits": "./src/rate-limits.ts",
    "./webhooks": "./src/webhooks.ts",
    "./testing": "./test/testing.ts",
    "./testing/global-setup": "./test/global-setup.ts"
  },
  "scripts": {
    "generate": "prisma generate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:status": "prisma migrate status",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/adapter-pg": "catalog:",
    "@prisma/client": "catalog:",
    "dotenv": "18.0.7",
    "pg": "8.23.1",
    "prisma": "catalog:"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "12.2.1",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/pg": "8.23.1",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**Create `.dockerignore`:**

```text
# What `docker build` leaves out of the context for both images (apps/api/Dockerfile, apps/web/Dockerfile): what the
# build makes again (dependencies, generated code, build output), local secrets, and what no image needs.
**/node_modules
**/.next
**/.turbo
**/dist
**/src/generated
**/coverage
**/.vitest
**/*.tsbuildinfo
apps/web/public/icons
apps/web/public/sw.js
apps/web/test-results
apps/web/playwright-report
.env
.env.*
.git
.github
.husky
.claude
.claude-flow
.superpowers
docs
```

**Create `apps/api/docker-entrypoint.sh`:**

```bash
#!/bin/sh
# The api image's commands (spec 12.3: one image, a container per command): `api`, `worker` and `console` run until
# stopped; `migrate`, `first-super-admin` and `demo` run once. Each execs Node, so Node is the container's first
# process and SIGTERM reaches it directly: the processes' own drains (apps/api/README.md) do the stopping.
set -eu

command="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi

case "$command" in
  api) exec node /app/apps/api/dist/server.mjs "$@" ;;
  worker) exec node /app/apps/api/dist/worker.mjs "$@" ;;
  console) exec node /app/apps/api/dist/console.mjs "$@" ;;
  first-super-admin | demo) exec node /app/apps/api/dist/console-command.mjs "$command" "$@" ;;
  # Applies the migrations as app_migrator (DATABASE_MIGRATOR_URL), with the db package's Prisma config.
  migrate)
    cd /app/packages/db
    exec node node_modules/prisma/build/index.js migrate deploy "$@"
    ;;
  *)
    echo "Usage: <api | worker | console | migrate | first-super-admin | demo> [arguments]" >&2
    exit 64
    ;;
esac
```

**Create `apps/api/Dockerfile`:**

```dockerfile
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
```

**Create `apps/web/Dockerfile`:**

```dockerfile
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
# The version package.json's packageManager names. Git hooks have no place in an image.
RUN npm install --global pnpm@12.11.2
ENV HUSKY=0 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo
# Every package the lockfile names, fetched in a layer of its own, so it is fetched again only when the lockfile is.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
ENV NEXT_TELEMETRY_DISABLED=1
# The browser drops a query cache saved by another build (next.config.ts): pass the commit, or the build's time is used.
ARG CACHE_VERSION
# Where the browser uploads files and loads logos from, which the Content-Security-Policy allows: the bucket's origin,
# such as https://s3.ap-south-1.amazonaws.com. Plan 5B reads it in next.config.ts when the app is built, as API_ORIGIN.
ARG STORAGE_ORIGIN
# Prisma's client for the api's types the app checks against, then the brand's files: its icons, brand.css, sw.js.
RUN pnpm --filter @travel-crm/db generate \
  && pnpm --filter @travel-crm/brand build \
  && pnpm --filter @travel-crm/web generate \
  && pnpm --filter @travel-crm/web build

FROM node AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# Owned by root: the node user, who runs the server, can read the files but not change them.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

The smoke run's way to give the worker something to render, until an endpoint issues documents (plan 5B's branding
preview):

**Create `apps/api/scripts/issue-sample-document.ts`:**

```ts
// For the image smoke run (scripts/docker/smoke-images.sh): issues the sample quotation in an organization, so the
// worker's container renders its PDF with the brand's fonts, as it will an agency's documents. Prints the document's
// id. DATABASE_URL (the runtime role) and ORGANIZATION_ID come from the environment.
import { createDatabase } from "@travel-crm/db";
import { issueDocument, sampleQuotation } from "@travel-crm/domain/documents";
import { money, systemActor } from "@travel-crm/domain/kernel";

const { DATABASE_URL: databaseUrl, ORGANIZATION_ID: organizationId } = process.env;
if (databaseUrl === undefined || organizationId === undefined) {
  throw new Error("Set DATABASE_URL and ORGANIZATION_ID");
}

const db = createDatabase(databaseUrl, { maxConnections: 1 });
try {
  const issued = await db.forOrg(organizationId, (tx) =>
    issueDocument(
      tx,
      systemActor(organizationId),
      sampleQuotation({
        recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
        supplierStateCode: "27",
        placeOfSupplyStateCode: "27",
        // Tour operator services, in rupees and paise: the ₹ comes from each font's Latin-extended file.
        lines: [
          {
            description: "Andaman islands, 6 nights",
            sacCode: "998555",
            taxableValue: money(12_50_000_00),
            rateBasisPoints: 500,
          },
        ],
        branding: { organizationName: "Demo Holidays" },
      }),
    ),
  );
  console.log(issued.id);
} finally {
  await db.disconnect();
}
```

Renovate updates the Dockerfiles' pins by itself; the scripts' pins need a custom manager:

**`renovate.json`**, the whole file:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits"],
  "timezone": "Asia/Kolkata",
  "schedule": ["before 9am on monday"],
  "packageRules": [
    {
      "description": "Prisma packages move together. Major upgrades (8.x) need an ADR first.",
      "matchPackageNames": ["prisma", "@prisma/client", "@prisma/adapter-pg"],
      "groupName": "prisma",
      "allowedVersions": "<8"
    },
    {
      "description": "Stay on TypeScript 6 until typescript-eslint supports TypeScript 7 (ADR 0001).",
      "matchPackageNames": ["typescript"],
      "allowedVersions": "<7"
    }
  ],
  "customManagers": [
    {
      "customType": "regex",
      "description": "The images the smoke runs start beside ours (scripts/docker/images.sh), each <name>:<tag>@<digest>.",
      "managerFilePatterns": ["/^scripts/docker/images\\.sh$/"],
      "matchStrings": ["=\"(?<depName>[^:\"]+):(?<currentValue>[^@\"]+)@(?<currentDigest>sha256:[a-f0-9]{64})\""],
      "datasourceTemplate": "docker"
    }
  ]
}
```

Then make the entrypoint runnable: `chmod +x apps/api/docker-entrypoint.sh`.

- [ ] **Step 5: Run the gate**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/bundle.test.ts && pnpm images:smoke`

Expected: PASS: 4 bundle tests, then the smoke run's lines, ending:
```text
ok: the api answers /health
ok: the console answers /health
ok: the PDF embeds EB Garamond, Figtree and IBM Plex Mono
ok: /sign-in carries the security headers
ok: http://127.0.0.1:<port>/api/trpc/me.get answers 404
ok: travel-crm-smoke-<pid>-api drained and exited 0 on SIGTERM
ok: travel-crm-smoke-<pid>-console drained and exited 0 on SIGTERM
ok: travel-crm-smoke-<pid>-worker drained and exited 0 on SIGTERM
ok: travel-crm-smoke-<pid>-web drained and exited 143 on SIGTERM
The images are good.
```
The first run builds both images (about three minutes each: `pnpm fetch` checks the lockfile's 1,049 packages
against the supply-chain policies); later runs take under a minute. `docker images` shows `travel-crm-api:local` at
877 MB (181 MB compressed: the base 270 MB, the bundle 9 MB, the adapters' packages 82 MB, the Prisma CLI 325 MB) and
`travel-crm-web:local` at 418 MB.

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise && pnpm --filter @travel-crm/web e2e`

Expected: PASS, 28 Turborepo tasks, no dependency violations. Tests: api-server 239, api 22, brand 27, contracts 91,
db 232, domain 667, eslint-config 81, integrations 159, web 333 (1,851); journeys 70 passed, 2 skipped.

- [ ] **Step 6: Commit**

```bash
cd /Users/ak/personal/travel-crm-05c
git add .dockerignore .dependency-cruiser.cjs package.json pnpm-lock.yaml renovate.json apps/api/Dockerfile apps/api/docker-entrypoint.sh apps/api/package.json apps/api/tsconfig.json apps/api/scripts/build.ts apps/api/scripts/bundle.ts apps/api/scripts/issue-sample-document.ts apps/api/test/bundle.test.ts apps/api/test/browser-safe-kernel.test.ts apps/web/Dockerfile packages/db/package.json scripts/docker/images.sh scripts/docker/support.sh scripts/docker/smoke-images.sh
git commit -m "feat(release): the api and the web app as Docker images, proven by pnpm images:smoke"
```

### Task R2: The whole product runs in Docker Compose behind a proxy, with one command

Spec 2.7 asks for the images to "build and run locally with Docker Compose", and a deploy needs its routing rules
proven before a load balancer exists. This task puts the product in a compose file of its own: Postgres with
`bootstrap.sql`'s three roles and the platform role's grant, MinIO and its bucket, Mailpit, a one-off `migrate`, then
the api, the worker, the console and the web app, behind Caddy standing in for the load balancer: `/api/platform/*`
to the console, `/api/*`, `/p/*`, `/webhooks/*` and `/health` to the api, everything else to the web app. It is a
project of its own (`travel-crm-product`), with its own network, volumes and ports, so it runs beside the development
services and `down --volumes` never touches their data. Files are stored at `storage.localhost`, one address that
reaches MinIO from the containers and from the browser, so presigned links work in both; the web image is built with
it as its `STORAGE_ORIGIN`. `pnpm product:up` builds and
starts it and builds the demo; `pnpm product:smoke` proves it on free ports and removes it again.

**Files:**
- Create: `docker-compose.product.yml`, `docker/Caddyfile`
- Modify: `package.json` (the `product:up`, `product:down` and `product:smoke` scripts), `scripts/docker/support.sh`
  (`free_port`), `.editorconfig` (tabs for the Caddyfile, as `caddy fmt` writes it)
- Test: `scripts/docker/smoke-product.sh`

**Interfaces:**
- Consumes: Task R1's images `travel-crm-api:local` (its commands `migrate`, `api`, `worker`, `console`, `demo`) and
  `travel-crm-web:local`, and its helpers `fail`, `expect_status` (`scripts/docker/support.sh`); the demo's staff
  (`demoStaff`: `asha`, the Owner, plan 4); `POST /api/auth/sign-in/org { orgCode, username, password }` (plan 2) and
  `me.get`'s `user.name` (plan 5A).
- Produces: `docker-compose.product.yml` (project `travel-crm-product`; services `postgres`, `minio`, `minio-bucket`,
  `mailpit`, `migrate`, `api`, `worker`, `console`, `web`, `proxy`; ports from `PRODUCT_PORT` 58080 (the product),
  `PRODUCT_MAIL_PORT` 58081 (Mailpit), `PRODUCT_STORAGE_PORT` 58090 (MinIO, as `storage.localhost`) and
  `PRODUCT_STORAGE_CONSOLE_PORT` 58091 (MinIO's console)); `docker/Caddyfile` (the routes Task R4's deploy checklist
  gives the load balancer); `pnpm product:up`, `pnpm product:down`, `pnpm product:smoke`; `free_port` (support.sh).

- [ ] **Step 1: Write the failing smoke run**

**Create `scripts/docker/smoke-product.sh`:**

```bash
#!/usr/bin/env bash
# `pnpm product:smoke` (spec 2.7): brings the whole product up in Docker (docker-compose.product.yml) as a project of
# its own on free ports, uses it through the proxy as a browser does, and removes it with its data, however it ends.
# Expects the proxy to route as the load balancer will, mail and files to be readable where the README says, the demo
# to build, and the demo's Owner to sign in.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

export COMPOSE_PROJECT_NAME="travel-crm-product-smoke-$$"
PRODUCT_PORT="$(free_port)"
PRODUCT_MAIL_PORT="$(free_port)"
PRODUCT_STORAGE_PORT="$(free_port)"
PRODUCT_STORAGE_CONSOLE_PORT="$(free_port)"
export PRODUCT_PORT PRODUCT_MAIL_PORT PRODUCT_STORAGE_PORT PRODUCT_STORAGE_CONSOLE_PORT
work="$(mktemp -d)"
compose() {
  docker compose --file docker-compose.product.yml "$@"
}
cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Building and starting the product"
compose up --detach --build --wait --wait-timeout 300 || {
  compose logs >&2
  fail "the product didn't come up"
}

app="http://localhost:$PRODUCT_PORT"
echo "Routes, as the load balancer will have them"
expect_status "$app/sign-in" 200
expect_status "$app/health" 200
# The console answers its own api: the api has no /api/platform and would say 404.
expect_status "$app/api/platform/trpc/whoAmI" 401
expect_status "$app/api/trpc/me.get" 401
echo "Mail and files"
expect_status "http://localhost:$PRODUCT_MAIL_PORT/" 200
# Where presigned links point, from this computer as from the containers.
expect_status "http://storage.localhost:$PRODUCT_STORAGE_PORT/minio/health/live" 200

echo "The demo, and its Owner signing in through the proxy"
compose run --rm --no-deps console demo | tee "$work/demo.log"
grep --quiet "The demo is ready" "$work/demo.log" || fail "the demo wasn't built"
signed_in="$(curl --silent --output /dev/null --write-out "%{http_code}" --cookie-jar "$work/cookies" \
  --header "Origin: $app" --header "Content-Type: application/json" \
  --data '{"orgCode":"DEMO","username":"asha","password":"demo-only-password"}' "$app/api/auth/sign-in/org")"
[ "$signed_in" = "200" ] || fail "the demo's Owner couldn't sign in: $signed_in"
curl --silent --fail --cookie "$work/cookies" --output "$work/me.json" "$app/api/trpc/me.get" ||
  fail "me.get refused the Owner's session"
grep --quiet --fixed-strings '"name":"Asha Mehta"' "$work/me.json" || fail "me.get doesn't name the demo's Owner"
echo "ok: the demo's Owner signed in, and me.get knows her"
echo "The product is good."
```

It finds its ports with a new helper:

**`scripts/docker/support.sh`**:

Replace:

```bash
# What the smoke runs share: failing with a reason, waiting for an address to answer, checking answers, and stopping
# a container the way a container platform does. Sourced by the scripts, never run.
# shellcheck shell=bash
```

with:

```bash
# What the smoke runs share: failing with a reason, free ports, waiting for an address to answer, checking answers,
# and stopping a container the way a container platform does. Sourced by the scripts, never run.
# shellcheck shell=bash
```

Replace:

```bash
  exit 1
}
```

with:

```bash
  exit 1
}

# A port nothing on this computer listens on now.
free_port() {
  node --eval 'const server = require("node:net").createServer().listen(0, "127.0.0.1", () => {
    console.log(server.address().port);
    server.close();
  });'
}
```

**`package.json`**:

Replace:

```json
    "e2e": "turbo run e2e",
    "images:smoke": "scripts/docker/smoke-images.sh"
  },
```

with:

```json
    "e2e": "turbo run e2e",
    "images:smoke": "scripts/docker/smoke-images.sh",
    "product:up": "docker compose --file docker-compose.product.yml up --detach --build --wait && docker compose --file docker-compose.product.yml run --rm --no-deps console demo",
    "product:down": "docker compose --file docker-compose.product.yml down",
    "product:smoke": "scripts/docker/smoke-product.sh"
  },
```

Then make the script runnable: `chmod +x scripts/docker/smoke-product.sh`.

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm product:smoke`

Expected: FAIL: `open …/docker-compose.product.yml: no such file or directory`, then
`FAIL: the product didn't come up`.

- [ ] **Step 3: The compose file and the proxy**

**Create `docker-compose.product.yml`:**

```yaml
# The whole product in Docker (spec 2.7): the api's and the web app's images (apps/*/Dockerfile) with Postgres, MinIO
# and Mailpit, behind a reverse proxy that routes as the load balancer will (docker/Caddyfile). `pnpm product:up`
# builds and starts it and builds the demo; open http://localhost:58080. `pnpm product:down` stops it. It is a project
# of its own, with its own network, volumes and ports, so it runs beside the development services
# (docker-compose.yml). Dev-only secrets, as in .env.example; the ports can be moved with the PRODUCT_* variables.
name: travel-crm-product

# What the api, the worker and the console share. Development mode, because the address is plain http: production
# refuses http and the example secret (apps/api/src/environment.ts). Files are stored at storage.localhost, an address
# that reaches MinIO from the containers (its network alias) and from the browser (*.localhost is this computer), so
# presigned links work in both.
x-api-environment: &api-environment
  NODE_ENV: development
  DATABASE_URL: postgresql://app_runtime:runtime@postgres:5432/travel_crm
  BETTER_AUTH_SECRET: dev-only-secret-not-for-any-real-deploy
  BETTER_AUTH_URL: http://localhost:${PRODUCT_PORT:-58080}
  APP_URL: http://localhost:${PRODUCT_PORT:-58080}
  S3_ENDPOINT: http://storage.localhost:${PRODUCT_STORAGE_PORT:-58090}
  S3_REGION: ap-south-1
  S3_BUCKET: travel-crm
  S3_ACCESS_KEY_ID: minio-dev
  S3_SECRET_ACCESS_KEY: minio-dev-secret
  S3_FORCE_PATH_STYLE: "true"
  SMTP_HOST: mailpit
  SMTP_PORT: "1025"
  EMAIL_FROM_ADDRESS: no-reply@travel-crm.localhost
  VAPID_PUBLIC_KEY: BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY
  VAPID_PRIVATE_KEY: UrS7-d1PFp4TPIVRSD5qGMXmRPN_NbpYvsJxhc6j3nU
  VAPID_SUBJECT: mailto:dev@travel-crm.localhost

# One build of the api's image for the four services that run it.
x-api-image: &api-image
  image: travel-crm-api:local
  build:
    context: .
    dockerfile: apps/api/Dockerfile
  read_only: true
  tmpfs: [/tmp]

# Each starts once the migrations are in, the bucket exists and Mailpit is up.
x-api-depends-on: &api-depends-on
  migrate:
    condition: service_completed_successfully
  minio-bucket:
    condition: service_completed_successfully
  mailpit:
    condition: service_started

services:
  postgres:
    image: postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: travel_crm
    volumes:
      # Postgres 18 images keep data under /var/lib/postgresql/18/docker, so mount the parent.
      - postgres-data:/var/lib/postgresql
      # The three roles and the platform role's grant (packages/db/sql/bootstrap.sql), as a hosted database needs them.
      - ./packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro
    healthcheck:
      # Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
      test: ["CMD", "pg_isready", "--host", "127.0.0.1", "--username", "postgres", "--dbname", "travel_crm"]
      interval: 2s
      timeout: 3s
      retries: 30

  # MinIO no longer publishes images; this is a community build of MinIO itself (ADR 0011). It listens on the same
  # port inside and outside, so storage.localhost:<port> is one address everywhere.
  minio:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372
    command: ["server", "/data", "--address", ":${PRODUCT_STORAGE_PORT:-58090}", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: minio-dev
      MINIO_ROOT_PASSWORD: minio-dev-secret
    ports:
      - "${PRODUCT_STORAGE_PORT:-58090}:${PRODUCT_STORAGE_PORT:-58090}"
      - "${PRODUCT_STORAGE_CONSOLE_PORT:-58091}:9001"
    networks:
      default:
        aliases: [storage.localhost]
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:${PRODUCT_STORAGE_PORT:-58090}/minio/health/live"]
      interval: 2s
      timeout: 3s
      retries: 30
  # Makes the bucket once MinIO is up, then exits. The same image carries MinIO's `mc` client.
  minio-bucket:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372
    depends_on:
      minio:
        condition: service_healthy
    entrypoint:
      - sh
      - -c
      - >-
        mc alias set local http://minio:${PRODUCT_STORAGE_PORT:-58090} minio-dev minio-dev-secret &&
        mc mb --ignore-existing local/travel-crm
    restart: "no"

  # Catches every email; read them at http://localhost:58081.
  mailpit:
    image: axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea
    ports:
      - "${PRODUCT_MAIL_PORT:-58081}:8025"

  # The migrations, once, as app_migrator, before anything else starts (spec 12.3).
  migrate:
    <<: *api-image
    command: ["migrate"]
    environment:
      DATABASE_MIGRATOR_URL: postgresql://app_migrator:migrator@postgres:5432/travel_crm
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  api:
    <<: *api-image
    command: ["api"]
    environment: *api-environment
    depends_on: *api-depends-on
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "--eval",
          "fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))",
          "http://127.0.0.1:3001/health",
        ]
      interval: 2s
      timeout: 3s
      retries: 30

  worker:
    <<: *api-image
    command: ["worker"]
    environment: *api-environment
    depends_on: *api-depends-on

  # The only service with the platform role's URL. It runs the nightly demo reset with the demo's variables.
  console:
    <<: *api-image
    command: ["console"]
    environment:
      <<: *api-environment
      DATABASE_PLATFORM_URL: postgresql://app_platform:platform@postgres:5432/travel_crm
      DEMO_ORGANIZATION_CODE: DEMO
      DEMO_PASSWORD: demo-only-password
    depends_on: *api-depends-on
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "--eval",
          "fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))",
          "http://127.0.0.1:3002/health",
        ]
      interval: 2s
      timeout: 3s
      retries: 30

  web:
    image: travel-crm-web:local
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        # The storage address the browser uploads to and loads logos from, which its Content-Security-Policy allows.
        STORAGE_ORIGIN: http://storage.localhost:${PRODUCT_STORAGE_PORT:-58090}
    read_only: true
    tmpfs: [/tmp]
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "--eval",
          "fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))",
          "http://127.0.0.1:3000/sign-in",
        ]
      interval: 2s
      timeout: 3s
      retries: 30

  # The load balancer's stand-in, and the product's one address: http://localhost:58080.
  proxy:
    image: caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
    ports:
      - "${PRODUCT_PORT:-58080}:80"
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile:ro
    depends_on:
      api:
        condition: service_healthy
      console:
        condition: service_healthy
      web:
        condition: service_healthy

volumes:
  postgres-data:
  minio-data:
```

**Create `docker/Caddyfile`:**

```text
# The reverse proxy in front of the whole product in Docker (docker-compose.product.yml). It routes as a deploy's
# load balancer does (docs/deploy-checklist.md): the console's api to the console, the api's paths to the api, every
# other path to the web app. Like the load balancer, it sets X-Forwarded-For to the one address the request came
# from, whatever the request said, which is what the api's rate limits trust.
{
	# Plain http on localhost: no certificates, and no admin endpoint to reach.
	auto_https off
	admin off
}

:80 {
	# Caddy tries the most specific path first, so the console's /api/platform/* never reaches the api.
	handle /api/platform/* {
		reverse_proxy console:3002
	}
	handle /api/* {
		reverse_proxy api:3001
	}
	handle /p/* {
		reverse_proxy api:3001
	}
	handle /webhooks/* {
		reverse_proxy api:3001
	}
	handle /health {
		reverse_proxy api:3001
	}
	handle {
		reverse_proxy web:3000
	}
}
```

**`.editorconfig`**, the whole file:

```text
# Editor basics shared by every editor and by Prettier.
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

# Caddy's own format (`caddy fmt`) indents with tabs.
[Caddyfile]
indent_style = tab
```

- [ ] **Step 4: Run the gate**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm product:smoke`

Expected: PASS, in under a minute once Task R1's images are built:
```text
ok: http://localhost:<port>/sign-in answers 200
ok: http://localhost:<port>/health answers 200
ok: http://localhost:<port>/api/platform/trpc/whoAmI answers 401
ok: http://localhost:<port>/api/trpc/me.get answers 401
ok: http://localhost:<port>/ answers 200
ok: http://storage.localhost:<port>/minio/health/live answers 200
The demo is ready: sign in with organization code DEMO, the password in DEMO_PASSWORD and one of
  asha (Owner), ravi (Sales), meena (Operations)
ok: the demo's Owner signed in, and me.get knows her
The product is good.
```
and `docker ps --all --filter name=travel-crm-product-smoke` lists nothing afterwards.

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: PASS, 28 Turborepo tasks, no dependency violations, the counts of Task R1 (1,851): no source changed.

- [ ] **Step 5: Commit**

```bash
cd /Users/ak/personal/travel-crm-05c
git add .editorconfig package.json docker-compose.product.yml docker/Caddyfile scripts/docker/support.sh scripts/docker/smoke-product.sh
git commit -m "feat(release): the whole product in Docker Compose behind a proxy, proven by pnpm product:smoke"
```

### Task R3: Every pull request runs spec 12.1's gates in CI, each its own job

Today's workflow is one job running `pnpm check`, which can't pass on a runner: it has no Chromium for the journeys.
This task splits spec 12.1's gates into jobs, so a failure names its gate: typecheck; lint with the import rules, the
product-name check and the workflows and shell scripts themselves (actionlint and ShellCheck, from one pinned image);
the unit, integration and isolation tests on the runner's Docker; the journeys in Playwright's Chromium; Lighthouse
on the built app's public pages with budgets for performance, accessibility, best practices and layout shift; the
migrations on an empty Postgres 18 with a drift check; both images and the whole product (Tasks R1 and R2); and a
dependency audit. CodeQL scans the code and the workflows (spec 12.4). Every job's steps are pnpm commands that run
the same on a laptop, and every action and image is pinned by commit or digest, which Renovate now keeps.

**Files:**
- Create: `.github/actions/setup/action.yml`, `.github/workflows/codeql.yml`, `apps/web/scripts/lighthouse.ts`,
  `apps/web/scripts/lighthouse-budgets.ts`, `scripts/ci/check-migrations.sh`, `scripts/ci/lint-workflows.sh`
- Modify: `.github/workflows/ci.yml` (the gates as jobs), `apps/web/package.json` (the `lighthouse` script;
  lighthouse 13.5.0), `package.json` (the `lighthouse`, `migrations:check` and `workflows:lint` scripts),
  `pnpm-workspace.yaml` (the audit's two fixes and one exception), `renovate.json` (actions and images by digest,
  a day's wait, Node 24), `scripts/docker/images.sh` (actionlint's image)
- Test: `apps/web/test/lighthouse-budgets.test.ts`, `scripts/ci/check-migrations.sh`, `scripts/ci/lint-workflows.sh`

**Interfaces:**
- Consumes: Task R1's `pnpm images:smoke`, `scripts/docker/images.sh` (`postgres_image`) and support.sh's `fail`
  and `wait_until`; Task R2's `pnpm product:smoke`; Next.js's standalone build (`.next/standalone/apps/web`);
  `chromium.executablePath()` (`@playwright/test`); `packages/db/sql/bootstrap.sql`.
- Produces: `budgets` (`performance` 0.8, `accessibility` 1, `best-practices` 0.95, `layoutShift` 0.1),
  `summarise(report): LighthouseRun`, `median(values): number`, `missedBudgets(page, runs): string[]`, `CATEGORIES`
  (`apps/web/scripts/lighthouse-budgets.ts`); `pnpm lighthouse`, `pnpm migrations:check`, `pnpm workflows:lint`; the
  composite action `./.github/actions/setup`; the CI jobs `typecheck`, `lint`, `test`, `journeys`, `lighthouse`,
  `migrations`, `images`, `audit` and CodeQL's `analyze`; `actionlint_image` (`scripts/docker/images.sh`).

- [ ] **Step 1: Write the failing test**

The budgets as a module of their own, so the rules are tested apart from Lighthouse:

**Create `apps/web/test/lighthouse-budgets.test.ts`:**

```ts
// The Lighthouse budgets (scripts/lighthouse-budgets.ts): what a run's report says, the median of three runs, and
// every way a page can miss its budget, a category Lighthouse couldn't score among them.
import { describe, expect, it } from "vitest";
import { budgets, median, missedBudgets, summarise, type LighthouseRun } from "../scripts/lighthouse-budgets";

/** The parts of a Lighthouse report the budgets read. */
function report(scores: Record<string, number | null>, layoutShift = 0) {
  return {
    categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { id, score }])),
    audits: { "cumulative-layout-shift": { numericValue: layoutShift } },
  };
}

const withinBudget = report({ performance: 0.91, accessibility: 1, "best-practices": 0.96 }, 0.01);

describe("the Lighthouse budgets", () => {
  it("are a floor for each category and a ceiling for layout shift", () => {
    expect(budgets).toEqual({ performance: 0.8, accessibility: 1, "best-practices": 0.95, layoutShift: 0.1 });
  });

  it("read each category's score and the layout shift from a report", () => {
    expect(summarise(withinBudget)).toEqual({
      performance: 0.91,
      accessibility: 1,
      "best-practices": 0.96,
      layoutShift: 0.01,
    });
  });

  it("count a category Lighthouse couldn't score, or left out, as 0", () => {
    expect(summarise(report({ performance: null, accessibility: 1 }))).toMatchObject({
      performance: 0,
      "best-practices": 0,
    });
  });

  it("take the middle of the runs, as Lighthouse's own scores move from run to run", () => {
    expect(median([0.86, 0.79, 0.91])).toBe(0.86);
    expect(median([0.8, 0.9])).toBeCloseTo(0.85);
  });

  it("let through a page whose median is within every budget, though one run is not", () => {
    const slow = summarise(report({ performance: 0.7, accessibility: 1, "best-practices": 0.96 }));
    const runs: LighthouseRun[] = [slow, summarise(withinBudget), summarise(withinBudget)];
    expect(missedBudgets("/sign-in", runs)).toEqual([]);
  });

  it("name each budget a page misses, with the median and the budget", () => {
    const run = summarise(report({ performance: 0.62, accessibility: 0.97, "best-practices": 0.96 }, 0.25));
    expect(missedBudgets("/offline", [run, run, run])).toEqual([
      "/offline: performance 0.62, below its budget of 0.8",
      "/offline: accessibility 0.97, below its budget of 1",
      "/offline: layout shift 0.25, above its budget of 0.1",
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/lighthouse-budgets.test.ts`

Expected: FAIL: `Failed to resolve import "../scripts/lighthouse-budgets" from "test/lighthouse-budgets.test.ts". Does
the file exist?`

- [ ] **Step 3: Lighthouse on the built app**

Add Lighthouse itself, `pnpm add -D lighthouse@13.5.0 --filter @travel-crm/web` (the second pair below), and the
script that runs it (the first):

**`apps/web/package.json`**:

Replace:

```json
    "test": "vitest run",
    "e2e": "playwright test"
  },
```

with:

```json
    "test": "vitest run",
    "e2e": "playwright test",
    "lighthouse": "tsx scripts/lighthouse.ts"
  },
```

**`apps/web/package.json`**:

Replace:

```json
    "jsdom": "30.1.2",
    "tailwindcss": "4.3.3",
```

with:

```json
    "jsdom": "30.1.2",
    "lighthouse": "13.5.0",
    "tailwindcss": "4.3.3",
```

- `pnpm-lock.yaml`: regenerated by `pnpm install`; never edited by hand.

**Create `apps/web/scripts/lighthouse-budgets.ts`:**

```ts
// The budgets the app's public pages are held to in Lighthouse (scripts/lighthouse.ts): a lowest score for each
// category, and DESIGN.md's "no layout shift" as a cumulative layout shift. A page is judged by the median of its
// runs, because Lighthouse's own scores move from run to run.

export const CATEGORIES = ["performance", "accessibility", "best-practices"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Lighthouse's phone (a mid-range phone on slow 4G) scored the sign-in page's performance 0.87 and the offline
 * page's 0.91 when these were set: the floor leaves room for slower CI machines. Accessibility is whole, as the
 * journeys' axe checks require, and best practices lose 0.04 over plain http on localhost.
 */
export const budgets: Readonly<Record<Category, number> & { layoutShift: number }> = {
  performance: 0.8,
  accessibility: 1,
  "best-practices": 0.95,
  layoutShift: 0.1,
};

/** One run's numbers: each category's score (0 when Lighthouse couldn't score it), and the layout shift. */
export type LighthouseRun = Record<Category, number> & { layoutShift: number };

interface Report {
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<string, { numericValue?: number } | undefined>;
}

/** The numbers the budgets read from a Lighthouse report (its JSON output). */
export function summarise(report: Report): LighthouseRun {
  const score = (category: Category) => report.categories?.[category]?.score ?? 0;
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    "best-practices": score("best-practices"),
    // A report without the audit counts as shifting: the budget can't be shown to hold.
    layoutShift: report.audits?.["cumulative-layout-shift"]?.numericValue ?? Number.POSITIVE_INFINITY,
  };
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** A line for each budget the page's median run misses; none when it keeps them all. */
export function missedBudgets(page: string, runs: readonly LighthouseRun[]): string[] {
  const missed = CATEGORIES.flatMap((category) => {
    const score = median(runs.map((run) => run[category]));
    return score < budgets[category]
      ? [`${page}: ${category} ${String(score)}, below its budget of ${String(budgets[category])}`]
      : [];
  });
  const layoutShift = median(runs.map((run) => run.layoutShift));
  if (layoutShift > budgets.layoutShift) {
    missed.push(`${page}: layout shift ${String(layoutShift)}, above its budget of ${String(budgets.layoutShift)}`);
  }
  return missed;
}
```

**Create `apps/web/scripts/lighthouse.ts`:**

```ts
// `pnpm --filter @travel-crm/web lighthouse` (a CI gate, spec 12.1): Lighthouse on the built app's public pages, three
// runs each on Lighthouse's phone, each page's median held to the budgets in scripts/lighthouse-budgets.ts. Build the
// app first (`pnpm lighthouse` at the root does both). Chrome is CHROME_PATH, or Playwright's Chromium, which the
// journeys install. Lighthouse 12 dropped its PWA category: the journeys check the manifest and the service worker.
import { spawn } from "node:child_process";
import { access, cp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import { CATEGORIES, median, missedBudgets, summarise, type LighthouseRun } from "./lighthouse-budgets.js";

/** The pages anyone can open: the rest need a session, which Lighthouse doesn't have. */
const PAGES = ["/sign-in", "/offline"] as const;
const RUNS = 3;

const appDirectory = path.resolve(import.meta.dirname, "..");
const standalone = path.join(appDirectory, ".next/standalone/apps/web");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

/** Waits up to half a minute for the server to answer. */
async function waitUntilUp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (
      await fetch(url).then(
        (response) => response.ok,
        () => false,
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} didn't come up within half a minute`);
}

/** One Lighthouse run on a page, in a fresh headless Chrome, as Playwright starts it (no sandbox). */
function lighthouseRun(url: string, chromePath: string): Promise<LighthouseRun> {
  const args = [
    url,
    "--output=json",
    "--output-path=stdout",
    "--quiet",
    `--only-categories=${CATEGORIES.join(",")}`,
    "--chrome-flags=--headless=new --no-sandbox",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(appDirectory, "node_modules/.bin/lighthouse"), args, {
      env: { ...process.env, CHROME_PATH: chromePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let report = "";
    let problems = "";
    child.stdout.on("data", (chunk: Buffer) => (report += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (problems += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(summarise(JSON.parse(report) as Parameters<typeof summarise>[0]));
      else reject(new Error(`Lighthouse failed on ${url} with ${String(code)}:\n${problems}`));
    });
  });
}

await access(path.join(standalone, "server.js")).catch(() => {
  throw new Error("No build to check: run `pnpm lighthouse` at the root, which builds the app first");
});
// The standalone server serves the build's files and public/ only from beside it, as the Docker image puts them.
await cp(path.join(appDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
await cp(path.join(appDirectory, "public"), path.join(standalone, "public"), { recursive: true });

const port = await freePort();
const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  stdio: "ignore",
});
try {
  const origin = `http://127.0.0.1:${String(port)}`;
  await waitUntilUp(`${origin}/sign-in`);
  const chromePath = process.env.CHROME_PATH ?? chromium.executablePath();
  const missed: string[] = [];
  for (const page of PAGES) {
    const runs: LighthouseRun[] = [];
    for (let attempt = 0; attempt < RUNS; attempt += 1) runs.push(await lighthouseRun(`${origin}${page}`, chromePath));
    const scores = CATEGORIES.map((category) => `${category} ${String(median(runs.map((run) => run[category])))}`);
    const layoutShift = median(runs.map((run) => run.layoutShift));
    console.log(`${page}: ${scores.join(", ")}, layout shift ${String(layoutShift)} (medians of ${String(RUNS)} runs)`);
    missed.push(...missedBudgets(page, runs));
  }
  if (missed.length > 0) {
    console.error(missed.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Every page is within its budgets.");
  }
} finally {
  server.kill();
}
```

- [ ] **Step 4: The migration check, the workflows' lint, and a clean audit**

**`scripts/docker/images.sh`**, the whole file:

```bash
# The images the scripts run beside ours, pinned by tag and digest, one per line, so Renovate updates them
# (renovate.json's custom manager). Sourced by the scripts, never run.
# shellcheck shell=bash disable=SC2034
postgres_image="postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"
minio_image="pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372"
mailpit_image="axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"
# actionlint, with the ShellCheck it runs on workflow steps, for scripts/ci/lint-workflows.sh.
actionlint_image="rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667"
```

**Create `scripts/ci/check-migrations.sh`:**

```bash
#!/usr/bin/env bash
# `pnpm migrations:check` (a CI gate): every migration applies to an empty Postgres 18 holding bootstrap.sql's roles,
# as a deploy's one-off `migrate` does (spec 12.3), and Prisma then finds no drift between the database and the
# schema, so a schema change without its migration fails here. The database is thrown away, however it ends.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh
source scripts/docker/support.sh

container="travel-crm-migrations-$$"
trap 'docker rm --force --volumes "$container" >/dev/null 2>&1 || true' EXIT

docker run --detach --name "$container" --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=travel_crm \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" \
  --publish 127.0.0.1::5432 "$postgres_image" >/dev/null
# Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
wait_until "Postgres starting" docker exec "$container" pg_isready --host 127.0.0.1 --username postgres
port="$(docker port "$container" 5432 | sed -n '1s/.*://p')"
export DATABASE_MIGRATOR_URL="postgresql://app_migrator:migrator@127.0.0.1:$port/travel_crm"
export PRISMA_HIDE_UPDATE_MESSAGE=1

cd packages/db
node_modules/.bin/prisma migrate deploy
# Exit code 2 means "differences found"; anything else but 0 means the check couldn't run.
drift=0
node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code || drift=$?
case "$drift" in
  0) ;;
  2) fail "the Prisma schema and the migrations disagree: add the missing migration (packages/db/README.md)" ;;
  *) fail "the drift check couldn't run" ;;
esac
node_modules/.bin/prisma migrate status
echo "Every migration applies to an empty Postgres 18, and the schema matches them."
```

**Create `scripts/ci/lint-workflows.sh`:**

```bash
#!/usr/bin/env bash
# `pnpm workflows:lint` (in CI's lint job): actionlint on the GitHub workflows, with ShellCheck on their `run:` steps,
# then ShellCheck on every shell script in the repository, from one pinned image, so a laptop checks with the
# versions CI does.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh

docker run --rm --volume "$PWD:/repo:ro" --workdir /repo "$actionlint_image" -color
git ls-files -z -- "*.sh" |
  xargs -0 docker run --rm --volume "$PWD:/repo:ro" --workdir /repo --entrypoint shellcheck "$actionlint_image" \
    --external-sources
echo "The workflows and the shell scripts are clean."
```

**`package.json`**:

Replace:

```json
    "product:down": "docker compose --file docker-compose.product.yml down",
    "product:smoke": "scripts/docker/smoke-product.sh"
  },
```

with:

```json
    "product:down": "docker compose --file docker-compose.product.yml down",
    "product:smoke": "scripts/docker/smoke-product.sh",
    "lighthouse": "turbo run build --filter=@travel-crm/web && pnpm --filter @travel-crm/web lighthouse",
    "migrations:check": "scripts/ci/check-migrations.sh",
    "workflows:lint": "scripts/ci/lint-workflows.sh"
  },
```

Then `chmod +x scripts/ci/check-migrations.sh scripts/ci/lint-workflows.sh`. `pnpm audit --audit-level=high` finds
three high advisories today; two have fixes Prisma hasn't taken yet, and one has no fix at all (then `pnpm install`):

**`pnpm-workspace.yaml`**:

Replace:

```yaml
  "@trpc/tanstack-react-query":
    skills: false
```

with:

```yaml
  "@trpc/tanstack-react-query":
    skills: false

# The dependency audit (`pnpm audit --audit-level=high`, a CI gate, ADR 0027). Each fix names its advisory: remove it
# once the package that holds the old version moves past it.
overrides:
  # GHSA-3f6p-5ww8-9rcr: Prisma's CLI holds mysql2 3.15.3, for a database we don't use.
  "prisma>mysql2": 3.24.5
  # GHSA-ggr8-5vv4-36mx: Prisma's config loader holds deepmerge-ts 7.1.5; it merges only our own prisma.config.ts.
  "@prisma/config>deepmerge-ts": 8.0.2
auditConfig:
  ignoreGhsas:
    # braces has no fixed version. Only ESLint's Next.js plugin reaches it, globbing patterns from our own config.
    - GHSA-vfj7-8cjw-p6xm
```

- [ ] **Step 5: The workflows**

**Create `.github/actions/setup/action.yml`:**

```yaml
# How every CI job that runs our code starts (.github/workflows/ci.yml): pnpm and Node as the repository names them,
# the dependencies exactly as the lockfile has them, then the generated code the checks read: Prisma's client (spec
# 12.1, gate 1), the brand's icons and the web app's generated files.
name: Set up the repository
description: pnpm, Node 24, the locked dependencies and the generated code
runs:
  using: composite
  steps:
    # The version in package.json's packageManager; the store is cached by the lockfile.
    - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      with:
        cache: true
    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
      with:
        node-version-file: .nvmrc
    - run: pnpm install --frozen-lockfile
      shell: bash
    - run: pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
      shell: bash
```

**`.github/workflows/ci.yml`**, the whole file:

```yaml
# Spec 12.1's gates on every pull request and every push to main, a job each, so a failure names its gate. Each step
# runs a pnpm command that runs the same on a laptop (CLAUDE.md's command table); actions are pinned by commit, with
# their version beside it for Renovate. Code scanning has a workflow of its own (codeql.yml).
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

# A newer push to the same branch replaces the run in progress.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  PRISMA_HIDE_UPDATE_MESSAGE: "1"
  NEXT_TELEMETRY_DISABLED: "1"
  TURBO_TELEMETRY_DISABLED: "1"

jobs:
  typecheck:
    name: Typecheck
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - run: pnpm exec turbo run typecheck

  lint:
    name: Lint, import rules, the product's name, workflows and scripts
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - run: pnpm run format:check
      - run: pnpm exec turbo run lint
      - run: pnpm run depcruise
      - run: pnpm --filter @travel-crm/brand exec vitest run test/product-name.test.ts
      - run: pnpm workflows:lint

  test:
    # The isolation suite and the RLS schema check are the db package's tests.
    name: Unit, integration and isolation tests
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      # Testcontainers starts each package's Postgres (and MinIO and Mailpit) on the runner's Docker.
      - run: pnpm exec turbo run test --concurrency=3

  journeys:
    name: Journeys
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - run: pnpm --filter @travel-crm/web exec playwright install --with-deps chromium
      - run: pnpm --filter @travel-crm/web e2e
      - name: Keep the failed journeys' traces
        if: failure()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: journey-traces
          path: apps/web/test-results/
          retention-days: 7

  lighthouse:
    name: Lighthouse
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      # Lighthouse runs in Playwright's Chromium, as it does on a laptop.
      - run: pnpm --filter @travel-crm/web exec playwright install --with-deps chromium
      - run: pnpm lighthouse

  migrations:
    name: Migrations on an empty Postgres 18
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - run: pnpm migrations:check

  images:
    name: Docker images and the whole product
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # The image smoke run issues a document from the checkout, for the worker's container to render.
      - uses: ./.github/actions/setup
      - run: pnpm images:smoke
      - run: pnpm product:smoke

  audit:
    name: Dependency audit
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # The audit reads the lockfile: pnpm alone, no install. Its exceptions are in pnpm-workspace.yaml.
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - run: pnpm audit --audit-level=high
```

**Create `.github/workflows/codeql.yml`:**

```yaml
# GitHub code scanning (spec 12.4): CodeQL's extended security queries on our TypeScript and JavaScript, and on these
# workflows, on every pull request, every push to main and once a week for advisories found since. Findings show in
# the repository's Security tab; on a private repository that needs GitHub Code Security.
name: CodeQL

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    # Mondays at 09:00 in India (03:30 UTC), when Renovate's week starts.
    - cron: "30 3 * * 1"

permissions:
  contents: read

jobs:
  analyze:
    name: CodeQL (${{ matrix.language }})
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # Neither language needs a build: CodeQL reads the source.
      - uses: github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d # v4.38.3
        with:
          languages: ${{ matrix.language }}
          build-mode: none
          queries: security-extended
      - uses: github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d # v4.38.3
        with:
          category: /language:${{ matrix.language }}
```

**`renovate.json`**:

Replace:

```json
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits"],
  "timezone": "Asia/Kolkata",
```

with:

```json
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits", "helpers:pinGitHubActionDigests", "docker:pinDigests"],
  "timezone": "Asia/Kolkata",
```

**`renovate.json`**:

Replace:

```json
      "allowedVersions": "<7"
    }
```

with:

```json
      "allowedVersions": "<7"
    },
    {
      "description": "Nothing younger than a day, as pnpm's minimumReleaseAge holds packages back (ADR 0027).",
      "matchPackageNames": ["*"],
      "minimumReleaseAge": "1 day"
    },
    {
      "description": "The images stay on Node 24 until .nvmrc moves (ADR 0001).",
      "matchDatasources": ["docker"],
      "matchPackageNames": ["node"],
      "allowedVersions": "<25"
    },
    {
      "description": "Our own images, which docker-compose.product.yml builds from this repository: nothing to look up.",
      "matchPackageNames": ["travel-crm-api", "travel-crm-web"],
      "enabled": false
    }
```

**`renovate.json`**:

Replace:

```json
      "customType": "regex",
      "description": "The images the smoke runs start beside ours (scripts/docker/images.sh), each <name>:<tag>@<digest>.",
      "managerFilePatterns": ["/^scripts/docker/images\\.sh$/"],
```

with:

```json
      "customType": "regex",
      "description": "The images the scripts run (scripts/docker/images.sh), each <name>:<tag>@<digest>.",
      "managerFilePatterns": ["/^scripts/docker/images\\.sh$/"],
```

- [ ] **Step 6: Run every job's commands, and see each new check refuse what it should**

Run (the setup action, then the typecheck, lint and audit jobs): `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate && pnpm exec turbo run typecheck && pnpm run format:check && pnpm exec turbo run lint && pnpm run depcruise && pnpm --filter @travel-crm/brand exec vitest run test/product-name.test.ts && pnpm workflows:lint && pnpm audit --audit-level=high`

Expected: PASS: 11 typecheck and 11 lint tasks, no dependency violations, 6 product-name tests, `The workflows and the
shell scripts are clean.`, `All found vulnerabilities were already reviewed and decided to be ignored` and
`1 ignored: 1 high`.

Run (the test and journeys jobs): `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec turbo run test --concurrency=3 && pnpm --filter @travel-crm/web exec playwright install --with-deps chromium && pnpm --filter @travel-crm/web e2e`

Expected: PASS. Tests: api-server 239, api 22, brand 27, contracts 91, db 232, domain 667, eslint-config 81,
integrations 159, web 339 (1,857); journeys 70 passed, 2 skipped.

Run (the Lighthouse, migrations and images jobs): `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm lighthouse && pnpm migrations:check && pnpm images:smoke && pnpm product:smoke`

Expected: PASS, about six minutes (the lockfile changed, so the images fetch again):
```text
/sign-in: performance 0.88, accessibility 1, best-practices 0.96, layout shift 0 (medians of 3 runs)
/offline: performance 0.91, accessibility 1, best-practices 0.96, layout shift 0 (medians of 3 runs)
Every page is within its budgets.
Database schema is up to date!
Every migration applies to an empty Postgres 18, and the schema matches them.
The images are good.
The product is good.
```

Then see the new checks refuse: add `driftCheck String? @map("drift_check")` to `OrganizationProfile` in
`packages/db/prisma/schema/profile.prisma` and run `pnpm migrations:check`: `[+] Added column drift_check`, then
`FAIL: the Prisma schema and the migrations disagree: add the missing migration (packages/db/README.md)`. Set one job's
`timeout-minutes: 15` to `fifteen` and run `pnpm workflows:lint`: `.github/workflows/ci.yml:28:22: expecting a single
${{...}} expression or float number literal, but found plain text node [syntax-check]`. Undo both
(`git checkout packages/db/prisma/schema/profile.prisma .github/workflows/ci.yml`).

The CodeQL job runs on GitHub only; `renovate.json` passes Renovate 44.158.0's `renovate-config-validator --strict`,
and its dry run (`renovate --platform=local --dry-run=extract`) finds every action by commit and every image by
digest, the scripts' included.

- [ ] **Step 7: Commit**

```bash
cd /Users/ak/personal/travel-crm-05c
git add .github/actions/setup/action.yml .github/workflows/ci.yml .github/workflows/codeql.yml apps/web/package.json apps/web/scripts/lighthouse.ts apps/web/scripts/lighthouse-budgets.ts apps/web/test/lighthouse-budgets.test.ts package.json pnpm-lock.yaml pnpm-workspace.yaml renovate.json scripts/ci/check-migrations.sh scripts/ci/lint-workflows.sh scripts/docker/images.sh
git commit -m "ci: spec 12.1's gates as jobs, with Lighthouse, a migration check, a dependency audit and CodeQL"
```

### Task R4: One command runs everything locally, and the deploy checklist says how to run it hosted

A new contributor runs four processes from three commands' notes today, and a deploy has only plan 4's checklist of
the database, the processes, sign-in and storage. This task adds `pnpm dev`, which starts the services, applies the
migrations and runs the api, the worker, the console and the web app together, and `pnpm demo`; it extends
`docs/deploy-checklist.md` with every release concern (environments, the images, each process's settings and
secrets, the bucket's CORS rule and the web build's storage origin, the load balancer's routes (share links and
webhooks to the api), health checks and stopping, migrations as a one-off job, the first super admin,
what differs between Cloud Run and ECS on Fargate in Mumbai, HTTPS, backups and the quarterly restore, logs, and what
is still open), gives the README's "Run it locally" one command, the demo, the product in Docker and where mail and
files are, adds the new commands to CLAUDE.md, and records the release's decisions in ADR 0027.

**Files:**
- Create: `docs/adr/0027-release.md`
- Modify: `package.json` (the `dev` and `demo` scripts), `turbo.json` (`dev` waits for the generated code; the
  `worker` and `console` tasks), `docs/deploy-checklist.md` (the release's sections; its four sections kept),
  `README.md` (four new parts of "Run it locally", two lines in "Where things are"), `CLAUDE.md` (eight rows in the
  command table, a line under it, a last section "The release"), `docs/adr/README.md` (one row)

**Interfaces:**
- Consumes: `pnpm services:up`, `pnpm db:migrate` (plans 1-3); the api server's `dev`, `worker`, `console` and `demo`
  scripts (plans 2-4) and the web app's `dev` (plan 5A); everything Tasks R1-R3 produce (the images and their
  commands, `docker-compose.product.yml`, `docker/Caddyfile`, the CI jobs, the pnpm commands).
- Produces: `pnpm dev`, `pnpm demo`; Turborepo tasks `worker` and `console` (persistent, uncached); the deploy
  checklist's tables of settings per process, routes and health checks, which later plans extend; ADR 0027.

- [ ] **Step 1: See the two commands missing**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run dev; pnpm demo`

Expected: FAIL: `Missing script: dev`, then `Command "demo" not found`.

- [ ] **Step 2: One command for development**

**`package.json`**:

Replace:

```json
    "prepare": "husky",
    "format": "prettier --write .",
```

with:

```json
    "prepare": "husky",
    "dev": "pnpm services:up && pnpm db:migrate && turbo run dev worker console",
    "demo": "pnpm --filter @travel-crm/api-server run demo",
    "format": "prettier --write .",
```

**`turbo.json`**:

Replace:

```json
    "db:migrate:deploy": { "cache": false, "env": ["DATABASE_MIGRATOR_URL"] },
    "dev": { "cache": false, "persistent": true },
    "e2e": {
```

with:

```json
    "db:migrate:deploy": { "cache": false, "env": ["DATABASE_MIGRATOR_URL"] },
    // `pnpm dev` runs these three at once, after the generated code (Prisma's client, the brand's files) exists.
    "dev": { "dependsOn": ["generate", "^generate"], "cache": false, "persistent": true },
    "worker": { "dependsOn": ["^generate"], "cache": false, "persistent": true },
    "console": { "dependsOn": ["^generate"], "cache": false, "persistent": true },
    "e2e": {
```

- [ ] **Step 3: Run them**

`pnpm dev` uses the same Docker project as `pnpm services:up` (`travel-crm`, with its fixed ports), so stop any other
checkout's services first. Then, with `.env` from `.env.example` and its two `DEMO_` lines uncommented:

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm dev`

Expected: the services start, the migrations apply, the generate tasks run, then the four processes, side by side:
```text
@travel-crm/api-server:dev: api listening on port 3001
@travel-crm/api-server:worker: worker running
@travel-crm/api-server:console: console listening on port 3002
```
with the web app's `next dev` on port 3000. `curl http://localhost:3001/health` and
`curl http://localhost:3002/health` answer `{"status":"ok"}`, and http://localhost:3000/sign-in opens. In another
terminal:

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm demo`

Expected: `The demo is ready: sign in with organization code DEMO, the password in DEMO_PASSWORD and one of`, then
`asha (Owner), ravi (Sales), meena (Operations)`. Ctrl+C stops the four processes.

- [ ] **Step 4: The deploy checklist, the README, CLAUDE.md and ADR 0027**

**`docs/deploy-checklist.md`**:

Replace:

```markdown

What a hosted deploy must get right that the code can't set for itself. Plan 5's deploy starts from this list and adds
to it; each item names the ADR that explains why. Where a process checks an item at start-up, the item says so.

```

with:

```markdown

What a hosted deploy must get right that the code can't set for itself; each item names the ADR that explains why.
Where a process checks an item at start-up, the item says so. The first four sections are the database's, the
processes', sign-in's and storage's (plans 2-4); the rest are the release's (ADR 0027): environments, the images,
every process's settings, routing, health and stopping, migrations, the first super admin, hosting, HTTPS, backups,
logs, and what is still open.

```

Replace:

```markdown
  console needs keys of its own in its environment. Every process checks the bucket at start-up.
```

with:

```markdown
  console needs keys of its own in its environment. Every process checks the bucket at start-up.
- **CORS.** The browser PUTs uploads to their presigned URLs and loads logos straight from the bucket (plan 5B), so
  the bucket's CORS rule allows the app's origin (`APP_URL`), the methods `PUT` and `GET`, and the request headers
  `content-type` and `if-none-match`, nothing more. The web image's `STORAGE_ORIGIN` is the bucket's origin (The
  images, below).

## Environments (spec 12.2)

| Environment | What runs                                                                          | Its data and keys                                        |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Local       | `pnpm dev` (the processes from source), or `pnpm product:up` (the images, proxied) | throwaway; `.env.example`'s dev-only secrets             |
| Staging     | every merge to `main`: the images CI built, the demo on (`DEMO_*` set)             | demo data only, test keys, its own database and bucket   |
| Production  | only a release the product owner approves (spec 12.1)                              | real organizations; its own keys from the secret manager |

- **The same images move from staging to production.** Nothing in the api's image depends on where it runs. The web
  image holds one address, `STORAGE_ORIGIN`: with path-style URLs on one regional endpoint (`S3_FORCE_PATH_STYLE`),
  staging's and production's buckets share that origin and one build serves both; otherwise build the web image once
  per storage origin.

## The images (ADR 0027)

- **Two images**, built from the repository's root: `apps/api/Dockerfile` and `apps/web/Dockerfile`. CI's images job
  builds both and runs each command (`pnpm images:smoke`). Build the web image with
  `--build-arg CACHE_VERSION=<the commit>`, so browsers drop a query cache saved by another build, and
  `--build-arg STORAGE_ORIGIN=<the bucket's origin>` (such as `https://s3.ap-south-1.amazonaws.com`), which its
  Content-Security-Policy allows for uploads and logos.
- **The api's image runs one command per service:** `api` (the default), `worker` and `console`, and the one-off
  `migrate`, `first-super-admin` and `demo`. Each runs as the `node` user and writes nothing to its own file system:
  run them read-only, with `/tmp` writable.
- **The web image rewrites nothing.** It is built without `API_ORIGIN`, so the load balancer routes (below); an `/api`
  request that reaches it is a 404.
- **Ports:** the api 3001 (`PORT`), the console 3002 (`CONSOLE_PORT`), the web app 3000 (`PORT`); the worker has none.

## Settings and secrets, per process

Checked at start-up by `apps/api/src/environment.ts` (with `service-variables.ts`) and `console-environment.ts`; a
process refuses to start on a missing or wrong one, naming it. ● needed, ○ optional, blank: never given to it.
Secrets come from the platform's secret manager as environment variables, never in an image (spec 12.3).

| Variable                                                        | api | worker | console | migrate | Secret |
| --------------------------------------------------------------- | --- | ------ | ------- | ------- | ------ |
| `DATABASE_URL` (as `app_runtime`)                               | ●   | ●      | ●       |         | yes    |
| `DATABASE_PLATFORM_URL` (as `app_platform`)                     |     |        | ●       |         | yes    |
| `DATABASE_MIGRATOR_URL` (as `app_migrator`)                     |     |        |         | ●       | yes    |
| `DATABASE_POOL_SIZE`                                            | ○   | ○      | ○       |         |        |
| `BETTER_AUTH_SECRET`: one value for all three                   | ●   | ●      | ●       |         | yes    |
| `BETTER_AUTH_URL`, `APP_URL`: both the app's https address      | ●   | ●      | ●       |         |        |
| `TRUSTED_ORIGINS`                                               | ○   | ○      | ○       |         |        |
| `AUTH_RATE_LIMIT`, `AUTH_IP_ADDRESS_HEADERS`                    | ○   | ○      | ○       |         |        |
| `AUTH_TRUSTED_PROXIES` (below)                                  | ○   | ○      | ○       |         |        |
| `S3_BUCKET`, `S3_REGION` (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`) | ●   | ●      | ●       |         |        |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (the console's own)  | ●   | ●      | ●       |         | yes    |
| `SMTP_HOST`, `EMAIL_FROM_ADDRESS` (`SMTP_PORT`, `SMTP_SECURE`)  | ●   | ●      | ●       |         |        |
| `SMTP_USER`, `SMTP_PASSWORD`                                    | ○   | ○      | ○       |         | yes    |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`                             | ●   | ●      | ●       |         |        |
| `VAPID_PRIVATE_KEY`: the public key's pair                      | ●   | ●      | ●       |         | yes    |
| `PORT` (3001)                                                   | ○   |        |         |         |        |
| `CONSOLE_PORT` (3002)                                           |     |        | ○       |         |        |
| `DEMO_ORGANIZATION_CODE`, `DEMO_PASSWORD`: both or neither      |     |        | ○       |         | yes    |

- **`NODE_ENV`** is `production` when unset, and production refuses http addresses, an off rate limit and a weak
  secret. Never set it to `development` in a deploy.
- **The web app** needs nothing at run time: its image sets `NODE_ENV=production`, `HOSTNAME=0.0.0.0` and
  `PORT=3000`. Its build takes `CACHE_VERSION` and `STORAGE_ORIGIN` (The images, above).
- **One secret, three processes:** the console reads the api's session cookies, and the worker counts invite emails
  against the rate limits, whose key comes from `BETTER_AUTH_SECRET`.

## Routing at the load balancer (ADRs 0018, 0019)

| Path              | Goes to       | Why                                                       |
| ----------------- | ------------- | --------------------------------------------------------- |
| `/api/platform/*` | console, 3002 | the console's tRPC; this rule goes before the next one    |
| `/api/*`          | api, 3001     | Better Auth's sign-in and the organization app's tRPC     |
| `/p/*`            | api, 3001     | share links                                               |
| `/webhooks/*`     | api, 3001     | the webhook intake                                        |
| everything else   | web, 3000     | the app's pages, build files, manifest and service worker |

- **One address for everything** (spec 3): the app's https origin is `BETTER_AUTH_URL` and `APP_URL`, so cookies
  stay first-party and the api needs no CORS. Share links (`/p/*`) and the webhook intake (`/webhooks/*`) are the
  api's, not the web app's. `docker/Caddyfile` is this table, and `pnpm product:smoke` proves it.
- **`/health` needs no public route:** the platform's health checks call each service on its own port (below). The
  local proxy sends it to the api, so the smoke run can ask through it.

## Health checks and stopping (spec 12.3)

| Service | Health check                                | On SIGTERM                                                             |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| api     | `GET /health` on 3001: `{ "status": "ok" }` | finishes open requests, closes its pools, exits 0                      |
| console | `GET /health` on 3002                       | the same, letting running jobs finish for up to 30 seconds             |
| worker  | none (no port): the platform watches it     | stops relaying, lets running jobs finish for up to 30 seconds, exits 0 |
| web     | `GET /sign-in` on 3000 (a static page)      | Next.js closes its server and exits 143                                |

- **A start that fails exits 1** before the health check can pass: a wrong role, a bucket it can't use, pg-boss, and
  for the console the platform role's grant. A broken deploy never turns healthy.
- **Give the worker and the console 35 seconds** between SIGTERM and SIGKILL. Where the platform allows less, their
  jobs are cut, which is safe (`apps/api/README.md`): the job runs again.

## Migrations: a one-off job before traffic (spec 12.3)

- **Run the api image's `migrate` once per release**, with `DATABASE_MIGRATOR_URL` alone, and move traffic to the new
  version only when it exits 0. It applies the pending migrations in order (`prisma migrate deploy`, under Prisma's
  advisory lock, so two runs never overlap) and does nothing when none are pending.
- **Expand, migrate, contract.** The old version keeps serving while the new one's migrations apply, so a release's
  migrations must suit both: add a column as nullable or with a default (expand), ship the code that writes it, fill it
  in a later migration or job (migrate), and drop what the old code read only in a later release (contract). Never
  rename or retype a column in one step.
- **CI applies every migration to an empty Postgres 18** and finds no drift from the schema (`pnpm migrations:check`).
- **A migration that fails** is recorded as failed: mark it rolled back, then fix it forward with a new migration. The
  image carries the Prisma CLI for that:

      docker run --env DATABASE_MIGRATOR_URL --entrypoint node --workdir /app/packages/db <the api image> \
        node_modules/prisma/build/index.js migrate resolve --rolled-back <the migration's name>

## The first super admin, plans and the demo (ADRs 0019, 0022)

- **Once per new database**, after the first `migrate`: `first-super-admin --email <address> --name <name>` from the
  api image with the console's settings. It prints a temporary password on stdout; pass it on in person. It refuses
  once a super admin exists.
- **No plan is seeded:** the super admin creates the plans in the console before onboarding anyone.
- **Staging's demo:** set `DEMO_ORGANIZATION_CODE` and `DEMO_PASSWORD` on the console, which rebuilds the demo every
  night at 02:00 India time; the image's `demo` command builds it at once.

## Hosting: a serverless container platform in Mumbai (spec 12.3)

The owner chooses Google Cloud Run (`asia-south1`) or AWS ECS on Fargate (`ap-south-1`) before the first staging
deploy (Q6, Q11). Everything above holds on both; this is what differs.

|                    | Cloud Run (`asia-south1`)                                                                           | ECS on Fargate (`ap-south-1`)                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Routing by path    | an external Application Load Balancer, its URL map sending each path to a serverless NEG            | an Application Load Balancer, a listener rule per path to each target group |
| api, web           | services; both read the `PORT` Cloud Run sets (8080)                                                | services behind their target groups                                         |
| console            | a service with one instance always up and CPU between requests (its schedules); `CONSOLE_PORT=8080` | a service with one task                                                     |
| worker             | a worker pool: it has no port                                                                       | a service without a load balancer                                           |
| `migrate`          | a Cloud Run job from the api image                                                                  | a one-off task (`RunTask`) from the api's task definition                   |
| SIGTERM to SIGKILL | 10 seconds, fixed: a cut job runs again                                                             | `stopTimeout`: 35 seconds                                                   |
| Postgres 18        | Cloud SQL for PostgreSQL                                                                            | RDS for PostgreSQL                                                          |
| Secrets            | Secret Manager                                                                                      | Secrets Manager or Parameter Store                                          |
| Files              | S3, or Cloud Storage's S3-compatible API with HMAC keys (not yet tried)                             | S3                                                                          |
| Email              | Amazon SES's SMTP endpoint, or another SMTP service                                                 | Amazon SES's SMTP endpoint                                                  |
| Logs               | Cloud Logging                                                                                       | CloudWatch Logs                                                             |

- **The client's address.** Both load balancers add the address they saw to `X-Forwarded-For` rather than replace it,
  so set `AUTH_TRUSTED_PROXIES` to the load balancer's addresses (the ALB's subnets; Google's front ends) and check
  one sign-in's recorded address before launch (Sign-in behind the load balancer, above).

## HTTPS and headers (spec 12.4)

- **HTTPS only**, ended at the load balancer with a certificate it manages; plain http redirects. The api refuses to
  start in production with an http `BETTER_AUTH_URL`, `APP_URL` or `TRUSTED_ORIGINS`.
- **The web app sends the security headers itself** (`apps/web/security-headers.ts`: the Content-Security-Policy,
  two years of HSTS with subdomains, `nosniff`, framing denied, the referrer policy, the opener policy and the
  permissions policy), which the image smoke checks. The load balancer must pass them on, neither dropping nor
  repeating them.

## Backups and the quarterly restore (spec 12.3)

- **Daily backups with point-in-time restore**, switched on before the first paying organization: Cloud SQL's or
  RDS's automated backups.
- **Files have no old copies** (the bucket is unversioned, as Object storage above requires), so a restore brings back
  the database alone; a file deleted since shows as missing.
- **Every quarter, practise a restore:** restore last night's backup to a new instance, run `migrate` against it
  (nothing pending), start a console on it (its start-up checks the roles and the grant), sign in, open an
  organization, then delete the instance. Write down how long it took.

## Logs (spec 12.3)

- **Each process writes one line per problem** to stderr, ids and codes only, never a person's data
  (`apps/api/README.md`, "The log"), and its start-up line to stdout. The platform keeps both.
- **The load balancer's access logs** keep the request's path, which for a password reset holds its token: keep them
  short-lived or strip that path (above).

## Still open before launch

- **A request id and the organization id on every log line** (spec 12.3): take the load balancer's trace header
  (`X-Cloud-Trace-Context` or `X-Amzn-Trace-Id`) as the request id.
- **Sentry** for errors from the web app, the api and the worker (spec 12.3), with source maps uploaded at build
  time: the api's bundle carries none.
- **A shared rate-limit store** before a second api instance (Sign-in behind the load balancer, above).
- **Turnstile** on public forms and after repeated failed sign-ins (spec 9.7), with the first public form.
- **The platform's own setup** (the load balancer, services, secrets, the database and bucket) once the owner has
  chosen, as code beside this repository.
- **A privacy policy, a data processing agreement and breach-response steps** before the first paying organization
  (spec 12.4).
```

**`README.md`**:

Replace:

```markdown

## Where things are
```

with:

```markdown

### Everything at once

    pnpm dev

starts Postgres, MinIO and Mailpit (Docker), applies the migrations, then runs the api (http://localhost:3001), the
worker, the console (http://localhost:3002) and the web app (http://localhost:3000) together, their output side by
side. Ctrl+C stops the four; `pnpm db:down` stops the services.

### The demo agency

Set `DEMO_ORGANIZATION_CODE=DEMO` and a `DEMO_PASSWORD` of 12 characters or more in `.env` (both are in
`.env.example`, commented out), then run

    pnpm demo

It builds the shared demo agency in your database: its business profile, the starter roles and three staff, on the
demo's own plan. Sign in at http://localhost:3000/sign-in with the organization code `DEMO`, a username (`asha` the
Owner, `ravi` in Sales or `meena` in Operations) and `DEMO_PASSWORD`. Run it again for a fresh demo.

### The whole product in Docker

    pnpm product:up      # builds both images, starts everything behind a proxy, builds the demo
    pnpm product:down    # stops it, keeping its data

runs the images CI builds, routed as a deploy's load balancer will (`docker-compose.product.yml`), at
http://localhost:58080: sign in with `DEMO`, `asha` and `demo-only-password`. It is a project of its own, so it runs
beside `pnpm dev`; `docker compose --file docker-compose.product.yml down --volumes` drops its data too.
`pnpm images:smoke` and `pnpm product:smoke` check the images and the product end to end, as CI does.

### Mail and files

Email and files stay on your computer: Mailpit catches every email, and MinIO keeps every file.

|                                                          | `pnpm dev`             | `pnpm product:up`      |
| -------------------------------------------------------- | ---------------------- | ---------------------- |
| Mail (Mailpit)                                           | http://localhost:58025 | http://localhost:58081 |
| Files (MinIO's console: `minio-dev`, `minio-dev-secret`) | http://localhost:59001 | http://localhost:58091 |

## Where things are
```

Replace:

```markdown
- `docs/adr/`: decisions and their reasons
- `apps/api/`: the api server ([README](apps/api/README.md))
```

with:

```markdown
- `docs/adr/`: decisions and their reasons
- `docs/deploy-checklist.md`: what a hosted deploy must get right, process by process
- `apps/api/`: the api server ([README](apps/api/README.md))
```

Replace:

```markdown
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
```

with:

```markdown
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `scripts/`: the Docker smoke runs and CI's own checks; `docker-compose.product.yml` and `docker/`: the product in
  Docker
- `CLAUDE.md`: the conventions every contributor follows
```

**`CLAUDE.md`**:

Replace:

```markdown
| `pnpm --filter @travel-crm/api-server console` | run the platform console on http://localhost:3002, and its jobs |
| `pnpm format`                                  | format every file with Prettier                                 |
| `pnpm check`                                   | everything CI runs: typecheck, lint, tests, import rules        |
| `pnpm --filter @travel-crm/<package> test`     | one package's tests (most need Docker running)                  |

```

with:

```markdown
| `pnpm --filter @travel-crm/api-server console` | run the platform console on http://localhost:3002, and its jobs |
| `pnpm dev`                                     | services and migrations, then api, worker, console and web      |
| `pnpm demo`                                    | build the demo agency now (set `DEMO_*` in `.env` first)        |
| `pnpm product:up` / `pnpm product:down`        | the whole product in Docker, at http://localhost:58080          |
| `pnpm format`                                  | format every file with Prettier                                 |
| `pnpm check`                                   | everything CI runs: typecheck, lint, tests, import rules        |
| `pnpm images:smoke` / `pnpm product:smoke`     | build the images and run them as a deploy does (CI)             |
| `pnpm lighthouse`                              | build the web app, hold its public pages to budgets (CI)        |
| `pnpm migrations:check`                        | migrations on an empty Postgres 18, then drift check (CI)       |
| `pnpm workflows:lint`                          | actionlint and ShellCheck on workflows and scripts (CI)         |
| `pnpm audit --audit-level=high`                | the dependency audit (CI); exceptions: `pnpm-workspace.yaml`    |
| `pnpm --filter @travel-crm/<package> test`     | one package's tests (most need Docker running)                  |

CI runs `pnpm check`'s parts and every command marked CI, each as a job of its own (`.github/workflows/ci.yml`).

```

Replace:

```markdown
  in. Hiding a button is a convenience; the api checks every call.
```

with:

```markdown
  in. Hiding a button is a convenience; the api checks every call.

## The release (ADR 0027)

- Two images, built from the root: `apps/api/Dockerfile` (one image; its commands are `api`, `worker`, `console`,
  `migrate`, `first-super-admin` and `demo`) and `apps/web/Dockerfile`. `docs/deploy-checklist.md` says how a deploy
  runs them: settings per process, routes, health checks, migrations. A new environment variable goes in its table, a
  new public path in its routing table and in `docker/Caddyfile`.
- The api's image runs a bundle (`pnpm --filter @travel-crm/api-server build`): every third-party package is in it
  but the integrations package's own, which the image installs as they are. A package that reads its own files at
  run time (fonts, data) belongs in `packages/integrations`; `apps/api/test/bundle.test.ts` fails when the bundle
  leaves out anything else.
- Pin everything: images by tag and digest (the scripts' in `scripts/docker/images.sh`), actions by commit with their
  version beside it. Renovate keeps them, waiting a day as pnpm does.
- The repository's own scripts are in `scripts/` (bash, `set -euo pipefail`, checked by ShellCheck through
  `pnpm workflows:lint`). Every CI step is a pnpm command that runs the same locally.
- The dependency audit's fixes and exceptions are in `pnpm-workspace.yaml`, each with its advisory and the reason.
```

**Create `docs/adr/0027-release.md`:**

```markdown
# 0027: The release: the images, the whole product in Docker, CI's gates

Date: 2026-10-16 · Status: accepted · Implements spec sections 2.7 (images that build and run with Docker Compose),
12.1 (the CI gates), 12.2 (environments), 12.3 (hosting) and 12.4 (code scanning, Renovate)

## Decision

- **Two images from the lockfile.** `apps/api/Dockerfile` and `apps/web/Dockerfile` build from the repository's root
  on `node:24.21.0-trixie-slim`, pinned by tag and digest: `pnpm fetch` in a layer of its own, then
  `pnpm install --frozen-lockfile --offline`. They run as the `node` user, write nothing to their own file system and
  hold no secret: every setting comes from the environment when a container starts.
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
- **The whole product in Docker** is a compose file of its own (`docker-compose.product.yml`, project
  `travel-crm-product`): Postgres with `bootstrap.sql`'s roles and grant, MinIO and its bucket, Mailpit, a one-off
  `migrate`, the four services, and Caddy routing as the load balancer will (`docker/Caddyfile`). Files are stored at
  `storage.localhost`, which reaches MinIO from the containers and from the browser. `pnpm product:up` runs it.
- **Smoke runs prove both.** `pnpm images:smoke` runs every command of the api image in production mode, read-only,
  against a throwaway Postgres, MinIO and Mailpit: health, a PDF rendered with the brand's fonts, the web app's
  security headers and no `/api` rewrite, and every process stopping by itself on SIGTERM. `pnpm product:smoke`
  brings the compose project up on free ports and signs the demo's Owner in through the proxy.
- **CI runs a job per gate** (`.github/workflows/ci.yml`): typecheck; lint with the import rules, the product-name
  check and actionlint with ShellCheck; the unit, integration and isolation tests on the runner's Docker; the journeys
  in Playwright's Chromium; Lighthouse; the migrations on an empty Postgres 18 with Prisma's drift check; the images
  and the whole product; the dependency audit. Every step is a pnpm command that runs the same on a laptop, through
  one composite setup action. CodeQL scans the code and the workflows.
- **Lighthouse 13 directly**, three runs per public page (`/sign-in`, `/offline`) on its phone, the median held to
  budgets in a tested module: performance ≥ 0.8, accessibility 1, best practices ≥ 0.95, cumulative layout shift
  ≤ 0.1.
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
- Each override and exception in `pnpm-workspace.yaml` goes when the package holding the old version moves past it;
  re-run the audit after every dependency change.
```

**`docs/adr/README.md`**:

Replace:

```markdown
| [0024](0024-business-profile.md)             | The organization's business profile and setup checklist                                   |
```

with:

```markdown
| [0024](0024-business-profile.md)             | The organization's business profile and setup checklist                                   |
| [0027](0027-release.md)                      | The release: the images and the api's bundle, the product in Docker, CI's gates, Renovate |
```

- [ ] **Step 5: Run the gate**

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: PASS, 28 Turborepo tasks, no dependency violations, Task R3's counts (1,857): no source changed.

- [ ] **Step 6: Commit**

```bash
cd /Users/ak/personal/travel-crm-05c
git add CLAUDE.md README.md docs/adr/README.md docs/adr/0027-release.md docs/deploy-checklist.md package.json turbo.json
git commit -m "feat(release): pnpm dev runs everything at once; the deploy checklist, the README and ADR 0027"
```

---

## After the last task

Run the gates once more on `foundation/05c-release`:

Run: `cd /Users/ak/personal/travel-crm-05c && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise && pnpm --filter @travel-crm/web e2e && pnpm lighthouse && pnpm migrations:check && pnpm images:smoke && pnpm product:smoke && pnpm workflows:lint && pnpm audit --audit-level=high`

Expected: green. 1,857 tests: api-server 239, api 22, brand 27, contracts 91, db 232, domain 667, eslint-config 81,
integrations 159, web 339; journeys 70 passed and 2 skipped; both pages within their Lighthouse budgets; 29
migrations with no drift; `The images are good.`, `The product is good.`; the audit's one exception. The base
(`replay/5b`, `7e4e940`) had 1,847: plan 5C adds 10.

| Task | Tests after it |
| --- | --- |
| the base | 1,847 |
| R1 | 1,851 (the bundle's 4) |
| R2 | 1,851 |
| R3 | 1,857 (the Lighthouse budgets' 6) |
| R4 | 1,857 |

The controller (not an implementer) then:

1. Proves the branch from a clean clone, as CI will:
   ```bash
   cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
   rm -rf /private/tmp/travel-crm-plan5c-clean && git clone -q /Users/ak/personal/travel-crm /private/tmp/travel-crm-plan5c-clean
   cd /private/tmp/travel-crm-plan5c-clean && git checkout -q foundation/05c-release
   pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
   pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise && pnpm audit --audit-level=high && pnpm workflows:lint && pnpm migrations:check
   ```
   Expected: the counts above (this was done on the scratch clone: green). Then `rm -rf /private/tmp/travel-crm-plan5c-clean`.
2. Pushes the branch and watches the first CI run on GitHub, the one thing not run locally: every job on
   ubuntu-24.04 (amd64), Chrome's sandbox under Lighthouse (it runs with `--no-sandbox`, as Playwright does), and
   CodeQL.
3. Merges it with plan 5B as "Shared files and merge notes" says, regenerates the lockfile, re-runs the audit and the
   gates above, then removes the worktree.

**Carry forward.**
- **After plan 5B merges:** the web image's 404 check gains `/api/platform/*`, `/p/*` and `/webhooks/*`; the image
  smoke issues its document through the branding preview, and `apps/api/scripts/issue-sample-document.ts` goes;
  `pnpm lighthouse` again on 5B's sign-in page, and the budgets raised if it allows.
- **The deploy itself, once the owner chooses the platform:** a workflow that pushes the images CI built (with
  `--build-arg CACHE_VERSION=<commit>`) to the registry, runs `migrate` as a one-off job, deploys staging on every
  merge to `main` and production on an approved release; the platform's setup as code; health checks and stop
  timeouts as `docs/deploy-checklist.md` lists them; `AUTH_TRUSTED_PROXIES` checked against one logged sign-in.
- **Before launch** (the checklist's "Still open"): a request id and the organization id on every log line; Sentry
  with source maps uploaded at build time; a shared rate-limit store before a second api instance; Turnstile with the
  first public form; the privacy policy, DPA and breach-response steps.
- **The audit's overrides** (`pnpm-workspace.yaml`) go when Prisma's CLI and config loader move past mysql2 3.15.3 and
  deepmerge-ts 7.1.5; the braces exception when the Next.js ESLint plugin drops it.

**For the product owner to decide** (with the default this plan takes).
1. **A separate migrator image?** It would take the Prisma CLI's 325 MB out of the api's 881 MB image (181 MB
   compressed). Default: `migrate` stays in the api image, as spec 12.3 says.
2. **Code scanning on a private repository** needs GitHub Code Security; without it CodeQL's upload fails and its
   workflow shows red. Default: turn it on; otherwise set `upload: never` on the analyze step and keep the results as
   an artifact.
3. **Cloud Run or ECS on Fargate** (Q6, Q11). Default: none; the checklist covers both. On Cloud Run the worker's and
   the console's 30-second drains are cut at 10 seconds (their jobs run again).
4. **Lighthouse's performance floor of 0.8** (sign-in measures 0.88 on a slow phone). Default: 0.8 until 5B's screens
   settle, then 0.9.
5. **The demo in each environment.** Default: on in staging, off in production, off locally until `.env` sets it.
