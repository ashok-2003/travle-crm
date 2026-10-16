# travel-crm

Subscription CRM and operations platform for Indian travel agencies. Each agency is an **organization**.
The design is in `docs/superpowers/specs/`, the build plans in `docs/superpowers/plans/`, and decisions in `docs/adr/`.

## Commands (always under Node 24)

Start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

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

## How we write code

- **Test first.** Write the failing test, watch it fail, then make it pass. "Done" means `pnpm check` is green.
- **Readable over clever.** Small single-purpose files (~200 lines is a smell), clear names, no abbreviations in public names.
  Each source file starts with a one-line comment saying what it is for. Comments explain _why_.
- **Strict TypeScript.** No `any`, no `!` non-null assertions, no ignored build errors.
- **Ports and adapters (ADR 0008).** Domain code never imports a vendor SDK. It takes a port from
  `@travel-crm/integrations/<adapter>` (`ObjectStorage`, `JobQueue`, …) as a parameter; the api and worker pass the real
  adapter, tests pass the in-memory one. Only `packages/integrations` imports pg-boss, the AWS SDK, nodemailer,
  web-push and React-PDF, and it imports nothing of ours but `@travel-crm/brand`.
- **The product's name, colours and contacts** come from `@travel-crm/brand`, never typed elsewhere.
- **Pinned versions.** Shared tool versions live in the `catalog:` in `pnpm-workspace.yaml`. Prisma is pinned to 7.10.0;
  npm's `latest` for `prisma` is an 8.0 release candidate. Never install "latest" without checking.
- **Commits.** Small, Conventional Commits (`feat(db): …`), enforced by commitlint. Git hooks format and lint staged files;
  never bypass them with `--no-verify`. Stage files by name; never `git add -A`, `git add .` or `git commit -a`
  (other agents may be editing at the same time). Never add a `Co-Authored-By` trailer. Never commit `.env` files or secrets.

## Data rules (non-negotiable)

- Organization data is read and written only inside `db.forOrg(orgId, tx => …)` from `@travel-crm/db`.
  Postgres row-level security then limits every query to that organization; with no organization set, queries see nothing.
- Every table with an `organization_id` column needs, in the migration that creates it:
  `SELECT app_enable_org_rls('<table_name>');`, plus a row-creating fixture in your module's file in
  `packages/db/test/org-table-fixtures/` (mark it `appendOnly` if the runtime role can't update or delete its rows).
  The test suite fails without both. See `packages/db/README.md` for the full recipe.
- Never call `forOrg()` inside another `forOrg()` (it throws `NestedForOrgError`): pass the outer `tx` down.
- Tables without `organization_id` (webhook events, rate-limit counters) have no row-level security. `OrgTx` hides
  their models and every transaction refuses them at run time; only their own modules reach them, inside
  `db.withoutOrg(tx => …)` (where every organization table shows no rows), through `@travel-crm/db/webhooks` and
  `@travel-crm/db/rate-limits`. dependency-cruiser keeps each entry point to its module, and ESLint flags raw SQL naming
  either table outside it (`rawSqlSelectorsAllowing` in `packages/domain/eslint.config.js`).
- A foreign key between two organization tables includes `organization_id`, and so does every unique constraint on an
  organization table (except a primary key on `id`). Every organization table's `organization_id` refers to
  `organization`: plan 3's keys, and every new one, are `ON DELETE RESTRICT ON UPDATE RESTRICT`
  (`onDelete: Restrict, onUpdate: Restrict`), because a cascade runs as the table's owner, past row-level security and
  grants. Plans 1 and 2's keys keep Prisma's `ON UPDATE CASCADE` (organization ids never change). The test suite
  checks the keys, the unique constraints, and that every key to `organization` restricts deletion.
- Only the platform module uses `@travel-crm/db/platform` (it sees every organization), and only the console process
  reads `DATABASE_PLATFORM_URL` (deploys give it to no other). Only the console's own code (`apps/api/src/console*.ts`,
  `packages/api/src/platform/`, served as `@travel-crm/api/platform`) imports `@travel-crm/domain/platform`, and
  nothing the api server or the worker runs reaches either (dependency-cruiser). Module code written for `forOrg()`
  runs there inside `asOrganization(tx, orgId, …)`, as the runtime role under row-level security: one step at a time
  per transaction, awaited, with nothing beside it. Everything else in a platform transaction names its organization.
