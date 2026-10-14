# travel-crm

Subscription CRM and operations platform for Indian travel agencies. Each agency is an **organization**.
The design is in `docs/superpowers/specs/`, the build plans in `docs/superpowers/plans/`, and decisions in `docs/adr/`.

## Commands (always under Node 24)

Start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

| Command                                    | What it does                                             |
| ------------------------------------------ | -------------------------------------------------------- |
| `pnpm install`                             | install dependencies                                     |
| `pnpm db:up` / `pnpm db:down`              | start / stop local Postgres (Docker)                     |
| `pnpm db:migrate`                          | apply migrations to local Postgres                       |
| `pnpm --filter @travel-crm/api-server dev` | run the api on http://localhost:3001 (reads `.env`)      |
| `pnpm format`                              | format every file with Prettier                          |
| `pnpm check`                               | everything CI runs: typecheck, lint, tests, import rules |
| `pnpm --filter @travel-crm/<package> test` | one package's tests (most need Docker running)           |

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
  `@travel-crm/db/rate-limits`. dependency-cruiser keeps each entry point to its module.
- A foreign key between two organization tables includes `organization_id`, and so does every unique constraint on an
  organization table (except a primary key on `id`). Every organization table's `organization_id` refers to
  `organization` (`onDelete: Restrict, onUpdate: Restrict`), and no key to it cascades a deletion: a cascade runs as
  the table's owner, past row-level security and grants. The test suite checks all of these.
- Only the platform module uses `@travel-crm/db/platform` (it sees every organization).
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
  - `platformProcedure` for platform staff;
  - `protectedProcedure` only for things every signed-in person may see about themselves (`me.get`).
- Schemas come from `@travel-crm/contracts`: every input has a Zod schema, and every procedure that returns data has an
  output schema. Input schemas are `z.strictObject`, so unknown keys get a 400; never use `z.object` for inputs.
  Output schemas are `z.object`, which strips unknown keys.
- Permissions are `module:action` in `packages/domain/src/identity/permissions.ts`. Add new ones there; the Owner role
  gets them automatically. List queries for scoped views filter with `scopeFilter()` (own or all records).
- Domain modules are folders in `packages/domain/src`. Their public API is `index.ts`; other modules import only that.
  Business rule failures throw `DomainError` from `@travel-crm/domain/kernel`, which the API turns into an HTTP status
  (`domainErrorResponse` from `@travel-crm/api` does the same for plain HTTP routes).
- Over HTTP, tRPC requests and `/api/auth/sign-in/org`, other than GET/HEAD, must name a trusted origin and
  send JSON (`apps/api/src/trusted-origin.ts`); other `/api/auth/*` POSTs use Better Auth's own origin check. Better Auth's `/api/auth/organization/*` endpoints are closed (404):
  members and roles go through tRPC. Error responses carry no stack traces or internal messages.
- The api's settings are checked at start-up (`apps/api/src/environment.ts`). `NODE_ENV` defaults to `production`, which
  needs https, rate limiting and a strong secret; local development sets `NODE_ENV=development` (`.env.example` does).
- Whoever acts is an `Actor` (kernel): `MemberAccess` in requests, `systemActor(organizationId)` in the worker. Its
  `source` and `impersonatedBy` say whether support is impersonating the member.

## Repo map

- `apps/api`: the Hono server. Health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at `/api/trpc`.
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
- `packages/contracts`: Zod schemas for every API input and output.
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`).
  `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and `@travel-crm/integrations/<adapter>` each resolve
  to `src/<name>/index.ts`, so a new module needs no `package.json` change.
- `packages/integrations`: adapters to the outside world, each a port plus a real and an in-memory adapter.
- `packages/brand`: the product's name, colours, fonts and contacts (spec 10).
- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, soft delete, document numbers.
- `packages/tsconfig`, `packages/eslint-config`: shared settings (the ESLint config holds the raw-SQL guard).
