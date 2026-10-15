# Foundation 04: Platform and Subscriptions Implementation Plan

> **ADR numbers:** this plan predates the renumbering. Its ADRs 0018-0023 are now 0019-0024 (`docs/adr/`), so plan 5A's web app could take 0018.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is built for parallel execution: after Tasks 0.1 and 0.2, four tracks run at the same time, each in its own git worktree; Task M1 merges them; Track P runs; the Integration tasks run last.

**Goal:** The platform side of the Foundation (spec section 7, with spec 5's permanent deletion and spec 6.5's request checks 2 and 3) exists, is tested, and runs end to end through the api, the worker and a new console process: onboarding in one transaction with an emailed invite, plans as data, each organization's subscription and payments, the lifecycle computed on every request and recorded each night, the console's API (organizations, plans, subscriptions, data protection, the dashboard, failed jobs, the platform log), the platform's purge and erasure jobs, the business profile and setup checklist, the nightly demo reset, and billing readiness for Razorpay Subscriptions. The console's screens are plan 5's.

**Architecture:**
- **The console is its own process** (ADR 0018): the api image's third command, `console`, serves the console's tRPC at `/api/platform/trpc` and runs the platform's own jobs. It is the only process given `DATABASE_PLATFORM_URL`; the api and the worker never hold it (plan 2's rule). Platform staff sign in through the api's `/api/auth` like everyone else; the console reads the same session cookie, always from the database.
- **Platform transactions** (`@travel-crm/db/platform`): `createPlatformDatabase(url).transaction(tx => …)` runs as `app_platform`, which sees every organization. Inside one, `asOrganization(tx, orgId, orgTx => …)` switches to `app_runtime` with `app.org_id` set, so module code written for `forOrg()` runs unchanged under row-level security, in the same transaction as the platform's own writes. Onboarding is one such transaction.
- **Plans, subscriptions and payments are data** (ADR 0019), written only by the platform role. **The lifecycle is computed on every request** (ADR 0020) from the stored state, the policy (7 and 14 days) and today in the organization's zone, so a late job never grants access; the worker's nightly job writes it down. Request check 2 decides by what a call does (a query views, a mutation changes, `meta.lifecycle` marks exports); check 3 refuses a permission whose module is off the plan, before check 4.
- **Platform admins act in their own name**: `platformActor` (source `platform`) in the organization's audit log, and `platform_audit_entry`, the platform log, for what belongs to no organization and for an organization's whole life (onboarded, exported, purged). It has no foreign key, so it outlives a purge.
- **Permanent deletion** (ADR 0022) runs only in the console's jobs: a purge deletes every organization table found from the catalog (`audit_entry` first), its people and sessions, and its stored files after commit, and tombstones its webhook events; an erasure deletes or redacts one removed person's or one record's data in every module that keeps some.
- **Better Auth's admin endpoints are closed over HTTP** but support's impersonation, which reaches only active staff; an impersonation session is read from the database on every request, so it ends the moment the session does.

**Tech Stack:** plan 3's, unchanged: Node 24, pnpm 12.11.2, Turborepo 2.11.8, TypeScript 6.0.3, Prisma 7.10.0, Postgres 18, Vitest 5.0.4, Testcontainers 12.2.1, ESLint 10, dependency-cruiser 18.6.0, better-auth 1.7.7, Hono 4.13.13, tRPC 11.19.0, Zod 4.6.7, pg-boss 12.37.1. **No new dependency.** No Razorpay SDK: spec 7.4 puts Razorpay Subscriptions after the Foundation ("webhooks update the same record later"), so billing readiness here is the provider fields and an idempotent `recordPayment(…, { provider })` that a later webhook provider calls through plan 3's intake.

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md`, section 7 (7.1 onboarding, 7.2 plans are data, 7.3 lifecycle, 7.4 billing, the demo and the dashboard), with section 5's permanent deletion and DPDP erasure, 6.5's request checks 2 and 3, 9.1's failed-jobs list and the scheduled jobs of section 9. This is plan 4 of 5 for the Foundation:

1. Repo and data isolation (done; merged to `main`)
2. API and identity (done; merged to `main` at `cf8fb18`)
3. Shared services (done on `foundation/03-shared-services`, head `e6602c5`)
4. Platform and subscriptions (this plan: API and domain only)
5. Web app and release (every screen, including the console's, over the routers this plan defines)

**How this plan was checked.**
- Every file in it was written and run in a scratch clone of `foundation/03-shared-services` at `e6602c5`, plan 3's head (1,064 tests). It was first built on `ba0cf59`, then rebuilt twice as plan 3's integration landed: on `4d9d470` (reset tokens stored hashed: Task A2 stores the invite's the same way) and on `e6602c5` (one ids-only log per process and a start-up guard: the console app and process use both, and two plan 3 tests that build the api app pass the new dependencies).
- Tasks 0.1 and 0.2 were built there, then each wave-1 track in its own clone branched from Task 0.2, test first, with the full gate green after every task. The tracks were merged in both orders: every merge was textually clean and gave the identical tree. Track P was built on the merge, and the Integration tasks on top. The code blocks below are those commits' files after Prettier and ESLint, and a script compared every full-file block and every replace/with pair against the commits.
- Each task's "Expected: FAIL" was replayed: the task's tests alone on the task's starting commit.
- Test counts are given after every task. The final count is in "After the last task".

## Tracks

Tasks 0.1 and 0.2 run first, one after the other, on `foundation/04-platform`. Then the four wave-1 tracks start from Task 0.2's commit, each in its own worktree and branch, and run at the same time. Task M1 merges them. Track P starts from Task M1's commit in its own worktree (it builds the console's routers on all four). The Integration tasks run last, in order, after Track P is merged. Within a track, tasks run in order.

| Track | Tasks | Owns (and only it edits) | Depends on | Migrations |
| --- | --- | --- | --- | --- |
| **0 Groundwork** (first, in order) | 0.1, 0.2 | `@travel-crm/db/platform` (`platform.ts`, `for-org.ts`'s shared transaction guard, `errors.ts`), `platform.prisma`, `sql/bootstrap.sql`'s role grant, the audit source `platform` and `platformActor`, the platform module's log (`packages/domain/src/platform/{platform-log,services}.ts`, its `index.ts` and README), `packages/contracts/src/platform/{platform-log,platform-staff}.ts`, the console's tRPC (`packages/api/src/platform/{trpc,context,procedures,platform-router}.ts`), identity's platform staff levels (`access.ts`, `auth/create-auth.ts`, `auth/side-doors.ts`, `identity.ts`), `apps/api/src/{console-app,body-limit}.ts`, `apps/api/test/support/console.ts`, ADR 0018 | plan 3's head | `20261016090000_platform_groundwork` |
| **S Subscriptions** | S1-S3 | `packages/contracts/src/subscriptions/`, `subscriptions.prisma` and the `subscription` line of `organization.prisma`, `org-table-fixtures/subscriptions.ts`, `org-table-fixture.ts`, `isolation.test.ts`, `subscription-tables.test.ts`, `packages/domain/src/subscriptions/`, `addDays` in the kernel, `packages/domain/src/platform/{plans,subscriptions}.ts` with the platform `index.ts` and README, the console's `plans` and `subscriptions` routers and `platform-router.ts`, request checks 2 and 3 (`packages/api/src/{procedures,context,trpc}.ts`, `routers/subscription.ts`, `app-router.ts`, the api README), `apps/api/src/{app,server,services}.ts` and `test/support/test-server.ts`, ADRs 0019 and 0020 | Task 0 | `20261016100000_subscriptions` |
| **A Access and identity** | A1-A3 | `packages/domain/src/identity/` (Task 0.2 adds the platform staff levels to it first), `packages/contracts/src/identity/staff.ts`, identity's tests, ADR 0021, ADR 0018's impersonation lines | Task 0 | none |
| **D Data protection** | D1, D2 | the purge and erasure hooks in `audit`, `documents`, `files`, `notifications` and `webhooks` (each module's new file, `index.ts` and README), the storage port's `delete` (`packages/integrations/src/storage/`), `packages/db/src/organization-rows.ts` and its export from `platform.ts`, `webhooks.prisma`, the db README, ADR 0022 | Task 0 | `20261016120000_webhook_event_organizations` |
| **O Organization profile** | O1 | `packages/contracts/src/profile/`, `profile.prisma` and the `profile` line of `organization.prisma`, `org-table-fixtures/profile.ts`, `packages/domain/src/profile/`, ADR 0023 | Task 0 | `20261016130000_organization_profile` |
| **M1 Merge** | M1 | the four merges and the one test they need together | S, A, D and O | none |
| **P Platform console** | P1-P3 | `packages/domain/src/platform/` (but the log and services' first version), `organization-records.ts` in identity, `packages/contracts/src/platform/{organizations,data-protection,console-dashboard}.ts`, the console's other routers, `packages/integrations/src/jobs/{pg-boss-jobs,memory-job-administration,index}.ts`, the console's tests in `apps/api/test/` and `support/console.ts`, the platform tests in `packages/domain/test/platform/`, ADR lines in 0018, 0021 and 0022 | Task M1 | none |
| **I Integration** (last, in order) | I1-I3 | the merge of Track P, and every shared edit the tracks left: `packages/api/src/context.ts` and the `profile` router, `apps/api/src/{app,server,services,start-up,worker-jobs}.ts` and the new `console*.ts`, `apps/api/package.json`, `.env.example`, the jobs module's `startJobHandlers`, the demo reset, `docs/adr/README.md`, `packages/domain/README.md`, `packages/api/README.md`, `apps/api/README.md`, `CLAUDE.md` | Track P | none |

**Why the tracks never collide.**
- **Shared files are settled first or last.** Plan 4 adds no dependency, so no track touches a `package.json` or the lockfile. Task 0 makes every file two tracks would otherwise both create: the platform module's index and services, the console's router, the platform contracts' index, and the api's console test support. Index files, `CLAUDE.md`, the app's wiring and the ADR index wait for the Integration tasks.
- **Each table in its module's Prisma file.** Tracks S and O each add one back-relation line to `organization.prisma`, on different lines, so the merge is clean either way. A track's migration is generated from a schema-to-schema diff without a database, with a fixed, distinct timestamp later than plan 3's.
- **Interfaces first.** Task 0 defines what the tracks code against: `PlatformDatabase`, `asOrganization`, `platformActor`, `recordPlatformAudit`, `PlatformServices`, `staffProcedure` and `superAdminProcedure`. Track P comes after the merge because it calls every wave-1 track.

**Running the tracks.**
- Before a track's first task, make its worktree from the right commit (each track's first task repeats this):
  ```bash
  cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-<track> -b foundation/04-<track> foundation/04-platform
  cd /Users/ak/personal/travel-crm-04-<track> && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
  ```
  The wave-1 tracks are `subscriptions`, `identity`, `data` and `profile`; Track P is `platform-console`, made after Task M1.
- Every check starts throwaway Postgres containers (and MinIO and Mailpit in some api tests). With four tracks on one machine, run each check as `pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise` (the same gates as `pnpm check`), and let at most two run at once on a Docker with 8 GB. If a container times out starting, rerun once. If Docker itself is down ("Could not find a working container runtime strategy"), don't restart it under other tracks' runs: stop and report.
- When a track's last task is committed, it is ready to merge. Task M1 merges the four in any order.

## Global Constraints

- **Node 24 for every command, from the right folder.** Every shell call starts in another directory, so prefix each command with `cd <folder> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`, where the folder is `/Users/ak/personal/travel-crm` for Tasks 0.1, 0.2, M1 and I1-I3, and the track's worktree `/Users/ak/personal/travel-crm-04-<track>` for a track's tasks. Node 22 remains the machine default; do not change it.
- **Where plan 4 starts.** Branch `foundation/04-platform` from plan 3's head: `foundation/03-shared-services` at `e6602c5`, or `main` once plan 3 is merged into it. If plan 3's head has moved past `e6602c5`, list what changed in the files this plan edits before Task 0.1 (`git diff e6602c5 <head> --stat`) and stop if any of them is touched. Already checked: plan 3 moved on to `e23960f` (three commits: browser-safe kernel errors, pg-boss keeping only our own error messages, a `.gitignore` line) after this plan was built. Merged onto the finished plan, typecheck, lint and the import rules stay green and the jobs, webhooks and platform tests pass; the one conflict is Task I2's edit of `packages/domain/src/jobs/README.md`, where plan 3's paragraph on failed jobs' messages stays and plan 4's line on removing a schedule in the console replaces "until they are reconciled (plan 4)".
- **`NODE_ENV` is production when unset** (plan 2): a test or script that loads the api's environment sets `NODE_ENV` to `development` or `test`, and `.env.example` sets it for local runs.
- **Docker must be running.** The db, domain, api-server and integrations tests start throwaway containers with Testcontainers (Postgres 18; MinIO and Mailpit for some api tests).
- **No new dependency.** Every package plan 4 uses is already in the lockfile. A task that finds it needs one stops and reports.
- **The platform role's grant.** Task 0.1 adds `GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE` to `packages/db/sql/bootstrap.sql`, which every test database runs. A local database bootstrapped before plan 4 needs it run once by hand (`packages/db/README.md` says how), and a hosted one when its roles are made (plan 5's deploy checklist).
- **Package names.** `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve to `src/<name>/index.ts`; the new modules are `subscriptions`, `profile` and `platform`. `apps/api` is `@travel-crm/api-server`.
- **Naming.** Plans 1-3's rules hold (organization, `organization_id`, `forOrg`, snake_case through `@@map`/`@map`, permissions `module:action`, queues `<module>.<what it does>`, events and audit actions `<entity>.<what happened>`). Platform staff are "support" (Better Auth role `admin`) and "super admin" (`super-admin`).
- **Readable code.** Files stay small and single-purpose; a file over ~200 lines needs a reason. Every source file opens with a one-line comment saying what it is for. Comments explain *why*. No abbreviations in public names.
- **Data rules.** Plans 1-3's hold. Plan 4 adds:
  - Only `packages/domain/src/platform/` imports `@travel-crm/db/platform` (dependency-cruiser enforces it; tests aside). Inside a platform transaction, every query names its organization, and module code written for `forOrg()` runs inside `asOrganization(tx, orgId, …)`.
  - Plans, subscriptions, payments and the policy are written only by the platform role: the runtime role may read them, and update a subscription's `status`, `status_changed_at` and `updated_at` (the nightly job), nothing else. A test checks each grant.
  - A platform admin's change inside an organization is recorded in its audit log as `platformActor(organizationId, adminUserId)`; what belongs to no organization, and an organization's whole life, goes in the platform log with `recordPlatformAudit`. Neither holds secrets or personal data.
  - **Migrations are generated without a database:** `prisma migrate diff --from-schema <the schema before> --to-schema prisma/schema --script --output <file>`, into the task's fixed timestamp folder, then the hand-written SQL appended below the banner. Write with `--output`, never shell redirection: Prisma prints "Loaded Prisma config…" to stderr.
  - Job data holds ids, never personal data. Listeners run at least once, keyed by event id.
- **The product's name** is read from `@travel-crm/brand`, never typed: a test refuses it in any file outside `packages/brand/` and `docs/`, tests and comments included.
- **One log per process** (plan 3): a process's problems go to its `ProcessLog`, one line each of ids, names and codes (`describeError`), never an error's message or the error itself, which can quote a person's data. The console logs as `console: …`, through plan 3's `startProcess` guard like the api and the worker.
- **Clean test output.** A test that makes Better Auth or a module warn on purpose wraps the call in a scoped `vi.spyOn(console, "warn")` that asserts the message (plan 3's rule). The gate's output has no stray stderr.
- **Tracks edit only the files the Tracks table gives them.** If a track finds it needs a change to a shared file, it does the nearest thing inside its own files and leaves the shared change to the Integration tasks.
- **Commits.** Conventional Commits, a header of at most 100 characters, staged by name (never `git add -A`, `git add .` or `git commit -a`). The git hooks run Prettier, ESLint and commitlint: fix what they report, never use `--no-verify`. **Never add a `Co-Authored-By` trailer.** No secrets or `.env` files in git (the dev-only values in `.env.example` are the exception, as before).
- **Git.** Tasks 0.1, 0.2, M1 and I1-I3 work on `foundation/04-platform`; each track on `foundation/04-<track>` in its worktree. Don't push; there is no remote.
- **Better Auth facts this plan relies on** (checked against 1.7.7's source and by tests): server-side `auth.api.*` calls run `hooks.before` too, so the admin side door sees them; the admin plugin's own role check passes for any role in `adminRoles`; impersonation stores the admin in `session.impersonatedBy` and the cookie cache can vouch for a session for 5 minutes; `/reset-password` finds a token by `verification.identifier`, which plan 3 stores hashed for `reset-password:` (base64url SHA-256 of the whole identifier, with a fallback to the plain form).
- **The console process's jobs** run with `startJobHandlers` (Task I2): handlers and schedules only. Never start a second outbox relay: a relay that knew no listeners would mark every event relayed with nothing queued for it.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each is pinned by tests in the tasks named.

1. **Every organization's data within reach of the wrong code.** The platform role sees every organization, so a request path that held it, or module code run as it, would leak across organizations. Expected: only the console process reads `DATABASE_PLATFORM_URL`, and refuses to start with the api's URL in its place or on any connection that isn't the platform role; inside a platform transaction, organization work runs as `app_runtime` under row-level security, and the step back resets the role and `app.org_id` even when the work failed; nesting is refused. Pinned in 0.1 (`platform-database.test.ts`: the runtime role inside, its rights only, the platform role after a failure, no nesting), I2 (`console-environment.test.ts`; `console-process.test.ts`: it refuses to start on a connection that isn't the platform role) and P3 (the dashboard counts each organization inside it).
2. **Support keeping powers it shouldn't.** An impersonation that outlives its session (the 5-minute cookie cache), impersonating someone who isn't an organization's active staff, and Better Auth's admin endpoints that would hard-delete a user (`/admin/remove-user`) or set a password that skips must-change (`/admin/set-user-password`). Expected: an impersonation session is read from the database on every request and its admin re-checked, so it ends at once; only active members can be impersonated (`IMPERSONATION_TARGET_NOT_A_MEMBER`); every other `/admin/*` path is a 404 over HTTP, and server-side calls need a real platform admin's session. Pinned in S3 (`subscription-checks.test.ts`: "ends support's impersonation the moment its session is gone, though the cookie cache still holds it") and A1 (`auth-hardening.test.ts`: the closed endpoints, the impersonation target).
3. **An organization keeping access it hasn't paid for, or losing access it has.** Expected: the state is computed on every request in the organization's own zone, so a trial that ended yesterday is past due today before the nightly job runs; read-only allows views and exports, suspended only the Owner's exports, cancelled nothing but `subscription.get`; a payment through a day from today makes it active from any state; a module off the plan is refused before the permission check; seats and storage are the plan's. Pinned in S2 (`lifecycle.test.ts`, `request-rules.test.ts`), S3 (`subscription-checks.test.ts`), A3 (`seats.test.ts`: two people added at once can't both take the last seat), I1 (`services.test.ts`) and I3 (the journey: read-only, paid, active).
4. **Permanent deletion that leaves something behind, or deletes what it shouldn't.** Expected: a purge needs the organization cancelled, its code typed and an export from the last day, and the job looks again when it runs (a payment since then keeps the organization); it deletes every organization table found from the catalog (`audit_entry` first), the people and their sessions, and the stored files after the commit, and blanks its webhook events; an erasure redacts audit snapshots and deletes the person's or record's files and notifications; the platform log keeps the record; the nightly demo reset never purges an organization it didn't build. Pinned in D1 (redaction, files), D2 (`organization-rows.test.ts`, tombstones), P2 (`data-protection.test.ts`, including "skips a queued purge when a payment made the organization active again"), I2 (`demo.test.ts`: "never purges an organization it didn't build") and I3 (purged, signed out, the log remains).
5. **Secrets and personal data where they don't belong.** Expected: invite links are kept only as a hash, as Better Auth keeps reset tokens; the business profile's bank details are audited by field name, never value, and seen only with `settings:manage`; job data, the platform log and failed jobs hold ids only; the demo's password comes from the environment and is never a person's. Pinned in A2 (`staff-invites.test.ts`: no row holds the token), O1 (`profile.test.ts`: fields by name), I1 (`organization-profile.test.ts`: staff without `settings:manage` are refused) and 0.1 (`platform-log.test.ts`: snapshots checked like the audit log's).

## File Structure

```
travel-crm/
├── packages/db/
│   ├── src/platform.ts               createPlatformDatabase, asOrganization, deleteOrganizationRows, organizationRows
│   ├── src/organization-rows.ts      every organization table, from the catalog, in foreign-key order
│   ├── prisma/schema/                + platform (the platform log), subscriptions, profile; webhook event owners
│   └── sql/bootstrap.sql             + app_platform may switch to app_runtime
├── packages/contracts/src/           + platform (log, staff, organizations, data protection, dashboard),
│                                       subscriptions (plans, subscriptions, payments, policy), profile
├── packages/domain/src/
│   ├── subscriptions/                plans, subscriptions, payments, the policy, the lifecycle, request checks 2 and 3
│   ├── profile/                      the business profile and setup checklist
│   ├── platform/                     the console's work: onboarding, organizations, plans and subscriptions as the
│   │                                   platform, exports, purge, erasure, the dashboard, failed jobs, the demo, the log
│   ├── identity/                     + staff levels, closed admin endpoints, onboarding steps, the invite listener,
│   │                                   seats, erasure, member activity
│   ├── audit/, files/, documents/,   + what each keeps, for exports, purges and erasures
│   │   notifications/, webhooks/
│   └── jobs/                         + startJobHandlers, for the console process
├── packages/api/src/
│   ├── procedures.ts                 + request checks 2 and 3; impersonation re-read every request
│   ├── routers/                      + subscription, profile
│   └── platform/                     the console's tRPC: context, staffProcedure, superAdminProcedure, its routers
├── packages/integrations/src/jobs/   + JobAdministration: failed jobs, retry, schedules
├── apps/api/src/                     + console.ts, console-app.ts, console-environment.ts, console-jobs.ts;
│                                       the worker's invite listener and lifecycle job; plan limits in services.ts
└── docs/adr/                         + 0018 platform console ... 0023 business profile
```

Calls only go down: `apps/api` → `packages/api` → `packages/domain` → `packages/db`; `packages/domain` → `packages/integrations`. `packages/contracts` is a leaf. Within the domain, `platform` calls the other modules through their `index.ts`; nothing calls `platform`.

---

## Groundwork

Tasks 0.1 and 0.2 run first, in order, in the main checkout (`/Users/ak/personal/travel-crm`), on
`foundation/04-platform`.

### Task 0.1: Platform transactions, the step into one organization, and the platform log

Everything the console does runs as `app_platform`, the role that sees every organization. This task gives the
platform module that role's transactions, and inside one a step into a single organization as `app_runtime`, so
module code written for `forOrg()` runs unchanged, under row-level security and the runtime role's grants, in the
same transaction as the platform's own writes (onboarding needs exactly that). Postgres lets the switch happen only
if `app_platform` is a member of `app_runtime`; `WITH INHERIT FALSE, SET TRUE` allows the switch without giving the
platform role the runtime role's rights. It also adds the audit source `platform` with `platformActor`, so a platform
admin's change inside an organization is recorded under their own name, and the platform log
(`platform_audit_entry`), which has no foreign key, so it outlives an organization's purge (spec 5).

**Files:**
- Create: `docs/adr/0018-platform-console.md`, `packages/contracts/src/platform/index.ts`, `packages/contracts/src/platform/platform-log.ts`, `packages/db/prisma/migrations/20261016090000_platform_groundwork/migration.sql`, `packages/db/prisma/schema/platform.prisma`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`, `packages/domain/src/platform/platform-log.ts`
- Modify: `packages/contracts/src/audit/audit.ts`, `packages/db/README.md`, `packages/db/sql/bootstrap.sql`, `packages/db/src/errors.ts`, `packages/db/src/for-org.ts`, `packages/db/src/platform.ts`, `packages/domain/src/audit/README.md`, `packages/domain/src/audit/index.ts`, `packages/domain/src/audit/list-audit-entries.ts`, `packages/domain/src/audit/record-audit.ts`, `packages/domain/src/kernel/README.md`, `packages/domain/src/kernel/actor.ts`, `packages/domain/src/kernel/index.ts`
- Test: `packages/contracts/test/audit/audit.test.ts`, `packages/contracts/test/platform/platform-log.test.ts`, `packages/db/test/database-setup.test.ts`, `packages/db/test/platform-database.test.ts`, `packages/domain/test/audit/record-audit.test.ts`, `packages/domain/test/platform/platform-log.test.ts`

**Interfaces:**
- Consumes (plans 1-3): `createPrismaClient`, `forOrg`'s guard (`insideForOrg`), `hidingUnscopedModels`,
  `NestedForOrgError`, `UnscopedModelError`, `InvalidOrganizationIdError` in `packages/db/src`; `recordAudit`,
  `AuditChange`, `AuditSnapshot` in the audit module; `Actor`, `systemActor` in the kernel; `auditSource` in
  `@travel-crm/contracts/audit`; the test database's `inject("dbUrls")` with `runtime` and `platform` URLs.
- Produces:
  - `@travel-crm/db/platform`: `createPlatformDatabase(url, { maxConnections? }): PlatformDatabase` with
    `transaction<T>(fn: (tx: PlatformTx) => Promise<T>, options?: ForOrgOptions): Promise<T>` (refuses a connection
    that isn't `app_platform` with `WrongPlatformRoleError`, and nesting with `NestedForOrgError`) and `disconnect()`;
    `asOrganization<T>(tx: PlatformTx, organizationId: string, fn: (orgTx: IdentityTx) => Promise<T>): Promise<T>`;
    types `PlatformTx`, `PlatformClient`, `IdentityTx`, `OrgTx`, `ForOrgOptions`; `createPlatformClient(url)` as before.
  - `packages/db/src/for-org.ts` exports `enterTransaction(fn)`, `allowUnscopedModels(handle, tx)`,
    `assertOrganizationId(orgId)` and the `TransactionClient` type, for `platform.ts`.
  - The kernel: `ActorSource` gains `"platform"`; `platformActor(organizationId, adminUserId): Actor`.
  - The audit module exports `assertAuditable(change)`, the checks `recordAudit` runs, for the platform log.
  - `@travel-crm/contracts/platform`: `platformLogEntry`, `listPlatformLogInput` (`{ targetOrganizationId?, before?,
    limit }`), `platformLogPage` (`{ entries, nextCursor }`) and their types.
  - `@travel-crm/domain/platform`: `recordPlatformAudit(tx: PlatformTx, actor: PlatformActor, change: PlatformChange)`,
    `listPlatformLog(tx, input): Promise<PlatformLogPage>`, types `PlatformActor` (`{ userId: string | null }`) and
    `PlatformChange` (`{ action, targetType, targetId, targetOrganizationId?, before?, after? }`).

- [ ] **Step 1: Create the branch**

```bash
cd /Users/ak/personal/travel-crm && git switch -c foundation/04-platform foundation/03-shared-services
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: on `foundation/04-platform` at plan 3's head; install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/db/test/platform-database.test.ts`:
```ts
// The platform console's database handle: transactions as app_platform see every organization, and inside one the
// console can step into a single organization as app_runtime, where row-level security and the runtime role's grants
// apply exactly as in db.forOrg().
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError, UnscopedModelError } from "../src/errors.js";
import { InvalidOrganizationIdError } from "../src/for-org.js";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  WrongPlatformRoleError,
  type PlatformClient,
  type PlatformDatabase,
  type PlatformTx,
} from "../src/platform.js";
import { webhookEvents } from "../src/webhooks.js";
import { createTestOrganization } from "./helpers.js";

async function currentRole(tx: PlatformTx): Promise<string | undefined> {
  const [row] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
  return row?.role;
}

describe("the platform database", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationA: string;
  let organizationB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationA = await createTestOrganization(platform, "Platform A");
    organizationB = await createTestOrganization(platform, "Platform B");
    for (const organizationId of [organizationA, organizationB]) {
      await db.forOrg(organizationId, (tx) => tx.orgCounter.create({ data: { key: "PLATFORM-2026", value: 1 } }));
    }
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("sees every organization's rows in a transaction", async () => {
    const keys = await platformDb.transaction((tx) =>
      tx.orgCounter.findMany({
        where: { organizationId: { in: [organizationA, organizationB] }, key: "PLATFORM-2026" },
        select: { organizationId: true },
      }),
    );
    expect(keys.map((row) => row.organizationId).sort()).toEqual([organizationA, organizationB].sort());
  });

  it("refuses a connection that isn't the platform role", async () => {
    const runtimeAsPlatform = createPlatformDatabase(urls.runtime, { maxConnections: 1 });
    try {
      await expect(runtimeAsPlatform.transaction((tx) => tx.orgCounter.count())).rejects.toBeInstanceOf(
        WrongPlatformRoleError,
      );
    } finally {
      await runtimeAsPlatform.disconnect();
    }
  });

  it("steps into one organization as the runtime role, then returns to the platform role", async () => {
    const seen = await platformDb.transaction(async (tx) => {
      const inside = await asOrganization(tx, organizationA, async (orgTx) => {
        // organization_id is filled from the organization stepped into, as inside db.forOrg().
        await orgTx.orgCounter.create({ data: { key: "STEPPED-2026", value: 1 } });
        const [row] = await orgTx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
        return { role: row?.role, organizations: await orgTx.orgCounter.groupBy({ by: ["organizationId"] }) };
      });
      return { inside, after: await currentRole(tx), everyone: await tx.orgCounter.count() };
    });
    expect(seen.inside.role).toBe("app_runtime");
    expect(seen.inside.organizations).toEqual([{ organizationId: organizationA }]);
    expect(seen.after).toBe("app_platform");
    expect(seen.everyone).toBeGreaterThanOrEqual(3);
    expect(await db.forOrg(organizationA, (tx) => tx.orgCounter.count({ where: { key: "STEPPED-2026" } }))).toBe(1);
  });

  it("has only the runtime role's rights inside an organization", async () => {
    // app_runtime may not change audit entries; app_platform may redact their snapshots.
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationA, (orgTx) => orgTx.$executeRaw`UPDATE audit_entry SET before = NULL`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      platformDb.transaction((tx) => tx.$executeRaw`UPDATE audit_entry SET before = NULL WHERE false`),
    ).resolves.toBe(0);
  });

  it("returns to the platform role when the work inside fails, so the transaction can go on", async () => {
    const role = await platformDb.transaction(async (tx) => {
      await expect(
        asOrganization(tx, organizationB, () => Promise.reject(new Error("refused by a business rule"))),
      ).rejects.toThrow("refused by a business rule");
      return currentRole(tx);
    });
    expect(role).toBe("app_platform");
  });

  it("can't be nested: no forOrg(), second organization or second platform transaction inside", async () => {
    await expect(
      platformDb.transaction(() => db.forOrg(organizationA, () => Promise.resolve(1))),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationA, () => asOrganization(tx, organizationB, () => Promise.resolve(1))),
      ),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(platformDb.transaction(() => platformDb.transaction(() => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
  });

  it("refuses an organization id that isn't a UUID before any SQL runs", async () => {
    await expect(
      platformDb.transaction((tx) => asOrganization(tx, "not-a-uuid", () => Promise.resolve(1))),
    ).rejects.toBeInstanceOf(InvalidOrganizationIdError);
  });

  it("reaches the tables without organization_id, but not from inside an organization", async () => {
    await expect(platformDb.transaction((tx) => webhookEvents(tx).count())).resolves.toBeGreaterThanOrEqual(0);
    await expect(
      platformDb.transaction((tx) => asOrganization(tx, organizationA, async (orgTx) => webhookEvents(orgTx).count())),
    ).rejects.toBeInstanceOf(UnscopedModelError);
  });
});
```

In `packages/db/test/database-setup.test.ts`:

replace:
```ts
    ]);
  });
```
with:
```ts
    ]);
  });

  it("lets the platform role switch to the runtime role without inheriting its rights, and no role the reverse", async () => {
    const memberships = await queryAs<{ role: string; member: string; inherits: boolean; switches: boolean }>(
      urls.superuser,
      `SELECT r.rolname AS role, m.rolname AS member, a.inherit_option AS inherits, a.set_option AS switches
       FROM pg_auth_members a
       JOIN pg_roles r ON r.oid = a.roleid
       JOIN pg_roles m ON m.oid = a.member
       WHERE r.rolname LIKE 'app\\_%' OR m.rolname LIKE 'app\\_%'`,
    );
    expect(memberships).toEqual([{ role: "app_runtime", member: "app_platform", inherits: false, switches: true }]);
    await expect(queryAs(urls.runtime, "SET ROLE app_platform")).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "SET ROLE app_migrator")).rejects.toThrow(/permission denied/);
  });
```

In `packages/contracts/test/audit/audit.test.ts`:

replace:
```ts
  });
});
```
with:
```ts
  });

  it("describes an entry made by a platform admin from the console", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c2",
      occurredAt: "2026-10-16T09:30:00.000Z",
      actorUserId: "0199e7a0-0000-7000-8000-0000000000e1",
      source: "platform",
      impersonatedBy: null,
      action: "staff.created",
      entityType: "member",
      entityId: memberId,
      before: null,
      after: { role: "owner", hasEmail: true },
    };
    expect(auditEntry.parse(entry)).toEqual(entry);
  });
});
```

`packages/contracts/test/platform/platform-log.test.ts`:
```ts
// The platform log's contract: pages are bounded, a filter names one organization, and unknown keys are refused.
import { describe, expect, it } from "vitest";
import { listPlatformLogInput, platformLogEntry } from "../../src/platform/index.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";

describe("platform log contracts", () => {
  it("lists 50 entries by default, 1 to 100 when asked, and one organization's when given", () => {
    expect(listPlatformLogInput.parse({})).toEqual({ limit: 50 });
    expect(listPlatformLogInput.parse({ targetOrganizationId: organizationId, limit: 100 })).toEqual({
      targetOrganizationId: organizationId,
      limit: 100,
    });
    expect(listPlatformLogInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listPlatformLogInput.safeParse({ targetOrganizationId: "SHARMA" }).success).toBe(false);
    expect(listPlatformLogInput.safeParse({ action: "organization.onboarded" }).success).toBe(false);
  });

  it("describes an entry by a job, about an organization that may be gone", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c2",
      occurredAt: "2026-10-16T03:30:00.000Z",
      actorUserId: null,
      action: "organization.purged",
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      before: { code: "SHARMA" },
      after: null,
    };
    expect(platformLogEntry.parse(entry)).toEqual(entry);
  });
});
```

In `packages/domain/test/audit/record-audit.test.ts`:

replace:
```ts
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { recordAudit, type AuditSnapshot } from "../../src/audit/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";
```
with:
```ts
import { createDatabase, type Database } from "@travel-crm/db";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listAuditEntries, recordAudit, type AuditSnapshot } from "../../src/audit/index.js";
import { platformActor, systemActor, type Actor } from "../../src/kernel/index.js";
```

replace:
```ts
  let platform: PlatformClient;
  let db: Database;
```
with:
```ts
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
```

replace:
```ts
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
```
with:
```ts
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
```

replace:
```ts
    await db.disconnect();
    await platform.$disconnect();
```
with:
```ts
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
```

replace:
```ts
      expect.objectContaining({ actorUserId: null, source: "job", before: null, after: { name: "Asha Owner" } }),
    ]);
```
with:
```ts
      expect.objectContaining({ actorUserId: null, source: "job", before: null, after: { name: "Asha Owner" } }),
    ]);
  });

  it("records a platform admin acting from the console under their own name, with source platform", async () => {
    const adminUserId = "0199e7a0-0000-7000-8000-0000000000f4";
    const ownerMemberId = "0199e7a0-0000-7000-8000-0000000000f5";
    // The console writes an organization's log from a platform transaction, stepped into the organization.
    await platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, (orgTx) =>
        recordAudit(orgTx, platformActor(organizationId, adminUserId), {
          action: "staff.created",
          entityType: "member",
          entityId: ownerMemberId,
          after: { role: "owner", hasEmail: true },
        }),
      ),
    );
    const page = await db.forOrg(organizationId, (tx) =>
      listAuditEntries(tx, { entityType: "member", entityId: ownerMemberId, limit: 10 }),
    );
    expect(page.entries).toEqual([
      expect.objectContaining({ actorUserId: adminUserId, source: "platform", impersonatedBy: null }),
    ]);
```

`packages/domain/test/platform/platform-log.test.ts`:
```ts
// The platform log: what platform staff did, written in the platform's own transaction, kept after the organization
// it names is gone, and out of reach of the api and the worker.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listPlatformLog, recordPlatformAudit } from "../../src/platform/index.js";

const adminUserId = "0199e7a0-0000-7000-8000-00000000a0a1";

describe("the platform log", () => {
  let platformDb: PlatformDatabase;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 1 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
  });

  it("records who did what to which organization, even one that no longer exists", async () => {
    const goneOrganizationId = randomUUID();
    await platformDb.transaction((tx) =>
      recordPlatformAudit(
        tx,
        { userId: adminUserId },
        {
          action: "organization.purged",
          targetType: "organization",
          targetId: goneOrganizationId,
          targetOrganizationId: goneOrganizationId,
          before: { code: "GONE01" },
        },
      ),
    );
    const page = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: goneOrganizationId, limit: 10 }),
    );
    expect(page).toEqual({
      entries: [
        expect.objectContaining({
          actorUserId: adminUserId,
          action: "organization.purged",
          targetType: "organization",
          targetId: goneOrganizationId,
          targetOrganizationId: goneOrganizationId,
          before: { code: "GONE01" },
          after: null,
        }),
      ],
      nextCursor: null,
    });
  });

  it("pages through the log newest first", async () => {
    const organizationId = randomUUID();
    // One transaction per entry, so each has its own time.
    for (const key of ["first", "second", "third"]) {
      await platformDb.transaction((tx) =>
        recordPlatformAudit(
          tx,
          { userId: null },
          { action: "demo.reset", targetType: "organization", targetId: key, targetOrganizationId: organizationId },
        ),
      );
    }
    const first = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 2 }),
    );
    expect(first.entries.map((entry) => entry.targetId)).toEqual(["third", "second"]);
    const rest = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, before: first.nextCursor ?? undefined, limit: 2 }),
    );
    expect(rest).toEqual({ entries: [expect.objectContaining({ targetId: "first" })], nextCursor: null });
  });

  it("refuses secrets, malformed actions and target kinds before writing anything", async () => {
    const write = (change: Parameters<typeof recordPlatformAudit>[2]) =>
      platformDb.transaction((tx) => recordPlatformAudit(tx, { userId: adminUserId }, change));
    await expect(
      write({ action: "staff.added", targetType: "platform_staff", targetId: adminUserId, after: { password: "x" } }),
    ).rejects.toThrow(/never hold secrets/);
    await expect(write({ action: "Staff added", targetType: "platform_staff", targetId: adminUserId })).rejects.toThrow(
      RangeError,
    );
    await expect(write({ action: "staff.added", targetType: "Platform staff", targetId: adminUserId })).rejects.toThrow(
      RangeError,
    );
    await expect(write({ action: "staff.added", targetType: "platform_staff", targetId: "" })).rejects.toThrow(
      RangeError,
    );
  });

  it("is append-only, even for the platform role", async () => {
    await expect(
      platformDb.transaction((tx) => tx.platformAuditEntry.updateMany({ data: { action: "nothing.happened" } })),
    ).rejects.toThrow(/permission denied/);
    await expect(platformDb.transaction((tx) => tx.platformAuditEntry.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("is out of reach of the api and the worker", async () => {
    await expect(db.withoutOrg((tx) => tx.platformAuditEntry.count())).rejects.toThrow(/permission denied/);
    await expect(
      db.withoutOrg((tx) =>
        tx.platformAuditEntry.create({ data: { action: "a.b", targetType: "organization", targetId: "x" } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/audit/audit.test.ts test/platform/platform-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform-database.test.ts test/database-setup.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/audit/record-audit.test.ts test/platform/platform-log.test.ts`

Expected: FAIL. In `packages/contracts`, `Cannot find module '../../src/platform/index.js'`, and the audit contract
refuses source `platform`. In `packages/db`, `TypeError: createPlatformDatabase is not a function`, and
`database-setup.test.ts` finds no membership of `app_platform` in `app_runtime` (`expected [] to deeply equal
[ { role: 'app_runtime', … } ]`). In `packages/domain`, `createPlatformDatabase is not a function` and
`Cannot find module '../../src/platform/index.js'`.

- [ ] **Step 4: Let the platform role switch to the runtime role, and add the platform log's table**

In `packages/db/sql/bootstrap.sql`:

replace:
```sql
CREATE ROLE app_platform LOGIN PASSWORD 'platform' NOBYPASSRLS;
```
with:
```sql
CREATE ROLE app_platform LOGIN PASSWORD 'platform' NOBYPASSRLS;

-- The platform console steps into one organization as the runtime role inside its own transactions (SET LOCAL ROLE,
-- asOrganization in src/platform.ts), so module code runs there under row-level security. INHERIT FALSE: otherwise
-- the platform role never holds the runtime role's rights. No role may become app_platform or app_migrator.
GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE;
```

`packages/db/prisma/schema/platform.prisma`:
```prisma
// The platform's own records (spec 5 and 7), kept by the console, never by an organization's staff. Not organization-
// owned: no organization_id and no row-level security. The runtime role has no rights on these tables at all.

/// The platform log: what platform staff did in the console, and what the platform's own jobs did. Append-only. It
/// names organizations by id without a foreign key, so it outlives an organization's purge (spec 5).
model PlatformAuditEntry {
  id                   String   @id @default(uuid(7)) @db.Uuid
  occurredAt           DateTime @default(now()) @map("occurred_at") @db.Timestamptz(6)
  /// The platform admin who acted, or null for the platform's own jobs (the nightly demo reset).
  actorUserId          String?  @map("actor_user_id") @db.Uuid
  /// "<entity>.<what happened>", e.g. "organization.onboarded" (CHECK platform_audit_entry_action_format).
  action               String
  /// The kind of thing acted on, e.g. "organization", "plan", "platform_staff", "job".
  targetType           String   @map("target_type")
  /// Its id: a UUID, or for jobs a queue name or job id.
  targetId             String   @map("target_id")
  /// The organization the entry concerns, when there is one.
  targetOrganizationId String?  @map("target_organization_id") @db.Uuid
  /// The fields that changed, as JSON objects; no secrets and no personal data, as in the organizations' log.
  before               Json?
  after                Json?

  /// The log, newest first.
  @@index([occurredAt(sort: Desc), id(sort: Desc)], map: "platform_audit_entry_newest")
  /// One organization's entries, newest first.
  @@index([targetOrganizationId, occurredAt(sort: Desc)], map: "platform_audit_entry_organization")
  @@map("platform_audit_entry")
}
```

`bootstrap.sql` runs once per database as the superuser; every test database runs it. A local database made before
plan 4 needs the grant once by hand (the db README says how).

- [ ] **Step 5: Create the platform log's migration**

The migration adds the table, the audit source `platform`, and the log's rules: append-only for every role, out of the runtime role's reach.

Create the migration from the schema change alone, without a database: `git archive HEAD` still holds the schema from before this task, so no track diffs against another's tables.
```bash
cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261016090000_platform_groundwork
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script --output prisma/migrations/20261016090000_platform_groundwork/migration.sql
pnpm generate
```
Expected: the generated part of the file below, down to the banner. Append the hand-written part, so the whole file reads:

`packages/db/prisma/migrations/20261016090000_platform_groundwork/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "platform_audit_entry" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_organization_id" UUID,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "platform_audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_entry_newest" ON "platform_audit_entry"("occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_entry_organization" ON "platform_audit_entry"("target_organization_id", "occurred_at" DESC);

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A platform admin acting from the console (onboarding, a subscription change) is recorded in that organization's
-- log under their own name, with source "platform" (spec 7.1). Every other rule of the log stays.
ALTER TABLE "audit_entry"
  DROP CONSTRAINT audit_entry_source_value,
  ADD CONSTRAINT audit_entry_source_value CHECK (source IN ('web', 'api', 'job', 'impersonation', 'platform'));

-- Actions and target kinds read like the organizations' log; ids are short; snapshots are small JSON objects.
ALTER TABLE "platform_audit_entry"
  ADD CONSTRAINT platform_audit_entry_action_format CHECK (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT platform_audit_entry_target_type_format CHECK (target_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT platform_audit_entry_target_id_length CHECK (char_length(target_id) BETWEEN 1 AND 200),
  ADD CONSTRAINT platform_audit_entry_before_object CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  ADD CONSTRAINT platform_audit_entry_after_object CHECK (after IS NULL OR jsonb_typeof(after) = 'object'),
  ADD CONSTRAINT platform_audit_entry_before_size CHECK (octet_length(before::text) <= 16384),
  ADD CONSTRAINT platform_audit_entry_after_size CHECK (octet_length(after::text) <= 16384);

-- The api and worker have no business with the platform's log. The console adds entries and reads them; nobody
-- changes or removes one, not even the platform role.
REVOKE ALL ON TABLE "platform_audit_entry" FROM app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "platform_audit_entry" FROM app_platform;
```

- [ ] **Step 6: Write platform transactions and the step into one organization**

In `packages/db/src/errors.ts`:

replace:
```ts
}
```
with:
```ts
}

/** Thrown when a platform transaction's connection is not the app_platform role, the only one that sees every row. */
export class WrongPlatformRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `A platform transaction is connected to the database as ${JSON.stringify(role)}, but only app_platform sees ` +
        "every organization. DATABASE_PLATFORM_URL must connect as the app_platform role.",
    );
    this.name = "WrongPlatformRoleError";
  }
}
```

In `packages/db/src/for-org.ts`:

replace:
```ts
/** A transaction with every model, which this package's entry points unwrap. */
type TransactionClient = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;
```
with:
```ts
/** A transaction with every model, which this package's entry points unwrap. */
export type TransactionClient = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;
```

replace:
```ts

/**
```
with:
```ts

/** Lets a transaction handle reach the tables without organization_id through their entry points. */
export function allowUnscopedModels(handle: object, tx: TransactionClient): void {
  withoutOrgTransactions.set(handle, tx);
}

/**
 * Runs fn as one of this package's transactions (forOrg, withoutOrg, a platform transaction), refusing to start
 * inside another one: the inner transaction would run on a second connection, blind to the outer one's writes.
 */
export async function enterTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, fn);
}

/** Throws InvalidOrganizationIdError, before any SQL runs, unless orgId is a UUID. */
export function assertOrganizationId(orgId: string): void {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
}

/**
```

replace:
```ts
): Promise<T> {
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, async () =>
    client.$transaction(async (tx) => {
```
with:
```ts
): Promise<T> {
  return enterTransaction(async () =>
    client.$transaction(async (tx) => {
```

replace:
```ts
      // No organization: the unscoped tables' entry points may reach through this handle.
      if (orgId === "") withoutOrgTransactions.set(handle, tx);
      return fn(handle);
```
with:
```ts
      // No organization: the unscoped tables' entry points may reach through this handle.
      if (orgId === "") allowUnscopedModels(handle, tx);
      return fn(handle);
```

replace:
```ts
): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  return inOrgTransaction(client, orgId, fn, options);
```
with:
```ts
): Promise<T> {
  assertOrganizationId(orgId);
  return inOrgTransaction(client, orgId, fn, options);
```

replace:
```ts
/**
 * A table without organization_id, from a handle db.withoutOrg() gave out. For @travel-crm/db's entry points; any
 * other transaction, forOrg()'s included, throws UnscopedModelError.
 */
```
with:
```ts
/**
 * A table without organization_id, from a handle db.withoutOrg() or a platform transaction gave out. For
 * @travel-crm/db's entry points; any other transaction, forOrg()'s included, throws UnscopedModelError.
 */
```

In `packages/db/src/platform.ts`:

replace:
```ts
// Entry point for the platform console only: a client that sees every organization (platform_access policy).
import { createPrismaClient, type DatabaseClient } from "./client.js";
```
with:
```ts
// Entry point for the platform module only (dependency-cruiser enforces it, tests aside): transactions as the
// app_platform role, which sees every organization (platform_access policy), and, inside one, a step into a single
// organization as app_runtime, where row-level security and the runtime role's grants apply as in db.forOrg().
import { AsyncLocalStorage } from "node:async_hooks";
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import { NestedForOrgError, WrongPlatformRoleError } from "./errors.js";
import {
  allowUnscopedModels,
  assertOrganizationId,
  enterTransaction,
  hidingUnscopedModels,
  type ForOrgOptions,
  type IdentityTx,
  type TransactionClient,
} from "./for-org.js";

export { WrongPlatformRoleError } from "./errors.js";
export type { ForOrgOptions, IdentityTx, OrgTx } from "./for-org.js";
```

replace:
```ts

/** Connect as the app_platform role. Never use this for requests made by an organization's staff. */
export function createPlatformClient(url: string): PlatformClient {
```
with:
```ts

/**
 * A transaction as app_platform: every model, the sign-in tables and the tables without organization_id included, and
 * every organization's rows. Nothing scopes it, so every query names the organization it means.
 */
export type PlatformTx = TransactionClient;

export interface PlatformDatabase {
  /** Runs fn in one transaction as app_platform. Like forOrg(), it can't be nested in another transaction. */
  transaction<T>(fn: (tx: PlatformTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** A plain client as the app_platform role, for tests that set up data. Never use it for requests. */
export function createPlatformClient(url: string): PlatformClient {
```

replace:
```ts
}
```
with:
```ts
}

/** Connects as the app_platform role. Only the platform console holds this URL; the api and worker never do. */
export function createPlatformDatabase(url: string, options: DatabaseOptions = {}): PlatformDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 5 });
  return {
    transaction: (fn, transactionOptions = {}) =>
      enterTransaction(() =>
        client.$transaction(async (tx) => {
          const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
          if (session?.role !== "app_platform") throw new WrongPlatformRoleError(session?.role);
          // The platform role reads and writes webhook events itself (tombstones after a purge).
          allowUnscopedModels(tx, tx);
          return fn(tx);
        }, transactionOptions),
      ),
    disconnect: () => client.$disconnect(),
  };
}

/** Set while asOrganization() runs, to refuse a second organization inside it. */
const insideOrganization = new AsyncLocalStorage<true>();

/**
 * Inside a platform transaction, runs fn as app_runtime in one organization: row-level security limits every query to
 * it, new rows take its id by default, and only the runtime role's grants apply, exactly as in db.forOrg(). So module
 * code written for forOrg() runs unchanged, in the same transaction as the platform's own writes. Afterwards the
 * transaction is the platform role again, with no organization set, even when fn failed. It can't be nested.
 */
export async function asOrganization<T>(
  tx: PlatformTx,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  assertOrganizationId(organizationId);
  if (insideOrganization.getStore()) throw new NestedForOrgError();
  return insideOrganization.run(true, async () => {
    // SET LOCAL lasts until the transaction ends; RESET ROLE below ends it sooner. The platform role is a member of
    // app_runtime that may switch to it without inheriting its rights (sql/bootstrap.sql).
    await tx.$executeRaw`SET LOCAL ROLE app_runtime`;
    const [session] = await tx.$queryRaw<{ role: string }[]>`
      SELECT current_user AS role, set_config('app.org_id', ${organizationId}, true)`;
    if (session?.role !== "app_runtime") throw new WrongPlatformRoleError(session?.role);
    let result: T;
    try {
      result = await fn(hidingUnscopedModels(tx));
    } catch (error) {
      // A caller may catch this and go on in the transaction, so leave the organization. After a database error the
      // transaction is aborted and leaving fails too; the original error is the one worth reporting.
      await leaveOrganization(tx).catch(() => undefined);
      throw error;
    }
    await leaveOrganization(tx);
    return result;
  });
}

async function leaveOrganization(tx: PlatformTx): Promise<void> {
  await tx.$executeRaw`RESET ROLE`;
  const [session] = await tx.$queryRaw<{ role: string }[]>`
    SELECT current_user AS role, set_config('app.org_id', '', true)`;
  if (session?.role !== "app_platform") throw new WrongPlatformRoleError(session?.role);
}
```

- [ ] **Step 7: Add the platform actor, the audit source and the platform log**

In `packages/contracts/src/audit/audit.ts`:

replace:
```ts
/** Where a change came from. The database's audit_entry_source_value check holds the same values. */
export const auditSource = z.enum(["web", "api", "job", "impersonation"]);
export type AuditSource = z.infer<typeof auditSource>;
```
with:
```ts
/** Where a change came from. The database's audit_entry_source_value check holds the same values. */
export const auditSource = z.enum(["web", "api", "job", "impersonation", "platform"]);
export type AuditSource = z.infer<typeof auditSource>;
```

`packages/contracts/src/platform/index.ts`:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform log.
export * from "./platform-log.js";
```

`packages/contracts/src/platform/platform-log.ts`:
```ts
// Inputs and outputs of the platform log (spec 5, 7): what platform staff did in the console, for the console.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** The fields that changed on one side, or null when there is no state on that side. */
const snapshot = z.record(z.string(), z.unknown()).nullable();

export const platformLogEntry = z.object({
  id: recordId,
  occurredAt: z.iso.datetime(),
  /** The platform admin who acted, or null for the platform's own jobs. */
  actorUserId: recordId.nullable(),
  /** "<entity>.<what happened>", e.g. "organization.onboarded". */
  action: z.string(),
  /** The kind of thing acted on, e.g. "organization" or "plan", and its id. */
  targetType: z.string(),
  targetId: z.string(),
  /** The organization the entry concerns, when there is one; it may have been purged since. */
  targetOrganizationId: recordId.nullable(),
  before: snapshot,
  after: snapshot,
});
export type PlatformLogEntry = z.infer<typeof platformLogEntry>;

/** One page of the log, newest first; optionally one organization's entries only. */
export const listPlatformLogInput = z.strictObject({
  targetOrganizationId: recordId.optional(),
  /** The id of the last entry of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type ListPlatformLogInput = z.infer<typeof listPlatformLogInput>;

export const platformLogPage = z.object({
  entries: z.array(platformLogEntry),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type PlatformLogPage = z.infer<typeof platformLogPage>;
```

In `packages/domain/src/kernel/actor.ts`:

replace:
```ts

/** Where an action came from: the web app, an API client (later), the worker, or support impersonating a user. */
export type ActorSource = "web" | "api" | "job" | "impersonation";
```
with:
```ts

/**
 * Where an action came from: the web app, an API client (later), the worker, support impersonating a user, or a
 * platform admin working in the console (onboarding, a subscription change).
 */
export type ActorSource = "web" | "api" | "job" | "impersonation" | "platform";
```

replace:
```ts
  readonly organizationId: string;
  /** The person acting, or null for the system: a job no person started. */
  readonly userId: string | null;
```
with:
```ts
  readonly organizationId: string;
  /** The person acting, or null for the system: a job no person started. A platform admin for source "platform". */
  readonly userId: string | null;
```

replace:
```ts
}
```
with:
```ts
}

/** A platform admin acting from the console in one organization, in their own name (spec 7.1). */
export function platformActor(organizationId: string, adminUserId: string): Actor {
  return { organizationId, userId: adminUserId, source: "platform", impersonatedBy: null };
}
```

In `packages/domain/src/kernel/index.ts`:

replace:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
```
with:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { platformActor, systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
```

In `packages/domain/src/audit/index.ts`:

replace:
```ts
export { listAuditEntries } from "./list-audit-entries.js";
export { recordAudit, type AuditChange, type AuditSnapshot } from "./record-audit.js";
```
with:
```ts
export { listAuditEntries } from "./list-audit-entries.js";
export { assertAuditable, recordAudit, type AuditChange, type AuditSnapshot } from "./record-audit.js";
```

In `packages/domain/src/audit/record-audit.ts`:

replace:
```ts
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
```
with:
```ts
/**
 * Refuses, before anything is written, what no log may hold: an action not shaped "<entity>.<what happened>", a
 * snapshot key that looks like a secret, or a side over 8192 bytes of JSON. The platform's own log checks the same.
 */
export function assertAuditable(change: Pick<AuditChange, "action" | "before" | "after">): void {
  if (!ACTION_PATTERN.test(change.action)) {
    throw new RangeError(`Audit actions look like "staff.removed", got ${JSON.stringify(change.action)}`);
  }
```

replace:
```ts
    }
  }
```
with:
```ts
    }
  }
}

/**
 * Records who changed what, from where, in the same transaction as the change. The actor's source and impersonatedBy
 * say whether it came from the web app, the worker, support impersonating a member, or a platform admin.
 */
export async function recordAudit(tx: OrgTx, actor: Actor, change: AuditChange): Promise<void> {
  assertAuditable(change);
  if (!ENTITY_TYPE_PATTERN.test(change.entityType)) {
    throw new RangeError(`Audit record kinds look like "member", got ${JSON.stringify(change.entityType)}`);
  }
```

In `packages/domain/src/audit/list-audit-entries.ts`:

replace:
```ts
// Reads an organization's audit log, newest first, a page at a time. The API checks audit:view before calling it.
import type { AuditEntry, AuditEntryPage, ListAuditEntriesInput } from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";
```
with:
```ts
// Reads an organization's audit log, newest first, a page at a time. The API checks audit:view before calling it.
import {
  auditSource,
  type AuditEntry,
  type AuditEntryPage,
  type ListAuditEntriesInput,
} from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";
```

replace:
```ts

/** The table's check allows only these four. */
function sourceOf(value: string): AuditEntry["source"] {
  if (value === "web" || value === "api" || value === "job" || value === "impersonation") return value;
  throw new Error(`Unknown audit source ${JSON.stringify(value)}`);
```
with:
```ts

/** The table's check allows only the contract's sources. */
function sourceOf(value: string): AuditEntry["source"] {
  const source = auditSource.safeParse(value);
  if (source.success) return source.data;
  throw new Error(`Unknown audit source ${JSON.stringify(value)}`);
```

`packages/domain/src/platform/platform-log.ts`:
```ts
// The platform log (spec 5, 7): what platform staff did in the console, and what the platform's own jobs did,
// written in the same platform transaction as the change. Append-only, and kept after the organization it names.
import type { ListPlatformLogInput, PlatformLogEntry, PlatformLogPage } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import { assertAuditable, type AuditSnapshot } from "../audit/index.js";

/** Who acts on the platform: a platform admin by user id, or null for the platform's own jobs. */
export interface PlatformActor {
  readonly userId: string | null;
}

/** One change to record. Snapshots follow the organizations' log: the fields that changed, never secrets. */
export interface PlatformChange {
  /** "<entity>.<what happened>", e.g. "organization.onboarded". */
  action: string;
  /** The kind of thing acted on, e.g. "organization", "plan", "platform_staff" or "job". */
  targetType: string;
  /** Its id: a UUID, or for jobs a queue name or a job id. */
  targetId: string;
  /** The organization the change concerns, when there is one. */
  targetOrganizationId?: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
}

const TARGET_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
const MAX_TARGET_ID_LENGTH = 200;

export async function recordPlatformAudit(tx: PlatformTx, actor: PlatformActor, change: PlatformChange): Promise<void> {
  assertAuditable(change);
  if (!TARGET_TYPE_PATTERN.test(change.targetType)) {
    throw new RangeError(`Platform log targets look like "organization", got ${JSON.stringify(change.targetType)}`);
  }
  if (change.targetId === "" || change.targetId.length > MAX_TARGET_ID_LENGTH) {
    throw new RangeError(`A platform log target id has 1 to ${String(MAX_TARGET_ID_LENGTH)} characters`);
  }
  await tx.platformAuditEntry.create({
    data: {
      actorUserId: actor.userId,
      action: change.action,
      targetType: change.targetType,
      targetId: change.targetId,
      targetOrganizationId: change.targetOrganizationId ?? null,
      // Left out rather than null: the column stays SQL NULL, "no state on this side".
      ...(change.before ? { before: change.before } : {}),
      ...(change.after ? { after: change.after } : {}),
    },
  });
}

/** The log newest first, a page at a time; optionally one organization's entries. */
export async function listPlatformLog(tx: PlatformTx, input: ListPlatformLogInput): Promise<PlatformLogPage> {
  const rows = await tx.platformAuditEntry.findMany({
    where: input.targetOrganizationId ? { targetOrganizationId: input.targetOrganizationId } : {},
    // Entries written in one transaction share its time; the id (UUID v7) orders them and makes the order total.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    entries: page.map((row): PlatformLogEntry => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetOrganizationId: row.targetOrganizationId,
      before: snapshotOf(row.before),
      after: snapshotOf(row.after),
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The table's checks keep snapshots to JSON objects or NULL. */
function snapshotOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}
```

`packages/domain/src/platform/index.ts`:
```ts
// Public API of the platform module: the platform console's work across organizations (spec 5 and 7). Only this
// module uses @travel-crm/db/platform, which sees every organization.
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/audit/audit.test.ts test/platform/platform-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform-database.test.ts test/database-setup.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/audit/record-audit.test.ts test/platform/platform-log.test.ts`

Expected: PASS, 7 tests in 2 files (packages/contracts); 14 tests in 2 files (packages/db); 19 tests in 2 files (packages/domain).

- [ ] **Step 9: Record the decision**

`docs/adr/0018-platform-console.md`:
```markdown
# 0018: The platform console: its own process, the platform role's transactions, the platform log

Date: 2026-10-16 · Status: accepted · Implements spec sections 4 (the `app_platform` role) and 7, with spec 5's
"audit record in the platform log"

## Decision

- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
  `createPlatformDatabase(url).transaction(tx => …)`: one transaction as `app_platform`, which sees every organization
  (its `platform_access` policy) and has the rights the api never gets: creating organizations, writing plans and
  subscriptions, purging. It checks it really is `app_platform` and, like `forOrg()`, can't be nested.
- **Stepping into one organization.** Inside a platform transaction, `asOrganization(tx, orgId, orgTx => …)` runs
  `SET LOCAL ROLE app_runtime` and sets `app.org_id`, so the code inside runs exactly as in `db.forOrg()`: row-level
  security limits it to that organization, new rows take its id, and only the runtime role's grants apply. Then it
  resets the role, even when the work failed. Onboarding, for example, creates the organization as `app_platform` and
  its roles and Owner through the identity module's own code, in one transaction. The platform role may switch to the
  runtime role without inheriting its rights (`GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE`); no
  role may switch to `app_platform`.
- **Platform admins act in their own name.** A change a platform admin makes to an organization's data is recorded in
  that organization's audit log with source `platform` and the admin as the actor (`platformActor(organizationId,
adminUserId)`), not as the system.
- **The platform log.** `platform_audit_entry` records every console change and the platform's own jobs: who (or the
  system), the action, the target and the organization it concerns, and small before and after snapshots with the
  same checks as the organizations' log. It has no foreign key to `organization`, so it outlives a purge (spec 5:
  "an audit record in the platform log"). It is append-only even for `app_platform`, and `app_runtime` has no rights on
  it.

## Context

- **Why switch roles instead of filtering by hand.** As `app_platform` nothing scopes a query: module code written for
  `forOrg()` that relies on row-level security (counting a table, a default `organization_id`) would read or write
  across organizations. Switching to `app_runtime` inside the transaction keeps one rule for all module code (it always
  runs under row-level security) and still lets platform-only writes share the transaction, so an onboarding that fails
  halfway leaves nothing behind.
- **Why `SET LOCAL`.** It ends with the transaction, so a pooled connection never carries the role over, the same
  reason `app.org_id` is transaction-local. ESLint keeps `SET ROLE` out of every package but `packages/db`.
- **Why `INHERIT FALSE`.** With inheritance the platform role would also hold the runtime role's grants (rate-limit
  counters, which it has no business with) and be subject to its policies; without it, the membership only allows the
  explicit switch.

## Consequences

- A hosted database needs the same `GRANT` when its roles are created (plan 5's deploy checklist); a local database
  bootstrapped before plan 4 needs it run once (`packages/db/README.md`).
- Everything a platform transaction does outside `asOrganization` must name its organization; reviewers check it.
```

In `packages/db/README.md`:

replace:
```markdown
| `@travel-crm/db/identity`             | the identity module only    | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only    | a client that sees every organization                                         |
| `@travel-crm/db/webhooks`             | the webhooks module only    | `webhookEvents(tx)`: the `webhook_event` table, in `db.withoutOrg()`          |
```
with:
```markdown
| `@travel-crm/db/identity`             | the identity module only    | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only    | transactions that see every organization, and `asOrganization` inside them    |
| `@travel-crm/db/webhooks`             | the webhooks module only    | `webhookEvents(tx)`: the `webhook_event` table, in `db.withoutOrg()`          |
```

replace:
```markdown
`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
```
with:
```markdown
`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).

## The platform role's transactions

`createPlatformDatabase(DATABASE_PLATFORM_URL).transaction(tx => …)` runs as `app_platform`, which sees and may change
every organization's rows: name the organization in every query. Inside such a transaction,
`asOrganization(tx, orgId, orgTx => …)` switches to `app_runtime` in one organization (`SET LOCAL ROLE`, then
`app.org_id`), so module code written for `db.forOrg()` runs unchanged under row-level security and the runtime role's
grants, in the same transaction as the platform's own writes ([ADR 0018](../../docs/adr/0018-platform-console.md)).
It returns to `app_platform` afterwards, even when its work failed, and can't be nested. The switch needs
`GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE` (in `sql/bootstrap.sql`); a local database made before
it needs that line run once as the `postgres` superuser:

    docker compose exec postgres psql -U postgres -d travel_crm -c "GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE"

Platform transactions also reach the tables without `organization_id` through their entry points
(`webhookEvents(tx)`); a transaction stepped into an organization does not.
```

In `packages/domain/src/audit/README.md`:

replace:
```markdown
- `recordAudit(tx, actor, { action, entityType, entityId, before?, after? })`: writes one entry in the change's own
  transaction, so the entry exists exactly when the change commits. The `actor` (an `Actor`, such as `MemberAccess`
  or `systemActor(organizationId)`) gives who acted, the source (`web`, `api`, `job`, `impersonation`) and the
  platform admin while support impersonates a member.
- `listAuditEntries(tx, input)`: the log newest first, a page at a time (`before` is the last id of the previous
```
with:
```markdown
- `recordAudit(tx, actor, { action, entityType, entityId, before?, after? })`: writes one entry in the change's own
  transaction, so the entry exists exactly when the change commits. The `actor` (an `Actor`, such as `MemberAccess`,
  `systemActor(organizationId)` or `platformActor(organizationId, adminUserId)`) gives who acted, the source (`web`,
  `api`, `job`, `impersonation`, `platform`) and the platform admin while support impersonates a member.
- `assertAuditable({ action, before?, after? })`: the checks `recordAudit` makes before writing (the action's shape, no
  secrets, at most 8192 bytes a side), for the platform's own log.
- `listAuditEntries(tx, input)`: the log newest first, a page at a time (`before` is the last id of the previous
```

In `packages/domain/src/kernel/README.md`:

replace:
```markdown

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
```
with:
```markdown

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009), and
  `platformActor(organizationId, adminUserId)` for a platform admin working in the console (ADR 0018).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
```

`packages/domain/src/platform/README.md`:
```markdown
# platform

The platform console's work across organizations (spec sections 5 and 7). It is the only module that uses
`@travel-crm/db/platform`, whose transactions see every organization; the console process is the only one that holds
`DATABASE_PLATFORM_URL` ([ADR 0018](../../../../docs/adr/0018-platform-console.md)).

## Public functions and values (`index.ts`)

- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
  one entry in the platform log, in the platform transaction that makes the change. `actor` is `{ userId }`, the
  platform admin, or `{ userId: null }` for the platform's own jobs.
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.

## Events

None.

## Rules worth knowing

- A platform transaction (`PlatformTx`) has no organization: every query names the organization it means. Work that
  belongs to one organization (module code written for `db.forOrg()`) runs inside `asOrganization(tx, orgId, …)`,
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes to an organization's data is recorded twice: in the platform log, and in that
  organization's audit log as `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too.
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
  hold ids and small facts, never secrets or personal data, so they can outlive the organization they name.
```

- [ ] **Step 10: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=142 api=4 brand=21 contracts=72 db=194 domain=427 eslint-config=81 integrations=141 (1,082). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git add docs/adr/0018-platform-console.md packages/contracts/src/audit/audit.ts packages/contracts/src/platform/index.ts packages/contracts/src/platform/platform-log.ts packages/contracts/test/audit/audit.test.ts packages/contracts/test/platform/platform-log.test.ts packages/db/README.md packages/db/prisma/migrations/20261016090000_platform_groundwork/migration.sql packages/db/prisma/schema/platform.prisma packages/db/sql/bootstrap.sql packages/db/src/errors.ts packages/db/src/for-org.ts packages/db/src/platform.ts packages/db/test/database-setup.test.ts packages/db/test/platform-database.test.ts packages/domain/src/audit/README.md packages/domain/src/audit/index.ts packages/domain/src/audit/list-audit-entries.ts packages/domain/src/audit/record-audit.ts packages/domain/src/kernel/README.md packages/domain/src/kernel/actor.ts packages/domain/src/kernel/index.ts packages/domain/src/platform/README.md packages/domain/src/platform/index.ts packages/domain/src/platform/platform-log.ts packages/domain/test/audit/record-audit.test.ts packages/domain/test/platform/platform-log.test.ts
git commit -m "feat: give the platform console its own transactions, a step into one organization, and a log"
```

---
### Task 0.2: The console's own tRPC at /api/platform/trpc, for support and super admins

The console's procedures are served apart from the api's, by the console process (Task I2), so they get their own
tRPC instance, context and builders. The context always reads the session from the database. `staffProcedure` lets in
platform staff of either level (a platform role and no membership, ever) who have no temporary password left to
replace; `superAdminProcedure` adds the super-admin level, which spec 5 asks for permanent deletion. Plan 2's
`platformProcedure` and its one-procedure router move here. This task also defines the two levels in identity (Better
Auth role `admin` for support, `super-admin` for a super admin, both admin roles to Better Auth's admin plugin),
`PlatformServices`, and the HTTP app the console process serves, so Tracks S and P add routers without touching any
of it. The app logs as plan 3's api does: an unexpected error is one line of names and codes in the process's log,
and the caller hears only "Something went wrong".

**Files:**
- Create: `apps/api/src/body-limit.ts`, `apps/api/src/console-app.ts`, `packages/api/src/platform/context.ts`, `packages/api/src/platform/platform-router.ts`, `packages/api/src/platform/procedures.ts`, `packages/api/src/platform/trpc.ts`, `packages/contracts/src/platform/platform-staff.ts`, `packages/domain/src/platform/services.ts`
- Modify: `docs/adr/0018-platform-console.md`, `packages/api/README.md`, `packages/api/src/errors.ts`, `packages/api/src/index.ts`, `packages/api/src/procedures.ts`, `packages/api/src/routers/app-router.ts`, `packages/api/src/trpc.ts`, `packages/contracts/src/platform/index.ts`, `packages/domain/src/identity/README.md`, `packages/domain/src/identity/access.ts`, `packages/domain/src/identity/auth/create-auth.ts`, `packages/domain/src/identity/auth/side-doors.ts`, `packages/domain/src/identity/identity.ts`, `packages/domain/src/identity/index.ts`, `packages/domain/src/platform/index.ts`
- Delete: `packages/api/src/routers/platform.ts`
- Test: `apps/api/test/console.test.ts`, `apps/api/test/platform.test.ts`, `apps/api/test/support/console.ts`, `packages/domain/test/identity/platform-staff-levels.test.ts`

**Interfaces:**
- Consumes (Task 0.1): `createPlatformDatabase`, `PlatformDatabase`; plans 2-3's `isPlatformAdmin`,
  `hasEverBeenMember`, `closeSideDoors`, `toTrpcError`, `requireTrustedJson`, `ProcessLog`, `apiErrorHandler(log)`,
  `describeError`, the api's `createContext` and test server.
- Produces:
  - `@travel-crm/contracts/platform`: `platformStaffLevel` (`"support" | "super-admin"`), `platformWhoAmIOutput`
    (`{ userId, name, level }`).
  - `@travel-crm/domain/identity`: `platformStaffRoles` (`{ support: "admin", "super-admin": "super-admin" }`),
    `platformStaffLevelOf(role)`, `PlatformStaffMember` (`{ userId, name, level, mustChangePassword }`), and
    `Identity.describePlatformStaff(userId): Promise<PlatformStaffMember | null>`.
  - `@travel-crm/domain/platform`: `PlatformServices` (`{ platformDb, db, identity, storage, queue }`),
    `createPlatformServices({ platformDatabaseUrl, maxConnections?, db, identity, storage, queue })`.
  - `@travel-crm/api`: `platformRouter` and type `PlatformRouter` (`whoAmI`, `log.list`), `createPlatformContext(services,
    request, resHeaders)`; in `packages/api/src/platform/`: `platformT`, `staffProcedure` (adds `ctx.staff`),
    `superAdminProcedure`. Refusals: `PLATFORM_ONLY`, `CHANGE_PASSWORD`, `SUPER_ADMIN_ONLY`.
  - `apps/api`: `createConsoleApp(services: PlatformServices, log: ProcessLog): Hono` (health check and
    `/api/platform/trpc`) and `limitBody(maxSize)` in `src/body-limit.ts`; test support `createTestConsole(server,
    options?)` (`{ app, services, lines, close }`, `lines` being what the console logged), `consoleQuery`,
    `consoleMutate`, `callConsoleRouter(testConsole, router, path, call?)` (for a router not yet in `platformRouter`)
    and `signedInPlatformStaff(server, level?, options?)` in `test/support/console.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/identity/platform-staff-levels.test.ts`:
```ts
// Platform staff have two levels (spec 5, 6.1): support (Better Auth role "admin") and super admin ("super-admin").
// Either way they have no membership, ever; anyone who has or had one is no platform staff, whatever their role.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("platform staff levels", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let agency: TestAgency;

  beforeAll(async () => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  /** A person who has never been a member, with this Better Auth role and a password. */
  async function outsider(role: string | null, mustChangePassword = false) {
    const email = `staff-${crypto.randomUUID()}@platform.test`;
    const user = await platform.user.create({ data: { name: "Platform person", email, role, mustChangePassword } });
    const hash = await (await test.identity.auth.$context).password.hash("platform-password-1");
    await platform.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
    return { userId: user.id, email };
  }

  it("knows support by the admin role, and a super admin by the super-admin role", async () => {
    const support = await outsider("admin");
    const superAdmin = await outsider("super-admin");
    expect(await test.identity.describePlatformStaff(support.userId)).toEqual({
      userId: support.userId,
      name: "Platform person",
      level: "support",
      mustChangePassword: false,
    });
    expect(await test.identity.describePlatformStaff(superAdmin.userId)).toMatchObject({ level: "super-admin" });
    expect(await test.identity.isPlatformAdmin({ id: superAdmin.userId })).toBe(true);
  });

  it("gives no level to people without a platform role, or who have ever been members", async () => {
    expect(await test.identity.describePlatformStaff((await outsider(null)).userId)).toBeNull();
    expect(await test.identity.describePlatformStaff((await outsider("user")).userId)).toBeNull();
    expect(await test.identity.describePlatformStaff((await outsider("admin,super-admin")).userId)).toBeNull();
    await platform.user.update({ where: { id: agency.ownerUserId }, data: { role: "super-admin" } });
    try {
      expect(await test.identity.describePlatformStaff(agency.ownerUserId)).toBeNull();
      expect(await test.identity.isPlatformAdmin({ id: agency.ownerUserId })).toBe(false);
    } finally {
      await platform.user.update({ where: { id: agency.ownerUserId }, data: { role: null } });
    }
    expect(await test.identity.describePlatformStaff(crypto.randomUUID())).toBeNull();
  });

  it("says when platform staff still have a temporary password to replace", async () => {
    const newcomer = await outsider("admin", true);
    expect(await test.identity.describePlatformStaff(newcomer.userId)).toMatchObject({ mustChangePassword: true });
  });

  it("refuses to make a member a super admin through Better Auth's admin endpoints", async () => {
    const superAdmin = await outsider("super-admin");
    const headers = await signInByEmail(test.identity, superAdmin.email, "platform-password-1");
    await expect(
      test.identity.auth.api.setRole({ headers, body: { userId: agency.ownerUserId, role: "super-admin" } }),
    ).rejects.toMatchObject({ body: { code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF" } });
  });
});
```

`apps/api/test/support/console.ts`:
```ts
// The platform console on the test database, beside a test server whose identity it shares (so the server's sign-in
// cookies work here): its services, on in-memory storage and job queue unless a test passes real ones, its HTTP app,
// and calls to a part of its router before that part joins platformRouter.
import { createPlatformContext } from "@travel-crm/api";
import { createDatabase } from "@travel-crm/db";
import { createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import { createMemoryJobQueue, type JobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
import type { AnyTRPCRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { inject } from "vitest";
import { createConsoleApp } from "../../src/console-app.js";
import { CookieJar } from "./cookie-jar.js";
import { ORIGIN, signInByEmail, type TestServer } from "./test-server.js";

export interface TestConsole {
  app: Hono;
  services: PlatformServices;
  /** What the console logged: nothing, unless a call failed unexpectedly. */
  lines: string[];
  close(): Promise<void>;
}

export interface TestConsoleOptions {
  storage?: ObjectStorage;
  queue?: JobQueue;
}

export function createTestConsole(server: TestServer, options: TestConsoleOptions = {}): TestConsole {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const services = createPlatformServices({
    platformDatabaseUrl: urls.platform,
    maxConnections: 2,
    db,
    identity: server.identity,
    storage: options.storage ?? createMemoryStorage(),
    queue: options.queue ?? createMemoryJobQueue(),
  });
  const lines: string[] = [];
  return {
    app: createConsoleApp(services, (line) => lines.push(line)),
    services,
    lines,
    close: async () => {
      await services.platformDb.disconnect();
      await db.disconnect();
    },
  };
}

/** A console query through the console app, as the console screens call it: a GET with the input in the URL. */
export async function consoleQuery(
  testConsole: TestConsole,
  path: string,
  jar?: CookieJar,
  input?: unknown,
): Promise<Response> {
  const search = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return testConsole.app.request(`/api/platform/trpc/${path}${search}`, {
    headers: jar ? { cookie: jar.header } : {},
  });
}

/** A console mutation through the console app: a JSON POST from the trusted origin. */
export async function consoleMutate(
  testConsole: TestConsole,
  path: string,
  input: unknown,
  jar?: CookieJar,
): Promise<Response> {
  return testConsole.app.request(`/api/platform/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(jar ? { cookie: jar.header } : {}) },
    body: JSON.stringify(input),
  });
}

/**
 * Calls `path` on `router`, a part of the console's router that hasn't joined platformRouter yet, with the console's
 * context: queries as GETs, mutations as JSON POSTs.
 */
export async function callConsoleRouter(
  testConsole: TestConsole,
  router: AnyTRPCRouter,
  path: string,
  call: { jar?: CookieJar; input?: unknown; mutation?: boolean } = {},
): Promise<Response> {
  const cookie = call.jar ? { cookie: call.jar.header } : {};
  const request = call.mutation
    ? new Request(`${ORIGIN}/api/platform/trpc/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...cookie },
        body: JSON.stringify(call.input),
      })
    : new Request(
        `${ORIGIN}/api/platform/trpc/${path}${call.input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(call.input))}`}`,
        { headers: cookie },
      );
  return fetchRequestHandler({
    endpoint: "/api/platform/trpc",
    req: request,
    router,
    createContext: ({ req, resHeaders }) => createPlatformContext(testConsole.services, req, resHeaders),
  });
}

export interface TestPlatformStaff {
  userId: string;
  email: string;
  password: string;
  jar: CookieJar;
}

/** Platform staff at the given level, signed in through the test server; their temporary password already replaced. */
export async function signedInPlatformStaff(
  server: TestServer,
  level: "support" | "super-admin" = "support",
  options: { mustChangePassword?: boolean } = {},
): Promise<TestPlatformStaff> {
  const email = `${level}-${crypto.randomUUID()}@platform.test`;
  const password = "platform-password-1";
  const hash = await (await server.identity.auth.$context).password.hash(password);
  const user = await server.platform.user.create({
    data: {
      name: level === "support" ? "Platform support" : "Platform super admin",
      email,
      role: level === "support" ? "admin" : "super-admin",
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
  await server.platform.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
  });
  const jar = new CookieJar();
  const response = await signInByEmail(server, jar, email, password);
  if (!response.ok) throw new Error(`platform staff sign-in failed with ${String(response.status)}`);
  return { userId: user.id, email, password, jar };
}
```

`apps/api/test/console.test.ts`:
```ts
// The platform console's HTTP app (spec 7): platform staff of either level reach it on a session read from the
// database; organization staff, people with a temporary password and other sites don't. A call that fails unexpectedly
// is logged by names and codes, as the api logs (plan 3).
import { recordPlatformAudit } from "@travel-crm/domain/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConsoleApp } from "../src/console-app.js";
import {
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the platform console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
    support = await signedInPlatformStaff(server, "support");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("answers its health check", async () => {
    const response = await testConsole.app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("tells platform staff who they are, at their level", async () => {
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", support.jar))).toEqual({
      userId: support.userId,
      name: "Platform support",
      level: "support",
    });
    const superAdmin = await signedInPlatformStaff(server, "super-admin");
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", superAdmin.jar))).toMatchObject({
      level: "super-admin",
    });
  });

  it("refuses organization staff, people not signed in, and platform staff with a temporary password", async () => {
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
      reason: "PLATFORM_ONLY",
    });
    expect((await consoleQuery(testConsole, "whoAmI")).status).toBe(401);
    const newcomer = await signedInPlatformStaff(server, "support", { mustChangePassword: true });
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", newcomer.jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
  });

  it("reads the session from the database, so a session that is gone stops at once", async () => {
    const leaving = await signedInPlatformStaff(server, "support");
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(200);
    // The cookie cache still holds the session; only the row is gone.
    await server.platform.session.deleteMany({ where: { userId: leaving.userId } });
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(401);
  });

  it("refuses writes from other sites and bodies that aren't JSON, as the api does", async () => {
    const write = (headers: Record<string, string>) =>
      testConsole.app.request("/api/platform/trpc/whoAmI", {
        method: "POST",
        headers: { cookie: support.jar.header, ...headers },
        body: "{}",
      });
    expect((await write({ origin: "https://evil.example", "content-type": "application/json" })).status).toBe(403);
    expect((await write({ origin: "http://localhost", "content-type": "text/plain" })).status).toBe(415);
  });

  it("logs a call that fails unexpectedly by its path and names only, and tells the caller nothing more", async () => {
    const lines: string[] = [];
    const leak = new Error("no row for jane.doe@example.com");
    const { platformDb } = testConsole.services;
    const failing = createConsoleApp(
      { ...testConsole.services, platformDb: { ...platformDb, transaction: () => Promise.reject(leak) } },
      (line) => lines.push(line),
    );
    const response = await failing.request(
      `/api/platform/trpc/log.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      { headers: { cookie: support.jar.header } },
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/jane/);
    expect(lines).toEqual(["console tRPC log.list failed: TRPCError INTERNAL_SERVER_ERROR, caused by Error"]);
  });

  it("shows platform staff the platform log", async () => {
    await testConsole.services.platformDb.transaction((tx) =>
      recordPlatformAudit(
        tx,
        { userId: support.userId },
        {
          action: "organization.viewed",
          targetType: "organization",
          targetId: agency.organizationId,
          targetOrganizationId: agency.organizationId,
        },
      ),
    );
    const page = await dataOf<{ entries: { action: string; actorUserId: string | null }[] }>(
      await consoleQuery(testConsole, "log.list", support.jar, { targetOrganizationId: agency.organizationId }),
    );
    expect(page.entries).toEqual([
      expect.objectContaining({ action: "organization.viewed", actorUserId: support.userId }),
    ]);
  });
});
```

In `apps/api/test/platform.test.ts`:

replace:
```ts
// Platform staff (spec 6.1): user role "admin" and no organization. They reach platform procedures, organization
// staff don't, and impersonation (at most an hour) makes the admin act as the user, never as platform staff.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
```
with:
```ts
// Platform staff (spec 6.1): a platform role and no organization. They reach the console, organization staff don't,
// and impersonation (at most an hour) makes the admin act as the user, never as platform staff.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consoleQuery, createTestConsole, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
```

replace:
```ts
  let server: TestServer;
  let agency: TestAgency;
```
with:
```ts
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;
```

replace:
```ts
    server = createTestServer();
    agency = await createTestAgency(server);
```
with:
```ts
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
```

replace:
```ts
  afterAll(async () => {
    await server.close();
```
with:
```ts
  afterAll(async () => {
    await testConsole.close();
    await server.close();
```

replace:
```ts
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await dataOf(await query(server, "platform.whoAmI", jar))).toEqual({
      userId: admin.userId,
      name: "Platform support",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).isPlatformAdmin).toBe(true);
    expect(await refusalOf(await query(server, "platform.whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
```
with:
```ts
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      userId: admin.userId,
      name: "Platform support",
      level: "support",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).isPlatformAdmin).toBe(true);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
```

replace:
```ts
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await query(server, "platform.whoAmI", jar)).status).toBe(403);
    const session = await server.platform.session.findFirstOrThrow({
```
with:
```ts
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await consoleQuery(testConsole, "whoAmI", jar)).status).toBe(403);
    const session = await server.platform.session.findFirstOrThrow({
```

`platform.test.ts` keeps plan 2's checks of the api: its own tRPC no longer serves the platform's procedure.

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console.test.ts test/platform.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/platform-staff-levels.test.ts`

Expected: FAIL. In `packages/domain`, `TypeError: test.identity.describePlatformStaff is not a function` (three
tests), and Better Auth's admin endpoint still answers "Platform staff only" where a super admin should be refused as
a member. In `apps/api`, both files fail to load: `Cannot find module '../../src/console-app.js'`.

- [ ] **Step 3: Define the two levels of platform staff**

`packages/contracts/src/platform/platform-staff.ts`:
```ts
// Platform staff as the console shows them (spec 5, 6.1): support, and super admins who also manage plans, platform
// staff and permanent deletion.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const platformStaffLevel = z.enum(["support", "super-admin"]);
export type PlatformStaffLevel = z.infer<typeof platformStaffLevel>;

/** Who is signed in to the console. */
export const platformWhoAmIOutput = z.object({ userId: recordId, name: z.string(), level: platformStaffLevel });
export type PlatformWhoAmIOutput = z.infer<typeof platformWhoAmIOutput>;
```

In `packages/contracts/src/platform/index.ts`:

replace:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform log.
export * from "./platform-log.js";
```
with:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./platform-log.js";
export * from "./platform-staff.js";
```

In `packages/domain/src/identity/access.ts`:

replace:
```ts
import type { MeOutput } from "@travel-crm/contracts/identity";
import { withDeleted } from "@travel-crm/db";
```
with:
```ts
import type { MeOutput } from "@travel-crm/contracts/identity";
import type { PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { withDeleted } from "@travel-crm/db";
```

replace:
```ts
/**
 * Platform staff (spec 6.1): Better Auth role "admin" and no membership in any organization, ever. The role is read
 * from the database, never taken from the caller. The caller's `role` is ignored; only `id` says which user to check.
 */
```
with:
```ts
/**
 * Better Auth's user.role for each level of platform staff (spec 5, 6.1). Support works with organizations:
 * onboarding, subscriptions, impersonation, failed jobs. A super admin also manages plans, platform staff and
 * permanent deletion. "admin" came first (plan 2) and means support.
 */
export const platformStaffRoles: Readonly<Record<PlatformStaffLevel, string>> = {
  support: "admin",
  "super-admin": "super-admin",
};

/** Platform staff as the console sees them. */
export interface PlatformStaffMember {
  userId: string;
  name: string;
  level: PlatformStaffLevel;
  /** Set until they replace a temporary password; the console refuses them until then. */
  mustChangePassword: boolean;
}

/** The level a stored role names exactly, or null. A comma-joined list of roles is no level. */
export function platformStaffLevelOf(role: string | null | undefined): PlatformStaffLevel | null {
  if (role === platformStaffRoles.support) return "support";
  if (role === platformStaffRoles["super-admin"]) return "super-admin";
  return null;
}

/**
 * Platform staff (spec 6.1): a platform role and no membership in any organization, ever. The role is read from the
 * database, never taken from the caller. The caller's `role` is ignored; only `id` says which user to check.
 */
```

replace:
```ts
export async function isPlatformAdminUser(client: IdentityClient, userId: string): Promise<boolean> {
  const stored = await client.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (stored?.role !== "admin") return false;
  return !(await hasEverBeenMember(client, userId));
}
```
with:
```ts
export async function isPlatformAdminUser(client: IdentityClient, userId: string): Promise<boolean> {
  return (await describePlatformStaff(client, userId)) !== null;
}

/** The person's platform level and name, or null when they are not platform staff (or have ever been a member). */
export async function describePlatformStaff(
  client: IdentityClient,
  userId: string,
): Promise<PlatformStaffMember | null> {
  const stored = await client.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, mustChangePassword: true },
  });
  const level = platformStaffLevelOf(stored?.role);
  if (!stored || level === null || (await hasEverBeenMember(client, userId))) return null;
  return { userId, name: stored.name, level, mustChangePassword: stored.mustChangePassword };
}
```

In `packages/domain/src/identity/auth/create-auth.ts`:

replace:
```ts
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
```
with:
```ts
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { organization } from "better-auth/plugins/organization";
```

replace:
```ts
import { username } from "better-auth/plugins/username";
import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";
```
with:
```ts
import { username } from "better-auth/plugins/username";
import { platformStaffRoles } from "../access.js";
import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";
```

replace:
```ts
      }),
      // Platform staff have user role "admin". Support may impersonate a user for at most an hour (spec 6.1).
      admin({ adminRoles: ["admin"], impersonationSessionDuration: 60 * 60 }),
      // Writes "support.impersonation-started" and "-stopped" to the member's organization's audit log.
```
with:
```ts
      }),
      // Platform staff have user role "admin" (support) or "super-admin"; Better Auth gives both the same powers and
      // our own checks tell them apart. Support may impersonate a user for at most an hour (spec 6.1).
      admin({
        adminRoles: Object.values(platformStaffRoles),
        roles: { user: userAc, [platformStaffRoles.support]: adminAc, [platformStaffRoles["super-admin"]]: adminAc },
        impersonationSessionDuration: 60 * 60,
      }),
      // Writes "support.impersonation-started" and "-stopped" to the member's organization's audit log.
```

In `packages/domain/src/identity/auth/side-doors.ts`:

replace:
```ts
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { hasEverBeenMember, isPlatformAdminUser } from "../access.js";
```
with:
```ts
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { hasEverBeenMember, isPlatformAdminUser, platformStaffLevelOf } from "../access.js";
```

replace:
```ts
/**
 * Whether an /admin request would give the admin role to a person who has (or had) a membership. Mirrors how Better
 * Auth reads the request: the user id is coerced to a string, and a role string may hold several roles, comma-joined.
 */
```
with:
```ts
/**
 * Whether an /admin request would give a platform role (support's "admin" or "super-admin") to a person who has (or
 * had) a membership. Mirrors how Better Auth reads the request: the user id is coerced to a string, and a role string
 * may hold several roles, comma-joined.
 */
```

replace:
```ts
  const userId = coercedString(body.userId);
  if (!roles.includes("admin") || userId === null) return false;
  return hasEverBeenMember(client, userId);
```
with:
```ts
  const userId = coercedString(body.userId);
  if (!roles.some((role) => platformStaffLevelOf(role) !== null) || userId === null) return false;
  return hasEverBeenMember(client, userId);
```

In `packages/domain/src/identity/identity.ts`:

replace:
```ts
import {
  describeSignedInPerson,
```
with:
```ts
import {
  describePlatformStaff,
  describeSignedInPerson,
```

replace:
```ts
  type AccessSession,
  type SignedInSession,
```
with:
```ts
  type AccessSession,
  type PlatformStaffMember,
  type SignedInSession,
```

replace:
```ts
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** True for platform staff: user role "admin" (read from the database) and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The actor's organization's staff. The API checks staff:manage first. */
```
with:
```ts
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** True for platform staff: a platform role (read from the database) and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The person's platform level, name and pending password change, or null for anyone who isn't platform staff. */
  describePlatformStaff(userId: string): Promise<PlatformStaffMember | null>;
  /** The actor's organization's staff. The API checks staff:manage first. */
```

replace:
```ts
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    staff: {
```
with:
```ts
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    describePlatformStaff: (userId) => describePlatformStaff(database.client, userId),
    staff: {
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export type { RoleFacts } from "./access-rules.js";
export type { AccessSession, SignedInSession } from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
```
with:
```ts
export type { RoleFacts } from "./access-rules.js";
export {
  platformStaffLevelOf,
  platformStaffRoles,
  type AccessSession,
  type PlatformStaffMember,
  type SignedInSession,
} from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
```

`packages/domain/src/platform/services.ts`:
```ts
// What the platform console runs on, built once by the console process (apps/api's `console` command): the only
// process that holds DATABASE_PLATFORM_URL.
import type { Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { Identity } from "../identity/index.js";

export interface PlatformServices {
  /** The platform role: every organization, in transactions that can step into one (asOrganization). */
  platformDb: PlatformDatabase;
  /** The runtime role, for work in one organization that needs no platform rights. */
  db: Database;
  /** Sessions, platform staff and everything else about sign-in. */
  identity: Identity;
  /** Object storage, where organizations' files are kept. */
  storage: ObjectStorage;
  /** Where the console queues the platform's own jobs. */
  queue: JobQueue;
}

export interface PlatformServicesOptions extends Omit<PlatformServices, "platformDb"> {
  /** DATABASE_PLATFORM_URL: must connect as the app_platform role. */
  platformDatabaseUrl: string;
  /** Size of the platform role's connection pool. A handful is plenty: few people use the console. */
  maxConnections?: number;
}

/** Connects the platform role. Close it with `services.platformDb.disconnect()`; the rest belong to the caller. */
export function createPlatformServices(options: PlatformServicesOptions): PlatformServices {
  const { platformDatabaseUrl, maxConnections, ...shared } = options;
  return {
    ...shared,
    platformDb: createPlatformDatabase(platformDatabaseUrl, { maxConnections: maxConnections ?? 3 }),
  };
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
```
with:
```ts
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
export { createPlatformServices, type PlatformServices, type PlatformServicesOptions } from "./services.js";
```

- [ ] **Step 4: Give the console its tRPC instance, context, builders and router**

`packages/api/src/platform/trpc.ts`:
```ts
// The platform console's own tRPC instance: its context differs from the api's, its error shape doesn't.
import { initTRPC } from "@trpc/server";
import { errorShape } from "../errors.js";
import type { PlatformContext } from "./context.js";

export const platformT = initTRPC.context<PlatformContext>().create({
  // As in the api: no stack traces in responses, whatever NODE_ENV says.
  isDev: false,
  errorFormatter: errorShape,
});
```

`packages/api/src/platform/context.ts`:
```ts
// The console's tRPC context: who is signed in, read from the database on every request (everything the console does
// is sensitive, spec 6.4), and the services the console runs on.
import type { PlatformServices } from "@travel-crm/domain/platform";
import { forwardCookies } from "../context.js";

export async function createPlatformContext(services: PlatformServices, request: Request, resHeaders: Headers) {
  const { headers, response } = await services.identity.auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  forwardCookies(headers, resHeaders);
  return {
    services,
    headers: request.headers,
    resHeaders,
    session: response?.session ?? null,
    user: response?.user ?? null,
  };
}

export type PlatformContext = Awaited<ReturnType<typeof createPlatformContext>>;
```

`packages/api/src/platform/procedures.ts`:
```ts
// The console's procedure builders. Every request is checked against the database: signed in, platform staff (a
// platform role and no membership), no temporary password left to replace; super admins for the rest (spec 5).
import { TRPCError } from "@trpc/server";
import { DomainError } from "@travel-crm/domain/kernel";
import { toTrpcError } from "../errors.js";
import { platformT } from "./trpc.js";

/** Every procedure turns domain errors into their HTTP status. */
const base = platformT.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) throw toTrpcError(result.error.cause);
  return result;
});

/** Platform staff of either level. The context read the session from the database, so a revoked one stops at once. */
export const staffProcedure = base.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  // During support's impersonation the session's user is the member, who is not platform staff.
  const staff = await ctx.services.identity.describePlatformStaff(ctx.user.id);
  if (!staff) throw new DomainError("FORBIDDEN", "PLATFORM_ONLY", "Only platform staff can do this");
  if (staff.mustChangePassword) throw new DomainError("FORBIDDEN", "CHANGE_PASSWORD", "Choose a new password first");
  return next({ ctx: { session: ctx.session, user: ctx.user, staff } });
});

/** Super admins only: plans, platform staff and permanent deletion. */
export const superAdminProcedure = staffProcedure.use(({ ctx, next }) => {
  if (ctx.staff.level !== "super-admin") {
    throw new DomainError("FORBIDDEN", "SUPER_ADMIN_ONLY", "Only a super admin can do this");
  }
  return next();
});
```

`packages/api/src/platform/platform-router.ts`:
```ts
// The platform console's procedures (spec 7), served by the console process at /api/platform/trpc. The web app's
// console screens import the PlatformRouter type only.
import { listPlatformLogInput, platformLogPage, platformWhoAmIOutput } from "@travel-crm/contracts/platform";
import { listPlatformLog } from "@travel-crm/domain/platform";
import { staffProcedure } from "./procedures.js";
import { platformT } from "./trpc.js";

export const platformRouter = platformT.router({
  /** Who is signed in, at which level; the console calls it when it opens. */
  whoAmI: staffProcedure
    .output(platformWhoAmIOutput)
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  log: platformT.router({
    /** What platform staff and the platform's jobs did, newest first. */
    list: staffProcedure
      .input(listPlatformLogInput)
      .output(platformLogPage)
      .query(({ ctx, input }) => ctx.services.platformDb.transaction((tx) => listPlatformLog(tx, input))),
  }),
});

export type PlatformRouter = typeof platformRouter;
```

In `packages/api/src/errors.ts`:

replace:
```ts
// code and reason the web app turns into a translated message. Unexpected errors never show their own message.
import { TRPCError } from "@trpc/server";
import { DomainError, type DomainErrorCode } from "@travel-crm/domain/kernel";
```
with:
```ts
// code and reason the web app turns into a translated message. Unexpected errors never show their own message.
import { TRPCError, type TRPCDefaultErrorShape } from "@trpc/server";
import { DomainError, type DomainErrorCode } from "@travel-crm/domain/kernel";
```

replace:
```ts
}
```
with:
```ts
}

/**
 * The error every tRPC response carries, the api's and the console's: an allow-list, so a field tRPC adds later can't
 * reach clients by being spread in.
 */
export function errorShape({ shape, error }: { shape: TRPCDefaultErrorShape; error: TRPCError }) {
  return {
    ...shape,
    message: publicMessage(error),
    data: {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      ...(shape.data.path === undefined ? {} : { path: shape.data.path }),
      ...errorDetails(error),
    },
  };
}
```

In `packages/api/src/trpc.ts`:

replace:
```ts
// The api's one tRPC instance: its context, and the error shape every response uses.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorDetails, publicMessage } from "./errors.js";
```
with:
```ts
// The api's tRPC instance: its context, and the error shape every response uses. The console has its own
// (platform/trpc.ts), with the same error shape.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorShape } from "./errors.js";
```

replace:
```ts
  isDev: false,
  // An allow-list, so a field tRPC adds later can't reach clients by being spread in.
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicMessage(error),
    data: {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      ...(shape.data.path === undefined ? {} : { path: shape.data.path }),
      ...errorDetails(error),
    },
  }),
});
```
with:
```ts
  isDev: false,
  errorFormatter: errorShape,
});
```

In `packages/api/src/procedures.ts`:

replace:
```ts
});

/** Platform staff only (spec 6.1): user role "admin" and no membership, on a session read from the database. */
export const platformProcedure = freshlySignedIn.use(async ({ ctx, next }) => {
  if (!(await ctx.identity.isPlatformAdmin(ctx.user))) {
    throw new DomainError("FORBIDDEN", "PLATFORM_ONLY", "Only platform staff can do this");
  }
  return next();
});
```
with:
```ts
});
```

In `packages/api/src/routers/app-router.ts`:

replace:
```ts
// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code.
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { platformRouter } from "./platform.js";
import { rolesRouter } from "./roles.js";
```
with:
```ts
// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code. The
// platform console's routers are served apart, by the console process (platform/platform-router.ts).
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { rolesRouter } from "./roles.js";
```

replace:
```ts
  settings: settingsRouter,
  platform: platformRouter,
});
```
with:
```ts
  settings: settingsRouter,
});
```

Delete `packages/api/src/routers/platform.ts`.

In `packages/api/src/index.ts`:

replace:
```ts
// Public API of @travel-crm/api: the tRPC router and its context, for apps/api to serve.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
```
with:
```ts
// Public API of @travel-crm/api: the api's and the platform console's tRPC routers and contexts, for apps/api to serve.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { createPlatformContext, type PlatformContext } from "./platform/context.js";
export { platformRouter, type PlatformRouter } from "./platform/platform-router.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
```

- [ ] **Step 5: Serve it**

`apps/api/src/body-limit.ts`:
```ts
// A cap on request bodies: no sign-in or tRPC call needs a big one, and the cap stops a client making the server read
// a huge one. It answers 413 as soon as a body passes maxSize bytes, before anything parses it.
import { bodyLimit } from "hono/body-limit";

export function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" }, 413),
  });
}
```

`apps/api/src/console-app.ts`:
```ts
// The platform console's HTTP app (spec 7), served by the console process: a health check, and the console's tRPC at
// /api/platform/trpc, which the load balancer (and the web app's development server) routes here. Platform staff sign
// in through the api's /api/auth like everyone else; the console reads the same session cookie. It logs as the api
// does: unexpected errors only, by names and codes.
import { trpcServer } from "@hono/trpc-server";
import { createPlatformContext, platformRouter } from "@travel-crm/api";
import type { PlatformServices } from "@travel-crm/domain/platform";
import { describeError } from "@travel-crm/integrations/jobs";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { apiErrorHandler } from "./error-handler.js";
import type { ProcessLog } from "./process-log.js";
import { requireTrustedJson } from "./trusted-origin.js";

/** No console call needs a bigger body. */
const BODY_LIMIT = 64 * 1024;

export function createConsoleApp(services: PlatformServices, log: ProcessLog): Hono {
  const app = new Hono();
  app.onError(apiErrorHandler(log));

  app.get("/health", (c) => c.json({ status: "ok" }));

  // The same rules as the api's tRPC: mutations come from the web app as JSON, and bodies are small.
  app.use("/api/platform/trpc/*", requireTrustedJson(services.identity));
  app.use("/api/platform/trpc/*", limitBody(BODY_LIMIT));
  app.use(
    "/api/platform/trpc/*",
    trpcServer({
      router: platformRouter,
      endpoint: "/api/platform/trpc",
      createContext: ({ resHeaders }, c) => createPlatformContext(services, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
        // Refusals are answers, not faults. Only unexpected errors are logged, by names and codes: tRPC copies the
        // cause's message into its own, and a database error's message can quote a person's data.
        if (error.code === "INTERNAL_SERVER_ERROR") log(`console tRPC ${path ?? "?"} failed: ${describeError(error)}`);
      },
    }),
  );

  return app;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console.test.ts test/platform.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/platform-staff-levels.test.ts`

Expected: PASS, 11 tests in 2 files (apps/api); 4 tests in 1 file (packages/domain).

- [ ] **Step 7: Record the decisions**

In `docs/adr/0018-platform-console.md`:

replace:
```markdown

- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
```
with:
```markdown

- **The console is its own process.** The api image gets a third command, `console`, beside the api and the worker. It
  serves the console's tRPC at `/api/platform/trpc` (`createConsoleApp`) and runs the platform's own jobs, and it is
  the only process given `DATABASE_PLATFORM_URL`: the api and the worker never hold it (plan 2's rule). The load
  balancer, and in development the web app's server, route `/api/platform/*` to it, so the browser still calls `/api`
  on the address it loaded the app from (spec 3) and cookies stay first-party. Platform staff sign in through the
  api's `/api/auth` like everyone else; the console reads the same session cookie, always from the database.
- **Two levels of platform staff.** Support (Better Auth role `admin`, as in plan 2) works with organizations:
  onboarding, subscriptions, impersonation, failed jobs. A super admin (role `super-admin`) also manages plans,
  platform staff and permanent deletion (spec 5: "a super-admin action"). Both have no membership, ever. The console's
  builders check them on every request: `staffProcedure` (either level, and no temporary password left to replace)
  and `superAdminProcedure`. Better Auth gives both roles the same powers on its own endpoints.
- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
```

replace:
```markdown

- **Why switch roles instead of filtering by hand.** As `app_platform` nothing scopes a query: module code written for
```
with:
```markdown

- **Why a separate process.** The api answers every organization's staff and the public routes; holding a connection
  that sees every organization there would turn any bug in it into a cross-organization leak. The console has a few
  users and a small surface, and can be locked down further (an IP allow-list at the load balancer) without touching
  the api. It costs one more service to deploy, from the same image.
- **Why switch roles instead of filtering by hand.** As `app_platform` nothing scopes a query: module code written for
```

replace:
```markdown

- A hosted database needs the same `GRANT` when its roles are created (plan 5's deploy checklist); a local database
```
with:
```markdown

- Deploying runs three services from one image: `api`, `worker` and `console` (one instance is plenty; it must stay
  up for the platform's scheduled jobs).
- A hosted database needs the same `GRANT` when its roles are created (plan 5's deploy checklist); a local database
```

In `packages/api/README.md`:

replace:
```markdown
The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only.
```
with:
```markdown
The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only, and the console screens the `PlatformRouter` type.
```

replace:
```markdown
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff, 2FA settings |
| `platformProcedure`                  | 1 from the database, user role `admin`, no membership          | the platform console                       |
```
with:
```markdown
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff, 2FA settings |
```

replace:
```markdown

`me`, `staff`, `roles`, `settings`, `platform`. Add a router in `src/routers/` and list it in `app-router.ts`.
```
with:
```markdown

`me`, `staff`, `roles`, `settings`. Add a router in `src/routers/` and list it in `app-router.ts`.

## The platform console (`src/platform/`)

The console's routers are served apart, at `/api/platform/trpc`, by the console process: the only one that holds
`DATABASE_PLATFORM_URL` (ADR 0018). They have their own tRPC instance (`platformT`), context
(`createPlatformContext(services, request, resHeaders)`, which always reads the session from the database) and
builders:

| Builder               | Checks                                                                                | Use for                                   |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `staffProcedure`      | signed in, platform staff of either level (no membership ever), no temporary password | everything support does                   |
| `superAdminProcedure` | the same, and the super-admin level                                                   | plans, platform staff, permanent deletion |

`platformRouter` (`src/platform/platform-router.ts`) lists them: `whoAmI`, `log.list`.
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `organizationProfile(organizationId)` and `memberContacts(organizationId, userIds)`: what other modules may know
```
with:
```markdown
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`, and `describePlatformStaff(userId)`: the person's platform level (`support` or
    `super-admin`), name and pending password change, or null for anyone who isn't platform staff;
  - `organizationProfile(organizationId)` and `memberContacts(organizationId, userIds)`: what other modules may know
```

replace:
```markdown
  - `disconnect()`.
- `permissions`, `permissionCatalog`, `isPermission`, `isScopedPermission`, `moduleOf`, `PermissionSet`: the permission
```
with:
```markdown
  - `disconnect()`.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
  `platformStaffLevelOf(role)`.
- `permissions`, `permissionCatalog`, `isPermission`, `isScopedPermission`, `moduleOf`, `PermissionSet`: the permission
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=194 domain=431 eslint-config=81 integrations=141 (1,093). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git rm packages/api/src/routers/platform.ts
git add apps/api/src/body-limit.ts apps/api/src/console-app.ts apps/api/test/console.test.ts apps/api/test/platform.test.ts apps/api/test/support/console.ts docs/adr/0018-platform-console.md packages/api/README.md packages/api/src/errors.ts packages/api/src/index.ts packages/api/src/platform/context.ts packages/api/src/platform/platform-router.ts packages/api/src/platform/procedures.ts packages/api/src/platform/trpc.ts packages/api/src/procedures.ts packages/api/src/routers/app-router.ts packages/api/src/trpc.ts packages/contracts/src/platform/index.ts packages/contracts/src/platform/platform-staff.ts packages/domain/src/identity/README.md packages/domain/src/identity/access.ts packages/domain/src/identity/auth/create-auth.ts packages/domain/src/identity/auth/side-doors.ts packages/domain/src/identity/identity.ts packages/domain/src/identity/index.ts packages/domain/src/platform/index.ts packages/domain/src/platform/services.ts packages/domain/test/identity/platform-staff-levels.test.ts
git commit -m "feat: serve the platform console at /api/platform/trpc, for support and super admins"
```

---
## Wave 1: the tracks

Each track below starts from Task 0.2's commit in its own worktree, and the four run at the same time.
Their sections are self-contained: each gives its own paths, counts and commits.

### Task S1: Plans, subscriptions and payments as data the console edits

Spec 7.2: a plan holds its INR price (monthly, yearly or both, in paise), its limits (seats, WhatsApp numbers,
storage) and its modules; a subscription is per organization, with its plan, dates, status and overrides (extra
seats, a custom price, modules switched on early). This task adds the tables, written only by the platform role (the
runtime role may read them, and later move a subscription's status), the subscriptions module's operations, each
recorded in the organization's own audit log under the platform admin's name, and the console's `plans` and
`subscriptions` routers. Payments are recorded, never deleted: a mistaken one is voided with a reason. For billing
readiness (spec 7.4), a payment carries its provider and the provider's payment id, unique per organization, so a
repeated Razorpay webhook records one payment; Razorpay itself comes later. No plan is seeded: plans are data the
platform team enters.

**Files:**
- Create: `docs/adr/0019-plans-and-subscriptions.md`, `packages/api/src/platform/routers/plans.ts`, `packages/api/src/platform/routers/subscriptions.ts`, `packages/contracts/src/subscriptions/index.ts`, `packages/contracts/src/subscriptions/plans.ts`, `packages/contracts/src/subscriptions/subscriptions.ts`, `packages/db/prisma/migrations/20261016100000_subscriptions/migration.sql`, `packages/db/prisma/schema/subscriptions.prisma`, `packages/domain/src/platform/plans.ts`, `packages/domain/src/platform/subscriptions.ts`, `packages/domain/src/subscriptions/README.md`, `packages/domain/src/subscriptions/console-actor.ts`, `packages/domain/src/subscriptions/dates.ts`, `packages/domain/src/subscriptions/index.ts`, `packages/domain/src/subscriptions/payments.ts`, `packages/domain/src/subscriptions/plans.ts`, `packages/domain/src/subscriptions/policy.ts`, `packages/domain/src/subscriptions/rows.ts`, `packages/domain/src/subscriptions/subscriptions.ts`
- Modify: `packages/api/src/platform/platform-router.ts`, `packages/db/prisma/schema/organization.prisma`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`
- Test: `apps/api/test/console-plans.test.ts`, `apps/api/test/console-subscriptions.test.ts`, `packages/contracts/test/subscriptions/subscriptions.test.ts`, `packages/db/test/isolation.test.ts`, `packages/db/test/org-table-fixture.ts`, `packages/db/test/org-table-fixtures/subscriptions.ts`, `packages/db/test/subscription-tables.test.ts`, `packages/domain/test/subscriptions/payments.test.ts`, `packages/domain/test/subscriptions/plans.test.ts`, `packages/domain/test/subscriptions/subscriptions.test.ts`, `packages/domain/test/subscriptions/test-subscriptions.ts`

**Interfaces:**
- Consumes (Task 0): `PlatformTx`, `asOrganization`, `platformActor`, `systemActor`, `recordAudit`,
  `recordPlatformAudit`, `PlatformServices`, `staffProcedure`, `superAdminProcedure`, `platformT`, the console's test
  support; plan 3's `calendarDate`, `recordId`, `CalendarDate`, `calendarDateIn`, `organizationTimeZone`.
- Produces:
  - Tables `plan`, `subscription` (primary key `organization_id`), `subscription_payment`, `subscription_policy`
    (one row: past-due 7 days, read-only 14).
  - `@travel-crm/contracts/subscriptions`: `planModules` (`crm`, `inbox`, `catalog`, `quotes`, `bookings`,
    `departures`, `suppliers`, `accounts`, `reports`), `planModule`, `planKey`, `pricePaise`, `createPlanInput`,
    `updatePlanInput`, `planIdInput`, `listPlansInput`, `planSummary`, `subscriptionStatus` (`trial`, `active`,
    `past_due`, `read_only`, `suspended`, `cancelled`), `billingCycle`, `startSubscriptionInput`,
    `organizationIdInput`, `changePlanInput`, `setOverridesInput`, `setTrialEndInput`, `setPaidThroughInput`,
    `recordPaymentInput`, `voidPaymentInput`, `endAccessInput`, `subscriptionDetails`, `subscriptionPayment`,
    `subscriptionWithPayments`, `setSubscriptionPolicyInput`, `subscriptionPolicy`, and their types.
  - `@travel-crm/domain/subscriptions` (each takes a transaction): `createPlan`, `updatePlan`, `archivePlan`,
    `listPlans(tx, { includeArchived })`, `findPlan`; `startSubscription(tx, by, input, now?)`, `getSubscription(tx,
    organizationId)`, `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `suspend`, `cancel` (each
    `(tx, by, input, now?)`); `recordPayment(tx, by, input, { now?, provider? })`, `voidPayment`, `listPayments`;
    `getSubscriptionPolicy(tx)`, `setSubscriptionPolicy(tx, by, policy)`; types `ConsoleActor` (`{ userId: string |
    null }`, null for the platform's own jobs) and `ProviderPayment`.
  - `@travel-crm/domain/platform` (each `(services, …)`, one platform transaction): `listPlans`, `createPlan`,
    `updatePlan`, `archivePlan`, `getSubscriptionPolicy`, `setSubscriptionPolicy` (logged in the platform log),
    `getSubscription` (with payments), `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`,
    `voidPayment`, `suspend`, `cancel`.
  - The console's routers `plans` (`list`, `policy`; super admins `create`, `update`, `archive`, `setPolicy`) and
    `subscriptions` (`get`, `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`,
    `voidPayment`, `suspend`, `cancel`).

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-subscriptions -b foundation/04-subscriptions foundation/04-platform
cd /Users/ak/personal/travel-crm-04-subscriptions && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/04-subscriptions` at Task 0.2's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/contracts/test/subscriptions/subscriptions.test.ts`:
```ts
// The plans' and subscriptions' contracts: a plan is priced one way or both, limited, and on known modules; console
// changes name the organization, carry real dates, and say why when a person overrides the lifecycle.
import { describe, expect, it } from "vitest";
import {
  createPlanInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
  startSubscriptionInput,
  updatePlanInput,
} from "../../src/subscriptions/index.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000d1";
const starter = {
  key: "starter",
  name: "Starter",
  monthlyPricePaise: 250_000,
  yearlyPricePaise: null,
  seatLimit: 5,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000,
  modules: ["crm", "quotes"],
};

describe("plan contracts", () => {
  it("takes a plan priced monthly, yearly or both, with limits and known modules", () => {
    expect(createPlanInput.parse(starter)).toEqual(starter);
    expect(
      createPlanInput.safeParse({ ...starter, monthlyPricePaise: null, yearlyPricePaise: 2_500_000 }).success,
    ).toBe(true);
    const unpriced = createPlanInput.safeParse({ ...starter, monthlyPricePaise: null });
    expect(unpriced.error?.issues[0]?.path).toEqual(["monthlyPricePaise"]);
  });

  it("refuses bad keys, limits and modules, and unknown fields", () => {
    for (const bad of [
      { ...starter, key: "Starter" },
      { ...starter, key: "s" },
      { ...starter, seatLimit: 0 },
      { ...starter, monthlyPricePaise: 99.5 },
      { ...starter, modules: ["crm", "teleport"] },
      { ...starter, discount: 10 },
    ]) {
      expect(createPlanInput.safeParse(bad).success).toBe(false);
    }
  });

  it("never changes a plan's key", () => {
    const { key, ...fields } = starter;
    expect(key).toBe("starter");
    expect(updatePlanInput.safeParse({ planId: organizationId, ...fields }).success).toBe(true);
    expect(updatePlanInput.safeParse({ planId: organizationId, ...fields, key: "pro" }).success).toBe(false);
  });
});

describe("subscription contracts", () => {
  it("starts on a trial to a real day, or paid through one", () => {
    const trial = { planId: organizationId, billingCycle: "monthly", trialEndsOn: "2026-10-30", paidThrough: null };
    expect(startSubscriptionInput.parse(trial)).toEqual(trial);
    expect(startSubscriptionInput.safeParse({ ...trial, trialEndsOn: "2026-02-30" }).success).toBe(false);
    expect(startSubscriptionInput.safeParse({ ...trial, billingCycle: "weekly" }).success).toBe(false);
  });

  it("takes overrides within bounds", () => {
    const overrides = { organizationId, extraSeats: 3, customPricePaise: null, extraModules: ["accounts"] };
    expect(setOverridesInput.parse(overrides)).toEqual(overrides);
    expect(setOverridesInput.safeParse({ ...overrides, extraSeats: -1 }).success).toBe(false);
  });

  it("records a payment of at least a paisa, and asks why access is given without one", () => {
    const payment = {
      organizationId,
      amountPaise: 250_000,
      paidOn: "2026-10-16",
      paidThrough: "2026-11-15",
      reference: "NEFT UTR 412345678901",
    };
    expect(recordPaymentInput.parse(payment)).toEqual(payment);
    expect(recordPaymentInput.safeParse({ ...payment, amountPaise: 0 }).success).toBe(false);
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: " " }).success).toBe(
      false,
    );
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: "Pilot" }).success).toBe(
      true,
    );
  });
});
```

In `packages/db/test/org-table-fixture.ts`:

replace:
```ts
import type { OrgTx } from "../src/for-org.js";

export interface OrgTableFixture {
  /** Creates one row in the table, inside db.forOrg(). */
  create: (tx: OrgTx) => Promise<unknown>;
  /**
```
with:
```ts
import type { OrgTx } from "../src/for-org.js";
import type { PlatformTx } from "../src/platform.js";

export interface OrgTableFixture {
  /** Creates one row in the table, inside db.forOrg(). Give this or createAsPlatform. */
  create?: (tx: OrgTx) => Promise<unknown>;
  /**
   * For a table the runtime role may not insert into (a subscription, which only the platform console writes):
   * creates one row for organizationId in a platform transaction.
   */
  createAsPlatform?: (tx: PlatformTx, organizationId: string) => Promise<unknown>;
  /**
```

`packages/db/test/org-table-fixtures/subscriptions.ts`:
```ts
// Isolation fixtures for the subscriptions module. Only the platform role inserts these rows; the runtime role may
// move a subscription's status, and change nothing else.
import { randomUUID } from "node:crypto";
import type { PlatformTx } from "../../src/platform.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

async function subscribe(tx: PlatformTx, organizationId: string) {
  const plan = await tx.plan.create({
    data: {
      key: `isolation-${randomUUID().slice(0, 8)}`,
      name: "Isolation plan",
      monthlyPricePaise: 100_000,
      seatLimit: 5,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000n,
      modules: ["crm"],
    },
  });
  return tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      billingCycle: "monthly",
      status: "active",
      statusChangedAt: new Date(),
      paidThrough: new Date("2026-12-31"),
    },
  });
}

export const fixtures: OrgTableFixtures = {
  subscription: { createAsPlatform: subscribe, appendOnly: true, updatableColumn: "status" },
  subscription_payment: {
    createAsPlatform: async (tx, organizationId) => {
      // A payment needs its organization's subscription, which the subscription fixture may have made already.
      if (!(await tx.subscription.findUnique({ where: { organizationId } }))) await subscribe(tx, organizationId);
      return tx.subscriptionPayment.create({
        data: {
          organizationId,
          amountPaise: 100_000,
          paidOn: new Date("2026-10-16"),
          paidThrough: new Date("2026-11-15"),
        },
      });
    },
    appendOnly: true,
  },
};
```

In `packages/db/test/isolation.test.ts`:

replace:
```ts
import { softDeleteModels } from "../src/soft-delete.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
```
with:
```ts
import { softDeleteModels } from "../src/soft-delete.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
```

replace:
```ts
  let platform: PlatformClient;
  let db: Database;
```
with:
```ts
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
```

replace:
```ts
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
```
with:
```ts
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 3 });
```

replace:
```ts
    await db.disconnect();
    await platform.$disconnect();
```
with:
```ts
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
```

replace:
```ts
    beforeAll(async () => {
      if (!fixture) throw new Error(`No fixture for ${tableName}`);
      await db.forOrg(orgA, fixture.create);
    });
```
with:
```ts
    beforeAll(async () => {
      if (fixture?.createAsPlatform) {
        const { createAsPlatform } = fixture;
        await platformDb.transaction((tx) => createAsPlatform(tx, orgA));
      } else if (fixture?.create) {
        await db.forOrg(orgA, fixture.create);
      } else {
        throw new Error(`No fixture for ${tableName}`);
      }
    });
```

`packages/db/test/subscription-tables.test.ts`:
```ts
// Rules the subscription tables enforce themselves (spec 7.2, 7.3): only the platform role writes plans, subscriptions,
// payments and the policy; the runtime role reads them and may move a subscription's status, nothing else; and the
// values stay within what the lifecycle knows.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const plan = (key = `plan-${randomUUID().slice(0, 8)}`) => ({
  key,
  name: "Starter",
  monthlyPricePaise: 250_000,
  seatLimit: 5,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000n,
  modules: ["crm", "quotes"],
});

describe("subscription tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let planId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Subscription tables");
    planId = (await platform.plan.create({ data: plan() })).id;
    await platform.subscription.create({
      data: {
        organizationId,
        planId,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: new Date(),
        trialEndsOn: new Date("2026-10-30"),
      },
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("lets the runtime role read plans, the policy and its own subscription", async () => {
    expect(await db.forOrg(organizationId, (tx) => tx.plan.count({ where: { id: planId } }))).toBe(1);
    expect(
      await db.forOrg(organizationId, (tx) => tx.subscriptionPolicy.findUnique({ where: { id: true } })),
    ).toMatchObject({ pastDueDays: 7, readOnlyDays: 14 });
    expect(await db.forOrg(organizationId, (tx) => tx.subscription.count())).toBe(1);
  });

  it("lets the runtime role move a subscription's status, and change nothing else", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscription.update({
          where: { organizationId },
          data: { status: "past_due", statusChangedAt: new Date() },
        }),
      ),
    ).resolves.toMatchObject({ status: "past_due" });
    for (const data of [
      { planId },
      { paidThrough: new Date("2027-01-01") },
      { extraSeats: 50 },
      { extraModules: ["accounts"] },
    ]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.subscription.update({ where: { organizationId }, data })),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("refuses every other write to the runtime role", async () => {
    await expect(db.forOrg(organizationId, (tx) => tx.plan.create({ data: plan() }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.plan.update({ where: { id: planId }, data: { seatLimit: 500 } })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscriptionPolicy.update({ where: { id: true }, data: { pastDueDays: 90 } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscriptionPayment.create({
          data: { amountPaise: 1, paidOn: new Date("2026-10-16"), paidThrough: new Date("2030-12-31") },
        }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(db.forOrg(organizationId, (tx) => tx.subscription.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps plans priced, limited and on the product's modules", async () => {
    for (const bad of [
      { ...plan(), key: "Starter" },
      { ...plan(), monthlyPricePaise: null },
      { ...plan(), monthlyPricePaise: -1 },
      { ...plan(), seatLimit: 0 },
      { ...plan(), modules: ["crm", "teleport"] },
    ]) {
      await expect(platform.plan.create({ data: bad })).rejects.toThrow(/check constraint|plan_/);
    }
  });

  it("keeps subscriptions in the lifecycle's states, and a trial dated", async () => {
    const other = await createTestOrganization(platform, "Subscription checks");
    const base = { organizationId: other, planId, billingCycle: "monthly", statusChangedAt: new Date() };
    await expect(platform.subscription.create({ data: { ...base, status: "paused" } })).rejects.toThrow(
      /subscription_status_value/,
    );
    await expect(platform.subscription.create({ data: { ...base, status: "trial" } })).rejects.toThrow(
      /subscription_trial_dated/,
    );
    await expect(
      platform.subscription.create({ data: { ...base, status: "active", billingCycle: "weekly" } }),
    ).rejects.toThrow(/subscription_billing_cycle_value/);
    await expect(
      platform.subscription.create({ data: { ...base, status: "active", extraModules: ["teleport"] } }),
    ).rejects.toThrow(/subscription_extra_modules_known/);
  });

  it("keeps payments positive, voided with a reason, and a provider's payment once", async () => {
    const payment = { organizationId, paidOn: new Date("2026-10-16"), paidThrough: new Date("2026-11-15") };
    await expect(platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 0 } })).rejects.toThrow(
      /subscription_payment_amount_positive/,
    );
    await expect(
      platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 100, voidedAt: new Date() } }),
    ).rejects.toThrow(/subscription_payment_voided/);
    await expect(
      platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 100, provider: "razorpay" } }),
    ).rejects.toThrow(/subscription_payment_provider_id/);
    const fromRazorpay = { ...payment, amountPaise: 100, provider: "razorpay", providerPaymentId: "pay_123" };
    await platform.subscriptionPayment.create({ data: fromRazorpay });
    await expect(platform.subscriptionPayment.create({ data: fromRazorpay })).rejects.toThrow(/Unique constraint/);
  });

  it("holds one policy row, with sensible days", async () => {
    await expect(platform.subscriptionPolicy.create({ data: { id: false } })).rejects.toThrow(
      /subscription_policy_one_row/,
    );
    await expect(platform.subscriptionPolicy.update({ where: { id: true }, data: { pastDueDays: 0 } })).rejects.toThrow(
      /subscription_policy_days/,
    );
  });
});
```

`packages/domain/test/subscriptions/test-subscriptions.ts`:
```ts
// Plans and subscribed organizations for the subscriptions module's tests, made through the module itself in platform
// transactions, as the console makes them.
import { randomUUID } from "node:crypto";
import type { CreatePlanInput, PlanSummary, StartSubscriptionInput } from "@travel-crm/contracts/subscriptions";
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import { createPlan, startSubscription } from "../../src/subscriptions/index.js";

export const adminUserId = "0199e7a0-0000-7000-8000-00000000ad01";
export const byAdmin = { userId: adminUserId };

export interface TestSubscriptions {
  platformDb: PlatformDatabase;
  db: Database;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createTestSubscriptions(): TestSubscriptions {
  const urls = inject("dbUrls");
  const platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const platform = createPlatformClient(urls.platform);
  return {
    platformDb,
    db,
    platform,
    close: async () => {
      await platformDb.disconnect();
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export async function createTestPlan(
  test: TestSubscriptions,
  fields: Partial<CreatePlanInput> = {},
): Promise<PlanSummary> {
  return test.platformDb.transaction((tx) =>
    createPlan(tx, {
      key: `plan-${randomUUID().slice(0, 8)}`,
      name: "Starter",
      monthlyPricePaise: 250_000,
      yearlyPricePaise: 2_500_000,
      seatLimit: 5,
      whatsappNumberLimit: 1,
      storageLimitBytes: 5_000_000_000,
      modules: ["crm", "quotes"],
      ...fields,
    }),
  );
}

/** An organization (in Asia/Kolkata unless told otherwise) subscribed to plan as start says. */
export async function createSubscribedOrganization(
  test: TestSubscriptions,
  plan: PlanSummary,
  start: Partial<StartSubscriptionInput> = {},
  options: { timeZone?: string; now?: Date } = {},
): Promise<string> {
  const organizationId = await createTestOrganization(test.platform, "Subscriber");
  if (options.timeZone) {
    await test.platform.organization.update({ where: { id: organizationId }, data: { timeZone: options.timeZone } });
  }
  await test.platformDb.transaction((tx) =>
    startSubscription(
      tx,
      byAdmin,
      {
        organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        trialEndsOn: null,
        paidThrough: "2099-12-31",
        ...start,
      },
      options.now,
    ),
  );
  return organizationId;
}

/** The organization's audit entries about its subscription, oldest first. */
export async function subscriptionEntries(test: TestSubscriptions, organizationId: string) {
  return test.db.forOrg(organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { entityType: "subscription" }, orderBy: { id: "asc" } }),
  );
}
```

`packages/domain/test/subscriptions/plans.test.ts`:
```ts
// Plans are data the console edits (spec 7.2): priced, limited, on known modules; a key is unique and never changes,
// and an archived plan is off sale but kept for the organizations on it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archivePlan, findPlan, listPlans, updatePlan } from "../../src/subscriptions/index.js";
import { createTestPlan, createTestSubscriptions, type TestSubscriptions } from "./test-subscriptions.js";

describe("plans", () => {
  let test: TestSubscriptions;

  beforeAll(() => {
    test = createTestSubscriptions();
  });

  afterAll(async () => {
    await test.close();
  });

  it("creates a plan with its price, limits and modules", async () => {
    const plan = await createTestPlan(test, { name: "Growth", storageLimitBytes: 50_000_000_000, modules: ["crm"] });
    expect(plan).toMatchObject({
      name: "Growth",
      monthlyPricePaise: 250_000,
      seatLimit: 5,
      storageLimitBytes: 50_000_000_000,
      modules: ["crm"],
      archived: false,
    });
    expect(await test.platformDb.transaction((tx) => findPlan(tx, plan.id))).toEqual(plan);
  });

  it("refuses a key another plan has", async () => {
    const plan = await createTestPlan(test);
    await expect(createTestPlan(test, { key: plan.key })).rejects.toMatchObject({ reason: "PLAN_KEY_TAKEN" });
  });

  it("changes a plan's price, limits and modules, keeping its key", async () => {
    const plan = await createTestPlan(test);
    const { before, after } = await test.platformDb.transaction((tx) =>
      updatePlan(tx, {
        planId: plan.id,
        name: "Starter 2027",
        monthlyPricePaise: 300_000,
        yearlyPricePaise: null,
        seatLimit: 8,
        whatsappNumberLimit: 2,
        storageLimitBytes: 10_000_000_000,
        modules: ["crm", "quotes", "bookings"],
      }),
    );
    expect(before).toEqual(plan);
    expect(after).toMatchObject({ key: plan.key, name: "Starter 2027", yearlyPricePaise: null, seatLimit: 8 });
  });

  it("takes an archived plan off the list, unless archived plans are asked for, and archives once", async () => {
    const plan = await createTestPlan(test);
    expect(await test.platformDb.transaction((tx) => archivePlan(tx, plan.id))).toMatchObject({ changed: true });
    expect(await test.platformDb.transaction((tx) => archivePlan(tx, plan.id))).toMatchObject({ changed: false });
    const onSale = await test.platformDb.transaction((tx) => listPlans(tx, { includeArchived: false }));
    expect(onSale.map((listed) => listed.id)).not.toContain(plan.id);
    const all = await test.platformDb.transaction((tx) => listPlans(tx, { includeArchived: true }));
    expect(all.find((listed) => listed.id === plan.id)).toMatchObject({ archived: true });
  });

  it("says when a plan doesn't exist", async () => {
    await expect(
      test.platformDb.transaction((tx) => findPlan(tx, "0199e7a0-0000-7000-8000-0000000000ee")),
    ).rejects.toMatchObject({ reason: "PLAN_NOT_FOUND" });
  });

  it("can't be written by the runtime role, whatever the code does", async () => {
    await expect(test.db.withoutOrg((tx) => listPlans(tx, { includeArchived: true }))).resolves.toBeInstanceOf(Array);
    const plan = await createTestPlan(test);
    await expect(test.db.withoutOrg((tx) => archivePlan(tx, plan.id))).rejects.toThrow(/permission denied/);
  });
});
```

`packages/domain/test/subscriptions/subscriptions.test.ts`:
```ts
// The console's changes to an organization's subscription (spec 7.2, 7.3): each is recorded in that organization's
// log under the platform admin's name, a change to the same values records nothing, and the dates are read in the
// organization's own time zone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancel,
  changePlan,
  getSubscription,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  startSubscription,
  suspend,
} from "../../src/subscriptions/index.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { archivePlan } from "../../src/subscriptions/index.js";
import { createTestOrganization } from "@travel-crm/db/testing";

/** 00:30 on 17 October in India, still 16 October in UTC. */
const justAfterMidnightInIndia = new Date("2026-10-16T19:00:00Z");

describe("subscriptions", () => {
  let test: TestSubscriptions;
  let starter: PlanSummary;
  let growth: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    starter = await createTestPlan(test, { name: "Starter" });
    growth = await createTestPlan(test, { name: "Growth", modules: ["crm", "quotes", "bookings"] });
  });

  afterAll(async () => {
    await test.close();
  });

  const inPlatform = <T>(fn: Parameters<typeof test.platformDb.transaction<T>>[0]) => test.platformDb.transaction(fn);

  it("starts on a trial, recorded under the platform admin's name", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      {
        trialEndsOn: "2026-10-30",
        paidThrough: null,
      },
      { now: justAfterMidnightInIndia },
    );
    expect(await inPlatform((tx) => getSubscription(tx, organizationId))).toMatchObject({
      plan: { id: starter.id, key: starter.key, name: "Starter" },
      status: "trial",
      trialEndsOn: "2026-10-30",
      paidThrough: null,
    });
    expect(await subscriptionEntries(test, organizationId)).toEqual([
      expect.objectContaining({
        action: "subscription.started",
        actorUserId: adminUserId,
        source: "platform",
        entityId: organizationId,
        after: {
          plan: starter.key,
          billingCycle: "monthly",
          status: "trial",
          trialEndsOn: "2026-10-30",
          paidThrough: null,
        },
      }),
    ]);
  });

  it("reads today in the organization's time zone, refusing a trial that ended yesterday there", async () => {
    // Already 17 October in India: a trial to the 16th is over.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        {
          now: justAfterMidnightInIndia,
        },
      ),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    // Still 16 October in London.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        {
          now: justAfterMidnightInIndia,
          timeZone: "Europe/London",
        },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("starts active only when paid through today or later, and never on an archived plan", async () => {
    await expect(
      createSubscribedOrganization(test, starter, { paidThrough: null }, { now: justAfterMidnightInIndia }),
    ).rejects.toMatchObject({ reason: "PAID_THROUGH_REQUIRED" });
    const retired = await createTestPlan(test);
    await inPlatform((tx) => archivePlan(tx, retired.id));
    await expect(createSubscribedOrganization(test, retired)).rejects.toMatchObject({ reason: "PLAN_ARCHIVED" });
  });

  it("gives each organization one subscription", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) =>
        startSubscription(tx, byAdmin, {
          organizationId,
          planId: growth.id,
          billingCycle: "yearly",
          trialEndsOn: null,
          paidThrough: "2099-12-31",
        }),
      ),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("changes the plan and billing cycle, and records nothing for the same ones again", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const changed = await inPlatform((tx) =>
      changePlan(tx, byAdmin, { organizationId, planId: growth.id, billingCycle: "yearly" }),
    );
    expect(changed).toMatchObject({ plan: { id: growth.id }, billingCycle: "yearly" });
    await inPlatform((tx) => changePlan(tx, byAdmin, { organizationId, planId: growth.id, billingCycle: "yearly" }));
    expect(
      (await subscriptionEntries(test, organizationId)).map((entry) => [entry.action, entry.before, entry.after]),
    ).toEqual([
      ["subscription.started", null, expect.anything()],
      [
        "subscription.plan-changed",
        { plan: starter.key, billingCycle: "monthly" },
        { plan: growth.key, billingCycle: "yearly" },
      ],
    ]);
  });

  it("sets overrides: extra seats, an agreed price and modules switched on early", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const overridden = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, {
        organizationId,
        extraSeats: 3,
        customPricePaise: 0,
        extraModules: ["accounts", "bookings", "accounts"],
      }),
    );
    expect(overridden).toMatchObject({ extraSeats: 3, customPricePaise: 0, extraModules: ["accounts", "bookings"] });
    const entries = await subscriptionEntries(test, organizationId);
    expect(entries.at(-1)).toMatchObject({
      action: "subscription.overrides-changed",
      before: { extraSeats: 0, customPricePaise: null, extraModules: [] },
    });
  });

  it("moves a trial's end only during the trial, and not into the past", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      {
        trialEndsOn: "2026-10-30",
        paidThrough: null,
      },
      { now: justAfterMidnightInIndia },
    );
    const now = justAfterMidnightInIndia;
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-10-16" }, now)),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    expect(
      await inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-11-15" }, now)),
    ).toMatchObject({ status: "trial", trialEndsOn: "2026-11-15" });
    const paying = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId: paying, trialEndsOn: "2026-11-15" }, now)),
    ).rejects.toMatchObject({ reason: "NOT_IN_TRIAL" });
  });

  it("suspends and cancels by hand, and brings an organization back once it is paid through today", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const now = justAfterMidnightInIndia;
    expect(
      await inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Unpaid since August" }, now)),
    ).toMatchObject({ status: "suspended" });
    expect(await inPlatform((tx) => cancel(tx, byAdmin, { organizationId, reason: "Left us" }, now))).toMatchObject({
      status: "cancelled",
    });
    await expect(
      inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Again" }, now)),
    ).rejects.toMatchObject({ reason: "SUBSCRIPTION_CANCELLED" });
    // A day already past changes nothing; from today on, the organization is back.
    expect(
      await inPlatform((tx) =>
        setPaidThrough(tx, byAdmin, { organizationId, paidThrough: "2026-10-16", reason: "Correction" }, now),
      ),
    ).toMatchObject({ status: "cancelled", paidThrough: "2026-10-16" });
    expect(
      await inPlatform((tx) =>
        setPaidThrough(tx, byAdmin, { organizationId, paidThrough: "2026-10-17", reason: "Came back" }, now),
      ),
    ).toMatchObject({ status: "active", paidThrough: "2026-10-17" });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.paid-through-changed",
      after: { paidThrough: "2026-10-17", status: "active", reason: "Came back" },
    });
  });

  it("says when an organization has no subscription", async () => {
    const organizationId = await createTestOrganization(test.platform, "Unsubscribed");
    await expect(inPlatform((tx) => getSubscription(tx, organizationId))).rejects.toMatchObject({
      reason: "SUBSCRIPTION_NOT_FOUND",
    });
  });

  it("can't change a subscription as the runtime role, whatever the code does", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        setOverrides(tx, byAdmin, { organizationId, extraSeats: 100, customPricePaise: 0, extraModules: [] }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
```

`packages/domain/test/subscriptions/payments.test.ts`:
```ts
// Payments the console records (spec 7.3, 7.4): one pays the organization through a day and makes it active again
// from today; an older payment never moves the day back; a provider's repeated payment is recorded once; a mistaken
// one is voided, changing no dates.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSubscription, listPayments, recordPayment, suspend, voidPayment } from "../../src/subscriptions/index.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = new Date("2026-10-16T06:00:00Z");

describe("subscription payments", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const pay = (organizationId: string, paidThrough: string, amountPaise = 250_000) =>
    test.platformDb.transaction((tx) =>
      recordPayment(
        tx,
        byAdmin,
        { organizationId, amountPaise, paidOn: "2026-10-16", paidThrough, reference: "NEFT UTR 412345678901" },
        { now },
      ),
    );

  it("records a payment, paying the organization through its day and making it active again", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-10-20" }, { now });
    await test.platformDb.transaction((tx) => suspend(tx, byAdmin, { organizationId, reason: "Unpaid" }, now));
    const payment = await pay(organizationId, "2026-11-15");
    expect(payment).toMatchObject({
      amountPaise: 250_000,
      paidOn: "2026-10-16",
      paidThrough: "2026-11-15",
      reference: "NEFT UTR 412345678901",
      provider: "manual",
      recordedBy: adminUserId,
      voided: null,
    });
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      status: "active",
      paidThrough: "2026-11-15",
    });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      source: "platform",
      before: { paidThrough: "2026-10-20", status: "suspended" },
      after: { paymentId: payment.id, amountPaise: 250_000, paidThrough: "2026-11-15", status: "active" },
    });
  });

  it("never moves the paid-through day back for an older period's payment", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    await pay(organizationId, "2026-09-30");
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      paidThrough: "2026-12-31",
      status: "active",
    });
  });

  it("records a provider's payment once, however often its webhook comes", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, {}, { now });
    const fromRazorpay = () =>
      test.platformDb.transaction((tx) =>
        recordPayment(
          tx,
          { userId: null },
          { organizationId, amountPaise: 250_000, paidOn: "2026-10-16", paidThrough: "2026-11-15", reference: null },
          { now, provider: { provider: "razorpay", providerPaymentId: "pay_Ox1Q2w3E4r5T6y" } },
        ),
      );
    const first = await fromRazorpay();
    expect(await fromRazorpay()).toEqual(first);
    expect(first).toMatchObject({ provider: "razorpay", recordedBy: null });
    expect(await test.platformDb.transaction((tx) => listPayments(tx, organizationId))).toHaveLength(1);
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      actorUserId: null,
      source: "job",
    });
  });

  it("voids a mistaken payment with a reason, once, changing no dates, and lists payments newest first", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-10-31" }, { now });
    const mistake = await pay(organizationId, "2027-10-31", 25_000_000);
    const voided = await test.platformDb.transaction((tx) =>
      voidPayment(tx, byAdmin, { organizationId, paymentId: mistake.id, reason: "Typed ₹2,50,000 for ₹25,000" }),
    );
    expect(voided.voided).toMatchObject({ by: adminUserId, reason: "Typed ₹2,50,000 for ₹25,000" });
    expect(
      await test.platformDb.transaction((tx) =>
        voidPayment(tx, byAdmin, { organizationId, paymentId: mistake.id, reason: "Again" }),
      ),
    ).toEqual(voided);
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      paidThrough: "2027-10-31",
    });
    await expect(
      test.platformDb.transaction((tx) =>
        voidPayment(tx, byAdmin, { organizationId, paymentId: "0199e7a0-0000-7000-8000-0000000000ef", reason: "x" }),
      ),
    ).rejects.toMatchObject({ reason: "PAYMENT_NOT_FOUND" });
    expect(
      (await test.platformDb.transaction((tx) => listPayments(tx, organizationId))).map((payment) => payment.id),
    ).toEqual([mistake.id]);
  });
});
```

`apps/api/test/console-plans.test.ts`:
```ts
// The console's plans and subscription policy (spec 7.2, 7.3): every platform staff member sees them, only super
// admins change them, and each change goes in the platform log.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { listPlatformLog } from "@travel-crm/domain/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

const growth = {
  key: `growth-${crypto.randomUUID().slice(0, 8)}`,
  name: "Growth",
  monthlyPricePaise: 450_000,
  yearlyPricePaise: 4_500_000,
  seatLimit: 15,
  whatsappNumberLimit: 2,
  storageLimitBytes: 20_000_000_000,
  modules: ["crm", "quotes", "bookings"],
};

describe("the console's plans", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("lets a super admin create, change and archive a plan, each in the platform log", async () => {
    const created = await dataOf<PlanSummary>(await consoleMutate(testConsole, "plans.create", growth, superAdmin.jar));
    expect(created).toMatchObject({ ...growth, archived: false });
    const updated = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.update",
        { planId: created.id, ...growth, key: undefined, seatLimit: 20 },
        superAdmin.jar,
      ),
    );
    expect(updated).toMatchObject({ key: growth.key, seatLimit: 20 });
    await dataOf(await consoleMutate(testConsole, "plans.archive", { planId: created.id }, superAdmin.jar));
    const log = await testConsole.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }));
    const entries = log.entries.filter((entry) => entry.targetId === created.id).map((entry) => entry.action);
    expect(entries).toEqual(["plan.archived", "plan.updated", "plan.created"]);
  });

  it("shows support the plans on sale, and refuses them any change", async () => {
    const created = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.create",
        { ...growth, key: `basic-${crypto.randomUUID().slice(0, 8)}` },
        superAdmin.jar,
      ),
    );
    const listed = await dataOf<PlanSummary[]>(await consoleQuery(testConsole, "plans.list", support.jar, {}));
    expect(listed.map((plan) => plan.id)).toContain(created.id);
    expect(
      await refusalOf(await consoleMutate(testConsole, "plans.archive", { planId: created.id }, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
  });

  it("refuses a plan with no price, or with fields it doesn't know", async () => {
    expect(
      (
        await consoleMutate(
          testConsole,
          "plans.create",
          { ...growth, monthlyPricePaise: null, yearlyPricePaise: null },
          superAdmin.jar,
        )
      ).status,
    ).toBe(400);
    expect((await consoleMutate(testConsole, "plans.create", { ...growth, discount: 5 }, superAdmin.jar)).status).toBe(
      400,
    );
  });

  it("shows the subscription policy, and lets only a super admin change it", async () => {
    expect(await dataOf(await consoleQuery(testConsole, "plans.policy", support.jar))).toEqual({
      pastDueDays: 7,
      readOnlyDays: 14,
    });
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 10, readOnlyDays: 20 }, support.jar),
      ),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    try {
      expect(
        await dataOf(
          await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 10, readOnlyDays: 20 }, superAdmin.jar),
        ),
      ).toEqual({ pastDueDays: 10, readOnlyDays: 20 });
    } finally {
      // Other test files rely on the spec's defaults.
      await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 7, readOnlyDays: 14 }, superAdmin.jar);
    }
  });
});
```

`apps/api/test/console-subscriptions.test.ts`:
```ts
// The console's work on an organization's subscription (spec 7.2-7.4): platform staff change its plan and overrides,
// record payments and suspend or cancel it by hand, and the organization's own audit log shows each change under the
// platform admin's name. Organization staff reach none of it.
import type { PlanSummary, SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { createPlan } from "@travel-crm/domain/platform";
import { startSubscription } from "@travel-crm/domain/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's subscriptions", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let starter: PlanSummary;
  let growth: PlanSummary;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    const plan = (name: string, modules: PlanSummary["modules"]) =>
      createPlan(
        testConsole.services,
        { userId: support.userId },
        {
          key: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
          name,
          monthlyPricePaise: 250_000,
          yearlyPricePaise: null,
          seatLimit: 5,
          whatsappNumberLimit: 1,
          storageLimitBytes: 5_000_000_000,
          modules,
        },
      );
    starter = await plan("Starter", ["crm"]);
    growth = await plan("Growth", ["crm", "quotes"]);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  async function subscribedAgency(): Promise<TestAgency> {
    const agency = await createTestAgency(server);
    await testConsole.services.platformDb.transaction((tx) =>
      startSubscription(
        tx,
        { userId: support.userId },
        {
          organizationId: agency.organizationId,
          planId: starter.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: "2099-12-31",
        },
      ),
    );
    return agency;
  }

  it("changes the plan and overrides, recorded in the organization's log under the admin's name", async () => {
    const agency = await subscribedAgency();
    const { organizationId } = agency;
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.changePlan",
        { organizationId, planId: growth.id, billingCycle: "yearly" },
        support.jar,
      ),
    );
    const overridden = await dataOf<SubscriptionDetails>(
      await consoleMutate(
        testConsole,
        "subscriptions.setOverrides",
        { organizationId, extraSeats: 2, customPricePaise: 0, extraModules: ["accounts"] },
        support.jar,
      ),
    );
    expect(overridden).toMatchObject({
      plan: { id: growth.id },
      billingCycle: "yearly",
      extraSeats: 2,
      extraModules: ["accounts"],
    });
    const entries = await server.platform.auditEntry.findMany({
      where: { organizationId, entityType: "subscription" },
      orderBy: { id: "asc" },
    });
    expect(entries.map((entry) => [entry.action, entry.source, entry.actorUserId])).toEqual([
      ["subscription.started", "platform", support.userId],
      ["subscription.plan-changed", "platform", support.userId],
      ["subscription.overrides-changed", "platform", support.userId],
    ]);
  });

  it("records a payment, suspends and cancels by hand, and shows the subscription with its payments", async () => {
    const { organizationId } = await subscribedAgency();
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.suspend",
        { organizationId, reason: "Unpaid since August" },
        support.jar,
      ),
    );
    const payment = await dataOf<{ id: string }>(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        {
          organizationId,
          amountPaise: 250_000,
          paidOn: "2026-10-16",
          paidThrough: "2099-12-31",
          reference: "UPI 6123",
        },
        support.jar,
      ),
    );
    const shown = await dataOf<SubscriptionWithPayments>(
      await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId }),
    );
    expect(shown.subscription.status).toBe("active");
    expect(shown.payments.map((listed) => listed.id)).toEqual([payment.id]);
    expect(
      await dataOf(
        await consoleMutate(
          testConsole,
          "subscriptions.cancel",
          { organizationId, reason: "Closing down" },
          support.jar,
        ),
      ),
    ).toMatchObject({ status: "cancelled" });
  });

  it("says when an organization has no subscription, and refuses a reason left blank", async () => {
    const unsubscribed = await createTestAgency(server);
    expect(
      await refusalOf(
        await consoleQuery(testConsole, "subscriptions.get", support.jar, {
          organizationId: unsubscribed.organizationId,
        }),
      ),
    ).toEqual({ status: 404, reason: "SUBSCRIPTION_NOT_FOUND" });
    expect(
      (
        await consoleMutate(
          testConsole,
          "subscriptions.suspend",
          { organizationId: unsubscribed.organizationId, reason: "" },
          support.jar,
        )
      ).status,
    ).toBe(400);
  });

  it("is out of reach of an organization's own staff", async () => {
    const agency = await subscribedAgency();
    const owner = await signedInOwner(server, agency);
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "subscriptions.setOverrides",
          { organizationId: agency.organizationId, extraSeats: 100, customPricePaise: 0, extraModules: [] },
          owner,
        ),
      ),
    ).toEqual({ status: 403, reason: "PLATFORM_ONLY" });
  });
});
```

The isolation fixtures for `subscription` and `subscription_payment` are made as the platform role
(`createAsPlatform`): the runtime role can't insert them. `org-table-fixture.ts` gains that option.

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-plans.test.ts test/console-subscriptions.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/subscriptions.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/isolation.test.ts test/subscription-tables.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/plans.test.ts test/subscriptions/subscriptions.test.ts test/subscriptions/payments.test.ts`

Expected: FAIL. `packages/contracts` and `packages/domain` can't load their tests: `Cannot find module
'../../src/subscriptions/index.js'`. In `packages/db`, the isolation test lists two tables without a fixture and the
fixtures find no `subscription` model (`Cannot read properties of undefined (reading 'create')`). In `apps/api`, `No
procedure found on path "plans.create"` and `Cannot find package '@travel-crm/domain/subscriptions'`.

- [ ] **Step 4: Add the tables**

`packages/db/prisma/schema/subscriptions.prisma`:
```prisma
// Plans and subscriptions (spec 7.2, 7.3): what each organization pays for and may use. Plans are platform data, with
// no organization; a subscription and its payments belong to one organization, under row-level security. Only the
// platform role writes them; the api reads them for its request checks, and the worker moves a subscription along.

/// A plan the platform sells: its INR price, its limits and its modules (spec 7.2). Plans are data: no code names one.
model Plan {
  id                  String         @id @default(uuid(7)) @db.Uuid
  /// Stable, e.g. "starter" (CHECK plan_key_format). It never changes.
  key                 String         @unique
  name                String
  /// INR in paise, per month and per year. A plan may be sold one way only; at least one is set (CHECK plan_priced).
  monthlyPricePaise   Int?           @map("monthly_price_paise")
  yearlyPricePaise    Int?           @map("yearly_price_paise")
  seatLimit           Int            @map("seat_limit")
  whatsappNumberLimit Int            @map("whatsapp_number_limit")
  storageLimitBytes   BigInt         @map("storage_limit_bytes")
  /// The business modules it includes, e.g. {crm,quotes} (CHECK plan_modules_known). The Foundation's own features
  /// (staff, roles, settings, the audit log, documents) come with every plan.
  modules             String[]
  /// Archived plans take no new subscriptions; organizations already on one keep it.
  archivedAt          DateTime?      @map("archived_at") @db.Timestamptz(6)
  createdAt           DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  subscriptions       Subscription[]

  @@map("plan")
}

/// An organization's subscription (spec 7.2, 7.3): its plan, dates, status and overrides. One per organization.
model Subscription {
  /// Filled from db.forOrg()'s organization when omitted. Also the key: one subscription per organization.
  organizationId         String                @id @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  planId                 String                @map("plan_id") @db.Uuid
  /// "monthly" or "yearly" (CHECK subscription_billing_cycle_value).
  billingCycle           String                @map("billing_cycle")
  /// "trial", "active", "past_due", "read_only", "suspended" or "cancelled" (CHECK subscription_status_value).
  status                 String
  /// When the status last changed: the unpaid states last a number of days from it (subscription_policy).
  statusChangedAt        DateTime              @map("status_changed_at") @db.Timestamptz(6)
  /// The last day of the trial; set exactly while the status is "trial".
  trialEndsOn            DateTime?             @map("trial_ends_on") @db.Date
  /// The last day paid for, in the organization's time zone. Null until the first payment.
  paidThrough            DateTime?             @map("paid_through") @db.Date
  /// Overrides (spec 7.2): seats beyond the plan's, a price agreed for this organization, modules switched on early.
  extraSeats             Int                   @default(0) @map("extra_seats")
  customPricePaise       Int?                  @map("custom_price_paise")
  extraModules           String[]              @default([]) @map("extra_modules")
  /// Razorpay's id for this subscription once Razorpay Subscriptions bills it (spec 7.4); null while billing is by hand.
  providerSubscriptionId String?               @map("provider_subscription_id")
  createdAt              DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  plan                   Plan                  @relation(fields: [planId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  organization           Organization          @relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  payments               SubscriptionPayment[]

  @@map("subscription")
}

/// A payment the console recorded (spec 7.4: amount, dates and status), or later one Razorpay reported. Never deleted:
/// a mistaken entry is voided.
model SubscriptionPayment {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId    String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id                String       @id @default(uuid(7)) @db.Uuid
  /// INR in paise, more than zero (CHECK subscription_payment_amount_positive).
  amountPaise       Int          @map("amount_paise")
  paidOn            DateTime     @map("paid_on") @db.Date
  /// The last day this payment pays for: the subscription is paid through at least this day once it is recorded.
  paidThrough       DateTime     @map("paid_through") @db.Date
  /// How it was paid, for whoever matches the bank statement, e.g. "NEFT UTR 412345678901".
  reference         String?
  /// "manual" (recorded in the console) or "razorpay" (reported by its webhook, later).
  provider          String       @default("manual")
  /// The provider's own id for the payment: a repeated webhook finds it and records nothing twice.
  providerPaymentId String?      @map("provider_payment_id")
  /// The platform admin who recorded it; null for a provider's webhook.
  recordedBy        String?      @map("recorded_by") @db.Uuid
  recordedAt        DateTime     @default(now()) @map("recorded_at") @db.Timestamptz(6)
  voidedAt          DateTime?    @map("voided_at") @db.Timestamptz(6)
  voidedBy          String?      @map("voided_by") @db.Uuid
  voidReason        String?      @map("void_reason")
  /// A payment belongs to its organization's subscription: there is no payment without one.
  subscription      Subscription @relation(fields: [organizationId], references: [organizationId], onDelete: Restrict, onUpdate: Restrict, map: "subscription_payment_subscription_fkey")
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([organizationId, id])
  @@unique([organizationId, provider, providerPaymentId])
  /// An organization's payments, newest first.
  @@index([organizationId, paidOn(sort: Desc)])
  @@map("subscription_payment")
}

/// How many days an organization stays past due, then read-only, before the next state (spec 7.3; Q3: 7 and 14).
/// One row, edited by super admins in the console.
model SubscriptionPolicy {
  /// Always true: the table holds one row (CHECK subscription_policy_one_row).
  id           Boolean  @id @default(true)
  pastDueDays  Int      @default(7) @map("past_due_days")
  readOnlyDays Int      @default(14) @map("read_only_days")
  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// The super admin who last changed it; null for the defaults.
  updatedBy    String?  @map("updated_by") @db.Uuid

  @@map("subscription_policy")
}
```

In `packages/db/prisma/schema/organization.prisma`:

replace:
```prisma
  rolePermissions         RolePermission[]
  outboxEvents            OutboxEvent[]
```
with:
```prisma
  rolePermissions         RolePermission[]
  subscription            Subscription?
  subscriptionPayments    SubscriptionPayment[]
  outboxEvents            OutboxEvent[]
```

- [ ] **Step 5: Create the migration**

Below the generated tables, the hand-written part turns on row-level security for the two organization tables, gives the runtime role only reads and a subscription's status, and checks every value the console may write.

Create the migration from the schema change alone, without a database: `git archive HEAD` still holds the schema from before this task, so no track diffs against another's tables.
```bash
cd /Users/ak/personal/travel-crm-04-subscriptions/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261016100000_subscriptions
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script --output prisma/migrations/20261016100000_subscriptions/migration.sql
pnpm generate
```
Expected: the generated part of the file below, down to the banner. Append the hand-written part, so the whole file reads:

`packages/db/prisma/migrations/20261016100000_subscriptions/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price_paise" INTEGER,
    "yearly_price_paise" INTEGER,
    "seat_limit" INTEGER NOT NULL,
    "whatsapp_number_limit" INTEGER NOT NULL,
    "storage_limit_bytes" BIGINT NOT NULL,
    "modules" TEXT[],
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "plan_id" UUID NOT NULL,
    "billing_cycle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "trial_ends_on" DATE,
    "paid_through" DATE,
    "extra_seats" INTEGER NOT NULL DEFAULT 0,
    "custom_price_paise" INTEGER,
    "extra_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "subscription_payment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "paid_through" DATE NOT NULL,
    "reference" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "provider_payment_id" TEXT,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "subscription_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_policy" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "past_due_days" INTEGER NOT NULL DEFAULT 7,
    "read_only_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "subscription_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_key" ON "plan"("key");

-- CreateIndex
CREATE INDEX "subscription_payment_organization_id_paid_on_idx" ON "subscription_payment"("organization_id", "paid_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_organization_id_id_key" ON "subscription_payment"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_organization_id_provider_provider_paym_key" ON "subscription_payment"("organization_id", "provider", "provider_payment_id");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_subscription_fkey" FOREIGN KEY ("organization_id") REFERENCES "subscription"("organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration). Plans and the policy have no organization.
SELECT app_enable_org_rls('subscription');
SELECT app_enable_org_rls('subscription_payment');

-- Plan keys are stable slugs; a plan has a price and real limits; its modules are ones the product has (spec 7.2).
-- Prisma makes list columns nullable, so the module checks also refuse NULL.
ALTER TABLE "plan"
  ADD CONSTRAINT plan_key_format CHECK (key ~ '^[a-z][a-z0-9-]{1,31}$'),
  ADD CONSTRAINT plan_name_length CHECK (char_length(name) BETWEEN 1 AND 60),
  ADD CONSTRAINT plan_priced CHECK (monthly_price_paise IS NOT NULL OR yearly_price_paise IS NOT NULL),
  ADD CONSTRAINT plan_prices_not_negative
    CHECK (coalesce(monthly_price_paise, 0) >= 0 AND coalesce(yearly_price_paise, 0) >= 0),
  ADD CONSTRAINT plan_limits_positive CHECK (seat_limit > 0 AND whatsapp_number_limit >= 0 AND storage_limit_bytes > 0),
  ADD CONSTRAINT plan_modules_known CHECK (modules IS NOT NULL AND modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports']::text[]);

-- The lifecycle's states (spec 7.3); a trial has its last day; overrides add, never take away.
ALTER TABLE "subscription"
  ADD CONSTRAINT subscription_billing_cycle_value CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD CONSTRAINT subscription_status_value
    CHECK (status IN ('trial', 'active', 'past_due', 'read_only', 'suspended', 'cancelled')),
  ADD CONSTRAINT subscription_trial_dated CHECK (status <> 'trial' OR trial_ends_on IS NOT NULL),
  ADD CONSTRAINT subscription_overrides_not_negative CHECK (extra_seats >= 0 AND coalesce(custom_price_paise, 0) >= 0),
  ADD CONSTRAINT subscription_extra_modules_known CHECK (extra_modules IS NOT NULL AND extra_modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports']::text[]);

-- A payment is money received; a provider's payment carries the provider's id; voiding records why.
ALTER TABLE "subscription_payment"
  ADD CONSTRAINT subscription_payment_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT subscription_payment_provider_value CHECK (provider IN ('manual', 'razorpay')),
  ADD CONSTRAINT subscription_payment_provider_id CHECK (provider = 'manual' OR provider_payment_id IS NOT NULL),
  ADD CONSTRAINT subscription_payment_reference_length CHECK (char_length(reference) <= 100),
  ADD CONSTRAINT subscription_payment_voided
    CHECK ((voided_at IS NULL) = (void_reason IS NULL) AND char_length(void_reason) <= 200);

-- One row holds the policy, with the spec's defaults (Q3: 7 days past due, then 14 read-only).
ALTER TABLE "subscription_policy"
  ADD CONSTRAINT subscription_policy_one_row CHECK (id),
  ADD CONSTRAINT subscription_policy_days CHECK (past_due_days BETWEEN 1 AND 90 AND read_only_days BETWEEN 1 AND 180);
INSERT INTO "subscription_policy" (id) VALUES (true);

-- The api reads all of these for its request checks; only the platform role writes them. The worker's lifecycle job
-- may move a subscription's status along, and change nothing else.
REVOKE INSERT, UPDATE, DELETE ON TABLE "plan", "subscription_policy", "subscription", "subscription_payment"
  FROM app_runtime;
GRANT UPDATE (status, status_changed_at, updated_at) ON TABLE "subscription" TO app_runtime;
```

- [ ] **Step 6: Write the contracts**

`packages/contracts/src/subscriptions/index.ts`:
```ts
// Public API of @travel-crm/contracts/subscriptions: the Zod schemas of plans and subscriptions.
export * from "./plans.js";
export * from "./subscriptions.js";
```

`packages/contracts/src/subscriptions/plans.ts`:
```ts
// Plans as the console edits them (spec 7.2): an INR price per month and/or year, limits, and the modules included.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** The business modules a plan can include (spec 1's build order). The Foundation's own features come with every plan. */
export const planModules = [
  "crm",
  "inbox",
  "catalog",
  "quotes",
  "bookings",
  "departures",
  "suppliers",
  "accounts",
  "reports",
] as const;
export const planModule = z.enum(planModules);
export type PlanModule = z.infer<typeof planModule>;

/** A plan's stable key, e.g. "starter". Matches the database's plan_key_format check. */
export const planKey = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/, "Use 2-32 lower-case letters, digits or dashes");

/** INR in paise: at most ₹2,00,00,000, comfortably below the database's integer limit. */
export const pricePaise = z.int().min(0).max(2_000_000_000);

const planFields = {
  name: z.string().trim().min(1).max(60),
  /** Null when the plan isn't sold that way. At least one of the two is set. */
  monthlyPricePaise: pricePaise.nullable(),
  yearlyPricePaise: pricePaise.nullable(),
  seatLimit: z.int().min(1).max(10_000),
  whatsappNumberLimit: z.int().min(0).max(100),
  /** At most 10 TB. */
  storageLimitBytes: z.int().min(1).max(10_000_000_000_000),
  modules: z.array(planModule).max(planModules.length),
};

const isPriced = (plan: { monthlyPricePaise: number | null; yearlyPricePaise: number | null }) =>
  plan.monthlyPricePaise !== null || plan.yearlyPricePaise !== null;
const priceMissing = { message: "Give a monthly price, a yearly price or both", path: ["monthlyPricePaise"] };

export const createPlanInput = z.strictObject({ key: planKey, ...planFields }).refine(isPriced, priceMissing);
export type CreatePlanInput = z.infer<typeof createPlanInput>;

/** Everything but the key, which never changes. */
export const updatePlanInput = z.strictObject({ planId: recordId, ...planFields }).refine(isPriced, priceMissing);
export type UpdatePlanInput = z.infer<typeof updatePlanInput>;

export const planIdInput = z.strictObject({ planId: recordId });
export type PlanIdInput = z.infer<typeof planIdInput>;

export const listPlansInput = z.strictObject({ includeArchived: z.boolean().default(false) });
export type ListPlansInput = z.infer<typeof listPlansInput>;

export const planSummary = z.object({
  id: recordId,
  key: planKey,
  name: z.string(),
  monthlyPricePaise: z.int().nullable(),
  yearlyPricePaise: z.int().nullable(),
  seatLimit: z.int(),
  whatsappNumberLimit: z.int(),
  storageLimitBytes: z.int(),
  modules: z.array(planModule),
  archived: z.boolean(),
});
export type PlanSummary = z.infer<typeof planSummary>;
```

`packages/contracts/src/subscriptions/subscriptions.ts`:
```ts
// An organization's subscription as the console sees and changes it (spec 7.2-7.4): plan, dates, status, overrides
// and the payments recorded against it.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { planKey, planModule, pricePaise } from "./plans.js";

/** The lifecycle's states (spec 7.3). */
export const subscriptionStatus = z.enum(["trial", "active", "past_due", "read_only", "suspended", "cancelled"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

export const billingCycle = z.enum(["monthly", "yearly"]);
export type BillingCycle = z.infer<typeof billingCycle>;

/** Why a platform admin did something by hand, kept in the organization's audit log. */
const reason = z.string().trim().min(1).max(200);

/** How a new organization's subscription starts: on a trial to a given day, or paid through one. */
export const startSubscriptionInput = z.strictObject({
  planId: recordId,
  billingCycle,
  /** The trial's last day; the subscription starts active instead when it is null. */
  trialEndsOn: calendarDate.nullable(),
  /** The last day already paid for, when the subscription starts active. */
  paidThrough: calendarDate.nullable(),
});
export type StartSubscriptionInput = z.infer<typeof startSubscriptionInput>;

export const organizationIdInput = z.strictObject({ organizationId: recordId });
export type OrganizationIdInput = z.infer<typeof organizationIdInput>;

export const changePlanInput = z.strictObject({ organizationId: recordId, planId: recordId, billingCycle });
export type ChangePlanInput = z.infer<typeof changePlanInput>;

/** Overrides (spec 7.2): seats beyond the plan's, an agreed price, modules switched on early. */
export const setOverridesInput = z.strictObject({
  organizationId: recordId,
  extraSeats: z.int().min(0).max(10_000),
  customPricePaise: pricePaise.nullable(),
  extraModules: z.array(planModule).max(20),
});
export type SetOverridesInput = z.infer<typeof setOverridesInput>;

export const setTrialEndInput = z.strictObject({ organizationId: recordId, trialEndsOn: calendarDate });
export type SetTrialEndInput = z.infer<typeof setTrialEndInput>;

/** Gives an organization time without a payment, or corrects the paid-through day. */
export const setPaidThroughInput = z.strictObject({ organizationId: recordId, paidThrough: calendarDate, reason });
export type SetPaidThroughInput = z.infer<typeof setPaidThroughInput>;

export const recordPaymentInput = z.strictObject({
  organizationId: recordId,
  amountPaise: pricePaise.min(1),
  paidOn: calendarDate,
  paidThrough: calendarDate,
  /** How it was paid, e.g. "NEFT UTR 412345678901". */
  reference: z.string().trim().min(1).max(100).nullable(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;

export const voidPaymentInput = z.strictObject({ organizationId: recordId, paymentId: recordId, reason });
export type VoidPaymentInput = z.infer<typeof voidPaymentInput>;

/** Suspending or cancelling by hand. */
export const endAccessInput = z.strictObject({ organizationId: recordId, reason });
export type EndAccessInput = z.infer<typeof endAccessInput>;

export const subscriptionDetails = z.object({
  organizationId: recordId,
  plan: z.object({ id: recordId, key: planKey, name: z.string() }),
  billingCycle,
  status: subscriptionStatus,
  statusChangedAt: z.iso.datetime(),
  trialEndsOn: calendarDate.nullable(),
  paidThrough: calendarDate.nullable(),
  extraSeats: z.int(),
  customPricePaise: z.int().nullable(),
  extraModules: z.array(planModule),
});
export type SubscriptionDetails = z.infer<typeof subscriptionDetails>;

export const subscriptionPayment = z.object({
  id: recordId,
  amountPaise: z.int(),
  paidOn: calendarDate,
  paidThrough: calendarDate,
  reference: z.string().nullable(),
  provider: z.enum(["manual", "razorpay"]),
  recordedBy: recordId.nullable(),
  recordedAt: z.iso.datetime(),
  voided: z.object({ at: z.iso.datetime(), by: recordId.nullable(), reason: z.string() }).nullable(),
});
export type SubscriptionPayment = z.infer<typeof subscriptionPayment>;

/** How long an organization stays in each unpaid state (spec 7.3; Q3). */
const policyDays = { pastDueDays: z.int().min(1).max(90), readOnlyDays: z.int().min(1).max(180) };

export const setSubscriptionPolicyInput = z.strictObject(policyDays);
export const subscriptionPolicy = z.object(policyDays);
export type SubscriptionPolicy = z.infer<typeof subscriptionPolicy>;

/** An organization's subscription and its payments, as the console shows them. */
export const subscriptionWithPayments = z.object({
  subscription: subscriptionDetails,
  payments: z.array(subscriptionPayment),
});
export type SubscriptionWithPayments = z.infer<typeof subscriptionWithPayments>;
```

- [ ] **Step 7: Write the subscriptions module**

`packages/domain/src/subscriptions/console-actor.ts`:
```ts
// Who changes a subscription from the console: a platform admin, or the platform's own job.
import { platformActor, systemActor, type Actor } from "../kernel/index.js";

/** A platform admin by user id, or null for the platform's own jobs (the nightly demo reset). */
export interface ConsoleActor {
  readonly userId: string | null;
}

/**
 * The actor recorded in the changed organization's audit log: the admin under their own name (source "platform"),
 * or the system. Built from the organization being changed, so an entry can't land in another organization's log.
 */
export function actorIn(organizationId: string, by: ConsoleActor): Actor {
  return by.userId === null ? systemActor(organizationId) : platformActor(organizationId, by.userId);
}
```

`packages/domain/src/subscriptions/dates.ts`:
```ts
// Calendar dates as the subscription tables store them: Postgres date columns, which Prisma reads as midnight UTC.
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, parseCalendarDate, type CalendarDate } from "../kernel/index.js";

/** The Date Prisma writes for a calendar date. */
export function toDateColumn(date: string): Date {
  return new Date(`${parseCalendarDate(date)}T00:00:00.000Z`);
}

/** The calendar date a date column holds. */
export function fromDateColumn(value: Date): CalendarDate {
  return parseCalendarDate(value.toISOString().slice(0, 10));
}

/** Today in the organization's time zone: dates are paid through, and trials end, in that zone (spec 9.1). */
export async function todayFor(tx: OrgTx, organizationId: string, now: Date): Promise<CalendarDate> {
  return calendarDateIn(now, await organizationTimeZone(tx, organizationId));
}
```

`packages/domain/src/subscriptions/rows.ts`:
```ts
// How the subscriptions module turns its rows into what callers see.
import type {
  PlanModule,
  PlanSummary,
  SubscriptionDetails,
  SubscriptionPayment,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import { planModule, subscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { fromDateColumn } from "./dates.js";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthlyPricePaise: number | null;
  yearlyPricePaise: number | null;
  seatLimit: number;
  whatsappNumberLimit: number;
  storageLimitBytes: bigint;
  modules: string[];
  archivedAt: Date | null;
}

export function planSummaryOf(row: PlanRow): PlanSummary {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    monthlyPricePaise: row.monthlyPricePaise,
    yearlyPricePaise: row.yearlyPricePaise,
    seatLimit: row.seatLimit,
    whatsappNumberLimit: row.whatsappNumberLimit,
    // Limits are at most 10 TB (the contract's), well within a safe integer.
    storageLimitBytes: Number(row.storageLimitBytes),
    modules: modulesOf(row.modules),
    archived: row.archivedAt !== null,
  };
}

/** The table's checks keep modules to the known ones; anything else is a bug worth failing loudly on. */
export function modulesOf(values: readonly string[]): PlanModule[] {
  return values.map((value) => planModule.parse(value));
}

export function statusOf(value: string): SubscriptionStatus {
  return subscriptionStatus.parse(value);
}

export interface SubscriptionRow {
  organizationId: string;
  billingCycle: string;
  status: string;
  statusChangedAt: Date;
  trialEndsOn: Date | null;
  paidThrough: Date | null;
  extraSeats: number;
  customPricePaise: number | null;
  extraModules: string[];
  plan: { id: string; key: string; name: string };
}

export function subscriptionDetailsOf(row: SubscriptionRow): SubscriptionDetails {
  return {
    organizationId: row.organizationId,
    plan: { id: row.plan.id, key: row.plan.key, name: row.plan.name },
    billingCycle: row.billingCycle === "yearly" ? "yearly" : "monthly",
    status: statusOf(row.status),
    statusChangedAt: row.statusChangedAt.toISOString(),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
    extraSeats: row.extraSeats,
    customPricePaise: row.customPricePaise,
    extraModules: modulesOf(row.extraModules),
  };
}

interface PaymentRow {
  id: string;
  amountPaise: number;
  paidOn: Date;
  paidThrough: Date;
  reference: string | null;
  provider: string;
  recordedBy: string | null;
  recordedAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export function paymentOf(row: PaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    amountPaise: row.amountPaise,
    paidOn: fromDateColumn(row.paidOn),
    paidThrough: fromDateColumn(row.paidThrough),
    reference: row.reference,
    provider: row.provider === "razorpay" ? "razorpay" : "manual",
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
    voided:
      row.voidedAt && row.voidReason !== null
        ? { at: row.voidedAt.toISOString(), by: row.voidedBy, reason: row.voidReason }
        : null,
  };
}
```

`packages/domain/src/subscriptions/plans.ts`:
```ts
// Plans (spec 7.2): data the console edits, never names in code. A plan's key never changes; an archived plan takes no
// new subscriptions. Writes need the platform role; the api only reads plans.
import type { CreatePlanInput, PlanSummary, UpdatePlanInput } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { isUniqueViolation } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { planSummaryOf } from "./rows.js";

export async function createPlan(tx: OrgTx, input: CreatePlanInput): Promise<PlanSummary> {
  try {
    return planSummaryOf(
      await tx.plan.create({ data: { ...input, storageLimitBytes: BigInt(input.storageLimitBytes) } }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("CONFLICT", "PLAN_KEY_TAKEN", "Another plan has that key");
    throw error;
  }
}

/** Changes what a plan costs, allows and includes. Organizations on it get the new limits and modules at once. */
export async function updatePlan(
  tx: OrgTx,
  input: UpdatePlanInput,
): Promise<{ before: PlanSummary; after: PlanSummary }> {
  const before = await findPlan(tx, input.planId);
  const { planId, ...fields } = input;
  const after = await tx.plan.update({
    where: { id: planId },
    data: { ...fields, storageLimitBytes: BigInt(fields.storageLimitBytes) },
  });
  return { before, after: planSummaryOf(after) };
}

/** Takes the plan off sale. Organizations already on it keep it; archiving twice changes nothing. */
export async function archivePlan(tx: OrgTx, planId: string): Promise<{ plan: PlanSummary; changed: boolean }> {
  const plan = await findPlan(tx, planId);
  if (plan.archived) return { plan, changed: false };
  return {
    plan: planSummaryOf(await tx.plan.update({ where: { id: planId }, data: { archivedAt: new Date() } })),
    changed: true,
  };
}

export async function listPlans(tx: OrgTx, options: { includeArchived: boolean }): Promise<PlanSummary[]> {
  const plans = await tx.plan.findMany({
    where: options.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return plans.map(planSummaryOf);
}

export async function findPlan(tx: OrgTx, planId: string): Promise<PlanSummary> {
  const plan = await tx.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new DomainError("NOT_FOUND", "PLAN_NOT_FOUND", "No such plan");
  return planSummaryOf(plan);
}

/** A plan an organization may be put on now: one that is still sold. */
export async function findPlanOnSale(tx: OrgTx, planId: string): Promise<PlanSummary> {
  const plan = await findPlan(tx, planId);
  if (plan.archived) throw new DomainError("CONFLICT", "PLAN_ARCHIVED", "That plan is no longer sold");
  return plan;
}
```

`packages/domain/src/subscriptions/policy.ts`:
```ts
// How many days an organization stays past due, then read-only, before the next state (spec 7.3; Q3: 7 and 14). One
// row, changed by super admins from the console.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";

export async function getSubscriptionPolicy(tx: OrgTx): Promise<SubscriptionPolicy> {
  const policy = await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } });
  return { pastDueDays: policy.pastDueDays, readOnlyDays: policy.readOnlyDays };
}

/** Changes the days. Organizations already in a state count its days from when they entered it, with the new rule. */
export async function setSubscriptionPolicy(
  tx: OrgTx,
  by: { userId: string },
  policy: SubscriptionPolicy,
): Promise<{ before: SubscriptionPolicy; after: SubscriptionPolicy }> {
  const before = await getSubscriptionPolicy(tx);
  await tx.subscriptionPolicy.update({ where: { id: true }, data: { ...policy, updatedBy: by.userId } });
  return { before, after: policy };
}
```

`packages/domain/src/subscriptions/subscriptions.ts`:
```ts
// The console's changes to one organization's subscription (spec 7.2, 7.3), each recorded in that organization's audit
// log under the platform admin's name. They write columns only the platform role may write, so the console runs them
// in a platform transaction; every query names the organization.
import type {
  ChangePlanInput,
  EndAccessInput,
  SetOverridesInput,
  SetPaidThroughInput,
  SetTrialEndInput,
  StartSubscriptionInput,
  SubscriptionDetails,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn, todayFor } from "./dates.js";
import { findPlanOnSale } from "./plans.js";
import { subscriptionDetailsOf } from "./rows.js";

const withPlan = { plan: { select: { id: true, key: true, name: true } } } as const;

/** The organization's subscription, or NOT_FOUND. */
export async function getSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  const row = await tx.subscription.findUnique({ where: { organizationId }, include: withPlan });
  if (!row) throw new DomainError("NOT_FOUND", "SUBSCRIPTION_NOT_FOUND", "This organization has no subscription");
  return subscriptionDetailsOf(row);
}

/**
 * Holds the subscription until the transaction ends, so two changes (or a change and the lifecycle job) can't
 * interleave, and returns it as it is once held.
 */
export async function lockSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  await tx.$queryRaw`SELECT organization_id FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  return getSubscription(tx, organizationId);
}

/**
 * A new organization's subscription (onboarding, spec 7.1): on a trial to its last day, or active and paid through a
 * day. Recorded as "subscription.started".
 */
export async function startSubscription(
  tx: OrgTx,
  by: ConsoleActor,
  input: StartSubscriptionInput & { organizationId: string },
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { organizationId } = input;
  const plan = await findPlanOnSale(tx, input.planId);
  const today = await todayFor(tx, organizationId, now);
  if (input.trialEndsOn !== null && input.trialEndsOn < today) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (input.trialEndsOn === null && (input.paidThrough === null || input.paidThrough < today)) {
    throw new DomainError(
      "VALIDATION",
      "PAID_THROUGH_REQUIRED",
      "Give a trial's end, or a paid-through day from today",
    );
  }
  const status: SubscriptionStatus = input.trialEndsOn === null ? "active" : "trial";
  const created = await tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      billingCycle: input.billingCycle,
      status,
      statusChangedAt: now,
      trialEndsOn: input.trialEndsOn === null ? null : toDateColumn(input.trialEndsOn),
      paidThrough: input.paidThrough === null ? null : toDateColumn(input.paidThrough),
    },
    include: withPlan,
  });
  const details = subscriptionDetailsOf(created);
  await recordAudit(tx, actorIn(organizationId, by), {
    action: "subscription.started",
    entityType: "subscription",
    entityId: organizationId,
    after: {
      plan: plan.key,
      billingCycle: details.billingCycle,
      status,
      trialEndsOn: details.trialEndsOn,
      paidThrough: details.paidThrough,
    },
  });
  return details;
}

/** Moves the organization to another plan or billing cycle. The same plan and cycle again changes nothing. */
export async function changePlan(tx: OrgTx, by: ConsoleActor, input: ChangePlanInput): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.plan.id === input.planId && current.billingCycle === input.billingCycle) return current;
  const plan = await findPlanOnSale(tx, input.planId);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { planId: plan.id, billingCycle: input.billingCycle },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.plan-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { plan: current.plan.key, billingCycle: current.billingCycle },
    after: { plan: plan.key, billingCycle: input.billingCycle },
  });
  return getSubscription(tx, input.organizationId);
}

/** Extra seats, an agreed price and modules switched on early (spec 7.2). The same values again change nothing. */
export async function setOverrides(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  const extraModules = [...new Set(input.extraModules)].sort();
  const before = {
    extraSeats: current.extraSeats,
    customPricePaise: current.customPricePaise,
    extraModules: current.extraModules,
  };
  const after = { extraSeats: input.extraSeats, customPricePaise: input.customPricePaise, extraModules };
  if (JSON.stringify(before) === JSON.stringify(after)) return current;
  await tx.subscription.update({ where: { organizationId: input.organizationId }, data: after });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.overrides-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before,
    after,
  });
  return getSubscription(tx, input.organizationId);
}

/** Moves a trial's last day, to today or later. Only while the organization is on its trial. */
export async function setTrialEnd(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetTrialEndInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.status !== "trial")
    throw new DomainError("CONFLICT", "NOT_IN_TRIAL", "This organization's trial is over");
  if (input.trialEndsOn < (await todayFor(tx, input.organizationId, now))) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (current.trialEndsOn === input.trialEndsOn) return current;
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { trialEndsOn: toDateColumn(input.trialEndsOn) },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.trial-end-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { trialEndsOn: current.trialEndsOn },
    after: { trialEndsOn: input.trialEndsOn },
  });
  return getSubscription(tx, input.organizationId);
}

/**
 * Sets the last day paid for without a payment: time given (a pilot, goodwill) or a correction. Paid through today or
 * later, the organization is active again, from whatever state, cancelled included.
 */
export async function setPaidThrough(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetPaidThroughInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  const status = statusOnceItPays(current.status, input.paidThrough, await todayFor(tx, input.organizationId, now));
  if (current.paidThrough === input.paidThrough && status === current.status) return current;
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      paidThrough: toDateColumn(input.paidThrough),
      ...(status === current.status ? {} : { status, statusChangedAt: now }),
    },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.paid-through-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { paidThrough: current.paidThrough, status: current.status },
    after: { paidThrough: input.paidThrough, status, reason: input.reason },
  });
  return getSubscription(tx, input.organizationId);
}

/** What paying through a day does: from today on, the organization is active; a day in the past changes nothing. */
export function statusOnceItPays(current: SubscriptionStatus, paidThrough: string, today: string): SubscriptionStatus {
  return paidThrough >= today ? "active" : current;
}

/** Suspends the organization at once (spec 7.3: the owner can only export or pay), whatever it has paid. */
export async function suspend(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  return endAccess(tx, by, input, "suspended", now);
}

/** Cancels the subscription: the data is kept, locked, until a super admin deletes it (spec 5, 7.3). */
export async function cancel(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  return endAccess(tx, by, input, "cancelled", now);
}

async function endAccess(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  status: "suspended" | "cancelled",
  now: Date,
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.status === status) return current;
  if (current.status === "cancelled") {
    throw new DomainError("CONFLICT", "SUBSCRIPTION_CANCELLED", "A cancelled subscription comes back only by paying");
  }
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { status, statusChangedAt: now },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: status === "suspended" ? "subscription.suspended" : "subscription.cancelled",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { status: current.status },
    after: { status, reason: input.reason },
  });
  return getSubscription(tx, input.organizationId);
}
```

`packages/domain/src/subscriptions/payments.ts`:
```ts
// Payments recorded against a subscription (spec 7.3, 7.4): recording one pays the organization through a day and, from
// today on, makes it active again. Payments are never deleted; a mistaken one is voided, which changes no dates.
import type { RecordPaymentInput, SubscriptionPayment, VoidPaymentInput } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn, todayFor } from "./dates.js";
import { paymentOf } from "./rows.js";
import { lockSubscription, statusOnceItPays } from "./subscriptions.js";

/** A payment a provider reported (Razorpay, later), found again by its own id when its webhook is repeated. */
export interface ProviderPayment {
  provider: "razorpay";
  providerPaymentId: string;
}

/**
 * Records a payment and moves the paid-through day to at least the payment's. Recorded as
 * "subscription.payment-recorded" with the amount and dates. With a provider's payment id, a repeat records nothing
 * and returns the payment already recorded.
 */
export async function recordPayment(
  tx: OrgTx,
  by: ConsoleActor,
  input: RecordPaymentInput,
  options: { now?: Date; provider?: ProviderPayment } = {},
): Promise<SubscriptionPayment> {
  const now = options.now ?? new Date();
  const current = await lockSubscription(tx, input.organizationId);
  if (options.provider) {
    const repeated = await tx.subscriptionPayment.findUnique({
      where: {
        organizationId_provider_providerPaymentId: {
          organizationId: input.organizationId,
          provider: options.provider.provider,
          providerPaymentId: options.provider.providerPaymentId,
        },
      },
    });
    if (repeated) return paymentOf(repeated);
  }
  const paidThrough =
    current.paidThrough !== null && current.paidThrough > input.paidThrough ? current.paidThrough : input.paidThrough;
  const status = statusOnceItPays(current.status, paidThrough, await todayFor(tx, input.organizationId, now));
  const payment = await tx.subscriptionPayment.create({
    data: {
      organizationId: input.organizationId,
      amountPaise: input.amountPaise,
      paidOn: toDateColumn(input.paidOn),
      paidThrough: toDateColumn(input.paidThrough),
      reference: input.reference,
      provider: options.provider?.provider ?? "manual",
      providerPaymentId: options.provider?.providerPaymentId ?? null,
      recordedBy: by.userId,
    },
  });
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      paidThrough: toDateColumn(paidThrough),
      ...(status === current.status ? {} : { status, statusChangedAt: now }),
    },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.payment-recorded",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { paidThrough: current.paidThrough, status: current.status },
    after: {
      paymentId: payment.id,
      amountPaise: input.amountPaise,
      paidOn: input.paidOn,
      paidThrough,
      status,
    },
  });
  return paymentOf(payment);
}

/** Marks a payment recorded by mistake as void. Dates and status stay as they are: correct them on their own. */
export async function voidPayment(tx: OrgTx, by: ConsoleActor, input: VoidPaymentInput): Promise<SubscriptionPayment> {
  const payment = await tx.subscriptionPayment.findFirst({
    where: { organizationId: input.organizationId, id: input.paymentId },
  });
  if (!payment) throw new DomainError("NOT_FOUND", "PAYMENT_NOT_FOUND", "No such payment");
  if (payment.voidedAt) return paymentOf(payment);
  const voided = await tx.subscriptionPayment.update({
    where: { id: payment.id },
    data: { voidedAt: new Date(), voidedBy: by.userId, voidReason: input.reason },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.payment-voided",
    entityType: "subscription",
    entityId: input.organizationId,
    after: { paymentId: payment.id, amountPaise: payment.amountPaise, reason: input.reason },
  });
  return paymentOf(voided);
}

/** The organization's payments, newest first, voided ones included. */
export async function listPayments(tx: OrgTx, organizationId: string): Promise<SubscriptionPayment[]> {
  const payments = await tx.subscriptionPayment.findMany({
    where: { organizationId },
    orderBy: [{ paidOn: "desc" }, { recordedAt: "desc" }],
  });
  return payments.map(paymentOf);
}
```

`packages/domain/src/subscriptions/index.ts`:
```ts
// Public API of the subscriptions module: plans, each organization's subscription and payments (spec 7.2-7.4).
export type { ConsoleActor } from "./console-actor.js";
export { listPayments, recordPayment, voidPayment, type ProviderPayment } from "./payments.js";
export { archivePlan, createPlan, findPlan, listPlans, updatePlan } from "./plans.js";
export { getSubscriptionPolicy, setSubscriptionPolicy } from "./policy.js";
export {
  cancel,
  changePlan,
  getSubscription,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  startSubscription,
  suspend,
} from "./subscriptions.js";
```

- [ ] **Step 8: Give the console its plans and subscriptions**

`packages/domain/src/platform/plans.ts`:
```ts
// The console's plans (spec 7.2): super admins create, change and archive them. Plans belong to no organization, so
// every change goes in the platform log, in the same platform transaction.
import type {
  CreatePlanInput,
  ListPlansInput,
  PlanSummary,
  SubscriptionPolicy,
  UpdatePlanInput,
} from "@travel-crm/contracts/subscriptions";
import * as subscriptions from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** What the platform log keeps of a plan: everything but its id, which the entry names. */
function snapshotOf(plan: PlanSummary) {
  return {
    key: plan.key,
    name: plan.name,
    monthlyPricePaise: plan.monthlyPricePaise,
    yearlyPricePaise: plan.yearlyPricePaise,
    seatLimit: plan.seatLimit,
    whatsappNumberLimit: plan.whatsappNumberLimit,
    storageLimitBytes: plan.storageLimitBytes,
    modules: plan.modules,
    archived: plan.archived,
  };
}

export async function listPlans(services: PlatformServices, input: ListPlansInput): Promise<PlanSummary[]> {
  return services.platformDb.transaction((tx) => subscriptions.listPlans(tx, input));
}

export async function createPlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: CreatePlanInput,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const plan = await subscriptions.createPlan(tx, input);
    await recordPlatformAudit(tx, staff, {
      action: "plan.created",
      targetType: "plan",
      targetId: plan.id,
      after: snapshotOf(plan),
    });
    return plan;
  });
}

export async function updatePlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: UpdatePlanInput,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after } = await subscriptions.updatePlan(tx, input);
    await recordPlatformAudit(tx, staff, {
      action: "plan.updated",
      targetType: "plan",
      targetId: after.id,
      before: snapshotOf(before),
      after: snapshotOf(after),
    });
    return after;
  });
}

export async function archivePlan(
  services: PlatformServices,
  staff: PlatformActor,
  planId: string,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const { plan, changed } = await subscriptions.archivePlan(tx, planId);
    if (changed)
      await recordPlatformAudit(tx, staff, { action: "plan.archived", targetType: "plan", targetId: plan.id });
    return plan;
  });
}

export async function getSubscriptionPolicy(services: PlatformServices): Promise<SubscriptionPolicy> {
  return services.platformDb.transaction((tx) => subscriptions.getSubscriptionPolicy(tx));
}

/** Changes how many days an organization stays past due, then read-only (spec 7.3). Super admins only. */
export async function setSubscriptionPolicy(
  services: PlatformServices,
  staff: { userId: string },
  policy: SubscriptionPolicy,
): Promise<SubscriptionPolicy> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after } = await subscriptions.setSubscriptionPolicy(tx, staff, policy);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await recordPlatformAudit(tx, staff, {
        action: "subscription-policy.changed",
        targetType: "subscription_policy",
        targetId: "policy",
        before,
        after,
      });
    }
    return after;
  });
}
```

`packages/domain/src/platform/subscriptions.ts`:
```ts
// The console's changes to an organization's subscription (spec 7.2-7.4). Each runs in one platform transaction, and
// the subscriptions module records it in that organization's audit log under the platform admin's name.
import type {
  ChangePlanInput,
  EndAccessInput,
  RecordPaymentInput,
  SetOverridesInput,
  SetPaidThroughInput,
  SetTrialEndInput,
  SubscriptionDetails,
  SubscriptionPayment,
  VoidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import * as subscriptions from "../subscriptions/index.js";
import type { PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** An organization's subscription and its payments, newest first. */
export async function getSubscription(
  services: PlatformServices,
  organizationId: string,
): Promise<{ subscription: SubscriptionDetails; payments: SubscriptionPayment[] }> {
  return services.platformDb.transaction(async (tx) => ({
    subscription: await subscriptions.getSubscription(tx, organizationId),
    payments: await subscriptions.listPayments(tx, organizationId),
  }));
}

export async function changePlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: ChangePlanInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.changePlan(tx, staff, input));
}

export async function setOverrides(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setOverrides(tx, staff, input));
}

export async function setTrialEnd(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetTrialEndInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setTrialEnd(tx, staff, input));
}

export async function setPaidThrough(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetPaidThroughInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setPaidThrough(tx, staff, input));
}

export async function recordPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: RecordPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction((tx) => subscriptions.recordPayment(tx, staff, input));
}

export async function voidPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: VoidPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction((tx) => subscriptions.voidPayment(tx, staff, input));
}

export async function suspend(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.suspend(tx, staff, input));
}

export async function cancel(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.cancel(tx, staff, input));
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
export { createPlatformServices, type PlatformServices, type PlatformServicesOptions } from "./services.js";
```
with:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export {
  archivePlan,
  createPlan,
  getSubscriptionPolicy,
  listPlans,
  setSubscriptionPolicy,
  updatePlan,
} from "./plans.js";
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
export { createPlatformServices, type PlatformServices, type PlatformServicesOptions } from "./services.js";
export {
  cancel,
  changePlan,
  getSubscription,
  recordPayment,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  suspend,
  voidPayment,
} from "./subscriptions.js";
```

`packages/api/src/platform/routers/plans.ts`:
```ts
// The console's plans and subscription policy (spec 7.2, 7.3): all platform staff see them; super admins change them.
import {
  createPlanInput,
  listPlansInput,
  planIdInput,
  planSummary,
  setSubscriptionPolicyInput,
  subscriptionPolicy,
  updatePlanInput,
} from "@travel-crm/contracts/subscriptions";
import {
  archivePlan,
  createPlan,
  getSubscriptionPolicy,
  listPlans,
  setSubscriptionPolicy,
  updatePlan,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const plansRouter = platformT.router({
  list: staffProcedure
    .input(listPlansInput)
    .output(z.array(planSummary))
    .query(({ ctx, input }) => listPlans(ctx.services, input)),
  create: superAdminProcedure
    .input(createPlanInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => createPlan(ctx.services, ctx.staff, input)),
  update: superAdminProcedure
    .input(updatePlanInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => updatePlan(ctx.services, ctx.staff, input)),
  archive: superAdminProcedure
    .input(planIdInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => archivePlan(ctx.services, ctx.staff, input.planId)),
  /** How many days an organization stays past due, then read-only. */
  policy: staffProcedure.output(subscriptionPolicy).query(({ ctx }) => getSubscriptionPolicy(ctx.services)),
  setPolicy: superAdminProcedure
    .input(setSubscriptionPolicyInput)
    .output(subscriptionPolicy)
    .mutation(({ ctx, input }) => setSubscriptionPolicy(ctx.services, ctx.staff, input)),
});
```

`packages/api/src/platform/routers/subscriptions.ts`:
```ts
// The console's work on one organization's subscription (spec 7.2-7.4): its plan, dates, overrides, status by hand,
// and the payments recorded against it. Platform staff of either level.
import {
  changePlanInput,
  endAccessInput,
  organizationIdInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
  setTrialEndInput,
  subscriptionDetails,
  subscriptionPayment,
  subscriptionWithPayments,
  voidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import {
  cancel,
  changePlan,
  getSubscription,
  recordPayment,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  suspend,
  voidPayment,
} from "@travel-crm/domain/platform";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const subscriptionsRouter = platformT.router({
  get: staffProcedure
    .input(organizationIdInput)
    .output(subscriptionWithPayments)
    .query(({ ctx, input }) => getSubscription(ctx.services, input.organizationId)),
  changePlan: staffProcedure
    .input(changePlanInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => changePlan(ctx.services, ctx.staff, input)),
  setOverrides: staffProcedure
    .input(setOverridesInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setOverrides(ctx.services, ctx.staff, input)),
  setTrialEnd: staffProcedure
    .input(setTrialEndInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setTrialEnd(ctx.services, ctx.staff, input)),
  setPaidThrough: staffProcedure
    .input(setPaidThroughInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setPaidThrough(ctx.services, ctx.staff, input)),
  recordPayment: staffProcedure
    .input(recordPaymentInput)
    .output(subscriptionPayment)
    .mutation(({ ctx, input }) => recordPayment(ctx.services, ctx.staff, input)),
  voidPayment: staffProcedure
    .input(voidPaymentInput)
    .output(subscriptionPayment)
    .mutation(({ ctx, input }) => voidPayment(ctx.services, ctx.staff, input)),
  suspend: staffProcedure
    .input(endAccessInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => suspend(ctx.services, ctx.staff, input)),
  cancel: staffProcedure
    .input(endAccessInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => cancel(ctx.services, ctx.staff, input)),
});
```

In `packages/api/src/platform/platform-router.ts`:

replace:
```ts
import { staffProcedure } from "./procedures.js";
import { platformT } from "./trpc.js";
```
with:
```ts
import { staffProcedure } from "./procedures.js";
import { plansRouter } from "./routers/plans.js";
import { subscriptionsRouter } from "./routers/subscriptions.js";
import { platformT } from "./trpc.js";
```

replace:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  log: platformT.router({
```
with:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  plans: plansRouter,
  subscriptions: subscriptionsRouter,
  log: platformT.router({
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-plans.test.ts test/console-subscriptions.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/subscriptions.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/isolation.test.ts test/subscription-tables.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/plans.test.ts test/subscriptions/subscriptions.test.ts test/subscriptions/payments.test.ts`

Expected: PASS, 8 tests in 2 files (apps/api); 6 tests in 1 file (packages/contracts); 84 tests in 2 files (packages/db); 20 tests in 3 files (packages/domain).

- [ ] **Step 10: Record the decision**

`docs/adr/0019-plans-and-subscriptions.md`:
```markdown
# 0019: Plans, subscriptions and payments as data

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.2 and 7.4, and the data behind 7.3

## Decision

- **Plans are rows** (`plan`): a stable key, a name, INR prices in paise per month and per year (at least one), limits
  (seats, WhatsApp numbers, storage bytes) and the business modules they include (`crm`, `inbox`, `catalog`, `quotes`,
  `bookings`, `departures`, `suppliers`, `accounts`, `reports`). The Foundation's own features (staff, roles,
  settings, the audit log, documents) come with every plan. Super admins edit plans in the console; no code names one
  (Q4: prices are data).
- **One subscription per organization** (`subscription`, keyed by `organization_id`, under row-level security): its
  plan and billing cycle, status, when the status last changed, the trial's last day, the last day paid for, and the
  overrides of spec 7.2: extra seats, an agreed price, modules switched on early. Overrides double as feature flags
  (the pilot gets modules early this way).
- **Payments are recorded, not taken** (spec 7.4: billing is outside the product in Phase 1): `subscription_payment`
  holds the amount, the day it was paid, the day it pays through, a reference, and who recorded it. Recording one
  moves the paid-through day forward and, from today on, makes the organization active again. A mistaken payment is
  voided, never deleted.
- **Only the platform role writes these tables.** The api reads them for its request checks; the worker's lifecycle
  job may change a subscription's status and nothing else (column grants). The console's changes run in platform
  transactions and are recorded in the organization's own audit log under the platform admin's name; plan changes,
  which belong to no organization, go in the platform log.
- **Billing readiness (spec 7.4: "Razorpay Subscriptions webhooks update the same record later").** A subscription
  has a `provider_subscription_id`, and a payment a `provider` and `provider_payment_id`, unique per organization:
  `recordPayment(…, { provider: { provider: "razorpay", providerPaymentId } })` records a repeated webhook's payment
  once. The Razorpay provider itself (its `verify` with `hmacSha256Signature`, `identify` and `process`) comes with
  online billing; the Foundation ships no Razorpay code.

## Context

- **Why grants and not only code.** An organization's staff must never be able to give themselves seats or modules.
  Even a bug in the api, or SQL that slips past review, can't: `app_runtime` has no right to write these columns.
- **Why calendar dates.** "Paid through 31 October" is a day in the organization's time zone, not an instant; the
  console and the lifecycle job both read today in that zone.
- **Why a provider's payment id is unique per organization, not globally.** Every key on an organization's table
  includes `organization_id` (ADR 0002's key rule); a webhook's handler finds the organization first, from the
  provider's subscription.

## Consequences

- Adding a business module later means adding it to the module list (contracts and the table's check) and mapping
  its permissions to it (ADR 0020).
- Plan changes apply to every organization on the plan at once; a price agreed for one organization is its override.
```

`packages/domain/src/subscriptions/README.md`:
```markdown
# subscriptions

Plans, each organization's subscription, and the payments recorded against it (spec 7.2-7.4).

## Public functions and values (`index.ts`)

Every function takes a transaction. Writes need the platform role (the console runs them in a platform transaction,
naming the organization); under `app_runtime` they fail with "permission denied", whatever the code does.

- Plans: `createPlan(tx, input)`, `updatePlan(tx, input)` (returns `before` and `after`), `archivePlan(tx, planId)`
  (returns whether it changed), `listPlans(tx, { includeArchived })`, `findPlan(tx, planId)`.
- A subscription: `startSubscription(tx, by, input, now?)` (onboarding: a trial to its last day, or active and paid
  through a day), `getSubscription(tx, organizationId)`, `changePlan`, `setOverrides`, `setTrialEnd`,
  `setPaidThrough`, `suspend`, `cancel` (each `(tx, by, input, now?)`).
- Payments: `recordPayment(tx, by, input, { now?, provider? })`, `voidPayment(tx, by, input)`,
  `listPayments(tx, organizationId)`.
- The policy: `getSubscriptionPolicy(tx)`, `setSubscriptionPolicy(tx, by, policy)`.
- `by` is a `ConsoleActor`, `{ userId }`: the platform admin, or `null` for the platform's own jobs.

## Events

None. Every change to a subscription is recorded in its organization's audit log, entity `subscription`, the id the
organization's:

| Action                                 | Before                  | After                                                    |
| -------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `subscription.started`                 |                         | plan key, billing cycle, status, trial end, paid through |
| `subscription.plan-changed`            | plan key, billing cycle | plan key, billing cycle                                  |
| `subscription.overrides-changed`       | the three overrides     | the three overrides                                      |
| `subscription.trial-end-changed`       | trial end               | trial end                                                |
| `subscription.paid-through-changed`    | paid through, status    | paid through, status, reason                             |
| `subscription.payment-recorded`        | paid through, status    | payment id, amount, paid on, paid through, status        |
| `subscription.payment-voided`          |                         | payment id, amount, reason                               |
| `subscription.suspended`, `.cancelled` | status                  | status, reason                                           |

A platform admin is recorded under their own name with source `platform`; the platform's own jobs as the system.
Changing something to what it already is records nothing.

## Rules worth knowing

- Plans are data: no code names a plan. A plan's key never changes; an archived plan takes no new subscriptions, and
  organizations already on it keep it and get its changes at once.
- One subscription per organization, keyed by `organization_id`. A trial has its last day; dates are calendar days in
  the organization's time zone (`trialEndsOn`, `paidThrough`, a payment's `paidOn` and `paidThrough`).
- Paying through today or later makes an organization active again from any state, cancelled included; a day in the
  past changes no status. An older payment never moves `paidThrough` back.
- Every change locks the subscription row first (`FOR UPDATE`), so two changes, or a change and the lifecycle job,
  can't interleave.
- A provider's payment (Razorpay, later) carries its own id: `recordPayment` with `provider` finds a repeat by
  `(organization, provider, providerPaymentId)` and records nothing twice.
- Payments are never deleted: `voidPayment` marks one, and changes no dates.
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown

- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
```
with:
```markdown

- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
  `getSubscriptionPolicy(services)`, `setSubscriptionPolicy(services, staff, policy)`. Plans belong to no organization,
  so each change is recorded in the platform log.
- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
```

replace:
```markdown
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.
```
with:
```markdown
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- An organization's subscription: `getSubscription(services, organizationId)` (with its payments), and
  `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`, `voidPayment`, `suspend`, `cancel`
  `(services, staff, input)`, each one platform transaction, recorded in the organization's own audit log.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.
```

- [ ] **Step 11: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=157 api=4 brand=21 contracts=78 db=211 domain=451 eslint-config=81 integrations=141 (1,144). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-subscriptions
git add apps/api/test/console-plans.test.ts apps/api/test/console-subscriptions.test.ts docs/adr/0019-plans-and-subscriptions.md packages/api/src/platform/platform-router.ts packages/api/src/platform/routers/plans.ts packages/api/src/platform/routers/subscriptions.ts packages/contracts/src/subscriptions/index.ts packages/contracts/src/subscriptions/plans.ts packages/contracts/src/subscriptions/subscriptions.ts packages/contracts/test/subscriptions/subscriptions.test.ts packages/db/prisma/migrations/20261016100000_subscriptions/migration.sql packages/db/prisma/schema/organization.prisma packages/db/prisma/schema/subscriptions.prisma packages/db/test/isolation.test.ts packages/db/test/org-table-fixture.ts packages/db/test/org-table-fixtures/subscriptions.ts packages/db/test/subscription-tables.test.ts packages/domain/src/platform/README.md packages/domain/src/platform/index.ts packages/domain/src/platform/plans.ts packages/domain/src/platform/subscriptions.ts packages/domain/src/subscriptions/README.md packages/domain/src/subscriptions/console-actor.ts packages/domain/src/subscriptions/dates.ts packages/domain/src/subscriptions/index.ts packages/domain/src/subscriptions/payments.ts packages/domain/src/subscriptions/plans.ts packages/domain/src/subscriptions/policy.ts packages/domain/src/subscriptions/rows.ts packages/domain/src/subscriptions/subscriptions.ts packages/domain/test/subscriptions/payments.test.ts packages/domain/test/subscriptions/plans.test.ts packages/domain/test/subscriptions/subscriptions.test.ts packages/domain/test/subscriptions/test-subscriptions.ts
git commit -m "feat: keep plans, subscriptions and payments as data the platform console edits"
```

---
### Task S2: The lifecycle, and what each organization may use today

Spec 7.3's lifecycle, on calendar days in the organization's own zone: after a trial or a paid period ends the
organization is past due, after the policy's past-due days read-only, after its read-only days suspended; a person
cancels, and a person ends a suspension (by recording a payment, which makes it active from any state). `dueState`
computes where a stored state has got to today, catching up every missed step, each counted from the day the one
before began; the request checks use it, so the daily job running late never grants access. The daily job,
`advanceSubscriptions`, writes the due state down as the runtime role (its one write grant), only if the row is
still as it read it, so a change from the console in the meantime wins. `entitlementsOf` is what a request reads:
the plan with its overrides and the state due today. `assertLifecycleAllows` and `assertModulesOnPlan` are request
checks 2 and 3 as pure rules; Task S3 calls them.

**Files:**
- Create: `docs/adr/0020-lifecycle-and-request-checks.md`, `packages/domain/src/subscriptions/advance.ts`, `packages/domain/src/subscriptions/entitlements.ts`, `packages/domain/src/subscriptions/lifecycle.ts`, `packages/domain/src/subscriptions/request-rules.ts`
- Modify: `packages/contracts/src/subscriptions/subscriptions.ts`, `packages/domain/src/kernel/README.md`, `packages/domain/src/kernel/index.ts`, `packages/domain/src/kernel/time.ts`, `packages/domain/src/subscriptions/README.md`, `packages/domain/src/subscriptions/index.ts`
- Test: `packages/domain/test/kernel/time.test.ts`, `packages/domain/test/subscriptions/advance.test.ts`, `packages/domain/test/subscriptions/entitlements.test.ts`, `packages/domain/test/subscriptions/lifecycle.test.ts`, `packages/domain/test/subscriptions/request-rules.test.ts`

**Interfaces:**
- Consumes (Task S1): the subscription tables, `getSubscriptionPolicy`, `fromDateColumn`, `statusOf`, `modulesOf`;
  plan 3's `calendarDateIn`, `startOfDayIn`, `CalendarDate`, `organizationTimeZone`, `moduleOf` and the permission
  catalog.
- Produces:
  - The kernel: `addDays(date: CalendarDate, days: number): CalendarDate`.
  - `@travel-crm/contracts/subscriptions`: `lifecycleAccess` (`full`, `read_only`, `export_only`, `locked`) and
    `subscriptionOverview` (`{ status, access, planName, modules, trialEndsOn, paidThrough, nextChangeOn, limits:
    { seats, whatsappNumbers, storageBytes } }`), what `subscription.get` returns.
  - `@travel-crm/domain/subscriptions`: `LifecycleState` (`{ status, since, trialEndsOn, paidThrough }`),
    `nextStep(state, policy)` (`{ status, on } | null`), `dueState(state, policy, today)`; `Entitlements`,
    `entitlementsOf(tx, organizationId, now)`, `lifecycleAccessOf(status)`, `overviewOf(entitlements)`,
    `SubscriptionAccess` (`{ entitlementsOf(organizationId) }`) and `createSubscriptionAccess({ db, now? })`;
    `advanceSubscription(tx, organizationId, now)`, `advanceSubscriptions({ db, organizationIds, now?, onError? })`,
    `StatusChange`; `CallKind` (`view`, `change`, `export`, `always`), `assertLifecycleAllows(entitlements, { kind,
    isOwner })` (refusals `NO_SUBSCRIPTION`, `ORGANIZATION_READ_ONLY`, `ORGANIZATION_SUSPENDED`,
    `ORGANIZATION_CANCELLED`), `planModuleOf(permissionModule)` (`leads` is `crm`; the Foundation's own modules are on
    every plan) and `assertModulesOnPlan(entitlements, permissionModules)` (`FEATURE_LOCKED`, `MODULE_NOT_ON_PLAN`).

- [ ] **Step 1: Write the failing tests**

In `packages/domain/test/kernel/time.test.ts`:

replace:
```ts
import { describe, expect, it } from "vitest";
import { calendarDateIn, formatDateTime, parseCalendarDate, startOfDayIn, yearIn } from "../../src/kernel/index.js";
```
with:
```ts
import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDateIn,
  formatDateTime,
  parseCalendarDate,
  startOfDayIn,
  yearIn,
} from "../../src/kernel/index.js";
```

replace:
```ts
    }
  });
```
with:
```ts
    }
  });

  it("add days across month ends, leap days and years, and back", () => {
    expect(addDays(parseCalendarDate("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(parseCalendarDate("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(parseCalendarDate("2026-12-25"), 14)).toBe("2027-01-08");
    expect(addDays(parseCalendarDate("2026-03-01"), -1)).toBe("2026-02-28");
    expect(() => addDays(parseCalendarDate("2026-03-01"), 1.5)).toThrow(RangeError);
  });
```

`packages/domain/test/subscriptions/lifecycle.test.ts`:
```ts
// The lifecycle's rules (spec 7.3) on calendar days: a trial or a paid period ends, then 7 days past due, 14 read-only,
// then suspended until a person acts, however long ago the daily job last ran.
import { describe, expect, it } from "vitest";
import { parseCalendarDate as day } from "../../src/kernel/index.js";
import { dueState, nextStep, type LifecycleState } from "../../src/subscriptions/index.js";

const policy = { pastDueDays: 7, readOnlyDays: 14 };
const state = (fields: Partial<LifecycleState>): LifecycleState => ({
  status: "active",
  since: day("2026-01-01"),
  trialEndsOn: null,
  paidThrough: null,
  ...fields,
});

describe("the subscription lifecycle", () => {
  it("is past due the day after a trial or a paid period ends", () => {
    expect(nextStep(state({ status: "trial", trialEndsOn: day("2026-10-30") }), policy)).toEqual({
      status: "past_due",
      on: "2026-10-31",
    });
    expect(nextStep(state({ paidThrough: day("2026-10-31") }), policy)).toEqual({
      status: "past_due",
      on: "2026-11-01",
    });
  });

  it("is past due for the policy's days, then read-only for its days, then suspended", () => {
    const pastDue = state({ status: "past_due", since: day("2026-11-01") });
    expect(nextStep(pastDue, policy)).toEqual({ status: "read_only", on: "2026-11-08" });
    expect(dueState(pastDue, policy, day("2026-11-07")).status).toBe("past_due");
    expect(dueState(pastDue, policy, day("2026-11-08"))).toMatchObject({ status: "read_only", since: "2026-11-08" });
    const readOnly = state({ status: "read_only", since: day("2026-11-08") });
    expect(nextStep(readOnly, policy)).toEqual({ status: "suspended", on: "2026-11-22" });
    expect(nextStep(readOnly, { pastDueDays: 7, readOnlyDays: 30 })).toEqual({ status: "suspended", on: "2026-12-08" });
  });

  it("leaves suspended and cancelled to a person", () => {
    expect(nextStep(state({ status: "suspended" }), policy)).toBeNull();
    expect(nextStep(state({ status: "cancelled" }), policy)).toBeNull();
    expect(dueState(state({ status: "cancelled" }), policy, day("2030-01-01")).status).toBe("cancelled");
  });

  it("catches up every missed step, each counted from the day the one before began", () => {
    const paidToAugust = state({ paidThrough: day("2026-08-31"), since: day("2026-08-01") });
    expect(dueState(paidToAugust, policy, day("2026-10-16"))).toEqual({
      status: "suspended",
      since: "2026-09-22",
      trialEndsOn: null,
      paidThrough: "2026-08-31",
    });
  });

  it("stays put while the paid period lasts, and has no next step without a paid-through day", () => {
    const paid = state({ paidThrough: day("2026-12-31") });
    expect(dueState(paid, policy, day("2026-12-31"))).toEqual(paid);
    expect(nextStep(state({}), policy)).toBeNull();
  });
});
```

`packages/domain/test/subscriptions/entitlements.test.ts`:
```ts
// What an organization may use today (spec 7.2): its plan's modules and limits plus its overrides, and its lifecycle
// state as of today in its own time zone, even before the daily job records it.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSubscriptionAccess, overviewOf, setOverrides } from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const october16 = new Date("2026-10-16T06:00:00Z");

describe("entitlements", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test, { name: "Starter", seatLimit: 5, modules: ["crm"] });
  });

  afterAll(async () => {
    await test.close();
  });

  const accessAt = (now: Date) => createSubscriptionAccess({ db: test.db, now: () => now });

  it("are the plan's modules and limits, plus the overrides", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-10-31" },
      { now: october16 },
    );
    await test.platformDb.transaction((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: null, extraModules: ["quotes"] }),
    );
    const entitlements = await accessAt(october16).entitlementsOf(organizationId);
    expect(entitlements && overviewOf(entitlements)).toEqual({
      status: "active",
      access: "full",
      planName: "Starter",
      modules: ["crm", "quotes"],
      trialEndsOn: null,
      paidThrough: "2026-10-31",
      nextChangeOn: "2026-11-01",
      limits: { seats: 7, whatsappNumbers: 1, storageBytes: 5_000_000_000 },
    });
  });

  it("count the lifecycle up to today, before the daily job has recorded it", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-10-31" },
      { now: october16 },
    );
    // Seven days past due, read-only from 8 November.
    expect(await accessAt(new Date("2026-11-07T06:00:00Z")).entitlementsOf(organizationId)).toMatchObject({
      status: "past_due",
      access: "full",
      nextChangeOn: "2026-11-08",
    });
    expect(await accessAt(new Date("2026-11-08T06:00:00Z")).entitlementsOf(organizationId)).toMatchObject({
      status: "read_only",
      access: "read_only",
      nextChangeOn: "2026-11-22",
    });
  });

  it("turn over at midnight in the organization's own time zone", async () => {
    const trialToOctober16 = { trialEndsOn: "2026-10-16", paidThrough: null };
    const india = await createSubscribedOrganization(test, plan, trialToOctober16, { now: october16 });
    const london = await createSubscribedOrganization(test, plan, trialToOctober16, {
      now: october16,
      timeZone: "Europe/London",
    });
    // 00:30 on 17 October in India; 19:00 on the 16th in London.
    const justAfterMidnightInIndia = accessAt(new Date("2026-10-16T19:00:00Z"));
    expect(await justAfterMidnightInIndia.entitlementsOf(india)).toMatchObject({ status: "past_due" });
    expect(await justAfterMidnightInIndia.entitlementsOf(london)).toMatchObject({ status: "trial" });
  });

  it("are null for an organization without a subscription", async () => {
    const organizationId = await createTestOrganization(test.platform, "Unsubscribed");
    expect(await accessAt(october16).entitlementsOf(organizationId)).toBeNull();
  });
});
```

`packages/domain/test/subscriptions/advance.test.ts`:
```ts
// The daily lifecycle job (spec 7.3): it records each subscription where its unpaid days have taken it, by the
// system, once; it catches up missed days; a console change made meanwhile wins; one organization's failure stops no
// other.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceSubscriptions, getSubscription } from "../../src/subscriptions/index.js";
import {
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const started = new Date("2026-08-01T06:00:00Z");

describe("the lifecycle job", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const subscriptionOf = (organizationId: string) =>
    test.platformDb.transaction((tx) => getSubscription(tx, organizationId));

  it("moves an ended trial to past due, by the system, and finds nothing more to do on a second run", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { trialEndsOn: "2026-10-15", paidThrough: null },
      {
        now: started,
      },
    );
    const now = new Date("2026-10-16T06:00:00Z");
    expect(await advanceSubscriptions({ db: test.db, organizationIds: [organizationId], now })).toEqual([
      { organizationId, from: "trial", to: "past_due", since: "2026-10-16" },
    ]);
    expect(await advanceSubscriptions({ db: test.db, organizationIds: [organizationId], now })).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "past_due",
      // Midnight on 16 October in India: the day the state began.
      statusChangedAt: "2026-10-15T18:30:00.000Z",
    });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.status-changed",
      source: "job",
      actorUserId: null,
      before: { status: "trial" },
      after: { status: "past_due", since: "2026-10-16" },
    });
  });

  it("catches up when it hasn't run for weeks, counting each state from the day it was due", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    const [change] = await advanceSubscriptions({
      db: test.db,
      organizationIds: [organizationId],
      now: new Date("2026-10-16T06:00:00Z"),
    });
    expect(change).toEqual({ organizationId, from: "active", to: "suspended", since: "2026-09-22" });
  });

  it("leaves a subscription the console changed meanwhile as the console left it", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holderPid: (pid: number) => void = () => undefined;
    const holding = new Promise<number>((resolve) => (holderPid = resolve));
    // A payment recorded in the console: it holds the subscription while the job tries to move it.
    const paying = test.platformDb.transaction(async (tx) => {
      const [session] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT 1 FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
      holderPid(session?.pid ?? 0);
      await released;
      await tx.subscription.update({
        where: { organizationId },
        data: { paidThrough: new Date("2026-12-31"), status: "active", statusChangedAt: new Date() },
      });
    });
    const pid = await holding;
    const job = advanceSubscriptions({
      db: test.db,
      organizationIds: [organizationId],
      now: new Date("2026-10-16T06:00:00Z"),
    });
    await waitUntilBlockedBy(pid);
    release();
    await paying;
    expect(await job).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({ status: "active", paidThrough: "2026-12-31" });
  });

  /** Waits until some statement waits for a lock the backend `pid` holds: the job has read the old row by then. */
  async function waitUntilBlockedBy(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const [row] = await test.platform.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted AND ${pid}::int = ANY (pg_blocking_pids(pid))`;
      if ((row?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("The job never waited for the console's change");
  }

  it("goes on past an organization it can't advance, reporting it by id", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-09-30" },
      { now: started },
    );
    const failed: string[] = [];
    const changes = await advanceSubscriptions({
      db: test.db,
      organizationIds: ["not-an-organization", organizationId],
      now: new Date("2026-10-02T06:00:00Z"),
      onError: (_error, failedId) => failed.push(failedId),
    });
    expect(failed).toEqual(["not-an-organization"]);
    expect(changes).toEqual([{ organizationId, from: "active", to: "past_due", since: "2026-10-01" }]);
  });
});
```

`packages/domain/test/subscriptions/request-rules.test.ts`:
```ts
// Request checks 2 and 3 (spec 6.5, 7.3): which calls each lifecycle state allows, and which plan module each of the
// catalog's permissions needs.
import { describe, expect, it } from "vitest";
import { moduleOf, permissions } from "../../src/identity/index.js";
import {
  assertLifecycleAllows,
  assertModulesOnPlan,
  lifecycleAccessOf,
  planModuleOf,
  type CallKind,
  type Entitlements,
} from "../../src/subscriptions/index.js";
import type { SubscriptionStatus } from "@travel-crm/contracts/subscriptions";

const entitlements = (status: SubscriptionStatus, modules: Entitlements["modules"] = new Set()): Entitlements => ({
  status,
  access: lifecycleAccessOf(status),
  planName: "Starter",
  modules,
  limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
});

/** The domain error's code and reason when check() refuses, or "allowed". */
function refusal(check: () => void): string {
  try {
    check();
    return "allowed";
  } catch (error) {
    const { code, reason } = error as { code: string; reason: string };
    return `${code} ${reason}`;
  }
}

/** The reason a call is refused with, or "allowed". */
function outcome(status: SubscriptionStatus, kind: CallKind, isOwner = false): string {
  return refusal(() => {
    assertLifecycleAllows(entitlements(status), { kind, isOwner });
  }).replace(/^FORBIDDEN /, "");
}

describe("request check 2: the organization's lifecycle state", () => {
  it("allows everything while on trial, active or past due", () => {
    for (const status of ["trial", "active", "past_due"] as const) {
      expect([outcome(status, "view"), outcome(status, "change"), outcome(status, "export")]).toEqual([
        "allowed",
        "allowed",
        "allowed",
      ]);
    }
  });

  it("allows views and exports, not changes, while read-only", () => {
    expect([outcome("read_only", "view"), outcome("read_only", "export"), outcome("read_only", "change")]).toEqual([
      "allowed",
      "allowed",
      "ORGANIZATION_READ_ONLY",
    ]);
  });

  it("allows only the Owner's exports while suspended", () => {
    expect(outcome("suspended", "export", true)).toBe("allowed");
    expect([outcome("suspended", "export"), outcome("suspended", "view", true)]).toEqual([
      "ORGANIZATION_SUSPENDED",
      "ORGANIZATION_SUSPENDED",
    ]);
  });

  it("allows nothing once cancelled, and nothing without a subscription, but what every state allows", () => {
    expect(outcome("cancelled", "export", true)).toBe("ORGANIZATION_CANCELLED");
    expect(outcome("cancelled", "always")).toBe("allowed");
    expect(
      refusal(() => {
        assertLifecycleAllows(null, { kind: "view", isOwner: true });
      }),
    ).toBe("FORBIDDEN NO_SUBSCRIPTION");
    expect(
      refusal(() => {
        assertLifecycleAllows(null, { kind: "always", isOwner: false });
      }),
    ).toBe("allowed");
  });
});

describe("request check 3: the module on the plan", () => {
  it("knows the plan module of every permission in the catalog, the Foundation's own being on every plan", () => {
    for (const permission of permissions) {
      expect(() => planModuleOf(moduleOf(permission)), permission).not.toThrow();
    }
    expect(planModuleOf(moduleOf("leads:create"))).toBe("crm");
    expect(planModuleOf(moduleOf("staff:manage"))).toBeNull();
    expect(() => planModuleOf("teleport")).toThrow(/No plan module/);
  });

  it("refuses a permission whose module is off the plan, naming the module", () => {
    const starter = entitlements("active", new Set(["crm"]));
    const onPlan = (permissionModules: string[], plan: Entitlements | null = starter) =>
      refusal(() => {
        assertModulesOnPlan(plan, permissionModules);
      });
    expect(onPlan(["leads", "staff"])).toBe("allowed");
    expect(onPlan(["bookings"])).toBe("FEATURE_LOCKED MODULE_NOT_ON_PLAN");
    expect(() => {
      assertModulesOnPlan(starter, ["bookings", "accounts"]);
    }).toThrow("Not on this organization's plan: bookings, accounts");
    expect(onPlan(["leads"], null)).toBe("FEATURE_LOCKED MODULE_NOT_ON_PLAN");
    expect(onPlan(["roles"], null)).toBe("allowed");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/kernel/time.test.ts test/subscriptions/lifecycle.test.ts test/subscriptions/entitlements.test.ts test/subscriptions/advance.test.ts test/subscriptions/request-rules.test.ts`

Expected: FAIL: 20 of 34 tests. `TypeError: addDays is not a function`, `nextStep is not a function`, `dueState is not
a function`, `createSubscriptionAccess is not a function`, `advanceSubscriptions is not a function`,
`lifecycleAccessOf is not a function`, and the request rules' `assertLifecycleAllows` and `planModuleOf` are missing.

- [ ] **Step 3: Count days, and describe what staff see**

In `packages/domain/src/kernel/time.ts`:

replace:
```ts

/** The day it is in timeZone at instant: at 18:30 UTC it is already tomorrow in India. */
```
with:
```ts

/** The calendar date `days` days after date (before it, for a negative number). Days have no time zone. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  if (!Number.isSafeInteger(days)) throw new RangeError(`Days to add must be a whole number, got ${String(days)}`);
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10) as CalendarDate;
}

/** The day it is in timeZone at instant: at 18:30 UTC it is already tomorrow in India. */
```

In `packages/domain/src/kernel/index.ts`:

replace:
```ts
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
export { calendarDateIn, formatDateTime, parseCalendarDate, startOfDayIn, yearIn, type CalendarDate } from "./time.js";
export { isUuid } from "./uuid.js";
```
with:
```ts
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
export {
  addDays,
  calendarDateIn,
  formatDateTime,
  parseCalendarDate,
  startOfDayIn,
  yearIn,
  type CalendarDate,
} from "./time.js";
export { isUuid } from "./uuid.js";
```

In `packages/contracts/src/subscriptions/subscriptions.ts`:

replace:
```ts
export type SubscriptionWithPayments = z.infer<typeof subscriptionWithPayments>;
```
with:
```ts
export type SubscriptionWithPayments = z.infer<typeof subscriptionWithPayments>;

/**
 * What an organization's subscription lets its staff do (spec 7.3): everything; view and export only; only the Owner,
 * only exports and paying; nothing.
 */
export const lifecycleAccess = z.enum(["full", "read_only", "export_only", "locked"]);
export type LifecycleAccess = z.infer<typeof lifecycleAccess>;

/**
 * What subscription.get tells an organization's staff about their own subscription, in every state: the banner, and
 * which modules the app shows. Dates are calendar days in the organization's time zone.
 */
export const subscriptionOverview = z.object({
  status: subscriptionStatus,
  access: lifecycleAccess,
  planName: z.string(),
  modules: z.array(planModule),
  trialEndsOn: calendarDate.nullable(),
  paidThrough: calendarDate.nullable(),
  /** The day the status moves on if nothing is paid, e.g. from past due to read-only; null when it won't. */
  nextChangeOn: calendarDate.nullable(),
  limits: z.object({ seats: z.int(), whatsappNumbers: z.int(), storageBytes: z.int() }),
});
export type SubscriptionOverview = z.infer<typeof subscriptionOverview>;
```

- [ ] **Step 4: Write the lifecycle, the entitlements, the daily job and the request rules**

`packages/domain/src/subscriptions/lifecycle.ts`:
```ts
// The subscription lifecycle (spec 7.3): trial or active, then past due, read-only and suspended as unpaid days pass,
// each for the policy's number of days; cancelled, and suspended for good, only by a person. Pure rules on calendar
// days in the organization's time zone, used by the request checks and the daily job alike.
import type { SubscriptionPolicy, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { addDays, type CalendarDate } from "../kernel/index.js";

/** What the lifecycle reads of a subscription. */
export interface LifecycleState {
  status: SubscriptionStatus;
  /** The first day of the current status. */
  since: CalendarDate;
  trialEndsOn: CalendarDate | null;
  paidThrough: CalendarDate | null;
}

/** The state a subscription moves to if nothing is paid, and its first day; null when only a person moves it on. */
export function nextStep(
  state: LifecycleState,
  policy: SubscriptionPolicy,
): { status: SubscriptionStatus; on: CalendarDate } | null {
  switch (state.status) {
    case "trial":
      return state.trialEndsOn ? { status: "past_due", on: addDays(state.trialEndsOn, 1) } : null;
    case "active":
      return state.paidThrough ? { status: "past_due", on: addDays(state.paidThrough, 1) } : null;
    case "past_due":
      return { status: "read_only", on: addDays(state.since, policy.pastDueDays) };
    case "read_only":
      return { status: "suspended", on: addDays(state.since, policy.readOnlyDays) };
    case "suspended":
    case "cancelled":
      return null;
  }
}

/**
 * Where the lifecycle has got to by today: every step whose first day has come, in order, each counted from the day
 * the one before it began. So the state is right however long ago the daily job last ran.
 */
export function dueState(state: LifecycleState, policy: SubscriptionPolicy, today: CalendarDate): LifecycleState {
  let current = state;
  for (let next = nextStep(current, policy); next !== null && next.on <= today; next = nextStep(current, policy)) {
    current = { ...current, status: next.status, since: next.on };
  }
  return current;
}
```

`packages/domain/src/subscriptions/entitlements.ts`:
```ts
// What an organization may use today (spec 7.2): its plan plus its overrides, and how far its lifecycle has got. Read
// on every request by the api's checks 2 and 3, under the organization's row-level security.
import type {
  LifecycleAccess,
  PlanModule,
  SubscriptionOverview,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import type { Database, OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, type CalendarDate } from "../kernel/index.js";
import { fromDateColumn } from "./dates.js";
import { dueState, nextStep, type LifecycleState } from "./lifecycle.js";
import { getSubscriptionPolicy } from "./policy.js";
import { modulesOf, statusOf } from "./rows.js";

export interface Entitlements {
  /** Where the lifecycle has got to today, even before the daily job records it. */
  status: SubscriptionStatus;
  access: LifecycleAccess;
  planName: string;
  /** The plan's modules and those switched on early. */
  modules: ReadonlySet<PlanModule>;
  /** Seats include the extra ones. */
  limits: { seats: number; whatsappNumbers: number; storageBytes: number };
  trialEndsOn: CalendarDate | null;
  paidThrough: CalendarDate | null;
  nextChangeOn: CalendarDate | null;
}

/** What staff may do in each state (spec 7.3). */
export function lifecycleAccessOf(status: SubscriptionStatus): LifecycleAccess {
  switch (status) {
    case "trial":
    case "active":
    case "past_due":
      return "full";
    case "read_only":
      return "read_only";
    case "suspended":
      return "export_only";
    case "cancelled":
      return "locked";
  }
}

/** The organization's entitlements at `now`, or null when it has no subscription. */
export async function entitlementsOf(tx: OrgTx, organizationId: string, now: Date): Promise<Entitlements | null> {
  const row = await tx.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
  if (!row) return null;
  const timeZone = await organizationTimeZone(tx, organizationId);
  const policy = await getSubscriptionPolicy(tx);
  const stored: LifecycleState = {
    status: statusOf(row.status),
    since: calendarDateIn(row.statusChangedAt, timeZone),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
  };
  const state = dueState(stored, policy, calendarDateIn(now, timeZone));
  return {
    status: state.status,
    access: lifecycleAccessOf(state.status),
    planName: row.plan.name,
    modules: new Set([...modulesOf(row.plan.modules), ...modulesOf(row.extraModules)]),
    limits: {
      seats: row.plan.seatLimit + row.extraSeats,
      whatsappNumbers: row.plan.whatsappNumberLimit,
      storageBytes: Number(row.plan.storageLimitBytes),
    },
    trialEndsOn: state.trialEndsOn,
    paidThrough: state.paidThrough,
    nextChangeOn: nextStep(state, policy)?.on ?? null,
  };
}

/** What subscription.get shows staff about their own subscription. */
export function overviewOf(entitlements: Entitlements): SubscriptionOverview {
  return {
    status: entitlements.status,
    access: entitlements.access,
    planName: entitlements.planName,
    modules: [...entitlements.modules].sort(),
    trialEndsOn: entitlements.trialEndsOn,
    paidThrough: entitlements.paidThrough,
    nextChangeOn: entitlements.nextChangeOn,
    limits: entitlements.limits,
  };
}

/** The api's view of subscriptions: one read per request, in the organization's own transaction. */
export interface SubscriptionAccess {
  entitlementsOf(organizationId: string): Promise<Entitlements | null>;
}

export function createSubscriptionAccess(dependencies: {
  db: Pick<Database, "forOrg">;
  /** The time now; tests pass a fixed one. */
  now?: () => Date;
}): SubscriptionAccess {
  const now = dependencies.now ?? (() => new Date());
  return {
    entitlementsOf: (organizationId) =>
      dependencies.db.forOrg(organizationId, (tx) => entitlementsOf(tx, organizationId, now())),
  };
}
```

`packages/domain/src/subscriptions/advance.ts`:
```ts
// The daily lifecycle job (spec 7.3): records each organization's subscription as far as its unpaid days have taken
// it. The request checks already compute the state on every request; this writes it down and logs each change.
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, startOfDayIn, systemActor } from "../kernel/index.js";
import { fromDateColumn } from "./dates.js";
import { dueState } from "./lifecycle.js";
import { getSubscriptionPolicy } from "./policy.js";
import { statusOf } from "./rows.js";

/** A status the job moved, and the day the new one began. */
export interface StatusChange {
  organizationId: string;
  from: string;
  to: string;
  since: string;
}

/**
 * Moves one organization's subscription to where it is due today, as the runtime role inside its forOrg(). Writes only
 * if the subscription is still as it was read: a change from the console in the meantime wins, and the next run looks
 * again. Recorded as "subscription.status-changed" by the system. Returns null when nothing moved.
 */
export async function advanceSubscription(tx: OrgTx, organizationId: string, now: Date): Promise<StatusChange | null> {
  const row = await tx.subscription.findUnique({ where: { organizationId } });
  if (!row) return null;
  const timeZone = await organizationTimeZone(tx, organizationId);
  const stored = {
    status: statusOf(row.status),
    since: calendarDateIn(row.statusChangedAt, timeZone),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
  };
  const due = dueState(stored, await getSubscriptionPolicy(tx), calendarDateIn(now, timeZone));
  if (due.status === stored.status) return null;
  const { count } = await tx.subscription.updateMany({
    where: { organizationId, status: row.status, statusChangedAt: row.statusChangedAt },
    // The day the state began, not the day the job noticed: days in a state count from when it was due.
    data: { status: due.status, statusChangedAt: startOfDayIn(due.since, timeZone) },
  });
  if (count === 0) return null;
  await recordAudit(tx, systemActor(organizationId), {
    action: "subscription.status-changed",
    entityType: "subscription",
    entityId: organizationId,
    before: { status: stored.status },
    after: { status: due.status, since: due.since },
  });
  return { organizationId, from: stored.status, to: due.status, since: due.since };
}

/**
 * The job: each organization in its own transaction, so one that fails (its error goes to onError, ids only) doesn't
 * stop the rest. Safe to run twice: a second run finds nothing due.
 */
export async function advanceSubscriptions(dependencies: {
  db: Pick<Database, "forOrg">;
  organizationIds: readonly string[];
  now?: Date;
  onError?: (error: unknown, organizationId: string) => void;
}): Promise<StatusChange[]> {
  const now = dependencies.now ?? new Date();
  const changes: StatusChange[] = [];
  for (const organizationId of dependencies.organizationIds) {
    try {
      const change = await dependencies.db.forOrg(organizationId, (tx) => advanceSubscription(tx, organizationId, now));
      if (change) changes.push(change);
    } catch (error) {
      dependencies.onError?.(error, organizationId);
    }
  }
  return changes;
}
```

`packages/domain/src/subscriptions/request-rules.ts`:
```ts
// Request checks 2 and 3 of spec 6.5: the organization's lifecycle state allows the call, and the modules the call's
// permissions belong to are on its plan. The api applies them in its procedure builders.
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "../kernel/index.js";
import type { Entitlements } from "./entitlements.js";

/**
 * What a call does, for the lifecycle: reads, changes, exports, or something every state allows (me.get and the
 * subscription's own status, so the app can say why the rest is refused).
 */
export type CallKind = "view" | "change" | "export" | "always";

/** Check 2 (spec 7.3): read-only allows views and exports; suspended only the Owner's exports; cancelled nothing. */
export function assertLifecycleAllows(
  entitlements: Entitlements | null,
  call: { kind: CallKind; isOwner: boolean },
): void {
  if (call.kind === "always") return;
  if (!entitlements) {
    throw new DomainError("FORBIDDEN", "NO_SUBSCRIPTION", "This organization has no subscription");
  }
  switch (entitlements.access) {
    case "full":
      return;
    case "read_only":
      if (call.kind !== "change") return;
      throw new DomainError("FORBIDDEN", "ORGANIZATION_READ_ONLY", "This organization is read-only until it pays");
    case "export_only":
      if (call.kind === "export" && call.isOwner) return;
      throw new DomainError("FORBIDDEN", "ORGANIZATION_SUSPENDED", "This organization is suspended until it pays");
    case "locked":
      throw new DomainError("FORBIDDEN", "ORGANIZATION_CANCELLED", "This organization's subscription has ended");
  }
}

/**
 * The plan module each permission module belongs to; null for the Foundation's own, which every plan includes. A
 * module missing here throws: plan-modules.test.ts checks every permission in the catalog has one.
 */
const planModuleByPermissionModule = new Map<string, PlanModule | null>([
  ["staff", null],
  ["roles", null],
  ["settings", null],
  ["audit", null],
  ["money", null],
  ["documents", null],
  ["leads", "crm"],
  ["quotes", "quotes"],
  ["bookings", "bookings"],
  ["departures", "departures"],
  ["suppliers", "suppliers"],
  ["accounts", "accounts"],
]);

export function planModuleOf(permissionModule: string): PlanModule | null {
  const planModule = planModuleByPermissionModule.get(permissionModule);
  if (planModule === undefined) throw new Error(`No plan module is set for permissions of ${permissionModule}`);
  return planModule;
}

/** Check 3: every module the permissions belong to is on the plan, or switched on early. */
export function assertModulesOnPlan(entitlements: Entitlements | null, permissionModules: readonly string[]): void {
  const missing = permissionModules
    .map(planModuleOf)
    .filter((planModule): planModule is PlanModule => planModule !== null && !entitlements?.modules.has(planModule));
  if (missing.length > 0) {
    throw new DomainError(
      "FEATURE_LOCKED",
      "MODULE_NOT_ON_PLAN",
      `Not on this organization's plan: ${missing.join(", ")}`,
    );
  }
}
```

In `packages/domain/src/subscriptions/index.ts`:

replace:
```ts
// Public API of the subscriptions module: plans, each organization's subscription and payments (spec 7.2-7.4).
export type { ConsoleActor } from "./console-actor.js";
export { listPayments, recordPayment, voidPayment, type ProviderPayment } from "./payments.js";
```
with:
```ts
// Public API of the subscriptions module: plans, each organization's subscription and payments (spec 7.2-7.4), the
// lifecycle (7.3), and what an organization may use, for the api's request checks 2 and 3 (spec 6.5).
export { advanceSubscription, advanceSubscriptions, type StatusChange } from "./advance.js";
export type { ConsoleActor } from "./console-actor.js";
export {
  createSubscriptionAccess,
  entitlementsOf,
  lifecycleAccessOf,
  overviewOf,
  type Entitlements,
  type SubscriptionAccess,
} from "./entitlements.js";
export { dueState, nextStep, type LifecycleState } from "./lifecycle.js";
export { listPayments, recordPayment, voidPayment, type ProviderPayment } from "./payments.js";
```

replace:
```ts
export { getSubscriptionPolicy, setSubscriptionPolicy } from "./policy.js";
export {
```
with:
```ts
export { getSubscriptionPolicy, setSubscriptionPolicy } from "./policy.js";
export { assertLifecycleAllows, assertModulesOnPlan, planModuleOf, type CallKind } from "./request-rules.js";
export {
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/kernel/time.test.ts test/subscriptions/lifecycle.test.ts test/subscriptions/entitlements.test.ts test/subscriptions/advance.test.ts test/subscriptions/request-rules.test.ts`

Expected: PASS, 34 tests in 5 files (packages/domain).

- [ ] **Step 6: Record the decision**

`docs/adr/0020-lifecycle-and-request-checks.md`:
```markdown
# 0020: The subscription lifecycle, and request checks 2 and 3

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.3 and 6.5 (checks 2 and 3)

## Decision

- **The lifecycle is rules on calendar days.** A trial or a paid period ends; the next day the organization is past
  due; after the policy's past-due days (7) it is read-only; after its read-only days (14) suspended. A person cancels,
  and a person ends a suspension, by recording a payment or giving time (ADR 0019). The days count in the
  organization's time zone, from the day each state was due. The two durations are one row,
  `subscription_policy`, which super admins change in the console (Q3).
- **The request checks compute today's state; the daily job records it.** `entitlementsOf` reads the subscription,
  its plan and the policy, and follows the lifecycle up to today, so access is right even if the job ran late or not
  at all. The job (`advanceSubscriptions`, scheduled daily by the worker) writes the state down and records
  `subscription.status-changed` in the organization's log, by the system. It writes only if the subscription is still
  as it read it: a change from the console in the meantime wins.
- **Check 2, the organization active**, by what a call does: trial, active and past due allow everything; read-only
  allows views and exports but no changes (`ORGANIZATION_READ_ONLY`); suspended allows only the Owner's exports
  (`ORGANIZATION_SUSPENDED`); cancelled allows nothing (`ORGANIZATION_CANCELLED`); an organization without a
  subscription nothing either (`NO_SUBSCRIPTION`). Calls every state allows (`me.get`, the subscription's own
  status) let the app say why. All of these are `FORBIDDEN`.
- **Check 3, the module on the plan**, from each permission's module, as plan 2 arranged: `leads` belongs to the
  `crm` module, `quotes` to `quotes`, and so on, while `staff`, `roles`, `settings`, `audit`, `money` and `documents`
  belong to every plan. A permission whose module is neither on the plan nor switched on early fails with
  `FEATURE_LOCKED` (`MODULE_NOT_ON_PLAN`).

## Context

- **Why compute rather than trust the stored status.** A scheduled job can be late, fail or be paused. Reading the
  dates on every request costs one small query in a transaction the request opens anyway, and means a missed job
  never grants access nobody paid for.
- **Why days count from when a state was due.** If the job missed a week, an organization must not get an extra
  week of grace; and a re-run must find the same answer.

## Consequences

- Each request reads the subscription, its plan and the policy in one extra transaction (spec 6.4 allows caching
  these per container later).
- A later step's new permission module must be mapped to a plan module before the catalog test passes.
```

In `packages/domain/src/kernel/README.md`:

replace:
```markdown
  - `calendarDateIn(instant, timeZone)` → `"2026-10-15"`, `yearIn(instant, timeZone)`,
    `startOfDayIn(date, timeZone)` → the day's first instant;
  - `formatDateTime(instant, { timeZone, style })` with `style` `"date"` (15 Oct 2026), `"time"` (9:30 pm) or
```
with:
```markdown
  - `calendarDateIn(instant, timeZone)` → `"2026-10-15"`, `yearIn(instant, timeZone)`,
    `startOfDayIn(date, timeZone)` → the day's first instant, `addDays(date, days)` → another calendar date;
  - `formatDateTime(instant, { timeZone, style })` with `style` `"date"` (15 Oct 2026), `"time"` (9:30 pm) or
```

In `packages/domain/src/subscriptions/README.md`:

replace:
```markdown
- `by` is a `ConsoleActor`, `{ userId }`: the platform admin, or `null` for the platform's own jobs.
```
with:
```markdown
- `by` is a `ConsoleActor`, `{ userId }`: the platform admin, or `null` for the platform's own jobs.
- The lifecycle (pure, on calendar days): `nextStep(state, policy)` (the next state and its first day, or null) and
  `dueState(state, policy, today)` (every step whose day has come).
- What an organization may use: `entitlementsOf(tx, organizationId, now)` (plan and overrides, and the status due
  today, or null without a subscription), `createSubscriptionAccess({ db, now? })` (the api's one read per request),
  `overviewOf(entitlements)` (what `subscription.get` shows), `lifecycleAccessOf(status)`.
- Request checks 2 and 3: `assertLifecycleAllows(entitlements, { kind, isOwner })` (`kind` is `view`, `change`,
  `export` or `always`), `assertModulesOnPlan(entitlements, permissionModules)`, `planModuleOf(permissionModule)`.
- The daily job: `advanceSubscriptions({ db, organizationIds, now?, onError? })`, each organization in its own
  `forOrg()`; `advanceSubscription(tx, organizationId, now)` for one.
```

replace:
```markdown
| `subscription.suspended`, `.cancelled` | status                  | status, reason                                           |
```
with:
```markdown
| `subscription.suspended`, `.cancelled` | status                  | status, reason                                           |
| `subscription.status-changed`          | status                  | status, the day it began (the daily job)                 |
```

replace:
```markdown
- Payments are never deleted: `voidPayment` marks one, and changes no dates.
```
with:
```markdown
- Payments are never deleted: `voidPayment` marks one, and changes no dates.
- The lifecycle (spec 7.3): a trial or a paid period ends, and the next day the organization is past due; after the
  policy's days (7) it is read-only, after its days (14) suspended. Only a person cancels, or ends a suspension (by
  recording a payment or giving time). Days count from the day a state was due, in the organization's time zone.
- The request checks compute the state due today on every request, so a late or failed job never leaves an
  organization more access than it has paid for. The job records the change, as the system, once: it writes only if
  the subscription is still as it read it, so a change from the console in the meantime wins.
- What each state allows: trial, active and past due everything (past due shows a banner); read-only views and
  exports; suspended only the Owner's exports (and, later, paying); cancelled nothing. Calls of kind `always` (me.get,
  `subscription.get`) work in every state, so the app can say why the rest are refused.
- A permission's module maps to a plan module (`leads` to `crm`; `staff`, `roles`, `settings`, `audit`, `money` and
  `documents` to none: every plan has them). A new permission module must be added to the map; a test reads the
  catalog and fails until it is.
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=157 api=4 brand=21 contracts=78 db=211 domain=471 eslint-config=81 integrations=141 (1,164). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-subscriptions
git add docs/adr/0020-lifecycle-and-request-checks.md packages/contracts/src/subscriptions/subscriptions.ts packages/domain/src/kernel/README.md packages/domain/src/kernel/index.ts packages/domain/src/kernel/time.ts packages/domain/src/subscriptions/README.md packages/domain/src/subscriptions/advance.ts packages/domain/src/subscriptions/entitlements.ts packages/domain/src/subscriptions/index.ts packages/domain/src/subscriptions/lifecycle.ts packages/domain/src/subscriptions/request-rules.ts packages/domain/test/kernel/time.test.ts packages/domain/test/subscriptions/advance.test.ts packages/domain/test/subscriptions/entitlements.test.ts packages/domain/test/subscriptions/lifecycle.test.ts packages/domain/test/subscriptions/request-rules.test.ts
git commit -m "feat(domain): run the subscription lifecycle, and say what each organization may use today"
```

---
### Task S3: Request checks 2 and 3 on every request; impersonation ends with its session

Spec 6.5's checks 2 (the organization's subscription allows the call) and 3 (the module is on the plan) join plan 2's
procedures. Each organization procedure reads the organization's entitlements with the member, once per request, and
refuses by what the call does: a query views, a mutation changes, and a procedure says `.meta({ lifecycle: "export" })`
for an export or `.meta({ lifecycle: "always" })` for what every state must reach. Check 3 runs inside `requires()`,
from each required permission's module, before check 4; tRPC builders can't chain a separate `.requiresFeature()`.
`subscription.get` tells the web app the state, for its banner, in every state. This task also closes plan 2's
5-minute window for impersonation: a session with `impersonatedBy` is always read again from the database and its
admin re-checked, so support's impersonation ends the moment its session is deleted, though the cookie cache still
vouches for it.

**Files:**
- Create: `packages/api/src/routers/subscription.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/services.ts`, `docs/adr/0020-lifecycle-and-request-checks.md`, `packages/api/README.md`, `packages/api/src/context.ts`, `packages/api/src/procedures.ts`, `packages/api/src/routers/app-router.ts`, `packages/api/src/trpc.ts`
- Test: `apps/api/test/api-log.test.ts`, `apps/api/test/console-subscriptions.test.ts`, `apps/api/test/subscription-checks.test.ts`, `apps/api/test/support/test-server.ts`, `packages/api/test/request-checks.test.ts`

**Interfaces:**
- Consumes (Task S2): `SubscriptionAccess`, `createSubscriptionAccess`, `Entitlements`, `assertLifecycleAllows`,
  `assertModulesOnPlan`, `overviewOf`, `subscriptionOverview`; plan 2's `resolveAccess`, `pendingStep`, `moduleOf`,
  `isPlatformAdmin`.
- Produces:
  - `@travel-crm/api`: `ProcedureMeta` (`{ lifecycle?: "export" | "always" }`) on the api's tRPC instance;
    `ApiDependencies` gains `subscriptions: SubscriptionAccess`, and the context carries it; `orgProcedure` and
    `freshProcedure` add `ctx.entitlements`; `protectedProcedure` re-reads an impersonation session; router
    `subscription` with `get`.
  - `apps/api`: `ServerDependencies.subscriptions`; `Services.subscriptions` (`createSubscriptionAccess({ db })`);
    the test server passes one.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/request-checks.test.ts`:
```ts
// The request checks of spec 6.5 in the procedure builders, on stand-in identity and subscription services: 2 the
// organization's lifecycle state, 3 the module on the plan, 4 the role's permission, in that order; and support's
// impersonation read from the database every time, never from the cookie cache.
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import { PermissionSet } from "@travel-crm/domain/identity";
import { lifecycleAccessOf, type Entitlements } from "@travel-crm/domain/subscriptions";
import type { PlanModule, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { freshProcedure, orgProcedure, protectedProcedure } from "../src/procedures.js";
import { router, t } from "../src/trpc.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";
const userId = "0199e7a0-0000-7000-8000-0000000000c2";
const adminUserId = "0199e7a0-0000-7000-8000-0000000000c3";

/** Procedures of every kind, as later modules will write them. */
const probe = router({
  view: orgProcedure.query(() => "viewed"),
  change: orgProcedure.mutation(() => "changed"),
  exportData: orgProcedure.meta({ lifecycle: "export" }).mutation(() => "exported"),
  status: orgProcedure.meta({ lifecycle: "always" }).query(() => "status"),
  createLead: orgProcedure.requires("leads:create").mutation(() => "lead created"),
  manageStaff: freshProcedure.requires("staff:manage").mutation(() => "staff managed"),
  whoAmI: protectedProcedure.query(({ ctx }) => ctx.session.impersonatedBy ?? "nobody"),
});

interface Setup {
  status?: SubscriptionStatus | "none";
  modules?: PlanModule[];
  isOwner?: boolean;
  granted?: string[];
  /** The session in the cookie cache. */
  impersonatedBy?: string | null;
  /** The session the database holds now: null once it is gone. */
  storedSession?: { impersonatedBy: string | null } | null;
  /** Whether the impersonating admin is still platform staff. */
  adminStillStaff?: boolean;
}

/** A caller of the probe router for a member set up as asked, and a count of database session reads. */
function callerFor(setup: Setup) {
  const reads = { sessions: 0 };
  const member: MemberAccess = {
    organizationId,
    userId,
    memberId: "0199e7a0-0000-7000-8000-0000000000c4",
    source: setup.impersonatedBy ? "impersonation" : "web",
    impersonatedBy: setup.impersonatedBy ?? null,
    role: { key: "sales", name: "Sales", isOwner: setup.isOwner ?? false },
    permissions: setup.isOwner
      ? PermissionSet.everything()
      : PermissionSet.fromStored((setup.granted ?? []).map((permission) => ({ permission, scope: null }))),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
  const session = { activeOrganizationId: organizationId, impersonatedBy: setup.impersonatedBy ?? null };
  const stored = setup.storedSession === undefined ? session : setup.storedSession;
  const identity = {
    auth: {
      api: {
        getSession: () => {
          reads.sessions += 1;
          return Promise.resolve({
            headers: new Headers(),
            response: stored && { session: { ...session, ...stored }, user: { id: userId } },
          });
        },
      },
    },
    resolveAccess: () => Promise.resolve(member),
    isPlatformAdmin: () => Promise.resolve(setup.adminStillStaff ?? true),
  } as unknown as Identity;
  const status = setup.status ?? "active";
  const entitlements: Entitlements | null =
    status === "none"
      ? null
      : {
          status,
          access: lifecycleAccessOf(status),
          planName: "Starter",
          modules: new Set(setup.modules ?? []),
          limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
          trialEndsOn: null,
          paidThrough: null,
          nextChangeOn: null,
        };
  const ctx = {
    identity,
    subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
    headers: new Headers(),
    resHeaders: new Headers(),
    session,
    user: { id: userId },
  } as unknown as Context;
  return { caller: t.createCallerFactory(probe)(ctx), reads };
}

/** The reason a call is refused with, or what it answered. */
async function outcome(call: Promise<string>): Promise<string> {
  try {
    return await call;
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
}

describe("request check 2: the organization's lifecycle state", () => {
  it("lets a read-only organization view and export, and refuses its changes", async () => {
    const { caller } = callerFor({ status: "read_only" });
    expect(await outcome(caller.view())).toBe("viewed");
    expect(await outcome(caller.exportData())).toBe("exported");
    expect(await outcome(caller.change())).toBe("ORGANIZATION_READ_ONLY");
  });

  it("lets only the Owner export while suspended", async () => {
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.exportData())).toBe("exported");
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.view())).toBe(
      "ORGANIZATION_SUSPENDED",
    );
    expect(await outcome(callerFor({ status: "suspended" }).caller.exportData())).toBe("ORGANIZATION_SUSPENDED");
  });

  it("refuses everything once cancelled, or without a subscription, except what every state allows", async () => {
    const cancelled = callerFor({ status: "cancelled", isOwner: true }).caller;
    expect(await outcome(cancelled.exportData())).toBe("ORGANIZATION_CANCELLED");
    expect(await outcome(cancelled.status())).toBe("status");
    expect(await outcome(callerFor({ status: "none" }).caller.view())).toBe("NO_SUBSCRIPTION");
  });

  it("comes before checks 3 and 4", async () => {
    // Read-only, the module not on the plan, and no permission: the lifecycle answers.
    expect(await outcome(callerFor({ status: "read_only" }).caller.createLead())).toBe("ORGANIZATION_READ_ONLY");
  });
});

describe("request check 3: the module on the plan", () => {
  it("refuses a permission whose module isn't on the plan, before checking the role", async () => {
    expect(await outcome(callerFor({ modules: [] }).caller.createLead())).toBe("MODULE_NOT_ON_PLAN");
    expect(await outcome(callerFor({ modules: ["crm"] }).caller.createLead())).toBe("MISSING_PERMISSION");
    expect(await outcome(callerFor({ modules: ["crm"], granted: ["leads:create"] }).caller.createLead())).toBe(
      "lead created",
    );
  });

  it("needs no module for the Foundation's own permissions", async () => {
    expect(await outcome(callerFor({ modules: [], isOwner: true }).caller.manageStaff())).toBe("staff managed");
  });
});

describe("support's impersonation", () => {
  it("is read from the database on every request, while other sessions use the cookie cache", async () => {
    const plain = callerFor({});
    expect(await outcome(plain.caller.whoAmI())).toBe("nobody");
    expect(plain.reads.sessions).toBe(0);
    const impersonating = callerFor({ impersonatedBy: adminUserId });
    expect(await outcome(impersonating.caller.whoAmI())).toBe(adminUserId);
    expect(impersonating.reads.sessions).toBe(1);
  });

  it("stops at once when its session is gone, though the cookie cache still holds it", async () => {
    const ended = callerFor({ impersonatedBy: adminUserId, storedSession: null });
    expect(await outcome(ended.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(ended.caller.view())).toBe("UNAUTHORIZED");
  });

  it("stops at once when the admin is no longer platform staff", async () => {
    const demoted = callerFor({ impersonatedBy: adminUserId, adminStillStaff: false });
    expect(await outcome(demoted.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(demoted.caller.manageStaff())).toBe("UNAUTHORIZED");
  });
});
```

In `apps/api/test/support/test-server.ts`:

replace:
```ts
// api itself can never do). Requests go through app.request(), so no port is opened.
import { createDatabase, type Database } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";
```
with:
```ts
// api itself can never do). Requests go through app.request(), so no port is opened.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { createDatabase, isUniqueViolation, type Database } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";
```

replace:
```ts
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
```
with:
```ts
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
```

replace:
```ts
    identity,
    db,
```
with:
```ts
    identity,
    subscriptions: createSubscriptionAccess({ db }),
    db,
```

replace:
```ts

/** An organization with its starter roles and an Owner who signs in by email, as onboarding (plan 4) will make. */
export async function createTestAgency(server: TestServer): Promise<TestAgency> {
  const organizationId = await createTestOrganization(server.platform, "Test agency");
  const { code } = await server.platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
```
with:
```ts

/** Every module, and room to spare: the plan test agencies are on unless a test changes their subscription. */
const everythingPlan = {
  key: "test-everything",
  name: "Everything (tests)",
  monthlyPricePaise: 0,
  seatLimit: 1000,
  whatsappNumberLimit: 10,
  storageLimitBytes: 1_000_000_000_000n,
  modules: [...planModules],
};

/** The test plan's id. Test files run at once, so another may create the plan between the look and the create. */
async function everythingPlanId(platform: PlatformClient): Promise<string> {
  const existing = await platform.plan.findUnique({ where: { key: everythingPlan.key }, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await platform.plan.create({ data: everythingPlan, select: { id: true } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await platform.plan.findUniqueOrThrow({ where: { key: everythingPlan.key }, select: { id: true } })).id;
  }
}

/** Puts the organization on the test plan, active and paid for years, as onboarding would have. */
export async function subscribeToEverything(platform: PlatformClient, organizationId: string): Promise<void> {
  await platform.subscription.create({
    data: {
      organizationId,
      planId: await everythingPlanId(platform),
      billingCycle: "monthly",
      status: "active",
      statusChangedAt: new Date(),
      paidThrough: new Date("2099-12-31"),
    },
  });
}

/**
 * An organization with its starter roles, an Owner who signs in by email, and an active subscription to every module,
 * as onboarding makes them.
 */
export async function createTestAgency(server: TestServer): Promise<TestAgency> {
  const organizationId = await createTestOrganization(server.platform, "Test agency");
  await subscribeToEverything(server.platform, organizationId);
  const { code } = await server.platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
```

`apps/api/test/subscription-checks.test.ts`:
```ts
// Request check 2 over HTTP (spec 6.5, 7.3): what an organization's staff may do in each lifecycle state, what
// subscription.get tells them, and support's impersonation ending the moment its session does.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { createPlatformAdmin, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("the subscription's request check", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** A test agency whose subscription is set as given, and its signed-in Owner. */
  async function agencyWith(subscription: {
    status: string;
    trialEndsOn?: Date | null;
    paidThrough?: Date | null;
  }): Promise<{ agency: TestAgency; owner: CookieJar }> {
    const agency = await createTestAgency(server);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { statusChangedAt: new Date(), trialEndsOn: null, ...subscription },
    });
    return { agency, owner: await signedInOwner(server, agency) };
  }

  const changeTwoFactor = (jar: CookieJar) =>
    mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar);

  it("lets a read-only organization's staff look but not change anything, and says until when", async () => {
    const { owner } = await agencyWith({ status: "read_only" });
    expect((await query(server, "settings.get", owner)).status).toBe(200);
    expect(await refusalOf(await changeTwoFactor(owner))).toEqual({ status: 403, reason: "ORGANIZATION_READ_ONLY" });
    const overview = await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner));
    expect(overview).toMatchObject({ status: "read_only", access: "read_only", planName: "Everything (tests)" });
    expect(overview.nextChangeOn).not.toBeNull();
  });

  it("lets a cancelled organization's staff sign in and see why, and nothing else", async () => {
    const { owner } = await agencyWith({ status: "cancelled" });
    expect((await query(server, "me.get", owner)).status).toBe(200);
    expect(await refusalOf(await query(server, "settings.get", owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_CANCELLED",
    });
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "cancelled",
      access: "locked",
      nextChangeOn: null,
    });
  });

  it("counts a trial that ended yesterday as past due today, before the daily job has run", async () => {
    const yesterdayInIndia = calendarDateIn(new Date(Date.now() - 24 * 60 * 60 * 1000), "Asia/Kolkata");
    const { owner } = await agencyWith({ status: "trial", trialEndsOn: new Date(`${yesterdayInIndia}T00:00:00Z`) });
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "past_due",
      access: "full",
    });
    expect((await changeTwoFactor(owner)).status).toBe(200);
  });

  it("ends support's impersonation the moment its session is gone, though the cookie cache still holds it", async () => {
    const { agency } = await agencyWith({ status: "active", paidThrough: new Date("2099-12-31") });
    const admin = await createPlatformAdmin(server);
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    jar.absorb(await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar));
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    await server.platform.session.deleteMany({ where: { impersonatedBy: admin.userId } });
    expect((await query(server, "me.get", jar)).status).toBe(401);
    expect((await query(server, "settings.get", jar)).status).toBe(401);
  });
});
```

In `apps/api/test/console-subscriptions.test.ts`:

replace:
```ts
import type { PlanSummary, SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { createPlan } from "@travel-crm/domain/platform";
```
with:
```ts
import type { PlanSummary, SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createPlan } from "@travel-crm/domain/platform";
```

replace:
```ts
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";
```
with:
```ts
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";
```

replace:
```ts

  async function subscribedAgency(): Promise<TestAgency> {
    const agency = await createTestAgency(server);
    await testConsole.services.platformDb.transaction((tx) =>
```
with:
```ts

  /** An organization the console started on Starter. Test agencies come subscribed to every module already. */
  async function subscribedOrganization(): Promise<string> {
    const organizationId = await createTestOrganization(server.platform, "Subscriber");
    await testConsole.services.platformDb.transaction((tx) =>
```

replace:
```ts
        { userId: support.userId },
        {
          organizationId: agency.organizationId,
          planId: starter.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: "2099-12-31",
        },
      ),
    );
    return agency;
  }
```
with:
```ts
        { userId: support.userId },
        { organizationId, planId: starter.id, billingCycle: "monthly", trialEndsOn: null, paidThrough: "2099-12-31" },
      ),
    );
    return organizationId;
  }
```

replace:
```ts
  it("changes the plan and overrides, recorded in the organization's log under the admin's name", async () => {
    const agency = await subscribedAgency();
    const { organizationId } = agency;
    await dataOf(
```
with:
```ts
  it("changes the plan and overrides, recorded in the organization's log under the admin's name", async () => {
    const organizationId = await subscribedOrganization();
    await dataOf(
```

replace:
```ts
  it("records a payment, suspends and cancels by hand, and shows the subscription with its payments", async () => {
    const { organizationId } = await subscribedAgency();
    await dataOf(
```
with:
```ts
  it("records a payment, suspends and cancels by hand, and shows the subscription with its payments", async () => {
    const organizationId = await subscribedOrganization();
    await dataOf(
```

replace:
```ts
  it("says when an organization has no subscription, and refuses a reason left blank", async () => {
    const unsubscribed = await createTestAgency(server);
    expect(
      await refusalOf(
        await consoleQuery(testConsole, "subscriptions.get", support.jar, {
          organizationId: unsubscribed.organizationId,
        }),
      ),
    ).toEqual({ status: 404, reason: "SUBSCRIPTION_NOT_FOUND" });
    expect(
      (
        await consoleMutate(
          testConsole,
          "subscriptions.suspend",
          { organizationId: unsubscribed.organizationId, reason: "" },
          support.jar,
        )
      ).status,
    ).toBe(400);
```
with:
```ts
  it("says when an organization has no subscription, and refuses a reason left blank", async () => {
    const organizationId = await createTestOrganization(server.platform, "Unsubscribed");
    expect(
      await refusalOf(await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId })),
    ).toEqual({ status: 404, reason: "SUBSCRIPTION_NOT_FOUND" });
    expect(
      (await consoleMutate(testConsole, "subscriptions.suspend", { organizationId, reason: "" }, support.jar)).status,
    ).toBe(400);
```

replace:
```ts
  it("is out of reach of an organization's own staff", async () => {
    const agency = await subscribedAgency();
    const owner = await signedInOwner(server, agency);
```
with:
```ts
  it("is out of reach of an organization's own staff", async () => {
    const agency = await createTestAgency(server);
    const owner = await signedInOwner(server, agency);
```

In `apps/api/test/api-log.test.ts`:

replace:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
```
with:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
```

replace:
```ts
      }),
      db,
```
with:
```ts
      }),
      subscriptions: createSubscriptionAccess({ db }),
      db,
```

Test agencies are now subscribed to a test plan with every module, as onboarding would subscribe them, so plan 2's and
plan 3's api tests keep passing under the new checks. `console-subscriptions.test.ts` starts its own organizations
instead, since a test agency already has a subscription. Plan 3's `api-log.test.ts` builds the app itself, so it
passes the subscriptions too.

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscription-checks.test.ts test/console-subscriptions.test.ts test/api-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/request-checks.test.ts`

Expected: FAIL. In `packages/api`, 8 of 9: a read-only organization's change is `'changed'` where
`ORGANIZATION_READ_ONLY` is expected, a module off the plan reaches `MISSING_PERMISSION` instead of
`MODULE_NOT_ON_PLAN`, and an impersonation whose admin lost their level still passes. In `apps/api`, `No procedure
found on path "subscription.get"`, a read-only organization's mutation answers 200, and the deleted impersonation
session still answers 200 instead of 401.

- [ ] **Step 3: Run checks 2 and 3, and re-read impersonation sessions**

In `packages/api/src/trpc.ts`:

replace:
```ts

export const t = initTRPC.context<Context>().create({
  // tRPC adds the error's stack trace to responses unless NODE_ENV is "production". The api defaults to production, but
```
with:
```ts

/** What a procedure tells the request checks beyond its type (spec 7.3). */
export interface ProcedureMeta {
  /**
   * "export": a download of the organization's data, allowed while read-only and, to the Owner, while suspended.
   * "always": allowed in every lifecycle state, so the app can say why everything else is refused.
   */
  lifecycle?: "export" | "always";
}

export const t = initTRPC.context<Context>().meta<ProcedureMeta>().create({
  // tRPC adds the error's stack trace to responses unless NODE_ENV is "production". The api defaults to production, but
```

In `packages/api/src/context.ts`:

replace:
```ts
import type { Identity } from "@travel-crm/domain/identity";
```
with:
```ts
import type { Identity } from "@travel-crm/domain/identity";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
```

replace:
```ts
  identity: Identity;
}
```
with:
```ts
  identity: Identity;
  /** What each organization may use today: request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
}
```

replace:
```ts
 */
export async function createContext({ identity }: ApiDependencies, request: Request, resHeaders: Headers) {
  const { headers, response } = await identity.auth.api.getSession({
```
with:
```ts
 */
export async function createContext(
  { identity, subscriptions }: ApiDependencies,
  request: Request,
  resHeaders: Headers,
) {
  const { headers, response } = await identity.auth.api.getSession({
```

replace:
```ts
    identity,
    headers: request.headers,
```
with:
```ts
    identity,
    subscriptions,
    headers: request.headers,
```

In `packages/api/src/procedures.ts`:

replace:
```ts
//   1 signed in → 2 organization active → 3 module on the plan → 4 role permission → handler.
// Checks 2 and 3 arrive with subscriptions (plan 4), inside memberAccessFor() and requires(), so call sites stay the
// same. Check 5 (own or all records) is the handler's, through scopeFilter(); check 6 is Postgres row-level security.
import { TRPCError } from "@trpc/server";
import { pendingStep, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { forwardCookies } from "./context.js";
import { toTrpcError } from "./errors.js";
import { t } from "./trpc.js";
```
with:
```ts
//   1 signed in → 2 organization active → 3 module on the plan → 4 role permission → handler.
// Check 2 comes with the member (memberAccessFor), check 3 with requires(), before check 4. Check 5 (own or all
// records) is the handler's, through scopeFilter(); check 6 is Postgres row-level security.
import { TRPCError } from "@trpc/server";
import { moduleOf, pendingStep, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  assertLifecycleAllows,
  assertModulesOnPlan,
  type CallKind,
  type Entitlements,
  type SubscriptionAccess,
} from "@travel-crm/domain/subscriptions";
import { forwardCookies } from "./context.js";
import { toTrpcError } from "./errors.js";
import { t, type ProcedureMeta } from "./trpc.js";
```

replace:
```ts

/** Check 1, from the session cookie. Cached for up to 5 minutes, so a revoked session still passes for that long. */
export const protectedProcedure = base.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: ctx.session, user: ctx.user } });
});

/** Check 1 against the database, ignoring the cookie cache: a revoked session stops at once (spec 6.4). */
const freshlySignedIn = base.use(async ({ ctx, next }) => {
  const { headers, response } = await ctx.identity.auth.api.getSession({
```
with:
```ts

interface SessionContext {
  identity: Identity;
  headers: Headers;
  resHeaders: Headers;
}

/** The session read from the database, ignoring the cookie cache, or null when it is gone. */
async function sessionFromDatabase(ctx: SessionContext) {
  const { headers, response } = await ctx.identity.auth.api.getSession({
```

replace:
```ts
  forwardCookies(headers, ctx.resHeaders);
  if (!response) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: response.session, user: response.user } });
});
```
with:
```ts
  forwardCookies(headers, ctx.resHeaders);
  return response;
}

/**
 * Support's impersonation must end the moment its session does: when the admin stops, the hour is up, or the admin
 * is no longer platform staff (their impersonation sessions are deleted with their access). So an impersonation
 * session is always read from the database, never from the 5-minute cookie cache, and its admin re-checked.
 */
async function assertImpersonationStillHolds(
  ctx: SessionContext,
  session: { impersonatedBy?: string | null | undefined },
): Promise<void> {
  if (!session.impersonatedBy) return;
  const { impersonatedBy } = session;
  if (!(await ctx.identity.isPlatformAdmin({ id: impersonatedBy }))) throw new TRPCError({ code: "UNAUTHORIZED" });
}

/**
 * Check 1, from the session cookie. Cached for up to 5 minutes, so a revoked session still passes for that long,
 * except an impersonation session, which is read from the database every time.
 */
export const protectedProcedure = base.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ctx.session.impersonatedBy) return next({ ctx: { session: ctx.session, user: ctx.user } });
  const fresh = await sessionFromDatabase(ctx);
  if (!fresh?.session.impersonatedBy) throw new TRPCError({ code: "UNAUTHORIZED" });
  await assertImpersonationStillHolds(ctx, fresh.session);
  return next({ ctx: { session: fresh.session, user: fresh.user } });
});

/** Check 1 against the database, ignoring the cookie cache: a revoked session stops at once (spec 6.4). */
const freshlySignedIn = base.use(async ({ ctx, next }) => {
  const fresh = await sessionFromDatabase(ctx);
  if (!fresh) throw new TRPCError({ code: "UNAUTHORIZED" });
  await assertImpersonationStillHolds(ctx, fresh.session);
  return next({ ctx: { session: fresh.session, user: fresh.user } });
});
```

replace:
```ts
  identity: Identity;
  session: { activeOrganizationId?: string | null | undefined; impersonatedBy?: string | null | undefined };
  user: { id: string };
}
```
with:
```ts
  identity: Identity;
  subscriptions: SubscriptionAccess;
  session: { activeOrganizationId?: string | null | undefined; impersonatedBy?: string | null | undefined };
  user: { id: string };
}

/** What a call does, for check 2: a query views, a mutation changes, unless the procedure says otherwise. */
function callKindOf(type: string, meta: ProcedureMeta | undefined): CallKind {
  if (meta?.lifecycle === "always") return "always";
  if (meta?.lifecycle === "export") return "export";
  return type === "query" ? "view" : "change";
}
```

replace:
```ts
 * The session's impersonatedBy goes with the access, so whatever support does while impersonating is recorded as such.
 */
async function memberAccessFor(ctx: SignedInContext): Promise<MemberAccess> {
  const organizationId = ctx.session.activeOrganizationId;
```
with:
```ts
 * The session's impersonatedBy goes with the access, so whatever support does while impersonating is recorded as such.
 * Then check 2: what the organization's subscription allows today.
 */
async function memberAccessFor(
  ctx: SignedInContext,
  call: CallKind,
): Promise<{ member: MemberAccess; entitlements: Entitlements | null }> {
  const organizationId = ctx.session.activeOrganizationId;
```

replace:
```ts
  if (step === "SET_UP_TWO_FACTOR") throw new DomainError("FORBIDDEN", step, "Set up two-factor sign-in first");
  return access;
}

/** Check 4: the member's role holds every listed permission. */
function assertHolds(member: MemberAccess, required: readonly Permission[]): void {
  const missing = member.permissions.missing(required);
```
with:
```ts
  if (step === "SET_UP_TWO_FACTOR") throw new DomainError("FORBIDDEN", step, "Set up two-factor sign-in first");
  const entitlements = await ctx.subscriptions.entitlementsOf(access.organizationId);
  assertLifecycleAllows(entitlements, { kind: call, isOwner: access.role.isOwner });
  return { member: access, entitlements };
}

/** Checks 3 and 4: the permissions' modules are on the plan, then the member's role holds every permission. */
function assertMayUse(member: MemberAccess, entitlements: Entitlements | null, required: readonly Permission[]): void {
  assertModulesOnPlan(entitlements, required.map(moduleOf));
  const missing = member.permissions.missing(required);
```

replace:
```ts

const member = protectedProcedure.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));
const freshMember = freshlySignedIn.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));

/** Any member of the session's organization. `.requires("leads:create")` adds check 4. */
export const orgProcedure = Object.assign(member, {
```
with:
```ts

const member = protectedProcedure.use(async ({ ctx, type, meta, next }) =>
  next({ ctx: await memberAccessFor(ctx, callKindOf(type, meta)) }),
);
const freshMember = freshlySignedIn.use(async ({ ctx, type, meta, next }) =>
  next({ ctx: await memberAccessFor(ctx, callKindOf(type, meta)) }),
);

/** Any member of the session's organization. `.requires("leads:create")` adds checks 3 and 4. */
export const orgProcedure = Object.assign(member, {
```

replace:
```ts
    member.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
```
with:
```ts
    member.use(({ ctx, next }) => {
      assertMayUse(ctx.member, ctx.entitlements, permissions);
      return next();
```

replace:
```ts
    freshMember.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
```
with:
```ts
    freshMember.use(({ ctx, next }) => {
      assertMayUse(ctx.member, ctx.entitlements, permissions);
      return next();
```

`packages/api/src/routers/subscription.ts`:
```ts
// subscription.get: what the member's organization's subscription allows today (spec 7.3), for the past-due banner
// and the modules the app shows. Open to every member in every state, so the app can say why the rest is refused.
import { subscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "@travel-crm/domain/kernel";
import { overviewOf } from "@travel-crm/domain/subscriptions";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const subscriptionRouter = router({
  get: orgProcedure
    .meta({ lifecycle: "always" })
    .output(subscriptionOverview)
    .query(({ ctx }) => {
      if (!ctx.entitlements) {
        throw new DomainError("NOT_FOUND", "NO_SUBSCRIPTION", "This organization has no subscription");
      }
      return overviewOf(ctx.entitlements);
    }),
});
```

In `packages/api/src/routers/app-router.ts`:

replace:
```ts
import { staffRouter } from "./staff.js";
```
with:
```ts
import { staffRouter } from "./staff.js";
import { subscriptionRouter } from "./subscription.js";
```

replace:
```ts
  settings: settingsRouter,
});
```
with:
```ts
  settings: settingsRouter,
  subscription: subscriptionRouter,
});
```

- [ ] **Step 4: Give the api the subscriptions**

In `apps/api/src/app.ts`:

replace:
```ts
import { findShareLink, recordShareLinkOpen } from "@travel-crm/domain/share-links";
import { receiveWebhook, type WebhookProvider } from "@travel-crm/domain/webhooks";
```
with:
```ts
import { findShareLink, recordShareLinkOpen } from "@travel-crm/domain/share-links";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { receiveWebhook, type WebhookProvider } from "@travel-crm/domain/webhooks";
```

replace:
```ts
  identity: Identity;
  /** The public routes' database: share links, webhook events, rate-limit counters. */
```
with:
```ts
  identity: Identity;
  /** What each organization may use today, for the request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
  /** The public routes' database: share links, webhook events, rate-limit counters. */
```

replace:
```ts
export function createApp(dependencies: ServerDependencies): Hono {
  const { identity, db, files, queue, rateLimiter, clientAddress, webhookProviders, log } = dependencies;
  const app = new Hono();
```
with:
```ts
export function createApp(dependencies: ServerDependencies): Hono {
  const { identity, subscriptions, db, files, queue, rateLimiter, clientAddress, webhookProviders, log } = dependencies;
  const app = new Hono();
```

replace:
```ts
      endpoint: "/api/trpc",
      createContext: ({ resHeaders }, c) => createContext({ identity }, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
```
with:
```ts
      endpoint: "/api/trpc",
      createContext: ({ resHeaders }, c) => createContext({ identity, subscriptions }, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
```

In `apps/api/src/server.ts`:

replace:
```ts
  identity: services.identity,
  db: services.db,
```
with:
```ts
  identity: services.identity,
  subscriptions: services.subscriptions,
  db: services.db,
```

In `apps/api/src/services.ts`:

replace:
```ts
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
```
with:
```ts
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
```

replace:
```ts
  identity: Identity;
  storage: ObjectStorage;
```
with:
```ts
  identity: Identity;
  /** What each organization may use today: the api's request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
  storage: ObjectStorage;
```

replace:
```ts
    identity,
    storage,
```
with:
```ts
    identity,
    subscriptions: createSubscriptionAccess({ db }),
    storage,
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscription-checks.test.ts test/console-subscriptions.test.ts test/api-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions/packages/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/request-checks.test.ts`

Expected: PASS, 18 tests in 3 files (apps/api); 9 tests in 1 file (packages/api).

- [ ] **Step 6: Record the decision**

In `docs/adr/0020-lifecycle-and-request-checks.md`:

replace:
```markdown

## Context
```
with:
```markdown

- **In the procedure builders.** `orgProcedure` and `freshProcedure` read the member and then the subscription,
  apply check 2 by the call's type (a query views, a mutation changes) unless the procedure's meta says it exports
  (`lifecycle: "export"`) or must work in every state (`lifecycle: "always"`), and `requires()` applies check 3 before
  check 4. `subscription.get` (any member, every state) shows the status, the next change's day, the modules and the
  limits, for the past-due banner and the app's navigation.
- **Support's impersonation ends with its session.** `protectedProcedure` trusts the 5-minute cookie cache, except
  for an impersonation session: that one is read from the database on every request, and its admin re-checked as
  platform staff. Stopping, the hour running out, or the admin losing platform access ends it at once, not up to five
  minutes later.

## Context
```

In `packages/api/README.md`:

replace:
```markdown

| Builder                              | Checks (spec 6.5)                                              | Use for                                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| `publicProcedure`                    | none                                                           | nothing yet                                |
| `protectedProcedure`                 | 1, from the 5-minute session cookie                            | `me.get`                                   |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 4 | organization data                          |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff, 2FA settings |

Checks 2 (organization active) and 3 (module on the plan) arrive in plan 4 inside these builders, so procedures don't
change. Check 5 (own or all records) is the handler's job, with `scopeFilter()` from `@travel-crm/domain/identity`.
```
with:
```markdown

| Builder                              | Checks (spec 6.5)                                                                | Use for                                    |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `publicProcedure`                    | none                                                                             | nothing yet                                |
| `protectedProcedure`                 | 1, from the 5-minute session cookie (an impersonation session from the database) | `me.get`                                   |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 2, 3 and 4          | organization data                          |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database                         | money, roles, exports, staff, 2FA settings |

Check 2 (organization active) reads the organization's subscription with the member, and refuses by what the call
does: a query views, a mutation changes. A procedure that exports data says so with `.meta({ lifecycle: "export" })`
(allowed while read-only, and to the Owner while suspended); one every state must allow, so the app can say why the
rest is refused, with `.meta({ lifecycle: "always" })`. Check 3 (module on the plan) comes from each required
permission's module, inside `requires()`, before check 4. Check 5 (own or all records) is the handler's job, with
`scopeFilter()` from `@travel-crm/domain/identity`. Support's impersonation session is always read from the database,
and its admin re-checked, so it ends the moment the session does, not when the cookie cache expires.
```

replace:
```markdown

`me`, `staff`, `roles`, `settings`. Add a router in `src/routers/` and list it in `app-router.ts`.
```
with:
```markdown

`me`, `staff`, `roles`, `settings`, `subscription` (`get`: what the organization's subscription allows today, in
every state). Add a router in `src/routers/` and list it in `app-router.ts`.
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-subscriptions && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=161 api=13 brand=21 contracts=78 db=211 domain=471 eslint-config=81 integrations=141 (1,177). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-subscriptions
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/services.ts apps/api/test/api-log.test.ts apps/api/test/console-subscriptions.test.ts apps/api/test/subscription-checks.test.ts apps/api/test/support/test-server.ts docs/adr/0020-lifecycle-and-request-checks.md packages/api/README.md packages/api/src/context.ts packages/api/src/procedures.ts packages/api/src/routers/app-router.ts packages/api/src/routers/subscription.ts packages/api/src/trpc.ts packages/api/test/request-checks.test.ts
git commit -m "feat(api): check the lifecycle and plan on every request; impersonation ends with its session"
```

---
### Task A1: Close Better Auth's admin endpoints but impersonation, and impersonate active staff only

Plan 2 left Better Auth's admin plugin open to platform staff over HTTP. The console has its own API, and several of
those endpoints would skip our rules: `/admin/remove-user` deletes a user outright, past soft delete, and
`/admin/set-user-password` sets a password without must-change-password. So every `/admin/*` path answers 404 over
HTTP, platform staff included, except `/admin/impersonate-user` and `/admin/stop-impersonating`, which the console's
screens use for support's impersonation. Server-side `auth.api.*` admin calls run the same hook, so they still need a
platform admin's session; our own code makes none. Impersonation now starts only for an organization's active staff
(a membership not removed, a user not banned), so every impersonation has an organization's audit log to be recorded
in.

**Files:**
- Modify: `docs/adr/0018-platform-console.md`, `packages/domain/src/identity/README.md`, `packages/domain/src/identity/access.ts`, `packages/domain/src/identity/auth/side-doors.ts`
- Test: `packages/domain/test/identity/auth-hardening.test.ts`

**Interfaces:**
- Consumes (Task 0.2 and plan 2): `closeSideDoors(client, options)`, `isPlatformAdminUser`, `hasEverBeenMember`,
  `platformStaffLevelOf`, the identity test helpers (`createTestIdentity`, `createPlatformAdmin`, `addStaffMember`).
- Produces: `isActiveMemberUser(client, userId): Promise<boolean>` in `access.ts` (identity-internal); over HTTP every
  `/admin/*` path but the two answers `404 { code: "NOT_FOUND" }`; impersonating anyone but active staff is refused
  `403 IMPERSONATION_TARGET_NOT_A_MEMBER` before a session exists.

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-identity -b foundation/04-identity foundation/04-platform
cd /Users/ak/personal/travel-crm-04-identity && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/04-identity` at Task 0.2's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

In `packages/domain/test/identity/auth-hardening.test.ts`:

replace:
```ts
// Better Auth's own endpoints, run through its real handler: the side doors that would let a member change their
// sign-in name into another organization's namespace, or reach the platform-admin endpoints (ADR 0006).
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
```
with:
```ts
// Better Auth's own endpoints, run through its real handler: the side doors that would let a member change their
// sign-in name into another organization's namespace, or reach the platform-admin endpoints (ADR 0006), which stay
// open over HTTP only for support's impersonation, of an organization's active staff (ADR 0018).
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
```

replace:
```ts

  it("refuses the admin endpoints to a user who has the admin role and also a membership", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: "admin" } });
```
with:
```ts

  /** A server-side call's refusal: its HTTP status and code, or "allowed". */
  async function refusalOf(call: Promise<unknown>): Promise<string> {
    try {
      await call;
      return "allowed";
    } catch (error) {
      const { status, body } = error as { status: string; body?: { code?: string } };
      return `${status} ${body?.code ?? ""}`.trim();
    }
  }

  const listUsers = (headers: Headers) => test.identity.auth.api.listUsers({ headers, query: {} });

  it("closes every admin endpoint over HTTP but starting and stopping impersonation, even to platform staff", async () => {
    const headers = await platformAdminHeaders();
    for (const path of ["/admin/list-users", "/admin/get-user?id=x"]) {
      expect((await get(path, headers)).status, path).toBe(404);
    }
    for (const path of [
      "/admin/create-user",
      "/admin/set-role",
      "/admin/update-user",
      "/admin/ban-user",
      "/admin/unban-user",
      "/admin/remove-user",
      "/admin/set-user-password",
      "/admin/list-user-sessions",
      "/admin/revoke-user-session",
      "/admin/revoke-user-sessions",
      "/admin/has-permission",
    ]) {
      expect((await post(path, headers, { userId: agency.ownerUserId })).status, path).toBe(404);
    }
    const user = await test.database.client.user.findUnique({ where: { id: agency.ownerUserId } });
    expect(user?.banned).toBe(false);
  });

  it("refuses the admin endpoints, from server-side calls too, to a user who has the admin role and a membership", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: "admin" } });
```

replace:
```ts
      const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
      expect((await get("/admin/list-users", headers)).status).toBe(403);
    } finally {
```
with:
```ts
      const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
      expect(await refusalOf(listUsers(headers))).toBe("FORBIDDEN FORBIDDEN");
    } finally {
```

replace:
```ts
  it("refuses the admin endpoints without a session", async () => {
    expect((await get("/admin/list-users", new Headers())).status).toBe(401);
  });

  it("lets a genuine platform admin use the admin endpoints", async () => {
    const headers = await platformAdminHeaders();
    expect((await get("/admin/list-users", headers)).status).toBe(200);
  });
```
with:
```ts
  it("refuses the admin endpoints without a session", async () => {
    expect(await refusalOf(listUsers(new Headers()))).toBe("UNAUTHORIZED UNAUTHORIZED");
  });

  it("lets a genuine platform admin call the admin endpoints from the server", async () => {
    expect(await refusalOf(listUsers(await platformAdminHeaders()))).toBe("allowed");
  });
```

replace:
```ts

  async function expectRefusedAndUnchanged(response: Response, userId: string): Promise<void> {
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF" });
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: userId } });
```
with:
```ts

  async function expectRefusedAndUnchanged(call: Promise<unknown>, userId: string): Promise<void> {
    expect(await refusalOf(call)).toBe("FORBIDDEN MEMBERS_CANNOT_BE_PLATFORM_STAFF");
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: userId } });
```

replace:
```ts

  it("refuses to make a member a platform admin, even a removed one", async () => {
```
with:
```ts

  /** Better Auth's admin endpoints as a server-side call makes them, with any body, as a careless caller might. */
  const adminCall = (path: "setRole" | "adminUpdateUser", headers: Headers, body: unknown) =>
    (test.identity.auth.api[path] as (request: { headers: Headers; body: unknown }) => Promise<unknown>)({
      headers,
      body,
    });

  it("refuses to make a member a platform admin, even a removed one", async () => {
```

replace:
```ts
    const staff = await newMember("leaver");
    const makeAdmin = () => post("/admin/set-role", headers, { userId: staff.userId, role: "admin" });
    await expectRefusedAndUnchanged(await makeAdmin(), staff.userId);
    await test.database.client.member.update({ where: { id: staff.memberId }, data: softDeleted(agency.ownerUserId) });
    await expectRefusedAndUnchanged(await makeAdmin(), staff.userId);
  });
```
with:
```ts
    const staff = await newMember("leaver");
    const makeAdmin = () => adminCall("setRole", headers, { userId: staff.userId, role: "admin" });
    await expectRefusedAndUnchanged(makeAdmin(), staff.userId);
    await test.database.client.member.update({ where: { id: staff.memberId }, data: softDeleted(agency.ownerUserId) });
    await expectRefusedAndUnchanged(makeAdmin(), staff.userId);
  });
```

replace:
```ts
    const staff = await newMember("bypass");
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: [staff.userId], role: "admin" }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: "admin,user" }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: ["admin"] }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/update-user", headers, { userId: staff.userId, data: { role: "admin" } }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: ["admin,user"] }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/update-user", headers, { userId: staff.userId, data: { role: "admin,user" } }),
      staff.userId,
    );
  });
```
with:
```ts
    const staff = await newMember("bypass");
    for (const [path, body] of [
      ["setRole", { userId: [staff.userId], role: "admin" }],
      ["setRole", { userId: staff.userId, role: "admin,user" }],
      ["setRole", { userId: staff.userId, role: ["admin"] }],
      ["setRole", { userId: staff.userId, role: "super-admin" }],
      ["adminUpdateUser", { userId: staff.userId, data: { role: "admin" } }],
      ["setRole", { userId: staff.userId, role: ["admin,user"] }],
      ["adminUpdateUser", { userId: staff.userId, data: { role: "admin,user" } }],
    ] as const) {
      await expectRefusedAndUnchanged(adminCall(path, headers, body), staff.userId);
    }
  });
```

replace:
```ts
    });
    const response = await post("/admin/set-role", headers, { userId: outsider.id, role: "admin" });
    expect(response.status).toBe(200);
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: outsider.id } });
```
with:
```ts
    });
    expect(await refusalOf(adminCall("setRole", headers, { userId: outsider.id, role: "admin" }))).toBe("allowed");
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: outsider.id } });
```

replace:
```ts
    const impersonating = new Headers({ cookie: [...jar.values()].join("; ") });
    expect((await get("/admin/list-users", impersonating)).status).toBe(403);
    expect((await post("/admin/stop-impersonating", impersonating, {})).status).toBe(200);
  });
  it("refuses a cross-site browser request to the username sign-in", async () => {
```
with:
```ts
    const impersonating = new Headers({ cookie: [...jar.values()].join("; ") });
    expect((await get("/admin/list-users", impersonating)).status).toBe(404);
    expect(await refusalOf(listUsers(impersonating))).toBe("FORBIDDEN FORBIDDEN");
    expect((await post("/admin/stop-impersonating", impersonating, {})).status).toBe(200);
  });
  it("impersonates only an organization's active staff", async () => {
    const headers = await platformAdminHeaders();
    const impersonate = (userId: string) => post("/admin/impersonate-user", headers, { userId });
    const outsider = await test.database.client.user.create({
      data: { name: "Outsider", email: `never-member-${crypto.randomUUID()}@example.test` },
    });
    const leaver = await newMember("removed-one");
    await test.database.client.member.update({ where: { id: leaver.memberId }, data: softDeleted(agency.ownerUserId) });
    const banned = await newMember("banned-one");
    await test.database.client.user.update({ where: { id: banned.userId }, data: { banned: true } });
    for (const userId of [outsider.id, leaver.userId, banned.userId, crypto.randomUUID()]) {
      const refused = await impersonate(userId);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "IMPERSONATION_TARGET_NOT_A_MEMBER" });
    }
    expect(
      await test.database.client.session.count({ where: { impersonatedBy: { not: null }, userId: leaver.userId } }),
    ).toBe(0);
    expect((await impersonate((await newMember("present-one")).userId)).status).toBe(200);
  });

  it("refuses a cross-site browser request to the username sign-in", async () => {
```

Plan 2's hardening tests that called `/admin/*` over HTTP to prove its rules now make the same calls server-side, through `auth.api`, with a platform admin's headers.

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/auth-hardening.test.ts`

Expected: FAIL: 3 of 19. `/admin/list-users: expected 200 to be 404`; impersonating a removed member answers 200
where 403 is expected; and during an impersonation another admin endpoint answers 403 instead of 404.

- [ ] **Step 4: Close the endpoints, and check the impersonation target**

In `packages/domain/src/identity/access.ts`:

replace:
```ts
}
```
with:
```ts
}

/**
 * True for an active member: a membership that isn't removed, and a user who isn't banned (removed staff are). Support
 * impersonates only these, so every impersonation has an organization's audit log to be recorded in.
 */
export async function isActiveMemberUser(client: IdentityClient, userId: string): Promise<boolean> {
  // Soft delete hides removed members.
  const member = await client.member.findUnique({
    where: { userId },
    select: { user: { select: { banned: true, banExpires: true } } },
  });
  if (!member) return false;
  const { banned, banExpires } = member.user;
  return !(banned && (banExpires === null || banExpires > new Date()));
}
```

In `packages/domain/src/identity/auth/side-doors.ts`:

replace:
```ts
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { hasEverBeenMember, isPlatformAdminUser, platformStaffLevelOf } from "../access.js";
```
with:
```ts
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { hasEverBeenMember, isActiveMemberUser, isPlatformAdminUser, platformStaffLevelOf } from "../access.js";

/**
 * The admin endpoints that stay open over HTTP: support's impersonation, which the console starts and stops through
 * Better Auth. Every other one is closed: the console has its own API, and some would skip our rules (remove-user
 * deletes a user outright, past soft delete; set-user-password skips must-change-password).
 */
const adminPathsOpenOverHttp: readonly string[] = ["/admin/impersonate-user", "/admin/stop-impersonating"];
```

replace:
```ts
 *   and probing which usernames exist;
 * - /admin/* for anyone who isn't platform staff by our definition (Better Auth checks user.role alone), and
 *   making a person with a membership a platform admin;
 * - Better Auth's organization endpoints over HTTP (members and roles go through our own API);
```
with:
```ts
 *   and probing which usernames exist;
 * - /admin/* over HTTP, except starting and stopping support's impersonation;
 * - /admin/* for anyone who isn't platform staff by our definition (Better Auth checks user.role alone), making a
 *   person with a membership a platform admin, and impersonating anyone but an organization's active staff;
 * - Better Auth's organization endpoints over HTTP (members and roles go through our own API);
```

replace:
```ts
    const overHttp = ctx.request !== undefined;
    if (overHttp && ctx.path.startsWith("/organization/")) {
```
with:
```ts
    const overHttp = ctx.request !== undefined;
    if (overHttp && ctx.path.startsWith("/admin/") && !adminPathsOpenOverHttp.includes(ctx.path)) {
      throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
    }
    if (overHttp && ctx.path.startsWith("/organization/")) {
```

replace:
```ts
      }
      if (await makesMemberPlatformAdmin(client, ctx.path, body)) {
```
with:
```ts
      }
      if (ctx.path === "/admin/impersonate-user") {
        // An impersonation nobody in an organization can see in their log must not start.
        const target = coercedString(body.userId);
        if (target === null || !(await isActiveMemberUser(client, target))) {
          throw new APIError("FORBIDDEN", {
            code: "IMPERSONATION_TARGET_NOT_A_MEMBER",
            message: "Only an organization's active staff can be impersonated",
          });
        }
      }
      if (await makesMemberPlatformAdmin(client, ctx.path, body)) {
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/auth-hardening.test.ts`

Expected: PASS, 19 tests in 1 file (packages/domain).

- [ ] **Step 6: Record the decision**

In `docs/adr/0018-platform-console.md`:

replace:
```markdown
  and `superAdminProcedure`. Better Auth gives both roles the same powers on its own endpoints.
- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
```
with:
```markdown
  and `superAdminProcedure`. Better Auth gives both roles the same powers on its own endpoints.
- **Better Auth's admin endpoints are closed over HTTP**, except starting and stopping support's impersonation
  (`/admin/impersonate-user`, `/admin/stop-impersonating`), which answer as before. Every other `/admin/*` path is a
  404 for everyone, platform staff included: the console has its own API, and some of those endpoints would skip our
  rules (`/admin/remove-user` deletes a user outright, past soft delete; `/admin/set-user-password` skips
  must-change-password). Server-side `auth.api.*` admin calls still run the same hook, so they need a platform admin's
  request headers; our own code makes none.
- **Support impersonates only an organization's active staff**: a member who isn't removed or banned. Anyone else
  (someone who was never a member, a removed member, a banned one) is refused with `IMPERSONATION_TARGET_NOT_A_MEMBER`
  before a session exists, so every impersonation has an organization's audit log to be recorded in.
- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
- Removing someone soft-deletes their membership and releases their email and username (ADR 0007).
```
with:
```markdown
- Removing someone soft-deletes their membership and releases their email and username (ADR 0007).
- Better Auth's `/admin/*` endpoints are closed over HTTP but for starting and stopping support's impersonation
  (`auth/side-doors.ts`), and support may impersonate only an organization's active staff (ADR 0018).
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-identity && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=194 domain=433 eslint-config=81 integrations=141 (1,095). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-identity
git add docs/adr/0018-platform-console.md packages/domain/src/identity/README.md packages/domain/src/identity/access.ts packages/domain/src/identity/auth/side-doors.ts packages/domain/test/identity/auth-hardening.test.ts
git commit -m "fix(domain): close Better Auth's admin endpoints but impersonation, of active staff only"
```

---
### Task A2: Onboarding's identity steps in the caller's transaction, and the Owner's invite by email

Spec 7.1: the platform team creates the organization, and its Owner gets an email invite. Onboarding (Task P1) runs
in one platform transaction, so identity's steps take the caller's transaction instead of opening their own: the
organization's row (only the platform role may insert one), the five starter roles, and the Owner, created with no
password and invited. Inviting publishes `staff.invited` (ids only). The worker's `identity.send-invite` listener
then stores a Better Auth reset token for them and emails a link to the web app's reset page, where choosing a
password goes through Better Auth's own `/reset-password`, which creates the password account. Plan 3 stores reset
tokens only as a hash (`verification.storeIdentifier`), so the listener stores the same hash: the table never holds
a working link. Invite links last 72 hours, against a reset link's hour; a second invite's link works beside the
first.

**Files:**
- Create: `docs/adr/0021-onboarding.md`, `packages/domain/src/identity/onboarding.ts`, `packages/domain/src/identity/staff-invites.ts`
- Modify: `packages/contracts/src/identity/staff.ts`, `packages/domain/src/identity/README.md`, `packages/domain/src/identity/identity.ts`, `packages/domain/src/identity/index.ts`, `packages/domain/src/identity/seed-starter-roles.ts`, `packages/domain/src/identity/staff-accounts.ts`
- Test: `packages/domain/test/identity/onboarding.test.ts`, `packages/domain/test/identity/staff-invites.test.ts`

**Interfaces:**
- Consumes (Task 0.1, plans 2-3): `asOrganization`, `createPlatformDatabase`, `platformActor`, `recordAudit`,
  `publishEvent`, `defineListener`, `runListenerJob`, `renderEmail`, `senderNameFor`, `EmailSender`,
  `createMemoryEmailSender`, `isPlaceholderEmail`, `insertStaffAccount`'s checks (role, username, unique email).
- Produces:
  - `@travel-crm/contracts/identity`: `staffInvitedEvent` (`{ memberId, userId }`).
  - `@travel-crm/domain/identity`: `createOrganizationRecord(tx, { name, code, timeZone, contactEmail })` (refuses a
    taken code with `ORGANIZATION_CODE_TAKEN`), `insertStarterRoles(tx)`, `inviteOwner(tx, actor, { name, email }):
    Promise<CreatedStaff>`, `requestInvite(tx, actor, memberId)` (`MEMBER_NOT_FOUND`, `NO_EMAIL`), `NewOrganization`,
    `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER` (`identity.send-invite`), `InviteDependencies` (`{ email,
    appUrl, now? }`); `Identity.inviteListener(dependencies): EventListener` and `Identity.organizationIds()`.
  - Identity-internal: `insertStaffAccount(tx, record, checkRole?)` (a `passwordHash` of null for an invited person)
    and `StaffAccountRecord`, which `createStaffAccount` now calls.
  - The invite link: `<appUrl>/reset-password?token=<token>`, the page Better Auth's reset links lead to.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/identity/onboarding.test.ts`:
```ts
// Onboarding's identity steps (spec 7.1), as the platform console runs them in one platform transaction: the
// organization's row as the platform role, then, stepped into the new organization, its starter roles and its first
// Owner, invited by email with no password yet.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import {
  createOrganizationRecord,
  insertStarterRoles,
  inviteOwner,
  OWNER_ROLE_KEY,
  requestInvite,
} from "../../src/identity/index.js";
import { platformActor } from "../../src/kernel/index.js";
import { createTestIdentity, type TestIdentity } from "./test-identity.js";

const adminUserId = "0199e7a0-0000-7000-8000-00000000ad11";
const uniqueCode = () => `O${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;

describe("onboarding's identity steps", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
  });

  afterAll(async () => {
    await test.close();
    await db.disconnect();
    await platformDb.disconnect();
  });

  /** The console's onboarding transaction, reduced to identity's steps. */
  function onboard(code: string, ownerEmail: string) {
    return platformDb.transaction(async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Sharma Holidays",
        code,
        timeZone: "Asia/Kolkata",
        contactEmail: "hello@sharma.example",
      });
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        return inviteOwner(orgTx, platformActor(organization.id, adminUserId), {
          name: "Asha Sharma",
          email: ownerEmail,
        });
      });
      return { organizationId: organization.id, owner };
    });
  }

  it("creates the organization, its roles, and an Owner invited by email with no password yet", async () => {
    const code = uniqueCode();
    const email = `asha-${code.toLowerCase()}@example.test`;
    const { organizationId, owner } = await onboard(code, email);
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(5);
    const user = await test.database.client.user.findUniqueOrThrow({
      where: { id: owner.userId },
      include: { accounts: true, member: true },
    });
    expect(user).toMatchObject({ email, mustChangePassword: false, member: { role: OWNER_ROLE_KEY, organizationId } });
    expect(user.accounts).toEqual([]);
    const entries = await db.forOrg(organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => [entry.action, entry.source, entry.actorUserId])).toEqual([
      ["staff.created", "platform", adminUserId],
      ["staff.invited", "platform", adminUserId],
    ]);
    const events = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "staff.invited" } }),
    );
    expect(events.map((event) => event.payload)).toEqual([{ memberId: owner.memberId, userId: owner.userId }]);
    // No password until they choose one from the invite. Better Auth warns that it found no password account.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const signIn = await test.identity.auth.api.signInEmail({
      body: { email, password: "any-password-1" },
      asResponse: true,
    });
    expect(signIn.status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));
  });

  it("refuses an organization code another organization has, and leaves nothing of the attempt", async () => {
    const code = uniqueCode();
    await onboard(code, `first-${code.toLowerCase()}@example.test`);
    const second = `second-${code.toLowerCase()}@example.test`;
    await expect(onboard(code, second)).rejects.toMatchObject({ reason: "ORGANIZATION_CODE_TAKEN" });
    expect(await test.database.client.user.count({ where: { email: second } })).toBe(0);
  });

  it("rolls the whole onboarding back when a later step fails", async () => {
    const taken = `taken-${randomUUID()}@example.test`;
    await onboard(uniqueCode(), taken);
    const code = uniqueCode();
    await expect(onboard(code, taken)).rejects.toMatchObject({ reason: "EMAIL_OR_USERNAME_TAKEN" });
    expect(await test.database.client.organization.count({ where: { code } })).toBe(0);
  });

  it("can't create an organization as the runtime role, whatever the code does", async () => {
    const { organizationId } = await onboard(uniqueCode(), `runtime-${randomUUID()}@example.test`);
    await expect(
      test.database.forOrg(organizationId, (tx) =>
        createOrganizationRecord(tx, {
          name: "Sneaky",
          code: uniqueCode(),
          timeZone: "Asia/Kolkata",
          contactEmail: null,
        }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("asks for another invite only for the organization's own members with a real address", async () => {
    const { organizationId, owner } = await onboard(uniqueCode(), `again-${randomUUID()}@example.test`);
    const actor = platformActor(organizationId, adminUserId);
    await platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, (orgTx) => requestInvite(orgTx, actor, owner.memberId)),
    );
    expect(await db.forOrg(organizationId, (tx) => tx.outboxEvent.count({ where: { type: "staff.invited" } }))).toBe(2);
    const other = await onboard(uniqueCode(), `other-${randomUUID()}@example.test`);
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationId, (orgTx) => requestInvite(orgTx, actor, other.owner.memberId)),
      ),
    ).rejects.toMatchObject({ reason: "MEMBER_NOT_FOUND" });
  });
});
```

`packages/domain/test/identity/staff-invites.test.ts`:
```ts
// The invite email (spec 7.1): the worker's identity.send-invite listener emails a link that lets the invited person
// choose a password through Better Auth's reset and then sign in; nobody removed or without a real address is
// emailed; the link lapses after 72 hours.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createOrganizationRecord,
  INVITE_LINK_HOURS,
  insertStarterRoles,
  inviteOwner,
  type CreatedStaff,
} from "../../src/identity/index.js";
import { runListenerJob } from "../../src/jobs/index.js";
import { platformActor } from "../../src/kernel/index.js";
import { createTestIdentity, signInByEmail, type TestIdentity } from "./test-identity.js";

const appUrl = "https://app.example.in";

describe("the invite email", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
  });

  afterAll(async () => {
    await test.close();
    await db.disconnect();
    await platformDb.disconnect();
  });

  async function invitedOwner(): Promise<{ organizationId: string; owner: CreatedStaff; email: string }> {
    const code = `I${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const email = `owner-${code.toLowerCase()}@example.test`;
    return platformDb.transaction(async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Kerala Trails",
        code,
        timeZone: "Asia/Kolkata",
        contactEmail: null,
      });
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        return inviteOwner(orgTx, platformActor(organization.id, randomUUID()), { name: "Lakshmi Nair", email });
      });
      return { organizationId: organization.id, owner, email };
    });
  }

  /** Runs the invite listener on the organization's latest staff.invited event, as the worker would. */
  async function deliverInvite(organizationId: string, now?: Date) {
    const email = createMemoryEmailSender();
    const event = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "staff.invited" }, orderBy: { id: "desc" } }),
    );
    const listener = test.identity.inviteListener({ email, appUrl, ...(now ? { now: () => now } : {}) });
    await runListenerJob({ db, listener, data: { organizationId, eventId: event.id, eventType: event.type } });
    return email.sent;
  }

  const tokenIn = (text: string) => /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

  it("emails the Owner a link with which they choose a password and then sign in", async () => {
    const { organizationId, email } = await invitedOwner();
    const [message, ...others] = await deliverInvite(organizationId);
    expect(others).toEqual([]);
    expect(message).toMatchObject({
      to: { name: "Lakshmi Nair", address: email },
      subject: "Your account for Kerala Trails",
    });
    expect(message?.fromName).toMatch(/^Kerala Trails via /);
    expect(message?.text).toContain(`${appUrl}/reset-password?token=`);
    const token = tokenIn(message?.text ?? "");
    // Kept only as a hash, as Better Auth keeps its reset tokens (ADR 0006): the table holds no working link.
    expect(await test.database.client.verification.count({ where: { identifier: { contains: token } } })).toBe(0);
    await test.identity.auth.api.resetPassword({ body: { token, newPassword: "my-own-password-1" } });
    const signedIn = await signInByEmail(test.identity, email, "my-own-password-1");
    expect(signedIn.get("cookie")).toBeTruthy();
  });

  it("emails nobody removed or banned since", async () => {
    const { organizationId, owner } = await invitedOwner();
    await test.database.client.user.update({ where: { id: owner.userId }, data: { banned: true } });
    expect(await deliverInvite(organizationId)).toEqual([]);
  });

  it("lets the link lapse after its hours", async () => {
    const { organizationId } = await invitedOwner();
    const sentLongAgo = new Date(Date.now() - (INVITE_LINK_HOURS + 1) * 60 * 60 * 1000);
    const [message] = await deliverInvite(organizationId, sentLongAgo);
    const token = tokenIn(message?.text ?? "");
    await expect(
      test.identity.auth.api.resetPassword({ body: { token, newPassword: "too-late-password-1" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });
});
```

The first onboarding test signs in as the invited Owner, who has no password yet: Better Auth warns "User not found",
so the test asserts that warning under a scoped spy.

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/onboarding.test.ts test/identity/staff-invites.test.ts`

Expected: FAIL: all 8. `TypeError: createOrganizationRecord is not a function`.

- [ ] **Step 3: Run identity's onboarding steps in the caller's transaction**

In `packages/contracts/src/identity/staff.ts`:

replace:
```ts

/** The payload of "staff.removed": the membership removed and its user, ids only. */
```
with:
```ts

/** The payload of "staff.invited": the member to email a link to choose their password, ids only. */
export const staffInvitedEvent = z.strictObject({ memberId: recordId, userId: recordId });
export type StaffInvitedEvent = z.infer<typeof staffInvitedEvent>;

/** The payload of "staff.removed": the membership removed and its user, ids only. */
```

In `packages/domain/src/identity/staff-accounts.ts`:

replace:
```ts
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
```
with:
```ts
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
```

replace:
```ts

/**
```
with:
```ts

/** An account's records as insertStaffAccount writes them: a password hash, or none until the person chooses one. */
export interface StaffAccountRecord extends Omit<NewStaffAccount, "password"> {
  /** Null for someone invited by email: they choose their password from the invite's link. */
  passwordHash: string | null;
}

/**
```

replace:
```ts
): Promise<CreatedStaff> {
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
  // Hashing is slow on purpose; do it before opening the transaction.
  const passwordHash = await hashPassword(account.password);
  try {
    return await database.forOrg(account.organizationId, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
      const role = await findRoleToGive(tx, account.roleKey);
      checkRole?.(role);
      const username = account.username === undefined ? null : internalUsername(organization.code, account.username);
      if (username !== null && !INTERNAL_USERNAME_PATTERN.test(username)) {
        throw new DomainError(
          "VALIDATION",
          "INVALID_USERNAME",
          "Usernames use letters, digits, _ . - (2 to 32 characters)",
        );
      }
      const user = await tx.user.create({
        data: {
          name: account.name,
          // Better Auth lowercases the email at sign-in, and the unique index is case-sensitive.
          email: account.email?.toLowerCase() ?? placeholderEmail(organization.code, account.username ?? ""),
          username,
          displayUsername: account.username ?? null,
          mustChangePassword: account.mustChangePassword,
        },
      });
      // Better Auth's password sign-in reads the "credential" account whose accountId is the user id.
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });
      const member = await tx.member.create({
        data: { userId: user.id, organizationId: account.organizationId, role: role.key },
      });
      // No name, username or address: the log outlives the account, and erasure clears those on the user row (ADR 0007).
      // The member id leads to the person.
      await recordAudit(tx, account.actor ?? systemActor(account.organizationId), {
        action: "staff.created",
        entityType: "member",
        entityId: member.id,
        after: { role: role.key, hasEmail: account.email !== undefined },
      });
      return { userId: user.id, memberId: member.id };
    });
  } catch (error) {
```
with:
```ts
): Promise<CreatedStaff> {
  // Hashing is slow on purpose: refuse what can't be written before it, and hash before opening the transaction.
  assertHasSignInName(account);
  const { password, ...rest } = account;
  const record = { ...rest, passwordHash: await hashPassword(password) };
  return database.forOrg(account.organizationId, (tx) => insertStaffAccount(tx, record, checkRole));
}

/**
 * Writes the account in the caller's transaction, in the account's organization: the user, a password account when
 * there is a hash, the membership, and the audit entry. Onboarding calls it inside the platform's transaction, stepped
 * into the new organization.
 */
export async function insertStaffAccount(
  tx: IdentityTx,
  account: StaffAccountRecord,
  checkRole?: (role: FoundRole) => void,
): Promise<CreatedStaff> {
  assertHasSignInName(account);
  try {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
    const role = await findRoleToGive(tx, account.roleKey);
    checkRole?.(role);
    const username = account.username === undefined ? null : internalUsername(organization.code, account.username);
    if (username !== null && !INTERNAL_USERNAME_PATTERN.test(username)) {
      throw new DomainError(
        "VALIDATION",
        "INVALID_USERNAME",
        "Usernames use letters, digits, _ . - (2 to 32 characters)",
      );
    }
    const user = await tx.user.create({
      data: {
        name: account.name,
        // Better Auth lowercases the email at sign-in, and the unique index is case-sensitive.
        email: account.email?.toLowerCase() ?? placeholderEmail(organization.code, account.username ?? ""),
        username,
        displayUsername: account.username ?? null,
        mustChangePassword: account.mustChangePassword,
      },
    });
    // Better Auth's password sign-in reads the "credential" account whose accountId is the user id. Without a hash
    // there is none yet: Better Auth's password reset creates it when the invited person chooses their password.
    if (account.passwordHash !== null) {
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: account.passwordHash },
      });
    }
    const member = await tx.member.create({
      data: { userId: user.id, organizationId: account.organizationId, role: role.key },
    });
    // No name, username or address: the log outlives the account, and erasure clears those on the user row (ADR 0007).
    // The member id leads to the person.
    await recordAudit(tx, account.actor ?? systemActor(account.organizationId), {
      action: "staff.created",
      entityType: "member",
      entityId: member.id,
      after: { role: role.key, hasEmail: account.email !== undefined },
    });
    return { userId: user.id, memberId: member.id };
  } catch (error) {
```

replace:
```ts
}
```
with:
```ts
}

/** Everyone signs in by an email, a username, or both. */
function assertHasSignInName(account: { email?: string | undefined; username?: string | undefined }): void {
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
}
```

In `packages/domain/src/identity/seed-starter-roles.ts`:

replace:
```ts
// Gives a new organization its five starter roles. Onboarding (plan 4) calls this right after creating the organization.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
```
with:
```ts
// Gives a new organization its five starter roles. Onboarding calls this right after creating the organization, inside
// its own transaction, stepped into the new organization.
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
```

replace:
```ts
export async function seedStarterRoles(database: IdentityDatabase, organizationId: string): Promise<void> {
  await database.forOrg(organizationId, async (tx) => {
    if ((await tx.role.count()) > 0) {
      throw new DomainError("CONFLICT", "ROLES_ALREADY_SEEDED", "This organization already has roles");
    }
    for (const starter of starterRoles) {
      const role = await tx.role.create({ data: { key: starter.key, name: starter.name, isOwner: starter.isOwner } });
      await tx.rolePermission.createMany({
        data: starter.grants.map((grant) => ({ roleId: role.id, permission: grant.permission, scope: grant.scope })),
      });
    }
  });
}
```
with:
```ts
export async function seedStarterRoles(database: IdentityDatabase, organizationId: string): Promise<void> {
  await database.forOrg(organizationId, insertStarterRoles);
}

/** The starter roles, in the transaction's organization (db.forOrg(), or the platform's asOrganization()). */
export async function insertStarterRoles(tx: IdentityTx): Promise<void> {
  if ((await tx.role.count()) > 0) {
    throw new DomainError("CONFLICT", "ROLES_ALREADY_SEEDED", "This organization already has roles");
  }
  for (const starter of starterRoles) {
    const role = await tx.role.create({ data: { key: starter.key, name: starter.name, isOwner: starter.isOwner } });
    await tx.rolePermission.createMany({
      data: starter.grants.map((grant) => ({ roleId: role.id, permission: grant.permission, scope: grant.scope })),
    });
  }
}
```

`packages/domain/src/identity/onboarding.ts`:
```ts
// The identity side of onboarding (spec 7.1): the organization's own row, and its first Owner, invited by email. Both
// run in the caller's transaction, so the platform console onboards an organization in one transaction: it creates
// the row as the platform role, then steps into the new organization (asOrganization) for the roles and the Owner.
import { staffInvitedEvent } from "@travel-crm/contracts/identity";
import { isUniqueViolation, type IdentityTx } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { isPlaceholderEmail } from "./sign-in-names.js";
import { insertStaffAccount, type CreatedStaff } from "./staff-accounts.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface NewOrganization {
  name: string;
  /** The sign-in code, e.g. SHARMA: 3-12 capital letters or digits. It never changes once there are staff. */
  code: string;
  /** An IANA zone, e.g. Asia/Kolkata. */
  timeZone: string;
  /** Where replies to the organization's email go (spec 9.4). */
  contactEmail: string | null;
}

/** The organization's row. Only the platform role may insert one: the api never creates organizations. */
export async function createOrganizationRecord(
  tx: IdentityTx,
  organization: NewOrganization,
): Promise<{ id: string; code: string }> {
  try {
    return await tx.organization.create({ data: organization, select: { id: true, code: true } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "ORGANIZATION_CODE_TAKEN", "Another organization has that code");
    }
    throw error;
  }
}

/**
 * The organization's first Owner, in the transaction's organization, with no password yet: the invite email lets
 * them choose one. Recorded as "staff.created" and "staff.invited" by `actor` (the platform admin at onboarding).
 */
export async function inviteOwner(
  tx: IdentityTx,
  actor: Actor,
  owner: { name: string; email: string },
): Promise<CreatedStaff> {
  const created = await insertStaffAccount(tx, {
    organizationId: actor.organizationId,
    name: owner.name,
    email: owner.email,
    roleKey: OWNER_ROLE_KEY,
    passwordHash: null,
    mustChangePassword: false,
    actor,
  });
  await requestInvite(tx, actor, created.memberId);
  return created;
}

/**
 * Asks for an invite email to an active member who has a real address: publishes "staff.invited", which the worker's
 * identity.send-invite listener turns into an email with a link to choose a password. Asking again sends a new link;
 * the earlier ones keep working until they lapse. Recorded as "staff.invited".
 */
export async function requestInvite(tx: IdentityTx, actor: Actor, memberId: string): Promise<void> {
  // The member table has no row-level security, so the organization is filtered here.
  const member = await tx.member.findFirst({
    where: { id: memberId, organizationId: actor.organizationId },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  if (isPlaceholderEmail(member.user.email)) {
    throw new DomainError("VALIDATION", "NO_EMAIL", "This person has no email address to send an invite to");
  }
  await publishEvent(tx, {
    type: "staff.invited",
    payload: staffInvitedEvent.parse({ memberId: member.id, userId: member.userId }),
  });
  await recordAudit(tx, actor, { action: "staff.invited", entityType: "member", entityId: member.id });
}
```

- [ ] **Step 4: Email the invite**

`packages/domain/src/identity/staff-invites.ts`:
```ts
// The invite email (spec 7.1: "the owner then gets an email invite"): the worker's listener for "staff.invited". It
// stores a link token the way Better Auth's password reset does, so the link opens the web app's reset page and the
// person chooses their password there; Better Auth then creates their password account and signs nothing else in.
import { createHash, randomBytes } from "node:crypto";
import { staffInvitedEvent } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import { defineListener, type EventListener } from "../jobs/index.js";
import { isPlaceholderEmail } from "./sign-in-names.js";

/** How long an invite link works. Longer than a password reset's hour: an owner may open it the next day. */
export const INVITE_LINK_HOURS = 72;

export interface InviteDependencies {
  email: EmailSender;
  /** The web app's address; the link goes to its /reset-password page, as Better Auth's reset links do. */
  appUrl: string;
  /** The time now; tests pass a fixed one. */
  now?: () => Date;
}

export const SEND_INVITE_LISTENER = "identity.send-invite";

/**
 * The identifier Better Auth finds a reset token by. It keeps reset tokens only as a hash (ADR 0006: base64url
 * SHA-256 of "reset-password:<token>"), so the table holds no working link; the invite tests prove the two agree.
 */
function storedResetIdentifier(token: string): string {
  return createHash("sha256").update(`reset-password:${token}`).digest("base64url");
}

/**
 * Sends the invite. Nothing is sent to someone removed, banned, or without a real address. At least once, as every
 * listener: a retry after a failed send stores a second token and sends the email again; both links work until they
 * lapse.
 */
export function staffInviteListener(database: IdentityDatabase, dependencies: InviteDependencies): EventListener {
  const now = dependencies.now ?? (() => new Date());
  return defineListener({
    name: SEND_INVITE_LISTENER,
    eventType: "staff.invited",
    payload: staffInvitedEvent,
    handle: async (event) => {
      const { organizationId } = event;
      const invite = await database.forOrg(organizationId, async (tx) => {
        // Soft delete hides removed members; the member table has no row-level security, hence the organization.
        const member = await tx.member.findFirst({
          where: { id: event.payload.memberId, userId: event.payload.userId, organizationId },
          select: {
            user: { select: { id: true, name: true, email: true, banned: true } },
            organization: { select: { name: true } },
          },
        });
        if (!member || member.user.banned === true || isPlaceholderEmail(member.user.email)) return null;
        const token = randomBytes(24).toString("base64url");
        // Better Auth's own reset token: /reset-password consumes it, and its value is the user.
        await tx.verification.create({
          data: {
            identifier: storedResetIdentifier(token),
            value: member.user.id,
            expiresAt: new Date(now().getTime() + INVITE_LINK_HOURS * 60 * 60 * 1000),
          },
        });
        return { name: member.user.name, address: member.user.email, organization: member.organization.name, token };
      });
      if (!invite) return;
      const url = new URL("/reset-password", dependencies.appUrl);
      url.searchParams.set("token", invite.token);
      const content = renderEmail({
        heading: `Your account for ${invite.organization}`,
        paragraphs: [
          `${invite.organization} has an account for you. Choose your password, then sign in with ${invite.address}.`,
          `The link works for ${String(INVITE_LINK_HOURS / 24)} days. If it has run out, ask for a new one.`,
        ],
        action: { label: "Choose your password", url: url.toString() },
        footer: "You get this email because an account was set up for you. If you didn't expect it, ignore it.",
      });
      await dependencies.email.send({
        to: { name: invite.name, address: invite.address },
        fromName: senderNameFor(invite.organization),
        subject: `Your account for ${invite.organization}`,
        ...content,
      });
    },
  });
}
```

In `packages/domain/src/identity/identity.ts`:

replace:
```ts
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
```
with:
```ts
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { EventListener } from "../jobs/index.js";
import type { MemberAccess } from "./member-access.js";
```

replace:
```ts
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole } from "./staff.js";
```
with:
```ts
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { staffInviteListener, type InviteDependencies } from "./staff-invites.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole } from "./staff.js";
```

replace:
```ts
  };
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
```
with:
```ts
  };
  /** Every organization's id, oldest first: for jobs that visit each one, such as the subscription lifecycle. */
  organizationIds(): Promise<string[]>;
  /** The worker's listener that emails "staff.invited" invites (identity.send-invite). */
  inviteListener(dependencies: InviteDependencies): EventListener;
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
```

replace:
```ts
    },
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
```
with:
```ts
    },
    organizationIds: async () =>
      (await database.client.organization.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } })).map(
        (organization) => organization.id,
      ),
    inviteListener: (dependencies) => staffInviteListener(database, dependencies),
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export { pendingStep, type MemberAccess } from "./member-access.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
```
with:
```ts
export { pendingStep, type MemberAccess } from "./member-access.js";
export { createOrganizationRecord, inviteOwner, requestInvite, type NewOrganization } from "./onboarding.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
```

replace:
```ts
} from "./sign-in-names.js";
export type { CreatedStaff } from "./staff-accounts.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
```
with:
```ts
} from "./sign-in-names.js";
export { insertStarterRoles } from "./seed-starter-roles.js";
export type { CreatedStaff } from "./staff-accounts.js";
export { INVITE_LINK_HOURS, SEND_INVITE_LISTENER, type InviteDependencies } from "./staff-invites.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/onboarding.test.ts test/identity/staff-invites.test.ts`

Expected: PASS, 8 tests in 2 files (packages/domain).

- [ ] **Step 6: Record the decision**

`docs/adr/0021-onboarding.md`:
```markdown
# 0021: Onboarding in one transaction, and the Owner's invite

Date: 2026-10-16 · Status: accepted · Implements spec section 7.1, and replaces plan 2's temporary password for the
first Owner

## Decision

- **Onboarding is one platform transaction.** The console creates the organization's row as the platform role (the
  api never may), then steps into the new organization (`asOrganization`, ADR 0018) for everything identity does
  there: the five starter roles and the first Owner. If any step fails, nothing is left behind: no organization without
  an Owner, no Owner without roles.
- **The Owner is invited by email, with no password.** `inviteOwner` creates the Owner's user and membership and no
  password account, records `staff.created` and `staff.invited` under the platform admin's name, and publishes
  `staff.invited`. The worker's `identity.send-invite` listener stores a Better Auth reset token for them and emails a
  link to the web app's `/reset-password` page. Choosing a password there goes through Better Auth's own
  `/reset-password`, which creates the password account; then they sign in. `requestInvite` sends a new link later.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
  links keep working until they lapse, so asking twice never strands anyone.

## Context

- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own
  (a hash of `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so a
  change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
  needs no SMTP settings, and a failed send is retried rather than lost. The token never travels in the event or the
  job: the listener makes it.

## Consequences

- A retried send can email a second link; both work. Removed, banned and placeholder-address people get nothing.
- Staff created by an organization's admins keep plan 2's temporary passwords; inviting them by email can reuse
  `requestInvite` later.
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)`, for onboarding;
  - `disconnect()`.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
```
with:
```markdown
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)` (an Owner with a password,
    for tests and the demo);
  - `organizationIds()`: every organization's id, for jobs that visit each one;
  - `inviteListener({ email, appUrl, now? })`: the worker's `identity.send-invite` listener;
  - `disconnect()`.
- Onboarding's steps, each in the caller's transaction (the console runs them in one platform transaction):
  `createOrganizationRecord(tx, { name, code, timeZone, contactEmail })` (the platform role only),
  `insertStarterRoles(tx)`, `inviteOwner(tx, actor, { name, email })` and `requestInvite(tx, actor, memberId)` (inside
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
```

replace:
```markdown
  and forgets the person's browsers.

Every change below is written to the audit log in the change's own transaction (ADR 0015), with the acting member, or
the system for onboarding:
```
with:
```markdown
  and forgets the person's browsers.
- Publishes `staff.invited` (`{ memberId, userId }`, `staffInvitedEvent`) when an invite is asked for. Its own
  listener, `identity.send-invite`, emails a link to choose a password: a Better Auth reset token, kept
  only as a hash as Better Auth keeps its own, that lasts 72 hours, at `<APP_URL>/reset-password?token=<token>`, the page Better Auth's
  reset links lead to. Nobody removed, banned or without a real address is emailed.

Every change below is written to the audit log in the change's own transaction (ADR 0015), with the acting member,
the platform admin for onboarding (source `platform`), or the system:
```

replace:
```markdown
| `staff.created`                           | `member`       |                        | role, whether they have an email                     |
| `staff.role-changed`                      | `member`       | role                   | role                                                 |
```
with:
```markdown
| `staff.created`                           | `member`       |                        | role, whether they have an email                     |
| `staff.invited`                           | `member`       |                        |                                                      |
| `staff.role-changed`                      | `member`       | role                   | role                                                 |
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-identity && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=194 domain=441 eslint-config=81 integrations=141 (1,103). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-identity
git add docs/adr/0021-onboarding.md packages/contracts/src/identity/staff.ts packages/domain/src/identity/README.md packages/domain/src/identity/identity.ts packages/domain/src/identity/index.ts packages/domain/src/identity/onboarding.ts packages/domain/src/identity/seed-starter-roles.ts packages/domain/src/identity/staff-accounts.ts packages/domain/src/identity/staff-invites.ts packages/domain/test/identity/onboarding.test.ts packages/domain/test/identity/staff-invites.test.ts
git commit -m "feat(domain): onboard in one transaction, and invite the first Owner by email"
```

---
### Task A3: Seats, member activity, and erasing a removed person

Three things the platform needs from identity. **Seats** (spec 7.2): `IdentityOptions.seatLimit` gives the seats an
organization's plan allows, and adding staff past them is refused; the organization's row is held `FOR UPDATE` in
the adding transaction, so two people added at once can't both take the last seat. **Member activity**: seats used
and the last sign-in per organization, for the dashboard. **Erasure** (spec 5, DPDP): a removed person's name,
addresses, password, sessions, two-factor secret and reset tokens are cleared, keeping the membership row so ids still
lead somewhere; a member must be removed first. A purge's people (every user whose membership is in the organization)
are deleted with their sessions.

**Files:**
- Create: `packages/domain/src/identity/erasure.ts`, `packages/domain/src/identity/member-activity.ts`
- Modify: `packages/domain/src/identity/README.md`, `packages/domain/src/identity/identity.ts`, `packages/domain/src/identity/index.ts`, `packages/domain/src/identity/staff-accounts.ts`, `packages/domain/src/identity/staff.ts`
- Test: `packages/domain/test/identity/erasure.test.ts`, `packages/domain/test/identity/member-activity.test.ts`, `packages/domain/test/identity/seats.test.ts`

**Interfaces:**
- Consumes (Task A2, plans 2-3): `insertStaffAccount`, `removedPersonEmail`, `IdentityTx`, the identity test helpers.
- Produces (`@travel-crm/domain/identity`):
  - `SeatLimit` (`(organizationId) => Promise<number | null>`); `IdentityOptions.seatLimit`; `staff.create` refuses
    `LIMIT_REACHED` `SEAT_LIMIT_REACHED`.
  - `memberActivity(tx, organizationIds): Promise<MemberActivity[]>` (`{ organizationId, seatsUsed, lastActiveAt }`).
  - `personExport(tx, organizationId, memberId): Promise<PersonExport>`, `erasePerson(tx, organizationId, memberId)`
    (`REMOVE_FIRST` for an active member), `organizationUserIds(tx, organizationId)`, `deleteUsers(tx, userIds)`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/identity/seats.test.ts`:
```ts
// Seats (spec 7.2): an organization adds staff only while its plan has a seat for them, removed members free theirs,
// and two people added at once can't both take the last one.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIdentity, type Identity, type MemberAccess } from "../../src/identity/index.js";
import { createTestAgency, memberAccessOf, testAuthSettings, type TestAgency } from "./test-identity.js";

describe("seats", () => {
  let platform: PlatformClient;
  let identity: Identity;
  let agency: TestAgency;
  let owner: MemberAccess;
  const seatsByOrganization = new Map<string, number>();

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    identity = createIdentity({
      databaseUrl: urls.runtime,
      maxConnections: 4,
      auth: testAuthSettings,
      seatLimit: (organizationId) => Promise.resolve(seatsByOrganization.get(organizationId) ?? null),
    });
    agency = await createTestAgency(identity, platform);
    owner = await memberAccessOf(identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await identity.disconnect();
    await platform.$disconnect();
  });

  const add = (username: string) =>
    identity.staff.create(owner, { name: username, username, roleKey: "sales", temporaryPassword: "temporary-pass-1" });

  it("refuses a member past the plan's seats, and lets a removal free one", async () => {
    // The Owner has one seat; two more.
    seatsByOrganization.set(agency.organizationId, 3);
    await add("anil");
    const bina = await add("bina");
    await expect(add("chetan")).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "SEAT_LIMIT_REACHED" });
    await identity.staff.remove(owner, { memberId: bina.memberId });
    await expect(add("chetan")).resolves.toMatchObject({ username: "chetan" });
  });

  it("gives the last seat to one of two people added at once", async () => {
    const other = await createTestAgency(identity, platform);
    const otherOwner = await memberAccessOf(identity, other.ownerUserId, other.organizationId);
    seatsByOrganization.set(other.organizationId, 2);
    const results = await Promise.allSettled(
      ["dev", "esha"].map((username) =>
        identity.staff.create(otherOwner, {
          name: username,
          username,
          roleKey: "sales",
          temporaryPassword: "temporary-pass-1",
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await platform.member.count({ where: { organizationId: other.organizationId, deletedAt: null } })).toBe(2);
  });

  it("has no limit when the plan gives none", async () => {
    seatsByOrganization.delete(agency.organizationId);
    await expect(add("farah")).resolves.toMatchObject({ username: "farah" });
  });
});
```

`packages/domain/test/identity/member-activity.test.ts`:
```ts
// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when a member last used
// the app, support's impersonation aside.
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { memberActivity } from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestIdentity,
} from "./test-identity.js";

describe("member activity", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 1 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await test.close();
  });

  it("counts active members as seats used, and dates the last sign-in", async () => {
    const busy = await createTestAgency(test.identity, platform);
    const quiet = await createTestAgency(test.identity, platform);
    const owner = await memberAccessOf(test.identity, busy.ownerUserId, busy.organizationId);
    await addStaffMember(test.identity, owner, "gita", "sales");
    const leaver = await addStaffMember(test.identity, owner, "hari", "sales");
    await test.identity.staff.remove(owner, { memberId: leaver.memberId });
    await signInByEmail(test.identity, busy.ownerEmail, busy.ownerPassword);
    // An impersonation is support's activity, not the organization's.
    await platform.session.create({
      data: {
        userId: quiet.ownerUserId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
        impersonatedBy: crypto.randomUUID(),
      },
    });
    const activity = await platformDb.transaction((tx) =>
      memberActivity(tx, [busy.organizationId, quiet.organizationId]),
    );
    expect(activity).toEqual([
      { organizationId: busy.organizationId, seatsUsed: 2, lastActiveAt: expect.any(String) as string },
      { organizationId: quiet.organizationId, seatsUsed: 1, lastActiveAt: null },
    ]);
  });
});
```

`packages/domain/test/identity/erasure.test.ts`:
```ts
// Identity's part of permanent deletion (spec 5), as the platform's jobs run it: one removed person erased on a DPDP
// request, with an export of their data first; and every person of an organization being purged.
import { withDeleted } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  deleteUsers,
  erasePerson,
  organizationUserIds,
  personExport,
  type MemberAccess,
} from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("erasure and purge, identity's part", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let agency: TestAgency;
  let owner: MemberAccess;

  beforeAll(async () => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await test.close();
  });

  /** A member with an email who has signed in, then been removed. */
  async function removedPerson(name: string) {
    const email = `${name}-${crypto.randomUUID()}@example.test`;
    const staff = await test.identity.staff.create(owner, {
      name,
      email,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await signInByEmail(test.identity, email, "temporary-pass-1");
    await platform.verification.create({
      data: {
        identifier: `reset-password:${crypto.randomUUID()}`,
        value: staff.userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await test.identity.staff.remove(owner, { memberId: staff.memberId });
    return { ...staff, email };
  }

  it("exports a removed person's data, then erases their name, addresses and every way to sign in", async () => {
    const person = await removedPerson("meera");
    expect(await platformDb.transaction((tx) => personExport(tx, agency.organizationId, person.memberId))).toEqual({
      memberId: person.memberId,
      userId: person.userId,
      name: "meera",
      email: person.email,
      username: null,
      role: "sales",
      joinedAt: expect.any(String) as string,
      removedAt: expect.any(String) as string,
    });
    expect(await platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, person.memberId))).toEqual({
      userId: person.userId,
    });
    const user = await platform.user.findUniqueOrThrow({
      where: { id: person.userId },
      include: { accounts: true, sessions: true, twoFactors: true },
    });
    expect(user).toMatchObject({ name: "Erased person", formerEmail: null, username: null, displayUsername: null });
    expect(user.email).toMatch(/^erased-.*@no-email\.invalid$/);
    expect([user.accounts, user.sessions, user.twoFactors]).toEqual([[], [], []]);
    expect(await platform.verification.count({ where: { value: person.userId } })).toBe(0);
    // The membership stays, so audit entries and records still have someone to point at.
    expect(await withDeleted(() => platform.member.count({ where: { id: person.memberId } }))).toBe(1);
    // Erasing again changes nothing.
    await platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, person.memberId));
  });

  it("erases only someone already removed, and only in their own organization", async () => {
    const present = await addStaffMember(test.identity, owner, "still-here", "sales");
    await expect(
      platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, present.memberId)),
    ).rejects.toMatchObject({ reason: "REMOVE_FIRST" });
    const other = await createTestAgency(test.identity, platform);
    await expect(
      platformDb.transaction((tx) => erasePerson(tx, other.organizationId, present.memberId)),
    ).rejects.toMatchObject({ reason: "MEMBER_NOT_FOUND" });
  });

  it("finds every person who was ever a member of an organization, and deletes them with their sessions", async () => {
    const purged = await createTestAgency(test.identity, platform);
    const purgedOwner = await memberAccessOf(test.identity, purged.ownerUserId, purged.organizationId);
    const leaver = await addStaffMember(test.identity, purgedOwner, "leaver", "sales");
    await test.identity.staff.remove(purgedOwner, { memberId: leaver.memberId });
    await signInByEmail(test.identity, purged.ownerEmail, purged.ownerPassword);
    const userIds = await platformDb.transaction((tx) => organizationUserIds(tx, purged.organizationId));
    expect(userIds.sort()).toEqual([purged.ownerUserId, leaver.userId].sort());
    expect(await platformDb.transaction((tx) => deleteUsers(tx, userIds))).toBe(2);
    expect(await platform.user.count({ where: { id: { in: userIds } } })).toBe(0);
    expect(await platform.session.count({ where: { userId: { in: userIds } } })).toBe(0);
    expect(await withDeleted(() => platform.member.count({ where: { organizationId: purged.organizationId } }))).toBe(
      0,
    );
    // Another organization's people are untouched.
    expect(await platform.user.count({ where: { id: agency.ownerUserId } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/seats.test.ts test/identity/member-activity.test.ts test/identity/erasure.test.ts`

Expected: FAIL: 6 of 7. The member past the plan's seats is added (`promise resolved … instead of rejecting`), and so
are both people added at once (`[ 'fulfilled', 'fulfilled' ]`); `memberActivity`, `personExport` and
`organizationUserIds` are not functions, and erasing an active member doesn't refuse with `REMOVE_FIRST`.

- [ ] **Step 3: Hold staff to the plan's seats**

In `packages/domain/src/identity/staff.ts`:

replace:
```ts
import { changeMember, lockMember, lockOwners } from "./staff-locks.js";
```
with:
```ts
import { changeMember, lockMember, lockOwners } from "./staff-locks.js";

/** How many seats an organization's plan gives (spec 7.2), or null for no limit. */
export type SeatLimit = (organizationId: string) => Promise<number | null>;

const noSeatLimit: SeatLimit = () => Promise.resolve(null);
```

replace:
```ts

/** Adds a staff member with a temporary password they must change at first sign-in. */
export async function createStaff(
```
with:
```ts

/**
 * Adds a staff member with a temporary password they must change at first sign-in, while the organization's plan has a
 * seat for them.
 */
export async function createStaff(
```

replace:
```ts
  input: CreateStaffInput,
): Promise<StaffMember> {
  const created = await createStaffAccount(
```
with:
```ts
  input: CreateStaffInput,
  seatLimit: SeatLimit = noSeatLimit,
): Promise<StaffMember> {
  const seats = await seatLimit(actor.organizationId);
  const created = await createStaffAccount(
```

replace:
```ts
      actor,
    },
```
with:
```ts
      actor,
      seatLimit: seats,
    },
```

In `packages/domain/src/identity/staff-accounts.ts`:

replace:
```ts
  actor?: Actor | undefined;
}
```
with:
```ts
  actor?: Actor | undefined;
  /** The organization's seats (spec 7.2), or null or left out for no limit. */
  seatLimit?: number | null | undefined;
}
```

replace:
```ts
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
    const role = await findRoleToGive(tx, account.roleKey);
```
with:
```ts
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
    if (account.seatLimit !== undefined && account.seatLimit !== null) {
      await assertSeatFree(tx, account.organizationId, account.seatLimit);
    }
    const role = await findRoleToGive(tx, account.roleKey);
```

replace:
```ts
}
```
with:
```ts
}

/**
 * Refuses a new member once the organization's active members fill its seats. The organization's row is held until
 * the transaction ends, so two people added at once can't both take the last seat.
 */
async function assertSeatFree(tx: IdentityTx, organizationId: string, seatLimit: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organization WHERE id = ${organizationId}::uuid FOR UPDATE`;
  // Soft delete leaves removed members out: they free their seat.
  if ((await tx.member.count({ where: { organizationId } })) >= seatLimit) {
    throw new DomainError("LIMIT_REACHED", "SEAT_LIMIT_REACHED", "Every seat on this organization's plan is taken");
  }
}
```

- [ ] **Step 4: Count activity, and erase a removed person**

`packages/domain/src/identity/member-activity.ts`:
```ts
// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when anyone last used the
// app. Counts and a time only, never who.
import type { IdentityTx } from "@travel-crm/db/identity";

export interface MemberActivity {
  organizationId: string;
  /** Active members: the seats taken. */
  seatsUsed: number;
  /** When a member's session was last used, support's impersonation aside; null when nobody has signed in. */
  lastActiveAt: string | null;
}

/** Seats used and last activity of each organization asked about, in the order asked. */
export async function memberActivity(tx: IdentityTx, organizationIds: readonly string[]): Promise<MemberActivity[]> {
  if (organizationIds.length === 0) return [];
  // Soft delete leaves removed members out of the counts.
  const seats = await tx.member.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: [...organizationIds] } },
    _count: { _all: true },
  });
  const sessions = await tx.$queryRaw<{ organization_id: string; last_active: Date }[]>`
    SELECT m.organization_id, max(s.updated_at) AS last_active
    FROM session s JOIN member m ON m.user_id = s.user_id
    WHERE m.organization_id = ANY (${[...organizationIds]}::uuid[]) AND s.impersonated_by IS NULL
    GROUP BY m.organization_id`;
  const seatsOf = new Map(seats.map((row) => [row.organizationId, row._count._all]));
  const lastOf = new Map(sessions.map((row) => [row.organization_id, row.last_active.toISOString()]));
  return organizationIds.map((organizationId) => ({
    organizationId,
    seatsUsed: seatsOf.get(organizationId) ?? 0,
    lastActiveAt: lastOf.get(organizationId) ?? null,
  }));
}
```

`packages/domain/src/identity/erasure.ts`:
```ts
// Identity's part of permanent deletion (spec 5): erasing one removed person on a DPDP request, and the people of an
// organization being purged. Only the platform role runs these, in the console's purge and erasure jobs; the runtime
// role can't delete users' passwords or rename removed people this way.
import { withDeleted } from "@travel-crm/db";
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { shownEmail } from "./sign-in-names.js";

/** What an erased person's user row keeps: an id the audit log and other records still point to, and nothing else. */
const ERASED_NAME = "Erased person";
const erasedEmail = (userId: string) => `erased-${userId}@no-email.invalid`;

/** A person's sign-in data, for the export made before they are erased. */
export interface PersonExport {
  memberId: string;
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  joinedAt: string;
  removedAt: string | null;
}

/** The member of `organizationId`, removed or not, with their user. */
async function memberOf(tx: IdentityTx, organizationId: string, memberId: string) {
  const member = await withDeleted(() =>
    tx.member.findFirst({ where: { id: memberId, organizationId }, include: { user: true } }),
  );
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such person in this organization");
  return member;
}

export async function personExport(tx: IdentityTx, organizationId: string, memberId: string): Promise<PersonExport> {
  const member = await memberOf(tx, organizationId, memberId);
  return {
    memberId: member.id,
    userId: member.userId,
    name: member.user.name,
    // A removed person's current address is a placeholder; their own one is kept as the former email.
    email: shownEmail(member.user.formerEmail ?? member.user.email),
    username: member.user.displayUsername,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    removedAt: member.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Erases a removed person's sign-in data: name, addresses and usernames on the user row; their password, sessions,
 * two-factor secret and reset tokens. The rows that point at them (the membership, audit entries) keep the ids,
 * which now lead nowhere personal. Someone still a member must be removed first. Erasing twice changes nothing.
 * Returns the user's id, for the other modules' parts of the erasure.
 */
export async function erasePerson(
  tx: IdentityTx,
  organizationId: string,
  memberId: string,
): Promise<{ userId: string }> {
  const member = await memberOf(tx, organizationId, memberId);
  if (member.deletedAt === null) {
    throw new DomainError("CONFLICT", "REMOVE_FIRST", "Remove this person from the organization before erasing them");
  }
  const { userId } = member;
  await tx.user.update({
    where: { id: userId },
    data: {
      name: ERASED_NAME,
      email: erasedEmail(userId),
      formerEmail: null,
      username: null,
      displayUsername: null,
      image: null,
      banned: true,
      banReason: "Erased",
    },
  });
  await tx.account.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.twoFactor.deleteMany({ where: { userId } });
  // Better Auth's reset tokens name the user in their value.
  await tx.verification.deleteMany({ where: { value: userId } });
  return { userId };
}

/** Every user who has ever been a member of the organization: whose rows a purge deletes. */
export async function organizationUserIds(tx: IdentityTx, organizationId: string): Promise<string[]> {
  const members = await withDeleted(() => tx.member.findMany({ where: { organizationId }, select: { userId: true } }));
  return members.map((member) => member.userId);
}

/**
 * Deletes the users outright, with what hangs off them (their sessions, password accounts, two-factor secrets and
 * membership, by the user table's own cascades) and their reset tokens. For the organization purge only.
 */
export async function deleteUsers(tx: IdentityTx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  await tx.verification.deleteMany({ where: { value: { in: [...userIds] } } });
  const { count } = await tx.user.deleteMany({ where: { id: { in: [...userIds] } } });
  return count;
}
```

In `packages/domain/src/identity/identity.ts`:

replace:
```ts
import { staffInviteListener, type InviteDependencies } from "./staff-invites.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole } from "./staff.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";
```
with:
```ts
import { staffInviteListener, type InviteDependencies } from "./staff-invites.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole, type SeatLimit } from "./staff.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";
```

replace:
```ts
  auth: AuthSettings;
}
```
with:
```ts
  auth: AuthSettings;
  /** The seats each organization's plan gives; adding staff past them is refused. Unset: no limit. */
  seatLimit?: SeatLimit | undefined;
}
```

replace:
```ts
      list: (actor) => listStaff(database, actor),
      create: (actor, input) => createStaff(database, hashPassword, actor, input),
      updateRole: (actor, input) => updateStaffRole(database, actor, input),
```
with:
```ts
      list: (actor) => listStaff(database, actor),
      create: (actor, input) => createStaff(database, hashPassword, actor, input, options.seatLimit),
      updateRole: (actor, input) => updateStaffRole(database, actor, input),
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export type { PasswordResetEmail, PasswordResetSettings, SendPasswordResetEmail } from "./auth/password-reset.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { createOrganizationRecord, inviteOwner, requestInvite, type NewOrganization } from "./onboarding.js";
```
with:
```ts
export type { PasswordResetEmail, PasswordResetSettings, SendPasswordResetEmail } from "./auth/password-reset.js";
export { deleteUsers, erasePerson, organizationUserIds, personExport, type PersonExport } from "./erasure.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { memberActivity, type MemberActivity } from "./member-activity.js";
export { createOrganizationRecord, inviteOwner, requestInvite, type NewOrganization } from "./onboarding.js";
```

replace:
```ts
export type { CreatedStaff } from "./staff-accounts.js";
export { INVITE_LINK_HOURS, SEND_INVITE_LISTENER, type InviteDependencies } from "./staff-invites.js";
```
with:
```ts
export type { CreatedStaff } from "./staff-accounts.js";
export type { SeatLimit } from "./staff.js";
export { INVITE_LINK_HOURS, SEND_INVITE_LISTENER, type InviteDependencies } from "./staff-invites.js";
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-identity/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/identity/seats.test.ts test/identity/member-activity.test.ts test/identity/erasure.test.ts`

Expected: PASS, 7 tests in 3 files (packages/domain).

- [ ] **Step 6: Document it**

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
```
with:
```markdown
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`.
- Permanent deletion's steps, for the platform's jobs (spec 5): `personExport(tx, organizationId, memberId)` and
  `erasePerson(tx, organizationId, memberId)` (a removed person's name, addresses, password, sessions, two-factor
  secret and reset tokens; the membership row stays, so ids still lead somewhere), `organizationUserIds(tx,
organizationId)` and `deleteUsers(tx, userIds)` (a purge's people, with their sessions and memberships).
- `memberActivity(tx, organizationIds)`: seats used and the last sign-in's time per organization, for the platform
  dashboard.
- `IdentityOptions.seatLimit` (a `SeatLimit`): the seats an organization's plan gives. `staff.create` refuses past them
  (`LIMIT_REACHED`, `SEAT_LIMIT_REACHED`), holding the organization's row so two additions can't both take the last.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-identity && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=194 domain=448 eslint-config=81 integrations=141 (1,110). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-identity
git add packages/domain/src/identity/README.md packages/domain/src/identity/erasure.ts packages/domain/src/identity/identity.ts packages/domain/src/identity/index.ts packages/domain/src/identity/member-activity.ts packages/domain/src/identity/staff-accounts.ts packages/domain/src/identity/staff.ts packages/domain/test/identity/erasure.test.ts packages/domain/test/identity/member-activity.test.ts packages/domain/test/identity/seats.test.ts
git commit -m "feat(domain): erase a removed person, purge an organization's people, and count seats"
```

---
### Task D1: What each module keeps, for exports, purges and erasures

Spec 5: permanent deletion goes through the platform console, with an export first. The platform module (Track P)
runs it, but each module knows what it keeps, so each gets the hooks the purge and the erasure call, inside the
caller's transaction. **Files:** every stored object's key (removed files included, since their bytes stay until a
purge), one record's files deleted for good (refusing a system-owned record such as an issued PDF, which goes only
with its record), the stored bytes deleted after the commit, and an export's list of files with download links.
**Audit:** a record's entries for the export, their snapshots redacted to `{"redacted":true}` (who did what and when
stays), and a count for the dashboard; only the platform role may redact, through its column grant. **Notifications:**
a person's notifications and push subscriptions forgotten. **Documents:** a count of documents issued, for the
dashboard. The storage port gains `delete`.

**Files:**
- Create: `docs/adr/0022-permanent-deletion.md`, `packages/domain/src/audit/redaction.ts`, `packages/domain/src/documents/usage.ts`, `packages/domain/src/files/purge.ts`, `packages/domain/src/notifications/forget-recipient.ts`
- Modify: `packages/domain/src/audit/README.md`, `packages/domain/src/audit/index.ts`, `packages/domain/src/documents/README.md`, `packages/domain/src/documents/index.ts`, `packages/domain/src/files/README.md`, `packages/domain/src/files/index.ts`, `packages/domain/src/notifications/README.md`, `packages/domain/src/notifications/index.ts`, `packages/integrations/src/storage/memory-storage.ts`, `packages/integrations/src/storage/object-storage.ts`, `packages/integrations/src/storage/s3-storage.ts`
- Test: `packages/domain/test/audit/redaction.test.ts`, `packages/domain/test/documents/usage.test.ts`, `packages/domain/test/files/purge.test.ts`, `packages/domain/test/notifications/forget-recipient.test.ts`, `packages/integrations/test/storage/object-storage-contract.ts`

**Interfaces:**
- Consumes (plan 3): `ObjectStorage`, `createMemoryStorage`, `createS3Storage`, the storage contract test,
  `storageKeyOf`, `isSystemOwnedRecordType`, `bytesStored`, `downloadLink`'s presigning, `AuditEntry`.
- Produces:
  - `ObjectStorage.delete(key): Promise<void>` (a missing key is fine) in the memory and S3 adapters.
  - `@travel-crm/domain/files`: `storedFileKeys(tx, organizationId)`, `deleteRecordFiles(tx, record: FileRecord):
    Promise<string[]>` (the keys to delete after the commit; `SYSTEM_OWNED_FILE` for a system-owned record),
    `deleteStoredFiles(storage, keys)`, `exportedFiles(tx, storage, { organizationId, recordType?, recordId? },
    linkSeconds): Promise<ExportedFile[]>`, `bytesStored(tx)`; types `FileRecord` (`{ organizationId, recordType,
    recordId }`), `ExportedFile`.
  - `@travel-crm/domain/audit`: `AuditedRecord` (`{ organizationId, entityType, entityId }`),
    `auditEntriesAbout(tx, record): Promise<AuditEntry[]>`, `redactAuditEntries(tx, record): Promise<number>`,
    `auditEntriesSince(tx, since): Promise<number>`.
  - `@travel-crm/domain/notifications`: `forgetRecipient(tx, { organizationId, userId }): Promise<{ notifications,
    preferences, pushSubscriptions }>`.
  - `@travel-crm/domain/documents`: `documentsIssuedSince(tx, since): Promise<number>`.

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-data -b foundation/04-data foundation/04-platform
cd /Users/ak/personal/travel-crm-04-data && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/04-data` at Task 0.2's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

In `packages/integrations/test/storage/object-storage-contract.ts`:

replace:
```ts
      expect(text(await subject.storage.get(key))).toBe("%PDF-1.3");
    });
```
with:
```ts
      expect(text(await subject.storage.get(key))).toBe("%PDF-1.3");
    });

    it("deletes a stored file for good, and deleting again or nothing at all succeeds", async () => {
      const key = freshKey();
      await subject.storage.put({ key, contentType: "text/plain", body: bytes("gone soon") });
      await subject.storage.delete(key);
      expect(await subject.storage.head(key)).toBeNull();
      expect(await subject.storage.get(key)).toBeNull();
      await subject.storage.delete(key);
      await subject.storage.delete(freshKey());
      await expect(subject.storage.delete("../escape")).rejects.toThrow(RangeError);
    });
```

`packages/domain/test/files/purge.test.ts`:
```ts
// Permanent deletion of files (spec 5): the platform finds every stored file of an organization, removed ones
// included; deletes one record's files and their bytes for good; lists files with download links for an export; and
// leaves system-owned files (an issued document's PDF) to go only with their record.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { deleteRecordFiles, deleteStoredFiles, exportedFiles, storedFileKeys } from "../../src/files/index.js";
import { OWNER_ROLE_KEY } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000d7";

describe("permanent deletion of files", () => {
  let test: TestFiles;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestFiles();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** Stores a file on the record, the way the system stores generated files. */
  async function stored(organizationId: string, recordId: string, fileName: string) {
    return test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "traveller",
      recordId,
      fileName,
      contentType: "application/pdf",
      body: bytes("%PDF-1.3"),
    });
  }

  it("finds where every file of the organization is stored, removed ones included", async () => {
    const organizationId = await createOrganization(test);
    const kept = await stored(organizationId, traveller, "Visa.pdf");
    const removed = await stored(organizationId, traveller, "Old visa.pdf");
    await test.files.remove(memberOf(organizationId, OWNER_ROLE_KEY), {
      recordType: "traveller",
      recordId: traveller,
      attachmentId: removed.id,
    });
    const keys = await platformDb.transaction((tx) => storedFileKeys(tx, organizationId));
    expect(keys.sort()).toEqual(
      [kept.id, removed.id].map((id) => `organizations/${organizationId}/attachments/${id}`).sort(),
    );
  });

  it("deletes one record's files and their bytes for good, and nobody else's", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const otherTravellers = await stored(organizationId, "0199e7a0-0000-7000-8000-0000000000d8", "Ticket.pdf");
    const record = { organizationId, recordType: "traveller", recordId: traveller };
    const keys = await platformDb.transaction((tx) => deleteRecordFiles(tx, record));
    await deleteStoredFiles(test.storage, keys);
    expect(keys).toEqual([`organizations/${organizationId}/attachments/${visa.id}`]);
    expect(test.storage.objects.has(keys[0] ?? "")).toBe(false);
    const left = await platformDb.transaction((tx) => storedFileKeys(tx, organizationId));
    expect(left).toEqual([`organizations/${organizationId}/attachments/${otherTravellers.id}`]);
    // Again: nothing left to delete, and deleting stored bytes again is fine.
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, record))).toEqual([]);
    await deleteStoredFiles(test.storage, keys);
  });

  it("leaves an issued document's PDF to go only with its record, and refuses the runtime role", async () => {
    const organizationId = await createOrganization(test);
    await expect(
      platformDb.transaction((tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "issued_document", recordId: traveller }),
      ),
    ).rejects.toMatchObject({ reason: "SYSTEM_OWNED_FILE" });
    await stored(organizationId, traveller, "Visa.pdf");
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "traveller", recordId: traveller }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lists files for an export with download links, marking removed ones and leaving unfinished uploads unlinked", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const owner = memberOf(organizationId, OWNER_ROLE_KEY);
    const pending = await test.files.requestUpload(
      owner,
      passportUpload({ recordType: "traveller", recordId: traveller }),
    );
    const listed = await platformDb.transaction((tx) =>
      exportedFiles(tx, test.storage, { organizationId, recordType: "traveller", recordId: traveller }, 3600),
    );
    expect(listed).toEqual([
      expect.objectContaining({
        id: visa.id,
        fileName: "Visa.pdf",
        deleted: false,
        downloadUrl: expect.stringContaining("memory://download/") as string,
      }),
      expect.objectContaining({ id: pending.attachment.id, downloadUrl: null }),
    ]);
  });
});
```

`packages/domain/test/audit/redaction.test.ts`:
```ts
// The audit log's part in erasure (spec 5, ADR 0015): one record's entries for the export, then their snapshots
// redacted by the platform role, keeping who did what and when; and a month's changes, counted for the dashboard.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { auditEntriesAbout, auditEntriesSince, recordAudit, redactAuditEntries } from "../../src/audit/index.js";
import type { Actor } from "../../src/kernel/index.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000e7";
const someoneElse = "0199e7a0-0000-7000-8000-0000000000e8";

describe("the audit log in erasure", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit erasure");
    owner = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000e9", source: "web", impersonatedBy: null };
    await db.forOrg(organizationId, async (tx) => {
      for (let edit = 0; edit < 104; edit += 1) {
        await recordAudit(tx, owner, {
          action: "traveller.updated",
          entityType: "traveller",
          entityId: traveller,
          before: { phone: `+9198765${String(edit).padStart(5, "0")}` },
          after: { phone: `+9198765${String(edit + 1).padStart(5, "0")}` },
        });
      }
      await recordAudit(tx, owner, { action: "traveller.deleted", entityType: "traveller", entityId: traveller });
      await recordAudit(tx, owner, {
        action: "traveller.updated",
        entityType: "traveller",
        entityId: someoneElse,
        after: { name: "Ravi" },
      });
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("lists every entry about the record, past one page, for the export", async () => {
    const entries = await db.forOrg(organizationId, (tx) =>
      auditEntriesAbout(tx, { organizationId, entityType: "traveller", entityId: traveller }),
    );
    expect(entries).toHaveLength(105);
    expect(entries.every((entry) => entry.entityId === traveller)).toBe(true);
  });

  it("redacts the record's snapshots, keeping who did what and when, and nobody else's", async () => {
    const record = { organizationId, entityType: "traveller", entityId: traveller };
    expect(await platformDb.transaction((tx) => redactAuditEntries(tx, record))).toBe(104);
    const rows = await platform.auditEntry.findMany({ where: { organizationId }, orderBy: { id: "asc" } });
    const about = rows.filter((row) => row.entityId === traveller);
    expect(
      about
        .slice(0, 104)
        .every((row) => JSON.stringify([row.before, row.after]) === '[{"redacted":true},{"redacted":true}]'),
    ).toBe(true);
    expect(about.at(-1)).toMatchObject({
      action: "traveller.deleted",
      before: null,
      after: null,
      actorUserId: owner.userId,
    });
    expect(rows.find((row) => row.entityId === someoneElse)?.after).toEqual({ name: "Ravi" });
    // Redacting again finds nothing left to redact.
    expect(await platformDb.transaction((tx) => redactAuditEntries(tx, record))).toBe(0);
  });

  it("can't be redacted by the runtime role", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        redactAuditEntries(tx, { organizationId, entityType: "traveller", entityId: someoneElse }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("counts the changes recorded since a day, for the dashboard", async () => {
    expect(await db.forOrg(organizationId, (tx) => auditEntriesSince(tx, new Date(Date.now() - 60_000)))).toBe(106);
    expect(await db.forOrg(organizationId, (tx) => auditEntriesSince(tx, new Date(Date.now() + 60_000)))).toBe(0);
  });
});
```

`packages/domain/test/notifications/forget-recipient.test.ts`:
```ts
// Erasing one person (spec 5): every notification sent to them, their opt-outs and their browsers go, in their
// organization only; the platform role does it, and the runtime role can't.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { forgetRecipient, notify, setPreference } from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

describe("forgetting a person", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  const meera = "0199e7a0-0000-7000-8000-00000000f0a1";
  const ravi = "0199e7a0-0000-7000-8000-00000000f0a2";

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  /** An organization where Meera and Ravi each have a notification, an opt-out and a browser. */
  async function organizationWithPeople(): Promise<string> {
    const organizationId = await createTestOrganization(platform, "Forgetting");
    await db.forOrg(organizationId, async (tx) => {
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [meera, ravi],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Opened just now",
        channels: [],
      });
      for (const userId of [meera, ravi]) {
        await setPreference(tx, personIn(organizationId, userId), { channel: "email", kind: "*", optedOut: true });
        await tx.pushSubscription.create({
          data: { userId, endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, p256dh: "key", auth: "secret" },
        });
      }
    });
    return organizationId;
  }

  it("deletes the person's notifications, opt-outs and browsers, and nobody else's", async () => {
    const organizationId = await organizationWithPeople();
    const elsewhere = await organizationWithPeople();
    expect(await platformDb.transaction((tx) => forgetRecipient(tx, { organizationId, userId: meera }))).toEqual({
      notifications: 1,
      preferences: 1,
      pushSubscriptions: 1,
    });
    const left = await db.forOrg(organizationId, async (tx) => ({
      notifications: await tx.notification.findMany({ select: { recipientUserId: true } }),
      preferences: await tx.notificationPreference.findMany({ select: { userId: true } }),
      browsers: await tx.pushSubscription.findMany({ select: { userId: true } }),
    }));
    expect(left).toEqual({
      notifications: [{ recipientUserId: ravi }],
      preferences: [{ userId: ravi }],
      browsers: [{ userId: ravi }],
    });
    expect(await db.forOrg(elsewhere, (tx) => tx.notification.count({ where: { recipientUserId: meera } }))).toBe(1);
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = await organizationWithPeople();
    await expect(
      db.forOrg(organizationId, (tx) => forgetRecipient(tx, { organizationId, userId: ravi })),
    ).rejects.toThrow(/permission denied/);
  });
});
```

`packages/domain/test/documents/usage.test.ts`:
```ts
// How many documents an organization issued since a day: a usage counter for the platform dashboard (spec 7.4).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documentsIssuedSince, issueDocument } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

describe("documents issued", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  it("counts the organization's documents issued since a day, and only its own", async () => {
    const organizationId = await createOrganization(test);
    const other = await createOrganization(test);
    for (const issuer of [organizationId, organizationId, other]) {
      await test.db.forOrg(issuer, (tx) => issueDocument(tx, systemActor(issuer), { ...quotation }));
    }
    const lastMinute = new Date(Date.now() - 60_000);
    expect(await test.db.forOrg(organizationId, (tx) => documentsIssuedSince(tx, lastMinute))).toBe(2);
    expect(await test.db.forOrg(organizationId, (tx) => documentsIssuedSince(tx, new Date(Date.now() + 60_000)))).toBe(
      0,
    );
  });
});
```

The storage contract is shared by the memory and S3 adapters' tests, so both gain the `delete` case.

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/files/purge.test.ts test/audit/redaction.test.ts test/notifications/forget-recipient.test.ts test/documents/usage.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/integrations && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/storage/memory-storage.test.ts test/storage/s3-storage.test.ts`

Expected: FAIL. In `packages/domain`, all 11: `TypeError: storedFileKeys is not a function`, and likewise
`deleteRecordFiles`, `exportedFiles`, `auditEntriesAbout`, `redactAuditEntries`, `auditEntriesSince`,
`forgetRecipient` and `documentsIssuedSince`. In `packages/integrations`, the contract's new case fails for both
adapters: `TypeError: subject.storage.delete is not a function`.

- [ ] **Step 4: Let storage delete an object**

In `packages/integrations/src/storage/object-storage.ts`:

replace:
```ts
  get(key: string): Promise<Uint8Array | null>;
}
```
with:
```ts
  get(key: string): Promise<Uint8Array | null>;
  /**
   * Deletes the file stored under key, for good: the platform's purge and erasure only (spec 5). Deleting a key that
   * holds nothing succeeds, so a purge that stopped halfway can run again.
   */
  delete(key: string): Promise<void>;
}
```

In `packages/integrations/src/storage/memory-storage.ts`:

replace:
```ts
      }),
    upload: (upload, body, contentType) =>
```
with:
```ts
      }),
    delete: (key) =>
      promised(() => {
        assertSafeKey(key);
        objects.delete(key);
      }),
    upload: (upload, body, contentType) =>
```

In `packages/integrations/src/storage/s3-storage.ts`:

replace:
```ts
import {
  GetObjectCommand,
```
with:
```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
```

replace:
```ts
    },
  };
```
with:
```ts
    },

    async delete(key) {
      assertSafeKey(key);
      // S3 answers success for a key with nothing stored, so deleting is safe to repeat.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
```

- [ ] **Step 5: Give each module its hooks**

`packages/domain/src/files/purge.ts`:
```ts
// Permanent deletion of files (spec 5): attachment rows and the bytes in storage, gone for good, for the platform's
// purge of an organization and its erasure of one record's files. Only the platform role may delete attachment rows;
// until then a removed file stays stored, and counts.
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { DomainError } from "../kernel/index.js";
import { isSystemOwnedRecordType, storageKeyOf } from "./attachment-row.js";

/** One record whose files an erasure deletes, e.g. a traveller. */
export interface FileRecord {
  organizationId: string;
  recordType: string;
  recordId: string;
}

/** A file as an export lists it, with a link to download it while the link lasts. */
export interface ExportedFile {
  id: string;
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sensitive: boolean;
  /** Removed by its organization, and kept until a purge. */
  deleted: boolean;
  /** Null for a file whose upload never finished. */
  downloadUrl: string | null;
}

/**
 * Where every file of the organization is stored, removed ones included: what a purge must delete from storage. Read
 * it in the purge's own transaction, before the rows go.
 */
export async function storedFileKeys(tx: OrgTx, organizationId: string): Promise<string[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where: { organizationId }, select: { organizationId: true, id: true } }),
  );
  return rows.map(storageKeyOf);
}

/**
 * Deletes one record's attachment rows, removed ones included, and returns where their bytes are stored, for
 * deleteStoredFiles once the transaction has committed. A system-owned record's files (an issued document's PDF) are
 * refused: they go only with their record, in a purge.
 */
export async function deleteRecordFiles(tx: OrgTx, record: FileRecord): Promise<string[]> {
  if (isSystemOwnedRecordType(record.recordType)) {
    throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "These files belong to their record and go only with it");
  }
  // A plain DELETE: soft delete refuses Prisma's, and only the platform role has the right to it here.
  const deleted = await tx.$queryRaw<{ organization_id: string; id: string }[]>`
    DELETE FROM attachment
    WHERE organization_id = ${record.organizationId}::uuid
      AND record_type = ${record.recordType} AND record_id = ${record.recordId}::uuid
    RETURNING organization_id, id`;
  return deleted.map((row) => storageKeyOf({ organizationId: row.organization_id, id: row.id }));
}

/** Deletes stored bytes by key. Safe to repeat: a key that holds nothing is fine. */
export async function deleteStoredFiles(storage: ObjectStorage, keys: readonly string[]): Promise<void> {
  for (const key of keys) await storage.delete(key);
}

/** The organization's files, or one record's, removed ones included, each with a download link for `linkSeconds`. */
export async function exportedFiles(
  tx: OrgTx,
  storage: ObjectStorage,
  where: { organizationId: string; recordType?: string; recordId?: string },
  linkSeconds: number,
): Promise<ExportedFile[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  );
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      recordType: row.recordType,
      recordId: row.recordId,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      sensitive: row.sensitive,
      deleted: row.deletedAt !== null,
      downloadUrl:
        row.status === "ready"
          ? await storage.presignDownload({ key: storageKeyOf(row), fileName: row.fileName }, linkSeconds)
          : null,
    })),
  );
}
```

In `packages/domain/src/files/index.ts`:

replace:
```ts
export { createFiles, type Files } from "./files.js";
```
with:
```ts
export { createFiles, type Files } from "./files.js";
export {
  deleteRecordFiles,
  deleteStoredFiles,
  exportedFiles,
  storedFileKeys,
  type ExportedFile,
  type FileRecord,
} from "./purge.js";
export { bytesStored } from "./uploads.js";
```

`packages/domain/src/audit/redaction.ts`:
```ts
// The audit log's part in permanent deletion and the platform dashboard (spec 5, 7.4): one record's entries for an
// export, their redaction on erasure, and how many changes an organization made in a month.
import type { AuditEntry } from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";
import { listAuditEntries } from "./list-audit-entries.js";

/** One record whose entries an erasure redacts, e.g. a member or a traveller. */
export interface AuditedRecord {
  organizationId: string;
  entityType: string;
  entityId: string;
}

/** What a redacted side of an entry says: there was state, and it was erased. */
const REDACTED = { redacted: true };

/** Every entry about the record, newest first, in the transaction's organization: for the export before an erasure. */
export async function auditEntriesAbout(tx: OrgTx, record: AuditedRecord): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];
  let before: string | undefined;
  do {
    const page = await listAuditEntries(tx, {
      entityType: record.entityType,
      entityId: record.entityId,
      limit: 100,
      ...(before ? { before } : {}),
    });
    entries.push(...page.entries);
    before = page.nextCursor ?? undefined;
  } while (before);
  return entries;
}

/**
 * Replaces the before and after of every entry about the record with `{ "redacted": true }`, keeping who did what and
 * when (ADR 0015: the only change the platform role may make to an entry). Entries about other records name people by
 * id only, so they need nothing. Returns how many entries had state to redact.
 */
export async function redactAuditEntries(tx: OrgTx, record: AuditedRecord): Promise<number> {
  const redacted = JSON.stringify(REDACTED);
  return tx.$executeRaw`
    UPDATE audit_entry
    SET before = CASE WHEN before IS NULL THEN NULL ELSE ${redacted}::jsonb END,
        after = CASE WHEN after IS NULL THEN NULL ELSE ${redacted}::jsonb END
    WHERE organization_id = ${record.organizationId}::uuid
      AND entity_type = ${record.entityType} AND entity_id = ${record.entityId}::uuid
      AND (before <> ${redacted}::jsonb OR after <> ${redacted}::jsonb)`;
}

/** Changes the transaction's organization recorded since `since`: a usage counter for the platform dashboard. */
export async function auditEntriesSince(tx: OrgTx, since: Date): Promise<number> {
  return tx.auditEntry.count({ where: { occurredAt: { gte: since } } });
}
```

In `packages/domain/src/audit/index.ts`:

replace:
```ts
export { assertAuditable, recordAudit, type AuditChange, type AuditSnapshot } from "./record-audit.js";
```
with:
```ts
export { assertAuditable, recordAudit, type AuditChange, type AuditSnapshot } from "./record-audit.js";
export { auditEntriesAbout, auditEntriesSince, redactAuditEntries, type AuditedRecord } from "./redaction.js";
```

`packages/domain/src/notifications/forget-recipient.ts`:
```ts
// Erasing one person (spec 5): every notification sent to them, their opt-outs and their browsers go. Run by the
// platform's erasure as the platform role; the runtime role may not delete notifications.
import type { OrgTx } from "@travel-crm/db";

/** Deletes what notifications keep about the person in the organization, and says how many of each went. */
export async function forgetRecipient(
  tx: OrgTx,
  person: { organizationId: string; userId: string },
): Promise<{ notifications: number; preferences: number; pushSubscriptions: number }> {
  const where = { organizationId: person.organizationId };
  const notifications = await tx.notification.deleteMany({ where: { ...where, recipientUserId: person.userId } });
  const preferences = await tx.notificationPreference.deleteMany({ where: { ...where, userId: person.userId } });
  const pushSubscriptions = await tx.pushSubscription.deleteMany({ where: { ...where, userId: person.userId } });
  return {
    notifications: notifications.count,
    preferences: preferences.count,
    pushSubscriptions: pushSubscriptions.count,
  };
}
```

In `packages/domain/src/notifications/index.ts`:

replace:
```ts
export { forgetPushSubscriptionsListener } from "./forget-push-subscriptions.js";
export { notify } from "./notify.js";
```
with:
```ts
export { forgetPushSubscriptionsListener } from "./forget-push-subscriptions.js";
export { forgetRecipient } from "./forget-recipient.js";
export { notify } from "./notify.js";
```

`packages/domain/src/documents/usage.ts`:
```ts
// How many documents an organization issued: a usage counter for the platform dashboard (spec 7.4).
import type { OrgTx } from "@travel-crm/db";

/** Documents the transaction's organization issued since `since`. */
export async function documentsIssuedSince(tx: OrgTx, since: Date): Promise<number> {
  return tx.issuedDocument.count({ where: { issuedAt: { gte: since } } });
}
```

In `packages/domain/src/documents/index.ts`:

replace:
```ts
export { sampleQuotation, type SampleQuotation, type SampleQuotationLine } from "./sample-quotation.js";
```
with:
```ts
export { sampleQuotation, type SampleQuotation, type SampleQuotationLine } from "./sample-quotation.js";
export { documentsIssuedSince } from "./usage.js";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/files/purge.test.ts test/audit/redaction.test.ts test/notifications/forget-recipient.test.ts test/documents/usage.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/integrations && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/storage/memory-storage.test.ts test/storage/s3-storage.test.ts`

Expected: PASS, 11 tests in 4 files (packages/domain); 32 tests in 2 files (packages/integrations).

- [ ] **Step 7: Record the decision**

`docs/adr/0022-permanent-deletion.md`:
```markdown
# 0022: Permanent deletion: purging an organization, erasing one person

Date: 2026-10-16 · Status: accepted · Implements spec section 5 ("permanent deletion happens only through a
super-admin action in the platform console")

## Decision

- **Each module deletes what it owns**, through a function the platform's jobs call in a platform transaction, so no
  module reaches another's tables:
  - files: `storedFileKeys` and `deleteRecordFiles` give the storage keys of the rows they cover; the bytes are deleted
    with the storage port's new `delete`, after the transaction commits, and deleting again is harmless. A
    system-owned record's files (an issued document's PDF) go only with their record, in a whole-organization purge;
  - audit: `redactAuditEntries` replaces one record's snapshots with `{ "redacted": true }` through the platform role's
    column grant (ADR 0015), keeping who did what and when;
  - notifications: `forgetRecipient` deletes the person's notifications, opt-outs and push subscriptions;
  - identity: `erasePerson` clears a removed person's name, addresses and every way to sign in, keeping the user's id,
    and `deleteUsers` deletes an organization's people (ADR 0021's module).
- **Exports first.** `exportedFiles` and `auditEntriesAbout` give what the export before a purge or an erasure holds;
  the export lists files with download links that lapse, rather than copying them.
- **The runtime role can't do any of it.** It has no right to delete attachments or notifications, or to change audit
  entries; each of these functions fails with "permission denied" outside a platform transaction.

## Context

- **Why bytes after the commit.** If the transaction rolls back, the files are still there with their rows. If the
  storage deletes stop halfway, rerunning the job deletes the rest: a key with nothing stored is fine.
- **Why redact rather than delete audit entries.** The log says that something happened, by whom and when; erasure
  removes what it says about the person, and nothing else.

## Consequences

- A PDF render that runs at the very moment of an organization's purge could store its one file after the purge's
  storage pass. Purges run only on cancelled organizations, which make nothing new, so the window is a job queued
  before the cancellation.
- Later modules (CRM's travellers) add their own step to erasure, as these do.
```

In `packages/domain/src/files/README.md`:

replace:
```markdown

## Events
```
with:
```markdown

- Permanent deletion and exports, for the platform's purge and erasure (spec 5), in a platform transaction:
  `storedFileKeys(tx, organizationId)` (every file, removed ones included), `deleteRecordFiles(tx, { organizationId,
recordType, recordId })` (deletes the rows and returns their storage keys; a system-owned record's files are
  refused), `deleteStoredFiles(storage, keys)` (after the transaction commits; safe to repeat), and
  `exportedFiles(tx, storage, where, linkSeconds)` (files with download links). `bytesStored(tx)`: the storage used.

## Events
```

In `packages/domain/src/audit/README.md`:

replace:
```markdown
- Types: `AuditChange`, `AuditSnapshot`. The contracts are in `@travel-crm/contracts/audit`.
```
with:
```markdown
- Types: `AuditChange`, `AuditSnapshot`. The contracts are in `@travel-crm/contracts/audit`.

- `auditEntriesAbout(tx, { organizationId, entityType, entityId })`: every entry about one record, for an export.
- `redactAuditEntries(tx, record)`: the platform role's erasure (spec 5): replaces each entry's `before` and `after`
  with `{ "redacted": true }` (sides with no state stay null), keeping who did what and when. Returns how many changed;
  a second run changes none.
- `auditEntriesSince(tx, since)`: changes recorded since a time, a usage counter for the platform dashboard.
```

In `packages/domain/src/notifications/README.md`:

replace:
```markdown
- Type `Person`: an actor with a user id. A job has no bell (`FORBIDDEN`/`NOT_A_PERSON`).
```
with:
```markdown
- Type `Person`: an actor with a user id. A job has no bell (`FORBIDDEN`/`NOT_A_PERSON`).

- `forgetRecipient(tx, { organizationId, userId })`: an erasure's part (spec 5): the person's notifications, opt-outs
  and push subscriptions, deleted by the platform role.
```

In `packages/domain/src/documents/README.md`:

replace:
```markdown

## Events
```
with:
```markdown

- `documentsIssuedSince(tx, since)`: a usage counter for the platform dashboard.

## Events
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-data && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=194 domain=442 eslint-config=81 integrations=143 (1,106). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-data
git add docs/adr/0022-permanent-deletion.md packages/domain/src/audit/README.md packages/domain/src/audit/index.ts packages/domain/src/audit/redaction.ts packages/domain/src/documents/README.md packages/domain/src/documents/index.ts packages/domain/src/documents/usage.ts packages/domain/src/files/README.md packages/domain/src/files/index.ts packages/domain/src/files/purge.ts packages/domain/src/notifications/README.md packages/domain/src/notifications/forget-recipient.ts packages/domain/src/notifications/index.ts packages/domain/test/audit/redaction.test.ts packages/domain/test/documents/usage.test.ts packages/domain/test/files/purge.test.ts packages/domain/test/notifications/forget-recipient.test.ts packages/integrations/src/storage/memory-storage.ts packages/integrations/src/storage/object-storage.ts packages/integrations/src/storage/s3-storage.ts packages/integrations/test/storage/object-storage-contract.ts
git commit -m "feat: let each module delete or redact what it keeps, for the platform's purge and erasure"
```

---
### Task D2: An organization's rows from the catalog, and its webhook events tombstoned

A purge must delete every organization table, including the ones later plans add, so the list comes from Postgres's
catalog: every table with `organization_id`, in foreign-key order, `audit_entry` first (its key to `organization`
restricts deletes, and a cascade would run as the table owner, past the audit log's grants; ADR 0015). The same walk
exports an organization's rows. Webhook events have no organization of their own (no row-level security), so a
processed event now records the organization its handler found (`processing.isAbout(organizationId)`), and a purge
or an erasure tombstones that organization's processed events: payload and headers blanked, the provider's id kept,
so a replay is still ignored. Only the platform role may do either.

**Files:**
- Create: `packages/db/prisma/migrations/20261016120000_webhook_event_organizations/migration.sql`, `packages/db/src/organization-rows.ts`, `packages/domain/src/webhooks/tombstones.ts`
- Modify: `docs/adr/0022-permanent-deletion.md`, `packages/db/README.md`, `packages/db/prisma/schema/webhooks.prisma`, `packages/db/src/platform.ts`, `packages/domain/src/webhooks/README.md`, `packages/domain/src/webhooks/index.ts`, `packages/domain/src/webhooks/process-webhook-event.ts`, `packages/domain/src/webhooks/provider.ts`
- Test: `packages/db/test/organization-rows.test.ts`, `packages/domain/test/webhooks/tombstones.test.ts`

**Interfaces:**
- Consumes (Task 0.1, plan 3): `PlatformTx`, `TransactionClient`, `assertOrganizationId`, `webhookEvents`,
  `processWebhookEvent`, `WebhookProvider`, the webhook test helpers.
- Produces:
  - `@travel-crm/db/platform`: `organizationRows(tx, organizationId, { except? }): Promise<Record<string, unknown[]>>`
    and
    `deleteOrganizationRows(tx, organizationId): Promise<Record<string, number>>` (rows deleted by table, the
    organization's own row last).
  - `webhook_event.resolved_organization_id` and `tombstoned_at`.
  - `@travel-crm/domain/webhooks`: `WebhookProcessing` (`{ isAbout(organizationId: string): void }`), passed as
    `WebhookProvider.process(event, processing)`'s second argument; `tombstoneWebhookEvents(tx, organizationId):
    Promise<{ tombstoned: number; waiting: number }>`.

- [ ] **Step 1: Write the failing tests**

`packages/db/test/organization-rows.test.ts`:
```ts
// The platform's purge and export of one organization (spec 5): every table with organization_id, found from the
// catalog, deleted in an order no foreign key trips over, the organization last; another organization untouched.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  deleteOrganizationRows,
  organizationRows,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { orgTableFixtures } from "./org-table-fixtures.js";

/** Every table with organization_id, Better Auth's member and invitation included. */
async function organizationTables(platform: PlatformClient): Promise<string[]> {
  const rows = await platform.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  return rows.map((row) => row.table_name);
}

describe("an organization's rows", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  /** An organization with a row in every organization table: each module's isolation fixture, and a member. */
  async function populated(name: string): Promise<string> {
    const organizationId = await createTestOrganization(platform, name);
    for (const fixture of Object.values(orgTableFixtures)) await db.forOrg(organizationId, fixture.create);
    const user = await platform.user.create({ data: { name, email: `${randomUUID()}@example.test` } });
    await platform.member.create({ data: { organizationId, userId: user.id, role: "isolation-role" } });
    await platform.invitation.create({
      data: { organizationId, email: `${randomUUID()}@example.test`, inviterId: user.id, expiresAt: new Date() },
    });
    return organizationId;
  }

  const rowsOf = async (organizationId: string): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const table of await organizationTables(platform)) {
      const [row] = await platform.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ${Prisma.raw(`"${table}"`)} WHERE organization_id = ${organizationId}::uuid`;
      counts[table] = row?.n ?? 0;
    }
    return counts;
  };

  it("exports every row of the organization, by table, with the organization's own", async () => {
    const organizationId = await populated("Exported");
    const exported = await platformDb.transaction((tx) =>
      organizationRows(tx, organizationId, { except: ["outbox_event"] }),
    );
    expect(exported.organization).toEqual([expect.objectContaining({ id: organizationId, name: "Exported" })]);
    expect(exported.outbox_event).toBeUndefined();
    for (const table of (await organizationTables(platform)).filter((name) => name !== "outbox_event")) {
      expect(exported[table]?.length, table).toBeGreaterThan(0);
    }
  });

  it("deletes every row of the organization, audit entries first, then the organization, and no one else's", async () => {
    const purged = await populated("Purged");
    const kept = await populated("Kept");
    const keptBefore = await rowsOf(kept);
    const deleted = await platformDb.transaction((tx) => deleteOrganizationRows(tx, purged));
    expect(Object.keys(deleted)[0]).toBe("audit_entry");
    expect(deleted.organization).toBe(1);
    expect(Object.values(await rowsOf(purged)).every((count) => count === 0)).toBe(true);
    expect(await platform.organization.count({ where: { id: purged } })).toBe(0);
    expect(await rowsOf(kept)).toEqual(keptBefore);
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = await createTestOrganization(platform, "Runtime");
    await expect(db.withoutOrg((tx) => deleteOrganizationRows(tx as never, organizationId))).rejects.toThrow(
      /permission denied/,
    );
  });
});
```

`packages/domain/test/webhooks/tombstones.test.ts`:
```ts
// What a purge or an erasure does to stored webhook events (ADR 0013, ADR 0022): the worker keeps each event with the
// organization its handler found, and the platform role later blanks those events' payloads and headers, keeping the
// provider's id, so a replay is still ignored.
import { createHmac, randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { webhookEvents } from "@travel-crm/db/webhooks";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  hmacSha256Signature,
  processWebhookEvent,
  receiveWebhook,
  tombstoneWebhookEvents,
  type WebhookProvider,
} from "../../src/webhooks/index.js";

const secret = "tombstone-provider-secret";

/** A provider whose events name the organization they are about, in the payload, as Razorpay's notes do. */
const provider: WebhookProvider = {
  name: "notes",
  keptHeaders: ["x-notes-signature"],
  verify: hmacSha256Signature({ secret, header: "x-notes-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "payment.captured" }),
  process: (event, processing) => {
    processing.isAbout((JSON.parse(event.payload) as { organizationId: string }).organizationId);
    return Promise.resolve();
  },
};

describe("webhook tombstones", () => {
  let db: Database;
  let platformDb: PlatformDatabase;
  const queue = createMemoryJobQueue();

  beforeAll(() => {
    const urls = inject("dbUrls");
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await db.disconnect();
  });

  /** Delivers an event about the organization, carrying a customer's phone number, and returns its stored row's id. */
  async function delivered(
    organizationId: string,
    process = true,
  ): Promise<{ id: string; body: string; providerEventId: string }> {
    const providerEventId = `pay_${randomUUID()}`;
    const body = JSON.stringify({ id: providerEventId, organizationId, contact: "+919876543210" });
    const headers = new Headers({ "x-notes-signature": createHmac("sha256", secret).update(body).digest("hex") });
    await receiveWebhook({ db, queue, providers: [provider] }, "notes", { headers, rawBody: body });
    const row = await db.withoutOrg((tx) =>
      webhookEvents(tx).findUniqueOrThrow({
        where: { provider_providerEventId: { provider: "notes", providerEventId } },
      }),
    );
    if (process) await processWebhookEvent({ db, providers: [provider] }, row.id);
    return { id: row.id, body, providerEventId };
  }

  const rowOf = (id: string) => db.withoutOrg((tx) => webhookEvents(tx).findUniqueOrThrow({ where: { id } }));

  it("keeps each processed event with the organization its handler found", async () => {
    const organizationId = randomUUID();
    const event = await delivered(organizationId);
    expect(await rowOf(event.id)).toMatchObject({ resolvedOrganizationId: organizationId, tombstonedAt: null });
  });

  it("blanks the organization's processed events, keeping their ids, and leaves others and waiting ones alone", async () => {
    const organizationId = randomUUID();
    const done = await delivered(organizationId);
    const otherOrganizations = await delivered(randomUUID());
    expect(await platformDb.transaction((tx) => tombstoneWebhookEvents(tx, organizationId))).toEqual({
      tombstoned: 1,
      waiting: 0,
    });
    expect(await rowOf(done.id)).toMatchObject({
      provider: "notes",
      providerEventId: done.providerEventId,
      payload: "",
      headers: {},
      tombstonedAt: expect.any(Date) as Date,
    });
    expect((await rowOf(otherOrganizations.id)).payload).toBe(otherOrganizations.body);
    // A replay of the blanked event is still recognised, and stores nothing.
    const replay = new Headers({ "x-notes-signature": createHmac("sha256", secret).update(done.body).digest("hex") });
    expect(
      await receiveWebhook({ db, queue, providers: [provider] }, "notes", { headers: replay, rawBody: done.body }),
    ).toEqual({ status: 200 });
    expect((await rowOf(done.id)).payload).toBe("");
    // Tombstoning again finds nothing more.
    expect(await platformDb.transaction((tx) => tombstoneWebhookEvents(tx, organizationId))).toEqual({
      tombstoned: 0,
      waiting: 0,
    });
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = randomUUID();
    await delivered(organizationId);
    await expect(db.withoutOrg((tx) => tombstoneWebhookEvents(tx, organizationId))).rejects.toThrow(
      /permission denied/,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization-rows.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/webhooks/tombstones.test.ts`

Expected: FAIL. In `packages/db`, `TypeError: organizationRows is not a function` and `deleteOrganizationRows is not a
function` (all 3). In `packages/domain`, the providers' handlers get no second argument: `Cannot read properties of
undefined (reading 'isAbout')` (all 3).

- [ ] **Step 3: Record which organization a webhook event was about**

In `packages/db/prisma/schema/webhooks.prisma`:

replace:
```prisma
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
  /// The error's name or code only, at most 100 characters: never its message, which may quote the payload.
  lastError       String?   @map("last_error")

  @@unique([provider, providerEventId])
  @@map("webhook_event")
```
with:
```prisma
model WebhookEvent {
  id                     String    @id @default(uuid(7)) @db.Uuid
  /// The provider's name, as in /webhooks/<provider>, e.g. "razorpay" (CHECK webhook_event_provider_format).
  provider               String
  /// The provider's own id for the event: repeats share it.
  providerEventId        String    @map("provider_event_id")
  eventType              String    @map("event_type")
  receivedAt             DateTime  @default(now()) @map("received_at") @db.Timestamptz(6)
  /// Only the headers the provider names, never cookies or authorization.
  headers                Json
  /// The raw body exactly as received: the signature was computed over it.
  payload                String
  processedAt            DateTime? @map("processed_at") @db.Timestamptz(6)
  /// Processing attempts so far, failed ones included.
  attempts               Int       @default(0)
  /// The error's name or code only, at most 100 characters: never its message, which may quote the payload.
  lastError              String?   @map("last_error")
  /// The organization the provider's handler found the event to be about, once processed: a purge of that
  /// organization finds its events by it. No foreign key, and not organization_id: the table has no row-level security.
  resolvedOrganizationId String?   @map("resolved_organization_id") @db.Uuid
  /// When a purge or an erasure blanked the payload and headers. The provider's id stays, so a replay is still ignored.
  tombstonedAt           DateTime? @map("tombstoned_at") @db.Timestamptz(6)

  @@unique([provider, providerEventId])
  /// An organization's events, for its purge.
  @@index([resolvedOrganizationId])
  @@map("webhook_event")
```

- [ ] **Step 4: Create the migration**



Create the migration from the schema change alone, without a database: `git archive HEAD` still holds the schema from before this task, so no track diffs against another's tables.
```bash
cd /Users/ak/personal/travel-crm-04-data/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261016120000_webhook_event_organizations
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script --output prisma/migrations/20261016120000_webhook_event_organizations/migration.sql
pnpm generate
```
Expected: the generated part of the file below, down to the banner. Append the hand-written part, so the whole file reads:

`packages/db/prisma/migrations/20261016120000_webhook_event_organizations/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "webhook_event" ADD COLUMN     "resolved_organization_id" UUID,
ADD COLUMN     "tombstoned_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "webhook_event_resolved_organization_id_idx" ON "webhook_event"("resolved_organization_id");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- The worker records which organization an event was about when it processes it, and nothing else new. Only the
-- platform role tombstones an event (ADR 0013, ADR 0022): it blanks the payload and the headers, keeping the
-- provider's id so a replay of the event is still ignored.
GRANT UPDATE (resolved_organization_id) ON TABLE "webhook_event" TO app_runtime;
ALTER TABLE "webhook_event"
  ADD CONSTRAINT webhook_event_tombstone_blank CHECK (tombstoned_at IS NULL OR (payload = '' AND headers = '{}'::jsonb));
```

- [ ] **Step 5: Walk the catalog, and tombstone the events**

`packages/db/src/organization-rows.ts`:
```ts
// An organization's rows in every table that carries organization_id, for the platform's purge and export (spec 5).
// The tables come from the database's own catalog, so a module's new table is covered without a list to keep up.
// Only @travel-crm/db/platform exports these.
import type { DatabaseClient } from "./client.js";
import { assertOrganizationId, type TransactionClient } from "./for-org.js";

/** The raw-SQL methods with SQL as a string: table names come from the catalog, never from a caller. */
type RawStrings = Pick<DatabaseClient, "$executeRawUnsafe" | "$queryRawUnsafe">;

const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * The tables with organization_id, each after every table that refers to it, so deleting in this order never trips
 * a foreign key. audit_entry comes first: its key to organization restricts deletes (ADR 0015).
 */
async function tablesInDeleteOrder(tx: TransactionClient): Promise<string[]> {
  const tables = (
    await tx.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p') AND c.relname <> 'organization'
      ORDER BY c.relname`
  ).map((row) => row.name);
  const references = await tx.$queryRaw<{ child: string; parent: string }[]>`
    SELECT DISTINCT child.relname AS child, parent.relname AS parent
    FROM pg_constraint k
    JOIN pg_class child ON child.oid = k.conrelid
    JOIN pg_class parent ON parent.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
    WHERE k.contype = 'f' AND child.oid <> parent.oid`;
  const ordered = ["audit_entry"].filter((name) => tables.includes(name));
  const remaining = tables.filter((name) => !ordered.includes(name));
  while (remaining.length > 0) {
    // A table may go once no remaining table refers to it.
    const next = remaining.find(
      (table) =>
        !references.some((ref) => ref.parent === table && ref.child !== table && remaining.includes(ref.child)),
    );
    if (next === undefined) throw new Error(`Foreign keys between ${remaining.join(", ")} form a cycle`);
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
}

/**
 * Deletes every row of the organization, in every table that has organization_id (Better Auth's member and
 * invitation included), then the organization itself, in a platform transaction. Returns how many rows went from each
 * table. The organization's users have no organization_id: identity deletes them (`deleteUsers`).
 */
export async function deleteOrganizationRows(
  tx: TransactionClient,
  organizationId: string,
): Promise<Record<string, number>> {
  assertOrganizationId(organizationId);
  const raw = tx as unknown as RawStrings;
  const deleted: Record<string, number> = {};
  for (const table of await tablesInDeleteOrder(tx)) {
    deleted[table] = await raw.$executeRawUnsafe(
      `DELETE FROM ${quoted(table)} WHERE organization_id = $1::uuid`,
      organizationId,
    );
  }
  deleted.organization = await raw.$executeRawUnsafe(`DELETE FROM organization WHERE id = $1::uuid`, organizationId);
  return deleted;
}

/**
 * Every row of the organization as JSON, by table, and the organization's own row: an export's data. Tables listed in
 * `except` (internal ones such as the outbox) are left out.
 */
export async function organizationRows(
  tx: TransactionClient,
  organizationId: string,
  options: { except?: readonly string[] } = {},
): Promise<Record<string, unknown[]>> {
  assertOrganizationId(organizationId);
  const raw = tx as unknown as RawStrings;
  const tables = ["organization", ...(await tablesInDeleteOrder(tx)).sort()].filter(
    (table) => !(options.except ?? []).includes(table),
  );
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const column = table === "organization" ? "id" : "organization_id";
    const found = await raw.$queryRawUnsafe<{ row: unknown }[]>(
      `SELECT row_to_json(t) AS row FROM ${quoted(table)} t WHERE ${column} = $1::uuid`,
      organizationId,
    );
    rows[table] = found.map((entry) => entry.row);
  }
  return rows;
}
```

In `packages/db/src/platform.ts`:

replace:
```ts
export { WrongPlatformRoleError } from "./errors.js";
export type { ForOrgOptions, IdentityTx, OrgTx } from "./for-org.js";
```
with:
```ts
export { WrongPlatformRoleError } from "./errors.js";
export { deleteOrganizationRows, organizationRows } from "./organization-rows.js";
export type { ForOrgOptions, IdentityTx, OrgTx } from "./for-org.js";
```

In `packages/domain/src/webhooks/provider.ts`:

replace:
```ts

export interface WebhookProvider {
```
with:
```ts

/** What a provider's handler tells the intake about the event it processes. */
export interface WebhookProcessing {
  /**
   * The organization the event is about, once the handler has found it: the event is kept with it, so that
   * organization's purge, or an erasure in it, can blank the stored payload (ADR 0022).
   */
  isAbout(organizationId: string): void;
}

export interface WebhookProvider {
```

replace:
```ts
   * transaction, so a crash or a retry can run it again. Do the work idempotently inside db.forOrg(), keyed by
   * `event.id` or `event.providerEventId` (for example a unique key on the payment record).
   */
  process(event: StoredWebhookEvent): Promise<void>;
}
```
with:
```ts
   * transaction, so a crash or a retry can run it again. Do the work idempotently inside db.forOrg(), keyed by
   * `event.id` or `event.providerEventId` (for example a unique key on the payment record). Tell `processing` which
   * organization the event was about.
   */
  process(event: StoredWebhookEvent, processing: WebhookProcessing): Promise<void>;
}
```

In `packages/domain/src/webhooks/process-webhook-event.ts`:

replace:
```ts
  };
  try {
    await provider.process(event);
  } catch (error) {
```
with:
```ts
  };
  let organizationId: string | null = null;
  try {
    await provider.process(event, {
      isAbout: (id) => {
        organizationId = id;
      },
    });
  } catch (error) {
```

replace:
```ts
      where: { id: row.id, processedAt: null },
      data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
    }),
```
with:
```ts
      where: { id: row.id, processedAt: null },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
        resolvedOrganizationId: organizationId,
      },
    }),
```

`packages/domain/src/webhooks/tombstones.ts`:
```ts
// Blanking stored webhook payloads (ADR 0013, ADR 0022): a purge or an erasure keeps an event's provider id, so a
// replay is still ignored, and drops what the provider sent, which may hold personal data. The platform role only.
import type { OrgTx } from "@travel-crm/db";
import { webhookEvents } from "@travel-crm/db/webhooks";

/**
 * Tombstones the events processed for the organization: their payloads and headers blanked, their ids kept. An event
 * still waiting to be processed is left alone (its handler needs it) and counted, so the caller can run this again
 * once it has been processed. Runs in a platform transaction.
 */
export async function tombstoneWebhookEvents(
  tx: OrgTx,
  organizationId: string,
): Promise<{ tombstoned: number; waiting: number }> {
  const events = webhookEvents(tx);
  const { count } = await events.updateMany({
    where: { resolvedOrganizationId: organizationId, processedAt: { not: null }, tombstonedAt: null },
    data: { payload: "", headers: {}, tombstonedAt: new Date() },
  });
  // Unprocessed events have no organization yet, unless a handler failed after finding it: those wait.
  const waiting = await events.count({ where: { resolvedOrganizationId: organizationId, processedAt: null } });
  return { tombstoned: count, waiting };
}
```

In `packages/domain/src/webhooks/index.ts`:

replace:
```ts
} from "./process-webhook-event.js";
export type { StoredWebhookEvent, WebhookProvider, WebhookRequest } from "./provider.js";
export {
```
with:
```ts
} from "./process-webhook-event.js";
export type { StoredWebhookEvent, WebhookProcessing, WebhookProvider, WebhookRequest } from "./provider.js";
export {
```

replace:
```ts
} from "./receive-webhook.js";
```
with:
```ts
} from "./receive-webhook.js";
export { tombstoneWebhookEvents } from "./tombstones.js";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization-rows.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-data/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/webhooks/tombstones.test.ts`

Expected: PASS, 3 tests in 1 file (packages/db); 3 tests in 1 file (packages/domain).

- [ ] **Step 7: Record the decision**

In `docs/adr/0022-permanent-deletion.md`:

replace:
```markdown
    and `deleteUsers` deletes an organization's people (ADR 0021's module).
- **Exports first.** `exportedFiles` and `auditEntriesAbout` give what the export before a purge or an erasure holds;
```
with:
```markdown
    and `deleteUsers` deletes an organization's people (ADR 0021's module).
- **Whole organizations from the catalog.** `deleteOrganizationRows` (`@travel-crm/db/platform`) finds every table
  with `organization_id` in the database's catalog, deletes the organization's rows in an order no foreign key trips
  over (`audit_entry` first, as its key restricts), then the organization. A later module's table needs no change
  here. `organizationRows` exports the same rows as JSON.
- **Webhook events become tombstones.** The worker keeps each processed event with the organization its handler
  found (`resolved_organization_id`, reported by `processing.isAbout`); a purge or an erasure blanks those events'
  payloads and headers and keeps their provider ids, so a replayed event is still ignored (ADR 0013's consequence).
- **Exports first.** `exportedFiles` and `auditEntriesAbout` give what the export before a purge or an erasure holds;
```

In `packages/db/README.md`:

replace:
```markdown
(`webhookEvents(tx)`); a transaction stepped into an organization does not.
```
with:
```markdown
(`webhookEvents(tx)`); a transaction stepped into an organization does not.

For permanent deletion (ADR 0022), `deleteOrganizationRows(tx, organizationId)` deletes the organization's rows in
every table that has `organization_id`, found from the catalog and ordered so no foreign key trips (`audit_entry`
first), then the organization; `organizationRows(tx, organizationId, { except })` returns them as JSON, by table, for
an export. A new organization table is covered without being listed anywhere.
```

In `packages/domain/src/webhooks/README.md`:

replace:
```markdown
  with HMAC-SHA256.
- `WEBHOOK_PROCESS_QUEUE` (`"webhooks.process"`), and the types `WebhookProvider`, `WebhookRequest`,
```
with:
```markdown
  with HMAC-SHA256.
- `tombstoneWebhookEvents(tx, organizationId)`: for the platform's purge and erasure (ADR 0022), in a platform
  transaction: blanks the payload and headers of the organization's processed events, keeping their provider ids, and
  counts the events still waiting to be processed.
- `WEBHOOK_PROCESS_QUEUE` (`"webhooks.process"`), and the types `WebhookProvider`, `WebhookRequest`,
```

replace:
```markdown

- A provider is `{ name, keptHeaders, verify, identify, process }`. `verify` (which may be asynchronous) returns false
```
with:
```markdown

- A provider's `process(event, processing)` calls `processing.isAbout(organizationId)` once it has found the
  organization: the event is kept with it (`resolved_organization_id`), so a purge or an erasure can blank it.
- A provider is `{ name, keptHeaders, verify, identify, process }`. `verify` (which may be asynchronous) returns false
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-data && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=72 db=197 domain=445 eslint-config=81 integrations=143 (1,112). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-data
git add docs/adr/0022-permanent-deletion.md packages/db/README.md packages/db/prisma/migrations/20261016120000_webhook_event_organizations/migration.sql packages/db/prisma/schema/webhooks.prisma packages/db/src/organization-rows.ts packages/db/src/platform.ts packages/db/test/organization-rows.test.ts packages/domain/src/webhooks/README.md packages/domain/src/webhooks/index.ts packages/domain/src/webhooks/process-webhook-event.ts packages/domain/src/webhooks/provider.ts packages/domain/src/webhooks/tombstones.ts packages/domain/test/webhooks/tombstones.test.ts
git commit -m "feat: purge an organization's rows from the catalog, and tombstone its webhook events"
```

---
### Task O1: The organization's business profile, and its setup checklist

Spec 7.1: the platform team enters the GSTIN, the GST state and the contacts; the Owner lands on a setup checklist
(branding, GST and bank details, invoice prefix, staff). Those details live in one `organization_profile` row per
organization, under row-level security, not on `organization`, which sign-in reads without row-level security (bank
details there would be readable by any query of it). The runtime role writes its fields but can't move or delete the
row. Saving records the names of the fields that changed, never their values, and saving the same values records
nothing. The checklist is computed from the profile and the active staff count; the logo, WhatsApp and lead import
join it when their steps exist.

**Files:**
- Create: `docs/adr/0023-business-profile.md`, `packages/contracts/src/profile/index.ts`, `packages/contracts/src/profile/profile.ts`, `packages/db/prisma/migrations/20261016130000_organization_profile/migration.sql`, `packages/db/prisma/schema/profile.prisma`, `packages/domain/src/profile/README.md`, `packages/domain/src/profile/index.ts`, `packages/domain/src/profile/profile.ts`, `packages/domain/src/profile/setup-checklist.ts`
- Modify: `packages/db/prisma/schema/organization.prisma`
- Test: `packages/contracts/test/profile/profile.test.ts`, `packages/db/test/org-table-fixtures/profile.ts`, `packages/domain/test/profile/profile.test.ts`

**Interfaces:**
- Consumes (plans 2-3): `gstin`, `gstStateCode`, `phoneNumber`, `personName`, `recordAudit`, `Actor`, `OrgTx`, the
  isolation fixture registry.
- Produces:
  - `@travel-crm/contracts/profile`: `saveOrganizationProfileInput` (the whole profile: `legalName`, `gstin`,
    `gstStateCode`, `address`, `contactName`, `contactPhone`, `bankAccountName`, `bankAccountNumber`, `bankIfsc`,
    `bankName`, `invoicePrefix`, `brandColour`, `documentTerms`; a GSTIN must start with its state's code),
    `organizationProfileDetails` (those and `updatedAt`), `setupStep` (`business-details`, `bank-details`,
    `invoice-prefix`, `branding`, `staff`), `setupChecklist` (`{ steps: { step, done }[], done }`), `invoicePrefix`,
    `bankIfsc`, `bankAccountNumber`, `brandColour`, and the types.
  - `@travel-crm/domain/profile`: `getOrganizationProfile(tx)`, `saveOrganizationProfile(tx, actor, input)` (records
    `organization-profile.saved` with `{ fields }`), `setupChecklistOf(profile, activeStaff)`.

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-profile -b foundation/04-profile foundation/04-platform
cd /Users/ak/personal/travel-crm-04-profile && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/04-profile` at Task 0.2's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/contracts/test/profile/profile.test.ts`:
```ts
// The business profile's contract: a GSTIN of the profile's own state, Indian bank codes and phones, a numbering
// prefix and a colour, each in the form the database stores; blank text is no text.
import { describe, expect, it } from "vitest";
import { saveOrganizationProfileInput } from "../../src/profile/index.js";

const profile = {
  legalName: "Sharma Holidays Private Limited",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Marine Drive, Mumbai 400002",
  contactName: "Asha Sharma",
  contactPhone: "98765 43210",
  bankAccountName: "Sharma Holidays Pvt Ltd",
  bankAccountNumber: "001234567890",
  bankIfsc: "hdfc0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "sh",
  brandColour: "#1F6F5C",
  documentTerms: "  ",
};

describe("business profile contracts", () => {
  it("stores what people type in the database's forms", () => {
    expect(saveOrganizationProfileInput.parse(profile)).toMatchObject({
      contactPhone: "+919876543210",
      bankIfsc: "HDFC0001234",
      invoicePrefix: "SH",
      brandColour: "#1f6f5c",
      documentTerms: null,
    });
  });

  it("refuses a GSTIN of another state, and wrong codes, numbers, prefixes and colours", () => {
    const gstinElsewhere = saveOrganizationProfileInput.safeParse({ ...profile, gstStateCode: "29" });
    expect(gstinElsewhere.error?.issues[0]?.path).toEqual(["gstin"]);
    for (const bad of [
      { gstin: "27AAPFU0939F1ZX" },
      { bankIfsc: "HDFC1001234" },
      { bankAccountNumber: "12345" },
      { invoicePrefix: "S" },
      { invoicePrefix: "SHARMA" },
      { brandColour: "green" },
      { contactPhone: "12" },
      { gstStateCode: "99" },
    ]) {
      expect(saveOrganizationProfileInput.safeParse({ ...profile, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("takes an agency without GST registration or bank details yet", () => {
    const minimal = { ...profile, gstin: null, bankAccountNumber: null, bankIfsc: null, bankAccountName: null };
    expect(saveOrganizationProfileInput.safeParse(minimal).success).toBe(true);
    expect(saveOrganizationProfileInput.safeParse({ ...minimal, website: "x" }).success).toBe(false);
  });
});
```

`packages/db/test/org-table-fixtures/profile.ts`:
```ts
// Isolation fixtures for the profile module: an organization's business profile. The runtime role may change its
// fields, not move it or delete it.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  organization_profile: {
    create: (tx) => tx.organizationProfile.create({ data: { legalName: "Isolation Travels", gstStateCode: "27" } }),
    appendOnly: true,
    updatableColumn: "legal_name",
  },
};
```

`packages/domain/test/profile/profile.test.ts`:
```ts
// An organization's business profile (spec 7.1): saved whole in its own organization, the changed fields recorded by
// name and never by value, and the setup checklist read from it.
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import { getOrganizationProfile, saveOrganizationProfile, setupChecklistOf } from "../../src/profile/index.js";

const details = saveOrganizationProfileInput.parse({
  legalName: "Kerala Trails LLP",
  gstin: null,
  gstStateCode: "32",
  address: null,
  contactName: "Lakshmi Nair",
  contactPhone: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
  brandColour: null,
  documentTerms: null,
});

describe("the business profile", () => {
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

  async function ownerOfNewOrganization(): Promise<Actor> {
    const organizationId = await createTestOrganization(platform, "Profiled");
    return { organizationId, userId: "0199e7a0-0000-7000-8000-00000000b0a1", source: "web", impersonatedBy: null };
  }

  it("saves the profile, then changes it, recording the changed fields by name only", async () => {
    const owner = await ownerOfNewOrganization();
    expect(await db.forOrg(owner.organizationId, getOrganizationProfile)).toBeNull();
    await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details));
    const saved = await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationProfile(tx, owner, { ...details, bankAccountNumber: "001234567890", bankIfsc: "HDFC0001234" }),
    );
    expect(saved).toMatchObject({ legalName: "Kerala Trails LLP", gstStateCode: "32", bankIfsc: "HDFC0001234" });
    // The same values again record nothing.
    await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationProfile(tx, owner, { ...details, bankAccountNumber: "001234567890", bankIfsc: "HDFC0001234" }),
    );
    const entries = await db.forOrg(owner.organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => entry.after)).toEqual([
      { fields: Object.keys(details) },
      { fields: ["bankAccountNumber", "bankIfsc"] },
    ]);
    expect(JSON.stringify(entries)).not.toContain("001234567890");
  });

  it("keeps each organization's profile to itself, and never deletes one for the api", async () => {
    const owner = await ownerOfNewOrganization();
    await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details));
    const other = await ownerOfNewOrganization();
    expect(await db.forOrg(other.organizationId, getOrganizationProfile)).toBeNull();
    await expect(db.forOrg(owner.organizationId, (tx) => tx.organizationProfile.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lists the setup steps done and to do", () => {
    const empty = setupChecklistOf(null, 1);
    expect(empty).toEqual({
      steps: [
        { step: "business-details", done: false },
        { step: "bank-details", done: false },
        { step: "invoice-prefix", done: false },
        { step: "branding", done: false },
        { step: "staff", done: false },
      ],
      done: false,
    });
    const complete = setupChecklistOf(
      {
        ...details,
        address: "Fort Kochi",
        contactPhone: "+919876543210",
        bankAccountNumber: "001234567890",
        bankIfsc: "HDFC0001234",
        invoicePrefix: "KT",
        documentTerms: "Payment due on booking.",
        updatedAt: new Date().toISOString(),
      },
      3,
    );
    expect(complete.done).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/profile/profile.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/isolation.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/profile/profile.test.ts`

Expected: FAIL. `packages/contracts` can't load its test: `Cannot find module '../../src/profile/index.js'`;
`packages/domain` can't either: `Cannot find package '@travel-crm/contracts/profile'`. In `packages/db`, the
isolation suite finds a fixture for a table that doesn't exist yet (`has an isolation fixture for every table with an
organization_id column` fails, one table too many).

- [ ] **Step 4: Add the table**

`packages/db/prisma/schema/profile.prisma`:
```prisma
// An organization's business profile (spec 7.1): what the platform enters at onboarding (legal name, GSTIN, the
// state for GST's place of supply, a contact), and what its Owner completes on the setup checklist (bank details,
// invoice prefix, branding for its documents). Organization-owned, under row-level security; one row each.

/// The organization's business details, as its quotes and invoices will show them.
model OrganizationProfile {
  /// Filled from db.forOrg()'s organization when omitted. Also the key: one profile per organization.
  organizationId    String       @id @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  /// The registered name, e.g. "Sharma Holidays Private Limited".
  legalName         String       @map("legal_name")
  /// Null for an agency not registered for GST (CHECK organization_profile_gstin_format).
  gstin             String?
  /// The two-digit GST state code that decides CGST and SGST or IGST (spec 9.6), e.g. "27".
  gstStateCode      String       @map("gst_state_code")
  address           String?
  contactName       String?      @map("contact_name")
  /// E.164, e.g. "+919876543210".
  contactPhone      String?      @map("contact_phone")
  bankAccountName   String?      @map("bank_account_name")
  bankAccountNumber String?      @map("bank_account_number")
  bankIfsc          String?      @map("bank_ifsc")
  bankName          String?      @map("bank_name")
  /// 2-5 capital letters invoices are numbered with, e.g. "SH" for SH-2026-0042 (spec 7.1's checklist).
  invoicePrefix     String?      @map("invoice_prefix")
  /// The organization's own colour on its documents, "#rrggbb" (spec 10: not the product's brand).
  brandColour       String?      @map("brand_colour")
  /// The terms printed on its quotes and invoices.
  documentTerms     String?      @map("document_terms")
  updatedAt         DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// Who last saved it: a member, or a platform admin at onboarding.
  updatedBy         String?      @map("updated_by") @db.Uuid
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@map("organization_profile")
}
```

In `packages/db/prisma/schema/organization.prisma`:

replace:
```prisma
  auditEntries            AuditEntry[]
```
with:
```prisma
  auditEntries            AuditEntry[]
  profile                 OrganizationProfile?
```

- [ ] **Step 5: Create the migration**

The hand-written part turns on row-level security, keeps the runtime role from moving or deleting the row, and checks the GSTIN's state, the IFSC and the colour as the contracts do.

Create the migration from the schema change alone, without a database: `git archive HEAD` still holds the schema from before this task, so no track diffs against another's tables.
```bash
cd /Users/ak/personal/travel-crm-04-profile/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null
before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"
mkdir -p prisma/migrations/20261016130000_organization_profile
pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script --output prisma/migrations/20261016130000_organization_profile/migration.sql
pnpm generate
```
Expected: the generated part of the file below, down to the banner. Append the hand-written part, so the whole file reads:

`packages/db/prisma/migrations/20261016130000_organization_profile/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "organization_profile" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "legal_name" TEXT NOT NULL,
    "gstin" TEXT,
    "gst_state_code" TEXT NOT NULL,
    "address" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_name" TEXT,
    "invoice_prefix" TEXT,
    "brand_colour" TEXT,
    "document_terms" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "organization_profile_pkey" PRIMARY KEY ("organization_id")
);

-- AddForeignKey
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('organization_profile');

-- The same rules as the contracts': a regular GSTIN in capitals whose state is the profile's, a state code, E.164
-- phones, Indian bank codes, a document-number prefix, a colour, and bounded text.
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_legal_name_length CHECK (char_length(legal_name) BETWEEN 1 AND 120),
  ADD CONSTRAINT organization_profile_gstin_format
    CHECK (gstin IS NULL OR (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' AND left(gstin, 2) = gst_state_code)),
  ADD CONSTRAINT organization_profile_gst_state_code_format CHECK (gst_state_code ~ '^[0-9]{2}$'),
  ADD CONSTRAINT organization_profile_address_length CHECK (char_length(address) <= 500),
  ADD CONSTRAINT organization_profile_contact_name_length CHECK (char_length(contact_name) <= 100),
  ADD CONSTRAINT organization_profile_contact_phone_format CHECK (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT organization_profile_bank_account_name_length CHECK (char_length(bank_account_name) <= 120),
  ADD CONSTRAINT organization_profile_bank_account_number_format CHECK (bank_account_number ~ '^[0-9]{9,18}$'),
  ADD CONSTRAINT organization_profile_bank_ifsc_format CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  ADD CONSTRAINT organization_profile_bank_name_length CHECK (char_length(bank_name) <= 120),
  ADD CONSTRAINT organization_profile_invoice_prefix_format CHECK (invoice_prefix ~ '^[A-Z]{2,5}$'),
  ADD CONSTRAINT organization_profile_brand_colour_format CHECK (brand_colour ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT organization_profile_document_terms_length CHECK (char_length(document_terms) <= 2000);

-- The api writes the profile, but never moves it to another organization, and never deletes it: the platform's purge
-- does, with the organization.
REVOKE UPDATE, DELETE ON TABLE "organization_profile" FROM app_runtime;
GRANT UPDATE (legal_name, gstin, gst_state_code, address, contact_name, contact_phone, bank_account_name,
  bank_account_number, bank_ifsc, bank_name, invoice_prefix, brand_colour, document_terms, updated_at, updated_by)
  ON TABLE "organization_profile" TO app_runtime;
```

- [ ] **Step 6: Write the contracts and the module**

`packages/contracts/src/profile/index.ts`:
```ts
// Public API of @travel-crm/contracts/profile: the Zod schemas of an organization's business profile.
export * from "./profile.js";
```

`packages/contracts/src/profile/profile.ts`:
```ts
// An organization's business profile (spec 7.1): onboarding's GSTIN, state and contact, and the setup checklist's bank
// details, invoice prefix and branding. Each value is checked here as the database checks it.
import { z } from "zod";
import { personName } from "../identity/index.js";
import { gstStateCode, gstin, phoneNumber } from "../kernel/index.js";

/** Optional text: blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === "" ? null : text))
    .nullable();

/** Checked before upper-casing: Unicode case mapping turns some letters into ASCII capitals. */
const capitals = (pattern: RegExp, message: string) => z.string().trim().regex(pattern, message).toUpperCase();

/** 2-5 letters invoices are numbered with, e.g. "SH" for SH-2026-0042. */
export const invoicePrefix = capitals(/^[A-Za-z]{2,5}$/, "Use 2-5 letters");

/** An Indian bank branch's IFSC: four letters, a zero, six letters or digits. */
export const bankIfsc = capitals(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Check the IFSC: 11 characters, the fifth a zero");

export const bankAccountNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/, "Use the account's 9 to 18 digits");

/** The organization's own colour, "#rrggbb". */
export const brandColour = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a colour like #1f6f5c")
  .toLowerCase();

const profileFields = {
  legalName: z.string().trim().min(1).max(120),
  gstin: gstin.nullable(),
  gstStateCode,
  address: optionalText(500),
  contactName: personName.nullable(),
  contactPhone: phoneNumber.nullable(),
  bankAccountName: optionalText(120),
  bankAccountNumber: bankAccountNumber.nullable(),
  bankIfsc: bankIfsc.nullable(),
  bankName: optionalText(120),
  invoicePrefix: invoicePrefix.nullable(),
  brandColour: brandColour.nullable(),
  documentTerms: optionalText(2000),
};

/** The whole profile, saved at once. A GSTIN's first two digits are its state's code. */
export const saveOrganizationProfileInput = z
  .strictObject(profileFields)
  .refine((profile) => profile.gstin === null || profile.gstin.startsWith(profile.gstStateCode), {
    message: "The GSTIN belongs to another state",
    path: ["gstin"],
  });
export type SaveOrganizationProfileInput = z.infer<typeof saveOrganizationProfileInput>;

export const organizationProfileDetails = z.object({
  legalName: z.string(),
  gstin: z.string().nullable(),
  gstStateCode: z.string(),
  address: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  bankName: z.string().nullable(),
  invoicePrefix: z.string().nullable(),
  brandColour: z.string().nullable(),
  documentTerms: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type OrganizationProfileDetails = z.infer<typeof organizationProfileDetails>;

/** The setup checklist an Owner lands on after onboarding (spec 7.1), as far as the Foundation has its steps. */
export const setupStep = z.enum(["business-details", "bank-details", "invoice-prefix", "branding", "staff"]);
export type SetupStep = z.infer<typeof setupStep>;

export const setupChecklist = z.object({
  steps: z.array(z.object({ step: setupStep, done: z.boolean() })),
  done: z.boolean(),
});
export type SetupChecklist = z.infer<typeof setupChecklist>;
```

`packages/domain/src/profile/profile.ts`:
```ts
// An organization's business profile (spec 7.1): saved at onboarding by the platform, inside the new organization, and
// later by its Owner; the setup checklist reads it. One row per organization, under row-level security.
import type { OrganizationProfileDetails, SaveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

/** The transaction's organization's profile, or null before onboarding saved one. */
export async function getOrganizationProfile(tx: OrgTx): Promise<OrganizationProfileDetails | null> {
  const row = await tx.organizationProfile.findFirst();
  if (!row) return null;
  return {
    legalName: row.legalName,
    gstin: row.gstin,
    gstStateCode: row.gstStateCode,
    address: row.address,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    bankAccountName: row.bankAccountName,
    bankAccountNumber: row.bankAccountNumber,
    bankIfsc: row.bankIfsc,
    bankName: row.bankName,
    invoicePrefix: row.invoicePrefix,
    brandColour: row.brandColour,
    documentTerms: row.documentTerms,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Saves the whole profile in the actor's organization. Recorded as "organization-profile.saved" with the names of the
 * fields that changed, not their values (bank details are for invoices, not the audit log). Saving the same values
 * again records nothing.
 */
export async function saveOrganizationProfile(
  tx: OrgTx,
  actor: Actor,
  input: SaveOrganizationProfileInput,
): Promise<OrganizationProfileDetails> {
  const before = await getOrganizationProfile(tx);
  const changed = (Object.keys(input) as (keyof SaveOrganizationProfileInput)[]).filter(
    (field) => before?.[field] !== input[field],
  );
  if (changed.length > 0) {
    await tx.organizationProfile.upsert({
      where: { organizationId: actor.organizationId },
      create: { ...input, organizationId: actor.organizationId, updatedBy: actor.userId },
      update: { ...input, updatedBy: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: "organization-profile.saved",
      entityType: "organization",
      entityId: actor.organizationId,
      after: { fields: changed },
    });
  }
  const saved = await getOrganizationProfile(tx);
  if (!saved) throw new Error("The profile was saved but can't be read back");
  return saved;
}
```

`packages/domain/src/profile/setup-checklist.ts`:
```ts
// The setup checklist (spec 7.1): what an Owner still has to do after onboarding. Logo, WhatsApp and lead import join
// it when their steps exist.
import type { OrganizationProfileDetails, SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";

/** Which steps are done, from the profile and how many active staff the organization has (the Owner counts). */
export function setupChecklistOf(profile: OrganizationProfileDetails | null, activeStaff: number): SetupChecklist {
  const has = (field: keyof OrganizationProfileDetails): boolean => (profile?.[field] ?? null) !== null;
  const done: Record<SetupStep, boolean> = {
    "business-details": has("address") && has("contactPhone"),
    "bank-details": has("bankAccountNumber") && has("bankIfsc"),
    "invoice-prefix": has("invoicePrefix"),
    branding: has("brandColour") || has("documentTerms"),
    staff: activeStaff > 1,
  };
  const steps = (Object.keys(done) as SetupStep[]).map((step) => ({ step, done: done[step] }));
  return { steps, done: steps.every((step) => step.done) };
}
```

`packages/domain/src/profile/index.ts`:
```ts
// Public API of the profile module: an organization's business profile and its setup checklist (spec 7.1).
export { getOrganizationProfile, saveOrganizationProfile } from "./profile.js";
export { setupChecklistOf } from "./setup-checklist.js";
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/contracts && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/profile/profile.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/isolation.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-profile/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/profile/profile.test.ts`

Expected: PASS, 3 tests in 1 file (packages/contracts); 72 tests in 1 file (packages/db); 3 tests in 1 file (packages/domain).

- [ ] **Step 8: Record the decision**

`docs/adr/0023-business-profile.md`:
```markdown
# 0023: The organization's business profile

Date: 2026-10-16 · Status: accepted · Implements the data of spec section 7.1 (onboarding's GSTIN, state and contacts,
and the setup checklist), with spec 10's "an organization's own branding … stored in the database"

## Decision

- **One `organization_profile` row per organization**, organization-owned under row-level security: legal name,
  GSTIN (optional), GST state, address, contact name and phone, bank account and IFSC, invoice prefix, the
  organization's colour and its document terms. The platform saves it at onboarding, inside the new organization; the
  Owner completes it from the setup checklist.
- **Not on the `organization` table.** That table has no row-level security (sign-in reads it), so every
  organization's bank details there would be readable by any query of it. The organization's name, code, time zone and
  contact email stay where sign-in and email need them.
- **The setup checklist is computed**, from the profile and the active staff count: business details, bank details,
  invoice prefix, branding, staff. The logo, WhatsApp and lead import join when their steps exist.
- **The audit log names the fields that changed**, never their values.

## Consequences

- The org-side routers (the profile, the checklist) come with the Integration task, which owns the api's context.
- Documents' frozen branding (ADR 0012) can read the colour and terms from here when quotes arrive; the logo comes with
  uploads (plan 5).
```

`packages/domain/src/profile/README.md`:
```markdown
# profile

An organization's business profile (spec 7.1): what the platform enters at onboarding (legal name, GSTIN, the GST
state, a contact) and what its Owner completes on the setup checklist (address, bank details, invoice prefix,
branding for its documents).

## Public functions and values (`index.ts`)

- `getOrganizationProfile(tx)`: the transaction's organization's profile, or null before one was saved.
- `saveOrganizationProfile(tx, actor, input)`: saves the whole profile (onboarding, inside the new organization, and
  the Owner later). The input is `saveOrganizationProfileInput` from `@travel-crm/contracts/profile`.
- `setupChecklistOf(profile, activeStaff)`: the checklist's steps (`business-details`, `bank-details`,
  `invoice-prefix`, `branding`, `staff`) and whether each is done.

## Events

None. Saving records `organization-profile.saved` (record `organization`) with the names of the fields that changed,
never their values: bank details are for invoices, not for everyone who may read the audit log. Saving the same values
records nothing.

## Rules worth knowing

- One row per organization, under row-level security. The runtime role writes its fields but can't move it to
  another organization or delete it; the platform's purge deletes it with the organization.
- A GSTIN's first two digits are its state's code, and the database checks that too. An agency not registered for GST
  has no GSTIN but still a state: it decides whether a supply is intra-state.
- The organization's colours and terms are its own, on its documents; the product's brand is `@travel-crm/brand`.
```

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-profile && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=149 api=4 brand=21 contracts=75 db=199 domain=434 eslint-config=81 integrations=141 (1,104). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-profile
git add docs/adr/0023-business-profile.md packages/contracts/src/profile/index.ts packages/contracts/src/profile/profile.ts packages/contracts/test/profile/profile.test.ts packages/db/prisma/migrations/20261016130000_organization_profile/migration.sql packages/db/prisma/schema/organization.prisma packages/db/prisma/schema/profile.prisma packages/db/test/org-table-fixtures/profile.ts packages/domain/src/profile/README.md packages/domain/src/profile/index.ts packages/domain/src/profile/profile.ts packages/domain/src/profile/setup-checklist.ts packages/domain/test/profile/profile.test.ts
git commit -m "feat: keep each organization's business profile, and compute its setup checklist"
```

---
## Merging wave 1

### Task M1: Merge the four tracks

The four wave-1 tracks merge onto Task 0.2 in any order: every merge is textually clean, and both orders give the
same tree. One test needs both Track S and Track D: D2's purge test fills every organization table from the isolation
fixtures with `fixture.create`, and S1 made `create` optional, adding `createAsPlatform` for the subscription tables,
which the runtime role can't insert into.

**Files:**
- Test: `packages/db/test/organization-rows.test.ts`

**Interfaces:**
- Consumes: the four tracks' last commits; S1's `OrgTableFixture.createAsPlatform`; D2's `organization-rows.test.ts`.
- Produces: `foundation/04-platform` with every wave-1 track, green; Track P starts from this commit.

- [ ] **Step 1: Merge the tracks**

```bash
cd /Users/ak/personal/travel-crm && git switch foundation/04-platform
cd /Users/ak/personal/travel-crm && for t in subscriptions identity data profile; do git merge --no-ff --no-edit foundation/04-$t -m "chore: merge foundation/04-$t" || break; done
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec tsc --noEmit; pnpm exec vitest run test/organization-rows.test.ts
```
Expected: four merges with no conflict (the git hooks run on each merge commit). The typecheck then fails:
`test/organization-rows.test.ts(49,92): error TS2345: Argument of type '((tx: OrgTx) => Promise<unknown>) |
undefined' is not assignable to parameter of type '(tx: OrgTx) => Promise<unknown>'`, and the test itself fails
twice with `TypeError: fn is not a function`.

- [ ] **Step 2: Make the subscription rows as the platform role in the purge test**

In `packages/db/test/organization-rows.test.ts`:

replace:
```ts
    const organizationId = await createTestOrganization(platform, name);
    for (const fixture of Object.values(orgTableFixtures)) await db.forOrg(organizationId, fixture.create);
    const user = await platform.user.create({ data: { name, email: `${randomUUID()}@example.test` } });
```
with:
```ts
    const organizationId = await createTestOrganization(platform, name);
    for (const fixture of Object.values(orgTableFixtures)) {
      const { create, createAsPlatform } = fixture;
      if (createAsPlatform) await platformDb.transaction((tx) => createAsPlatform(tx, organizationId));
      else if (create) await db.forOrg(organizationId, create);
    }
    const user = await platform.user.create({ data: { name, email: `${randomUUID()}@example.test` } });
```

- [ ] **Step 3: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm/packages/db && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization-rows.test.ts`

Expected: PASS, 3 tests in 1 file (packages/db).

- [ ] **Step 4: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=161 api=13 brand=21 contracts=81 db=219 domain=505 eslint-config=81 integrations=143 (1,224). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db/test/organization-rows.test.ts
git commit -m "test(db): create subscription rows as the platform role when testing an organization's purge"
```

---
## Track P: the platform console

Track P starts from Task M1's commit in its own worktree: it calls every wave-1 track.

### Task P1: Onboard an organization from the console, and show and correct it

Spec 7.1 in one platform transaction: the organization's row (name, code, time zone, contact email) as the platform
role; then, stepped into the new organization, its starter roles, its business profile (legal name, GSTIN, GST state,
contact), the invited Owner and `organization.onboarded` in its own log, all under the platform admin's name; then,
as the platform role again, the subscription (a trial to a day, or paid through one) and `organization.onboarded` in
the platform log. If any step fails, nothing is left: no organization without an Owner, no Owner without roles. The
console can show an organization (its row, profile and subscription with payments), correct its name, zone and
contact email (never the code: usernames contain it), and send its Owner a new invite. The worker sends the email
(Task I2 registers the listener); this task's HTTP test runs the listener itself.

**Files:**
- Create: `packages/api/src/platform/routers/organizations.ts`, `packages/contracts/src/platform/organizations.ts`, `packages/domain/src/identity/organization-records.ts`, `packages/domain/src/platform/onboarding.ts`, `packages/domain/src/platform/organizations.ts`
- Modify: `docs/adr/0021-onboarding.md`, `packages/api/src/platform/platform-router.ts`, `packages/contracts/src/platform/index.ts`, `packages/domain/src/identity/index.ts`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`
- Test: `apps/api/test/console-organizations.test.ts`, `packages/domain/test/platform/onboarding.test.ts`, `packages/domain/test/platform/test-platform.ts`

**Interfaces:**
- Consumes: Task 0's `PlatformServices`, `asOrganization`, `platformActor`, `recordPlatformAudit`,
  `staffProcedure`; Task S1's `startSubscription`, `startSubscriptionInput`, `subscriptionWithPayments`; Task A2's
  `createOrganizationRecord`, `insertStarterRoles`, `inviteOwner`, `requestInvite`, `Identity.inviteListener`; Task
  O1's `saveOrganizationProfile`, `getOrganizationProfile`, `organizationProfileDetails`; plan 2's `organizationCode`,
  `emailAddress`, `personName`, `timeZoneName`.
- Produces:
  - `@travel-crm/contracts/platform`: `onboardOrganizationInput` (`{ name, code, timeZone, contactEmail, profile:
    { legalName, gstin, gstStateCode, contactName, contactPhone }, owner: { name, email }, subscription }`),
    `onboardedOrganization` (`{ organizationId, code, ownerMemberId }`), `updateOrganizationInput`,
    `resendInviteInput`, `organizationRecord`, `organizationDetails` (`{ organization, profile, subscription }`).
  - `@travel-crm/domain/identity`: `OrganizationRecord`, `listOrganizationRecords(tx)`, `findOrganizationRecord(tx,
    organizationId)` (`ORGANIZATION_NOT_FOUND`), `updateOrganizationRecord(tx, change)`.
  - `@travel-crm/domain/platform`: `onboardOrganization(services, staff, input)`, `resendInvite(services, staff,
    input)`, `getOrganization(services, organizationId)`, `updateOrganization(services, staff, input)`.
  - The console's router `organizations` (`onboard`, `get`, `update`, `resendInvite`).
  - Test support `packages/domain/test/platform/test-platform.ts`: `createTestPlatform()`, `createTestPlan(test)`,
    `onboardingInput(plan)`, `support`, `supportUserId`.

- [ ] **Step 1: Create the track's worktree**

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-04-platform-console -b foundation/04-platform-console foundation/04-platform
cd /Users/ak/personal/travel-crm-04-platform-console && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: the worktree is on `foundation/04-platform-console` at Task M1's commit; install changes nothing.

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/platform/test-platform.ts`:
```ts
// The platform module's services on the test database, for its tests: the platform role's transactions, identity,
// and in-memory storage and job queue; and a plan to subscribe organizations to.
import { randomUUID } from "node:crypto";
import type { OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createDatabase } from "@travel-crm/db";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createPlan, createPlatformServices, type PlatformServices } from "../../src/platform/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";

export const supportUserId = "0199e7a0-0000-7000-8000-00000000c0de";
export const support = { userId: supportUserId };

export interface TestPlatform {
  services: PlatformServices;
  storage: MemoryStorage;
  queue: MemoryJobQueue;
  identity: TestIdentity;
  close(): Promise<void>;
}

export function createTestPlatform(): TestPlatform {
  const urls = inject("dbUrls");
  const identity = createTestIdentity();
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const storage = createMemoryStorage();
  const queue = createMemoryJobQueue();
  const services = createPlatformServices({
    platformDatabaseUrl: urls.platform,
    maxConnections: 2,
    db,
    identity: identity.identity,
    storage,
    queue,
  });
  return {
    services,
    storage,
    queue,
    identity,
    close: async () => {
      await services.platformDb.disconnect();
      await db.disconnect();
      await identity.close();
    },
  };
}

export function createTestPlan(test: TestPlatform): Promise<PlanSummary> {
  return createPlan(test.services, support, {
    key: `plan-${randomUUID().slice(0, 8)}`,
    name: "Starter",
    monthlyPricePaise: 250_000,
    yearlyPricePaise: null,
    seatLimit: 5,
    whatsappNumberLimit: 1,
    storageLimitBytes: 5_000_000_000,
    modules: ["crm"],
  });
}

/** What the platform team enters for a new agency, with a unique code and owner address. */
export function onboardingInput(plan: PlanSummary): OnboardOrganizationInput {
  const code = `S${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
  return {
    name: "Sharma Holidays",
    code,
    timeZone: "Asia/Kolkata",
    contactEmail: `hello-${code.toLowerCase()}@example.test`,
    profile: {
      legalName: "Sharma Holidays Private Limited",
      gstin: null,
      gstStateCode: "27",
      contactName: "Asha Sharma",
      contactPhone: "+919876543210",
    },
    owner: { name: "Asha Sharma", email: `asha-${code.toLowerCase()}@example.test` },
    subscription: { planId: plan.id, billingCycle: "monthly", trialEndsOn: "2099-01-31", paidThrough: null },
  };
}
```

`packages/domain/test/platform/onboarding.test.ts`:
```ts
// Onboarding from the console (spec 7.1): one platform transaction makes the organization, its roles, its business
// profile, its subscription and its invited Owner, all recorded under the platform admin's name; any step failing
// leaves nothing; the console shows and corrects what it made.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archivePlan,
  getOrganization,
  listPlatformLog,
  onboardOrganization,
  resendInvite,
  updateOrganization,
} from "../../src/platform/index.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

describe("onboarding", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const inOrganization = <T>(organizationId: string, fn: Parameters<typeof test.services.db.forOrg<T>>[1]) =>
    test.services.db.forOrg(organizationId, fn);

  it("makes the organization, its roles, profile, subscription and invited Owner, under the admin's name", async () => {
    const input = onboardingInput(plan);
    const onboarded = await onboardOrganization(test.services, support, input);
    const { organizationId } = onboarded;
    expect(await inOrganization(organizationId, (tx) => tx.role.count())).toBe(5);
    const details = await getOrganization(test.services, organizationId);
    expect(details).toMatchObject({
      organization: {
        name: "Sharma Holidays",
        code: input.code,
        timeZone: "Asia/Kolkata",
        contactEmail: input.contactEmail,
      },
      profile: { legalName: "Sharma Holidays Private Limited", gstStateCode: "27", contactPhone: "+919876543210" },
      subscription: {
        subscription: { status: "trial", trialEndsOn: "2099-01-31", plan: { id: plan.id } },
        payments: [],
      },
    });
    const entries = await inOrganization(organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => entry.action)).toEqual([
      "organization-profile.saved",
      "staff.created",
      "staff.invited",
      "organization.onboarded",
      "subscription.started",
    ]);
    expect(entries.every((entry) => entry.source === "platform" && entry.actorUserId === supportUserId)).toBe(true);
    const invites = await inOrganization(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "staff.invited" } }),
    );
    expect(invites.map((event) => event.payload)).toEqual([
      expect.objectContaining({ memberId: onboarded.ownerMemberId }),
    ]);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries).toEqual([
      expect.objectContaining({ action: "organization.onboarded", actorUserId: supportUserId }),
    ]);
  });

  it("leaves nothing behind when its last step fails", async () => {
    const retired = await createTestPlan(test);
    await archivePlan(test.services, support, retired.id);
    const input = onboardingInput(retired);
    await expect(onboardOrganization(test.services, support, input)).rejects.toMatchObject({ reason: "PLAN_ARCHIVED" });
    const client = test.identity.database.client;
    expect(await client.organization.count({ where: { code: input.code } })).toBe(0);
    expect(await client.user.count({ where: { email: input.owner.email } })).toBe(0);
  });

  it("refuses a code another organization has", async () => {
    const input = onboardingInput(plan);
    await onboardOrganization(test.services, support, input);
    await expect(
      onboardOrganization(test.services, support, { ...onboardingInput(plan), code: input.code }),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_CODE_TAKEN" });
  });

  it("sends the Owner a new invite, and corrects the organization's row in both logs", async () => {
    const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    await resendInvite(test.services, support, { organizationId, memberId: ownerMemberId });
    expect(
      await inOrganization(organizationId, (tx) => tx.outboxEvent.count({ where: { type: "staff.invited" } })),
    ).toBe(2);
    const updated = await updateOrganization(test.services, support, {
      organizationId,
      name: "Sharma Holidays & Tours",
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    expect(updated).toMatchObject({ name: "Sharma Holidays & Tours", contactEmail: null });
    const entry = await inOrganization(organizationId, (tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "organization.updated" } }),
    );
    expect(entry).toMatchObject({
      source: "platform",
      before: { name: "Sharma Holidays", contactEmail: true },
      after: { name: "Sharma Holidays & Tours", contactEmail: false },
    });
  });

  it("says when an organization doesn't exist", async () => {
    await expect(getOrganization(test.services, "0199e7a0-0000-7000-8000-0000000000ab")).rejects.toMatchObject({
      reason: "ORGANIZATION_NOT_FOUND",
    });
  });
});
```

`apps/api/test/console-organizations.test.ts`:
```ts
// Onboarding through the console (spec 7.1), end to end: support onboards an agency, the worker emails its Owner an
// invite, the Owner chooses a password from the link, signs in, and finds the subscription the console started.
import type { OnboardedOrganization, OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { createPlan } from "@travel-crm/domain/platform";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("onboarding through the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let input: OnboardOrganizationInput;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    const plan = await createPlan(
      testConsole.services,
      { userId: support.userId },
      {
        key: `starter-${crypto.randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        yearlyPricePaise: null,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000,
        modules: ["crm"],
      },
    );
    const code = `K${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    input = {
      name: "Kerala Trails",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: `hello-${code.toLowerCase()}@example.test`,
      profile: {
        legalName: "Kerala Trails LLP",
        gstin: null,
        gstStateCode: "32",
        contactName: null,
        contactPhone: null,
      },
      owner: { name: "Lakshmi Nair", email: `lakshmi-${code.toLowerCase()}@example.test` },
      subscription: { planId: plan.id, billingCycle: "monthly", trialEndsOn: "2099-01-31", paidThrough: null },
    };
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("onboards an agency whose Owner chooses a password from the invite, signs in and sees the trial", async () => {
    const onboarded = await dataOf<OnboardedOrganization>(
      await consoleMutate(testConsole, "organizations.onboard", input, support.jar),
    );
    // The worker's part: the invite listener on the staff.invited event.
    const email = createMemoryEmailSender();
    const event = await server.db.forOrg(onboarded.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "staff.invited" } }),
    );
    await runListenerJob({
      db: server.db,
      listener: server.identity.inviteListener({ email, appUrl: "http://localhost" }),
      data: { organizationId: onboarded.organizationId, eventId: event.id, eventType: event.type },
    });
    const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(email.sent[0]?.text ?? "")?.[1];
    const chosen = await postJson(server, "/api/auth/reset-password", { token, newPassword: "lakshmi-password-1" });
    expect(chosen.status).toBe(200);
    const owner = new CookieJar();
    expect((await signInByEmail(server, owner, input.owner.email, "lakshmi-password-1")).status).toBe(200);
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "trial",
      planName: "Starter",
      modules: ["crm"],
      trialEndsOn: "2099-01-31",
    });
  });

  it("shows the organization, and refuses a GSTIN of another state", async () => {
    const other = {
      ...input,
      code: `${input.code.slice(0, 9)}X`,
      owner: { ...input.owner, email: `x-${input.owner.email}` },
    };
    const onboarded = await dataOf<OnboardedOrganization>(
      await consoleMutate(testConsole, "organizations.onboard", other, support.jar),
    );
    expect(
      await dataOf(
        await consoleQuery(testConsole, "organizations.get", support.jar, { organizationId: onboarded.organizationId }),
      ),
    ).toMatchObject({ organization: { code: other.code }, subscription: { subscription: { status: "trial" } } });
    const wrongState = { ...input, profile: { ...input.profile, gstin: "27AAPFU0939F1ZV" } };
    expect((await consoleMutate(testConsole, "organizations.onboard", wrongState, support.jar)).status).toBe(400);
  });

  it("is out of reach of an organization's own staff", async () => {
    const agency = await createTestAgency(server);
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "organizations.onboard", input, await signedInOwner(server, agency)),
      ),
    ).toEqual({ status: 403, reason: "PLATFORM_ONLY" });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-organizations.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/onboarding.test.ts`

Expected: FAIL. In `packages/domain`, all 5: `TypeError: onboardOrganization is not a function` (four) and
`getOrganization is not a function`. In `apps/api`, all 3: `No procedure found on path "organizations.onboard"`.

- [ ] **Step 4: Read and correct an organization's own row**

`packages/domain/src/identity/organization-records.ts`:
```ts
// The organization's own row (spec 7.1) for the platform console: read for its directory, and corrected by platform
// staff. Its code never changes once there are staff: usernames contain it. The platform role only.
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";

export interface OrganizationRecord {
  id: string;
  name: string;
  code: string;
  timeZone: string;
  contactEmail: string | null;
  createdAt: Date;
}

const recordFields = { id: true, name: true, code: true, timeZone: true, contactEmail: true, createdAt: true } as const;

/** Every organization, oldest first. */
export async function listOrganizationRecords(tx: IdentityTx): Promise<OrganizationRecord[]> {
  return tx.organization.findMany({ select: recordFields, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function findOrganizationRecord(tx: IdentityTx, organizationId: string): Promise<OrganizationRecord> {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: recordFields });
  if (!organization) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
  return organization;
}

/** Corrects the name, time zone and contact email. Returns the row before and after. */
export async function updateOrganizationRecord(
  tx: IdentityTx,
  change: { organizationId: string; name: string; timeZone: string; contactEmail: string | null },
): Promise<{ before: OrganizationRecord; after: OrganizationRecord }> {
  const before = await findOrganizationRecord(tx, change.organizationId);
  const after = await tx.organization.update({
    where: { id: change.organizationId },
    data: { name: change.name, timeZone: change.timeZone, contactEmail: change.contactEmail },
    select: recordFields,
  });
  return { before, after };
}
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export { organizationTimeZone } from "./organization-profile.js";
```
with:
```ts
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export {
  findOrganizationRecord,
  listOrganizationRecords,
  updateOrganizationRecord,
  type OrganizationRecord,
} from "./organization-records.js";
export { organizationTimeZone } from "./organization-profile.js";
```

- [ ] **Step 5: Onboard in one transaction, and serve it**

`packages/contracts/src/platform/organizations.ts`:
```ts
// Organizations as the console makes and shows them (spec 7.1): onboarding's input in one go, and what the console
// shows of one organization.
import { z } from "zod";
import { emailAddress, organizationCode, personName, recordId } from "../identity/index.js";
import { gstStateCode, gstin, phoneNumber, timeZoneName } from "../kernel/index.js";
import { organizationProfileDetails } from "../profile/index.js";
import { startSubscriptionInput, subscriptionWithPayments } from "../subscriptions/index.js";

/** What the platform team enters to onboard an agency (spec 7.1), and its first Owner, who is invited by email. */
export const onboardOrganizationInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  code: organizationCode,
  timeZone: timeZoneName.default("Asia/Kolkata"),
  /** Where replies to the organization's email go. */
  contactEmail: emailAddress,
  profile: z
    .strictObject({
      legalName: z.string().trim().min(1).max(120),
      gstin: gstin.nullable(),
      gstStateCode,
      contactName: personName.nullable(),
      contactPhone: phoneNumber.nullable(),
    })
    .refine((profile) => profile.gstin === null || profile.gstin.startsWith(profile.gstStateCode), {
      message: "The GSTIN belongs to another state",
      path: ["gstin"],
    }),
  owner: z.strictObject({ name: personName, email: emailAddress }),
  subscription: startSubscriptionInput,
});
export type OnboardOrganizationInput = z.infer<typeof onboardOrganizationInput>;

export const onboardedOrganization = z.object({
  organizationId: recordId,
  code: z.string(),
  ownerMemberId: recordId,
});
export type OnboardedOrganization = z.infer<typeof onboardedOrganization>;

/** The organization's own row: what the platform may correct. The code never changes: usernames contain it. */
export const updateOrganizationInput = z.strictObject({
  organizationId: recordId,
  name: z.string().trim().min(1).max(120),
  timeZone: timeZoneName,
  contactEmail: emailAddress.nullable(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInput>;

export const resendInviteInput = z.strictObject({ organizationId: recordId, memberId: recordId });
export type ResendInviteInput = z.infer<typeof resendInviteInput>;

export const organizationRecord = z.object({
  id: recordId,
  name: z.string(),
  code: z.string(),
  timeZone: z.string(),
  contactEmail: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type OrganizationRecord = z.infer<typeof organizationRecord>;

/** One organization as the console shows it. */
export const organizationDetails = z.object({
  organization: organizationRecord,
  profile: organizationProfileDetails.nullable(),
  /** Null for an organization without a subscription, which onboarding never makes. */
  subscription: subscriptionWithPayments.nullable(),
});
export type OrganizationDetails = z.infer<typeof organizationDetails>;
```

In `packages/contracts/src/platform/index.ts`:

replace:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./platform-log.js";
```
with:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./organizations.js";
export * from "./platform-log.js";
```

`packages/domain/src/platform/onboarding.ts`:
```ts
// Onboarding (spec 7.1), in one platform transaction: the organization's row and its subscription as the platform
// role; its starter roles, business profile and first Owner (invited by email) inside it, as the runtime role. Any
// step failing leaves nothing behind.
import type {
  OnboardedOrganization,
  OnboardOrganizationInput,
  ResendInviteInput,
} from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import { createOrganizationRecord, insertStarterRoles, inviteOwner, requestInvite } from "../identity/index.js";
import { platformActor } from "../kernel/index.js";
import { saveOrganizationProfile } from "../profile/index.js";
import { startSubscription } from "../subscriptions/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Long enough for onboarding's dozen statements on a slow day; Prisma's default is 5 seconds. */
const ONBOARDING_TIMEOUT_MS = 20_000;

export async function onboardOrganization(
  services: PlatformServices,
  staff: { userId: string },
  input: OnboardOrganizationInput,
): Promise<OnboardedOrganization> {
  return services.platformDb.transaction(
    async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: input.name,
        code: input.code,
        timeZone: input.timeZone,
        contactEmail: input.contactEmail,
      });
      const actor = platformActor(organization.id, staff.userId);
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await saveOrganizationProfile(orgTx, actor, {
          ...input.profile,
          address: null,
          bankAccountName: null,
          bankAccountNumber: null,
          bankIfsc: null,
          bankName: null,
          invoicePrefix: null,
          brandColour: null,
          documentTerms: null,
        });
        const invited = await inviteOwner(orgTx, actor, input.owner);
        await recordAudit(orgTx, actor, {
          action: "organization.onboarded",
          entityType: "organization",
          entityId: organization.id,
          after: { code: organization.code },
        });
        return invited;
      });
      // A subscription is written only by the platform role, so it comes after the step back out.
      await startSubscription(tx, staff, { organizationId: organization.id, ...input.subscription });
      await recordPlatformAudit(tx, staff, {
        action: "organization.onboarded",
        targetType: "organization",
        targetId: organization.id,
        targetOrganizationId: organization.id,
        after: { code: organization.code, planId: input.subscription.planId },
      });
      return { organizationId: organization.id, code: organization.code, ownerMemberId: owner.memberId };
    },
    { timeout: ONBOARDING_TIMEOUT_MS },
  );
}

/** Sends a member a new invite link, when the first lapsed or went astray. */
export async function resendInvite(
  services: PlatformServices,
  staff: { userId: string },
  input: ResendInviteInput,
): Promise<void> {
  await services.platformDb.transaction((tx) =>
    asOrganization(tx, input.organizationId, (orgTx) =>
      requestInvite(orgTx, platformActor(input.organizationId, staff.userId), input.memberId),
    ),
  );
}
```

`packages/domain/src/platform/organizations.ts`:
```ts
// One organization as the console shows and corrects it (spec 7.1): its row, its business profile, its subscription.
import type { OrganizationDetails, OrganizationRecord, UpdateOrganizationInput } from "@travel-crm/contracts/platform";
import type { SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import {
  findOrganizationRecord,
  updateOrganizationRecord,
  type OrganizationRecord as StoredRecord,
} from "../identity/index.js";
import { DomainError, platformActor } from "../kernel/index.js";
import { getOrganizationProfile } from "../profile/index.js";
import { getSubscription, listPayments } from "../subscriptions/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The subscription with its payments, or null for an organization without one. */
async function subscriptionOf(tx: PlatformTx, organizationId: string): Promise<SubscriptionWithPayments | null> {
  try {
    return {
      subscription: await getSubscription(tx, organizationId),
      payments: await listPayments(tx, organizationId),
    };
  } catch (error) {
    if (error instanceof DomainError && error.reason === "SUBSCRIPTION_NOT_FOUND") return null;
    throw error;
  }
}

function recordOf(stored: StoredRecord): OrganizationRecord {
  return { ...stored, createdAt: stored.createdAt.toISOString() };
}

export async function getOrganization(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationDetails> {
  return services.platformDb.transaction(async (tx) => {
    const organization = recordOf(await findOrganizationRecord(tx, organizationId));
    const profile = await asOrganization(tx, organizationId, getOrganizationProfile);
    return { organization, profile, subscription: await subscriptionOf(tx, organizationId) };
  });
}

/** Corrects the organization's name, time zone or contact email, in its own log and the platform's. */
export async function updateOrganization(
  services: PlatformServices,
  staff: { userId: string },
  input: UpdateOrganizationInput,
): Promise<OrganizationRecord> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after } = await updateOrganizationRecord(tx, input);
    const change = {
      before: { name: before.name, timeZone: before.timeZone, contactEmail: before.contactEmail !== null },
      after: { name: after.name, timeZone: after.timeZone, contactEmail: after.contactEmail !== null },
    };
    await recordAudit(tx, platformActor(input.organizationId, staff.userId), {
      action: "organization.updated",
      entityType: "organization",
      entityId: input.organizationId,
      ...change,
    });
    await recordPlatformAudit(tx, staff, {
      action: "organization.updated",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
      ...change,
    });
    return recordOf(after);
  });
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export {
```
with:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { onboardOrganization, resendInvite } from "./onboarding.js";
export { getOrganization, updateOrganization } from "./organizations.js";
export {
```

`packages/api/src/platform/routers/organizations.ts`:
```ts
// The console's organizations (spec 7.1): onboarding one, showing one, correcting its row, and sending its Owner a new
// invite. Platform staff of either level.
import {
  onboardedOrganization,
  onboardOrganizationInput,
  organizationDetails,
  organizationRecord,
  resendInviteInput,
  updateOrganizationInput,
} from "@travel-crm/contracts/platform";
import { organizationIdInput } from "@travel-crm/contracts/subscriptions";
import { getOrganization, onboardOrganization, resendInvite, updateOrganization } from "@travel-crm/domain/platform";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const organizationsRouter = platformT.router({
  onboard: staffProcedure
    .input(onboardOrganizationInput)
    .output(onboardedOrganization)
    .mutation(({ ctx, input }) => onboardOrganization(ctx.services, ctx.staff, input)),
  get: staffProcedure
    .input(organizationIdInput)
    .output(organizationDetails)
    .query(({ ctx, input }) => getOrganization(ctx.services, input.organizationId)),
  update: staffProcedure
    .input(updateOrganizationInput)
    .output(organizationRecord)
    .mutation(({ ctx, input }) => updateOrganization(ctx.services, ctx.staff, input)),
  resendInvite: staffProcedure
    .input(resendInviteInput)
    .mutation(({ ctx, input }) => resendInvite(ctx.services, ctx.staff, input)),
});
```

In `packages/api/src/platform/platform-router.ts`:

replace:
```ts
import { staffProcedure } from "./procedures.js";
import { plansRouter } from "./routers/plans.js";
```
with:
```ts
import { staffProcedure } from "./procedures.js";
import { organizationsRouter } from "./routers/organizations.js";
import { plansRouter } from "./routers/plans.js";
```

replace:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  plans: plansRouter,
```
with:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  organizations: organizationsRouter,
  plans: plansRouter,
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-organizations.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/onboarding.test.ts`

Expected: PASS, 3 tests in 1 file (apps/api); 5 tests in 1 file (packages/domain).

- [ ] **Step 7: Record the decision**

In `docs/adr/0021-onboarding.md`:

replace:
```markdown
  `/reset-password`, which creates the password account; then they sign in. `requestInvite` sends a new link later.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
```
with:
```markdown
  `/reset-password`, which creates the password account; then they sign in. `requestInvite` sends a new link later.
- **What onboarding makes, in order** (`onboardOrganization`): the organization's row (name, code, time zone, contact
  email) as the platform role; then, inside it, the starter roles, the business profile (legal name, GSTIN, GST state,
  contact: ADR 0023), the invited Owner and `organization.onboarded` in its log; then, as the platform role again, the
  subscription (ADR 0019) and `organization.onboarded` in the platform log. Everything in the organization's log is
  under the platform admin's name, with source `platform`.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown

- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```
with:
```markdown

- Organizations: `onboardOrganization(services, staff, input)` (spec 7.1, one platform transaction: the
  organization, its roles, business profile, subscription and invited Owner), `resendInvite(services, staff,
{ organizationId, memberId })`, `getOrganization(services, organizationId)` (its row, profile and subscription with
  payments), `updateOrganization(services, staff, input)` (name, time zone, contact email; never the code).
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=164 api=13 brand=21 contracts=81 db=219 domain=510 eslint-config=81 integrations=143 (1,232). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-platform-console
git add apps/api/test/console-organizations.test.ts docs/adr/0021-onboarding.md packages/api/src/platform/platform-router.ts packages/api/src/platform/routers/organizations.ts packages/contracts/src/platform/index.ts packages/contracts/src/platform/organizations.ts packages/domain/src/identity/index.ts packages/domain/src/identity/organization-records.ts packages/domain/src/platform/README.md packages/domain/src/platform/index.ts packages/domain/src/platform/onboarding.ts packages/domain/src/platform/organizations.ts packages/domain/test/platform/onboarding.test.ts packages/domain/test/platform/test-platform.ts
git commit -m "feat: onboard an organization from the console, and show and correct it there"
```

---
### Task P2: Export, purge and erase from the console, through the platform's own jobs

Spec 5's steps, for a super admin only: export, typed confirmation, the job, and a record in the platform log. An
export (the organization's tables, people and files with download links, or one subject's data) is logged, and a
purge or an erasure needs one from the last day. A purge needs the organization cancelled and its code typed; an
erasure (a DPDP request the organization passes on) names a removed member or one record. Each queues a job, ids
only: `platform.purge-organization` deletes everything in one platform transaction (ten minutes allowed), people and
stored files included, blanks the organization's webhook events and records `organization.purged`; it looks again
when it runs, and keeps an organization a payment made active since the request (`organization.purge-skipped`).
`platform.erase-subject` erases the person or record in every module that keeps something about it and records
`subject.erased` in both logs, without the personal data. Both jobs are safe to run again, and delete stored bytes
only after their transaction commits. One edge stays, recorded in ADR 0022: a PDF render queued before the
cancellation and running at the very moment of the purge could store its file after the purge's storage pass.

**Files:**
- Create: `packages/api/src/platform/routers/data-protection.ts`, `packages/contracts/src/platform/data-protection.ts`, `packages/domain/src/platform/erasure.ts`, `packages/domain/src/platform/exports.ts`, `packages/domain/src/platform/jobs.ts`, `packages/domain/src/platform/purge.ts`
- Modify: `docs/adr/0022-permanent-deletion.md`, `packages/api/src/platform/platform-router.ts`, `packages/contracts/src/platform/index.ts`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`
- Test: `apps/api/test/console-data-protection.test.ts`, `packages/domain/test/platform/data-protection.test.ts`

**Interfaces:**
- Consumes: Task D1's `storedFileKeys`, `deleteRecordFiles`, `deleteStoredFiles`, `exportedFiles`,
  `auditEntriesAbout`, `redactAuditEntries`, `forgetRecipient`; Task D2's `organizationRows`,
  `deleteOrganizationRows`, `tombstoneWebhookEvents`; Task A3's `personExport`, `erasePerson`, `organizationUserIds`,
  `deleteUsers`; Task S1's `getSubscription`, `cancel`, `recordPayment`; Task P1's `findOrganizationRecord`;
  `superAdminProcedure`; plan 3's `JobHandler`, `JobQueue`.
- Produces:
  - `@travel-crm/contracts/platform`: `erasureSubject` (`{ kind: "member", memberId } | { kind: "record",
    recordType, recordId }`), `exportOrganizationInput`, `organizationExport` (`{ exportedAt, organizationId, tables,
    people, files }`), `exportSubjectInput`, `subjectExport`, `requestPurgeInput` (`{ organizationId, confirmation
    }`), `requestErasureInput`, `queuedJob` (`{ jobId }`).
  - `@travel-crm/domain/platform`: `exportOrganization(services, staff, organizationId)`, `exportSubject(services,
    staff, { organizationId, subject })`, `requestPurge(services, staff, input)` (`CONFIRMATION_MISMATCH`, `CANCEL_FIRST`, `EXPORT_FIRST`),
    `requestErasure(services, staff, input)` (also `REMOVE_FIRST`), `purgeOrganization(services, job, { requireCancelled? })`
    (returns `PurgeResult` `{ rows, people, files }` or null), `eraseSubject(services, job)`,
    `PURGE_ORGANIZATION_QUEUE`, `ERASE_SUBJECT_QUEUE`, `platformJobHandlers(services): JobHandler[]`.
  - The console's router `dataProtection` (super admins: `exportOrganization`, `requestPurge`, `exportSubject`,
    `requestErasure`).

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/platform/data-protection.test.ts`:
```ts
// Permanent deletion (spec 5): export, typed confirmation, then the job. A whole organization is purged only once
// cancelled, and leaves only its record in the platform log; a removed person, or one record, is erased in every
// module that keeps something about it.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { withDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../../src/audit/index.js";
import { memberAccessOf } from "../identity/test-identity.js";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import {
  cancel,
  eraseSubject,
  ERASE_SUBJECT_QUEUE,
  exportOrganization,
  exportSubject,
  listPlatformLog,
  onboardOrganization,
  purgeOrganization,
  PURGE_ORGANIZATION_QUEUE,
  recordPayment,
  requestErasure,
  requestPurge,
} from "../../src/platform/index.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000aa";

describe("permanent deletion", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  /** An onboarded agency with a staff member, a traveller's file and audit entries about the traveller. */
  async function agency() {
    const input = onboardingInput(plan);
    const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, input);
    const client = test.identity.database.client;
    const ownerUserId = (await client.member.findUniqueOrThrow({ where: { id: ownerMemberId } })).userId;
    const owner = await memberAccessOf(test.identity.identity, ownerUserId, organizationId);
    const staff = await test.identity.identity.staff.create(owner, {
      name: "Ravi",
      email: `ravi-${input.code.toLowerCase()}@example.test`,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.services.db.forOrg(organizationId, async (tx) => {
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [staff.userId],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Just now",
        channels: [],
      });
      await recordAudit(tx, owner, {
        action: "traveller.updated",
        entityType: "traveller",
        entityId: traveller,
        after: { phone: "+919876543210" },
      });
      const file = await tx.attachment.create({
        data: {
          recordType: "traveller",
          recordId: traveller,
          fileName: "Passport.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date(),
        },
      });
      await test.storage.put({
        key: `organizations/${organizationId}/attachments/${file.id}`,
        contentType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      });
    });
    return { organizationId, code: input.code, owner, staff };
  }

  it("exports an organization: its tables, people and files with links", async () => {
    const { organizationId } = await agency();
    const exported = await exportOrganization(test.services, support, organizationId);
    expect(exported.tables.organization).toEqual([expect.objectContaining({ id: organizationId })]);
    expect(exported.tables.subscription).toHaveLength(1);
    expect(exported.tables.outbox_event).toBeUndefined();
    expect(exported.people.map((person) => person.name).sort()).toEqual(["Asha Sharma", "Ravi"]);
    expect(exported.files).toEqual([
      expect.objectContaining({ fileName: "Passport.pdf", downloadUrl: expect.any(String) as string }),
    ]);
  });

  it("purges a cancelled organization only with its code typed and a fresh export, then leaves its record alone", async () => {
    const { organizationId, code } = await agency();
    const ask = (confirmation: string) => requestPurge(test.services, support, { organizationId, confirmation });
    await expect(ask("WRONG")).rejects.toMatchObject({ reason: "CONFIRMATION_MISMATCH" });
    await expect(ask(code)).rejects.toMatchObject({ reason: "CANCEL_FIRST" });
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await expect(ask(code)).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    await exportOrganization(test.services, support, organizationId);
    const { jobId } = await ask(code);
    expect(test.queue.sent).toContainEqual(
      expect.objectContaining({
        queue: PURGE_ORGANIZATION_QUEUE,
        data: { organizationId, requestedBy: supportUserId },
        options: { id: jobId },
      }),
    );

    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toMatchObject({
      people: 2,
      files: 1,
    });
    const client = test.identity.database.client;
    expect(await client.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await withDeleted(() => client.member.count({ where: { organizationId } }))).toBe(0);
    expect([...test.storage.objects.keys()].some((key) => key.includes(organizationId))).toBe(false);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries[0]).toMatchObject({ action: "organization.purged", before: { code } });
    // Again: nothing left, nothing done.
    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toBeNull();
  });

  it("skips a queued purge when a payment made the organization active again before the job ran", async () => {
    const { organizationId, code } = await agency();
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await exportOrganization(test.services, support, organizationId);
    await requestPurge(test.services, support, { organizationId, confirmation: code });
    await recordPayment(test.services, support, {
      organizationId,
      amountPaise: 250_000,
      paidOn: "2026-10-01",
      paidThrough: "2099-12-31",
      reference: "NEFT UTR 412345678901",
    });
    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toBeNull();
    expect(await test.identity.database.client.organization.count({ where: { id: organizationId } })).toBe(1);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries[0]).toMatchObject({ action: "organization.purge-skipped", after: { status: "active" } });
  });

  it("erases a removed member after an export: sign-in data, notifications, and their record's audit snapshots", async () => {
    const { organizationId, code, owner, staff } = await agency();
    const subject = { kind: "member" as const, memberId: staff.memberId };
    await expect(
      requestErasure(test.services, support, { organizationId, subject, confirmation: code }),
    ).rejects.toMatchObject({ reason: "REMOVE_FIRST" });
    await test.identity.identity.staff.remove(owner, { memberId: staff.memberId });
    await expect(
      requestErasure(test.services, support, { organizationId, subject, confirmation: code }),
    ).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    expect((await exportSubject(test.services, support, { organizationId, subject })).person).toMatchObject({
      name: "Ravi",
    });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    expect(test.queue.sent.at(-1)).toMatchObject({
      queue: ERASE_SUBJECT_QUEUE,
      data: { kind: "member", memberId: staff.memberId },
    });

    await eraseSubject(test.services, { organizationId, subject, requestedBy: supportUserId });
    const user = await test.identity.database.client.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(user.name).toBe("Erased person");
    expect(
      await test.services.db.forOrg(organizationId, (tx) =>
        tx.notification.count({ where: { recipientUserId: staff.userId } }),
      ),
    ).toBe(0);
    const entries = await test.services.db.forOrg(organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: staff.memberId }, orderBy: { id: "asc" } }),
    );
    expect(entries.at(-1)).toMatchObject({ action: "subject.erased", source: "platform", actorUserId: supportUserId });
    expect(
      entries
        .filter((entry) => entry.after !== null && entry.action !== "subject.erased")
        .every((entry) => JSON.stringify(entry.after) === '{"redacted":true}'),
    ).toBe(true);
  });

  it("erases one record: its files and their bytes, and its audit snapshots", async () => {
    const { organizationId, code } = await agency();
    const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };
    await exportSubject(test.services, support, { organizationId, subject });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    await eraseSubject(test.services, { organizationId, subject, requestedBy: supportUserId });
    expect(
      await test.services.db.forOrg(organizationId, (tx) => tx.attachment.count({ where: { recordId: traveller } })),
    ).toBe(0);
    expect([...test.storage.objects.keys()].some((key) => key.includes(organizationId))).toBe(false);
    const entry = await test.services.db.forOrg(organizationId, (tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { entityId: traveller, action: "traveller.updated" } }),
    );
    expect(entry.after).toEqual({ redacted: true });
  });
});
```

`apps/api/test/console-data-protection.test.ts`:
```ts
// Permanent deletion through the console (spec 5): only a super admin exports, purges or erases, and a purge asks for
// the organization's code.
import type { OrganizationExport } from "@travel-crm/contracts/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("permanent deletion through the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("lets only a super admin export, purge or erase", async () => {
    const organizationId = agency.organizationId;
    for (const [path, input] of [
      ["dataProtection.exportOrganization", { organizationId }],
      ["dataProtection.requestPurge", { organizationId, confirmation: agency.code }],
      [
        "dataProtection.exportSubject",
        { organizationId, subject: { kind: "member", memberId: agency.owner.memberId } },
      ],
    ] as const) {
      expect(await refusalOf(await consoleMutate(testConsole, path, input, support.jar)), path).toEqual({
        status: 403,
        reason: "SUPER_ADMIN_ONLY",
      });
    }
    const exported = await dataOf<OrganizationExport>(
      await consoleMutate(testConsole, "dataProtection.exportOrganization", { organizationId }, superAdmin.jar),
    );
    expect(exported.organizationId).toBe(organizationId);
  });

  it("asks for the organization's code, and refuses a purge of an organization still subscribed", async () => {
    const organizationId = agency.organizationId;
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "dataProtection.requestPurge",
          { organizationId, confirmation: "NOPE" },
          superAdmin.jar,
        ),
      ),
    ).toEqual({ status: 400, reason: "CONFIRMATION_MISMATCH" });
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "dataProtection.requestPurge",
          { organizationId, confirmation: agency.code },
          superAdmin.jar,
        ),
      ),
    ).toEqual({ status: 409, reason: "CANCEL_FIRST" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-data-protection.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/data-protection.test.ts`

Expected: FAIL. In `packages/domain`, all 5: `TypeError: exportOrganization is not a function`, `requestPurge is
not a function`, `exportSubject is not a function`, `requestErasure is not a function`. In `apps/api`, both: the
`dataProtection` paths answer 404 where 403 and 400 are expected.

- [ ] **Step 3: Export, and the purge and erasure with their jobs**

`packages/contracts/src/platform/data-protection.ts`:
```ts
// Permanent deletion from the console (spec 5): an export first, then a typed confirmation, then a job, for a whole
// organization or for one person or record on a DPDP erasure request. Super admins only.
import { z } from "zod";
import { auditEntityType, auditEntry } from "../audit/index.js";
import { recordId } from "../identity/index.js";

/** Who or what an erasure is about: a removed member, or one record of a module (a traveller, later). */
export const erasureSubject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("member"), memberId: recordId }),
  z
    .strictObject({ kind: z.literal("record"), recordType: auditEntityType, recordId })
    .refine((subject) => subject.recordType !== "member", {
      message: "Erase a member as a member",
      path: ["recordType"],
    }),
]);
export type ErasureSubject = z.infer<typeof erasureSubject>;

export const exportedFile = z.object({
  id: recordId,
  recordType: z.string(),
  recordId: recordId,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.int(),
  sensitive: z.boolean(),
  deleted: z.boolean(),
  /** Works for 24 hours; null for an upload that never finished. */
  downloadUrl: z.string().nullable(),
});

export const exportedPerson = z.object({
  memberId: recordId,
  userId: recordId,
  name: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  role: z.string(),
  joinedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});

export const exportOrganizationInput = z.strictObject({ organizationId: recordId });
export type ExportOrganizationInput = z.infer<typeof exportOrganizationInput>;

/** Everything the organization keeps, for it to take away before a purge. */
export const organizationExport = z.object({
  exportedAt: z.iso.datetime(),
  organizationId: recordId,
  /** Each table's rows, by table name, as JSON. */
  tables: z.record(z.string(), z.array(z.unknown())),
  people: z.array(exportedPerson),
  files: z.array(exportedFile),
});
export type OrganizationExport = z.infer<typeof organizationExport>;

export const exportSubjectInput = z.strictObject({ organizationId: recordId, subject: erasureSubject });
export type ExportSubjectInput = z.infer<typeof exportSubjectInput>;

/** What the organization keeps about one person or record, for the person before an erasure. */
export const subjectExport = z.object({
  exportedAt: z.iso.datetime(),
  person: exportedPerson.nullable(),
  auditEntries: z.array(auditEntry),
  files: z.array(exportedFile),
});
export type SubjectExport = z.infer<typeof subjectExport>;

/** The typed confirmation is the organization's code. */
export const requestPurgeInput = z.strictObject({ organizationId: recordId, confirmation: z.string().max(20) });
export type RequestPurgeInput = z.infer<typeof requestPurgeInput>;

export const requestErasureInput = z.strictObject({
  organizationId: recordId,
  subject: erasureSubject,
  confirmation: z.string().max(20),
});
export type RequestErasureInput = z.infer<typeof requestErasureInput>;

export const queuedJob = z.object({ jobId: recordId });
export type QueuedJob = z.infer<typeof queuedJob>;
```

In `packages/contracts/src/platform/index.ts`:

replace:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./organizations.js";
```
with:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./data-protection.js";
export * from "./organizations.js";
```

`packages/domain/src/platform/exports.ts`:
```ts
// Exports before permanent deletion (spec 5: "export, typed confirmation, purge job"): everything an organization
// keeps, or what it keeps about one person or record. Each export is logged; a purge or an erasure needs one from the
// last day.
import type { ErasureSubject, OrganizationExport, SubjectExport } from "@travel-crm/contracts/platform";
import { organizationRows, asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { auditEntriesAbout } from "../audit/index.js";
import { exportedFiles } from "../files/index.js";
import { findOrganizationRecord, personExport } from "../identity/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Download links in an export work for a day. */
const EXPORT_LINK_SECONDS = 24 * 60 * 60;

/** Tables of the workings, not of the organization's data. */
const INTERNAL_TABLES = ["outbox_event", "processed_event", "push_subscription"];

/** An export of everything this long ago or less counts for a purge or an erasure. */
export const EXPORT_VALID_FOR_MS = 24 * 60 * 60 * 1000;

/** The record an erasure subject names, as the audit log and files know it. */
export function subjectRecord(subject: ErasureSubject): { recordType: string; recordId: string } {
  return subject.kind === "member"
    ? { recordType: "member", recordId: subject.memberId }
    : { recordType: subject.recordType, recordId: subject.recordId };
}

export async function exportOrganization(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<OrganizationExport> {
  return services.platformDb.transaction(
    async (tx) => {
      await findOrganizationRecord(tx, organizationId);
      const tables = await organizationRows(tx, organizationId, { except: INTERNAL_TABLES });
      const people = [];
      for (const member of tables.member ?? []) {
        people.push(await personExport(tx, organizationId, (member as { id: string }).id));
      }
      const files = await exportedFiles(tx, services.storage, { organizationId }, EXPORT_LINK_SECONDS);
      await recordPlatformAudit(tx, staff, {
        action: "organization.exported",
        targetType: "organization",
        targetId: organizationId,
        targetOrganizationId: organizationId,
        after: { tables: Object.keys(tables).length, people: people.length, files: files.length },
      });
      return { exportedAt: new Date().toISOString(), organizationId, tables, people, files };
    },
    { timeout: 60_000 },
  );
}

export async function exportSubject(
  services: PlatformServices,
  staff: PlatformActor,
  input: { organizationId: string; subject: ErasureSubject },
): Promise<SubjectExport> {
  const { organizationId, subject } = input;
  const record = subjectRecord(subject);
  return services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, organizationId);
    const person = subject.kind === "member" ? await personExport(tx, organizationId, subject.memberId) : null;
    const auditEntries = await asOrganization(tx, organizationId, (orgTx) =>
      auditEntriesAbout(orgTx, { organizationId, entityType: record.recordType, entityId: record.recordId }),
    );
    const files = await exportedFiles(tx, services.storage, { organizationId, ...record }, EXPORT_LINK_SECONDS);
    await recordPlatformAudit(tx, staff, {
      action: "subject.exported",
      targetType: record.recordType,
      targetId: record.recordId,
      targetOrganizationId: organizationId,
      after: { auditEntries: auditEntries.length, files: files.length },
    });
    return { exportedAt: new Date().toISOString(), person, auditEntries, files };
  });
}

/** Whether `action` was logged for the target within the last day. */
export async function exportedRecently(tx: PlatformTx, action: string, targetId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - EXPORT_VALID_FOR_MS);
  return (await tx.platformAuditEntry.count({ where: { action, targetId, occurredAt: { gte: since } } })) > 0;
}
```

`packages/domain/src/platform/purge.ts`:
```ts
// Purging a whole organization (spec 5): a super admin asks, with the organization's code typed and an export from
// the last day, once it is cancelled; the console's job then deletes everything, and the platform log keeps the record.
import { randomUUID } from "node:crypto";
import type { QueuedJob, RequestPurgeInput } from "@travel-crm/contracts/platform";
import { deleteOrganizationRows, type PlatformTx } from "@travel-crm/db/platform";
import { deleteStoredFiles, storedFileKeys } from "../files/index.js";
import { deleteUsers, findOrganizationRecord, organizationUserIds } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { getSubscription } from "../subscriptions/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { exportedRecently } from "./exports.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const PURGE_ORGANIZATION_QUEUE = "platform.purge-organization";

/** Big organizations take a while; the purge is one transaction, so nothing is left half done. */
const PURGE_TIMEOUT_MS = 10 * 60 * 1000;

export async function requestPurge(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestPurgeInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  return services.platformDb.transaction(async (tx) => {
    const organization = await findOrganizationRecord(tx, input.organizationId);
    if (input.confirmation !== organization.code) {
      throw new DomainError("VALIDATION", "CONFIRMATION_MISMATCH", "Type the organization's code to confirm");
    }
    if ((await getSubscription(tx, input.organizationId)).status !== "cancelled") {
      throw new DomainError("CONFLICT", "CANCEL_FIRST", "Cancel the organization's subscription before purging it");
    }
    if (!(await exportedRecently(tx, "organization.exported", input.organizationId, now))) {
      throw new DomainError("CONFLICT", "EXPORT_FIRST", "Export the organization's data first (within the last day)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "organization.purge-requested",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
    });
    const jobId = randomUUID();
    await services.queue.send(
      PURGE_ORGANIZATION_QUEUE,
      { organizationId: input.organizationId, requestedBy: staff.userId },
      { id: jobId },
    );
    return { jobId };
  });
}

/** What a purge removed, in the platform log. */
export interface PurgeResult {
  rows: number;
  people: number;
  files: number;
}

/**
 * The job: deletes the organization's rows (every table, found from the catalog), its people, and its stored files,
 * and blanks its webhook events, then records "organization.purged". An organization already gone is a no-op, so the
 * job is safe to run again; stored files are deleted after the transaction commits. It purges only an organization
 * still cancelled: one a payment made active again since the request is kept, and "organization.purge-skipped" says
 * why. The nightly demo reset, which purges an active demo, says `requireCancelled: false`.
 */
export async function purgeOrganization(
  services: PlatformServices,
  job: { organizationId: string; requestedBy: string | null },
  options: { requireCancelled?: boolean } = {},
): Promise<PurgeResult | null> {
  const purged = await services.platformDb.transaction(
    async (tx) => {
      const code = await codeOf(tx, job.organizationId);
      if (code === null) return null;
      const status = await statusOf(tx, job.organizationId);
      if ((options.requireCancelled ?? true) && status !== "cancelled") {
        await recordPlatformAudit(
          tx,
          { userId: job.requestedBy },
          {
            action: "organization.purge-skipped",
            targetType: "organization",
            targetId: job.organizationId,
            targetOrganizationId: job.organizationId,
            after: { status },
          },
        );
        return null;
      }
      const keys = await storedFileKeys(tx, job.organizationId);
      const userIds = await organizationUserIds(tx, job.organizationId);
      const webhooks = await tombstoneWebhookEvents(tx, job.organizationId);
      const deleted = await deleteOrganizationRows(tx, job.organizationId);
      const people = await deleteUsers(tx, userIds);
      const result: PurgeResult = {
        rows: Object.values(deleted).reduce((total, count) => total + count, 0),
        people,
        files: keys.length,
      };
      const actor: PlatformActor = { userId: job.requestedBy };
      await recordPlatformAudit(tx, actor, {
        action: "organization.purged",
        targetType: "organization",
        targetId: job.organizationId,
        targetOrganizationId: job.organizationId,
        before: { code },
        after: { ...result, webhooksTombstoned: webhooks.tombstoned, webhooksWaiting: webhooks.waiting },
      });
      return { result, keys };
    },
    { timeout: PURGE_TIMEOUT_MS },
  );
  if (!purged) return null;
  await deleteStoredFiles(services.storage, purged.keys);
  return purged.result;
}

/** The subscription's status as stored, or null without one. */
async function statusOf(tx: PlatformTx, organizationId: string): Promise<string | null> {
  const subscription = await tx.subscription.findUnique({ where: { organizationId }, select: { status: true } });
  return subscription?.status ?? null;
}

/** The organization's code, or null once it is gone. */
async function codeOf(tx: PlatformTx, organizationId: string): Promise<string | null> {
  try {
    return (await findOrganizationRecord(tx, organizationId)).code;
  } catch (error) {
    if (error instanceof DomainError && error.reason === "ORGANIZATION_NOT_FOUND") return null;
    throw error;
  }
}
```

`packages/domain/src/platform/erasure.ts`:
```ts
// Erasing one person or record on a DPDP request passed on by the organization (spec 5): a super admin asks, with the
// organization's code typed and an export from the last day; the console's job then erases it, module by module, and
// records it in the organization's log and the platform's, without the personal data.
import { randomUUID } from "node:crypto";
import type { ErasureSubject, QueuedJob, RequestErasureInput } from "@travel-crm/contracts/platform";
import { erasureSubject } from "@travel-crm/contracts/platform";
import type { JobData } from "@travel-crm/integrations/jobs";
import { recordAudit, redactAuditEntries } from "../audit/index.js";
import { deleteRecordFiles, deleteStoredFiles } from "../files/index.js";
import { erasePerson, findOrganizationRecord, personExport } from "../identity/index.js";
import { DomainError, platformActor, systemActor } from "../kernel/index.js";
import { forgetRecipient } from "../notifications/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { exportedRecently, subjectRecord } from "./exports.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const ERASE_SUBJECT_QUEUE = "platform.erase-subject";

/** The job's data: flat, ids only (job data has no row-level security). */
function jobDataOf(organizationId: string, subject: ErasureSubject, requestedBy: string): JobData {
  return subject.kind === "member"
    ? { organizationId, kind: "member", memberId: subject.memberId, requestedBy }
    : { organizationId, kind: "record", recordType: subject.recordType, recordId: subject.recordId, requestedBy };
}

/** Reads a job's data back, refusing anything malformed: a bug, so the job fails loudly. */
export function erasureJobOf(data: JobData): { organizationId: string; subject: ErasureSubject; requestedBy: string } {
  const { organizationId, requestedBy, kind, memberId, recordType, recordId } = data;
  if (typeof organizationId !== "string" || typeof requestedBy !== "string") {
    throw new TypeError("An erasure job needs organizationId and requestedBy");
  }
  return {
    organizationId,
    requestedBy,
    subject: erasureSubject.parse(kind === "member" ? { kind, memberId } : { kind, recordType, recordId }),
  };
}

export async function requestErasure(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestErasureInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  const record = subjectRecord(input.subject);
  return services.platformDb.transaction(async (tx) => {
    const organization = await findOrganizationRecord(tx, input.organizationId);
    if (input.confirmation !== organization.code) {
      throw new DomainError("VALIDATION", "CONFIRMATION_MISMATCH", "Type the organization's code to confirm");
    }
    if (input.subject.kind === "member") {
      const person = await personExport(tx, input.organizationId, input.subject.memberId);
      if (person.removedAt === null) {
        throw new DomainError(
          "CONFLICT",
          "REMOVE_FIRST",
          "Remove this person from the organization before erasing them",
        );
      }
    }
    if (!(await exportedRecently(tx, "subject.exported", record.recordId, now))) {
      throw new DomainError("CONFLICT", "EXPORT_FIRST", "Export what is kept about them first (within the last day)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "subject.erasure-requested",
      targetType: record.recordType,
      targetId: record.recordId,
      targetOrganizationId: input.organizationId,
    });
    const jobId = randomUUID();
    await services.queue.send(ERASE_SUBJECT_QUEUE, jobDataOf(input.organizationId, input.subject, staff.userId), {
      id: jobId,
    });
    return { jobId };
  });
}

/**
 * The job: erases the subject in every module that keeps something about it, in one platform transaction, then
 * deletes its stored files. For a member: identity's sign-in data, their notifications, opt-outs and browsers; for
 * either: the record's files, its audit entries' snapshots, and the organization's processed webhook payloads (they may
 * quote the person). Safe to run again.
 */
export async function eraseSubject(
  services: PlatformServices,
  job: { organizationId: string; subject: ErasureSubject; requestedBy: string | null },
): Promise<void> {
  const { organizationId, subject } = job;
  const record = subjectRecord(subject);
  const keys = await services.platformDb.transaction(async (tx) => {
    if (subject.kind === "member") {
      const { userId } = await erasePerson(tx, organizationId, subject.memberId);
      await forgetRecipient(tx, { organizationId, userId });
    }
    const fileKeys = await deleteRecordFiles(tx, { organizationId, ...record });
    const redacted = await redactAuditEntries(tx, {
      organizationId,
      entityType: record.recordType,
      entityId: record.recordId,
    });
    const webhooks = await tombstoneWebhookEvents(tx, organizationId);
    const actor =
      job.requestedBy === null ? systemActor(organizationId) : platformActor(organizationId, job.requestedBy);
    await recordAudit(tx, actor, {
      action: "subject.erased",
      entityType: record.recordType,
      entityId: record.recordId,
    });
    await recordPlatformAudit(
      tx,
      { userId: job.requestedBy },
      {
        action: "subject.erased",
        targetType: record.recordType,
        targetId: record.recordId,
        targetOrganizationId: organizationId,
        after: {
          files: fileKeys.length,
          auditEntriesRedacted: redacted,
          webhooksTombstoned: webhooks.tombstoned,
          webhooksWaiting: webhooks.waiting,
        },
      },
    );
    return fileKeys;
  });
  await deleteStoredFiles(services.storage, keys);
}
```

`packages/domain/src/platform/jobs.ts`:
```ts
// The platform's own jobs, which only the console process runs: it alone holds the platform role's connection.
import type { JobData } from "@travel-crm/integrations/jobs";
import type { JobHandler } from "../jobs/index.js";
import { ERASE_SUBJECT_QUEUE, eraseSubject, erasureJobOf } from "./erasure.js";
import { PURGE_ORGANIZATION_QUEUE, purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

function purgeJobOf(data: JobData): { organizationId: string; requestedBy: string | null } {
  const { organizationId, requestedBy } = data;
  if (typeof organizationId !== "string") throw new TypeError("A purge job needs an organizationId");
  return { organizationId, requestedBy: typeof requestedBy === "string" ? requestedBy : null };
}

/** The handlers the console process registers with its job runner. */
export function platformJobHandlers(services: PlatformServices): JobHandler[] {
  return [
    {
      queue: PURGE_ORGANIZATION_QUEUE,
      handle: async (data) => {
        await purgeOrganization(services, purgeJobOf(data));
      },
    },
    {
      queue: ERASE_SUBJECT_QUEUE,
      handle: async (data) => {
        await eraseSubject(services, erasureJobOf(data));
      },
    },
  ];
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { onboardOrganization, resendInvite } from "./onboarding.js";
```
with:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { ERASE_SUBJECT_QUEUE, eraseSubject, requestErasure } from "./erasure.js";
export { exportOrganization, exportSubject } from "./exports.js";
export { platformJobHandlers } from "./jobs.js";
export { onboardOrganization, resendInvite } from "./onboarding.js";
```

replace:
```ts
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
export { createPlatformServices, type PlatformServices, type PlatformServicesOptions } from "./services.js";
```
with:
```ts
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
export { PURGE_ORGANIZATION_QUEUE, purgeOrganization, requestPurge, type PurgeResult } from "./purge.js";
export { createPlatformServices, type PlatformServices, type PlatformServicesOptions } from "./services.js";
```

`packages/api/src/platform/routers/data-protection.ts`:
```ts
// Permanent deletion from the console (spec 5): exports, then a purge of a whole organization or the erasure of one
// person or record, each a job the console runs. Super admins only.
import {
  exportOrganizationInput,
  exportSubjectInput,
  organizationExport,
  queuedJob,
  requestErasureInput,
  requestPurgeInput,
  subjectExport,
} from "@travel-crm/contracts/platform";
import { exportOrganization, exportSubject, requestErasure, requestPurge } from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dataProtectionRouter = platformT.router({
  /** Everything the organization keeps; a purge needs one from the last day. A mutation: it is logged. */
  exportOrganization: superAdminProcedure
    .input(exportOrganizationInput)
    .output(organizationExport)
    .mutation(({ ctx, input }) => exportOrganization(ctx.services, ctx.staff, input.organizationId)),
  requestPurge: superAdminProcedure
    .input(requestPurgeInput)
    .output(queuedJob)
    .mutation(({ ctx, input }) => requestPurge(ctx.services, ctx.staff, input)),
  exportSubject: superAdminProcedure
    .input(exportSubjectInput)
    .output(subjectExport)
    .mutation(({ ctx, input }) => exportSubject(ctx.services, ctx.staff, input)),
  requestErasure: superAdminProcedure
    .input(requestErasureInput)
    .output(queuedJob)
    .mutation(({ ctx, input }) => requestErasure(ctx.services, ctx.staff, input)),
});
```

In `packages/api/src/platform/platform-router.ts`:

replace:
```ts
import { staffProcedure } from "./procedures.js";
import { organizationsRouter } from "./routers/organizations.js";
```
with:
```ts
import { staffProcedure } from "./procedures.js";
import { dataProtectionRouter } from "./routers/data-protection.js";
import { organizationsRouter } from "./routers/organizations.js";
```

replace:
```ts
  organizations: organizationsRouter,
  plans: plansRouter,
```
with:
```ts
  organizations: organizationsRouter,
  dataProtection: dataProtectionRouter,
  plans: plansRouter,
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-data-protection.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/data-protection.test.ts`

Expected: PASS, 2 tests in 1 file (apps/api); 5 tests in 1 file (packages/domain).

- [ ] **Step 5: Record the decision**

In `docs/adr/0022-permanent-deletion.md`:

replace:
```markdown

## Context
```
with:
```markdown

- **The console's steps, as spec 5 lists them.** A super admin exports (the organization's tables, people and files,
  or one subject's data), types the organization's code, and the console queues a job: `platform.purge-organization`
  for a cancelled organization, `platform.erase-subject` for a removed member or one record. A purge or an erasure
  needs an export from the last day. The job runs everything in one platform transaction (the purge allows ten
  minutes), deletes stored files after it commits, and records `organization.purged` or `subject.erased` in the
  platform log; an erasure also records `subject.erased`, without personal data, in the organization's own log. Both
  jobs are safe to run again. The purge looks again when it runs: an organization a payment made active since the
  request is kept, and `organization.purge-skipped` says so.

## Context
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown
  payments), `updateOrganization(services, staff, input)` (name, time zone, contact email; never the code).
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```
with:
```markdown
  payments), `updateOrganization(services, staff, input)` (name, time zone, contact email; never the code).
- Permanent deletion (spec 5), super admins only: `exportOrganization(services, staff, organizationId)` and
  `exportSubject(services, staff, { organizationId, subject })` (logged; a purge or erasure needs one from the last
  day), `requestPurge(services, staff, { organizationId, confirmation })` (the code typed, the subscription
  cancelled) and `requestErasure(services, staff, { organizationId, subject, confirmation })` (a removed member or one
  record), which queue `platform.purge-organization` and `platform.erase-subject`; `purgeOrganization` (which keeps
  an organization no longer cancelled, as `organization.purge-skipped`) and `eraseSubject`, the jobs;
  `platformJobHandlers(services)`, for the console process's job runner.
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=166 api=13 brand=21 contracts=81 db=219 domain=515 eslint-config=81 integrations=143 (1,239). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-platform-console
git add apps/api/test/console-data-protection.test.ts docs/adr/0022-permanent-deletion.md packages/api/src/platform/platform-router.ts packages/api/src/platform/routers/data-protection.ts packages/contracts/src/platform/data-protection.ts packages/contracts/src/platform/index.ts packages/domain/src/platform/README.md packages/domain/src/platform/erasure.ts packages/domain/src/platform/exports.ts packages/domain/src/platform/index.ts packages/domain/src/platform/jobs.ts packages/domain/src/platform/purge.ts packages/domain/test/platform/data-protection.test.ts
git commit -m "feat: export, purge and erase from the console, through the platform's own jobs"
```

---
### Task P3: The platform dashboard and the failed-jobs list

Spec 7.4's dashboard: every organization with its status, plan, days to its next change, seats and storage against
its limits, last activity, and this month's changes and documents issued, counted inside each organization
(`asOrganization`) in one platform transaction. Spec 9.1's failed-jobs list: after its last retry a job lands there;
support sees it and can run it again from its first attempt, and a super admin can remove a schedule that a removed
job left behind (ADR 0010). The console reaches pg-boss through a `JobAdministration` port, so tests use an
in-memory one; each retry and removed schedule is recorded in the platform log. Job data holds only ids, so the list
shows nothing personal.

**Files:**
- Create: `packages/api/src/platform/routers/operations.ts`, `packages/contracts/src/platform/console-dashboard.ts`, `packages/domain/src/platform/dashboard.ts`, `packages/domain/src/platform/failed-jobs.ts`, `packages/integrations/src/jobs/memory-job-administration.ts`
- Modify: `docs/adr/0018-platform-console.md`, `packages/api/src/platform/platform-router.ts`, `packages/contracts/src/platform/index.ts`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`, `packages/domain/src/platform/services.ts`, `packages/integrations/src/jobs/index.ts`, `packages/integrations/src/jobs/pg-boss-jobs.ts`
- Test: `apps/api/test/console-operations.test.ts`, `apps/api/test/support/console.ts`, `packages/domain/test/platform/dashboard.test.ts`, `packages/domain/test/platform/test-platform.ts`, `packages/integrations/test/jobs/pg-boss-jobs.test.ts`

**Interfaces:**
- Consumes: Task S2's `entitlementsOf`; Task A3's `memberActivity`; Task P1's `listOrganizationRecords`; Task D1's
  `bytesStored`, `auditEntriesSince`, `documentsIssuedSince`; plan 3's `PgBossJobs`, `FailedJob`, `calendarDateIn`,
  `startOfDayIn`, `parseCalendarDate`.
- Produces:
  - `@travel-crm/integrations/jobs`: `JobAdministration` (`failedJobs(options?)`, `retryFailedJob(queue, jobId)`,
    `schedules()`, `unschedule(queue)`), which `PgBossJobs` implements (`retryFailedJob` is pg-boss's `retry`);
    `createMemoryJobAdministration(): MemoryJobAdministration` (with `failed`, `scheduled`, `retried`).
  - `PlatformServices.jobs: JobAdministration` (and `createPlatformServices` takes it).
  - `@travel-crm/contracts/platform`: `organizationOverview`, `failedJob`, `listFailedJobsInput`,
    `retryFailedJobInput`, `jobSchedule`, `unscheduleInput`.
  - `@travel-crm/domain/platform`: `organizationsOverview(services, now?)`, `listFailedJobs(services, limit)`,
    `retryFailedJob(services, staff, input)`, `listSchedules(services)`, `removeSchedule(services, staff, queue)`.
  - The console's routers `dashboard` (`organizations`) and `jobs` (`failed`, `retry`, `schedules`; super admins
    `unschedule`); `createTestConsole(server, { jobs? })`.

- [ ] **Step 1: Write the failing tests**

In `packages/integrations/test/jobs/pg-boss-jobs.test.ts`:

replace:
```ts
    expect(lines.splice(0)).toEqual(Array(3).fill(`queue probe.failing, job ${String(id)} failed: Error`));
  });
```
with:
```ts
    expect(lines.splice(0)).toEqual(Array(3).fill(`queue probe.failing, job ${String(id)} failed: Error`));
  });

  it("runs a failed job again when asked, from its first attempt", async () => {
    const runs: number[] = [];
    let fail = true;
    await jobs.work("probe.retried", (job) => {
      runs.push(job.retryCount);
      return fail ? Promise.reject(new Error("not yet")) : Promise.resolve();
    });
    const id = await jobs.send("probe.retried", { eventId: "e9" }, { retryLimit: 0 });
    await eventually(async () => (await jobs.failedJobs()).some((job) => job.id === id), 25_000);
    fail = false;
    if (id === null) throw new Error("the job was not queued");
    await jobs.retryFailedJob("probe.retried", id);
    await eventually(() => runs.length === 2, 25_000);
    expect((await jobs.failedJobs()).some((job) => job.id === id)).toBe(false);
    // The failed attempt was logged by queue, job id and name; take it out of the suite's check for pg-boss's own.
    expect(lines.splice(0)).toEqual([`queue probe.retried, job ${id} failed: Error`]);
  });
```

In `packages/domain/test/platform/test-platform.ts`:

replace:
```ts
import { createDatabase } from "@travel-crm/db";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
```
with:
```ts
import { createDatabase } from "@travel-crm/db";
import {
  createMemoryJobAdministration,
  createMemoryJobQueue,
  type MemoryJobAdministration,
  type MemoryJobQueue,
} from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
```

replace:
```ts
  queue: MemoryJobQueue;
  identity: TestIdentity;
```
with:
```ts
  queue: MemoryJobQueue;
  jobs: MemoryJobAdministration;
  identity: TestIdentity;
```

replace:
```ts
  const queue = createMemoryJobQueue();
  const services = createPlatformServices({
```
with:
```ts
  const queue = createMemoryJobQueue();
  const jobs = createMemoryJobAdministration();
  const services = createPlatformServices({
```

replace:
```ts
    queue,
  });
```
with:
```ts
    queue,
    jobs,
  });
```

replace:
```ts
    queue,
    identity,
```
with:
```ts
    queue,
    jobs,
    identity,
```

`packages/domain/test/platform/dashboard.test.ts`:
```ts
// The platform dashboard (spec 7.4): each organization's status, days left, seats used, last activity and this month's
// usage, counted by the modules that keep them; and the failed-jobs list, retried and cleared from the console.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listFailedJobs,
  listPlatformLog,
  listSchedules,
  onboardOrganization,
  organizationsOverview,
  removeSchedule,
  retryFailedJob,
} from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("the platform dashboard", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("shows each organization's status, days left, seats, and this month's changes", async () => {
    const input = onboardingInput(plan);
    const { organizationId } = await onboardOrganization(test.services, support, {
      ...input,
      subscription: { ...input.subscription, trialEndsOn: "2026-10-30" },
    });
    const overview = (await organizationsOverview(test.services, new Date("2026-10-16T06:00:00Z"))).find(
      (organization) => organization.organizationId === organizationId,
    );
    expect(overview).toEqual({
      organizationId,
      name: "Sharma Holidays",
      code: input.code,
      status: "trial",
      planName: "Starter",
      nextChangeOn: "2026-10-31",
      daysLeft: 15,
      seats: { used: 1, limit: 5 },
      storage: { usedBytes: 0, limitBytes: 5_000_000_000 },
      lastActiveAt: null,
      // Onboarding's five entries: its profile, the Owner and their invite, the onboarding, the subscription.
      thisMonth: { changes: 5, documentsIssued: 0 },
    });
  });

  it("lists failed jobs, runs one again, and removes a leftover schedule, each in the platform log", async () => {
    test.jobs.failed.push({
      id: "0199e7a0-0000-7000-8000-0000000000fa",
      queue: "documents.render-pdf",
      data: { organizationId: "0199e7a0-0000-7000-8000-0000000000fb", eventId: "0199e7a0-0000-7000-8000-0000000000fc" },
      attempts: 6,
      failedAt: new Date("2026-10-16T06:00:00Z"),
      error: "Error: render failed",
    });
    test.jobs.scheduled.push({ queue: "reports.weekly-digest", cron: "0 8 * * 1", timeZone: "Asia/Kolkata" });
    expect(await listFailedJobs(test.services, 50)).toEqual([
      expect.objectContaining({ queue: "documents.render-pdf", attempts: 6, failedAt: "2026-10-16T06:00:00.000Z" }),
    ]);
    await retryFailedJob(test.services, support, {
      queue: "documents.render-pdf",
      jobId: "0199e7a0-0000-7000-8000-0000000000fa",
    });
    expect(test.jobs.retried).toEqual([
      { queue: "documents.render-pdf", jobId: "0199e7a0-0000-7000-8000-0000000000fa" },
    ]);
    await removeSchedule(test.services, support, "reports.weekly-digest");
    expect(await listSchedules(test.services)).toEqual([]);
    // Other test files write the platform log at the same time: look at this test's entries only.
    const log = await test.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }));
    const ours = log.entries.filter((entry) =>
      ["reports.weekly-digest", "0199e7a0-0000-7000-8000-0000000000fa"].includes(entry.targetId),
    );
    expect(ours.map((entry) => entry.action)).toEqual(["schedule.removed", "job.retried"]);
  });
});
```

In `apps/api/test/support/console.ts`:

replace:
```ts
// The platform console on the test database, beside a test server whose identity it shares (so the server's sign-in
// cookies work here): its services, on in-memory storage and job queue unless a test passes real ones, its HTTP app,
// and calls to a part of its router before that part joins platformRouter.
```
with:
```ts
// The platform console on the test database, beside a test server whose identity it shares (so the server's sign-in
// cookies work here): its services, on in-memory storage and jobs unless a test passes real ones, its HTTP app,
// and calls to a part of its router before that part joins platformRouter.
```

replace:
```ts
import { createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import { createMemoryJobQueue, type JobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
```
with:
```ts
import { createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import {
  createMemoryJobAdministration,
  createMemoryJobQueue,
  type JobAdministration,
  type JobQueue,
} from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
```

replace:
```ts
  queue?: JobQueue;
}
```
with:
```ts
  queue?: JobQueue;
  jobs?: JobAdministration;
}
```

replace:
```ts
    queue: options.queue ?? createMemoryJobQueue(),
  });
```
with:
```ts
    queue: options.queue ?? createMemoryJobQueue(),
    jobs: options.jobs ?? createMemoryJobAdministration(),
  });
```

`apps/api/test/console-operations.test.ts`:
```ts
// The console's dashboard (spec 7.4) and failed-jobs list (spec 9.1) over HTTP: platform staff see every organization
// and every failed job; only a super admin removes a schedule.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { createMemoryJobAdministration } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's operations", () => {
  const jobs = createMemoryJobAdministration();
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { jobs });
    support = await signedInPlatformStaff(server, "support");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("shows every organization on the dashboard, with its plan and seats", async () => {
    const agency = await createTestAgency(server);
    const overviews = await dataOf<OrganizationOverview[]>(
      await consoleQuery(testConsole, "dashboard.organizations", support.jar),
    );
    expect(overviews.find((overview) => overview.organizationId === agency.organizationId)).toMatchObject({
      code: agency.code,
      status: "active",
      planName: "Everything (tests)",
      seats: { used: 1, limit: 1000 },
    });
  });

  it("lists failed jobs and runs one again; only a super admin removes a schedule", async () => {
    jobs.failed.push({
      id: "0199e7a0-0000-7000-8000-0000000000e1",
      queue: "notifications.deliver",
      data: {},
      attempts: 6,
      failedAt: null,
      error: "Error: SMTP down",
    });
    jobs.scheduled.push({ queue: "rate-limits.purge", cron: "30 3 * * *", timeZone: "Asia/Kolkata" });
    expect(await dataOf(await consoleQuery(testConsole, "jobs.failed", support.jar, {}))).toEqual([
      expect.objectContaining({ queue: "notifications.deliver", error: "Error: SMTP down", failedAt: null }),
    ]);
    await dataOf(
      await consoleMutate(
        testConsole,
        "jobs.retry",
        { queue: "notifications.deliver", jobId: "0199e7a0-0000-7000-8000-0000000000e1" },
        support.jar,
      ),
    );
    expect(jobs.retried).toHaveLength(1);
    expect(
      await refusalOf(await consoleMutate(testConsole, "jobs.unschedule", { queue: "rate-limits.purge" }, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await dataOf(await consoleQuery(testConsole, "jobs.schedules", support.jar))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-operations.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/dashboard.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/integrations && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/jobs/pg-boss-jobs.test.ts`

Expected: FAIL. In `packages/integrations`, `TypeError: jobs.retryFailedJob is not a function`. In `packages/domain`
and `apps/api`, the test support can't build its services: `TypeError: createMemoryJobAdministration is not a
function`.

- [ ] **Step 3: Administer jobs through a port**

In `packages/integrations/src/jobs/pg-boss-jobs.ts`:

replace:
```ts

export interface PgBossJobs extends JobQueue, JobRunner {
  start(): Promise<void>;
```
with:
```ts

/** What the platform console does with jobs (spec 9.1): see what failed, run it again, see and remove schedules. */
export interface JobAdministration {
  /** Failed jobs, newest first. */
  failedJobs(options?: { limit?: number }): Promise<FailedJob[]>;
  /** Runs a failed job again, from its first attempt. A job that isn't failed (any more) is left alone. */
  retryFailedJob(queue: string, jobId: string): Promise<void>;
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
  unschedule(queue: string): Promise<void>;
}

export interface PgBossJobs extends JobQueue, JobRunner, JobAdministration {
  start(): Promise<void>;
```

replace:
```ts

    async schedules() {
```
with:
```ts

    async retryFailedJob(queue, jobId) {
      assertQueueName(queue);
      await boss.retry(queue, jobId);
    },

    async schedules() {
```

`packages/integrations/src/jobs/memory-job-administration.ts`:
```ts
// An in-memory JobAdministration for tests: failed jobs and schedules a test sets up, and what was retried or removed.
import type { FailedJob, JobAdministration } from "./pg-boss-jobs.js";

export interface MemoryJobAdministration extends JobAdministration {
  /** The failed jobs, newest first; retrying one takes it off the list, as pg-boss does. */
  readonly failed: FailedJob[];
  readonly scheduled: { queue: string; cron: string; timeZone: string }[];
  readonly retried: { queue: string; jobId: string }[];
}

export function createMemoryJobAdministration(): MemoryJobAdministration {
  const failed: FailedJob[] = [];
  const scheduled: { queue: string; cron: string; timeZone: string }[] = [];
  const retried: { queue: string; jobId: string }[] = [];
  return {
    failed,
    scheduled,
    retried,
    failedJobs: ({ limit = 50 } = {}) => Promise.resolve(failed.slice(0, limit)),
    retryFailedJob: (queue, jobId) => {
      const index = failed.findIndex((job) => job.queue === queue && job.id === jobId);
      if (index >= 0) {
        failed.splice(index, 1);
        retried.push({ queue, jobId });
      }
      return Promise.resolve();
    },
    schedules: () => Promise.resolve([...scheduled]),
    unschedule: (queue) => {
      const index = scheduled.findIndex((schedule) => schedule.queue === queue);
      if (index >= 0) scheduled.splice(index, 1);
      return Promise.resolve();
    },
  };
}
```

In `packages/integrations/src/jobs/index.ts`:

replace:
```ts
export type { JobHandlerFunction, JobRunner, RunningJob, ScheduleOptions } from "./job-runner.js";
export { createMemoryJobQueue, type MemoryJobQueue, type SentJob } from "./memory-job-queue.js";
```
with:
```ts
export type { JobHandlerFunction, JobRunner, RunningJob, ScheduleOptions } from "./job-runner.js";
export { createMemoryJobAdministration, type MemoryJobAdministration } from "./memory-job-administration.js";
export { createMemoryJobQueue, type MemoryJobQueue, type SentJob } from "./memory-job-queue.js";
```

replace:
```ts
} from "./memory-job-runner.js";
export { createPgBossJobs, type FailedJob, type PgBossJobs, type PgBossJobsSettings } from "./pg-boss-jobs.js";
export { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
```
with:
```ts
} from "./memory-job-runner.js";
export {
  createPgBossJobs,
  type FailedJob,
  type JobAdministration,
  type PgBossJobs,
  type PgBossJobsSettings,
} from "./pg-boss-jobs.js";
export { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
```

In `packages/domain/src/platform/services.ts`:

replace:
```ts
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
```
with:
```ts
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import type { JobAdministration, JobQueue } from "@travel-crm/integrations/jobs";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
```

replace:
```ts
  queue: JobQueue;
}
```
with:
```ts
  queue: JobQueue;
  /** Every process's failed jobs and schedules, for the console's failed-jobs list (spec 9.1). */
  jobs: JobAdministration;
}
```

- [ ] **Step 4: Count each organization, and list and retry failed jobs**

`packages/contracts/src/platform/console-dashboard.ts`:
```ts
// The platform dashboard (spec 7.4) and the failed-jobs list (spec 9.1), as the console shows them.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { subscriptionStatus } from "../subscriptions/index.js";

/** One organization on the dashboard: status, days left, seats used, last activity, this month's usage. */
export const organizationOverview = z.object({
  organizationId: recordId,
  name: z.string(),
  code: z.string(),
  /** Null for an organization without a subscription. */
  status: subscriptionStatus.nullable(),
  planName: z.string().nullable(),
  nextChangeOn: calendarDate.nullable(),
  /** Days until the status moves on if nothing is paid; null when it won't. */
  daysLeft: z.int().nullable(),
  seats: z.object({ used: z.int(), limit: z.int().nullable() }),
  storage: z.object({ usedBytes: z.int(), limitBytes: z.int().nullable() }),
  lastActiveAt: z.iso.datetime().nullable(),
  /** Since the first of the month, in the organization's time zone. */
  thisMonth: z.object({ changes: z.int(), documentsIssued: z.int() }),
});
export type OrganizationOverview = z.infer<typeof organizationOverview>;

export const failedJob = z.object({
  id: recordId,
  queue: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  attempts: z.int(),
  failedAt: z.iso.datetime().nullable(),
  /** Already cut down and masked before it was stored (ADR 0010). */
  error: z.string(),
});
export type FailedJobOutput = z.infer<typeof failedJob>;

export const listFailedJobsInput = z.strictObject({ limit: z.int().min(1).max(500).default(50) });
export const retryFailedJobInput = z.strictObject({ queue: z.string().max(100), jobId: recordId });
export type RetryFailedJobInput = z.infer<typeof retryFailedJobInput>;

export const jobSchedule = z.object({ queue: z.string(), cron: z.string(), timeZone: z.string() });
export const unscheduleInput = z.strictObject({ queue: z.string().max(100) });
```

In `packages/contracts/src/platform/index.ts`:

replace:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./data-protection.js";
```
with:
```ts
// Public API of @travel-crm/contracts/platform: the Zod schemas of the platform console.
export * from "./console-dashboard.js";
export * from "./data-protection.js";
```

`packages/domain/src/platform/dashboard.ts`:
```ts
// The platform dashboard (spec 7.4): every organization with its status, days left, seats used, last activity and this
// month's usage. One platform transaction, stepping into each organization for what its modules count.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { auditEntriesSince } from "../audit/index.js";
import { documentsIssuedSince } from "../documents/index.js";
import { bytesStored } from "../files/index.js";
import { listOrganizationRecords, memberActivity } from "../identity/index.js";
import { calendarDateIn, parseCalendarDate, startOfDayIn } from "../kernel/index.js";
import { entitlementsOf } from "../subscriptions/index.js";
import type { PlatformServices } from "./services.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one calendar date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export async function organizationsOverview(
  services: PlatformServices,
  now: Date = new Date(),
): Promise<OrganizationOverview[]> {
  return services.platformDb.transaction(
    async (tx) => {
      const organizations = await listOrganizationRecords(tx);
      const activity = new Map(
        (
          await memberActivity(
            tx,
            organizations.map((organization) => organization.id),
          )
        ).map((row) => [row.organizationId, row]),
      );
      const overviews: OrganizationOverview[] = [];
      for (const organization of organizations) {
        const today = calendarDateIn(now, organization.timeZone);
        const monthStart = startOfDayIn(parseCalendarDate(`${today.slice(0, 7)}-01`), organization.timeZone);
        const counted = await asOrganization(tx, organization.id, async (orgTx) => ({
          entitlements: await entitlementsOf(orgTx, organization.id, now),
          storedBytes: await bytesStored(orgTx),
          changes: await auditEntriesSince(orgTx, monthStart),
          documentsIssued: await documentsIssuedSince(orgTx, monthStart),
        }));
        const { entitlements } = counted;
        const people = activity.get(organization.id);
        overviews.push({
          organizationId: organization.id,
          name: organization.name,
          code: organization.code,
          status: entitlements?.status ?? null,
          planName: entitlements?.planName ?? null,
          nextChangeOn: entitlements?.nextChangeOn ?? null,
          daysLeft: entitlements?.nextChangeOn ? daysBetween(today, entitlements.nextChangeOn) : null,
          seats: { used: people?.seatsUsed ?? 0, limit: entitlements?.limits.seats ?? null },
          storage: { usedBytes: counted.storedBytes, limitBytes: entitlements?.limits.storageBytes ?? null },
          lastActiveAt: people?.lastActiveAt ?? null,
          thisMonth: { changes: counted.changes, documentsIssued: counted.documentsIssued },
        });
      }
      return overviews;
    },
    // A few small queries per organization.
    { timeout: 60_000 },
  );
}
```

`packages/domain/src/platform/failed-jobs.ts`:
```ts
// The failed-jobs list (spec 9.1: "after the last retry, a job lands in a failed-jobs list in the platform console"),
// and the schedules a removed job left behind (ADR 0010), which a super admin removes.
import type { FailedJobOutput, RetryFailedJobInput } from "@travel-crm/contracts/platform";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export async function listFailedJobs(services: PlatformServices, limit: number): Promise<FailedJobOutput[]> {
  return (await services.jobs.failedJobs({ limit })).map((job) => ({
    ...job,
    failedAt: job.failedAt?.toISOString() ?? null,
  }));
}

/** Runs a failed job again, and says so in the platform log. */
export async function retryFailedJob(
  services: PlatformServices,
  staff: { userId: string },
  input: RetryFailedJobInput,
): Promise<void> {
  await services.jobs.retryFailedJob(input.queue, input.jobId);
  await services.platformDb.transaction((tx) =>
    recordPlatformAudit(tx, staff, {
      action: "job.retried",
      targetType: "job",
      targetId: input.jobId,
      after: { queue: input.queue },
    }),
  );
}

export async function listSchedules(services: PlatformServices) {
  return services.jobs.schedules();
}

/** Stops a schedule, such as one whose job the code no longer has. Super admins only. */
export async function removeSchedule(
  services: PlatformServices,
  staff: { userId: string },
  queue: string,
): Promise<void> {
  await services.jobs.unschedule(queue);
  await services.platformDb.transaction((tx) =>
    recordPlatformAudit(tx, staff, { action: "schedule.removed", targetType: "job", targetId: queue }),
  );
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { ERASE_SUBJECT_QUEUE, eraseSubject, requestErasure } from "./erasure.js";
export { exportOrganization, exportSubject } from "./exports.js";
export { platformJobHandlers } from "./jobs.js";
```
with:
```ts
// module uses @travel-crm/db/platform, which sees every organization.
export { organizationsOverview } from "./dashboard.js";
export { ERASE_SUBJECT_QUEUE, eraseSubject, requestErasure } from "./erasure.js";
export { exportOrganization, exportSubject } from "./exports.js";
export { listFailedJobs, listSchedules, removeSchedule, retryFailedJob } from "./failed-jobs.js";
export { platformJobHandlers } from "./jobs.js";
```

`packages/api/src/platform/routers/operations.ts`:
```ts
// The console's running of the platform: the dashboard of organizations (spec 7.4) and the failed-jobs list (spec 9.1).
import {
  failedJob,
  jobSchedule,
  listFailedJobsInput,
  organizationOverview,
  retryFailedJobInput,
  unscheduleInput,
} from "@travel-crm/contracts/platform";
import {
  listFailedJobs,
  listSchedules,
  organizationsOverview,
  removeSchedule,
  retryFailedJob,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dashboardRouter = platformT.router({
  /** Every organization: status, days left, seats used, last activity, this month's usage. */
  organizations: staffProcedure
    .output(z.array(organizationOverview))
    .query(({ ctx }) => organizationsOverview(ctx.services)),
});

export const jobsRouter = platformT.router({
  failed: staffProcedure
    .input(listFailedJobsInput)
    .output(z.array(failedJob))
    .query(({ ctx, input }) => listFailedJobs(ctx.services, input.limit)),
  retry: staffProcedure
    .input(retryFailedJobInput)
    .mutation(({ ctx, input }) => retryFailedJob(ctx.services, ctx.staff, input)),
  schedules: staffProcedure.output(z.array(jobSchedule)).query(({ ctx }) => listSchedules(ctx.services)),
  /** Removes a schedule a job left behind when it went from the code. */
  unschedule: superAdminProcedure
    .input(unscheduleInput)
    .mutation(({ ctx, input }) => removeSchedule(ctx.services, ctx.staff, input.queue)),
});
```

In `packages/api/src/platform/platform-router.ts`:

replace:
```ts
import { dataProtectionRouter } from "./routers/data-protection.js";
import { organizationsRouter } from "./routers/organizations.js";
```
with:
```ts
import { dataProtectionRouter } from "./routers/data-protection.js";
import { dashboardRouter, jobsRouter } from "./routers/operations.js";
import { organizationsRouter } from "./routers/organizations.js";
```

replace:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  organizations: organizationsRouter,
```
with:
```ts
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
```

replace:
```ts
  subscriptions: subscriptionsRouter,
  log: platformT.router({
```
with:
```ts
  subscriptions: subscriptionsRouter,
  jobs: jobsRouter,
  log: platformT.router({
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-operations.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform/dashboard.test.ts`

Run: `cd /Users/ak/personal/travel-crm-04-platform-console/packages/integrations && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/jobs/pg-boss-jobs.test.ts`

Expected: PASS, 2 tests in 1 file (apps/api); 2 tests in 1 file (packages/domain); 20 tests in 1 file (packages/integrations).

- [ ] **Step 6: Record the decision**

In `docs/adr/0018-platform-console.md`:

replace:
```markdown

## Context
```
with:
```markdown

- **Failed jobs and schedules.** The console lists failed jobs, runs one again, and lists the schedules; a super admin
  removes a schedule whose job the code no longer has (ADR 0010). It reaches pg-boss through the `JobAdministration`
  port (`@travel-crm/integrations/jobs`), and records each retry and removed schedule in the platform log. Job data
  holds only ids, so the list shows nothing personal.

## Context
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown
  `(services, staff, input)`, each one platform transaction, recorded in the organization's own audit log.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.
```
with:
```markdown
  `(services, staff, input)`, each one platform transaction, recorded in the organization's own audit log.
- The dashboard (spec 7.4): `organizationsOverview(services, now?)`, every organization with its status, plan, days
  to its next change, seats and storage against its limits, last activity, and this month's changes and documents.
- Failed jobs (spec 9.1): `listFailedJobs(services, limit)`, `retryFailedJob(services, staff, { queue, jobId })`,
  `listSchedules(services)` and `removeSchedule(services, staff, queue)` (super admins), through the
  `JobAdministration` port. Each retry and removed schedule is recorded in the platform log.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-04-platform-console && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=168 api=13 brand=21 contracts=81 db=219 domain=517 eslint-config=81 integrations=144 (1,244). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm-04-platform-console
git add apps/api/test/console-operations.test.ts apps/api/test/support/console.ts docs/adr/0018-platform-console.md packages/api/src/platform/platform-router.ts packages/api/src/platform/routers/operations.ts packages/contracts/src/platform/console-dashboard.ts packages/contracts/src/platform/index.ts packages/domain/src/platform/README.md packages/domain/src/platform/dashboard.ts packages/domain/src/platform/failed-jobs.ts packages/domain/src/platform/index.ts packages/domain/src/platform/services.ts packages/domain/test/platform/dashboard.test.ts packages/domain/test/platform/test-platform.ts packages/integrations/src/jobs/index.ts packages/integrations/src/jobs/memory-job-administration.ts packages/integrations/src/jobs/pg-boss-jobs.ts packages/integrations/test/jobs/pg-boss-jobs.test.ts
git commit -m "feat: show the platform dashboard and failed jobs in the console"
```

---
## Integration

Tasks I1-I3 run last, in order, in the main checkout, on `foundation/04-platform`.

### Task I1: Merge Track P; the profile API, and every organization held to its plan's limits

Track P merges cleanly onto Task M1 (it started there). Then the shared edits the tracks left. **The business profile
over the api** (ruling: plan 4 owns the organization settings API): `profile.get`, `profile.save` and
`profile.checklist`, each needing `settings:manage`, because the profile holds the bank details; saving reads the
session afresh, as money and settings do, and is a change, so a read-only organization can look but not save.
**The plan's limits** (spec 7.2): identity's `seatLimit` and the files module's `storageLimitBytes` are now fed from
each organization's entitlements, in the api, the worker and the test server alike.

**Files:**
- Create: `packages/api/src/routers/profile.ts`, `packages/domain/src/profile/profiles.ts`, `packages/domain/src/subscriptions/plan-limits.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/services.ts`, `docs/adr/0023-business-profile.md`, `packages/api/README.md`, `packages/api/src/context.ts`, `packages/api/src/routers/app-router.ts`, `packages/domain/src/profile/README.md`, `packages/domain/src/profile/index.ts`, `packages/domain/src/subscriptions/README.md`, `packages/domain/src/subscriptions/index.ts`
- Test: `apps/api/test/api-log.test.ts`, `apps/api/test/organization-profile.test.ts`, `apps/api/test/services.test.ts`, `apps/api/test/support/test-server.ts`, `packages/domain/test/subscriptions/plan-limits.test.ts`

**Interfaces:**
- Consumes: Task O1's `getOrganizationProfile`, `saveOrganizationProfile`, `setupChecklistOf`, the profile
  contracts; Task S2's `SubscriptionAccess`; Task A3's `IdentityOptions.seatLimit`; plan 3's
  `FilesDependencies.storageLimitBytes`; plan 2's `settings:manage`.
- Produces:
  - `@travel-crm/domain/subscriptions`: `planLimits(access): PlanLimits` (`{ seats(organizationId), storageBytes(
    organizationId) }`, functions, null without a subscription).
  - `@travel-crm/domain/profile`: `Profiles` (`get(organizationId)`, `save(actor, input)`) and
    `createProfiles({ db })`.
  - `@travel-crm/api`: `ApiDependencies.profiles`; router `profile` (`get`, `save`, `checklist`).
  - `apps/api`: `Services.profiles`; `ServerDependencies.profiles`; services and the test server pass `seatLimit`
    and `storageLimitBytes`.

- [ ] **Step 1: Merge Track P**

```bash
cd /Users/ak/personal/travel-crm && git switch foundation/04-platform && git merge --no-ff --no-edit foundation/04-platform-console -m "chore: merge foundation/04-platform-console"
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
```
Expected: no conflict; the merged tree is Track P's last commit's.

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/subscriptions/plan-limits.test.ts`:
```ts
// The plan's limits as the identity and files modules take them (spec 7.2): the seats, extra seats included, and the
// storage. An organization without a subscription has none here; check 2 refuses its every change anyway.
import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { planLimits, type Entitlements, type SubscriptionAccess } from "../../src/subscriptions/index.js";

const growth: Entitlements = {
  status: "active",
  access: "full",
  planName: "Growth",
  modules: new Set(["crm"]),
  limits: { seats: 7, whatsappNumbers: 1, storageBytes: 5_000_000 },
  trialEndsOn: null,
  paidThrough: parseCalendarDate("2026-12-31"),
  nextChangeOn: parseCalendarDate("2027-01-01"),
};

const accessTo = (byOrganization: Record<string, Entitlements>): SubscriptionAccess => ({
  entitlementsOf: (organizationId) => Promise.resolve(byOrganization[organizationId] ?? null),
});

describe("the plan's limits", () => {
  it("gives each organization the seats and storage of its plan", async () => {
    const limits = planLimits(accessTo({ "organization-a": growth }));
    expect(await limits.seats("organization-a")).toBe(7);
    expect(await limits.storageBytes("organization-a")).toBe(5_000_000);
  });

  it("sets none for an organization without a subscription", async () => {
    const limits = planLimits(accessTo({}));
    expect(await limits.seats("organization-b")).toBeNull();
    expect(await limits.storageBytes("organization-b")).toBeNull();
  });
});
```

`apps/api/test/organization-profile.test.ts`:
```ts
// The organization's business profile and setup checklist over HTTP (spec 7.1): the Owner completes what onboarding
// left out and the checklist follows; staff without settings:manage neither see the bank details nor change them;
// a read-only organization's Owner may look but not save.
import type { OrganizationProfileDetails, SetupChecklist } from "@travel-crm/contracts/profile";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const profile = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Hill Road, Bandra, Mumbai 400050",
  contactName: "Lakshmi Nair",
  contactPhone: "+91 98200 12345",
  bankAccountName: "Konkan Trails LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "hdfc0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "kt",
  brandColour: "#1F6F5C",
  documentTerms: null,
};

describe("the organization profile", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("lets the Owner complete the profile, and the setup checklist follows", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    expect(await dataOf(await query(server, "profile.get", jar))).toBeNull();
    expect((await dataOf<SetupChecklist>(await query(server, "profile.checklist", jar))).done).toBe(false);

    const saved = await dataOf<OrganizationProfileDetails>(await mutate(server, "profile.save", profile, jar));
    expect(saved).toMatchObject({ gstin: "27AAPFU0939F1ZV", bankIfsc: "HDFC0001234", invoicePrefix: "KT" });
    expect(await dataOf(await query(server, "profile.get", jar))).toEqual(saved);
    expect(await dataOf<SetupChecklist>(await query(server, "profile.checklist", jar))).toEqual({
      steps: [
        { step: "business-details", done: true },
        { step: "bank-details", done: true },
        { step: "invoice-prefix", done: true },
        { step: "branding", done: true },
        // Only the Owner so far.
        { step: "staff", done: false },
      ],
      done: false,
    });
  });

  it("refuses staff without settings:manage", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    expect(await refusalOf(await query(server, "profile.get", jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(await refusalOf(await mutate(server, "profile.save", profile, jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("lets a read-only organization's Owner look, but not save", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect((await query(server, "profile.get", jar)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "profile.save", profile, jar))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });
  });
});
```

In `apps/api/test/services.test.ts`:

replace:
```ts
// the storage bucket can't be used, before pg-boss starts; the rate limiter's key is derived from the auth secret rather than set apart; the
// password-reset email goes out through the SMTP sender to APP_URL's reset page; and pg-boss's problems go to the
// process's one log as ids and codes, with nothing else on the console.
import { WrongDatabaseRoleError } from "@travel-crm/db";
```
with:
```ts
// the storage bucket can't be used, before pg-boss starts; the rate limiter's key is derived from the auth secret rather than set apart; the
// password-reset email goes out through the SMTP sender to APP_URL's reset page; pg-boss's problems go to the
// process's one log as ids and codes, with nothing else on the console; and each organization is held to its plan's
// seats and storage.
import { WrongDatabaseRoleError } from "@travel-crm/db";
```

replace:
```ts

  it("derives the rate limiter's 32-byte key from the auth secret, the same way every time", () => {
```
with:
```ts

  it("holds each organization to its plan's seats and storage", async () => {
    const services = createServices(environment(), processLog("api"));
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      const organizationId = await createTestOrganization(platform, "Small agency");
      const plan = await platform.plan.create({
        data: {
          key: `one-seat-${organizationId.slice(-12)}`,
          name: "One seat",
          monthlyPricePaise: 0,
          seatLimit: 1,
          whatsappNumberLimit: 0,
          storageLimitBytes: 1000n,
          modules: ["crm"],
        },
      });
      await platform.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          billingCycle: "monthly",
          status: "active",
          statusChangedAt: new Date(),
          paidThrough: new Date("2099-12-31"),
        },
      });
      await services.identity.seedStarterRoles(organizationId);
      const owner = await services.identity.createOrganizationOwner(organizationId, {
        name: "Asha Owner",
        email: `owner-${organizationId}@example.test`,
        password: "owner-password-1",
        mustChangePassword: false,
      });
      const access = await services.identity.resolveAccess(owner.userId, organizationId);
      if (!access) throw new Error("the owner has no access");
      // The Owner has the plan's one seat.
      await expect(
        services.identity.staff.create(access, {
          name: "Ravi",
          username: "ravi",
          roleKey: "sales",
          temporaryPassword: "ravi-password-1",
        }),
      ).rejects.toMatchObject({ reason: "SEAT_LIMIT_REACHED" });
      await expect(
        services.files.requestUpload(access, {
          recordType: "lead",
          recordId: crypto.randomUUID(),
          fileName: "itinerary.pdf",
          contentType: "application/pdf",
          sizeBytes: 1001,
          sensitive: false,
        }),
      ).rejects.toMatchObject({ reason: "STORAGE_LIMIT_REACHED" });
    } finally {
      await services.close();
      await platform.$disconnect();
    }
  });

  it("derives the rate limiter's 32-byte key from the auth secret, the same way every time", () => {
```

In `apps/api/test/support/test-server.ts`:

replace:
```ts
// Builds the api on the test database: the Hono app, its identity module, the public routes' services (on in-memory
// storage and job queue unless a test passes real ones), and a platform client for creating organizations (which the
// api itself can never do). Requests go through app.request(), so no port is opened.
import { planModules } from "@travel-crm/contracts/subscriptions";
```
with:
```ts
// Builds the api on the test database: the Hono app, its identity module, the public routes' services (on in-memory
// storage and job queue unless a test passes real ones), held to the plan limits as in services.ts, and a platform
// client for creating organizations (which the api itself can never do). Requests go through app.request(), so no
// port is opened.
import { planModules } from "@travel-crm/contracts/subscriptions";
```

replace:
```ts
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
```
with:
```ts
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import { createProfiles } from "@travel-crm/domain/profile";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, planLimits } from "@travel-crm/domain/subscriptions";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
```

replace:
```ts
  const urls = inject("dbUrls");
  const identity = createIdentity({
```
with:
```ts
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const subscriptions = createSubscriptionAccess({ db });
  const limits = planLimits(subscriptions);
  const identity = createIdentity({
```

replace:
```ts
    auth: { ...testAuthSettings, ...settings },
  });
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const files = createFiles({ db, storage: options.storage ?? createMemoryStorage() });
  const platform = createPlatformClient(urls.platform);
```
with:
```ts
    auth: { ...testAuthSettings, ...settings },
    seatLimit: limits.seats,
  });
  const files = createFiles({
    db,
    storage: options.storage ?? createMemoryStorage(),
    storageLimitBytes: limits.storageBytes,
  });
  const platform = createPlatformClient(urls.platform);
```

replace:
```ts
    identity,
    subscriptions: createSubscriptionAccess({ db }),
    db,
```
with:
```ts
    identity,
    subscriptions,
    profiles: createProfiles({ db }),
    db,
```

In `apps/api/test/api-log.test.ts`:

replace:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
```
with:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createProfiles } from "@travel-crm/domain/profile";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
```

replace:
```ts
      subscriptions: createSubscriptionAccess({ db }),
      db,
```
with:
```ts
      subscriptions: createSubscriptionAccess({ db }),
      profiles: createProfiles({ db }),
      db,
```

Plan 3's `api-log.test.ts` builds the app itself, so it passes the profiles too.

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization-profile.test.ts test/services.test.ts test/api-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/plan-limits.test.ts`

Expected: FAIL. In `packages/domain`, both: `TypeError: planLimits is not a function`. In `apps/api`, the test
server and the api log test can't be built (`planLimits is not a function`, `createProfiles is not a function`), and
the services test adds a second staff member to a one-seat plan (`promise resolved … instead of rejecting`).

- [ ] **Step 4: Hand the plan's limits on, and give the profile a service**

`packages/domain/src/subscriptions/plan-limits.ts`:
```ts
// The plan's limits as the modules that enforce them take them (spec 7.2): identity's seat limit and the files
// module's storage limit, each read from the organization's entitlements when it is needed.
import type { SubscriptionAccess } from "./entitlements.js";

/** Functions, not methods, so they can be handed on as they are. */
export interface PlanLimits {
  /** The seats the organization's plan gives, extra seats included; null without a subscription. */
  readonly seats: (organizationId: string) => Promise<number | null>;
  /** The bytes of files the plan lets the organization keep; null without a subscription. */
  readonly storageBytes: (organizationId: string) => Promise<number | null>;
}

/**
 * Null without a subscription means no limit here: request check 2 already refuses every change such an
 * organization's staff make.
 */
export function planLimits(access: SubscriptionAccess): PlanLimits {
  const limitsOf = async (organizationId: string) => (await access.entitlementsOf(organizationId))?.limits ?? null;
  return {
    seats: async (organizationId) => (await limitsOf(organizationId))?.seats ?? null,
    storageBytes: async (organizationId) => (await limitsOf(organizationId))?.storageBytes ?? null,
  };
}
```

In `packages/domain/src/subscriptions/index.ts`:

replace:
```ts
export { listPayments, recordPayment, voidPayment, type ProviderPayment } from "./payments.js";
export { archivePlan, createPlan, findPlan, listPlans, updatePlan } from "./plans.js";
```
with:
```ts
export { listPayments, recordPayment, voidPayment, type ProviderPayment } from "./payments.js";
export { planLimits, type PlanLimits } from "./plan-limits.js";
export { archivePlan, createPlan, findPlan, listPlans, updatePlan } from "./plans.js";
```

`packages/domain/src/profile/profiles.ts`:
```ts
// The profile module as the api uses it: one organization's business profile, read and saved in that
// organization's own transaction.
import type { OrganizationProfileDetails, SaveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { Database } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { getOrganizationProfile, saveOrganizationProfile } from "./profile.js";

export interface Profiles {
  /** The organization's profile, or null before one was saved. */
  get(organizationId: string): Promise<OrganizationProfileDetails | null>;
  /** Saves the whole profile in the actor's organization. The API checks settings:manage first. */
  save(actor: Actor, input: SaveOrganizationProfileInput): Promise<OrganizationProfileDetails>;
}

export function createProfiles(dependencies: { db: Pick<Database, "forOrg"> }): Profiles {
  const { db } = dependencies;
  return {
    get: (organizationId) => db.forOrg(organizationId, getOrganizationProfile),
    save: (actor, input) => db.forOrg(actor.organizationId, (tx) => saveOrganizationProfile(tx, actor, input)),
  };
}
```

In `packages/domain/src/profile/index.ts`:

replace:
```ts
export { getOrganizationProfile, saveOrganizationProfile } from "./profile.js";
export { setupChecklistOf } from "./setup-checklist.js";
```
with:
```ts
export { getOrganizationProfile, saveOrganizationProfile } from "./profile.js";
export { createProfiles, type Profiles } from "./profiles.js";
export { setupChecklistOf } from "./setup-checklist.js";
```

- [ ] **Step 5: Serve the profile, and wire the limits**

In `packages/api/src/context.ts`:

replace:
```ts
import type { Identity } from "@travel-crm/domain/identity";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
```
with:
```ts
import type { Identity } from "@travel-crm/domain/identity";
import type { Profiles } from "@travel-crm/domain/profile";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
```

replace:
```ts
  subscriptions: SubscriptionAccess;
}
```
with:
```ts
  subscriptions: SubscriptionAccess;
  /** The organization's business profile (spec 7.1). */
  profiles: Profiles;
}
```

replace:
```ts
export async function createContext(
  { identity, subscriptions }: ApiDependencies,
  request: Request,
```
with:
```ts
export async function createContext(
  { identity, subscriptions, profiles }: ApiDependencies,
  request: Request,
```

replace:
```ts
    subscriptions,
    headers: request.headers,
```
with:
```ts
    subscriptions,
    profiles,
    headers: request.headers,
```

`packages/api/src/routers/profile.ts`:
```ts
// The organization's business profile and setup checklist (spec 7.1): what onboarding left for the Owner to complete.
// Bank details are in it, so seeing it needs settings:manage too, and saving it reads the session afresh.
import {
  organizationProfileDetails,
  saveOrganizationProfileInput,
  setupChecklist,
} from "@travel-crm/contracts/profile";
import { setupChecklistOf } from "@travel-crm/domain/profile";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const profileRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(organizationProfileDetails.nullable())
    .query(({ ctx }) => ctx.profiles.get(ctx.member.organizationId)),

  save: freshProcedure
    .requires("settings:manage")
    .input(saveOrganizationProfileInput)
    .output(organizationProfileDetails)
    .mutation(({ ctx, input }) => ctx.profiles.save(ctx.member, input)),

  checklist: orgProcedure
    .requires("settings:manage")
    .output(setupChecklist)
    .query(async ({ ctx }) => {
      const [profile, staff] = await Promise.all([
        ctx.profiles.get(ctx.member.organizationId),
        ctx.identity.staff.list(ctx.member),
      ]);
      return setupChecklistOf(profile, staff.length);
    }),
});
```

In `packages/api/src/routers/app-router.ts`:

replace:
```ts
import { meRouter } from "./me.js";
import { rolesRouter } from "./roles.js";
```
with:
```ts
import { meRouter } from "./me.js";
import { profileRouter } from "./profile.js";
import { rolesRouter } from "./roles.js";
```

replace:
```ts
  subscription: subscriptionRouter,
});
```
with:
```ts
  subscription: subscriptionRouter,
  profile: profileRouter,
});
```

In `apps/api/src/app.ts`:

replace:
```ts
import type { Identity } from "@travel-crm/domain/identity";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
```
with:
```ts
import type { Identity } from "@travel-crm/domain/identity";
import type { Profiles } from "@travel-crm/domain/profile";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
```

replace:
```ts
  subscriptions: SubscriptionAccess;
  /** The public routes' database: share links, webhook events, rate-limit counters. */
```
with:
```ts
  subscriptions: SubscriptionAccess;
  /** The organization's business profile, for the profile router. */
  profiles: Profiles;
  /** The public routes' database: share links, webhook events, rate-limit counters. */
```

replace:
```ts
export function createApp(dependencies: ServerDependencies): Hono {
  const { identity, subscriptions, db, files, queue, rateLimiter, clientAddress, webhookProviders, log } = dependencies;
  const app = new Hono();
```
with:
```ts
export function createApp(dependencies: ServerDependencies): Hono {
  const { identity, subscriptions, profiles, db, files, queue, rateLimiter, clientAddress, webhookProviders, log } =
    dependencies;
  const app = new Hono();
```

replace:
```ts
      endpoint: "/api/trpc",
      createContext: ({ resHeaders }, c) => createContext({ identity, subscriptions }, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
```
with:
```ts
      endpoint: "/api/trpc",
      createContext: ({ resHeaders }, c) => createContext({ identity, subscriptions, profiles }, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
```

In `apps/api/src/server.ts`:

replace:
```ts
  subscriptions: services.subscriptions,
  db: services.db,
```
with:
```ts
  subscriptions: services.subscriptions,
  profiles: services.profiles,
  db: services.db,
```

In `apps/api/src/services.ts`:

replace:
```ts
// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them. close() releases every pool.
import { hkdfSync } from "node:crypto";
```
with:
```ts
// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them, held to each organization's plan limits.
// close() releases every pool.
import { hkdfSync } from "node:crypto";
```

replace:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
```
with:
```ts
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createProfiles, type Profiles } from "@travel-crm/domain/profile";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, planLimits, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
```

replace:
```ts
  subscriptions: SubscriptionAccess;
  storage: ObjectStorage;
```
with:
```ts
  subscriptions: SubscriptionAccess;
  /** Organizations' business profiles. */
  profiles: Profiles;
  storage: ObjectStorage;
```

replace:
```ts
  const rateLimiter = createRateLimiter(db, { keySecret: rateLimitKeySecret(environment.BETTER_AUTH_SECRET) });
  const email = createSmtpEmailSender({
```
with:
```ts
  const rateLimiter = createRateLimiter(db, { keySecret: rateLimitKeySecret(environment.BETTER_AUTH_SECRET) });
  const subscriptions = createSubscriptionAccess({ db });
  // Seats and storage are the plan's (spec 7.2): identity refuses staff past them, the files module uploads.
  const limits = planLimits(subscriptions);
  const email = createSmtpEmailSender({
```

replace:
```ts
    },
  });
```
with:
```ts
    },
    seatLimit: limits.seats,
  });
```

replace:
```ts
    identity,
    subscriptions: createSubscriptionAccess({ db }),
    storage,
    files: createFiles({ db, storage }),
    jobs,
```
with:
```ts
    identity,
    subscriptions,
    profiles: createProfiles({ db }),
    storage,
    files: createFiles({ db, storage, storageLimitBytes: limits.storageBytes }),
    jobs,
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization-profile.test.ts test/services.test.ts test/api-log.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/subscriptions/plan-limits.test.ts`

Expected: PASS, 19 tests in 3 files (apps/api); 2 tests in 1 file (packages/domain).

- [ ] **Step 7: Document it**

In `docs/adr/0023-business-profile.md`:

replace:
```markdown

- The org-side routers (the profile, the checklist) come with the Integration task, which owns the api's context.
- Documents' frozen branding (ADR 0012) can read the colour and terms from here when quotes arrive; the logo comes with
```
with:
```markdown

- The api's `profile` router serves it: `get`, `save` and `checklist`, each needing `settings:manage`, since the
  profile holds the bank details. Saving reads the session afresh, as money and settings do.
- Documents' frozen branding (ADR 0012) can read the colour and terms from here when quotes arrive; the logo comes with
```

In `packages/api/README.md`:

replace:
```markdown
`me`, `staff`, `roles`, `settings`, `subscription` (`get`: what the organization's subscription allows today, in
every state). Add a router in `src/routers/` and list it in `app-router.ts`.
```
with:
```markdown
`me`, `staff`, `roles`, `settings`, `subscription` (`get`: what the organization's subscription allows today, in
every state), `profile` (`get`, `save`, `checklist`: the business profile and the setup checklist, all three needing
`settings:manage`). Add a router in `src/routers/` and list it in `app-router.ts`.
```

In `packages/domain/src/profile/README.md`:

replace:
```markdown
  the Owner later). The input is `saveOrganizationProfileInput` from `@travel-crm/contracts/profile`.
- `setupChecklistOf(profile, activeStaff)`: the checklist's steps (`business-details`, `bank-details`,
```
with:
```markdown
  the Owner later). The input is `saveOrganizationProfileInput` from `@travel-crm/contracts/profile`.
- `createProfiles({ db })`: the api's `Profiles`, `get(organizationId)` and `save(actor, input)`, each in the
  organization's own transaction.
- `setupChecklistOf(profile, activeStaff)`: the checklist's steps (`business-details`, `bank-details`,
```

In `packages/domain/src/subscriptions/README.md`:

replace:
```markdown
  `overviewOf(entitlements)` (what `subscription.get` shows), `lifecycleAccessOf(status)`.
- Request checks 2 and 3: `assertLifecycleAllows(entitlements, { kind, isOwner })` (`kind` is `view`, `change`,
```
with:
```markdown
  `overviewOf(entitlements)` (what `subscription.get` shows), `lifecycleAccessOf(status)`.
- `planLimits(access)`: the plan's seats and storage as identity's `seatLimit` and the files module's
  `storageLimitBytes` take them, read when they are needed; none without a subscription.
- Request checks 2 and 3: `assertLifecycleAllows(entitlements, { kind, isOwner })` (`kind` is `view`, `change`,
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=172 api=13 brand=21 contracts=81 db=219 domain=519 eslint-config=81 integrations=144 (1,250). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/services.ts apps/api/test/api-log.test.ts apps/api/test/organization-profile.test.ts apps/api/test/services.test.ts apps/api/test/support/test-server.ts docs/adr/0023-business-profile.md packages/api/README.md packages/api/src/context.ts packages/api/src/routers/app-router.ts packages/api/src/routers/profile.ts packages/domain/src/profile/README.md packages/domain/src/profile/index.ts packages/domain/src/profile/profiles.ts packages/domain/src/subscriptions/README.md packages/domain/src/subscriptions/index.ts packages/domain/src/subscriptions/plan-limits.ts packages/domain/test/subscriptions/plan-limits.test.ts
git commit -m "feat: serve the business profile and its checklist, and hold organizations to their plan's limits"
```

---
### Task I2: The console process, the platform's jobs, the worker's new jobs, and the nightly demo

The console becomes a process: `pnpm --filter @travel-crm/api-server console`, the api image's third command. It
starts through plan 3's start-up guard, as the api and the worker do: the api's environment and services, then its
own settings (`DATABASE_PLATFORM_URL`, which it alone holds and which must not be `DATABASE_URL`; `CONSOLE_PORT`,
default 3002; the demo's three variables, all or none), a check that its connection really is the platform role, and
the platform's jobs: the purge and erasure handlers, and the nightly demo reset at 02:00 India time. Any of those
failing is one "console start-up failed" message. Then it serves `createConsoleApp` with its own log (`console: …`). It starts them with `startJobHandlers`, new in the jobs module: handlers and schedules only, never a
second outbox relay (one that knew no listeners would mark every event relayed with nothing queued). The worker gains
the invite listener and `subscriptions.advance-lifecycle` at 00:15 India time. **The demo** (spec 7.4): each night
the console purges the organization last night's reset built and builds it again in one platform transaction (its
business profile, the starter roles, three staff who sign in with the demo's code and `DEMO_PASSWORD`, no email and
no invite), on the plan `DEMO_PLAN_KEY` names, paid a month ahead. It purges only an organization with a
`demo.reset` entry in the platform log, so a code set by mistake can't purge an agency, and checks the plan before it
purges anything.

**Files:**
- Create: `apps/api/src/console-environment.ts`, `apps/api/src/console-jobs.ts`, `apps/api/src/console.ts`, `packages/domain/src/platform/demo.ts`
- Modify: `.env.example`, `apps/api/README.md`, `apps/api/package.json`, `apps/api/src/process-log.ts`, `apps/api/src/start-up.ts`, `apps/api/src/worker-jobs.ts`, `docs/adr/0018-platform-console.md`, `docs/adr/0021-onboarding.md`, `packages/domain/src/identity/README.md`, `packages/domain/src/identity/index.ts`, `packages/domain/src/identity/onboarding.ts`, `packages/domain/src/identity/organization-records.ts`, `packages/domain/src/jobs/README.md`, `packages/domain/src/jobs/index.ts`, `packages/domain/src/jobs/worker.ts`, `packages/domain/src/platform/README.md`, `packages/domain/src/platform/index.ts`, `packages/domain/src/subscriptions/README.md`, `packages/domain/src/subscriptions/advance.ts`, `packages/domain/src/subscriptions/index.ts`
- Test: `apps/api/test/console-environment.test.ts`, `apps/api/test/console-jobs.test.ts`, `apps/api/test/console-process.test.ts`, `apps/api/test/support/test-server.ts`, `apps/api/test/worker-platform-jobs.test.ts`, `packages/domain/test/jobs/worker.test.ts`, `packages/domain/test/platform/demo.test.ts`

**Interfaces:**
- Consumes: Task P2's `purgeOrganization(…, { requireCancelled: false })`, `platformJobHandlers`; Task P3's
  `PlatformServices.jobs`; Task A2's `Identity.inviteListener`, `Identity.organizationIds`, `insertStaffAccount`;
  Task S2's `advanceSubscriptions`; Task S1's `startSubscription`, `listPlans`; Task O1's
  `saveOrganizationProfile`; plan 3's `startProcess(processName, start, options?)`, `ProcessName`, `ProcessLog`,
  `describeError`, `testEnvironmentVariables`, `workerJobs`, `startWorker`, `JobRunner`, `createMemoryJobRunner`.
- Produces:
  - `@travel-crm/domain/jobs`: `startJobHandlers({ runner, handlers?, schedules? })`, `JobHandlerDependencies`.
  - `@travel-crm/domain/subscriptions`: `ADVANCE_SUBSCRIPTIONS_QUEUE` (`subscriptions.advance-lifecycle`).
  - `@travel-crm/domain/identity`: `addStaffWithPassword(tx, actor, { name, username, roleKey, passwordHash })`,
    `findOrganizationByCode(tx, code): Promise<OrganizationRecord | null>`.
  - `@travel-crm/domain/platform`: `resetDemoOrganization(services, { code, planKey, password }, now?)`
    (`DEMO_CODE_TAKEN`, `DEMO_PLAN_NOT_FOUND`), `RESET_DEMO_QUEUE` (`platform.reset-demo`), `DemoSettings`.
  - `apps/api`: `loadConsoleSettings(source, environment): ConsoleSettings` (`{ platformDatabaseUrl, port, demo }`),
    `consoleJobs(services, demo)`, `startConsoleJobs(runner, services, demo)` (removes the demo's schedule when the
    demo is off), `src/console.ts`, the `console` script; `ProcessName` gains `"console"`; `EVERYTHING_PLAN_KEY` in
    the test server.

- [ ] **Step 1: Write the failing tests**

In `packages/domain/test/jobs/worker.test.ts`:

replace:
```ts
// The worker wires every kind of work to the runner and relays events, on the in-memory runner: an event published
// in an organization reaches its listener, handlers and schedules run, and mistakes in the wiring are refused.
import { createDatabase, type Database } from "@travel-crm/db";
```
with:
```ts
// The worker wires every kind of work to the runner and relays events, on the in-memory runner: an event published
// in an organization reaches its listener, handlers and schedules run, and mistakes in the wiring are refused. A
// process without listeners (the console) runs its handlers and schedules and relays nothing.
import { createDatabase, type Database } from "@travel-crm/db";
```

replace:
```ts
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, startWorker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";
```
with:
```ts
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, startJobHandlers, startWorker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";
```

replace:
```ts
  });
});
```
with:
```ts
  });

  it("runs a process's handlers and schedules without listeners, leaving every event for the worker's relay", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const purged: JobData[] = [];
    const resets: JobData[] = [];
    const quiet = await createTestOrganization(platform, "Console jobs");
    const eventId = await db.forOrg(quiet, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "c1" } }),
    );
    await startJobHandlers({
      runner,
      handlers: [
        {
          queue: "platform.purge-organization",
          handle: (data) => {
            purged.push(data);
            return Promise.resolve();
          },
        },
      ],
      schedules: [
        {
          queue: "platform.reset-demo",
          cron: "0 2 * * *",
          timeZone: "Asia/Kolkata",
          handle: (data) => {
            resets.push(data);
            return Promise.resolve();
          },
        },
      ],
    });
    await queue.send("platform.purge-organization", { organizationId: quiet });
    await runner.fireSchedule("platform.reset-demo");
    await runner.runQueued();

    expect(purged).toEqual([{ organizationId: quiet }]);
    expect(resets).toEqual([{}]);
    // A relay that knew no listeners would have marked the event relayed with nothing queued for it.
    const event = await db.forOrg(quiet, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }));
    expect(event.relayedAt).toBeNull();
    await expect(
      startJobHandlers({
        runner,
        handlers: [{ queue: "a.b", handle: () => Promise.resolve() }],
        schedules: [{ queue: "a.b", cron: "* * * * *", timeZone: "Asia/Kolkata", handle: () => Promise.resolve() }],
      }),
    ).rejects.toThrow(/share the queue a.b/);
  });
});
```

`packages/domain/test/platform/demo.test.ts`:
```ts
// The nightly demo reset (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"): it builds
// the demo organization, and each night purges it and builds it again, so whatever visitors changed is gone. Its
// staff sign in with its code, their username and the demo password. It never touches an organization it didn't
// build, even one that has the demo's code.
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrganizationRecord } from "../../src/identity/index.js";
import {
  listPlatformLog,
  onboardOrganization,
  resetDemoOrganization,
  type DemoSettings,
} from "../../src/platform/index.js";
import { getOrganizationProfile } from "../../src/profile/index.js";
import { getSubscription } from "../../src/subscriptions/index.js";
import { canSignInByUsername } from "../identity/test-identity.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("the demo reset", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const demoSettings = (): DemoSettings => ({
    code: `D${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`,
    planKey: plan.key,
    password: "demo-password-123",
  });

  const organizationEntries = (organizationId: string) =>
    test.services.platformDb.transaction(async (tx) =>
      (await listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 })).entries.map((entry) => ({
        action: entry.action,
        actorUserId: entry.actorUserId,
      })),
    );

  it("builds the demo, whose staff sign in with its code and the demo password", async () => {
    const demo = demoSettings();
    // 20:00 UTC is already the 17th in India: the demo is paid a month from the day there.
    const { organizationId } = await resetDemoOrganization(test.services, demo, new Date("2026-10-16T20:00:00Z"));
    for (const username of ["asha", "ravi", "meena"]) {
      expect(await canSignInByUsername(test.identity.identity, demo.code, username, demo.password)).toBe(true);
    }
    const subscription = await test.services.platformDb.transaction((tx) => getSubscription(tx, organizationId));
    expect(subscription).toMatchObject({ status: "active", paidThrough: "2026-11-16", plan: { key: plan.key } });
    expect(await test.services.db.forOrg(organizationId, getOrganizationProfile)).toMatchObject({
      legalName: "Demo Holidays Private Limited",
      invoicePrefix: "DH",
    });
    expect(await organizationEntries(organizationId)).toEqual([{ action: "demo.reset", actorUserId: null }]);
  });

  it("purges last night's demo and builds it afresh", async () => {
    const demo = demoSettings();
    const first = await resetDemoOrganization(test.services, demo);
    const second = await resetDemoOrganization(test.services, demo);
    expect(second.organizationId).not.toBe(first.organizationId);
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, first.organizationId)),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_NOT_FOUND" });
    expect(await organizationEntries(first.organizationId)).toEqual([
      { action: "organization.purged", actorUserId: null },
      { action: "demo.reset", actorUserId: null },
    ]);
    expect(await canSignInByUsername(test.identity.identity, demo.code, "asha", demo.password)).toBe(true);
  });

  it("never purges an organization it didn't build, even one with the demo's code", async () => {
    const input = onboardingInput(plan);
    const { organizationId } = await onboardOrganization(test.services, support, input);
    await expect(resetDemoOrganization(test.services, { ...demoSettings(), code: input.code })).rejects.toMatchObject({
      reason: "DEMO_CODE_TAKEN",
    });
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, organizationId)),
    ).resolves.toMatchObject({ code: input.code });
  });

  it("refuses a plan key no plan on sale has, before purging last night's demo", async () => {
    const demo = demoSettings();
    const { organizationId } = await resetDemoOrganization(test.services, demo);
    await expect(resetDemoOrganization(test.services, { ...demo, planKey: "no-such-plan" })).rejects.toMatchObject({
      reason: "DEMO_PLAN_NOT_FOUND",
    });
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, organizationId)),
    ).resolves.toMatchObject({ code: demo.code });
  });
});
```

In `apps/api/test/support/test-server.ts`:

replace:
```ts

/** Every module, and room to spare: the plan test agencies are on unless a test changes their subscription. */
const everythingPlan = {
  key: "test-everything",
  name: "Everything (tests)",
```
with:
```ts

/** The key of the plan test agencies are on. */
export const EVERYTHING_PLAN_KEY = "test-everything";

/** Every module, and room to spare: the plan test agencies are on unless a test changes their subscription. */
const everythingPlan = {
  key: EVERYTHING_PLAN_KEY,
  name: "Everything (tests)",
```

`apps/api/test/console-environment.test.ts`:
```ts
// The console process refuses to start without the platform role's own connection, or with a half-set demo, and
// says which variable is wrong. The api's own variables are read by the start-up guard, as for every process.
import { describe, expect, it } from "vitest";
import { loadConsoleSettings } from "../src/console-environment.js";

const environment = { DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm" };
const platform = { DATABASE_PLATFORM_URL: "postgresql://app_platform:platform@localhost:55432/travel_crm" };
const demo = { DEMO_ORGANIZATION_CODE: "demo", DEMO_PLAN_KEY: "growth", DEMO_PASSWORD: "demo-password-123" };

/** The variables without the one named. */
const without = (variables: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(variables).filter(([key]) => key !== name));

describe("the console's settings", () => {
  it("reads the platform role's connection and port, and no demo unless one is set", () => {
    expect(loadConsoleSettings(platform, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 3002,
      demo: null,
    });
    expect(loadConsoleSettings({ ...platform, ...demo, CONSOLE_PORT: "4002" }, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 4002,
      demo: { code: "DEMO", planKey: "growth", password: "demo-password-123" },
    });
  });

  it("refuses to start without its own connection, or with the api's in its place", () => {
    expect(() => loadConsoleSettings({}, environment)).toThrow(/DATABASE_PLATFORM_URL/);
    expect(() => loadConsoleSettings({ DATABASE_PLATFORM_URL: environment.DATABASE_URL }, environment)).toThrow(
      /DATABASE_PLATFORM_URL: must connect as the platform role, not DATABASE_URL's/,
    );
  });

  it("takes the demo whole or not at all, and never with a short password", () => {
    expect(() => loadConsoleSettings({ ...platform, ...without(demo, "DEMO_PASSWORD") }, environment)).toThrow(
      /DEMO_PASSWORD: is needed with DEMO_ORGANIZATION_CODE, DEMO_PLAN_KEY/,
    );
    expect(() => loadConsoleSettings({ ...platform, ...demo, DEMO_PASSWORD: "short" }, environment)).toThrow(
      /DEMO_PASSWORD/,
    );
    expect(() =>
      loadConsoleSettings({ ...platform, ...demo, DEMO_ORGANIZATION_CODE: "no spaces" }, environment),
    ).toThrow(/DEMO_ORGANIZATION_CODE/);
  });
});
```

`apps/api/test/console-jobs.test.ts`:
```ts
// The console process's jobs (ADR 0018): the platform's purge and erasure jobs, and, when a demo is set, the nightly
// demo reset at 02:00 India time; with the demo switched off, the schedule an earlier start left in pg-boss goes.
import { randomUUID } from "node:crypto";
import { PURGE_ORGANIZATION_QUEUE, RESET_DEMO_QUEUE } from "@travel-crm/domain/platform";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startConsoleJobs } from "../src/console-jobs.js";
import { createTestConsole, type TestConsole } from "./support/console.js";
import { createTestAgency, createTestServer, EVERYTHING_PLAN_KEY, type TestServer } from "./support/test-server.js";

describe("the console's jobs", () => {
  let server: TestServer;
  let testConsole: TestConsole;

  beforeAll(() => {
    server = createTestServer();
    testConsole = createTestConsole(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("runs the platform's jobs, and resets the demo every night at 02:00 India time", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    // The first test agency puts the test plan on sale.
    await createTestAgency(server);
    const demo = {
      code: `D${randomUUID().slice(0, 8).toUpperCase()}`,
      planKey: EVERYTHING_PLAN_KEY,
      password: "demo-password-123",
    };
    await startConsoleJobs(runner, testConsole.services, demo);
    expect(runner.schedules).toEqual([
      { queue: RESET_DEMO_QUEUE, cron: "0 2 * * *", timeZone: "Asia/Kolkata", data: {} },
    ]);

    await runner.fireSchedule(RESET_DEMO_QUEUE);
    // A purge of an organization already gone does nothing, and fails nothing.
    await queue.send(PURGE_ORGANIZATION_QUEUE, { organizationId: randomUUID(), requestedBy: null });
    expect(await runner.runQueued()).toBe(2);
    expect(runner.failed).toEqual([]);
    expect(await server.platform.organization.count({ where: { code: demo.code } })).toBe(1);
  });

  it("removes the demo's schedule when the demo is switched off", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    await runner.schedule(RESET_DEMO_QUEUE, "0 2 * * *", { timeZone: "Asia/Kolkata" });
    await startConsoleJobs(runner, testConsole.services, null);
    expect(runner.schedules).toEqual([]);
  });
});
```

`apps/api/test/worker-platform-jobs.test.ts`:
```ts
// The worker's jobs for subscriptions and onboarding: just after midnight in India it records each organization's
// subscription as far as its unpaid days have taken it (spec 7.3), and it emails the invite the console's onboarding
// asked for, whose link lets the new Owner choose a password and sign in (spec 7.1). In-memory runner and email.
import type { OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import { startWorker } from "@travel-crm/domain/jobs";
import { onboardOrganization } from "@travel-crm/domain/platform";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerJobs, type WorkerJobs } from "../src/worker-jobs.js";
import { createTestConsole, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  EVERYTHING_PLAN_KEY,
  postJson,
  signInByEmail,
  type TestServer,
} from "./support/test-server.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("the worker's subscription and invite jobs", () => {
  const reported: string[] = [];
  const email = createMemoryEmailSender();
  let server: TestServer;
  let testConsole: TestConsole;
  let work: WorkerJobs;

  beforeAll(() => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    work = workerJobs({
      db: server.db,
      identity: server.identity,
      files: server.files,
      email,
      push: createMemoryPushSender(),
      appUrl: "https://app.example.in",
      webhookProviders: [],
      log: (line) => reported.push(line),
    });
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("records a lapsed trial as past due, every night just after midnight in India", async () => {
    const agency = await createTestAgency(server);
    // Two days ago in UTC is at least yesterday in India, whatever the hour.
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: {
        status: "trial",
        trialEndsOn: new Date(Date.now() - 2 * DAY_MS),
        paidThrough: null,
        statusChangedAt: new Date(Date.now() - 30 * DAY_MS),
      },
    });
    const lifecycle = work.schedules.find((schedule) => schedule.queue === "subscriptions.advance-lifecycle");
    expect(lifecycle).toMatchObject({ cron: "15 0 * * *", timeZone: "Asia/Kolkata" });
    await lifecycle?.handle({});
    const subscription = await server.platform.subscription.findUniqueOrThrow({
      where: { organizationId: agency.organizationId },
    });
    expect(subscription.status).toBe("past_due");
    expect(reported).toEqual([]);
  });

  it("emails the Owner the console onboarded, whose link lets them choose a password and sign in", async () => {
    // The first test agency puts the test plan on sale.
    await createTestAgency(server);
    const plan = await server.platform.plan.findUniqueOrThrow({ where: { key: EVERYTHING_PLAN_KEY } });
    const code = `W${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const ownerEmail = `owner-${code.toLowerCase()}@example.test`;
    const input: OnboardOrganizationInput = {
      name: "Coorg Getaways",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: `hello-${code.toLowerCase()}@example.test`,
      profile: {
        legalName: "Coorg Getaways LLP",
        gstin: null,
        gstStateCode: "29",
        contactName: null,
        contactPhone: null,
      },
      owner: { name: "Kavya Rao", email: ownerEmail },
      subscription: { planId: plan.id, billingCycle: "monthly", trialEndsOn: "2099-01-31", paidThrough: null },
    };
    const { organizationId } = await onboardOrganization(testConsole.services, { userId: crypto.randomUUID() }, input);

    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const worker = await startWorker({
      db: server.db,
      runner,
      queue,
      ...work,
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    try {
      for (let attempt = 0; attempt < 100 && email.sent.length === 0; attempt += 1) {
        await runner.runQueued();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await worker.stop();
    }
    const invite = email.sent.find((message) => message.to.address === ownerEmail);
    expect(invite?.subject).toBe("Your account for Coorg Getaways");
    const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(invite?.text ?? "")?.[1] ?? "";
    expect(token).not.toBe("");

    const chosen = await postJson(server, "/api/auth/reset-password", { token, newPassword: "kavya-chose-this-1" });
    expect(chosen.status).toBe(200);
    expect((await signInByEmail(server, new CookieJar(), ownerEmail, "kavya-chose-this-1")).status).toBe(200);
  });
});
```

`apps/api/test/console-process.test.ts`:
```ts
// The console's own process, started as a deploy starts it: it reads its settings, checks the platform role, starts
// pg-boss and the platform's jobs, answers /health and the console's tRPC on CONSOLE_PORT, and exits 0 on SIGTERM; a
// connection that isn't the platform role stops it at start-up. Real Postgres and MinIO; SMTP is never reached.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { testEnvironmentVariables } from "./support/environment.js";
import { startMinio, type TestMinio } from "./support/minio.js";

const apiDirectory = fileURLToPath(new URL("..", import.meta.url));

/** A port nothing listens on, for the console to take. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

interface ConsoleProcess {
  /** Everything it printed so far. */
  output(): string;
  hasExited(): boolean;
  exited: Promise<number | null>;
  stop(): void;
}

describe("the console process", () => {
  let minio: TestMinio;

  beforeAll(async () => {
    minio = await startMinio();
  });

  afterAll(async () => {
    await minio.stop();
  });

  /** `src/console.ts` in its own Node, with only the variables a deploy gives it: nothing of the test runner's. */
  function startConsole(port: number, overrides: Record<string, string> = {}): ConsoleProcess {
    const child = spawn(process.execPath, ["--import", "tsx", "src/console.ts"], {
      cwd: apiDirectory,
      env: {
        PATH: process.env.PATH,
        ...testEnvironmentVariables({
          DATABASE_PLATFORM_URL: inject("dbUrls").platform,
          DATABASE_POOL_SIZE: "2",
          CONSOLE_PORT: String(port),
          S3_ENDPOINT: minio.settings.endpoint ?? "",
          S3_BUCKET: minio.settings.bucket,
          S3_ACCESS_KEY_ID: minio.settings.accessKeyId,
          S3_SECRET_ACCESS_KEY: minio.settings.secretAccessKey,
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "9",
          ...overrides,
        }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let printed = "";
    child.stdout.on("data", (chunk: Buffer) => (printed += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (printed += chunk.toString()));
    const exited = once(child, "exit").then(([code]) => code as number | null);
    return {
      output: () => printed,
      hasExited: () => child.exitCode !== null,
      exited,
      stop: () => child.kill("SIGTERM"),
    };
  }

  it("starts, serves the console's tRPC, and exits 0 on SIGTERM", { timeout: 90_000 }, async () => {
    const port = await freePort();
    const running = startConsole(port);
    try {
      for (let attempt = 0; attempt < 600 && !running.output().includes("console listening"); attempt += 1) {
        if (running.hasExited()) throw new Error(`the console exited early:\n${running.output()}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(running.output()).toContain(`console listening on port ${String(port)}`);
      expect((await fetch(`http://127.0.0.1:${String(port)}/health`)).status).toBe(200);
      // Nobody signed in: the console's own check refuses.
      expect((await fetch(`http://127.0.0.1:${String(port)}/api/platform/trpc/whoAmI`)).status).toBe(401);
    } finally {
      running.stop();
    }
    expect(await running.exited).toBe(0);
  });

  it("refuses to start on a connection that isn't the platform role", { timeout: 90_000 }, async () => {
    const running = startConsole(await freePort(), { DATABASE_PLATFORM_URL: inject("dbUrls").migrator });
    expect(await running.exited).toBe(1);
    expect(running.output()).toMatch(/^console start-up failed WrongPlatformRoleError/m);
  });
});
```

`console-process.test.ts` starts `src/console.ts` as a deploy would (`node --import tsx`), with only the variables it
needs, against the test database and a MinIO container, and stops it with SIGTERM; a second run gives it the
migrator's connection as its platform one, and it must refuse to start.

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-environment.test.ts test/console-jobs.test.ts test/worker-platform-jobs.test.ts test/console-process.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/jobs/worker.test.ts test/platform/demo.test.ts`

Expected: FAIL. In `packages/domain`, `TypeError: startJobHandlers is not a function` and
`resetDemoOrganization is not a function` (four). In `apps/api`: `Cannot find module '../src/console-environment.js'` and `'../src/console-jobs.js'`; the
console process can't start (`Cannot find module …/src/console.ts`); the worker has no
`subscriptions.advance-lifecycle` schedule (`expected undefined to match object { cron: '15 0 * * *', … }`) and sends
no invite (`expected undefined to be 'Your account for Coorg Getaways'`).

- [ ] **Step 3: Start a process's handlers and schedules without a relay**

In `packages/domain/src/jobs/worker.ts`:

replace:
```ts
// The worker (spec 9.1): runs every listener, plain job handler and scheduled job, and the outbox relay. The api's
// `worker` command builds the adapters and calls startWorker; it also stops the job runner it built.
import type { Database } from "@travel-crm/db";
```
with:
```ts
// The worker (spec 9.1): runs every listener, plain job handler and scheduled job, and the outbox relay. The api's
// `worker` command builds the adapters and calls startWorker; it also stops the job runner it built. The console
// process, which has no listeners, starts only its handlers and schedules (startJobHandlers).
import type { Database } from "@travel-crm/db";
```

replace:
```ts

export interface Worker {
```
with:
```ts

/** A process's plain handlers and schedules, without listeners: what the console process runs. */
export interface JobHandlerDependencies {
  runner: JobRunner;
  handlers?: readonly JobHandler[];
  schedules?: readonly ScheduledJob[];
}

export interface Worker {
```

replace:
```ts

/**
 * Starts everything. The runner (pg-boss) keeps its queues and schedules after a restart: a listener or schedule
 * removed from the code leaves its queue, jobs and schedule behind until someone reconciles them (plan 4).
 */
export async function startWorker(dependencies: WorkerDependencies): Promise<Worker> {
  const { db, runner, queue, listeners, handlers = [], schedules = [] } = dependencies;
  const queues = [
    ...listeners.map((listener) => listener.name),
    ...handlers.map((handler) => handler.queue),
    ...schedules.map((schedule) => schedule.queue),
  ];
  const repeated = queues.filter((name, index) => queues.indexOf(name) !== index);
  if (repeated.length > 0) throw new Error(`Two kinds of work share the queue ${repeated.join(", ")}`);
  // Check every schedule before registering anything, so a mistake leaves nothing half-started.
  for (const schedule of schedules) {
```
with:
```ts

/** Refuses two kinds of work on one queue, and a schedule pg-boss couldn't read, before anything is registered. */
function assertWiring(queues: readonly string[], schedules: readonly ScheduledJob[]): void {
  const repeated = queues.filter((name, index) => queues.indexOf(name) !== index);
  if (repeated.length > 0) throw new Error(`Two kinds of work share the queue ${repeated.join(", ")}`);
  for (const schedule of schedules) {
```

replace:
```ts
  }

  // Schedules first: the runner may refuse one (a cron it can't read), and then no listener or relay has started. The
  // schedules registered before the refused one stay in the runner until the next start reconciles them.
  for (const schedule of schedules) {
```
with:
```ts
  }
}

/**
 * The runner may refuse a schedule (a cron it can't read); the schedules registered before it stay in the runner until
 * the next start reconciles them.
 */
async function registerSchedules(runner: JobRunner, schedules: readonly ScheduledJob[]): Promise<void> {
  for (const schedule of schedules) {
```

replace:
```ts
  }
  for (const listener of listeners) {
```
with:
```ts
  }
}

/**
 * Starts everything. The runner (pg-boss) keeps its queues and schedules after a restart: a listener or schedule
 * removed from the code leaves its queue, jobs and schedule behind until a super admin removes it in the console.
 */
export async function startWorker(dependencies: WorkerDependencies): Promise<Worker> {
  const { db, runner, queue, listeners, handlers = [], schedules = [] } = dependencies;
  assertWiring(
    [
      ...listeners.map((listener) => listener.name),
      ...handlers.map((handler) => handler.queue),
      ...schedules.map((schedule) => schedule.queue),
    ],
    schedules,
  );
  // Schedules first: when the runner refuses one, no listener or relay has started.
  await registerSchedules(runner, schedules);
  for (const listener of listeners) {
```

replace:
```ts
}
```
with:
```ts
}

/**
 * Starts plain handlers and schedules only: no listeners and no outbox relay. The worker's relay is the one that
 * knows every listener; a relay that knew none would mark each event relayed with nothing queued for it. Stop the
 * runner to stop them.
 */
export async function startJobHandlers(dependencies: JobHandlerDependencies): Promise<void> {
  const { runner, handlers = [], schedules = [] } = dependencies;
  assertWiring(
    [...handlers.map((handler) => handler.queue), ...schedules.map((schedule) => schedule.queue)],
    schedules,
  );
  await registerSchedules(runner, schedules);
  for (const handler of handlers) {
    await runner.work(handler.queue, (job) => handler.handle(job.data));
  }
}
```

In `packages/domain/src/jobs/index.ts`:

replace:
```ts
export { runListenerJob, type ListenerRunOutcome } from "./run-listener.js";
export { startWorker, type JobHandler, type ScheduledJob, type Worker, type WorkerDependencies } from "./worker.js";
```
with:
```ts
export { runListenerJob, type ListenerRunOutcome } from "./run-listener.js";
export {
  startJobHandlers,
  startWorker,
  type JobHandler,
  type JobHandlerDependencies,
  type ScheduledJob,
  type Worker,
  type WorkerDependencies,
} from "./worker.js";
```

- [ ] **Step 4: Build the demo**

In `packages/domain/src/identity/onboarding.ts`:

replace:
```ts
/**
 * Asks for an invite email to an active member who has a real address: publishes "staff.invited", which the worker's
```
with:
```ts
/**
 * A member who signs in with the organization's code, a username and a password already chosen, in the transaction's
 * organization: the shared demo's staff (no email, no invite). Recorded as "staff.created" by `actor`.
 */
export async function addStaffWithPassword(
  tx: IdentityTx,
  actor: Actor,
  staff: { name: string; username: string; roleKey: string; passwordHash: string },
): Promise<CreatedStaff> {
  return insertStaffAccount(tx, {
    organizationId: actor.organizationId,
    name: staff.name,
    username: staff.username,
    roleKey: staff.roleKey,
    passwordHash: staff.passwordHash,
    mustChangePassword: false,
    actor,
  });
}

/**
 * Asks for an invite email to an active member who has a real address: publishes "staff.invited", which the worker's
```

In `packages/domain/src/identity/organization-records.ts`:

replace:
```ts

/** Corrects the name, time zone and contact email. Returns the row before and after. */
```
with:
```ts

/** The organization with this sign-in code, or null when there is none. */
export async function findOrganizationByCode(tx: IdentityTx, code: string): Promise<OrganizationRecord | null> {
  return tx.organization.findUnique({ where: { code }, select: recordFields });
}

/** Corrects the name, time zone and contact email. Returns the row before and after. */
```

In `packages/domain/src/identity/index.ts`:

replace:
```ts
export { memberActivity, type MemberActivity } from "./member-activity.js";
export { createOrganizationRecord, inviteOwner, requestInvite, type NewOrganization } from "./onboarding.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export {
  findOrganizationRecord,
```
with:
```ts
export { memberActivity, type MemberActivity } from "./member-activity.js";
export {
  addStaffWithPassword,
  createOrganizationRecord,
  inviteOwner,
  requestInvite,
  type NewOrganization,
} from "./onboarding.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export {
  findOrganizationByCode,
  findOrganizationRecord,
```

`packages/domain/src/platform/demo.ts`:
```ts
// The shared demo organization (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"). The
// console's nightly job purges last night's demo and builds it again: its business profile, the starter roles, and
// staff in three roles who sign in with its code, their username and the demo password. The modules that keep
// leads, quotes and bookings add their sample data here when they arrive.
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import {
  addStaffWithPassword,
  createOrganizationRecord,
  findOrganizationByCode,
  insertStarterRoles,
  OWNER_ROLE_KEY,
} from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, systemActor } from "../kernel/index.js";
import { saveOrganizationProfile } from "../profile/index.js";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { listPlans, startSubscription } from "../subscriptions/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import { purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

export const RESET_DEMO_QUEUE = "platform.reset-demo";

export interface DemoSettings {
  /** The demo's organization code, e.g. DEMO: everyone signs in with it. */
  code: string;
  /** The key of the plan on sale that the demo is subscribed to. */
  planKey: string;
  /** Every demo account's password. */
  password: string;
}

const TIME_ZONE = "Asia/Kolkata";

/** Paid a month ahead from the day it is built: reset nightly, it never reaches past due. */
const PAID_DAYS = 30;

const DEMO_STAFF = [
  { name: "Asha Mehta", username: "asha", roleKey: OWNER_ROLE_KEY },
  { name: "Ravi Kumar", username: "ravi", roleKey: "sales" },
  { name: "Meena Iyer", username: "meena", roleKey: "operations" },
] as const;

/** Checked by the same rules as an Owner's own save. */
const DEMO_PROFILE = saveOrganizationProfileInput.parse({
  legalName: "Demo Holidays Private Limited",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "4th floor, Sea View Chambers, Linking Road, Bandra West, Mumbai 400050",
  contactName: "Asha Mehta",
  contactPhone: "+91 98200 12345",
  bankAccountName: "Demo Holidays Private Limited",
  bankAccountNumber: "000123456789",
  bankIfsc: "HDFC0000001",
  bankName: "HDFC Bank",
  invoicePrefix: "DH",
  brandColour: "#1f6f5c",
  documentTerms: "50% advance to confirm, the balance 15 days before travel.",
});

/**
 * Purges the organization last night's reset built, then builds the demo again; the first run only builds it. Both
 * checks come before the purge: an organization with the demo's code that no reset built is never touched (a code set
 * by mistake can't purge an agency), and a plan key that matches no plan on sale leaves last night's demo as it is.
 */
export async function resetDemoOrganization(
  services: PlatformServices,
  demo: DemoSettings,
  now: Date = new Date(),
): Promise<{ organizationId: string }> {
  const { lastNight, plan } = await services.platformDb.transaction(async (tx) => ({
    lastNight: await lastDemo(tx, demo.code),
    plan: await planOnSale(tx, demo.planKey),
  }));
  if (lastNight !== null) {
    // The demo is active, never cancelled: the purge's own check is for agencies, and lastDemo made sure of this one.
    await purgeOrganization(services, { organizationId: lastNight, requestedBy: null }, { requireCancelled: false });
  }
  // Hashing is slow on purpose: once, before the transaction, for every demo account.
  const passwordHash = await (await services.identity.auth.$context).password.hash(demo.password);
  return services.platformDb.transaction(
    async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Demo Holidays",
        code: demo.code,
        timeZone: TIME_ZONE,
        contactEmail: null,
      });
      const actor = systemActor(organization.id);
      await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await saveOrganizationProfile(orgTx, actor, DEMO_PROFILE);
        for (const staff of DEMO_STAFF) await addStaffWithPassword(orgTx, actor, { ...staff, passwordHash });
      });
      await startSubscription(
        tx,
        { userId: null },
        {
          organizationId: organization.id,
          planId: plan.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: addDays(calendarDateIn(now, TIME_ZONE), PAID_DAYS),
        },
        now,
      );
      await recordPlatformAudit(
        tx,
        { userId: null },
        {
          action: "demo.reset",
          targetType: "organization",
          targetId: organization.id,
          targetOrganizationId: organization.id,
          after: { code: organization.code, planKey: plan.key },
        },
      );
      return { organizationId: organization.id };
    },
    // A dozen statements and three accounts, as onboarding.
    { timeout: 20_000 },
  );
}

async function planOnSale(tx: PlatformTx, planKey: string): Promise<PlanSummary> {
  const plan = (await listPlans(tx, { includeArchived: false })).find((candidate) => candidate.key === planKey);
  if (!plan) throw new DomainError("NOT_FOUND", "DEMO_PLAN_NOT_FOUND", `No plan on sale has the key ${planKey}`);
  return plan;
}

/** The organization with the demo's code, or null; refused when no demo reset built it. */
async function lastDemo(tx: PlatformTx, code: string): Promise<string | null> {
  const organization = await findOrganizationByCode(tx, code);
  if (organization === null) return null;
  const built = await tx.platformAuditEntry.findFirst({
    where: { action: "demo.reset", targetOrganizationId: organization.id },
    select: { id: true },
  });
  if (built === null) {
    throw new DomainError("CONFLICT", "DEMO_CODE_TAKEN", "An organization the demo reset didn't build has its code");
  }
  return organization.id;
}
```

In `packages/domain/src/platform/index.ts`:

replace:
```ts
export { organizationsOverview } from "./dashboard.js";
export { ERASE_SUBJECT_QUEUE, eraseSubject, requestErasure } from "./erasure.js";
```
with:
```ts
export { organizationsOverview } from "./dashboard.js";
export { RESET_DEMO_QUEUE, resetDemoOrganization, type DemoSettings } from "./demo.js";
export { ERASE_SUBJECT_QUEUE, eraseSubject, requestErasure } from "./erasure.js";
```

- [ ] **Step 5: Give the worker the invite and the lifecycle**

In `packages/domain/src/subscriptions/advance.ts`:

replace:
```ts
import { statusOf } from "./rows.js";
```
with:
```ts
import { statusOf } from "./rows.js";

/** The worker's daily job's queue. */
export const ADVANCE_SUBSCRIPTIONS_QUEUE = "subscriptions.advance-lifecycle";
```

In `packages/domain/src/subscriptions/index.ts`:

replace:
```ts
// lifecycle (7.3), and what an organization may use, for the api's request checks 2 and 3 (spec 6.5).
export { advanceSubscription, advanceSubscriptions, type StatusChange } from "./advance.js";
export type { ConsoleActor } from "./console-actor.js";
```
with:
```ts
// lifecycle (7.3), and what an organization may use, for the api's request checks 2 and 3 (spec 6.5).
export {
  ADVANCE_SUBSCRIPTIONS_QUEUE,
  advanceSubscription,
  advanceSubscriptions,
  type StatusChange,
} from "./advance.js";
export type { ConsoleActor } from "./console-actor.js";
```

In `apps/api/src/worker-jobs.ts`:

replace:
```ts
// Everything the worker runs (spec 9.1): each module's listeners, the webhook processing job, and the scheduled jobs,
// built from the process's services. The api and the worker are one image; `worker.ts` starts this side.
import type { Database } from "@travel-crm/db";
```
with:
```ts
// Everything the worker runs (spec 9.1): each module's listeners, the webhook processing job, and the scheduled jobs,
// built from the process's services. The api and the worker are one image; `worker.ts` starts this side. The
// platform's own jobs, which need the platform role, run in the console process instead (console-jobs.ts).
import type { Database } from "@travel-crm/db";
```

replace:
```ts
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
```
with:
```ts
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { ADVANCE_SUBSCRIPTIONS_QUEUE, advanceSubscriptions } from "@travel-crm/domain/subscriptions";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { describeError } from "@travel-crm/integrations/jobs";
import { renderPdf } from "@travel-crm/integrations/pdf";
```

replace:
```ts
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "memberContacts">;
  files: Files;
```
with:
```ts
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "memberContacts" | "organizationIds" | "inviteListener">;
  files: Files;
```

replace:
```ts
      forgetPushSubscriptionsListener,
    ],
```
with:
```ts
      forgetPushSubscriptionsListener,
      identity.inviteListener({ email, appUrl }),
    ],
```

replace:
```ts
      },
    ],
```
with:
```ts
      },
      {
        // Just after midnight in India, where every agency's day starts: a trial that ended yesterday is recorded as
        // past due before anyone signs in. The request checks already compute the state on every request (spec 7.3);
        // this writes it down, so the console and the audit log show it.
        queue: ADVANCE_SUBSCRIPTIONS_QUEUE,
        cron: "15 0 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await advanceSubscriptions({
            db,
            organizationIds: await identity.organizationIds(),
            // One organization failing doesn't stop the rest; the log gets its id and the error's names and codes.
            onError: (error, organizationId) => {
              log(`${ADVANCE_SUBSCRIPTIONS_QUEUE}: organization ${organizationId} failed: ${describeError(error)}`);
            },
          });
        },
      },
    ],
```

- [ ] **Step 6: Run the console as its own process**

`apps/api/src/console-environment.ts`:
```ts
// The console process's own settings (ADR 0018), beside the api's environment it starts with: the platform role's
// connection, which only this process is given, its port, and the shared demo the nightly job resets. Checked at
// start-up, like the api's.
import { organizationCode } from "@travel-crm/contracts/identity";
import { planKey } from "@travel-crm/contracts/subscriptions";
import type { DemoSettings } from "@travel-crm/domain/platform";
import { z } from "zod";
import { EnvironmentError, type Environment } from "./environment.js";

const consoleSchema = z.object({
  /** Postgres as app_platform, the role that sees every organization. Only the console process is given it. */
  DATABASE_PLATFORM_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
  CONSOLE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  /** The shared demo (spec 7.4), all three or none: its organization code, the plan it is on, its password. */
  DEMO_ORGANIZATION_CODE: organizationCode.optional(),
  DEMO_PLAN_KEY: planKey.optional(),
  /** Every demo account's password. Sales staff share it, so it is never a real person's. */
  DEMO_PASSWORD: z.string().min(12, "must be at least 12 characters").optional(),
});

export interface ConsoleSettings {
  platformDatabaseUrl: string;
  port: number;
  /** Null when no demo is set: the nightly reset doesn't run. */
  demo: DemoSettings | null;
}

const DEMO_VARIABLES = ["DEMO_ORGANIZATION_CODE", "DEMO_PLAN_KEY", "DEMO_PASSWORD"] as const;

/**
 * The console's variables, given the api's environment the process already read. Lists every problem by variable
 * name, never by value, as loadEnvironment does.
 */
export function loadConsoleSettings(
  source: Record<string, string | undefined>,
  environment: Pick<Environment, "DATABASE_URL">,
): ConsoleSettings {
  const result = consoleSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const settings = result.data;
  const problems: string[] = [];
  if (settings.DATABASE_PLATFORM_URL === environment.DATABASE_URL) {
    problems.push("DATABASE_PLATFORM_URL: must connect as the platform role, not DATABASE_URL's");
  }
  const demoSet = DEMO_VARIABLES.filter((name) => settings[name] !== undefined);
  if (demoSet.length > 0) {
    for (const name of DEMO_VARIABLES) {
      if (settings[name] === undefined) problems.push(`${name}: is needed with ${demoSet.join(", ")}`);
    }
  }
  if (problems.length > 0) throw new EnvironmentError(problems);
  const { DEMO_ORGANIZATION_CODE: code, DEMO_PLAN_KEY: demoPlanKey, DEMO_PASSWORD: password } = settings;
  return {
    platformDatabaseUrl: settings.DATABASE_PLATFORM_URL,
    port: settings.CONSOLE_PORT,
    demo:
      code === undefined || demoPlanKey === undefined || password === undefined
        ? null
        : { code, planKey: demoPlanKey, password },
  };
}
```

`apps/api/src/console-jobs.ts`:
```ts
// What the console process runs besides its HTTP app (ADR 0018): the platform's own jobs (purging an organization,
// erasing a person or a record) and, when a demo is set, its nightly reset. They need the platform role, which only
// this process holds. No listeners and no outbox relay: those are the worker's.
import { startJobHandlers, type JobHandler, type ScheduledJob } from "@travel-crm/domain/jobs";
import {
  platformJobHandlers,
  RESET_DEMO_QUEUE,
  resetDemoOrganization,
  type DemoSettings,
  type PlatformServices,
} from "@travel-crm/domain/platform";
import type { JobRunner } from "@travel-crm/integrations/jobs";

export interface ConsoleJobs {
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

export function consoleJobs(services: PlatformServices, demo: DemoSettings | null): ConsoleJobs {
  return {
    handlers: platformJobHandlers(services),
    schedules:
      demo === null
        ? []
        : [
            {
              // Nightly (spec 7.4), at 02:00 India time, when no agency is at work.
              queue: RESET_DEMO_QUEUE,
              cron: "0 2 * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await resetDemoOrganization(services, demo);
              },
            },
          ],
  };
}

/** Registers the console's jobs with the runner (pg-boss). Stop the runner to stop them. */
export async function startConsoleJobs(
  runner: JobRunner,
  services: PlatformServices,
  demo: DemoSettings | null,
): Promise<void> {
  // pg-boss keeps a schedule across restarts: with the demo switched off, last start's schedule goes too.
  if (demo === null) await runner.unschedule(RESET_DEMO_QUEUE);
  await startJobHandlers({ runner, ...consoleJobs(services, demo) });
}
```

In `apps/api/src/process-log.ts`:

replace:
```ts
// The api's and the worker's one log (spec 9.1): a line per problem on stderr, `<process>: <line>`, ids and codes only.
// Lines are written by our code from ids and codes; errors appear as their names and codes, never their messages or
```
with:
```ts
// Each process's one log (spec 9.1): a line per problem on stderr, `<process>: <line>`, ids and codes only.
// Lines are written by our code from ids and codes; errors appear as their names and codes, never their messages or
```

replace:
```ts

export type ProcessName = "api" | "worker";
```
with:
```ts

export type ProcessName = "api" | "worker" | "console";
```

In `apps/api/src/start-up.ts`:

replace:
```ts
// Starting a process on the services (the api and the worker alike): read the environment, build the services, check
// the bucket and start pg-boss, then the process's own start, or exit 1 with one message.
import { loadEnvironment, type Environment } from "./environment.js";
```
with:
```ts
// Starting a process on the services (the api, the worker and the console alike): read the environment, build the
// services, check the bucket and start pg-boss, then the process's own start, or exit 1 with one message.
import { loadEnvironment, type Environment } from "./environment.js";
```

`apps/api/src/console.ts`:
```ts
// Starts the platform console (`pnpm --filter @travel-crm/api-server console`): the console's tRPC at
// /api/platform/trpc, and the platform's own jobs. The api's image run as a third command, beside the api and the
// worker, and the only one given DATABASE_PLATFORM_URL (ADR 0018). One instance is enough; keep it running for the
// nightly demo reset.
import { serve } from "@hono/node-server";
import { createPlatformServices } from "@travel-crm/domain/platform";
import { describeError } from "@travel-crm/integrations/jobs";
import { createConsoleApp } from "./console-app.js";
import { loadConsoleSettings } from "./console-environment.js";
import { startConsoleJobs } from "./console-jobs.js";
import { startProcess } from "./start-up.js";

// The console's own start runs inside the start-up guard: its settings, the platform role's connection and its jobs.
// A missing DATABASE_PLATFORM_URL, a connection that isn't the platform role, or a schedule pg-boss refuses ends in
// one "console start-up failed" message, with the pools closed.
const { services, log, running } = await startProcess("console", async ({ environment, services }) => {
  const settings = loadConsoleSettings(process.env, environment);
  const platform = createPlatformServices({
    platformDatabaseUrl: settings.platformDatabaseUrl,
    db: services.db,
    identity: services.identity,
    storage: services.storage,
    queue: services.jobs,
    jobs: services.jobs,
  });
  try {
    // A transaction checks that the connection is the platform role: refuse to start rather than fail requests.
    await platform.platformDb.transaction(() => Promise.resolve());
    await startConsoleJobs(services.jobs, platform, settings.demo);
  } catch (error) {
    await platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return { settings, platform };
});
const { settings, platform } = running;

const server = serve({ fetch: createConsoleApp(platform, log).fetch, port: settings.port }, (address) => {
  console.log(`console listening on port ${String(address.port)}`);
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, let running jobs finish (pg-boss
// stops with the services), then close the pools. Exit 0 only when that went well.
function shutDown(): void {
  server.close((closeError) => {
    services
      .close()
      .then(() => platform.platformDb.disconnect())
      .then(() => {
        if (closeError) throw closeError;
        process.exit(0);
      })
      .catch((error: unknown) => {
        log(`shutdown failed: ${describeError(error)}`);
        process.exit(1);
      });
  });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
```

In `apps/api/package.json`:

replace:
```json
    "worker": "tsx --env-file-if-exists=../../.env src/worker.ts",
    "typecheck": "tsc --noEmit",
```
with:
```json
    "worker": "tsx --env-file-if-exists=../../.env src/worker.ts",
    "console": "tsx --env-file-if-exists=../../.env src/console.ts",
    "typecheck": "tsc --noEmit",
```

In `.env.example`:

replace:
```bash
VAPID_SUBJECT=mailto:dev@travel-crm.localhost
```
with:
```bash
VAPID_SUBJECT=mailto:dev@travel-crm.localhost

# The platform console (the api's `console` command): its own port, and the only process that reads
# DATABASE_PLATFORM_URL. The shared demo it resets every night is off unless all three DEMO_ variables are set; make
# the plan in the console first.
CONSOLE_PORT=3002
# DEMO_ORGANIZATION_CODE=DEMO
# DEMO_PLAN_KEY=growth
# DEMO_PASSWORD=demo-only-password
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/console-environment.test.ts test/console-jobs.test.ts test/worker-platform-jobs.test.ts test/console-process.test.ts`

Run: `cd /Users/ak/personal/travel-crm/packages/domain && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/jobs/worker.test.ts test/platform/demo.test.ts`

Expected: PASS, 9 tests in 4 files (apps/api); 12 tests in 2 files (packages/domain). The console process test takes a few seconds: tsx compiles the console as it starts.

- [ ] **Step 8: Document it**

In `docs/adr/0018-platform-console.md`:

replace:
```markdown

- **Failed jobs and schedules.** The console lists failed jobs, runs one again, and lists the schedules; a super admin
```
with:
```markdown

- **The console process runs the platform's own jobs** (purge, erasure, the nightly demo reset), which need the
  platform role, with `startJobHandlers`: handlers and schedules only. It runs no listeners and no outbox relay; the
  worker's relay is the only one, since a relay that knew no listeners would mark every event relayed with nothing
  queued for it.
- **Failed jobs and schedules.** The console lists failed jobs, runs one again, and lists the schedules; a super admin
```

In `docs/adr/0021-onboarding.md`:

replace:
```markdown
  links keep working until they lapse, so asking twice never strands anyone.
```
with:
```markdown
  links keep working until they lapse, so asking twice never strands anyone.
- **The shared demo is rebuilt every night the same way** (spec 7.4). The console's `platform.reset-demo` job, at
  02:00 India time, purges the organization last night's reset built and builds it again in one platform
  transaction: the business profile, the starter roles, and three staff (Owner, Sales, Operations) who sign in with
  the demo's code and `DEMO_PASSWORD`, with no email and no invite; subscribed to the plan `DEMO_PLAN_KEY` names,
  paid a month ahead. It purges only an organization that has a `demo.reset` entry in the platform log, so a code
  set by mistake can't purge an agency, and it checks the plan before it purges anything.
```

replace:
```markdown
- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own
  (a hash of `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so a
  change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
```
with:
```markdown
- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own (a hash of
  `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so
  a change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
```

In `apps/api/README.md`:

replace:
```markdown

| Route                        | What it is                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                                       |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                                         |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, password reset, `/change-password`, `/two-factor/*`, `/admin/*` |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                                              |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                                               |
| `GET /p/<token>`             | a share link (ADR 0013): an issued document's PDF; 30 requests a minute per address                   |
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address                    |
```
with:
```markdown

| Route                        | What it is                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                                  |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                                    |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, password reset, `/change-password`, `/two-factor/*`        |
| `/api/auth/admin/*`          | closed (404), but support's `/admin/impersonate-user` and `/admin/stop-impersonating` (ADR 0018) |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                                         |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                                          |
| `GET /p/<token>`             | a share link (ADR 0013): an issued document's PDF; 30 requests a minute per address              |
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address               |
```

replace:
```markdown
| `rate-limits.purge`                       | every day at 03:30 India time, deletes rate-limit windows over a day old  |
```
with:
```markdown
| `rate-limits.purge`                       | every day at 03:30 India time, deletes rate-limit windows over a day old  |
| `identity.send-invite`                    | emails an invited Owner the link to choose a password (`staff.invited`)   |
| `subscriptions.advance-lifecycle`         | every day at 00:15 India time, records each subscription's state (7.3)    |
```

replace:
```markdown

Both processes write their problems to one log on stderr, a line each, ids and codes only: `api: ...` and
`worker: ...`. An error appears as its name and code and its causes' (three levels down, `describeError`), never as
its message or the error itself, which can quote a person's data (a Prisma validation error quotes the query's values).
```
with:
```markdown

Every process writes its problems to one log on stderr, a line each, ids and codes only: `api: ...`, `worker: ...`
and `console: ...`. An error appears as its name and code and its causes' (three levels down, `describeError`), never as
its message or the error itself, which can quote a person's data (a Prisma validation error quotes the query's values).
```

replace:
```markdown
  jobs whose event wasn't found, and a failed shutdown.
- **Start-up is the one exception.** A process that can't start prints one `<process> start-up failed` message with
```
with:
```markdown
  jobs whose event wasn't found, and a failed shutdown.
- **The console:** a console call that fails unexpectedly (`console tRPC <path> failed: ...`), a failing platform job,
  pg-boss's own errors and warnings, and a failed shutdown.
- **Start-up is the one exception.** A process that can't start prints one `<process> start-up failed` message with
```

replace:
```markdown
  (`src/start-up.ts`).
```
with:
```markdown
  (`src/start-up.ts`).

## The console

`pnpm --filter @travel-crm/api-server console` starts the platform console's process from the same code and image
(ADR 0018): the console's tRPC at `/api/platform/trpc` on `CONSOLE_PORT`, which the load balancer (and the web app's
development server) routes there, and the platform's own jobs, from `src/console-jobs.ts`:

| Queue                         | What it does                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `platform.purge-organization` | deletes a cancelled, exported organization for good, when a super admin asks (spec 5) |
| `platform.erase-subject`      | erases a removed person or one record in every module (spec 5)                        |
| `platform.reset-demo`         | every night at 02:00 India time, purges and rebuilds the shared demo (spec 7.4)       |

It is the only process given `DATABASE_PLATFORM_URL`, and it needs everything else the api does. It refuses to start
when that connection isn't the platform role, as well as for everything the api refuses. It runs no listeners and
relays nothing: the worker does. One instance is enough; keep it running for the demo reset. It stops on SIGTERM like
the api.

| Variable                 | Required | Default | Meaning                                                                        |
| ------------------------ | -------- | ------- | ------------------------------------------------------------------------------ |
| `DATABASE_PLATFORM_URL`  | yes      |         | Postgres as the `app_platform` role; never the api's or the worker's           |
| `CONSOLE_PORT`           | no       | `3002`  |                                                                                |
| `DEMO_ORGANIZATION_CODE` | no       | no demo | the demo's sign-in code; all three `DEMO_` variables or none                   |
| `DEMO_PLAN_KEY`          | no       |         | the key of the plan on sale the demo is on                                     |
| `DEMO_PASSWORD`          | no       |         | every demo account's password (12 characters or more): `asha`, `ravi`, `meena` |
```

replace:
```markdown
A process opens up to `2 × DATABASE_POOL_SIZE + 5` connections: one pool for the database, one for identity, and
pg-boss's 5. That is 25 by default, and Postgres allows 100. For more than 3 instances (api and worker together), put
a connection pooler in front of Postgres, or lower the size.

The api never reads `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate step, and only the
platform module may connect as the role that sees every organization. The public routes' rate-limit key is derived
from `BETTER_AUTH_SECRET` (HKDF), so it needs no variable of its own.
```
with:
```markdown
A process opens up to `2 × DATABASE_POOL_SIZE + 5` connections: one pool for the database, one for identity, and
pg-boss's 5. That is 25 by default, and Postgres allows 100; the console adds its platform pool of 3. For more than 3
instances (api, worker and console together), put a connection pooler in front of Postgres, or lower the size.

The api and the worker never read `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate
step, and only the console process connects as the role that sees every organization. The public routes' rate-limit
key is derived
from `BETTER_AUTH_SECRET` (HKDF), so it needs no variable of its own.
```

In `packages/domain/src/jobs/README.md`:

replace:
```markdown
  queue; then the relay starts. `stop()` stops the relay; the caller stops pg-boss after it.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`,
  `ListenerRunOutcome`, `JobHandler`, `ScheduledJob`, `Worker`, `WorkerDependencies`.
```
with:
```markdown
  queue; then the relay starts. `stop()` stops the relay; the caller stops pg-boss after it.
- `startJobHandlers({ runner, handlers?, schedules? })`: the same for a process with no listeners, the console: its
  handlers and schedules, and no relay. The worker's relay is the only one: a relay that knew no listeners would mark
  every event relayed with nothing queued for it.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`,
  `ListenerRunOutcome`, `JobHandler`, `ScheduledJob`, `Worker`, `WorkerDependencies`, `JobHandlerDependencies`.
```

replace:
```markdown
  without a domain are not masked. A job whose event isn't found is not retried but is reported to `onError`.
- Removing a listener or schedule from the code leaves its pg-boss queue, jobs and schedule behind until they are
  reconciled (plan 4).
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
```
with:
```markdown
  without a domain are not masked. A job whose event isn't found is not retried but is reported to `onError`.
- Removing a listener or schedule from the code leaves its pg-boss queue, jobs and schedule behind: a super admin
  removes the schedule in the platform console (ADR 0018).
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
```

replace:
```markdown
- A failing job is retried 5 times with exponential backoff from 10 seconds, then lands in pg-boss's failed list
  (`PgBossJobs.failedJobs()`, shown in the platform console in plan 4).
- Upgrading pg-boss: a new version may change its schema. Generate a migration from
```
with:
```markdown
- A failing job is retried 5 times with exponential backoff from 10 seconds, then lands in pg-boss's failed list
  (`PgBossJobs.failedJobs()`, which the platform console lists and can run again).
- Upgrading pg-boss: a new version may change its schema. Generate a migration from
```

In `packages/domain/src/identity/README.md`:

replace:
```markdown
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)` (an Owner with a password,
    for tests and the demo);
  - `organizationIds()`: every organization's id, for jobs that visit each one;
```
with:
```markdown
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)` (an Owner with a password,
    for tests);
  - `organizationIds()`: every organization's id, for jobs that visit each one;
```

replace:
```markdown
  `insertStarterRoles(tx)`, `inviteOwner(tx, actor, { name, email })` and `requestInvite(tx, actor, memberId)` (inside
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`.
- Permanent deletion's steps, for the platform's jobs (spec 5): `personExport(tx, organizationId, memberId)` and
```
with:
```markdown
  `insertStarterRoles(tx)`, `inviteOwner(tx, actor, { name, email })` and `requestInvite(tx, actor, memberId)` (inside
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`. The nightly demo reset adds
  its staff with `addStaffWithPassword(tx, actor, { name, username, roleKey, passwordHash })` (organization-code
  sign-in, no email, no invite) and finds last night's demo with `findOrganizationByCode(tx, code)`.
- Permanent deletion's steps, for the platform's jobs (spec 5): `personExport(tx, organizationId, memberId)` and
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown
  `platformJobHandlers(services)`, for the console process's job runner.
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```
with:
```markdown
  `platformJobHandlers(services)`, for the console process's job runner.
- The shared demo (spec 7.4): `resetDemoOrganization(services, { code, planKey, password }, now?)`, the console's
  nightly `RESET_DEMO_QUEUE` (`platform.reset-demo`) job: purges last night's demo (only an organization a reset built,
  as the platform log shows) and builds it again with its profile and three staff who sign in with the code.
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
```

In `packages/domain/src/subscriptions/README.md`:

replace:
```markdown
- The daily job: `advanceSubscriptions({ db, organizationIds, now?, onError? })`, each organization in its own
  `forOrg()`; `advanceSubscription(tx, organizationId, now)` for one.
```
with:
```markdown
- The daily job: `advanceSubscriptions({ db, organizationIds, now?, onError? })`, each organization in its own
  `forOrg()`; `advanceSubscription(tx, organizationId, now)` for one. The worker runs it on
  `ADVANCE_SUBSCRIPTIONS_QUEUE` (`subscriptions.advance-lifecycle`) at 00:15 India time.
```

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=181 api=13 brand=21 contracts=81 db=219 domain=524 eslint-config=81 integrations=144 (1,264). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git add .env.example apps/api/README.md apps/api/package.json apps/api/src/console-environment.ts apps/api/src/console-jobs.ts apps/api/src/console.ts apps/api/src/process-log.ts apps/api/src/start-up.ts apps/api/src/worker-jobs.ts apps/api/test/console-environment.test.ts apps/api/test/console-jobs.test.ts apps/api/test/console-process.test.ts apps/api/test/support/test-server.ts apps/api/test/worker-platform-jobs.test.ts docs/adr/0018-platform-console.md docs/adr/0021-onboarding.md packages/domain/src/identity/README.md packages/domain/src/identity/index.ts packages/domain/src/identity/onboarding.ts packages/domain/src/identity/organization-records.ts packages/domain/src/jobs/README.md packages/domain/src/jobs/index.ts packages/domain/src/jobs/worker.ts packages/domain/src/platform/README.md packages/domain/src/platform/demo.ts packages/domain/src/platform/index.ts packages/domain/src/subscriptions/README.md packages/domain/src/subscriptions/advance.ts packages/domain/src/subscriptions/index.ts packages/domain/test/jobs/worker.test.ts packages/domain/test/platform/demo.test.ts
git commit -m "feat: run the console as its own process, with the platform's jobs and the nightly demo reset"
```

---
### Task I3: One agency's life on the platform, and the platform documented for the next plans

One flow through the console, the api and the worker proves the pieces fit (spec 7): a super admin puts a plan on
sale; support onboards an agency on a trial; the worker emails the invite and the Owner chooses a password from its
link; the Owner sees the trial and completes the business profile; ten days after the trial's end the agency is
read-only, and the Owner may look but not save; support records a payment and it is active again; then it is
exported, cancelled (the Owner can still see why) and purged by the console's job, after which the Owner is signed
out for good and only the platform log remembers the agency. It passes on the first run: it proves the integration,
and a failure names the step that is wrong. The docs then catch up: the ADR index, the domain module list, the
console's routers, and `CLAUDE.md`'s rules for the next plans; and the api's own `limitBody` becomes the shared one.

**Files:**
- Modify: `CLAUDE.md`, `apps/api/src/app.ts`, `docs/adr/0018-platform-console.md`, `docs/adr/README.md`, `packages/api/README.md`, `packages/domain/README.md`, `packages/domain/src/platform/README.md`
- Test: `apps/api/test/platform-journey.test.ts`

**Interfaces:**
- Consumes: everything above, through HTTP and the worker's and console's job functions.
- Produces: no new interface. `apps/api/src/app.ts` imports `limitBody` from `./body-limit.js` instead of its copy.

- [ ] **Step 1: Write the journey**

`apps/api/test/platform-journey.test.ts`:
```ts
// One agency's whole life through the console, the api and the worker (spec 7): a super admin puts a plan on sale,
// support onboards the agency, the worker emails its Owner the invite, the Owner chooses a password, completes the
// business profile and sees the trial; the trial lapses and the agency turns read-only, a payment makes it active
// again; then it is exported, cancelled and purged, and only the platform log remembers it.
import type { OnboardedOrganization, PlatformLogPage, QueuedJob } from "@travel-crm/contracts/platform";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { startWorker } from "@travel-crm/domain/jobs";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { startConsoleJobs } from "../src/console-jobs.js";
import { workerJobs } from "../src/worker-jobs.js";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const profile = {
  legalName: "Sahyadri Treks LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "21 FC Road, Shivajinagar, Pune 411005",
  contactName: "Neha Joshi",
  contactPhone: "+91 98220 12345",
  bankAccountName: "Sahyadri Treks LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "ST",
  brandColour: "#2e6b3f",
  documentTerms: null,
};

describe("an agency's life on the platform", () => {
  const email = createMemoryEmailSender();
  const consoleQueue = createMemoryJobQueue();
  const consoleRunner = createMemoryJobRunner(consoleQueue);
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { queue: consoleQueue });
    await startConsoleJobs(consoleRunner, testConsole.services, null);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** Runs the worker until the invite has gone out, as the worker process would. */
  async function deliverInvite(organizationId: string, address: string): Promise<string> {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const worker = await startWorker({
      db: server.db,
      runner,
      queue,
      ...workerJobs({
        db: server.db,
        identity: server.identity,
        files: server.files,
        email,
        push: createMemoryPushSender(),
        appUrl: "https://app.example.in",
        webhookProviders: [],
        log: (line) => {
          throw new Error(`the worker reported: ${line}`);
        },
      }),
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await runner.runQueued();
        const invite = email.sent.find((message) => message.to.address === address);
        const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(invite?.text ?? "")?.[1];
        if (token) return token;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("the invite never went out");
    } finally {
      await worker.stop();
    }
  }

  it("onboards, bills, locks and purges an agency, each step where the spec puts it", async () => {
    const today = calendarDateIn(new Date(), "Asia/Kolkata");
    const code = `J${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const ownerEmail = `neha-${code.toLowerCase()}@example.test`;

    // A super admin puts a plan on sale; support onboards the agency on a 14-day trial.
    const plan = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.create",
        {
          key: `growth-${code.toLowerCase()}`,
          name: "Growth",
          monthlyPricePaise: 2_499_00,
          yearlyPricePaise: 24_990_00,
          seatLimit: 3,
          whatsappNumberLimit: 1,
          storageLimitBytes: 10_000_000_000,
          modules: ["crm", "quotes"],
        },
        superAdmin.jar,
      ),
    );
    const { organizationId } = await dataOf<OnboardedOrganization>(
      await consoleMutate(
        testConsole,
        "organizations.onboard",
        {
          name: "Sahyadri Treks",
          code,
          timeZone: "Asia/Kolkata",
          contactEmail: `hello-${code.toLowerCase()}@example.test`,
          profile: {
            legalName: profile.legalName,
            gstin: profile.gstin,
            gstStateCode: profile.gstStateCode,
            contactName: profile.contactName,
            contactPhone: profile.contactPhone,
          },
          owner: { name: "Neha Joshi", email: ownerEmail },
          subscription: {
            planId: plan.id,
            billingCycle: "monthly",
            trialEndsOn: addDays(today, 14),
            paidThrough: null,
          },
        },
        support.jar,
      ),
    );

    // The worker emails the invite; the Owner chooses a password from its link and signs in.
    const token = await deliverInvite(organizationId, ownerEmail);
    expect(
      (await postJson(server, "/api/auth/reset-password", { token, newPassword: "neha-chose-this-1" })).status,
    ).toBe(200);
    const owner = new CookieJar();
    expect((await signInByEmail(server, owner, ownerEmail, "neha-chose-this-1")).status).toBe(200);
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "trial",
      planName: "Growth",
      trialEndsOn: addDays(today, 14),
      limits: { seats: 3 },
    });
    await dataOf(await mutate(server, "profile.save", profile, owner));

    // Ten days after the trial's end it is read-only: the Owner may look, but not change anything.
    await server.platform.subscription.update({
      where: { organizationId },
      data: { trialEndsOn: new Date(Date.now() - 10 * DAY_MS), statusChangedAt: new Date(Date.now() - 30 * DAY_MS) },
    });
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe(
      "read_only",
    );
    expect((await query(server, "profile.get", owner)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "profile.save", profile, owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });

    // Support records the payment: active again, from the next request.
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        {
          organizationId,
          amountPaise: 2_499_00,
          paidOn: today,
          paidThrough: addDays(today, 30),
          reference: "NEFT UTR 412345678901",
        },
        support.jar,
      ),
    );
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe("active");
    await dataOf(await mutate(server, "profile.save", { ...profile, documentTerms: "50% advance" }, owner));

    // Leaving: export, cancel (the Owner can still see why), then the purge, which only a super admin asks for.
    await dataOf(
      await consoleMutate(testConsole, "dataProtection.exportOrganization", { organizationId }, superAdmin.jar),
    );
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.cancel",
        { organizationId, reason: "Closed the business" },
        support.jar,
      ),
    );
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe(
      "cancelled",
    );
    expect(await refusalOf(await query(server, "profile.get", owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_CANCELLED",
    });
    await dataOf<QueuedJob>(
      await consoleMutate(
        testConsole,
        "dataProtection.requestPurge",
        { organizationId, confirmation: code },
        superAdmin.jar,
      ),
    );
    expect(await consoleRunner.runQueued()).toBe(1);
    expect(consoleRunner.failed).toEqual([]);

    // Gone: the organization, its Owner and their sessions. The cookie cache may still vouch for the session for a
    // few minutes, but the membership is read from the database on every request. The platform log keeps what
    // happened, by id.
    expect(await server.platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await refusalOf(await query(server, "subscription.get", owner))).toEqual({
      status: 403,
      reason: "NOT_A_MEMBER",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    expect((await signInByEmail(server, new CookieJar(), ownerEmail, "neha-chose-this-1")).status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));
    const log = await dataOf<PlatformLogPage>(
      await consoleQuery(testConsole, "log.list", superAdmin.jar, { targetOrganizationId: organizationId }),
    );
    expect(log.entries.map((entry) => entry.action)).toEqual([
      "organization.purged",
      "organization.purge-requested",
      "organization.exported",
      "organization.onboarded",
    ]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd /Users/ak/personal/travel-crm/apps/api && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/platform-journey.test.ts`

Expected: PASS, 1 test in 1 file (apps/api). If it fails, the assertion that fails names the step.

- [ ] **Step 3: Use the shared body limit**

In `apps/api/src/app.ts`:

replace:
```ts
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { apiErrorHandler } from "./error-handler.js";
```
with:
```ts
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { apiErrorHandler } from "./error-handler.js";
```

replace:
```ts
const BODY_LIMIT = 64 * 1024;

/** Answers 413 as soon as a body passes maxSize bytes, before anything parses it. */
function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" }, 413),
  });
}
```
with:
```ts
const BODY_LIMIT = 64 * 1024;
```

- [ ] **Step 4: Document the platform for the next plans**

In `docs/adr/README.md`:

replace:
```markdown

| #                                         | Decision                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)                 | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                       |
| [0002](0002-row-level-security.md)        | How organization isolation is implemented in Postgres                                     |
| [0003](0003-repository-conventions.md)    | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate                |
| [0004](0004-soft-delete.md)               | Soft delete: hidden rows, refused hard deletes, partial unique indexes                    |
| [0005](0005-roles-and-permissions.md)     | Roles and permissions: our own tables, the catalog, starter roles, no escalation          |
| [0006](0006-identity-and-sessions.md)     | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor   |
| [0007](0007-removing-staff.md)            | Removing staff: soft-deleted membership, released email, sessions ended                   |
| [0008](0008-ports-and-adapters.md)        | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package        |
| [0009](0009-actors-and-domain-events.md)  | Actors, domain events and the outbox; what other modules may ask identity                 |
| [0010](0010-jobs-and-the-worker.md)       | Jobs and the worker: pg-boss in its own schema, the outbox relay, listeners at least once |
| [0011](0011-files-and-storage.md)         | Files and storage: presigned uploads and downloads, attachments, sensitive files          |
| [0012](0012-pdfs-and-issued-documents.md) | PDFs and issued documents: React-PDF in the worker, frozen content, rendered once         |
| [0013](0013-public-routes.md)             | Public routes: share links at `/p/<token>`, the webhook intake, rate limits in Postgres   |
| [0014](0014-notifications.md)             | Notifications: `notify()`, the bell, email through SMTP, web push, opt-outs               |
| [0015](0015-audit-log.md)                 | The audit log: append-only, in the change's transaction, impersonation recorded           |
| [0016](0016-money-tax-and-time.md)        | Money in integer paise, the tax engine and India GST, time zones, phone numbers           |
| [0017](0017-brand-package.md)             | The brand package: one source of truth, the product-name check, generated icons           |
```
with:
```markdown

| #                                            | Decision                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)                    | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                       |
| [0002](0002-row-level-security.md)           | How organization isolation is implemented in Postgres                                     |
| [0003](0003-repository-conventions.md)       | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate                |
| [0004](0004-soft-delete.md)                  | Soft delete: hidden rows, refused hard deletes, partial unique indexes                    |
| [0005](0005-roles-and-permissions.md)        | Roles and permissions: our own tables, the catalog, starter roles, no escalation          |
| [0006](0006-identity-and-sessions.md)        | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor   |
| [0007](0007-removing-staff.md)               | Removing staff: soft-deleted membership, released email, sessions ended                   |
| [0008](0008-ports-and-adapters.md)           | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package        |
| [0009](0009-actors-and-domain-events.md)     | Actors, domain events and the outbox; what other modules may ask identity                 |
| [0010](0010-jobs-and-the-worker.md)          | Jobs and the worker: pg-boss in its own schema, the outbox relay, listeners at least once |
| [0011](0011-files-and-storage.md)            | Files and storage: presigned uploads and downloads, attachments, sensitive files          |
| [0012](0012-pdfs-and-issued-documents.md)    | PDFs and issued documents: React-PDF in the worker, frozen content, rendered once         |
| [0013](0013-public-routes.md)                | Public routes: share links at `/p/<token>`, the webhook intake, rate limits in Postgres   |
| [0014](0014-notifications.md)                | Notifications: `notify()`, the bell, email through SMTP, web push, opt-outs               |
| [0015](0015-audit-log.md)                    | The audit log: append-only, in the change's transaction, impersonation recorded           |
| [0016](0016-money-tax-and-time.md)           | Money in integer paise, the tax engine and India GST, time zones, phone numbers           |
| [0017](0017-brand-package.md)                | The brand package: one source of truth, the product-name check, generated icons           |
| [0018](0018-platform-console.md)             | The platform console: its own process, the platform role's transactions, the platform log |
| [0019](0019-plans-and-subscriptions.md)      | Plans, subscriptions and payments as data, ready for Razorpay Subscriptions               |
| [0020](0020-lifecycle-and-request-checks.md) | The subscription lifecycle, computed on every request, and request checks 2 and 3         |
| [0021](0021-onboarding.md)                   | Onboarding in one transaction, the Owner's invite, and the nightly demo                   |
| [0022](0022-permanent-deletion.md)           | Permanent deletion: purging an organization, erasing one person or record                 |
| [0023](0023-business-profile.md)             | The organization's business profile and setup checklist                                   |
```

In `docs/adr/0018-platform-console.md`:

replace:
```markdown
adminUserId)`), not as the system.
- **The platform log.** `platform_audit_entry` records every console change and the platform's own jobs: who (or the
  system), the action, the target and the organization it concerns, and small before and after snapshots with the
  same checks as the organizations' log. It has no foreign key to `organization`, so it outlives a purge (spec 5:
```
with:
```markdown
adminUserId)`), not as the system.
- **The platform log.** `platform_audit_entry` records what belongs to no organization's own log (plans, the
  policy, retried jobs and removed schedules), what happens to an organization as a whole (onboarding, corrections,
  exports, purges, erasures) and the platform's own jobs: who (or the system), the action, the target and the
  organization it concerns, and small before and after snapshots with the
  same checks as the organizations' log. It has no foreign key to `organization`, so it outlives a purge (spec 5:
```

In `packages/domain/README.md`:

replace:
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
with:
```markdown

| Module          | What it holds                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel`        | building blocks every module uses: `Actor`, `DomainError`, money, GST, time ([README](src/kernel/README.md))                          |
| `identity`      | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md))                                                 |
| `jobs`          | domain events, the outbox relay, listeners and the worker ([README](src/jobs/README.md))                                              |
| `audit`         | the audit log ([README](src/audit/README.md))                                                                                         |
| `files`         | files attached to records, in object storage ([README](src/files/README.md))                                                          |
| `documents`     | numbered documents and their PDFs ([README](src/documents/README.md))                                                                 |
| `notifications` | `notify()`, the bell, email and push delivery ([README](src/notifications/README.md))                                                 |
| `share-links`   | links that open one record without signing in ([README](src/share-links/README.md))                                                   |
| `webhooks`      | the generic webhook intake ([README](src/webhooks/README.md))                                                                         |
| `rate-limits`   | limits on the public routes ([README](src/rate-limits/README.md))                                                                     |
| `subscriptions` | plans, each organization's subscription and payments, the lifecycle, request checks 2 and 3 ([README](src/subscriptions/README.md))   |
| `profile`       | an organization's business profile and setup checklist ([README](src/profile/README.md))                                              |
| `platform`      | the platform console's work across organizations: onboarding, deletion, the demo, the platform log ([README](src/platform/README.md)) |
```

In `packages/api/README.md`:

replace:
```markdown

`platformRouter` (`src/platform/platform-router.ts`) lists them: `whoAmI`, `log.list`.
```
with:
```markdown

`platformRouter` (`src/platform/platform-router.ts`) lists them, the routers in `src/platform/routers/`:

| Router           | Procedures                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| (top level)      | `whoAmI`                                                                                                                  |
| `dashboard`      | `organizations`: every organization's status, plan, days left, seats, storage and this month's use                        |
| `organizations`  | `onboard`, `get`, `update`, `resendInvite`                                                                                |
| `plans`          | `list`, `policy`; super admins: `create`, `update`, `archive`, `setPolicy`                                                |
| `subscriptions`  | `get`, `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`, `voidPayment`, `suspend`, `cancel` |
| `dataProtection` | super admins: `exportOrganization`, `requestPurge`, `exportSubject`, `requestErasure`                                     |
| `jobs`           | `failed`, `retry`, `schedules`; super admins: `unschedule`                                                                |
| `log`            | `list`: the platform log, newest first, or one organization's                                                             |
```

In `packages/domain/src/platform/README.md`:

replace:
```markdown
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes to an organization's data is recorded twice: in the platform log, and in that
  organization's audit log as `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too.
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
```
with:
```markdown
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes inside an organization is recorded in that organization's audit log as
  `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too; subscription changes are
  recorded only there (ADR 0019). Onboarding, corrections, exports, purges and erasures also go in the platform log,
  and so do changes that belong to no organization (plans, the policy, jobs).
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
```

In `CLAUDE.md`:

replace:
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
with:
```markdown

| Command                                        | What it does                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `pnpm install`                                 | install dependencies                                            |
| `pnpm db:up` / `pnpm db:down`                  | start / stop local Postgres (Docker)                            |
| `pnpm services:up`                             | start Postgres, MinIO (files) and Mailpit (email) locally       |
| `pnpm db:migrate`                              | apply migrations to local Postgres                              |
| `pnpm --filter @travel-crm/api-server dev`     | run the api on http://localhost:3001 (reads `.env`)             |
| `pnpm --filter @travel-crm/api-server worker`  | run the worker: outbox relay, listeners, jobs, schedules        |
| `pnpm --filter @travel-crm/api-server console` | run the platform console on http://localhost:3002, and its jobs |
| `pnpm format`                                  | format every file with Prettier                                 |
| `pnpm check`                                   | everything CI runs: typecheck, lint, tests, import rules        |
| `pnpm --filter @travel-crm/<package> test`     | one package's tests (most need Docker running)                  |
```

replace:
```markdown
  checks the keys, the unique constraints, and that every key to `organization` restricts deletion.
- Only the platform module uses `@travel-crm/db/platform` (it sees every organization).
- Better Auth's sign-in tables (user, session, account, verification, two_factor, organization, member, invitation) have no
```
with:
```markdown
  checks the keys, the unique constraints, and that every key to `organization` restricts deletion.
- Only the platform module uses `@travel-crm/db/platform` (it sees every organization), and only the console process
  holds `DATABASE_PLATFORM_URL`. Module code written for `forOrg()` runs there inside `asOrganization(tx, orgId, …)`,
  as the runtime role under row-level security; everything else in a platform transaction names its organization.
- Better Auth's sign-in tables (user, session, account, verification, two_factor, organization, member, invitation) have no
```

replace:
```markdown
  - `freshProcedure` (reads the session from the database) for money, roles, exports and staff management;
  - `platformProcedure` for platform staff;
  - `protectedProcedure` only for things every signed-in person may see about themselves (`me.get`).
```
with:
```markdown
  - `freshProcedure` (reads the session from the database) for money, roles, exports and staff management;
  - `staffProcedure` and `superAdminProcedure` (`packages/api/src/platform/procedures.ts`) for the console's routers,
    served apart at `/api/platform/trpc` by the console process;
  - `protectedProcedure` only for things every signed-in person may see about themselves (`me.get`).
```

replace:
```markdown
  Output schemas are `z.object`, which strips unknown keys.
- Permissions are `module:action` in `packages/domain/src/identity/permissions.ts`. Add new ones there; the Owner role
```
with:
```markdown
  Output schemas are `z.object`, which strips unknown keys.
- Request checks 2 and 3 (ADR 0020) run in every organization procedure: the subscription's state decides by what the
  call does (a query views, a mutation changes; mark an export `.meta({ lifecycle: "export" })`, and what every state
  must reach `.meta({ lifecycle: "always" })`), and each required permission's module must be on the plan.
- Permissions are `module:action` in `packages/domain/src/identity/permissions.ts`. Add new ones there; the Owner role
```

replace:
```markdown
  send JSON (`apps/api/src/trusted-origin.ts`); other `/api/auth/*` POSTs use Better Auth's own origin check. Better Auth's `/api/auth/organization/*` endpoints are closed (404):
  members and roles go through tRPC. Error responses carry no stack traces or internal messages.
- The api's settings are checked at start-up (`apps/api/src/environment.ts`). `NODE_ENV` defaults to `production`, which
```
with:
```markdown
  send JSON (`apps/api/src/trusted-origin.ts`); other `/api/auth/*` POSTs use Better Auth's own origin check. Better Auth's `/api/auth/organization/*` endpoints are closed (404):
  members and roles go through tRPC. So are its `/admin/*` endpoints, but support's `/admin/impersonate-user` and
  `/admin/stop-impersonating` (ADR 0018). Error responses carry no stack traces or internal messages.
- The api's settings are checked at start-up (`apps/api/src/environment.ts`). `NODE_ENV` defaults to `production`, which
```

replace:
```markdown

## Repo map
```
with:
```markdown

## Platform and subscriptions (spec 7; ADRs 0018-0023)

- **Plans are data** the console edits (prices in paise, seats, WhatsApp numbers, storage, modules); none is seeded.
  `planLimits` hands the plan's seats to identity and its storage to the files module.
- **The lifecycle is computed on every request** (`dueState`), so a late job never grants access; the worker's
  `subscriptions.advance-lifecycle` writes it down each night. Payments and cancelling are the console's.
- **Platform admins act in their own name:** `platformActor(organizationId, adminUserId)`, source `platform`, in the
  organization's audit log; what belongs to no organization goes in the platform log (`recordPlatformAudit`).
- **Permanent deletion** (spec 5) happens only in the console's jobs. A new organization table is purged with the rest
  (`deleteOrganizationRows` reads the catalog); a module that keeps files or personal data about a person or record
  adds its step to `packages/domain/src/platform/erasure.ts`.
- **The demo** is rebuilt every night by `resetDemoOrganization`; a module with sample data adds it there.

## Repo map
```

replace:
```markdown
- `apps/api`: the Hono server (health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at
  `/api/trpc`, share links at `/p`, webhooks at `/webhooks`) and, from the same image, the `worker` command.
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
```
with:
```markdown
- `apps/api`: the Hono server (health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at
  `/api/trpc`, share links at `/p`, webhooks at `/webhooks`) and, from the same image, the `worker` command and the
  `console` command (the platform console's tRPC at `/api/platform/trpc`, and the platform's jobs).
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
```

replace:
```markdown
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`, `jobs`, `files`, `documents`,
  `notifications`, `audit`, `share-links`, `webhooks`, `rate-limits`; listed in `packages/domain/README.md`).
  `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve
```
with:
```markdown
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`, `jobs`, `files`, `documents`,
  `notifications`, `audit`, `share-links`, `webhooks`, `rate-limits`, `subscriptions`, `profile`, `platform`; listed in
  `packages/domain/README.md`).
  `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve
```

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, with no stray stderr. Test counts: api-server=182 api=13 brand=21 contracts=81 db=219 domain=524 eslint-config=81 integrations=144 (1,265). If a container times out starting, rerun once.

```bash
cd /Users/ak/personal/travel-crm
git add CLAUDE.md apps/api/src/app.ts apps/api/test/platform-journey.test.ts docs/adr/0018-platform-console.md docs/adr/README.md packages/api/README.md packages/domain/README.md packages/domain/src/platform/README.md
git commit -m "test: follow one agency from onboarding to purge, and document the platform for the next plans"
```

---
## Open task: managing platform staff (requirements only)

This one task is given as requirements, not verified code: the planner's run could not write it. Ruling: the
controller writes it from these requirements at execution, as a task in this plan's style, and an implementer builds
it test-first after Task I3, on `foundation/04-platform`, with the full gate green. Until it lands, platform staff
exist only as the tests make them (a user with the `admin` or `super-admin` role, a password account and no
membership), and the console screens for it wait.

What it must do:
- **Who may do it.** Only a super admin (`superAdminProcedure`), through the console's own API at
  `/api/platform/trpc`. Better Auth's admin endpoints for users and roles stay closed over HTTP (Task A1).
- **Levels.** Support (Better Auth role `admin`) and super admin (`super-admin`), as Task 0.2 defines them; nobody
  else has a platform level.
- **Never a member.** A person who is, or ever was, a member of an organization can never become platform staff, as
  identity's plan 2 rule (`hasEverBeenMember`) already refuses through Better Auth.
- **New staff** get a temporary password and must replace it before the console lets them in (`staffProcedure`
  already refuses them with `CHANGE_PASSWORD`).
- **Removing or demoting an admin** ends their power at once: their own sessions are deleted when they are removed,
  and every session whose `impersonated_by` is that admin is deleted when they are removed or demoted, so an
  impersonation they started can't outlive their level (plan 2 deferred this here). The api's per-request
  impersonation check (Task S3) then refuses the next request at once.
- **The last super admin** can't be removed or demoted.
- **The first super admin** is made by a one-off command run with the console's environment, not over HTTP: it
  refuses when a super admin exists, and shows the temporary password once.
- **The record.** Every change is recorded in the platform log (`recordPlatformAudit`, target type `platform_staff`),
  with the level before and after and no secrets.
- **Tests** pin: a super admin adds support and support can sign in only after replacing the password; support is
  refused every change (`SUPER_ADMIN_ONLY`); a member, or a removed member, can't be made staff; demoting an admin
  deletes the impersonation sessions they started, and the impersonated member's next request is refused; the last
  super admin stays; the first-super-admin command refuses a second run.

Support's impersonation itself needs no API of ours: plan 5's console screens start and stop it through Better Auth's
`/admin/impersonate-user` and `/admin/stop-impersonating`, which Task A1 keeps open for active staff only.

## After the last task

Run the gate once more on `foundation/04-platform`:

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green, no stray stderr, 1,265 tests: api-server=182 api=13 brand=21 contracts=81 db=219 domain=524
eslint-config=81 integrations=144. Plan 3's head had 1,064 (api-server=142 api=4 brand=21 contracts=69 db=185
domain=421 eslint-config=81 integrations=141): plan 4 adds 201.

| Task | Tests after it |
| --- | --- |
| plan 3's head | 1,064 |
| 0.1, 0.2 | 1,082, 1,093 |
| S1, S2, S3 | 1,144, 1,164, 1,177 (on Task 0.2) |
| A1, A2, A3 | 1,095, 1,103, 1,110 (on Task 0.2) |
| D1, D2 | 1,106, 1,112 (on Task 0.2) |
| O1 | 1,104 (on Task 0.2) |
| M1 | 1,224 (1,093 and the four tracks' 84, 17, 19 and 11) |
| P1, P2, P3 | 1,232, 1,239, 1,244 |
| I1, I2, I3 | 1,250, 1,264, 1,265 |

Then merge `foundation/04-platform` into `main` the way plans 1-3 were merged, after review, and remove the track
worktrees (`git worktree remove ../travel-crm-04-<track>`).

**For the deploy checklist (plan 5).**
- One image, three services: `api`, `worker` and `console` (one instance, always running, for the nightly demo).
- `DATABASE_PLATFORM_URL` goes to the console service only. The hosted database needs `GRANT app_runtime TO
  app_platform WITH INHERIT FALSE, SET TRUE` when its roles are made.
- The load balancer routes `/api/platform/*` to the console; in development the web app's server rewrites it to
  `http://localhost:3002`. Everything else under `/api` stays with the api.
- No plan is seeded: the platform team creates plans in the console before onboarding anyone. The demo runs only
  when `DEMO_ORGANIZATION_CODE`, `DEMO_PLAN_KEY` and `DEMO_PASSWORD` are set, after its plan exists.

**What plan 5 builds on.** The console's screens over `PlatformRouter` (`dashboard`, `organizations`, `plans`,
`subscriptions`, `dataProtection`, `jobs`, `log`, `whoAmI`); the web app's past-due banner and refusals from
`subscription.get` and the reasons `ORGANIZATION_READ_ONLY`, `ORGANIZATION_SUSPENDED`, `ORGANIZATION_CANCELLED`,
`NO_SUBSCRIPTION` and `MODULE_NOT_ON_PLAN`; the setup checklist and business profile from `profile.*`; the invite
link `<APP_URL>/reset-password?token=<token>`, the reset page plan 3 already needs.

**Known limits, each recorded in an ADR.**
- A subscription change is recorded in the organization's audit log only (ADR 0019); the console has no viewer for an
  organization's log yet.
- A PDF render queued before a cancellation and running during the purge could store its file after the purge's
  storage pass (ADR 0022).
- Payments are entered by hand. Razorpay Subscriptions comes later, as a webhook provider through plan 3's intake,
  calling `recordPayment(…, { provider })` (ADR 0019).
- The demo has a profile and three staff; the CRM's sample leads, quotes and bookings come with those modules.
- The dashboard counts every organization in one transaction (four small queries each, a minute allowed): fine for
  hundreds of agencies, to revisit at thousands.

## Self-review

**1. Spec coverage.** Each requirement of spec section 7, and of the parts of sections 5, 6.5 and 9 this plan owns:

| Spec | Task |
| --- | --- |
| 7.1 the platform team creates an organization: name, GSTIN, state, contacts, code, plan and dates | P1 (`onboardOrganizationInput`), A2 (identity's steps), O1 (the profile), S1 (`startSubscription`) |
| 7.1 the Owner gets an email invite | A2 (the listener), I2 (the worker runs it), I3 (the journey) |
| 7.1 the setup checklist: branding, GST and bank details, invoice prefix, staff | O1, I1 (`profile.*`); the logo comes with plan 5's uploads, WhatsApp and lead import with their modules |
| 7.2 a plan's INR price, monthly or yearly; its limits; its modules | S1 |
| 7.2 a subscription per organization: plan, dates, status, overrides | S1 |
| 7.2 entitlements are plan plus overrides, checked on every request; overrides are feature flags | S2 (`entitlementsOf`: early modules count as the plan's), S3, I1 (seats and storage) |
| 7.3 the lifecycle's states and what each allows; 7 and 14 days as settings | S1 (the policy), S2, S3 |
| 7.3 a daily job moves states; a recorded payment returns to `active` | S2, I2 (the schedule), S1 (`recordPayment`) |
| 7.3 `cancelled`: data kept and locked until a super admin deletes it | S2, S3 (locked), P2 (the purge, super admins only) |
| 7.4 the console records amount, dates and status; Razorpay Subscriptions later updates the same record | S1 (payments with provider ids, idempotent per provider payment) |
| 7.4 one shared demo, reset nightly by a job | I2 |
| 7.4 the dashboard: status, days left, seats used, last activity, monthly usage | P3 |
| 5 permanent deletion through the console: export, typed confirmation, purge job, platform log; DPDP erasure | D1, D2, P2 |
| 6.5 check 2 (organization active) and check 3 (module on the plan) | S2, S3 |
| 9.1 failed jobs in a list in the console; the scheduled lifecycle and demo jobs | P3, I2 |
| Platform team: platform accounts | the open task (requirements, by ruling) |
| Support's impersonation, recorded in the organization's log | plan 2 and 3; A1 limits it to active staff, S3 ends it with its session |

The gap is the open task. One deliberate difference: spec 7.3's diagram draws "payment recorded" from `past_due`,
`read_only` and `suspended`; this plan lets a payment through a day from today make even a `cancelled` organization
active again, so a returning agency keeps its data and code (ADR 0019: a payment "from today on, makes the
organization active again", whatever its state). The purge's own look at the status (Task P2) keeps such an
organization if a purge was already queued. The owner is asked to confirm it.

**2. Placeholder scan.** The assembled plan was searched for "TBD", "TODO", "implement later", "fill in", "similar
to Task", "appropriate", "edge cases" and "etc.": none in any step. Every code step has its exact blocks; the only part
without code is the open task, marked as requirements by ruling.

**3. Type consistency.** Every full-file block and every replace/with pair was compared by script with the commit it
came from (no problems in any section), and every commit typechecks in the full gate, so names used across tasks
agree in the code. The Interfaces blocks were checked against the code's signatures; three were corrected while
writing (`exportedFiles` takes a `where` and a link lifetime, `forgetRecipient` takes `{ organizationId, userId }`,
`AuditedRecord` carries its organization). Rebuilding on plan 3's newest head changed four interfaces under the
plan, each now used as plan 3 defines it: `createServices(environment, log)`, `startProcess` instead of
`startedServices`, pg-boss's `log` instead of `onError`, and `ServerDependencies.log`.

**4. Review Focus.** Each of the five lines has its tests in the owning tasks, named there. Other failure modes
checked and found pinned: a GSTIN of another state (P1, "refuses a GSTIN of another state"; O1's contract test); a
provider's payment delivered twice (S1, "keeps payments positive, voided with a reason, and a provider's payment
once"); days missed by the nightly job (S2, "catches up every missed step"); organization staff reaching the console
(P1, "is out of reach of an organization's own staff"); platform staff with a temporary password (0.2,
`CHANGE_PASSWORD`); a session deleted under the console (0.2, "reads the session from the database"); a second relay
swallowing events (I2, the console's jobs leave every event for the worker); a purge queued before a payment (P2).