- Better Auth's sign-in tables (user, session, account, verification, two_factor, organization, member, invitation) have no
  row-level security. Only `packages/domain/src/identity` reaches them, through `@travel-crm/db/identity`:
  - `OrgTx` hides the sign-in models;
  - ESLint flags a `$queryRaw`/`$executeRaw` that names a sign-in table anywhere outside the identity module;
  - queries on organization-owned models may not follow a relation to a sign-in model (today only `organization`)
    anywhere in any argument (`where`, `data`, `include`, upsert's `create` and `update`...): they throw
    `SignInRelationError`. A new relation from an organization table to a sign-in model must be added to
    `signInRelations` (`packages/db/src/sign-in-guard.ts`); a test reads the schema and fails until it is.
- Outside `packages/db`, never write SQL that sets `app.org_id` (`set_config`), changes the session (`SET`, `RESET`) or
  creates temporary tables, and never use `$executeRawUnsafe`/`$queryRawUnsafe`: on a pooled connection they outlive the
  transaction. ESLint catches `set_config`, `app.org_id`, `SET ROLE`, `SET SESSION AUTHORIZATION`, `RESET ALL`/`ROLE`,
  `CREATE TEMP` and the `*Unsafe` methods.
- Soft delete (ADR 0004): tables with `deleted_at`/`deleted_by` are listed in `softDeleteModels`. Delete by updating with
  `softDeleted(userId)`; reads skip deleted rows; `withDeleted(() => …)` shows them. Unique values among live rows use
  `@@unique([...], where: { deletedAt: null })`.
  `upsert()` is refused on soft-delete models, and `app_runtime` has no DELETE grant on their tables.
- IDs are UUID v7 (`@default(uuid(7)) @db.Uuid`). Money is never a float.
- Domain events (ADR 0009): `publishEvent(tx, { type, payload })` from `@travel-crm/domain/jobs`, in the same
  transaction as the change. Types read `<entity>.<what happened>`; payloads hold ids, never personal data.
  Listeners are built with `defineListener` and must be safe to run twice.
- Other modules never read the sign-in tables: they ask identity (`organizationProfile`, `memberContacts`).

## API and permission rules

- Every tRPC procedure is built from `packages/api/src/procedures.ts`:
  - `orgProcedure.requires("module:action")` for organization data;
  - `freshProcedure` (reads the session from the database) for money, roles, exports and staff management;
  - `staffProcedure` and `superAdminProcedure` (`packages/api/src/platform/procedures.ts`) for the console's routers,
    served apart at `/api/platform/trpc` by the console process;
  - `protectedProcedure` only for things every signed-in person may see about themselves (`me.get`).
- Schemas come from `@travel-crm/contracts`: every input has a Zod schema, and every procedure that returns data has an
  output schema. Input schemas are `z.strictObject`, so unknown keys get a 400; never use `z.object` for inputs.
  Output schemas are `z.object`, which strips unknown keys.
- Request checks 2 and 3 (ADR 0021) run in every organization procedure: the subscription's state decides by what the
  call does (a query views, a mutation changes; mark an export `.meta({ lifecycle: "export" })`, what takes someone's
  access away `.meta({ lifecycle: "revoke" })`, and what every state must reach `.meta({ lifecycle: "always" })`), and
  the procedure's plan module must be on the plan. `requires()` sets
  that module from its first permission, and checks every permission's; a procedure without one declares
  `.meta({ planModule: "core" })` or its business module. One that declares nothing refuses every call.
- Permissions are `module:action` in `packages/domain/src/identity/permissions.ts`. Add new ones there; the Owner role
  gets them automatically. A new permission module also needs its plan module in `request-rules.ts`. List queries for
  scoped views filter with `scopeFilter()` (own or all records).
- Domain modules are folders in `packages/domain/src`. Their public API is `index.ts`; other modules import only that.
  Business rule failures throw `DomainError` from `@travel-crm/domain/kernel`, which the API turns into an HTTP status.
  Plain HTTP routes answer in their own way (the share link's pages); an error nothing handled is logged by names and
  codes and answered generically (`apps/api/src/error-handler.ts`).
- Over HTTP, tRPC requests and `/api/auth/sign-in/org`, other than GET/HEAD, must name a trusted origin and
  send JSON (`apps/api/src/trusted-origin.ts`); other `/api/auth/*` POSTs use Better Auth's own origin check. Better Auth's `/api/auth/organization/*` endpoints are closed (404):
  members and roles go through tRPC. So are its `/admin/*` endpoints, but support's `/admin/impersonate-user` and
  `/admin/stop-impersonating` (ADR 0019). Error responses carry no stack traces or internal messages.
- The api's settings are checked at start-up (`apps/api/src/environment.ts`). `NODE_ENV` defaults to `production`, which
  needs https, rate limiting and a strong secret; local development sets `NODE_ENV=development` (`.env.example` does).
- Whoever acts is an `Actor` (kernel): `MemberAccess` in requests, `systemActor(organizationId)` in the worker. Its
  `source` and `impersonatedBy` say whether support is impersonating the member.

## Shared services (spec 9; ADRs 0008-0017)

- **Events and jobs:** publish with `publishEvent(tx, …)`; react with a listener (`defineListener`) registered in
  `apps/api/src/worker-jobs.ts`. Listeners run in the worker, at least once per event, in the event's organization: key
  their database writes on the event id, and make work outside the database safe to repeat. Scheduled jobs go in the
  same file, with a cron and a time zone.
- **Files:** `createFiles(...)` (`@travel-crm/domain/files`): presigned uploads and downloads, attachments on any
  record (every call names the record), `documents:view_sensitive` for sensitive files. Never stream file bytes
  through the api.
- **PDFs:** `issueDocument(tx, …)` numbers and freezes a document in the organization's time zone; the worker renders it
  once (`documents.render-pdf`).
- **Notifications:** `notify(tx, actor, …)` is the one way to tell people something (bell, email, push; opt-outs apply).
  A listener passes `sourceEventId`, so a repeat adds nothing.
- **Audit:** `recordAudit(tx, actor, …)` in the same transaction as the change, for every change staff make.
- **Money and time:** `Money` in integer paise, `indiaGst` for tax, `formatMoney` (₹12,50,000.00), times in UTC shown in
  the organization's zone (`formatDateTime`), departure dates as `CalendarDate`. Never floats, never local time.
- **Public routes** (`/p/<token>`, `/webhooks/<provider>`) are rate-limited; a new shared record type adds a resolver in
  `apps/api/src/share-link-resolvers.ts`, a new provider goes in `apps/api/src/webhook-providers.ts`.
- **Job data and errors** hold ids, never personal data: pg-boss's tables have no row-level security, and a failed
  job's error is shown to platform staff.

## Platform and subscriptions (spec 7; ADRs 0019-0024)

- **Plans are data** the console edits: tiers priced monthly, yearly or both, in paise before GST, with optional
  prices for extra seats, and sold only on the cycles they are priced for; seats, WhatsApp numbers, storage, modules.
  No migration seeds one, and the demo is on a plan of its own that is never for sale. `planLimits` hands the plan's
  seats (extra seats included) to identity and its storage to the files module. Seats and modules are race-free;
  the storage limit is not, by plan 3's choice (uploads in flight may overshoot it: it is a plan's limit, not a safety
  rule).
- **The lifecycle is computed on every request** (`dueState`), so a late job never grants access; the console's
  `subscriptions.advance-lifecycle` writes it down each night. Only the platform role writes subscriptions, under the
  row's lock: payments, cancelling and the nightly job are all the console's.
- **Platform admins act in their own name:** `platformActor(organizationId, adminUserId)`, source `platform`, in the
  organization's audit log; the platform log (`recordPlatformAudit`) holds what belongs to no organization and an
  organization's whole life: onboarded, exported, purged.
- **Platform staff** are managed by super admins in the console only (`platformStaff.*`): identity writes the level
  itself under one lock, never through Better Auth's admin API, and nobody who was ever a member gets one. The first
  super admin comes from `pnpm --filter @travel-crm/api-server run first-super-admin -- --email <e> --name <n>`.
- **Permanent deletion** (spec 5) happens only in the console's jobs. A new organization table is purged with the rest
  (`deleteOrganizationRows` reads the catalog); a module that keeps files or personal data about a person or record
  adds its step to `packages/domain/src/platform/erasure.ts`.
- **The demo** is rebuilt every night by `resetDemoOrganization`; a module with sample data adds it there. Locally,
  `pnpm --filter @travel-crm/api-server run demo` builds it at once.

## Repo map

- `apps/api`: the Hono server (health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at
  `/api/trpc`, share links at `/p`, webhooks at `/webhooks`) and, from the same image, the `worker` command and the
  `console` command (the platform console's tRPC at `/api/platform/trpc`, and the platform's jobs).
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
- `packages/contracts`: Zod schemas for every API input and output.
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`, `jobs`, `files`, `documents`,
  `notifications`, `audit`, `share-links`, `webhooks`, `rate-limits`, `subscriptions`, `profile`, `platform`; listed in
  `packages/domain/README.md`).
  `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve
  to `src/<name>/index.ts`, so a new module needs no `package.json` change.
- `packages/integrations`: adapters to the outside world, each a port plus a real and an in-memory adapter.
- `packages/brand`: the product's name, colours, fonts and contacts (spec 10).
- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, soft delete, document numbers.
- `packages/tsconfig`, `packages/eslint-config`: shared settings (the ESLint config holds the raw-SQL guard).

## The web app (`apps/web`, ADR 0018)

- `pnpm --filter @travel-crm/web dev` runs it on http://localhost:3000 with the api on :3001 (`/api/*` is rewritten to
  `API_ORIGIN`). `pnpm e2e` runs the journeys against a real api, Postgres, MinIO and Mailpit (Docker); once per
  machine, first run `pnpm --filter @travel-crm/web exec playwright install chromium`. `pnpm check` runs them too.
