# Foundation 03: Shared Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is built for parallel execution: after Tasks 0.1 and 0.2, the eight tracks run at the same time, each in its own git worktree, and the Integration tasks run last.

**Goal:** Every shared service of spec section 9, and the brand package of section 10, exists, is tested, and is used at least once in one flow through the api and the worker (spec 2.6): jobs and the outbox, files, PDFs and share links, notifications, the audit log, money, GST, time and phone numbers, typed errors over HTTP, the webhook intake and rate limits.

**Architecture:**
- **Ports and adapters (ADR 0008).** `packages/integrations` holds the adapters to the outside world (S3, pg-boss, SMTP, web push, React-PDF), each behind a port with an in-memory twin for tests. Domain code takes ports as parameters and never imports a vendor SDK; dependency-cruiser enforces it.
- **Domain modules** in `packages/domain/src`: `jobs` (the outbox, the relay, listeners that run once per event, the worker), `files`, `documents`, `share-links`, `webhooks`, `rate-limits`, `notifications`, `audit`. The kernel gains money, India GST, time zones and phone numbers; identity gains actors that carry support's impersonation, and the organization profile and member contacts other modules may ask for.
- **`apps/api`** serves `/p/<token>` and `/webhooks/<provider>` behind rate limits counted in Postgres, sends password-reset email, and has a `worker` command from the same image.
- **`packages/brand`** is the product's one source of truth: name, colours, fonts, contacts, logo, generated icons, and a check that the name appears nowhere else.

**Tech Stack:**
- Plan 2's stack: Node 24, pnpm 12.11.2, Turborepo 2.11.8, TypeScript 6.0.3, Prisma 7.10.0, Postgres 18, Vitest 5.0.4, Testcontainers 12.2.1, ESLint 10, dependency-cruiser 18.6.0, better-auth 1.7.7, Hono 4.13.13, tRPC 11.19.0, Zod 4.6.7.
- New: pg-boss 12.37.1; `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` 3.1150.0; nodemailer 10.1.0; web-push 3.6.7 (`@types/web-push` 3.6.4); `@react-pdf/renderer` 4.9.0 with react 19.3.0 (`@types/react` 19.3.0); `@fontsource/eb-garamond`, `@fontsource/figtree`, `@fontsource/ibm-plex-mono` 5.3.0; libphonenumber-js 1.13.15; `@resvg/resvg-js` 2.6.2 and tsx 4.23.15 (icons); unpdf 1.8.1 and testcontainers 12.2.1 (tests).
- Images: `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (MinIO no longer publishes images; this is a community build of MinIO itself, and it carries `mc`), `axllent/mailpit:v1.31.5`.

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md`, section 9 (shared services) and section 10 (brand package), with the parts of sections 2.6 (each service used once), 5 (sensitive documents), 6.1 (impersonation in the audit log), 6.2 (password reset by email) and 12.2 (MinIO and Mailpit locally) they touch. This is plan 3 of 5 for the Foundation:

1. Repo and data isolation (done; merged to `main`)
2. API and identity (done; merged to `main` at `cf8fb18`)
3. Shared services (this plan)
4. Platform and subscriptions (onboarding, plans, the lifecycle and demo-reset jobs, the failed-jobs and audit screens of the console)
5. Web app and release (every screen, including the bell, uploads and the audit viewer, and their routers)

**How this plan was checked.**
- Every file in it was written and run in a scratch clone of `main` at `cf8fb18`, plan 2's merge: 370 tests.
- Tasks 0.1 and 0.2 were built there, then each track was built in its own clone branched from Task 0.2, test first, with `pnpm check` green after every task. The code blocks below are those commits' files after Prettier and ESLint; a script compared every full-file block and every replace/with pair against the commits.
- All tracks were then merged onto Task 0.2 in two orders (forward and reverse): every merge was textually clean and the merged tree was green. The Integration tasks were built on top, green after each, and replaying them on the reverse-order merge gave the identical tree.
- Plan 3 was first built on a replay of plan 2, then rebuilt on plan 2's merged head. Plan 2's final identity and api code changed what the Audit, Brand and Public tracks and the Integration tasks edit; those were rebuilt against it, and every other track's code applied unchanged.
- Test counts are given after every task. The final count is in the "After the last task" section.

## Tracks

Tasks 0.1 and 0.2 run first, one after the other, on `foundation/03-shared-services`. Then every track starts from Task 0.2's commit in its own worktree and branch, and they run at the same time. Within a track, tasks run in order. When every track is merged, the Integration tasks run in order.

| Track | Tasks | Owns (and only it edits) | Depends on | Migrations |
| --- | --- | --- | --- | --- |
| **0 Groundwork** (first, in order) | 0.1, 0.2 | `packages/brand` (core) and `packages/integrations` (settings, storage and jobs ports); every `package.json` dependency; `pnpm-workspace.yaml`, the lockfile; `.dependency-cruiser.cjs`; the kernel's `Actor`; the jobs module's events; identity's profile, contacts, permission and actor; `db.withoutOrg`; the per-module isolation fixtures | plan 2 on `main` | `20261015090000_shared_contracts` |
| **J Jobs** | J1-J3 | `packages/integrations/src/jobs/` (pg-boss), `packages/domain/src/jobs/` (relay, runner, worker), `ProcessedEvent` in `jobs.prisma`, `org-table-fixtures/jobs.ts`, the allow-list line in `schema-check.test.ts`, `outbox-relay-function.test.ts`, ADR 0010 | Task 0 | `20261015100000_pgboss`, `20261015100100_outbox_relay`, `20261015100200_processed_event` |
| **F Files** | F1-F2 | `packages/integrations/src/storage/` (S3), `packages/integrations/test/support/minio.ts`, `packages/domain/src/files/`, `packages/contracts/src/files/`, `files.prisma`, `org-table-fixtures/files.ts`, `attachments.test.ts`, one line of `soft-delete.ts`, ADR 0011 | Task 0 | `20261015110000_attachments` |
| **D Documents** | D1, D2 | `packages/integrations/src/pdf/`, `packages/domain/src/documents/`, `packages/contracts/src/documents/`, `documents.prisma`, `org-table-fixtures/documents.ts`, ADR 0012 | Task 0; **D2 after F2** (merges the Files branch) | `20261015120000_issued_documents` |
| **P Public routes** | P1-P3 | `packages/domain/src/{rate-limits,share-links,webhooks}/`, `packages/contracts/src/share-links/`, `apps/api/src/{rate-limit,share-link-route,webhook-route}.ts` and their tests, `rate-limits.prisma`, `share-links.prisma`, `webhooks.prisma`, `org-table-fixtures/share-links.ts`, ADR 0013 | Task 0 | `20261015130000_rate_limits`, `20261015130100_share_links`, `20261015130200_webhook_events` |
| **N Notifications** | N1-N2 | `packages/integrations/src/{email,push}/` and their test support, `packages/domain/src/notifications/`, `packages/contracts/src/notifications/`, `notifications.prisma`, `org-table-fixtures/notifications.ts`, ADR 0014 | Task 0 | `20261015140000_notifications` |
| **A Audit** | A1-A2 | `packages/domain/src/audit/`, `packages/contracts/src/audit/`, `audit.prisma`, `org-table-fixtures/audit.ts`; in identity `staff.ts`, `staff-accounts.ts`, `roles.ts`, `settings.ts`, `identity.ts`, `auth/create-auth.ts`, `auth/impersonation-audit.ts`, `README.md`, `test/identity/audit-trail.test.ts`; `apps/api/test/audit.test.ts`; ADR 0015 and ADR 0006's impersonation line | Task 0 | `20261015150000_audit_log` |
| **K Kernel** | K1-K3 | `packages/domain/src/kernel/` (money, tax, time), `packages/contracts/src/kernel/`, ADR 0016 | Task 0 | none |
| **B Brand** | B1-B2 | `packages/brand/` (assets, name check, icons; not its `package.json`), the `appName` line of `apps/api/src/environment.ts` and its test, ADR 0017 | Task 0 | none |
| **I Integration** (last, in order) | I1-I4 | the merges, and every edit the tracks deferred: the organization relations, `docs/adr/README.md`, `packages/domain/README.md`, `packages/integrations/README.md`, `CLAUDE.md`, `docker-compose.yml`, `.env.example`, the root and `apps/api` `package.json`, `apps/api/src/{app,server,environment}.ts` and the new `services.ts`, `worker.ts` and `worker-jobs.ts` | every track merged | `20261015190000_organization_foreign_keys` |

**Why the tracks never collide.**
- **Shared files are settled first or last.** Every dependency all tracks need is added by Task 0.1, so no track touches a `package.json` or the lockfile. Packages export folders through one wildcard each, so a new module needs no `package.json` change. Index files, `CLAUDE.md`, Docker Compose and the app's wiring wait for the Integration tasks.
- **One Prisma file per module, no relation to `Organization` yet.** A relation to `Organization` would need a back-relation in `organization.prisma`, which every track would edit. So each track's organization tables carry the standard `organizationId` column without the relation, and Task I1 adds every relation and its foreign key in one migration. Task I1 also adds a test that every organization table refers to its organization.
- **Migrations are made without a database.** Each track writes its migration from a schema-to-schema diff (`prisma migrate diff --from-schema <before> --to-schema prisma/schema`), so no track sees another's tables. The timestamps above are fixed, distinct and ordered: a track's migrations sort after everything they depend on, so merging in any order applies them in a valid order.
- **One isolation fixture file per module** in `packages/db/test/org-table-fixtures/`, gathered when the tests load.
- **Interfaces first.** What one track needs from another exists before either starts: Task 0.2 defines the storage and job queue ports (the Files and Jobs tracks implement them), domain events and listeners (Documents, Notifications and Public publish; Jobs runs them), the actor (Audit records it), and the organization profile and member contacts (Notifications asks for them). The one real dependency, Documents' D2 storing its PDF as an attachment, is ordered: D2 starts after F2.

**Running the tracks.**
- Before a track's first task, make its worktree from Task 0.2's commit (some track sections repeat this):
  ```bash
  cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-03-<track> -b foundation/03-<track> foundation/03-shared-services
  cd /Users/ak/personal/travel-crm-03-<track> && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
  ```
- Before D2, merge the Files branch into the Documents branch (Task D2 says how). Every other track depends on Task 0 alone.
- Each `pnpm check` starts four throwaway Postgres containers, and the Files and Notifications tracks also start MinIO and Mailpit. With eight tracks on one machine, run each track's check as `pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise` (the same gates), and let at most two checks run at once on a Docker with 8 GB: with four at once, test databases stalled for minutes and tests failed for no reason of their own. If tests fail after minutes of waiting, or Docker Desktop stops, restart it (`open -a Docker`) and rerun the check alone.
- When a track's last task is committed, it is ready to merge. Merge tracks into `foundation/03-shared-services` in any order (Task I1). After the merges, and before Task I1, `pnpm check` is already green.

## Global Constraints

- **Node 24 for every command, from the right folder.** Every shell call starts in another directory, so prefix each command with `cd <folder> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`, where the folder is `/Users/ak/personal/travel-crm` for Tasks 0.1, 0.2 and I1-I4, and the track's worktree `/Users/ak/personal/travel-crm-03-<track>` for a track's tasks. Node 22 remains the machine default; do not change it.
- **`NODE_ENV` is production when unset** (plan 2): a test or script that loads the api's environment sets `NODE_ENV: "development"`, and `.env.example` sets it for local runs.
- **Docker must be running.** The db, domain, api-server and integrations tests start throwaway containers with Testcontainers (Postgres 18; MinIO and Mailpit for the storage, email and end-to-end tests).
- **Pinned versions.** Use exactly the versions in the Tech Stack, never "latest". If `pnpm install` refuses a package as published in the last 24 hours, add `"<name>@<version>"` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. A track never adds a dependency: Task 0.1 added them all.
- **Package names.** `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve to `src/<name>/index.ts`; `@travel-crm/brand` is the brand package. `apps/api` is `@travel-crm/api-server`.
- **Naming.** Plans 1 and 2's rules hold (organization, `organization_id`, `forOrg`, snake_case through `@@map`/`@map`, permissions `module:action`). Job queues and listener names are `<module>.<what it does>` (`documents.render-pdf`); event types and audit actions are `<entity>.<what happened>` (`document.issued`, `staff.removed`).
- **Readable code.** Files stay small and single-purpose; a file over ~200 lines needs a reason. Every source file opens with a one-line comment saying what it is for. Comments explain *why*. No abbreviations in public names.
- **Ports and adapters (ADR 0008).** Domain code never imports pg-boss, the AWS SDK, nodemailer, web-push or React-PDF: it takes a port from `@travel-crm/integrations` as a parameter. `packages/integrations` imports nothing of ours but `@travel-crm/brand`.
- **Data rules.** Plan 2's hold (organization data only through `db.forOrg()`, `app_enable_org_rls` and an isolation fixture for every organization table, `organization_id` in every key between organization tables, no SQL that switches organization, soft delete). Plan 3 adds:
  - Each module's tables live in its own `packages/db/prisma/schema/<module>.prisma`, and its isolation fixtures in `packages/db/test/org-table-fixtures/<module>.ts`. A fixture whose table the runtime role may not update or delete is marked `appendOnly: true`.
  - **In a track,** an organization table has the standard `organizationId` column but no `organization` relation: Task I1 adds every relation and foreign key at once.
  - **Migrations are generated without a database:** `prisma migrate diff --from-schema <the schema before> --to-schema prisma/schema --script`, into a folder with the track's fixed timestamp, then the hand-written SQL appended below the banner.
  - Tables without `organization_id` (webhook events, rate-limit counters) are reached with `db.withoutOrg()`.
  - Job data holds ids, never personal data: pg-boss's tables have no row-level security.
  - Events are published with `publishEvent(tx, …)` in the change's own transaction. Listeners run at least once, keyed by event id: work outside the database must be safe to repeat.
- **The product's name** is read from `@travel-crm/brand`, never typed: from Task B1 on, a test refuses "Travel Agency OS" or "Agency OS" in any case in any file outside `packages/brand/` and `docs/`. That includes tests and comments.
- **Tracks edit only the files the Tracks table gives them.** If a track finds it needs a change to a shared file, it does the nearest thing inside its own files and leaves the shared change to the Integration tasks.
- **Commits.** Conventional Commits, a header of at most 100 characters, staged by name. The git hooks run Prettier, ESLint and commitlint: fix what they report, never use `--no-verify`. **Never add a `Co-Authored-By` trailer.** No secrets or `.env` files in git (the dev-only values in `.env.example` are the exception, as in plans 1 and 2).
- **Git.** Tasks 0.1, 0.2 and I1-I4 work on `foundation/03-shared-services`; each track on `foundation/03-<track>` in its worktree. Don't push; there is no remote.
- **Better Auth facts this plan relies on** (checked): its password-reset request answers the same whether or not the address exists, and `revokeSessionsOnPasswordReset` ends every session; `redirectTo` must be a trusted origin, so `APP_URL` joins the trusted origins.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each is pinned by tests in the tasks named.

1. **One organization's work leaking through the tables without row-level security** (pg-boss's job table, `webhook_event`, `rate_limit_counter`). Expected: job data holds only ids and flags; a job naming the wrong organization finds nothing and isn't retried; rate-limit keys are hashed, so no IP address is stored. Pinned in J2 (the relay's jobs carry ids only, and its one cross-organization function returns ids and nothing else), J3 (`event-not-found` for a job naming another organization) and P1 (the counter stores a hash of the key, not the address).
2. **A share link that outlives its purpose or shows more than it should**: an expired, revoked, malformed or guessed token, a document whose PDF isn't rendered yet, a sensitive attachment. Expected: a 404 or 410 page, a 503 "being prepared" page with `Retry-After`, never another organization's record, and sensitive files never served through a link; guessing is cut off at 30 requests a minute per address, and the address is read as sign-in reads it (`AUTH_TRUSTED_PROXIES`), so a forged `x-forwarded-for` doesn't reset the count. Pinned in P1 (a forged leftmost address is ignored), P2, F2 (`systemDownloadLink` refuses sensitive files) and I2.
3. **Work repeated by retries, crashes or repeated deliveries.** Expected: a listener runs once per event; an issued PDF is never regenerated (one attachment however often its job runs); a webhook delivered twice is processed once; a retried delivery doesn't send its email again. Pinned in J2, J3, D2, P3, N2 and I4.
4. **People told things they shouldn't be, or at addresses they don't have**: staff without email (a placeholder address), removed members, people who opted out, the person who acted, and password resets asked for a placeholder or unknown address. Expected: nothing is sent to them, and the reset request answers the same either way. Pinned in N2, I3 and I4.
5. **Money and dates wrong at the edges**: just after midnight IST (still the day before in UTC), New Year in IST (a document's number year), Indian digit grouping (₹12,50,000.00), odd paise when GST is split into CGST and SGST, and the ₹ sign in PDF fonts that lack it. Expected: the organization's zone decides the date and year; CGST always equals SGST; the PDF shows ₹ amounts. Pinned in K1, K2, K3, D1, D2 and I4 (the PDF's text holds the ₹ totals and the CGST rows).

## File Structure

```
travel-crm/
├── packages/brand/                   @travel-crm/brand: name, colours, fonts, contacts; logos; icons; the name check
├── packages/integrations/            @travel-crm/integrations: adapters behind ports
│   └── src/{storage,jobs,email,push,pdf}/   S3 and memory; pg-boss and memory; SMTP; web push; React-PDF
├── packages/domain/src/
│   ├── kernel/                       + Actor, Money, India GST, time zones and dates
│   ├── identity/                     + actors with impersonation, organization profile, member contacts, audit records,
│   │                                   password-reset email
│   ├── jobs/                         events, outbox relay, listeners once per event, the worker
│   ├── files/                        attachments in object storage
│   ├── documents/                    issued documents rendered once; the sample quotation
│   ├── share-links/, webhooks/, rate-limits/   the public routes' rules
│   ├── notifications/                notify(), the bell, delivery by email and push
│   └── audit/                        the append-only audit log
├── packages/contracts/src/           + kernel, files, documents, share-links, notifications, audit
├── packages/db/
│   ├── prisma/schema/                + jobs, files, documents, share-links, webhooks, rate-limits, notifications, audit
│   ├── src/                          + db.withoutOrg()
│   └── test/org-table-fixtures/      one isolation fixture file per module
├── apps/api/src/                     + /p and /webhooks with rate limits, services.ts, worker.ts, worker-jobs.ts
└── docs/adr/                         + 0008 ports and adapters ... 0017 brand package
```

Calls only go down: `apps/api` → `packages/api` → `packages/domain` → `packages/db`; `packages/domain` → `packages/integrations` → `packages/brand`. `packages/contracts` is a leaf.

---

## Groundwork

Tasks 0.1 and 0.2 run first, in order, in the main checkout (`/Users/ak/personal/travel-crm`), on
`foundation/03-shared-services`.

### Task 0.1: The brand and integrations packages, every dependency, and the import rules

Plan 3's tracks run at the same time, so nothing they share may change while they run. This task makes the two new
packages, adds every npm dependency all tracks need (so no track edits a `package.json` or the lockfile), switches the
packages to one wildcard export each (so a new module needs no `package.json` change), and adds the import rules that
keep vendor SDKs inside `packages/integrations`. It also defines the first two ports, storage and jobs, with in-memory
adapters that other tracks' tests use.

**Files:**
- Create: `packages/brand/` (`package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `README.md`,
  `src/brand.ts`, `src/index.ts`, `test/brand.test.ts`)
- Create: `packages/integrations/` (`package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`,
  `README.md`, `src/storage/{object-storage,memory-storage,index}.ts`, `src/jobs/{job-queue,memory-job-queue,index}.ts`)
- Test: `packages/integrations/test/storage/memory-storage.test.ts`, `packages/integrations/test/jobs/memory-job-queue.test.ts`
- Modify: `packages/domain/package.json`, `packages/contracts/package.json`, `apps/api/package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.dependency-cruiser.cjs`, `CLAUDE.md`, `docs/adr/README.md`
- Create: `docs/adr/0008-ports-and-adapters.md`

**Interfaces:**
- Consumes: plan 2's packages as they are on `main`.
- Produces:
  - `brand` from `@travel-crm/brand`: `productName` ("Travel Agency OS"), `shortName`, `tagline`, `legalName`,
    `website`, `supportEmail`, `supportPhone`, `emailSenderName`, `colours` (`ink`, `muted`, `canvas`, `surface`,
    `hairline`, `action`, `actionPressed`, `people`, `peoplePressed`, `peopleTint`, `peopleTintInk`, `money`,
    `moneyPressed`, `status.{good,attention,bad}.{ink,fill,border}`), `fonts` (`title`, `ui`, `numbers`); types
    `Brand`, `StatusColour`. The package also exports `./assets/*` and has a `build` script for Task B2's icons.
  - From `@travel-crm/integrations/storage`: `ObjectStorage` (`presignUpload`, `presignDownload`, `put`, `head`,
    `get`), `PresignedUpload` (`url`, `method: "PUT"`, `headers`, `expiresAt`), `StoredObject` (`sizeBytes`,
    `contentType`), `createMemoryStorage(now?): MemoryStorage` (adds `objects` and `upload(upload, body, contentType)`,
    which plays the browser and refuses what S3 would).
  - From `@travel-crm/integrations/jobs`: `JobQueue` (`send(queue, data, options?): Promise<string | null>`),
    `JobData` (a flat record of strings, numbers, booleans and nulls), `JobOptions` (`retryLimit`,
    `retryDelaySeconds`, `startAfter`, `id`), `assertQueueName(name)`, `createMemoryJobQueue(): MemoryJobQueue`
    (adds `sent: readonly SentJob[]`; a repeated `id` queues nothing and returns null).
  - Every dependency the tracks use: pg-boss 12.37.1, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
    3.1150.0, nodemailer 10.1.0, web-push 3.6.7, `@react-pdf/renderer` 4.9.0, react 19.3.0, the three `@fontsource`
    font packages 5.3.0, `testcontainers` 12.2.1 and `unpdf` 1.8.1 (tests), libphonenumber-js 1.13.15 (contracts),
    `@resvg/resvg-js` 2.6.2 and tsx (brand, for generating icons).

- [ ] **Step 1: Create the branch**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
git switch main && git log -1 --oneline
git switch -c foundation/03-shared-services
```
Expected: `main` is at plan 2's merge commit (`chore: merge foundation/02-api-identity …`) or later.

- [ ] **Step 2: Create the two packages' settings and add every dependency**

`packages/brand/package.json`:
```json
{
  "name": "@travel-crm/brand",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./assets/*": "./assets/*"
  },
  "scripts": {
    "build": "tsx scripts/generate-icons.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "devDependencies": {
    "@resvg/resvg-js": "2.6.2",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/brand/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/brand/eslint.config.js`:
```js
// ESLint for @travel-crm/brand: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/brand/vitest.config.ts`:
```ts
// Brand tests are plain unit tests: no database.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "brand",
    include: ["test/**/*.test.ts"],
  },
});
```

`packages/integrations/package.json`:
```json
{
  "name": "@travel-crm/integrations",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "3.1150.0",
    "@aws-sdk/s3-request-presigner": "3.1150.0",
    "@fontsource/eb-garamond": "5.3.0",
    "@fontsource/figtree": "5.3.0",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@react-pdf/renderer": "4.9.0",
    "@travel-crm/brand": "workspace:*",
    "nodemailer": "10.1.0",
    "pg-boss": "12.37.1",
    "react": "catalog:",
    "web-push": "3.6.7"
  },
  "devDependencies": {
    "@travel-crm/db": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/web-push": "3.6.4",
    "eslint": "catalog:",
    "testcontainers": "12.2.1",
    "typescript": "catalog:",
    "unpdf": "1.8.1",
    "vitest": "catalog:"
  }
}
```

`packages/integrations/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "compilerOptions": {
    // PDF templates are React components (React-PDF), written as .tsx.
    "jsx": "react-jsx"
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/integrations/eslint.config.js`:
```js
// ESLint for @travel-crm/integrations: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/integrations/vitest.config.ts`:
```ts
// Adapter tests: the jobs adapter runs against the throwaway Postgres that @travel-crm/db's test setup starts;
// the storage and email adapters start their own containers (MinIO, Mailpit) in their test files.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "integrations",
    include: ["test/**/*.test.{ts,tsx}"],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
```

The brand package's `build` script fails until Task B2 writes `scripts/generate-icons.ts`; `pnpm check` runs no
builds. The other packages switch to one wildcard export each, and gain the workspace packages they will use:

In `packages/domain/package.json`:

replace:
```json
  "exports": {
    "./identity": "./src/identity/index.ts",
    "./kernel": "./src/kernel/index.ts"
  },
```
with:
```json
  "exports": {
    "./*": "./src/*/index.ts"
  },
```

replace:
```json
    "@travel-crm/db": "workspace:*",
    "better-auth": "1.7.7"
```
with:
```json
    "@travel-crm/db": "workspace:*",
    "@travel-crm/integrations": "workspace:*",
    "better-auth": "1.7.7"
```

In `packages/contracts/package.json`:

replace:
```json
  "exports": {
    "./identity": "./src/identity/index.ts"
  },
```
with:
```json
  "exports": {
    "./*": "./src/*/index.ts"
  },
```

replace:
```json
  "dependencies": {
    "zod": "catalog:"
```
with:
```json
  "dependencies": {
    "libphonenumber-js": "1.13.15",
    "zod": "catalog:"
```

In `apps/api/package.json`:

replace:
```json
    "@travel-crm/api": "workspace:*",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@trpc/server": "11.19.0",
```
with:
```json
    "@travel-crm/api": "workspace:*",
    "@travel-crm/brand": "workspace:*",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@travel-crm/integrations": "workspace:*",
    "@trpc/server": "11.19.0",
```

replace:
```json
    "eslint": "catalog:",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
```
with:
```json
    "eslint": "catalog:",
    "testcontainers": "12.2.1",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "unpdf": "1.8.1",
    "vitest": "catalog:"
```

In `pnpm-workspace.yaml`:

replace:
```yaml
  zod: 4.6.7
```
with:
```yaml
  zod: 4.6.7
  react: 19.3.0
  "@types/react": 19.3.0
```

Install, and clear Vitest's cache. Right after a dependency change, several packages' Vitest runs can race to clear
the stale shared cache and fail with `ENOTEMPTY … .vitest-cache`:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install && rm -rf node_modules/.vitest-cache
```
Expected: about 125 packages added, a warning about the deprecated `glob@10.5.0` (testcontainers' archiver brings it),
and no request to approve a build script. If pnpm refuses a package as published in the last 24 hours, add
`"<name>@<version>"` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, as plan 1 did.

- [ ] **Step 3: Write the failing tests**

`packages/brand/test/brand.test.ts`:
```ts
// The brand's values are well formed: colours are hex codes, contacts parse, and the name is set.
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";

/** Every string value in a nested object, with its path, e.g. ["colours.status.good.ink", "#166534"]. */
function leaves(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") return [[path, child] as [string, string]];
    return child !== null && typeof child === "object" ? leaves(child, path) : [];
  });
}

describe("brand", () => {
  it("has a product name and a shorter short name", () => {
    expect(brand.productName.length).toBeGreaterThan(0);
    expect(brand.shortName.length).toBeLessThanOrEqual(12);
  });

  it("writes every colour as a six-digit hex code", () => {
    const colours = leaves(brand.colours);
    expect(colours.length).toBeGreaterThan(10);
    for (const [path, colour] of colours) expect(colour, path).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has contacts that parse", () => {
    expect(new URL(brand.website).protocol).toBe("https:");
    expect(brand.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    expect(brand.supportPhone).toMatch(/^\+[1-9][0-9]{7,14}$/);
  });
});
```

`packages/integrations/test/storage/memory-storage.test.ts`:
```ts
// The in-memory storage behaves like S3 where tests depend on it: signed uploads must match, files read back.
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../src/storage/index.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("memory storage", () => {
  it("accepts an upload that matches its signature and reads it back", async () => {
    const storage = createMemoryStorage();
    const upload = await storage.presignUpload(
      { key: "organizations/a/1", contentType: "image/png", sizeBytes: 5 },
      60,
    );
    expect(upload.headers).toEqual({ "content-type": "image/png", "content-length": "5" });

    await storage.upload(upload, bytes("hello"), "image/png");

    expect(await storage.head("organizations/a/1")).toEqual({ sizeBytes: 5, contentType: "image/png" });
    expect(new TextDecoder().decode((await storage.get("organizations/a/1")) ?? new Uint8Array())).toBe("hello");
  });

  it("refuses an upload of another size or type, or after it expires", async () => {
    let time = new Date("2026-10-15T10:00:00Z");
    const storage = createMemoryStorage(() => time);
    const upload = await storage.presignUpload({ key: "k", contentType: "image/png", sizeBytes: 5 }, 60);

    await expect(storage.upload(upload, bytes("hello!"), "image/png")).rejects.toThrow(/size/);
    await expect(storage.upload(upload, bytes("hello"), "application/pdf")).rejects.toThrow(/content type/);
    time = new Date("2026-10-15T10:01:01Z");
    await expect(storage.upload(upload, bytes("hello"), "image/png")).rejects.toThrow(/expired/);
    expect(await storage.head("k")).toBeNull();
  });

  it("stores server-made files and names downloads", async () => {
    const storage = createMemoryStorage();
    await storage.put({ key: "doc", contentType: "application/pdf", body: bytes("%PDF") });
    expect(await storage.head("doc")).toEqual({ sizeBytes: 4, contentType: "application/pdf" });
    expect(await storage.presignDownload({ key: "doc", fileName: "Quote QT-1.pdf" }, 60)).toContain(
      "name=Quote%20QT-1.pdf",
    );
    expect(await storage.get("missing")).toBeNull();
  });
});
```

`packages/integrations/test/jobs/memory-job-queue.test.ts`:
```ts
// The in-memory job queue records jobs, refuses badly named queues, and queues a repeated job id once.
import { describe, expect, it } from "vitest";
import { createMemoryJobQueue } from "../../src/jobs/index.js";

describe("memory job queue", () => {
  it("records each job with its queue, data and options", async () => {
    const queue = createMemoryJobQueue();
    const id = await queue.send("documents.render-pdf", { organizationId: "o1", documentId: "d1" }, { retryLimit: 3 });
    expect(queue.sent).toEqual([
      {
        id,
        queue: "documents.render-pdf",
        data: { organizationId: "o1", documentId: "d1" },
        options: { retryLimit: 3 },
      },
    ]);
  });

  it("queues a repeated job id once", async () => {
    const queue = createMemoryJobQueue();
    const id = "0199e7a0-0000-7000-8000-000000000001";
    expect(await queue.send("webhooks.process", { webhookEventId: "w1" }, { id })).toBe(id);
    expect(await queue.send("webhooks.process", { webhookEventId: "w1" }, { id })).toBeNull();
    expect(queue.sent).toHaveLength(1);
  });

  it("refuses queue names that are not <module>.<action>", async () => {
    const queue = createMemoryJobQueue();
    await expect(queue.send("RenderPdf", {})).rejects.toThrow(/Queue names/);
    await expect(queue.send("documents", {})).rejects.toThrow(/Queue names/);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand --filter @travel-crm/integrations test`

Expected: FAIL. The brand test can't find `../src/index.js`; the integrations tests can't find
`../../src/storage/index.js` and `../../src/jobs/index.js`.

- [ ] **Step 5: Write the brand values and the two ports**

`packages/brand/src/brand.ts`:
```ts
// The product's own identity (spec section 10): its name, colours, fonts and contacts, in one place.
// An organization's own logo, colours and terms are per-organization settings in the database, not these.

/** A status colour: text and dot, background and border. Status colours mean status only (confirmed, due, lost). */
export interface StatusColour {
  readonly ink: string;
  readonly fill: string;
  readonly border: string;
}

export const brand = {
  /** The working name (spec open item Q8). Code reads it from here; a check refuses it anywhere else. */
  productName: "Travel Agency OS",
  /** For the home screen icon and other tight spaces. */
  shortName: "Agency OS",
  tagline: "Run your travel agency in one place",
  /**
   * Who runs the product. The values on .example addresses are not confirmed yet: the product owner replaces them
   * before the first staging deploy (spec 13).
   */
  legalName: "Travel Agency OS (legal name to be confirmed)",
  website: "https://travel-agency-os.example",
  supportEmail: "support@travel-agency-os.example",
  supportPhone: "+910000000000",
  /** The sender name on email the product sends for an organization: "<organization> via <this>". */
  emailSenderName: "Travel Agency OS",

  /** Colour tokens, read by Tailwind (plan 5), the PDF templates and the email layout. */
  colours: {
    /** Text and the darkest surfaces. */
    ink: "#1a1a1a",
    /** Secondary text. */
    muted: "#6b6b70",
    /** Page background: warm white. */
    canvas: "#fffdf9",
    /** Panels, table headers and the sidebar. */
    surface: "#f5f4f0",
    /** Thin lines between flat surfaces. */
    hairline: "#e6e3dc",
    /** The main action, the active item and focus. */
    action: "#2563eb",
    actionPressed: "#1d4ed8",
    /** People and conversations. */
    people: "#6a4bbd",
    peoplePressed: "#5b3fa6",
    peopleTint: "#efe7fd",
    peopleTintInk: "#4c2f97",
    /** Money: amounts, margins, payments. */
    money: "#034f46",
    moneyPressed: "#07352f",
    status: {
      good: { ink: "#166534", fill: "#e6f6ec", border: "#bfe5cc" },
      attention: { ink: "#8a5a00", fill: "#fdf3d8", border: "#f1d999" },
      bad: { ink: "#9f1f17", fill: "#fde8e6", border: "#f5c4bf" },
    } satisfies Record<string, StatusColour>,
  },

  /** Font families. Every number (rupees, counts, dates in tables) uses the monospace one, so columns line up. */
  fonts: {
    title: "EB Garamond",
    ui: "Figtree",
    numbers: "IBM Plex Mono",
  },
} as const;

export type Brand = typeof brand;
```

`packages/brand/src/index.ts`:
```ts
// Public API of @travel-crm/brand: the product's name, colours, fonts and contacts.
export { brand, type Brand, type StatusColour } from "./brand.js";
```

`packages/brand/README.md`:
```markdown
# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts and contacts. One source of truth.

    import { brand } from "@travel-crm/brand";
    brand.productName; // "Travel Agency OS"
    brand.colours.money; // "#034f46"

- Code reads the product name only through this package.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
```

`packages/integrations/src/storage/object-storage.ts`:
```ts
// The storage port (spec 9.2): what the domain needs from an S3-compatible object store. Files go straight between
// the browser and storage through short-lived presigned URLs; the api never streams them.

/** An upload the browser makes itself, straight to storage. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Headers the browser must send exactly as given: they are signed, so a different size or type is refused. */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** What storage knows about a stored file. */
export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

export interface ObjectStorage {
  /** A URL the browser PUTs exactly this file to: its size and content type are part of the signature. */
  presignUpload(
    object: { key: string; contentType: string; sizeBytes: number },
    expiresInSeconds: number,
  ): Promise<PresignedUpload>;
  /** A URL that downloads the file and saves it under fileName. */
  presignDownload(object: { key: string; fileName: string }, expiresInSeconds: number): Promise<string>;
  /** Stores a file the server made itself, such as a rendered PDF. */
  put(object: { key: string; contentType: string; body: Uint8Array }): Promise<void>;
  /** The stored file's size and type, or null when nothing is stored under key. */
  head(key: string): Promise<StoredObject | null>;
  /** The stored file's bytes, or null when nothing is stored under key. */
  get(key: string): Promise<Uint8Array | null>;
}
```

`packages/integrations/src/storage/memory-storage.ts`:
```ts
// An in-memory ObjectStorage for tests: it keeps files in a Map and checks a simulated browser upload the way S3
// checks a presigned one (same size and type, before it expires).
import type { ObjectStorage, PresignedUpload, StoredObject } from "./object-storage.js";

interface MemoryObject {
  body: Uint8Array;
  contentType: string;
}

export interface MemoryStorage extends ObjectStorage {
  /** Everything stored, by key. */
  readonly objects: ReadonlyMap<string, MemoryObject>;
  /** Plays the browser: PUTs body to a URL from presignUpload. Rejects as S3 would refuse it. */
  upload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void>;
}

/** Runs fn as a promise, so a throw becomes a rejection, as with a real network call. */
function promised<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(fn());
  });
}

export function createMemoryStorage(now: () => Date = () => new Date()): MemoryStorage {
  const objects = new Map<string, MemoryObject>();

  return {
    objects,
    presignUpload: ({ key, contentType, sizeBytes }, expiresInSeconds) =>
      promised(() => {
        const expiresAt = new Date(now().getTime() + expiresInSeconds * 1000);
        return {
          url: `memory://upload/${encodeURIComponent(key)}`,
          method: "PUT" as const,
          headers: { "content-type": contentType, "content-length": String(sizeBytes) },
          expiresAt,
        };
      }),
    presignDownload: ({ key, fileName }, expiresInSeconds) =>
      promised(() => {
        const expires = String(now().getTime() + expiresInSeconds * 1000);
        return `memory://download/${encodeURIComponent(key)}?name=${encodeURIComponent(fileName)}&expires=${expires}`;
      }),
    put: ({ key, contentType, body }) =>
      promised(() => {
        objects.set(key, { body: body.slice(), contentType });
      }),
    head: (key) =>
      promised((): StoredObject | null => {
        const object = objects.get(key);
        return object ? { sizeBytes: object.body.byteLength, contentType: object.contentType } : null;
      }),
    get: (key) => promised(() => objects.get(key)?.body.slice() ?? null),
    upload: (upload, body, contentType) =>
      promised(() => {
        if (now() > upload.expiresAt) throw new Error("The upload URL has expired");
        if (contentType !== upload.headers["content-type"]) throw new Error("The content type is not the signed one");
        if (String(body.byteLength) !== upload.headers["content-length"])
          throw new Error("The size is not the signed one");
        const key = decodeURIComponent(new URL(upload.url).pathname.slice(1));
        objects.set(key, { body: body.slice(), contentType });
      }),
  };
}
```

`packages/integrations/src/storage/index.ts`:
```ts
// Public API of @travel-crm/integrations/storage: the storage port and its adapters.
export { createMemoryStorage, type MemoryStorage } from "./memory-storage.js";
export type { ObjectStorage, PresignedUpload, StoredObject } from "./object-storage.js";
```

`packages/integrations/src/jobs/job-queue.ts`:
```ts
// The jobs port (spec 9.1): queue work for the worker. pg-boss implements it; tests use the in-memory queue.

/**
 * What a job carries: ids and small flags, never personal data. The job table has no row-level security, so a job
 * names its organization and record, and the worker reads the record inside db.forOrg().
 */
export type JobData = Readonly<Record<string, string | number | boolean | null>>;

export interface JobOptions {
  /** Retries after the first attempt fails, before the job lands in the failed list. */
  retryLimit?: number;
  /** Seconds before the first retry. Each later retry waits about twice as long as the one before. */
  retryDelaySeconds?: number;
  /** Not before this time. */
  startAfter?: Date;
  /** The job's id, a UUID. Sending the same id again queues nothing and returns null, so a send can be repeated. */
  id?: string;
}

export interface JobQueue {
  /** Queues a job. Returns its id, or null when a job with `options.id` was already queued. */
  send(queue: string, data: JobData, options?: JobOptions): Promise<string | null>;
}

/** Queue names are "<module>.<what it does>", e.g. "documents.render-pdf": lower case, dots between parts. */
const QUEUE_NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export function assertQueueName(name: string): void {
  if (!QUEUE_NAME_PATTERN.test(name)) {
    throw new RangeError(`Queue names look like "documents.render-pdf", got ${JSON.stringify(name)}`);
  }
}
```

`packages/integrations/src/jobs/memory-job-queue.ts`:
```ts
// An in-memory JobQueue for tests: it records what was sent, and repeats of a job id queue nothing, as in pg-boss.
import { randomUUID } from "node:crypto";
import { assertQueueName, type JobData, type JobOptions, type JobQueue } from "./job-queue.js";

export interface SentJob {
  id: string;
  queue: string;
  data: JobData;
  options: JobOptions;
}

export interface MemoryJobQueue extends JobQueue {
  /** Every job queued so far, oldest first. */
  readonly sent: readonly SentJob[];
}

export function createMemoryJobQueue(): MemoryJobQueue {
  const sent: SentJob[] = [];

  return {
    sent,
    send: (queue, data, options = {}) =>
      new Promise((resolve) => {
        assertQueueName(queue);
        if (options.id !== undefined && sent.some((job) => job.id === options.id)) {
          resolve(null);
          return;
        }
        const job = { id: options.id ?? randomUUID(), queue, data, options };
        sent.push(job);
        resolve(job.id);
      }),
  };
}
```

`packages/integrations/src/jobs/index.ts`:
```ts
// Public API of @travel-crm/integrations/jobs: the jobs port and its adapters.
export { assertQueueName, type JobData, type JobOptions, type JobQueue } from "./job-queue.js";
export { createMemoryJobQueue, type MemoryJobQueue, type SentJob } from "./memory-job-queue.js";
```

`packages/integrations/README.md`:
```markdown
# @travel-crm/integrations

Adapters to the outside world (spec 3): storage, jobs, email, push and PDFs. Domain code never calls a vendor SDK;
it calls a port defined here, and the api and worker pass in the real adapter. Tests pass in the in-memory one.

| Import                             | Port          | Adapters                                  |
| ---------------------------------- | ------------- | ----------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage | `createMemoryStorage` (tests), S3 (files) |
| `@travel-crm/integrations/jobs`    | JobQueue      | `createMemoryJobQueue` (tests), pg-boss   |

- Only this package imports vendor SDKs (pg-boss, AWS SDK, nodemailer, web-push, React-PDF). dependency-cruiser
  enforces it, and this package imports nothing of ours except `@travel-crm/brand`.
- Job data holds ids, never personal data: pg-boss's tables have no row-level security.
```

`legalName` and the contact values on `.example` addresses are not confirmed: the product owner replaces them before
the first staging deploy. Reserved `.example` addresses mean nothing real is impersonated meanwhile.

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand --filter @travel-crm/integrations test`

Expected: 3 brand tests and 6 integrations tests pass. The integrations suite starts the throwaway Postgres although
these tests don't use it: the Jobs track's pg-boss tests will.

- [ ] **Step 7: Keep vendor SDKs in the integrations package, and prove the rules fire**

In `.dependency-cruiser.cjs`:

replace:
```js
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/kernel/" },
    },
```
with:
```js
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/kernel/" },
    },
    {
      name: "vendor-sdks-only-in-integrations",
      comment:
        "Domain code never calls a vendor SDK (spec 3): it calls a port in @travel-crm/integrations, and only that " +
        "package imports pg-boss, the AWS SDK, nodemailer, web-push or React-PDF.",
      severity: "error",
      from: { pathNot: "^packages/integrations/" },
      to: { path: "(^|/)node_modules/(pg-boss|@aws-sdk/[^/]+|nodemailer|web-push|@react-pdf/[^/]+)(/|$)" },
    },
    {
      name: "integrations-are-adapters-only",
      comment:
        "Adapters know vendors, not our business: @travel-crm/integrations imports nothing of ours but the brand " +
        "package. Its tests may use the test database.",
      severity: "error",
      from: { path: "^packages/integrations/src/" },
      to: { path: "^(apps|packages)/", pathNot: ["^packages/integrations/", "^packages/brand/"] },
    },
    {
      name: "brand-depends-on-nothing-of-ours",
      comment:
        "The brand package is the product's identity: every layer may read it, so its code reads no other package.",
      severity: "error",
      from: { path: "^packages/brand/src/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/brand/" },
    },
```

Prove each rule fires with probe files, then delete them. The vendor probe imports pg-boss by path, because pnpm
already stops `packages/domain` resolving a package it doesn't depend on; the rule is for the day someone adds one.
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
mkdir -p packages/domain/src/probe packages/integrations/src/probe packages/brand/src/probe
echo 'import { PgBoss } from "../../../integrations/node_modules/pg-boss/dist/index.js"; export const probe = PgBoss;' > packages/domain/src/probe/vendor.ts
echo 'import { DomainError } from "../../../domain/src/kernel/index.js"; import { brand } from "../../../brand/src/index.js"; export const probe = [DomainError, brand];' > packages/integrations/src/probe/ours.ts
echo 'import { createMemoryStorage } from "../../../integrations/src/storage/index.js"; export const probe = createMemoryStorage;' > packages/brand/src/probe/ours.ts
pnpm exec depcruise apps packages --config .dependency-cruiser.cjs | grep error
rm -rf packages/domain/src/probe packages/integrations/src/probe packages/brand/src/probe
pnpm run depcruise
```
Expected: exactly three errors: `vendor-sdks-only-in-integrations` from `packages/domain/src/probe/vendor.ts`,
`integrations-are-adapters-only` from `packages/integrations/src/probe/ours.ts` (to the kernel; the brand import is
allowed), and `brand-depends-on-nothing-of-ours` from `packages/brand/src/probe/ours.ts`. After the probes are
deleted, `pnpm run depcruise` reports no violations.

- [ ] **Step 8: Record the decision**

`docs/adr/0008-ports-and-adapters.md`:
```markdown
# 0008: Ports and adapters for the shared services

Date: 2026-10-15 · Status: accepted · Implements spec sections 3, 9 and 10

## Decision

- **`@travel-crm/integrations` holds every adapter to the outside world**: storage, jobs, email, web push and PDFs.
  Each adapter folder has a _port_, an interface saying what the domain needs (`ObjectStorage`, `JobQueue`), the real
  adapter (S3, pg-boss) and an in-memory one for tests.
- **Domain code takes ports as parameters.** It never imports a vendor SDK, and it never builds an adapter itself: the
  api and worker build the real ones from the environment and pass them in. Tests pass the in-memory ones.
- **dependency-cruiser enforces it:**
  - `vendor-sdks-only-in-integrations`: only `packages/integrations` imports pg-boss, the AWS SDK, nodemailer,
    web-push or React-PDF;
  - `integrations-are-adapters-only`: adapters import nothing of ours except `@travel-crm/brand`;
  - `brand-depends-on-nothing-of-ours`: every layer may read the brand package, so its code reads no other package.
- **`@travel-crm/brand` holds the product's identity** (spec 10): name, colours, fonts, contacts. The contact values
  on `.example` addresses are not confirmed yet; the product owner replaces them before the first staging deploy.
- **Packages export folders, not files.** `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and
  `@travel-crm/integrations/<adapter>` resolve to `src/<name>/index.ts` through one wildcard export each, so a new
  module needs no `package.json` change.
- **Job data holds ids, never personal data.** pg-boss's tables live outside row-level security; the worker reads
  records inside `db.forOrg()`.

## Context

- **Why ports, not direct SDK calls.** Tests run against real Postgres but should not need S3, SMTP or a push service
  for every domain rule; the in-memory adapters behave like the real ones where callers depend on it (a presigned
  upload of the wrong size is refused). Swapping S3 for another provider, or SMTP for SES, touches one folder.
- **Why every dependency was added up front.** Plan 3 is built as parallel tracks (see the plan). Adding all of the
  adapters' dependencies in one task means no track edits a `package.json` or the lockfile, so the tracks merge
  without conflicts.

## Consequences

- An adapter's real implementation is tested against a real service in a container (Postgres, MinIO, Mailpit) in
  `packages/integrations/test`. The in-memory adapters are tested there too, so tests that rely on them rely on
  checked behaviour.
- Adding a vendor SDK means adding it to `packages/integrations` and to the rule's list.
```

In `docs/adr/README.md`:

replace:
```markdown
| [0007](0007-removing-staff.md)         | Removing staff: soft-deleted membership, released email, sessions ended                 |
```
with:
```markdown
| [0007](0007-removing-staff.md)         | Removing staff: soft-deleted membership, released email, sessions ended                 |
| [0008](0008-ports-and-adapters.md)     | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package      |
```

In `CLAUDE.md`:

replace:
```markdown
- **Strict TypeScript.** No `any`, no `!` non-null assertions, no ignored build errors.
- **Pinned versions.** Shared tool versions live in the `catalog:` in `pnpm-workspace.yaml`. Prisma is pinned to 7.10.0;
```
with:
```markdown
- **Strict TypeScript.** No `any`, no `!` non-null assertions, no ignored build errors.
- **Ports and adapters (ADR 0008).** Domain code never imports a vendor SDK. It takes a port from
  `@travel-crm/integrations/<adapter>` (`ObjectStorage`, `JobQueue`, …) as a parameter; the api and worker pass the real
  adapter, tests pass the in-memory one. Only `packages/integrations` imports pg-boss, the AWS SDK, nodemailer,
  web-push and React-PDF, and it imports nothing of ours but `@travel-crm/brand`.
- **The product's name, colours and contacts** come from `@travel-crm/brand`, never typed elsewhere.
- **Pinned versions.** Shared tool versions live in the `catalog:` in `pnpm-workspace.yaml`. Prisma is pinned to 7.10.0;
```

replace:
```markdown
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`).
- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, soft delete, document numbers.
```
with:
```markdown
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`).
  `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve
  to `src/<name>/index.ts`, so a new module needs no `package.json` change.
- `packages/integrations`: adapters to the outside world, each a port plus a real and an in-memory adapter.
- `packages/brand`: the product's name, colours, fonts and contacts (spec 10).
- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, soft delete, document numbers.
```

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green, 23 Turborepo tasks. Test counts: api-server 72, api 4, brand 3, contracts 18, db 100, domain 111,
eslint-config 65, integrations 6 (379 in all).

```bash
cd /Users/ak/personal/travel-crm
git add packages/brand packages/integrations packages/domain/package.json packages/contracts/package.json apps/api/package.json pnpm-workspace.yaml pnpm-lock.yaml .dependency-cruiser.cjs CLAUDE.md docs/adr/0008-ports-and-adapters.md docs/adr/README.md
git commit -m "feat: add the brand and integrations packages, with ports for storage and jobs"
```

---

### Task 0.2: The shared contracts every track codes against

The tracks need a few things from each other before any of them exists: who is acting (for the audit log and every
service), how to publish a domain event and define a listener (documents and notifications publish; the jobs track
runs them), what other modules may ask identity about an organization and its people, the permission for sensitive
files, the organization's time zone, a transaction with no organization for the few tables without one, and the
status a domain error gets on a plain HTTP route. This task defines them, with tests, and moves the isolation
fixtures to one file per module so that tracks never edit the same fixture file.

**Files:**
- Modify: `packages/db/prisma/schema/organization.prisma`; Create: `packages/db/prisma/schema/jobs.prisma`,
  `packages/db/prisma/migrations/20261015090000_shared_contracts/migration.sql`
- Create: `packages/db/test/org-table-fixture.ts`, `packages/db/test/org-table-fixtures/{counters,identity,jobs}.ts`;
  Modify: `packages/db/test/org-table-fixtures.ts`, `packages/db/test/isolation.test.ts`
- Modify: `packages/db/src/for-org.ts`, `packages/db/src/database.ts`
- Create: `packages/domain/src/kernel/actor.ts`, `packages/domain/src/identity/organization-profile.ts`; Modify:
  `packages/domain/src/kernel/index.ts`, `packages/domain/src/identity/{member-access,access,identity,index,permissions,starter-roles}.ts`,
  `packages/api/src/procedures.ts`
- Create: `packages/domain/src/jobs/{events,publish-event,index}.ts`, `packages/domain/src/jobs/README.md`
- Modify: `packages/api/src/errors.ts`, `packages/api/src/index.ts`
- Test: `packages/db/test/{outbox,without-org}.test.ts`,
  `packages/domain/test/identity/{access,permissions,starter-roles,organization-profile}.test.ts`,
  `packages/domain/test/identity/rule-helpers.ts`, `packages/domain/test/jobs/{publish-event,define-listener}.test.ts`,
  `packages/api/test/errors.test.ts`
- Docs: `docs/adr/0009-actors-and-domain-events.md`, `docs/adr/README.md`, `docs/adr/0005-roles-and-permissions.md`,
  `CLAUDE.md`, `packages/db/README.md`, `packages/domain/README.md`, `packages/domain/src/identity/README.md`,
  `.github/pull_request_template.md`

**Interfaces:**
- Consumes: Task 0.1's packages; plan 2's identity, `db.forOrg`, `OrgTx`, `IdentityTx`, procedure builders, and the
  isolation suite's `organizationIdNotUpdatable` map (which becomes `updatableColumn`).
- Produces:
  - Kernel: `Actor = { organizationId: string; userId: string | null; source: ActorSource; impersonatedBy: string | null }`,
    `ActorSource = "web" | "api" | "job" | "impersonation"`, `systemActor(organizationId): Actor`.
  - Identity: `MemberAccess extends Actor` (with `userId: string`); `resolveAccess(userId, organizationId,
    session?: AccessSession)` with `AccessSession = { impersonatedBy: string | null }` (source `impersonation` when it
    is set, else `web`), and the API passes the session's `impersonatedBy`.
    `identity.organizationProfile(organizationId): Promise<OrganizationProfile | null>` with
    `OrganizationProfile = { id; name; code; timeZone; contactEmail: string | null }`;
    `identity.memberContacts(organizationId, userIds): Promise<MemberContact[]>` with
    `MemberContact = { userId; name; email: string | null }` (active members only; null for staff without email).
  - Permission `documents:view_sensitive`: Owner and Admin hold it, and the Operations starter role.
  - Columns `organization.time_zone` (default `Asia/Kolkata`) and `organization.contact_email`.
  - `@travel-crm/domain/jobs`: `publishEvent(tx: OrgTx, event: { type: string; payload: EventPayload }): Promise<string>`;
    `defineListener<Payload>({ name, eventType, payload: PayloadSchema<Payload>, handle(event: DomainEvent<Payload>, context: ListenerContext) }): EventListener`;
    `DomainEvent<Payload> = { id; organizationId; type; payload; occurredAt: Date }`;
    `EventListener = { name; eventType; handle(event, context): Promise<void> }`;
    `ListenerContext = { actor: Actor; forOrg<T>(fn: (tx: OrgTx) => Promise<T>): Promise<T> }`;
    `EventPayload`, `JsonValue`, `PayloadSchema<T> = { parse(value: unknown): T }`, `assertEventType(type)`.
  - Table `outbox_event`, append-only for the runtime role except `relayed_at`, with the partial index
    `outbox_event_unrelayed`.
  - `db.withoutOrg<T>(fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>`.
  - Isolation fixtures: `packages/db/test/org-table-fixtures/<module>.ts` exporting `fixtures: OrgTableFixtures`
    (`Record<table, { create(tx): Promise<unknown>; appendOnly?: boolean; updatableColumn?: string }>`).
  - `domainErrorResponse(error: DomainError): Response` from `@travel-crm/api`.

- [ ] **Step 1: Write the failing database tests: fixtures per module, append-only tables, the outbox**

The fixtures move out of the one shared file into `test/org-table-fixtures/`, gathered when the tests load. A table
whose rows the runtime role may not update or delete (`outbox_event` now, the audit log later) is marked
`appendOnly`, and the suite then expects those statements refused outright. Plan 2's `organizationIdNotUpdatable`
map (tables whose `organization_id` column-level grants lock, each with a column the runtime role may update) moves
into the same fixtures as `updatableColumn`: `role`'s is `name`. One list, in the files each module owns.

`packages/db/test/org-table-fixture.ts`:
```ts
// The shape of an isolation fixture: how to create a row in one organization-owned table (see org-table-fixtures.ts).
import type { OrgTx } from "../src/for-org.js";

export interface OrgTableFixture {
  /** Creates one row in the table, inside db.forOrg(). */
  create: (tx: OrgTx) => Promise<unknown>;
  /**
   * The table is append-only for the api and worker: they can't delete its rows or change their organization_id
   * (they may update only columns granted to them by name, such as outbox_event.relayed_at). The isolation suite
   * then expects those statements to be refused outright, which is stronger than row-level security.
   */
  appendOnly?: boolean;
  /**
   * For a table whose organization_id the runtime role may not update (column-level grants), a column it may update:
   * the isolation suite checks another organization can't update that one, and can't move the row at all.
   */
  updatableColumn?: string;
}

export type OrgTableFixtures = Readonly<Record<string, OrgTableFixture>>;
```

`packages/db/test/org-table-fixtures/counters.ts`:
```ts
// Isolation fixtures for the document-number counters.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  org_counter: { create: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }) },
};
```

`packages/db/test/org-table-fixtures/identity.ts`:
```ts
// Isolation fixtures for the identity module's role tables.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  // The runtime role may update a role's name, not its organization_id (migration runtime_column_grants).
  role: {
    create: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
    updatableColumn: "name",
  },
  role_permission: {
    create: async (tx) => {
      const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
      return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
    },
  },
};
```

`packages/db/test/org-table-fixtures/jobs.ts`:
```ts
// Isolation fixtures for the jobs module: the outbox.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  outbox_event: {
    create: (tx) => tx.outboxEvent.create({ data: { type: "isolation.checked", payload: { probe: true } } }),
    appendOnly: true,
  },
};
```

In `packages/db/test/org-table-fixtures.ts`:

replace:
```ts
// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
  role: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
  role_permission: async (tx) => {
    const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
    return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
  },
};
```
with:
```ts
// Every organization-owned table's isolation fixture, gathered from the files in org-table-fixtures/: one file per
// module, so modules built at the same time never edit the same file. isolation.test.ts runs its checks on each
// table and fails if a table with an organization_id column has no fixture. Add a file, or an entry to your
// module's file, whenever you add such a table.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OrgTableFixture, OrgTableFixtures } from "./org-table-fixture.js";

export type { OrgTableFixture, OrgTableFixtures } from "./org-table-fixture.js";

const directory = path.join(import.meta.dirname, "org-table-fixtures");

async function loadFixtures(): Promise<OrgTableFixtures> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts")).sort();
  const merged: Record<string, OrgTableFixture> = {};
  for (const file of files) {
    const loaded = (await import(pathToFileURL(path.join(directory, file)).href)) as { fixtures?: OrgTableFixtures };
    if (!loaded.fixtures) throw new Error(`org-table-fixtures/${file} must export \`fixtures\``);
    for (const [table, fixture] of Object.entries(loaded.fixtures)) {
      if (table in merged) throw new Error(`Two isolation fixtures for table ${table}`);
      merged[table] = fixture;
    }
  }
  return merged;
}

export const orgTableFixtures = await loadFixtures();
```

In `packages/db/test/isolation.test.ts`:

replace:
```ts
);

/**
 * Tables whose organization_id app_runtime may not update at all (column-level grants, migration
 * runtime_column_grants), which is stronger than row-level security, each with a column it may update instead. Fixed,
 * not read from the grants, so a mistaken REVOKE on another table still fails here.
 */
const organizationIdNotUpdatable: Record<string, string> = { role: "name" };
```
with:
```ts
);
```

replace:
```ts

    beforeAll(async () => {
      const createRow = orgTableFixtures[tableName];
      if (!createRow) throw new Error(`No fixture for ${tableName}`);
      await db.forOrg(orgA, createRow);
    });
```
with:
```ts

    const fixture = orgTableFixtures[tableName];
    const appendOnly = fixture?.appendOnly === true;
    // organization_id itself can't be updated on these tables (column-level grants), which is stronger than row-level
    // security: the update check then uses a column the runtime role may update.
    const organizationIdLocked = appendOnly || fixture?.updatableColumn !== undefined;

    beforeAll(async () => {
      if (!fixture) throw new Error(`No fixture for ${tableName}`);
      await db.forOrg(orgA, fixture.create);
    });
```

replace:
```ts
    it("cannot be updated by another organization", async () => {
      const column = Prisma.raw(quoteIdentifier(organizationIdNotUpdatable[tableName] ?? "organization_id"));
      expect(await db.forOrg(orgB, (tx) => tx.$executeRaw`UPDATE ${table} SET ${column} = ${column}`)).toBe(0);
    });
```
with:
```ts
    it("cannot be updated by another organization", async () => {
      const column = Prisma.raw(quoteIdentifier(fixture?.updatableColumn ?? "organization_id"));
      const updateAsOtherOrganization = db.forOrg(
        orgB,
        (tx) => tx.$executeRaw`UPDATE ${table} SET ${column} = ${column}`,
      );
      // An append-only table with no updatable column named gives app_runtime no UPDATE on organization_id at all.
      if (appendOnly && fixture.updatableColumn === undefined) {
        await expect(updateAsOtherOrganization).rejects.toThrow(/permission denied/i);
      } else {
        expect(await updateAsOtherOrganization).toBe(0);
      }
    });
```

replace:
```ts
    it("cannot be deleted by another organization", async () => {
      // Soft-delete tables give app_runtime no DELETE grant at all (ADR 0004), which is stronger than row-level security.
      // The list is fixed, not read from the grants, so a mistaken REVOKE on an ordinary table still fails here.
      const deleteAsOtherOrganization = db.forOrg(orgB, (tx) => tx.$executeRaw`DELETE FROM ${table}`);
      if (softDeleteTables.includes(tableName)) {
        await expect(deleteAsOtherOrganization).rejects.toThrow(/permission denied/i);
```
with:
```ts
    it("cannot be deleted by another organization", async () => {
      // Soft-delete and append-only tables give app_runtime no DELETE grant at all (ADR 0004), which is stronger than
      // row-level security. The lists are fixed, not read from the grants, so a mistaken REVOKE on an ordinary table
      // still fails here.
      const deleteAsOtherOrganization = db.forOrg(orgB, (tx) => tx.$executeRaw`DELETE FROM ${table}`);
      if (softDeleteTables.includes(tableName) || appendOnly) {
        await expect(deleteAsOtherOrganization).rejects.toThrow(/permission denied/i);
```

replace:
```ts
        db.forOrg(orgA, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = ${orgB}::uuid`),
      ).rejects.toThrow(tableName in organizationIdNotUpdatable ? /permission denied/ : /row-level security/);
    });
```
with:
```ts
        db.forOrg(orgA, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = ${orgB}::uuid`),
      ).rejects.toThrow(organizationIdLocked ? /permission denied/i : /row-level security/);
    });
```

`packages/db/test/outbox.test.ts`:
```ts
// The outbox table's own rules: well-formed event types and payloads, and events that can only be marked relayed.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("outbox table", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Outbox");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it('only accepts event types like "document.issued" and payloads that are JSON objects', async () => {
    const insert = (type: string, payload: unknown) =>
      db.forOrg(
        organizationId,
        (tx) => tx.$executeRaw`INSERT INTO outbox_event (id, type, payload)
        VALUES (gen_random_uuid(), ${type}, ${JSON.stringify(payload)}::jsonb)`,
      );
    expect(await insert("document.issued", { documentId: "d1" })).toBe(1);
    await expect(insert("DocumentIssued", {})).rejects.toThrow(/outbox_event_type_format/);
    await expect(insert("document", {})).rejects.toThrow(/outbox_event_type_format/);
    await expect(insert("document.issued", ["not", "an", "object"])).rejects.toThrow(/outbox_event_payload_object/);
  });

  it("lets the api and worker mark an event relayed, and change nothing else", async () => {
    const event = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.create({ data: { type: "document.issued", payload: { documentId: "d2" } } }),
    );
    const relayed = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.update({ where: { id: event.id }, data: { relayedAt: new Date() } }),
    );
    expect(relayed.relayedAt).toBeInstanceOf(Date);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.outboxEvent.update({ where: { id: event.id }, data: { payload: { documentId: "changed" } } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: FAIL. The isolation suite finds a fixture for `outbox_event` but no such table, and the outbox tests fail on
the missing table.

- [ ] **Step 2: Add the outbox table, and the organization's time zone and contact email**

In `packages/db/prisma/schema/organization.prisma`:

replace:
```prisma
  requireTwoFactor Boolean          @default(false) @map("require_two_factor")
  counters         OrgCounter[]
```
with:
```prisma
  requireTwoFactor Boolean          @default(false) @map("require_two_factor")
  /// The IANA time zone the organization works in. Times are stored in UTC and shown in this zone (spec 9.6).
  timeZone         String           @default("Asia/Kolkata") @map("time_zone")
  /// Where replies to email the product sends for this organization go (spec 9.4). Set at onboarding (plan 4).
  contactEmail     String?          @map("contact_email")
  counters         OrgCounter[]
```

replace:
```prisma
  rolePermissions  RolePermission[]
```
with:
```prisma
  rolePermissions  RolePermission[]
  outboxEvents     OutboxEvent[]
```

`packages/db/prisma/schema/jobs.prisma`:
```prisma
// Domain events (spec 9.1): written in the same transaction as the change they describe, then relayed to pg-boss by
// the worker. Organization-owned: row-level security applies (the migration calls app_enable_org_rls).

/// One domain event, such as "document.issued". The relay sets relayedAt once it has queued the event's listeners.
model OutboxEvent {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String       @id @default(uuid(7)) @db.Uuid
  /// "<entity>.<what happened>", e.g. "document.issued" (CHECK outbox_event_type_format).
  type           String
  /// A JSON object of ids and small facts the listeners need (CHECK outbox_event_payload_object).
  payload        Json
  occurredAt     DateTime     @default(now()) @map("occurred_at") @db.Timestamptz(6)
  /// When the relay queued this event's listeners; null until then. The only column the api and worker may change.
  relayedAt      DateTime?    @map("relayed_at") @db.Timestamptz(6)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  /// The relay's work list: each organization's events not yet relayed, oldest first (UUID v7 ids sort by time).
  @@index([organizationId, id], map: "outbox_event_unrelayed", where: { relayedAt: null })
  @@map("outbox_event")
}
```

Create the migration from the schema change alone, without a database: `git archive HEAD` still holds the schema
from before this step. Several tracks generate migrations at the same time later, so none may diff against a shared
local database, where one track's tables would look like drift to another.
```bash
cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261015090000_shared_contracts
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015090000_shared_contracts/migration.sql
pnpm generate
```
Expected: the generated part of the file below, down to the banner. Append the hand-written part, so the whole file
reads:

`packages/db/prisma/migrations/20261015090000_shared_contracts/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- CreateTable
CREATE TABLE "outbox_event" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relayed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_event_unrelayed" ON "outbox_event"("organization_id", "id") WHERE ("relayed_at" IS NULL);

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('outbox_event');

-- Event types read "<entity>.<what happened>", e.g. "document.issued"; a payload is a JSON object.
ALTER TABLE "outbox_event"
  ADD CONSTRAINT outbox_event_type_format CHECK (type ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT outbox_event_payload_object CHECK (jsonb_typeof(payload) = 'object');

-- An event is a fact: the api and worker may record that it was relayed, and change or delete nothing else.
REVOKE UPDATE, DELETE ON TABLE "outbox_event" FROM app_runtime;
GRANT UPDATE (relayed_at) ON TABLE "outbox_event" TO app_runtime;
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 107 tests pass, among them five isolation tests for `outbox_event` and the two outbox table tests. The
drift check in the global setup passes.

- [ ] **Step 3: Write the failing test for a transaction with no organization**

`packages/db/test/without-org.test.ts`:
```ts
// db.withoutOrg() reaches tables without organization_id and sees no organization's rows, as row-level security
// fails closed when no organization is set.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError, withoutOrg, WrongDatabaseRoleError } from "../src/for-org.js";
import { createPrismaClient } from "../src/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("db.withoutOrg", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Without organization");
    await db.forOrg(organizationId, (tx) => tx.orgCounter.create({ data: { key: "WITHOUT-2026", value: 1 } }));
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("sees no organization's rows, and can't write any", async () => {
    expect(await db.withoutOrg((tx) => tx.orgCounter.count())).toBe(0);
    await expect(db.withoutOrg((tx) => tx.orgCounter.create({ data: { key: "NONE-2026", value: 1 } }))).rejects.toThrow(
      /null value in column "organization_id"|row-level security/,
    );
  });

  it("reads the organizations table, which has no row-level security", async () => {
    const found = await db.withoutOrg(
      (tx) => tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organization WHERE id = ${organizationId}::uuid`,
    );
    expect(found[0]?.n).toBe(1);
  });

  it("can't be nested inside forOrg(), or forOrg() inside it", async () => {
    await expect(db.forOrg(organizationId, () => db.withoutOrg(() => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
    await expect(db.withoutOrg(() => db.forOrg(organizationId, () => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
  });

  it("refuses to run as a role that can see every organization", async () => {
    const platformClient = createPrismaClient(urls.platform, { max: 1 });
    try {
      await expect(withoutOrg(platformClient, () => Promise.resolve(1))).rejects.toBeInstanceOf(WrongDatabaseRoleError);
    } finally {
      await platformClient.$disconnect();
    }
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test test/without-org.test.ts`

Expected: FAIL: `../src/for-org.js` exports no `withoutOrg`.

- [ ] **Step 4: Add `db.withoutOrg()`**

In `packages/db/src/for-org.ts`:

replace:
```ts

/** Runs fn in one transaction that sees and changes only orgId's rows. Never call it inside another forOrg(). */
```
with:
```ts

/**
 * Runs fn in one transaction with no organization set, for the few tables without organization_id (webhook events,
 * rate-limit counters) and the database functions that look across organizations without revealing their rows.
 * Every organization table shows no rows and refuses writes, exactly as row-level security fails closed.
 */
export async function withoutOrg<T>(
  client: DatabaseClient,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, async () =>
    client.$transaction(async (tx) => {
      const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
      if (session?.role !== "app_runtime") {
        throw new WrongDatabaseRoleError(session?.role);
      }
      return fn(tx);
    }, options),
  );
}

/** Runs fn in one transaction that sees and changes only orgId's rows. Never call it inside another forOrg(). */
```

In `packages/db/src/database.ts`:

replace:
```ts
import { createPrismaClient } from "./client.js";
import { forOrg, type ForOrgOptions, type OrgTx } from "./for-org.js";
```
with:
```ts
import { createPrismaClient } from "./client.js";
import { forOrg, withoutOrg, type ForOrgOptions, type OrgTx } from "./for-org.js";
```

replace:
```ts
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
```
with:
```ts
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /**
   * Runs fn in one transaction with no organization: for tables without organization_id, such as webhook events and
   * rate-limit counters. Organization tables show no rows and refuse writes. Like forOrg(), it can't be nested.
   */
  withoutOrg<T>(fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
```

replace:
```ts
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    disconnect: () => client.$disconnect(),
```
with:
```ts
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    withoutOrg: (fn, options) => withoutOrg(client, fn, options),
    disconnect: () => client.$disconnect(),
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 111 tests pass.

- [ ] **Step 5: Write the failing identity tests: the actor, the permission, the organization profile**

In `packages/domain/test/identity/rule-helpers.ts`:

replace:
```ts
    organizationId: "organization-1",
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
```
with:
```ts
    organizationId: "organization-1",
    source: "web",
    impersonatedBy: null,
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
```

In `packages/domain/test/identity/access.test.ts`:

replace:
```ts
    expect(access?.permissions.missing([...permissions])).toEqual([]);
  });
```
with:
```ts
    expect(access?.permissions.missing([...permissions])).toEqual([]);
  });

  it("says where the access comes from: the web app, or support impersonating the member", async () => {
    expect(await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId)).toMatchObject({
      userId: agency.ownerUserId,
      source: "web",
      impersonatedBy: null,
    });
    const supportUserId = "0199c3a2-0000-7000-8000-00000000000a";
    const impersonated = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId, {
      impersonatedBy: supportUserId,
    });
    expect(impersonated).toMatchObject({
      userId: agency.ownerUserId,
      source: "impersonation",
      impersonatedBy: supportUserId,
    });
  });
```

In `packages/domain/test/identity/permissions.test.ts`:

replace:
```ts
  it("covers the Foundation and every Phase 1 module", () => {
    for (const permission of ["staff:manage", "roles:manage", "settings:manage", "audit:view", "money:view_margin"]) {
      expect(isPermission(permission)).toBe(true);
```
with:
```ts
  it("covers the Foundation and every Phase 1 module", () => {
    for (const permission of [
      "staff:manage",
      "roles:manage",
      "settings:manage",
      "audit:view",
      "money:view_margin",
      "documents:view_sensitive",
    ]) {
      expect(isPermission(permission)).toBe(true);
```

replace:
```ts
        "money",
        "leads",
```
with:
```ts
        "money",
        "documents",
        "leads",
```

In `packages/domain/test/identity/starter-roles.test.ts`:

replace:
```ts

  it("show margins to Accounts, but not to Operations", () => {
```
with:
```ts

  it("show travellers' ID documents to Operations, but not to Sales or Accounts", () => {
    expect(roleNamed("Operations").has("documents:view_sensitive")).toBe(true);
    expect(roleNamed("Admin").has("documents:view_sensitive")).toBe(true);
    expect(roleNamed("Sales").has("documents:view_sensitive")).toBe(false);
    expect(roleNamed("Accounts").has("documents:view_sensitive")).toBe(false);
  });

  it("show margins to Accounts, but not to Operations", () => {
```

`packages/domain/test/identity/organization-profile.test.ts`:
```ts
// Other modules learn about an organization and its people only through these: the profile, and members' contacts
// with placeholder addresses hidden and people who left or belong elsewhere left out.
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("organization profile and member contacts", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("gives the organization's name, code, time zone and contact email", async () => {
    expect(await test.identity.organizationProfile(agency.organizationId)).toEqual({
      id: agency.organizationId,
      name: "Test agency",
      code: agency.code,
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    await platform.organization.update({
      where: { id: agency.organizationId },
      data: { timeZone: "Asia/Dubai", contactEmail: "hello@agency.example" },
    });
    expect(await test.identity.organizationProfile(agency.organizationId)).toMatchObject({
      timeZone: "Asia/Dubai",
      contactEmail: "hello@agency.example",
    });
    expect(await test.identity.organizationProfile("0199e7a0-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("gives active members' contacts, with no placeholder email and nobody from elsewhere", async () => {
    const withoutEmail = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      password: "ravi-password-1",
      mustChangePassword: false,
    });
    const leaver = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Leaver",
      email: "leaver@agency.example",
      roleKey: "sales",
      password: "leaver-password-1",
      mustChangePassword: false,
    });
    await test.database.client.member.update({ where: { id: leaver.memberId }, data: softDeleted(agency.ownerUserId) });
    const other = await createTestAgency(test.identity, platform);

    const contacts = await test.identity.memberContacts(agency.organizationId, [
      agency.ownerUserId,
      withoutEmail.userId,
      leaver.userId,
      other.ownerUserId,
    ]);
    expect(contacts).toEqual([
      { userId: agency.ownerUserId, name: "Asha Owner", email: agency.ownerEmail },
      { userId: withoutEmail.userId, name: "Ravi", email: null },
    ]);
    expect(await test.identity.memberContacts(agency.organizationId, [])).toEqual([]);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test test/identity`

Expected: FAIL. "says where the access comes from" finds no `source` or `impersonatedBy`; the catalog has no
`documents:view_sensitive`; Operations doesn't hold it; `organizationProfile` is not a function.

- [ ] **Step 6: Add the actor, carry impersonation on member access, add the permission and the profile**

`packages/domain/src/kernel/actor.ts`:
```ts
// Who is doing something in an organization, as every module and the audit log see it (spec 9.5).

/** Where an action came from: the web app, an API client (later), the worker, or support impersonating a user. */
export type ActorSource = "web" | "api" | "job" | "impersonation";

export interface Actor {
  readonly organizationId: string;
  /** The person acting, or null for the system: a job no person started. */
  readonly userId: string | null;
  readonly source: ActorSource;
  /** The platform admin's user id while support impersonates userId (source "impersonation"), else null. */
  readonly impersonatedBy: string | null;
}

/** The worker acting on its own, in one organization. */
export function systemActor(organizationId: string): Actor {
  return { organizationId, userId: null, source: "job", impersonatedBy: null };
}
```

In `packages/domain/src/kernel/index.ts`:

replace:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { DomainError, type DomainErrorCode } from "./errors.js";
```
with:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
```

In `packages/domain/src/identity/member-access.ts`:

replace:
```ts
import type { PendingStep } from "@travel-crm/contracts/identity";
import type { PermissionSet } from "./permission-set.js";

export interface MemberAccess {
  readonly userId: string;
```
with:
```ts
import type { PendingStep } from "@travel-crm/contracts/identity";
import type { Actor } from "../kernel/index.js";
import type { PermissionSet } from "./permission-set.js";

/** A member acting in their organization. As an Actor it says where the request came from, for the audit log. */
export interface MemberAccess extends Actor {
  readonly userId: string;
```

In `packages/domain/src/identity/access.ts`:

replace:
```ts

/** The user's active membership, role and permissions in an organization, or null when they have none there. */
export async function resolveAccess(
```
with:
```ts

/** What the session says about who is really acting. */
export interface AccessSession {
  /** The platform admin's user id while support impersonates the user, else null. */
  impersonatedBy: string | null;
}

/**
 * The user's active membership, role and permissions in an organization, or null when they have none there. The
 * session marks support's impersonation, so the audit log can record who was really acting.
 */
export async function resolveAccess(
```

replace:
```ts
  organizationId: string,
): Promise<MemberAccess | null> {
```
with:
```ts
  organizationId: string,
  session: AccessSession = { impersonatedBy: null },
): Promise<MemberAccess | null> {
```

replace:
```ts
      organizationId,
      role: { key: member.role, name: role?.name ?? member.role, isOwner: role?.isOwner ?? false },
```
with:
```ts
      organizationId,
      source: session.impersonatedBy ? "impersonation" : "web",
      impersonatedBy: session.impersonatedBy,
      role: { key: member.role, name: role?.name ?? member.role, isOwner: role?.isOwner ?? false },
```

`packages/domain/src/identity/organization-profile.ts`:
```ts
// What other modules may know about an organization and its people. Only the identity module reads the sign-in
// tables (spec 4), so notifications, documents and the worker ask here.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { shownEmail } from "./sign-in-names.js";

export interface OrganizationProfile {
  id: string;
  name: string;
  code: string;
  /** An IANA time zone such as "Asia/Kolkata": times are shown, and days counted, in it. */
  timeZone: string;
  /** Where replies to email sent for the organization go; null until onboarding sets it. */
  contactEmail: string | null;
}

/** A member as notifications need them. */
export interface MemberContact {
  userId: string;
  name: string;
  /** Null for staff without email: their placeholder address is never emailed. */
  email: string | null;
}

export async function organizationProfile(
  database: IdentityDatabase,
  organizationId: string,
): Promise<OrganizationProfile | null> {
  return database.client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, code: true, timeZone: true, contactEmail: true },
  });
}

/**
 * The organization's active members among userIds. Anyone else (removed, or in another organization) is left out,
 * so nobody is notified about an organization they have left.
 */
export async function memberContacts(
  database: IdentityDatabase,
  organizationId: string,
  userIds: readonly string[],
): Promise<MemberContact[]> {
  if (userIds.length === 0) return [];
  // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
  const members = await database.client.member.findMany({
    where: { organizationId, userId: { in: [...userIds] } },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
    email: shownEmail(member.user.email),
  }));
}
```

In `packages/domain/src/identity/identity.ts`:

replace:
```ts
import { createIdentityDatabase } from "@travel-crm/db/identity";
import { describeSignedInPerson, isPlatformAdmin, resolveAccess, type SignedInSession } from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
```
with:
```ts
import { createIdentityDatabase } from "@travel-crm/db/identity";
import {
  describeSignedInPerson,
  isPlatformAdmin,
  resolveAccess,
  type AccessSession,
  type SignedInSession,
} from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import {
  memberContacts,
  organizationProfile,
  type MemberContact,
  type OrganizationProfile,
} from "./organization-profile.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
```

replace:
```ts
  readonly auth: Auth;
  /** The user's membership, role and permissions in the organization, or null when they are not an active member. */
  resolveAccess(userId: string, organizationId: string): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** True for platform staff: user role "admin" (read from the database) and no membership. */
```
with:
```ts
  readonly auth: Auth;
  /**
   * The user's membership, role and permissions in the organization, or null when they are not an active member.
   * Pass the session's impersonatedBy so actions during support's impersonation are recorded as such.
   */
  resolveAccess(userId: string, organizationId: string, session?: AccessSession): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** The organization's name, code, time zone and contact email, for modules that can't read it themselves. */
  organizationProfile(organizationId: string): Promise<OrganizationProfile | null>;
  /** Names and real email addresses of the organization's active members among userIds, for notifications. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** True for platform staff: user role "admin" (read from the database) and no membership. */
```

replace:
```ts
    auth,
    resolveAccess: (userId, organizationId) => resolveAccess(database, userId, organizationId),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
```
with:
```ts
    auth,
    resolveAccess: (userId, organizationId, session) => resolveAccess(database, userId, organizationId, session),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    organizationProfile: (organizationId) => organizationProfile(database, organizationId),
    memberContacts: (organizationId, userIds) => memberContacts(database, organizationId, userIds),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export type { RoleFacts } from "./access-rules.js";
export type { SignedInSession } from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
```
with:
```ts
export type { RoleFacts } from "./access-rules.js";
export type { AccessSession, SignedInSession } from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
```

replace:
```ts
export { pendingStep, type MemberAccess } from "./member-access.js";
export { PermissionSet, type Grant } from "./permission-set.js";
```
with:
```ts
export { pendingStep, type MemberAccess } from "./member-access.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export { PermissionSet, type Grant } from "./permission-set.js";
```

In `packages/domain/src/identity/permissions.ts`:

replace:
```ts
  "money:view_margin",
  // Business modules, listed now so the starter roles are complete from the first organization
```
with:
```ts
  "money:view_margin",
  // Traveller ID documents such as passports and Aadhaar (spec 5): files marked sensitive
  "documents:view_sensitive",
  // Business modules, listed now so the starter roles are complete from the first organization
```

In `packages/domain/src/identity/starter-roles.ts`:

replace:
```ts
  {
    // Delivers confirmed trips: every booking, departures and suppliers. No leads, no margins.
    key: "operations",
```
with:
```ts
  {
    // Delivers confirmed trips: every booking, departures and suppliers, and the travellers' ID documents they need.
    // No leads, no margins.
    key: "operations",
```

replace:
```ts
      allow("suppliers:edit"),
    ],
```
with:
```ts
      allow("suppliers:edit"),
      allow("documents:view_sensitive"),
    ],
```

In `packages/api/src/procedures.ts`:

replace:
```ts
  identity: Identity;
  session: { activeOrganizationId?: string | null | undefined };
  user: { id: string };
```
with:
```ts
  identity: Identity;
  session: { activeOrganizationId?: string | null | undefined; impersonatedBy?: string | null | undefined };
  user: { id: string };
```

replace:
```ts
 * here; the endpoints they need for it (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 */
```
with:
```ts
 * here; the endpoints they need for it (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 * The session's impersonatedBy goes with the access, so whatever support does while impersonating is recorded as such.
 */
```

replace:
```ts
  const organizationId = ctx.session.activeOrganizationId;
  const access = organizationId ? await ctx.identity.resolveAccess(ctx.user.id, organizationId) : null;
  if (!access) throw new DomainError("FORBIDDEN", "NOT_A_MEMBER", "You are not a member of an organization");
```
with:
```ts
  const organizationId = ctx.session.activeOrganizationId;
  const session = { impersonatedBy: ctx.session.impersonatedBy ?? null };
  const access = organizationId ? await ctx.identity.resolveAccess(ctx.user.id, organizationId, session) : null;
  if (!access) throw new DomainError("FORBIDDEN", "NOT_A_MEMBER", "You are not a member of an organization");
```

In `docs/adr/0005-roles-and-permissions.md`:

replace:
```markdown

| Role       | Key          | Allows                                                                                                                                                                                                                                         |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | `org-owner`  | Everything, always, including permissions added later                                                                                                                                                                                          |
| Admin      | `org-admin`  | Everything except `roles:manage`: staff, settings, audit log, margins, and every module over all records. Settings: an Admin may switch the two-factor requirement on, but only an Owner switches it off (spec 6.2: "an owner can require" it) |
| Sales      | `sales`      | Leads (own records): view, create, edit. Quotes (own): view, create, edit. Bookings (own): view, create. Departures and suppliers: view                                                                                                        |
| Operations | `operations` | Quotes and bookings (all records): view; bookings: edit. Departures and suppliers: view, create, edit                                                                                                                                          |
| Accounts   | `accounts`   | Accounts: view, create, edit. Margins. Quotes and bookings (all records): view. Suppliers: view                                                                                                                                                |
```
with:
```markdown

| Role       | Key          | Allows                                                                                                                                                                                                                                                              |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | `org-owner`  | Everything, always, including permissions added later                                                                                                                                                                                                               |
| Admin      | `org-admin`  | Everything except `roles:manage`: staff, settings, audit log, margins, sensitive documents, and every module over all records. Settings: an Admin may switch the two-factor requirement on, but only an Owner switches it off (spec 6.2: "an owner can require" it) |
| Sales      | `sales`      | Leads (own records): view, create, edit. Quotes (own): view, create, edit. Bookings (own): view, create. Departures and suppliers: view                                                                                                                             |
| Operations | `operations` | Quotes and bookings (all records): view; bookings: edit. Departures and suppliers: view, create, edit. Sensitive documents: view                                                                                                                                    |
| Accounts   | `accounts`   | Accounts: view, create, edit. Margins. Quotes and bookings (all records): view. Suppliers: view                                                                                                                                                                     |
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test test/identity`

Expected: the identity tests pass (115).

- [ ] **Step 7: Write the failing tests for events and listeners**

`packages/domain/test/jobs/publish-event.test.ts`:
```ts
// publishEvent writes the event in the caller's transaction: it exists exactly when the change commits, and only its
// own organization can see it.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent } from "../../src/jobs/index.js";

describe("publishEvent", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let otherOrganizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Events");
    otherOrganizationId = await createTestOrganization(platform, "Other events");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("records the event in the organization of the transaction, unrelayed", async () => {
    const id = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "d1", pages: 2 } }),
    );
    const event = await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }));
    expect(event).toMatchObject({
      organizationId,
      type: "document.issued",
      payload: { documentId: "d1", pages: 2 },
      relayedAt: null,
    });
    expect(await db.forOrg(otherOrganizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }))).toBeNull();
  });

  it("leaves no event when the change's transaction rolls back", async () => {
    let id = "";
    await expect(
      db.forOrg(organizationId, async (tx) => {
        id = await publishEvent(tx, { type: "document.issued", payload: { documentId: "d2" } });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }))).toBeNull();
  });

  it("refuses an event type that is not <entity>.<what happened>, before writing", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => publishEvent(tx, { type: "DocumentIssued", payload: {} })),
    ).rejects.toThrow(/Event types look like/);
  });
});
```

`packages/domain/test/jobs/define-listener.test.ts`:
```ts
// defineListener checks a payload before the handler sees it, so a malformed event fails instead of half-running.
import { describe, expect, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { defineListener, type DomainEvent, type ListenerContext } from "../../src/jobs/index.js";

/** A stand-in for a Zod schema: accepts { documentId: string } only. */
const documentIssued = {
  parse(value: unknown): { documentId: string } {
    if (typeof value === "object" && value !== null && "documentId" in value && typeof value.documentId === "string") {
      return { documentId: value.documentId };
    }
    throw new Error("Not a document.issued payload");
  },
};

const event = (payload: DomainEvent["payload"]): DomainEvent => ({
  id: "0199e7a0-0000-7000-8000-000000000001",
  organizationId: "0199e7a0-0000-7000-8000-0000000000aa",
  type: "document.issued",
  payload,
  occurredAt: new Date(),
});

const context: ListenerContext = {
  actor: systemActor("0199e7a0-0000-7000-8000-0000000000aa"),
  forOrg: () => Promise.reject(new Error("not used here")),
};

describe("defineListener", () => {
  it("hands the handler a checked, typed payload", async () => {
    const seen: string[] = [];
    const listener = defineListener({
      name: "documents.render-pdf",
      eventType: "document.issued",
      payload: documentIssued,
      handle: (issued) => {
        seen.push(issued.payload.documentId);
        return Promise.resolve();
      },
    });
    await listener.handle(event({ documentId: "d1" }), context);
    expect(seen).toEqual(["d1"]);
    expect(listener).toMatchObject({ name: "documents.render-pdf", eventType: "document.issued" });
  });

  it("fails on a malformed payload without running the handler", async () => {
    let ran = false;
    const listener = defineListener({
      name: "documents.render-pdf",
      eventType: "document.issued",
      payload: documentIssued,
      handle: () => {
        ran = true;
        return Promise.resolve();
      },
    });
    await expect(listener.handle(event({ document: 1 }), context)).rejects.toThrow("Not a document.issued payload");
    expect(ran).toBe(false);
  });

  it("refuses an event type that is not <entity>.<what happened>", () => {
    expect(() =>
      defineListener({ name: "x.y", eventType: "issued", payload: documentIssued, handle: () => Promise.resolve() }),
    ).toThrow(/Event types look like/);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test test/jobs`

Expected: FAIL: `../../src/jobs/index.js` does not exist.

- [ ] **Step 8: Write the jobs module's event contract**

`packages/domain/src/jobs/events.ts`:
```ts
// Domain events and their listeners (spec 9.1): the contract between the modules that publish events and the worker
// that runs listeners. Calls go down the layers; events go up through the outbox (spec 8).
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";

/** A JSON value, as an event payload holds it. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Ids and small facts a listener needs. Listeners read anything else themselves, inside db.forOrg(). */
export type EventPayload = Readonly<Record<string, JsonValue>>;

/** Something that happened in one organization, such as "document.issued". */
export interface DomainEvent<Payload = EventPayload> {
  readonly id: string;
  readonly organizationId: string;
  readonly type: string;
  readonly payload: Payload;
  readonly occurredAt: Date;
}

/** What a listener gets besides the event. The worker builds it for the event's organization. */
export interface ListenerContext {
  /** The worker acting in the event's organization (source "job"), for the audit log. */
  readonly actor: Actor;
  /**
   * Runs fn in one transaction in the event's organization. Keep slow work (rendering, uploading, sending) outside
   * it: a transaction holds a database connection while it runs.
   */
  forOrg<T>(fn: (tx: OrgTx) => Promise<T>): Promise<T>;
}

/**
 * Reacts to one type of event. The worker runs it once per event: listeners are keyed by event id (spec 9.1), and a
 * failed run is retried with backoff. Work outside the database (an email, an upload) may still repeat after a crash,
 * so make it safe to repeat.
 */
export interface EventListener {
  /** Unique, and the name of the listener's job queue: "<module>.<what it does>", e.g. "documents.render-pdf". */
  readonly name: string;
  readonly eventType: string;
  handle(event: DomainEvent, context: ListenerContext): Promise<void>;
}

/** Anything that checks an unknown value and returns it typed, such as a Zod schema from @travel-crm/contracts. */
export interface PayloadSchema<Payload> {
  parse(value: unknown): Payload;
}

/** "<entity>.<what happened>", e.g. "document.issued". The outbox table checks the same pattern. */
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export function assertEventType(type: string): void {
  if (!EVENT_TYPE_PATTERN.test(type)) {
    throw new RangeError(`Event types look like "document.issued", got ${JSON.stringify(type)}`);
  }
}

/** A listener whose handler gets the payload checked and typed by `payload`, which throws on a malformed one. */
export function defineListener<Payload>(definition: {
  name: string;
  eventType: string;
  payload: PayloadSchema<Payload>;
  handle(event: DomainEvent<Payload>, context: ListenerContext): Promise<void>;
}): EventListener {
  assertEventType(definition.eventType);
  return {
    name: definition.name,
    eventType: definition.eventType,
    // async, so a malformed payload rejects like any other failure instead of throwing at the caller.
    handle: async (event, context) => {
      await definition.handle({ ...event, payload: definition.payload.parse(event.payload) }, context);
    },
  };
}
```

`packages/domain/src/jobs/publish-event.ts`:
```ts
// Writes a domain event to the outbox, in the caller's transaction: the event exists exactly when the change does.
import type { OrgTx } from "@travel-crm/db";
import { assertEventType, type EventPayload } from "./events.js";

/**
 * Records that something happened, in the same transaction as the change (spec 9.1). The worker's relay queues the
 * event's listeners after the transaction commits; if it rolls back, the event never existed. Returns the event's id.
 */
export async function publishEvent(tx: OrgTx, event: { type: string; payload: EventPayload }): Promise<string> {
  assertEventType(event.type);
  // organization_id is omitted on purpose: it defaults to the transaction's organization.
  const created = await tx.outboxEvent.create({
    data: { type: event.type, payload: event.payload },
    select: { id: true },
  });
  return created.id;
}
```

`packages/domain/src/jobs/index.ts`:
```ts
// Public API of the jobs module: publishing domain events and defining their listeners (spec 9.1).
export {
  assertEventType,
  defineListener,
  type DomainEvent,
  type EventListener,
  type EventPayload,
  type JsonValue,
  type ListenerContext,
  type PayloadSchema,
} from "./events.js";
export { publishEvent } from "./publish-event.js";
```

`packages/domain/src/jobs/README.md`:
```markdown
# jobs

Domain events and the work the worker does after a change commits (spec 9.1).

## Public functions and values (`index.ts`)

- `publishEvent(tx, { type, payload })`: writes an event to the outbox inside the change's own transaction and returns
  its id. The event exists exactly when the change commits.
- `defineListener({ name, eventType, payload, handle })`: a listener whose handler gets the payload checked by
  `payload` (a Zod schema from `@travel-crm/contracts`). `name` is also its job queue, e.g. `documents.render-pdf`.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`.

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run at least once and are keyed by event id. Make any work outside the database (an email, an upload)
  safe to repeat.
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
```

`defineListener`'s wrapper is `async` on purpose: a payload that fails its schema must reject like any other
failure, not throw before the caller holds a promise.

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: 121 tests pass.

- [ ] **Step 9: Give plain HTTP routes the same status for a domain error**

In `packages/api/test/errors.test.ts`:

replace:
```ts
import { describe, expect, it } from "vitest";
import { errorDetails, publicMessage, toTrpcError } from "../src/errors.js";
```
with:
```ts
import { describe, expect, it } from "vitest";
import { domainErrorResponse, errorDetails, publicMessage, toTrpcError } from "../src/errors.js";
```

replace:
```ts

  it("passes the domain code and reason to the client", () => {
```
with:
```ts

  it("answers plain HTTP routes with the same status, and the code and reason as JSON", async () => {
    const statuses = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      CONFLICT: 409,
      LIMIT_REACHED: 403,
      FEATURE_LOCKED: 403,
      VALIDATION: 400,
    } as const;
    for (const [domainCode, status] of Object.entries(statuses)) {
      const response = domainErrorResponse(new DomainError(domainCode as keyof typeof statuses, "REASON", "message"));
      expect(response.status).toBe(status);
    }
    const expired = domainErrorResponse(new DomainError("NOT_FOUND", "LINK_EXPIRED", "This link has expired"));
    expect(await expired.json()).toEqual({
      code: "NOT_FOUND",
      reason: "LINK_EXPIRED",
      message: "This link has expired",
    });
  });

  it("passes the domain code and reason to the client", () => {
```

In `packages/api/src/errors.ts`:

replace:
```ts
};
```
with:
```ts
};

/** The HTTP status of each domain error code, for routes outside tRPC (share links, webhooks). Same as tRPC's. */
const httpStatusOf: Record<DomainErrorCode, 400 | 403 | 404 | 409> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  LIMIT_REACHED: 403,
  FEATURE_LOCKED: 403,
  VALIDATION: 400,
};

/** The response a plain HTTP route sends for a domain error: its status, and the code and reason to translate. */
export function domainErrorResponse(error: DomainError): Response {
  return Response.json(
    { code: error.code, reason: error.reason, message: error.message },
    { status: httpStatusOf[error.code] },
  );
}
```

In `packages/api/src/index.ts`:

replace:
```ts
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
```
with:
```ts
export { createContext, type ApiDependencies, type Context } from "./context.js";
export { domainErrorResponse, type ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api test` first with only the test changed (FAIL: no export
`domainErrorResponse`), then with the code: 5 tests pass.

- [ ] **Step 10: Record the decisions**

`docs/adr/0009-actors-and-domain-events.md`:
```markdown
# 0009: Actors, domain events and the outbox

Date: 2026-10-15 · Status: accepted · Implements spec sections 8, 9.1 and 9.5

## Decision

- **An `Actor` says who is acting**: `organizationId`, `userId` (null for the system), `source` (`web`, `api`, `job`
  or `impersonation`) and `impersonatedBy`. It lives in the kernel. `MemberAccess` is an `Actor`: the API passes the
  session's `impersonatedBy` to `resolveAccess`, so anything support does while impersonating a member carries
  `source: "impersonation"` and the admin's id. The worker acts as `systemActor(organizationId)`.
- **Domain events go through an outbox.** `publishEvent(tx, { type, payload })` (`@travel-crm/domain/jobs`) writes an
  `outbox_event` row in the change's own transaction. The worker's relay queues each event's listeners after the
  commit. Event types read `<entity>.<what happened>`; payloads are JSON objects of ids and small facts, checked by
  the table (`outbox_event_type_format`, `outbox_event_payload_object`).
- **Listeners** are `EventListener`s, built with `defineListener`, which checks the payload with a Zod schema before
  the handler runs. A listener's name is its job queue. The worker gives it a `ListenerContext`: the system actor and
  a `forOrg` bound to the event's organization.
- **Events are facts.** The api and worker may set `outbox_event.relayed_at` and nothing else, and may not delete
  events (column-level grant). The isolation suite knows such tables as append-only.
- **Other modules ask identity about people and organizations**: `organizationProfile(organizationId)` (name, code,
  `time_zone`, `contact_email`) and `memberContacts(organizationId, userIds)` (names and real email addresses of
  active members). They can't read the sign-in tables themselves (spec 4).
- **Each organization has a time zone** (`organization.time_zone`, default `Asia/Kolkata`) and a contact email
  (`organization.contact_email`, set at onboarding in plan 4).

## Context

- **Why an outbox and not a job sent straight from the request.** pg-boss's tables are outside our transaction, so a
  job sent from a request could exist without the change (rolled back) or the change without the job (a crash before
  sending). The outbox row commits or rolls back with the change.
- **Why ids in payloads.** Listeners read records inside `forOrg`, under row-level security, and an event's payload
  outlives the record's later edits; ids keep the listener working from the current state.
- **Why isolation fixtures moved to one file per module.** Plan 3 builds modules in parallel tracks; one shared
  fixture file would collide on every merge. `packages/db/test/org-table-fixtures/<module>.ts` files are gathered at
  load time, and the suite still fails for any organization table without a fixture.

## Consequences

- A listener runs at least once. It is keyed by event id, but work outside the database (an email, an upload) can
  repeat after a crash between doing it and recording it, so it must be safe to repeat.
- Old outbox rows are never deleted by the app. A retention purge, if needed, runs as the platform role.
```

In `docs/adr/README.md`:

replace:
```markdown

| #                                      | Decision                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)              | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)     | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md) | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)            | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)  | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)  | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
| [0007](0007-removing-staff.md)         | Removing staff: soft-deleted membership, released email, sessions ended                 |
| [0008](0008-ports-and-adapters.md)     | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package      |
```
with:
```markdown

| #                                        | Decision                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)                | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)       | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md)   | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)              | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)    | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)    | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
| [0007](0007-removing-staff.md)           | Removing staff: soft-deleted membership, released email, sessions ended                 |
| [0008](0008-ports-and-adapters.md)       | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package      |
| [0009](0009-actors-and-domain-events.md) | Actors, domain events and the outbox; what other modules may ask identity               |
```

In `CLAUDE.md`:

replace:
```markdown
- Every table with an `organization_id` column needs, in the migration that creates it:
  `SELECT app_enable_org_rls('<table_name>');`, plus a row-creating entry in `packages/db/test/org-table-fixtures.ts`.
  The test suite fails without both. See `packages/db/README.md` for the full recipe.
- Never call `forOrg()` inside another `forOrg()` (it throws `NestedForOrgError`): pass the outer `tx` down.
- A foreign key between two organization tables includes `organization_id`, and so does every unique constraint on an
```
with:
```markdown
- Every table with an `organization_id` column needs, in the migration that creates it:
  `SELECT app_enable_org_rls('<table_name>');`, plus a row-creating fixture in your module's file in
  `packages/db/test/org-table-fixtures/` (mark it `appendOnly` if the runtime role can't update or delete its rows).
  The test suite fails without both. See `packages/db/README.md` for the full recipe.
- Never call `forOrg()` inside another `forOrg()` (it throws `NestedForOrgError`): pass the outer `tx` down.
- Tables without `organization_id` (webhook events, rate-limit counters) are reached with `db.withoutOrg(tx => …)`,
  where every organization table shows no rows.
- A foreign key between two organization tables includes `organization_id`, and so does every unique constraint on an
```

replace:
```markdown
- IDs are UUID v7 (`@default(uuid(7)) @db.Uuid`). Money is never a float.
```
with:
```markdown
- IDs are UUID v7 (`@default(uuid(7)) @db.Uuid`). Money is never a float.
- Domain events (ADR 0009): `publishEvent(tx, { type, payload })` from `@travel-crm/domain/jobs`, in the same
  transaction as the change. Types read `<entity>.<what happened>`; payloads hold ids, never personal data.
  Listeners are built with `defineListener` and must be safe to run twice.
- Other modules never read the sign-in tables: they ask identity (`organizationProfile`, `memberContacts`).
```

replace:
```markdown
- Domain modules are folders in `packages/domain/src`. Their public API is `index.ts`; other modules import only that.
  Business rule failures throw `DomainError` from `@travel-crm/domain/kernel`, which the API turns into an HTTP status.
- Over HTTP, tRPC requests and `/api/auth/sign-in/org`, other than GET/HEAD, must name a trusted origin and
```
with:
```markdown
- Domain modules are folders in `packages/domain/src`. Their public API is `index.ts`; other modules import only that.
  Business rule failures throw `DomainError` from `@travel-crm/domain/kernel`, which the API turns into an HTTP status
  (`domainErrorResponse` from `@travel-crm/api` does the same for plain HTTP routes).
- Over HTTP, tRPC requests and `/api/auth/sign-in/org`, other than GET/HEAD, must name a trusted origin and
```

replace:
```markdown
  needs https, rate limiting and a strong secret; local development sets `NODE_ENV=development` (`.env.example` does).
```
with:
```markdown
  needs https, rate limiting and a strong secret; local development sets `NODE_ENV=development` (`.env.example` does).
- Whoever acts is an `Actor` (kernel): `MemberAccess` in requests, `systemActor(organizationId)` in the worker. Its
  `source` and `impersonatedBy` say whether support is impersonating the member.
```

In `packages/db/README.md`:

replace:
```markdown
  on a second connection that can't see the outer one's writes. Pass the outer `tx` down instead.
```
with:
```markdown
  on a second connection that can't see the outer one's writes. Pass the outer `tx` down instead.
- `db.withoutOrg(fn)` runs a transaction with no organization, for the few tables without `organization_id` (webhook
  events, rate-limit counters) and database functions that look across organizations without revealing rows.
  Organization tables show no rows and refuse writes in it. It can't be nested either.
```

replace:
```markdown
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.
```
with:
```markdown
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating fixture for the table to your module's file in `test/org-table-fixtures/` (one file per module,
   gathered by `test/org-table-fixtures.ts`). Mark it `appendOnly: true` when the runtime role can't update or delete
   the table's rows (like `outbox_event`): the suite then expects those statements to be refused outright.
6. `pnpm check`. The isolation suite now covers the new table.
```

In `packages/domain/README.md`:

replace:
```markdown
| ---------- | ------------------------------------------------------------------------------------- |
| `kernel`   | building blocks every module uses: `DomainError`                                      |
| `identity` | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md)) |
```
with:
```markdown
| ---------- | ------------------------------------------------------------------------------------- |
| `kernel`   | building blocks every module uses: `Actor`, `DomainError`                             |
| `identity` | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md)) |
| `jobs`     | domain events, the outbox and listeners ([README](src/jobs/README.md))                |
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId)`: the member's role, permissions and pending steps, or null;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `staff.list / create / updateRole / resetPassword / remove`;
```
with:
```markdown
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId, session?)`: the member's role, permissions and pending steps, or null.
    Pass the session's `impersonatedBy`: the access is an `Actor` whose `source` is then `impersonation`;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `organizationProfile(organizationId)` and `memberContacts(organizationId, userIds)`: what other modules may know
    about an organization and its people (they can't read the sign-in tables);
  - `staff.list / create / updateRole / resetPassword / remove`;
```

In `.github/pull_request_template.md`:

replace:
```markdown
- [ ] `pnpm check` is green
- [ ] New table with `organization_id`? Its migration calls `app_enable_org_rls`, and it has an entry in `packages/db/test/org-table-fixtures.ts`
- [ ] A decision others will ask "why?" about has an ADR in `docs/adr/`
```
with:
```markdown
- [ ] `pnpm check` is green
- [ ] New table with `organization_id`? Its migration calls `app_enable_org_rls`, and it has a fixture in `packages/db/test/org-table-fixtures/`
- [ ] A decision others will ask "why?" about has an ADR in `docs/adr/`
```

- [ ] **Step 11: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 18, db 111, domain 121, eslint-config 65,
integrations 6 (401 in all).

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain packages/db packages/api docs/adr CLAUDE.md .github/pull_request_template.md
git commit -m "feat: add the shared contracts: actors, domain events and the outbox, organization profile"
```

Every track branches from this commit.

---

## The tracks

Each track below starts from Task 0.2's commit in its own worktree (see Running the tracks), and the tracks run
at the same time. Their sections are self-contained: each gives its own paths, counts and commits.

## Track J: Jobs (spec 9.1)

Delivers pg-boss in Postgres behind the job ports, the outbox relay, listeners that run once per event in their
organization, scheduled jobs in a time zone, and `startWorker`, which the Integration task's `worker` command runs.
Branch `foundation/03-jobs`, worktree `/Users/ak/personal/travel-crm-03-jobs`, from `foundation/03-shared-services`
after Task 0.2. Depends on Task 0 only; owns migrations `20261015100000`, `20261015100100` and `20261015100200`.

Test counts before this track (Task 0.2): api-server=72 api=5 brand=3 contracts=18 db=111 domain=121 eslint-config=65
integrations=6.

---

### Task J1: pg-boss in Postgres, behind the job queue and runner ports

pg-boss keeps its queues in its own `pgboss` schema. Our migration creates that schema from pg-boss's own
construction SQL, and the api and worker run pg-boss as `app_runtime` with `migrate: false`, so they never need the
migrator's credentials (spec 12.3). `createPgBossJobs` implements Task 0's `JobQueue` and a new `JobRunner` port
(work, schedule, unschedule), creates queues on first use with the retry policy (5 retries, exponential backoff from
10 seconds, at most an hour apart), and lists failed jobs for the platform console (plan 4). An in-memory runner lets
the domain's worker be tested without pg-boss.

**Files:**
- Create: `packages/db/prisma/migrations/20261015100000_pgboss/migration.sql`
- Create: `packages/integrations/src/jobs/retry-policy.ts`, `job-runner.ts`, `memory-job-runner.ts`, `pg-boss-jobs.ts`
- Modify: `packages/integrations/src/jobs/index.ts`
- Test: `packages/integrations/test/jobs/memory-job-runner.test.ts`, `packages/integrations/test/jobs/pg-boss-jobs.test.ts`

**Interfaces:**
- Consumes (Task 0.1): `JobQueue`, `JobData`, `JobOptions`, `assertQueueName`, `createMemoryJobQueue(): MemoryJobQueue`
  (with `sent: readonly SentJob[]`, `SentJob = { id, queue, data, options }`) from `@travel-crm/integrations/jobs`;
  pg-boss 12.37.1 (already a dependency of `packages/integrations`); the test database's `inject("dbUrls")` through
  `@travel-crm/db/testing` (the package's vitest config already runs the db global setup).
- Produces (all from `@travel-crm/integrations/jobs`):
  - `RunningJob = { id: string; data: JobData; retryCount: number }`, `JobHandlerFunction = (job: RunningJob) => Promise<void>`,
    `ScheduleOptions = { timeZone: string; data?: JobData }`;
  - `JobRunner { work(queue, handler, options?: { concurrency?: number }): Promise<void>; schedule(queue, cron, options: ScheduleOptions): Promise<void>; unschedule(queue): Promise<void> }`;
  - `RetryPolicy = { retryLimit; retryDelaySeconds; retryDelayMaxSeconds }`, `defaultRetryPolicy` (5, 10, 3600);
  - `createPgBossJobs(settings: PgBossJobsSettings): PgBossJobs` with
    `PgBossJobsSettings = { connectionString; maxConnections?; pollingIntervalSeconds?; onError?: (error: Error) => void }`
    and `PgBossJobs extends JobQueue, JobRunner { start(); stop(); failedJobs(options?: { limit?: number }): Promise<FailedJob[]>; schedules(): Promise<{ queue; cron; timeZone }[]> }`,
    `FailedJob = { id; queue; data: JobData; attempts: number; failedAt: Date; error: string }`;
  - `createMemoryJobRunner(queue: MemoryJobQueue): MemoryJobRunner`, which adds `schedules`, `failed`,
    `runQueued(): Promise<number>` and `fireSchedule(queue): Promise<void>`.

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-03-jobs -b foundation/03-jobs foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/03-jobs` at Task 0.2's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/integrations/test/jobs/memory-job-runner.test.ts`:
```ts
// The in-memory runner behaves like pg-boss where the worker's tests rely on it: handlers get queued jobs, failures
// are retried up to the job's limit and then recorded, and schedules are kept with their time zone.
import { describe, expect, it } from "vitest";
import { createMemoryJobQueue, createMemoryJobRunner } from "../../src/jobs/index.js";

describe("memory job runner", () => {
  it("runs queued jobs that have a handler, including jobs the handlers queue", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const seen: string[] = [];
    await runner.work("documents.render-pdf", async (job) => {
      seen.push(String(job.data.documentId));
      if (job.data.documentId === "d1") await queue.send("documents.render-pdf", { documentId: "d2" });
    });
    await queue.send("documents.render-pdf", { documentId: "d1" });
    await queue.send("webhooks.process", { webhookEventId: "w1" });

    expect(await runner.runQueued()).toBe(2);
    expect(seen).toEqual(["d1", "d2"]);
    expect(await runner.runQueued()).toBe(0);
  });

  it("retries a failing job up to its limit, then records it as failed", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const attempts: number[] = [];
    await runner.work("notifications.deliver", (job) => {
      attempts.push(job.retryCount);
      return Promise.reject(new Error("mail server down"));
    });
    await queue.send("notifications.deliver", { notificationId: "n1" }, { retryLimit: 2 });

    await runner.runQueued();
    expect(attempts).toEqual([0, 1, 2]);
    expect(runner.failed).toMatchObject([
      { attempts: 3, error: "mail server down", job: { queue: "notifications.deliver" } },
    ]);
  });

  it("keeps schedules with their time zone, and fires them on demand", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    await runner.schedule("rate-limits.purge", "15 3 * * *", { timeZone: "Asia/Kolkata", data: { days: 1 } });
    expect(runner.schedules).toEqual([
      { queue: "rate-limits.purge", cron: "15 3 * * *", timeZone: "Asia/Kolkata", data: { days: 1 } },
    ]);
    await runner.fireSchedule("rate-limits.purge");
    expect(queue.sent).toMatchObject([{ queue: "rate-limits.purge", data: { days: 1 } }]);
    await runner.unschedule("rate-limits.purge");
    expect(runner.schedules).toEqual([]);
  });
});
```

`packages/integrations/test/jobs/pg-boss-jobs.test.ts`:
```ts
// pg-boss as the job queue, against the test database: it runs as app_runtime on the schema our migrations created,
// retries with backoff, lists what failed, queues a repeated job id once, and stops gracefully.
import { randomUUID } from "node:crypto";
import type { DbUrls } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPgBossJobs, type PgBossJobs } from "../../src/jobs/index.js";

/** Waits until check passes or the time runs out. */
async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("pg-boss jobs", () => {
  const urls: DbUrls = inject("dbUrls");
  const errors: Error[] = [];
  let jobs: PgBossJobs;

  beforeAll(async () => {
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      onError: (error) => errors.push(error),
    });
    await jobs.start();
  });

  afterAll(async () => {
    await jobs.stop();
    // Any error pg-boss raised as app_runtime (a missing grant, say) fails the suite.
    expect(errors).toEqual([]);
  });

  it("delivers a job's data to its queue's handler", async () => {
    const seen: unknown[] = [];
    await jobs.work("probe.delivered", (job) => {
      seen.push(job.data);
      return Promise.resolve();
    });
    await jobs.send("probe.delivered", { organizationId: "o1", eventId: "e1" });
    await eventually(() => seen.length === 1);
    expect(seen).toEqual([{ organizationId: "o1", eventId: "e1" }]);
  });

  it("retries a failing job with backoff, then lists it as failed with its error", async () => {
    const tries: number[] = [];
    await jobs.work("probe.failing", (job) => {
      tries.push(job.retryCount);
      return Promise.reject(new Error(`attempt ${String(job.retryCount + 1)} failed`));
    });
    const id = await jobs.send("probe.failing", { eventId: "e2" }, { retryLimit: 2, retryDelaySeconds: 1 });

    await eventually(async () => (await jobs.failedJobs()).some((job) => job.id === id), 25_000);
    expect(tries).toEqual([0, 1, 2]);
    const failed = (await jobs.failedJobs()).find((job) => job.id === id);
    expect(failed).toMatchObject({
      queue: "probe.failing",
      data: { eventId: "e2" },
      attempts: 3,
      error: "attempt 3 failed",
    });
    expect(failed?.failedAt).toBeInstanceOf(Date);
  });

  it("queues a repeated job id once", async () => {
    const id = randomUUID();
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBe(id);
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBeNull();
  });

  it("keeps a schedule with its time zone, and removes it", async () => {
    await jobs.schedule("probe.nightly", "30 2 * * *", { timeZone: "Asia/Kolkata", data: { reason: "nightly" } });
    expect(await jobs.schedules()).toContainEqual({
      queue: "probe.nightly",
      cron: "30 2 * * *",
      timeZone: "Asia/Kolkata",
    });
    await jobs.unschedule("probe.nightly");
    expect((await jobs.schedules()).map((schedule) => schedule.queue)).not.toContain("probe.nightly");
  });

  it("refuses queue names that aren't <module>.<action>", async () => {
    await expect(jobs.send("RenderPdf", {})).rejects.toThrow(/Queue names/);
  });

  it("waits for a running handler when it stops", async () => {
    const stopping = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
    });
    await stopping.start();
    let started = false;
    let finished = false;
    await stopping.work("probe.slow", async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finished = true;
    });
    await stopping.send("probe.slow", {});
    await eventually(() => started);
    await stopping.stop();
    expect(finished).toBe(true);
  });
});
```

The type-only import of `DbUrls` is what brings `inject("dbUrls")`'s type into this package: the declaration lives in
the db package's global setup.

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations test`

Expected: FAIL. `TypeError: createMemoryJobRunner is not a function` (three tests) and
`TypeError: createPgBossJobs is not a function`.

- [ ] **Step 4: Create pg-boss's schema in a migration**

Generate pg-boss's construction SQL with the installed pg-boss, and check it is the SQL this plan was verified with:
```bash
cd /Users/ak/personal/travel-crm-03-jobs/packages/integrations && source ~/.nvm/nvm.sh && nvm use >/dev/null
mkdir -p ../db/prisma/migrations/20261015100000_pgboss
node --input-type=module -e 'import { getConstructionPlans } from "pg-boss"; process.stdout.write(getConstructionPlans("pgboss"))' > ../db/prisma/migrations/20261015100000_pgboss/migration.sql
shasum -a 256 ../db/prisma/migrations/20261015100000_pgboss/migration.sql
```
Expected: `e0cc78ee2a2fed4b42d479a9ae2af65e2ca5b21f980afa41fb880e2eb6ffebbb`. The file is about 480 lines: pg-boss's
own `BEGIN; ... COMMIT;` creating schema `pgboss` (types, functions, tables) and `INSERT INTO pgboss.version(version)
VALUES ('45')`. A different hash means a different pg-boss version is installed: stop and check
`packages/integrations/package.json` pins `pg-boss` to `12.37.1`.

Append the grants exactly as below (the file ends without a newline after pg-boss's `COMMIT;`, so the text starts
with blank lines):
```bash
cd /Users/ak/personal/travel-crm-03-jobs/packages/db/prisma/migrations/20261015100000_pgboss && cat >> migration.sql <<'EOF'


-- ---------------------------------------------------------------------------
-- Hand-written. Everything above is pg-boss 12.37.1's own schema, generated by getConstructionPlans("pgboss")
-- (see docs/adr/0010-jobs-and-the-worker.md). Keep below it.
-- ---------------------------------------------------------------------------

-- The api and worker run pg-boss as app_runtime with migrate: false, so they use its tables and functions but never
-- change its schema. Job data holds ids only: these tables have no row-level security.
GRANT USAGE ON SCHEMA pgboss TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO app_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO app_runtime;

-- The same for what a later pg-boss migration adds, which also runs as the migrator.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA pgboss
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA pgboss
  GRANT EXECUTE ON FUNCTIONS TO app_runtime;
EOF
```

Prisma's `migrate deploy` runs the file as it is (pg-boss's own transaction included), and the test setup's drift
check compares only the `public` schema, so the `pgboss` tables are not drift. Every test database gets the schema
through the migrations.

- [ ] **Step 5: Write the ports and the adapters**

`packages/integrations/src/jobs/retry-policy.ts`:
```ts
// How failed jobs are retried (spec 9.1): exponential backoff, then the failed-jobs list.

export interface RetryPolicy {
  /** Retries after the first attempt fails. */
  retryLimit: number;
  /** Seconds before the first retry; each later retry waits about twice as long. */
  retryDelaySeconds: number;
  /** The longest wait between two attempts, in seconds. */
  retryDelayMaxSeconds: number;
}

/** Five retries over about five minutes (10 s, 20 s, 40 s, 80 s, 160 s, with jitter), never more than an hour apart. */
export const defaultRetryPolicy: RetryPolicy = {
  retryLimit: 5,
  retryDelaySeconds: 10,
  retryDelayMaxSeconds: 60 * 60,
};
```

`packages/integrations/src/jobs/job-runner.ts`:
```ts
// The worker's side of the jobs port: run a handler for each job on a queue, and start jobs on a schedule.
// pg-boss implements it; tests use the in-memory runner.
import type { JobData } from "./job-queue.js";

/** A job as its handler sees it. */
export interface RunningJob {
  id: string;
  data: JobData;
  /** 0 on the first attempt, 1 on the first retry, and so on. */
  retryCount: number;
}

export type JobHandlerFunction = (job: RunningJob) => Promise<void>;

export interface ScheduleOptions {
  /** An IANA time zone the cron expression is read in, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** The data each scheduled job carries. */
  data?: JobData;
}

export interface JobRunner {
  /**
   * Runs handler for every job on queue. A handler that rejects fails that attempt: the job is retried with
   * backoff, and after its last retry it lands in the failed list.
   */
  work(queue: string, handler: JobHandlerFunction, options?: { concurrency?: number }): Promise<void>;
  /** Queues a job on queue each time the cron expression comes round, read in the given time zone. */
  schedule(queue: string, cron: string, options: ScheduleOptions): Promise<void>;
  /** Stops queue's schedule. */
  unschedule(queue: string): Promise<void>;
}
```

`packages/integrations/src/jobs/memory-job-runner.ts`:
```ts
// An in-memory JobRunner for tests. It runs the jobs a MemoryJobQueue holds when the test says so, retrying a
// failing job up to its retry limit straight away and recording what still failed, as pg-boss would after backoff.
import { assertQueueName, type JobData } from "./job-queue.js";
import type { JobHandlerFunction, JobRunner, ScheduleOptions } from "./job-runner.js";
import type { MemoryJobQueue, SentJob } from "./memory-job-queue.js";
import { defaultRetryPolicy } from "./retry-policy.js";

export interface MemorySchedule {
  queue: string;
  cron: string;
  timeZone: string;
  data: JobData;
}

export interface MemoryFailedJob {
  job: SentJob;
  attempts: number;
  error: string;
}

export interface MemoryJobRunner extends JobRunner {
  readonly schedules: readonly MemorySchedule[];
  readonly failed: readonly MemoryFailedJob[];
  /**
   * Runs every queued job that has a handler, oldest first, until none is left (handlers may queue more).
   * Returns the number of jobs run. Jobs on queues nobody works stay queued, as in pg-boss.
   */
  runQueued(): Promise<number>;
  /** Queues a job as the schedule for queue would when its time comes. */
  fireSchedule(queue: string): Promise<void>;
}

export function createMemoryJobRunner(queue: MemoryJobQueue): MemoryJobRunner {
  const handlers = new Map<string, JobHandlerFunction>();
  const schedules: MemorySchedule[] = [];
  const failed: MemoryFailedJob[] = [];
  const finished = new Set<string>();

  async function run(job: SentJob, handler: JobHandlerFunction): Promise<void> {
    const retryLimit = job.options.retryLimit ?? defaultRetryPolicy.retryLimit;
    for (let retryCount = 0; ; retryCount += 1) {
      try {
        await handler({ id: job.id, data: job.data, retryCount });
        return;
      } catch (error) {
        if (retryCount >= retryLimit) {
          failed.push({ job, attempts: retryCount + 1, error: error instanceof Error ? error.message : String(error) });
          return;
        }
      }
    }
  }

  return {
    schedules,
    failed,
    work: (name, handler) =>
      new Promise((resolve) => {
        assertQueueName(name);
        handlers.set(name, handler);
        resolve();
      }),
    schedule: (name, cron, options: ScheduleOptions) =>
      new Promise((resolve) => {
        assertQueueName(name);
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        schedules.push({ queue: name, cron, timeZone: options.timeZone, data: options.data ?? {} });
        resolve();
      }),
    unschedule: (name) =>
      new Promise((resolve) => {
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        resolve();
      }),
    async runQueued() {
      let ran = 0;
      for (;;) {
        const next = queue.sent.find((job) => !finished.has(job.id) && handlers.has(job.queue));
        const handler = next && handlers.get(next.queue);
        if (!next || !handler) return ran;
        finished.add(next.id);
        await run(next, handler);
        ran += 1;
      }
    },
    async fireSchedule(name) {
      const schedule = schedules.find((candidate) => candidate.queue === name);
      if (!schedule) throw new Error(`No schedule for ${name}`);
      await queue.send(name, schedule.data);
    },
  };
}
```

`packages/integrations/src/jobs/pg-boss-jobs.ts`:
```ts
// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { defaultRetryPolicy } from "./retry-policy.js";

export interface PgBossJobsSettings {
  /** Postgres as the app_runtime role. */
  connectionString: string;
  /** Size of pg-boss's own connection pool. */
  maxConnections?: number;
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
  /** Where pg-boss's errors go: a failing maintenance query, a lost connection. */
  onError?: (error: Error) => void;
}

/** A job that used all its retries, for the platform console's failed-jobs list (plan 4). */
export interface FailedJob {
  id: string;
  queue: string;
  data: JobData;
  /** Every attempt, the first one included. */
  attempts: number;
  failedAt: Date;
  /** The last attempt's error message. */
  error: string;
}

export interface PgBossJobs extends JobQueue, JobRunner {
  start(): Promise<void>;
  /** Stops taking jobs, waits up to 30 seconds for running handlers to finish, and closes the pool. */
  stop(): Promise<void>;
  /** Failed jobs, newest first. Data access only: the console screen is plan 4's. */
  failedJobs(options?: { limit?: number }): Promise<FailedJob[]>;
  /** The schedules pg-boss holds, for operations and tests. */
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
}

/** The schema our migrations create pg-boss in (migration 20261015100000_pgboss). */
const SCHEMA = "pgboss";

interface FailedJobRow {
  id: string;
  name: string;
  data: unknown;
  retry_count: number;
  completed_on: Date | null;
  output: unknown;
}

/** Job data is a flat object of strings, numbers, booleans and nulls (the port's JobData); anything else is refused. */
function toJobData(value: unknown): JobData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== null && !["string", "number", "boolean"].includes(typeof field)) {
      throw new TypeError(`Job data field ${key} is not a string, number, boolean or null`);
    }
  }
  return value as JobData;
}

function errorMessageOf(output: unknown): string {
  if (typeof output === "object" && output !== null && "message" in output && typeof output.message === "string") {
    return output.message;
  }
  return "unknown error";
}

export function createPgBossJobs(settings: PgBossJobsSettings): PgBossJobs {
  const boss = new PgBoss({
    connectionString: settings.connectionString,
    schema: SCHEMA,
    max: settings.maxConnections ?? 5,
    // Our migrations own pg-boss's schema; the runtime role may not change it.
    migrate: false,
    createSchema: false,
  });
  boss.on("error", (error) => {
    if (settings.onError) settings.onError(error);
    else console.error("pg-boss error", error);
  });

  // pg-boss 12 needs a queue to exist before jobs are sent to or worked from it. Creating one is idempotent.
  const queues = new Map<string, Promise<void>>();
  function ensureQueue(name: string): Promise<void> {
    assertQueueName(name);
    let created = queues.get(name);
    if (!created) {
      created = boss.createQueue(name, {
        retryLimit: defaultRetryPolicy.retryLimit,
        retryDelay: defaultRetryPolicy.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: defaultRetryPolicy.retryDelayMaxSeconds,
      });
      // A failed creation is not cached: the next use tries again.
      created.catch(() => queues.delete(name));
      queues.set(name, created);
    }
    return created;
  }

  return {
    start: async () => {
      await boss.start();
    },
    stop: () => boss.stop({ graceful: true, timeout: 30_000 }),

    async send(queue, data, options = {}) {
      await ensureQueue(queue);
      return boss.send(queue, data, {
        ...(options.id === undefined ? {} : { id: options.id }),
        ...(options.startAfter === undefined ? {} : { startAfter: options.startAfter }),
        ...(options.retryLimit === undefined ? {} : { retryLimit: options.retryLimit }),
        ...(options.retryDelaySeconds === undefined
          ? {}
          : { retryDelay: options.retryDelaySeconds, retryBackoff: true }),
      });
    },

    async work(queue, handler, options = {}) {
      await ensureQueue(queue);
      await boss.work<JobData>(
        queue,
        {
          batchSize: 1,
          localConcurrency: options.concurrency ?? 1,
          pollingIntervalSeconds: settings.pollingIntervalSeconds ?? 2,
        },
        async ([job]) => {
          if (job) await handler({ id: job.id, data: toJobData(job.data), retryCount: job.retryCount });
        },
      );
    },

    async schedule(queue, cron, { timeZone, data }) {
      await ensureQueue(queue);
      await boss.schedule(queue, cron, data ?? null, { tz: timeZone });
    },

    async unschedule(queue) {
      assertQueueName(queue);
      await boss.unschedule(queue);
    },

    async schedules() {
      return (await boss.getSchedules()).map((schedule) => ({
        queue: schedule.name,
        cron: schedule.cron,
        timeZone: schedule.timezone,
      }));
    },

    async failedJobs({ limit = 50 } = {}) {
      const { rows } = await boss.getDb().executeSql(
        `SELECT id, name, data, retry_count, completed_on, output FROM ${SCHEMA}.job
         WHERE state = 'failed' ORDER BY completed_on DESC NULLS LAST LIMIT $1`,
        [limit],
      );
      return (rows as FailedJobRow[]).map((row) => ({
        id: row.id,
        queue: row.name,
        data: toJobData(row.data),
        attempts: row.retry_count + 1,
        failedAt: row.completed_on ?? new Date(0),
        error: errorMessageOf(row.output),
      }));
    },
  };
}
```

Facts this relies on, checked against pg-boss 12.37.1: a queue must be created before `send` or `work`, and
`create_queue` is `INSERT ... ON CONFLICT DO NOTHING` (idempotent, an existing queue keeps its policy); a repeated job
`id` makes `send` return `null`; `singletonKey` does not deduplicate on a standard queue; a failed job's
`retry_count` is its retries, so attempts are one more; `start()` with `migrate: false` throws
`pg-boss database requires migrations` when the schema version is not the one it expects.

`packages/integrations/src/jobs/index.ts`:
```ts
// Public API of @travel-crm/integrations/jobs: the jobs port and its adapters.
export { assertQueueName, type JobData, type JobOptions, type JobQueue } from "./job-queue.js";
export type { JobHandlerFunction, JobRunner, RunningJob, ScheduleOptions } from "./job-runner.js";
export { createMemoryJobQueue, type MemoryJobQueue, type SentJob } from "./memory-job-queue.js";
export {
  createMemoryJobRunner,
  type MemoryFailedJob,
  type MemoryJobRunner,
  type MemorySchedule,
} from "./memory-job-runner.js";
export { createPgBossJobs, type FailedJob, type PgBossJobs, type PgBossJobsSettings } from "./pg-boss-jobs.js";
export { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations test`

Expected: 15 tests pass in 4 files (about 20 seconds: the failing job waits out two backoff delays). No pg-boss error
reaches `onError`: the suite's `afterAll` fails if one does (a missing grant would).

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server=72 api=5 brand=3 contracts=18 db=111 domain=121 eslint-config=65
integrations=15. If Docker restarts under load ("Could not find a working container runtime strategy"), rerun.

```bash
cd /Users/ak/personal/travel-crm-03-jobs
git add packages/db/prisma/migrations/20261015100000_pgboss/migration.sql packages/integrations/src/jobs/index.ts packages/integrations/src/jobs/job-runner.ts packages/integrations/src/jobs/memory-job-runner.ts packages/integrations/src/jobs/pg-boss-jobs.ts packages/integrations/src/jobs/retry-policy.ts packages/integrations/test/jobs/memory-job-runner.test.ts packages/integrations/test/jobs/pg-boss-jobs.test.ts
git commit -m "feat(integrations): run jobs on pg-boss in its own schema, behind the job queue and runner ports"
```

---

### Task J2: The outbox relay

After a change commits, its events must reach their listeners. The relay finds the organizations with events
waiting, and for each one, inside `db.forOrg()`, locks a batch of unrelayed events (`FOR UPDATE SKIP LOCKED`, so
several worker copies share the work), queues one job per listener of each event on the listener's own queue, and
marks the events relayed. Each job's id is derived from the listener and the event, so an event relayed twice (after a
crash between sending and marking) queues nothing new. Finding the organizations is the relay's one look across
organizations: a SECURITY DEFINER function that returns organization ids only, which the schema check allows by name.

**Files:**
- Create: `packages/db/prisma/migrations/20261015100100_outbox_relay/migration.sql`
- Modify: `packages/db/test/schema-check.test.ts` (the allow-list only)
- Create: `packages/domain/src/jobs/listener-job-id.ts`, `packages/domain/src/jobs/relay.ts`
- Modify: `packages/domain/src/jobs/index.ts`, `packages/domain/src/jobs/README.md`
- Test: `packages/db/test/outbox-relay-function.test.ts`, `packages/domain/test/jobs/relay.test.ts`,
  `packages/domain/test/jobs/test-listeners.ts` (helpers), and a change to `packages/domain/test/jobs/publish-event.test.ts`

**Interfaces:**
- Consumes: `JobQueue`, `createMemoryJobQueue` (Task 0.1); `publishEvent`, `EventListener`, `DomainEvent`,
  `ListenerContext` (Task 0.2); `db.forOrg`, `db.withoutOrg` (Task 0.2); `outbox_event` and its
  `outbox_event_unrelayed` partial index (Task 0.2).
- Produces (from `@travel-crm/domain/jobs`):
  - `relayOutbox(dependencies: RelayDependencies): Promise<number>`, with
    `RelayDependencies = { db: Database; queue: JobQueue; listeners: readonly EventListener[]; batchSize?: number; organizationsPerPass?: number; organizationIds?: readonly string[] }`;
  - `startOutboxRelay(dependencies: RelayDependencies & { intervalMs?: number; onError?: (error: unknown) => void }): OutboxRelay`,
    `OutboxRelay = { stop(): Promise<void> }`;
  - `organizationsWithEventsWaiting(db: Database, limit: number): Promise<string[]>`;
  - `listenerJobId(listenerName: string, eventId: string): string`;
  - `ListenerJobData = { organizationId: string; eventId: string; eventType: string }`: the data of every listener job.
- Produces (database): `app_organizations_with_unrelayed_events(max_organizations integer) RETURNS SETOF uuid`,
  executable by `app_runtime` only.

- [ ] **Step 1: Write the failing database test**

`packages/db/test/outbox-relay-function.test.ts`:
```ts
// The relay's one SECURITY DEFINER function says which organizations have events waiting, and nothing more: the
// runtime role still sees no organization's events outside db.forOrg().
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("app_organizations_with_unrelayed_events", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let older: string;
  let newer: string;
  let quiet: string;

  const waiting = (max = 1000) =>
    db.withoutOrg(
      (tx) => tx.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM app_organizations_with_unrelayed_events(${max}::integer) AS organization_id`,
    );

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    older = await createTestOrganization(platform, "Relay older");
    newer = await createTestOrganization(platform, "Relay newer");
    quiet = await createTestOrganization(platform, "Relay quiet");
    for (const organizationId of [older, newer]) {
      await db.forOrg(organizationId, (tx) =>
        tx.outboxEvent.create({ data: { type: "relay.checked", payload: { secret: "never returned" } } }),
      );
    }
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists organizations with unrelayed events, oldest first, as ids and nothing else", async () => {
    const rows = await waiting();
    for (const row of rows) expect(Object.keys(row)).toEqual(["organization_id"]);
    const ids = rows.map((row) => row.organization_id);
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(quiet);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
    expect(await waiting(1)).toHaveLength(1);
  });

  it("drops an organization once its events are relayed", async () => {
    await db.forOrg(older, (tx) => tx.outboxEvent.updateMany({ data: { relayedAt: new Date() } }));
    const ids = (await waiting()).map((row) => row.organization_id);
    expect(ids).not.toContain(older);
    expect(ids).toContain(newer);
  });

  it("leaves the runtime role blind to events outside db.forOrg()", async () => {
    expect(await db.withoutOrg((tx) => tx.outboxEvent.count())).toBe(0);
  });

  it("can be called only by the runtime role", async () => {
    await expect(platform.$queryRaw`SELECT * FROM app_organizations_with_unrelayed_events(10)`).rejects.toThrow(
      /permission denied/i,
    );
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: FAIL. `function app_organizations_with_unrelayed_events(integer) does not exist` in the new file's tests.

- [ ] **Step 2: Add the function**

`packages/db/prisma/migrations/20261015100100_outbox_relay/migration.sql`:
```sql
-- The outbox relay's one look across organizations (ADR 0010): which organizations have events waiting, oldest
-- first. It returns organization ids only, which app_runtime can read from the organization table anyway, never an
-- event. SECURITY DEFINER: it runs as its owner, the migrator, whose platform_access policy sees every row; the
-- relay then reads each organization's events inside db.forOrg(), under row-level security as usual.
CREATE FUNCTION app_organizations_with_unrelayed_events(max_organizations integer)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM outbox_event
  WHERE relayed_at IS NULL
  GROUP BY organization_id
  ORDER BY min(occurred_at)
  LIMIT max_organizations
$$;

-- Only the api and worker call it.
REVOKE ALL ON FUNCTION app_organizations_with_unrelayed_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_organizations_with_unrelayed_events(integer) TO app_runtime;
```

Prisma doesn't model functions, so the drift check is unaffected. Postgres has no `min(uuid)`, hence the order by
the oldest event's `occurred_at`.

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: the new file passes, and `schema-check.test.ts` now fails "has no SECURITY DEFINER functions outside the
allow-list" with `["app_organizations_with_unrelayed_events"]`: the check works.

- [ ] **Step 3: Allow exactly this function**

In `packages/db/test/schema-check.test.ts`, replace:
```ts
/** Functions allowed to run with their owner's rights. Empty: such a function skips row-level security. */
const allowedSecurityDefinerFunctions: string[] = [];
```
with:
```ts
/**
 * Functions allowed to run with their owner's rights, which skips row-level security. Each one is reviewed and has its
 * own test proving what it reveals.
 */
const allowedSecurityDefinerFunctions: string[] = [
  // The outbox relay's list of organizations with events waiting: organization ids only (ADR 0010,
  // outbox-relay-function.test.ts).
  "app_organizations_with_unrelayed_events",
];
```

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 115 tests pass in 16 files.

- [ ] **Step 4: Write the failing relay tests**

A listener that records what it handles and can be told to fail, and a queue that counts send calls (repeats
included), shared by this task's and the next task's tests:

`packages/domain/test/jobs/test-listeners.ts`:
```ts
// Listeners and a counting job queue for the jobs module's tests.
import { createMemoryJobQueue, type JobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import type { DomainEvent, EventListener, ListenerContext } from "../../src/jobs/index.js";

/** A listener that records the events it handles, and can be told to fail. */
export interface RecordingListener extends EventListener {
  readonly handled: DomainEvent[];
  failuresLeft: number;
}

export function recordingListener(
  name: string,
  eventType: string,
  handle?: EventListener["handle"],
): RecordingListener {
  const listener: RecordingListener = {
    name,
    eventType,
    handled: [],
    failuresLeft: 0,
    async handle(event: DomainEvent, context: ListenerContext) {
      if (listener.failuresLeft > 0) {
        listener.failuresLeft -= 1;
        throw new Error(`${name} failed on purpose`);
      }
      listener.handled.push(event);
      if (handle) await handle(event, context);
    },
  };
  return listener;
}

/** A memory queue that also counts send calls, repeats included, to prove a relay never sends one event twice. */
export function countingQueue(): { queue: JobQueue; memory: MemoryJobQueue; calls: () => number } {
  const memory = createMemoryJobQueue();
  let calls = 0;
  return {
    memory,
    calls: () => calls,
    queue: {
      send: (name, data, options) => {
        calls += 1;
        return memory.send(name, data, options);
      },
    },
  };
}
```

`packages/domain/test/jobs/relay.test.ts`:
```ts
// The outbox relay queues one job per listener per event, with ids only, marks events relayed, and never queues an
// event twice: not on a second pass, not after a crash between sending and marking, not with two relays at once.
// Every relay here names its organizations: test files share one database, and a relay that looked at every
// organization would take other files' events.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  listenerJobId,
  organizationsWithEventsWaiting,
  publishEvent,
  relayOutbox,
  startOutboxRelay,
} from "../../src/jobs/index.js";
import { countingQueue, recordingListener } from "./test-listeners.js";

const renderPdf = recordingListener("documents.render-pdf", "document.issued");
const notifyIssuer = recordingListener("notifications.document-issued", "document.issued");
const deliver = recordingListener("notifications.deliver", "notification.created");
const listeners = [renderPdf, notifyIssuer, deliver];

describe("outbox relay", () => {
  let platform: PlatformClient;
  let db: Database;
  let agencyA: string;
  let agencyB: string;

  const publish = (organizationId: string, type: string, payload = {}) =>
    db.forOrg(organizationId, (tx) => publishEvent(tx, { type, payload }));
  const relayedAt = async (organizationId: string, eventId: string) =>
    (await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }))).relayedAt;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    agencyA = await createTestOrganization(platform, "Relay A");
    agencyB = await createTestOrganization(platform, "Relay B");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("queues a job on each listener's queue for each event, with ids only, and marks the events relayed", async () => {
    const { queue, memory } = countingQueue();
    const issuedA = await publish(agencyA, "document.issued", { documentId: "d1" });
    const createdB = await publish(agencyB, "notification.created", { notificationId: "n1" });

    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA, agencyB] })).toBe(2);

    expect(memory.sent.map(({ queue: name, data, id }) => ({ name, data, id }))).toEqual([
      {
        name: "documents.render-pdf",
        data: { organizationId: agencyA, eventId: issuedA, eventType: "document.issued" },
        id: listenerJobId("documents.render-pdf", issuedA),
      },
      {
        name: "notifications.document-issued",
        data: { organizationId: agencyA, eventId: issuedA, eventType: "document.issued" },
        id: listenerJobId("notifications.document-issued", issuedA),
      },
      {
        name: "notifications.deliver",
        data: { organizationId: agencyB, eventId: createdB, eventType: "notification.created" },
        id: listenerJobId("notifications.deliver", createdB),
      },
    ]);
    expect(await relayedAt(agencyA, issuedA)).toBeInstanceOf(Date);
    expect(await relayedAt(agencyB, createdB)).toBeInstanceOf(Date);
  });

  it("sends nothing on a second pass", async () => {
    const { queue, calls } = countingQueue();
    await publish(agencyA, "document.issued", { documentId: "d2" });
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] });
    const sent = calls();
    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] })).toBe(0);
    expect(calls()).toBe(sent);
  });

  it("queues nothing new when an event is relayed again after a crash", async () => {
    const { queue, memory } = countingQueue();
    const eventId = await publish(agencyA, "document.issued", { documentId: "d3" });
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] });
    // As if the relay had crashed after sending but before its transaction marked the event.
    await platform.outboxEvent.update({ where: { id: eventId }, data: { relayedAt: null } });

    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] })).toBe(1);
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toHaveLength(2);
  });

  it("relays each event once when two relays run at the same time", async () => {
    const { queue, calls } = countingQueue();
    const organizationId = await createTestOrganization(platform, "Relay race");
    for (const documentId of ["r1", "r2", "r3", "r4"]) await publish(organizationId, "document.issued", { documentId });

    const passes = await Promise.all([
      relayOutbox({ db, queue, listeners, organizationIds: [organizationId] }),
      relayOutbox({ db, queue, listeners, organizationIds: [organizationId] }),
    ]);
    expect(passes[0] + passes[1]).toBe(4);
    expect(calls()).toBe(8);
  });

  it("marks an event nobody listens to as relayed, and gives a listener only its own event type", async () => {
    const { queue, memory } = countingQueue();
    const eventId = await publish(agencyB, "nobody.listens", {});
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyB] });
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toEqual([]);
    expect(await relayedAt(agencyB, eventId)).toBeInstanceOf(Date);
  });

  it("finds the organizations with events waiting, oldest first", async () => {
    // Read-only, so it can't take other test files' events: every relay in these tests names its organizations.
    const first = await createTestOrganization(platform, "Relay finds first");
    const second = await createTestOrganization(platform, "Relay finds second");
    await publish(first, "document.issued", { documentId: "f1" });
    await publish(second, "document.issued", { documentId: "f2" });
    const waiting = await organizationsWithEventsWaiting(db, 1000);
    expect(waiting.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(waiting.indexOf(first)).toBeLessThan(waiting.indexOf(second));
    expect(waiting).not.toContain(agencyA);
  });

  it("keeps relaying in a loop after an error, until stopped", async () => {
    const { queue: working, memory } = countingQueue();
    let failNext = true;
    const errors: unknown[] = [];
    const organizationId = await createTestOrganization(platform, "Relay loop");
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [organizationId],
      intervalMs: 50,
      onError: (error) => errors.push(error),
      queue: {
        send: (name, data, options) => {
          if (failNext) {
            failNext = false;
            return Promise.reject(new Error("pg-boss unavailable"));
          }
          return working.send(name, data, options);
        },
      },
    });
    const eventId = await publish(organizationId, "notification.created", { notificationId: "n2" });
    const deadline = Date.now() + 10_000;
    while (!memory.sent.some((job) => job.data.eventId === eventId) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await relay.stop();
    expect(errors).toHaveLength(1);
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toHaveLength(1);
  });
});
```

Test files share one database, so every relay in a test names its organizations, and nothing may expect a committed
event to stay unrelayed. Task 0.2's publish test read its event back after the commit; make it read inside the
transaction. In `packages/domain/test/jobs/publish-event.test.ts`, replace:
```ts
  it("records the event in the organization of the transaction, unrelayed", async () => {
    const id = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "d1", pages: 2 } }),
    );
    const event = await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }));
```
with:
```ts
  it("records the event in the organization of the transaction, unrelayed", async () => {
    // Read back in the same transaction: once it commits, a relay running in another test may relay it at once.
    const { id, event } = await db.forOrg(organizationId, async (tx) => {
      const published = await publishEvent(tx, { type: "document.issued", payload: { documentId: "d1", pages: 2 } });
      return { id: published, event: await tx.outboxEvent.findUnique({ where: { id: published } }) };
    });
```

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/jobs`

Expected: FAIL. `relay.test.ts` fails with `relayOutbox is not a function` (and `listenerJobId`,
`organizationsWithEventsWaiting`, `startOutboxRelay` likewise); the other jobs tests pass.

- [ ] **Step 5: Write the relay**

`packages/domain/src/jobs/listener-job-id.ts`:
```ts
// The job id for one listener's run on one event: the same every time, so relaying an event twice queues it once.
import { createHash } from "node:crypto";

/**
 * A UUID (version 8, RFC 9562) derived from the listener's name and the event's id. pg-boss queues a job id once, so
 * a relay that crashes after sending and relays the event again sends nothing new.
 */
export function listenerJobId(listenerName: string, eventId: string): string {
  const bytes = createHash("sha256").update(`${listenerName}\n${eventId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

`packages/domain/src/jobs/relay.ts`:
```ts
// The outbox relay (spec 9.1): after a change commits, it queues one job for each listener of each new event, then
// marks the events relayed. It runs in the worker, in a loop.
import { setTimeout as sleep } from "node:timers/promises";
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { EventListener } from "./events.js";
import { listenerJobId } from "./listener-job-id.js";

export interface RelayDependencies {
  db: Database;
  queue: JobQueue;
  listeners: readonly EventListener[];
  /** Events relayed per organization in one pass. */
  batchSize?: number;
  /** Organizations looked at in one pass. */
  organizationsPerPass?: number;
  /**
   * Relay only these organizations' events, for example right after a request in one organization. By default the
   * relay asks the database which organizations have events waiting.
   */
  organizationIds?: readonly string[];
}

/** What a listener's job carries: ids only. The listener reads the event inside db.forOrg(). */
export interface ListenerJobData {
  [key: string]: string;
  organizationId: string;
  eventId: string;
  eventType: string;
}

/** Relays one batch of waiting events. Returns how many events it relayed. */
export async function relayOutbox(dependencies: RelayDependencies): Promise<number> {
  const organizationIds =
    dependencies.organizationIds ??
    (await organizationsWithEventsWaiting(dependencies.db, dependencies.organizationsPerPass ?? 50));
  let relayed = 0;
  for (const organizationId of organizationIds) {
    relayed += await relayOrganization(dependencies, organizationId);
  }
  return relayed;
}

/**
 * The organizations with events waiting, oldest first: the relay's one look across organizations, through the
 * SECURITY DEFINER function that returns ids only (ADR 0010).
 */
export async function organizationsWithEventsWaiting(db: Database, limit: number): Promise<string[]> {
  const rows = await db.withoutOrg(
    (tx) => tx.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM app_organizations_with_unrelayed_events(${limit}::integer) AS organization_id`,
  );
  return rows.map((row) => row.organization_id);
}

async function relayOrganization(
  { db, queue, listeners, batchSize = 100 }: RelayDependencies,
  organizationId: string,
): Promise<number> {
  return db.forOrg(
    organizationId,
    async (tx) => {
      // SKIP LOCKED: two relays at once (several worker copies) each take different events, never the same one.
      const events = await tx.$queryRaw<{ id: string; type: string }[]>`
        SELECT id, type FROM outbox_event WHERE relayed_at IS NULL
        ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
      for (const event of events) {
        for (const listener of listeners.filter((candidate) => candidate.eventType === event.type)) {
          const data: ListenerJobData = { organizationId, eventId: event.id, eventType: event.type };
          await queue.send(listener.name, data, { id: listenerJobId(listener.name, event.id) });
        }
      }
      if (events.length > 0) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: events.map((event) => event.id) } },
          data: { relayedAt: new Date() },
        });
      }
      return events.length;
    },
    // Sending a batch to pg-boss can take longer than Prisma's default 5 seconds on a busy database.
    { timeout: 30_000 },
  );
}

export interface OutboxRelay {
  /** Finishes the pass in progress, then stops. */
  stop(): Promise<void>;
}

/**
 * Relays in a loop: straight on while there are events waiting, otherwise every intervalMs (default 1 s). An error
 * goes to onError and the loop carries on, so a database blip doesn't stop the worker's relay.
 */
export function startOutboxRelay(
  dependencies: RelayDependencies & { intervalMs?: number; onError?: (error: unknown) => void },
): OutboxRelay {
  const intervalMs = dependencies.intervalMs ?? 1000;
  const onError =
    dependencies.onError ??
    ((error: unknown) => {
      console.error("outbox relay failed", error);
    });
  const stopping = new AbortController();

  const loop = (async () => {
    while (!stopping.signal.aborted) {
      let relayed = 0;
      try {
        relayed = await relayOutbox(dependencies);
      } catch (error) {
        onError(error);
      }
      // stop() aborts the wait, so stopping never waits out the interval.
      if (relayed === 0) await sleep(intervalMs, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  })();

  return {
    stop: async () => {
      stopping.abort();
      await loop;
    },
  };
}
```

`SELECT ... FOR UPDATE` needs an UPDATE right on some column of the table: `app_runtime` has one, on `relayed_at`
(Task 0.2). `ListenerJobData` carries an index signature so it is a `JobData`.

`packages/domain/src/jobs/index.ts`:
```ts
// Public API of the jobs module: domain events, their listeners, and the relay that queues them (spec 9.1).
export {
  assertEventType,
  defineListener,
  type DomainEvent,
  type EventListener,
  type EventPayload,
  type JsonValue,
  type ListenerContext,
  type PayloadSchema,
} from "./events.js";
export { listenerJobId } from "./listener-job-id.js";
export { publishEvent } from "./publish-event.js";
export {
  organizationsWithEventsWaiting,
  relayOutbox,
  startOutboxRelay,
  type ListenerJobData,
  type OutboxRelay,
  type RelayDependencies,
} from "./relay.js";
```

`packages/domain/src/jobs/README.md`:
```markdown
# jobs

Domain events and the work the worker does after a change commits (spec 9.1).

## Public functions and values (`index.ts`)

- `publishEvent(tx, { type, payload })`: writes an event to the outbox inside the change's own transaction and returns
  its id. The event exists exactly when the change commits.
- `defineListener({ name, eventType, payload, handle })`: a listener whose handler gets the payload checked by
  `payload` (a Zod schema from `@travel-crm/contracts`). `name` is also its job queue, e.g. `documents.render-pdf`.
- `relayOutbox({ db, queue, listeners, batchSize?, organizationsPerPass?, organizationIds? })`: one pass of the outbox
  relay. For each waiting event it queues a job on the queue of every listener of that event type, with data
  `{ organizationId, eventId, eventType }` and the id `listenerJobId(listener, event)`, then marks the event relayed.
  Returns how many events it relayed.
- `startOutboxRelay({ ...those, intervalMs?, onError? })`: the relay in a loop, for the worker; `stop()` ends it.
- `listenerJobId(listenerName, eventId)`: the deterministic job id, so relaying an event twice queues it once.
- `organizationsWithEventsWaiting(db, limit)`: the organizations with events waiting, oldest first (ids only).
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`.

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run at least once and are keyed by event id. Make any work outside the database (an email, an upload)
  safe to repeat.
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
- Don't test that an event stays unrelayed after its transaction commits: a relay running in another test (or the
  worker) may relay it at once. Read it back inside the publishing transaction instead. And in tests, always give
  the relay `organizationIds`: one that looks at every organization takes other test files' events.
- The relay finds waiting organizations through `app_organizations_with_unrelayed_events`, the one SECURITY DEFINER
  function (ids only, ADR 0010); it reads the events themselves inside `forOrg`.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/jobs`

Expected: 13 tests pass in 3 files.

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server=72 api=5 brand=3 contracts=18 db=115 domain=128 eslint-config=65
integrations=15.

```bash
cd /Users/ak/personal/travel-crm-03-jobs
git add packages/db/prisma/migrations/20261015100100_outbox_relay/migration.sql packages/db/test/outbox-relay-function.test.ts packages/db/test/schema-check.test.ts packages/domain/src/jobs/README.md packages/domain/src/jobs/index.ts packages/domain/src/jobs/listener-job-id.ts packages/domain/src/jobs/relay.ts packages/domain/test/jobs/publish-event.test.ts packages/domain/test/jobs/relay.test.ts packages/domain/test/jobs/test-listeners.ts
git commit -m "feat(domain): relay outbox events to each listener's queue, once"
```

---

### Task J3: Listeners run once per event, in their organization; the worker

The relay queues jobs; this task runs them. `runListenerJob` reads the job's event inside `forOrg(job's
organization)`, so a job that names the wrong organization finds nothing; skips it when `processed_event` says this
listener already handled it; runs the listener outside any transaction as the system actor; then records the run.
`startWorker` wires every listener, plain job handler (work with no organization yet, such as webhooks) and scheduled
job (cron in an IANA time zone) to the runner, and starts the relay. The pg-boss adapter gains a retry-policy setting
so a test can watch a failing listener reach the failed list.

**Files:**
- Modify: `packages/db/prisma/schema/jobs.prisma`, `packages/db/test/org-table-fixtures/jobs.ts`
- Create: `packages/db/prisma/migrations/20261015100200_processed_event/migration.sql`
- Create: `packages/domain/src/jobs/run-listener.ts`, `packages/domain/src/jobs/worker.ts`
- Modify: `packages/domain/src/jobs/index.ts`, `packages/domain/src/jobs/README.md`,
  `packages/integrations/src/jobs/pg-boss-jobs.ts`
- Create: `docs/adr/0010-jobs-and-the-worker.md`
- Test: `packages/domain/test/jobs/run-listener.test.ts`, `packages/domain/test/jobs/worker.test.ts`,
  `packages/domain/test/jobs/worker-pg-boss.test.ts`

**Interfaces:**
- Consumes: J1's `JobRunner`, `createMemoryJobRunner`, `createPgBossJobs`, `RetryPolicy`; J2's `startOutboxRelay`,
  `listenerJobId`, `ListenerJobData`, `recordingListener`/`countingQueue` (test helpers); `systemActor` (Task 0.2).
- Produces (from `@travel-crm/domain/jobs`):
  - `runListenerJob({ db, listener, data }: { db: Database; listener: EventListener; data: JobData }): Promise<ListenerRunOutcome>`,
    `ListenerRunOutcome = "handled" | "already-handled" | "event-not-found"`;
  - `startWorker(dependencies: WorkerDependencies): Promise<Worker>` with
    `WorkerDependencies = { db; runner: JobRunner; queue: JobQueue; listeners: readonly EventListener[]; handlers?: readonly JobHandler[]; schedules?: readonly ScheduledJob[]; relay?: { intervalMs?: number; organizationIds?: readonly string[] }; onError?: (error: unknown) => void }`,
    `Worker = { stop(): Promise<void> }` (stops the relay; the caller then stops pg-boss);
  - `JobHandler = { readonly queue: string; handle(data: JobData): Promise<void> }`;
  - `ScheduledJob = { readonly queue: string; readonly cron: string; readonly timeZone: string; readonly data?: JobData; handle(data: JobData): Promise<void> }`.
- Produces (from `@travel-crm/integrations/jobs`): `PgBossJobsSettings.retryPolicy?: RetryPolicy`.
- Produces (database): `processed_event (organization_id, listener, event_id, processed_at)`, append-only, primary key
  `(organization_id, listener, event_id)`; Prisma model `ProcessedEvent` with no `organization` relation yet (the
  Integration task adds it with the other tracks').

- [ ] **Step 1: Add the table**

Keep a copy of the schema before the change, for the migration's diff (no database needed). Then append, after a blank line, to
`packages/db/prisma/schema/jobs.prisma`:
```prisma
/// Which listener has handled which event, so each listener runs once per event (spec 9.1). Append-only.
model ProcessedEvent {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  /// The listener's name, which is also its job queue, e.g. "documents.render-pdf".
  listener       String
  eventId        String   @map("event_id") @db.Uuid
  processedAt    DateTime @default(now()) @map("processed_at") @db.Timestamptz(6)

  @@id([organizationId, listener, eventId])
  @@map("processed_event")
}
```

```bash
cd /Users/ak/personal/travel-crm-03-jobs/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261015100200_processed_event
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015100200_processed_event/migration.sql
```
(`git archive HEAD` holds the committed schema, without the model just appended.) Expected: the `CREATE TABLE
"processed_event"` statement below. Append the hand-written part, so the whole file reads:

`packages/db/prisma/migrations/20261015100200_processed_event/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "processed_event" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "listener" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_event_pkey" PRIMARY KEY ("organization_id","listener","event_id")
);


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('processed_event');

-- A record that a listener handled an event is a fact: the api and worker add them and never change or remove one.
REVOKE UPDATE, DELETE ON TABLE "processed_event" FROM app_runtime;
```

Then: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/db test`

Expected: FAIL. The isolation suite's "has an isolation fixture for every table with an organization_id column"
names `processed_event`.

- [ ] **Step 2: Give it an isolation fixture**

`packages/db/test/org-table-fixtures/jobs.ts`:
```ts
// Isolation fixtures for the jobs module: the outbox, and the record of which listener handled which event.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  outbox_event: {
    create: (tx) => tx.outboxEvent.create({ data: { type: "isolation.checked", payload: { probe: true } } }),
    appendOnly: true,
  },
  processed_event: {
    create: (tx) =>
      tx.processedEvent.create({
        data: { listener: "isolation.checked", eventId: "0199e7a0-0000-7000-8000-000000000001" },
      }),
    appendOnly: true,
  },
};
```

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 120 tests pass in 16 files, five of them the isolation checks for `processed_event` (append-only: updates
and deletes refused outright).

- [ ] **Step 3: Write the failing listener and worker tests**

`packages/domain/test/jobs/run-listener.test.ts`:
```ts
// A listener runs once per event, in the event's own organization, as the system: a repeat is skipped, a failure is
// retried until it succeeds once, and a job naming the wrong organization finds nothing.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, runListenerJob, type ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { recordingListener } from "./test-listeners.js";

describe("runListenerJob", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let otherOrganizationId: string;

  const publishIssued = (documentId: string) =>
    db.forOrg(organizationId, (tx) => publishEvent(tx, { type: "document.issued", payload: { documentId } }));
  const jobFor = (eventId: string, overrides: Record<string, string> = {}) => ({
    organizationId,
    eventId,
    eventType: "document.issued",
    ...overrides,
  });

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Listener runs");
    otherOrganizationId = await createTestOrganization(platform, "Listener elsewhere");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("handles an event once, and skips it when the job comes again", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d1");

    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("handled");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("already-handled");
    expect(listener.handled.map((event) => [event.id, event.payload])).toEqual([[eventId, { documentId: "d1" }]]);
  });

  it("keeps listeners apart: another listener of the same event still runs", async () => {
    const eventId = await publishIssued("d2");
    const render = recordingListener("documents.render-pdf", "document.issued");
    const notify = recordingListener("notifications.document-issued", "document.issued");
    await runListenerJob({ db, listener: render, data: jobFor(eventId) });
    expect(await runListenerJob({ db, listener: notify, data: jobFor(eventId) })).toBe("handled");
  });

  it("rejects when the listener fails, and handles the event once on the retry", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    listener.failuresLeft = 1;
    const eventId = await publishIssued("d3");

    await expect(runListenerJob({ db, listener, data: jobFor(eventId) })).rejects.toThrow("failed on purpose");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("handled");
    expect(listener.handled).toHaveLength(1);
  });

  it("gives the listener the system as actor and a forOrg bound to the event's organization", async () => {
    let seen: { actor: ListenerContext["actor"]; eventVisible: boolean } | undefined;
    const listener = recordingListener("documents.render-pdf", "document.issued", async (event, context) => {
      const row = await context.forOrg((tx) => tx.outboxEvent.findUnique({ where: { id: event.id } }));
      seen = { actor: context.actor, eventVisible: row !== null };
    });
    const eventId = await publishIssued("d4");
    await runListenerJob({ db, listener, data: jobFor(eventId) });
    expect(seen).toEqual({ actor: systemActor(organizationId), eventVisible: true });
  });

  it("finds no event when the job names another organization, and doesn't run the listener", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d5");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId, { organizationId: otherOrganizationId }) })).toBe(
      "event-not-found",
    );
    expect(listener.handled).toEqual([]);
  });

  it("refuses a job that isn't for this listener's event type, or has no valid ids", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d6");
    await expect(
      runListenerJob({ db, listener, data: jobFor(eventId, { eventType: "notification.created" }) }),
    ).rejects.toThrow(/listens to document.issued/);
    await expect(runListenerJob({ db, listener, data: { eventType: "document.issued" } })).rejects.toThrow(
      /organizationId/,
    );
  });
});
```

`packages/domain/test/jobs/worker.test.ts`:
```ts
// The worker wires every kind of work to the runner and relays events, on the in-memory runner: an event published
// in an organization reaches its listener, handlers and schedules run, and mistakes in the wiring are refused.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryJobQueue, createMemoryJobRunner, type JobData } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, startWorker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";

async function eventually(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("startWorker", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Worker");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("relays a published event and runs its listener", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [listener],
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "w1" } }),
    );
    await eventually(() => queue.sent.some((job) => job.data.eventId === eventId));
    await runner.runQueued();
    await worker.stop();
    expect(listener.handled.map((event) => event.id)).toEqual([eventId]);
  });

  it("runs plain handlers, and registers schedules in their time zone", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const handled: JobData[] = [];
    const purged: JobData[] = [];
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [],
      relay: { organizationIds: [] },
      handlers: [
        {
          queue: "webhooks.process",
          handle: (data) => {
            handled.push(data);
            return Promise.resolve();
          },
        },
      ],
      schedules: [
        {
          queue: "rate-limits.purge",
          cron: "15 3 * * *",
          timeZone: "Asia/Kolkata",
          data: { olderThanDays: 1 },
          handle: (data) => {
            purged.push(data);
            return Promise.resolve();
          },
        },
      ],
    });
    await queue.send("webhooks.process", { webhookEventId: "w1" });
    await runner.fireSchedule("rate-limits.purge");
    await runner.runQueued();
    await worker.stop();

    expect(handled).toEqual([{ webhookEventId: "w1" }]);
    expect(purged).toEqual([{ olderThanDays: 1 }]);
    expect(runner.schedules).toEqual([
      { queue: "rate-limits.purge", cron: "15 3 * * *", timeZone: "Asia/Kolkata", data: { olderThanDays: 1 } },
    ]);
  });

  it("refuses two kinds of work on one queue, and a schedule in an unknown time zone", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const base = { db, runner, queue, relay: { organizationIds: [] } };
    await expect(
      startWorker({
        ...base,
        listeners: [
          recordingListener("documents.render-pdf", "document.issued"),
          recordingListener("documents.render-pdf", "document.reissued"),
        ],
      }),
    ).rejects.toThrow(/share the queue documents.render-pdf/);
    await expect(
      startWorker({
        ...base,
        listeners: [],
        schedules: [{ queue: "x.y", cron: "* * * * *", timeZone: "India/Mumbai", handle: () => Promise.resolve() }],
      }),
    ).rejects.toThrow(/unknown time zone/);
  });
});
```

`packages/domain/test/jobs/worker-pg-boss.test.ts`:
```ts
// End to end on real pg-boss: an event published inside db.forOrg() reaches its listener through the relay and a
// pg-boss queue, and a listener that always fails ends in the failed-jobs list after its retries.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listenerJobId, publishEvent, startWorker, type Worker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";

async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("worker on pg-boss", () => {
  const delivered = recordingListener("documents.render-pdf", "document.issued");
  const broken = recordingListener("notifications.deliver", "notification.created");
  let platform: PlatformClient;
  let db: Database;
  let jobs: PgBossJobs;
  let worker: Worker;
  let organizationId: string;
  const errors: unknown[] = [];

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Worker on pg-boss");
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      // One quick retry, so a failing listener reaches the failed list within the test.
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
      onError: (error) => errors.push(error),
    });
    await jobs.start();
    broken.failuresLeft = Number.POSITIVE_INFINITY;
    worker = await startWorker({
      db,
      runner: jobs,
      queue: jobs,
      listeners: [delivered, broken],
      relay: { intervalMs: 100, organizationIds: [organizationId] },
      onError: (error) => errors.push(error),
    });
  });

  afterAll(async () => {
    await worker.stop();
    await jobs.stop();
    await db.disconnect();
    await platform.$disconnect();
    expect(errors).toEqual([]);
  });

  it("delivers an event published in an organization to its listener", async () => {
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "p1" } }),
    );
    await eventually(() => delivered.handled.some((event) => event.id === eventId));
    expect(delivered.handled.find((event) => event.id === eventId)).toMatchObject({
      organizationId,
      payload: { documentId: "p1" },
    });
  });

  it("lists a listener's job as failed after its retries", async () => {
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "notification.created", payload: { notificationId: "n1" } }),
    );
    const jobId = listenerJobId("notifications.deliver", eventId);
    await eventually(async () => (await jobs.failedJobs()).some((job) => job.id === jobId));
    expect((await jobs.failedJobs()).find((job) => job.id === jobId)).toMatchObject({
      queue: "notifications.deliver",
      data: { organizationId, eventId, eventType: "notification.created" },
      attempts: 2,
      error: "notifications.deliver failed on purpose",
    });
    expect(broken.handled).toEqual([]);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/jobs`

Expected: FAIL. `runListenerJob is not a function` and `startWorker is not a function`.

- [ ] **Step 4: Give the pg-boss adapter a retry-policy setting**

In `packages/integrations/src/jobs/pg-boss-jobs.ts`, replace:
```ts
import { defaultRetryPolicy } from "./retry-policy.js";
```
with:
```ts
import { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
```
Replace:
```ts
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
```
with:
```ts
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
  /** How the queues this instance creates retry failed jobs. Tests shorten it; production keeps the default. */
  retryPolicy?: RetryPolicy;
```
And replace:
```ts
  // pg-boss 12 needs a queue to exist before jobs are sent to or worked from it. Creating one is idempotent.
  const queues = new Map<string, Promise<void>>();
  function ensureQueue(name: string): Promise<void> {
    assertQueueName(name);
    let created = queues.get(name);
    if (!created) {
      created = boss.createQueue(name, {
        retryLimit: defaultRetryPolicy.retryLimit,
        retryDelay: defaultRetryPolicy.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: defaultRetryPolicy.retryDelayMaxSeconds,
      });
```
with:
```ts
  // pg-boss 12 needs a queue to exist before jobs are sent to or worked from it. Creating one is idempotent, and an
  // existing queue keeps the policy it was created with.
  const retryPolicy = settings.retryPolicy ?? defaultRetryPolicy;
  const queues = new Map<string, Promise<void>>();
  function ensureQueue(name: string): Promise<void> {
    assertQueueName(name);
    let created = queues.get(name);
    if (!created) {
      created = boss.createQueue(name, {
        retryLimit: retryPolicy.retryLimit,
        retryDelay: retryPolicy.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: retryPolicy.retryDelayMaxSeconds,
      });
```

- [ ] **Step 5: Write the listener runner and the worker**

`packages/domain/src/jobs/run-listener.ts`:
```ts
// Runs one listener on one event, in the event's organization, at most once per event (spec 9.1). The worker calls
// it for each job the relay queued.
import type { Database } from "@travel-crm/db";
import type { JobData } from "@travel-crm/integrations/jobs";
import { systemActor } from "../kernel/index.js";
import type { DomainEvent, EventListener, EventPayload } from "./events.js";
import type { ListenerJobData } from "./relay.js";

export type ListenerRunOutcome = "handled" | "already-handled" | "event-not-found";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The job's data as the relay wrote it. A job that doesn't match its listener is a bug, so it fails loudly. */
function listenerJobData(data: JobData, listener: EventListener): ListenerJobData {
  const { organizationId, eventId, eventType } = data;
  if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
    throw new TypeError(`${listener.name} job has no valid organizationId`);
  }
  if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) {
    throw new TypeError(`${listener.name} job has no valid eventId`);
  }
  if (eventType !== listener.eventType) {
    throw new TypeError(`${listener.name} listens to ${listener.eventType}, not ${String(eventType)}`);
  }
  return { organizationId, eventId, eventType };
}

/** The table's CHECK makes every payload an object; anything else here means the row was changed by hand. */
function eventPayload(value: unknown): EventPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("An outbox event's payload must be a JSON object");
  }
  return value as EventPayload;
}

/**
 * Runs listener on the job's event unless it already has. The event is read inside forOrg(job's organization), so a
 * job naming the wrong organization finds nothing ("event-not-found", not retried). The listener runs outside any
 * transaction, with a forOrg of its own for its writes; then the run is recorded. A listener that throws rejects,
 * and the job is retried with backoff. A crash after the listener but before the record runs it again.
 */
export async function runListenerJob({
  db,
  listener,
  data,
}: {
  db: Database;
  listener: EventListener;
  data: JobData;
}): Promise<ListenerRunOutcome> {
  const job = listenerJobData(data, listener);
  const found = await db.forOrg(job.organizationId, async (tx) => {
    const processed = await tx.processedEvent.findUnique({
      where: {
        organizationId_listener_eventId: {
          organizationId: job.organizationId,
          listener: listener.name,
          eventId: job.eventId,
        },
      },
    });
    if (processed) return "already-handled" as const;
    return (await tx.outboxEvent.findUnique({ where: { id: job.eventId } })) ?? ("event-not-found" as const);
  });
  if (typeof found === "string") return found;

  const event: DomainEvent = {
    id: found.id,
    organizationId: found.organizationId,
    type: found.type,
    payload: eventPayload(found.payload),
    occurredAt: found.occurredAt,
  };
  await listener.handle(event, {
    actor: systemActor(job.organizationId),
    forOrg: (fn) => db.forOrg(job.organizationId, fn),
  });
  // skipDuplicates: if two runs raced, the second record is a no-op rather than an error that would retry the job.
  await db.forOrg(job.organizationId, (tx) =>
    tx.processedEvent.createMany({ data: [{ listener: listener.name, eventId: job.eventId }], skipDuplicates: true }),
  );
  return "handled";
}
```

`packages/domain/src/jobs/worker.ts`:
```ts
// The worker (spec 9.1): runs every listener, plain job handler and scheduled job, and the outbox relay. The api's
// `worker` command builds the adapters and calls startWorker; it also stops the job runner it built.
import type { Database } from "@travel-crm/db";
import type { JobData, JobQueue, JobRunner } from "@travel-crm/integrations/jobs";
import type { EventListener } from "./events.js";
import { startOutboxRelay } from "./relay.js";
import { runListenerJob } from "./run-listener.js";

/**
 * Work on a queue that isn't a domain event, such as a webhook to process (no organization is known yet). Its job
 * data holds ids; the handler reads the rest and enters the right organization itself.
 */
export interface JobHandler {
  readonly queue: string;
  handle(data: JobData): Promise<void>;
}

/** A job the runner starts on a cron schedule, read in an IANA time zone, e.g. "15 2 * * *" in "Asia/Kolkata". */
export interface ScheduledJob {
  readonly queue: string;
  readonly cron: string;
  readonly timeZone: string;
  readonly data?: JobData;
  handle(data: JobData): Promise<void>;
}

export interface WorkerDependencies {
  db: Database;
  /** Runs handlers for queues; pg-boss in the worker. */
  runner: JobRunner;
  /** Where the relay queues listeners' jobs; the same pg-boss. */
  queue: JobQueue;
  listeners: readonly EventListener[];
  handlers?: readonly JobHandler[];
  schedules?: readonly ScheduledJob[];
  relay?: {
    /** Wait between relay passes that found nothing (default 1 s). */
    intervalMs?: number;
    /** Relay only these organizations. Tests only: by default the relay finds every organization's events. */
    organizationIds?: readonly string[];
  };
  /** Where the relay's errors go. Job failures go to the runner's retries and failed list instead. */
  onError?: (error: unknown) => void;
}

export interface Worker {
  /** Stops the relay after its current pass. Stop the runner (pg-boss) afterwards; it finishes running jobs. */
  stop(): Promise<void>;
}

function assertTimeZone(timeZone: string, queue: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new RangeError(`Schedule ${queue} has an unknown time zone ${JSON.stringify(timeZone)}`);
  }
}

export async function startWorker(dependencies: WorkerDependencies): Promise<Worker> {
  const { db, runner, queue, listeners, handlers = [], schedules = [] } = dependencies;
  const queues = [
    ...listeners.map((listener) => listener.name),
    ...handlers.map((handler) => handler.queue),
    ...schedules.map((schedule) => schedule.queue),
  ];
  const repeated = queues.filter((name, index) => queues.indexOf(name) !== index);
  if (repeated.length > 0) throw new Error(`Two kinds of work share the queue ${repeated.join(", ")}`);
  for (const schedule of schedules) assertTimeZone(schedule.timeZone, schedule.queue);

  for (const listener of listeners) {
    await runner.work(listener.name, async (job) => {
      await runListenerJob({ db, listener, data: job.data });
    });
  }
  for (const handler of handlers) {
    await runner.work(handler.queue, (job) => handler.handle(job.data));
  }
  for (const schedule of schedules) {
    await runner.work(schedule.queue, (job) => schedule.handle(job.data));
    await runner.schedule(schedule.queue, schedule.cron, {
      timeZone: schedule.timeZone,
      ...(schedule.data === undefined ? {} : { data: schedule.data }),
    });
  }

  const relay = startOutboxRelay({
    db,
    queue,
    listeners,
    ...(dependencies.relay?.intervalMs === undefined ? {} : { intervalMs: dependencies.relay.intervalMs }),
    ...(dependencies.relay?.organizationIds === undefined
      ? {}
      : { organizationIds: dependencies.relay.organizationIds }),
    ...(dependencies.onError === undefined ? {} : { onError: dependencies.onError }),
  });
  return { stop: () => relay.stop() };
}
```

`packages/domain/src/jobs/index.ts`:
```ts
// Public API of the jobs module: domain events, their listeners, and the relay that queues them (spec 9.1).
export {
  assertEventType,
  defineListener,
  type DomainEvent,
  type EventListener,
  type EventPayload,
  type JsonValue,
  type ListenerContext,
  type PayloadSchema,
} from "./events.js";
export { listenerJobId } from "./listener-job-id.js";
export { publishEvent } from "./publish-event.js";
export {
  organizationsWithEventsWaiting,
  relayOutbox,
  startOutboxRelay,
  type ListenerJobData,
  type OutboxRelay,
  type RelayDependencies,
} from "./relay.js";
export { runListenerJob, type ListenerRunOutcome } from "./run-listener.js";
export { startWorker, type JobHandler, type ScheduledJob, type Worker, type WorkerDependencies } from "./worker.js";
```

`packages/domain/src/jobs/README.md`:
```markdown
# jobs

Domain events and the work the worker does after a change commits (spec 9.1).

## Public functions and values (`index.ts`)

- `publishEvent(tx, { type, payload })`: writes an event to the outbox inside the change's own transaction and returns
  its id. The event exists exactly when the change commits.
- `defineListener({ name, eventType, payload, handle })`: a listener whose handler gets the payload checked by
  `payload` (a Zod schema from `@travel-crm/contracts`). `name` is also its job queue, e.g. `documents.render-pdf`.
- `relayOutbox({ db, queue, listeners, batchSize?, organizationsPerPass?, organizationIds? })`: one pass of the outbox
  relay. For each waiting event it queues a job on the queue of every listener of that event type, with data
  `{ organizationId, eventId, eventType }` and the id `listenerJobId(listener, event)`, then marks the event relayed.
  Returns how many events it relayed.
- `startOutboxRelay({ ...those, intervalMs?, onError? })`: the relay in a loop, for the worker; `stop()` ends it.
- `listenerJobId(listenerName, eventId)`: the deterministic job id, so relaying an event twice queues it once.
- `organizationsWithEventsWaiting(db, limit)`: the organizations with events waiting, oldest first (ids only).
- `runListenerJob({ db, listener, data })`: runs one listener on the event a relayed job names, in that event's
  organization, unless `processed_event` says it already has: `"handled"`, `"already-handled"` or
  `"event-not-found"` (a job naming the wrong organization finds nothing under row-level security).
- `startWorker({ db, runner, queue, listeners, handlers?, schedules?, relay?, onError? })`: what the `worker` command
  runs. Every listener's queue gets `runListenerJob`; each `JobHandler` (`{ queue, handle(data) }`, work with no
  organization yet, such as webhooks) and `ScheduledJob` (`{ queue, cron, timeZone, data?, handle(data) }`) gets its
  queue; then the relay starts. `stop()` stops the relay; the caller stops pg-boss after it.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`,
  `ListenerRunOutcome`, `JobHandler`, `ScheduledJob`, `Worker`, `WorkerDependencies`.

## Adding a listener

1. Define it with `defineListener({ name: "<module>.<what it does>", eventType, payload: <Zod schema>, handle })`,
   in the module that reacts. Its name is its job queue: lower case, dots between parts, unique.
2. Pass it to `startWorker`'s `listeners` in the api's `worker` command. The relay queues its jobs from then on.
3. Make it safe to run twice. Its database writes go through `context.forOrg`; anything outside the database (an
   email, an upload) may repeat after a crash between doing it and recording the run.

Queue names follow the same rule for plain handlers and schedules (`webhooks.process`, `rate-limits.purge`).

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run at least once and are keyed by event id. Make any work outside the database (an email, an upload)
  safe to repeat.
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
- Don't test that an event stays unrelayed after its transaction commits: a relay running in another test (or the
  worker) may relay it at once. Read it back inside the publishing transaction instead. And in tests, always give
  the relay `organizationIds`: one that looks at every organization takes other test files' events.
- The relay finds waiting organizations through `app_organizations_with_unrelayed_events`, the one SECURITY DEFINER
  function (ids only, ADR 0010); it reads the events themselves inside `forOrg`.
- A failing job is retried 5 times with exponential backoff from 10 seconds, then lands in pg-boss's failed list
  (`PgBossJobs.failedJobs()`, shown in the platform console in plan 4).
- Upgrading pg-boss: a new version may change its schema. Generate a migration from
  `getMigrationPlans("pgboss", <current schema version>)` (the version is in `pgboss.version`), like
  `20261015100000_pgboss`, and apply it before the new worker starts (ADR 0010).
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/jobs`

Expected: 24 tests pass in 6 files. The pg-boss test's `afterAll` also checks that neither pg-boss nor the relay
reported an error.

- [ ] **Step 7: Record the decision**

`docs/adr/0010-jobs-and-the-worker.md`:
```markdown
# 0010: Jobs and the worker

Date: 2026-10-15 · Status: accepted · Implements spec section 9.1

## Decision

- **pg-boss 12.37.1 in Postgres**, in its own schema `pgboss`, behind the `JobQueue` and `JobRunner` ports
  (`@travel-crm/integrations/jobs`, ADR 0008). No queue server.
- **Our migrations create pg-boss's schema.** Migration `20261015100000_pgboss` is pg-boss's own construction SQL,
  generated by `getConstructionPlans("pgboss")` (sha256 `e0cc78ee2a2fed4b42d479a9ae2af65e2ca5b21f980afa41fb880e2eb6ffebbb`),
  plus grants: `app_runtime` uses the schema's tables and functions, and default privileges cover what later pg-boss
  migrations add. pg-boss itself runs as `app_runtime` with `migrate: false, createSchema: false`. Prisma's drift
  check looks only at `public`, so it ignores `pgboss`.
- **One queue per listener.** The relay queues a job on the listener's queue (`documents.render-pdf`) for each event
  of its type, with data `{ organizationId, eventId, eventType }` and a job id derived from the listener and the
  event (`listenerJobId`), which pg-boss accepts once: relaying an event twice queues nothing new.
- **The relay polls.** `startOutboxRelay` runs in the worker: one pass relays up to 100 events per organization, then
  sets `relayed_at`; it goes straight on while events are waiting and otherwise waits a second. Several worker
  copies share the work through `FOR UPDATE SKIP LOCKED`.
- **One SECURITY DEFINER function**, `app_organizations_with_unrelayed_events(max)`: the relay's only look across
  organizations. It returns organization ids, oldest waiting first, and nothing else; `app_runtime` alone may call it.
  The relay then reads each organization's events inside `db.forOrg()`. The schema check allows exactly this one.
- **Listeners run once per event** (`runListenerJob`): `processed_event` records `(organization, listener, event)`
  after a run, and a run that finds its record skips. The event is read inside `forOrg(job's organization)`, so a job
  that names the wrong organization finds nothing. Listeners run outside a transaction and use `context.forOrg` for
  their writes, as the system actor (`source: "job"`).
- **Failures**: a rejected handler fails that attempt; pg-boss retries it 5 times with exponential backoff from
  10 seconds (at most an hour apart), then marks it failed. `PgBossJobs.failedJobs()` lists failed jobs, newest first,
  with their last error message: data access for the platform console (plan 4).
- **Scheduled jobs**: `ScheduledJob` = queue, cron expression, IANA time zone, data and handler. `startWorker` gives
  it a handler and registers the schedule with pg-boss, which starts the job at that time in that zone.
- **The worker** is `startWorker({ db, runner, queue, listeners, handlers, schedules })`, run by the api's `worker`
  command (same image, spec 9.1). It also takes plain `JobHandler`s for work with no organization yet (webhooks).

## Context

- **Why our migrations, not pg-boss's own.** The api and worker connect as `app_runtime`, which owns nothing and can't
  create schemas; migrations run once, as the migrator, before traffic moves (spec 12.3). pg-boss's `migrate: true`
  would need the migrator's credentials in every worker.
- **Why polling and not LISTEN/NOTIFY.** NOTIFY needs a session-pinned connection, which a transaction-mode pooler
  (spec 12.3) doesn't give. A one-second poll is one small indexed query per worker copy.
- **Why a SECURITY DEFINER function.** Row-level security hides every organization's events from a transaction with
  no organization, by design. The alternatives were polling every organization (one transaction each, every
  second) or a table outside row-level security. The function reveals only ids, which `app_runtime` can already read
  from `organization`.
- **Why job data holds ids only.** pg-boss's tables have no row-level security; anything personal stays in the
  organization's own tables and is read inside `forOrg`.

## Consequences

- A listener runs at least once: a crash after its work and before its record runs it again. Database work in
  `context.forOrg` should be idempotent; email and uploads may repeat.
- A test must not expect an event to stay unrelayed once committed, and every relay in a test names its
  organizations (`organizationIds`): test files share a database.
- Upgrading pg-boss means a migration generated from `getMigrationPlans("pgboss", <schema version>)` before the new
  worker starts. With `migrate: false`, pg-boss refuses to run on a schema version it doesn't expect.
- Completed jobs are deleted after 7 days and failed ones kept until then (pg-boss defaults); `processed_event` keeps
  the record that matters.
```

Don't add it to `docs/adr/README.md`: the Integration task adds every track's ADR to the index at once.

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-jobs && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server=72 api=5 brand=3 contracts=18 db=120 domain=139 eslint-config=65
integrations=15.

```bash
cd /Users/ak/personal/travel-crm-03-jobs
git add docs/adr/0010-jobs-and-the-worker.md packages/db/prisma/migrations/20261015100200_processed_event/migration.sql packages/db/prisma/schema/jobs.prisma packages/db/test/org-table-fixtures/jobs.ts packages/domain/src/jobs/README.md packages/domain/src/jobs/index.ts packages/domain/src/jobs/run-listener.ts packages/domain/src/jobs/worker.ts packages/domain/test/jobs/run-listener.test.ts packages/domain/test/jobs/worker-pg-boss.test.ts packages/domain/test/jobs/worker.test.ts packages/integrations/src/jobs/pg-boss-jobs.ts
git commit -m "feat(domain): run each listener once per event in its organization, and the worker that runs them"
```

**For the Integration task:** the `worker` command builds `createPgBossJobs({ connectionString: DATABASE_URL })`,
calls `start()`, then `startWorker({ db, runner: jobs, queue: jobs, listeners, handlers, schedules })`; on SIGTERM it
calls `worker.stop()` then `jobs.stop()`. The api process needs only the queue side (`createPgBossJobs(...).start()`
for `send`, e.g. the webhook intake). `ProcessedEvent` gets its `organization` relation there. No environment variable
is new: pg-boss uses `DATABASE_URL` (the `app_runtime` role).

---

## Track F: Files

- **Delivers:** the S3 storage adapter (MinIO locally), and the files module: one `attachment` table linking a stored file to any record, presigned uploads and downloads, a confirm step, sensitive files behind `documents:view_sensitive`, and storage counted per organization (spec 9.2, spec 5).
- **Branch:** `foundation/03-files`, worktree `/Users/ak/personal/travel-crm-03-files`, from `foundation/03-shared-services` after Task 0.2. Migration `20261015110000_attachments`; ADR 0011.
- **Depends on:** Task 0 only. The Documents track merges this branch after Task F2, so F2's public API (`createFiles`, `Files`) must not change without telling that track.

---

### Task F1: The S3 storage adapter

The storage port from Task 0.1 gets its real adapter: `createS3Storage` for AWS S3 or any S3-compatible server. One contract test runs the same cases against the in-memory adapter and against S3 on MinIO in a container, so every other track's tests, which use the in-memory adapter, rely on behaviour proven to match S3: a presigned upload of another size or type is refused, a missing key is `null`, server-made files read back.

Two things this task has already found out, so the code handles them:
- MinIO no longer publishes images. Tests use the community build `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (multi-arch, same server). Docker pulls it on the first run.
- By default the AWS SDK signs a CRC32 checksum of an empty body into presigned uploads (`x-amz-checksum-crc32=AAAAAA==`). MinIO ignores it, but real S3 refuses the actual file. The client is created with `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`.

**Files:**
- Create: `packages/integrations/src/storage/s3-storage.ts`
- Modify: `packages/integrations/src/storage/index.ts`
- Create: `packages/integrations/test/support/minio.ts`, `packages/integrations/test/storage/object-storage-contract.ts`, `packages/integrations/test/storage/s3-storage.test.ts`
- Modify: `packages/integrations/test/storage/memory-storage.test.ts` (now runs the shared contract)

**Interfaces:**
- Consumes (Task 0.1): `ObjectStorage`, `PresignedUpload`, `StoredObject`, `createMemoryStorage(now?)` and `MemoryStorage.upload(upload, body, contentType)` from `@travel-crm/integrations/storage`; `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` 3.1150.0 and `testcontainers` 12.2.1, already installed in `packages/integrations`.
- Produces:
  - `interface S3StorageSettings { endpoint?: string | undefined; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle?: boolean | undefined }`.
  - `createS3Storage(settings: S3StorageSettings): ObjectStorage`, exported from `@travel-crm/integrations/storage`:
    - `presignUpload` signs `content-type` and `content-length`, and returns them as the headers the browser sends;
    - `presignDownload` sets `Content-Disposition: attachment; filename="<ASCII fallback>"; filename*=UTF-8''<name>` (RFC 6266);
    - `head` and `get` return `null` for a missing key instead of throwing.
  - `attachmentDisposition(fileName: string): string` (exported from `s3-storage.ts` only).
  - Test support: `MINIO_IMAGE`, `interface TestMinio { settings: S3StorageSettings; stop(): Promise<void> }`, `startMinio(bucket?: string): Promise<TestMinio>`; `describeObjectStorage(name, start: () => Promise<StorageUnderTest>)` with `interface StorageUnderTest { storage: ObjectStorage; upload(upload, body, contentType): Promise<void>; stop(): Promise<void> }`.

- [ ] **Step 1: Write the MinIO helper and the failing tests**

`packages/integrations/test/support/minio.ts`:
```ts
// Starts MinIO in a container for the storage adapter's tests, with one empty bucket. MinIO no longer publishes
// images, so this is the community build of the same server (ADR 0011).
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait } from "testcontainers";
import type { S3StorageSettings } from "../../src/storage/index.js";

export const MINIO_IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";

const USER = "minio-test";
const PASSWORD = "minio-test-password";

export interface TestMinio {
  /** Settings for createS3Storage, pointing at the container's bucket. */
  settings: S3StorageSettings;
  stop(): Promise<void>;
}

export async function startMinio(bucket = "files"): Promise<TestMinio> {
  const container = await new GenericContainer(MINIO_IMAGE)
    .withEnvironment({ MINIO_ROOT_USER: USER, MINIO_ROOT_PASSWORD: PASSWORD })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`;
  const settings: S3StorageSettings = {
    endpoint,
    region: "ap-south-1",
    bucket,
    accessKeyId: USER,
    secretAccessKey: PASSWORD,
    forcePathStyle: true,
  };
  const admin = new S3Client({
    endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: USER, secretAccessKey: PASSWORD },
  });
  try {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    admin.destroy();
  }
  return {
    settings,
    stop: async () => {
      await container.stop();
    },
  };
}
```

The contract every adapter shares. It isn't a `.test.ts` file: each adapter's test file calls it.

`packages/integrations/test/storage/object-storage-contract.ts`:
```ts
// The behaviour every ObjectStorage adapter shares, run against each one: the in-memory adapter that other tests
// rely on is proven to act like S3 where it matters.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ObjectStorage, PresignedUpload } from "../../src/storage/index.js";

export interface StorageUnderTest {
  storage: ObjectStorage;
  /** Plays the browser: sends the file to the presigned URL. Rejects when storage refuses it. */
  upload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void>;
  stop(): Promise<void>;
}

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (body: Uint8Array | null) => (body ? new TextDecoder().decode(body) : null);

/** Every adapter's test calls this once, with a way to start the adapter (and its server, if any). */
export function describeObjectStorage(name: string, start: () => Promise<StorageUnderTest>): void {
  describe(`${name}: the storage port`, () => {
    let subject: StorageUnderTest;
    let next = 0;
    const freshKey = () => `organizations/contract/attachments/${String((next += 1))}`;

    beforeAll(async () => {
      subject = await start();
    });

    afterAll(async () => {
      await subject.stop();
    });

    it("accepts an upload that matches its signature, and reads it back", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "application/pdf", sizeBytes: 5 }, 60);
      expect(upload.method).toBe("PUT");
      expect(upload.headers).toMatchObject({ "content-type": "application/pdf", "content-length": "5" });
      expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await subject.upload(upload, bytes("hello"), "application/pdf");

      expect(await subject.storage.head(key)).toEqual({ sizeBytes: 5, contentType: "application/pdf" });
      expect(text(await subject.storage.get(key))).toBe("hello");
    });

    it("refuses an upload of another size", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
      await expect(subject.upload(upload, bytes("hello, world"), "image/png")).rejects.toThrow();
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("refuses an upload of another type", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
      await expect(subject.upload(upload, bytes("hello"), "text/html")).rejects.toThrow();
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("stores a file the server made", async () => {
      const key = freshKey();
      await subject.storage.put({ key, contentType: "application/pdf", body: bytes("%PDF-1.3") });
      expect(await subject.storage.head(key)).toEqual({ sizeBytes: 8, contentType: "application/pdf" });
      expect(text(await subject.storage.get(key))).toBe("%PDF-1.3");
    });

    it("answers null, not an error, for a key with nothing stored", async () => {
      expect(await subject.storage.head("organizations/contract/attachments/missing")).toBeNull();
      expect(await subject.storage.get("organizations/contract/attachments/missing")).toBeNull();
    });

    it("presigns a download URL", async () => {
      const url = await subject.storage.presignDownload({ key: freshKey(), fileName: "Quote.pdf" }, 60);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });
  });
}
```

Replace the whole of `packages/integrations/test/storage/memory-storage.test.ts`:

`packages/integrations/test/storage/memory-storage.test.ts`:
```ts
// The in-memory storage behaves like S3 where tests depend on it: the shared contract, plus its own extras (an
// expired upload URL, the download URL's file name).
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../src/storage/index.js";
import { describeObjectStorage } from "./object-storage-contract.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describeObjectStorage("memory storage", () => {
  const storage = createMemoryStorage();
  return Promise.resolve({
    storage,
    upload: (upload, body, contentType) => storage.upload(upload, body, contentType),
    stop: () => Promise.resolve(),
  });
});

describe("memory storage", () => {
  it("refuses an upload after its URL expires", async () => {
    let time = new Date("2026-10-15T10:00:00Z");
    const storage = createMemoryStorage(() => time);
    const upload = await storage.presignUpload({ key: "k", contentType: "image/png", sizeBytes: 5 }, 60);
    time = new Date("2026-10-15T10:01:01Z");
    await expect(storage.upload(upload, bytes("hello"), "image/png")).rejects.toThrow(/expired/);
    expect(await storage.head("k")).toBeNull();
  });

  it("names the file in its download URL", async () => {
    const storage = createMemoryStorage();
    expect(await storage.presignDownload({ key: "doc", fileName: "Quote QT-1.pdf" }, 60)).toContain(
      "name=Quote%20QT-1.pdf",
    );
  });
});
```

`packages/integrations/test/storage/s3-storage.test.ts`:
```ts
// The S3 adapter against a real S3 server (MinIO in a container): the shared contract, and downloads that save
// under the file's own name, whatever its script or punctuation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3Storage, type ObjectStorage, type PresignedUpload } from "../../src/storage/index.js";
import { startMinio, type TestMinio } from "../support/minio.js";
import { describeObjectStorage } from "./object-storage-contract.js";

/** The browser's PUT to a presigned URL. fetch sets content-length from the body itself, as browsers do. */
async function browserUpload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(upload.url, { method: upload.method, headers: { "content-type": contentType }, body });
  if (!response.ok) throw new Error(`Storage refused the upload with ${String(response.status)}`);
}

describeObjectStorage("S3 on MinIO", async () => {
  const minio = await startMinio();
  return { storage: createS3Storage(minio.settings), upload: browserUpload, stop: () => minio.stop() };
});

describe("S3 storage downloads", () => {
  let minio: TestMinio;
  let storage: ObjectStorage;

  beforeAll(async () => {
    minio = await startMinio("downloads");
    storage = createS3Storage(minio.settings);
  });

  afterAll(async () => {
    await minio.stop();
  });

  it("downloads the bytes, saved under the file's name in any script", async () => {
    const key = "organizations/o1/attachments/a1";
    await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF-1.3 visa") });
    const fileName = 'वीज़ा "Asha" (2026).pdf';

    const response = await fetch(await storage.presignDownload({ key, fileName }, 60));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.3 visa");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(disposition).not.toMatch(/filename="[^"]*"[^;]*"/);
    const encoded = /filename\*=UTF-8''(.+)$/.exec(disposition)?.[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(fileName);
  });

  it("refuses a download URL once it has expired", async () => {
    const key = "organizations/o1/attachments/a2";
    await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF") });
    const url = await storage.presignDownload({ key, fileName: "a.pdf" }, 1);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(url)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Docker must be running.

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/storage`

Expected: `s3-storage.test.ts` fails with `TypeError: createS3Storage is not a function` (its contract cases are skipped after the failed `beforeAll`); the memory storage's 8 tests pass. Summary: `1 failed | 1 passed` files, `8 passed | 8 skipped` tests.

- [ ] **Step 3: Write the adapter**

`packages/integrations/src/storage/s3-storage.ts`:
```ts
// The storage port on S3, or any S3-compatible server: AWS S3 in the cloud, MinIO locally (spec 9.2).
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage } from "./object-storage.js";

export interface S3StorageSettings {
  /** Leave out for AWS S3. A local MinIO's address, e.g. http://localhost:59000. */
  endpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Puts the bucket in the path instead of the host name, as MinIO needs. */
  forcePathStyle?: boolean | undefined;
}

/** The headers a presigned upload signs, so storage refuses a file of another size or type. */
const SIGNED_UPLOAD_HEADERS = new Set(["content-type", "content-length"]);

export function createS3Storage(settings: S3StorageSettings): ObjectStorage {
  const config: S3ClientConfig = {
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    forcePathStyle: settings.forcePathStyle ?? false,
    // By default the SDK adds a checksum of the (empty) body to presigned uploads, and S3 then refuses the real one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  if (settings.endpoint !== undefined) config.endpoint = settings.endpoint;
  const client = new S3Client(config);
  const bucket = settings.bucket;

  return {
    async presignUpload({ key, contentType, sizeBytes }, expiresInSeconds) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: SIGNED_UPLOAD_HEADERS,
      });
      return {
        url,
        method: "PUT",
        headers: { "content-type": contentType, "content-length": String(sizeBytes) },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
    },

    async presignDownload({ key, fileName }, expiresInSeconds) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: attachmentDisposition(fileName),
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    async put({ key, contentType, body }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, Body: body }));
    },

    async head(key) {
      try {
        const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: object.ContentLength ?? 0, contentType: object.ContentType ?? null };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

/** S3 answers 404 (NotFound, NoSuchKey) for a key with nothing stored. */
function isMissing(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

/**
 * `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): browsers use the UTF-8 name, so Hindi names and quotes
 * survive; the plain name is an ASCII fallback with anything risky replaced, so it can't break out of its quotes.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
```

`packages/integrations/src/storage/index.ts`:
```ts
// Public API of @travel-crm/integrations/storage: the storage port and its adapters.
export { createMemoryStorage, type MemoryStorage } from "./memory-storage.js";
export type { ObjectStorage, PresignedUpload, StoredObject } from "./object-storage.js";
export { createS3Storage, type S3StorageSettings } from "./s3-storage.js";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations typecheck && pnpm --filter @travel-crm/integrations test`

Expected: 19 tests pass in 3 files: 8 in `memory-storage.test.ts`, 8 in `s3-storage.test.ts` (6 contract cases and 2 download cases, including a Hindi file name with quotes and an expired link answering 403), and Task 0.1's 3 in `memory-job-queue.test.ts`.

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 18, db 111, domain 121, eslint-config 65, integrations 19.

```bash
cd /Users/ak/personal/travel-crm-03-files
git add packages/integrations/src/storage/s3-storage.ts packages/integrations/src/storage/index.ts packages/integrations/test/support/minio.ts packages/integrations/test/storage/object-storage-contract.ts packages/integrations/test/storage/memory-storage.test.ts packages/integrations/test/storage/s3-storage.test.ts
git commit -m "feat(integrations): add the S3 storage adapter, proven against MinIO with the memory adapter"
```

---

### Task F2: Attachments

The files module: one `attachment` table links a stored file to any record (`record_type`, `record_id`), so leads, bookings and issued documents all keep their files the same way. The browser uploads straight to storage with a presigned `PUT`; the api never streams bytes. A row is `pending` until `confirmUpload` finds the promised size and type in storage, and only ready files are listed or downloadable.

Rules this task pins with tests:
- **Storage keys are derived, never stored**: `organizations/<organization id>/attachments/<attachment id>`, from the row's own organization and id. A row can't point at another organization's file.
- **Sensitive files** (passports, Aadhaar) need `documents:view_sensitive` for a download link: Operations, Admin and Owner hold it, Sales and Accounts don't. Trusted server code (share links, in the Integration task) gets links only to ordinary files.
- **Storage is counted per organization**, deleted files included, because their bytes stay stored until a purge. `requestUpload` refuses past the limit `storageLimitBytes` returns; plan 4 passes the plan's limit.
- **Another organization's file is always "not found"**: confirm, list, download and remove.
- **Attachments are soft-deleted** (ADR 0004): `Attachment` joins `softDeleteModels`, and `app_runtime` loses DELETE on the table.

Like every plan 3 track, the model has no `organization` relation yet: the Integration task adds every track's relations and foreign keys to `organization` at once, so no track edits `organization.prisma`.

**Files:**
- Create: `packages/db/prisma/schema/files.prisma`, `packages/db/prisma/migrations/20261015110000_attachments/migration.sql`
- Modify: `packages/db/src/soft-delete.ts`
- Create: `packages/db/test/org-table-fixtures/files.ts`, `packages/db/test/attachments.test.ts`
- Create: `packages/contracts/src/files/attachments.ts`, `packages/contracts/src/files/index.ts`, `packages/contracts/test/files/attachments.test.ts`
- Create: `packages/domain/src/files/` (`dependencies.ts`, `attachment-row.ts`, `uploads.ts`, `downloads.ts`, `attachments.ts`, `files.ts`, `index.ts`, `README.md`)
- Create: `packages/domain/test/files/test-files.ts`, `packages/domain/test/files/uploads.test.ts`, `packages/domain/test/files/downloads.test.ts`
- Create: `docs/adr/0011-files-and-storage.md`

**Interfaces:**
- Consumes:
  - From Task F1: `ObjectStorage`, `PresignedUpload` and, in tests, `createMemoryStorage()` with `MemoryStorage.upload()` and `MemoryStorage.objects`.
  - From Task 0.2: `Actor` and `systemActor(organizationId)` (`@travel-crm/domain/kernel`); `MemberAccess` (an `Actor` with `permissions: PermissionSet`), `PermissionSet`, `starterRoles` and the `documents:view_sensitive` permission (`@travel-crm/domain/identity`); the fixture directory `packages/db/test/org-table-fixtures/` and `OrgTableFixtures`.
  - From plan 2: `Database`, `OrgTx`, `softDeleted(userId)`, `withDeleted(fn)` (`@travel-crm/db`); `createTestOrganization` (`@travel-crm/db/testing`).
- Produces:
  - `@travel-crm/contracts/files`: `requestUploadInput` / `RequestUploadInput` (`recordType`, `recordId`, `fileName`, `contentType`, `sizeBytes`, `sensitive` defaulting to false), `attachmentIdInput` / `AttachmentIdInput`, `attachmentSummary` / `AttachmentSummary` (`id, recordType, recordId, fileName, contentType, sizeBytes, sensitive, status: "pending" | "ready", createdAt` as an ISO string), `presignedUpload` / `PresignedUploadOutput` and `downloadLink` / `DownloadLinkOutput` (`expiresAt` as ISO strings, for routers), `recordType`, `attachmentFileName`, `attachmentContentTypes`, `AttachmentContentType`, `MAX_ATTACHMENT_BYTES` (25 MB).
  - `@travel-crm/domain/files`:
    - `interface FilesDependencies { db: Database; storage: ObjectStorage; storageLimitBytes?: ((organizationId: string) => Promise<number | null>) | undefined }`;
    - `interface GeneratedFile { recordType: string; recordId: string; fileName: string; contentType: string; body: Uint8Array; sensitive?: boolean | undefined }`;
    - `interface DownloadLink { url: string; expiresAt: Date }`;
    - `createFiles(dependencies: FilesDependencies): Files`, where `Files` has:
      - `requestUpload(actor: Actor, input: RequestUploadInput): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }>`;
      - `confirmUpload(actor: Actor, input: { attachmentId: string }): Promise<AttachmentSummary>`;
      - `downloadLink(actor: MemberAccess, input: { attachmentId: string }): Promise<DownloadLink>`;
      - `list(actor: Actor, record: { recordType: string; recordId: string }): Promise<AttachmentSummary[]>`;
      - `remove(actor: Actor, input: { attachmentId: string }): Promise<void>`;
      - `storeGeneratedFile(actor: Actor, file: GeneratedFile): Promise<AttachmentSummary>`;
      - `systemDownloadLink(organizationId: string, input: { attachmentId: string }): Promise<DownloadLink>`;
      - `storageUsedBytes(organizationId: string): Promise<number>`.
  - Refusal reasons: `ATTACHMENT_NOT_FOUND` and `UPLOAD_NOT_FOUND` (NOT_FOUND), `UPLOAD_DOES_NOT_MATCH` and `EMPTY_FILE` (VALIDATION), `MISSING_PERMISSION` and `SENSITIVE_FILE` (FORBIDDEN), `STORAGE_LIMIT_REACHED` (LIMIT_REACHED).
  - The `attachment` table with `@@unique([organizationId, id])`, which the Documents track's `issued_document.pdf_attachment_id` foreign key points at.

- [ ] **Step 1: Write the failing table test**

`packages/db/test/attachments.test.ts`:
```ts
// The attachment table's own rules: record types, sizes and statuses it accepts, and rows the api never deletes.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { HardDeleteError } from "../src/soft-delete.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const file = {
  recordType: "lead",
  recordId: "0199e7a0-0000-7000-8000-0000000000f2",
  fileName: "passport.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
};

describe("attachment table", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Attachments");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("starts pending, and is ready exactly when it has been confirmed", async () => {
    const attachment = await db.forOrg(organizationId, (tx) => tx.attachment.create({ data: file }));
    expect(attachment).toMatchObject({ status: "pending", confirmedAt: null, sensitive: false, organizationId });
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.attachment.update({ where: { id: attachment.id }, data: { status: "ready" } }),
      ),
    ).rejects.toThrow(/attachment_confirmed_when_ready/);
    const ready = await db.forOrg(organizationId, (tx) =>
      tx.attachment.update({ where: { id: attachment.id }, data: { status: "ready", confirmedAt: new Date() } }),
    );
    expect(ready.status).toBe("ready");
  });

  it("refuses unknown statuses, empty files and badly named record types", async () => {
    const create = (data: Partial<typeof file> & { status?: string }) =>
      db.forOrg(organizationId, (tx) => tx.attachment.create({ data: { ...file, ...data } }));
    await expect(create({ status: "uploading" })).rejects.toThrow(/attachment_status_value/);
    await expect(create({ sizeBytes: 0 })).rejects.toThrow(/attachment_size_positive/);
    await expect(create({ recordType: "Issued-Document" })).rejects.toThrow(/attachment_record_type_format/);
  });

  it("is soft-deleted: deletes are refused by the client and by Postgres", async () => {
    const attachment = await db.forOrg(organizationId, (tx) => tx.attachment.create({ data: file }));
    await expect(
      db.forOrg(organizationId, (tx) => tx.attachment.delete({ where: { id: attachment.id } })),
    ).rejects.toBeInstanceOf(HardDeleteError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM attachment WHERE id = ${attachment.id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db exec vitest run test/attachments.test.ts`

Expected: all 3 tests fail, the first with `TypeError: Cannot read properties of undefined (reading 'create')`: there is no `attachment` model yet.

- [ ] **Step 3: Add the table**

`packages/db/prisma/schema/files.prisma`:
```prisma
// Files attached to records (spec 9.2): one table links a stored file to any record. Organization-owned and
// soft-deleted (ADR 0004). The bytes live in object storage under a key made from organization_id and id.
// Its organization relation and foreign key are added with every plan 3 table's, in plan 3's Integration task.

/// A stored file attached to one record: a lead's passport scan, an issued document's PDF.
model Attachment {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String    @id @default(uuid(7)) @db.Uuid
  /// The kind of record, e.g. "issued_document" or "lead" (CHECK attachment_record_type_format).
  recordType     String    @map("record_type")
  recordId       String    @map("record_id") @db.Uuid
  /// The name it downloads as, e.g. "Passport - Asha.pdf".
  fileName       String    @map("file_name")
  contentType    String    @map("content_type")
  /// Counts toward the organization's storage, deleted files included until a purge (CHECK attachment_size_positive).
  sizeBytes      Int       @map("size_bytes")
  /// Traveller ID documents such as passports: viewing needs documents:view_sensitive (spec 5).
  sensitive      Boolean   @default(false)
  /// "pending" until the uploaded file is confirmed in storage, then "ready" (CHECK attachment_status_value).
  status         String    @default("pending")
  /// Who uploaded it; null for files the system made, such as rendered PDFs.
  createdBy      String?   @map("created_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  /// When the file was confirmed in storage; set exactly when status is "ready".
  confirmedAt    DateTime? @map("confirmed_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever deleted it; null when the system did.
  deletedBy      String?   @map("deleted_by") @db.Uuid

  /// Lets other organization tables point at (organization_id, id), e.g. an issued document's PDF.
  @@unique([organizationId, id])
  /// A record's files.
  @@index([organizationId, recordType, recordId])
  @@map("attachment")
}
```

Create the migration from the schema alone, with no database: several tracks are built at once, and a shared local database would show each one the others' tables.

```bash
cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
cd packages/db && mkdir -p prisma/migrations/20261015110000_attachments
pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015110000_attachments/migration.sql
cat prisma/migrations/20261015110000_attachments/migration.sql
```

`HEAD` is Task F1's commit, whose schema is Task 0.2's. Expected: exactly this SQL.

```sql
-- CreateTable
CREATE TABLE "attachment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_organization_id_record_type_record_id_idx" ON "attachment"("organization_id", "record_type", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_organization_id_id_key" ON "attachment"("organization_id", "id");
```

Append this to the end of that `migration.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('attachment');

-- Record types are lower-case words with underscores, e.g. issued_document; sizes are positive; an attachment is
-- pending until its file is confirmed in storage, and confirmed exactly when it is ready.
ALTER TABLE "attachment"
  ADD CONSTRAINT attachment_record_type_format CHECK (record_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT attachment_size_positive CHECK (size_bytes > 0),
  ADD CONSTRAINT attachment_status_value CHECK (status IN ('pending', 'ready')),
  ADD CONSTRAINT attachment_confirmed_when_ready CHECK ((status = 'ready') = (confirmed_at IS NOT NULL));

-- Soft-deleted (ADR 0004): only the platform role's purge removes rows, together with their stored files.
REVOKE DELETE ON TABLE "attachment" FROM app_runtime;
```

In `packages/db/src/soft-delete.ts`, replace:
```ts
export const softDeleteModels: readonly string[] = [Prisma.ModelName.Role, Prisma.ModelName.Member];
```
with:
```ts
export const softDeleteModels: readonly string[] = [
  Prisma.ModelName.Role,
  Prisma.ModelName.Member,
  Prisma.ModelName.Attachment,
];
```

The isolation fixture:

`packages/db/test/org-table-fixtures/files.ts`:
```ts
// Isolation fixtures for the files module: attachments.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  attachment: {
    create: (tx) =>
      tx.attachment.create({
        data: {
          recordType: "isolation_check",
          recordId: "0199e7a0-0000-7000-8000-0000000000f1",
          fileName: "isolation.pdf",
          contentType: "application/pdf",
          sizeBytes: 1,
        },
      }),
  },
};
```

Regenerate the client: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate`

- [ ] **Step 4: Run the database tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db typecheck && pnpm --filter @travel-crm/db test`

Expected: 119 tests pass, including the drift check in the global setup, the 3 table tests, and the isolation suite's 5 checks on `attachment` (its "cannot be deleted" check expects `permission denied`, because `attachment` is now a soft-delete table).

- [ ] **Step 5: Write the failing contract tests**

`packages/contracts/test/files/attachments.test.ts`:
```ts
// The upload input refuses what must never reach storage: unknown file types, oversized or empty files, and names
// that hide folders or disguise their extension.
import { describe, expect, it } from "vitest";
import {
  attachmentIdInput,
  attachmentSummary,
  downloadLink,
  MAX_ATTACHMENT_BYTES,
  requestUploadInput,
} from "../../src/files/index.js";

const passport = {
  recordType: "lead",
  recordId: "0199e7a0-0000-7000-8000-0000000000f2",
  fileName: "Passport - Asha.pdf",
  contentType: "application/pdf",
  sizeBytes: 482_000,
};

describe("file inputs", () => {
  it("accepts a document upload, not sensitive unless said so, with the name trimmed", () => {
    expect(requestUploadInput.parse({ ...passport, fileName: "  Passport - Asha.pdf " })).toEqual({
      ...passport,
      sensitive: false,
    });
    expect(requestUploadInput.parse({ ...passport, sensitive: true }).sensitive).toBe(true);
    expect(
      requestUploadInput.parse({ ...passport, fileName: "पासपोर्ट.jpg", contentType: "image/jpeg" }).fileName,
    ).toBe("पासपोर्ट.jpg");
  });

  it("refuses names with folders, control characters or text-direction tricks", () => {
    for (const fileName of ["../passport.pdf", "a/b.pdf", "a\\b.pdf", "line\nbreak.pdf", "invoice‮fdp.exe", "   "]) {
      expect(requestUploadInput.safeParse({ ...passport, fileName }).success, JSON.stringify(fileName)).toBe(false);
    }
    expect(requestUploadInput.safeParse({ ...passport, fileName: `${"a".repeat(197)}.pdf` }).success).toBe(false);
  });

  it("takes PDFs and photos only", () => {
    for (const contentType of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(requestUploadInput.safeParse({ ...passport, contentType }).success, contentType).toBe(true);
    }
    for (const contentType of ["text/html", "image/svg+xml", "application/octet-stream", "APPLICATION/PDF"]) {
      expect(requestUploadInput.safeParse({ ...passport, contentType }).success, contentType).toBe(false);
    }
  });

  it("takes files from 1 byte to 25 MB", () => {
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 1 }).success).toBe(true);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: MAX_ATTACHMENT_BYTES }).success).toBe(true);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: MAX_ATTACHMENT_BYTES + 1 }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 0 }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 10.5 }).success).toBe(false);
  });

  it("refuses record types the table would refuse, other ids, and unknown keys", () => {
    expect(requestUploadInput.safeParse({ ...passport, recordType: "Issued-Document" }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, recordId: "42" }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, storageKey: "organizations/x" }).success).toBe(false);
    expect(attachmentIdInput.safeParse({ attachmentId: passport.recordId, sensitive: true }).success).toBe(false);
  });
});

describe("file outputs", () => {
  it("describe an attachment and a download link", () => {
    const summary = {
      id: "0199e7a0-0000-7000-8000-0000000000f3",
      recordType: "lead",
      recordId: passport.recordId,
      fileName: "Passport - Asha.pdf",
      contentType: "application/pdf",
      sizeBytes: 482_000,
      sensitive: true,
      status: "ready",
      createdAt: "2026-10-15T09:30:00.000Z",
    };
    expect(attachmentSummary.parse(summary)).toEqual(summary);
    expect(attachmentSummary.safeParse({ ...summary, status: "uploading" }).success).toBe(false);
    expect(
      downloadLink.safeParse({ url: "https://files.example/x", expiresAt: "2026-10-15T09:35:00.000Z" }).success,
    ).toBe(true);
    expect(downloadLink.safeParse({ url: "not a url", expiresAt: "2026-10-15T09:35:00.000Z" }).success).toBe(false);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts test`

Expected: `test/files/attachments.test.ts` fails with `Cannot find module '../../src/files/index.js'`.

- [ ] **Step 6: Write the contracts**

`packages/contracts/src/files/attachments.ts`:
```ts
// Inputs and outputs for files attached to records (spec 9.2): presigned uploads and downloads, and what a file is.
import { z } from "zod";

/** What staff may upload: documents and photos of them. Not SVG or HTML, which can carry scripts. */
export const attachmentContentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export type AttachmentContentType = (typeof attachmentContentTypes)[number];

/** The largest file one upload may be: 25 MB. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** The kind of record a file belongs to, e.g. "issued_document" or "lead". The attachment table checks the same. */
export const recordType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use lower-case letters and underscores");

/**
 * The name a file downloads as. No folders, and no control or text-direction characters: "invoice‮fdp.exe"
 * shows as "invoiceexe.pdf".
 */
export const attachmentFileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((name) => !/[/\\\p{Cc}‪-‮⁦-⁩]/u.test(name), "Use a file name without folders or control characters");

export const requestUploadInput = z.strictObject({
  recordType,
  recordId: z.uuid(),
  fileName: attachmentFileName,
  contentType: z.enum(attachmentContentTypes),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  /** Traveller ID documents (passport, Aadhaar): viewing them needs documents:view_sensitive. */
  sensitive: z.boolean().default(false),
});
export type RequestUploadInput = z.infer<typeof requestUploadInput>;

export const attachmentIdInput = z.strictObject({ attachmentId: z.uuid() });
export type AttachmentIdInput = z.infer<typeof attachmentIdInput>;

export const attachmentSummary = z.object({
  id: z.uuid(),
  recordType: z.string(),
  recordId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  sensitive: z.boolean(),
  /** "pending" until the upload is confirmed in storage. */
  status: z.enum(["pending", "ready"]),
  createdAt: z.iso.datetime(),
});
export type AttachmentSummary = z.infer<typeof attachmentSummary>;

/** Where the browser PUTs the file, with the headers it must send unchanged. */
export const presignedUpload = z.object({
  url: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type PresignedUploadOutput = z.infer<typeof presignedUpload>;

/** A short-lived link that downloads the file. */
export const downloadLink = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type DownloadLinkOutput = z.infer<typeof downloadLink>;
```

`packages/contracts/src/files/index.ts`:
```ts
// Public API of @travel-crm/contracts/files: the Zod schemas for files attached to records.
export * from "./attachments.js";
```

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts typecheck && pnpm --filter @travel-crm/contracts test`

Expected: 24 tests pass.

- [ ] **Step 7: Write the failing module tests**

The test helper builds the module on the test database with in-memory storage, and members holding starter roles without needing sign-in records:

`packages/domain/test/files/test-files.ts`:
```ts
// Builds the files module on the test database with in-memory storage, and members holding starter roles.
import { randomUUID } from "node:crypto";
import type { RequestUploadInput } from "@travel-crm/contracts/files";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import { PermissionSet, starterRoles, type MemberAccess } from "../../src/identity/index.js";

export interface TestFiles {
  files: Files;
  storage: MemoryStorage;
  db: Database;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createTestFiles(options: { storageLimitBytes?: number } = {}): TestFiles {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const platform = createPlatformClient(urls.platform);
  const storage = createMemoryStorage();
  const limit = options.storageLimitBytes;
  const files = createFiles({
    db,
    storage,
    storageLimitBytes: limit === undefined ? undefined : () => Promise.resolve(limit),
  });
  return {
    files,
    storage,
    db,
    platform,
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export function createOrganization(test: TestFiles, name = "Files agency"): Promise<string> {
  return createTestOrganization(test.platform, name);
}

/** A member of the organization holding one of the starter roles, e.g. memberOf(id, "operations"). */
export function memberOf(organizationId: string, roleKey: string): MemberAccess {
  const role = starterRoles.find((starter) => starter.key === roleKey);
  if (!role) throw new Error(`No starter role ${roleKey}`);
  return {
    userId: randomUUID(),
    memberId: randomUUID(),
    organizationId,
    source: "web",
    impersonatedBy: null,
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.of(role.grants),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
}

/** A passport scan for a lead, as the web app would ask to upload it. */
export function passportUpload(overrides: Partial<RequestUploadInput> = {}): RequestUploadInput {
  return {
    recordType: "lead",
    recordId: "0199e7a0-0000-7000-8000-0000000000f2",
    fileName: "Passport - Asha.pdf",
    contentType: "application/pdf",
    sizeBytes: 11,
    sensitive: false,
    ...overrides,
  };
}

export const bytes = (text: string) => new TextEncoder().encode(text);
```

`packages/domain/test/files/uploads.test.ts`:
```ts
// Uploading: the browser sends the file straight to storage, the api confirms it arrived as promised, and every
// organization's files count toward its storage limit, deleted ones included until a purge.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

describe("uploading files", () => {
  let test: TestFiles;
  let organizationId: string;

  beforeAll(async () => {
    test = createTestFiles();
    organizationId = await createOrganization(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("uploads straight to storage under the organization's key, then confirms the file is ready", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment, upload } = await test.files.requestUpload(sales, passportUpload());
    expect(attachment).toMatchObject({ status: "pending", fileName: "Passport - Asha.pdf", sensitive: false });
    expect(upload.headers).toEqual({ "content-type": "application/pdf", "content-length": "11" });
    expect(upload.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);

    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    const confirmed = await test.files.confirmUpload(sales, { attachmentId: attachment.id });

    expect(confirmed).toEqual({ ...attachment, status: "ready" });
    expect([...test.storage.objects.keys()]).toContain(`organizations/${organizationId}/attachments/${attachment.id}`);
    expect(await test.files.confirmUpload(sales, { attachmentId: attachment.id })).toEqual(confirmed);
  });

  it("refuses to confirm a file that never arrived, or arrived different", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await expect(test.files.confirmUpload(sales, { attachmentId: attachment.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "UPLOAD_NOT_FOUND",
    });
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${attachment.id}`,
      contentType: "text/html",
      body: bytes("<script>x()"),
    });
    await expect(test.files.confirmUpload(sales, { attachmentId: attachment.id })).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "UPLOAD_DOES_NOT_MATCH",
    });
    expect(
      await test.files.list(sales, { recordType: "lead", recordId: passportUpload().recordId }),
    ).not.toContainEqual(expect.objectContaining({ id: attachment.id }));
  });

  it("stores a file the server made, ready at once", async () => {
    const stored = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: "0199e7a0-0000-7000-8000-0000000000d1",
      fileName: "DOC-2026-0001.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 rendered"),
    });
    expect(stored).toMatchObject({ status: "ready", sizeBytes: 17, sensitive: false, recordType: "issued_document" });
    expect(await test.storage.get(`organizations/${organizationId}/attachments/${stored.id}`)).toEqual(
      bytes("%PDF-1.3 rendered"),
    );
    await expect(
      test.files.storeGeneratedFile(systemActor(organizationId), {
        recordType: "issued_document",
        recordId: "0199e7a0-0000-7000-8000-0000000000d1",
        fileName: "empty.pdf",
        contentType: "application/pdf",
        body: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "EMPTY_FILE" });
  });
});

describe("the storage limit", () => {
  let test: TestFiles;
  let organizationId: string;

  beforeAll(async () => {
    test = createTestFiles({ storageLimitBytes: 1000 });
    organizationId = await createOrganization(test, "Small plan agency");
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses an upload that would pass the limit, counting deleted files until they are purged", async () => {
    const owner = memberOf(organizationId, "org-owner");
    const { attachment } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 600 }));
    await test.files.remove(owner, { attachmentId: attachment.id });

    expect(await test.files.storageUsedBytes(organizationId)).toBe(600);
    await expect(test.files.requestUpload(owner, passportUpload({ sizeBytes: 401 }))).rejects.toMatchObject({
      code: "LIMIT_REACHED",
      reason: "STORAGE_LIMIT_REACHED",
    });
    const { attachment: fits } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 400 }));
    expect(fits.sizeBytes).toBe(400);
  });
});
```

`packages/domain/test/files/downloads.test.ts`:
```ts
// Downloading: short-lived links, sensitive files only for those allowed to see them, and nothing across
// organizations.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

describe("downloading files", () => {
  let test: TestFiles;
  let organizationId: string;
  let otherOrganizationId: string;

  /** Uploads and confirms a file as the given member. */
  async function uploaded(member: MemberAccess, sensitive: boolean, fileName = "Passport - Asha.pdf") {
    const { attachment, upload } = await test.files.requestUpload(member, passportUpload({ sensitive, fileName }));
    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    return test.files.confirmUpload(member, { attachmentId: attachment.id });
  }

  beforeAll(async () => {
    test = createTestFiles();
    organizationId = await createOrganization(test);
    otherOrganizationId = await createOrganization(test, "Other agency");
  });

  afterAll(async () => {
    await test.close();
  });

  it("gives a five-minute link that downloads the file under its own name", async () => {
    const sales = memberOf(organizationId, "sales");
    const file = await uploaded(sales, false, "Itinerary.pdf");
    const link = await test.files.downloadLink(sales, { attachmentId: file.id });
    expect(link.url).toContain(encodeURIComponent(`organizations/${organizationId}/attachments/${file.id}`));
    expect(link.url).toContain("name=Itinerary.pdf");
    expect(link.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("refuses a link to a file that hasn't arrived yet", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await expect(test.files.downloadLink(sales, { attachmentId: attachment.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "ATTACHMENT_NOT_FOUND",
    });
  });

  it("shows sensitive files only to those holding documents:view_sensitive", async () => {
    const operations = memberOf(organizationId, "operations");
    const passport = await uploaded(operations, true);
    await expect(
      test.files.downloadLink(memberOf(organizationId, "sales"), { attachmentId: passport.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "MISSING_PERMISSION" });
    await expect(
      test.files.downloadLink(memberOf(organizationId, "accounts"), { attachmentId: passport.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "MISSING_PERMISSION" });
    expect((await test.files.downloadLink(operations, { attachmentId: passport.id })).url).toContain(passport.id);
    expect(
      (await test.files.downloadLink(memberOf(organizationId, "org-owner"), { attachmentId: passport.id })).url,
    ).toContain(passport.id);
  });

  it("gives trusted server code a link to an ordinary file, never to a sensitive one", async () => {
    const operations = memberOf(organizationId, "operations");
    const itinerary = await uploaded(operations, false, "Itinerary.pdf");
    const passport = await uploaded(operations, true);
    expect((await test.files.systemDownloadLink(organizationId, { attachmentId: itinerary.id })).url).toContain(
      itinerary.id,
    );
    await expect(test.files.systemDownloadLink(organizationId, { attachmentId: passport.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SENSITIVE_FILE",
    });
  });

  it("lists a record's ready files, sensitive ones marked, removed ones gone", async () => {
    const operations = memberOf(organizationId, "operations");
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000e1" };
    const visa = await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Visa.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-visa"),
      sensitive: true,
    });
    const ticket = await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Ticket.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-ticket"),
    });
    await test.files.requestUpload(operations, passportUpload(record));

    expect((await test.files.list(operations, record)).map((file) => [file.fileName, file.sensitive])).toEqual([
      ["Visa.pdf", true],
      ["Ticket.pdf", false],
    ]);
    await test.files.remove(operations, { attachmentId: ticket.id });
    expect((await test.files.list(operations, record)).map((file) => file.id)).toEqual([visa.id]);
    await expect(test.files.downloadLink(operations, { attachmentId: ticket.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lets another organization neither confirm, list, download nor remove a file", async () => {
    const operations = memberOf(organizationId, "operations");
    const file = await uploaded(operations, false, "Ticket.pdf");
    const outsider = memberOf(otherOrganizationId, "org-owner");
    const notFound = { code: "NOT_FOUND", reason: "ATTACHMENT_NOT_FOUND" };

    await expect(test.files.confirmUpload(outsider, { attachmentId: file.id })).rejects.toMatchObject(notFound);
    await expect(test.files.downloadLink(outsider, { attachmentId: file.id })).rejects.toMatchObject(notFound);
    await expect(test.files.systemDownloadLink(otherOrganizationId, { attachmentId: file.id })).rejects.toMatchObject(
      notFound,
    );
    await expect(test.files.remove(outsider, { attachmentId: file.id })).rejects.toMatchObject(notFound);
    expect(await test.files.list(outsider, { recordType: file.recordType, recordId: file.recordId })).toEqual([]);
    expect((await test.files.downloadLink(operations, { attachmentId: file.id })).url).toContain(file.id);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/files`

Expected: both files fail with `Cannot find module '../../src/files/index.js' imported from …/test/files/test-files.ts`.

- [ ] **Step 8: Write the files module**

The shared shapes live apart from `files.ts`, so the operation files don't import the file that imports them (dependency-cruiser counts type-only cycles).

`packages/domain/src/files/dependencies.ts`:
```ts
// What the files module is built from, and the shapes its operations share.
import type { Database } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";

export interface FilesDependencies {
  db: Database;
  storage: ObjectStorage;
  /** The organization's storage limit in bytes, or null for none. Plan 4 passes its plan's limit; unset means none. */
  storageLimitBytes?: ((organizationId: string) => Promise<number | null>) | undefined;
}

/** A file the server made itself, such as a rendered PDF. */
export interface GeneratedFile {
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
  sensitive?: boolean | undefined;
}

/** A short-lived link that downloads a file. */
export interface DownloadLink {
  url: string;
  expiresAt: Date;
}
```

`packages/domain/src/files/attachment-row.ts`:
```ts
// How the files module reads an attachment row, where its bytes live, and what callers see of it.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

/** The columns the module reads. */
export const attachmentFields = {
  organizationId: true,
  id: true,
  recordType: true,
  recordId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  sensitive: true,
  status: true,
  createdAt: true,
} as const;

export interface AttachmentRow {
  organizationId: string;
  id: string;
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sensitive: boolean;
  status: string;
  createdAt: Date;
}

/**
 * Where an attachment's bytes live. Made from the row's own organization and id, never stored, so no row can point
 * at another organization's file.
 */
export function storageKeyOf(row: { organizationId: string; id: string }): string {
  return `organizations/${row.organizationId}/attachments/${row.id}`;
}

export function toSummary(row: AttachmentRow): AttachmentSummary {
  return {
    id: row.id,
    recordType: row.recordType,
    recordId: row.recordId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sensitive: row.sensitive,
    status: row.status === "ready" ? "ready" : "pending",
    createdAt: row.createdAt.toISOString(),
  };
}

/** One of this organization's live attachments. Row-level security makes another organization's "not found". */
export async function findAttachment(tx: OrgTx, attachmentId: string): Promise<AttachmentRow> {
  const row = await tx.attachment.findUnique({ where: { id: attachmentId }, select: attachmentFields });
  if (!row) throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
  return row;
}
```

`packages/domain/src/files/uploads.ts`:
```ts
// Getting files into storage: a presigned upload the browser sends itself, the check that it arrived as promised,
// and files the server makes (rendered PDFs).
import type { AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import { DomainError, type Actor } from "../kernel/index.js";
import { attachmentFields, findAttachment, storageKeyOf, toSummary } from "./attachment-row.js";
import type { FilesDependencies, GeneratedFile } from "./dependencies.js";

/** Long enough for a slow phone connection to send 25 MB. */
const UPLOAD_URL_SECONDS = 10 * 60;

/** Bytes the organization keeps in storage: every attachment, deleted ones too, until a purge removes them. */
export async function bytesStored(tx: OrgTx): Promise<number> {
  const totals = await withDeleted(() => tx.attachment.aggregate({ _sum: { sizeBytes: true } }));
  return totals._sum.sizeBytes ?? 0;
}

export async function requestUpload(
  { db, storage, storageLimitBytes }: FilesDependencies,
  actor: Actor,
  input: RequestUploadInput,
): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }> {
  const limit = storageLimitBytes ? await storageLimitBytes(actor.organizationId) : null;
  // A pending upload counts at once, so a burst of uploads can't overshoot the limit by much. Two requests at the
  // same moment may both pass: the limit is a plan's, not a safety rule.
  const row = await db.forOrg(actor.organizationId, async (tx) => {
    if (limit !== null && (await bytesStored(tx)) + input.sizeBytes > limit) {
      throw new DomainError("LIMIT_REACHED", "STORAGE_LIMIT_REACHED", "This organization's file storage is full");
    }
    return tx.attachment.create({
      data: {
        recordType: input.recordType,
        recordId: input.recordId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sensitive: input.sensitive,
        createdBy: actor.userId,
      },
      select: attachmentFields,
    });
  });
  const upload = await storage.presignUpload(
    { key: storageKeyOf(row), contentType: row.contentType, sizeBytes: row.sizeBytes },
    UPLOAD_URL_SECONDS,
  );
  return { attachment: toSummary(row), upload };
}

/** Marks an upload ready once storage holds the promised file. Confirming twice is harmless. */
export async function confirmUpload(
  { db, storage }: FilesDependencies,
  actor: Actor,
  input: { attachmentId: string },
): Promise<AttachmentSummary> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input.attachmentId));
  if (row.status === "ready") return toSummary(row);
  const stored = await storage.head(storageKeyOf(row));
  if (!stored) throw new DomainError("NOT_FOUND", "UPLOAD_NOT_FOUND", "The file hasn't arrived in storage");
  if (stored.sizeBytes !== row.sizeBytes || stored.contentType !== row.contentType) {
    throw new DomainError("VALIDATION", "UPLOAD_DOES_NOT_MATCH", "The stored file isn't the one that was announced");
  }
  return db.forOrg(actor.organizationId, async (tx) => {
    await tx.attachment.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "ready", confirmedAt: new Date() },
    });
    return toSummary(await findAttachment(tx, row.id));
  });
}

/**
 * Stores a file the server made, such as a rendered PDF, ready at once. The row is written first and marked ready
 * after the upload, so storage never holds a file no row accounts for; a failed upload leaves only a pending row,
 * which nobody can list or download.
 */
export async function storeGeneratedFile(
  { db, storage }: FilesDependencies,
  actor: Actor,
  file: GeneratedFile,
): Promise<AttachmentSummary> {
  if (file.body.byteLength === 0) throw new DomainError("VALIDATION", "EMPTY_FILE", "The file is empty");
  const row = await db.forOrg(actor.organizationId, (tx) =>
    tx.attachment.create({
      data: {
        recordType: file.recordType,
        recordId: file.recordId,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.body.byteLength,
        sensitive: file.sensitive ?? false,
        createdBy: actor.userId,
      },
      select: attachmentFields,
    }),
  );
  await storage.put({ key: storageKeyOf(row), contentType: row.contentType, body: file.body });
  return db.forOrg(actor.organizationId, async (tx) =>
    toSummary(
      await tx.attachment.update({
        where: { id: row.id },
        data: { status: "ready", confirmedAt: new Date() },
        select: attachmentFields,
      }),
    ),
  );
}
```

`packages/domain/src/files/downloads.ts`:
```ts
// Getting files out of storage: short-lived links, and sensitive files only for those allowed to see them (spec 5).
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { findAttachment, storageKeyOf, type AttachmentRow } from "./attachment-row.js";
import type { DownloadLink, FilesDependencies } from "./dependencies.js";

/** Short: a link that leaks in a chat or a log stops working within minutes. */
const DOWNLOAD_URL_SECONDS = 5 * 60;

export async function downloadLink(
  { db, storage }: FilesDependencies,
  actor: MemberAccess,
  input: { attachmentId: string },
): Promise<DownloadLink> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input.attachmentId));
  assertReady(row);
  if (row.sensitive && !actor.permissions.has("documents:view_sensitive")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
  }
  return presign(storage, row);
}

/**
 * For server code that has already decided the viewer may see the file, such as a customer's share link. Sensitive
 * files are refused: they go only to staff who hold documents:view_sensitive.
 */
export async function systemDownloadLink(
  { db, storage }: FilesDependencies,
  organizationId: string,
  input: { attachmentId: string },
): Promise<DownloadLink> {
  const row = await db.forOrg(organizationId, (tx) => findAttachment(tx, input.attachmentId));
  assertReady(row);
  if (row.sensitive) {
    throw new DomainError("FORBIDDEN", "SENSITIVE_FILE", "Sensitive files are shown only to staff allowed to see them");
  }
  return presign(storage, row);
}

/** A pending upload hasn't arrived: as far as anyone downloading is concerned, it doesn't exist yet. */
function assertReady(row: AttachmentRow): void {
  if (row.status !== "ready") throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
}

async function presign(storage: ObjectStorage, row: AttachmentRow): Promise<DownloadLink> {
  const expiresAt = new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000);
  const url = await storage.presignDownload({ key: storageKeyOf(row), fileName: row.fileName }, DOWNLOAD_URL_SECONDS);
  return { url, expiresAt };
}
```

`packages/domain/src/files/attachments.ts`:
```ts
// A record's files: listing them, removing one (a soft delete), and the organization's storage used.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { softDeleted } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { attachmentFields, findAttachment, toSummary } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { bytesStored } from "./uploads.js";

/** The record's ready files, oldest first. Sensitive ones are listed, marked, so staff know they exist. */
export async function listAttachments(
  { db }: FilesDependencies,
  actor: Actor,
  record: { recordType: string; recordId: string },
): Promise<AttachmentSummary[]> {
  return db.forOrg(actor.organizationId, async (tx) => {
    const rows = await tx.attachment.findMany({
      where: { recordType: record.recordType, recordId: record.recordId, status: "ready" },
      select: attachmentFields,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toSummary);
  });
}

/** Hides the file (ADR 0004). Its bytes stay in storage, and count, until the platform's purge. */
export async function removeAttachment(
  { db }: FilesDependencies,
  actor: Actor,
  input: { attachmentId: string },
): Promise<void> {
  await db.forOrg(actor.organizationId, async (tx) => {
    await findAttachment(tx, input.attachmentId);
    await tx.attachment.update({
      where: { id: input.attachmentId },
      data: actor.userId === null ? { deletedAt: new Date(), deletedBy: null } : softDeleted(actor.userId),
    });
  });
}

export async function storageUsedBytes({ db }: FilesDependencies, organizationId: string): Promise<number> {
  return db.forOrg(organizationId, bytesStored);
}
```

`packages/domain/src/files/files.ts`:
```ts
// Builds the files module (spec 9.2): files attached to any record, kept in object storage, counted per
// organization. Callers check that the actor may see or change the record itself; this module checks the rest.
import type { AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { listAttachments, removeAttachment, storageUsedBytes } from "./attachments.js";
import type { DownloadLink, FilesDependencies, GeneratedFile } from "./dependencies.js";
import { downloadLink, systemDownloadLink } from "./downloads.js";
import { confirmUpload, requestUpload, storeGeneratedFile } from "./uploads.js";

export interface Files {
  /** Records a pending file and gives the URL the browser uploads it to (10 minutes). */
  requestUpload(
    actor: Actor,
    input: RequestUploadInput,
  ): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }>;
  /** Marks the upload ready once storage holds the promised size and type. */
  confirmUpload(actor: Actor, input: { attachmentId: string }): Promise<AttachmentSummary>;
  /** A 5-minute link to a ready file. Sensitive files need documents:view_sensitive. */
  downloadLink(actor: MemberAccess, input: { attachmentId: string }): Promise<DownloadLink>;
  /** The record's ready files, sensitive ones marked. */
  list(actor: Actor, record: { recordType: string; recordId: string }): Promise<AttachmentSummary[]>;
  /** Soft-deletes the file. */
  remove(actor: Actor, input: { attachmentId: string }): Promise<void>;
  /** Stores a file the server made and returns it ready. */
  storeGeneratedFile(actor: Actor, file: GeneratedFile): Promise<AttachmentSummary>;
  /** A link for trusted server code (share links) to an ordinary file; sensitive files are refused. */
  systemDownloadLink(organizationId: string, input: { attachmentId: string }): Promise<DownloadLink>;
  /** Bytes the organization keeps in storage, deleted files included until a purge. */
  storageUsedBytes(organizationId: string): Promise<number>;
}

export function createFiles(dependencies: FilesDependencies): Files {
  return {
    requestUpload: (actor, input) => requestUpload(dependencies, actor, input),
    confirmUpload: (actor, input) => confirmUpload(dependencies, actor, input),
    downloadLink: (actor, input) => downloadLink(dependencies, actor, input),
    list: (actor, record) => listAttachments(dependencies, actor, record),
    remove: (actor, input) => removeAttachment(dependencies, actor, input),
    storeGeneratedFile: (actor, file) => storeGeneratedFile(dependencies, actor, file),
    systemDownloadLink: (organizationId, input) => systemDownloadLink(dependencies, organizationId, input),
    storageUsedBytes: (organizationId) => storageUsedBytes(dependencies, organizationId),
  };
}
```

`packages/domain/src/files/index.ts`:
```ts
// Public API of the files module: files attached to records, in object storage (spec 9.2).
export type { DownloadLink, FilesDependencies, GeneratedFile } from "./dependencies.js";
export { createFiles, type Files } from "./files.js";
```

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain typecheck && pnpm --filter @travel-crm/domain test`

Expected: 131 tests pass: the 10 new ones in `test/files/` (4 in `uploads.test.ts`, 6 in `downloads.test.ts`), including "shows sensitive files only to those holding documents:view_sensitive" and "lets another organization neither confirm, list, download nor remove a file".

- [ ] **Step 9: Document the module and record the decision**

`packages/domain/src/files/README.md`:
```markdown
# files

Files attached to any record, kept in object storage and counted per organization (spec 9.2). Traveller ID
documents are marked sensitive (spec 5).

## Public functions and values (`index.ts`)

- `createFiles({ db, storage, storageLimitBytes? })` builds the module. `storage` is an `ObjectStorage` from
  `@travel-crm/integrations/storage` (S3 in the api and worker, the in-memory one in tests); `storageLimitBytes`
  gives an organization's limit (plan 4 passes its plan's), and without it there is none. The `Files` it returns has:
  - `requestUpload(actor, input)`: records a pending file and returns it with the presigned upload (10 minutes) the
    browser sends the file to, with the headers it must send unchanged. Refuses `LIMIT_REACHED`/`STORAGE_LIMIT_REACHED`
    past the storage limit;
  - `confirmUpload(actor, { attachmentId })`: marks it ready once storage holds the promised size and type
    (`NOT_FOUND`/`UPLOAD_NOT_FOUND`, `VALIDATION`/`UPLOAD_DOES_NOT_MATCH`); harmless to repeat;
  - `downloadLink(member, { attachmentId })`: a 5-minute link that saves the file under its name; a sensitive file
    needs `documents:view_sensitive` (`FORBIDDEN`/`MISSING_PERMISSION`);
  - `list(actor, { recordType, recordId })`: the record's ready files, sensitive ones marked;
  - `remove(actor, { attachmentId })`: a soft delete;
  - `storeGeneratedFile(actor, file)`: stores a file the server made (a rendered PDF) and returns it ready;
  - `systemDownloadLink(organizationId, { attachmentId })`: for server code that has already decided the viewer may
    see the file (share links); refuses sensitive files (`FORBIDDEN`/`SENSITIVE_FILE`);
  - `storageUsedBytes(organizationId)`.
- Types: `Files`, `FilesDependencies`, `GeneratedFile`, `DownloadLink`. Inputs and outputs are in
  `@travel-crm/contracts/files`.

## Events

None yet.

## Rules worth knowing

- The calling module checks that the actor may see or change the record; this module checks organization,
  readiness and sensitivity. Another organization's file is always "not found".
- A file's storage key is `organizations/<organization id>/attachments/<attachment id>`, made from the row and never
  stored, so a row can't point at another organization's file.
- Pending files (uploads not yet confirmed) are never listed or downloadable.
- Deleted files stay in storage, and count toward the limit, until the platform's purge.
```

`docs/adr/0011-files-and-storage.md`:
```markdown
# 0011: Files and storage

Date: 2026-10-15 · Status: accepted · Implements spec section 9.2 and the sensitive flag of section 5

## Decision

- **Object storage behind the `ObjectStorage` port** (ADR 0008): `createS3Storage` for AWS S3 or any S3-compatible
  server, `createMemoryStorage` for tests. One contract test runs against both, the S3 one on MinIO in a container,
  so tests that use the in-memory adapter rely on checked behaviour.
- **Files go straight between the browser and storage.** An upload is a presigned `PUT` (10 minutes) whose
  `Content-Type` and `Content-Length` are signed: storage refuses a file of another size or type. A download is a
  presigned `GET` (5 minutes) that saves the file under its own name (`Content-Disposition` with an RFC 6266
  `filename*` for names in any script, and a sanitised ASCII fallback). The api never streams file bytes.
- **One `attachment` table links a file to any record** (`record_type`, `record_id`). A row starts `pending` and
  becomes `ready` when `confirmUpload` finds the promised size and type in storage (a check constraint ties `ready`
  to `confirmed_at`). Only ready files are listed or downloadable.
- **Storage keys are derived, not stored**: `organizations/<organization id>/attachments/<attachment id>`. A row
  can't point at another organization's file, because the key comes from the row's own organization and id.
- **Sensitive files** (passports, Aadhaar) have `sensitive = true`; a download link needs `documents:view_sensitive`
  (Owner, Admin and Operations by default). Trusted server code (share links) gets links only to ordinary files.
- **Storage is counted per organization**: every attachment row's size, deleted ones included, because their bytes
  stay stored until a purge. `requestUpload` refuses past the limit that `storageLimitBytes` returns (plan 4 passes
  the plan's limit). Files the server makes (rendered PDFs) count but are never refused: an invoice must render.
- **Attachments are soft-deleted** (ADR 0004): `app_runtime` has no DELETE grant; the platform's purge (plan 4)
  removes rows and their stored files together.
- **Uploads allowed**: PDF, JPEG, PNG, WebP and HEIC, up to 25 MB, names without folders, control or bidi
  characters (`@travel-crm/contracts/files`). SVG and HTML are refused: they can carry scripts.
- **Locally, MinIO** from the community build `pgsty/minio`, because MinIO no longer publishes images. The adapter
  is plain S3, so another S3-compatible image is a one-line swap.
- **The AWS SDK's checksums are off unless required** (`requestChecksumCalculation: "WHEN_REQUIRED"`). Otherwise it
  signs a checksum of an empty body into presigned uploads, which S3 then refuses for the real file.

## Context

- **Why a confirm step.** The api never sees the bytes, so it can't know an upload finished. Until `confirmUpload`
  checks storage, the file is pending and invisible; an abandoned upload leaves a pending row and maybe an object,
  both swept by a later cleanup job.
- **Why server-made files are written row first.** `storeGeneratedFile` inserts a pending row, uploads, then marks
  it ready. A failed upload leaves an invisible pending row rather than a stored file no row accounts for.
- **Why the limit check isn't locked.** Two uploads at the same moment can both pass the check; a plan's storage
  limit is commercial, not a safety rule, and the next upload is refused.

## Consequences

- The bucket needs CORS rules allowing `PUT` from the web app's origin before browsers can upload (plan 5).
- Later: malware scanning before a file becomes ready (spec 9.2), a job that sweeps pending uploads older than a day,
  and the purge (plan 4). Each attachment's record module decides who may attach and see files on its records.
```

Don't add ADR 0011 to `docs/adr/README.md`, or the module to `packages/domain/README.md`: the Integration task adds every track's rows at once.

- [ ] **Step 10: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-files && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 24, db 119, domain 131, eslint-config 65, integrations 19.

```bash
cd /Users/ak/personal/travel-crm-03-files
git add docs/adr/0011-files-and-storage.md packages/contracts/src/files packages/contracts/test/files packages/db/prisma/migrations/20261015110000_attachments packages/db/prisma/schema/files.prisma packages/db/src/soft-delete.ts packages/db/test/attachments.test.ts packages/db/test/org-table-fixtures/files.ts packages/domain/src/files packages/domain/test/files
git commit -m "feat(domain): add attachments with presigned uploads, sensitive files and storage counted"
```

Tell the Documents track that F2 is committed: its Task D2 merges this branch.

---

## Track D: PDFs and issued documents

- **Delivers:** the React-PDF renderer with the brand's fonts and one sample template (D1), and issued documents: numbered, frozen, rendered once by the worker and stored as attachments (D2). Spec 9.3, first half; share links are Track P.
- **Branch:** `foundation/03-documents`, worktree `/Users/ak/personal/travel-crm-03-documents`.
- **Depends on:** Task 0 for D1. **D2 needs the Files track's Task F2** (the `attachment` table and `createFiles`): merge `foundation/03-files` into this branch before starting D2.

---

### Task D1: The PDF renderer and the sample template

The worker renders documents to PDF with React-PDF (spec 9.3), in the brand's fonts: EB Garamond for titles, Figtree for text, IBM Plex Mono for numbers and amounts. Three facts, each found by running it, shape this task:

- The `@fontsource` "latin" files lack ₹ and the "latin-ext" files lack the digits. Each family is registered twice (`Figtree` and `Figtree Ext`) and styles name both; React-PDF then takes each character from the first file that has it.
- fontkit 2.0.4 (inside React-PDF) overruns a WOFF table when a font ends with an empty glyph (IBM Plex Mono's space: "Offset is outside the bounds of the DataView"), and can't subset WOFF2 files at all. So `woff.ts` unpacks each WOFF into the TrueType file it compresses, and React-PDF gets that as a data URL.
- React-PDF draws a character no font has as *other letters*: "होटल" prints as "9K2". A customer's quotation must never say something else, so text outside the fonts' character set is refused before rendering (`printable-text.ts`). The set is what every font has in both weights and what reads back from the PDF as itself; a test renders every character in it.

Templates are written with `createElement`, not JSX: dependency-cruiser's resolver has no `.tsx` extension, so it reports imports of `.tsx` files as unresolvable (see the report to the Integration task).

**Files:**
- Create: `packages/integrations/src/pdf/document-input.ts`, `fonts.ts`, `woff.ts`, `theme.ts`, `printable-text.ts`, `page-parts.ts`, `templates/sample-document.ts`, `render-pdf.ts`, `index.ts`
- Test: `packages/integrations/test/pdf/pdf-text.ts` (helper), `render-pdf.test.ts`, `woff.test.ts`, `printable-text.test.ts`

**Interfaces:**
- Consumes: `brand` from `@travel-crm/brand` (`productName`, `colours`, `fonts`); `@react-pdf/renderer` 4.9.0, `react` 19.3.0, `@fontsource/{eb-garamond,figtree,ibm-plex-mono}` 5.3.0 and, in tests, `unpdf` 1.8.1 (`extractText`, `extractTextItems`), all installed by Task 0.1.
- Produces (`@travel-crm/integrations/pdf`):
  - `renderPdf(template: PdfTemplate, input: PdfInput): Promise<Uint8Array>`. Rejects with `RangeError` ("Accent colours look like #1a2b3c") for an accent colour that isn't `#rrggbb`, and with `UnprintableTextError` for text the fonts can't show, before rendering anything.
  - `type PdfTemplate = "sample"`; `interface PdfInput { data: SampleDocumentData; branding: DocumentBranding }`;
    `interface DocumentBranding { organizationName: string; accentColour?: string | undefined; logo?: { data: Uint8Array; contentType: "image/png" | "image/jpeg" } | undefined; terms?: string | undefined }`;
    `interface SampleDocumentData { title: string; number: string; issuedOn: string; recipient: { name: string; lines: string[] }; rows: { description: string; detail?: string | undefined; amount: string }[]; totals: { label: string; amount: string; emphasis?: boolean | undefined }[]; notes?: string | undefined }`.
  - `printableCharacters(): string[]`, `unprintableCharacters(text: string): string[]`, `class UnprintableTextError extends Error { readonly characters: readonly string[] }`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
git worktree add /Users/ak/personal/travel-crm-03-documents -b foundation/03-documents foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/03-documents` at Task 0.2's commit, and the install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/integrations/test/pdf/pdf-text.ts`:
```ts
// Reads a PDF back as text, the way a person would read it, for checking what a template rendered.
import { extractText, extractTextItems } from "unpdf";

export interface PdfText {
  pages: number;
  /** All pages' text, with runs of whitespace as one space. */
  text: string;
}

/** A run of text on a page and where it sits, in points from the bottom left. */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

export async function pdfText(pdf: Uint8Array): Promise<PdfText> {
  // pdf.js takes over the buffer it is given, so it gets a copy.
  const { totalPages, text } = await extractText(Uint8Array.from(pdf), { mergePages: true });
  return { pages: totalPages, text: text.replaceAll(/\s+/g, " ") };
}

/** The first page's runs of text with their positions, for checking layout. */
export async function firstPageText(pdf: Uint8Array): Promise<PlacedText[]> {
  const { items } = await extractTextItems(Uint8Array.from(pdf));
  return (items[0] ?? []).map((item) => ({ text: item.str, x: item.x, y: item.y, width: item.width }));
}
```

`packages/integrations/test/pdf/render-pdf.test.ts`:
```ts
// The sample template renders the organization's branding and the document's content, pages long documents, and
// refuses an accent colour that isn't a hex colour.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderPdf, type SampleDocumentData } from "../../src/pdf/index.js";
import { firstPageText, pdfText } from "./pdf-text.js";

/** A 1x1 transparent PNG: the smallest valid logo. */
const tinyPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

const sample: SampleDocumentData = {
  title: "Quotation",
  number: "DOC-2026-0042",
  issuedOn: "15 Oct 2026",
  recipient: { name: "Meera Iyer", lines: ["14 Marine Drive", "Mumbai 400002"] },
  rows: [
    { description: "Andaman islands, 6 nights", detail: "2 adults, sea-view room", amount: "₹12,50,000.00" },
    { description: "Airport transfers", amount: "₹8,500.00" },
  ],
  totals: [
    { label: "Taxable value", amount: "₹12,58,500.00" },
    { label: "Total", amount: "₹13,21,425.00", emphasis: true },
  ],
  notes: "Prices hold for seven days.",
};

const branding = {
  organizationName: "Sharma Holidays",
  accentColour: "#034f46",
  terms: "50% to book, the balance 30 days before travel.",
};

describe("renderPdf", () => {
  it("renders the sample with the organization's branding and every part of the document", async () => {
    const pdf = await renderPdf("sample", { data: sample, branding });
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");

    const { pages, text } = await pdfText(pdf);
    expect(pages).toBe(1);
    for (const part of [
      "Sharma Holidays",
      "Quotation",
      "DOC-2026-0042",
      "15 Oct 2026",
      "Meera Iyer",
      "Mumbai 400002",
      "Andaman islands, 6 nights",
      "2 adults, sea-view room",
      "₹12,50,000.00",
      "₹13,21,425.00",
      "Prices hold for seven days.",
      "50% to book, the balance 30 days before travel.",
      `Made with ${brand.productName}`,
      "Page 1 of 1",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("carries a long document over several pages, numbering each", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      description: `Day ${String(index + 1)}: sightseeing`,
      amount: "₹2,500.00",
    }));
    const { pages, text } = await pdfText(await renderPdf("sample", { data: { ...sample, rows }, branding }));
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`Page 1 of ${String(pages)}`);
    expect(text).toContain(`Page ${String(pages)} of ${String(pages)}`);
    expect(text).toContain("Day 60: sightseeing");
  });

  it("keeps a long description inside its column and an amount on one line", async () => {
    const description =
      "Six nights in a sea-view cottage at Havelock with breakfast and dinner, a private transfer from Port Blair " +
      "jetty, a guided snorkelling trip at Elephant beach and a sunset cruise on the last evening";
    const rows = [{ description, amount: "₹1,23,45,67,890.00" }];
    const placed = await firstPageText(await renderPdf("sample", { data: { ...sample, rows }, branding }));

    // ₹ comes from the latin-ext font, so it is its own run: it must sit just left of the digits, on their line.
    const digits = placed.find((item) => item.text.includes("1,23,45,67,890.00"));
    const rupee = placed.find(
      (item) =>
        item.text === "₹" && digits && Math.abs(item.y - digits.y) < 1 && Math.abs(item.x + item.width - digits.x) < 2,
    );
    expect(rupee).toBeDefined();
    const amountStarts = rupee?.x ?? 0;
    const descriptionLines = placed.filter((item) => description.includes(item.text.trim()) && item.text.trim() !== "");
    expect(descriptionLines.length).toBeGreaterThan(1);
    for (const line of descriptionLines) expect(line.x + line.width, line.text).toBeLessThan(amountStarts);
  });

  it("renders a logo, and works without one or without terms", async () => {
    const withLogo = await renderPdf("sample", {
      data: sample,
      branding: { ...branding, logo: { data: tinyPng, contentType: "image/png" } },
    });
    expect(new TextDecoder("latin1").decode(withLogo)).toContain("/Subtype /Image");
    const plain = await pdfText(
      await renderPdf("sample", { data: sample, branding: { organizationName: "Goa Escapes" } }),
    );
    expect(plain.text).toContain("Goa Escapes");
  });

  it("refuses an accent colour that isn't #rrggbb", async () => {
    await expect(
      renderPdf("sample", { data: sample, branding: { ...branding, accentColour: "red; font-size: 400" } }),
    ).rejects.toThrow(/Accent colours look like/);
  });
});
```

`packages/integrations/test/pdf/woff.test.ts`:
```ts
// WOFF fonts are unpacked to plain TrueType before React-PDF sees them, because fontkit misreads some WOFF files
// (IBM Plex Mono's space glyph) and every WOFF2 file it has to subset.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { sfntFromWoff } from "../../src/pdf/woff.js";

const require = createRequire(import.meta.url);
const woff = readFileSync(require.resolve("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff"));

describe("sfntFromWoff", () => {
  it("unpacks every table into a TrueType file with the WOFF's declared size", () => {
    const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
    const tableCount = view.getUint16(12);
    const totalSfntSize = view.getUint32(16);

    const sfnt = sfntFromWoff(woff);
    const out = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    expect(out.getUint32(0)).toBe(view.getUint32(4)); // the WOFF's flavor: TrueType outlines
    expect(out.getUint16(4)).toBe(tableCount);
    expect(sfnt.byteLength).toBe(totalSfntSize);
    const tags = Array.from({ length: tableCount }, (_, index) =>
      new TextDecoder().decode(sfnt.subarray(12 + index * 16, 16 + index * 16)),
    );
    expect(tags).toEqual([...tags].sort());
    expect(tags).toContain("glyf");
  });

  it("refuses a file that isn't WOFF", () => {
    expect(() => sfntFromWoff(new TextEncoder().encode("%PDF-1.7 not a font"))).toThrow(/Not a WOFF font/);
  });
});
```

`packages/integrations/test/pdf/printable-text.test.ts`:
```ts
// The PDF fonts' character set: every character called printable renders and reads back as itself in each font, and
// anything else is caught before rendering, because React-PDF would print other letters in its place.
import { describe, expect, it } from "vitest";
import { printableCharacters, renderPdf, UnprintableTextError, unprintableCharacters } from "../../src/pdf/index.js";
import { pdfText } from "./pdf-text.js";

const minimal = { title: "T", number: "N", issuedOn: "D", recipient: { name: "R", lines: [] }, rows: [], totals: [] };

describe("printable text", () => {
  it("renders every printable character as itself, in the title, text and number fonts", async () => {
    // Spaces would be dropped or merged by the text reader, so they are left out of the comparison. Fifteen at a time
    // fit the amount column on one line: a longer run with no space to break at would run past it.
    const characters = printableCharacters().filter((character) => character.trim() !== "");
    for (let start = 0; start < characters.length; start += 15) {
      const run = characters.slice(start, start + 15).join("");
      const pdf = await renderPdf("sample", {
        data: {
          ...minimal,
          title: run,
          recipient: { name: run, lines: [] },
          rows: [{ description: "x", amount: run }],
        },
        branding: { organizationName: "Printable" },
      });
      const text = (await pdfText(pdf)).text.replaceAll(" ", "");
      // Title font (the title), text font (the recipient) and number font (the amount).
      expect(text.split(run).length - 1, run).toBe(3);
    }
  });

  it("names the characters it can't print, once each, and allows line breaks", () => {
    expect(unprintableCharacters("Hotel होटल, होटल ₹4,000\nPaid ✅")).toEqual(["ह", "ो", "ट", "ल", "✅"]);
    expect(unprintableCharacters("Ūdaipur – “Lake palace” ₹12,50,000…\n")).toEqual([]);
  });

  it("refuses to render a document with text the fonts can't show, rather than print other letters", async () => {
    const hindi = { ...minimal, rows: [{ description: "होटल और नाश्ता", amount: "₹4,000.00" }] };
    const attempt = renderPdf("sample", { data: hindi, branding: { organizationName: "Sharma Holidays" } });
    await expect(attempt).rejects.toBeInstanceOf(UnprintableTextError);
    await expect(attempt).rejects.toThrow(/can't show yet: ह, ो, ट, ल, औ, र, न, ा, श, ्, त/);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/pdf`

Expected: FAIL. `Cannot find module '../../src/pdf/index.js'` (and `../../src/pdf/woff.js`).

- [ ] **Step 4: Write what a template is given, and the fonts**

`packages/integrations/src/pdf/document-input.ts`:
```ts
// What a PDF template is given: the document's content, already formatted, and the organization's branding.

/** An organization's own branding on its documents (spec 9.3). Not the product's brand: these are its settings. */
export interface DocumentBranding {
  organizationName: string;
  /** "#rrggbb". Replaces the brand's action colour on this organization's documents. */
  accentColour?: string | undefined;
  logo?: { data: Uint8Array; contentType: "image/png" | "image/jpeg" } | undefined;
  /** The organization's terms, printed after the content. */
  terms?: string | undefined;
}

/**
 * The sample template's content. Amounts and dates arrive as text, formatted by the caller (₹12,50,000.00,
 * 15 Oct 2026): templates know no money or date rules.
 */
export interface SampleDocumentData {
  title: string;
  number: string;
  issuedOn: string;
  recipient: { name: string; lines: string[] };
  rows: { description: string; detail?: string | undefined; amount: string }[];
  totals: { label: string; amount: string; emphasis?: boolean | undefined }[];
  notes?: string | undefined;
}

/** The templates the renderer knows. The Foundation ships one sample; quotes and invoices add theirs later. */
export type PdfTemplate = "sample";

export interface PdfInput {
  data: SampleDocumentData;
  branding: DocumentBranding;
}
```

`packages/integrations/src/pdf/woff.ts`:
```ts
// Unpacks a WOFF 1.0 font into the TrueType (SFNT) file it compresses. fontkit 2.0.4, which React-PDF uses, reads a
// WOFF's tables as separate buffers and then overruns one when a font ends with an empty glyph (IBM Plex Mono's
// space), and it can't subset WOFF2 at all. A plain TrueType file avoids both.
import { inflateSync } from "node:zlib";

const WOFF_SIGNATURE = 0x774f4646; // "wOFF"
const WOFF_HEADER_SIZE = 44;
const WOFF_TABLE_ENTRY_SIZE = 20;
const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_RECORD_SIZE = 16;

interface Table {
  tag: number;
  checksum: number;
  data: Uint8Array;
}

const paddedToFour = (length: number): number => (length + 3) & ~3;

export function sfntFromWoff(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < WOFF_HEADER_SIZE || view.getUint32(0) !== WOFF_SIGNATURE) {
    throw new RangeError("Not a WOFF font");
  }
  const flavor = view.getUint32(4);
  const tableCount = view.getUint16(12);

  const tables: Table[] = [];
  for (let index = 0; index < tableCount; index++) {
    const entry = WOFF_HEADER_SIZE + index * WOFF_TABLE_ENTRY_SIZE;
    const offset = view.getUint32(entry + 4);
    const compressedLength = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    const stored = woff.subarray(offset, offset + compressedLength);
    // A table is stored as is when compressing it wouldn't make it smaller.
    const data = compressedLength < length ? new Uint8Array(inflateSync(stored)) : stored;
    if (data.byteLength !== length) throw new RangeError("A WOFF table unpacked to the wrong size");
    tables.push({ tag: view.getUint32(entry), checksum: view.getUint32(entry + 16), data });
  }
  // TrueType wants its table records sorted by tag.
  tables.sort((first, second) => first.tag - second.tag);

  const directorySize = SFNT_HEADER_SIZE + tableCount * SFNT_TABLE_RECORD_SIZE;
  const size = tables.reduce((total, table) => total + paddedToFour(table.data.byteLength), directorySize);
  const sfnt = new Uint8Array(size);
  const out = new DataView(sfnt.buffer);

  // The search fields are derived from the table count, as the OpenType specification defines them.
  const entrySelector = Math.floor(Math.log2(tableCount));
  const searchRange = 2 ** entrySelector * SFNT_TABLE_RECORD_SIZE;
  out.setUint32(0, flavor);
  out.setUint16(4, tableCount);
  out.setUint16(6, searchRange);
  out.setUint16(8, entrySelector);
  out.setUint16(10, tableCount * SFNT_TABLE_RECORD_SIZE - searchRange);

  let offset = directorySize;
  tables.forEach((table, index) => {
    const record = SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE;
    out.setUint32(record, table.tag);
    out.setUint32(record + 4, table.checksum);
    out.setUint32(record + 8, offset);
    out.setUint32(record + 12, table.data.byteLength);
    sfnt.set(table.data, offset);
    offset += paddedToFour(table.data.byteLength);
  });
  return sfnt;
}
```

`packages/integrations/src/pdf/fonts.ts`:
```ts
// The brand's three typefaces for PDFs (spec 10), registered once per process from the @fontsource packages.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { sfntFromWoff } from "./woff.js";

const require = createRequire(import.meta.url);

const families = [
  { family: brand.fonts.title, fontPackage: "@fontsource/eb-garamond", file: "eb-garamond" },
  { family: brand.fonts.ui, fontPackage: "@fontsource/figtree", file: "figtree" },
  { family: brand.fonts.numbers, fontPackage: "@fontsource/ibm-plex-mono", file: "ibm-plex-mono" },
] as const;

const weights = [400, 600] as const;

/**
 * Each family comes in two files: "latin" has the digits but not ₹, "latin-ext" has ₹ and accented letters but no
 * digits. Both are registered, the second as "<family> Ext", and styles name both, so React-PDF takes each character
 * from the first file that has it.
 */
const extended = (family: string): string => `${family} Ext`;

export const fontStacks = {
  title: [brand.fonts.title, extended(brand.fonts.title)],
  ui: [brand.fonts.ui, extended(brand.fonts.ui)],
  numbers: [brand.fonts.numbers, extended(brand.fonts.numbers)],
};

/** A font file from an @fontsource package, unpacked to TrueType, as the data URL React-PDF accepts. */
function trueTypeDataUrl(fontPackage: string, fileName: string): string {
  const woff = readFileSync(require.resolve(`${fontPackage}/files/${fileName}`));
  return `data:font/ttf;base64,${Buffer.from(sfntFromWoff(woff)).toString("base64")}`;
}

let registered = false;

export function registerBrandFonts(): void {
  if (registered) return;
  for (const { family, fontPackage, file } of families) {
    for (const [name, subset] of [
      [family, "latin"],
      [extended(family), "latin-ext"],
    ] as const) {
      Font.register({
        family: name,
        fonts: weights.map((fontWeight) => ({
          src: trueTypeDataUrl(fontPackage, `${file}-${subset}-${String(fontWeight)}-normal.woff`),
          fontWeight,
        })),
      });
    }
  }
  // Never split a word across lines: a hyphen inside a name, a number or an amount would change what it says.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
```

`packages/integrations/src/pdf/theme.ts`:
```ts
// Colours and fonts for one organization's documents: the brand's tokens, with the organization's accent colour.
import { brand } from "@travel-crm/brand";
import type { DocumentBranding } from "./document-input.js";
import { fontStacks } from "./fonts.js";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export interface PdfTheme {
  accent: string;
  ink: string;
  muted: string;
  surface: string;
  hairline: string;
  money: string;
  fonts: typeof fontStacks;
}

export function pdfTheme(branding: DocumentBranding): PdfTheme {
  const accent = branding.accentColour ?? brand.colours.action;
  // The colour is written into the PDF's drawing commands, so only a plain hex colour gets through.
  if (!HEX_COLOUR.test(accent)) {
    throw new RangeError(`Accent colours look like #1a2b3c, got ${JSON.stringify(accent.slice(0, 20))}`);
  }
  return {
    accent,
    ink: brand.colours.ink,
    muted: brand.colours.muted,
    surface: brand.colours.surface,
    hairline: brand.colours.hairline,
    money: brand.colours.money,
    fonts: fontStacks,
  };
}
```

- [ ] **Step 5: Write the printable character set, the page parts, the template and the renderer**

`packages/integrations/src/pdf/printable-text.ts`:
```ts
// Which characters the PDF fonts can show. React-PDF draws a character no font has (Devanagari, Tamil, emoji) as
// other letters rather than as an empty box, so a document holding one is refused instead of printed wrong.

/**
 * Code point ranges that every brand font has in both weights (latin and latin-ext files together) and that read back
 * as themselves from the PDF, so copying and searching work: basic Latin, most of Latin-1 and Latin Extended-A,
 * typographic quotes and dashes, ₹ and €. From the @fontsource 5.3.0 files; printable-text.test.ts renders each one
 * in every font and reads it back. Left out although a font has them: µ (reads back as Greek mu), ı, ȷ, ‹, › and ⁄.
 */
const printableRanges: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0xb4],
  [0xb6, 0x113],
  [0x116, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x130],
  [0x132, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x161],
  [0x164, 0x165],
  [0x16a, 0x17e],
  [0x1cd, 0x1ce],
  [0x218, 0x21b],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2020],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x20ac, 0x20ac],
  [0x20b9, 0x20b9],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
];

const LINE_BREAK = 0x0a;

const isPrintable = (codePoint: number): boolean =>
  codePoint === LINE_BREAK || printableRanges.some(([from, to]) => codePoint >= from && codePoint <= to);

/** Every printable character, for tests and for showing people what they may type. */
export function printableCharacters(): string[] {
  return printableRanges.flatMap(([from, to]) =>
    Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)),
  );
}

/** The characters in text that the PDF fonts can't show, each once, in the order they first appear. */
export function unprintableCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && !isPrintable(codePoint)) found.add(character);
  }
  return [...found];
}

/** Thrown, before rendering, for a document holding characters the fonts can't show. */
export class UnprintableTextError extends Error {
  readonly characters: readonly string[];

  constructor(characters: readonly string[]) {
    super(`This document has characters its fonts can't show yet: ${characters.join(", ")}`);
    this.name = "UnprintableTextError";
    this.characters = characters;
  }
}
```

`packages/integrations/src/pdf/page-parts.ts`:
```ts
// The parts every page of a document shares: the organization's header, and the footer with the page count.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { DocumentBranding } from "./document-input.js";
import type { PdfTheme } from "./theme.js";

function styles(theme: PdfTheme) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingBottom: 10,
      marginBottom: 18,
      borderBottomWidth: 2,
      borderBottomColor: theme.accent,
    },
    organization: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: { maxHeight: 40, maxWidth: 120, objectFit: "contain" },
    organizationName: { fontFamily: theme.fonts.title, fontSize: 18, fontWeight: 600, color: theme.ink },
    heading: { alignItems: "flex-end" },
    title: { fontFamily: theme.fonts.title, fontSize: 20, fontWeight: 600, color: theme.accent },
    reference: { fontFamily: theme.fonts.numbers, fontSize: 9, color: theme.muted, marginTop: 2 },
    footer: {
      position: "absolute",
      left: 40,
      right: 40,
      bottom: 24,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: theme.hairline,
      fontFamily: theme.fonts.ui,
      fontSize: 8,
      color: theme.muted,
    },
  });
}

/** The organization's logo and name on the left, the document's title, number and date on the right. */
export function pageHeader(props: {
  branding: DocumentBranding;
  theme: PdfTheme;
  title: string;
  number: string;
  issuedOn: string;
}): ReactElement {
  const style = styles(props.theme);
  const { logo } = props.branding;
  const logoImage =
    logo &&
    createElement(Image, {
      style: style.logo,
      src: { data: Buffer.from(logo.data), format: logo.contentType === "image/png" ? "png" : "jpg" },
    });
  return createElement(
    View,
    { style: style.header, fixed: true },
    createElement(
      View,
      { style: style.organization },
      logoImage,
      createElement(Text, { style: style.organizationName }, props.branding.organizationName),
    ),
    createElement(
      View,
      { style: style.heading },
      createElement(Text, { style: style.title }, props.title),
      createElement(Text, { style: style.reference }, props.number),
      createElement(Text, { style: style.reference }, props.issuedOn),
    ),
  );
}

/** The organization's name and the product's on the left, "Page x of y" on the right, on every page. */
export function pageFooter(props: { branding: DocumentBranding; theme: PdfTheme }): ReactElement {
  const style = styles(props.theme);
  return createElement(
    View,
    { style: style.footer, fixed: true },
    createElement(Text, null, `${props.branding.organizationName} · Made with ${brand.productName}`),
    createElement(Text, {
      render: ({ pageNumber, totalPages }) => `Page ${String(pageNumber)} of ${String(totalPages)}`,
    }),
  );
}
```

`packages/integrations/src/pdf/templates/sample-document.ts`:
```ts
// The Foundation's one template (spec 9.3): a titled document with a recipient, rows with amounts, totals, notes and
// the organization's terms. Real templates (quotes, invoices) follow its layout.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Document, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { PdfInput, SampleDocumentData } from "../document-input.js";
import { pageFooter, pageHeader } from "../page-parts.js";
import { pdfTheme, type PdfTheme } from "../theme.js";

function styles(theme: PdfTheme) {
  return StyleSheet.create({
    page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 64, fontFamily: theme.fonts.ui, fontSize: 10 },
    label: { fontSize: 8, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
    recipient: { marginBottom: 18 },
    recipientName: { fontSize: 11, fontWeight: 600, color: theme.ink },
    line: { color: theme.ink },
    tableHead: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.hairline,
      paddingVertical: 5,
      paddingHorizontal: 6,
      fontSize: 8,
      color: theme.muted,
    },
    row: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: theme.hairline,
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    // flexBasis 0: the description takes only the room the amount leaves, however long its text.
    description: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
    detail: { fontSize: 8, color: theme.muted, marginTop: 2 },
    // Wide enough for ₹99,99,99,999.00 on one line, and never squeezed by a long description.
    amountHead: { width: 120, flexShrink: 0, textAlign: "right" },
    amount: { width: 120, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    totals: { marginTop: 10, alignSelf: "flex-end", width: 260 },
    total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    totalEmphasis: { borderTopWidth: 1, borderTopColor: theme.ink, marginTop: 3, paddingTop: 6 },
    totalLabel: { color: theme.muted },
    totalLabelEmphasis: { color: theme.ink, fontWeight: 600 },
    totalAmount: { fontFamily: theme.fonts.numbers, color: theme.ink },
    totalAmountEmphasis: { fontFamily: theme.fonts.numbers, color: theme.money, fontWeight: 600 },
    section: { marginTop: 20 },
    paragraph: { color: theme.ink, lineHeight: 1.4 },
  });
}

type Styles = ReturnType<typeof styles>;

function recipient(style: Styles, { name, lines }: SampleDocumentData["recipient"]): ReactElement {
  return createElement(
    View,
    { style: style.recipient },
    createElement(Text, { style: style.label }, "Prepared for"),
    createElement(Text, { style: style.recipientName }, name),
    ...lines.map((line, index) => createElement(Text, { key: index, style: style.line }, line)),
  );
}

function table(style: Styles, rows: SampleDocumentData["rows"]): ReactElement[] {
  const head = createElement(
    View,
    { key: "head", style: style.tableHead },
    createElement(Text, { style: style.description }, "Description"),
    createElement(Text, { style: style.amountHead }, "Amount"),
  );
  const body = rows.map((row, index) =>
    // wrap: false keeps a row on one page.
    createElement(
      View,
      { key: index, style: style.row, wrap: false },
      createElement(
        View,
        { style: style.description },
        createElement(Text, null, row.description),
        row.detail ? createElement(Text, { style: style.detail }, row.detail) : null,
      ),
      createElement(Text, { style: style.amount }, row.amount),
    ),
  );
  return [head, ...body];
}

function totals(style: Styles, lines: SampleDocumentData["totals"]): ReactElement {
  return createElement(
    View,
    { style: style.totals, wrap: false },
    ...lines.map((total, index) =>
      createElement(
        View,
        { key: index, style: total.emphasis ? [style.total, style.totalEmphasis] : style.total },
        createElement(Text, { style: total.emphasis ? style.totalLabelEmphasis : style.totalLabel }, total.label),
        createElement(Text, { style: total.emphasis ? style.totalAmountEmphasis : style.totalAmount }, total.amount),
      ),
    ),
  );
}

function section(style: Styles, label: string, text: string | undefined): ReactElement | null {
  if (!text) return null;
  return createElement(
    View,
    { style: style.section },
    createElement(Text, { style: style.label }, label),
    createElement(Text, { style: style.paragraph }, text),
  );
}

export function sampleDocument({ data, branding }: PdfInput): ReactElement<DocumentProps> {
  const theme = pdfTheme(branding);
  const style = styles(theme);
  return createElement(
    Document,
    {
      title: `${data.title} ${data.number}`,
      author: branding.organizationName,
      creator: brand.productName,
      producer: brand.productName,
    },
    createElement(
      Page,
      { size: "A4", style: style.page },
      pageHeader({ branding, theme, title: data.title, number: data.number, issuedOn: data.issuedOn }),
      recipient(style, data.recipient),
      ...table(style, data.rows),
      totals(style, data.totals),
      section(style, "Notes", data.notes),
      section(style, "Terms", branding.terms),
      pageFooter({ branding, theme }),
    ),
  );
}
```

`packages/integrations/src/pdf/render-pdf.ts`:
```ts
// Renders a document to PDF bytes. The worker calls it (spec 9.3); an issued document's PDF is rendered once.
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { PdfInput, PdfTemplate } from "./document-input.js";
import { registerBrandFonts } from "./fonts.js";
import { UnprintableTextError, unprintableCharacters } from "./printable-text.js";
import { sampleDocument } from "./templates/sample-document.js";

const templates: Record<PdfTemplate, (input: PdfInput) => ReactElement<DocumentProps>> = {
  sample: sampleDocument,
};

/** Every piece of text in a value: strings, and strings inside arrays and objects. Bytes (a logo) are skipped. */
function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof Uint8Array || value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(textsIn);
}

/**
 * Renders one template. Rejects before rendering anything when the branding's accent colour isn't #rrggbb, and with
 * UnprintableTextError when some text holds characters the fonts can't show.
 */
export async function renderPdf(template: PdfTemplate, input: PdfInput): Promise<Uint8Array> {
  const unprintable = unprintableCharacters(textsIn(input).join(""));
  if (unprintable.length > 0) throw new UnprintableTextError(unprintable);
  registerBrandFonts();
  const document = templates[template](input);
  const pdf = await renderToBuffer(document);
  // A plain Uint8Array, not Node's Buffer subclass: storage adapters and PDF readers take it as it is.
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
}
```

`packages/integrations/src/pdf/index.ts`:
```ts
// Public API of @travel-crm/integrations/pdf: the React-PDF renderer and its templates (spec 9.3).
export type { DocumentBranding, PdfInput, PdfTemplate, SampleDocumentData } from "./document-input.js";
export { printableCharacters, UnprintableTextError, unprintableCharacters } from "./printable-text.js";
export { renderPdf } from "./render-pdf.js";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/pdf`

Expected: 10 tests pass in 3 files. The layout test ("keeps a long description inside its column and an amount on one line") reads each run of text's position from the PDF: if the description column's `flexBasis: 0` or the amount's `flexShrink: 0` is missing, a long description pushes into the amount column and ₹ wraps onto a line of its own.

- [ ] **Step 7: Check everything**

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 18, db 111, domain 121, eslint-config 65, integrations 16.

- [ ] **Step 8: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null
git add packages/integrations/src/pdf packages/integrations/test/pdf
git commit -m "feat(integrations): render PDFs with React-PDF, the brand's fonts and a sample template"
```

---

### Task D2: Issued documents, rendered once by the worker

An issued document is numbered (`DOC-2026-0001`) and frozen: its content, branding, number and printed date are stored exactly as issued, and the PDF is rendered from that alone (spec 9.3: "An issued document's PDF is stored and never regenerated"). Issuing publishes `document.issued` in the caller's transaction; the worker's listener `documents.render-pdf` renders the PDF, stores it through the files module as an attachment of the document, and attaches it only if none is attached yet. The runtime role may set only `pdf_attachment_id` and `rendered_at`, and can't delete a document.

The foreign key from `issued_document (organization_id, pdf_attachment_id)` to `attachment (organization_id, id)` waits for the Integration task, like the `organization` relations: Prisma needs a back-relation on `Attachment`, in the Files track's schema file.

**Files:**
- Merge: `foundation/03-files` (Task F2's attachments)
- Create: `packages/contracts/src/documents/documents.ts`, `index.ts`; `packages/db/prisma/schema/documents.prisma`; `packages/db/prisma/migrations/20261015120000_issued_documents/migration.sql`; `packages/db/test/org-table-fixtures/documents.ts`; `packages/domain/src/documents/issued-document-row.ts`, `issue-document.ts`, `render-issued-document.ts`, `index.ts`, `README.md`; `docs/adr/0012-pdfs-and-issued-documents.md`
- Modify: `packages/integrations/src/pdf/printable-text.ts`, `render-pdf.ts`, `index.ts` (add `unprintableCharactersIn`)
- Test: `packages/contracts/test/documents/documents.test.ts`; `packages/integrations/test/pdf/printable-text.test.ts`; `packages/domain/test/documents/test-documents.ts` (helper), `issue-document.test.ts`, `render-issued-document.test.ts`

**Interfaces:**
- Consumes:
  - from Files F2 (`@travel-crm/domain/files`): `createFiles({ db, storage, storageLimitBytes? }): Files`, with `Files.storeGeneratedFile(actor: Actor, file: GeneratedFile): Promise<AttachmentSummary>` (its own transactions; `GeneratedFile = { recordType, recordId, fileName, contentType, body: Uint8Array, sensitive? }`), `Files.remove(actor: Actor, { attachmentId }): Promise<void>` and `Files.list(actor, { recordType, recordId })`;
  - from Task 0: `publishEvent`, `defineListener`, `EventListener`, `DomainEvent`, `ListenerContext` (`@travel-crm/domain/jobs`); `Actor`, `systemActor`, `DomainError` (`@travel-crm/domain/kernel`); `nextDocumentNumber(tx, { prefix, year })` and `OrgTx` (`@travel-crm/db`); `createMemoryStorage` (`@travel-crm/integrations/storage`);
  - from D1: `renderPdf`, `PdfTemplate`, `PdfInput`, `unprintableCharacters`.
- Produces:
  - `@travel-crm/contracts/documents`: `pdfTemplate`, `documentBranding`, `sampleDocumentContent`, `sampleDocumentData`, `issueDocumentInput` (`IssueDocumentInput = { template: "sample"; content; branding }`), `issuedDocumentRenderInput` (`{ data, branding }`), `issuedDocumentSummary` (`IssuedDocumentSummary = { id, template, number, title, issuedAt: string, issuedBy: string | null, pdfAttachmentId: string | null, renderedAt: string | null }`), `documentIssuedEvent` (`{ documentId }`).
  - `@travel-crm/domain/documents`:
    - `issueDocument(tx: OrgTx, actor: Actor, input: IssueDocumentOptions, now?: Date): Promise<IssuedDocumentSummary>` with `IssueDocumentOptions = IssueDocumentInput & { timeZone: string; prefix?: string | undefined }`. Refuses unprintable text with `VALIDATION`/`UNPRINTABLE_CHARACTERS` before using a number.
    - `getIssuedDocument(tx: OrgTx, { documentId }): Promise<IssuedDocumentSummary>`; another organization's is `NOT_FOUND`/`DOCUMENT_NOT_FOUND`. A share-link resolver (Integration task) reads `pdfAttachmentId` here and asks `files.systemDownloadLink` for the URL.
    - `renderIssuedDocumentListener({ files, render }): EventListener`: name `documents.render-pdf`, event `document.issued`. The worker passes `createFiles(...)` and `renderPdf`.
  - `@travel-crm/integrations/pdf`: `unprintableCharactersIn(value: unknown): string[]` (every string inside a value; bytes skipped).
  - The table `issued_document`, append-only for the runtime role except `pdf_attachment_id` and `rendered_at`.

- [ ] **Step 1: Merge the Files track**

Wait until the Files track's Task F2 is committed on `foundation/03-files`, then:
```bash
cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null
git merge --no-ff foundation/03-files -m "chore: merge foundation/03-files (attachments)"
pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm check
```
Expected: the merge has no conflicts (the tracks share no files), and `pnpm check` is green with the Files track's counts added: api-server 72, api 5, brand 3, contracts 24, db 119, domain 131, eslint-config 65, integrations 29.

- [ ] **Step 2: Write the failing contract tests**

`packages/contracts/test/documents/documents.test.ts`:
```ts
// What issuing a document accepts: the sample template's content and branding, strictly, and the stored render
// input and event payload the worker reads back.
import { describe, expect, it } from "vitest";
import {
  documentIssuedEvent,
  issuedDocumentRenderInput,
  issueDocumentInput,
  type IssueDocumentInput,
} from "../../src/documents/index.js";

const valid: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["14 Marine Drive", "Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", detail: "2 adults", amount: "₹12,50,000.00" }],
    totals: [{ label: "Total", amount: "₹12,50,000.00", emphasis: true }],
    notes: "Prices hold for seven days.\nFerry times depend on the weather.",
  },
  branding: { organizationName: "Sharma Holidays", accentColour: "#034f46", terms: "50% to book." },
};

describe("documents contracts", () => {
  it("accepts a sample document and trims its text", () => {
    const parsed = issueDocumentInput.parse({
      ...valid,
      content: { ...valid.content, title: "  Quotation  " },
    });
    expect(parsed.content.title).toBe("Quotation");
    expect(parsed.content.notes).toContain("\n");
  });

  it("refuses unknown keys, unknown templates, and documents with no rows", () => {
    expect(issueDocumentInput.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(issueDocumentInput.safeParse({ ...valid, template: "invoice" }).success).toBe(false);
    expect(issueDocumentInput.safeParse({ ...valid, content: { ...valid.content, rows: [] } }).success).toBe(false);
  });

  it("only takes an accent colour written #rrggbb", () => {
    const branding = (accentColour: string) => ({ ...valid, branding: { ...valid.branding, accentColour } });
    expect(issueDocumentInput.safeParse(branding("#6A4BBD")).success).toBe(true);
    expect(issueDocumentInput.safeParse(branding("red")).success).toBe(false);
    expect(issueDocumentInput.safeParse(branding("#034f46; font-size: 99")).success).toBe(false);
  });

  it("refuses control characters, except line breaks in notes and terms", () => {
    const withTitle = (title: string) => ({ ...valid, content: { ...valid.content, title } });
    expect(issueDocumentInput.safeParse(withTitle("Quo\u0000tation")).success).toBe(false);
    expect(issueDocumentInput.safeParse(withTitle("Quo\ntation")).success).toBe(false);
    const withTerms = (terms: string) => ({ ...valid, branding: { ...valid.branding, terms } });
    expect(issueDocumentInput.safeParse(withTerms("Line one\nLine two")).success).toBe(true);
    expect(issueDocumentInput.safeParse(withTerms("Bell\u0007")).success).toBe(false);
  });

  it("reads back the stored render input and the event payload, refusing anything else", () => {
    const stored = {
      data: { ...valid.content, number: "DOC-2026-0001", issuedOn: "15 Oct 2026" },
      branding: valid.branding,
    };
    expect(issuedDocumentRenderInput.parse(stored)).toEqual(stored);
    expect(issuedDocumentRenderInput.safeParse({ ...stored, data: valid.content }).success).toBe(false);
    expect(documentIssuedEvent.parse({ documentId: "0199e7a0-0000-7000-8000-000000000001" })).toEqual({
      documentId: "0199e7a0-0000-7000-8000-000000000001",
    });
    expect(documentIssuedEvent.safeParse({ documentId: "d1" }).success).toBe(false);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/documents`

Expected: FAIL. `Cannot find module '../../src/documents/index.js'`.

- [ ] **Step 3: Write the contracts**

`packages/contracts/src/documents/documents.ts`:
```ts
// Inputs and outputs for issued documents (spec 9.3): what a sample document says, the organization's branding on
// it, what is stored when it is issued, and the event that has the worker render it.
import { z } from "zod";

/** One line of text: trimmed, at least one character, no control characters at all. */
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/\p{Cc}/u.test(text), "Use text without control characters");

/** A paragraph: like a line, but it may hold line breaks (and no other control character). */
const paragraph = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/\p{Cc}/u.test(text.replaceAll("\n", "")), "Use text without control characters");

/** An amount as it is printed, already formatted by the caller, e.g. "₹12,50,000.00". */
const printedAmount = line(24);

/** The templates the renderer knows. The Foundation ships one; quotes and invoices add theirs. */
export const pdfTemplate = z.enum(["sample"]);

/** The organization's own branding on a document. Its logo joins when plan 4 stores branding settings. */
export const documentBranding = z.strictObject({
  organizationName: line(120),
  accentColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1a2b3c")
    .optional(),
  terms: paragraph(2000).optional(),
});

/** What the sample template says. Issuing adds the number and the date. */
export const sampleDocumentContent = z.strictObject({
  title: line(80),
  recipient: z.strictObject({ name: line(120), lines: z.array(line(120)).max(6) }),
  rows: z
    .array(z.strictObject({ description: line(500), detail: line(300).optional(), amount: printedAmount }))
    .min(1)
    .max(200),
  totals: z.array(z.strictObject({ label: line(60), amount: printedAmount, emphasis: z.boolean().optional() })).max(12),
  notes: paragraph(2000).optional(),
});

export const issueDocumentInput = z.strictObject({
  template: pdfTemplate,
  content: sampleDocumentContent,
  branding: documentBranding,
});
export type IssueDocumentInput = z.infer<typeof issueDocumentInput>;

/** The sample template's full data: the content, plus the number and date issuing gave it. */
export const sampleDocumentData = z.strictObject({
  ...sampleDocumentContent.shape,
  number: line(40),
  issuedOn: line(40),
});

/** An issued document's content and branding exactly as issued. The PDF is rendered from this alone. */
export const issuedDocumentRenderInput = z.strictObject({ data: sampleDocumentData, branding: documentBranding });
export type IssuedDocumentRenderInput = z.infer<typeof issuedDocumentRenderInput>;

export const issuedDocumentSummary = z.strictObject({
  id: z.uuid(),
  template: pdfTemplate,
  number: z.string(),
  title: z.string(),
  issuedAt: z.iso.datetime(),
  /** Who issued it; null when the system did. */
  issuedBy: z.uuid().nullable(),
  /** The rendered PDF's attachment; null until the worker has rendered it. */
  pdfAttachmentId: z.uuid().nullable(),
  renderedAt: z.iso.datetime().nullable(),
});
export type IssuedDocumentSummary = z.infer<typeof issuedDocumentSummary>;

/** The payload of the "document.issued" event. */
export const documentIssuedEvent = z.strictObject({ documentId: z.uuid() });
```

`packages/contracts/src/documents/index.ts`:
```ts
// Public API of @travel-crm/contracts/documents: the Zod schemas for issued documents.
export * from "./documents.js";
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/documents`

Expected: 5 tests pass.

- [ ] **Step 4: Add the table, its migration and its isolation fixture**

`packages/db/prisma/schema/documents.prisma`:
```prisma
// Issued documents (spec 9.3): numbered documents whose content is frozen when issued, and whose PDF the worker
// renders once and never again. Organization-owned; the api and worker may only attach the rendered PDF to a row.
// The organization relation, and the foreign key from pdf_attachment_id to attachment, are added with every plan 3
// table's in plan 3's Integration task.

/// A document as issued, e.g. quotation DOC-2026-0042.
model IssuedDocument {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String    @id @default(uuid(7)) @db.Uuid
  /// The template it renders with, e.g. "sample".
  template        String
  /// "<prefix>-<year>-<0001>" from the organization's counter (CHECK issued_document_number_format).
  number          String
  title           String
  /// The content and branding exactly as issued, a JSON object (CHECK issued_document_render_input_object).
  renderInput     Json      @map("render_input")
  /// Who issued it; null when the system did.
  issuedBy        String?   @map("issued_by") @db.Uuid
  issuedAt        DateTime  @default(now()) @map("issued_at") @db.Timestamptz(6)
  /// The rendered PDF, an attachment of this document. Set once, never replaced (CHECK issued_document_rendered).
  pdfAttachmentId String?   @map("pdf_attachment_id") @db.Uuid
  renderedAt      DateTime? @map("rendered_at") @db.Timestamptz(6)

  /// Lets other organization tables point at (organization_id, id).
  @@unique([organizationId, id])
  /// A number is used once in its organization.
  @@unique([organizationId, number])
  @@map("issued_document")
}
```

Generate the migration from the schema alone (no database: other tracks run at the same time and share nothing). `git archive HEAD` holds the schema as it was before this file:
```bash
cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
cd packages/db && mkdir -p prisma/migrations/20261015120000_issued_documents
pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015120000_issued_documents/migration.sql
```
Expected: the file holds the `CREATE TABLE "issued_document"` and the two `CREATE UNIQUE INDEX` statements that open the file below. Append the hand-written part, so that the whole file reads:

`packages/db/prisma/migrations/20261015120000_issued_documents/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "issued_document" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "render_input" JSONB NOT NULL,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_attachment_id" UUID,
    "rendered_at" TIMESTAMPTZ(6),

    CONSTRAINT "issued_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issued_document_organization_id_id_key" ON "issued_document"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_document_organization_id_number_key" ON "issued_document"("organization_id", "number");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('issued_document');

-- Numbers come from nextDocumentNumber ("DOC-2026-0042"); the frozen input is a JSON object; a PDF and the time it
-- was rendered are set together.
ALTER TABLE "issued_document"
  ADD CONSTRAINT issued_document_number_format CHECK (number ~ '^[A-Z]{2,5}-[0-9]{4}-[0-9]{4,}$'),
  ADD CONSTRAINT issued_document_render_input_object CHECK (jsonb_typeof(render_input) = 'object'),
  ADD CONSTRAINT issued_document_rendered CHECK ((pdf_attachment_id IS NULL) = (rendered_at IS NULL));

-- What was issued is never changed or deleted (spec 9.3): the api and worker may only attach the rendered PDF.
REVOKE UPDATE, DELETE ON TABLE "issued_document" FROM app_runtime;
GRANT UPDATE (pdf_attachment_id, rendered_at) ON TABLE "issued_document" TO app_runtime;
```

`packages/db/test/org-table-fixtures/documents.ts`:
```ts
// Isolation fixtures for the documents module: issued documents, which the runtime role can't change.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  issued_document: {
    create: (tx) =>
      tx.issuedDocument.create({
        data: { template: "sample", number: "ISO-2000-0001", title: "Isolation", renderInput: {} },
      }),
    appendOnly: true,
  },
};
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/db test`

Expected: 124 tests pass, among them the drift check in the global setup and 5 isolation tests for `issued_document`, which expect updates and deletes to be refused outright (`appendOnly`).

- [ ] **Step 5: Let the domain check a whole document for unprintable text**

Replace these three D1 files and the test:

`packages/integrations/src/pdf/printable-text.ts`:
```ts
// Which characters the PDF fonts can show. React-PDF draws a character no font has (Devanagari, Tamil, emoji) as
// other letters rather than as an empty box, so a document holding one is refused instead of printed wrong.

/**
 * Code point ranges that every brand font has in both weights (latin and latin-ext files together) and that read back
 * as themselves from the PDF, so copying and searching work: basic Latin, most of Latin-1 and Latin Extended-A,
 * typographic quotes and dashes, ₹ and €. From the @fontsource 5.3.0 files; printable-text.test.ts renders each one
 * in every font and reads it back. Left out although a font has them: µ (reads back as Greek mu), ı, ȷ, ‹, › and ⁄.
 */
const printableRanges: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0xb4],
  [0xb6, 0x113],
  [0x116, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x130],
  [0x132, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x161],
  [0x164, 0x165],
  [0x16a, 0x17e],
  [0x1cd, 0x1ce],
  [0x218, 0x21b],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2020],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x20ac, 0x20ac],
  [0x20b9, 0x20b9],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
];

const LINE_BREAK = 0x0a;

const isPrintable = (codePoint: number): boolean =>
  codePoint === LINE_BREAK || printableRanges.some(([from, to]) => codePoint >= from && codePoint <= to);

/** Every printable character, for tests and for showing people what they may type. */
export function printableCharacters(): string[] {
  return printableRanges.flatMap(([from, to]) =>
    Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)),
  );
}

/** The characters in text that the PDF fonts can't show, each once, in the order they first appear. */
export function unprintableCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && !isPrintable(codePoint)) found.add(character);
  }
  return [...found];
}

/** Every piece of text in a value: strings, and strings inside arrays and objects. Bytes (a logo) are skipped. */
function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof Uint8Array || value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(textsIn);
}

/** The characters the PDF fonts can't show anywhere in a document's data, each once. */
export function unprintableCharactersIn(value: unknown): string[] {
  return unprintableCharacters(textsIn(value).join(""));
}

/** Thrown, before rendering, for a document holding characters the fonts can't show. */
export class UnprintableTextError extends Error {
  readonly characters: readonly string[];

  constructor(characters: readonly string[]) {
    super(`This document has characters its fonts can't show yet: ${characters.join(", ")}`);
    this.name = "UnprintableTextError";
    this.characters = characters;
  }
}
```

`packages/integrations/src/pdf/render-pdf.ts`:
```ts
// Renders a document to PDF bytes. The worker calls it (spec 9.3); an issued document's PDF is rendered once.
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { PdfInput, PdfTemplate } from "./document-input.js";
import { registerBrandFonts } from "./fonts.js";
import { UnprintableTextError, unprintableCharactersIn } from "./printable-text.js";
import { sampleDocument } from "./templates/sample-document.js";

const templates: Record<PdfTemplate, (input: PdfInput) => ReactElement<DocumentProps>> = {
  sample: sampleDocument,
};

/**
 * Renders one template. Rejects before rendering anything when the branding's accent colour isn't #rrggbb, and with
 * UnprintableTextError when some text holds characters the fonts can't show.
 */
export async function renderPdf(template: PdfTemplate, input: PdfInput): Promise<Uint8Array> {
  const unprintable = unprintableCharactersIn(input);
  if (unprintable.length > 0) throw new UnprintableTextError(unprintable);
  registerBrandFonts();
  const document = templates[template](input);
  const pdf = await renderToBuffer(document);
  // A plain Uint8Array, not Node's Buffer subclass: storage adapters and PDF readers take it as it is.
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
}
```

`packages/integrations/src/pdf/index.ts`:
```ts
// Public API of @travel-crm/integrations/pdf: the React-PDF renderer and its templates (spec 9.3).
export type { DocumentBranding, PdfInput, PdfTemplate, SampleDocumentData } from "./document-input.js";
export {
  printableCharacters,
  UnprintableTextError,
  unprintableCharacters,
  unprintableCharactersIn,
} from "./printable-text.js";
export { renderPdf } from "./render-pdf.js";
```

`packages/integrations/test/pdf/printable-text.test.ts`:
```ts
// The PDF fonts' character set: every character called printable renders and reads back as itself in each font, and
// anything else is caught before rendering, because React-PDF would print other letters in its place.
import { describe, expect, it } from "vitest";
import {
  printableCharacters,
  renderPdf,
  UnprintableTextError,
  unprintableCharacters,
  unprintableCharactersIn,
} from "../../src/pdf/index.js";
import { pdfText } from "./pdf-text.js";

const minimal = { title: "T", number: "N", issuedOn: "D", recipient: { name: "R", lines: [] }, rows: [], totals: [] };

describe("printable text", () => {
  it("renders every printable character as itself, in the title, text and number fonts", async () => {
    // Spaces would be dropped or merged by the text reader, so they are left out of the comparison. Fifteen at a time
    // fit the amount column on one line: a longer run with no space to break at would run past it.
    const characters = printableCharacters().filter((character) => character.trim() !== "");
    for (let start = 0; start < characters.length; start += 15) {
      const run = characters.slice(start, start + 15).join("");
      const pdf = await renderPdf("sample", {
        data: {
          ...minimal,
          title: run,
          recipient: { name: run, lines: [] },
          rows: [{ description: "x", amount: run }],
        },
        branding: { organizationName: "Printable" },
      });
      const text = (await pdfText(pdf)).text.replaceAll(" ", "");
      // Title font (the title), text font (the recipient) and number font (the amount).
      expect(text.split(run).length - 1, run).toBe(3);
    }
  });

  it("names the characters it can't print, once each, and allows line breaks", () => {
    expect(unprintableCharacters("Hotel होटल, होटल ₹4,000\nPaid ✅")).toEqual(["ह", "ो", "ट", "ल", "✅"]);
    expect(unprintableCharacters("Ūdaipur – “Lake palace” ₹12,50,000…\n")).toEqual([]);
  });

  it("looks through every string in a document's data, and skips bytes", () => {
    const data = { title: "Quotation", rows: [{ description: "होटल", amount: "₹1" }], logo: new Uint8Array([0xe0]) };
    expect(unprintableCharactersIn(data)).toEqual(["ह", "ो", "ट", "ल"]);
    expect(unprintableCharactersIn({ title: "Quotation", count: 3, missing: null })).toEqual([]);
  });

  it("refuses to render a document with text the fonts can't show, rather than print other letters", async () => {
    const hindi = { ...minimal, rows: [{ description: "होटल और नाश्ता", amount: "₹4,000.00" }] };
    const attempt = renderPdf("sample", { data: hindi, branding: { organizationName: "Sharma Holidays" } });
    await expect(attempt).rejects.toBeInstanceOf(UnprintableTextError);
    await expect(attempt).rejects.toThrow(/can't show yet: ह, ो, ट, ल, औ, र, न, ा, श, ्, त/);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/pdf`

Expected: 11 tests pass.

- [ ] **Step 6: Write the failing domain tests**

`packages/domain/test/documents/test-documents.ts`:
```ts
// Builds the documents module's surroundings on the test database: files on in-memory storage, a fake renderer that
// records what it was asked to render, and the context the worker gives a listener.
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import type { PdfInput, PdfTemplate } from "@travel-crm/integrations/pdf";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";

export interface TestDocuments {
  db: Database;
  platform: PlatformClient;
  storage: MemoryStorage;
  files: Files;
  close(): Promise<void>;
}

export function createTestDocuments(): TestDocuments {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const platform = createPlatformClient(urls.platform);
  const storage = createMemoryStorage();
  return {
    db,
    platform,
    storage,
    files: createFiles({ db, storage }),
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export function createOrganization(test: TestDocuments): Promise<string> {
  return createTestOrganization(test.platform, "Documents agency");
}

export const quotation: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", amount: "₹12,50,000.00" }],
    totals: [{ label: "Total", amount: "₹12,50,000.00", emphasis: true }],
  },
  branding: { organizationName: "Sharma Holidays", accentColour: "#034f46", terms: "50% to book." },
};

/** The document.issued event issuing wrote to the outbox, as the worker hands it to a listener. */
export async function issuedEvent(
  test: TestDocuments,
  organizationId: string,
  documentId: string,
): Promise<DomainEvent> {
  const row = await test.db.forOrg(organizationId, (tx) =>
    tx.outboxEvent.findFirstOrThrow({ where: { type: "document.issued", payload: { equals: { documentId } } } }),
  );
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    payload: { documentId },
    occurredAt: row.occurredAt,
  };
}

/** What the worker gives a listener: the system acting in the event's organization. */
export function listenerContext(test: TestDocuments, organizationId: string): ListenerContext {
  return { actor: systemActor(organizationId), forOrg: (fn) => test.db.forOrg(organizationId, fn) };
}

/** A renderer that records its calls and returns a few bytes, optionally waiting for a signal first. */
export function fakeRenderer(wait: Promise<void> = Promise.resolve()) {
  const calls: { template: PdfTemplate; input: PdfInput }[] = [];
  return {
    calls,
    render: async (template: PdfTemplate, input: PdfInput): Promise<Uint8Array> => {
      calls.push({ template, input });
      await wait;
      return new TextEncoder().encode(`%PDF-1.7 fake ${input.data.number}`);
    },
  };
}
```

`packages/domain/test/documents/issue-document.test.ts`:
```ts
// Issuing a document numbers it in its organization and year, freezes what it says, and publishes document.issued,
// all in the caller's transaction.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getIssuedDocument, issueDocument } from "../../src/documents/index.js";
import { DomainError, systemActor, type Actor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

const october15 = new Date("2026-10-15T06:30:00Z");

describe("issueDocument", () => {
  let test: TestDocuments;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    test = createTestDocuments();
    organizationId = await createOrganization(test);
    owner = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000a1", source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await test.close();
  });

  it("numbers the document, freezes what it says, and publishes document.issued", async () => {
    const issue = () =>
      test.db.forOrg(organizationId, (tx) =>
        issueDocument(tx, owner, { ...quotation, timeZone: "Asia/Kolkata" }, october15),
      );
    const first = await issue();
    const second = await issue();

    expect(first).toEqual({
      id: first.id,
      template: "sample",
      number: "DOC-2026-0001",
      title: "Quotation",
      issuedAt: october15.toISOString(),
      issuedBy: owner.userId,
      pdfAttachmentId: null,
      renderedAt: null,
    });
    expect(second.number).toBe("DOC-2026-0002");

    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: first.id } }),
    );
    expect(stored.renderInput).toEqual({
      data: { ...quotation.content, number: "DOC-2026-0001", issuedOn: "15 Oct 2026" },
      branding: quotation.branding,
    });
    const events = await test.db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "document.issued" }, orderBy: { id: "asc" } }),
    );
    expect(events.map((event) => event.payload)).toEqual([{ documentId: first.id }, { documentId: second.id }]);
  });

  it("counts the year and the date in the organization's time zone", async () => {
    const lateOnNewYearsEve = new Date("2026-12-31T19:00:00Z");
    const india = await createOrganization(test);
    const inIndia = await test.db.forOrg(india, (tx) =>
      issueDocument(tx, systemActor(india), { ...quotation, timeZone: "Asia/Kolkata" }, lateOnNewYearsEve),
    );
    expect(inIndia.number).toBe("DOC-2027-0001");

    const london = await createOrganization(test);
    const inLondon = await test.db.forOrg(london, (tx) =>
      issueDocument(
        tx,
        systemActor(london),
        { ...quotation, timeZone: "Europe/London", prefix: "QT" },
        lateOnNewYearsEve,
      ),
    );
    expect(inLondon.number).toBe("QT-2026-0001");
    const stored = await test.db.forOrg(london, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: inLondon.id } }),
    );
    expect(stored.renderInput).toMatchObject({ data: { issuedOn: "31 Dec 2026" } });
  });

  it("issues nothing, and publishes nothing, when the caller's transaction rolls back", async () => {
    const organization = await createOrganization(test);
    await expect(
      test.db.forOrg(organization, async (tx) => {
        await issueDocument(tx, systemActor(organization), { ...quotation, timeZone: "Asia/Kolkata" });
        throw new Error("the quote could not be saved");
      }),
    ).rejects.toThrow("the quote could not be saved");
    const left = await test.db.forOrg(organization, async (tx) => ({
      documents: await tx.issuedDocument.count(),
      events: await tx.outboxEvent.count(),
    }));
    expect(left).toEqual({ documents: 0, events: 0 });
  });

  it("refuses text its PDF can't show, before it uses a number", async () => {
    const organization = await createOrganization(test);
    const hindi = {
      ...quotation,
      content: { ...quotation.content, rows: [{ description: "होटल", amount: "₹4,000.00" }] },
      timeZone: "Asia/Kolkata",
    };
    const refusal = test.db.forOrg(organization, (tx) => issueDocument(tx, systemActor(organization), hindi));
    await expect(refusal).rejects.toBeInstanceOf(DomainError);
    await expect(refusal).rejects.toMatchObject({ code: "VALIDATION", reason: "UNPRINTABLE_CHARACTERS" });
    const next = await test.db.forOrg(organization, (tx) =>
      issueDocument(tx, systemActor(organization), { ...quotation, timeZone: "Asia/Kolkata" }, october15),
    );
    expect(next.number).toBe("DOC-2026-0001");
  });

  it("keeps what was issued: it can't be changed, and another organization can't see it", async () => {
    const issued = await test.db.forOrg(organizationId, (tx) =>
      issueDocument(tx, owner, { ...quotation, timeZone: "Asia/Kolkata" }),
    );
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        tx.issuedDocument.update({ where: { id: issued.id }, data: { title: "Changed" } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    expect(await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: issued.id }))).toEqual(
      issued,
    );
    const other = await createOrganization(test);
    await expect(test.db.forOrg(other, (tx) => getIssuedDocument(tx, { documentId: issued.id }))).rejects.toMatchObject(
      { code: "NOT_FOUND", reason: "DOCUMENT_NOT_FOUND" },
    );
  });
});
```

`packages/domain/test/documents/render-issued-document.test.ts`:
```ts
// The worker renders an issued document's PDF from its frozen content, once: never again, and only one copy when
// two runs race.
import { renderPdf } from "@travel-crm/integrations/pdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getIssuedDocument, issueDocument, renderIssuedDocumentListener } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  createOrganization,
  createTestDocuments,
  fakeRenderer,
  issuedEvent,
  listenerContext,
  quotation,
  type TestDocuments,
} from "./test-documents.js";

describe("rendering an issued document", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  async function issued(organizationId: string) {
    return test.db.forOrg(organizationId, (tx) =>
      issueDocument(tx, systemActor(organizationId), { ...quotation, timeZone: "Asia/Kolkata" }),
    );
  }

  it("renders the frozen content once and attaches the PDF to the document", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const renderer = fakeRenderer();
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    expect(listener).toMatchObject({ name: "documents.render-pdf", eventType: "document.issued" });

    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));

    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]?.input.data).toMatchObject({ number: document.number, title: "Quotation" });
    expect(renderer.calls[0]?.input.branding).toEqual(quotation.branding);
    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    expect(rendered.pdfAttachmentId).not.toBeNull();
    expect(rendered.renderedAt).not.toBeNull();
    const attachments = await test.files.list(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
    });
    expect(attachments).toMatchObject([
      { id: rendered.pdfAttachmentId, fileName: `${document.number}.pdf`, contentType: "application/pdf" },
    ]);
  });

  it("never renders a document again once it has its PDF", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const renderer = fakeRenderer();
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    const event = await issuedEvent(test, organizationId, document.id);
    await listener.handle(event, listenerContext(test, organizationId));
    const storedBefore = test.storage.objects.size;

    await listener.handle(event, listenerContext(test, organizationId));

    expect(renderer.calls).toHaveLength(1);
    expect(test.storage.objects.size).toBe(storedBefore);
  });

  it("keeps one PDF when two runs race, and hides the other copy", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    let release = (): void => undefined;
    const renderer = fakeRenderer(new Promise((resolve) => (release = resolve)));
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    const event = await issuedEvent(test, organizationId, document.id);

    const runs = [
      listener.handle(event, listenerContext(test, organizationId)),
      listener.handle(event, listenerContext(test, organizationId)),
    ];
    // Both runs have checked for a PDF and are rendering before either stores one.
    await expect.poll(() => renderer.calls.length).toBe(2);
    release();
    await Promise.all(runs);

    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    const attachments = await test.files.list(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
    });
    expect(attachments.map((attachment) => attachment.id)).toEqual([rendered.pdfAttachmentId]);
  });

  it("renders a real PDF with the brand's renderer", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderPdf });
    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));

    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    const key = `organizations/${organizationId}/attachments/${rendered.pdfAttachmentId ?? ""}`;
    const pdf = await test.storage.get(key);
    expect(new TextDecoder().decode(pdf?.subarray(0, 5))).toBe("%PDF-");
  });

  it("fails, so the job is retried, when the document can't be found", async () => {
    const organizationId = await createOrganization(test);
    const listener = renderIssuedDocumentListener({ files: test.files, render: fakeRenderer().render });
    const event = {
      id: "0199e7a0-0000-7000-8000-00000000e001",
      organizationId,
      type: "document.issued",
      payload: { documentId: "0199e7a0-0000-7000-8000-00000000d0c0" },
      occurredAt: new Date(),
    };
    await expect(listener.handle(event, listenerContext(test, organizationId))).rejects.toThrow(/not found/);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/documents`

Expected: FAIL. `Cannot find module '../../src/documents/index.js'`.

- [ ] **Step 7: Write the documents module**

`packages/domain/src/documents/issued-document-row.ts`:
```ts
// How an issued document row reads as the API's summary, and finding one in the organization.
import { issuedDocumentSummary, type IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export const summaryFields = {
  id: true,
  template: true,
  number: true,
  title: true,
  issuedAt: true,
  issuedBy: true,
  pdfAttachmentId: true,
  renderedAt: true,
} as const;

interface SummaryRow {
  id: string;
  template: string;
  number: string;
  title: string;
  issuedAt: Date;
  issuedBy: string | null;
  pdfAttachmentId: string | null;
  renderedAt: Date | null;
}

export function toSummary(row: SummaryRow): IssuedDocumentSummary {
  // Parsed, so a template the renderer doesn't know fails here rather than in a customer's hands.
  return issuedDocumentSummary.parse({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    renderedAt: row.renderedAt?.toISOString() ?? null,
  });
}

/**
 * An issued document of the transaction's organization, with its PDF's attachment id (null until rendered).
 * Another organization's document is "not found": row-level security hides it.
 */
export async function getIssuedDocument(tx: OrgTx, input: { documentId: string }): Promise<IssuedDocumentSummary> {
  const row = await tx.issuedDocument.findUnique({ where: { id: input.documentId }, select: summaryFields });
  if (!row) throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_FOUND", "No such document");
  return toSummary(row);
}
```

`packages/domain/src/documents/issue-document.ts`:
```ts
// Issues a document (spec 9.3): gives it the organization's next number, freezes its content and branding, and
// publishes document.issued so the worker renders its PDF. Runs in the caller's transaction.
import type {
  IssueDocumentInput,
  IssuedDocumentRenderInput,
  IssuedDocumentSummary,
} from "@travel-crm/contracts/documents";
import { nextDocumentNumber, type OrgTx } from "@travel-crm/db";
import { unprintableCharactersIn } from "@travel-crm/integrations/pdf";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";

export interface IssueDocumentOptions extends IssueDocumentInput {
  /** The organization's IANA time zone: the document's year and date are counted in it. */
  timeZone: string;
  /** 2-5 capital letters before the number. "DOC" unless a module has its own, such as "QT" for quotations. */
  prefix?: string | undefined;
}

/** The year it is in the time zone, e.g. 2027 at 00:30 on 1 January in Kolkata, still 2026 in UTC. */
function yearIn(instant: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(instant));
}

/** The date as printed on the document, e.g. "15 Oct 2026". */
function printedDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(
    instant,
  );
}

/**
 * Callers decide whether the actor may issue the document; issuing decides its number and freezes it. What is
 * stored is exactly what the PDF shows, now and whenever it is opened again (spec 9.3: never regenerated).
 */
export async function issueDocument(
  tx: OrgTx,
  actor: Actor,
  input: IssueDocumentOptions,
  now: Date = new Date(),
): Promise<IssuedDocumentSummary> {
  // Checked before a number is used: React-PDF would print other letters in place of these.
  const unprintable = unprintableCharactersIn([input.content, input.branding]);
  if (unprintable.length > 0) {
    throw new DomainError(
      "VALIDATION",
      "UNPRINTABLE_CHARACTERS",
      `The document has characters its PDF can't show yet: ${unprintable.join(", ")}`,
    );
  }
  const number = await nextDocumentNumber(tx, { prefix: input.prefix ?? "DOC", year: yearIn(now, input.timeZone) });
  const renderInput: IssuedDocumentRenderInput = {
    data: { ...input.content, number, issuedOn: printedDate(now, input.timeZone) },
    branding: input.branding,
  };
  const row = await tx.issuedDocument.create({
    data: {
      template: input.template,
      number,
      title: input.content.title,
      renderInput,
      issuedBy: actor.userId,
      issuedAt: now,
    },
    select: summaryFields,
  });
  await publishEvent(tx, { type: "document.issued", payload: { documentId: row.id } });
  return toSummary(row);
}
```

`packages/domain/src/documents/render-issued-document.ts`:
```ts
// The worker's listener that renders an issued document's PDF (spec 9.3): from the frozen content, once, stored as
// the document's attachment. Rendering and storing happen outside any transaction: they are slow.
import { documentIssuedEvent, issuedDocumentRenderInput, pdfTemplate } from "@travel-crm/contracts/documents";
import type { PdfInput, PdfTemplate } from "@travel-crm/integrations/pdf";
import type { Files } from "../files/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";

export interface RenderIssuedDocumentDependencies {
  files: Pick<Files, "storeGeneratedFile" | "remove">;
  /** renderPdf from @travel-crm/integrations/pdf; the domain never imports React-PDF itself. */
  render: (template: PdfTemplate, input: PdfInput) => Promise<Uint8Array>;
}

export function renderIssuedDocumentListener({ files, render }: RenderIssuedDocumentDependencies): EventListener {
  return defineListener({
    name: "documents.render-pdf",
    eventType: "document.issued",
    payload: documentIssuedEvent,
    handle: async (event, context) => {
      const { documentId } = event.payload;
      const document = await context.forOrg((tx) => tx.issuedDocument.findUnique({ where: { id: documentId } }));
      // The event commits with its document, so a missing one is a fault: fail, and the job is retried, then listed.
      if (!document) throw new Error(`Issued document ${documentId} not found in its event's organization`);
      // Never regenerated: once a document has its PDF, every later run leaves it alone.
      if (document.pdfAttachmentId !== null) return;

      const pdf = await render(
        pdfTemplate.parse(document.template),
        issuedDocumentRenderInput.parse(document.renderInput),
      );
      const attachment = await files.storeGeneratedFile(context.actor, {
        recordType: "issued_document",
        recordId: document.id,
        fileName: `${document.number}.pdf`,
        contentType: "application/pdf",
        body: pdf,
      });
      // Only the first run to get here attaches its PDF; a run that lost the race hides its own copy.
      const attached = await context.forOrg((tx) =>
        tx.issuedDocument.updateMany({
          where: { id: document.id, pdfAttachmentId: null },
          data: { pdfAttachmentId: attachment.id, renderedAt: new Date() },
        }),
      );
      if (attached.count === 0) await files.remove(context.actor, { attachmentId: attachment.id });
    },
  });
}
```

`packages/domain/src/documents/index.ts`:
```ts
// Public API of the documents module: issuing numbered documents and rendering their PDFs once (spec 9.3).
export { issueDocument, type IssueDocumentOptions } from "./issue-document.js";
export { getIssuedDocument } from "./issued-document-row.js";
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
```

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/documents`

Expected: 10 tests pass in 2 files.

- [ ] **Step 8: Document the module and the decision**

`packages/domain/src/documents/README.md`:
```markdown
# documents

Numbered documents whose PDF is rendered once and kept (spec 9.3). The Foundation ships one template, `sample`;
quotes and invoices bring theirs.

## Public functions and values (`index.ts`)

- `issueDocument(tx, actor, { template, content, branding, timeZone, prefix? }, now?)`: in the caller's transaction,
  numbers the document (`DOC-2026-0001`, or the caller's prefix; the year counted in `timeZone`), freezes its content
  and branding with that number and the printed date, and publishes `document.issued`. Refuses text the PDF fonts
  can't show (`VALIDATION`/`UNPRINTABLE_CHARACTERS`) before using a number. Callers check the actor may issue it.
- `getIssuedDocument(tx, { documentId })`: the document's summary, with `pdfAttachmentId` (null until rendered).
  Another organization's document is `NOT_FOUND`/`DOCUMENT_NOT_FOUND`.
- `renderIssuedDocumentListener({ files, render })`: the worker's listener `documents.render-pdf`. Pass the files
  module and `renderPdf` from `@travel-crm/integrations/pdf`.

## Events

- Publishes `document.issued` with `{ documentId }`.
- Listens to `document.issued` (`documents.render-pdf`): renders the frozen content, stores the PDF as an attachment of
  the document (record type `issued_document`, file name `<number>.pdf`) and records it on the document.

## Rules worth knowing

- What was issued never changes: the runtime role may only set `pdf_attachment_id` and `rendered_at`, and can't
  delete a document (money documents are cancelled or credited, never deleted; spec 5).
- A document is rendered once. A rerun finds the PDF and stops; two racing runs keep the first PDF and hide the other.
- The organization's logo isn't in the frozen branding yet: it joins with plan 4's branding settings.
```

`docs/adr/0012-pdfs-and-issued-documents.md`:
```markdown
# 0012: PDFs and issued documents

Date: 2026-10-15 · Status: accepted · Implements spec section 9.3 (PDFs; share links are ADR 0013)

## Decision

- **React-PDF renders in the worker**, behind `@travel-crm/integrations/pdf`: `renderPdf(template, { data, branding })`
  returns the PDF's bytes. Templates are plain functions that build React-PDF elements; the Foundation ships `sample`
  (a title, recipient, rows with amounts, totals, notes and the organization's terms).
- **The brand's three fonts are embedded**: EB Garamond for titles, Figtree for text, IBM Plex Mono for numbers and
  amounts, from the pinned `@fontsource` packages. Each family is registered twice: the "latin" file has the digits
  but not ₹, the "latin-ext" file has ₹ but no digits, and styles name both, so each character comes from the file
  that has it.
- **Fonts are unpacked from WOFF to TrueType before React-PDF sees them** (`woff.ts`). fontkit 2.0.4 overruns a WOFF
  table when a font ends with an empty glyph (IBM Plex Mono's space) and can't subset WOFF2 at all.
- **Text the fonts can't show is refused, not printed.** React-PDF draws a character no font has (Devanagari, Tamil,
  emoji) as other letters, so "होटल" would print as "9K2". `issueDocument` refuses such text with
  `VALIDATION`/`UNPRINTABLE_CHARACTERS` before using a number, and `renderPdf` refuses it too. The printable set is
  what every font has and what reads back from the PDF as itself (`printable-text.ts`; a test renders each character).
- **Templates take formatted text.** Amounts and dates arrive as strings (`₹12,50,000.00`, `15 Oct 2026`); templates
  know no money or date rules. An amount never breaks across lines, and words are never hyphenated.
- **An issued document is frozen.** `issued_document.render_input` holds its content and branding with the number and
  printed date, exactly as issued. The runtime role may only set `pdf_attachment_id` and `rendered_at`; it can't change
  or delete the rest.
- **Rendered once, never regenerated.** `issueDocument` publishes `document.issued` in the caller's transaction; the
  listener `documents.render-pdf` renders from the frozen input, stores the PDF through the files module as an
  attachment of the document, and attaches it only if none is attached yet (`updateMany ... where pdfAttachmentId is
null`). A rerun stops at once; of two racing runs, the loser hides its own copy.
- **Numbers per organization and year**, from `nextDocumentNumber` (`DOC-2026-0001`, or a module's own prefix), with
  the year and the printed date counted in the organization's time zone: 00:30 on 1 January in Kolkata is 2027.

## Context

- **Why the worker renders.** A PDF takes tens of milliseconds to seconds and needs fonts in memory; requests stay fast
  and a failure is retried with backoff instead of failing the person's action.
- **Why freeze the input instead of the PDF alone.** The PDF is the record, but if rendering fails (or a font bug
  appears) the document can still be rendered from exactly what was issued, never from records edited since.
- **Why not Devanagari now.** Indian agencies will want Hindi and regional scripts on documents. That needs a font per
  script and React-PDF's text shaping checked for conjuncts; until then refusing is honest, and printing wrong
  letters on a customer's quotation is not.

## Consequences

- The foreign key from `issued_document (organization_id, pdf_attachment_id)` to `attachment (organization_id, id)`
  and the organization relation are added in plan 3's Integration task, with every plan 3 table's: the attachment
  model's back-relation lives in the files module's schema file.
- The organization's logo joins the frozen branding when plan 4 stores branding settings; the renderer already draws
  one (PNG or JPEG).
- A new template is a new function in `templates/`, a value in the `pdfTemplate` contract, and its own content schema.
```

- [ ] **Step 9: Check everything**

Run: `cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 29, db 124, domain 141, eslint-config 65, integrations 30.

- [ ] **Step 10: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-documents && source ~/.nvm/nvm.sh && nvm use >/dev/null
git add docs/adr/0012-pdfs-and-issued-documents.md packages/contracts/src/documents packages/contracts/test/documents \
  packages/db/prisma/schema/documents.prisma packages/db/prisma/migrations/20261015120000_issued_documents \
  packages/db/test/org-table-fixtures/documents.ts packages/domain/src/documents packages/domain/test/documents \
  packages/integrations/src/pdf packages/integrations/test/pdf
git commit -m "feat(domain): issue numbered documents and render each one's PDF once in the worker"
```


---

## Track P: Public routes (rate limits, share links, webhook intake)

- **Delivers** spec 9.3's share links (`/p/<token>`: random, expiring, revocable, every open recorded) and spec 9.7's
  generic webhook intake and rate limits on public routes, as domain modules plus standalone Hono routes that the
  Integration task mounts.
- **Branch** `foundation/03-public`, worktree `/Users/ak/personal/travel-crm-03-public`, from `foundation/03-shared-services`
  after Task 0.2 (`55ce4c9` in the verified replay).
- **Depends on** Task 0 only (`db.withoutOrg`, `publishEvent`, `JobQueue`, `Actor`, `brand`). No other track.

Every command below starts with `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`
(written out in full in each step). When several tracks run at once, `pnpm check` may be run as
`pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`: the same gates
with less Docker load.

Test counts when the track starts (Task 0.2's): api-server 72, api 5, brand 3, contracts 18, db 111, domain 121,
eslint-config 65, integrations 6 (401).

---

### Task P1: Rate limits that hold across api instances

Share links and webhooks are public: anyone can call them. Their rate limit must hold across every api container
(spec 12.3: containers are stateless and run as several copies), so hits are counted in Postgres, in fixed windows,
under a hashed key so the table never holds an IP address. A Hono middleware puts it in front of a route.

**Files:**
- Create: `packages/db/prisma/schema/rate-limits.prisma`, `packages/db/prisma/migrations/20261015130000_rate_limits/migration.sql`
- Create: `packages/domain/src/rate-limits/rate-limiter.ts`, `packages/domain/src/rate-limits/index.ts`, `packages/domain/src/rate-limits/README.md`
- Create: `apps/api/src/rate-limit.ts`
- Create: `docs/adr/0013-public-routes.md`
- Test: `packages/domain/test/rate-limits/rate-limiter.test.ts`, `apps/api/test/public-rate-limit.test.ts`

**Interfaces:**
- Consumes: `Database.withoutOrg<T>(fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>` from
  `@travel-crm/db` (Task 0.2): a transaction with no organization, for tables without `organization_id`.
- Produces:
  - `@travel-crm/domain/rate-limits`: `createRateLimiter(db: Pick<Database, "withoutOrg">): RateLimiter`, with
    `RateLimiter.hit(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>` and
    `RateLimiter.purgeExpired(olderThan: Date): Promise<number>`; `RateLimitRule = { limit: number; windowSeconds: number }`;
    `RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }`.
  - `apps/api/src/rate-limit.ts`: `rateLimit(options: RateLimitOptions): MiddlewareHandler` with
    `RateLimitOptions = { limiter: RateLimiter; name: string; limit: number; windowSeconds: number; clientAddress: (request: Request) => string | null }`,
    and `clientAddressFrom(settings: ClientAddressSettings): (request: Request) => string | null` with
    `ClientAddressSettings = { headerNames: readonly string[]; trustedProxies: readonly string[] }`. It follows Better
    Auth's sign-in rule (ADR 0006): in the first configured header present, the first address from the right that
    isn't a trusted proxy; with no trusted proxies, only a header holding exactly one address; otherwise null. IPv4-mapped
    IPv6 becomes IPv4, and IPv6 its /64 network address. A malformed trusted-proxy entry throws a `RangeError`.
  - The Integration task schedules `purgeExpired` daily and mounts `rateLimit(...)` on `/p/*` and `/webhooks/*`, with
    `clientAddressFrom({ headerNames: AUTH_IP_ADDRESS_HEADERS, trustedProxies: AUTH_TRUSTED_PROXIES })` (plan 2's
    environment settings, the ones Better Auth's sign-in limit uses).

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-03-public -b foundation/03-public foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the install changes nothing and asks nothing; "Generated Prisma Client".

- [ ] **Step 2: Write the failing test for the limiter**

`packages/domain/test/rate-limits/rate-limiter.test.ts`:
```ts
// The rate limiter counts hits per key in fixed windows, in Postgres, so every api instance counts against the same
// limit. Keys are stored hashed, never as the IP addresses they contain.
import { createHash } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createRateLimiter } from "../../src/rate-limits/index.js";

const rule = { limit: 3, windowSeconds: 60 };
const windowOpens = new Date("2026-10-15T10:00:00Z");
const secondsLater = (seconds: number) => new Date(windowOpens.getTime() + seconds * 1000);

describe("rate limiter", () => {
  let db: Database;
  let otherInstance: Database;

  beforeAll(() => {
    const { runtime } = inject("dbUrls");
    db = createDatabase(runtime, { maxConnections: 2 });
    otherInstance = createDatabase(runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await otherInstance.disconnect();
  });

  it("allows the limit within a window, then refuses with the seconds until the next one", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    expect(await limiter.hit(key, rule, secondsLater(0))).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(1))).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(2))).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(15))).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });
  });

  it("starts again in the next window, and keeps no older windows for the key", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    for (const second of [0, 1, 2, 3]) await limiter.hit(key, rule, secondsLater(second));
    expect(await limiter.hit(key, rule, secondsLater(60))).toMatchObject({ allowed: true, remaining: 2 });
    const hashedKey = createHash("sha256").update(key).digest("hex");
    const rows = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ where: { key: hashedKey } }));
    expect(rows).toEqual([{ key: hashedKey, windowStart: secondsLater(60), count: 1 }]);
  });

  it("counts hits from two api instances against one limit", async () => {
    const key = `webhooks:${crypto.randomUUID()}`;
    const first = createRateLimiter(db);
    const second = createRateLimiter(otherInstance);
    await first.hit(key, rule, secondsLater(0));
    await second.hit(key, rule, secondsLater(1));
    await first.hit(key, rule, secondsLater(2));
    expect((await second.hit(key, rule, secondsLater(3))).allowed).toBe(false);
  });

  it("stores a hash of the key, not the address in it", async () => {
    const address = `203.0.113.${String(Math.floor(Math.random() * 200))}`;
    await createRateLimiter(db).hit(`share-link:${address}`, rule, secondsLater(0));
    const keys = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ select: { key: true } }));
    expect(keys.every((row) => /^[0-9a-f]{64}$/.test(row.key))).toBe(true);
    expect(keys.some((row) => row.key.includes(address))).toBe(false);
  });

  it("purges windows that ended before a time, for the daily clean-up", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    await limiter.hit(key, rule, new Date("2020-01-01T00:00:00Z"));
    expect(await limiter.purgeExpired(new Date("2021-01-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
    expect(await limiter.hit(key, rule, new Date("2020-01-01T00:00:10Z"))).toMatchObject({ remaining: 2 });
  });

  it("refuses a rule that isn't a positive whole limit and window", async () => {
    const limiter = createRateLimiter(db);
    await expect(limiter.hit("k", { limit: 0, windowSeconds: 60 })).rejects.toThrow(RangeError);
    await expect(limiter.hit("k", { limit: 5, windowSeconds: 1.5 })).rejects.toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/rate-limits`

Expected: FAIL. `Cannot find module '../../src/rate-limits/index.js'`.

- [ ] **Step 4: Add the counter table**

`packages/db/prisma/schema/rate-limits.prisma`:
```prisma
// Rate-limit counters for the public routes (spec 9.7): share links, webhooks and, later, public forms. They live in
// Postgres so every api instance counts against the same limit (containers are stateless, spec 12.3).
// No organization_id: a key names a limit and a client, so it belongs to no organization. Reached with db.withoutOrg().

/// The requests one key made in one fixed window.
model RateLimitCounter {
  /// sha256 of "<limit name>:<client address>", in hex (CHECK rate_limit_counter_key_hash): no IP addresses are kept.
  key         String
  windowStart DateTime @map("window_start") @db.Timestamptz(6)
  count       Int

  @@id([key, windowStart])
  @@map("rate_limit_counter")
}
```

The table has no `organization_id`, so row-level security and the isolation suite don't apply; the api reaches it
only through `db.withoutOrg()`. Generate the migration from the schema alone (no database: other tracks run at the
same time):
```bash
cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
migration=packages/db/prisma/migrations/20261015130000_rate_limits && mkdir -p "$migration"
(cd packages/db && pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script) > "$migration/migration.sql"
cat "$migration/migration.sql"
```
Expected: exactly the SQL above the "Hand-written" banner in the file below. Then make the file exactly this (append
the banner and the two checks):

`packages/db/prisma/migrations/20261015130000_rate_limits/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "rate_limit_counter" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("key","window_start")
);


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Keys are sha256 hashes in hex, so the table never holds the IP addresses they were made from; counts start at 1.
ALTER TABLE "rate_limit_counter"
  ADD CONSTRAINT rate_limit_counter_key_hash CHECK (key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT rate_limit_counter_count_positive CHECK (count > 0);
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate`

Expected: "Generated Prisma Client".

- [ ] **Step 5: Write the limiter**

`packages/domain/src/rate-limits/rate-limiter.ts`:
```ts
// Fixed-window rate limits kept in Postgres (spec 9.7), so every api instance counts against the same limit.
import { createHash } from "node:crypto";
import type { Database } from "@travel-crm/db";

/** At most `limit` hits per key in each window of `windowSeconds`. */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits left in this window. */
  remaining: number;
  /** Seconds until the next window opens, when refused; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one hit for key, e.g. "share-link:203.0.113.7", and says whether it is within the rule. */
  hit(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>;
  /** Deletes the windows that started before olderThan, for a daily clean-up job. Returns how many went. */
  purgeExpired(olderThan: Date): Promise<number>;
}

function assertRule({ limit, windowSeconds }: RateLimitRule): void {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new RangeError(
      `A rate limit needs a whole limit and window of at least 1, got ${String(limit)}/${String(windowSeconds)}s`,
    );
  }
}

/** Keys hold client addresses: only their hash is stored. */
function hashOf(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function createRateLimiter(db: Pick<Database, "withoutOrg">): RateLimiter {
  return {
    async hit(key, rule, now = new Date()) {
      assertRule(rule);
      const windowMilliseconds = rule.windowSeconds * 1000;
      const windowStart = new Date(Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds);
      const hashedKey = hashOf(key);
      const count = await db.withoutOrg(async (tx) => {
        // The key's finished windows are no longer needed; deleting them here keeps busy keys from piling up.
        await tx.rateLimitCounter.deleteMany({ where: { key: hashedKey, windowStart: { lt: windowStart } } });
        const [row] = await tx.$queryRaw<{ count: number }[]>`
          INSERT INTO rate_limit_counter (key, window_start, count) VALUES (${hashedKey}, ${windowStart}, 1)
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counter.count + 1
          RETURNING count`;
        if (!row) throw new Error("The rate-limit counter returned no count");
        return row.count;
      });
      const allowed = count <= rule.limit;
      const nextWindowAt = windowStart.getTime() + windowMilliseconds;
      return {
        allowed,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: allowed ? 0 : Math.ceil((nextWindowAt - now.getTime()) / 1000),
      };
    },
    async purgeExpired(olderThan) {
      const { count } = await db.withoutOrg((tx) =>
        tx.rateLimitCounter.deleteMany({ where: { windowStart: { lt: olderThan } } }),
      );
      return count;
    },
  };
}
```

`packages/domain/src/rate-limits/index.ts`:
```ts
// Public API of the rate-limits module: limits on the public routes that hold across api instances (spec 9.7).
export { createRateLimiter, type RateLimiter, type RateLimitResult, type RateLimitRule } from "./rate-limiter.js";
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/rate-limits`

Expected: 6 tests pass. The global setup's drift check passes too, which proves the migration matches the schema.

- [ ] **Step 7: Write the failing test for the middleware**

`apps/api/test/rate-limit.test.ts` already exists and tests Better Auth's sign-in limit, so this one has its own name.

`apps/api/test/public-rate-limit.test.ts`:
```ts
// The public routes' rate limit: per limit name and client address, counted in Postgres, answering 429 with
// Retry-After when over. Better Auth's own sign-in limit is tested in rate-limit.test.ts.
import { createDatabase, type Database } from "@travel-crm/db";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clientAddressFrom, rateLimit } from "../src/rate-limit.js";

describe("public rate limit", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  /** A tiny app behind the limit, with a name of its own so tests don't share counts. */
  function limitedApp(limit: number, trustedProxies: readonly string[] = []) {
    const app = new Hono();
    app.use(
      rateLimit({
        limiter: createRateLimiter(db),
        name: `test-${crypto.randomUUID()}`,
        limit,
        windowSeconds: 60,
        clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies }),
      }),
    );
    app.get("/", (c) => c.text("ok"));
    return app;
  }

  const from = (address: string) => ({ headers: { "x-forwarded-for": address } });

  it("lets requests through under the limit and says how many are left", async () => {
    const app = limitedApp(2);
    const first = await app.request("/", from("203.0.113.10"));
    expect(first.status).toBe(200);
    expect(first.headers.get("ratelimit-remaining")).toBe("1");
  });

  it("answers 429 with Retry-After once the limit is used up", async () => {
    const app = limitedApp(2);
    await app.request("/", from("203.0.113.11"));
    await app.request("/", from("203.0.113.11"));
    const refused = await app.request("/", from("203.0.113.11"));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.headers.get("ratelimit-remaining")).toBe("0");
    expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED", reason: "RATE_LIMITED" });
  });

  it("counts each client address on its own", async () => {
    const app = limitedApp(1);
    expect((await app.request("/", from("203.0.113.12"))).status).toBe(200);
    expect((await app.request("/", from("203.0.113.13"))).status).toBe(200);
    expect((await app.request("/", from("203.0.113.12"))).status).toBe(429);
  });

  it("can't be dodged by forging addresses in front of the proxy's", async () => {
    const app = limitedApp(1, ["10.0.0.0/8"]);
    expect((await app.request("/", from("1.1.1.1, 203.0.113.14, 10.0.0.5"))).status).toBe(200);
    expect((await app.request("/", from("2.2.2.2, 203.0.113.14, 10.0.0.5"))).status).toBe(429);
  });

  it("puts requests with no address in one shared bucket instead of letting them through", async () => {
    const app = limitedApp(1);
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
  });
});

describe("clientAddressFrom", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  const forwarded = (value: string) => request({ "x-forwarded-for": value });
  const behindProxies = clientAddressFrom({
    headerNames: ["x-forwarded-for"],
    trustedProxies: ["10.0.0.0/8", "2001:db8:ffff::1"],
  });
  const direct = clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] });

  it("behind trusted proxies, takes the first address from the right that isn't a proxy", () => {
    expect(behindProxies(forwarded("203.0.113.20, 10.0.0.5"))).toBe("203.0.113.20");
    // The leftmost values are whatever the client sent: a forged one is ignored.
    expect(behindProxies(forwarded("6.6.6.6, 203.0.113.20, 10.1.2.3"))).toBe("203.0.113.20");
    expect(behindProxies(forwarded("203.0.113.20, ::ffff:10.0.0.5, 2001:db8:ffff::1"))).toBe("203.0.113.20");
    expect(behindProxies(forwarded("10.0.0.7, 10.0.0.5"))).toBeNull();
    expect(behindProxies(forwarded("203.0.113.20, nonsense, 10.0.0.5"))).toBeNull();
  });

  it("without trusted proxies, believes only a header holding exactly one valid address", () => {
    expect(direct(forwarded(" 203.0.113.20 "))).toBe("203.0.113.20");
    expect(direct(forwarded("6.6.6.6, 203.0.113.20"))).toBeNull();
    expect(direct(forwarded("nonsense"))).toBeNull();
    expect(direct(forwarded(" , "))).toBeNull();
    expect(direct(request({}))).toBeNull();
  });

  it("reads the first configured header that is present, and only that one", () => {
    const address = clientAddressFrom({ headerNames: ["cf-connecting-ip", "x-forwarded-for"], trustedProxies: [] });
    expect(address(request({ "cf-connecting-ip": "198.51.100.5", "x-forwarded-for": "203.0.113.20" }))).toBe(
      "198.51.100.5",
    );
    expect(address(request({ "x-forwarded-for": "203.0.113.20" }))).toBe("203.0.113.20");
    expect(address(request({ "cf-connecting-ip": "6.6.6.6, 7.7.7.7", "x-forwarded-for": "203.0.113.20" }))).toBeNull();
  });

  it("writes IPv4-mapped IPv6 as IPv4, and counts one IPv6 /64 as one client", () => {
    expect(direct(forwarded("::ffff:198.51.100.5"))).toBe("198.51.100.5");
    expect(direct(forwarded("2001:db8:85a3:1::1"))).toBe("2001:db8:85a3:1::");
    expect(direct(forwarded("2001:0DB8:85A3:0001:ffff:ffff:ffff:2"))).toBe("2001:db8:85a3:1::");
    expect(direct(forwarded("2001:db8:85a3:2::1"))).toBe("2001:db8:85a3:2::");
    expect(direct(forwarded("fe80::1%eth0"))).toBeNull();
  });

  it("refuses a trusted-proxy setting that isn't an IP address or CIDR range", () => {
    for (const trustedProxies of [["10.0.0.0/33"], ["example.com"], ["10.0.0.0/"], ["10.0.0.0/8/8"]]) {
      expect(() => clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies })).toThrow(RangeError);
    }
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/public-rate-limit.test.ts`

Expected: FAIL. `Cannot find module '../src/rate-limit.js'`.

- [ ] **Step 8: Write the middleware**

`apps/api/src/rate-limit.ts`:
```ts
// Rate limits for the public routes (share links, webhooks): Hono middleware over the domain's Postgres-backed limiter.
import { BlockList, isIP } from "node:net";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { MiddlewareHandler } from "hono";

export interface RateLimitOptions {
  limiter: RateLimiter;
  /** Names the limit, e.g. "share-links": each name counts separately. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** The client's address, from clientAddressFrom(...), or null when none can be trusted. */
  clientAddress: (request: Request) => string | null;
}

/** Counts every request per limit name and client address; over the limit, answers 429 with Retry-After. */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const rule = { limit: options.limit, windowSeconds: options.windowSeconds };
  return async (c, next) => {
    // Without an address, every such request shares one bucket: an unknown client is limited, never let through.
    const address = options.clientAddress(c.req.raw) ?? "no-address";
    const result = await options.limiter.hit(`${options.name}:${address}`, rule);
    c.header("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(
        { code: "RATE_LIMITED", reason: "RATE_LIMITED", message: "Too many requests. Try again in a little while." },
        429,
      );
    }
    await next();
  };
}

export interface ClientAddressSettings {
  /** Headers the load balancer puts the client's address in (AUTH_IP_ADDRESS_HEADERS); the first present is read. */
  headerNames: readonly string[];
  /** IPs and CIDR ranges of the proxies in front of the api (AUTH_TRUSTED_PROXIES). */
  trustedProxies: readonly string[];
}

/** A forwarded hop's address, with IPv4-mapped IPv6 written as the IPv4 address it is. */
interface Hop {
  address: string;
  family: "ipv4" | "ipv6";
}

/** The eight groups of an IPv6 address. The URL parser gives its shortest form, refuses zone ids, and writes a dotted tail in hex. */
function ipv6Groups(address: string): number[] | null {
  let host: string;
  try {
    host = new URL(`http://[${address}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const groups = (part: string) => (part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const [head = "", tail] = host.split("::");
  if (tail === undefined) return groups(head);
  const left = groups(head);
  const right = groups(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

function parseHop(text: string): Hop | null {
  if (isIP(text) === 4) return { address: text, family: "ipv4" };
  if (isIP(text) !== 6) return null;
  const groups = ipv6Groups(text);
  if (groups?.length !== 8) return null;
  const [, , , , , marker = 0, high = 0, low = 0] = groups;
  if (groups.slice(0, 5).every((group) => group === 0) && marker === 0xffff) {
    return { address: [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."), family: "ipv4" };
  }
  return { address: new URL(`http://[${text}]`).hostname.slice(1, -1), family: "ipv6" };
}

/** What the rate limit counts: an IPv4 address, or an IPv6 address's /64, so one host can't rotate addresses in it. */
function countedAddress(hop: Hop): string {
  if (hop.family === "ipv4") return hop.address;
  const network = (ipv6Groups(hop.address) ?? []).slice(0, 4).map((group) => group.toString(16));
  return new URL(`http://[${network.join(":")}::]`).hostname.slice(1, -1);
}

/** The trusted proxies as a BlockList. A malformed entry throws: the environment check should have refused it. */
function trustedProxyList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = "", prefix, ...rest] = entry.split("/");
    const hop = parseHop(address);
    const maximumPrefix = hop?.family === "ipv4" ? 32 : 128;
    const badPrefix = prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maximumPrefix);
    if (!hop || badPrefix || rest.length > 0) {
      throw new RangeError(`Not an IP address or CIDR range: ${JSON.stringify(entry)}`);
    }
    if (prefix === undefined) list.addAddress(hop.address, hop.family);
    else list.addSubnet(hop.address, Number(prefix), hop.family);
  }
  return list;
}

/**
 * Reads the client's address the way Better Auth does for sign-in (ADR 0006), so a client can't forge one: from the
 * first configured header that is present, split on commas. With trusted proxies, the client is the first address
 * from the right that isn't one of them (the leftmost values are whatever the client sent). Without them, only a
 * header holding exactly one address is believed. A malformed address, or none left, gives null, which the rate
 * limit counts in one shared bucket. IPv6 addresses come back as their /64 network.
 */
export function clientAddressFrom(settings: ClientAddressSettings): (request: Request) => string | null {
  const trusted = trustedProxyList(settings.trustedProxies);
  const behindProxies = settings.trustedProxies.length > 0;
  return (request) => {
    const header = settings.headerNames.find((name) => request.headers.has(name));
    if (header === undefined) return null;
    const values = (request.headers.get(header) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");
    if (!behindProxies) {
      const only = values.length === 1 && values[0] !== undefined ? parseHop(values[0]) : null;
      return only ? countedAddress(only) : null;
    }
    for (const value of values.toReversed()) {
      const hop = parseHop(value);
      if (!hop) return null;
      if (!trusted.check(hop.address, hop.family)) return countedAddress(hop);
    }
    return null;
  };
}
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/public-rate-limit.test.ts`

Expected: 10 tests pass: 5 for the middleware (including that forged addresses in front of a trusted proxy don't
open new buckets) and 5 for `clientAddressFrom`.

- [ ] **Step 9: Document the module and the decision**

`packages/domain/src/rate-limits/README.md`:
```markdown
# rate-limits

Limits on the public routes (spec 9.7): share links, webhooks and, later, public forms. Counted in Postgres, so
every api instance counts against the same limit.

## Public functions and values (`index.ts`)

- `createRateLimiter(db)` returns a `RateLimiter`:
  - `hit(key, { limit, windowSeconds }, now?)`: counts one hit and returns `{ allowed, remaining, retryAfterSeconds }`;
  - `purgeExpired(olderThan)`: deletes windows that started before `olderThan`, for a daily clean-up job.
- Types: `RateLimiter`, `RateLimitRule`, `RateLimitResult`.

The api's Hono middleware is `rateLimit(...)` in `apps/api/src/rate-limit.ts`.

## Events

None.

## Rules worth knowing

- Fixed windows: at most `limit` hits per key in each window of `windowSeconds`, the windows counted from the Unix epoch.
- Keys are stored as sha256 hashes: `rate_limit_counter` never holds an IP address. The table has no
  `organization_id` and is reached with `db.withoutOrg()`.
- A key's finished windows are deleted when the key is hit again; `purgeExpired` clears keys that never come back.
```

`docs/adr/0013-public-routes.md`:
```markdown
# 0013: Public routes: rate limits, share links and the webhook intake

Date: 2026-10-15 · Status: accepted · Implements spec sections 9.3 (share links) and 9.7

## Decision

### Rate limits

- **Counted in Postgres**, in `rate_limit_counter` (`key`, `window_start`, `count`), with fixed windows. One
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per hit, in `db.withoutOrg()`.
- **Keys are hashed.** A key names the limit and the client (`share-links:203.0.113.7`); only its sha256 is stored, so
  the table holds no IP addresses.
- **Hono middleware** `rateLimit({ limiter, name, limit, windowSeconds, clientAddress })` answers 429 with
  `Retry-After` and `{ code: "RATE_LIMITED" }`, and sets `RateLimit-Remaining`. Requests without an address share one
  bucket per limit: an unknown client is limited, not let through.
- **The client's address is one it can't forge.** `clientAddressFrom({ headerNames, trustedProxies })` follows Better
  Auth's rule for sign-in (ADR 0006): in the first configured header present (`AUTH_IP_ADDRESS_HEADERS`), the first
  address from the right that isn't a trusted proxy (`AUTH_TRUSTED_PROXIES`); with no trusted proxies, only a header
  holding exactly one address. Anything else is null. IPv4-mapped IPv6 counts as IPv4, and IPv6 as its /64, so one
  host can't rotate addresses to dodge the limit (a token guesser would otherwise send a new fake leftmost
  `x-forwarded-for` value with every try).
- Better Auth's sign-in rate limit (ADR 0006) is separate and unchanged.

## Context

- **Why Postgres, not memory.** Containers are stateless and run as several copies (spec 12.3): a limit kept in one
  container's memory would multiply by the number of copies. Postgres is already there; one indexed upsert per public
  request is cheap at our scale. A shared cache (Redis) can replace it later behind the same `RateLimiter` interface.
- **Why fixed windows.** Simple and exact to test. A client can double its rate across a window boundary, which is
  acceptable for abuse protection.

## Consequences

- Old windows are deleted when their key is hit again; `purgeExpired` (scheduled daily by the worker) clears the rest.
```

Don't add the ADR to `docs/adr/README.md`, or the module to `packages/domain/README.md`: the Integration task adds
every track's rows at once.

- [ ] **Step 10: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 82, api 5, brand 3, contracts 18, db 111, domain 127, eslint-config 65,
integrations 6 (417).

```bash
cd /Users/ak/personal/travel-crm-03-public
git add packages/db/prisma/schema/rate-limits.prisma packages/db/prisma/migrations/20261015130000_rate_limits/migration.sql \
  packages/domain/src/rate-limits packages/domain/test/rate-limits apps/api/src/rate-limit.ts \
  apps/api/test/public-rate-limit.test.ts docs/adr/0013-public-routes.md
git commit -m "feat: add rate limits for the public routes, counted in Postgres"
```

---

### Task P2: Share links

`/p/<token>` opens one record for someone who isn't signed in, such as a customer opening a quotation (spec 9.3). The
token is the organization's id followed by a random 32-byte secret, so the api opens the right organization with
`db.forOrg()` and never looks across organizations; only the secret's hash is stored. Links expire (30 days unless
made otherwise), can be revoked, and every open is recorded and published as `share-link.opened` in the same
transaction, so staff can be told a customer looked (the Integration task turns that event into a notification). The
route hands the record to a resolver registered for its type and answers customers with a small page when a link
doesn't work.

**Files:**
- Create: `packages/db/prisma/schema/share-links.prisma`, `packages/db/prisma/migrations/20261015130100_share_links/migration.sql`,
  `packages/db/test/org-table-fixtures/share-links.ts`
- Create: `packages/contracts/src/share-links/share-links.ts`, `packages/contracts/src/share-links/index.ts`
- Create: `packages/domain/src/share-links/token.ts`, `visitor.ts`, `share-links.ts`, `index.ts`, `README.md`
- Create: `apps/api/src/share-link-route.ts`
- Modify: `docs/adr/0013-public-routes.md`
- Test: `packages/contracts/test/share-links/share-links.test.ts`, `packages/domain/test/share-links/share-links.test.ts`,
  `packages/domain/test/share-links/token.test.ts`, `apps/api/test/share-link-route.test.ts`

**Interfaces:**
- Consumes: `db.forOrg`, `OrgTx` (`@travel-crm/db`); `publishEvent(tx: OrgTx, event: { type: string; payload: EventPayload }): Promise<string>`
  (`@travel-crm/domain/jobs`, Task 0.2); `Actor`, `DomainError` (`@travel-crm/domain/kernel`); `brand`
  (`@travel-crm/brand`, Task 0.1); `clientAddressFrom` (Task P1, in the route's test).
- Produces:
  - `@travel-crm/domain/share-links`:
    - `createShareLink(tx: OrgTx, actor: Actor, input: NewShareLink, now?: Date): Promise<{ shareLinkId: string; token: string; path: string }>`,
      `NewShareLink = { recordType: string; recordId: string; label: string; expiresAt?: Date | null }`;
    - `revokeShareLink(tx: OrgTx, actor: Actor, input: { shareLinkId: string }): Promise<void>`;
    - `openShareLink(db: Pick<Database, "forOrg">, token: string, visitor: ShareLinkVisitor, now?: Date): Promise<OpenedShareLink>`,
      `ShareLinkVisitor = { ipAddress: string | null; userAgent: string | null }`,
      `OpenedShareLink = { organizationId: string; shareLinkId: string; recordType: string; recordId: string; label: string; createdBy: string | null }`;
      failures are `DomainError("NOT_FOUND", "LINK_NOT_FOUND" | "LINK_EXPIRED" | "LINK_REVOKED")`;
    - `listShareLinks(tx: OrgTx, record: SharedRecord): Promise<ShareLinkSummary[]>`, `SharedRecord = { recordType: string; recordId: string }`.
  - The event `share-link.opened` with payload `{ shareLinkId, openId }`.
  - `@travel-crm/contracts/share-links`: `shareableRecordType`, `shareLinkLabel`, `shareLinkToken`,
    `createShareLinkInput`, `createdShareLink`, `revokeShareLinkInput`, `shareLinkSummary`, `shareLinkOpenedEvent`, and
    their `z.infer` types.
  - `apps/api/src/share-link-route.ts`: `shareLinkRoutes(options: ShareLinkRouteOptions): Hono` with
    `ShareLinkRouteOptions = { open: (token: string, visitor: ShareLinkVisitor) => Promise<OpenedShareLink>; resolvers: Readonly<Record<string, ShareLinkResolver>>; clientAddress: (request: Request) => string | null }`
    and `ShareLinkResolver = (opened: OpenedShareLink) => Promise<Response>`. The Integration task mounts it with
    `app.route("/p", shareLinkRoutes(...))` and registers the `issued_document` resolver.

- [ ] **Step 1: Write the failing domain tests**

`packages/domain/test/share-links/share-links.test.ts`:
```ts
// Share links (spec 9.3) against Postgres: a link opens one record, expires, can be revoked, records every open and
// publishes share-link.opened, and never opens another organization's record.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import { createShareLink, listShareLinks, openShareLink, revokeShareLink } from "../../src/share-links/index.js";

const DAY = 24 * 60 * 60 * 1000;
const visitor = { ipAddress: "203.0.113.77", userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140.0" };

describe("share links", () => {
  let platform: PlatformClient;
  let db: Database;
  let agent: Actor;
  let otherAgent: Actor;
  const record = { recordType: "issued_document", recordId: "0199e7a0-0000-7000-8000-0000000000d1" };

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    const organizationId = await createTestOrganization(platform, "Share links");
    const otherOrganizationId = await createTestOrganization(platform, "Other share links");
    agent = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000a1", source: "web", impersonatedBy: null };
    otherAgent = { ...agent, organizationId: otherOrganizationId };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const share = (input: { label?: string; expiresAt?: Date | null } = {}, actor = agent) =>
    db.forOrg(actor.organizationId, (tx) =>
      createShareLink(tx, actor, {
        ...record,
        label: input.label ?? "Quotation QT-2026-0042",
        expiresAt: input.expiresAt,
      }),
    );

  it("opens the record it was made for, records the open and publishes share-link.opened", async () => {
    const link = await share();
    expect(link.path).toBe(`/p/${link.token}`);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{65}$/);

    const opened = await openShareLink(db, link.token, visitor);
    expect(opened).toEqual({
      organizationId: agent.organizationId,
      shareLinkId: link.shareLinkId,
      ...record,
      label: "Quotation QT-2026-0042",
      createdBy: agent.userId,
    });
    const [open] = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLinkOpen.findMany({ where: { shareLinkId: link.shareLinkId } }),
    );
    expect(open).toMatchObject({ ipAddress: "203.0.113.0", userAgent: visitor.userAgent });
    const events = await db.forOrg(agent.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "share-link.opened" } }),
    );
    expect(events.map((event) => event.payload)).toContainEqual({ shareLinkId: link.shareLinkId, openId: open?.id });
  });

  it("stores only a hash of the token's secret part", async () => {
    const link = await share();
    const stored = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLink.findUniqueOrThrow({ where: { id: link.shareLinkId } }),
    );
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(link.token).not.toContain(stored.tokenHash);
  });

  it("expires after 30 days unless told otherwise, and a link without expiry keeps working", async () => {
    const lasting = await share();
    await expect(openShareLink(db, lasting.token, visitor, new Date(Date.now() + 29 * DAY))).resolves.toBeDefined();
    await expect(openShareLink(db, lasting.token, visitor, new Date(Date.now() + 31 * DAY))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "LINK_EXPIRED",
    });
    const forever = await share({ expiresAt: null });
    await expect(openShareLink(db, forever.token, visitor, new Date(Date.now() + 3650 * DAY))).resolves.toBeDefined();
  });

  it("stops working once revoked, and revoking twice is harmless", async () => {
    const link = await share();
    await db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: link.shareLinkId }));
    await db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: link.shareLinkId }));
    await expect(openShareLink(db, link.token, visitor)).rejects.toMatchObject({ reason: "LINK_REVOKED" });
    const stored = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLink.findUniqueOrThrow({ where: { id: link.shareLinkId } }),
    );
    expect(stored.revokedBy).toBe(agent.userId);
  });

  it("finds nothing for unknown, malformed or altered tokens", async () => {
    const link = await share();
    const notFound = { code: "NOT_FOUND", reason: "LINK_NOT_FOUND" };
    const otherSecret = `${link.token.slice(0, 22)}${"A".repeat(43)}`;
    await expect(openShareLink(db, otherSecret, visitor)).rejects.toMatchObject(notFound);
    await expect(openShareLink(db, "not-a-token", visitor)).rejects.toMatchObject(notFound);
    await expect(openShareLink(db, `${link.token}x`, visitor)).rejects.toMatchObject(notFound);
    // The same secret under another organization's id opens nothing: the secret is looked up in that organization.
    const theirs = await share({}, otherAgent);
    const crossed = `${theirs.token.slice(0, 22)}${link.token.slice(22)}`;
    await expect(openShareLink(db, crossed, visitor)).rejects.toMatchObject(notFound);
  });

  it("can't revoke another organization's link", async () => {
    const theirs = await share({}, otherAgent);
    await expect(
      db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: theirs.shareLinkId })),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "LINK_NOT_FOUND" });
  });

  it("lists a record's links, newest first, with how often and when they were opened", async () => {
    const recordId = "0199e7a0-0000-7000-8000-0000000000d2";
    const listed = { recordType: "issued_document", recordId };
    const first = await db.forOrg(agent.organizationId, (tx) =>
      createShareLink(tx, agent, { ...listed, label: "First" }),
    );
    const second = await db.forOrg(agent.organizationId, (tx) =>
      createShareLink(tx, agent, { ...listed, label: "Second" }),
    );
    await openShareLink(db, first.token, visitor);
    await openShareLink(db, first.token, visitor);

    const links = await db.forOrg(agent.organizationId, (tx) => listShareLinks(tx, listed));
    expect(links.map((link) => [link.id, link.label, link.openCount])).toEqual([
      [second.shareLinkId, "Second", 0],
      [first.shareLinkId, "First", 2],
    ]);
    expect(links[1]?.lastOpenedAt).not.toBeNull();
    expect(links[0]).toMatchObject({ lastOpenedAt: null, revokedAt: null, createdBy: agent.userId });
    expect(await db.forOrg(otherAgent.organizationId, (tx) => listShareLinks(tx, listed))).toEqual([]);
  });

  it("refuses a malformed record type or id, an empty label, or an expiry in the past", async () => {
    const make = (input: Partial<Parameters<typeof createShareLink>[2]>) =>
      db.forOrg(agent.organizationId, (tx) => createShareLink(tx, agent, { ...record, label: "Quote", ...input }));
    await expect(make({ recordType: "Issued Document" })).rejects.toMatchObject({ reason: "INVALID_RECORD_TYPE" });
    await expect(make({ recordId: "42" })).rejects.toMatchObject({ reason: "INVALID_RECORD_ID" });
    await expect(make({ label: "   " })).rejects.toMatchObject({ reason: "INVALID_LABEL" });
    await expect(make({ expiresAt: new Date(Date.now() - 1000) })).rejects.toMatchObject({
      reason: "EXPIRY_IN_THE_PAST",
    });
  });

  it("lets the api revoke a link but never edit or delete it", async () => {
    const link = await share();
    await expect(
      db.forOrg(agent.organizationId, (tx) => tx.$executeRaw`UPDATE share_link SET label = 'changed'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.forOrg(
        agent.organizationId,
        (tx) => tx.$executeRaw`DELETE FROM share_link WHERE id = ${link.shareLinkId}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
```

`packages/domain/test/share-links/token.test.ts`:
```ts
// Share-link tokens carry their organization in the clear and a random secret, of which only a hash is stored.
import { describe, expect, it } from "vitest";
import { newShareLinkToken, parseShareLinkToken } from "../../src/share-links/token.js";
import { truncateIpAddress } from "../../src/share-links/visitor.js";

const organizationId = "0199e7a0-1234-7abc-8def-0123456789ab";

describe("share-link tokens", () => {
  it("are 65 URL-safe characters that parse back to the organization and the secret's hash", () => {
    const { token, secretHash } = newShareLinkToken(organizationId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{65}$/);
    expect(parseShareLinkToken(token)).toEqual({ organizationId, secretHash });
  });

  it("are different every time", () => {
    expect(newShareLinkToken(organizationId).token).not.toBe(newShareLinkToken(organizationId).token);
  });

  it("refuse anything else", () => {
    const { token } = newShareLinkToken(organizationId);
    expect(parseShareLinkToken(token.slice(1))).toBeNull();
    expect(parseShareLinkToken(`${token.slice(0, 64)}=`)).toBeNull();
    expect(parseShareLinkToken("")).toBeNull();
    // Base64 has spare bits in a part's last character: a variant that decodes to the same bytes is refused, so
    // each link has exactly one token.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const variant = alphabet.charAt(alphabet.indexOf(token.charAt(21)) + 1);
    expect(parseShareLinkToken(`${token.slice(0, 21)}${variant}${token.slice(22)}`)).toBeNull();
  });

  it("refuse an organization id that isn't a UUID", () => {
    expect(() => newShareLinkToken("not-a-uuid")).toThrow(RangeError);
  });
});

describe("truncateIpAddress", () => {
  it("keeps the first three parts of an IPv4 address", () => {
    expect(truncateIpAddress("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIpAddress("::ffff:198.51.100.9")).toBe("198.51.100.0");
  });

  it("keeps the first 48 bits of an IPv6 address", () => {
    expect(truncateIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3::");
    expect(truncateIpAddress("2001:db8::1")).toBe("2001:db8:0::");
    expect(truncateIpAddress("1::2:3:4:5:6:7")).toBe("1:0:2::");
    expect(truncateIpAddress("fe80::1%eth0")).toBe("fe80:0:0::");
  });

  it("drops anything that isn't an address", () => {
    expect(truncateIpAddress(null)).toBeNull();
    expect(truncateIpAddress("unknown")).toBeNull();
    expect(truncateIpAddress("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/share-links`

Expected: FAIL. `Cannot find module '../../src/share-links/index.js'` and `'../../src/share-links/token.js'`.

- [ ] **Step 3: Add the tables, their migration and their isolation fixtures**

`packages/db/prisma/schema/share-links.prisma`:
```prisma
// Share links (spec 9.3): /p/<token> lets a customer open one record, such as an issued document, without signing in.
// Organization-owned: row-level security applies (the migration calls app_enable_org_rls on both tables).

/// One link to one record. The token is shown once, when the link is made; only a hash of its secret is kept.
model ShareLink {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String          @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String          @id @default(uuid(7)) @db.Uuid
  /// sha256 of the token's secret part, in hex (CHECK share_link_token_hash_format).
  tokenHash      String          @map("token_hash")
  /// What the link opens, e.g. "issued_document" (CHECK share_link_record_type_format).
  recordType     String          @map("record_type")
  recordId       String          @map("record_id") @db.Uuid
  /// What was shared, as staff see it, e.g. "Quotation QT-2026-0042".
  label          String
  /// The user who made the link; null when the system made it.
  createdBy      String?         @map("created_by") @db.Uuid
  createdAt      DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
  /// Null: the link never expires.
  expiresAt      DateTime?       @map("expires_at") @db.Timestamptz(6)
  /// Set once, when the link is turned off. The only columns the api and worker may change.
  revokedAt      DateTime?       @map("revoked_at") @db.Timestamptz(6)
  revokedBy      String?         @map("revoked_by") @db.Uuid
  opens          ShareLinkOpen[]

  /// Lets share_link_open point at (organization_id, id).
  @@unique([organizationId, id])
  /// Opening a link looks its secret's hash up within the organization the token names.
  @@unique([organizationId, tokenHash])
  @@index([organizationId, recordType, recordId])
  @@map("share_link")
}

/// One time a share link was opened (spec 9.3: opening is recorded). Append-only.
model ShareLinkOpen {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String    @id @default(uuid(7)) @db.Uuid
  shareLinkId    String    @map("share_link_id") @db.Uuid
  openedAt       DateTime  @default(now()) @map("opened_at") @db.Timestamptz(6)
  /// The visitor's network, not their address: IPv4 cut to /24, IPv6 to /48.
  ipAddress      String?   @map("ip_address")
  /// The browser's User-Agent, at most 300 characters.
  userAgent      String?   @map("user_agent")
  shareLink      ShareLink @relation(fields: [organizationId, shareLinkId], references: [organizationId, id], onDelete: Restrict)

  @@index([organizationId, shareLinkId, openedAt])
  @@map("share_link_open")
}
```

Both models leave out the `organization` relation: the Integration task adds every track's relations to
`Organization` (and their foreign keys) at once, so no track edits `organization.prisma`. The foreign key between the
two tables pairs `organization_id`, as `organization-keys.test.ts` requires.

```bash
cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
migration=packages/db/prisma/migrations/20261015130100_share_links && mkdir -p "$migration"
(cd packages/db && pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script) > "$migration/migration.sql"
cat "$migration/migration.sql"
```
Expected: exactly the SQL above the "Hand-written" banner below. Then make the file exactly this:

`packages/db/prisma/migrations/20261015130100_share_links/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "share_link" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_open" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "share_link_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "share_link_open_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_link_organization_id_record_type_record_id_idx" ON "share_link"("organization_id", "record_type", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_organization_id_id_key" ON "share_link"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_organization_id_token_hash_key" ON "share_link"("organization_id", "token_hash");

-- CreateIndex
CREATE INDEX "share_link_open_organization_id_share_link_id_opened_at_idx" ON "share_link_open"("organization_id", "share_link_id", "opened_at");

-- AddForeignKey
ALTER TABLE "share_link_open" ADD CONSTRAINT "share_link_open_organization_id_share_link_id_fkey" FOREIGN KEY ("organization_id", "share_link_id") REFERENCES "share_link"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('share_link');
SELECT app_enable_org_rls('share_link_open');

-- Token hashes are sha256 in hex; record types read like "issued_document"; labels and user agents stay short.
ALTER TABLE "share_link"
  ADD CONSTRAINT share_link_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT share_link_record_type_format CHECK (record_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT share_link_label_length CHECK (char_length(label) BETWEEN 1 AND 200);
ALTER TABLE "share_link_open"
  ADD CONSTRAINT share_link_open_user_agent_length CHECK (char_length(user_agent) <= 300);

-- A link is turned off, never edited or deleted: the api and worker may set revoked_at and revoked_by only.
REVOKE UPDATE, DELETE ON TABLE "share_link" FROM app_runtime;
GRANT UPDATE (revoked_at, revoked_by) ON TABLE "share_link" TO app_runtime;

-- Opens are a record of what happened.
REVOKE UPDATE, DELETE ON TABLE "share_link_open" FROM app_runtime;
```

Both tables are append-only for the runtime role (it may set only `share_link.revoked_at` and `revoked_by`), so their
fixtures say `appendOnly: true` and the isolation suite expects updates of `organization_id` and deletes to be refused
outright:

`packages/db/test/org-table-fixtures/share-links.ts`:
```ts
// Isolation fixtures for share links and their opens. Both are append-only for the runtime role: links can only be
// revoked (two named columns), opens never change.
import type { OrgTableFixtures } from "../org-table-fixture.js";

const recordId = "0199e7a0-0000-7000-8000-00000000f001";

export const fixtures: OrgTableFixtures = {
  share_link: {
    create: (tx) =>
      tx.shareLink.create({
        data: { tokenHash: "a".repeat(64), recordType: "isolation_probe", recordId, label: "Isolation link" },
      }),
    appendOnly: true,
  },
  share_link_open: {
    create: async (tx) => {
      const link = await tx.shareLink.create({
        data: { tokenHash: "b".repeat(64), recordType: "isolation_probe", recordId, label: "Isolation open" },
      });
      return tx.shareLinkOpen.create({ data: { shareLinkId: link.id, ipAddress: "203.0.113.0" } });
    },
    appendOnly: true,
  },
};
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/db test`

Expected: "Generated Prisma Client", then 121 tests pass: 10 new isolation tests (5 each for `share_link` and
`share_link_open`).

- [ ] **Step 4: Write the contracts, test first**

`packages/contracts/test/share-links/share-links.test.ts`:
```ts
// Share-link inputs and outputs: strict, with record types, labels and expiry checked at the boundary.
import { describe, expect, it } from "vitest";
import {
  createShareLinkInput,
  createdShareLink,
  shareLinkOpenedEvent,
  shareLinkSummary,
} from "../../src/share-links/index.js";

const recordId = "0199e7a0-0000-7000-8000-0000000000d1";

describe("share-link contracts", () => {
  it("accepts a link to a record, with an optional expiry or none at all", () => {
    expect(
      createShareLinkInput.parse({ recordType: "issued_document", recordId, label: "  Quotation QT-2026-0042 " }),
    ).toEqual({ recordType: "issued_document", recordId, label: "Quotation QT-2026-0042" });
    expect(
      createShareLinkInput.parse({ recordType: "issued_document", recordId, label: "Q", expiresAt: null }).expiresAt,
    ).toBeNull();
    expect(
      createShareLinkInput.parse({
        recordType: "issued_document",
        recordId,
        label: "Q",
        expiresAt: "2026-11-15T10:00:00+05:30",
      }).expiresAt,
    ).toBe("2026-11-15T10:00:00+05:30");
  });

  it("refuses odd record types, empty or invisible labels, and unknown keys", () => {
    const valid = { recordType: "issued_document", recordId, label: "Quote" };
    expect(createShareLinkInput.safeParse({ ...valid, recordType: "Issued-Document" }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, label: " " }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, label: "a‮b" }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, label: "x".repeat(201) }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, organizationId: recordId }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, expiresAt: "next week" }).success).toBe(false);
  });

  it("describes a made link, a listed link and the opened event", () => {
    const token = "A".repeat(65);
    expect(createdShareLink.parse({ shareLinkId: recordId, token, path: `/p/${token}` }).path).toBe(`/p/${token}`);
    expect(createdShareLink.safeParse({ shareLinkId: recordId, token: "short", path: "/p/short" }).success).toBe(false);
    expect(
      shareLinkSummary.parse({
        id: recordId,
        recordType: "issued_document",
        recordId,
        label: "Quote",
        createdBy: null,
        createdAt: "2026-10-15T04:30:00.000Z",
        expiresAt: null,
        revokedAt: null,
        openCount: 2,
        lastOpenedAt: "2026-10-15T05:00:00.000Z",
      }).openCount,
    ).toBe(2);
    expect(shareLinkOpenedEvent.parse({ shareLinkId: recordId, openId: recordId })).toEqual({
      shareLinkId: recordId,
      openId: recordId,
    });
    expect(shareLinkOpenedEvent.safeParse({ shareLinkId: recordId }).success).toBe(false);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/share-links`

Expected: FAIL. `Cannot find module '../../src/share-links/index.js'`.

`packages/contracts/src/share-links/share-links.ts`:
```ts
// Inputs and outputs for share links (spec 9.3), and the payload of the share-link.opened event.
import { z } from "zod";

/** What a link opens, as a record type such as "issued_document". The database checks the same pattern. */
export const shareableRecordType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use a record type like issued_document");

/** No control characters or bidi overrides (they can disguise what was shared), and something visible. */
const isVisibleText = (text: string) => !/[\p{Cc}‪-‮⁦-⁩]/u.test(text) && /[\p{L}\p{N}]/u.test(text);

/** What was shared, as staff see it, e.g. "Quotation QT-2026-0042". */
export const shareLinkLabel = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(isVisibleText, "Use a visible label without control characters");

/** The 65-character token in /p/<token>. */
export const shareLinkToken = z.string().regex(/^[A-Za-z0-9_-]{65}$/);

const instant = z.iso.datetime({ offset: true });

export const createShareLinkInput = z.strictObject({
  recordType: shareableRecordType,
  recordId: z.uuid(),
  label: shareLinkLabel,
  /** Leave out for the default (30 days); null for a link that never expires. */
  expiresAt: instant.nullable().optional(),
});

export const createdShareLink = z.strictObject({
  shareLinkId: z.uuid(),
  /** Shown once: only a hash of its secret part is stored. */
  token: shareLinkToken,
  path: z.string().startsWith("/p/"),
});

export const revokeShareLinkInput = z.strictObject({ shareLinkId: z.uuid() });

export const shareLinkSummary = z.strictObject({
  id: z.uuid(),
  recordType: shareableRecordType,
  recordId: z.uuid(),
  label: z.string(),
  createdBy: z.uuid().nullable(),
  createdAt: instant,
  expiresAt: instant.nullable(),
  revokedAt: instant.nullable(),
  openCount: z.number().int().min(0),
  lastOpenedAt: instant.nullable(),
});

/** The payload of "share-link.opened", published when a customer opens a link. */
export const shareLinkOpenedEvent = z.strictObject({ shareLinkId: z.uuid(), openId: z.uuid() });

export type CreateShareLinkInput = z.infer<typeof createShareLinkInput>;
export type CreatedShareLink = z.infer<typeof createdShareLink>;
export type RevokeShareLinkInput = z.infer<typeof revokeShareLinkInput>;
export type ShareLinkSummary = z.infer<typeof shareLinkSummary>;
export type ShareLinkOpenedEvent = z.infer<typeof shareLinkOpenedEvent>;
```

`packages/contracts/src/share-links/index.ts`:
```ts
// Public API of @travel-crm/contracts/share-links: the Zod schemas for share links and their event.
export * from "./share-links.js";
```

Run the same command. Expected: 3 tests pass. (`@travel-crm/contracts/share-links` resolves through the package's
wildcard export from Task 0.1.)

- [ ] **Step 5: Write the module**

`packages/domain/src/share-links/token.ts`:
```ts
// Share-link tokens: the organization's id in the clear, then a random secret. The id lets /p/<token> open the right
// organization with db.forOrg() (no lookup across organizations); only the secret's hash is stored.
import { createHash, randomBytes } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 16 bytes of organization id and 32 random bytes, in base64url: 22 + 43 characters. */
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})([A-Za-z0-9_-]{43})$/;

/** What is stored for a secret: its sha256, in hex. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function newShareLinkToken(organizationId: string): { token: string; secretHash: string } {
  if (!UUID_PATTERN.test(organizationId)) {
    throw new RangeError(`Not an organization id: ${JSON.stringify(organizationId.slice(0, 64))}`);
  }
  const organizationPart = Buffer.from(organizationId.replaceAll("-", ""), "hex").toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return { token: organizationPart + secret, secretHash: hashSecret(secret) };
}

/** The organization a token names and its secret's hash, or null when it is not a well-formed token. */
export function parseShareLinkToken(token: string): { organizationId: string; secretHash: string } | null {
  const match = TOKEN_PATTERN.exec(token);
  const organizationPart = match?.[1];
  const secret = match?.[2];
  if (organizationPart === undefined || secret === undefined) return null;
  const bytes = Buffer.from(organizationPart, "base64url");
  // Base64 leaves spare bits in the last character; only the one encoding counts, so a link has exactly one token.
  if (bytes.length !== 16 || bytes.toString("base64url") !== organizationPart) return null;
  const hex = bytes.toString("hex");
  const organizationId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    "-",
  );
  return { organizationId, secretHash: hashSecret(secret) };
}
```

`packages/domain/src/share-links/visitor.ts`:
```ts
// What is kept about someone who opens a share link: their network, not their exact address (less personal data,
// still enough to tell one place from another), and a shortened User-Agent.
import { isIPv4, isIPv6 } from "node:net";

const MAX_USER_AGENT_LENGTH = 300;

/** The eight 16-bit groups of a valid IPv6 address, expanding "::" and a trailing IPv4 part. */
function ipv6Groups(address: string): string[] {
  const toGroups = (part: string): string[] =>
    part === ""
      ? []
      : part.split(":").flatMap((group) => {
          if (!group.includes(".")) return [group];
          const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
          return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
        });
  const [head = "", tail] = address.split("::");
  const headGroups = toGroups(head);
  if (tail === undefined) return headGroups;
  const tailGroups = toGroups(tail);
  return [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];
}

/** An IPv4 address cut to its /24 ("203.0.113.0"), an IPv6 one to its /48 ("2001:db8:85a3::"), anything else null. */
export function truncateIpAddress(address: string | null): string | null {
  if (address === null) return null;
  const trimmed = address.trim();
  const ipv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)?.[1] ?? trimmed;
  if (isIPv4(ipv4)) return `${ipv4.split(".").slice(0, 3).join(".")}.0`;
  const withoutZone = trimmed.split("%")[0] ?? "";
  if (!isIPv6(withoutZone)) return null;
  const network = ipv6Groups(withoutZone)
    .slice(0, 3)
    .map((group) => Number.parseInt(group, 16).toString(16));
  return `${network.join(":")}::`;
}

/** The User-Agent cut to 300 characters, whole characters only. */
export function shortenUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent === "") return null;
  return Array.from(userAgent).slice(0, MAX_USER_AGENT_LENGTH).join("");
}
```

`packages/domain/src/share-links/share-links.ts`:
```ts
// Share links (spec 9.3): /p/<token> opens one record for someone who isn't signed in. Links expire, can be revoked,
// and every open is recorded and announced (share-link.opened), so staff can see a customer looked.
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
import type { Database, OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { newShareLinkToken, parseShareLinkToken } from "./token.js";
import { shortenUserAgent, truncateIpAddress } from "./visitor.js";

const DEFAULT_LIFETIME_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const RECORD_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record a link opens. */
export interface SharedRecord {
  recordType: string;
  recordId: string;
}

export interface NewShareLink extends SharedRecord {
  label: string;
  /** Leave out for 30 days from now; null for a link that never expires. */
  expiresAt?: Date | null | undefined;
}

/** What /p/<token> needs to show the record, once the link has been opened and the open recorded. */
export interface OpenedShareLink extends SharedRecord {
  organizationId: string;
  shareLinkId: string;
  label: string;
  createdBy: string | null;
}

export interface ShareLinkVisitor {
  ipAddress: string | null;
  userAgent: string | null;
}

const notFound = (reason: "LINK_NOT_FOUND" | "LINK_EXPIRED" | "LINK_REVOKED", message: string) =>
  new DomainError("NOT_FOUND", reason, message);

/**
 * Makes a link to a record and returns its token, which is shown once. The caller checks that the actor may share
 * the record; tx must be the actor's organization.
 */
export async function createShareLink(
  tx: OrgTx,
  actor: Actor,
  input: NewShareLink,
  now: Date = new Date(),
): Promise<{ shareLinkId: string; token: string; path: string }> {
  if (!RECORD_TYPE_PATTERN.test(input.recordType)) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_TYPE", "Use a record type like issued_document");
  }
  if (!UUID_PATTERN.test(input.recordId)) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_ID", "The record id must be a UUID");
  }
  const label = input.label.trim();
  if (label.length === 0 || label.length > 200) {
    throw new DomainError("VALIDATION", "INVALID_LABEL", "Give the link a label of 1 to 200 characters");
  }
  const expiresAt =
    input.expiresAt === undefined ? new Date(now.getTime() + DEFAULT_LIFETIME_MILLISECONDS) : input.expiresAt;
  if (expiresAt !== null && expiresAt <= now) {
    throw new DomainError("VALIDATION", "EXPIRY_IN_THE_PAST", "A link must expire in the future");
  }
  const { token, secretHash } = newShareLinkToken(actor.organizationId);
  const link = await tx.shareLink.create({
    // organizationId is set, not defaulted: the token names actor.organizationId, so row-level security must agree.
    data: {
      organizationId: actor.organizationId,
      tokenHash: secretHash,
      recordType: input.recordType,
      recordId: input.recordId,
      label,
      createdBy: actor.userId,
      expiresAt,
    },
    select: { id: true },
  });
  return { shareLinkId: link.id, token, path: `/p/${token}` };
}

/** Turns a link off for good. Revoking a revoked link changes nothing. */
export async function revokeShareLink(tx: OrgTx, actor: Actor, input: { shareLinkId: string }): Promise<void> {
  const link = UUID_PATTERN.test(input.shareLinkId)
    ? await tx.shareLink.findUnique({ where: { id: input.shareLinkId }, select: { revokedAt: true } })
    : null;
  if (!link) throw notFound("LINK_NOT_FOUND", "No such link");
  if (link.revokedAt) return;
  await tx.shareLink.update({
    where: { id: input.shareLinkId },
    data: { revokedAt: new Date(), revokedBy: actor.userId },
  });
}

/**
 * Opens a link for a visitor: checks it, records the open and publishes share-link.opened in one transaction, and
 * says which record to show. Unknown, expired and revoked links are NOT_FOUND with a reason the page can explain.
 */
export async function openShareLink(
  db: Pick<Database, "forOrg">,
  token: string,
  visitor: ShareLinkVisitor,
  now: Date = new Date(),
): Promise<OpenedShareLink> {
  const parsed = parseShareLinkToken(token);
  if (!parsed) throw notFound("LINK_NOT_FOUND", "This link doesn't work");
  const { organizationId, secretHash } = parsed;
  return db.forOrg(organizationId, async (tx) => {
    const link = await tx.shareLink.findUnique({
      where: { organizationId_tokenHash: { organizationId, tokenHash: secretHash } },
    });
    if (!link) throw notFound("LINK_NOT_FOUND", "This link doesn't work");
    if (link.revokedAt) throw notFound("LINK_REVOKED", "This link has been turned off");
    if (link.expiresAt && link.expiresAt <= now) throw notFound("LINK_EXPIRED", "This link has expired");
    const open = await tx.shareLinkOpen.create({
      data: {
        shareLinkId: link.id,
        openedAt: now,
        ipAddress: truncateIpAddress(visitor.ipAddress),
        userAgent: shortenUserAgent(visitor.userAgent),
      },
      select: { id: true },
    });
    await publishEvent(tx, { type: "share-link.opened", payload: { shareLinkId: link.id, openId: open.id } });
    return {
      organizationId,
      shareLinkId: link.id,
      recordType: link.recordType,
      recordId: link.recordId,
      label: link.label,
      createdBy: link.createdBy,
    };
  });
}

/** A record's links, newest first, with how often and when they were last opened, for staff. */
export async function listShareLinks(tx: OrgTx, record: SharedRecord): Promise<ShareLinkSummary[]> {
  const links = await tx.shareLink.findMany({
    where: { recordType: record.recordType, recordId: record.recordId },
    include: {
      _count: { select: { opens: true } },
      opens: { orderBy: { openedAt: "desc" }, take: 1, select: { openedAt: true } },
    },
    // UUID v7 ids made in the same millisecond needn't sort in order; the creation time does.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return links.map((link) => ({
    id: link.id,
    recordType: link.recordType,
    recordId: link.recordId,
    label: link.label,
    createdBy: link.createdBy,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    openCount: link._count.opens,
    lastOpenedAt: link.opens[0]?.openedAt.toISOString() ?? null,
  }));
}
```

`packages/domain/src/share-links/index.ts`:
```ts
// Public API of the share-links module: links that open one record without signing in (spec 9.3).
export {
  createShareLink,
  listShareLinks,
  openShareLink,
  revokeShareLink,
  type NewShareLink,
  type OpenedShareLink,
  type SharedRecord,
  type ShareLinkVisitor,
} from "./share-links.js";
```

- [ ] **Step 6: Run the domain tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/share-links`

Expected: 16 tests pass (9 in `share-links.test.ts`, 7 in `token.test.ts`).

- [ ] **Step 7: Write the failing route test**

`apps/api/test/share-link-route.test.ts`:
```ts
// GET /p/<token>: opens the link, hands the record to its resolver, and answers customers with a small page when the
// link doesn't work. Tested with a stand-in for openShareLink, then once against the database.
import { brand } from "@travel-crm/brand";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { DomainError } from "@travel-crm/domain/kernel";
import { createShareLink, openShareLink, type OpenedShareLink } from "@travel-crm/domain/share-links";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clientAddressFrom } from "../src/rate-limit.js";
import { shareLinkRoutes, type ShareLinkRouteOptions } from "../src/share-link-route.js";

const opened: OpenedShareLink = {
  organizationId: "0199e7a0-0000-7000-8000-0000000000aa",
  shareLinkId: "0199e7a0-0000-7000-8000-0000000000bb",
  recordType: "issued_document",
  recordId: "0199e7a0-0000-7000-8000-0000000000cc",
  label: "Quotation QT-2026-0042",
  createdBy: null,
};

const redirectToPdf = (link: OpenedShareLink) =>
  Promise.resolve(Response.redirect(`https://files.example/${link.recordId}.pdf`, 302));

function routes(open: ShareLinkRouteOptions["open"], resolvers: ShareLinkRouteOptions["resolvers"] = {}) {
  const clientAddress = clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] });
  return shareLinkRoutes({ open, resolvers, clientAddress });
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
}

describe("share-link route", () => {
  it("opens the link and answers with what the record's resolver returns, kept private", async () => {
    let visitor: unknown;
    const app = routes(
      (token, seen) => {
        visitor = { token, ...seen };
        return Promise.resolve(opened);
      },
      { issued_document: redirectToPdf },
    );
    const response = await app.request("/abc", {
      headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Test browser" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://files.example/${opened.recordId}.pdf`);
    expectPrivate(response);
    expect(visitor).toEqual({ token: "abc", ipAddress: "203.0.113.9", userAgent: "Test browser" });
  });

  it("explains a link that doesn't work: 404 for an unknown one, 410 for an expired or revoked one", async () => {
    const failing = (reason: string) => routes(() => Promise.reject(new DomainError("NOT_FOUND", reason, "x")));
    const unknown = await failing("LINK_NOT_FOUND").request("/abc");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type")).toMatch(/^text\/html; charset=utf-8/i);
    expectPrivate(unknown);
    expect(unknown.headers.get("content-security-policy")).toContain("default-src 'none'");
    const page = await unknown.text();
    expect(page).toContain("This link doesn't work");
    expect(page).toContain(`<title>This link doesn't work · ${brand.productName}</title>`);

    const expired = await failing("LINK_EXPIRED").request("/abc");
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("This link has expired");
    const revoked = await failing("LINK_REVOKED").request("/abc");
    expect(revoked.status).toBe(410);
    expect(await revoked.text()).toContain("This link has been turned off");
  });

  it("answers 404 for a record type no resolver knows, including Object's own keys", async () => {
    for (const recordType of ["lead", "constructor", "__proto__"]) {
      const response = await routes(() => Promise.resolve({ ...opened, recordType }), {
        issued_document: redirectToPdf,
      }).request("/abc");
      expect(response.status).toBe(404);
    }
  });

  it("lets other failures through as server errors", async () => {
    const response = await routes(() => Promise.reject(new Error("database down"))).request("/abc");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database down");
  });
});

describe("share-link route against the database", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("opens a real link, records the visit with a shortened address, and refuses it once revoked", async () => {
    const organizationId = await createTestOrganization(platform, "Route agency");
    const actor = { organizationId, userId: null, source: "web" as const, impersonatedBy: null };
    const link = await db.forOrg(organizationId, (tx) => createShareLink(tx, actor, { ...opened, label: "Quotation" }));
    const app = routes((token, visitor) => openShareLink(db, token, visitor), { issued_document: redirectToPdf });

    const response = await app.request(link.path.slice("/p".length), { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(response.status).toBe(302);
    const opens = await db.forOrg(organizationId, (tx) => tx.shareLinkOpen.findMany());
    expect(opens.map((open) => open.ipAddress)).toEqual(["203.0.113.0"]);

    await db.forOrg(organizationId, (tx) =>
      tx.shareLink.update({ where: { id: link.shareLinkId }, data: { revokedAt: new Date() } }),
    );
    expect((await app.request(link.path.slice("/p".length))).status).toBe(410);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/share-link-route.test.ts`

Expected: FAIL. `Cannot find module '../src/share-link-route.js'`.

- [ ] **Step 8: Write the route**

`apps/api/src/share-link-route.ts`:
```ts
// GET /p/<token> (spec 9.3): a customer opens a shared record without signing in. The route opens the link and hands
// the record to the resolver for its type (a redirect to a PDF, later a page); a link that doesn't work gets a small
// page saying why, because people open these links in a browser.
import { brand } from "@travel-crm/brand";
import { DomainError } from "@travel-crm/domain/kernel";
import type { OpenedShareLink, ShareLinkVisitor } from "@travel-crm/domain/share-links";
import { Hono } from "hono";

/** Shows a shared record of one type, e.g. redirects to an issued document's PDF. */
export type ShareLinkResolver = (opened: OpenedShareLink) => Promise<Response>;

export interface ShareLinkRouteOptions {
  /** openShareLink from @travel-crm/domain/share-links, bound to the database. */
  open: (token: string, visitor: ShareLinkVisitor) => Promise<OpenedShareLink>;
  /** One resolver per record type that can be shared. */
  resolvers: Readonly<Record<string, ShareLinkResolver>>;
  clientAddress: (request: Request) => string | null;
}

/** Shared records are private: never cached, never indexed, and the token never leaks in a Referer header. */
const privacyHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

const pages = {
  LINK_NOT_FOUND: {
    status: 404,
    heading: "This link doesn't work",
    advice: "Check that you have the whole link, or ask whoever sent it for a new one.",
  },
  LINK_EXPIRED: { status: 410, heading: "This link has expired", advice: "Ask whoever sent it for a new one." },
  LINK_REVOKED: { status: 410, heading: "This link has been turned off", advice: "Ask whoever sent it for a new one." },
} as const;

type PageReason = keyof typeof pages;

const isPageReason = (reason: string): reason is PageReason => Object.hasOwn(pages, reason);

/** Text content needs only these escaped. */
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function errorPage(reason: PageReason): Response {
  const { status, heading, advice } = pages[reason];
  const { colours, fonts } = brand;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(heading)} · ${escapeHtml(brand.productName)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colours.canvas};color:${colours.ink};font-family:"${fonts.ui}",system-ui,sans-serif}
main{max-width:28rem;padding:2rem 1.5rem}
h1{font-family:"${fonts.title}",Georgia,serif;font-weight:600;font-size:1.6rem;margin:0 0 .5rem}
p{color:${colours.muted};line-height:1.5;margin:0}
</style>
</head>
<body><main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(advice)}</p></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      ...privacyHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** A resolver's response with the privacy headers added (a copy: Response.redirect's headers can't be changed). */
function keptPrivate(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privacyHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** The /p routes, to mount with app.route("/p", shareLinkRoutes(...)) behind a rate limit. */
export function shareLinkRoutes(options: ShareLinkRouteOptions): Hono {
  const app = new Hono();

  app.get("/:token", async (c) => {
    const visitor = { ipAddress: options.clientAddress(c.req.raw), userAgent: c.req.header("user-agent") ?? null };
    let opened: OpenedShareLink;
    try {
      opened = await options.open(c.req.param("token"), visitor);
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
    // Object.hasOwn, so a record type like "constructor" finds no resolver instead of Object's own function.
    const resolve = Object.hasOwn(options.resolvers, opened.recordType)
      ? options.resolvers[opened.recordType]
      : undefined;
    if (!resolve) return errorPage("LINK_NOT_FOUND");
    return keptPrivate(await resolve(opened));
  });

  return app;
}
```

Run the same command. Expected: 5 tests pass. The "lets other failures through" test logs Hono's own
"database down" error to the console; that is expected (the client gets a plain 500).

- [ ] **Step 9: Document the module and extend the ADR**

`packages/domain/src/share-links/README.md`:
```markdown
# share-links

Links that open one record for someone who isn't signed in (spec 9.3), such as a customer opening a quotation:
`/p/<token>`.

## Public functions and values (`index.ts`)

- `createShareLink(tx, actor, { recordType, recordId, label, expiresAt? })`: makes a link and returns
  `{ shareLinkId, token, path }`. The token is shown once. Expires in 30 days unless `expiresAt` says otherwise;
  `null` never expires. The caller checks the actor may share the record.
- `revokeShareLink(tx, actor, { shareLinkId })`: turns the link off for good.
- `openShareLink(db, token, { ipAddress, userAgent }, now?)`: checks the link, records the open, publishes
  `share-link.opened`, and returns the `OpenedShareLink` (organization, record, label, who made it). Unknown, expired
  and revoked links are `NOT_FOUND` with reason `LINK_NOT_FOUND`, `LINK_EXPIRED` or `LINK_REVOKED`.
- `listShareLinks(tx, { recordType, recordId })`: a record's links with open counts and the last open, for staff.
- Types: `NewShareLink`, `OpenedShareLink`, `SharedRecord`, `ShareLinkVisitor`.

The route is `shareLinkRoutes(...)` in `apps/api/src/share-link-route.ts`; each shareable record type registers a
resolver there that shows the record.

## Events

- `share-link.opened`, payload `{ shareLinkId, openId }` (`shareLinkOpenedEvent` in `@travel-crm/contracts/share-links`):
  someone opened a link.

## Rules worth knowing

- A token is the organization's id (22 characters) then a random secret (43): `/p/<token>` opens the organization
  with `db.forOrg()`, never looking across organizations. Only the secret's sha256 is stored.
- Links are revoked, never edited or deleted: the runtime role may set only `revoked_at` and `revoked_by`. Opens are
  append-only.
- An open keeps the visitor's network (IPv4 /24, IPv6 /48) and a User-Agent of at most 300 characters, not their
  exact address.
```

Replace `docs/adr/0013-public-routes.md` with:

`docs/adr/0013-public-routes.md`:
```markdown
# 0013: Public routes: rate limits, share links and the webhook intake

Date: 2026-10-15 · Status: accepted · Implements spec sections 9.3 (share links) and 9.7

## Decision

### Rate limits

- **Counted in Postgres**, in `rate_limit_counter` (`key`, `window_start`, `count`), with fixed windows. One
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per hit, in `db.withoutOrg()`.
- **Keys are hashed.** A key names the limit and the client (`share-links:203.0.113.7`); only its sha256 is stored, so
  the table holds no IP addresses.
- **Hono middleware** `rateLimit({ limiter, name, limit, windowSeconds, clientAddress })` answers 429 with
  `Retry-After` and `{ code: "RATE_LIMITED" }`, and sets `RateLimit-Remaining`. Requests without an address share one
  bucket per limit: an unknown client is limited, not let through.
- **The client's address is one it can't forge.** `clientAddressFrom({ headerNames, trustedProxies })` follows Better
  Auth's rule for sign-in (ADR 0006): in the first configured header present (`AUTH_IP_ADDRESS_HEADERS`), the first
  address from the right that isn't a trusted proxy (`AUTH_TRUSTED_PROXIES`); with no trusted proxies, only a header
  holding exactly one address. Anything else is null. IPv4-mapped IPv6 counts as IPv4, and IPv6 as its /64, so one
  host can't rotate addresses to dodge the limit (a token guesser would otherwise send a new fake leftmost
  `x-forwarded-for` value with every try).
- Better Auth's sign-in rate limit (ADR 0006) is separate and unchanged.

### Share links

- **`/p/<token>` opens one record** (`share_link`: record type and id, a label for staff, who made it, expiry,
  revocation). Links expire after 30 days unless made otherwise, or never (`expires_at` null); revoking is final.
- **The token carries its organization**: base64url of the organization's id (22 characters), then 32 random bytes
  (43 characters). Opening a link runs `db.forOrg()` for the organization the token names and looks the secret's
  sha256 up through `@@unique([organizationId, tokenHash])`. Only the hash is stored; the token is shown once.
- **Every open is recorded** (`share_link_open`, append-only) with the visitor's network (IPv4 /24, IPv6 /48) and a
  shortened User-Agent, and announced as `share-link.opened` in the same transaction.
- **The route answers customers in a browser**: the resolver registered for the record type shows the record (for an
  issued document, a redirect to its PDF); a link that doesn't work gets a small HTML page, 404 for unknown and 410
  for expired or revoked, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- **Links are revoked, never edited or deleted**: the runtime role may update only `revoked_at` and `revoked_by`.

## Context

- **Why Postgres, not memory.** Containers are stateless and run as several copies (spec 12.3): a limit kept in one
  container's memory would multiply by the number of copies. Postgres is already there; one indexed upsert per public
  request is cheap at our scale. A shared cache (Redis) can replace it later behind the same `RateLimiter` interface.
- **Why fixed windows.** Simple and exact to test. A client can double its rate across a window boundary, which is
  acceptable for abuse protection.
- **Why the token names the organization.** Without it, opening a link would need a lookup across organizations: a
  table outside row-level security or a SECURITY DEFINER function. An organization id is not a secret (the token's
  32-byte secret is), so carrying it costs nothing and keeps every share-link query inside `db.forOrg()`.
- **Why 410 for expired and revoked links.** The customer's next step differs from a mistyped link ("ask for a new
  one"), and knowing that a random 32-byte secret once existed tells an attacker nothing useful.

## Consequences

- Old windows are deleted when their key is hit again; `purgeExpired` (scheduled daily by the worker) clears the rest.
```

- [ ] **Step 10: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 87, api 5, brand 3, contracts 21, db 121, domain 143, eslint-config 65,
integrations 6 (451).

```bash
cd /Users/ak/personal/travel-crm-03-public
git add packages/db/prisma/schema/share-links.prisma packages/db/prisma/migrations/20261015130100_share_links/migration.sql \
  packages/db/test/org-table-fixtures/share-links.ts packages/contracts/src/share-links packages/contracts/test/share-links \
  packages/domain/src/share-links packages/domain/test/share-links apps/api/src/share-link-route.ts \
  apps/api/test/share-link-route.test.ts docs/adr/0013-public-routes.md
git commit -m "feat: add share links that open one record at /p/<token>"
```

---

### Task P3: The webhook intake

Providers (Razorpay, Meta's WhatsApp) will call `POST /webhooks/<provider>`. The spec's order (9.7) is: verify the
signature, store the raw payload, reply 200, queue a job, process it once by the provider's event id. The Foundation
ships that intake with no real provider: a provider is an object with `verify`, `identify` and `process`, and
`hmacSha256Signature` builds `verify` for the usual scheme. Stored events have no `organization_id` (the organization
is known only after the provider reads the payload), so they live outside row-level security and only this module
reads them.

**Files:**
- Create: `packages/db/prisma/schema/webhooks.prisma`, `packages/db/prisma/migrations/20261015130200_webhook_events/migration.sql`
- Create: `packages/domain/src/webhooks/provider.ts`, `hmac-signature.ts`, `receive-webhook.ts`, `process-webhook-event.ts`,
  `index.ts`, `README.md`
- Create: `apps/api/src/webhook-route.ts`
- Modify: `docs/adr/0013-public-routes.md`
- Test: `packages/domain/test/webhooks/hmac-signature.test.ts`, `packages/domain/test/webhooks/webhooks.test.ts`,
  `apps/api/test/webhook-route.test.ts`

**Interfaces:**
- Consumes: `db.withoutOrg` (`@travel-crm/db`, Task 0.2); `JobQueue`, `JobData`, `createMemoryJobQueue`
  (`@travel-crm/integrations/jobs`, Task 0.1; the memory queue in tests).
- Produces:
  - `@travel-crm/domain/webhooks`:
    - `receiveWebhook(deps: WebhookDependencies, providerName: string, request: WebhookRequest): Promise<WebhookReceipt>`,
      `WebhookDependencies = { db: Pick<Database, "withoutOrg">; queue: JobQueue; providers: readonly WebhookProvider[] }`,
      `WebhookRequest = { headers: Headers; rawBody: string }`, `WebhookReceipt = { status: 200 | 400 | 401 | 404 }`;
    - `processWebhookEvent(deps: ProcessWebhookDependencies, webhookEventId: string): Promise<WebhookProcessResult>` and
      `processWebhookJob(deps: ProcessWebhookDependencies, data: JobData): Promise<WebhookProcessResult>`,
      `ProcessWebhookDependencies = { db: Pick<Database, "withoutOrg">; providers: readonly WebhookProvider[] }`,
      `WebhookProcessResult = "processed" | "already-processed" | "event-not-found"`;
    - `hmacSha256Signature(options: HmacSignatureOptions): (request: WebhookRequest) => boolean`,
      `HmacSignatureOptions = { secret: string; header: string; prefix?: string; encoding: "hex" | "base64" }`;
    - `WEBHOOK_PROCESS_QUEUE = "webhooks.process"`; the job data is `{ webhookEventId }` and its job id is the event's id;
    - types `WebhookProvider` (`name`, `keptHeaders`, `verify`, `identify`, `process`) and `StoredWebhookEvent`.
  - `apps/api/src/webhook-route.ts`: `webhookRoutes(options: WebhookRouteOptions): Hono` with
    `WebhookRouteOptions = { receive: (providerName: string, request: WebhookRequest) => Promise<WebhookReceipt> }`,
    and `MAX_WEBHOOK_BODY_BYTES` (1 MB). The Integration task mounts it with `app.route("/webhooks", webhookRoutes(...))`
    and registers a worker handler on `WEBHOOK_PROCESS_QUEUE` that calls `processWebhookJob`.

- [ ] **Step 1: Write the failing domain tests**

`packages/domain/test/webhooks/hmac-signature.test.ts`:
```ts
// The HMAC-SHA256 check most providers use (Razorpay, Meta): the signature of the raw body, in a header.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Signature } from "../../src/webhooks/index.js";

const secret = "webhook-test-secret";
const body = '{"id":"evt_1","type":"payment.captured","note":"₹12,50,000"}';
const sign = (text: string, encoding: "hex" | "base64", key = secret) =>
  createHmac("sha256", key).update(text, "utf8").digest(encoding);
const request = (headers: Record<string, string>, rawBody = body) => ({ headers: new Headers(headers), rawBody });

describe("hmacSha256Signature", () => {
  const hexWithPrefix = hmacSha256Signature({
    secret,
    header: "x-hub-signature-256",
    prefix: "sha256=",
    encoding: "hex",
  });
  const base64 = hmacSha256Signature({ secret, header: "x-signature", encoding: "base64" });

  it("accepts the signature of the exact raw body, in hex after a prefix or in base64", () => {
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex")}` }))).toBe(true);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex").toUpperCase()}` }))).toBe(true);
    expect(base64(request({ "x-signature": sign(body, "base64") }))).toBe(true);
  });

  it("refuses another secret, another body, a missing header, a missing prefix or a mangled signature", () => {
    const signature = sign(body, "hex");
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex", "other")}` }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${signature}` }, `${body} `))).toBe(false);
    expect(hexWithPrefix(request({}))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": signature }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${signature.slice(0, 40)}` }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": "sha256=not-hex-at-all" }))).toBe(false);
  });
});
```

`packages/domain/test/webhooks/webhooks.test.ts`:
```ts
// The webhook intake (spec 9.7) against Postgres: verify, store raw, queue a job, reply 200; then the worker processes
// each event once, however often the provider delivers it.
import { createHmac } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  hmacSha256Signature,
  processWebhookEvent,
  processWebhookJob,
  receiveWebhook,
  WEBHOOK_PROCESS_QUEUE,
  type StoredWebhookEvent,
  type WebhookProvider,
} from "../../src/webhooks/index.js";

const secret = "example-provider-secret";

/** A provider like Razorpay's: an HMAC of the raw body in a header, the event's id and type in the JSON. */
function exampleProvider(processed: StoredWebhookEvent[], fail = { times: 0 }): WebhookProvider {
  return {
    name: "example",
    keptHeaders: ["x-example-signature", "x-example-delivery", "cookie", "authorization"],
    verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
    identify: ({ rawBody }) => {
      const parsed = JSON.parse(rawBody) as { id?: unknown; type?: unknown };
      return typeof parsed.id === "string" && typeof parsed.type === "string"
        ? { eventId: parsed.id, eventType: parsed.type }
        : null;
    },
    process: (event) => {
      if (fail.times > 0) {
        fail.times -= 1;
        return Promise.reject(new Error("the provider's handler failed"));
      }
      processed.push(event);
      return Promise.resolve();
    },
  };
}

function delivery(body: object, headers: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return { headers: new Headers({ "x-example-signature": signature, ...headers }), rawBody };
}

describe("webhook intake", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  const storedEvent = (providerEventId: string) =>
    db.withoutOrg((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: "example", providerEventId } } }),
    );

  function setUp(fail = { times: 0 }) {
    const processed: StoredWebhookEvent[] = [];
    const queue: MemoryJobQueue = createMemoryJobQueue();
    const providers = [exampleProvider(processed, fail)];
    return { processed, queue, providers, deps: { db, queue, providers } };
  }

  it("stores a verified delivery exactly as received, queues it, and answers 200", async () => {
    const { queue, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    const request = delivery({ id: eventId, type: "payment.captured", amount: 125000000 });

    expect(await receiveWebhook(deps, "example", request)).toEqual({ status: 200 });

    const stored = await storedEvent(eventId);
    expect(stored).toMatchObject({ eventType: "payment.captured", payload: request.rawBody, processedAt: null });
    expect(queue.sent).toEqual([
      {
        id: stored?.id,
        queue: WEBHOOK_PROCESS_QUEUE,
        data: { webhookEventId: stored?.id },
        options: { id: stored?.id },
      },
    ]);
  });

  it("answers 200 to a repeated delivery and stores and queues nothing more", async () => {
    const { queue, deps } = setUp();
    const request = delivery({ id: `evt_${crypto.randomUUID()}`, type: "payment.captured" });
    await receiveWebhook(deps, "example", request);
    expect(await receiveWebhook(deps, "example", request)).toEqual({ status: 200 });
    expect(queue.sent).toHaveLength(1);
  });

  it("refuses a bad signature with 401 and stores nothing", async () => {
    const { queue, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    const forged = { ...delivery({ id: eventId, type: "payment.captured" }), rawBody: JSON.stringify({ id: eventId }) };
    expect(await receiveWebhook(deps, "example", forged)).toEqual({ status: 401 });
    expect(await storedEvent(eventId)).toBeNull();
    expect(queue.sent).toEqual([]);
  });

  it("answers 404 for a provider it doesn't know, and 400 for an event it can't identify", async () => {
    const { deps } = setUp();
    expect(await receiveWebhook(deps, "nobody", delivery({ id: "evt_x", type: "t" }))).toEqual({ status: 404 });
    expect(await receiveWebhook(deps, "example", delivery({ type: "no id" }))).toEqual({ status: 400 });
  });

  it("keeps only the headers the provider names, and never cookies or authorization", async () => {
    const { deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(
      deps,
      "example",
      delivery(
        { id: eventId, type: "payment.captured" },
        { "x-example-delivery": "d-1", cookie: "session=secret", authorization: "Bearer secret", "x-other": "dropped" },
      ),
    );
    const headers = (await storedEvent(eventId))?.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(["x-example-delivery", "x-example-signature"]);
  });

  it("processes a stored event once, however many times its job runs", async () => {
    const { processed, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";

    expect(await processWebhookJob(deps, { webhookEventId: id })).toBe("processed");
    expect(await processWebhookJob(deps, { webhookEventId: id })).toBe("already-processed");
    expect(processed.map((event) => [event.providerEventId, event.eventType])).toEqual([[eventId, "payment.captured"]]);
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 1, lastError: null });
    expect((await storedEvent(eventId))?.processedAt).toBeInstanceOf(Date);
  });

  it("records a failed attempt and rethrows so the job retries, then succeeds", async () => {
    const { processed, deps } = setUp({ times: 1 });
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";

    await expect(processWebhookEvent(deps, id)).rejects.toThrow("the provider's handler failed");
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 1, lastError: "the provider's handler failed" });
    expect(await processWebhookEvent(deps, id)).toBe("processed");
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 2, lastError: null });
    expect(processed).toHaveLength(1);
  });

  it("finds nothing for an unknown event id, and refuses a job without one", async () => {
    const { deps } = setUp();
    expect(await processWebhookEvent(deps, "0199e7a0-0000-7000-8000-00000000dead")).toBe("event-not-found");
    expect(await processWebhookEvent(deps, "not-a-uuid")).toBe("event-not-found");
    await expect(processWebhookJob(deps, {})).rejects.toThrow(/webhookEventId/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/webhooks`

Expected: FAIL. `Cannot find module '../../src/webhooks/index.js'`.

- [ ] **Step 3: Add the table and its migration**

`packages/db/prisma/schema/webhooks.prisma`:
```prisma
// The webhook intake (spec 9.7): every delivery a provider sends, stored raw before anything else happens.
// No organization_id: the organization is unknown until the provider's handler reads the payload, so this table is
// outside row-level security. Only the webhooks module reads it, through db.withoutOrg().

/// One event from a provider, kept exactly as delivered. A repeated delivery of the same event is not stored again.
model WebhookEvent {
  id              String    @id @default(uuid(7)) @db.Uuid
  /// The provider's name, as in /webhooks/<provider>, e.g. "razorpay" (CHECK webhook_event_provider_format).
  provider        String
  /// The provider's own id for the event: repeats share it.
  providerEventId String    @map("provider_event_id")
  eventType       String    @map("event_type")
  receivedAt      DateTime  @default(now()) @map("received_at") @db.Timestamptz(6)
  /// Only the headers the provider names, never cookies or authorization.
  headers         Json
  /// The raw body exactly as received: the signature was computed over it.
  payload         String
  processedAt     DateTime? @map("processed_at") @db.Timestamptz(6)
  /// Processing attempts so far, failed ones included.
  attempts        Int       @default(0)
  lastError       String?   @map("last_error")

  @@unique([provider, providerEventId])
  @@map("webhook_event")
}
```

```bash
cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
migration=packages/db/prisma/migrations/20261015130200_webhook_events && mkdir -p "$migration"
(cd packages/db && pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script) > "$migration/migration.sql"
cat "$migration/migration.sql"
```
Expected: exactly the SQL above the "Hand-written" banner below. Then make the file exactly this:

`packages/db/prisma/migrations/20261015130200_webhook_events/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headers" JSONB NOT NULL,
    "payload" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_provider_event_id_key" ON "webhook_event"("provider", "provider_event_id");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Provider names are path segments; ids and types are short; kept headers are a JSON object.
ALTER TABLE "webhook_event"
  ADD CONSTRAINT webhook_event_provider_format CHECK (provider ~ '^[a-z][a-z0-9-]{1,31}$'),
  ADD CONSTRAINT webhook_event_provider_event_id_length CHECK (char_length(provider_event_id) BETWEEN 1 AND 255),
  ADD CONSTRAINT webhook_event_event_type_length CHECK (char_length(event_type) BETWEEN 1 AND 255),
  ADD CONSTRAINT webhook_event_headers_object CHECK (jsonb_typeof(headers) = 'object'),
  ADD CONSTRAINT webhook_event_attempts_not_negative CHECK (attempts >= 0);
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate`

Expected: "Generated Prisma Client". No isolation fixture: the table has no `organization_id`.

- [ ] **Step 4: Write the module**

`packages/domain/src/webhooks/provider.ts`:
```ts
// What a webhook provider (Razorpay, Meta's WhatsApp, ...) plugs into the generic intake (spec 9.7). The Foundation
// ships the intake and no provider; each arrives with its module.

/** A delivery as it reached the api: its headers and the body exactly as sent. */
export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
}

/** A delivery as stored, for the provider's handler in the worker. */
export interface StoredWebhookEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  receivedAt: Date;
  /** Only the headers the provider named in keptHeaders. */
  headers: Readonly<Record<string, string>>;
  payload: string;
  attempts: number;
}

export interface WebhookProvider {
  /** The path segment in /webhooks/<name>: lower-case letters, digits and hyphens. */
  readonly name: string;
  /** The headers worth keeping with the event, lower case. Cookies and authorization are never kept. */
  readonly keptHeaders: readonly string[];
  /** True when the request really comes from the provider. Never throws for a bad signature: returns false. */
  verify(request: WebhookRequest): boolean;
  /** The provider's id and type for the event, or null when the body doesn't say. */
  identify(request: WebhookRequest): { eventId: string; eventType: string } | null;
  /**
   * Handles one stored event, in the worker: finds the organization from the payload and does the work in
   * db.forOrg(). Runs at least once per event; repeats of the same delivery never reach it twice.
   */
  process(event: StoredWebhookEvent): Promise<void>;
}
```

`packages/domain/src/webhooks/hmac-signature.ts`:
```ts
// The signature check most providers use (Razorpay, Meta): an HMAC-SHA256 of the raw body, sent in a header.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookRequest } from "./provider.js";

export interface HmacSignatureOptions {
  /** The shared secret the provider signs with. */
  secret: string;
  /** The header carrying the signature, e.g. "x-razorpay-signature". */
  header: string;
  /** Text before the signature, e.g. "sha256=" in Meta's x-hub-signature-256. */
  prefix?: string;
  encoding: "hex" | "base64";
}

/** A WebhookProvider.verify that compares the header's signature with the body's in constant time. */
export function hmacSha256Signature(options: HmacSignatureOptions): (request: WebhookRequest) => boolean {
  const prefix = options.prefix ?? "";
  return ({ headers, rawBody }) => {
    const sent = headers.get(options.header);
    if (sent?.startsWith(prefix) !== true) return false;
    const expected = createHmac("sha256", options.secret).update(rawBody, "utf8").digest();
    // A malformed signature decodes to fewer bytes, and timingSafeEqual needs equal lengths.
    const given = Buffer.from(sent.slice(prefix.length), options.encoding);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
}
```

`packages/domain/src/webhooks/receive-webhook.ts`:
```ts
// Receives one delivery, in the spec's order (9.7): verify the signature, store the raw payload, queue a job, reply
// 200. The provider's own work happens later, in the worker (process-webhook-event.ts).
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { WebhookProvider, WebhookRequest } from "./provider.js";

/** The job queue that processes stored events. Its data is `{ webhookEventId }`. */
export const WEBHOOK_PROCESS_QUEUE = "webhooks.process";

/** Headers never stored, whatever a provider asks for: they would be credentials at rest. */
const NEVER_KEPT = new Set(["authorization", "cookie", "proxy-authorization", "set-cookie"]);

export interface WebhookDependencies {
  db: Pick<Database, "withoutOrg">;
  queue: JobQueue;
  providers: readonly WebhookProvider[];
}

/** What the api answers the provider. The route answers 413 itself for a body over its size limit. */
export interface WebhookReceipt {
  status: 200 | 400 | 401 | 404;
}

function keptHeaders(provider: WebhookProvider, headers: Headers): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of provider.keptHeaders.map((header) => header.toLowerCase())) {
    const value = headers.get(name);
    if (value !== null && !NEVER_KEPT.has(name)) kept[name] = value;
  }
  return kept;
}

const isShortText = (value: string) => value.length >= 1 && value.length <= 255;

export async function receiveWebhook(
  { db, queue, providers }: WebhookDependencies,
  providerName: string,
  request: WebhookRequest,
): Promise<WebhookReceipt> {
  const provider = providers.find((candidate) => candidate.name === providerName);
  if (!provider) return { status: 404 };
  if (!provider.verify(request)) return { status: 401 };
  const identity = provider.identify(request);
  if (!identity || !isShortText(identity.eventId) || !isShortText(identity.eventType)) return { status: 400 };

  const event = await db.withoutOrg(async (tx) => {
    // A repeated delivery of the same event is not stored again (spec 9.7: repeats are ignored by provider event id).
    await tx.webhookEvent.createMany({
      data: [
        {
          provider: provider.name,
          providerEventId: identity.eventId,
          eventType: identity.eventType,
          headers: keptHeaders(provider, request.headers),
          payload: request.rawBody,
        },
      ],
      skipDuplicates: true,
    });
    return tx.webhookEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: provider.name, providerEventId: identity.eventId } },
      select: { id: true, processedAt: true },
    });
  });
  // The job's id is the event's, so a repeat queues nothing new; a repeat of an event whose first job was never
  // queued (the queue was down) queues it now.
  if (event.processedAt === null) {
    await queue.send(WEBHOOK_PROCESS_QUEUE, { webhookEventId: event.id }, { id: event.id });
  }
  return { status: 200 };
}
```

`packages/domain/src/webhooks/process-webhook-event.ts`:
```ts
// Processes one stored webhook event in the worker: once, through its provider's handler, however often it was
// delivered or its job retried.
import type { Database } from "@travel-crm/db";
import type { JobData } from "@travel-crm/integrations/jobs";
import type { StoredWebhookEvent, WebhookProvider } from "./provider.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ERROR_LENGTH = 1000;

export interface ProcessWebhookDependencies {
  db: Pick<Database, "withoutOrg">;
  providers: readonly WebhookProvider[];
}

export type WebhookProcessResult = "processed" | "already-processed" | "event-not-found";

/** The kept headers as stored: a JSON object of strings. */
function headersFrom(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/**
 * Runs the provider's handler for a stored event and marks it processed. A failure is recorded on the event
 * (attempts, last_error) and rethrown, so the job is retried with backoff.
 */
export async function processWebhookEvent(
  { db, providers }: ProcessWebhookDependencies,
  webhookEventId: string,
): Promise<WebhookProcessResult> {
  if (!UUID_PATTERN.test(webhookEventId)) return "event-not-found";
  const row = await db.withoutOrg((tx) => tx.webhookEvent.findUnique({ where: { id: webhookEventId } }));
  if (!row) return "event-not-found";
  if (row.processedAt) return "already-processed";
  const provider = providers.find((candidate) => candidate.name === row.provider);
  // Thrown, not skipped: the provider may be missing only until a deploy brings it, and the job retries.
  if (!provider) throw new Error(`No webhook provider named ${row.provider} is registered`);

  const event: StoredWebhookEvent = {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    receivedAt: row.receivedAt,
    headers: headersFrom(row.headers),
    payload: row.payload,
    attempts: row.attempts,
  };
  try {
    await provider.process(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.withoutOrg((tx) =>
      tx.webhookEvent.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError: message.slice(0, MAX_ERROR_LENGTH) },
      }),
    );
    throw error;
  }
  await db.withoutOrg((tx) =>
    tx.webhookEvent.updateMany({
      where: { id: row.id, processedAt: null },
      data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
    }),
  );
  return "processed";
}

/** The handler for a webhooks.process job, whose data is `{ webhookEventId }`. */
export async function processWebhookJob(
  dependencies: ProcessWebhookDependencies,
  data: JobData,
): Promise<WebhookProcessResult> {
  const { webhookEventId } = data;
  if (typeof webhookEventId !== "string") throw new Error("A webhooks.process job needs a webhookEventId");
  return processWebhookEvent(dependencies, webhookEventId);
}
```

`packages/domain/src/webhooks/index.ts`:
```ts
// Public API of the webhooks module: the generic intake that every provider plugs into (spec 9.7).
export { hmacSha256Signature, type HmacSignatureOptions } from "./hmac-signature.js";
export {
  processWebhookEvent,
  processWebhookJob,
  type ProcessWebhookDependencies,
  type WebhookProcessResult,
} from "./process-webhook-event.js";
export type { StoredWebhookEvent, WebhookProvider, WebhookRequest } from "./provider.js";
export {
  receiveWebhook,
  WEBHOOK_PROCESS_QUEUE,
  type WebhookDependencies,
  type WebhookReceipt,
} from "./receive-webhook.js";
```

- [ ] **Step 5: Run the domain tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/webhooks`

Expected: 10 tests pass (2 in `hmac-signature.test.ts`, 8 in `webhooks.test.ts`).

- [ ] **Step 6: Write the failing route test**

`apps/api/test/webhook-route.test.ts`:
```ts
// POST /webhooks/<provider>: hands the raw body and headers to the intake and answers its status; a body over 1 MB is
// refused with 413 before it is read in full.
import { createHmac } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { hmacSha256Signature, receiveWebhook, type WebhookRequest } from "@travel-crm/domain/webhooks";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MAX_WEBHOOK_BODY_BYTES, webhookRoutes } from "../src/webhook-route.js";

describe("webhook route", () => {
  it("passes the provider name, headers and exact raw body to the intake, and answers its status", async () => {
    const received: { provider: string; request: WebhookRequest }[] = [];
    const app = webhookRoutes({
      receive: (provider, request) => {
        received.push({ provider, request });
        return Promise.resolve({ status: 401 });
      },
    });
    const body = '{"id":"evt_1","note":"₹12,50,000 — paid"}';
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "abc" },
      body,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({});
    expect(received[0]?.provider).toBe("razorpay");
    expect(received[0]?.request.rawBody).toBe(body);
    expect(received[0]?.request.headers.get("x-razorpay-signature")).toBe("abc");
  });

  it("refuses a body over 1 MB with 413, whether or not it says its length", async () => {
    let called = false;
    const app = webhookRoutes({
      receive: () => {
        called = true;
        return Promise.resolve({ status: 200 });
      },
    });
    const tooBig = "x".repeat(MAX_WEBHOOK_BODY_BYTES + 1);
    expect((await app.request("/example", { method: "POST", body: tooBig })).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(tooBig));
        controller.close();
      },
    });
    // Node's fetch needs duplex to send a stream; the request then has no content-length.
    const streamed = await app.request("/example", { method: "POST", body: stream, duplex: "half" });
    expect(streamed.status).toBe(413);
    expect(called).toBe(false);
  });

  it("only takes POST", async () => {
    const app = webhookRoutes({ receive: () => Promise.resolve({ status: 200 }) });
    expect((await app.request("/example")).status).toBe(404);
  });
});

describe("webhook route against the database", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it("stores a signed delivery once and queues one job, however often it arrives", async () => {
    const secret = "route-test-secret";
    const queue = createMemoryJobQueue();
    const provider = {
      name: "example",
      keptHeaders: ["x-example-signature"],
      verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
      identify: ({ rawBody }: WebhookRequest) => {
        const { id } = JSON.parse(rawBody) as { id: string };
        return { eventId: id, eventType: "payment.captured" };
      },
      process: () => Promise.resolve(),
    };
    const app = webhookRoutes({
      receive: (name, request) => receiveWebhook({ db, queue, providers: [provider] }, name, request),
    });
    const body = JSON.stringify({ id: `evt_${crypto.randomUUID()}` });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const deliver = () =>
      app.request("/example", { method: "POST", headers: { "x-example-signature": signature }, body });

    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    expect(queue.sent).toHaveLength(1);
    expect((await app.request("/example", { method: "POST", body })).status).toBe(401);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/webhook-route.test.ts`

Expected: FAIL. `Cannot find module '../src/webhook-route.js'`.

- [ ] **Step 7: Write the route**

`apps/api/src/webhook-route.ts`:
```ts
// POST /webhooks/<provider> (spec 9.7): the generic intake's HTTP side. It reads the raw body, since signatures are
// computed over the exact bytes sent, and answers with the intake's status and an empty body.
import type { WebhookReceipt, WebhookRequest } from "@travel-crm/domain/webhooks";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Providers send small JSON events; anything larger is refused before it is read in full. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export interface WebhookRouteOptions {
  /** receiveWebhook from @travel-crm/domain/webhooks, bound to the database, job queue and providers. */
  receive: (providerName: string, request: WebhookRequest) => Promise<WebhookReceipt>;
}

/** The /webhooks routes, to mount with app.route("/webhooks", webhookRoutes(...)) behind a rate limit. */
export function webhookRoutes(options: WebhookRouteOptions): Hono {
  const app = new Hono();

  app.post("/:provider", bodyLimit({ maxSize: MAX_WEBHOOK_BODY_BYTES, onError: (c) => c.json({}, 413) }), async (c) => {
    const receipt = await options.receive(c.req.param("provider"), {
      headers: c.req.raw.headers,
      rawBody: await c.req.text(),
    });
    return c.json({}, receipt.status);
  });

  return app;
}
```

Run the same command. Expected: 4 tests pass.

- [ ] **Step 8: Document the module and finish the ADR**

`packages/domain/src/webhooks/README.md`:
```markdown
# webhooks

The generic webhook intake (spec 9.7). Providers (Razorpay, Meta's WhatsApp, ...) arrive with their modules; the
Foundation ships the intake and the signature helper.

## Public functions and values (`index.ts`)

- `receiveWebhook({ db, queue, providers }, providerName, { headers, rawBody })`: verifies the signature, stores the
  raw event, queues `webhooks.process`, and returns `{ status }` (200, or 404 for an unknown provider, 401 for a bad
  signature, 400 for an event the provider can't identify).
- `processWebhookEvent({ db, providers }, webhookEventId)` and `processWebhookJob(deps, jobData)`: run the provider's
  handler for a stored event once. Return `"processed"`, `"already-processed"` or `"event-not-found"`; a failing
  handler's error is recorded on the event and rethrown so the job retries.
- `hmacSha256Signature({ secret, header, prefix?, encoding })`: a `verify` for providers that sign the raw body
  with HMAC-SHA256.
- `WEBHOOK_PROCESS_QUEUE` (`"webhooks.process"`), and the types `WebhookProvider`, `WebhookRequest`,
  `StoredWebhookEvent`, `WebhookDependencies`, `WebhookReceipt`, `ProcessWebhookDependencies`,
  `WebhookProcessResult`.

The route is `webhookRoutes(...)` in `apps/api/src/webhook-route.ts`.

## Events

None. The intake queues a plain job (`webhooks.process`, data `{ webhookEventId }`), not a domain event: there is no
organization yet.

## Rules worth knowing

- A provider is `{ name, keptHeaders, verify, identify, process }`. `verify` returns false for a bad signature and
  never throws; `process` runs in the worker, finds the organization from the payload and works in `db.forOrg()`.
- Repeats are ignored by the provider's event id (`@@unique([provider, providerEventId])`), and the job's id is the
  event's id, so a repeated delivery queues nothing new.
- `webhook_event` has no `organization_id` and no row-level security: only this module reads it, through
  `db.withoutOrg()`. It keeps the raw payload and the headers the provider names, never cookies or authorization.
```

Replace `docs/adr/0013-public-routes.md` with:

`docs/adr/0013-public-routes.md`:
```markdown
# 0013: Public routes: rate limits, share links and the webhook intake

Date: 2026-10-15 · Status: accepted · Implements spec sections 9.3 (share links) and 9.7

## Decision

### Rate limits

- **Counted in Postgres**, in `rate_limit_counter` (`key`, `window_start`, `count`), with fixed windows. One
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per hit, in `db.withoutOrg()`.
- **Keys are hashed.** A key names the limit and the client (`share-links:203.0.113.7`); only its sha256 is stored, so
  the table holds no IP addresses.
- **Hono middleware** `rateLimit({ limiter, name, limit, windowSeconds, clientAddress })` answers 429 with
  `Retry-After` and `{ code: "RATE_LIMITED" }`, and sets `RateLimit-Remaining`. Requests without an address share one
  bucket per limit: an unknown client is limited, not let through.
- **The client's address is one it can't forge.** `clientAddressFrom({ headerNames, trustedProxies })` follows Better
  Auth's rule for sign-in (ADR 0006): in the first configured header present (`AUTH_IP_ADDRESS_HEADERS`), the first
  address from the right that isn't a trusted proxy (`AUTH_TRUSTED_PROXIES`); with no trusted proxies, only a header
  holding exactly one address. Anything else is null. IPv4-mapped IPv6 counts as IPv4, and IPv6 as its /64, so one
  host can't rotate addresses to dodge the limit (a token guesser would otherwise send a new fake leftmost
  `x-forwarded-for` value with every try).
- Better Auth's sign-in rate limit (ADR 0006) is separate and unchanged.

### Share links

- **`/p/<token>` opens one record** (`share_link`: record type and id, a label for staff, who made it, expiry,
  revocation). Links expire after 30 days unless made otherwise, or never (`expires_at` null); revoking is final.
- **The token carries its organization**: base64url of the organization's id (22 characters), then 32 random bytes
  (43 characters). Opening a link runs `db.forOrg()` for the organization the token names and looks the secret's
  sha256 up through `@@unique([organizationId, tokenHash])`. Only the hash is stored; the token is shown once.
- **Every open is recorded** (`share_link_open`, append-only) with the visitor's network (IPv4 /24, IPv6 /48) and a
  shortened User-Agent, and announced as `share-link.opened` in the same transaction.
- **The route answers customers in a browser**: the resolver registered for the record type shows the record (for an
  issued document, a redirect to its PDF); a link that doesn't work gets a small HTML page, 404 for unknown and 410
  for expired or revoked, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- **Links are revoked, never edited or deleted**: the runtime role may update only `revoked_at` and `revoked_by`.

### The webhook intake

- **`POST /webhooks/<provider>`**, in the spec's order: verify the signature, store the raw payload, queue a job,
  reply 200; the job then processes the event, once. An unknown provider is 404, a bad signature 401 (nothing
  stored), an event the provider can't identify 400, and a body over 1 MB 413 before it is read in full.
- **Providers plug in** as `WebhookProvider` objects: `verify`, `identify` (the provider's event id and type) and
  `process` (in the worker). `hmacSha256Signature(...)` builds `verify` for the common HMAC-of-the-body scheme,
  compared in constant time.
- **`webhook_event`** keeps every event: the raw body exactly as received, the headers the provider names (never
  cookies or authorization), attempts and the last error. `@@unique([provider, providerEventId])` ignores repeats; the
  `webhooks.process` job's id is the event's id, so a repeat queues nothing new, and a repeat of an event whose job was
  never queued queues it then.

## Context

- **Why Postgres, not memory.** Containers are stateless and run as several copies (spec 12.3): a limit kept in one
  container's memory would multiply by the number of copies. Postgres is already there; one indexed upsert per public
  request is cheap at our scale. A shared cache (Redis) can replace it later behind the same `RateLimiter` interface.
- **Why fixed windows.** Simple and exact to test. A client can double its rate across a window boundary, which is
  acceptable for abuse protection.
- **Why the token names the organization.** Without it, opening a link would need a lookup across organizations: a
  table outside row-level security or a SECURITY DEFINER function. An organization id is not a secret (the token's
  32-byte secret is), so carrying it costs nothing and keeps every share-link query inside `db.forOrg()`.
- **Why 410 for expired and revoked links.** The customer's next step differs from a mistyped link ("ask for a new
  one"), and knowing that a random 32-byte secret once existed tells an attacker nothing useful.
- **Why webhook events have no organization and no row-level security.** The organization is known only once the
  provider's handler has read the payload (a WhatsApp number, a Razorpay account). The table holds raw provider data,
  so only the webhooks module reads it, through `db.withoutOrg()`; each provider's `process` moves what it needs into
  organization tables inside `db.forOrg()`.
- **Why store before replying.** Providers retry until they get a 2xx. Storing first means a 200 is never sent for an
  event we could lose, and a crash after storing is recovered by the provider's own retry (the repeat queues the job).
- **The raw body is kept as text.** Providers send UTF-8 JSON, and the signature is checked over the same text.

## Consequences

- Public forms get Turnstile (spec 9.7) when the first form arrives with its screen (plan 5); the rate limit here
  applies to them too.
- Stored webhook payloads are kept; a retention purge for them comes with the first real provider (step 2, WhatsApp),
  which knows how long its data must live.
- Old rate-limit windows are deleted when their key is hit again; `purgeExpired` (scheduled daily by the worker)
  clears the rest.
```

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-public && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 91, api 5, brand 3, contracts 21, db 121, domain 153, eslint-config 65,
integrations 6 (465).

```bash
cd /Users/ak/personal/travel-crm-03-public
git add packages/db/prisma/schema/webhooks.prisma packages/db/prisma/migrations/20261015130200_webhook_events/migration.sql \
  packages/domain/src/webhooks packages/domain/test/webhooks apps/api/src/webhook-route.ts \
  apps/api/test/webhook-route.test.ts docs/adr/0013-public-routes.md
git commit -m "feat: add the generic webhook intake"
```

The track is done. Its branch merges into `foundation/03-shared-services` in the Integration task, in any order with
the other tracks.

---

## Track N: Notifications (spec 9.4)

- **Delivers:** the email (SMTP: Mailpit locally, SES in the cloud) and web push adapters, and the notifications module: `notify()`, the worker's delivery listener, the in-app bell, opt-outs and push subscriptions.
- **Branch:** `foundation/03-notifications`, in the worktree `/Users/ak/personal/travel-crm-03-notifications`, from `foundation/03-shared-services` after Task 0.2.
- **Depends on:** Task 0 only (the jobs module's `publishEvent`/`defineListener`, identity's `OrganizationProfile` and `MemberContact`). The worker that runs the listener, and the wiring of identity into it, come in the Integration task.

The three new tables have no `organization` relation yet: the Integration task adds the relations and foreign keys for every track at once. Routers for the bell and the settings come with their screens (plan 5).

---

### Task N1: Email and web push adapters

Two ports in `@travel-crm/integrations`, each with a real adapter tested against a real service and an in-memory one for the domain's tests. Email always leaves from our address (the adapter's setting) under a display name the domain chooses, with the organization's Reply-To; one SMTP adapter covers Mailpit and Amazon SES (through SES's SMTP interface). Web push is encrypted and VAPID-signed by web-push, then sent with `fetch`, because web-push's own sender only speaks HTTPS and a test needs a plain local push service. A line break in any header value is refused, so nobody can add a Bcc through a subject or a name.

**Files:**
- Create: `packages/integrations/src/email/email-sender.ts`, `smtp-email-sender.ts`, `memory-email-sender.ts`, `render-email.ts`, `index.ts`
- Create: `packages/integrations/src/push/push-sender.ts`, `web-push-sender.ts`, `memory-push-sender.ts`, `index.ts`
- Create: `packages/integrations/test/support/mailpit.ts`, `packages/integrations/test/support/push-service.ts`
- Test: `packages/integrations/test/email/smtp-email-sender.test.ts`, `render-email.test.ts`, `memory-email-sender.test.ts`, `packages/integrations/test/push/web-push-sender.test.ts`, `memory-push-sender.test.ts`

**Interfaces:**
- Consumes: `brand` from `@travel-crm/brand` (`colours`, `fonts`, `productName`); `nodemailer` 10.1.0 (ships its own types), `web-push` 3.6.7 with `@types/web-push` 3.6.4, `testcontainers` 12.2.1, all installed by Task 0.1.
- Produces, from `@travel-crm/integrations/email`:
  - `interface EmailMessage { to: { name?: string | undefined; address: string }; fromName: string; replyTo?: string | undefined; subject: string; text: string; html: string; headers?: Readonly<Record<string, string>> | undefined }`
  - `interface EmailSender { send(message: EmailMessage): Promise<void> }`
  - `createSmtpEmailSender(settings: SmtpSettings): EmailSender` with `SmtpSettings = { host: string; port: number; secure: boolean; user?: string; password?: string; fromAddress: string }`
  - `createMemoryEmailSender(): MemoryEmailSender` (`sent: readonly EmailMessage[]`)
  - `renderEmail(content: EmailContent): { html: string; text: string }` with `EmailContent = { heading: string; paragraphs: readonly string[]; action?: { label: string; url: string }; footer: string }` (the action must be an absolute http(s) URL)
  - `assertSafeHeaders(message: EmailMessage): void` (throws `RangeError` on a line break)
- Produces, from `@travel-crm/integrations/push`:
  - `interface PushSubscriptionKeys { endpoint: string; p256dh: string; auth: string }`, `interface PushPayload { title: string; body: string; url?: string | undefined }`
  - `interface PushSender { send(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<"sent" | "gone"> }` (`"gone"` for 404/410; other failures throw)
  - `createWebPushSender(settings: WebPushSettings): PushSender` with `WebPushSettings = { publicKey: string; privateKey: string; subject: string }` (checks the keys are a P-256 pair and the subject is `mailto:` or `https://`)
  - `createMemoryPushSender(): MemoryPushSender` (`sent: readonly SentPush[]`, `markGone(endpoint)`)

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
git worktree add /Users/ak/personal/travel-crm-03-notifications -b foundation/03-notifications foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/03-notifications` at Task 0.2's commit, the install changes nothing, and "Generated Prisma Client".

- [ ] **Step 2: Write the test helpers: Mailpit in a container, and a push service that decrypts like a browser**

Mailpit is a local SMTP server with an HTTP API (`axllent/mailpit:v1.31.5`; SMTP on 1025, API on 8025, `/readyz` when ready). The push service is a local HTTP server; its subscriber decrypts the aes128gcm body as RFC 8291 describes, so the test proves a browser could read the notification.

`packages/integrations/test/support/mailpit.ts`:
```ts
// Starts Mailpit, a local SMTP server with an HTTP API, so the email adapter's tests can read what was sent.
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

export const MAILPIT_IMAGE = "axllent/mailpit:v1.31.5";

const SMTP_PORT = 1025;
const API_PORT = 8025;

interface MailpitAddress {
  Name: string;
  Address: string;
}

/** A message as Mailpit's API returns it. */
export interface MailpitMessage {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  ReplyTo: MailpitAddress[];
  Subject: string;
  Text: string;
  HTML: string;
}

export interface Mailpit {
  smtpHost: string;
  smtpPort: number;
  /** Every message received, newest first, in full. */
  messages(): Promise<MailpitMessage[]>;
  /** One message's headers, each with all its values. */
  headers(messageId: string): Promise<Record<string, string[]>>;
  stop(): Promise<void>;
}

export async function startMailpit(): Promise<Mailpit> {
  const container: StartedTestContainer = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(SMTP_PORT, API_PORT)
    .withWaitStrategy(Wait.forHttp("/readyz", API_PORT))
    .start();
  const api = `http://${container.getHost()}:${String(container.getMappedPort(API_PORT))}/api/v1`;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${api}${path}`);
    if (!response.ok) throw new Error(`Mailpit ${path} answered ${String(response.status)}`);
    return (await response.json()) as T;
  };

  return {
    smtpHost: container.getHost(),
    smtpPort: container.getMappedPort(SMTP_PORT),
    messages: async () => {
      const list = await get<{ messages: { ID: string }[] }>("/messages");
      return Promise.all(list.messages.map((message) => get<MailpitMessage>(`/message/${message.ID}`)));
    },
    headers: (messageId) => get<Record<string, string[]>>(`/message/${messageId}/headers`),
    stop: async () => {
      await container.stop();
    },
  };
}
```

`packages/integrations/test/support/push-service.ts`:
```ts
// A stand-in for a browser's push service: a local HTTP server that records what it receives, and a subscriber whose
// keys can decrypt it (RFC 8291, aes128gcm), so tests prove a browser could read the notification.
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export interface ReceivedPush {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface PushService {
  /** A subscription endpoint on this server, e.g. http://127.0.0.1:1234/push/<name>. */
  endpoint(name: string): string;
  readonly received: ReceivedPush[];
  /** The status the next requests get (201 by default). */
  answerWith(status: number): void;
  close(): Promise<void>;
}

export async function startPushService(): Promise<PushService> {
  const received: ReceivedPush[] = [];
  let status = 201;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The push service has no port");

  return {
    endpoint: (name) => `http://127.0.0.1:${String(address.port)}/push/${name}`,
    received,
    answerWith: (next) => {
      status = next;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

/** A browser's side of a subscription: the keys it gives the server, and the decryption it does on receipt. */
export function createSubscriber() {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const authSecret = randomBytes(16);
  return {
    keys: { p256dh: publicKey.toString("base64url"), auth: authSecret.toString("base64url") },
    /** Decrypts an aes128gcm body: salt (16) | record size (4) | key id length (1) | sender's key | ciphertext. */
    decrypt(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const keyIdLength = body.readUInt8(20);
      const senderKey = body.subarray(21, 21 + keyIdLength);
      const ciphertext = body.subarray(21 + keyIdLength);
      const sharedSecret = ecdh.computeSecret(senderKey);
      const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), publicKey, senderKey]);
      const inputKey = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
      const contentKey = Buffer.from(hkdfSync("sha256", inputKey, salt, "Content-Encoding: aes128gcm\0", 16));
      const nonce = Buffer.from(hkdfSync("sha256", inputKey, salt, "Content-Encoding: nonce\0", 12));
      const decipher = createDecipheriv("aes-128-gcm", contentKey, nonce);
      decipher.setAuthTag(ciphertext.subarray(-16));
      const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
      // The last record ends with the 0x02 delimiter, then zero or more 0x00 bytes of padding.
      return padded.subarray(0, padded.lastIndexOf(2)).toString("utf8");
    },
  };
}
```

- [ ] **Step 3: Write the failing tests**

`packages/integrations/test/email/smtp-email-sender.test.ts`:
```ts
// The SMTP adapter delivers what the domain asks for, from our address with the organization's name and Reply-To,
// and refuses header injection. Runs against Mailpit in a container.
import { brand } from "@travel-crm/brand";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSmtpEmailSender, type EmailMessage, type EmailSender } from "../../src/email/index.js";
import { startMailpit, type Mailpit } from "../support/mailpit.js";

/** What the domain passes as the display name: the organization's name, then the product's. */
const fromName = `Sharma Travels via ${brand.emailSenderName}`;

const message: EmailMessage = {
  to: { name: "Asha Owner", address: "asha@agency.example" },
  fromName,
  replyTo: "hello@sharma.example",
  subject: "Your quotation was opened",
  text: "Meera opened Quotation QT-2026-0042.",
  html: "<p>Meera opened <b>Quotation QT-2026-0042</b>.</p>",
  headers: { "List-Unsubscribe": "<https://app.example/settings/notifications>" },
};

describe("SMTP email sender", () => {
  let mailpit: Mailpit;
  let sender: EmailSender;

  beforeAll(async () => {
    mailpit = await startMailpit();
    sender = createSmtpEmailSender({
      host: mailpit.smtpHost,
      port: mailpit.smtpPort,
      secure: false,
      fromAddress: "no-reply@travel-agency-os.example",
    });
  });

  afterAll(async () => {
    await mailpit.stop();
  });

  it("sends from our address under the organization's name, with its Reply-To and both parts", async () => {
    await sender.send(message);

    const [received] = await mailpit.messages();
    expect(received?.From).toEqual({
      Name: fromName,
      Address: "no-reply@travel-agency-os.example",
    });
    expect(received?.To).toEqual([{ Name: "Asha Owner", Address: "asha@agency.example" }]);
    expect(received?.ReplyTo).toEqual([{ Name: "", Address: "hello@sharma.example" }]);
    expect(received?.Subject).toBe("Your quotation was opened");
    expect(received?.Text.trim()).toBe("Meera opened Quotation QT-2026-0042.");
    expect(received?.HTML).toContain("<b>Quotation QT-2026-0042</b>");
    const headers = await mailpit.headers(received?.ID ?? "");
    expect(headers["List-Unsubscribe"]).toEqual(["<https://app.example/settings/notifications>"]);
  });

  it("sends without a Reply-To when the organization has no contact email", async () => {
    await sender.send({ ...message, replyTo: undefined, subject: "No reply-to" });

    const received = (await mailpit.messages()).find((sent) => sent.Subject === "No reply-to");
    expect(received?.ReplyTo).toEqual([]);
  });

  it("refuses a line break in a header value before connecting, so nobody can add headers", async () => {
    await expect(sender.send({ ...message, subject: "Hi\r\nBcc: everyone@example.test" })).rejects.toThrow(
      /line break/,
    );
    await expect(sender.send({ ...message, fromName: "Sharma\nTravels" })).rejects.toThrow(/line break/);
    await expect(
      sender.send({ ...message, headers: { "List-Unsubscribe": "<https://a>\r\nX-Evil: 1" } }),
    ).rejects.toThrow(/line break/);
  });
});
```

`packages/integrations/test/email/render-email.test.ts`:
```ts
// The email layout escapes every value, shows the action as a button and a plain link, and names the product.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderEmail } from "../../src/email/index.js";

describe("renderEmail", () => {
  it("lays out the heading, paragraphs, action and footer in HTML and plain text", () => {
    const { html, text } = renderEmail({
      heading: "Your quotation was opened",
      paragraphs: ["Meera opened Quotation QT-2026-0042.", "Follow up while it is fresh."],
      action: { label: "Open the quotation", url: "https://app.example/quotes/42" },
      footer: "You get these because you shared the link.",
    });

    expect(html).toContain("Your quotation was opened");
    expect(html).toContain('href="https://app.example/quotes/42"');
    expect(html).toContain(brand.colours.action);
    expect(html).toContain(brand.productName);
    expect(text).toBe(
      [
        "Your quotation was opened",
        "",
        "Meera opened Quotation QT-2026-0042.",
        "",
        "Follow up while it is fresh.",
        "",
        "Open the quotation: https://app.example/quotes/42",
        "",
        "--",
        "You get these because you shared the link.",
        `Sent with ${brand.productName}`,
      ].join("\n"),
    );
  });

  it("escapes HTML in every value", () => {
    const { html } = renderEmail({
      heading: "<script>alert(1)</script>",
      paragraphs: ['Tom & "Jerry" <b>'],
      action: { label: "<i>Open</i>", url: "https://app.example/?a=1&b=<2>" },
      footer: "<footer>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
    expect(html).toContain('href="https://app.example/?a=1&amp;b=&lt;2&gt;"');
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<footer>");
  });

  it("refuses an action that isn't an http(s) link", () => {
    const content = { heading: "x", paragraphs: [], footer: "y" };
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "javascript:alert(1)" } })).toThrow(/http/);
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "/relative" } })).toThrow(/http/);
  });
});
```

`packages/integrations/test/email/memory-email-sender.test.ts`:
```ts
// The in-memory email sender records what was sent, for the domain's tests.
import { describe, expect, it } from "vitest";
import { createMemoryEmailSender } from "../../src/email/index.js";

describe("memory email sender", () => {
  it("records each message, oldest first", async () => {
    const sender = createMemoryEmailSender();
    const message = { to: { address: "a@example.test" }, fromName: "A", subject: "One", text: "1", html: "<p>1</p>" };
    await sender.send(message);
    await sender.send({ ...message, subject: "Two" });
    expect(sender.sent.map((sent) => sent.subject)).toEqual(["One", "Two"]);
  });

  it("refuses line breaks in header values, as the SMTP sender does", async () => {
    const sender = createMemoryEmailSender();
    await expect(
      sender.send({
        to: { address: "a@example.test" },
        fromName: "A",
        subject: "x\nBcc: b@example.test",
        text: "",
        html: "",
      }),
    ).rejects.toThrow(/line break/);
    expect(sender.sent).toEqual([]);
  });
});
```

`packages/integrations/test/push/web-push-sender.test.ts`:
```ts
// The web push adapter encrypts the notification so only the subscriber can read it, signs it with our VAPID key,
// and tells the caller when a subscription is gone. A local server plays the browser's push service.
import webPush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWebPushSender, type PushSender } from "../../src/push/index.js";
import { createSubscriber, startPushService, type PushService } from "../support/push-service.js";

describe("web push sender", () => {
  const vapid = webPush.generateVAPIDKeys();
  let service: PushService;
  let sender: PushSender;

  beforeAll(async () => {
    service = await startPushService();
    sender = createWebPushSender({
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      subject: "mailto:support@travel-agency-os.example",
    });
  });

  afterAll(async () => {
    await service.close();
  });

  it("delivers a notification only the subscriber can read, signed with our key", async () => {
    const subscriber = createSubscriber();
    const payload = { title: "Quotation opened", body: "Meera opened QT-2026-0042", url: "/quotes/42" };

    const result = await sender.send({ endpoint: service.endpoint("asha"), ...subscriber.keys }, payload);

    expect(result).toBe("sent");
    const [push] = service.received;
    expect(push).toMatchObject({ method: "POST", path: "/push/asha" });
    expect(push?.headers["content-encoding"]).toBe("aes128gcm");
    expect(push?.headers.ttl).toBe("86400");
    expect(push?.headers.authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`),
    );
    expect(JSON.parse(subscriber.decrypt(push?.body ?? Buffer.alloc(0)))).toEqual(payload);
  });

  it('answers "gone" when the push service has forgotten the subscription', async () => {
    const subscriber = createSubscriber();
    for (const status of [404, 410]) {
      service.answerWith(status);
      expect(
        await sender.send({ endpoint: service.endpoint("old"), ...subscriber.keys }, { title: "t", body: "b" }),
      ).toBe("gone");
    }
    service.answerWith(201);
  });

  it("throws on any other failure, so the job retries", async () => {
    const subscriber = createSubscriber();
    service.answerWith(500);
    await expect(
      sender.send({ endpoint: service.endpoint("busy"), ...subscriber.keys }, { title: "t", body: "b" }),
    ).rejects.toThrow(/500/);
    service.answerWith(201);
  });

  it("refuses VAPID keys that are not a P-256 key pair, when it is created", () => {
    expect(() =>
      createWebPushSender({ publicKey: "short", privateKey: vapid.privateKey, subject: "mailto:a@b.c" }),
    ).toThrow(/VAPID/);
    expect(() =>
      createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "support" }),
    ).toThrow(/subject/);
  });
});
```

`packages/integrations/test/push/memory-push-sender.test.ts`:
```ts
// The in-memory push sender records pushes and can play a subscription the push service has forgotten.
import { describe, expect, it } from "vitest";
import { createMemoryPushSender } from "../../src/push/index.js";

describe("memory push sender", () => {
  it('records pushes, and answers "gone" for endpoints marked gone', async () => {
    const sender = createMemoryPushSender();
    const subscription = { endpoint: "https://push.example/a", p256dh: "key", auth: "secret" };
    expect(await sender.send(subscription, { title: "Hi", body: "There" })).toBe("sent");
    sender.markGone("https://push.example/a");
    expect(await sender.send(subscription, { title: "Again", body: "There" })).toBe("gone");
    expect(sender.sent.map((push) => push.payload.title)).toEqual(["Hi"]);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/email test/push`

Expected: FAIL, 5 test files, each with `Error: Cannot find module '../../src/email/index.js'` (or `../../src/push/index.js`).

- [ ] **Step 5: Write the email port, its adapters and the layout**

`packages/integrations/src/email/email-sender.ts`:
```ts
// The email port (spec 9.4): what the domain needs to send one email. The adapter owns the sender address, because
// email always comes from our domain; the domain chooses the display name and the organization's Reply-To.

export interface EmailMessage {
  to: { name?: string | undefined; address: string };
  /** The display name, e.g. "Sharma Travels via <product name>". */
  fromName: string;
  /** The organization's contact address, so replies reach the agency rather than us. */
  replyTo?: string | undefined;
  subject: string;
  text: string;
  html: string;
  /** Extra headers such as List-Unsubscribe. */
  headers?: Readonly<Record<string, string>> | undefined;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Refuses a line break in any value that becomes a header. One would let the text after it be read as a new header
 * (an extra Bcc, say), so it is refused outright rather than cleaned up.
 */
export function assertSafeHeaders(message: EmailMessage): void {
  const values: [string, string | undefined][] = [
    ["subject", message.subject],
    ["fromName", message.fromName],
    ["replyTo", message.replyTo],
    ["to.name", message.to.name],
    ["to.address", message.to.address],
    // A header's name and value both end up on the header line.
    ...Object.entries(message.headers ?? {}).map(([name, value]): [string, string] => [
      `header ${name}`,
      `${name}: ${value}`,
    ]),
  ];
  for (const [field, value] of values) {
    if (value !== undefined && /[\r\n]/.test(value)) {
      throw new RangeError(`The email's ${field} has a line break, which would start a new header`);
    }
  }
}
```

`packages/integrations/src/email/smtp-email-sender.ts`:
```ts
// Sends email over SMTP with nodemailer. Amazon SES is used through its SMTP interface, so this one adapter covers
// SES in the cloud and Mailpit locally.
import nodemailer from "nodemailer";
import { assertSafeHeaders, type EmailSender } from "./email-sender.js";

export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  /** Our sending address, e.g. no-reply@mail.<our domain>. */
  fromAddress: string;
}

export function createSmtpEmailSender(settings: SmtpSettings): EmailSender {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.user === undefined ? {} : { auth: { user: settings.user, pass: settings.password ?? "" } }),
  });

  return {
    send: async (message) => {
      assertSafeHeaders(message);
      await transport.sendMail({
        from: { name: message.fromName, address: settings.fromAddress },
        to: { name: message.to.name ?? "", address: message.to.address },
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { ...message.headers },
      });
    },
  };
}
```

`packages/integrations/src/email/memory-email-sender.ts`:
```ts
// An in-memory EmailSender for tests: it records each message after the same header check the SMTP sender makes.
import { assertSafeHeaders, type EmailMessage, type EmailSender } from "./email-sender.js";

export interface MemoryEmailSender extends EmailSender {
  /** Every message sent so far, oldest first. */
  readonly sent: readonly EmailMessage[];
}

export function createMemoryEmailSender(): MemoryEmailSender {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: (message) =>
      new Promise((resolve) => {
        assertSafeHeaders(message);
        sent.push(message);
        resolve();
      }),
  };
}
```

`packages/integrations/src/email/render-email.ts`:
```ts
// The product's one email layout: a heading, paragraphs, an optional action button and a footer, in the brand's
// colours and fonts, as HTML and as plain text. Every value is escaped: names and titles come from users.
import { brand } from "@travel-crm/brand";

export interface EmailContent {
  heading: string;
  paragraphs: readonly string[];
  /** A button in HTML, a labelled link in text. Must be an absolute http(s) URL. */
  action?: { label: string; url: string } | undefined;
  /** Why the person gets this email, e.g. "You get these because you shared the link." */
  footer: string;
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Email clients don't load web fonts reliably, so each brand font falls back to a system one. */
const fonts = {
  title: `'${brand.fonts.title}', Georgia, 'Times New Roman', serif`,
  ui: `'${brand.fonts.ui}', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
};

function assertWebLink(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new RangeError(`An email action needs an absolute http(s) URL, got ${JSON.stringify(url)}`);
  }
  if (protocol !== "https:" && protocol !== "http:") {
    throw new RangeError(`An email action needs an http(s) URL, got ${JSON.stringify(protocol)}`);
  }
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  if (content.action) assertWebLink(content.action.url);
  const { colours } = brand;

  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(paragraph)}</p>`)
    .join("");
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;` +
      `background:${colours.action};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;` +
      `border-radius:999px">${escapeHtml(content.action.label)}</a></p>`
    : "";
  const html =
    `<!doctype html><html><body style="margin:0;background:${colours.canvas};color:${colours.ink};` +
    `font-family:${fonts.ui};font-size:16px">` +
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px">` +
    `<h1 style="font-family:${fonts.title};font-weight:600;font-size:26px;margin:0 0 24px">` +
    `${escapeHtml(content.heading)}</h1>${paragraphs}${action}` +
    `<hr style="border:none;border-top:1px solid ${colours.hairline};margin:32px 0 16px">` +
    `<p style="margin:0 0 8px;color:${colours.muted};font-size:13px">${escapeHtml(content.footer)}</p>` +
    `<p style="margin:0;color:${colours.muted};font-size:13px">Sent with ${escapeHtml(brand.productName)}</p>` +
    `</div></body></html>`;

  const text = [
    content.heading,
    ...content.paragraphs,
    ...(content.action ? [`${content.action.label}: ${content.action.url}`] : []),
  ]
    .join("\n\n")
    .concat(`\n\n--\n${content.footer}\nSent with ${brand.productName}`);

  return { html, text };
}
```

`packages/integrations/src/email/index.ts`:
```ts
// Public API of @travel-crm/integrations/email: the email port, its adapters and the product's email layout.
export { assertSafeHeaders, type EmailMessage, type EmailSender } from "./email-sender.js";
export { createMemoryEmailSender, type MemoryEmailSender } from "./memory-email-sender.js";
export { renderEmail, type EmailContent } from "./render-email.js";
export { createSmtpEmailSender, type SmtpSettings } from "./smtp-email-sender.js";
```

- [ ] **Step 6: Write the push port and its adapters**

`packages/integrations/src/push/push-sender.ts`:
```ts
// The web push port (spec 9.4): send one notification to one browser subscription.

/** What a browser hands over when it subscribes (PushSubscription.toJSON(): endpoint and keys). */
export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key, base64url. */
  p256dh: string;
  /** The browser's authentication secret, base64url. */
  auth: string;
}

/** What the service worker shows. `url` is where a tap opens, a path inside the web app. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string | undefined;
}

export interface PushSender {
  /**
   * Sends the notification. "gone" means the push service no longer knows the subscription (the person
   * unsubscribed or the browser dropped it): delete it. Any other failure throws, so the job retries.
   */
  send(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<"sent" | "gone">;
}
```

`packages/integrations/src/push/web-push-sender.ts`:
```ts
// Sends web push with our VAPID key. web-push encrypts the payload and signs the request; the request itself goes
// out with fetch, which (unlike web-push's own sender) also reaches a plain-HTTP endpoint in tests.
import webPush from "web-push";
import type { PushSender } from "./push-sender.js";

export interface WebPushSettings {
  /** The VAPID public key, base64url: the web app subscribes with it too. */
  publicKey: string;
  privateKey: string;
  /** How a push service reaches us about problems: "mailto:..." or an https URL. */
  subject: string;
}

/** A day: an unread notification about something older than that is noise. */
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

function assertVapidSettings(settings: WebPushSettings): void {
  const decodedLength = (key: string) => Buffer.from(key, "base64url").length;
  if (decodedLength(settings.publicKey) !== 65 || decodedLength(settings.privateKey) !== 32) {
    throw new RangeError("The VAPID keys must be a P-256 key pair in base64url (as web-push generateVAPIDKeys makes)");
  }
  if (!/^(mailto:|https:\/\/)/.test(settings.subject)) {
    throw new RangeError('The VAPID subject must be a "mailto:" address or an https URL');
  }
}

export function createWebPushSender(settings: WebPushSettings): PushSender {
  assertVapidSettings(settings);
  return {
    send: async (subscription, payload) => {
      const request = webPush.generateRequestDetails(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: settings,
          TTL: TIME_TO_LIVE_SECONDS,
          contentEncoding: "aes128gcm",
        },
      );
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      if (response.status === 404 || response.status === 410) return "gone";
      if (!response.ok) {
        throw new Error(`The push service answered ${String(response.status)} ${response.statusText}`);
      }
      return "sent";
    },
  };
}
```

`packages/integrations/src/push/memory-push-sender.ts`:
```ts
// An in-memory PushSender for tests: it records pushes, and endpoints marked gone answer "gone" as a push service
// would for a dropped subscription.
import type { PushPayload, PushSender, PushSubscriptionKeys } from "./push-sender.js";

export interface SentPush {
  subscription: PushSubscriptionKeys;
  payload: PushPayload;
}

export interface MemoryPushSender extends PushSender {
  /** Every push delivered so far, oldest first. */
  readonly sent: readonly SentPush[];
  /** From now on, pushes to this endpoint answer "gone". */
  markGone(endpoint: string): void;
}

export function createMemoryPushSender(): MemoryPushSender {
  const sent: SentPush[] = [];
  const gone = new Set<string>();
  return {
    sent,
    markGone: (endpoint) => {
      gone.add(endpoint);
    },
    send: (subscription, payload) => {
      if (gone.has(subscription.endpoint)) return Promise.resolve("gone");
      sent.push({ subscription, payload });
      return Promise.resolve("sent");
    },
  };
}
```

`packages/integrations/src/push/index.ts`:
```ts
// Public API of @travel-crm/integrations/push: the web push port and its adapters.
export { createMemoryPushSender, type MemoryPushSender, type SentPush } from "./memory-push-sender.js";
export type { PushPayload, PushSender, PushSubscriptionKeys } from "./push-sender.js";
export { createWebPushSender, type WebPushSettings } from "./web-push-sender.js";
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations exec vitest run test/email test/push`

Expected: 13 tests pass in 5 files (Docker must be running: the SMTP test starts Mailpit). The web push test decrypts the payload with the subscriber's keys and reads back the JSON it sent.

- [ ] **Step 8: Check**

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: `api-server=72 api=5 brand=3 contracts=18 db=111 domain=121 eslint-config=65 integrations=19`. (While other tracks run on the same machine, `pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise` runs the same gates with less Docker load.)

- [ ] **Step 9: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null
git add packages/integrations/src/email packages/integrations/src/push packages/integrations/test/email packages/integrations/test/push packages/integrations/test/support/mailpit.ts packages/integrations/test/support/push-service.ts
git commit -m "feat(integrations): add the email and web push adapters"
```

---

### Task N2: The notifications module

`notify()` is the one service every module calls, inside its own transaction: one row per person in `notification` (the in-app bell, which can't be turned off), and a `notification.created` event per row when email or push is wanted. The worker's `notifications.deliver` listener sends them from our address as "<organization> via <product>", with Reply-To the organization's contact email, respecting each person's opt-outs (per kind, or `*` for every kind; a kind's own choice wins), never emailing a placeholder address and never notifying someone who has left. It records `emailed_at` and `pushed_at`, so a retry sends only what is missing. The bell, the opt-outs and the push subscriptions are always the acting person's own. Notification links are paths inside the web app, checked by the contract and the table, so a notification can't lead anyone off the app.

**Files:**
- Create: `packages/contracts/src/notifications/fields.ts`, `notify.ts`, `bell.ts`, `preferences.ts`, `index.ts`
- Create: `packages/db/prisma/schema/notifications.prisma`, `packages/db/prisma/migrations/20261015140000_notifications/migration.sql`, `packages/db/test/org-table-fixtures/notifications.ts`
- Create: `packages/integrations/src/email/sender-name.ts`; Modify: `packages/integrations/src/email/index.ts`, `packages/integrations/test/email/render-email.test.ts`
- Create: `packages/domain/src/notifications/person.ts`, `parse-input.ts`, `notify.ts`, `preferences.ts`, `push-subscriptions.ts`, `bell.ts`, `deliver-notification.ts`, `index.ts`, `README.md`
- Create: `docs/adr/0014-notifications.md`
- Test: `packages/contracts/test/notifications/notifications.test.ts`, `packages/domain/test/notifications/test-support.ts`, `notify.test.ts`, `deliver.test.ts`, `bell.test.ts`, `preferences.test.ts`

**Interfaces:**
- Consumes: Task N1's `EmailSender`, `renderEmail`, `PushSender`, `createMemoryEmailSender`, `createMemoryPushSender`; `publishEvent(tx, { type, payload })`, `defineListener`, `EventListener`, `ListenerContext`, `DomainEvent` from `@travel-crm/domain/jobs`; `Actor`, `systemActor`, `DomainError` from the kernel; the types `OrganizationProfile` and `MemberContact` from `@travel-crm/domain/identity`; `recordId` from `@travel-crm/contracts/identity`'s fields.
- Produces, from `@travel-crm/contracts/notifications`: `notifyInput` (`NotifyInput`), `notificationCreatedEvent` (`{ notificationId, channels }`), `notificationSummary`, `listNotificationsInput`, `notificationPage` (`{ notifications, nextCursor }`), `markReadInput`, `notificationPreferenceInput`, `notificationPreference`, `pushSubscriptionInput`, `removePushSubscriptionInput`, and the fields `notificationKind`, `notificationLink`, `notificationChannel` (`"email" | "push"`), `preferenceKind`.
- Produces, from `@travel-crm/integrations/email`: `senderNameFor(organizationName: string): string` ("Sharma Travels via <product name>", the name read from `@travel-crm/brand`).
- Produces, from `@travel-crm/domain/notifications`:
  - `notify(tx: OrgTx, actor: Actor, input: NotifyInput): Promise<string[]>` (the notification ids; the actor is never among the recipients)
  - `deliverNotificationListener(dependencies: DeliveryDependencies): EventListener`, named `notifications.deliver`, on `notification.created`, where `DeliveryDependencies = { email: EmailSender; push: PushSender; organizationProfile(organizationId: string): Promise<OrganizationProfile | null>; memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>; appUrl: string }`
  - `listNotifications(tx, actor, input: ListNotificationsInput): Promise<NotificationPage>`, `unreadCount(tx, actor): Promise<number>`, `markRead(tx, actor, input: MarkReadInput): Promise<number>`
  - `setPreference(tx, actor, input): Promise<NotificationPreference>`, `listPreferences(tx, actor): Promise<NotificationPreference[]>`, `isOptedOut(preferences, channel, kind): boolean`
  - `savePushSubscription(tx, actor, input: PushSubscriptionInput): Promise<void>`, `removePushSubscription(tx, actor, input): Promise<boolean>`
  - `type Person = Actor & { readonly userId: string }`; a job actor gets `FORBIDDEN`/`NOT_A_PERSON` from the bell's functions.

- [ ] **Step 1: Write the failing contract tests**

`packages/contracts/test/notifications/notifications.test.ts`:
```ts
// The notification contracts refuse what must never reach the database or a browser: links that leave the web app,
// push endpoints that aren't https, unknown keys, and malformed kinds.
import { describe, expect, it } from "vitest";
import {
  listNotificationsInput,
  markReadInput,
  notificationCreatedEvent,
  notificationPreferenceInput,
  notifyInput,
  pushSubscriptionInput,
  removePushSubscriptionInput,
} from "../../src/notifications/index.js";

const id = "0199e7a0-0000-7000-8000-000000000001";
const notification = { recipientUserIds: [id], kind: "share-link.opened", title: "Opened", body: "Meera opened it" };

describe("notification contracts", () => {
  it("accepts a notification for some people, of a kind, with an optional link inside the web app", () => {
    expect(notifyInput.parse({ ...notification, link: "/quotes/42", channels: ["email"] })).toMatchObject({
      link: "/quotes/42",
      channels: ["email"],
    });
    expect(notifyInput.parse(notification).channels).toEqual([]);
  });

  it("refuses links that could leave the web app", () => {
    for (const link of ["https://evil.example", "//evil.example/path", "quotes/42", "/quotes 42", "/\\evil.example"]) {
      expect(notifyInput.safeParse({ ...notification, link }).success, link).toBe(false);
    }
  });

  it('refuses kinds that are not "<entity>.<what happened>", empty titles and repeated channels', () => {
    expect(notifyInput.safeParse({ ...notification, kind: "Opened" }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, title: "  " }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, title: "x".repeat(121) }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, channels: ["email", "email"] }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, channels: ["sms"] }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, recipientUserIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("pages the bell 1 to 50 at a time, 20 by default", () => {
    expect(listNotificationsInput.parse({})).toEqual({ limit: 20 });
    expect(listNotificationsInput.parse({ cursor: id, limit: 50 })).toEqual({ cursor: id, limit: 50 });
    expect(listNotificationsInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(listNotificationsInput.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("marks some notifications read, or all of them, but not neither", () => {
    expect(markReadInput.safeParse({ notificationIds: [id] }).success).toBe(true);
    expect(markReadInput.safeParse({ all: true }).success).toBe(true);
    expect(markReadInput.safeParse({}).success).toBe(false);
    expect(markReadInput.safeParse({ all: false }).success).toBe(false);
    expect(markReadInput.safeParse({ notificationIds: [] }).success).toBe(false);
  });

  it("turns email or push off for one kind or for every kind", () => {
    expect(notificationPreferenceInput.safeParse({ channel: "email", kind: "*", optedOut: true }).success).toBe(true);
    expect(
      notificationPreferenceInput.safeParse({ channel: "push", kind: "share-link.opened", optedOut: false }).success,
    ).toBe(true);
    // The in-app bell can't be turned off: it is the record that the thing happened.
    expect(notificationPreferenceInput.safeParse({ channel: "in-app", kind: "*", optedOut: true }).success).toBe(false);
  });

  it("takes a browser's subscription as PushSubscription.toJSON() gives it, from an https push service only", () => {
    const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys };
    expect(pushSubscriptionInput.parse(subscription)).toEqual(subscription);
    expect(pushSubscriptionInput.safeParse({ ...subscription, endpoint: "http://push.example/abc" }).success).toBe(
      false,
    );
    expect(
      pushSubscriptionInput.safeParse({ ...subscription, keys: { ...keys, auth: "not base64url!" } }).success,
    ).toBe(false);
    expect(removePushSubscriptionInput.safeParse({ endpoint: subscription.endpoint }).success).toBe(true);
  });

  it("checks the notification.created payload the delivery listener reads", () => {
    expect(notificationCreatedEvent.parse({ notificationId: id, channels: ["email", "push"] })).toEqual({
      notificationId: id,
      channels: ["email", "push"],
    });
    expect(notificationCreatedEvent.safeParse({ notificationId: id, channels: [] }).success).toBe(false);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/notifications`

Expected: FAIL with `Cannot find module '../../src/notifications/index.js'`.

- [ ] **Step 2: Write the contracts**

`packages/contracts/src/notifications/fields.ts`:
```ts
// Field rules shared by the notification inputs and outputs.
import { z } from "zod";

/** "<entity>.<what happened>", e.g. "share-link.opened", the same pattern as event types. Opt-outs are per kind. */
export const notificationKind = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'Use "entity.what-happened"');

/**
 * A path inside the web app, such as "/quotes/42". Never a full URL, and never "//host" or "/\host", which browsers
 * treat as another site: a notification link must not lead anyone off the app.
 */
export const notificationLink = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/, "Use a path inside the app, starting with /");

/** The channels besides the in-app bell, which every notification gets. */
export const notificationChannel = z.enum(["email", "push"]);
export type NotificationChannel = z.infer<typeof notificationChannel>;

/** A preference covers one kind, or every kind with "*". */
export const preferenceKind = z.union([notificationKind, z.literal("*")]);

/** base64url text, as browsers give push keys. */
export const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/, "Use base64url");
```

`packages/contracts/src/notifications/notify.ts`:
```ts
// What a module passes to notify(), and the event that asks the worker to deliver one notification by email or push.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { notificationChannel, notificationKind, notificationLink } from "./fields.js";

export const notifyInput = z.strictObject({
  recipientUserIds: z.array(recordId).min(1).max(500),
  kind: notificationKind,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  link: notificationLink.optional(),
  /** Email and push as well as the bell. Each person's opt-outs still apply when it is delivered. */
  channels: z
    .array(notificationChannel)
    .refine((channels) => new Set(channels).size === channels.length, "List each channel once")
    .default([]),
});
export type NotifyInput = z.input<typeof notifyInput>;

/** The payload of "notification.created": which notification, and the channels to try. */
export const notificationCreatedEvent = z.strictObject({
  notificationId: recordId,
  channels: z.array(notificationChannel).min(1),
});
export type NotificationCreatedEvent = z.infer<typeof notificationCreatedEvent>;
```

`packages/contracts/src/notifications/bell.ts`:
```ts
// The in-app bell: listing a person's notifications and marking them read.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const notificationSummary = z.object({
  id: recordId,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type NotificationSummary = z.infer<typeof notificationSummary>;

/** Newest first. `cursor` is the last id of the previous page. */
export const listNotificationsInput = z.strictObject({
  cursor: recordId.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListNotificationsInput = z.input<typeof listNotificationsInput>;

export const notificationPage = z.object({
  notifications: z.array(notificationSummary),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type NotificationPage = z.infer<typeof notificationPage>;

export const markReadInput = z.union([
  z.strictObject({ notificationIds: z.array(recordId).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkReadInput = z.infer<typeof markReadInput>;
```

`packages/contracts/src/notifications/preferences.ts`:
```ts
// Each person's opt-outs (spec 9.4: DPDP and WhatsApp rules) and their browsers' push subscriptions.
import { z } from "zod";
import { base64url, notificationChannel, preferenceKind } from "./fields.js";

/** Turns email or push off (or back on) for one kind, or for every kind with "*". A kind's own setting wins. */
export const notificationPreferenceInput = z.strictObject({
  channel: notificationChannel,
  kind: preferenceKind,
  optedOut: z.boolean(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceInput>;

export const notificationPreference = z.object({
  channel: notificationChannel,
  kind: z.string(),
  optedOut: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreference>;

/** PushSubscription.toJSON() from the browser. Push services are always https. */
export const pushSubscriptionInput = z.strictObject({
  endpoint: z.url({ protocol: /^https$/, message: "Push services use https" }).max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    /** A P-256 public key: 65 bytes, 87 characters of base64url. */
    p256dh: base64url.length(87),
    /** 16 bytes, 22 characters of base64url. */
    auth: base64url.length(22),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;

export const removePushSubscriptionInput = z.strictObject({
  endpoint: z.string().max(2048),
});
export type RemovePushSubscriptionInput = z.infer<typeof removePushSubscriptionInput>;
```

`packages/contracts/src/notifications/index.ts`:
```ts
// Public API of @travel-crm/contracts/notifications: the Zod schemas for notifications, opt-outs and push.
export * from "./bell.js";
export * from "./fields.js";
export * from "./notify.js";
export * from "./preferences.js";
```

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/notifications`

Expected: 8 tests pass.

- [ ] **Step 3: Add the tables**

`packages/db/prisma/schema/notifications.prisma`:
```prisma
// Notifications (spec 9.4): the in-app bell, each person's opt-outs, and their browsers' push subscriptions.
// Organization-owned: row-level security applies (the migration calls app_enable_org_rls on all three).

/// One notification for one person: a row in their bell, and perhaps an email and a push.
model Notification {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String    @id @default(uuid(7)) @db.Uuid
  /// Who it is for. Delivery checks they are still an active member.
  recipientUserId String    @map("recipient_user_id") @db.Uuid
  /// "<entity>.<what happened>", e.g. "share-link.opened" (CHECK notification_kind_format). Opt-outs are per kind.
  kind            String
  title           String
  body            String
  /// A path inside the web app, starting with "/" (CHECK notification_link_path).
  link            String?
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  readAt          DateTime? @map("read_at") @db.Timestamptz(6)
  /// When the email went out, so a retried delivery doesn't send it again.
  emailedAt       DateTime? @map("emailed_at") @db.Timestamptz(6)
  /// When every push subscription was tried, for the same reason.
  pushedAt        DateTime? @map("pushed_at") @db.Timestamptz(6)

  /// The bell: a person's notifications, newest first (UUID v7 ids sort by time).
  @@index([organizationId, recipientUserId, id(sort: Desc)])
  /// The bell's unread count.
  @@index([organizationId, recipientUserId], map: "notification_unread", where: { readAt: null })
  @@map("notification")
}

/// One person's choice about email or push for one kind of notification, or for every kind ("*"). A kind's own
/// row wins over "*". No row: they get it.
model NotificationPreference {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  /// "email" or "push" (CHECK notification_preference_channel). The bell can't be turned off.
  channel        String
  /// A notification kind, or "*" for every kind (CHECK notification_preference_kind_format).
  kind           String
  optedOut       Boolean  @map("opted_out")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@id([organizationId, userId, channel, kind])
  @@map("notification_preference")
}

/// One browser's push subscription for one person. Deleted when the push service says it is gone.
model PushSubscription {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String   @id @default(uuid(7)) @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  /// The push service's URL for this browser. A browser that subscribes again for another person moves to them.
  endpoint       String
  /// The browser's P-256 public key and auth secret, base64url: the payload is encrypted to them.
  p256dh         String
  auth           String
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([organizationId, endpoint])
  @@index([organizationId, userId])
  @@map("push_subscription")
}
```

Generate the migration without a database (several tracks run at once and share nothing): diff the schema as it was at the last commit against the schema with the new file.
```bash
cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d)
git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
cd packages/db
mkdir -p prisma/migrations/20261015140000_notifications
pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015140000_notifications/migration.sql
cat prisma/migrations/20261015140000_notifications/migration.sql
```
Expected: exactly this SQL:
```sql
-- CreateTable
CREATE TABLE "notification" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "emailed_at" TIMESTAMPTZ(6),
    "pushed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "opted_out" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("organization_id","user_id","channel","kind")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_organization_id_recipient_user_id_id_idx" ON "notification"("organization_id", "recipient_user_id", "id" DESC);

-- CreateIndex
CREATE INDEX "notification_unread" ON "notification"("organization_id", "recipient_user_id") WHERE ("read_at" IS NULL);

-- CreateIndex
CREATE INDEX "push_subscription_organization_id_user_id_idx" ON "push_subscription"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_organization_id_endpoint_key" ON "push_subscription"("organization_id", "endpoint");
```

Append this to the end of that `migration.sql`:
```sql
-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('notification');
SELECT app_enable_org_rls('notification_preference');
SELECT app_enable_org_rls('push_subscription');

-- Kinds read "<entity>.<what happened>", like event types; a link is a path inside the web app, never another site.
ALTER TABLE "notification"
  ADD CONSTRAINT notification_kind_format CHECK (kind ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT notification_link_path CHECK (link IS NULL OR link ~ '^/($|[^/\\])');

ALTER TABLE "notification_preference"
  ADD CONSTRAINT notification_preference_channel CHECK (channel IN ('email', 'push')),
  ADD CONSTRAINT notification_preference_kind_format
    CHECK (kind = '*' OR kind ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$');

-- A notification is the record that something happened: the api and worker may mark it read and record its
-- delivery, and change or delete nothing else.
REVOKE UPDATE, DELETE ON TABLE "notification" FROM app_runtime;
GRANT UPDATE (read_at, emailed_at, pushed_at) ON TABLE "notification" TO app_runtime;
```

Add the isolation fixtures, then regenerate the client:
`packages/db/test/org-table-fixtures/notifications.ts`:
```ts
// Isolation fixtures for the notifications module: the bell, opt-outs and push subscriptions.
import type { OrgTableFixtures } from "../org-table-fixture.js";

const someone = "0199e7a0-0000-7000-8000-00000000beef";

export const fixtures: OrgTableFixtures = {
  notification: {
    create: (tx) =>
      tx.notification.create({
        data: { recipientUserId: someone, kind: "isolation.checked", title: "Isolation", body: "Checked" },
      }),
    appendOnly: true,
  },
  notification_preference: {
    create: (tx) =>
      tx.notificationPreference.create({ data: { userId: someone, channel: "email", kind: "*", optedOut: true } }),
  },
  push_subscription: {
    create: (tx) =>
      tx.pushSubscription.create({
        data: { userId: someone, endpoint: "https://push.example/isolation", p256dh: "key", auth: "secret" },
      }),
  },
};
```

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/db test`

Expected: 126 tests pass in 15 files, including the drift check in the global setup and 5 isolation tests each for `notification` (append-only: updating its `organization_id` or deleting it is refused outright), `notification_preference` and `push_subscription`.

- [ ] **Step 4: Write the failing domain tests**

The helpers build the acting people and read back the events `notify()` published, as the worker would hand them to the listener:
`packages/domain/test/notifications/test-support.ts`:
```ts
// Helpers for the notifications tests: people acting in an organization, and the events notify() published.
import { randomUUID } from "node:crypto";
import type { Database } from "@travel-crm/db";
import type { DomainEvent } from "../../src/jobs/index.js";
import type { Person } from "../../src/notifications/index.js";

/** A member acting in the web app, as the bell's functions see them. */
export function personIn(organizationId: string, userId: string = randomUUID()): Person {
  return { organizationId, userId, source: "web", impersonatedBy: null };
}

/** The organization's unrelayed events of one type, oldest first, as the worker would hand them to a listener. */
export async function eventsOfType(db: Database, organizationId: string, type: string): Promise<DomainEvent[]> {
  const rows = await db.forOrg(organizationId, (tx) =>
    tx.outboxEvent.findMany({ where: { type, relayedAt: null }, orderBy: { id: "asc" } }),
  );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    payload: row.payload as DomainEvent["payload"],
    occurredAt: row.occurredAt,
  }));
}
```

`packages/domain/test/notifications/notify.test.ts`:
```ts
// notify() is the one service every module calls: a bell row per person, and a delivery event when email or push is
// wanted, all in the caller's transaction.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import { eventsOfType, personIn } from "./test-support.js";

describe("notify", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  const asha = "0199e7a0-0000-7000-8000-00000000a5a0";
  const ravi = "0199e7a0-0000-7000-8000-00000000ba01";

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Notify");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("puts one notification in each person's bell, once, and asks for delivery by email and push", async () => {
    const ids = await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [asha, ravi, asha],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Meera opened Quotation QT-2026-0042",
        link: "/quotes/42",
        channels: ["email", "push"],
      }),
    );

    expect(ids).toHaveLength(2);
    const rows = await db.forOrg(organizationId, (tx) =>
      tx.notification.findMany({ where: { id: { in: ids } }, orderBy: { recipientUserId: "asc" } }),
    );
    expect(rows.map((row) => [row.recipientUserId, row.kind, row.link, row.readAt])).toEqual([
      [asha, "share-link.opened", "/quotes/42", null],
      [ravi, "share-link.opened", "/quotes/42", null],
    ]);
    const events = await eventsOfType(db, organizationId, "notification.created");
    expect(events.map((event) => event.payload)).toEqual(
      ids.map((notificationId) => ({ notificationId, channels: ["email", "push"] })),
    );
  });

  it("asks for no delivery when only the bell is wanted", async () => {
    const before = (await eventsOfType(db, organizationId, "notification.created")).length;
    await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [asha],
        kind: "staff.added",
        title: "Welcome Ravi",
        body: "Ravi joined",
      }),
    );
    expect(await eventsOfType(db, organizationId, "notification.created")).toHaveLength(before);
  });

  it("never notifies people about their own action", async () => {
    const ids = await db.forOrg(organizationId, (tx) =>
      notify(tx, personIn(organizationId, asha), {
        recipientUserIds: [asha, ravi],
        kind: "role.updated",
        title: "Roles changed",
        body: "Sales can now edit departures",
      }),
    );
    const rows = await db.forOrg(organizationId, (tx) => tx.notification.findMany({ where: { id: { in: ids } } }));
    expect(rows.map((row) => row.recipientUserId)).toEqual([ravi]);
  });

  it("refuses a link that leaves the web app, before writing anything", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        notify(tx, systemActor(organizationId), {
          recipientUserIds: [asha],
          kind: "share-link.opened",
          title: "Opened",
          body: "Opened",
          link: "//evil.example/login",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_NOTIFICATION" });
  });

  it("leaves nothing behind when the caller's transaction rolls back", async () => {
    let ids: string[] = [];
    await expect(
      db.forOrg(organizationId, async (tx) => {
        ids = await notify(tx, systemActor(organizationId), {
          recipientUserIds: [ravi],
          kind: "share-link.opened",
          title: "Opened",
          body: "Opened",
          channels: ["email"],
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await db.forOrg(organizationId, (tx) => tx.notification.count({ where: { id: { in: ids } } }))).toBe(0);
  });
});
```

`packages/domain/test/notifications/deliver.test.ts`:
```ts
// The delivery listener sends each notification by email and push as asked, from the organization's name with its
// Reply-To, respecting opt-outs, never twice, and never to someone who has left.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import {
  createMemoryEmailSender,
  senderNameFor,
  type EmailSender,
  type MemoryEmailSender,
} from "@travel-crm/integrations/email";
import { createMemoryPushSender, type MemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { MemberContact, OrganizationProfile } from "../../src/identity/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  deliverNotificationListener,
  notify,
  savePushSubscription,
  setPreference,
  type DeliveryDependencies,
} from "../../src/notifications/index.js";
import { eventsOfType, personIn } from "./test-support.js";

const asha = "0199e7a0-0000-7000-8000-00000000a5a0";
const ravi = "0199e7a0-0000-7000-8000-00000000ba01";
const leaver = "0199e7a0-0000-7000-8000-00000000dead";

describe("delivering notifications", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let email: MemoryEmailSender;
  let push: MemoryPushSender;
  let profile: OrganizationProfile;
  const contacts: MemberContact[] = [
    { userId: asha, name: "Asha Owner", email: "asha@agency.example" },
    { userId: ravi, name: "Ravi", email: null },
  ];

  const dependencies = (overrides: Partial<DeliveryDependencies> = {}): DeliveryDependencies => ({
    email,
    push,
    organizationProfile: () => Promise.resolve(profile),
    memberContacts: (_organizationId, userIds) =>
      Promise.resolve(contacts.filter((contact) => userIds.includes(contact.userId))),
    appUrl: "https://app.example",
    ...overrides,
  });

  const context = (): ListenerContext => ({
    actor: systemActor(organizationId),
    forOrg: (fn) => db.forOrg(organizationId, fn),
  });

  /** Notifies one person and runs the delivery listener on the event that produced, as the worker would. */
  async function notifyAndDeliver(recipientUserId: string, deliveryDependencies = dependencies()) {
    const [id] = await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [recipientUserId],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Meera opened Quotation QT-2026-0042",
        link: "/quotes/42",
        channels: ["email", "push"],
      }),
    );
    const event = (await eventsOfType(db, organizationId, "notification.created")).find(
      (candidate) => candidate.payload.notificationId === id,
    );
    if (!id || !event) throw new Error("notify() published no delivery event");
    const listener = deliverNotificationListener(deliveryDependencies);
    await listener.handle(event, context());
    return { id, event, listener };
  }

  const notificationRow = (id: string) =>
    db.forOrg(organizationId, (tx) => tx.notification.findUniqueOrThrow({ where: { id } }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Deliveries");
  });

  beforeEach(() => {
    email = createMemoryEmailSender();
    push = createMemoryPushSender();
    profile = {
      id: organizationId,
      name: "Sharma Travels",
      code: "SHARMA",
      timeZone: "Asia/Kolkata",
      contactEmail: "hello@sharma.example",
    };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("emails from the organization's name with its Reply-To and a way to opt out, and pushes every browser", async () => {
    for (const endpoint of ["https://push.example/asha-phone", "https://push.example/asha-laptop"]) {
      await db.forOrg(organizationId, (tx) =>
        savePushSubscription(tx, personIn(organizationId, asha), {
          endpoint,
          keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
        }),
      );
    }

    const { id } = await notifyAndDeliver(asha);

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: { name: "Asha Owner", address: "asha@agency.example" },
      fromName: senderNameFor("Sharma Travels"),
      replyTo: "hello@sharma.example",
      subject: "Quotation opened",
      headers: { "List-Unsubscribe": "<https://app.example/settings/notifications>" },
    });
    expect(email.sent[0]?.text).toContain("https://app.example/quotes/42");
    expect(push.sent.map((sent) => sent.subscription.endpoint).sort()).toEqual([
      "https://push.example/asha-laptop",
      "https://push.example/asha-phone",
    ]);
    expect(push.sent[0]?.payload).toEqual({
      title: "Quotation opened",
      body: "Meera opened Quotation QT-2026-0042",
      url: "/quotes/42",
    });
    const row = await notificationRow(id);
    expect(row.emailedAt).toBeInstanceOf(Date);
    expect(row.pushedAt).toBeInstanceOf(Date);
  });

  it("sends nothing again when the same delivery runs twice", async () => {
    const { event, listener } = await notifyAndDeliver(asha);
    const sentEmails = email.sent.length;
    const sentPushes = push.sent.length;

    await listener.handle(event, context());

    expect(email.sent).toHaveLength(sentEmails);
    expect(push.sent).toHaveLength(sentPushes);
  });

  it("leaves Reply-To out when the organization has no contact email", async () => {
    profile = { ...profile, contactEmail: null };
    await notifyAndDeliver(asha);
    expect(email.sent[0]?.replyTo).toBeUndefined();
  });

  it("respects opt-outs: a kind's own setting wins over every kind", async () => {
    const person = personIn(organizationId, asha);
    await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel: "email", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel: "push", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "share-link.opened", optedOut: false }),
    );

    await notifyAndDeliver(asha);

    expect(email.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(0);
    for (const channel of ["email", "push"] as const) {
      await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel, kind: "*", optedOut: false }));
    }
  });

  it("never emails staff without email, and still pushes to them", async () => {
    await db.forOrg(organizationId, (tx) =>
      savePushSubscription(tx, personIn(organizationId, ravi), {
        endpoint: "https://push.example/ravi",
        keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
      }),
    );
    await notifyAndDeliver(ravi);
    expect(email.sent).toEqual([]);
    expect(push.sent.map((sent) => sent.subscription.endpoint)).toEqual(["https://push.example/ravi"]);
  });

  it("sends nothing to someone who has left the organization", async () => {
    const { id } = await notifyAndDeliver(leaver);
    expect(email.sent).toEqual([]);
    expect(push.sent).toEqual([]);
    expect((await notificationRow(id)).emailedAt).toBeNull();
  });

  it("deletes a subscription the push service has forgotten, and keeps the others", async () => {
    push.markGone("https://push.example/asha-phone");
    await notifyAndDeliver(asha);
    const endpoints = await db.forOrg(organizationId, (tx) =>
      tx.pushSubscription.findMany({ where: { userId: asha }, select: { endpoint: true } }),
    );
    expect(endpoints).toEqual([{ endpoint: "https://push.example/asha-laptop" }]);
  });

  it("fails when email fails, so the job retries, and the retry sends it", async () => {
    const down: EmailSender = { send: () => Promise.reject(new Error("SMTP is down")) };
    await expect(notifyAndDeliver(asha, dependencies({ email: down }))).rejects.toThrow("SMTP is down");
    const event = (await eventsOfType(db, organizationId, "notification.created")).at(-1);
    const notificationId = event?.payload.notificationId;
    if (!event || typeof notificationId !== "string") throw new Error("no event");
    expect((await notificationRow(notificationId)).emailedAt).toBeNull();

    await deliverNotificationListener(dependencies()).handle(event, context());
    expect(email.sent).toHaveLength(1);
  });

  it("does nothing for a notification that isn't in the event's organization", async () => {
    const { event } = await notifyAndDeliver(asha);
    const otherOrganizationId = await createTestOrganization(platform, "Other deliveries");
    email = createMemoryEmailSender();
    await deliverNotificationListener(dependencies()).handle(
      { ...event, organizationId: otherOrganizationId },
      { actor: systemActor(otherOrganizationId), forOrg: (fn) => db.forOrg(otherOrganizationId, fn) },
    );
    expect(email.sent).toEqual([]);
  });
});
```

`packages/domain/test/notifications/bell.test.ts`:
```ts
// The bell shows each person only their own notifications, newest first, page by page, and only they mark them read.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { listNotifications, markRead, notify, unreadCount, type Person } from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

describe("the bell", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let ashaHere: Person;
  let raviHere: Person;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Bell");
    ashaHere = personIn(organizationId);
    raviHere = personIn(organizationId);
    for (const title of ["First", "Second", "Third"]) {
      await db.forOrg(organizationId, (tx) =>
        notify(tx, systemActor(organizationId), {
          recipientUserIds: [ashaHere.userId],
          kind: "share-link.opened",
          title,
          body: `${title} body`,
        }),
      );
    }
    await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [raviHere.userId],
        kind: "share-link.opened",
        title: "Ravi's",
        body: "Only for Ravi",
      }),
    );
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists a person's own notifications, newest first, a page at a time", async () => {
    const first = await db.forOrg(organizationId, (tx) => listNotifications(tx, ashaHere, { limit: 2 }));
    expect(first.notifications.map((notification) => notification.title)).toEqual(["Third", "Second"]);
    expect(first.nextCursor).toBe(first.notifications[1]?.id);

    const second = await db.forOrg(organizationId, (tx) =>
      listNotifications(tx, ashaHere, { limit: 2, cursor: first.nextCursor ?? undefined }),
    );
    expect(second.notifications.map((notification) => notification.title)).toEqual(["First"]);
    expect(second.nextCursor).toBeNull();
    expect(second.notifications[0]).toMatchObject({ kind: "share-link.opened", link: null, readAt: null });
    expect(second.notifications[0]?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("counts unread ones, and marks only the person's own as read", async () => {
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(3);
    const { notifications } = await db.forOrg(organizationId, (tx) => listNotifications(tx, ashaHere, {}));
    const [ravisOwn] = (await db.forOrg(organizationId, (tx) => listNotifications(tx, raviHere, {}))).notifications;

    const marked = await db.forOrg(organizationId, (tx) =>
      markRead(tx, ashaHere, { notificationIds: [notifications[0]?.id ?? "", ravisOwn?.id ?? ""] }),
    );

    expect(marked).toBe(1);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(2);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, raviHere))).toBe(1);
    expect(await db.forOrg(organizationId, (tx) => markRead(tx, ashaHere, { all: true }))).toBe(2);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(0);
  });

  it("shows nothing from another organization", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other bell");
    const ashaElsewhere = personIn(otherOrganizationId, ashaHere.userId);
    expect(
      (await db.forOrg(otherOrganizationId, (tx) => listNotifications(tx, ashaElsewhere, {}))).notifications,
    ).toEqual([]);
    expect(await db.forOrg(otherOrganizationId, (tx) => unreadCount(tx, ashaElsewhere))).toBe(0);
  });

  it("refuses an actor with no person, such as a job", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => listNotifications(tx, { ...systemActor(organizationId) }, {})),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "NOT_A_PERSON" });
  });
});
```

`packages/domain/test/notifications/preferences.test.ts`:
```ts
// Each person sets their own opt-outs and push subscriptions; a browser that subscribes again moves to its new person.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  listPreferences,
  removePushSubscription,
  savePushSubscription,
  setPreference,
} from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };

describe("notification preferences and push subscriptions", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Preferences");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("stores a person's choices per channel and kind, and changes them in place", async () => {
    const asha = personIn(organizationId);
    await db.forOrg(organizationId, (tx) => setPreference(tx, asha, { channel: "email", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) =>
      setPreference(tx, asha, { channel: "email", kind: "share-link.opened", optedOut: false }),
    );
    await db.forOrg(organizationId, (tx) => setPreference(tx, asha, { channel: "email", kind: "*", optedOut: false }));

    expect(await db.forOrg(organizationId, (tx) => listPreferences(tx, asha))).toEqual([
      { channel: "email", kind: "*", optedOut: false },
      { channel: "email", kind: "share-link.opened", optedOut: false },
    ]);
    expect(await db.forOrg(organizationId, (tx) => listPreferences(tx, personIn(organizationId)))).toEqual([]);
  });

  it("refuses an invalid preference", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        setPreference(tx, personIn(organizationId), { channel: "email", kind: "Everything", optedOut: true }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PREFERENCE" });
  });

  it("keeps one subscription per browser, moving it to whoever subscribed last", async () => {
    const asha = personIn(organizationId);
    const ravi = personIn(organizationId);
    const endpoint = "https://push.example/shared-tablet";
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, asha, { endpoint, keys }));
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, ravi, { endpoint, keys }));

    const rows = await db.forOrg(organizationId, (tx) => tx.pushSubscription.findMany({ where: { endpoint } }));
    expect(rows.map((row) => row.userId)).toEqual([ravi.userId]);
  });

  it("refuses a push endpoint that isn't https", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        savePushSubscription(tx, personIn(organizationId), { endpoint: "http://push.example/x", keys }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PUSH_SUBSCRIPTION" });
  });

  it("removes only the person's own subscription", async () => {
    const asha = personIn(organizationId);
    const ravi = personIn(organizationId);
    const endpoint = "https://push.example/asha-only";
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, asha, { endpoint, keys }));

    expect(await db.forOrg(organizationId, (tx) => removePushSubscription(tx, ravi, { endpoint }))).toBe(false);
    expect(await db.forOrg(organizationId, (tx) => removePushSubscription(tx, asha, { endpoint }))).toBe(true);
    expect(await db.forOrg(organizationId, (tx) => tx.pushSubscription.count({ where: { endpoint } }))).toBe(0);
  });
});
```

The sender's display name needs the brand's name, which only `packages/integrations` may import from the domain's side; add it to the email adapter, test first. Replace `packages/integrations/test/email/render-email.test.ts` with:

`packages/integrations/test/email/render-email.test.ts`:
```ts
// The email layout escapes every value, shows the action as a button and a plain link, and names the product.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderEmail, senderNameFor } from "../../src/email/index.js";

describe("renderEmail", () => {
  it("lays out the heading, paragraphs, action and footer in HTML and plain text", () => {
    const { html, text } = renderEmail({
      heading: "Your quotation was opened",
      paragraphs: ["Meera opened Quotation QT-2026-0042.", "Follow up while it is fresh."],
      action: { label: "Open the quotation", url: "https://app.example/quotes/42" },
      footer: "You get these because you shared the link.",
    });

    expect(html).toContain("Your quotation was opened");
    expect(html).toContain('href="https://app.example/quotes/42"');
    expect(html).toContain(brand.colours.action);
    expect(html).toContain(brand.productName);
    expect(text).toBe(
      [
        "Your quotation was opened",
        "",
        "Meera opened Quotation QT-2026-0042.",
        "",
        "Follow up while it is fresh.",
        "",
        "Open the quotation: https://app.example/quotes/42",
        "",
        "--",
        "You get these because you shared the link.",
        `Sent with ${brand.productName}`,
      ].join("\n"),
    );
  });

  it("escapes HTML in every value", () => {
    const { html } = renderEmail({
      heading: "<script>alert(1)</script>",
      paragraphs: ['Tom & "Jerry" <b>'],
      action: { label: "<i>Open</i>", url: "https://app.example/?a=1&b=<2>" },
      footer: "<footer>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
    expect(html).toContain('href="https://app.example/?a=1&amp;b=&lt;2&gt;"');
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<footer>");
  });

  it("refuses an action that isn't an http(s) link", () => {
    const content = { heading: "x", paragraphs: [], footer: "y" };
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "javascript:alert(1)" } })).toThrow(/http/);
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "/relative" } })).toThrow(/http/);
  });

  it("names the sender as the organization via the product, on one line", () => {
    expect(senderNameFor("Sharma Travels")).toBe(`Sharma Travels via ${brand.emailSenderName}`);
    expect(senderNameFor(" Sharma\n  Travels ")).toBe(`Sharma Travels via ${brand.emailSenderName}`);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/notifications && pnpm --filter @travel-crm/integrations exec vitest run test/email/render-email.test.ts`

Expected: FAIL. The domain's 4 test files stop at `Error: Cannot find module '../../src/notifications/index.js'`; in the render test, 3 pass and "names the sender as the organization via the product, on one line" fails with `TypeError: senderNameFor is not a function`.

- [ ] **Step 5: Write the sender name**

`packages/integrations/src/email/sender-name.ts`:
```ts
// The display name of email sent for an organization: its name, then ours, so people see who wrote and through what.
import { brand } from "@travel-crm/brand";

/** "Sharma Travels via <product name>". Runs of spaces and line breaks in the name become one space. */
export function senderNameFor(organizationName: string): string {
  return `${organizationName.replace(/\s+/g, " ").trim()} via ${brand.emailSenderName}`;
}
```

`packages/integrations/src/email/index.ts`:
```ts
// Public API of @travel-crm/integrations/email: the email port, its adapters and the product's email layout.
export { assertSafeHeaders, type EmailMessage, type EmailSender } from "./email-sender.js";
export { createMemoryEmailSender, type MemoryEmailSender } from "./memory-email-sender.js";
export { renderEmail, type EmailContent } from "./render-email.js";
export { senderNameFor } from "./sender-name.js";
export { createSmtpEmailSender, type SmtpSettings } from "./smtp-email-sender.js";
```

- [ ] **Step 6: Write the module**

Who may use the bell, and turning a contract mismatch into a domain error:
`packages/domain/src/notifications/person.ts`:
```ts
// Notifications belong to people: the bell, opt-outs and push subscriptions are always the acting person's own.
import { DomainError, type Actor } from "../kernel/index.js";

/** An actor who is a signed-in person, as the bell's functions need. MemberAccess is one. */
export type Person = Actor & { readonly userId: string };

/** The actor as a person. A job, which acts for nobody, has no bell. */
export function asPerson(actor: Actor): Person {
  const { userId } = actor;
  if (userId === null) {
    throw new DomainError("FORBIDDEN", "NOT_A_PERSON", "Only a signed-in person has notifications");
  }
  return { ...actor, userId };
}
```

`packages/domain/src/notifications/parse-input.ts`:
```ts
// Checks a notification input against its contract, turning a mismatch into a domain error the API can show.
import { DomainError } from "../kernel/index.js";

interface Schema<Output> {
  safeParse(value: unknown): { success: true; data: Output } | { success: false; error: { message: string } };
}

export function parseInput<Output>(schema: Schema<Output>, input: unknown, reason: string): Output {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("VALIDATION", reason, parsed.error.message);
  return parsed.data;
}
```

`notify()`, the opt-outs and the push subscriptions:
`packages/domain/src/notifications/notify.ts`:
```ts
// notify(): the one notification service every module calls (spec 9.4). It writes the bell rows and asks the worker
// to deliver by email and push, in the caller's own transaction.
import { notifyInput, type NotifyInput } from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";

/**
 * Notifies people in the transaction's organization: one notification in each person's bell, and, when channels
 * name email or push, a "notification.created" event per notification for the delivery listener. Nobody is notified
 * about their own action: the actor is left out. Returns the new notifications' ids.
 */
export async function notify(tx: OrgTx, actor: Actor, input: NotifyInput): Promise<string[]> {
  const { recipientUserIds, kind, title, body, link, channels } = parseInput(
    notifyInput,
    input,
    "INVALID_NOTIFICATION",
  );
  const recipients = [...new Set(recipientUserIds)].filter((userId) => userId !== actor.userId);
  const ids: string[] = [];
  for (const recipientUserId of recipients) {
    const created = await tx.notification.create({
      data: { recipientUserId, kind, title, body, link: link ?? null },
      select: { id: true },
    });
    if (channels.length > 0) {
      await publishEvent(tx, { type: "notification.created", payload: { notificationId: created.id, channels } });
    }
    ids.push(created.id);
  }
  return ids;
}
```

`packages/domain/src/notifications/preferences.ts`:
```ts
// Each person's opt-outs (spec 9.4: DPDP and WhatsApp rules): email or push, for one kind or every kind ("*").
import {
  notificationPreferenceInput,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationPreferenceInput,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asPerson } from "./person.js";

/** Turns email or push off, or back on, for the acting person. */
export async function setPreference(
  tx: OrgTx,
  actor: Actor,
  input: NotificationPreferenceInput,
): Promise<NotificationPreference> {
  const person = asPerson(actor);
  const { channel, kind, optedOut } = parseInput(notificationPreferenceInput, input, "INVALID_PREFERENCE");
  const saved = await tx.notificationPreference.upsert({
    where: {
      organizationId_userId_channel_kind: {
        organizationId: person.organizationId,
        userId: person.userId,
        channel,
        kind,
      },
    },
    create: { userId: person.userId, channel, kind, optedOut },
    update: { optedOut },
  });
  return { channel, kind: saved.kind, optedOut: saved.optedOut };
}

/** The acting person's choices, by channel then kind ("*" first). */
export async function listPreferences(tx: OrgTx, actor: Actor): Promise<NotificationPreference[]> {
  const person = asPerson(actor);
  const rows = await tx.notificationPreference.findMany({
    where: { userId: person.userId },
    orderBy: [{ channel: "asc" }, { kind: "asc" }],
  });
  return rows.map((row) => ({ channel: row.channel as NotificationChannel, kind: row.kind, optedOut: row.optedOut }));
}

/** True when the person turned this channel off for this kind, or for every kind without a choice for this one. */
export function isOptedOut(
  preferences: readonly { channel: string; kind: string; optedOut: boolean }[],
  channel: NotificationChannel,
  kind: string,
): boolean {
  const forKind = preferences.find((preference) => preference.channel === channel && preference.kind === kind);
  if (forKind) return forKind.optedOut;
  return preferences.find((preference) => preference.channel === channel && preference.kind === "*")?.optedOut ?? false;
}
```

`packages/domain/src/notifications/push-subscriptions.ts`:
```ts
// The acting person's browsers that may receive web push.
import {
  pushSubscriptionInput,
  removePushSubscriptionInput,
  type PushSubscriptionInput,
  type RemovePushSubscriptionInput,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asPerson } from "./person.js";

/**
 * Saves a browser's subscription for the acting person. A browser that subscribes again, perhaps for someone else
 * on a shared tablet, moves to that person: one browser, one subscription.
 */
export async function savePushSubscription(tx: OrgTx, actor: Actor, input: PushSubscriptionInput): Promise<void> {
  const person = asPerson(actor);
  const { endpoint, keys } = parseInput(pushSubscriptionInput, input, "INVALID_PUSH_SUBSCRIPTION");
  await tx.pushSubscription.upsert({
    where: { organizationId_endpoint: { organizationId: person.organizationId, endpoint } },
    create: { userId: person.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: person.userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

/** Removes one of the acting person's subscriptions. Returns false when they had none for that endpoint. */
export async function removePushSubscription(
  tx: OrgTx,
  actor: Actor,
  input: RemovePushSubscriptionInput,
): Promise<boolean> {
  const person = asPerson(actor);
  const { endpoint } = parseInput(removePushSubscriptionInput, input, "INVALID_PUSH_SUBSCRIPTION");
  const removed = await tx.pushSubscription.deleteMany({ where: { endpoint, userId: person.userId } });
  return removed.count > 0;
}
```

The bell, and the delivery listener:
`packages/domain/src/notifications/bell.ts`:
```ts
// The in-app bell: a person's own notifications, newest first, and marking them read.
import {
  listNotificationsInput,
  markReadInput,
  type ListNotificationsInput,
  type MarkReadInput,
  type NotificationPage,
  type NotificationSummary,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asPerson } from "./person.js";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
}

const summaryOf = (row: NotificationRow): NotificationSummary => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  link: row.link,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
});

/** One page of the acting person's notifications, newest first. UUID v7 ids sort by time, so they are the cursor. */
export async function listNotifications(
  tx: OrgTx,
  actor: Actor,
  input: ListNotificationsInput,
): Promise<NotificationPage> {
  const person = asPerson(actor);
  const { cursor, limit } = parseInput(listNotificationsInput, input, "INVALID_PAGE");
  const rows = await tx.notification.findMany({
    where: { recipientUserId: person.userId, ...(cursor === undefined ? {} : { id: { lt: cursor } }) },
    orderBy: { id: "desc" },
    // One more than the page, to know whether another page follows.
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    notifications: page.map(summaryOf),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function unreadCount(tx: OrgTx, actor: Actor): Promise<number> {
  const person = asPerson(actor);
  return tx.notification.count({ where: { recipientUserId: person.userId, readAt: null } });
}

/** Marks some or all of the acting person's unread notifications read. Others' ids are ignored. Returns how many. */
export async function markRead(tx: OrgTx, actor: Actor, input: MarkReadInput): Promise<number> {
  const person = asPerson(actor);
  const which = parseInput(markReadInput, input, "INVALID_MARK_READ");
  const marked = await tx.notification.updateMany({
    where: {
      recipientUserId: person.userId,
      readAt: null,
      ...("notificationIds" in which ? { id: { in: which.notificationIds } } : {}),
    },
    data: { readAt: new Date() },
  });
  return marked.count;
}
```

`packages/domain/src/notifications/deliver-notification.ts`:
```ts
// The worker's delivery of one notification by email and web push (spec 9.4): from our address under the
// organization's name with its Reply-To, respecting each person's opt-outs, and never to someone who has left.
import { notificationCreatedEvent } from "@travel-crm/contracts/notifications";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import type { PushSender } from "@travel-crm/integrations/push";
import type { MemberContact, OrganizationProfile } from "../identity/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { isOptedOut } from "./preferences.js";

export interface DeliveryDependencies {
  email: EmailSender;
  push: PushSender;
  /** identity's organizationProfile: the organization's name and contact email. */
  organizationProfile(organizationId: string): Promise<OrganizationProfile | null>;
  /** identity's memberContacts: active members only, with null for staff without email. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** Where people open the web app, e.g. https://app.example.in. Links and the opt-out page are made absolute with it. */
  appUrl: string;
}

/** The web app's origin, checked once when the listener is built rather than on every delivery. */
function webAppOrigin(appUrl: string): string {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RangeError(`The web app's address must be http(s), got ${JSON.stringify(url.protocol)}`);
  }
  return url.origin;
}

/** What delivery needs about one notification, read in one short transaction. */
async function loadDelivery(context: ListenerContext, notificationId: string) {
  return context.forOrg(async (tx) => {
    const notification = await tx.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return null;
    const recipient = { userId: notification.recipientUserId };
    const preferences = await tx.notificationPreference.findMany({ where: recipient });
    const subscriptions = await tx.pushSubscription.findMany({ where: recipient });
    return { notification, preferences, subscriptions };
  });
}

/**
 * Listens for "notification.created". Each channel is recorded as delivered (emailed_at, pushed_at) once done, so a
 * retry after a failure sends only what is missing. A crash between sending and recording can still repeat one email
 * or push: delivery is at least once.
 */
export function deliverNotificationListener(dependencies: DeliveryDependencies): EventListener {
  const appOrigin = webAppOrigin(dependencies.appUrl);
  const preferencesPage = `${appOrigin}/settings/notifications`;

  return defineListener({
    name: "notifications.deliver",
    eventType: "notification.created",
    payload: notificationCreatedEvent,
    handle: async (event, context) => {
      const delivery = await loadDelivery(context, event.payload.notificationId);
      // A notification id from another organization finds nothing under row-level security.
      if (!delivery) return;
      const { notification, preferences, subscriptions } = delivery;
      const [contact] = await dependencies.memberContacts(event.organizationId, [notification.recipientUserId]);
      // Not an active member any more: they get nothing about an organization they have left.
      if (!contact) return;
      const link = notification.link === null ? undefined : `${appOrigin}${notification.link}`;

      const wantsEmail = event.payload.channels.includes("email") && notification.emailedAt === null;
      if (wantsEmail && contact.email !== null && !isOptedOut(preferences, "email", notification.kind)) {
        const organization = await dependencies.organizationProfile(event.organizationId);
        if (!organization) throw new Error(`Organization ${event.organizationId} has no profile`);
        const { html, text } = renderEmail({
          heading: notification.title,
          paragraphs: [notification.body],
          action: link === undefined ? undefined : { label: "Open", url: link },
          footer:
            `You get this email because you work with ${organization.name}. ` +
            `Choose which emails you get at ${preferencesPage}.`,
        });
        await dependencies.email.send({
          to: { name: contact.name, address: contact.email },
          fromName: senderNameFor(organization.name),
          replyTo: organization.contactEmail ?? undefined,
          subject: notification.title,
          text,
          html,
          headers: { "List-Unsubscribe": `<${preferencesPage}>` },
        });
        await context.forOrg((tx) =>
          tx.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } }),
        );
      }

      const wantsPush = event.payload.channels.includes("push") && notification.pushedAt === null;
      if (wantsPush && !isOptedOut(preferences, "push", notification.kind)) {
        const payload = { title: notification.title, body: notification.body, url: notification.link ?? undefined };
        const gone: string[] = [];
        for (const subscription of subscriptions) {
          if ((await dependencies.push.send(subscription, payload)) === "gone") gone.push(subscription.id);
        }
        await context.forOrg(async (tx) => {
          // The push service forgot these browsers (unsubscribed, or the browser dropped them).
          await tx.pushSubscription.deleteMany({ where: { id: { in: gone } } });
          await tx.notification.update({ where: { id: notification.id }, data: { pushedAt: new Date() } });
        });
      }
    },
  });
}
```

`packages/domain/src/notifications/index.ts`:
```ts
// Public API of the notifications module (spec 9.4): notify(), its delivery by email and push, and the bell.
export { listNotifications, markRead, unreadCount } from "./bell.js";
export { deliverNotificationListener, type DeliveryDependencies } from "./deliver-notification.js";
export { notify } from "./notify.js";
export type { Person } from "./person.js";
export { isOptedOut, listPreferences, setPreference } from "./preferences.js";
export { removePushSubscription, savePushSubscription } from "./push-subscriptions.js";
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/notifications && pnpm --filter @travel-crm/integrations exec vitest run test/email`

Expected: 23 domain tests pass in 4 files, and 9 email tests in 3 files.

- [ ] **Step 8: Document the module and the decision**

`packages/domain/src/notifications/README.md`:
```markdown
# notifications

Telling people that something happened (spec 9.4): the in-app bell, email and web push. WhatsApp templates arrive
in build step 2.

## Public functions and values (`index.ts`)

- `notify(tx, actor, { recipientUserIds, kind, title, body, link?, channels })`: the one service every module calls,
  in its own transaction. One bell notification per person (the actor is left out: nobody is told about their own
  action), and when `channels` names `email` or `push`, one `notification.created` event per notification. Returns
  the ids.
- `deliverNotificationListener({ email, push, organizationProfile, memberContacts, appUrl })`: the worker's listener
  `notifications.deliver`. Pass identity's `organizationProfile` and `memberContacts`, the email and push adapters,
  and the web app's address.
- The bell, always the acting person's own: `listNotifications(tx, actor, { cursor?, limit? })` (newest first),
  `unreadCount(tx, actor)`, `markRead(tx, actor, { notificationIds } | { all: true })`.
- Opt-outs: `setPreference(tx, actor, { channel, kind, optedOut })`, `listPreferences(tx, actor)`,
  `isOptedOut(preferences, channel, kind)`.
- Push: `savePushSubscription(tx, actor, subscription)`, `removePushSubscription(tx, actor, { endpoint })`.
- Type `Person`: an actor with a user id. A job has no bell (`FORBIDDEN`/`NOT_A_PERSON`).

## Events

- Publishes `notification.created` (`{ notificationId, channels }`), handled by `notifications.deliver`.

## Rules worth knowing

- Kinds read `<entity>.<what happened>` (`share-link.opened`); opt-outs are per kind, or `*` for every kind, and a
  kind's own choice wins over `*`. The bell can't be turned off.
- Links are paths inside the web app (`/quotes/42`), never full URLs: a notification can't lead anyone off the app.
- Email comes from our address as "<organization> via <product>", with Reply-To the organization's contact email when
  set, and a `List-Unsubscribe` header pointing at `/settings/notifications`. Staff without email get none.
- Delivery records `emailed_at` and `pushed_at`, so a retry sends only what is missing; a crash between sending and
  recording can still repeat one. People who left the organization get nothing.
- The tRPC routers for the bell and the settings come with their screens (plan 5).
```

`docs/adr/0014-notifications.md`:
```markdown
# 0014: Notifications

Date: 2026-10-15 · Status: accepted · Implements spec section 9.4

## Decision

- **One service, `notify()`** (`@travel-crm/domain/notifications`), called by every module inside its own
  transaction. It writes one row per person to `notification`, which is the in-app bell, and publishes a
  `notification.created` event per row when email or push is asked for. The worker's `notifications.deliver`
  listener sends them.
- **The bell can't be turned off.** It is the record that something happened. Email and push can be, per kind of
  notification or for every kind (`*`), in `notification_preference`; a kind's own choice wins over `*`. The listener
  reads the choices at delivery time, so a change applies to notifications not yet sent.
- **Email comes from our domain** under the organization's name ("Sharma Travels via Travel Agency OS"), with
  Reply-To set to the organization's contact email (`organization.contact_email`, set at onboarding), and a
  `List-Unsubscribe` header pointing at the web app's notification settings. One SMTP adapter (nodemailer) serves
  Mailpit locally and Amazon SES in the cloud through SES's SMTP interface. The from address is the adapter's
  setting.
- **Web push uses VAPID.** web-push encrypts the payload (aes128gcm) and signs the request; the adapter sends it with
  `fetch`. A subscription the push service has forgotten (404 or 410) is deleted.
- **Delivery is at least once, and retries resend only what is missing.** `emailed_at` and `pushed_at` record each
  channel when done. A crash between sending and recording can repeat one email or push.
- **Only active members are notified.** Delivery asks identity's `memberContacts`, which leaves out people who have
  left; staff without email get push and the bell, never an email to their placeholder address.
- **Links are paths inside the web app**, checked by the contract and the table (`notification_link_path`), so a
  notification can't send anyone to another site.
- **Notifications are append-only for the api and worker**, except `read_at`, `emailed_at` and `pushed_at`.

## Context

- **Why the worker sends, not the request.** SMTP and push services are slow and fail; the request that caused the
  notification shouldn't wait for them or fail with them. The outbox makes the delivery happen exactly when the change
  commits.
- **Why an SMTP adapter for SES.** SES's SMTP interface needs no SDK and no AWS credentials in the code path, and the
  same adapter runs against Mailpit in tests and locally. An SES API adapter can replace it behind the same port if
  sending volume or bounce handling needs it.
- **Why `fetch` for push.** web-push's own sender only speaks HTTPS through Node's `https` module, which a test can't
  point at a plain local server. Encrypting with web-push and sending with `fetch` lets the tests decrypt the payload
  as a browser would.
- **DPDP.** Opt-outs cover email and push. A one-click unsubscribe (`List-Unsubscribe-Post`) needs a public endpoint,
  which comes with the settings screen (plan 5); until then the header points at the settings page.

## Consequences

- The routers for the bell, the settings and push subscriptions come with their screens in plan 5.
- Retention: notifications are kept; a purge, if needed, runs as the platform role.
- WhatsApp templates (build step 2) become a third channel with the same opt-out rules.
```

The Integration task adds the module to `packages/domain/README.md`, the adapters to `packages/integrations/README.md` and ADR 0014 to `docs/adr/README.md`; this track doesn't edit those shared files.

- [ ] **Step 9: Check**

Run: `cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: `api-server=72 api=5 brand=3 contracts=26 db=126 domain=144 eslint-config=65 integrations=20`.

- [ ] **Step 10: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-notifications && source ~/.nvm/nvm.sh && nvm use >/dev/null
git add packages/db/prisma/schema/notifications.prisma packages/db/prisma/migrations/20261015140000_notifications packages/db/test/org-table-fixtures/notifications.ts packages/contracts/src/notifications packages/contracts/test/notifications packages/domain/src/notifications packages/domain/test/notifications packages/integrations/src/email/sender-name.ts packages/integrations/src/email/index.ts packages/integrations/test/email/render-email.test.ts docs/adr/0014-notifications.md
git commit -m "feat(domain): add notifications: the bell, opt-outs, and delivery by email and push"
```

**For the Integration task** (this track doesn't wire anything):
- Add the `organization` relations and foreign keys for `Notification`, `NotificationPreference` and `PushSubscription`.
- In the worker: `deliverNotificationListener({ email: createSmtpEmailSender({ host, port, secure, user, password, fromAddress }), push: createWebPushSender({ publicKey, privateKey, subject }), organizationProfile: identity.organizationProfile, memberContacts: identity.memberContacts, appUrl })`.
- Settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_URL`. Mailpit (`axllent/mailpit:v1.31.5`, ports 1025 and 8025) in `docker-compose.yml`.

---

## Track A: Audit log

- **Delivers:** the append-only, organization-scoped audit log (spec 9.5), written in the same transaction as each
  change, with identity's staff, role and settings changes and support's impersonation recorded in it. This closes
  the impersonation gap ADR 0006 left open.
- **Branch:** `foundation/03-audit`, in the worktree `/Users/ak/personal/travel-crm-03-audit`, created from `foundation/03-shared-services` after
  Task 0.2.
- **Depends on:** Task 0 only (`Actor` and `MemberAccess` carrying `source` and `impersonatedBy`, the
  `org-table-fixtures/` folder, `audit:view`), on plan 2's final identity code (the staff locks and conditional writes
  of `staff-locks.ts`, Owner-only switching off of two-factor). Migration `20261015150000_audit_log`.

---

### Task A1: The audit log

One table, `audit_entry`, and the two functions every module uses: `recordAudit` writes an entry inside the caller's
transaction, `listAuditEntries` reads the log newest first. The table is append-only for the api and worker: the
migration revokes UPDATE and DELETE from `app_runtime`, so no code path can change or remove an entry. The router for
the audit log viewer comes with its screen in plan 5.

**Files:**
- Create: `packages/db/prisma/schema/audit.prisma`, `packages/db/prisma/migrations/20261015150000_audit_log/migration.sql`,
  `packages/db/test/org-table-fixtures/audit.ts`
- Create: `packages/contracts/src/audit/audit.ts`, `packages/contracts/src/audit/index.ts`
- Create: `packages/domain/src/audit/record-audit.ts`, `packages/domain/src/audit/list-audit-entries.ts`,
  `packages/domain/src/audit/index.ts`, `packages/domain/src/audit/README.md`
- Test: `packages/contracts/test/audit/audit.test.ts`, `packages/domain/test/audit/record-audit.test.ts`,
  `packages/domain/test/audit/list-audit-entries.test.ts`

**Interfaces:**
- Consumes (Task 0): `Actor`, `ActorSource`, `systemActor` from `@travel-crm/domain/kernel`; `JsonValue` from
  `@travel-crm/domain/jobs`; `OrgTx`, `db.forOrg` from `@travel-crm/db`; `recordId` from
  `@travel-crm/contracts/identity`; `OrgTableFixtures` from `packages/db/test/org-table-fixture.ts`.
- Produces:
  - `@travel-crm/domain/audit`:
    `recordAudit(tx: OrgTx, actor: Actor, change: AuditChange): Promise<void>`,
    `listAuditEntries(tx: OrgTx, input: ListAuditEntriesInput): Promise<AuditEntryPage>`,
    `type AuditChange = { action: string; entityType: string; entityId: string; before?: AuditSnapshot | null; after?: AuditSnapshot | null }`,
    `type AuditSnapshot = Readonly<Record<string, JsonValue>>`.
  - `@travel-crm/contracts/audit`: `auditSource`, `auditEntityType`, `auditEntry` (`AuditEntry`),
    `listAuditEntriesInput` (`ListAuditEntriesInput`), `auditEntryPage` (`AuditEntryPage`).
  - Table `audit_entry`, model `AuditEntry` (`tx.auditEntry`), no `organization` relation yet: the Integration task
    adds it with every track's tables.

- [ ] **Step 1: Write the failing contract test**

`packages/contracts/test/audit/audit.test.ts`:
```ts
// The audit log's contract: list filters come in pairs, pages are bounded, and entries show where a change came from.
import { describe, expect, it } from "vitest";
import { auditEntry, listAuditEntriesInput } from "../../src/audit/index.js";

const memberId = "0199e7a0-0000-7000-8000-0000000000b1";

describe("audit contracts", () => {
  it("lists 50 entries by default, and 1 to 100 when asked", () => {
    expect(listAuditEntriesInput.parse({})).toEqual({ limit: 50 });
    expect(listAuditEntriesInput.safeParse({ limit: 100 }).success).toBe(true);
    expect(listAuditEntriesInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ limit: 2.5 }).success).toBe(false);
  });

  it("filters by one record only with both its type and its id", () => {
    expect(listAuditEntriesInput.safeParse({ entityType: "member", entityId: memberId }).success).toBe(true);
    const typeOnly = listAuditEntriesInput.safeParse({ entityType: "member" });
    expect(typeOnly.success).toBe(false);
    expect(typeOnly.error?.issues[0]?.path).toEqual(["entityId"]);
    expect(listAuditEntriesInput.safeParse({ entityId: memberId }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ entityType: "Member", entityId: memberId }).success).toBe(false);
  });

  it("refuses unknown keys and a cursor that isn't an entry id", () => {
    expect(listAuditEntriesInput.safeParse({ organizationId: memberId }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ before: "yesterday" }).success).toBe(false);
  });

  it("describes an entry made while support impersonated a member", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c1",
      occurredAt: "2026-10-15T09:30:00.000Z",
      actorUserId: "0199e7a0-0000-7000-8000-0000000000d1",
      source: "impersonation",
      impersonatedBy: "0199e7a0-0000-7000-8000-0000000000e1",
      action: "role.updated",
      entityType: "role",
      entityId: memberId,
      before: { name: "Sales" },
      after: { name: "Senior sales" },
    };
    expect(auditEntry.parse(entry)).toEqual(entry);
    expect(auditEntry.safeParse({ ...entry, source: "email" }).success).toBe(false);
  });
});
```


- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/audit`

Expected: FAIL, `Cannot find module '../../src/audit/index.js'`.

- [ ] **Step 3: Write the contracts**

`@travel-crm/contracts/audit` resolves to `src/audit/index.ts` through the package's wildcard export (Task 0.1), so
`package.json` doesn't change. Outputs use `z.object` like identity's (unknown keys are dropped on the way out);
inputs are strict.

`packages/contracts/src/audit/audit.ts`:
```ts
// Inputs and outputs of the audit log (spec 9.5): the entries the audit log viewer (plan 5) lists.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** Where a change came from. The database's audit_entry_source_value check holds the same values. */
export const auditSource = z.enum(["web", "api", "job", "impersonation"]);
export type AuditSource = z.infer<typeof auditSource>;

/** A kind of record, e.g. "member" or "role". Matches the database's audit_entry_entity_type_format check. */
export const auditEntityType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use lower-case letters and underscores");

/** The fields that changed on one side of a change, or null when there is no state on that side. */
const auditSnapshot = z.record(z.string(), z.unknown()).nullable();

export const auditEntry = z.object({
  id: recordId,
  occurredAt: z.iso.datetime(),
  /** The person who acted, or null for the system. */
  actorUserId: recordId.nullable(),
  source: auditSource,
  /** The platform admin while support was impersonating; set exactly when source is "impersonation". */
  impersonatedBy: recordId.nullable(),
  /** "<entity>.<what happened>", e.g. "staff.removed". */
  action: z.string(),
  entityType: z.string(),
  entityId: recordId,
  before: auditSnapshot,
  after: auditSnapshot,
});
export type AuditEntry = z.infer<typeof auditEntry>;

/** One page of the log, newest first. Filter by one record with both entityType and entityId. */
export const listAuditEntriesInput = z
  .strictObject({
    entityType: auditEntityType.optional(),
    entityId: recordId.optional(),
    /** The id of the last entry of the previous page. */
    before: recordId.optional(),
    limit: z.int().min(1).max(100).default(50),
  })
  .refine((input) => (input.entityType === undefined) === (input.entityId === undefined), {
    message: "Give both entityType and entityId, or neither",
    path: ["entityId"],
  });
export type ListAuditEntriesInput = z.infer<typeof listAuditEntriesInput>;

export const auditEntryPage = z.object({
  entries: z.array(auditEntry),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type AuditEntryPage = z.infer<typeof auditEntryPage>;
```


`packages/contracts/src/audit/index.ts`:
```ts
// Public API of @travel-crm/contracts/audit: the Zod schemas of the audit log.
export * from "./audit.js";
```


Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts exec vitest run test/audit`

Expected: 4 tests pass.

- [ ] **Step 4: Write the failing domain tests**

`packages/domain/test/audit/record-audit.test.ts`:
```ts
// recordAudit writes one entry in the change's own transaction: who acted, from where, and what changed. Entries are
// fixed once written, and never hold secrets.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { recordAudit, type AuditSnapshot } from "../../src/audit/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";

const ownerUserId = "0199e7a0-0000-7000-8000-0000000000f1";
const supportUserId = "0199e7a0-0000-7000-8000-0000000000f2";
const memberId = "0199e7a0-0000-7000-8000-0000000000f3";

describe("recordAudit", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit");
    owner = { organizationId, userId: ownerUserId, source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const entriesFor = (entityId: string) =>
    db.forOrg(organizationId, (tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));

  it("stores who acted, from where, and the state before and after", async () => {
    const roleId = "0199e7a0-0000-7000-8000-000000000101";
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, owner, {
        action: "role.updated",
        entityType: "role",
        entityId: roleId,
        before: { name: "Sales", permissions: [{ permission: "leads:view", scope: "own" }] },
        after: { name: "Senior sales", permissions: [{ permission: "leads:view", scope: "all" }] },
      }),
    );
    expect(await entriesFor(roleId)).toEqual([
      expect.objectContaining({
        organizationId,
        actorUserId: ownerUserId,
        source: "web",
        impersonatedBy: null,
        action: "role.updated",
        entityType: "role",
        entityId: roleId,
        before: { name: "Sales", permissions: [{ permission: "leads:view", scope: "own" }] },
        after: { name: "Senior sales", permissions: [{ permission: "leads:view", scope: "all" }] },
      }),
    ]);
  });

  it("stores no state for a side that has none, and the system as an actor with no user", async () => {
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, systemActor(organizationId), {
        action: "staff.created",
        entityType: "member",
        entityId: memberId,
        after: { name: "Asha Owner" },
      }),
    );
    expect(await entriesFor(memberId)).toEqual([
      expect.objectContaining({ actorUserId: null, source: "job", before: null, after: { name: "Asha Owner" } }),
    ]);
  });

  it("is written in the change's transaction: a rollback leaves no entry", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000102";
    await expect(
      db.forOrg(organizationId, async (tx) => {
        await recordAudit(tx, owner, { action: "staff.removed", entityType: "member", entityId });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await entriesFor(entityId)).toEqual([]);
  });

  it("records support's impersonation with the admin's id, and refuses one that doesn't name the admin", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000103";
    const impersonated: Actor = { ...owner, source: "impersonation", impersonatedBy: supportUserId };
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, impersonated, { action: "staff.password-reset", entityType: "member", entityId }),
    );
    expect(await entriesFor(entityId)).toEqual([
      expect.objectContaining({ actorUserId: ownerUserId, source: "impersonation", impersonatedBy: supportUserId }),
    ]);
    const unnamed: Actor = { ...owner, source: "impersonation", impersonatedBy: null };
    await expect(
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, unnamed, { action: "staff.password-reset", entityType: "member", entityId }),
      ),
    ).rejects.toThrow(/audit_entry_impersonation/);
  });

  it("refuses a snapshot holding anything that looks like a secret, before writing", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000104";
    const attempt = (after: AuditSnapshot) =>
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, owner, { action: "staff.created", entityType: "member", entityId, after }),
      );
    await expect(attempt({ name: "Ravi", password: "temporary-pass-1" })).rejects.toThrow(
      /never hold secrets.*password/,
    );
    await expect(attempt({ account: { tokenHash: "x" } })).rejects.toThrow(/account\.tokenHash/);
    await expect(attempt({ codes: [{ backupSecret: "x" }] })).rejects.toThrow(/codes\.0\.backupSecret/);
    expect(await entriesFor(entityId)).toEqual([]);
  });

  it("refuses actions and record kinds that aren't well formed", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000105";
    const attempt = (action: string, entityType: string) =>
      db.forOrg(organizationId, (tx) => recordAudit(tx, owner, { action, entityType, entityId }));
    await expect(attempt("StaffRemoved", "member")).rejects.toThrow(/Audit actions look like/);
    await expect(attempt("staff.removed", "Member")).rejects.toThrow(/record kinds look like/);
  });

  it("can't record an actor of another organization here", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other audit");
    const outsider: Actor = { ...owner, organizationId: otherOrganizationId };
    await expect(
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, outsider, {
          action: "staff.removed",
          entityType: "member",
          entityId: "0199e7a0-0000-7000-8000-000000000106",
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps entries fixed: the api and worker can't change or delete them", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.$executeRaw`UPDATE audit_entry SET after = '{"name": "changed"}'::jsonb`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM audit_entry`)).rejects.toThrow(
      /permission denied/i,
    );
  });
});
```


`packages/domain/test/audit/list-audit-entries.test.ts`:
```ts
// listAuditEntries pages through an organization's log newest first, or one record's history, and nothing else.
import { listAuditEntriesInput } from "@travel-crm/contracts/audit";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listAuditEntries, recordAudit } from "../../src/audit/index.js";
import type { Actor } from "../../src/kernel/index.js";

const roleId = "0199e7a0-0000-7000-8000-000000000201";
const memberIds = [
  "0199e7a0-0000-7000-8000-000000000211",
  "0199e7a0-0000-7000-8000-000000000212",
  "0199e7a0-0000-7000-8000-000000000213",
];

describe("listAuditEntries", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit list");
    const owner: Actor = {
      organizationId,
      userId: "0199e7a0-0000-7000-8000-0000000002f1",
      source: "web",
      impersonatedBy: null,
    };
    // One transaction per entry, so each has its own time.
    for (const memberId of memberIds) {
      await db.forOrg(organizationId, (tx) =>
        recordAudit(tx, owner, { action: "staff.created", entityType: "member", entityId: memberId }),
      );
    }
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, owner, { action: "role.created", entityType: "role", entityId: roleId, after: { name: "Visa" } }),
    );
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const list = (input: unknown) =>
    db.forOrg(organizationId, (tx) => listAuditEntries(tx, listAuditEntriesInput.parse(input)));

  it("lists newest first, a page at a time, until there is no next page", async () => {
    const first = await list({ limit: 3 });
    expect(first.entries.map((entry) => entry.entityId)).toEqual([roleId, memberIds[2], memberIds[1]]);
    expect(first.nextCursor).toBe(first.entries[2]?.id);
    const second = await list({ limit: 3, before: first.nextCursor });
    expect(second.entries.map((entry) => entry.entityId)).toEqual([memberIds[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it("gives entries as the contract shows them", async () => {
    const [newest] = (await list({ limit: 1 })).entries;
    expect(newest?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newest?.occurredAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(newest).toMatchObject({
      actorUserId: "0199e7a0-0000-7000-8000-0000000002f1",
      source: "web",
      impersonatedBy: null,
      action: "role.created",
      entityType: "role",
      entityId: roleId,
      before: null,
      after: { name: "Visa" },
    });
  });

  it("lists one record's history", async () => {
    const history = await list({ entityType: "member", entityId: memberIds[1] });
    expect(history.entries.map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("shows another organization nothing", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other audit list");
    const page = await db.forOrg(otherOrganizationId, (tx) => listAuditEntries(tx, listAuditEntriesInput.parse({})));
    expect(page).toEqual({ entries: [], nextCursor: null });
  });
});
```


Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/audit`

Expected: FAIL, `Cannot find module '../../src/audit/index.js'` in both files.

- [ ] **Step 5: Add the table**

The model has the standard `organizationId` line but no `organization` relation: a relation would need a
back-relation in `organization.prisma`, which every track would edit. The Integration task adds the relations and
their foreign keys for all tracks at once.

`packages/db/prisma/schema/audit.prisma`:
```prisma
// The audit log (spec 9.5): who changed what, from where, and the state before and after, written in the same
// transaction as the change. Organization-owned and append-only: the api and worker add entries and never change or
// delete one (the migration revokes UPDATE and DELETE). No relation to Organization yet: plan 3's Integration task
// adds it with the other tracks' tables.

/// One recorded change, e.g. "staff.removed" of a member, by a user, from the web app.
model AuditEntry {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String   @id @default(uuid(7)) @db.Uuid
  occurredAt     DateTime @default(now()) @map("occurred_at") @db.Timestamptz(6)
  /// The person acting, or null for the system (a job no person started).
  actorUserId    String?  @map("actor_user_id") @db.Uuid
  /// "web", "api", "job" or "impersonation" (CHECK audit_entry_source_value).
  source         String
  /// The platform admin's user id when support was impersonating; set exactly when source is "impersonation".
  impersonatedBy String?  @map("impersonated_by") @db.Uuid
  /// "<entity>.<what happened>", e.g. "staff.removed" (CHECK audit_entry_action_format).
  action         String
  /// What changed, e.g. "member" or "role" (CHECK audit_entry_entity_type_format), and its id.
  entityType     String   @map("entity_type")
  entityId       String   @map("entity_id") @db.Uuid
  /// The fields that changed, as JSON objects; null when there is no state on that side (nothing before a creation).
  before         Json?
  after          Json?

  /// The log, newest first.
  @@index([organizationId, occurredAt(sort: Desc), id(sort: Desc)], map: "audit_entry_newest")
  /// One record's history.
  @@index([organizationId, entityType, entityId], map: "audit_entry_entity")
  @@map("audit_entry")
}
```


Generate the migration from the schema alone, without a database (other tracks run at the same time and share
nothing). `git archive HEAD` holds the schema as it was before this file:
```bash
cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && before=$(mktemp -d) && git archive HEAD packages/db/prisma/schema | tar -x -C "$before"
cd packages/db && mkdir -p prisma/migrations/20261015150000_audit_log
pnpm exec prisma migrate diff --from-schema "$before/packages/db/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015150000_audit_log/migration.sql
cat prisma/migrations/20261015150000_audit_log/migration.sql
```
Expected: exactly this SQL (after the "Loaded Prisma config" line, which goes to stderr):
```sql
-- CreateTable
CREATE TABLE "audit_entry" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "impersonated_by" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entry_newest" ON "audit_entry"("organization_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_entry_entity" ON "audit_entry"("organization_id", "entity_type", "entity_id");
```


Append the hand-written part to the end of that `migration.sql`, after one blank line:
```sql
-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('audit_entry');

-- Where the change came from (spec 9.5), and the admin's id exactly when support was impersonating.
ALTER TABLE "audit_entry"
  ADD CONSTRAINT audit_entry_source_value CHECK (source IN ('web', 'api', 'job', 'impersonation')),
  ADD CONSTRAINT audit_entry_impersonation CHECK ((source = 'impersonation') = (impersonated_by IS NOT NULL)),
  ADD CONSTRAINT audit_entry_action_format CHECK (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT audit_entry_entity_type_format CHECK (entity_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT audit_entry_before_object CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  ADD CONSTRAINT audit_entry_after_object CHECK (after IS NULL OR jsonb_typeof(after) = 'object');

-- The log is append-only: the api and worker may add entries, never change or delete one. Only the platform role's
-- purge of a whole organization removes them.
REVOKE UPDATE, DELETE ON TABLE "audit_entry" FROM app_runtime;
```


The isolation fixture, marked append-only so the isolation suite expects UPDATE and DELETE to be refused outright:

`packages/db/test/org-table-fixtures/audit.ts`:
```ts
// Isolation fixtures for the audit log.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  audit_entry: {
    create: (tx) =>
      tx.auditEntry.create({
        data: {
          source: "job",
          action: "isolation.checked",
          entityType: "isolation",
          entityId: "0199e7a0-0000-7000-8000-0000000000a1",
        },
      }),
    appendOnly: true,
  },
};
```


Regenerate the client: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db generate`. Expected: "Generated Prisma Client".

- [ ] **Step 6: Write the audit module**

`packages/domain/src/audit/record-audit.ts`:
```ts
// Writes one audit entry (spec 9.5) in the caller's transaction, so the entry exists exactly when the change does.
import type { OrgTx } from "@travel-crm/db";
import type { JsonValue } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";

/** The fields of a record that changed, as plain JSON. Curated by the caller: never the whole row. */
export type AuditSnapshot = Readonly<Record<string, JsonValue>>;

/** One change to record. Leave out `before` when the record didn't exist, and `after` when it no longer does. */
export interface AuditChange {
  /** "<entity>.<what happened>", e.g. "staff.removed". */
  action: string;
  /** The kind of record, e.g. "member" or "role". */
  entityType: string;
  entityId: string;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
}

/** Same pattern as event types; the audit_entry_action_format check holds it too. */
const ACTION_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
/** Keys that suggest a secret. The log is append-only and widely read, so a secret written there stays there. */
const SECRET_KEY_PATTERN = /password|secret|token|hash/i;

/**
 * Records who changed what, from where, in the same transaction as the change. The actor's source and impersonatedBy
 * say whether it came from the web app, the worker or support impersonating a member.
 */
export async function recordAudit(tx: OrgTx, actor: Actor, change: AuditChange): Promise<void> {
  if (!ACTION_PATTERN.test(change.action)) {
    throw new RangeError(`Audit actions look like "staff.removed", got ${JSON.stringify(change.action)}`);
  }
  if (!ENTITY_TYPE_PATTERN.test(change.entityType)) {
    throw new RangeError(`Audit record kinds look like "member", got ${JSON.stringify(change.entityType)}`);
  }
  for (const [side, snapshot] of [
    ["before", change.before],
    ["after", change.after],
  ] as const) {
    if (snapshot) assertNoSecrets(snapshot, side);
  }
  await tx.auditEntry.create({
    data: {
      // Named rather than defaulted: an actor of another organization then fails row-level security instead of
      // being recorded in this one.
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      source: actor.source,
      impersonatedBy: actor.impersonatedBy,
      action: change.action,
      entityType: change.entityType,
      entityId: change.entityId,
      // Left out rather than null: the column stays SQL NULL, "no state on this side".
      ...(change.before ? { before: change.before } : {}),
      ...(change.after ? { after: change.after } : {}),
    },
  });
}

function assertNoSecrets(value: JsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item: JsonValue, index) => {
      assertNoSecrets(item, `${path}.${String(index)}`);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Audit snapshots never hold secrets: remove ${childPath.slice(childPath.indexOf(".") + 1)}`);
    }
    assertNoSecrets(child, childPath);
  }
}
```


`packages/domain/src/audit/list-audit-entries.ts`:
```ts
// Reads an organization's audit log, newest first, a page at a time. The API checks audit:view before calling it.
import type { AuditEntry, AuditEntryPage, ListAuditEntriesInput } from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";

export async function listAuditEntries(tx: OrgTx, input: ListAuditEntriesInput): Promise<AuditEntryPage> {
  const rows = await tx.auditEntry.findMany({
    where: input.entityType && input.entityId ? { entityType: input.entityType, entityId: input.entityId } : {},
    // Entries written in one transaction share its time; the id (UUID v7) orders them and makes the order total.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
    // One more than the page, to know whether there is a next page.
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    entries: page.map((row): AuditEntry => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorUserId: row.actorUserId,
      source: sourceOf(row.source),
      impersonatedBy: row.impersonatedBy,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: snapshotOf(row.before),
      after: snapshotOf(row.after),
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The table's check allows only these four. */
function sourceOf(value: string): AuditEntry["source"] {
  if (value === "web" || value === "api" || value === "job" || value === "impersonation") return value;
  throw new Error(`Unknown audit source ${JSON.stringify(value)}`);
}

/** The table's checks keep snapshots to JSON objects or NULL. */
function snapshotOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}
```


`packages/domain/src/audit/index.ts`:
```ts
// Public API of the audit module: recording changes in the audit log and reading it (spec 9.5).
export { listAuditEntries } from "./list-audit-entries.js";
export { recordAudit, type AuditChange, type AuditSnapshot } from "./record-audit.js";
```


`packages/domain/src/audit/README.md`:
```markdown
# audit

The audit log (spec 9.5): who changed what in an organization, from where, and the state before and after.

## Public functions and values (`index.ts`)

- `recordAudit(tx, actor, { action, entityType, entityId, before?, after? })`: writes one entry in the change's own
  transaction, so the entry exists exactly when the change commits. The `actor` (an `Actor`, such as `MemberAccess`
  or `systemActor(organizationId)`) gives who acted, the source (`web`, `api`, `job`, `impersonation`) and the
  platform admin while support impersonates a member.
- `listAuditEntries(tx, input)`: the log newest first, a page at a time (`before` is the last id of the previous
  page), or one record's history (`entityType` with `entityId`). The API checks `audit:view` first.
- Types: `AuditChange`, `AuditSnapshot`. The contracts are in `@travel-crm/contracts/audit`.

## Events

None.

## Rules worth knowing

- Record in the same transaction as the change, and only when something changed.
- Snapshots are curated: the fields that changed, never a whole row. A key that looks like a secret (`password`,
  `secret`, `token`, `hash`) is refused before anything is written.
- `audit_entry` is append-only: `app_runtime` has no UPDATE or DELETE on it. An entry is recorded in the actor's own
  organization; an actor of another organization fails row-level security.
- `action` reads `<entity>.<what happened>` (`staff.removed`); `entityType` is a record kind in lower case
  (`member`, `role`, `organization`).
```


- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/audit`

Expected: 12 tests pass (8 in `record-audit.test.ts`, 4 in `list-audit-entries.test.ts`).

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 116 tests pass: the drift check in the global setup is quiet, and the isolation suite runs its 5 checks on
`audit_entry`, with UPDATE and DELETE refused as permission denied.

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`. While other tracks are checking on the same machine, run the same gates with
less Docker load: `pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`.

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 22, db 116, domain 133, eslint-config 65,
integrations 6.

```bash
cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && git add packages/contracts/src/audit packages/contracts/test/audit packages/db/prisma/migrations/20261015150000_audit_log packages/db/prisma/schema/audit.prisma packages/db/test/org-table-fixtures/audit.ts packages/domain/src/audit packages/domain/test/audit
git commit -m "feat(domain): add the append-only audit log, written in the change's transaction"
```

---

### Task A2: Identity's changes, and support's impersonation, are recorded

Every change identity makes now writes an audit entry in its own transaction: staff created, given another role,
reset and removed; roles created, changed and deleted; the two-factor requirement changed. A change that changes
nothing records nothing. Each entry is written last, after plan 2's locks and conditional writes, so a change that
is refused, or loses a race to another (`STAFF_CHANGED`, the losing Owner's `OWNER_ONLY`), rolls back with its entry.
Support's impersonation is recorded by a small Better Auth plugin whose after hooks run only
when `/admin/impersonate-user` or `/admin/stop-impersonating` succeeded; while the impersonation lasts, Task 0.2's
request checks already give the member's access `source: "impersonation"` and the admin's id, so every change made
meanwhile carries them.

**Files:**
- Create: `packages/domain/src/identity/auth/impersonation-audit.ts`, `docs/adr/0015-audit-log.md`
- Modify: `packages/domain/src/identity/staff-accounts.ts`, `packages/domain/src/identity/staff.ts`,
  `packages/domain/src/identity/roles.ts`, `packages/domain/src/identity/settings.ts`,
  `packages/domain/src/identity/auth/create-auth.ts`, `packages/domain/src/identity/identity.ts` (one line),
  `packages/domain/src/identity/README.md`, `docs/adr/0006-identity-and-sessions.md`
- Test: `packages/domain/test/identity/audit-trail.test.ts`, `apps/api/test/audit.test.ts`

**Interfaces:**
- Consumes: `recordAudit`, `AuditSnapshot` (Task A1); `systemActor`, `Actor` (Task 0.2); `MemberAccess`, which is an
  `Actor` (Task 0.2); plan 2's `changeMember`, `lockOwners` and `lockMember` (`staff-locks.ts`) and
  `createStaffAccount(database, hashPassword, account, checkRole?)`; Better Auth's `BetterAuthPlugin`, `APIError`,
  `createAuthMiddleware`.
- Produces:
  - `createAuth(database: IdentityDatabase, settings: AuthSettings)` (was `createAuth(client, settings)`; only
    `identity.ts` calls it).
  - `NewStaffAccount.actor?: Actor`: who adds the person; left out, the system is recorded (onboarding's first Owner).
    `createStaffAccount`'s parameters are otherwise unchanged.
  - `impersonationAudit(database: IdentityDatabase): BetterAuthPlugin` in `auth/impersonation-audit.ts`.
  - Audit actions: `staff.created`, `staff.role-changed`, `staff.password-reset`, `staff.removed`, `role.created`,
    `role.updated`, `role.deleted`, `settings.two-factor-requirement-changed`, `support.impersonation-started`,
    `support.impersonation-stopped` (record kinds `member`, `role`, `organization`).

- [ ] **Step 1: Write the failing domain test**

`packages/domain/test/identity/audit-trail.test.ts`:
```ts
// Identity's changes leave an audit trail (spec 9.5): who added, changed or removed staff and roles, and changed the
// two-factor setting, recorded in the same transaction, and support's impersonation with the admin's name on it.
// A refused change, including one that lost a race to another, records nothing.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

describe("identity's audit trail", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  async function accessOf(
    userId: string,
    session?: { impersonatedBy: string | null },
    organizationId = agency.organizationId,
  ): Promise<MemberAccess> {
    const access = await test.identity.resolveAccess(userId, organizationId, session);
    if (!access) throw new Error("no access");
    return access;
  }

  /** Adds a member of the agency with the given role, as the Owner. */
  async function addStaff(username: string, roleKey: string) {
    return test.identity.staff.create(owner, {
      name: username,
      username,
      roleKey,
      temporaryPassword: "temporary-pass-1",
    });
  }

  /**
   * Waits until a statement containing `statement` is waiting for a lock. Test files share one Postgres and run in
   * parallel, so the statement is matched: another file's lock wait must not count.
   */
  async function waitUntilBlockedAt(statement: string): Promise<void> {
    for (let tries = 0; tries < 60; tries++) {
      const [waiting] = await test.database.client.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database() AND query LIKE ${`%${statement}%`}`;
      if ((waiting?.n ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Nothing waited for a lock at: ${statement}`);
  }

  /** The organization's entries about one record, oldest first. */
  async function entriesAbout(entityId: string) {
    return test.database.forOrg(agency.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    );
  }

  /** Better Auth's handler, as the api serves it at /api/auth. */
  function post(path: string, cookie: string, body: unknown): Promise<Response> {
    return test.identity.auth.handler(
      new Request(`http://localhost/api/auth${path}`, {
        method: "POST",
        headers: { cookie, origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  /** The cookies a browser would hold after these responses: the later value wins, an empty one deletes. */
  function cookiesAfter(cookie: string, ...responses: Response[]): string {
    const jar = new Map(cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair]));
    for (const setCookie of responses.flatMap((response) => response.headers.getSetCookie())) {
      const [pair = ""] = setCookie.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      if (pair.endsWith("=") || /max-age=0/i.test(setCookie)) jar.delete(name);
      else jar.set(name, pair);
    }
    return [...jar.values()].join("; ");
  }

  /** A platform admin (user role "admin", no membership), signed in; returns their id and session cookies. */
  async function signedInPlatformAdmin(): Promise<{ userId: string; cookie: string }> {
    const email = `support-${crypto.randomUUID()}@example.test`;
    const user = await test.database.client.user.create({ data: { name: "Support", email, role: "admin" } });
    const password = await (await test.identity.auth.$context).password.hash("support-password-1");
    await test.database.client.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password },
    });
    const signIn = await post("/sign-in/email", "", { email, password: "support-password-1" });
    return { userId: user.id, cookie: cookiesAfter("", signIn) };
  }

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await accessOf(agency.ownerUserId);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("records the first Owner as added by the system at onboarding", async () => {
    expect(await entriesAbout(agency.ownerMemberId)).toEqual([
      expect.objectContaining({
        action: "staff.created",
        entityType: "member",
        actorUserId: null,
        source: "job",
        before: null,
        after: { name: "Asha Owner", username: null, role: "org-owner", hasEmail: true },
      }),
    ]);
  });

  it("records staff added, given another role, reset and removed, by whom, and never their email", async () => {
    const email = `ravi-${agency.code.toLowerCase()}@example.test`;
    const ravi = await test.identity.staff.create(owner, {
      name: "Ravi Kumar",
      email,
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.identity.staff.updateRole(owner, { memberId: ravi.memberId, roleKey: "operations" });
    // Giving someone the role they already have changes nothing, so it records nothing.
    await test.identity.staff.updateRole(owner, { memberId: ravi.memberId, roleKey: "operations" });
    await test.identity.staff.resetPassword(owner, { memberId: ravi.memberId, temporaryPassword: "temporary-pass-2" });
    await test.identity.staff.remove(owner, { memberId: ravi.memberId });

    const entries = await entriesAbout(ravi.memberId);
    expect(entries.map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["staff.created", null, { name: "Ravi Kumar", username: "Ravi", role: "sales", hasEmail: true }],
      ["staff.role-changed", { role: "sales" }, { role: "operations" }],
      ["staff.password-reset", null, null],
      ["staff.removed", { name: "Ravi Kumar", role: "operations" }, null],
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ actorUserId: agency.ownerUserId, source: "web", impersonatedBy: null });
    }
    expect(JSON.stringify(entries)).not.toContain(email);
  });

  it("records roles created, changed and deleted, but not an edit that changes nothing", async () => {
    const created = await test.identity.roles.create(owner, {
      name: "Visa desk",
      permissions: [{ permission: "bookings:view", scope: "all" }],
    });
    const role = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findFirstOrThrow({ where: { key: created.key } }),
    );
    await test.identity.roles.update(owner, { key: created.key, name: "Visa team" });
    await test.identity.roles.update(owner, { key: created.key, name: "Visa team" });
    await test.identity.roles.delete(owner, { key: created.key });

    const grants = [{ permission: "bookings:view", scope: "all" }];
    expect((await entriesAbout(role.id)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["role.created", null, { name: "Visa desk", permissions: grants }],
      ["role.updated", { name: "Visa desk", permissions: grants }, { name: "Visa team", permissions: grants }],
      ["role.deleted", { key: created.key, name: "Visa team", permissions: grants }, null],
    ]);
  });

  it("records the two-factor requirement changing, and neither a request that changes nothing nor a refused one", async () => {
    // Switching it on needs two-factor on the person doing it, and switching it off needs an Owner (spec 6.2). A second
    // Owner who uses two-factor does both, so the first Owner stays as the other tests need them.
    const coOwner = await addStaff("coowner", "org-owner");
    await test.database.client.user.update({ where: { id: coOwner.userId }, data: { twoFactorEnabled: true } });
    const coOwnerAccess = await accessOf(coOwner.userId);
    const admin = await accessOf((await addStaff("settings-admin", "org-admin")).userId);
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: false });
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: true });
    await expect(test.identity.settings.setTwoFactorRequirement(admin, { required: false })).rejects.toMatchObject({
      reason: "OWNER_ONLY",
    });
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: false });

    const entries = await entriesAbout(agency.organizationId);
    expect(entries.map((entry) => [entry.action, entry.actorUserId, entry.before, entry.after])).toEqual([
      [
        "settings.two-factor-requirement-changed",
        coOwner.userId,
        { requireTwoFactor: false },
        { requireTwoFactor: true },
      ],
      [
        "settings.two-factor-requirement-changed",
        coOwner.userId,
        { requireTwoFactor: true },
        { requireTwoFactor: false },
      ],
    ]);
    expect(entries.every((entry) => entry.entityType === "organization")).toBe(true);
  });

  it("records nothing when a change is refused", async () => {
    const admin = await test.identity.staff.create(owner, {
      name: "Admin One",
      username: "admin1",
      roleKey: "org-admin",
      temporaryPassword: "temporary-pass-3",
    });
    const adminAccess = await accessOf(admin.userId);
    await expect(
      test.identity.staff.resetPassword(adminAccess, {
        memberId: agency.ownerMemberId,
        temporaryPassword: "temporary-pass-4",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await entriesAbout(agency.ownerMemberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("records nothing for a change that lost a race to another (STAFF_CHANGED)", async () => {
    const admin = await accessOf((await addStaff("racing-admin", "org-admin")).userId);
    const target = await addStaff("raced", "sales");
    let change: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Holding the member row makes the Admin's write wait after it has read the old role; then someone moves them.
      await tx.$queryRaw`SELECT id FROM member WHERE id = ${target.memberId}::uuid FOR UPDATE`;
      change = test.identity.staff.updateRole(admin, { memberId: target.memberId, roleKey: "operations" });
      change.catch(() => undefined);
      await waitUntilBlockedAt('UPDATE "public"."member" SET');
      await tx.member.update({ where: { id: target.memberId }, data: { role: "accounts" } });
    });
    await expect(change).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    expect((await entriesAbout(target.memberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("records one removal when two Owners remove each other at the same moment", async () => {
    const own = await createTestAgency(test.identity, platform);
    const first = await accessOf(own.ownerUserId, undefined, own.organizationId);
    const created = await test.identity.staff.create(first, {
      name: "Second Owner",
      username: "owner2",
      roleKey: "org-owner",
      temporaryPassword: "temporary-pass-9",
    });
    const second = await accessOf(created.userId, undefined, own.organizationId);
    const [firstRemoves] = await Promise.allSettled([
      test.identity.staff.remove(first, { memberId: second.memberId }),
      test.identity.staff.remove(second, { memberId: first.memberId }),
    ]);
    // The loser is refused with OWNER_ONLY once the winner commits (staff-removal.test.ts), and records nothing.
    const [winner, loser] = firstRemoves.status === "fulfilled" ? [first, second] : [second, first];
    const removals = await test.database.forOrg(own.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "staff.removed" } }),
    );
    expect(removals).toEqual([expect.objectContaining({ actorUserId: winner.userId, entityId: loser.memberId })]);
  });

  it("records what support does as a member as impersonation, naming the admin", async () => {
    const supportUserId = "0199e7a0-0000-7000-8000-0000000003a1";
    const impersonated = await accessOf(agency.ownerUserId, { impersonatedBy: supportUserId });
    const created = await test.identity.roles.create(impersonated, { name: "Support made", permissions: [] });
    const role = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findFirstOrThrow({ where: { key: created.key } }),
    );
    expect(await entriesAbout(role.id)).toEqual([
      expect.objectContaining({
        action: "role.created",
        actorUserId: agency.ownerUserId,
        source: "impersonation",
        impersonatedBy: supportUserId,
      }),
    ]);
  });

  it("records support starting and stopping an impersonation, in the member's organization", async () => {
    const support = await signedInPlatformAdmin();
    const started = await post("/admin/impersonate-user", support.cookie, { userId: agency.ownerUserId });
    expect(started.status).toBe(200);
    const stopped = await post("/admin/stop-impersonating", cookiesAfter(support.cookie, started), {});
    expect(stopped.status).toBe(200);

    const entries = (await entriesAbout(agency.ownerMemberId)).filter((entry) => entry.action.startsWith("support."));
    expect(entries.map((entry) => entry.action)).toEqual([
      "support.impersonation-started",
      "support.impersonation-stopped",
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        entityType: "member",
        actorUserId: support.userId,
        source: "impersonation",
        impersonatedBy: support.userId,
        after: { userId: agency.ownerUserId },
      });
    }
  });

  it("records no impersonation that was refused", async () => {
    const memberCookie = cookiesAfter(
      "",
      await post("/sign-in/email", "", { email: agency.ownerEmail, password: agency.ownerPassword }),
    );
    const other = await createTestAgency(test.identity, platform);
    const refused = await post("/admin/impersonate-user", memberCookie, { userId: other.ownerUserId });
    expect(refused.status).toBe(403);
    const entries = await test.database.forOrg(other.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { action: { startsWith: "support." } } }),
    );
    expect(entries).toEqual([]);
  });
});
```


- [ ] **Step 2: Write the failing end-to-end test**

The test reads entries with the platform client, because the api has no audit router until the viewer arrives.

`apps/api/test/audit.test.ts`:
```ts
// The audit log through the HTTP app (spec 9.5): changes made in the web app are recorded with their source, and
// support's impersonation is recorded, with every change made during it carrying the admin's id (ADR 0006).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, createPlatformAdmin, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, refusalOf } from "./support/trpc.js";

describe("the audit log", () => {
  let server: TestServer;
  let agency: TestAgency;

  /** The organization's entries, oldest first. The platform client reads them; the api has no audit router yet. */
  async function entriesOf(organizationId: string, where: { entityId?: string; action?: string } = {}) {
    return server.platform.auditEntry.findMany({
      where: { organizationId, ...where },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
  }

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("records an Owner removing staff in the web app", async () => {
    const leaver = await addStaff(server, agency, { username: "leaver", roleKey: "sales" });
    await dataOf(
      await mutate(server, "staff.remove", { memberId: leaver.memberId }, await signedInOwner(server, agency)),
    );

    expect(await entriesOf(agency.organizationId, { entityId: leaver.memberId, action: "staff.removed" })).toEqual([
      expect.objectContaining({
        actorUserId: agency.owner.userId,
        source: "web",
        impersonatedBy: null,
        entityType: "member",
        before: { name: "leaver", role: "sales" },
      }),
    ]);
  });

  it("records nothing when a change is refused", async () => {
    const sales = await addStaff(server, agency, { username: "seller", roleKey: "sales" });
    const target = await addStaff(server, agency, { username: "target", roleKey: "sales" });
    const attempt = await mutate(
      server,
      "staff.remove",
      { memberId: target.memberId },
      await signedInStaff(server, agency, sales),
    );
    expect(await refusalOf(attempt)).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(await entriesOf(agency.organizationId, { entityId: target.memberId, action: "staff.removed" })).toEqual([]);
  });

  it("records support impersonating the Owner, and what they change meanwhile, with the admin's id", async () => {
    const admin = await createPlatformAdmin(server);
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    const started = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(started.status).toBe(200);
    await dataOf(await mutate(server, "roles.update", { key: "sales", name: "Sales team" }, jar));
    const stopped = jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
    expect(stopped.status).toBe(200);

    const [roleChange] = await entriesOf(agency.organizationId, { action: "role.updated" });
    expect(roleChange).toMatchObject({
      actorUserId: agency.owner.userId,
      source: "impersonation",
      impersonatedBy: admin.userId,
      before: { name: "Sales" },
      after: { name: "Sales team" },
    });
    const impersonation = await entriesOf(agency.organizationId, { entityId: agency.owner.memberId });
    expect(impersonation.filter((entry) => entry.action.startsWith("support."))).toEqual([
      expect.objectContaining({
        action: "support.impersonation-started",
        actorUserId: admin.userId,
        source: "impersonation",
        impersonatedBy: admin.userId,
      }),
      expect.objectContaining({ action: "support.impersonation-stopped", actorUserId: admin.userId }),
    ]);
  });
});
```


- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/identity/audit-trail.test.ts`

Expected: 9 of 10 fail (no entries are written yet). "records no impersonation that was refused" passes already: it
guards against recording a refused call.

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/audit.test.ts`

Expected: 2 of 3 fail. "records nothing when a change is refused" passes already, for the same reason.

- [ ] **Step 4: Record a new member in the transaction that creates them**

`createStaffAccount` runs its own transaction, so it records `staff.created` itself. In
`packages/domain/src/identity/staff-accounts.ts`, replace the opening comment and imports:
```ts
// Creates one staff member's sign-in records in a single transaction: user, password account and membership, after
// holding and checking their role in that same transaction. Better Auth hashes the password, but its sign-up endpoint
// is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
```
with:
```ts
// Creates one staff member's sign-in records in a single transaction: user, password account and membership, after
// holding and checking their role in that same transaction, and the audit entry that records it. Better Auth hashes
// the password, but its sign-up endpoint is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { DomainError, systemActor, type Actor } from "../kernel/index.js";
```
In `NewStaffAccount`, after the `mustChangePassword` field, add:
```ts
  /** Who is adding them, for the audit log. Onboarding leaves it out: the system then adds the first Owner. */
  actor?: Actor | undefined;
```
And replace:
```ts
      const member = await tx.member.create({
        data: { userId: user.id, organizationId: account.organizationId, role: role.key },
      });
      return { userId: user.id, memberId: member.id };
```
with:
```ts
      const member = await tx.member.create({
        data: { userId: user.id, organizationId: account.organizationId, role: role.key },
      });
      // Whether they have an email, not the address: the log outlives the account, which releases it (ADR 0007).
      await recordAudit(tx, account.actor ?? systemActor(account.organizationId), {
        action: "staff.created",
        entityType: "member",
        entityId: member.id,
        after: {
          name: account.name,
          username: account.username ?? null,
          role: role.key,
          hasEmail: account.email !== undefined,
        },
      });
      return { userId: user.id, memberId: member.id };
```

- [ ] **Step 5: Record staff changes**

In `packages/domain/src/identity/staff.ts`, add the import after the `@travel-crm/db/identity` one:
```ts
import { recordAudit } from "../audit/index.js";
```
In `createStaff`, add the actor to the account it passes to `createStaffAccount`, after `mustChangePassword: true,`:
```ts
      actor,
```
In `updateStaffRole`, replace:
```ts
    const newRole = await findRoleToGive(tx, input.roleKey);
    assertMayHandleRole(actor, newRole);
    await changeMember(tx, target, { role: newRole.key });
  });
```
with:
```ts
    const newRole = await findRoleToGive(tx, input.roleKey);
    assertMayHandleRole(actor, newRole);
    // Written even when the role is the same: the conditional write is what notices a change made meanwhile.
    await changeMember(tx, target, { role: newRole.key });
    if (newRole.key !== target.role) {
      await recordAudit(tx, actor, {
        action: "staff.role-changed",
        entityType: "member",
        entityId: target.id,
        before: { role: target.role },
        after: { role: newRole.key },
      });
    }
  });
```
In `resetStaffPassword`, after `await tx.session.deleteMany({ where: { userId: target.userId } });`, add:
```ts
    await recordAudit(tx, actor, { action: "staff.password-reset", entityType: "member", entityId: target.id });
```
In `removeStaff`, after `await tx.session.deleteMany({ where: { userId: user.id } });` (which follows the password
wipe), add:
```ts
    await recordAudit(tx, actor, {
      action: "staff.removed",
      entityType: "member",
      entityId: target.id,
      before: { name: user.name, role: target.role },
    });
```

- [ ] **Step 6: Record role changes**

In `packages/domain/src/identity/roles.ts`, add the import after the `@travel-crm/db/identity` one:
```ts
import { recordAudit, type AuditSnapshot } from "../audit/index.js";
```
In `createRole`, after `await replacePermissions(tx, role.id, permissions);`, add:
```ts
      await recordAudit(tx, actor, {
        action: "role.created",
        entityType: "role",
        entityId: role.id,
        after: roleSnapshot(role.name, permissions),
      });
```
In `updateRole`, before `const memberCounts = await countMembersByRole(tx, actor.organizationId);`, add:
```ts
      const before = roleSnapshot(role.name, role.permissions);
      const after = roleSnapshot(name, permissions);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await recordAudit(tx, actor, { action: "role.updated", entityType: "role", entityId: role.id, before, after });
      }
```
In `deleteRole`, after `await tx.role.update({ where: { id: role.id }, data: softDeleted(actor.userId) });`, add:
```ts
    await recordAudit(tx, actor, {
      action: "role.deleted",
      entityType: "role",
      entityId: role.id,
      before: { key: role.key, ...roleSnapshot(role.name, role.permissions) },
    });
```
And before `function summarise(`, add:
```ts
/** What the audit log keeps of a role: its name and what it allows, in the catalog's order. */
function roleSnapshot(name: string, permissions: PermissionSet): AuditSnapshot {
  return {
    name,
    permissions: permissions.toGrants().map((grant) => ({ permission: grant.permission, scope: grant.scope })),
  };
}

```
`toGrants()` lists grants in the catalog's order, so comparing the two snapshots' JSON finds a real change.

- [ ] **Step 7: Record the two-factor requirement changing**

`packages/domain/src/identity/settings.ts`:
```ts
// The organization setting the identity module owns: whether every member must use two-factor sign-in (spec 6.2).
// The API checks settings:manage before calling setTwoFactorRequirement.
import type { SecuritySettings, SetTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";

export async function setTwoFactorRequirement(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: SetTwoFactorRequirementInput,
): Promise<SecuritySettings> {
  // Spec 6.2: an Owner can require two-factor. Anyone with settings:manage may tighten sign-in; only an Owner loosens it.
  if (!input.required && !actor.role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner can stop requiring two-factor sign-in");
  }
  // Otherwise the person turning it on would be shut out of the app until they set it up.
  if (input.required && !actor.twoFactorEnabled) {
    throw new DomainError("FORBIDDEN", "ENABLE_TWO_FACTOR_FIRST", "Turn on two-factor sign-in for yourself first");
  }
  const organization = await database.forOrg(actor.organizationId, async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const after = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { requireTwoFactor: input.required },
    });
    if (before.requireTwoFactor !== after.requireTwoFactor) {
      await recordAudit(tx, actor, {
        action: "settings.two-factor-requirement-changed",
        entityType: "organization",
        entityId: actor.organizationId,
        before: { requireTwoFactor: before.requireTwoFactor },
        after: { requireTwoFactor: after.requireTwoFactor },
      });
    }
    return after;
  });
  return { requireTwoFactor: organization.requireTwoFactor };
}
```


The value before is read inside the transaction rather than taken from the actor's access, so two admins changing it
at once each record what they really changed.

- [ ] **Step 8: Record support's impersonation**

`packages/domain/src/identity/auth/impersonation-audit.ts`:
```ts
// Records support's impersonation (spec 6.1) in the impersonated member's organization's audit log, after Better
// Auth's /admin/impersonate-user and /admin/stop-impersonating succeed. While it lasts, everything the admin does as
// the member is recorded with source "impersonation" by the request checks themselves.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { recordAudit } from "../../audit/index.js";

const STARTED = "/admin/impersonate-user";
const STOPPED = "/admin/stop-impersonating";

/** The member being impersonated and the platform admin doing it. */
interface Impersonation {
  userId: string;
  adminUserId: string;
}

/** Reads userId and impersonatedBy from a Better Auth session row; null when it isn't an impersonation session. */
function impersonationOf(session: unknown): Impersonation | null {
  if (typeof session !== "object" || session === null) return null;
  const { userId, impersonatedBy } = session as { userId?: unknown; impersonatedBy?: unknown };
  return typeof userId === "string" && typeof impersonatedBy === "string"
    ? { userId, adminUserId: impersonatedBy }
    : null;
}

async function recordImpersonation(
  database: IdentityDatabase,
  action: "support.impersonation-started" | "support.impersonation-stopped",
  { userId, adminUserId }: Impersonation,
): Promise<void> {
  // Platform staff may impersonate a user with no membership; no organization's log is theirs to write to.
  const member = await database.client.member.findUnique({ where: { userId } });
  if (!member) return;
  await database.forOrg(member.organizationId, (tx) =>
    recordAudit(
      tx,
      // The admin acts here in their own name, so they are both the actor and the impersonator.
      {
        organizationId: member.organizationId,
        userId: adminUserId,
        source: "impersonation",
        impersonatedBy: adminUserId,
      },
      { action, entityType: "member", entityId: member.id, after: { userId } },
    ),
  );
}

/**
 * A Better Auth plugin with after hooks only. A refused call returns an APIError and is not recorded. Starting is read
 * from the new session the endpoint returns; stopping from the impersonation session the endpoint read before
 * deleting it (Better Auth keeps it on the request's context).
 */
export function impersonationAudit(database: IdentityDatabase): BetterAuthPlugin {
  return {
    id: "impersonation-audit",
    hooks: {
      after: [
        {
          matcher: (context) => context.path === STARTED || context.path === STOPPED,
          handler: createAuthMiddleware(async (ctx) => {
            const returned: unknown = ctx.context.returned;
            if (returned instanceof APIError || typeof returned !== "object" || returned === null) return;
            if (ctx.path === STARTED) {
              const impersonation = impersonationOf((returned as { session?: unknown }).session);
              if (impersonation) await recordImpersonation(database, "support.impersonation-started", impersonation);
              return;
            }
            const impersonation = impersonationOf(ctx.context.session?.session);
            if (impersonation) await recordImpersonation(database, "support.impersonation-stopped", impersonation);
          }),
        },
      ],
    },
  };
}
```


Two facts this relies on, both checked against Better Auth 1.7.7's source and proven by the tests: an after hook sees
the endpoint's result in `ctx.context.returned`, an `APIError` when the call was refused; and
`/admin/stop-impersonating` reads the impersonation session with `getSessionFromCtx`, which leaves it on
`ctx.context.session` after the endpoint deletes the row.

In `packages/domain/src/identity/auth/create-auth.ts`, replace the opening comment's second line and the first import:
```ts
// database sessions with a 5-minute cookie cache, two-factor, platform admins and impersonation. No self sign-up.
import type { IdentityClient } from "@travel-crm/db/identity";
```
with:
```ts
// database sessions with a 5-minute cookie cache, two-factor, platform admins and impersonation, which the audit log
// records. No self sign-up.
import type { IdentityClient, IdentityDatabase } from "@travel-crm/db/identity";
```
After `import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";`, add:
```ts
import { impersonationAudit } from "./impersonation-audit.js";
```
Replace:
```ts
export function createAuth(client: IdentityClient, settings: AuthSettings) {
  return betterAuth({
```
with:
```ts
export function createAuth(database: IdentityDatabase, settings: AuthSettings) {
  const client = database.client;
  return betterAuth({
```
And in `plugins`, after the `admin(...)` line, add:
```ts
      // Writes "support.impersonation-started" and "-stopped" to the member's organization's audit log.
      impersonationAudit(database),
```
In `packages/domain/src/identity/identity.ts`, replace:
```ts
  const auth = createAuth(database.client, options.auth);
```
with:
```ts
  const auth = createAuth(database, options.auth);
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/identity/audit-trail.test.ts`

Expected: 10 tests pass, including the two races: plan 2's `STAFF_CHANGED` refusal and the losing Owner's
`OWNER_ONLY` each leave no entry.

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/audit.test.ts`

Expected: 3 tests pass.

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: 143 tests pass; the identity tests from plan 2 (staff races, removal, settings) are unchanged and still green.

- [ ] **Step 10: Record the decisions**

In `packages/domain/src/identity/README.md`, replace the Events section:
```markdown
## Events

None yet.
```
with:
```markdown
## Events

No domain events yet. Every change below is written to the audit log in the change's own transaction (ADR 0015),
with the acting member, or the system for onboarding:

| Action                                    | Record         | Before                 | After                               |
| ----------------------------------------- | -------------- | ---------------------- | ----------------------------------- |
| `staff.created`                           | `member`       |                        | name, username, role, whether email |
| `staff.role-changed`                      | `member`       | role                   | role                                |
| `staff.password-reset`                    | `member`       |                        |                                     |
| `staff.removed`                           | `member`       | name, role             |                                     |
| `role.created`                            | `role`         |                        | name, permissions                   |
| `role.updated`                            | `role`         | name, permissions      | name, permissions                   |
| `role.deleted`                            | `role`         | key, name, permissions |                                     |
| `settings.two-factor-requirement-changed` | `organization` | requireTwoFactor       | requireTwoFactor                    |
| `support.impersonation-started`           | `member`       |                        | the impersonated user's id          |
| `support.impersonation-stopped`           | `member`       |                        | the impersonated user's id          |

A change that changes nothing (the same role again, the same setting) records nothing. Support's two entries name
the platform admin as both the actor and `impersonatedBy`; they are written by a Better Auth plugin
(`auth/impersonation-audit.ts`) after the call succeeds.
```

In `docs/adr/0006-identity-and-sessions.md`, replace:
```markdown
  user for up to an hour. Impersonation has no durable record until the audit log arrives (plans 3 and 4); today the
  only marker is the session row.
```
with:
```markdown
  user for up to an hour. Starting and stopping it is recorded in that member's organization's audit log, and
  everything done meanwhile is recorded with `source: "impersonation"` and the admin's id (ADR 0015).
```

`docs/adr/0015-audit-log.md`:
```markdown
# 0015: The audit log

Date: 2026-10-15 · Status: accepted · Implements spec section 9.5, and closes the impersonation gap in ADR 0006

## Decision

- **One `audit_entry` table**, organization-owned under row-level security, with who acted (`actor_user_id`, null for
  the system), the source (`web`, `api`, `job`, `impersonation`), the platform admin while support impersonates
  (`impersonated_by`, set exactly when the source is `impersonation`), the action (`staff.removed`), the record
  (`entity_type`, `entity_id`) and JSON objects of the fields before and after. Checks hold each of these.
- **Append-only by grant.** `app_runtime` has no UPDATE or DELETE on the table, so neither the ORM, nested writes nor
  raw SQL can change or remove an entry. The isolation suite knows it as append-only.
- **Same transaction.** `recordAudit(tx, actor, change)` (`@travel-crm/domain/audit`) writes in the change's own
  transaction: the entry exists exactly when the change commits. It names the actor's organization explicitly, so an
  actor of another organization fails row-level security rather than being recorded here.
- **The actor says where a change came from.** `MemberAccess` is an `Actor` (ADR 0009); the request checks pass the
  session's `impersonatedBy`, so anything support does while impersonating a member is recorded with
  `source: "impersonation"` and the admin's id. Onboarding and the worker act as `systemActor(organizationId)`.
- **What identity records:** staff created, given another role, reset and removed; roles created, changed and
  deleted; the two-factor requirement changed; support's impersonation started and stopped (a Better Auth plugin's
  after hooks, only when the call succeeded, in the impersonated member's organization, the admin being both actor and
  impersonator). Changes that change nothing record nothing, and refused changes record nothing either: the entry is
  written last, after the locks and conditional writes of ADR 0007, so a change that loses a race (`STAFF_CHANGED`,
  `OWNER_ONLY` for the losing Owner) rolls back with its entry. The full list is in the identity module's README.
- **Snapshots are curated.** Callers pass the fields that changed, never a whole row, and `recordAudit` refuses any
  key that looks like a secret (`password`, `secret`, `token`, `hash`). A new member's entry says whether they have an
  email, not the address.
- **Reading:** `listAuditEntries(tx, input)`, newest first with a cursor, or one record's history. The API checks
  `audit:view` (Owner and Admin hold it); the router comes with the audit log viewer (plan 5).

## Context

- **Why grants, not a trigger.** A trigger that refuses updates can be dropped or bypassed by its owner; a missing
  grant can't be used by the runtime role at all, and the isolation suite proves it on every run.
- **Why no email address in staff entries.** The log is append-only and outlives the account: a removed person's
  email is released for reuse (ADR 0007), and a DPDP erasure request should not have to edit the audit log. The member
  id leads to the person while their account exists.
- **Why record impersonation in an after hook.** Only Better Auth knows whether the call succeeded; the hook reads the
  new session's `impersonatedBy` on start, and the session being ended on stop. If writing the entry fails, the call
  fails with an error after Better Auth has created the impersonation session; support sees the error, and that
  session expires within the hour.
- **Why the admin is the actor of start and stop.** They act in their own name there; during the impersonation the
  member is the actor and the admin is `impersonated_by`, which is what an organization's staff need to tell apart.

## Consequences

- Entries are kept as long as the organization. Plan 4's purge of a whole organization removes them with it, as the
  platform role; nothing else can.
- Every module that changes data calls `recordAudit` in its own transactions. A change no person made (a scheduled job)
  is recorded with `source: "job"` and no user.
- The `api` source is reserved for API clients, which arrive later.
```


Don't add it to `docs/adr/README.md`: the Integration task adds every track's ADRs to the index.

- [ ] **Step 11: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check` (or the lower-load form in Task A1's Step 8).

Expected: green. Test counts: api-server 75, api 5, brand 3, contracts 22, db 116, domain 143, eslint-config 65,
integrations 6.

```bash
cd /Users/ak/personal/travel-crm-03-audit && source ~/.nvm/nvm.sh && nvm use >/dev/null && git add apps/api/test/audit.test.ts docs/adr/0006-identity-and-sessions.md docs/adr/0015-audit-log.md packages/domain/src/identity/README.md packages/domain/src/identity/auth/create-auth.ts packages/domain/src/identity/auth/impersonation-audit.ts packages/domain/src/identity/identity.ts packages/domain/src/identity/roles.ts packages/domain/src/identity/settings.ts packages/domain/src/identity/staff-accounts.ts packages/domain/src/identity/staff.ts packages/domain/test/identity/audit-trail.test.ts
git commit -m "feat(domain): record staff, role and settings changes and support's impersonation in the audit log"
```

---

## Track K: Money, GST, time and phone numbers

- **Delivers** the shared kernel's value types (spec 9.6): `Money` in integer paise with explicit rounding and the Indian number format; a `TaxEngine` interface with India GST (CGST + SGST/UTGST or IGST by place of supply, a rate per line, SAC codes, GST states and GSTIN checks); times in the organization's zone, calendar dates, and E.164 phone numbers. No database.
- **Branch** `foundation/03-kernel`, in the worktree `/Users/ak/personal/travel-crm-03-kernel`.
- **Depends on** Task 0 only. Owns `packages/domain/src/kernel/` (new files and `index.ts`), `packages/contracts/src/kernel/`, their tests, and `docs/adr/0016-money-tax-and-time.md`. Nothing else in this track touches a shared file.

Where a rule has to hold in a form and in the domain alike (GST state codes, GSTINs, time zone names, calendar dates, phone numbers, typed rupee amounts), it is written once in `@travel-crm/contracts/kernel` and the domain kernel imports or re-exports it: `contracts` is a leaf that `domain` already depends on, never the other way round.

Test counts at the track's start (Task 0's): api-server 72, api 5, brand 3, contracts 18, db 111, domain 121, eslint-config 65, integrations 6.

---

### Task K1: Money in integer paise, its rounding, and the Indian number format

Money is never a float (spec 9.6). This task gives every module one `Money` type, integer paise plus a currency, with all arithmetic and rounding in the kernel, and shows amounts the Indian way: `₹12,50,000.00`.

**Files:**
- Create: `packages/contracts/src/kernel/money.ts`, `packages/contracts/src/kernel/index.ts`
- Create: `packages/domain/src/kernel/money.ts`, `packages/domain/src/kernel/money-rounding.ts`, `packages/domain/src/kernel/indian-format.ts`, `packages/domain/src/kernel/README.md`, `docs/adr/0016-money-tax-and-time.md`
- Modify: `packages/domain/src/kernel/index.ts`
- Test: `packages/domain/test/kernel/money.test.ts`, `packages/domain/test/kernel/indian-format.test.ts`, `packages/contracts/test/kernel/money.test.ts`

**Interfaces:**
- Consumes: Task 0's kernel (`Actor`, `systemActor`, `DomainError`); `zod` in `@travel-crm/contracts`.
- Produces, from `@travel-crm/contracts/kernel`:
  - `currencyCodes` (`["INR"]`), `type CurrencyCode = "INR"`;
  - `moneyField` (strict `{ amountPaise: safe integer, currency: "INR" }`), `type MoneyField`;
  - `paiseFromRupeesText(text: string): number | null` and the `rupeesText` field (typed amount → paise).
- Produces, from `@travel-crm/domain/kernel`:
  - `interface Money { readonly amountPaise: number; readonly currency: CurrencyCode }`, `money(amountPaise: number, currency?: CurrencyCode): Money` (frozen; `RangeError` for anything but a safe integer), `parseRupees(text: string): Money`;
  - `add(a, b)`, `subtract(a, b)`, `negate(amount)`, `multiply(amount, quantity: number)`, `sum(amounts: readonly Money[], currency?)`, `compare(a, b): -1 | 0 | 1`, `isZero(amount): boolean` (mixing currencies throws `TypeError`, results beyond safe integers `RangeError`);
  - `type Rounding = "half-up" | "half-even"`, `fractionOf(amount, numerator, denominator, rounding = "half-up"): Money`, `percentageOf(amount, basisPoints, rounding = "half-up"): Money`, `allocate(amount, ratios: readonly number[]): Money[]`;
  - `formatMoney(amount, { symbol?: boolean }): string` and `formatIndianNumber(value: number | bigint, { fractionDigits?: number }): string`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-03-kernel -b foundation/03-kernel foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/03-kernel` at Task 0.2's commit; install and generate succeed.

- [ ] **Step 2: Write the failing tests**
`packages/domain/test/kernel/money.test.ts`:
```ts
// Money is integer paise: arithmetic never loses or invents a paisa, rounding is explicit, and bad amounts are refused.
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  percentageOf,
  subtract,
  sum,
} from "../../src/kernel/index.js";

const rupees = (value: number) => money(value * 100);

describe("money", () => {
  it("holds whole paise in rupees", () => {
    expect(money(125_000_050)).toEqual({ amountPaise: 125_000_050, currency: "INR" });
    expect(Object.isFrozen(money(1))).toBe(true);
  });

  it("refuses fractions of a paisa, NaN and amounts too large to hold exactly", () => {
    for (const bad of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => money(bad)).toThrow(RangeError);
    }
  });

  it("adds, subtracts, negates and sums", () => {
    expect(add(rupees(100), money(50))).toEqual(money(10_050));
    expect(subtract(rupees(100), rupees(250))).toEqual(rupees(-150));
    expect(negate(rupees(5))).toEqual(rupees(-5));
    expect(sum([rupees(1), rupees(2), money(3)])).toEqual(money(303));
    expect(sum([])).toEqual(money(0));
  });

  it("multiplies by whole quantities only", () => {
    expect(multiply(money(12_345), 3)).toEqual(money(37_035));
    expect(() => multiply(money(100), 1.5)).toThrow(RangeError);
  });

  it("refuses a result too large to hold exactly", () => {
    expect(() => add(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(RangeError);
    expect(() => multiply(money(Number.MAX_SAFE_INTEGER), 2)).toThrow(RangeError);
  });

  it("compares and recognises zero", () => {
    expect(compare(rupees(1), rupees(2))).toBe(-1);
    expect(compare(rupees(2), rupees(2))).toBe(0);
    expect(compare(rupees(3), rupees(2))).toBe(1);
    expect(isZero(money(0))).toBe(true);
    expect(isZero(money(-1))).toBe(false);
  });

  it("refuses to mix currencies", () => {
    const dollars = { amountPaise: 100, currency: "USD" } as unknown as ReturnType<typeof money>;
    expect(() => add(rupees(1), dollars)).toThrow(/currencies/);
  });
});

describe("percentages and rounding", () => {
  it("takes a percentage in basis points, rounding half up (away from zero) by default", () => {
    // 5% of ₹100.10 is ₹5.005: half a paisa rounds up.
    expect(percentageOf(money(10_010), 500)).toEqual(money(501));
    expect(percentageOf(money(-10_010), 500)).toEqual(money(-501));
    // 18% of ₹999.99 is ₹179.9982.
    expect(percentageOf(money(99_999), 1800)).toEqual(money(18_000));
  });

  it("rounds half to even when asked", () => {
    expect(percentageOf(money(10_010), 500, "half-even")).toEqual(money(500));
    expect(percentageOf(money(10_030), 500, "half-even")).toEqual(money(502));
    expect(percentageOf(money(-10_010), 500, "half-even")).toEqual(money(-500));
  });

  it("keeps exact results exact, at any size", () => {
    expect(percentageOf(money(Number.MAX_SAFE_INTEGER - 1), 10_000)).toEqual(money(Number.MAX_SAFE_INTEGER - 1));
    expect(percentageOf(money(1), 0)).toEqual(money(0));
  });

  it("refuses rates that are not whole basis points", () => {
    expect(() => percentageOf(money(100), 2.5)).toThrow(RangeError);
  });
});

describe("allocation", () => {
  it("splits an amount without losing a paisa, the remainder to the first parts", () => {
    const parts = allocate(money(10_000), [1, 1, 1]);
    expect(parts).toEqual([money(3334), money(3333), money(3333)]);
    expect(sum(parts)).toEqual(money(10_000));
  });

  it("splits by ratios, and splits negative amounts the same way", () => {
    expect(allocate(money(1001), [70, 30])).toEqual([money(701), money(300)]);
    expect(allocate(money(-1001), [70, 30])).toEqual([money(-701), money(-300)]);
    expect(allocate(money(5), [0, 1])).toEqual([money(0), money(5)]);
  });

  it("refuses ratios that are empty, negative, fractional or all zero", () => {
    for (const ratios of [[], [-1, 2], [0.5, 0.5], [0, 0]]) {
      expect(() => allocate(money(100), ratios)).toThrow(RangeError);
    }
  });
});

describe("parseRupees", () => {
  it("reads typed amounts with Indian or international grouping, without going through floats", () => {
    expect(parseRupees("12,50,000.50")).toEqual(money(125_000_050));
    expect(parseRupees("1,250,000.5")).toEqual(money(125_000_050));
    expect(parseRupees("₹ 999")).toEqual(money(99_900));
    expect(parseRupees("0.07")).toEqual(money(7));
    expect(parseRupees("-500")).toEqual(money(-50_000));
  });

  it("refuses more than two decimals, stray characters and amounts too large", () => {
    for (const bad of ["12.345", "12,,000", "1,000,", "1,2,3", "abc", "", "12 34", "1e5", "99999999999999999"]) {
      expect(() => parseRupees(bad), bad).toThrow(RangeError);
    }
  });
});
```
`packages/domain/test/kernel/indian-format.test.ts`:
```ts
// Numbers and money are shown the Indian way: ₹12,50,000.00, grouped in lakhs and crores.
import { describe, expect, it } from "vitest";
import { formatIndianNumber, formatMoney, money } from "../../src/kernel/index.js";

describe("Indian number format", () => {
  it("groups the last three digits, then pairs", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [999, "999"],
      [1000, "1,000"],
      [12_345, "12,345"],
      [100_000, "1,00,000"],
      [1_250_000, "12,50,000"],
      [12_345_678, "1,23,45,678"],
      [1_234_567_890, "1,23,45,67,890"],
      [-50_000, "-50,000"],
    ];
    for (const [value, shown] of cases) expect(formatIndianNumber(value)).toBe(shown);
    expect(formatIndianNumber(12_345_678_901_234_567_890n)).toBe("1,23,45,67,89,01,23,45,67,890");
    expect(formatIndianNumber(1234.5, { fractionDigits: 2 })).toBe("1,234.50");
  });

  it("formats money in rupees and paise, with or without the symbol", () => {
    expect(formatMoney(money(125_000_000))).toBe("₹12,50,000.00");
    expect(formatMoney(money(5))).toBe("₹0.05");
    expect(formatMoney(money(-50_000))).toBe("-₹500.00");
    expect(formatMoney(money(123_456_789_012), { symbol: false })).toBe("1,23,45,67,890.12");
  });

  it("matches what browsers show for en-IN, so the web app and PDFs agree", () => {
    const intl = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
    for (const paise of [0, 1, 99, 100_050, 125_000_000, 9_876_543_210, -1_999_999, 900_719_925_474_099]) {
      expect(formatMoney(money(paise)), String(paise)).toBe(intl.format(paise / 100));
    }
  });

  it("refuses numbers that can't be shown exactly", () => {
    expect(() => formatIndianNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatIndianNumber(1.5)).toThrow(RangeError);
  });
});
```
`packages/contracts/test/kernel/money.test.ts`:
```ts
// Money crosses the API as integer paise with its currency; typed amounts become paise without floats.
import { describe, expect, it } from "vitest";
import { moneyField, paiseFromRupeesText, rupeesText } from "../../src/kernel/index.js";

describe("money contracts", () => {
  it("accepts whole paise in rupees and nothing else", () => {
    expect(moneyField.parse({ amountPaise: 125_000_050, currency: "INR" })).toEqual({
      amountPaise: 125_000_050,
      currency: "INR",
    });
    for (const bad of [
      { amountPaise: 1.5, currency: "INR" },
      { amountPaise: 2 ** 53, currency: "INR" },
      { amountPaise: 100, currency: "USD" },
      { amountPaise: 100, currency: "INR", extra: true },
      { amountPaise: "100", currency: "INR" },
    ]) {
      expect(moneyField.safeParse(bad).success).toBe(false);
    }
  });

  it("reads a typed amount into paise", () => {
    expect(rupeesText.parse(" 12,50,000.50 ")).toBe(125_000_050);
    expect(rupeesText.parse("₹999")).toBe(99_900);
    expect(rupeesText.safeParse("12.345").success).toBe(false);
    expect(paiseFromRupeesText("1.5")).toBe(150);
    expect(paiseFromRupeesText("1.")).toBeNull();
  });
});
```
- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel && pnpm --filter @travel-crm/contracts exec vitest run test/kernel`

Expected: FAIL. The domain's 20 tests fail with `TypeError: ... is not a function` (the kernel exports none of them yet); the contracts file fails to load `../../src/kernel/index.js`.

- [ ] **Step 4: Write the money contracts**

`@travel-crm/contracts/kernel` resolves to `src/kernel/index.ts` through the package's wildcard export (Task 0.1).
`packages/contracts/src/kernel/money.ts`:
```ts
// Money as the API carries it (spec 9.6): integer paise and a currency code, never a float. Typed amounts are read
// into paise digit by digit.
import { z } from "zod";

/** The currencies the product handles. Phase 1 is India only; Phase 3 adds more. */
export const currencyCodes = ["INR"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];

/** An amount in the smallest unit (paise for rupees): a safe integer, so it is exact. */
export const moneyField = z.strictObject({ amountPaise: z.int(), currency: z.enum(currencyCodes) });
export type MoneyField = z.infer<typeof moneyField>;

/**
 * Whole rupees as people type them: plain digits, Indian grouping (12,50,000) or international grouping (1,250,000).
 * Two decimals at most.
 */
const RUPEES_PATTERN = /^(-)?(\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.(\d{1,2}))?$/;

/** A typed rupee amount such as "12,50,000.50", "₹999" or "-500", in paise; null when it isn't one or is too large. */
export function paiseFromRupeesText(text: string): number | null {
  const match = RUPEES_PATTERN.exec(text.trim().replace(/^(-?)\s*₹\s*/, "$1"));
  if (!match) return null;
  const [, minus, rupees = "", fraction = ""] = match;
  const paise = BigInt(rupees.replaceAll(",", "")) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = minus ? -paise : paise;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
}

/** A rupee amount typed into a form, read into paise. */
export const rupeesText = z
  .string()
  .max(40)
  .transform((text, context) => {
    const paise = paiseFromRupeesText(text);
    if (paise === null) {
      context.issues.push({ code: "custom", message: "Use an amount like 12,50,000.50", input: text });
      return z.NEVER;
    }
    return paise;
  });
```
`packages/contracts/src/kernel/index.ts`:
```ts
// Public API of @travel-crm/contracts/kernel: field rules for the shared kernel's values.
export * from "./money.js";
```
- [ ] **Step 5: Write Money, its rounding and its format**
`packages/domain/src/kernel/money.ts`:
```ts
// Money (spec 9.6): integer paise plus a currency code. All arithmetic and rounding live in the kernel, so no module
// ever computes with a float.
import { paiseFromRupeesText, type CurrencyCode } from "@travel-crm/contracts/kernel";

export type { CurrencyCode } from "@travel-crm/contracts/kernel";

/** An exact amount: a safe integer number of paise (or the currency's smallest unit). */
export interface Money {
  readonly amountPaise: number;
  readonly currency: CurrencyCode;
}

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${what} must be a whole number within ±${String(Number.MAX_SAFE_INTEGER)}, got ${String(value)}`,
    );
  }
}

/** Builds an amount from whole paise: money(125_000_050) is ₹12,50,000.50. */
export function money(amountPaise: number, currency: CurrencyCode = "INR"): Money {
  assertSafeInteger(amountPaise, "An amount in paise");
  return Object.freeze({ amountPaise, currency });
}

/** Reads a typed amount such as "12,50,000.50" or "₹999" without going through a float. */
export function parseRupees(text: string): Money {
  const paise = paiseFromRupeesText(text);
  if (paise === null) throw new RangeError(`Not a rupee amount: ${JSON.stringify(text.slice(0, 40))}`);
  return money(paise, "INR");
}

function sameCurrency(a: Money, b: Money): CurrencyCode {
  // Only rupees exist today, so the types can't tell the currencies apart; compared as strings, the check is ready
  // for Phase 3 and catches values cast from outside.
  const [left, right]: string[] = [a.currency, b.currency];
  if (left !== right) throw new TypeError(`Can't mix currencies: ${String(left)} and ${String(right)}`);
  return a.currency;
}

// Sums and products of safe integers are exact whenever the result is a safe integer, and money() refuses the rest.
export function add(a: Money, b: Money): Money {
  return money(a.amountPaise + b.amountPaise, sameCurrency(a, b));
}

export function subtract(a: Money, b: Money): Money {
  return money(a.amountPaise - b.amountPaise, sameCurrency(a, b));
}

export function negate(amount: Money): Money {
  return money(-amount.amountPaise, amount.currency);
}

/** The amount times a whole quantity, e.g. a price for 3 travellers. */
export function multiply(amount: Money, quantity: number): Money {
  assertSafeInteger(quantity, "A quantity");
  return money(amount.amountPaise * quantity, amount.currency);
}

/** The total of a list of amounts in one currency; an empty list is zero rupees. */
export function sum(amounts: readonly Money[], currency: CurrencyCode = "INR"): Money {
  return amounts.reduce((total, amount) => add(total, amount), money(0, amounts[0]?.currency ?? currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amountPaise < b.amountPaise ? -1 : a.amountPaise > b.amountPaise ? 1 : 0;
}

export function isZero(amount: Money): boolean {
  return amount.amountPaise === 0;
}
```
`packages/domain/src/kernel/money-rounding.ts`:
```ts
// Fractions of money: percentages, shares and splits, with the rounding stated by the caller. BigInt inside, so
// products of large amounts and rates stay exact until the one rounding step.
import { money, type Money } from "./money.js";

/** How a result between two paise is rounded. "half-up" rounds a half away from zero; "half-even" to the even paisa. */
export type Rounding = "half-up" | "half-even";

function wholeNumber(value: number, what: string): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be a whole number, got ${String(value)}`);
  return BigInt(value);
}

/** numerator / denominator (denominator > 0), rounded once. */
function divide(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  const twiceRemainder = (magnitude % denominator) * 2n;
  const roundsUp =
    twiceRemainder > denominator ||
    (twiceRemainder === denominator && (rounding === "half-up" || quotient % 2n === 1n));
  if (roundsUp) quotient += 1n;
  return negative ? -quotient : quotient;
}

function toMoney(paise: bigint, like: Money): Money {
  if (paise > BigInt(Number.MAX_SAFE_INTEGER) || paise < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("The result is too large to hold exactly");
  }
  return money(Number(paise), like.currency);
}

/** amount × numerator ÷ denominator, rounded once: fractionOf(price, 1, 3) is a third of the price. */
export function fractionOf(
  amount: Money,
  numerator: number,
  denominator: number,
  rounding: Rounding = "half-up",
): Money {
  const divisor = wholeNumber(denominator, "A denominator");
  if (divisor <= 0n) throw new RangeError("A denominator must be positive");
  return toMoney(divide(BigInt(amount.amountPaise) * wholeNumber(numerator, "A numerator"), divisor, rounding), amount);
}

/** A percentage given in basis points (1800 is 18 %), rounded once to the paisa. */
export function percentageOf(amount: Money, basisPoints: number, rounding: Rounding = "half-up"): Money {
  return fractionOf(amount, basisPoints, 10_000, rounding);
}

/**
 * Splits an amount in proportion to whole-number ratios without losing a paisa: each part is rounded down and the
 * paise left over go one each to the first parts. allocate(₹100, [1, 1, 1]) is ₹33.34, ₹33.33, ₹33.33.
 */
export function allocate(amount: Money, ratios: readonly number[]): Money[] {
  const weights = ratios.map((ratio) => wholeNumber(ratio, "A ratio"));
  if (weights.some((weight) => weight < 0n)) throw new RangeError("Ratios can't be negative");
  const totalWeight = weights.reduce((total, weight) => total + weight, 0n);
  if (totalWeight === 0n) throw new RangeError("Give at least one ratio above zero");
  const negative = amount.amountPaise < 0;
  const magnitude = BigInt(Math.abs(amount.amountPaise));
  const shares = weights.map((weight) => (magnitude * weight) / totalWeight);
  let left = magnitude - shares.reduce((total, share) => total + share, 0n);
  for (let index = 0; left > 0n; index = (index + 1) % shares.length) {
    // Parts with a zero ratio get nothing, not even a leftover paisa.
    if (weights[index] === 0n) continue;
    shares[index] = (shares[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return shares.map((share) => toMoney(negative ? -share : share, amount));
}
```
`packages/domain/src/kernel/indian-format.ts`:
```ts
// Numbers and money shown the Indian way (spec 9.6): the last three digits, then pairs, so ₹12,50,000.00 and
// 1,23,45,678. The same as Intl's en-IN format, written out so it works on bigints and exact paise.
import type { CurrencyCode } from "@travel-crm/contracts/kernel";
import type { Money } from "./money.js";

const currencySymbols: Record<CurrencyCode, string> = { INR: "₹" };

/** "1250000" → "12,50,000". */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const pairs = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${pairs},${digits.slice(-3)}`;
}

/**
 * A count or quantity in Indian grouping. Whole numbers unless fractionDigits is given; money goes through
 * formatMoney instead, which never rounds.
 */
export function formatIndianNumber(value: number | bigint, options: { fractionDigits?: number } = {}): string {
  const fractionDigits = options.fractionDigits ?? 0;
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || (fractionDigits === 0 && !Number.isSafeInteger(value)))
  ) {
    throw new RangeError(`Can't show ${String(value)} as a whole number`);
  }
  const text = typeof value === "bigint" ? value.toString() : value.toFixed(fractionDigits);
  const negative = text.startsWith("-");
  const [whole = "", fraction] = (negative ? text.slice(1) : text).split(".");
  const fractionPart =
    typeof value === "bigint" && fractionDigits > 0 ? `.${"0".repeat(fractionDigits)}` : fraction ? `.${fraction}` : "";
  return `${negative ? "-" : ""}${groupDigits(whole)}${fractionPart}`;
}

/** "₹12,50,000.00", "-₹500.00", or without the symbol "12,50,000.00". */
export function formatMoney(amount: Money, options: { symbol?: boolean } = {}): string {
  const magnitude = BigInt(Math.abs(amount.amountPaise));
  const rupees = groupDigits((magnitude / 100n).toString());
  const paise = (magnitude % 100n).toString().padStart(2, "0");
  const symbol = options.symbol === false ? "" : currencySymbols[amount.currency];
  return `${amount.amountPaise < 0 ? "-" : ""}${symbol}${rupees}.${paise}`;
}
```
Replace the kernel's public API:

`packages/domain/src/kernel/index.ts`:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
export { formatIndianNumber, formatMoney } from "./indian-format.js";
export {
  add,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  subtract,
  sum,
  type CurrencyCode,
  type Money,
} from "./money.js";
export { allocate, fractionOf, percentageOf, type Rounding } from "./money-rounding.js";
```
- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel && pnpm --filter @travel-crm/contracts exec vitest run test/kernel`

Expected: PASS, 20 tests in 2 domain files and 2 in the contracts file. The test "matches what browsers show for en-IN" compares `formatMoney` with `Intl.NumberFormat("en-IN")` (Node 24 ships full ICU), so the PDFs and the web app will agree.

- [ ] **Step 7: Document the kernel and the decision**
`packages/domain/src/kernel/README.md`:
```markdown
# kernel

The shared kernel (spec 8, 9.6): building blocks every module uses. It imports no domain module.

## Public functions and values (`index.ts`)

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
- **Money** (integer paise, ADR 0016):
  - `Money`, `CurrencyCode` (`"INR"`), `money(paise, currency?)`, `parseRupees(text)`;
  - `add`, `subtract`, `negate`, `multiply(amount, quantity)`, `sum(amounts)`, `compare`, `isZero`;
  - `percentageOf(amount, basisPoints, rounding?)`, `fractionOf(amount, numerator, denominator, rounding?)`,
    `allocate(amount, ratios)`, `Rounding` (`"half-up"`, the default, or `"half-even"`);
  - `formatMoney(amount, { symbol? })` → `₹12,50,000.00`, `formatIndianNumber(value, { fractionDigits? })` →
    `1,23,45,678`.

## Events

None.

## Rules worth knowing

- Money is never a float: amounts are safe integers of paise, typed amounts are read digit by digit, and every
  fraction is rounded once, at the end, by the rounding the caller names.
- Mixing currencies throws. Results too large to hold exactly throw `RangeError`.
```
`docs/adr/0016-money-tax-and-time.md`:
```markdown
# 0016: Money, tax and time in the shared kernel

Date: 2026-10-15 · Status: accepted · Implements spec section 9.6

## Decision

### Money

- **`Money` is integer paise plus a currency code**: `{ amountPaise, currency: "INR" }`, frozen. The amount is a
  JavaScript safe integer (up to about ₹90 lakh crore), so it is exact; anything else is refused with a `RangeError`.
  The API carries the same shape (`moneyField` in `@travel-crm/contracts/kernel`).
- **One place for arithmetic.** `add`, `subtract`, `multiply` (by whole quantities), `sum`, `compare` work on paise.
  Fractions (`percentageOf` in basis points, `fractionOf`, `allocate`) compute in BigInt and round once, at the end,
  with the rounding the caller names: `half-up` (a half rounds away from zero, the default) or `half-even`.
  `allocate` splits without losing a paisa and gives the leftover paise to the first parts.
- **Typed amounts never pass through a float.** `parseRupees("12,50,000.50")` (and the `rupeesText` contract) read
  digits: plain, Indian grouping or international grouping, two decimals at most.
- **Indian format.** `formatMoney` gives `₹12,50,000.00` and `formatIndianNumber` `1,23,45,678`: the last three
  digits, then pairs, exactly as `Intl.NumberFormat("en-IN")` does (a test compares them), but on exact paise and
  bigints.

## Context

- Floats can't hold most paise amounts exactly (₹0.10 + ₹0.20 is not ₹0.30), and a GST invoice that is a paisa off
  is wrong. Integers of the smallest unit are the usual answer; safe integers keep `JSON` and Postgres `bigint` simple.
- `CurrencyCode` is only `"INR"` in Phase 1. Phase 3 widens it; the currency checks are already written as string
  comparisons so they work then.

## Consequences

- Database columns for money are `bigint` (or `integer` where amounts are small) holding paise, never `numeric` read
  into floats.
- Rounding is visible at every call site that divides money, so reviewers can check it against the rule that
  applies (GST rounds each line half-up).
```
- [ ] **Step 8: Check**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

(The same gates as `pnpm check`, with fewer test suites at once while other tracks run. If the very first run after an install fails with `ENOTEMPTY ... .vitest-cache`, delete `node_modules/.vitest-cache` and run it again.)

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 20, db 111, domain 141, eslint-config 65, integrations 6.

- [ ] **Step 9: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && git add packages/contracts/src/kernel/index.ts packages/contracts/src/kernel/money.ts packages/contracts/test/kernel/money.test.ts packages/domain/src/kernel/index.ts packages/domain/src/kernel/money.ts packages/domain/src/kernel/money-rounding.ts packages/domain/src/kernel/indian-format.ts packages/domain/src/kernel/README.md packages/domain/test/kernel/money.test.ts packages/domain/test/kernel/indian-format.test.ts docs/adr/0016-money-tax-and-time.md
git commit -m "feat(domain): add Money in integer paise, its rounding, and the Indian number format"
```

---

### Task K2: The tax engine and India GST

A `TaxEngine` interface, so Phase 3 can add other countries, and India GST behind it: CGST + SGST (or UTGST in a union territory without a legislature) when the place of supply is the supplier's state, IGST between states and outside India, a rate per line, SAC codes, and each line's tax rounded half-up with the two halves equal. The GST state list and GSTIN checks go in contracts, because plan 4's onboarding form reads an organization's state and GSTIN.

**Files:**
- Create: `packages/contracts/src/kernel/gst.ts`, `packages/domain/src/kernel/tax/tax-engine.ts`, `packages/domain/src/kernel/tax/india-gst.ts`
- Modify: `packages/contracts/src/kernel/index.ts`, `packages/domain/src/kernel/index.ts`, `packages/domain/src/kernel/README.md`, `docs/adr/0016-money-tax-and-time.md`
- Test: `packages/domain/test/kernel/india-gst.test.ts`, `packages/contracts/test/kernel/gst.test.ts`

**Interfaces:**
- Consumes: Task K1's `Money`, `money`, `add`, `sum`, `fractionOf`, `formatMoney`.
- Produces, from `@travel-crm/contracts/kernel` (and re-exported by `@travel-crm/domain/kernel`, except the two fields):
  - `gstStates` (`{ code, name, kind }` for every state and union territory; `kind` is `"state"`, `"union-territory-with-legislature"` or `"union-territory"`), `type GstStateCode`, `isGstStateCode(code): code is GstStateCode`, `isUnionTerritoryWithoutLegislature(code): boolean`;
  - `gstinCheckCharacter(first14: string): string`, `isValidGstin(text): boolean`, `gstStateCodeFromGstin(gstin): GstStateCode` (`RangeError` if invalid);
  - fields `gstStateCode` and `gstin` (typed in any case, stored in capitals).
- Produces, from `@travel-crm/domain/kernel`:
  - `interface TaxEngine<Input, Breakdown extends TaxBreakdown = TaxBreakdown> { compute(input: Input): Breakdown }`, `TaxBreakdown` (`lines`, `components` (totals per tax and rate), `taxableValue`, `tax`, `total`), `TaxedLine` (`description`, `code`, `taxableValue`, `components`, `tax`, `total`), `TaxComponent` (`name`, `rateBasisPoints`, `amount`);
  - `indiaGst: TaxEngine<IndiaGstInput, IndiaGstBreakdown>`; `IndiaGstInput = { supplierStateCode: GstStateCode; placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA"; lines: readonly IndiaGstLine[] }`; `IndiaGstLine = { description; sacCode; taxableValue: Money; rateBasisPoints }`; `IndiaGstBreakdown` adds `supplyType: GstSupplyType` (`"intra-state" | "inter-state" | "export"`). Component names are `CGST`, `SGST`, `UTGST`, `IGST`.

- [ ] **Step 1: Write the failing tests**
`packages/domain/test/kernel/india-gst.test.ts`:
```ts
// India GST (spec 9.6): CGST + SGST (or UTGST) within a state, IGST between states and for exports, a rate per
// line, each line's tax rounded half-up to the paisa.
import { describe, expect, it } from "vitest";
import { formatMoney, indiaGst, money, type IndiaGstInput, type TaxComponent } from "../../src/kernel/index.js";

const line = (taxableValuePaise: number, rateBasisPoints: number, sacCode = "998552") => ({
  description: "Tour package",
  sacCode,
  taxableValue: money(taxableValuePaise),
  rateBasisPoints,
});

/** Components as "CGST 9% ₹900.00", easy to read in a failing test. */
const shown = (components: readonly TaxComponent[]) =>
  components.map(
    (component) => `${component.name} ${String(component.rateBasisPoints / 100)}% ${formatMoney(component.amount)}`,
  );

describe("India GST", () => {
  it("charges CGST and SGST, half the rate each, when the place of supply is the supplier's state", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(1_000_000, 1800)],
    });
    expect(breakdown.supplyType).toBe("intra-state");
    expect(shown(breakdown.lines[0]?.components ?? [])).toEqual(["CGST 9% ₹900.00", "SGST 9% ₹900.00"]);
    expect(formatMoney(breakdown.tax)).toBe("₹1,800.00");
    expect(formatMoney(breakdown.total)).toBe("₹11,800.00");
  });

  it("charges IGST at the full rate between states", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "29",
      lines: [line(1_000_000, 1800)],
    });
    expect(breakdown.supplyType).toBe("inter-state");
    expect(shown(breakdown.components)).toEqual(["IGST 18% ₹1,800.00"]);
  });

  it("charges UTGST instead of SGST in a union territory without a legislature, and SGST in Delhi", () => {
    const chandigarh = indiaGst.compute({
      supplierStateCode: "04",
      placeOfSupplyStateCode: "04",
      lines: [line(10_000, 500)],
    });
    expect(shown(chandigarh.components)).toEqual(["CGST 2.5% ₹2.50", "UTGST 2.5% ₹2.50"]);
    const delhi = indiaGst.compute({
      supplierStateCode: "07",
      placeOfSupplyStateCode: "07",
      lines: [line(10_000, 500)],
    });
    expect(shown(delhi.components)).toEqual(["CGST 2.5% ₹2.50", "SGST 2.5% ₹2.50"]);
  });

  it("charges IGST on a supply to a place outside India", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "OUTSIDE_INDIA",
      lines: [line(50_000, 500)],
    });
    expect(breakdown.supplyType).toBe("export");
    expect(shown(breakdown.components)).toEqual(["IGST 5% ₹25.00"]);
  });

  it("rounds each half separately, so CGST always equals SGST", () => {
    // 5% of ₹100.10: each half is 250.25 paise, rounded to 250; IGST is 500.5 paise, rounded half up to 501.
    const within = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(10_010, 500)],
    });
    expect(shown(within.components)).toEqual(["CGST 2.5% ₹2.50", "SGST 2.5% ₹2.50"]);
    const between = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "24",
      lines: [line(10_010, 500)],
    });
    expect(formatMoney(between.tax)).toBe("₹5.01");
    // 250.75 paise per half rounds up to 251.
    const up = indiaGst.compute({ supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [line(10_030, 500)] });
    expect(formatMoney(up.tax)).toBe("₹5.02");
  });

  it("totals lines with different rates by component and rate, and keeps each line's own tax", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(1_000_000, 500), line(200_000, 1800, "998551"), line(300_000, 500)],
    });
    expect(shown(breakdown.components)).toEqual([
      "CGST 2.5% ₹325.00",
      "SGST 2.5% ₹325.00",
      "CGST 9% ₹180.00",
      "SGST 9% ₹180.00",
    ]);
    expect(breakdown.lines.map((taxed) => formatMoney(taxed.total))).toEqual(["₹10,500.00", "₹2,360.00", "₹3,150.00"]);
    expect(formatMoney(breakdown.taxableValue)).toBe("₹15,000.00");
    expect(formatMoney(breakdown.total)).toBe("₹16,010.00");
  });

  it("takes whatever rate the item has, including GST 2.0's 40% slab and zero", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "29",
      lines: [line(100_000, 4000), line(100_000, 0)],
    });
    expect(shown(breakdown.components)).toEqual(["IGST 40% ₹400.00", "IGST 0% ₹0.00"]);
  });

  it("gives zero tax for no lines", () => {
    const breakdown = indiaGst.compute({ supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [] });
    expect(breakdown.components).toEqual([]);
    expect(breakdown.total).toEqual(money(0));
  });

  it("refuses a SAC code, a rate or a state it doesn't know", () => {
    const valid: IndiaGstInput = { supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [line(100, 500)] };
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 500, "123456")] })).toThrow(/SAC/);
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 1.5)] })).toThrow(/rate/);
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 10_001)] })).toThrow(/rate/);
    const retired = { ...valid, supplierStateCode: "25" } as unknown as IndiaGstInput;
    expect(() => indiaGst.compute(retired)).toThrow(/state code/);
  });
});
```
`packages/contracts/test/kernel/gst.test.ts`:
```ts
// GST registration facts: the state codes GSTINs start with, and GSTINs themselves, checked to the last character.
import { describe, expect, it } from "vitest";
import {
  gstStateCodeFromGstin,
  gstStates,
  gstin,
  gstinCheckCharacter,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
} from "../../src/kernel/index.js";

/** The GST Network's own sample GSTIN, used in its API documentation. */
const SAMPLE_GSTIN = "27AAPFU0939F1ZV";

describe("GST states", () => {
  it("lists every state and union territory once, by its two-digit GST code", () => {
    const codes = gstStates.map((state) => state.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\d{2}$/);
    expect(gstStates.find((state) => state.code === "36")?.name).toBe("Telangana");
    expect(gstStates.find((state) => state.code === "37")?.name).toBe("Andhra Pradesh");
    expect(gstStates.find((state) => state.code === "38")?.name).toBe("Ladakh");
    // Retired codes: Daman and Diu (now 26) and undivided Andhra Pradesh.
    expect(codes).not.toContain("25");
    expect(codes).not.toContain("28");
  });

  it("knows which union territories pay UTGST", () => {
    const utgst = gstStates
      .filter((state) => isUnionTerritoryWithoutLegislature(state.code))
      .map((state) => state.code);
    expect(utgst).toEqual(["04", "26", "31", "35", "38", "97"]);
    expect(isUnionTerritoryWithoutLegislature("07")).toBe(false);
    expect(isUnionTerritoryWithoutLegislature("34")).toBe(false);
  });
});

describe("GSTIN", () => {
  it("accepts a GSTIN whose check character matches, and gives its state", () => {
    expect(isValidGstin(SAMPLE_GSTIN)).toBe(true);
    expect(gstinCheckCharacter(SAMPLE_GSTIN.slice(0, 14))).toBe("V");
    expect(gstStateCodeFromGstin(SAMPLE_GSTIN)).toBe("27");
  });

  it("refuses a wrong check character, a bad shape or a state that doesn't exist", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(false);
    const retiredState = `25AAPFU0939F1Z`;
    expect(isValidGstin(retiredState + gstinCheckCharacter(retiredState))).toBe(false);
    expect(() => gstStateCodeFromGstin("27AAPFU0939F1ZW")).toThrow(RangeError);
  });

  it("reads a typed GSTIN in any case", () => {
    expect(gstin.parse(" 27aapfu0939f1zv ")).toBe(SAMPLE_GSTIN);
    expect(gstin.safeParse("27AAPFU0939F1ZW").success).toBe(false);
  });
});
```
- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel/india-gst.test.ts && pnpm --filter @travel-crm/contracts exec vitest run test/kernel/gst.test.ts`

Expected: FAIL. All 9 GST tests fail (`Cannot read properties of undefined (reading 'compute')`); the 5 contracts tests fail with `isValidGstin is not a function` and `Cannot read properties of undefined (reading 'map')`.

- [ ] **Step 3: Write the GST states and GSTIN checks**

The check character is a base-36 Luhn checksum, weighting every second character twice from the left; it is proved on the GST Network's sample GSTIN `27AAPFU0939F1ZV`.
`packages/contracts/src/kernel/gst.ts`:
```ts
// GST registration facts (spec 9.6): the two-digit state codes GSTINs start with and that place of supply uses, and
// GSTINs themselves, checked to the last character. Plan 4's onboarding reads an organization's state and GSTIN.
import { z } from "zod";

/**
 * Every state and union territory by its GST code. Codes 25 (Daman and Diu, merged into 26 in 2020) and 28
 * (undivided Andhra Pradesh) are retired and left out. Union territories with a legislature (Delhi, Puducherry,
 * Jammu and Kashmir) charge SGST like states; the others charge UTGST.
 */
export const gstStates = [
  { code: "01", name: "Jammu and Kashmir", kind: "union-territory-with-legislature" },
  { code: "02", name: "Himachal Pradesh", kind: "state" },
  { code: "03", name: "Punjab", kind: "state" },
  { code: "04", name: "Chandigarh", kind: "union-territory" },
  { code: "05", name: "Uttarakhand", kind: "state" },
  { code: "06", name: "Haryana", kind: "state" },
  { code: "07", name: "Delhi", kind: "union-territory-with-legislature" },
  { code: "08", name: "Rajasthan", kind: "state" },
  { code: "09", name: "Uttar Pradesh", kind: "state" },
  { code: "10", name: "Bihar", kind: "state" },
  { code: "11", name: "Sikkim", kind: "state" },
  { code: "12", name: "Arunachal Pradesh", kind: "state" },
  { code: "13", name: "Nagaland", kind: "state" },
  { code: "14", name: "Manipur", kind: "state" },
  { code: "15", name: "Mizoram", kind: "state" },
  { code: "16", name: "Tripura", kind: "state" },
  { code: "17", name: "Meghalaya", kind: "state" },
  { code: "18", name: "Assam", kind: "state" },
  { code: "19", name: "West Bengal", kind: "state" },
  { code: "20", name: "Jharkhand", kind: "state" },
  { code: "21", name: "Odisha", kind: "state" },
  { code: "22", name: "Chhattisgarh", kind: "state" },
  { code: "23", name: "Madhya Pradesh", kind: "state" },
  { code: "24", name: "Gujarat", kind: "state" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "union-territory" },
  { code: "27", name: "Maharashtra", kind: "state" },
  { code: "29", name: "Karnataka", kind: "state" },
  { code: "30", name: "Goa", kind: "state" },
  { code: "31", name: "Lakshadweep", kind: "union-territory" },
  { code: "32", name: "Kerala", kind: "state" },
  { code: "33", name: "Tamil Nadu", kind: "state" },
  { code: "34", name: "Puducherry", kind: "union-territory-with-legislature" },
  { code: "35", name: "Andaman and Nicobar Islands", kind: "union-territory" },
  { code: "36", name: "Telangana", kind: "state" },
  { code: "37", name: "Andhra Pradesh", kind: "state" },
  { code: "38", name: "Ladakh", kind: "union-territory" },
  // Offshore areas beyond any state; the UTGST Act counts them as a union territory.
  { code: "97", name: "Other Territory", kind: "union-territory" },
] as const;

export type GstStateCode = (typeof gstStates)[number]["code"];

const stateCodes: ReadonlySet<string> = new Set(gstStates.map((state) => state.code));
const utgstCodes: ReadonlySet<string> = new Set(
  gstStates.filter((state) => state.kind === "union-territory").map((state) => state.code),
);

export function isGstStateCode(code: string): code is GstStateCode {
  return stateCodes.has(code);
}

/** True where intra-state supplies carry UTGST instead of SGST. */
export function isUnionTerritoryWithoutLegislature(code: GstStateCode): boolean {
  return utgstCodes.has(code);
}

/** A state picked from the list, e.g. "27" for Maharashtra. */
export const gstStateCode = z.enum(gstStates.map((state) => state.code) as [GstStateCode, ...GstStateCode[]]);

const CHECK_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** State code, PAN (5 letters, 4 digits, a letter), entity number, "Z", check character. */
const GSTIN_PATTERN = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * The GSTIN's 15th character for its first 14: a Luhn checksum in base 36, weighting every second character twice
 * from the left. It catches every single wrong character and most swaps.
 */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = CHECK_CHARACTERS.indexOf(first14.charAt(index)) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHECK_CHARACTERS.charAt((36 - (sum % 36)) % 36);
}

/** True for a well-formed GSTIN in capitals, of a state that exists, whose check character matches. */
export function isValidGstin(text: string): boolean {
  const match = GSTIN_PATTERN.exec(text);
  return !!match?.[1] && isGstStateCode(match[1]) && gstinCheckCharacter(text.slice(0, 14)) === text.charAt(14);
}

/** The state a GSTIN is registered in. Throws RangeError for an invalid GSTIN. */
export function gstStateCodeFromGstin(gstinText: string): GstStateCode {
  const code = gstinText.slice(0, 2);
  if (!isValidGstin(gstinText) || !isGstStateCode(code)) throw new RangeError("Not a valid GSTIN");
  return code;
}

/** A GSTIN typed in any case, stored in capitals. */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidGstin, "Check the GSTIN: 15 characters, ending in a check character that must match");
```
`packages/contracts/src/kernel/index.ts`:
```ts
// Public API of @travel-crm/contracts/kernel: field rules for the shared kernel's values.
export * from "./gst.js";
export * from "./money.js";
```
- [ ] **Step 4: Write the tax engine and India GST**
`packages/domain/src/kernel/tax/tax-engine.ts`:
```ts
// The tax engine interface (spec 9.6): lines in, taxes per line and in total out. India GST is the Phase 1
// implementation; Phase 3 adds other countries behind the same shape.
import type { Money } from "../money.js";

/** One tax on one line or in total, e.g. CGST at 9 % (rateBasisPoints 900). */
export interface TaxComponent {
  readonly name: string;
  /** Hundredths of a percent; may end in .5 where a rate is split in two (CGST of 5 % is 250). */
  readonly rateBasisPoints: number;
  readonly amount: Money;
}

export interface TaxedLine {
  readonly description: string;
  /** The line's tax classification, e.g. a SAC code in India. */
  readonly code: string;
  readonly taxableValue: Money;
  readonly components: readonly TaxComponent[];
  readonly tax: Money;
  readonly total: Money;
}

export interface TaxBreakdown {
  readonly lines: readonly TaxedLine[];
  /** Totals per tax and rate, in the order they first appear: what an invoice's tax summary shows. */
  readonly components: readonly TaxComponent[];
  readonly taxableValue: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface TaxEngine<Input, Breakdown extends TaxBreakdown = TaxBreakdown> {
  compute(input: Input): Breakdown;
}
```
`packages/domain/src/kernel/tax/india-gst.ts`:
```ts
// India GST (spec 9.6): CGST + SGST (or UTGST) when the place of supply is the supplier's state, IGST between states
// and outside India. The rate is the item's; each line's tax is rounded half-up to the paisa. Deciding the place of
// supply (its rules for tour operators) is the caller's job: the accounts module's, in step 6.
import { isGstStateCode, isUnionTerritoryWithoutLegislature, type GstStateCode } from "@travel-crm/contracts/kernel";
import { add, sum, type Money } from "../money.js";
import { fractionOf } from "../money-rounding.js";
import type { TaxBreakdown, TaxComponent, TaxEngine, TaxedLine } from "./tax-engine.js";

export interface IndiaGstLine {
  description: string;
  /** Services Accounting Code: six digits starting 99, e.g. 998552 for tour operator services. */
  sacCode: string;
  taxableValue: Money;
  /** The item's GST rate in hundredths of a percent: 1800 is 18 %. Rates change (GST 2.0 from 22 September 2025). */
  rateBasisPoints: number;
}

export interface IndiaGstInput {
  supplierStateCode: GstStateCode;
  placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA";
  lines: readonly IndiaGstLine[];
}

export type GstSupplyType = "intra-state" | "inter-state" | "export";

export interface IndiaGstBreakdown extends TaxBreakdown {
  readonly supplyType: GstSupplyType;
}

const SAC_PATTERN = /^99\d{4}$/;

function assertStateCode(code: string, what: string): void {
  if (!isGstStateCode(code)) throw new RangeError(`${what} is not a GST state code: ${JSON.stringify(code)}`);
}

function assertLine(line: IndiaGstLine): void {
  if (!SAC_PATTERN.test(line.sacCode)) {
    throw new RangeError(`A SAC code is six digits starting 99, got ${JSON.stringify(line.sacCode)}`);
  }
  if (!Number.isInteger(line.rateBasisPoints) || line.rateBasisPoints < 0 || line.rateBasisPoints > 10_000) {
    throw new RangeError(`A GST rate is whole basis points from 0 to 10000, got ${String(line.rateBasisPoints)}`);
  }
}

function supplyTypeOf(input: IndiaGstInput): GstSupplyType {
  if (input.placeOfSupplyStateCode === "OUTSIDE_INDIA") return "export";
  return input.placeOfSupplyStateCode === input.supplierStateCode ? "intra-state" : "inter-state";
}

function componentsFor(line: IndiaGstLine, supplyType: GstSupplyType, stateCode: GstStateCode): TaxComponent[] {
  const rate = line.rateBasisPoints;
  if (supplyType !== "intra-state") {
    return [{ name: "IGST", rateBasisPoints: rate, amount: fractionOf(line.taxableValue, rate, 10_000) }];
  }
  // Each half is computed and rounded on its own, so CGST and its partner are always equal.
  const half = fractionOf(line.taxableValue, rate, 20_000);
  const partner = isUnionTerritoryWithoutLegislature(stateCode) ? "UTGST" : "SGST";
  return [
    { name: "CGST", rateBasisPoints: rate / 2, amount: half },
    { name: partner, rateBasisPoints: rate / 2, amount: half },
  ];
}

/** Totals per tax name and rate, in the order they first appear. */
function totalsOf(lines: readonly TaxedLine[]): TaxComponent[] {
  const totals = new Map<string, TaxComponent>();
  for (const component of lines.flatMap((line) => line.components)) {
    const key = `${component.name}@${String(component.rateBasisPoints)}`;
    const total = totals.get(key);
    totals.set(key, total ? { ...total, amount: add(total.amount, component.amount) } : component);
  }
  return [...totals.values()];
}

export const indiaGst: TaxEngine<IndiaGstInput, IndiaGstBreakdown> = {
  compute(input) {
    assertStateCode(input.supplierStateCode, "The supplier's state");
    if (input.placeOfSupplyStateCode !== "OUTSIDE_INDIA") {
      assertStateCode(input.placeOfSupplyStateCode, "The place of supply");
    }
    const supplyType = supplyTypeOf(input);
    const lines = input.lines.map((line): TaxedLine => {
      assertLine(line);
      const components = componentsFor(line, supplyType, input.supplierStateCode);
      const tax = sum(
        components.map((component) => component.amount),
        line.taxableValue.currency,
      );
      return {
        description: line.description,
        code: line.sacCode,
        taxableValue: line.taxableValue,
        components,
        tax,
        total: add(line.taxableValue, tax),
      };
    });
    const currency = input.lines[0]?.taxableValue.currency ?? "INR";
    const taxableValue = sum(
      lines.map((line) => line.taxableValue),
      currency,
    );
    const tax = sum(
      lines.map((line) => line.tax),
      currency,
    );
    return { supplyType, lines, components: totalsOf(lines), taxableValue, tax, total: add(taxableValue, tax) };
  },
};
```
Replace the kernel's public API:

`packages/domain/src/kernel/index.ts`:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
export { formatIndianNumber, formatMoney } from "./indian-format.js";
export {
  add,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  subtract,
  sum,
  type CurrencyCode,
  type Money,
} from "./money.js";
export { allocate, fractionOf, percentageOf, type Rounding } from "./money-rounding.js";
export {
  indiaGst,
  type GstSupplyType,
  type IndiaGstBreakdown,
  type IndiaGstInput,
  type IndiaGstLine,
} from "./tax/india-gst.js";
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
// GST registration facts live with the API's field rules, so forms and the tax engine share one list.
export {
  gstStateCodeFromGstin,
  gstStates,
  isGstStateCode,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
  type GstStateCode,
} from "@travel-crm/contracts/kernel";
```
- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel && pnpm --filter @travel-crm/contracts exec vitest run test/kernel`

Expected: PASS, 29 tests in 3 domain files and 7 in 2 contracts files.

- [ ] **Step 6: Document it**

Replace the kernel README:

`packages/domain/src/kernel/README.md`:
```markdown
# kernel

The shared kernel (spec 8, 9.6): building blocks every module uses. It imports no domain module.

## Public functions and values (`index.ts`)

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
- **Money** (integer paise, ADR 0016):
  - `Money`, `CurrencyCode` (`"INR"`), `money(paise, currency?)`, `parseRupees(text)`;
  - `add`, `subtract`, `negate`, `multiply(amount, quantity)`, `sum(amounts)`, `compare`, `isZero`;
  - `percentageOf(amount, basisPoints, rounding?)`, `fractionOf(amount, numerator, denominator, rounding?)`,
    `allocate(amount, ratios)`, `Rounding` (`"half-up"`, the default, or `"half-even"`);
  - `formatMoney(amount, { symbol? })` → `₹12,50,000.00`, `formatIndianNumber(value, { fractionDigits? })` →
    `1,23,45,678`.
- **Tax** (ADR 0016):
  - `TaxEngine<Input, Breakdown>` with `compute(input)`, and `TaxBreakdown`, `TaxedLine`, `TaxComponent`;
  - `indiaGst`: `IndiaGstInput` (supplier's state, place of supply or `"OUTSIDE_INDIA"`, lines with a SAC code,
    taxable value and rate in basis points) → `IndiaGstBreakdown` (`supplyType`, per-line and total CGST/SGST/UTGST
    or IGST);
  - GST facts, from `@travel-crm/contracts/kernel`: `gstStates`, `GstStateCode`, `isGstStateCode`,
    `isUnionTerritoryWithoutLegislature`, `isValidGstin`, `gstStateCodeFromGstin`.

## Events

None.

## Rules worth knowing

- Money is never a float: amounts are safe integers of paise, typed amounts are read digit by digit, and every
  fraction is rounded once, at the end, by the rounding the caller names.
- Mixing currencies throws. Results too large to hold exactly throw `RangeError`.
- The tax engine takes the place of supply and each item's rate from the caller: it holds no place-of-supply rules
  and no list of slabs, so a rate change needs no code change.
```
In `docs/adr/0016-money-tax-and-time.md`, insert this before the line `## Context`:

```markdown
### Tax

- **`TaxEngine<Input, Breakdown>`** is the interface: lines in, per-line and total taxes out, each tax a named
  component with its rate and amount. Phase 1 implements `indiaGst`; other countries come in Phase 3 behind it.
- **India GST.** When the place of supply is the supplier's state: CGST and SGST, half the rate each, or CGST and
  UTGST in a union territory without a legislature (Chandigarh, Dadra and Nagar Haveli and Daman and Diu,
  Lakshadweep, Andaman and Nicobar, Ladakh, Other Territory). Between states, and for a place of supply outside
  India: IGST at the full rate.
- **Per line, half-up, each half on its own.** Each line's tax is rounded half-up to the paisa, and CGST and its
  partner are each computed and rounded separately, so they are always equal (₹100.10 at 5 %: ₹2.50 + ₹2.50 within a
  state, ₹5.01 between states). Totals add up the lines, grouped by tax and rate for the invoice's summary.
- **The caller decides the place of supply and the rate.** The engine has no place-of-supply rules (for tour
  operators they depend on the recipient's registration and the trip: the accounts module's job, step 6) and no list
  of slabs (GST 2.0 moved most rates to 5 %, 18 % and 40 % on 22 September 2025; rates are data per item). It checks
  that a rate is whole basis points from 0 to 10000 and a SAC code six digits starting 99. Export zero-rating under a
  Letter of Undertaking is also the accounts module's decision: the engine computes IGST at the rate it is given.
- **GST facts live in `@travel-crm/contracts/kernel`**: the state list with GST codes (retired 25 and 28 left out)
  and GSTIN validation, with its base-36 Luhn check character (proved on the GST Network's sample GSTIN). Forms
  (plan 4's onboarding) and the engine share one copy; the kernel re-exports them.
```

- [ ] **Step 7: Check**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

(The same gates as `pnpm check`, with fewer test suites at once while other tracks run. If the very first run after an install fails with `ENOTEMPTY ... .vitest-cache`, delete `node_modules/.vitest-cache` and run it again.)

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 25, db 111, domain 150, eslint-config 65, integrations 6.

- [ ] **Step 8: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && git add packages/contracts/src/kernel/gst.ts packages/contracts/src/kernel/index.ts packages/contracts/test/kernel/gst.test.ts packages/domain/src/kernel/index.ts packages/domain/src/kernel/tax/tax-engine.ts packages/domain/src/kernel/tax/india-gst.ts packages/domain/src/kernel/README.md packages/domain/test/kernel/india-gst.test.ts docs/adr/0016-money-tax-and-time.md
git commit -m "feat(domain): add the tax engine interface and India GST, with GST states and GSTIN checks"
```

---

### Task K3: Times in the organization's zone, calendar dates, and phone numbers

Instants are stored in UTC and shown, and days counted, in the organization's IANA time zone (`organization.time_zone`, Task 0.2). Departure dates are calendar dates with no time. Phone numbers are saved in E.164 with India as the default country. Two facts verified on Node 24 shape the code: `Intl` accepts offsets (`+05:30`) and abbreviations (`EST` becomes `America/Panama`), so zone names are checked against a pattern first; and `Intl.supportedValuesOf("timeZone")` lists `Asia/Calcutta`, not `Asia/Kolkata`, so it can't be the check.

**Files:**
- Create: `packages/contracts/src/kernel/time.ts`, `packages/contracts/src/kernel/phone.ts`, `packages/domain/src/kernel/time.ts`
- Modify: `packages/contracts/src/kernel/index.ts`, `packages/domain/src/kernel/index.ts`, `packages/domain/src/kernel/README.md`, `docs/adr/0016-money-tax-and-time.md`
- Test: `packages/domain/test/kernel/time.test.ts`, `packages/contracts/test/kernel/time.test.ts`, `packages/contracts/test/kernel/phone.test.ts`

**Interfaces:**
- Consumes: `libphonenumber-js` 1.13.15 (a dependency of `@travel-crm/contracts` since Task 0.1).
- Produces, from `@travel-crm/contracts/kernel`: `isValidTimeZone(name): boolean` (re-exported by the domain kernel), `isCalendarDate(text): boolean`, fields `calendarDate` and `timeZoneName`; `toE164(text: string, defaultCountry: CountryCode = "IN"): string | null` and the `phoneNumber` field (typed text → E.164).
- Produces, from `@travel-crm/domain/kernel`: `type CalendarDate` (a branded `YYYY-MM-DD` string), `parseCalendarDate(text): CalendarDate`, `calendarDateIn(instant: Date, timeZone: string): CalendarDate`, `yearIn(instant, timeZone): number`, `startOfDayIn(date: CalendarDate, timeZone): Date`, `formatDateTime(instant, { timeZone, style: "date" | "time" | "date-time" }): string`. Every one throws `RangeError` for a zone that isn't an IANA name.

- [ ] **Step 1: Write the failing tests**
`packages/domain/test/kernel/time.test.ts`:
```ts
// Times are instants in UTC, shown and counted in the organization's time zone (spec 9.6); departure dates are
// calendar dates with no time at all.
import { describe, expect, it } from "vitest";
import { calendarDateIn, formatDateTime, parseCalendarDate, startOfDayIn, yearIn } from "../../src/kernel/index.js";

const at = (iso: string) => new Date(iso);

describe("calendar dates in a time zone", () => {
  it("turns over at midnight India time, 18:30 UTC", () => {
    expect(calendarDateIn(at("2026-10-14T18:29:59Z"), "Asia/Kolkata")).toBe("2026-10-14");
    expect(calendarDateIn(at("2026-10-14T18:30:00Z"), "Asia/Kolkata")).toBe("2026-10-15");
    expect(calendarDateIn(at("2026-10-14T20:00:00Z"), "Asia/Dubai")).toBe("2026-10-15");
    expect(calendarDateIn(at("2026-10-14T20:00:00Z"), "UTC")).toBe("2026-10-14");
  });

  it("counts the year in the zone, so New Year comes five and a half hours early in India", () => {
    expect(yearIn(at("2026-12-31T18:30:00Z"), "Asia/Kolkata")).toBe(2027);
    expect(yearIn(at("2026-12-31T18:30:00Z"), "UTC")).toBe(2026);
  });

  it("finds the instant a day starts, through daylight saving changes", () => {
    expect(startOfDayIn(parseCalendarDate("2026-10-15"), "Asia/Kolkata")).toEqual(at("2026-10-14T18:30:00Z"));
    expect(startOfDayIn(parseCalendarDate("2026-07-01"), "Europe/London")).toEqual(at("2026-06-30T23:00:00Z"));
    // British Summer Time starts at 01:00 on 29 March 2026; that day still starts at midnight GMT.
    expect(startOfDayIn(parseCalendarDate("2026-03-29"), "Europe/London")).toEqual(at("2026-03-29T00:00:00Z"));
    // Cuba skips midnight on 8 March 2026 (00:00 becomes 01:00): the day starts at 01:00 local.
    expect(startOfDayIn(parseCalendarDate("2026-03-08"), "America/Havana")).toEqual(at("2026-03-08T05:00:00Z"));
  });

  it("refuses a time zone that isn't an IANA name", () => {
    expect(() => calendarDateIn(at("2026-10-15T00:00:00Z"), "+05:30")).toThrow(RangeError);
    expect(() => yearIn(at("2026-10-15T00:00:00Z"), "Mars/Olympus")).toThrow(RangeError);
    expect(() => startOfDayIn(parseCalendarDate("2026-10-15"), "IST")).toThrow(RangeError);
  });
});

describe("calendar dates", () => {
  it("are real days written YYYY-MM-DD", () => {
    expect(parseCalendarDate("2028-02-29")).toBe("2028-02-29");
    for (const bad of ["2026-02-30", "2026-2-3", "15/10/2026", "2026-10-15T00:00:00Z", "0999-01-01"]) {
      expect(() => parseCalendarDate(bad), bad).toThrow(RangeError);
    }
  });
});

describe("formatDateTime", () => {
  const evening = at("2026-10-15T16:00:00Z");

  it("shows dates and times the Indian way, in the zone", () => {
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "date" })).toBe("15 Oct 2026");
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "time" })).toBe("9:30 pm");
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "date-time" })).toBe("15 Oct 2026, 9:30 pm");
    expect(formatDateTime(evening, { timeZone: "Europe/London", style: "date-time" })).toBe("15 Oct 2026, 5:00 pm");
  });

  it("keeps en-IN's own month names and midnight", () => {
    expect(formatDateTime(at("2026-09-15T06:00:00Z"), { timeZone: "Asia/Kolkata", style: "date" })).toBe(
      "15 Sept 2026",
    );
    expect(formatDateTime(at("2026-10-14T18:30:00Z"), { timeZone: "Asia/Kolkata", style: "time" })).toBe("12:00 am");
  });

  it("refuses a zone that isn't an IANA name", () => {
    expect(() => formatDateTime(evening, { timeZone: "EST", style: "date" })).toThrow(RangeError);
  });
});
```
`packages/contracts/test/kernel/time.test.ts`:
```ts
// Calendar dates and time zone names as the API accepts them.
import { describe, expect, it } from "vitest";
import { calendarDate, isCalendarDate, isValidTimeZone, timeZoneName } from "../../src/kernel/index.js";

describe("time zone names", () => {
  it("accept IANA names and UTC", () => {
    for (const zone of ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/Argentina/Buenos_Aires", "UTC"]) {
      expect(isValidTimeZone(zone), zone).toBe(true);
    }
    expect(timeZoneName.parse(" Asia/Kolkata ")).toBe("Asia/Kolkata");
  });

  it("refuse offsets, abbreviations, wrong case and unknown places", () => {
    for (const zone of ["+05:30", "EST", "IST", "asia/kolkata", "Mars/Olympus", "", "Asia/Kolkata/"]) {
      expect(isValidTimeZone(zone), zone).toBe(false);
    }
    expect(timeZoneName.safeParse("IST").success).toBe(false);
  });
});

describe("calendar dates", () => {
  it("accept real days as YYYY-MM-DD and refuse the rest", () => {
    expect(calendarDate.parse("2026-10-15")).toBe("2026-10-15");
    expect(isCalendarDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-10-5", "2026-10-15T10:00", "0999-12-31"]) {
      expect(isCalendarDate(bad), bad).toBe(false);
    }
    expect(calendarDate.safeParse("2026-02-30").success).toBe(false);
  });
});
```
`packages/contracts/test/kernel/phone.test.ts`:
```ts
// Phone numbers are saved in E.164 (spec 9.6), whatever form people type them in; India is the default country.
import { describe, expect, it } from "vitest";
import { phoneNumber, toE164 } from "../../src/kernel/index.js";

describe("phone numbers", () => {
  it("normalise the forms Indian numbers are typed in", () => {
    for (const typed of ["98765 43210", "+91 98765-43210", "09876543210", "919876543210", " +919876543210 "]) {
      expect(phoneNumber.parse(typed), typed).toBe("+919876543210");
    }
    expect(toE164("080 2345 6789")).toBe("+918023456789");
  });

  it("keep international numbers in their own country", () => {
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("020 7946 0958", "GB")).toBe("+442079460958");
  });

  it("refuse what isn't a whole phone number, and extensions E.164 can't hold", () => {
    for (const bad of ["12345", "+91 98765 4321", "abc", "", "9876543210 ext 2"]) {
      expect(toE164(bad), bad).toBeNull();
      expect(phoneNumber.safeParse(bad).success, bad).toBe(false);
    }
  });
});
```
- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel/time.test.ts; pnpm --filter @travel-crm/contracts exec vitest run test/kernel`

Expected: FAIL. The 8 time tests fail (the kernel exports none of these functions yet); in contracts, the 6 new tests fail and the 7 from K1 and K2 pass.

- [ ] **Step 3: Write the time and phone fields**
`packages/contracts/src/kernel/time.ts`:
```ts
// Calendar dates and time zone names as the API takes them (spec 9.6). Times themselves cross the API as ISO
// instants in UTC; an organization's zone says how to show them.
import { z } from "zod";

/** "Area/Location" with as many parts as IANA uses, or UTC. Offsets (+05:30) and abbreviations (IST, EST) are refused. */
const ZONE_NAME_PATTERN = /^(?:UTC|[A-Z][A-Za-z]*(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*)+)$/;

/** True for an IANA time zone name the runtime knows, such as "Asia/Kolkata". */
export function isValidTimeZone(name: string): boolean {
  if (!ZONE_NAME_PATTERN.test(name)) return false;
  try {
    // Intl throws a RangeError for a zone it doesn't know.
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real day written YYYY-MM-DD, from the year 1000 (2026-02-30 is refused). */
export function isCalendarDate(text: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A day with no time, such as a departure date: "2026-10-15". */
export const calendarDate = z.string().refine(isCalendarDate, "Use a date like 2026-10-15");

/** An organization's time zone, e.g. "Asia/Kolkata". */
export const timeZoneName = z.string().trim().max(64).refine(isValidTimeZone, "Use a time zone like Asia/Kolkata");
```
`packages/contracts/src/kernel/phone.ts`:
```ts
// Phone numbers, saved in E.164 (spec 9.6): "+919876543210", whatever form people type them in. India is the
// default country, so "98765 43210" and "09876543210" both work.
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

/**
 * The number in E.164, or null when the text isn't a valid number. Extensions are refused rather than dropped:
 * E.164 can't hold them. Uses libphonenumber's small metadata, which checks a number's country and length.
 */
export function toE164(text: string, defaultCountry: CountryCode = "IN"): string | null {
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed?.isValid() || parsed.ext !== undefined) return null;
  return parsed.number;
}

/** A phone number typed into a form, saved in E.164. */
export const phoneNumber = z
  .string()
  .max(40)
  .transform((text, context) => {
    const e164 = toE164(text);
    if (e164 === null) {
      context.issues.push({ code: "custom", message: "Use a phone number like 98765 43210", input: text });
      return z.NEVER;
    }
    return e164;
  });
```
`packages/contracts/src/kernel/index.ts`:
```ts
// Public API of @travel-crm/contracts/kernel: field rules for the shared kernel's values.
export * from "./gst.js";
export * from "./money.js";
export * from "./phone.js";
export * from "./time.js";
```
- [ ] **Step 4: Write the kernel's time functions**

`startOfDayIn` guesses with the zone's offset at UTC midnight and corrects once with the offset at the guess; where daylight saving skips midnight (Cuba on 8 March 2026) it returns the moment the clocks jump to.
`packages/domain/src/kernel/time.ts`:
```ts
// Time (spec 9.6): instants are stored in UTC and shown, and days counted, in the organization's time zone.
// Departure dates are calendar dates, days with no time at all.
import { isCalendarDate, isValidTimeZone } from "@travel-crm/contracts/kernel";

/** A day written YYYY-MM-DD, checked to be real. Build one with parseCalendarDate or calendarDateIn. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

export function parseCalendarDate(text: string): CalendarDate {
  if (!isCalendarDate(text))
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${JSON.stringify(text.slice(0, 30))}`);
  return text as CalendarDate;
}

function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Not an IANA time zone name: ${JSON.stringify(timeZone)}`);
}

// Formatters are slow to build and safe to share: keep one per zone and style.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock on the wall in timeZone shows at instant. */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatter(`parts|${timeZone}`, "en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

/** The day it is in timeZone at instant: at 18:30 UTC it is already tomorrow in India. */
export function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
  assertTimeZone(timeZone);
  const { year, month, day } = wallClock(instant, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as CalendarDate;
}

/** The year in timeZone at instant, e.g. for numbering documents by the organization's year. */
export function yearIn(instant: Date, timeZone: string): number {
  assertTimeZone(timeZone);
  return wallClock(instant, timeZone).year;
}

/** How far timeZone's clocks are ahead of UTC at an instant, in milliseconds. */
function offsetAt(instantMs: number, timeZone: string): number {
  const clock = wallClock(new Date(instantMs), timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - instantMs;
}

/**
 * The first instant of a day in timeZone. Usually midnight; where daylight saving skips midnight (Cuba in March),
 * the moment the clocks jump to.
 */
export function startOfDayIn(date: CalendarDate, timeZone: string): Date {
  assertTimeZone(timeZone);
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Guess with the offset at UTC midnight, then correct once with the offset at the guess: offsets change at most
  // once in a day.
  const first = midnightAsUtc - offsetAt(midnightAsUtc, timeZone);
  const second = midnightAsUtc - offsetAt(first, timeZone);
  const onTheDay = [first, second].filter((candidate) => calendarDateIn(new Date(candidate), timeZone) === date);
  return new Date(onTheDay.length > 0 ? Math.min(...onTheDay) : Math.max(first, second));
}

const styles: Record<"date" | "time" | "date-time", Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit", hour12: true },
  "date-time": { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
};

/** "15 Oct 2026", "9:30 pm" or "15 Oct 2026, 9:30 pm", in Indian English, as clocks in timeZone show it. */
export function formatDateTime(
  instant: Date,
  options: { timeZone: string; style: "date" | "time" | "date-time" },
): string {
  assertTimeZone(options.timeZone);
  return formatter(`${options.style}|${options.timeZone}`, "en-IN", {
    timeZone: options.timeZone,
    ...styles[options.style],
  }).format(instant);
}
```
Replace the kernel's public API:

`packages/domain/src/kernel/index.ts`:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
export { formatIndianNumber, formatMoney } from "./indian-format.js";
export {
  add,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  subtract,
  sum,
  type CurrencyCode,
  type Money,
} from "./money.js";
export { allocate, fractionOf, percentageOf, type Rounding } from "./money-rounding.js";
export {
  indiaGst,
  type GstSupplyType,
  type IndiaGstBreakdown,
  type IndiaGstInput,
  type IndiaGstLine,
} from "./tax/india-gst.js";
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
export { calendarDateIn, formatDateTime, parseCalendarDate, startOfDayIn, yearIn, type CalendarDate } from "./time.js";
// GST facts and time zone names live with the API's field rules, so forms and the kernel share one copy.
export {
  gstStateCodeFromGstin,
  gstStates,
  isGstStateCode,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
  isValidTimeZone,
  type GstStateCode,
} from "@travel-crm/contracts/kernel";
```
- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain exec vitest run test/kernel && pnpm --filter @travel-crm/contracts exec vitest run test/kernel`

Expected: PASS, 37 tests in 4 domain files and 13 in 4 contracts files.

- [ ] **Step 6: Document it**

Replace the kernel README:

`packages/domain/src/kernel/README.md`:
```markdown
# kernel

The shared kernel (spec 8, 9.6): building blocks every module uses. It imports no domain module.

## Public functions and values (`index.ts`)

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
- **Money** (integer paise, ADR 0016):
  - `Money`, `CurrencyCode` (`"INR"`), `money(paise, currency?)`, `parseRupees(text)`;
  - `add`, `subtract`, `negate`, `multiply(amount, quantity)`, `sum(amounts)`, `compare`, `isZero`;
  - `percentageOf(amount, basisPoints, rounding?)`, `fractionOf(amount, numerator, denominator, rounding?)`,
    `allocate(amount, ratios)`, `Rounding` (`"half-up"`, the default, or `"half-even"`);
  - `formatMoney(amount, { symbol? })` → `₹12,50,000.00`, `formatIndianNumber(value, { fractionDigits? })` →
    `1,23,45,678`.
- **Tax** (ADR 0016):
  - `TaxEngine<Input, Breakdown>` with `compute(input)`, and `TaxBreakdown`, `TaxedLine`, `TaxComponent`;
  - `indiaGst`: `IndiaGstInput` (supplier's state, place of supply or `"OUTSIDE_INDIA"`, lines with a SAC code,
    taxable value and rate in basis points) → `IndiaGstBreakdown` (`supplyType`, per-line and total CGST/SGST/UTGST
    or IGST);
  - GST facts, from `@travel-crm/contracts/kernel`: `gstStates`, `GstStateCode`, `isGstStateCode`,
    `isUnionTerritoryWithoutLegislature`, `isValidGstin`, `gstStateCodeFromGstin`.
- **Time** (instants in UTC, shown in the organization's zone):
  - `calendarDateIn(instant, timeZone)` → `"2026-10-15"`, `yearIn(instant, timeZone)`,
    `startOfDayIn(date, timeZone)` → the day's first instant;
  - `formatDateTime(instant, { timeZone, style })` with `style` `"date"` (15 Oct 2026), `"time"` (9:30 pm) or
    `"date-time"` (15 Oct 2026, 9:30 pm);
  - `CalendarDate` (a checked `YYYY-MM-DD` day, for departure dates), `parseCalendarDate(text)`;
  - `isValidTimeZone(name)`, from `@travel-crm/contracts/kernel`.
- **Phone numbers** are normalised at the API boundary: `phoneNumber` and `toE164(text, defaultCountry?)` in
  `@travel-crm/contracts/kernel`.

`@travel-crm/contracts/kernel` also has the fields forms use: `moneyField`, `rupeesText`, `gstStateCode`, `gstin`,
`calendarDate`, `timeZoneName`, `phoneNumber`.

## Events

None.

## Rules worth knowing

- Money is never a float: amounts are safe integers of paise, typed amounts are read digit by digit, and every
  fraction is rounded once, at the end, by the rounding the caller names.
- Mixing currencies throws. Results too large to hold exactly throw `RangeError`.
- The tax engine takes the place of supply and each item's rate from the caller: it holds no place-of-supply rules
  and no list of slabs, so a rate change needs no code change.
- Time zones are IANA names (`Asia/Kolkata`); offsets and abbreviations (`+05:30`, `IST`) are refused, because they
  don't say what happens when a zone's rules change. Every time function throws `RangeError` for one.
- Count days and years in the organization's zone, never in UTC: at 18:30 UTC it is already tomorrow in India.
```
In `docs/adr/0016-money-tax-and-time.md`, insert this before the line `## Context`:

```markdown
### Time and phone numbers

- **Instants are `Date`s in UTC**, stored as `timestamptz`, and shown and counted in the organization's IANA time
  zone (`organization.time_zone`, ADR 0009): `calendarDateIn`, `yearIn`, `startOfDayIn`, `formatDateTime`.
  `formatDateTime` uses Indian English (`15 Oct 2026, 9:30 pm`, and en-IN's own `Sept`).
- **Zones are IANA names only.** `isValidTimeZone` takes `Area/Location` names and `UTC`, and refuses offsets
  (`+05:30`) and abbreviations (`IST`, `EST`), which the runtime would otherwise accept and map unpredictably.
- **Calendar dates have no time**: a departure on 15 October is `"2026-10-15"` (`CalendarDate`, Postgres `date`),
  never a midnight instant that shifts with the zone. `startOfDayIn` handles daylight saving, including zones that
  skip midnight.
- **Phone numbers are saved in E.164** (`+919876543210`). The `phoneNumber` contract normalises what people type,
  with India as the default country, and refuses invalid numbers and extensions (E.164 can't hold them). It uses
  libphonenumber-js's small metadata, which checks the country and the number's length, to keep the web app's bundle
  small; the full metadata would also check number ranges.
- **Translation (next-intl) arrives with the web app** in plan 5. Until then the kernel formats in Indian English.
```

and add these two bullets at the end of its `## Consequences` section:

```markdown
- Code that counts days or years (document numbers, reminders, the subscription lifecycle) passes the
  organization's time zone explicitly.
- The validation helpers (GST, time zones, calendar dates, phone numbers) live in `@travel-crm/contracts/kernel`,
  so a form and the domain can't disagree; the domain kernel re-exports the ones it uses.
```

- [ ] **Step 7: Check**

Run: `cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

(The same gates as `pnpm check`, with fewer test suites at once while other tracks run. If the very first run after an install fails with `ENOTEMPTY ... .vitest-cache`, delete `node_modules/.vitest-cache` and run it again.)

Expected: green. Test counts: api-server 72, api 5, brand 3, contracts 31, db 111, domain 158, eslint-config 65, integrations 6.

- [ ] **Step 8: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-kernel && source ~/.nvm/nvm.sh && nvm use >/dev/null && git add packages/contracts/src/kernel/index.ts packages/contracts/src/kernel/phone.ts packages/contracts/src/kernel/time.ts packages/contracts/test/kernel/phone.test.ts packages/contracts/test/kernel/time.test.ts packages/domain/src/kernel/index.ts packages/domain/src/kernel/time.ts packages/domain/src/kernel/README.md packages/domain/test/kernel/time.test.ts docs/adr/0016-money-tax-and-time.md
git commit -m "feat(domain): add times in the organization's zone, calendar dates and E.164 phone numbers"
```

The track is done: `foundation/03-kernel` adds 13 contracts tests and 37 domain tests to Task 0's counts, and edits no shared file.

---

## Track B: The brand package's logo, icons and name check

- **Delivers:** placeholder logo marks, a test that fails if the product name appears outside `packages/brand` and
  `docs/`, the api's authenticator label from the brand, and app icons generated from the logo at build time (spec 10).
- **Branch:** `foundation/03-brand`, in the worktree `/Users/ak/personal/travel-crm-03-brand`. No database work.
- **Depends on:** Task 0 only (Task 0.1 made the brand package, its `./assets/*` export, its `build` script and its
  `@resvg/resvg-js` and `tsx` dev dependencies).

### Task B1: Logo marks, and a check that the product name lives only in the brand package

Spec section 10 makes `packages/brand` the one source of the product's identity and asks for a CI check that the
product name appears nowhere else. The check is a Vitest test over every file git tracks or would track, so it runs in
`pnpm check` with no new tooling. The logo files are placeholder marks drawn with paths only, so the icon renderer
(Task B2) needs no fonts. The api's authenticator label, still a typed-in name since plan 2, now reads the brand.

**Files:**
- Create: `packages/brand/assets/logo.svg`, `packages/brand/assets/logo-dark.svg`, `packages/brand/src/assets.ts`,
  `packages/brand/src/name-check.ts`, `docs/adr/0017-brand-package.md`
- Modify: `packages/brand/src/index.ts`, `packages/brand/README.md`, `apps/api/src/environment.ts`
- Test: `packages/brand/test/product-name.test.ts`, `packages/brand/test/assets.test.ts`,
  `apps/api/test/environment.test.ts` (one new test)

**Interfaces:**
- Consumes: `brand` from `@travel-crm/brand` (Task 0.1): `brand.productName` (`"Travel Agency OS"`),
  `brand.shortName` (`"Agency OS"`), `brand.colours.ink` (`"#1a1a1a"`), `brand.colours.canvas` (`"#fffdf9"`);
  `authSettingsFrom(environment: Environment): AuthSettings` in `apps/api/src/environment.ts` (plan 2).
- Produces:
  - `brandAssets: { readonly logo: string; readonly logoDark: string }`, absolute paths to the two SVG files, exported
    from `@travel-crm/brand`. The files are also importable as `@travel-crm/brand/assets/logo.svg` and
    `@travel-crm/brand/assets/logo-dark.svg`. The PDF and email adapters and Task B2's renderer read them.
  - `findProductNameOutsideBrand({ files, names }: { files: readonly CheckedFile[]; names: readonly string[] }): NameFinding[]`
    in `packages/brand/src/name-check.ts`, with `CheckedFile = { path: string; text: string }` and
    `NameFinding = { path: string; line: number; text: string }`. Internal to the package (not exported from
    `index.ts`); only the test uses it.
  - `authSettingsFrom(...).appName` is `brand.productName`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-03-brand -b foundation/03-brand foundation/03-shared-services
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
git log -1 --oneline
```
Expected: the install finishes without prompts, and the last commit is Task 0.2's
(`feat: add the shared contracts: actors, domain events and the outbox, organization profile`).

- [ ] **Step 2: Write the failing tests**

`packages/brand/test/product-name.test.ts`:
```ts
// The product's name lives only in the brand package (spec 10): one edit renames the product. The check reads every
// file git tracks or would track; the spec and plans in docs/ name the product on purpose and are skipped.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";
import { findProductNameOutsideBrand } from "../src/name-check.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

/** Every file git tracks, plus new files it would track, as repository-relative paths. */
function repositoryFiles(): { path: string; text: string }[] {
  const listing = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return listing
    .split("\0")
    .filter((file) => file !== "" && existsSync(path.join(repositoryRoot, file)))
    .map((file) => ({ path: file, text: readFileSync(path.join(repositoryRoot, file), "utf8") }));
}

describe("product name check", () => {
  it("finds the product name nowhere outside packages/brand and docs", () => {
    const files = repositoryFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(findProductNameOutsideBrand({ files, names: [brand.productName, brand.shortName] })).toEqual([]);
  });

  it("reports each line that names the product, in any case or spacing", () => {
    const files = [
      { path: "apps/api/src/app.ts", text: 'const title = "Acme Trips";\nconst ok = true;' },
      { path: "packages/ui/src/header.tsx", text: "<h1>ACME   trips</h1>" },
    ];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips"] })).toEqual([
      { path: "apps/api/src/app.ts", line: 1, text: 'const title = "Acme Trips";' },
      { path: "packages/ui/src/header.tsx", line: 1, text: "<h1>ACME   trips</h1>" },
    ]);
  });

  it("reports a line once when it holds the name and the short name", () => {
    const files = [{ path: "README.md", text: "Acme Trips, or Trips for short" }];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips", "Trips"] })).toEqual([
      { path: "README.md", line: 1, text: "Acme Trips, or Trips for short" },
    ]);
  });

  it("skips the brand package, docs and binary files", () => {
    const files = [
      { path: "packages/brand/src/brand.ts", text: 'productName: "Acme Trips"' },
      { path: "docs/superpowers/specs/design.md", text: "Acme Trips is a working name" },
      { path: "apps/web/public/logo.png", text: "\u0089PNG\r\n\u001a\n\u0000\u0000Acme Trips" },
    ];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips"] })).toEqual([]);
  });
});
```

`packages/brand/test/assets.test.ts`:
```ts
// The logo files are plain SVG marks the icon generator can render: square, drawn with paths, no text.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand, brandAssets } from "../src/index.js";

describe("brand assets", () => {
  it("are absolute paths to the two logo files", () => {
    expect(path.isAbsolute(brandAssets.logo)).toBe(true);
    expect(path.basename(brandAssets.logo)).toBe("logo.svg");
    expect(path.basename(brandAssets.logoDark)).toBe("logo-dark.svg");
  });

  it("draw a square mark with paths only, in the brand's ink and warm white", () => {
    for (const [file, mainColour] of [
      [brandAssets.logo, brand.colours.ink],
      [brandAssets.logoDark, brand.colours.canvas],
    ] as const) {
      const svg = readFileSync(file, "utf8");
      const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      expect(viewBox?.[1], file).toBe(viewBox?.[2]);
      expect(svg, file).not.toMatch(/<(text|image|use|style|script)\b/);
      expect(svg, file).toContain(`fill="${mainColour}"`);
      expect(svg, file).toMatch(/placeholder/i);
    }
  });
});
```

In `apps/api/test/environment.test.ts`, replace the imports:
```ts
import { describe, expect, it } from "vitest";
import { authSettingsFrom, EnvironmentError, loadEnvironment } from "../src/environment.js";
```
with:
```ts
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { authSettingsFrom, EnvironmentError, loadEnvironment } from "../src/environment.js";
```
and add this test just before `it("names every missing or malformed variable, without printing values", ...)`:
```ts
  it("names the product to authenticator apps with the brand's name", () => {
    expect(authSettingsFrom(loadEnvironment({ ...valid, NODE_ENV: "development" })).appName).toBe(brand.productName);
  });

```

- [ ] **Step 3: Run them to see them fail**

```bash
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand test
cd /Users/ak/personal/travel-crm-03-brand/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/environment.test.ts
```
Expected: FAIL.
- `test/product-name.test.ts`: `Cannot find module '../src/name-check.js'`.
- `test/assets.test.ts`: 2 failures, `Cannot read properties of undefined (reading 'logo')`.
- `test/environment.test.ts`: `expected 'Travel CRM' to be 'Travel Agency OS'`; the other 10 pass. (`NODE_ENV` defaults to
  production since plan 2, so the test asks for development, as the file's other tests do.)

- [ ] **Step 4: Draw the placeholder logo marks**

`packages/brand/assets/logo.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <!-- Placeholder mark until a designed logo replaces it: a route from a start point to a destination. -->
  <path fill="#1a1a1a" d="M14 0h36a14 14 0 0 1 14 14v36a14 14 0 0 1-14 14H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z"/>
  <path fill="none" stroke="#fffdf9" stroke-width="5" stroke-linecap="round" d="M17 46c6-14 14-4 20-14s6-12 10-16"/>
  <path fill="#fffdf9" d="M47 9a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z"/>
  <path fill="#1a1a1a" d="M47 13a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z"/>
  <path fill="#fffdf9" d="M17 42a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z"/>
</svg>
```

`packages/brand/assets/logo-dark.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <!-- Placeholder mark until a designed logo replaces it: the light logo's colours swapped, for dark surfaces. -->
  <path fill="#fffdf9" d="M14 0h36a14 14 0 0 1 14 14v36a14 14 0 0 1-14 14H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z"/>
  <path fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round" d="M17 46c6-14 14-4 20-14s6-12 10-16"/>
  <path fill="#1a1a1a" d="M47 9a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z"/>
  <path fill="#fffdf9" d="M47 13a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z"/>
  <path fill="#1a1a1a" d="M17 42a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z"/>
</svg>
```

The mark is an ink rounded square with a warm-white route from a start dot to a ringed destination; the dark variant
swaps the two colours. A designed logo replaces both files later; nothing else changes.

- [ ] **Step 5: Export the logo paths**

`packages/brand/src/assets.ts`:
```ts
// Where the brand's logo files are, for the PDF and email adapters and the icon generator.
import path from "node:path";

const assetsDirectory = path.join(import.meta.dirname, "../assets");

/** Absolute paths to the logo files. Both are square SVG marks drawn with paths only. */
export const brandAssets = {
  /** For light surfaces: an ink mark. */
  logo: path.join(assetsDirectory, "logo.svg"),
  /** For dark surfaces: the same mark in warm white. */
  logoDark: path.join(assetsDirectory, "logo-dark.svg"),
} as const;
```

`packages/brand/src/index.ts`:
```ts
// Public API of @travel-crm/brand: the product's name, colours, fonts, contacts and logo files.
export { brandAssets } from "./assets.js";
export { brand, type Brand, type StatusColour } from "./brand.js";
```

- [ ] **Step 6: Write the name check**

`packages/brand/src/name-check.ts`:
```ts
// Finds the product's name outside the brand package (spec 10). Code must read it from @travel-crm/brand, so renaming
// the product is one edit. The spec and plans in docs/ name the product on purpose, so they are skipped.

export interface CheckedFile {
  /** Relative to the repository root, with forward slashes, e.g. "apps/api/src/app.ts". */
  path: string;
  text: string;
}

export interface NameFinding {
  path: string;
  /** 1-based. */
  line: number;
  text: string;
}

/** Folders that may name the product: the brand package itself, and the design documents. */
const exemptFolders = ["packages/brand/", "docs/"];

/** A pattern for one name: any case, and any run of spaces between its words. */
function namePattern(name: string): RegExp {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(words.join("\\s+"), "i");
}

/** Every line, outside the exempt folders and binary files, that contains one of the names. One finding per line. */
export function findProductNameOutsideBrand({
  files,
  names,
}: {
  files: readonly CheckedFile[];
  names: readonly string[];
}): NameFinding[] {
  const patterns = names.map(namePattern);
  return (
    files
      .filter((file) => !exemptFolders.some((folder) => file.path.startsWith(folder)))
      // A NUL character means binary content (images, fonts), which can't carry the name as text.
      .filter((file) => !file.text.includes("\u0000"))
      .flatMap((file) =>
        file.text
          .split(/\r?\n/)
          .map((text, index) => ({ path: file.path, line: index + 1, text }))
          .filter((line) => patterns.some((pattern) => pattern.test(line.text))),
      )
  );
}
```

- [ ] **Step 7: Read the authenticator label from the brand**

In `apps/api/src/environment.ts`, replace the identity import:
```ts
import type { AuthSettings } from "@travel-crm/domain/identity";
```
with (after the `node:net` import):
```ts
import { brand } from "@travel-crm/brand";
import type { AuthSettings } from "@travel-crm/domain/identity";
```
and in `authSettingsFrom`, replace:
```ts
    // The product's name moves to the brand package (spec section 10) when that package exists.
    appName: "Travel CRM",
```
with:
```ts
    // Authenticator apps show the product's name next to the code.
    appName: brand.productName,
```
(`apps/api` already depends on `@travel-crm/brand` since Task 0.1.)

- [ ] **Step 8: Run the tests to see them pass**

```bash
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand test
cd /Users/ak/personal/travel-crm-03-brand/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/environment.test.ts
```
Expected: the brand package passes 9 tests in 3 files (the repository scan finds nothing); the environment tests pass
11. If the scan reports a file, the product's name has leaked there: read it from `@travel-crm/brand` instead.

- [ ] **Step 9: Document the package and the decision**

`packages/brand/README.md`:
```markdown
# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts, contacts and logo. One source of truth.

    import { brand, brandAssets } from "@travel-crm/brand";
    brand.productName; // "Travel Agency OS"
    brand.colours.money; // "#034f46"
    brandAssets.logo; // absolute path to assets/logo.svg

- Code reads the product name only through this package. `test/product-name.test.ts` fails if `brand.productName`
  or `brand.shortName` appears in any file outside `packages/brand/` and `docs/` (it runs in `pnpm check`).
- `assets/logo.svg` (for light surfaces) and `assets/logo-dark.svg` (for dark ones) are placeholder marks drawn with
  paths only, until a designed logo replaces them. Other packages can import them as `@travel-crm/brand/assets/<file>`.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
```

`docs/adr/0017-brand-package.md`:
```markdown
# 0017: The brand package

Date: 2026-10-15 · Status: accepted · Implements spec section 10

## Decision

- **`@travel-crm/brand` is the one source of the product's identity**: its name, short name, tagline, colours, fonts,
  contacts and logo files. Every layer may read it; it reads no other package (dependency-cruiser,
  `brand-depends-on-nothing-of-ours`).
- **The product name appears nowhere else.** `packages/brand/test/product-name.test.ts` reads every file git tracks
  or would track and fails on any line holding `brand.productName` or `brand.shortName`, in any letter case or
  spacing, outside `packages/brand/` and `docs/`. Being a test, it runs in `pnpm check` and CI (spec 12.1, gate 3).
  - `docs/` is exempt because the spec and plans name the product on purpose, as the working name (open item Q8).
  - Binary files are skipped: they can't carry the name as text.
- **The api's authenticator label** (`appName` in `apps/api/src/environment.ts`) is `brand.productName`.
- **The logo is a placeholder mark** (`assets/logo.svg`, `assets/logo-dark.svg`): a route from a start point to a
  destination, ink and warm white, drawn with paths only so tools without fonts can render it. A designed logo
  replaces the two files; nothing else changes.

## Context

- **Why a test and not a lint rule.** The name can appear in any file type (Markdown, JSON, YAML, HTML), not only in
  TypeScript. A test over git's file list covers them all with no extra tooling, and its failure lists file and line.
- **Why `git ls-files`.** It is the set CI checks out: ignored files (`node_modules`, `dist`, `.env`) are left out, and
  new files are checked before they are committed.

## Consequences

- Renaming the product (Q8) is an edit to `packages/brand/src/brand.ts` and nothing else in code.
- An organization's own logo, colours and terms on its quotes and invoices are settings in the database, never brand
  values; the PDF and email layouts take both.
```

(The Integration task adds ADR 0017 to `docs/adr/README.md`.)

- [ ] **Step 10: Check**

```bash
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise
```
This is `pnpm check` with fewer test containers at once, while other tracks run on the same machine. Expected: green;
23 Turborepo tasks; test counts `api-server=73 api=5 brand=9 contracts=18 db=111 domain=121 eslint-config=65
integrations=6`; no dependency violations. If the first run after the install fails with `ENOTEMPTY ... .vitest-cache`,
delete `node_modules/.vitest-cache` and run it again.

- [ ] **Step 11: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-brand
git add packages/brand/assets/logo.svg packages/brand/assets/logo-dark.svg packages/brand/src/assets.ts packages/brand/src/name-check.ts packages/brand/src/index.ts packages/brand/test/assets.test.ts packages/brand/test/product-name.test.ts packages/brand/README.md apps/api/src/environment.ts apps/api/test/environment.test.ts docs/adr/0017-brand-package.md
git commit -m "feat(brand): add the logo marks and a check that the product name lives only in the brand package"
```

---

### Task B2: App icons generated from the logo at build time

Spec section 10: app icons, the PWA manifest's icons and the favicon are generated from the logo at build time.
`scripts/render-icons.ts` renders them with `@resvg/resvg-js` (prebuilt, no install script, no system libraries).
It lives outside `src/` because resvg is a dev dependency: dependency-cruiser's `not-to-dev-dep` rule covers `src/`,
so nothing that ships can import it. `pwaIcons`, plain data in `src/`, tells the web app (plan 5) what its manifest
lists. A one-image `.ico` is a 22-byte header around a PNG, written by hand.

**Files:**
- Create: `packages/brand/scripts/render-icons.ts`, `packages/brand/scripts/generate-icons.ts`,
  `packages/brand/src/icons.ts`
- Modify: `packages/brand/src/index.ts`, `packages/brand/tsconfig.json`, `packages/brand/README.md`,
  `docs/adr/0017-brand-package.md`
- Test: `packages/brand/test/icons.test.ts`

**Interfaces:**
- Consumes: `brandAssets.logo` (Task B1); `brand.colours.ink` and `brand.colours.canvas` (Task 0.1); the package's
  `"build": "tsx scripts/generate-icons.ts"` script (Task 0.1, which fails until this task creates the file).
- Produces:
  - `pwaIcons: readonly PwaIcon[]` and `PwaIcon = { src: string; sizes: string; type: "image/png"; purpose: "any" | "maskable" }`
    from `@travel-crm/brand`: `/icons/icon-192.png` (any), `/icons/icon-512.png` (any),
    `/icons/icon-maskable-512.png` (maskable). Plan 5 serves `dist/icons` under `/icons/`.
  - `generateIcons(outputDirectory: string): Promise<string[]>` and `icoFromPng(png: Uint8Array, size: number): Uint8Array`
    in `packages/brand/scripts/render-icons.ts` (build-time only).
  - `pnpm --filter @travel-crm/brand build` (or `turbo run build`) writes `dist/icons/`: `favicon.svg`, `favicon.ico`,
    `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

- [ ] **Step 1: Write the failing test**

`packages/brand/test/icons.test.ts`:
```ts
// The build turns the logo into the favicon, the home-screen icons and the PWA manifest's icons, at the right sizes.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateIcons } from "../scripts/render-icons.js";
import { brand, brandAssets, pwaIcons } from "../src/index.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's size and its top-left pixel. Only 8-bit RGBA, which is what the renderer writes. */
function readPng(png: Buffer): { width: number; height: number; topLeft: number[] } {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect([png[24], png[25]]).toEqual([8, 6]); // bit depth 8, colour type 6 (RGBA)
  const pixelData: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "IDAT") {
      pixelData.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  // The first row's first pixel is stored as is whatever the row's filter: there is no pixel left of or above it.
  const rows = inflateSync(Buffer.concat(pixelData));
  return { width, height, topLeft: [...rows.subarray(1, 5)] };
}

/** "#1a1a1a" as an opaque RGBA pixel. */
const opaque = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).concat(255);

describe("generated icons", () => {
  let directory: string;
  let written: string[];
  const read = (fileName: string) => readFile(path.join(directory, fileName));

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "brand-icons-"));
    written = await generateIcons(directory);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes the favicon, the home-screen icons and the manifest icons", async () => {
    const expected = [
      "apple-touch-icon.png",
      "favicon-32.png",
      "favicon.ico",
      "favicon.svg",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ];
    expect([...written].sort()).toEqual(expected);
    expect((await readdir(directory)).sort()).toEqual(expected);
  });

  it("renders each PNG at its size", async () => {
    const sizes = {
      "favicon-32.png": 32,
      "apple-touch-icon.png": 180,
      "icon-192.png": 192,
      "icon-512.png": 512,
      "icon-maskable-512.png": 512,
    };
    for (const [fileName, size] of Object.entries(sizes)) {
      const { width, height } = readPng(await read(fileName));
      expect([width, height], fileName).toEqual([size, size]);
    }
  });

  it("fills the maskable icon to its edges with ink, and the Apple icon with warm white", async () => {
    expect(readPng(await read("icon-maskable-512.png")).topLeft).toEqual(opaque(brand.colours.ink));
    expect(readPng(await read("apple-touch-icon.png")).topLeft).toEqual(opaque(brand.colours.canvas));
    // The plain icons keep the mark's rounded corners on a transparent background.
    expect(readPng(await read("icon-512.png")).topLeft[3]).toBe(0);
  });

  it("wraps the 32-pixel PNG in a valid .ico file", async () => {
    const ico = await read("favicon.ico");
    const png = await read("favicon-32.png");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 1]);
    expect([ico[6], ico[7], ico.readUInt16LE(10), ico.readUInt16LE(12)]).toEqual([32, 32, 1, 32]);
    expect([ico.readUInt32LE(14), ico.readUInt32LE(18)]).toEqual([png.length, 22]);
    expect(ico.subarray(22).equals(png)).toBe(true);
  });

  it("copies the logo as the SVG favicon", async () => {
    expect(await read("favicon.svg")).toEqual(await readFile(brandAssets.logo));
  });

  it("lists, for the PWA manifest, exactly the icons it wrote", async () => {
    for (const icon of pwaIcons) {
      const { width, height } = readPng(await read(path.basename(icon.src)));
      expect(icon.sizes).toBe(`${String(width)}x${String(height)}`);
    }
    expect(pwaIcons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /Users/ak/personal/travel-crm-03-brand/packages/brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/icons.test.ts
```
Expected: FAIL with `Cannot find module '../scripts/render-icons.js'`.

- [ ] **Step 3: List the manifest's icons**

`packages/brand/src/icons.ts`:
```ts
// The icons the build generates from the logo (scripts/generate-icons.ts), as data for the PWA manifest (plan 5).
// Only data here: rendering is a build-time tool and never ships.

export interface PwaIcon {
  /** Where the web app serves the file: the build writes dist/icons/<file>, served under /icons/. */
  src: string;
  sizes: string;
  type: "image/png";
  /** "maskable" icons fill a square the device crops to its own shape; "any" icons are shown as drawn. */
  purpose: "any" | "maskable";
}

export const pwaIcons: readonly PwaIcon[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
```

`packages/brand/src/index.ts`:
```ts
// Public API of @travel-crm/brand: the product's name, colours, fonts, contacts, logo files and icon list.
export { brandAssets } from "./assets.js";
export { brand, type Brand, type StatusColour } from "./brand.js";
export { pwaIcons, type PwaIcon } from "./icons.js";
```

- [ ] **Step 4: Write the renderer and the build script**

`packages/brand/scripts/render-icons.ts`:
```ts
// Renders the favicon, the home-screen icons and the PWA manifest's icons from assets/logo.svg (spec 10).
// Build-time only: it uses @resvg/resvg-js, a dev dependency, which is why it lives outside src/.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { brandAssets } from "../src/assets.js";
import { brand } from "../src/brand.js";

interface PngIcon {
  fileName: string;
  /** Width and height in pixels. */
  size: number;
  /** A colour behind the mark, or null to keep it transparent. */
  background: string | null;
  /** How much of the side the mark fills, centred. */
  markScale: number;
}

const pngIcons: readonly PngIcon[] = [
  { fileName: "favicon-32.png", size: 32, background: null, markScale: 1 },
  // iOS puts home-screen icons on its own rounded square and fills transparency with black: give it the page colour.
  { fileName: "apple-touch-icon.png", size: 180, background: brand.colours.canvas, markScale: 0.8 },
  { fileName: "icon-192.png", size: 192, background: null, markScale: 1 },
  { fileName: "icon-512.png", size: 512, background: null, markScale: 1 },
  // Devices crop maskable icons to their own shape, keeping only the central 80 % (the safe zone) for sure.
  { fileName: "icon-maskable-512.png", size: 512, background: brand.colours.ink, markScale: 0.8 },
];

const FAVICON_SIZE = 32;

/** The logo's viewBox and drawing, so the mark can be placed inside a larger canvas. */
function parseLogo(svg: string): { viewBox: string; drawing: string } {
  const match = /<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg);
  if (!match?.[1] || match[2] === undefined) throw new Error("The logo must be an <svg> with a viewBox");
  return { viewBox: match[1], drawing: match[2] };
}

function iconSvg(logo: { viewBox: string; drawing: string }, icon: PngIcon): string {
  const side = icon.size;
  const markSide = side * icon.markScale;
  const offset = (side - markSide) / 2;
  const background = icon.background
    ? `<rect width="${String(side)}" height="${String(side)}" fill="${icon.background}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(side)}" height="${String(side)}" viewBox="0 0 ${String(side)} ${String(side)}">` +
    background +
    `<svg x="${String(offset)}" y="${String(offset)}" width="${String(markSide)}" height="${String(markSide)}" viewBox="${logo.viewBox}">` +
    logo.drawing +
    "</svg></svg>"
  );
}

/**
 * An .ico file holding one PNG image, which every current browser reads: a 6-byte header (reserved, type 1 for
 * icons, one image), one 16-byte directory entry (size, colour planes, bits per pixel, length, offset 22), the PNG.
 */
export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

/** Writes every icon into outputDirectory (created if missing) and returns the file names written. */
export async function generateIcons(outputDirectory: string): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const logo = parseLogo(await readFile(brandAssets.logo, "utf8"));
  const written: string[] = [];

  for (const icon of pngIcons) {
    const png = new Resvg(iconSvg(logo, icon)).render().asPng();
    await writeFile(path.join(outputDirectory, icon.fileName), png);
    written.push(icon.fileName);
    if (icon.size === FAVICON_SIZE) {
      await writeFile(path.join(outputDirectory, "favicon.ico"), icoFromPng(png, FAVICON_SIZE));
      written.push("favicon.ico");
    }
  }
  // Browsers that read SVG favicons get the logo itself, sharp at any size.
  await copyFile(brandAssets.logo, path.join(outputDirectory, "favicon.svg"));
  written.push("favicon.svg");
  return written;
}
```

`packages/brand/scripts/generate-icons.ts`:
```ts
// `pnpm --filter @travel-crm/brand build`: writes the icons into dist/icons, or into the folder given as an argument.
import path from "node:path";
import { generateIcons } from "./render-icons.js";

const outputDirectory = process.argv[2] ?? path.join(import.meta.dirname, "../dist/icons");
const written = await generateIcons(outputDirectory);
console.log(`Wrote ${String(written.length)} icons to ${outputDirectory}`);
```

Typecheck and lint the scripts with the rest of the package. `packages/brand/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "scripts", "test", "vitest.config.ts"]
}
```

- [ ] **Step 5: Run the tests to see them pass, and build the icons**

```bash
cd /Users/ak/personal/travel-crm-03-brand/packages/brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm exec eslint .
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec turbo run build --filter=@travel-crm/brand && ls packages/brand/dist/icons && git status --short
```
Expected: 15 tests pass in 4 files, typecheck and lint print nothing; the build prints
`Wrote 7 icons to .../packages/brand/dist/icons` and `1 successful, 1 total`; the folder holds `apple-touch-icon.png`,
`favicon-32.png`, `favicon.ico`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; `git status`
doesn't list `dist/` (it is ignored). Then `rm -rf packages/brand/dist`.

- [ ] **Step 6: Document the icons**

In `packages/brand/README.md`, replace:
```markdown
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
```
with:
```markdown
- `pnpm --filter @travel-crm/brand build` renders the icons from `assets/logo.svg` into `dist/icons`: `favicon.svg`,
  `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and
  `icon-maskable-512.png`. `pwaIcons` lists the manifest's icons for the web app (plan 5), which serves them under
  `/icons/`. The renderer (`scripts/render-icons.ts`, using `@resvg/resvg-js`) runs at build time only.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
```

In `docs/adr/0017-brand-package.md`, replace:
```markdown
  destination, ink and warm white, drawn with paths only so tools without fonts can render it. A designed logo
  replaces the two files; nothing else changes.
```
with:
```markdown
  destination, ink and warm white, drawn with paths only so tools without fonts can render it. A designed logo
  replaces the two files; nothing else changes.
- **Icons are generated at build time** from `assets/logo.svg` by `scripts/render-icons.ts`
  (`pnpm --filter @travel-crm/brand build`, into `dist/icons`, which git ignores): an SVG and a 32-pixel favicon (also
  wrapped in `favicon.ico`), a 180-pixel Apple touch icon on warm white, 192- and 512-pixel icons, and a 512-pixel
  maskable icon whose mark sits inside the central 80 % safe zone on ink. `pwaIcons` (in `src/`) lists the manifest's
  icons as plain data, so the web app's manifest (plan 5) needs no renderer.
```
and replace:
```markdown
- **Why `git ls-files`.** It is the set CI checks out: ignored files (`node_modules`, `dist`, `.env`) are left out, and
  new files are checked before they are committed.
```
with:
```markdown
- **Why `git ls-files`.** It is the set CI checks out: ignored files (`node_modules`, `dist`, `.env`) are left out, and
  new files are checked before they are committed.
- **Why resvg, and the renderer outside `src/`.** `@resvg/resvg-js` renders SVG to PNG from prebuilt binaries with no
  install script and no system libraries. It is a dev dependency, used only by `scripts/`, which dependency-cruiser's
  `not-to-dev-dep` rule allows; nothing that ships imports it. A one-image `.ico` is a 22-byte header around a PNG, so
  it needs no library.
```

- [ ] **Step 7: Check**

```bash
cd /Users/ak/personal/travel-crm-03-brand && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise
```
Expected: green; 23 Turborepo tasks; test counts `api-server=73 api=5 brand=15 contracts=18 db=111 domain=121
eslint-config=65 integrations=6`; no dependency violations (the renderer's import of `@resvg/resvg-js` is allowed
because `scripts/` is outside `src/`).

- [ ] **Step 8: Commit**

```bash
cd /Users/ak/personal/travel-crm-03-brand
git add packages/brand/scripts/render-icons.ts packages/brand/scripts/generate-icons.ts packages/brand/src/icons.ts packages/brand/src/index.ts packages/brand/test/icons.test.ts packages/brand/tsconfig.json packages/brand/README.md docs/adr/0017-brand-package.md
git commit -m "feat(brand): generate the favicon, home-screen and PWA icons from the logo at build time"
```

The track is done: `foundation/03-brand` is ready for the Integration task to merge.

---

## Integration

Every track is done. These four tasks run in order on `foundation/03-shared-services`, in the main checkout
(`/Users/ak/personal/travel-crm`). They merge the tracks, make the edits the tracks left to them, and wire the
services into the api and the worker.

### Task I1: Merge the tracks, and give every plan 3 table its organization key

The tracks' organization tables have no relation to `Organization` yet, because that would have meant every track
editing `organization.prisma`. This task merges the tracks, adds every relation and foreign key in one migration,
adds a test that every organization table refers to its organization (so a later table can't forget), and fills in
the index files the tracks left alone.

**Files:**
- Merge: `foundation/03-{jobs,files,documents,public,notifications,audit,kernel,brand}`
- Modify: `packages/db/prisma/schema/{organization,jobs,files,documents,share-links,notifications,audit}.prisma`
- Create: `packages/db/prisma/migrations/20261015190000_organization_foreign_keys/migration.sql`
- Test: `packages/db/test/organization-keys.test.ts`
- Modify: `docs/adr/README.md`, `docs/adr/0012-pdfs-and-issued-documents.md`, `packages/domain/README.md`,
  `packages/integrations/README.md`

**Interfaces:**
- Consumes: every track's last commit.
- Produces: an `organization` relation (and foreign key, `ON DELETE RESTRICT`) on `ProcessedEvent`, `Attachment`,
  `IssuedDocument`, `ShareLink`, `ShareLinkOpen`, `Notification`, `NotificationPreference`, `PushSubscription` and
  `AuditEntry`, with back-relations on `Organization`; `IssuedDocument.pdfAttachment` (composite key to
  `attachment (organization_id, id)`) and `Attachment.issuedDocuments`.

- [ ] **Step 1: Merge every track**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
git switch foundation/03-shared-services
for track in jobs files documents public notifications audit kernel brand; do
  git merge --no-ff "foundation/03-$track" -m "chore: merge foundation/03-$track"
done
pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && rm -rf node_modules/.vitest-cache
pnpm check
```
Expected: every merge is clean (the tracks touch disjoint files; the order doesn't matter, and was checked forwards
and backwards). Had `documents` been merged first, the `files` merge would say "Already up to date": D2 merged it. `pnpm check` is green.
Test counts: api-server 95, api 5, brand 15, contracts 57, db 163, domain 273, eslint-config 65, integrations 53
(726 in all).

If a merge does conflict, a track edited a file outside its list in the Tracks table: keep both sides' changes, and
check the track's tests still pass.

- [ ] **Step 2: Write the failing test**

In `packages/db/test/organization-keys.test.ts`:

replace:
```ts
//   without row-level security;
// - a unique constraint without it tells one organization that another already uses a value.
// The primary key on `id` alone is the exception: random UUIDs reveal nothing. Each check has a probe (run in a
```
with:
```ts
//   without row-level security;
// - a unique constraint without it tells one organization that another already uses a value;
// - with no foreign key from organization_id to organization, a row could name an organization that doesn't exist.
// The primary key on `id` alone is the exception: random UUIDs reveal nothing. Each check has a probe (run in a
```

replace:
```ts

class Rollback extends Error {}
```
with:
```ts

/** Tables with organization_id that have no foreign key from that column to organization. */
async function tablesWithoutOrganizationForeignKey(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint fk
        WHERE fk.contype = 'f' AND fk.conrelid = c.oid AND fk.confrelid = 'organization'::regclass
          AND fk.conkey = ARRAY[a.attnum])
    ORDER BY c.relname`;
  return rows.map((row) => row.table_name);
}

class Rollback extends Error {}
```

replace:
```ts

  it("catches a foreign key that leaves organization_id out", async () => {
```
with:
```ts

  it("refer to the organization from every organization table", async () => {
    expect(await tablesWithoutOrganizationForeignKey(platform)).toEqual([]);
  });

  it("catches an organization table with no foreign key to organization", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE orphan_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL)`;
      expect(await tablesWithoutOrganizationForeignKey(tx)).toEqual(["orphan_probe"]);
      await tx.$executeRaw`ALTER TABLE orphan_probe ADD FOREIGN KEY (organization_id) REFERENCES organization (id)`;
      expect(await tablesWithoutOrganizationForeignKey(tx)).toEqual([]);
    });
  });

  it("catches a foreign key that leaves organization_id out", async () => {
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test test/organization-keys.test.ts`

Expected: FAIL. Both new tests list the nine plan 3 tables with no foreign key to `organization` yet:
`attachment`, `audit_entry`, `issued_document`, `notification`, `notification_preference`, `processed_event`,
`push_subscription`, `share_link` and `share_link_open`.

- [ ] **Step 3: Give each table its relation, and make the migration**

Each model gains `organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)`,
and `Organization` its back-relations. The files' header comments that promised this task go. Prisma's formatter
realigns the models' columns, so whole models change:

In `packages/db/prisma/schema/organization.prisma`:

replace:
```prisma
model Organization {
  id               String           @id @default(uuid(7)) @db.Uuid
  name             String
  /// Short sign-in code such as SHARMA: 3-12 capital letters or digits (CHECK organization_code_format).
  /// Usernames embed it, so it must not change once the organization has staff.
  code             String           @unique
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// Better Auth organization plugin columns. Unused by our code.
  logo             String?
  metadata         String?
  /// When true, every member must turn on two-factor sign-in before using the app (spec 6.2).
  requireTwoFactor Boolean          @default(false) @map("require_two_factor")
  /// The IANA time zone the organization works in. Times are stored in UTC and shown in this zone (spec 9.6).
  timeZone         String           @default("Asia/Kolkata") @map("time_zone")
  /// Where replies to email the product sends for this organization go (spec 9.4). Set at onboarding (plan 4).
  contactEmail     String?          @map("contact_email")
  counters         OrgCounter[]
  members          Member[]
  invitations      Invitation[]
  roles            Role[]
  rolePermissions  RolePermission[]
  outboxEvents     OutboxEvent[]
```
with:
```prisma
model Organization {
  id                      String                   @id @default(uuid(7)) @db.Uuid
  name                    String
  /// Short sign-in code such as SHARMA: 3-12 capital letters or digits (CHECK organization_code_format).
  /// Usernames embed it, so it must not change once the organization has staff.
  code                    String                   @unique
  createdAt               DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt               DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// Better Auth organization plugin columns. Unused by our code.
  logo                    String?
  metadata                String?
  /// When true, every member must turn on two-factor sign-in before using the app (spec 6.2).
  requireTwoFactor        Boolean                  @default(false) @map("require_two_factor")
  /// The IANA time zone the organization works in. Times are stored in UTC and shown in this zone (spec 9.6).
  timeZone                String                   @default("Asia/Kolkata") @map("time_zone")
  /// Where replies to email the product sends for this organization go (spec 9.4). Set at onboarding (plan 4).
  contactEmail            String?                  @map("contact_email")
  counters                OrgCounter[]
  members                 Member[]
  invitations             Invitation[]
  roles                   Role[]
  rolePermissions         RolePermission[]
  outboxEvents            OutboxEvent[]
  processedEvents         ProcessedEvent[]
  attachments             Attachment[]
  issuedDocuments         IssuedDocument[]
  shareLinks              ShareLink[]
  shareLinkOpens          ShareLinkOpen[]
  notifications           Notification[]
  notificationPreferences NotificationPreference[]
  pushSubscriptions       PushSubscription[]
  auditEntries            AuditEntry[]
```

In `packages/db/prisma/schema/jobs.prisma`:

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  /// The listener's name, which is also its job queue, e.g. "documents.render-pdf".
  listener       String
  eventId        String   @map("event_id") @db.Uuid
  processedAt    DateTime @default(now()) @map("processed_at") @db.Timestamptz(6)
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  /// The listener's name, which is also its job queue, e.g. "documents.render-pdf".
  listener       String
  eventId        String       @map("event_id") @db.Uuid
  processedAt    DateTime     @default(now()) @map("processed_at") @db.Timestamptz(6)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

In `packages/db/prisma/schema/files.prisma`:

replace:
```prisma
// soft-deleted (ADR 0004). The bytes live in object storage under a key made from organization_id and id.
// Its organization relation and foreign key are added with every plan 3 table's, in plan 3's Integration task.
```
with:
```prisma
// soft-deleted (ADR 0004). The bytes live in object storage under a key made from organization_id and id.
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String    @id @default(uuid(7)) @db.Uuid
  /// The kind of record, e.g. "issued_document" or "lead" (CHECK attachment_record_type_format).
  recordType     String    @map("record_type")
  recordId       String    @map("record_id") @db.Uuid
  /// The name it downloads as, e.g. "Passport - Asha.pdf".
  fileName       String    @map("file_name")
  contentType    String    @map("content_type")
  /// Counts toward the organization's storage, deleted files included until a purge (CHECK attachment_size_positive).
  sizeBytes      Int       @map("size_bytes")
  /// Traveller ID documents such as passports: viewing needs documents:view_sensitive (spec 5).
  sensitive      Boolean   @default(false)
  /// "pending" until the uploaded file is confirmed in storage, then "ready" (CHECK attachment_status_value).
  status         String    @default("pending")
  /// Who uploaded it; null for files the system made, such as rendered PDFs.
  createdBy      String?   @map("created_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  /// When the file was confirmed in storage; set exactly when status is "ready".
  confirmedAt    DateTime? @map("confirmed_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever deleted it; null when the system did.
  deletedBy      String?   @map("deleted_by") @db.Uuid
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String           @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String           @id @default(uuid(7)) @db.Uuid
  /// The kind of record, e.g. "issued_document" or "lead" (CHECK attachment_record_type_format).
  recordType      String           @map("record_type")
  recordId        String           @map("record_id") @db.Uuid
  /// The name it downloads as, e.g. "Passport - Asha.pdf".
  fileName        String           @map("file_name")
  contentType     String           @map("content_type")
  /// Counts toward the organization's storage, deleted files included until a purge (CHECK attachment_size_positive).
  sizeBytes       Int              @map("size_bytes")
  /// Traveller ID documents such as passports: viewing needs documents:view_sensitive (spec 5).
  sensitive       Boolean          @default(false)
  /// "pending" until the uploaded file is confirmed in storage, then "ready" (CHECK attachment_status_value).
  status          String           @default("pending")
  /// Who uploaded it; null for files the system made, such as rendered PDFs.
  createdBy       String?          @map("created_by") @db.Uuid
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  /// When the file was confirmed in storage; set exactly when status is "ready".
  confirmedAt     DateTime?        @map("confirmed_at") @db.Timestamptz(6)
  deletedAt       DateTime?        @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever deleted it; null when the system did.
  deletedBy       String?          @map("deleted_by") @db.Uuid
  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  /// Issued documents whose rendered PDF this is.
  issuedDocuments IssuedDocument[]
```

In `packages/db/prisma/schema/documents.prisma`:

replace:
```prisma
// renders once and never again. Organization-owned; the api and worker may only attach the rendered PDF to a row.
// The organization relation, and the foreign key from pdf_attachment_id to attachment, are added with every plan 3
// table's in plan 3's Integration task.
```
with:
```prisma
// renders once and never again. Organization-owned; the api and worker may only attach the rendered PDF to a row.
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String    @id @default(uuid(7)) @db.Uuid
  /// The template it renders with, e.g. "sample".
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String       @id @default(uuid(7)) @db.Uuid
  /// The template it renders with, e.g. "sample".
```

replace:
```prisma
  /// The content and branding exactly as issued, a JSON object (CHECK issued_document_render_input_object).
  renderInput     Json      @map("render_input")
  /// Who issued it; null when the system did.
  issuedBy        String?   @map("issued_by") @db.Uuid
  issuedAt        DateTime  @default(now()) @map("issued_at") @db.Timestamptz(6)
  /// The rendered PDF, an attachment of this document. Set once, never replaced (CHECK issued_document_rendered).
  pdfAttachmentId String?   @map("pdf_attachment_id") @db.Uuid
  renderedAt      DateTime? @map("rendered_at") @db.Timestamptz(6)
```
with:
```prisma
  /// The content and branding exactly as issued, a JSON object (CHECK issued_document_render_input_object).
  renderInput     Json         @map("render_input")
  /// Who issued it; null when the system did.
  issuedBy        String?      @map("issued_by") @db.Uuid
  issuedAt        DateTime     @default(now()) @map("issued_at") @db.Timestamptz(6)
  /// The rendered PDF, an attachment of this document. Set once, never replaced (CHECK issued_document_rendered).
  pdfAttachmentId String?      @map("pdf_attachment_id") @db.Uuid
  renderedAt      DateTime?    @map("rendered_at") @db.Timestamptz(6)
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  pdfAttachment   Attachment?  @relation(fields: [organizationId, pdfAttachmentId], references: [organizationId, id], onDelete: Restrict)
```

In `packages/db/prisma/schema/share-links.prisma`:

replace:
```prisma
  opens          ShareLinkOpen[]
```
with:
```prisma
  opens          ShareLinkOpen[]
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String    @id @default(uuid(7)) @db.Uuid
  shareLinkId    String    @map("share_link_id") @db.Uuid
  openedAt       DateTime  @default(now()) @map("opened_at") @db.Timestamptz(6)
  /// The visitor's network, not their address: IPv4 cut to /24, IPv6 to /48.
  ipAddress      String?   @map("ip_address")
  /// The browser's User-Agent, at most 300 characters.
  userAgent      String?   @map("user_agent")
  shareLink      ShareLink @relation(fields: [organizationId, shareLinkId], references: [organizationId, id], onDelete: Restrict)
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String       @id @default(uuid(7)) @db.Uuid
  shareLinkId    String       @map("share_link_id") @db.Uuid
  openedAt       DateTime     @default(now()) @map("opened_at") @db.Timestamptz(6)
  /// The visitor's network, not their address: IPv4 cut to /24, IPv6 to /48.
  ipAddress      String?      @map("ip_address")
  /// The browser's User-Agent, at most 300 characters.
  userAgent      String?      @map("user_agent")
  shareLink      ShareLink    @relation(fields: [organizationId, shareLinkId], references: [organizationId, id], onDelete: Restrict)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

In `packages/db/prisma/schema/notifications.prisma`:

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String    @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String    @id @default(uuid(7)) @db.Uuid
  /// Who it is for. Delivery checks they are still an active member.
  recipientUserId String    @map("recipient_user_id") @db.Uuid
  /// "<entity>.<what happened>", e.g. "share-link.opened" (CHECK notification_kind_format). Opt-outs are per kind.
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId  String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id              String       @id @default(uuid(7)) @db.Uuid
  /// Who it is for. Delivery checks they are still an active member.
  recipientUserId String       @map("recipient_user_id") @db.Uuid
  /// "<entity>.<what happened>", e.g. "share-link.opened" (CHECK notification_kind_format). Opt-outs are per kind.
```

replace:
```prisma
  link            String?
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  readAt          DateTime? @map("read_at") @db.Timestamptz(6)
  /// When the email went out, so a retried delivery doesn't send it again.
  emailedAt       DateTime? @map("emailed_at") @db.Timestamptz(6)
  /// When every push subscription was tried, for the same reason.
  pushedAt        DateTime? @map("pushed_at") @db.Timestamptz(6)
```
with:
```prisma
  link            String?
  createdAt       DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  readAt          DateTime?    @map("read_at") @db.Timestamptz(6)
  /// When the email went out, so a retried delivery doesn't send it again.
  emailedAt       DateTime?    @map("emailed_at") @db.Timestamptz(6)
  /// When every push subscription was tried, for the same reason.
  pushedAt        DateTime?    @map("pushed_at") @db.Timestamptz(6)
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  /// "email" or "push" (CHECK notification_preference_channel). The bell can't be turned off.
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  /// "email" or "push" (CHECK notification_preference_channel). The bell can't be turned off.
```

replace:
```prisma
  kind           String
  optedOut       Boolean  @map("opted_out")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
```
with:
```prisma
  kind           String
  optedOut       Boolean      @map("opted_out")
  updatedAt      DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String   @id @default(uuid(7)) @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  /// The push service's URL for this browser. A browser that subscribes again for another person moves to them.
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String       @id @default(uuid(7)) @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  /// The push service's URL for this browser. A browser that subscribes again for another person moves to them.
```

replace:
```prisma
  auth           String
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
```
with:
```prisma
  auth           String
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

In `packages/db/prisma/schema/audit.prisma`:

replace:
```prisma
// transaction as the change. Organization-owned and append-only: the api and worker add entries and never change or
// delete one (the migration revokes UPDATE and DELETE). No relation to Organization yet: plan 3's Integration task
// adds it with the other tracks' tables.
```
with:
```prisma
// transaction as the change. Organization-owned and append-only: the api and worker add entries and never change or
// delete one (the migration revokes UPDATE and DELETE).
```

replace:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String   @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String   @id @default(uuid(7)) @db.Uuid
  occurredAt     DateTime @default(now()) @map("occurred_at") @db.Timestamptz(6)
  /// The person acting, or null for the system (a job no person started).
  actorUserId    String?  @map("actor_user_id") @db.Uuid
  /// "web", "api", "job" or "impersonation" (CHECK audit_entry_source_value).
```
with:
```prisma
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String       @id @default(uuid(7)) @db.Uuid
  occurredAt     DateTime     @default(now()) @map("occurred_at") @db.Timestamptz(6)
  /// The person acting, or null for the system (a job no person started).
  actorUserId    String?      @map("actor_user_id") @db.Uuid
  /// "web", "api", "job" or "impersonation" (CHECK audit_entry_source_value).
```

replace:
```prisma
  /// The platform admin's user id when support was impersonating; set exactly when source is "impersonation".
  impersonatedBy String?  @map("impersonated_by") @db.Uuid
  /// "<entity>.<what happened>", e.g. "staff.removed" (CHECK audit_entry_action_format).
```
with:
```prisma
  /// The platform admin's user id when support was impersonating; set exactly when source is "impersonation".
  impersonatedBy String?      @map("impersonated_by") @db.Uuid
  /// "<entity>.<what happened>", e.g. "staff.removed" (CHECK audit_entry_action_format).
```

replace:
```prisma
  /// What changed, e.g. "member" or "role" (CHECK audit_entry_entity_type_format), and its id.
  entityType     String   @map("entity_type")
  entityId       String   @map("entity_id") @db.Uuid
  /// The fields that changed, as JSON objects; null when there is no state on that side (nothing before a creation).
```
with:
```prisma
  /// What changed, e.g. "member" or "role" (CHECK audit_entry_entity_type_format), and its id.
  entityType     String       @map("entity_type")
  entityId       String       @map("entity_id") @db.Uuid
  /// The fields that changed, as JSON objects; null when there is no state on that side (nothing before a creation).
```

replace:
```prisma
  after          Json?
```
with:
```prisma
  after          Json?
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
```

Make the migration from the schema change, as the tracks did (`git archive HEAD` holds the schema before it):
```bash
cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm exec prisma format
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261015190000_organization_foreign_keys
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script > prisma/migrations/20261015190000_organization_foreign_keys/migration.sql
pnpm generate
```
Expected: exactly this SQL, with nothing to append (every table already has row-level security):

`packages/db/prisma/migrations/20261015190000_organization_foreign_keys/migration.sql`:
```sql
-- AddForeignKey
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_document" ADD CONSTRAINT "issued_document_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_document" ADD CONSTRAINT "issued_document_organization_id_pdf_attachment_id_fkey" FOREIGN KEY ("organization_id", "pdf_attachment_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_event" ADD CONSTRAINT "processed_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_open" ADD CONSTRAINT "share_link_open_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Run the test to see it pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 165 tests pass. The drift check in the global setup passes with the new migration.

- [ ] **Step 5: Index the new modules and decisions**

Prettier realigns these tables when it formats the files.

In `docs/adr/README.md`:

replace:
```markdown

| #                                        | Decision                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)                | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)       | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md)   | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)              | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)    | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)    | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
| [0007](0007-removing-staff.md)           | Removing staff: soft-deleted membership, released email, sessions ended                 |
| [0008](0008-ports-and-adapters.md)       | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package      |
| [0009](0009-actors-and-domain-events.md) | Actors, domain events and the outbox; what other modules may ask identity               |
```
with:
```markdown

| #                                         | Decision                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| [0001](0001-toolchain.md)                 | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                        |
| [0002](0002-row-level-security.md)        | How organization isolation is implemented in Postgres                                      |
| [0003](0003-repository-conventions.md)    | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate                 |
| [0004](0004-soft-delete.md)               | Soft delete: hidden rows, refused hard deletes, partial unique indexes                     |
| [0005](0005-roles-and-permissions.md)     | Roles and permissions: our own tables, the catalog, starter roles, no escalation           |
| [0006](0006-identity-and-sessions.md)     | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor    |
| [0007](0007-removing-staff.md)            | Removing staff: soft-deleted membership, released email, sessions ended                    |
| [0008](0008-ports-and-adapters.md)        | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package         |
| [0009](0009-actors-and-domain-events.md)  | Actors, domain events and the outbox; what other modules may ask identity                  |
| [0010](0010-jobs-and-the-worker.md)       | Jobs and the worker: pg-boss in its own schema, the outbox relay, listeners once per event |
| [0011](0011-files-and-storage.md)         | Files and storage: presigned uploads and downloads, attachments, sensitive files           |
| [0012](0012-pdfs-and-issued-documents.md) | PDFs and issued documents: React-PDF in the worker, frozen content, rendered once          |
| [0013](0013-public-routes.md)             | Public routes: share links at `/p/<token>`, the webhook intake, rate limits in Postgres    |
| [0014](0014-notifications.md)             | Notifications: `notify()`, the bell, email through SMTP, web push, opt-outs                |
| [0015](0015-audit-log.md)                 | The audit log: append-only, in the change's transaction, impersonation recorded            |
| [0016](0016-money-tax-and-time.md)        | Money in integer paise, the tax engine and India GST, time zones, phone numbers            |
| [0017](0017-brand-package.md)             | The brand package: one source of truth, the product-name check, generated icons            |
```

In `packages/domain/README.md`:

replace:
```markdown

| Module     | What it holds                                                                         |
| ---------- | ------------------------------------------------------------------------------------- |
| `kernel`   | building blocks every module uses: `Actor`, `DomainError`                             |
| `identity` | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md)) |
| `jobs`     | domain events, the outbox and listeners ([README](src/jobs/README.md))                |
```
with:
```markdown

| Module          | What it holds                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `kernel`        | building blocks every module uses: `Actor`, `DomainError`, money, GST, time ([README](src/kernel/README.md)) |
| `identity`      | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md))                        |
| `jobs`          | domain events, the outbox relay, listeners and the worker ([README](src/jobs/README.md))                     |
| `audit`         | the audit log ([README](src/audit/README.md))                                                                |
| `files`         | files attached to records, in object storage ([README](src/files/README.md))                                 |
| `documents`     | numbered documents and their PDFs ([README](src/documents/README.md))                                        |
| `notifications` | `notify()`, the bell, email and push delivery ([README](src/notifications/README.md))                        |
| `share-links`   | links that open one record without signing in ([README](src/share-links/README.md))                          |
| `webhooks`      | the generic webhook intake ([README](src/webhooks/README.md))                                                |
| `rate-limits`   | limits on the public routes ([README](src/rate-limits/README.md))                                            |
```

In `packages/integrations/README.md`:

replace:
```markdown

| Import                             | Port          | Adapters                                  |
| ---------------------------------- | ------------- | ----------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage | `createMemoryStorage` (tests), S3 (files) |
| `@travel-crm/integrations/jobs`    | JobQueue      | `createMemoryJobQueue` (tests), pg-boss   |
```
with:
```markdown

| Import                             | Port                | Adapters                                                                               |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage       | `createS3Storage` (S3, MinIO locally), `createMemoryStorage`                           |
| `@travel-crm/integrations/jobs`    | JobQueue, JobRunner | `createPgBossJobs`, `createMemoryJobQueue`, `createMemoryJobRunner`                    |
| `@travel-crm/integrations/email`   | EmailSender         | `createSmtpEmailSender` (SMTP or SES's SMTP), `createMemoryEmailSender`; `renderEmail` |
| `@travel-crm/integrations/push`    | PushSender          | `createWebPushSender`, `createMemoryPushSender`                                        |
| `@travel-crm/integrations/pdf`     | `renderPdf`         | React-PDF with the brand's fonts; the `sample` template                                |
```

In `docs/adr/0012-pdfs-and-issued-documents.md`:

replace:
```markdown

- The foreign key from `issued_document (organization_id, pdf_attachment_id)` to `attachment (organization_id, id)`
  and the organization relation are added in plan 3's Integration task, with every plan 3 table's: the attachment
  model's back-relation lives in the files module's schema file.
- The organization's logo joins the frozen branding when plan 4 stores branding settings; the renderer already draws
```
with:
```markdown

- `issued_document (organization_id, pdf_attachment_id)` refers to `attachment (organization_id, id)`. The key came
  in plan 3's Integration task, with every plan 3 table's organization key, because the attachment model's
  back-relation lives in the files module's schema file.
- The organization's logo joins the frozen branding when plan 4 stores branding settings; the renderer already draws
```

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 95, api 5, brand 15, contracts 57, db 165, domain 273, eslint-config 65,
integrations 53 (728).

```bash
cd /Users/ak/personal/travel-crm
git add packages/db docs/adr packages/domain/README.md packages/integrations/README.md
git commit -m "chore: give every plan 3 table its organization key, and index the new modules and decisions"
```

---

### Task I2: Serve share links and webhooks, on storage, email and push from the environment

The api learns the services' settings (S3, SMTP, web push, the web app's address), builds the adapters once per
process in `services.ts` (the worker will share it), and mounts the Public track's routes: `/p/<token>` with the
issued-document resolver, and `/webhooks/<provider>`, each behind a rate limit counted in Postgres. Local
development gets MinIO and Mailpit in Docker Compose.

Every change to plan 2's files is a targeted edit, so none of plan 2's request checks can be lost: `requireTrustedJson`
on `/api/trpc/*` and `/api/auth/sign-in/org`, the 64 KB and 8 KB body limits, `/api/auth/organization/*`
answering 404, set-cookie forwarding, and the server's exit code on shutdown all stay as they are. The public routes
read the client's address the way sign-in does (`AUTH_IP_ADDRESS_HEADERS` and `AUTH_TRUSTED_PROXIES`), and in
production `APP_URL` must be https too, so plan 2's production environment tests give it one.

**Files:**
- Create: `apps/api/src/service-variables.ts`, `apps/api/src/services.ts`, `apps/api/src/share-link-resolvers.ts`
- Modify: `apps/api/src/environment.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`,
  `apps/api/src/share-link-route.ts`, `apps/api/package.json` (`@travel-crm/db` becomes a runtime dependency),
  `package.json` (`services:up`), `pnpm-lock.yaml`, `docker-compose.yml`, `.env.example`, `apps/api/README.md`
- Test: `apps/api/test/public-routes.test.ts`, `apps/api/test/environment.test.ts`,
  `apps/api/test/support/test-server.ts`

**Interfaces:**
- Consumes: `shareLinkRoutes`, `webhookRoutes`, `rateLimit`, `clientAddressFrom({ headerNames, trustedProxies })` (Track P,
  `apps/api/src`);
  `openShareLink` (`@travel-crm/domain/share-links`); `receiveWebhook`, `WebhookProvider`
  (`@travel-crm/domain/webhooks`); `createRateLimiter` (`@travel-crm/domain/rate-limits`); `createFiles` and
  `Files.systemDownloadLink` (Track F); `getIssuedDocument` (Track D); `createS3Storage`, `createSmtpEmailSender`,
  `createWebPushSender`, `createPgBossJobs` (adapters).
- Produces:
  - `Services` and `createServices(environment): Services` (`db`, `identity`, `storage`, `files`, `jobs`,
    `email`, `push`, `rateLimiter`, `start()`, `close()`).
  - `ServerDependencies = { identity; db; files; queue: JobQueue; rateLimiter; clientAddress; webhookProviders }` for
    `createApp`.
  - `shareLinkResolvers({ db, files })`: the `issued_document` resolver (302 to the PDF; a 503 page with
    `Retry-After: 30` until it is rendered).
  - The environment variables `APP_URL`, `S3_*`, `SMTP_*`, `EMAIL_FROM_ADDRESS`, `VAPID_*`; `APP_URL` joins the
    trusted origins.
  - `createTestServer(settings?, options?: { webhookProviders?; storage?; queue? })`, whose `TestServer` adds `db`
    and `files`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/public-routes.test.ts`:
```ts
// The public routes as the api serves them: a share link opens an issued document's PDF once the worker has rendered
// it, both routes are rate-limited per client address, and webhooks reach the providers the api was given.
import { createHmac, randomUUID } from "node:crypto";
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { issueDocument, renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { systemActor } from "@travel-crm/domain/kernel";
import { createShareLink } from "@travel-crm/domain/share-links";
import { hmacSha256Signature, type WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";

const webhookSecret = "public-routes-secret";

const exampleProvider: WebhookProvider = {
  name: "example",
  keptHeaders: ["x-example-signature"],
  verify: hmacSha256Signature({ secret: webhookSecret, header: "x-example-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "example.sent" }),
  process: () => Promise.resolve(),
};

const quotation: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", amount: "₹1,46,500.00" }],
    totals: [{ label: "Total", amount: "₹1,46,500.00", emphasis: true }],
  },
  branding: { organizationName: "Sharma Holidays" },
};

/** A browser at its own address, so tests don't share rate-limit buckets. */
const fromAddress = (address: string) => ({ headers: { "x-forwarded-for": address } });

describe("public routes", () => {
  const queue = createMemoryJobQueue();
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer({}, { webhookProviders: [exampleProvider], queue });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("opens a shared document's PDF once it is rendered, and asks for patience until then", async () => {
    const actor = systemActor(agency.organizationId);
    const { document, link } = await server.db.forOrg(agency.organizationId, async (tx) => {
      const issued = await issueDocument(tx, actor, { ...quotation, timeZone: "Asia/Kolkata" });
      const shared = await createShareLink(tx, actor, {
        recordType: "issued_document",
        recordId: issued.id,
        label: `Quotation ${issued.number}`,
      });
      return { document: issued, link: shared };
    });
    const address = `203.0.113.${String(Math.floor(Math.random() * 200))}`;

    const early = await server.app.request(link.path, fromAddress(address));
    expect(early.status).toBe(503);
    expect(early.headers.get("retry-after")).toBe("30");
    expect(await early.text()).toContain("still being prepared");

    // What the worker does after issuing: run the render listener for the document.issued event.
    const event = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "document.issued", payload: { equals: { documentId: document.id } } },
      }),
    );
    const listener = renderIssuedDocumentListener({
      files: server.files,
      render: () => Promise.resolve(new TextEncoder().encode("%PDF-1.3 test")),
    });
    expect(
      await runListenerJob({
        db: server.db,
        listener,
        data: { organizationId: agency.organizationId, eventId: event.id, eventType: event.type },
      }),
    ).toBe("handled");

    const opened = await server.app.request(link.path, fromAddress(address));
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toMatch(/^memory:\/\/download\//);
    expect(opened.headers.get("location")).toContain(encodeURIComponent(`${document.number}.pdf`));
    expect(opened.headers.get("cache-control")).toBe("no-store");
    expect(opened.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("limits share-link requests per client address, and leaves other addresses alone", async () => {
    const guesser = `198.51.100.${String(Math.floor(Math.random() * 200))}`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      statuses.push((await server.app.request(`/p/${randomUUID()}`, fromAddress(guesser))).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 404)).toBe(true);
    const limited = await server.app.request(`/p/${randomUUID()}`, fromAddress(guesser));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await server.app.request(`/p/${randomUUID()}`, fromAddress(`${guesser}9`))).status).toBe(404);
  });

  it("takes a signed webhook from a known provider, queues its processing, and refuses unknown ones", async () => {
    const body = JSON.stringify({ id: `evt_${randomUUID()}` });
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const delivered = await server.app.request("/webhooks/example", {
      method: "POST",
      headers: { "x-example-signature": signature, "x-forwarded-for": "192.0.2.10" },
      body,
    });
    expect(delivered.status).toBe(200);
    expect(queue.sent.filter((job) => job.queue === "webhooks.process")).toHaveLength(1);
    expect(
      (
        await server.app.request("/webhooks/unknown", {
          method: "POST",
          headers: fromAddress("192.0.2.10").headers,
          body,
        })
      ).status,
    ).toBe(404);
    expect((await server.app.request("/webhooks/example", { method: "POST", body })).status).toBe(401);
  });
});
```

In `apps/api/test/environment.test.ts`:

replace:
```ts
  BETTER_AUTH_URL: "http://localhost:3001",
};
```
with:
```ts
  BETTER_AUTH_URL: "http://localhost:3001",
  S3_BUCKET: "travel-crm",
  S3_ACCESS_KEY_ID: "minio-dev",
  S3_SECRET_ACCESS_KEY: "minio-dev-secret",
  SMTP_HOST: "localhost",
  EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
  VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
};
```

replace:
```ts
      secureCookies: false,
      trustedOrigins: [],
      rateLimit: true,
```
with:
```ts
      secureCookies: false,
      // The web app's development address (APP_URL's default).
      trustedOrigins: ["http://localhost:3000"],
      rateLimit: true,
```

replace:
```ts
    expect(() => loadEnvironment(valid)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    expect(loadEnvironment({ ...valid, BETTER_AUTH_URL: "https://app.example.in" }).NODE_ENV).toBe("production");
  });
```
with:
```ts
    expect(() => loadEnvironment(valid)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    expect(
      loadEnvironment({ ...valid, BETTER_AUTH_URL: "https://app.example.in", APP_URL: "https://app.example.in" })
        .NODE_ENV,
    ).toBe("production");
  });
```

replace:
```ts
  it("refuses weak secrets in production, naming the variable and never the value", () => {
    const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.in" };
    const weak = [
```
with:
```ts
  it("refuses weak secrets in production, naming the variable and never the value", () => {
    const production = {
      ...valid,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
    };
    const weak = [
```

replace:
```ts
    }
    const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.in" };
    expect(() =>
```
with:
```ts
    }
    const production = {
      ...valid,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
    };
    expect(() =>
```

replace:
```ts

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
```
with:
```ts

  it("needs object storage, email and web push settings, with AWS and SMTP defaults", () => {
    const environment = loadEnvironment({ ...valid, NODE_ENV: "development" });
    expect(environment).toMatchObject({
      APP_URL: "http://localhost:3000",
      S3_REGION: "ap-south-1",
      S3_FORCE_PATH_STYLE: false,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
    expect(environment.S3_ENDPOINT).toBeUndefined();
    const attempt = () =>
      loadEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: valid.DATABASE_URL,
        BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
        S3_BUCKET: "Not_A_Bucket",
        VAPID_SUBJECT: "dev@travel-crm.localhost",
      });
    expect(attempt).toThrow(/S3_BUCKET[\s\S]*SMTP_HOST[\s\S]*EMAIL_FROM_ADDRESS[\s\S]*VAPID_PUBLIC_KEY/);
    expect(attempt).toThrow(/VAPID_SUBJECT: must start with "mailto:" or "https:\/\/"/);
  });

  it("trusts the web app's address, so a password reset can send people back to it", () => {
    const development = { ...valid, NODE_ENV: "development" };
    const settings = authSettingsFrom(loadEnvironment({ ...development, TRUSTED_ORIGINS: "http://localhost:3000" }));
    expect(settings.trustedOrigins).toEqual(["http://localhost:3000"]);
    const staging = authSettingsFrom(loadEnvironment({ ...development, APP_URL: "https://staging.example.in/app" }));
    expect(staging.trustedOrigins).toEqual(["https://staging.example.in"]);
  });

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
```

replace:
```ts
      BETTER_AUTH_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
```
with:
```ts
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
```

replace:
```ts
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
```
with:
```ts
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, APP_URL: "http://app.example.in" })).toThrow(
      /APP_URL: must be https in production/,
    );
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/public-routes.test.ts test/environment.test.ts`

Expected: FAIL. The public routes tests stop at `server.db` being undefined (the test server has no database handle
yet); the environment tests find no `APP_URL`, `S3_*` or `VAPID_*` settings, and the development defaults' trusted
origins are still empty.

- [ ] **Step 2: Read the services' settings**

`apps/api/src/service-variables.ts`:
```ts
// The environment variables of the services plan 3 added (spec 9): object storage, email, web push, and the web
// app's address that emails link to. Part of the api's one checked environment (environment.ts).
import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/, message: "must be an http(s) URL" });

export const serviceVariables = {
  /** Where people open the web app: links in emails and pushes point there, and password resets come back to it. */
  APP_URL: httpUrl.default("http://localhost:3000"),
  /** An S3-compatible server's address, e.g. MinIO's locally. Leave it out for AWS S3. */
  S3_ENDPOINT: httpUrl.optional(),
  S3_REGION: z.string().min(1).default("ap-south-1"),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "must be an S3 bucket name"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** MinIO needs the bucket in the path rather than the host name. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  /** SMTP, or Amazon SES's SMTP interface; Mailpit locally. */
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /** Email comes from our domain (spec 9.4), under the organization's name, e.g. no-reply@mail.<our domain>. */
  EMAIL_FROM_ADDRESS: z.email(),
  /** Web push's VAPID key pair: `pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  /** How push services reach us about problems: "mailto:" an address, or an https URL. */
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, 'must start with "mailto:" or "https://"'),
};
```

In `apps/api/src/environment.ts`:

replace:
```ts
import { z } from "zod";
```
with:
```ts
import { z } from "zod";
import { serviceVariables } from "./service-variables.js";
```

replace:
```ts
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
```
with:
```ts
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. Public routes' limits use it too. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
```

replace:
```ts
    AUTH_TRUSTED_PROXIES: commaSeparated.pipe(z.array(addressOrRange)),
  })
```
with:
```ts
    AUTH_TRUSTED_PROXIES: commaSeparated.pipe(z.array(addressOrRange)),
    ...serviceVariables,
  })
```

replace:
```ts
    if (!environment.BETTER_AUTH_URL.startsWith("https://")) problem("BETTER_AUTH_URL", "must be https in production");
    if (!environment.AUTH_RATE_LIMIT) problem("AUTH_RATE_LIMIT", "cannot be off in production");
```
with:
```ts
    if (!environment.BETTER_AUTH_URL.startsWith("https://")) problem("BETTER_AUTH_URL", "must be https in production");
    if (!environment.APP_URL.startsWith("https://")) problem("APP_URL", "must be https in production");
    if (!environment.AUTH_RATE_LIMIT) problem("AUTH_RATE_LIMIT", "cannot be off in production");
```

replace:
```ts
    baseUrl: environment.BETTER_AUTH_URL,
    trustedOrigins: environment.TRUSTED_ORIGINS.map((origin) => new URL(origin).origin),
    secureCookies: environment.NODE_ENV === "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
```
with:
```ts
    baseUrl: environment.BETTER_AUTH_URL,
    // The web app may call the api with cookies, and a password reset may send people back to it.
    trustedOrigins: [
      ...new Set([...environment.TRUSTED_ORIGINS, environment.APP_URL].map((url) => new URL(url).origin)),
    ],
    secureCookies: environment.NODE_ENV === "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
```

- [ ] **Step 3: Build the services once per process, and mount the public routes**

`@travel-crm/db` moves from `devDependencies` to `dependencies` of `apps/api`: `services.ts` now creates the database.

In `apps/api/package.json`:

replace:
```json
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
```
with:
```json
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/db": "workspace:*",
    "@travel-crm/domain": "workspace:*",
```

replace:
```json
    "@better-auth/utils": "0.4.2",
    "@travel-crm/db": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
```
with:
```json
    "@better-auth/utils": "0.4.2",
    "@travel-crm/eslint-config": "workspace:*",
```

`apps/api/src/services.ts`:
```ts
// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them. close() releases every pool.
import { createDatabase, type Database } from "@travel-crm/db";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createWebPushSender, type PushSender } from "@travel-crm/integrations/push";
import { createS3Storage, type ObjectStorage } from "@travel-crm/integrations/storage";
import { authSettingsFrom, type Environment } from "./environment.js";

export interface Services {
  environment: Environment;
  db: Database;
  identity: Identity;
  storage: ObjectStorage;
  files: Files;
  /** pg-boss: the api sends jobs to it (webhooks), the worker also runs them. */
  jobs: PgBossJobs;
  email: EmailSender;
  push: PushSender;
  rateLimiter: RateLimiter;
  /** Starts pg-boss. Call before serving requests or running the worker. */
  start(): Promise<void>;
  /** Stops pg-boss (waiting for running jobs) and closes the database pools. */
  close(): Promise<void>;
}

export function createServices(environment: Environment): Services {
  const db = createDatabase(environment.DATABASE_URL, { maxConnections: environment.DATABASE_POOL_SIZE });
  const email = createSmtpEmailSender({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
    user: environment.SMTP_USER,
    password: environment.SMTP_PASSWORD,
    fromAddress: environment.EMAIL_FROM_ADDRESS,
  });
  const identity = createIdentity({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: environment.DATABASE_POOL_SIZE,
    auth: authSettingsFrom(environment),
  });
  const storage = createS3Storage({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    bucket: environment.S3_BUCKET,
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
  });
  const jobs = createPgBossJobs({
    connectionString: environment.DATABASE_URL,
    onError: (error) => {
      console.error("pg-boss error", error);
    },
  });
  const push = createWebPushSender({
    publicKey: environment.VAPID_PUBLIC_KEY,
    privateKey: environment.VAPID_PRIVATE_KEY,
    subject: environment.VAPID_SUBJECT,
  });

  return {
    environment,
    db,
    identity,
    storage,
    files: createFiles({ db, storage }),
    jobs,
    email,
    push,
    rateLimiter: createRateLimiter(db),
    start: () => jobs.start(),
    close: async () => {
      await jobs.stop();
      await identity.disconnect();
      await db.disconnect();
    },
  };
}
```

`apps/api/src/share-link-resolvers.ts`:
```ts
// What each kind of shared record opens as at /p/<token> (spec 9.3). The Foundation shares issued documents: the link
// redirects to a short-lived download of the document's PDF.
import type { Database } from "@travel-crm/db";
import { getIssuedDocument } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import { DomainError } from "@travel-crm/domain/kernel";
import type { ShareLinkResolver } from "./share-link-route.js";

export interface ShareLinkResolverDependencies {
  db: Database;
  files: Pick<Files, "systemDownloadLink">;
}

export function shareLinkResolvers({ db, files }: ShareLinkResolverDependencies): Record<string, ShareLinkResolver> {
  return {
    issued_document: async (opened) => {
      const document = await db.forOrg(opened.organizationId, (tx) =>
        getIssuedDocument(tx, { documentId: opened.recordId }),
      );
      // The worker renders the PDF moments after issuing; a customer this quick is asked to try again shortly.
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await files.systemDownloadLink(opened.organizationId, { attachmentId: document.pdfAttachmentId });
      return Response.redirect(link.url, 302);
    },
  };
}
```

In `apps/api/src/share-link-route.ts`:

replace:
```ts
  LINK_REVOKED: { status: 410, heading: "This link has been turned off", advice: "Ask whoever sent it for a new one." },
} as const;
```
with:
```ts
  LINK_REVOKED: { status: 410, heading: "This link has been turned off", advice: "Ask whoever sent it for a new one." },
  DOCUMENT_NOT_READY: {
    status: 503,
    heading: "This document is still being prepared",
    advice: "Try the link again in a minute.",
  },
} as const;
```

replace:
```ts
  const { status, heading, advice } = pages[reason];
  const { colours, fonts } = brand;
```
with:
```ts
  const { status, heading, advice } = pages[reason];
  const retryAfter: Record<string, string> = status === 503 ? { "Retry-After": "30" } : {};
  const { colours, fonts } = brand;
```

replace:
```ts
      ...privacyHeaders,
      "Content-Type": "text/html; charset=utf-8",
```
with:
```ts
      ...privacyHeaders,
      ...retryAfter,
      "Content-Type": "text/html; charset=utf-8",
```

replace:
```ts
    if (!resolve) return errorPage("LINK_NOT_FOUND");
    return keptPrivate(await resolve(opened));
  });
```
with:
```ts
    if (!resolve) return errorPage("LINK_NOT_FOUND");
    try {
      return keptPrivate(await resolve(opened));
    } catch (error) {
      // A resolver says "not found" (or "not ready yet") the same way the link itself does.
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
  });
```

In `apps/api/src/app.ts`:

replace:
```ts
// The api's HTTP app: a health check, Better Auth's sign-in endpoints under /api/auth, and tRPC at /api/trpc.
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@travel-crm/api";
import type { Identity } from "@travel-crm/domain/identity";
import { Hono } from "hono";
```
with:
```ts
// The api's HTTP app: a health check, Better Auth's sign-in endpoints under /api/auth, tRPC at /api/trpc, and the
// public routes that need no session: share links at /p and the webhook intake at /webhooks, both rate-limited.
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@travel-crm/api";
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { openShareLink } from "@travel-crm/domain/share-links";
import { receiveWebhook, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import { Hono } from "hono";
```

replace:
```ts
import { organizationSignIn } from "./org-sign-in.js";
import { requireTrustedJson } from "./trusted-origin.js";
```
with:
```ts
import { organizationSignIn } from "./org-sign-in.js";
import { rateLimit } from "./rate-limit.js";
import { shareLinkResolvers } from "./share-link-resolvers.js";
import { shareLinkRoutes } from "./share-link-route.js";
import { requireTrustedJson } from "./trusted-origin.js";
import { webhookRoutes } from "./webhook-route.js";
```

replace:
```ts
  identity: Identity;
}
```
with:
```ts
  identity: Identity;
  /** The public routes' database: share links, webhook events, rate-limit counters. */
  db: Database;
  files: Pick<Files, "systemDownloadLink">;
  /** Where the webhook intake queues work for the worker. */
  queue: JobQueue;
  rateLimiter: RateLimiter;
  /** The client's address as AUTH_IP_ADDRESS_HEADERS and AUTH_TRUSTED_PROXIES say to read it. */
  clientAddress: (request: Request) => string | null;
  /** The webhook providers. The Foundation has none; later steps add theirs (Razorpay, WhatsApp). */
  webhookProviders: readonly WebhookProvider[];
}

/**
 * Per client address and minute. A customer opens a link a few times; guessing tokens needs millions of tries.
 * Providers send bursts of webhooks from a few addresses, and retry what we refuse.
 */
const publicLimits = {
  shareLinks: { limit: 30, windowSeconds: 60 },
  webhooks: { limit: 600, windowSeconds: 60 },
};
```

replace:
```ts

export function createApp({ identity }: ServerDependencies): Hono {
  const app = new Hono();
```
with:
```ts

export function createApp(dependencies: ServerDependencies): Hono {
  const { identity, db, files, queue, rateLimiter, clientAddress, webhookProviders } = dependencies;
  const app = new Hono();
```

replace:
```ts

  return app;
```
with:
```ts

  // No session, no cookies: these answer customers' browsers and providers' servers. The webhook route caps its own
  // body at 1 MB; share links are GETs.
  app.use("/p/*", rateLimit({ limiter: rateLimiter, name: "share-links", ...publicLimits.shareLinks, clientAddress }));
  app.route(
    "/p",
    shareLinkRoutes({
      open: (token, visitor) => openShareLink(db, token, visitor),
      resolvers: shareLinkResolvers({ db, files }),
      clientAddress,
    }),
  );
  app.use(
    "/webhooks/*",
    rateLimit({ limiter: rateLimiter, name: "webhooks", ...publicLimits.webhooks, clientAddress }),
  );
  app.route(
    "/webhooks",
    webhookRoutes({
      receive: (provider, request) => receiveWebhook({ db, queue, providers: webhookProviders }, provider, request),
    }),
  );

  return app;
```

In `apps/api/src/server.ts`:

replace:
```ts
import { serve } from "@hono/node-server";
import { createIdentity } from "@travel-crm/domain/identity";
import { createApp } from "./app.js";
import { authSettingsFrom, loadEnvironment } from "./environment.js";

const environment = loadEnvironment(process.env);
const identity = createIdentity({
  databaseUrl: environment.DATABASE_URL,
  maxConnections: environment.DATABASE_POOL_SIZE,
  auth: authSettingsFrom(environment),
});

const server = serve({ fetch: createApp({ identity }).fetch, port: environment.PORT }, (address) => {
  console.log(`api listening on port ${String(address.port)}`);
```
with:
```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnvironment } from "./environment.js";
import { clientAddressFrom } from "./rate-limit.js";
import { createServices } from "./services.js";

const environment = loadEnvironment(process.env);
const services = createServices(environment);
await services.start();

const app = createApp({
  identity: services.identity,
  db: services.db,
  files: services.files,
  queue: services.jobs,
  rateLimiter: services.rateLimiter,
  clientAddress: clientAddressFrom({
    headerNames: environment.AUTH_IP_ADDRESS_HEADERS,
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
  }),
  webhookProviders: [],
});

const server = serve({ fetch: app.fetch, port: environment.PORT }, (address) => {
  console.log(`api listening on port ${String(address.port)}`);
```

replace:
```ts

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pool.
// Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
```
with:
```ts

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pools.
// Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
```

replace:
```ts
  server.close((closeError) => {
    identity
      .disconnect()
      .then(() => {
```
with:
```ts
  server.close((closeError) => {
    services
      .close()
      .then(() => {
```

In `apps/api/test/support/test-server.ts`:

replace:
```ts
// Builds the api on the test database: the Hono app, its identity module, and a platform client for creating
// organizations (which the api itself can never do). Requests go through app.request(), so no port is opened.
import type { PlatformClient } from "@travel-crm/db/platform";
```
with:
```ts
// Builds the api on the test database: the Hono app, its identity module, the public routes' services (on in-memory
// storage and job queue unless a test passes real ones), and a platform client for creating organizations (which the
// api itself can never do). Requests go through app.request(), so no port is opened.
import { createDatabase, type Database } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";
```

replace:
```ts
import { createTestOrganization } from "@travel-crm/db/testing";
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import type { Hono } from "hono";
```
with:
```ts
import { createTestOrganization } from "@travel-crm/db/testing";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryJobQueue, type JobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
import type { Hono } from "hono";
```

replace:
```ts
import { createApp } from "../../src/app.js";
import type { CookieJar } from "./cookie-jar.js";
```
with:
```ts
import { createApp } from "../../src/app.js";
import { clientAddressFrom } from "../../src/rate-limit.js";
import type { CookieJar } from "./cookie-jar.js";
```

replace:
```ts
  identity: Identity;
  platform: PlatformClient;
```
with:
```ts
  identity: Identity;
  db: Database;
  files: Files;
  platform: PlatformClient;
```

replace:
```ts

export function createTestServer(settings: Partial<AuthSettings> = {}): TestServer {
  const urls = inject("dbUrls");
```
with:
```ts

export interface TestServerOptions {
  webhookProviders?: readonly WebhookProvider[];
  /** Where files go; in memory unless given, e.g. S3 on MinIO. */
  storage?: ObjectStorage;
  /** Where the app queues jobs (webhooks to process); in memory unless given, e.g. pg-boss. */
  queue?: JobQueue;
}

export function createTestServer(settings: Partial<AuthSettings> = {}, options: TestServerOptions = {}): TestServer {
  const urls = inject("dbUrls");
```

replace:
```ts
  });
  const platform = createPlatformClient(urls.platform);
  return {
    app: createApp({ identity }),
    identity,
    platform,
```
with:
```ts
  });
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const files = createFiles({ db, storage: options.storage ?? createMemoryStorage() });
  const platform = createPlatformClient(urls.platform);
  const app = createApp({
    identity,
    db,
    files,
    queue: options.queue ?? createMemoryJobQueue(),
    rateLimiter: createRateLimiter(db),
    clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
    webhookProviders: options.webhookProviders ?? [],
  });
  return {
    app,
    identity,
    db,
    files,
    platform,
```

replace:
```ts
      await identity.disconnect();
      await platform.$disconnect();
```
with:
```ts
      await identity.disconnect();
      await db.disconnect();
      await platform.$disconnect();
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`. Expected: the lockfile moves `@travel-crm/db` to `apps/api`'s dependencies; nothing
is downloaded.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/public-routes.test.ts test/environment.test.ts`

Expected: 3 public routes tests and 13 environment tests pass.

- [ ] **Step 5: Run MinIO and Mailpit locally**

MinIO's own images are gone, so Compose runs the community build `pgsty/minio`, which also carries MinIO's `mc`
client: a one-shot service makes the bucket. The ports avoid the usual ones, as Postgres's `55432` does.

In `docker-compose.yml`:

replace:
```yaml
# Local Postgres for development. Tests do not use this; they start their own throwaway Postgres.
name: travel-crm
```
with:
```yaml
# Local services for development: Postgres, MinIO (object storage) and Mailpit (catches email). Tests don't use
# these; they start their own throwaway containers.
name: travel-crm
```

replace:
```yaml
      retries: 30
volumes:
  postgres-data:
```
with:
```yaml
      retries: 30
  minio:
    # MinIO no longer publishes images; this is a community build of MinIO itself (ADR 0011).
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: minio-dev
      MINIO_ROOT_PASSWORD: minio-dev-secret
    ports:
      - "59000:9000"
      - "59001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:9000/minio/health/live"]
      interval: 2s
      timeout: 3s
      retries: 30
  # Creates the bucket once MinIO is up, then exits. The same image carries MinIO's `mc` client.
  minio-bucket:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
    depends_on:
      minio:
        condition: service_healthy
    entrypoint:
      [
        "sh",
        "-c",
        "mc alias set local http://minio:9000 minio-dev minio-dev-secret && mc mb --ignore-existing local/travel-crm",
      ]
    restart: "no"
  mailpit:
    image: axllent/mailpit:v1.31.5
    ports:
      - "51025:1025"
      - "58025:8025"
volumes:
  postgres-data:
  minio-data:
```

In `.env.example`:

replace:
```
PORT=3001
```
with:
```
PORT=3001

# The web app (plan 5) in development: links in emails point there, and password resets come back to it.
APP_URL=http://localhost:3000

# Object storage: MinIO from docker-compose.yml (console at http://localhost:59001). In the cloud, leave S3_ENDPOINT
# out, set the bucket's region, and use credentials from the secret manager.
S3_ENDPOINT=http://localhost:59000
S3_REGION=ap-south-1
S3_BUCKET=travel-crm
S3_ACCESS_KEY_ID=minio-dev
S3_SECRET_ACCESS_KEY=minio-dev-secret
S3_FORCE_PATH_STYLE=true

# Email: Mailpit from docker-compose.yml catches everything; read it at http://localhost:58025.
SMTP_HOST=localhost
SMTP_PORT=51025
EMAIL_FROM_ADDRESS=no-reply@travel-crm.localhost

# Web push. A dev-only key pair: make your own for any real deploy with
# `pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys`.
VAPID_PUBLIC_KEY=BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY
VAPID_PRIVATE_KEY=UrS7-d1PFp4TPIVRSD5qGMXmRPN_NbpYvsJxhc6j3nU
VAPID_SUBJECT=mailto:dev@travel-crm.localhost
```

In `package.json`:

replace:
```json
    "db:up": "docker compose up -d --wait postgres",
    "db:down": "docker compose down",
```
with:
```json
    "db:up": "docker compose up -d --wait postgres",
    "services:up": "docker compose up -d --wait postgres minio mailpit && docker compose run --rm minio-bucket",
    "db:down": "docker compose down",
```

Prove it:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm services:up && curl -fsS http://localhost:58025/api/v1/messages >/dev/null && echo mailpit-up
```
Expected: Postgres, MinIO and Mailpit healthy; "Bucket created successfully" for `local/travel-crm` (on later runs,
that it already exists); `mailpit-up`. Leave them running or stop them with `pnpm db:down`.

The `VAPID_*` values in `.env.example` are a dev-only key pair made with
`pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys`, like the other dev-only values there.

- [ ] **Step 6: Document the routes and settings**

In `apps/api/README.md`:

replace:
```markdown
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                               |
```
with:
```markdown
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                               |
| `GET /p/<token>`             | a share link (ADR 0013): an issued document's PDF; 30 requests a minute per address   |
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address    |
```

replace:
```markdown

| Variable                  | Required | Default           | Meaning                                                     |
| ------------------------- | -------- | ----------------- | ----------------------------------------------------------- |
| `DATABASE_URL`            | yes      |                   | Postgres as the `app_runtime` role                          |
| `BETTER_AUTH_SECRET`      | yes      |                   | at least 32 characters; `openssl rand -base64 32`           |
| `BETTER_AUTH_URL`         | yes      |                   | where browsers reach the api; https in production           |
| `TRUSTED_ORIGINS`         | no       | none              | other origins allowed to call with cookies, comma-separated |
| `AUTH_RATE_LIMIT`         | no       | `true`            | sign-in rate limiting; off only in development and test     |
| `AUTH_IP_ADDRESS_HEADERS` | no       | `x-forwarded-for` | header(s) the load balancer puts the client's IP in         |
| `AUTH_TRUSTED_PROXIES`    | no       | none              | proxy IPs/CIDRs in front of the api; see `.env.example`     |
| `DATABASE_POOL_SIZE`      | no       | `10`              | connections per instance                                    |
| `PORT`                    | no       | `3001`            |                                                             |
| `NODE_ENV`                | no       | `production`      | production needs https, rate limiting and a strong secret   |
```
with:
```markdown

| Variable                                   | Required | Default                 | Meaning                                                                                   |
| ------------------------------------------ | -------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | yes      |                         | Postgres as the `app_runtime` role                                                        |
| `BETTER_AUTH_SECRET`                       | yes      |                         | at least 32 characters; `openssl rand -base64 32`                                         |
| `BETTER_AUTH_URL`                          | yes      |                         | where browsers reach the api; https in production                                         |
| `TRUSTED_ORIGINS`                          | no       | none                    | other origins allowed to call with cookies, comma-separated                               |
| `AUTH_RATE_LIMIT`                          | no       | `true`                  | sign-in rate limiting; off only in development and test                                   |
| `AUTH_IP_ADDRESS_HEADERS`                  | no       | `x-forwarded-for`       | header(s) the load balancer puts the client's IP in                                       |
| `AUTH_TRUSTED_PROXIES`                     | no       | none                    | proxy IPs/CIDRs in front of the api; see `.env.example`                                   |
| `DATABASE_POOL_SIZE`                       | no       | `10`                    | connections per instance                                                                  |
| `S3_BUCKET`                                | yes      |                         | the bucket files and PDFs are stored in                                                   |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes      |                         | object storage credentials                                                                |
| `S3_ENDPOINT`                              | no       | AWS S3                  | an S3-compatible server, e.g. MinIO's `http://localhost:59000`                            |
| `S3_REGION`                                | no       | `ap-south-1`            | the bucket's region                                                                       |
| `S3_FORCE_PATH_STYLE`                      | no       | `false`                 | `true` for MinIO                                                                          |
| `SMTP_HOST`                                | yes      |                         | SMTP, or Amazon SES's SMTP endpoint; Mailpit locally                                      |
| `SMTP_PORT`, `SMTP_SECURE`                 | no       | `587`, `false`          | `SMTP_SECURE=true` for TLS from the first byte (port 465)                                 |
| `SMTP_USER`, `SMTP_PASSWORD`               | no       | none                    | SMTP credentials                                                                          |
| `EMAIL_FROM_ADDRESS`                       | yes      |                         | the address email comes from, on our domain                                               |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`    | yes      |                         | web push keys: `pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys` |
| `VAPID_SUBJECT`                            | yes      |                         | `mailto:` an address, or an https URL                                                     |
| `APP_URL`                                  | no       | `http://localhost:3000` | the web app: email links point there; https in production                                 |
| `PORT`                                     | no       | `3001`                  |                                                                                           |
| `NODE_ENV`                                 | no       | `production`            | production needs https, rate limiting and a strong secret                                 |
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 100, api 5, brand 15, contracts 57, db 165, domain 273, eslint-config 65,
integrations 53 (733).

```bash
cd /Users/ak/personal/travel-crm
git add apps/api package.json pnpm-lock.yaml docker-compose.yml .env.example
git commit -m "feat(api-server): serve share links and webhooks behind rate limits, with storage, email and push"
```

---

### Task I3: Password reset by email

Plan 2 left Better Auth's password reset off until there was an email adapter (spec 6.2: reset by email link). Now
`createAuth` takes a `sendPasswordResetEmail`, the api builds it on the SMTP sender, a reset ends every session the
person had, and staff without email are never emailed.

**Files:**
- Create: `packages/domain/src/identity/auth/password-reset.ts`, `apps/api/src/password-reset-email.ts`
- Modify: `packages/domain/src/identity/auth/create-auth.ts`, `packages/domain/src/identity/index.ts`,
  `apps/api/src/services.ts`, `packages/domain/src/identity/README.md`, `docs/adr/0006-identity-and-sessions.md`
- Test: `apps/api/test/password-reset.test.ts`

**Interfaces:**
- Consumes: `AuthSettings` and `createAuth` (plan 2, as the Audit track left them); `renderEmail`, `EmailSender`,
  `createMemoryEmailSender` (Track N); `brand`; `isPlaceholderEmail` (identity).
- Produces: `AuthSettings.sendPasswordResetEmail?: SendPasswordResetEmail`, with
  `SendPasswordResetEmail = (email: PasswordResetEmail) => Promise<void>` and
  `PasswordResetEmail = { to: { name: string; address: string }; url: string }` (both from
  `@travel-crm/domain/identity`); `passwordResetEmails(email: EmailSender): SendPasswordResetEmail` in `apps/api`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/password-reset.test.ts`:
```ts
// Password reset by email link (spec 6.2): the email goes out from our address with the reset link, the link leads
// back to the web app with a token, the new password works and every old session ends. Staff without email, and
// addresses nobody has, get nothing.
import { brand } from "@travel-crm/brand";
import { createMemoryEmailSender, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { passwordResetEmails } from "../src/password-reset-email.js";
import { CookieJar } from "./support/cookie-jar.js";
import { ownerAccess, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

const resetPage = `${ORIGIN}/reset-password`;

/** Waits for the email sender to have sent count messages: the request doesn't wait for sending. */
async function emailsSent(email: MemoryEmailSender, count: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && email.sent.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("password reset by email", () => {
  let server: TestServer;
  let agency: TestAgency;
  let email: MemoryEmailSender;

  beforeAll(async () => {
    email = createMemoryEmailSender();
    server = createTestServer({ sendPasswordResetEmail: passwordResetEmails(email) });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("emails a link that leads back to the web app, sets the new password and ends every old session", async () => {
    await signedInOwner(server, agency);
    const asked = await postJson(server, "/api/auth/request-password-reset", {
      email: agency.owner.email,
      redirectTo: resetPage,
    });
    expect(asked.status).toBe(200);
    await emailsSent(email, 1);
    const [message] = email.sent;
    expect(message).toMatchObject({
      to: { address: agency.owner.email, name: "Asha Owner" },
      fromName: brand.emailSenderName,
      subject: "Reset your password",
    });
    const link = /http:\/\/localhost\/api\/auth\/reset-password\/[^\s"<]+/.exec(message?.text ?? "")?.[0];
    if (!link) throw new Error("no reset link in the email");

    const opened = await server.app.request(new URL(link).pathname + new URL(link).search);
    expect(opened.status).toBe(302);
    const backToApp = new URL(opened.headers.get("location") ?? "");
    expect(`${backToApp.origin}${backToApp.pathname}`).toBe(resetPage);
    const token = backToApp.searchParams.get("token");

    const reset = await postJson(server, "/api/auth/reset-password", { token, newPassword: "a-brand-new-password" });
    expect(reset.status).toBe(200);
    expect(await server.platform.session.count({ where: { userId: agency.owner.userId } })).toBe(0);
    expect((await signInByEmail(server, new CookieJar(), agency.owner.email, agency.owner.password)).status).toBe(401);
    expect((await signInByEmail(server, new CookieJar(), agency.owner.email, "a-brand-new-password")).status).toBe(200);
  });

  it("clears a temporary password's must-change flag once the person chose their own", async () => {
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Ravi",
      email: `ravi-${agency.code.toLowerCase()}@example.test`,
      roleKey: "sales",
      temporaryPassword: "temporary-password-1",
    });
    const sentBefore = email.sent.length;
    await postJson(server, "/api/auth/request-password-reset", {
      email: `ravi-${agency.code.toLowerCase()}@example.test`,
      redirectTo: resetPage,
    });
    await emailsSent(email, sentBefore + 1);
    const link = /http:\/\/localhost\/api\/auth\/reset-password\/([^?\s"<]+)/.exec(email.sent.at(-1)?.text ?? "");
    await postJson(server, "/api/auth/reset-password", { token: link?.[1], newPassword: "ravis-own-password" });
    const user = await server.platform.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user.mustChangePassword).toBe(false);
  });

  it("sends nothing to staff without email or to an address nobody has, and says the same either way", async () => {
    // Staff without email have a placeholder address, which Better Auth finds like any other.
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Meera",
      username: "meera",
      roleKey: "operations",
      temporaryPassword: "temporary-password-2",
    });
    const sentBefore = email.sent.length;
    for (const address of [`${agency.code.toLowerCase()}-meera@no-email.invalid`, "nobody@example.test"]) {
      const asked = await postJson(server, "/api/auth/request-password-reset", {
        email: address,
        redirectTo: resetPage,
      });
      expect(asked.status).toBe(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(email.sent).toHaveLength(sentBefore);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/password-reset.test.ts`

Expected: FAIL. `../src/password-reset-email.js` does not exist. (With only that file written, all three tests fail:
Better Auth answers 400 "Reset password isn't enabled".)

- [ ] **Step 2: Turn on the reset email**

`packages/domain/src/identity/auth/password-reset.ts`:
```ts
// Password reset by email link (spec 6.2). Staff without email have only a placeholder address, so they never get
// one: their admin sets a temporary password instead (spec 6.3).
import { isPlaceholderEmail } from "../sign-in-names.js";

/** One password-reset email: to whom, and the link that lets them choose a new password. */
export interface PasswordResetEmail {
  to: { name: string; address: string };
  url: string;
}

/** Sends a password-reset email. It logs its own failures, and is not awaited. */
export type SendPasswordResetEmail = (email: PasswordResetEmail) => Promise<void>;

/** Better Auth's sendResetPassword, around ours. */
export function passwordResetSender(send: SendPasswordResetEmail) {
  return ({ user, url }: { user: { name: string; email: string }; url: string }): Promise<void> => {
    if (!isPlaceholderEmail(user.email)) {
      // Not awaited, as Better Auth advises: how long sending takes would tell a caller whether the address exists.
      // The sender logs its own failures; a failure must never crash the api.
      void send({ to: { name: user.name, address: user.email }, url }).catch(() => undefined);
    }
    return Promise.resolve();
  };
}
```

In `packages/domain/src/identity/auth/create-auth.ts`:

replace:
```ts
import { impersonationAudit } from "./impersonation-audit.js";
import { closeSideDoors } from "./side-doors.js";
```
with:
```ts
import { impersonationAudit } from "./impersonation-audit.js";
import { passwordResetSender, type SendPasswordResetEmail } from "./password-reset.js";
import { closeSideDoors } from "./side-doors.js";
```

replace:
```ts
  trustedProxies: readonly string[];
}
```
with:
```ts
  trustedProxies: readonly string[];
  /** Sends password-reset emails. Without it, Better Auth answers "Reset password isn't enabled". */
  sendPasswordResetEmail?: SendPasswordResetEmail | undefined;
}
```

replace:
```ts
      },
    },
```
with:
```ts
      },
      // Whoever had the old password is signed out everywhere: a reset usually means it was lost or stolen.
      revokeSessionsOnPasswordReset: true,
      ...(settings.sendPasswordResetEmail === undefined
        ? {}
        : { sendResetPassword: passwordResetSender(settings.sendPasswordResetEmail) }),
    },
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export type { Auth, AuthSettings } from "./auth/create-auth.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
```
with:
```ts
export type { Auth, AuthSettings } from "./auth/create-auth.js";
export type { PasswordResetEmail, SendPasswordResetEmail } from "./auth/password-reset.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
```

`apps/api/src/password-reset-email.ts`:
```ts
// The password-reset email (spec 6.2), from our address under the product's name, with the link Better Auth made.
import { brand } from "@travel-crm/brand";
import type { SendPasswordResetEmail } from "@travel-crm/domain/identity";
import { renderEmail, type EmailSender } from "@travel-crm/integrations/email";

export function passwordResetEmails(email: EmailSender): SendPasswordResetEmail {
  return async ({ to, url }) => {
    const content = renderEmail({
      heading: "Choose a new password",
      paragraphs: [
        `Someone asked to reset the password of your ${brand.productName} account.`,
        "If it was you, choose a new password with the button below. The link works for one hour.",
      ],
      action: { label: "Choose a new password", url },
      footer: "If you didn't ask for this, ignore this email: your password stays as it is.",
    });
    try {
      await email.send({ to, fromName: brand.emailSenderName, subject: "Reset your password", ...content });
    } catch (error) {
      // Not awaited by the request (the timing would tell whether the address exists), so this is the only report.
      console.error("Could not send a password-reset email", error);
    }
  };
}
```

In `apps/api/src/services.ts`:

replace:
```ts
import { authSettingsFrom, type Environment } from "./environment.js";
```
with:
```ts
import { authSettingsFrom, type Environment } from "./environment.js";
import { passwordResetEmails } from "./password-reset-email.js";
```

replace:
```ts
    maxConnections: environment.DATABASE_POOL_SIZE,
    auth: authSettingsFrom(environment),
  });
```
with:
```ts
    maxConnections: environment.DATABASE_POOL_SIZE,
    auth: { ...authSettingsFrom(environment), sendPasswordResetEmail: passwordResetEmails(email) },
  });
```

- [ ] **Step 3: Run the test to see it pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/password-reset.test.ts`

Expected: 3 tests pass.

- [ ] **Step 4: Record the decision**

In `docs/adr/0006-identity-and-sessions.md`:

replace:
```markdown
  `platformProcedure` re-read the session itself, ignoring the cache.
- **Two-factor** is optional per person. An organization with `require_two_factor` refuses members without it
```
with:
```markdown
  `platformProcedure` re-read the session itself, ignoring the cache.
- **Password reset by email** (plan 3): `POST /api/auth/request-password-reset` with `redirectTo` on the web app
  (`APP_URL`, a trusted origin) emails a one-hour link from our address under the product's name. Opening it leads
  back to the web app with a token, and `POST /api/auth/reset-password` sets the new password, clears
  `must_change_password` and ends every session the person had. Staff without email are never emailed (their admin
  resets their password), and every request gets the same answer whether or not the address exists; sending isn't
  awaited, so its timing doesn't tell either.
- **Two-factor** is optional per person. An organization with `require_two_factor` refuses members without it
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  - `staff.list / create / updateRole / resetPassword / remove`;
  - `roles.list / create / update / delete`;
```
with:
```markdown
  - `staff.list / create / updateRole / resetPassword / remove`;
  - with `auth.sendPasswordResetEmail` set (the api passes its email sender), Better Auth's password reset by email
    link; staff without email are never emailed;
  - `roles.list / create / update / delete`;
```

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green. Test counts: api-server 103, api 5, brand 15, contracts 57, db 165, domain 273, eslint-config 65,
integrations 53 (736).

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain/src/identity apps/api docs/adr/0006-identity-and-sessions.md
git commit -m "feat: send password-reset emails, and end every session when a password is reset"
```

---

### Task I4: The worker, and one flow through every shared service

The worker is `apps/api` started with its `worker` command (spec 9.1). It runs every module's listeners, the
webhook job and the schedules. Two small domain pieces join the modules: the sample document as a quotation, with its
GST from the kernel, and a listener that tells whoever shared a link that it was opened. One end-to-end test then
proves spec 2.6: every shared service used at least once, through the api and the worker together, on real
Postgres, pg-boss and MinIO.

**Files:**
- Create: `packages/domain/src/documents/sample-quotation.ts`, `packages/domain/src/share-links/notify-sharer.ts`
- Modify: `packages/domain/src/documents/{index,issue-document}.ts` (the kernel's `yearIn` and `formatDateTime`
  replace two private copies), `packages/domain/src/share-links/index.ts`, both modules' READMEs
- Create: `apps/api/src/webhook-providers.ts`, `apps/api/src/worker-jobs.ts`, `apps/api/src/worker.ts`
- Modify: `apps/api/src/server.ts`, `apps/api/package.json` (the `worker` script), `apps/api/README.md`, `CLAUDE.md`
- Test: `packages/domain/test/documents/sample-quotation.test.ts`, `packages/domain/test/share-links/notify-sharer.test.ts`,
  `apps/api/test/worker.test.ts`, `apps/api/test/support/minio.ts`

**Interfaces:**
- Consumes: `startWorker`, `EventListener`, `JobHandler`, `ScheduledJob`, `runListenerJob` (Track J);
  `renderIssuedDocumentListener`, `issueDocument`, `getIssuedDocument` (Track D); `renderPdf`; `deliverNotificationListener`,
  `notify` (Track N); `processWebhookJob`, `WEBHOOK_PROCESS_QUEUE` (Track P); `indiaGst`, `formatMoney`, `money`,
  `yearIn`, `formatDateTime` (Track K); `createServices` (I2).
- Produces:
  - `sampleQuotation(quotation: SampleQuotation): IssueDocumentInput` (`@travel-crm/domain/documents`).
  - `notifySharerListener(): EventListener`, queue `share-links.notify-sharer`, on `share-link.opened`
    (`@travel-crm/domain/share-links`).
  - `workerJobs(dependencies: WorkerJobDependencies): WorkerJobs` and `webhookProviders` in `apps/api/src`; the
    `worker` command.

- [ ] **Step 1: Write the failing domain tests**

`packages/domain/test/documents/sample-quotation.test.ts`:
```ts
// The sample quotation works its GST out with the tax engine and prints every amount in Indian format: CGST and SGST
// within a state, IGST between states.
import { describe, expect, it } from "vitest";
import { sampleQuotation } from "../../src/documents/index.js";
import { money } from "../../src/kernel/index.js";

const quotation = {
  recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
  supplierStateCode: "27" as const,
  lines: [
    {
      description: "Andaman islands, 6 nights",
      detail: "2 adults",
      sacCode: "998552",
      taxableValue: money(12_50_000_00),
      rateBasisPoints: 500,
    },
    { description: "Airport transfers", sacCode: "996601", taxableValue: money(4_999_99), rateBasisPoints: 1800 },
  ],
  branding: { organizationName: "Sharma Holidays" },
};

describe("sample quotation", () => {
  it("charges CGST and SGST within the agency's state, with every amount in Indian format", () => {
    const issued = sampleQuotation({ ...quotation, placeOfSupplyStateCode: "27" });
    expect(issued.template).toBe("sample");
    expect(issued.content.rows).toEqual([
      { description: "Andaman islands, 6 nights", detail: "2 adults · SAC 998552", amount: "₹12,50,000.00" },
      { description: "Airport transfers", detail: "SAC 996601", amount: "₹4,999.99" },
    ]);
    expect(issued.content.totals).toEqual([
      { label: "Taxable value", amount: "₹12,54,999.99" },
      { label: "CGST 2.5 %", amount: "₹31,250.00" },
      { label: "SGST 2.5 %", amount: "₹31,250.00" },
      { label: "CGST 9 %", amount: "₹450.00" },
      { label: "SGST 9 %", amount: "₹450.00" },
      { label: "Total", amount: "₹13,18,399.99", emphasis: true },
    ]);
  });

  it("charges IGST when the place of supply is another state", () => {
    const issued = sampleQuotation({ ...quotation, placeOfSupplyStateCode: "29" });
    expect(issued.content.totals.map((total) => total.label)).toEqual([
      "Taxable value",
      "IGST 5 %",
      "IGST 18 %",
      "Total",
    ]);
    expect(issued.content.totals.at(-1)).toEqual({ label: "Total", amount: "₹13,18,399.99", emphasis: true });
  });
});
```

`packages/domain/test/share-links/notify-sharer.test.ts`:
```ts
// When a shared link is opened, the person who shared it is told: in the bell, and by email and push. A link the
// system made tells nobody, and a repeated run of the listener tells them once.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runListenerJob } from "../../src/jobs/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";
import { createShareLink, notifySharerListener, openShareLink } from "../../src/share-links/index.js";

describe("telling the sharer a link was opened", () => {
  let platform: PlatformClient;
  let db: Database;
  let agent: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    const organizationId = await createTestOrganization(platform, "Notify sharer");
    agent = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000b1", source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  /** Shares a record as actor, opens the link, and runs the listener on the event the open published. */
  async function shareOpenAndListen(actor: Actor, label: string) {
    const link = await db.forOrg(actor.organizationId, (tx) =>
      createShareLink(tx, actor, { recordType: "issued_document", recordId: crypto.randomUUID(), label }),
    );
    await openShareLink(db, link.token, { ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0" });
    const event = await db.forOrg(actor.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "share-link.opened", payload: { path: ["shareLinkId"], equals: link.shareLinkId } },
      }),
    );
    const data = { organizationId: actor.organizationId, eventId: event.id, eventType: event.type };
    const outcome = await runListenerJob({ db, listener: notifySharerListener(), data });
    return { data, outcome };
  }

  it("puts a notification in the sharer's bell, to be emailed and pushed", async () => {
    const { outcome } = await shareOpenAndListen(agent, "Quotation DOC-2026-0007");
    expect(outcome).toBe("handled");
    const notifications = await db.forOrg(agent.organizationId, (tx) =>
      tx.notification.findMany({ where: { recipientUserId: agent.userId ?? "", kind: "share-link.opened" } }),
    );
    expect(notifications).toMatchObject([
      { title: "Opened: Quotation DOC-2026-0007", body: "The link you shared has just been opened." },
    ]);
    const delivery = await db.forOrg(agent.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "notification.created" } }),
    );
    expect(delivery.map((event) => event.payload)).toContainEqual({
      notificationId: notifications[0]?.id,
      channels: ["email", "push"],
    });
  });

  it("tells nobody about a link the system made, and tells the sharer once when the job runs again", async () => {
    const system = systemActor(agent.organizationId);
    expect((await shareOpenAndListen(system, "Voucher DOC-2026-0008")).outcome).toBe("handled");
    const { data } = await shareOpenAndListen(agent, "Quotation DOC-2026-0009");
    expect(await runListenerJob({ db, listener: notifySharerListener(), data })).toBe("already-handled");
    const count = (label: string) =>
      db.forOrg(agent.organizationId, (tx) => tx.notification.count({ where: { title: `Opened: ${label}` } }));
    expect(await count("Voucher DOC-2026-0008")).toBe(0);
    expect(await count("Quotation DOC-2026-0009")).toBe(1);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test test/documents/sample-quotation.test.ts test/share-links/notify-sharer.test.ts`

Expected: FAIL: `sampleQuotation` and `notifySharerListener` are not exported.

- [ ] **Step 2: Write the sample quotation and the listener, and use the kernel's time functions**

`packages/domain/src/documents/sample-quotation.ts`:
```ts
// The Foundation's one sample document as a quotation (spec 9.3): lines with their GST worked out by the tax engine
// and every amount in Indian format, ready for issueDocument. Real quotations arrive with the quotes module (step 3).
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import {
  formatMoney,
  indiaGst,
  type GstStateCode,
  type IndiaGstLine,
  type Money,
  type TaxComponent,
} from "../kernel/index.js";

export interface SampleQuotationLine extends IndiaGstLine {
  /** A second line under the description, e.g. "2 adults, 3 nights". */
  detail?: string | undefined;
}

export interface SampleQuotation {
  recipient: { name: string; lines: string[] };
  /** The agency's GST state and the place of supply, which decide CGST + SGST or IGST. */
  supplierStateCode: GstStateCode;
  placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA";
  lines: readonly SampleQuotationLine[];
  branding: IssueDocumentInput["branding"];
  notes?: string | undefined;
}

/** "CGST 2.5 %": half rates such as 2.5 keep their decimal. */
function taxLabel(component: TaxComponent): string {
  return `${component.name} ${String(component.rateBasisPoints / 100)} %`;
}

const printed = (amount: Money) => formatMoney(amount);

export function sampleQuotation(quotation: SampleQuotation): IssueDocumentInput {
  const breakdown = indiaGst.compute({
    supplierStateCode: quotation.supplierStateCode,
    placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
    lines: quotation.lines,
  });
  return {
    template: "sample",
    content: {
      title: "Quotation",
      recipient: quotation.recipient,
      rows: quotation.lines.map((line) => ({
        description: line.description,
        detail: [line.detail, `SAC ${line.sacCode}`].filter((part) => part !== undefined).join(" · "),
        amount: printed(line.taxableValue),
      })),
      totals: [
        { label: "Taxable value", amount: printed(breakdown.taxableValue) },
        ...breakdown.components.map((component) => ({ label: taxLabel(component), amount: printed(component.amount) })),
        { label: "Total", amount: printed(breakdown.total), emphasis: true },
      ],
      ...(quotation.notes === undefined ? {} : { notes: quotation.notes }),
    },
    branding: quotation.branding,
  };
}
```

In `packages/domain/src/documents/index.ts`:

replace:
```ts
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
```
with:
```ts
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
export { sampleQuotation, type SampleQuotation, type SampleQuotationLine } from "./sample-quotation.js";
```

In `packages/domain/src/documents/issue-document.ts`:

replace:
```ts
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";
```
with:
```ts
import { publishEvent } from "../jobs/index.js";
import { DomainError, formatDateTime, yearIn, type Actor } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";
```

replace:
```ts
  prefix?: string | undefined;
}

/** The year it is in the time zone, e.g. 2027 at 00:30 on 1 January in Kolkata, still 2026 in UTC. */
function yearIn(instant: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(instant));
}

/** The date as printed on the document, e.g. "15 Oct 2026". */
function printedDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(
    instant,
  );
}
```
with:
```ts
  prefix?: string | undefined;
}
```

replace:
```ts
  }
  const number = await nextDocumentNumber(tx, { prefix: input.prefix ?? "DOC", year: yearIn(now, input.timeZone) });
  const renderInput: IssuedDocumentRenderInput = {
    data: { ...input.content, number, issuedOn: printedDate(now, input.timeZone) },
    branding: input.branding,
```
with:
```ts
  }
  // The year and date as the organization's clocks show them: 00:30 on 1 January in Kolkata is still 2026 in UTC.
  const number = await nextDocumentNumber(tx, { prefix: input.prefix ?? "DOC", year: yearIn(now, input.timeZone) });
  const renderInput: IssuedDocumentRenderInput = {
    data: { ...input.content, number, issuedOn: formatDateTime(now, { timeZone: input.timeZone, style: "date" }) },
    branding: input.branding,
```

`packages/domain/src/share-links/notify-sharer.ts`:
```ts
// Tells the person who shared a link that it was opened (spec 9.3, 9.4): an agent knows their customer has looked at
// the quotation. In the bell, and by email and push unless they opted out.
import { shareLinkOpenedEvent } from "@travel-crm/contracts/share-links";
import { defineListener, type EventListener } from "../jobs/index.js";
import { notify } from "../notifications/index.js";

export function notifySharerListener(): EventListener {
  return defineListener({
    name: "share-links.notify-sharer",
    eventType: "share-link.opened",
    payload: shareLinkOpenedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const link = await tx.shareLink.findUnique({ where: { id: event.payload.shareLinkId } });
        // A link the system made has nobody to tell.
        if (!link?.createdBy) return;
        await notify(tx, context.actor, {
          recipientUserIds: [link.createdBy],
          kind: "share-link.opened",
          title: `Opened: ${link.label}`,
          body: "The link you shared has just been opened.",
          channels: ["email", "push"],
        });
      });
    },
  });
}
```

In `packages/domain/src/share-links/index.ts`:

replace:
```ts
// Public API of the share-links module: links that open one record without signing in (spec 9.3).
export {
```
with:
```ts
// Public API of the share-links module: links that open one record without signing in (spec 9.3).
export { notifySharerListener } from "./notify-sharer.js";
export {
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: 277 tests pass, the documents module's own tests among them: the kernel's `yearIn` and `formatDateTime`
give exactly what the two private helpers gave.

- [ ] **Step 3: Write the failing end-to-end test**

`apps/api/test/support/minio.ts`:
```ts
// Starts MinIO in a container for tests that need real object storage, with one empty bucket made by the image's own
// `mc` client (this package may not import the AWS SDK). MinIO no longer publishes images: this is the community
// build of the same server (ADR 0011).
import type { S3StorageSettings } from "@travel-crm/integrations/storage";
import { GenericContainer, Wait } from "testcontainers";

const IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
const USER = "minio-test";
const PASSWORD = "minio-test-password";

export interface TestMinio {
  settings: S3StorageSettings;
  stop(): Promise<void>;
}

export async function startMinio(bucket = "travel-crm-test"): Promise<TestMinio> {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({ MINIO_ROOT_USER: USER, MINIO_ROOT_PASSWORD: PASSWORD })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const made = await container.exec([
    "sh",
    "-c",
    `mc alias set local http://localhost:9000 ${USER} ${PASSWORD} && mc mb local/${bucket}`,
  ]);
  if (made.exitCode !== 0) throw new Error(`Could not create the test bucket: ${made.output}`);
  return {
    settings: {
      endpoint: `http://${container.getHost()}:${String(container.getMappedPort(9000))}`,
      region: "ap-south-1",
      bucket,
      accessKeyId: USER,
      secretAccessKey: PASSWORD,
      forcePathStyle: true,
    },
    stop: async () => {
      await container.stop();
    },
  };
}
```

`apps/api/test/worker.test.ts`:
```ts
// The api and the worker together, end to end (spec 2.6: every shared service used at least once): a quotation with
// GST is issued, the worker renders its PDF into S3 (MinIO) once, a customer opens it through a share link, the agent
// who shared it is told in the bell and by email from our address with the agency's Reply-To, and a webhook is
// processed once however often it arrives. Real Postgres, real pg-boss, real MinIO; email and push in memory.
import { createHmac, randomUUID } from "node:crypto";
import { getIssuedDocument, issueDocument, sampleQuotation } from "@travel-crm/domain/documents";
import { startWorker, type Worker } from "@travel-crm/domain/jobs";
import { money } from "@travel-crm/domain/kernel";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createShareLink } from "@travel-crm/domain/share-links";
import { hmacSha256Signature, type StoredWebhookEvent, type WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryEmailSender, senderNameFor, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { extractText } from "unpdf";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { workerJobs } from "../src/worker-jobs.js";
import { startMinio, type TestMinio } from "./support/minio.js";
import { ownerAccess } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";

/** Asks until the answer passes, for work the worker does in the background. */
async function eventually<T>(ask: () => Promise<T> | T, passes: (answer: T) => boolean, what: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const answer = await ask();
    if (passes(answer)) return answer;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const webhookSecret = "worker-test-secret";
const processedWebhooks: string[] = [];
const exampleProvider: WebhookProvider = {
  name: "example",
  keptHeaders: ["x-example-signature"],
  verify: hmacSha256Signature({ secret: webhookSecret, header: "x-example-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "example.sent" }),
  process: (event: StoredWebhookEvent) => {
    processedWebhooks.push(event.providerEventId);
    return Promise.resolve();
  },
};

describe("the api and the worker, end to end", () => {
  let minio: TestMinio;
  let jobs: PgBossJobs;
  let email: MemoryEmailSender;
  let server: TestServer;
  let agency: TestAgency;
  let worker: Worker;

  beforeAll(async () => {
    minio = await startMinio();
    jobs = createPgBossJobs({
      connectionString: inject("dbUrls").runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
    });
    await jobs.start();
    server = createTestServer(
      {},
      { storage: createS3Storage(minio.settings), queue: jobs, webhookProviders: [exampleProvider] },
    );
    agency = await createTestAgency(server);
    await server.platform.organization.update({
      where: { id: agency.organizationId },
      data: { contactEmail: "hello@sharma.example" },
    });
    email = createMemoryEmailSender();
    worker = await startWorker({
      db: server.db,
      runner: jobs,
      queue: jobs,
      ...workerJobs({
        db: server.db,
        identity: server.identity,
        files: server.files,
        email,
        push: createMemoryPushSender(),
        rateLimiter: createRateLimiter(server.db),
        appUrl: "https://app.example.in",
        webhookProviders: [exampleProvider],
      }),
      // Only this file's organization: other test files share the database.
      relay: { intervalMs: 100, organizationIds: [agency.organizationId] },
    });
  }, 180_000);

  afterAll(async () => {
    await worker.stop();
    await jobs.stop();
    await server.close();
    await minio.stop();
  });

  it("renders an issued quotation once, opens it through a share link, and tells the agent who shared it", async () => {
    const owner = await ownerAccess(server, agency);
    const quotation = sampleQuotation({
      recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [
        {
          description: "Andaman islands, 6 nights",
          sacCode: "998552",
          taxableValue: money(12_50_000_00),
          rateBasisPoints: 500,
        },
      ],
      branding: { organizationName: "Sharma Holidays" },
    });
    const document = await server.db.forOrg(agency.organizationId, (tx) =>
      issueDocument(tx, owner, { ...quotation, timeZone: "Asia/Kolkata" }),
    );

    const rendered = await eventually(
      () => server.db.forOrg(agency.organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id })),
      (current) => current.pdfAttachmentId !== null,
      "the PDF to be rendered",
    );

    const link = await server.db.forOrg(agency.organizationId, (tx) =>
      createShareLink(tx, owner, {
        recordType: "issued_document",
        recordId: document.id,
        label: `Quotation ${document.number}`,
      }),
    );
    const opened = await server.app.request(link.path, { headers: { "x-forwarded-for": "203.0.113.20" } });
    expect(opened.status).toBe(302);
    const download = await fetch(opened.headers.get("location") ?? "");
    expect(download.headers.get("content-disposition")).toContain(`${document.number}.pdf`);
    const { text } = await extractText(new Uint8Array(await download.arrayBuffer()), { mergePages: true });
    expect(text).toContain(document.number);
    expect(text).toContain("₹12,50,000.00");
    expect(text).toContain("CGST 2.5 %");
    expect(text).toContain("₹13,12,500.00");

    const notice = await eventually(
      () => email.sent.find((message) => message.subject === `Opened: Quotation ${document.number}`),
      (message) => message !== undefined,
      "the email to the agent",
    );
    expect(notice).toMatchObject({
      to: { address: agency.owner.email },
      fromName: senderNameFor("Test agency"),
      replyTo: "hello@sharma.example",
    });
    const bell = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.notification.findMany({ where: { recipientUserId: agency.owner.userId } }),
    );
    expect(bell.map((notification) => notification.title)).toEqual([`Opened: Quotation ${document.number}`]);

    // Rendered once: the PDF the customer opened is the one attachment the document has.
    const attachments = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.attachment.findMany({ where: { recordType: "issued_document", recordId: document.id } }),
    );
    expect(attachments.map((attachment) => attachment.id)).toEqual([rendered.pdfAttachmentId]);
    expect(await jobs.failedJobs()).toEqual([]);
  });

  it("processes a webhook once, however often the provider delivers it", async () => {
    const eventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({ id: eventId });
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const deliver = () =>
      server.app.request("/webhooks/example", {
        method: "POST",
        headers: { "x-example-signature": signature, "x-forwarded-for": "192.0.2.30" },
        body,
      });
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    await eventually(
      () => processedWebhooks.filter((id) => id === eventId).length,
      (count) => count > 0,
      "processing",
    );
    // Long enough for a second job to have run, had the repeat queued one.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(processedWebhooks.filter((id) => id === eventId)).toEqual([eventId]);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/worker.test.ts`

Expected: FAIL: `../src/worker-jobs.js` does not exist.

- [ ] **Step 4: Compose the worker**

`apps/api/src/webhook-providers.ts`:
```ts
// The webhook providers the api accepts at /webhooks/<name> and the worker processes. The Foundation ships the
// generic intake and none; later steps add theirs here (Razorpay in step 6, Meta's WhatsApp in step 2).
import type { WebhookProvider } from "@travel-crm/domain/webhooks";

export const webhookProviders: readonly WebhookProvider[] = [];
```

`apps/api/src/worker-jobs.ts`:
```ts
// Everything the worker runs (spec 9.1): each module's listeners, the webhook processing job, and the scheduled jobs,
// built from the process's services. The api and the worker are one image; `worker.ts` starts this side.
import type { Database } from "@travel-crm/db";
import { renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { EventListener, JobHandler, ScheduledJob } from "@travel-crm/domain/jobs";
import { deliverNotificationListener } from "@travel-crm/domain/notifications";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { PushSender } from "@travel-crm/integrations/push";

export interface WorkerJobDependencies {
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "memberContacts">;
  files: Files;
  email: EmailSender;
  push: PushSender;
  rateLimiter: RateLimiter;
  /** The web app's address, for links in notification emails. */
  appUrl: string;
  webhookProviders: readonly WebhookProvider[];
}

export interface WorkerJobs {
  listeners: EventListener[];
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function workerJobs(dependencies: WorkerJobDependencies): WorkerJobs {
  const { db, identity, files, email, push, rateLimiter, appUrl, webhookProviders } = dependencies;
  return {
    listeners: [
      renderIssuedDocumentListener({ files, render: renderPdf }),
      deliverNotificationListener({
        email,
        push,
        organizationProfile: (organizationId) => identity.organizationProfile(organizationId),
        memberContacts: (organizationId, userIds) => identity.memberContacts(organizationId, userIds),
        appUrl,
      }),
      notifySharerListener(),
    ],
    handlers: [
      {
        queue: WEBHOOK_PROCESS_QUEUE,
        handle: async (data) => {
          await processWebhookJob({ db, providers: webhookProviders }, data);
        },
      },
    ],
    schedules: [
      {
        // Rate-limit windows last a minute; a day's worth is kept for looking into abuse.
        queue: "rate-limits.purge",
        cron: "30 3 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await rateLimiter.purgeExpired(new Date(Date.now() - DAY_MS));
        },
      },
    ],
  };
}
```

`apps/api/src/worker.ts`:
```ts
// Starts the worker (`pnpm --filter @travel-crm/api-server worker`): the api's image with no HTTP port. It relays the
// outbox and runs every listener, job and schedule (spec 9.1). Run more copies to go faster.
import { startWorker } from "@travel-crm/domain/jobs";
import { loadEnvironment } from "./environment.js";
import { createServices } from "./services.js";
import { webhookProviders } from "./webhook-providers.js";
import { workerJobs } from "./worker-jobs.js";

const environment = loadEnvironment(process.env);
const services = createServices(environment);
await services.start();

const worker = await startWorker({
  db: services.db,
  runner: services.jobs,
  queue: services.jobs,
  ...workerJobs({ ...services, appUrl: environment.APP_URL, webhookProviders }),
  onError: (error) => {
    console.error("outbox relay error", error);
  },
});
console.log("worker running");

// Container platforms send SIGTERM before stopping an instance: stop relaying, let running jobs finish, close the
// pools. Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
function shutDown(): void {
  worker
    .stop()
    .then(() => services.close())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error("worker shutdown failed", error);
      process.exit(1);
    });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
```

In `apps/api/src/server.ts`:

replace:
```ts
import { createServices } from "./services.js";
```
with:
```ts
import { createServices } from "./services.js";
import { webhookProviders } from "./webhook-providers.js";
```

replace:
```ts
  }),
  webhookProviders: [],
});
```
with:
```ts
  }),
  webhookProviders,
});
```

In `apps/api/package.json`:

replace:
```json
    "dev": "tsx watch --env-file-if-exists=../../.env src/server.ts",
    "typecheck": "tsc --noEmit",
```
with:
```json
    "dev": "tsx watch --env-file-if-exists=../../.env src/server.ts",
    "worker": "tsx --env-file-if-exists=../../.env src/worker.ts",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 5: Run the test to see it pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test test/worker.test.ts`

Expected: 2 tests pass in about 10 seconds: the quotation is rendered once into MinIO and opens through its share link
with `₹12,50,000.00`, `CGST 2.5 %` and the total `₹13,12,500.00` in its text; the agent who shared it has a bell
notification and an email from `Test agency via <product name>` with Reply-To `hello@sharma.example`; a webhook
delivered twice is processed once; no job failed.

Then run the worker against the local services once, to see it start and stop (`pnpm worker` runs the same file;
here tsx runs it directly so the shell can signal it):
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm services:up && cp -n .env.example .env && pnpm db:migrate
cd apps/api && (pnpm exec tsx --env-file-if-exists=../../.env src/worker.ts & pid=$!; sleep 6; kill -TERM $pid; wait $pid; echo "exit code $?")
```
Expected: `All migrations have been successfully applied`, `worker running`, then `exit code 0` a moment after
SIGTERM.

- [ ] **Step 6: Document the worker and the services**

In `apps/api/README.md`:

replace:
```markdown
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address    |
```
with:
```markdown
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address    |

## The worker

`pnpm --filter @travel-crm/api-server worker` starts the worker from the same code and image (spec 9.1). It needs the
same environment as the api and opens no port. `src/worker-jobs.ts` lists what it runs:

| Queue                       | What it does                                                          |
| --------------------------- | --------------------------------------------------------------------- |
| `documents.render-pdf`      | renders an issued document's PDF once and stores it (ADR 0012)        |
| `notifications.deliver`     | emails and pushes a notification, respecting opt-outs (ADR 0014)      |
| `share-links.notify-sharer` | tells whoever shared a link that it was opened                        |
| `webhooks.process`          | hands a stored webhook to its provider, once (ADR 0013)               |
| `rate-limits.purge`         | every day at 03:30 India time, deletes rate-limit counters over a day |

It also relays the outbox every second. Stop it with SIGTERM: it stops relaying, lets running jobs finish (up to 30
seconds) and closes its pools. Run more copies to go faster: pg-boss gives each job to one of them.
```

In `CLAUDE.md`:

replace:
```markdown

| Command                                    | What it does                                             |
| ------------------------------------------ | -------------------------------------------------------- |
| `pnpm install`                             | install dependencies                                     |
| `pnpm db:up` / `pnpm db:down`              | start / stop local Postgres (Docker)                     |
| `pnpm db:migrate`                          | apply migrations to local Postgres                       |
| `pnpm --filter @travel-crm/api-server dev` | run the api on http://localhost:3001 (reads `.env`)      |
| `pnpm format`                              | format every file with Prettier                          |
| `pnpm check`                               | everything CI runs: typecheck, lint, tests, import rules |
| `pnpm --filter @travel-crm/<package> test` | one package's tests (most need Docker running)           |
```
with:
```markdown

| Command                                       | What it does                                              |
| --------------------------------------------- | --------------------------------------------------------- |
| `pnpm install`                                | install dependencies                                      |
| `pnpm db:up` / `pnpm db:down`                 | start / stop local Postgres (Docker)                      |
| `pnpm services:up`                            | start Postgres, MinIO (files) and Mailpit (email) locally |
| `pnpm db:migrate`                             | apply migrations to local Postgres                        |
| `pnpm --filter @travel-crm/api-server dev`    | run the api on http://localhost:3001 (reads `.env`)       |
| `pnpm --filter @travel-crm/api-server worker` | run the worker: outbox relay, listeners, jobs, schedules  |
| `pnpm format`                                 | format every file with Prettier                           |
| `pnpm check`                                  | everything CI runs: typecheck, lint, tests, import rules  |
| `pnpm --filter @travel-crm/<package> test`    | one package's tests (most need Docker running)            |
```

replace:
```markdown

## Repo map

- `apps/api`: the Hono server. Health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at `/api/trpc`.
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
```
with:
```markdown

## Shared services (spec 9; ADRs 0008-0017)

- **Events and jobs:** publish with `publishEvent(tx, …)`; react with a listener (`defineListener`) registered in
  `apps/api/src/worker-jobs.ts`. Listeners run in the worker, once per event, in the event's organization; make work
  outside the database safe to repeat. Scheduled jobs go in the same file, with a cron and a time zone.
- **Files:** `createFiles(...)` (`@travel-crm/domain/files`): presigned uploads and downloads, attachments on any
  record, `documents:view_sensitive` for sensitive files. Never stream file bytes through the api.
- **PDFs:** `issueDocument(tx, …)` numbers and freezes a document; the worker renders it once (`documents.render-pdf`).
- **Notifications:** `notify(tx, actor, …)` is the one way to tell people something (bell, email, push; opt-outs apply).
- **Audit:** `recordAudit(tx, actor, …)` in the same transaction as the change, for every change staff make.
- **Money and time:** `Money` in integer paise, `indiaGst` for tax, `formatMoney` (₹12,50,000.00), times in UTC shown in
  the organization's zone (`formatDateTime`), departure dates as `CalendarDate`. Never floats, never local time.
- **Public routes** (`/p/<token>`, `/webhooks/<provider>`) are rate-limited; a new shared record type adds a resolver in
  `apps/api/src/share-link-resolvers.ts`, a new provider goes in `apps/api/src/webhook-providers.ts`.

## Repo map

- `apps/api`: the Hono server (health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at
  `/api/trpc`, share links at `/p`, webhooks at `/webhooks`) and, from the same image, the `worker` command.
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
```

In `packages/domain/src/documents/README.md`:

replace:
```markdown
  module and `renderPdf` from `@travel-crm/integrations/pdf`.
```
with:
```markdown
  module and `renderPdf` from `@travel-crm/integrations/pdf`.
- `sampleQuotation({ recipient, supplierStateCode, placeOfSupplyStateCode, lines, branding, notes? })`: the sample
  template's content as a quotation, its GST worked out by the kernel's `indiaGst` and every amount printed with
  `formatMoney`, ready for `issueDocument`.
```

In `packages/domain/src/share-links/README.md`:

replace:
```markdown
  someone opened a link.
```
with:
```markdown
  someone opened a link.
- Listens to `share-link.opened` (`notifySharerListener()`, queue `share-links.notify-sharer`): tells the person who
  made the link, through `notify()`, in the bell and by email and push. A link the system made tells nobody.
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm check`

Expected: green, 23 Turborepo tasks, no dependency violations. Test counts: api-server 105, api 5, brand 15,
contracts 57, db 165, domain 277, eslint-config 65, integrations 53 (742).

```bash
cd /Users/ak/personal/travel-crm
git add apps/api packages/domain CLAUDE.md
git commit -m "feat: run the worker, and prove every shared service in one flow through the api and the worker"
```

---

## After the last task

The controller (not an implementer):

1. Proves the branch from a clean clone, as CI will:
   ```bash
   cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
   rm -rf /private/tmp/travel-crm-plan3-clean && git clone -q /Users/ak/personal/travel-crm /private/tmp/travel-crm-plan3-clean
   cd /private/tmp/travel-crm-plan3-clean && git checkout -q foundation/03-shared-services
   pnpm install --frozen-lockfile && pnpm check
   ```
   Expected: install succeeds without prompts, and `pnpm check` is green: 23 Turborepo tasks, no dependency violations,
   and these test counts: api-server 105, api 5, brand 15, contracts 57, db 165, domain 277, eslint-config 65,
   integrations 53 (742). Then `rm -rf /private/tmp/travel-crm-plan3-clean`.
2. Requests a whole-branch review.
3. Merges with `git merge --no-ff foundation/03-shared-services -m "chore: merge foundation/03-shared-services (shared services)"`,
   then removes the track worktrees and branches:
   `for track in jobs files documents public notifications audit kernel brand; do git worktree remove ../travel-crm-03-$track && git branch -d foundation/03-$track; done`.
4. Carries these forward:
   - **Plan 4 (platform and subscriptions):**
     - The subscription lifecycle and the demo reset are `ScheduledJob`s in `apps/api/src/worker-jobs.ts` (a cron and
       `Asia/Kolkata`).
     - The failed-jobs screen reads `jobs.failedJobs()` (`PgBossJobs`) through a `platformProcedure`; retrying one
       needs a `retry` on `PgBossJobs` (pg-boss has `retry(queue, id)`).
     - Entitlements pass the plan's storage limit to `createFiles({ storageLimitBytes })`.
     - Onboarding sets `organization.contact_email` (the Reply-To of every email sent for it), `time_zone` (check it
       with the kernel's `isValidTimeZone`), the GSTIN and state (`gstin`, `gstStates`), and the branding settings
       (logo as an attachment, accent colour) that `issueDocument`'s frozen branding then carries.
     - The permanent-deletion purge also removes the organization's audit entries, outbox events, processed events,
       share links and their opens, notifications, attachments and their stored objects; old `webhook_event` payloads
       and outbox rows need a retention rule.
   - **Plan 5 (web app and release):**
     - Routers and screens for the bell (`listNotifications`, `unreadCount`, `markRead`), notification preferences and
       push subscriptions (the browser needs `VAPID_PUBLIC_KEY`), uploads (`requestUpload`, `confirmUpload`,
       `downloadLink`), share links (`createShareLink`, `revokeShareLink`, `listShareLinks`) and the audit viewer
       (`listAuditEntries`, behind `audit:view`).
     - CORS on the bucket for uploads straight from the browser, in MinIO and in S3.
     - The reset-password page at `APP_URL/reset-password`, which reads `token` (or `error=INVALID_TOKEN`).
     - The PWA manifest from `pwaIcons` and `packages/brand/dist/icons` (`turbo run build` makes them); Tailwind tokens
       from `brand.colours`; the three fonts.
     - Translated messages for the new reasons: `LINK_NOT_FOUND`, `LINK_EXPIRED`, `LINK_REVOKED`, `DOCUMENT_NOT_READY`,
       `RATE_LIMITED`, `STORAGE_LIMIT_REACHED`, `UPLOAD_NOT_FOUND`, `UPLOAD_DOES_NOT_MATCH`, `UNPRINTABLE_CHARACTERS`;
       with next-intl, these and plan 2's reasons become one typed list, `@travel-crm/contracts/errors`.
     - Turnstile on public forms; a one-click `List-Unsubscribe` endpoint.
     - Behind a load balancer that appends to `x-forwarded-for`, set `AUTH_TRUSTED_PROXIES`: otherwise the public
       routes, like sign-in, trust no forwarded address and every visitor shares one rate-limit bucket.
     - The worker's Docker image is the api's, started with `worker`. It opens no port: on Cloud Run it runs as a
       worker pool or behind a small health endpoint, decided with the hosting (Q6, Q11).
   - **For the product owner to confirm:** `brand.legalName` and the `.example` contacts; the placeholder logo; the
     rate limits (30 share-link and 600 webhook requests a minute per address); the GST rate each travel service is
     charged at (the engine takes the item's rate); a Devanagari font for PDFs, which today refuse text they can't
     print (`UNPRINTABLE_CHARACTERS`).