- It imports the api's types only (`import type { AppRouter }`); at run time just the brand, the contracts' schemas
  and the kernel's formatting. Data comes from tRPC hooks (`useTRPC()`); server-rendered HTML holds no organization
  data, because the service worker keeps pages for offline use.
- Colours come from the brand's tokens (`bg-canvas`, `text-status-bad-ink`, shadcn's `bg-primary`...), never a literal;
  a test refuses `#hex`, `rgb()` and Tailwind's palette. DESIGN.md holds the design rules; its palette must equal
  `brand.colours`.
- Every word on screen is a next-intl message in the feature's file in `src/i18n/messages/en-IN/`; a refusal shows the
  sentence for its reason (`errors.json`, `useErrorMessage()`).
- shadcn components: `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`, then the checks in
  `src/components/ui/README.md`.
- Never show a `.invalid` email, and never read people from Better Auth's `/get-session`: `me.get` says who is signed
  in. Hiding a button is a convenience; the api checks every call.
- A change's button asks `useWriteAccess(kind)` (`src/subscription/write-access.ts`, mirroring check 2) and, refused,
  is disabled with the hint as its description; taking access away is kind `"revoke"`, open while read-only (ADR 0026).
- A new `DomainError` reason needs its sentence in `errors.json`, a new audit action its sentence in `audit.json`
  (`actions.<entity>.<what happened>`), a new notification kind its entry in `src/notifications/preferences/kinds.ts`:
  a test fails otherwise.
- Files go from the browser straight to storage: `uploadFile()` (`src/files/upload.ts`) and the reusable
  `AttachmentsPanel`; the CSP allows `STORAGE_ORIGIN`, fixed at build time like `API_ORIGIN` and `CONSOLE_ORIGIN`.

## The platform console (`/console`, ADR 0025)

- A section of the web app: routes in `src/app/console/**`, code in `src/console/**`, which nothing else imports. It
  has its own query cache (memory only, never IndexedDB) and its own tRPC hooks (`useConsoleTRPC()`), typed by
  `type PlatformRouter` from `@travel-crm/api/platform` alone. `/api/platform/*` is rewritten to `CONSOLE_ORIGIN`
  (`http://localhost:3002` in development; the api's `console` command serves it) before `/api/*`.
- Platform staff sign in on the one sign-in page and land on `/console`; the step screens bring them back with
  `?next=`. They must use two-factor (`staffProcedure` refuses `SET_UP_TWO_FACTOR`), and the challenge never trusts the
  device on the way to the console.
- A console screen names its title as `"<screen>"` (the layout adds "· Console · <product>"), shows times in
  `PLATFORM_TIME_ZONE`, and checks `isSuperAdmin(useStaff())` only for convenience: the api refuses support.
- Journeys: `test/e2e/support/console.ts` gives `superAdmin` and `support` (two-factor on) and
  `signInToConsole(page, staff)`; the harness starts the api, the worker and the console process.
