# @travel-crm/db

The database layer: Prisma schema, migrations, and the rules that keep each organization's data apart.

## Using it

    import { createDatabase, nextDocumentNumber } from "@travel-crm/db";

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const db = createDatabase(url);   // must connect as the app_runtime role; forOrg() checks
    const number = await db.forOrg(orgId, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }));

Organization data is reachable only inside `db.forOrg()`. Postgres row-level security limits every query in that
transaction to `orgId`'s rows; outside it, queries see nothing.

- `db.forOrg(orgId, fn, { timeout, maxWait })` passes Prisma's transaction limits through (defaults: 5 s to run, 2 s to
  wait for a connection). Work past the timeout is rolled back.
- Never call `forOrg()` inside another `forOrg()`. It throws `NestedForOrgError`, because the inner transaction would run
  on a second connection that can't see the outer one's writes. Pass the outer `tx` down instead.
- `db.withoutOrg(fn)` runs a transaction with no organization, for the few tables without `organization_id` (webhook
  events, rate-limit counters) and database functions that look across organizations without revealing rows.
  Organization tables show no rows and refuse writes in it. It can't be nested either.
- The tables without `organization_id` have no row-level security, so `OrgTx` leaves their models out and every
  transaction refuses them at run time (`UnscopedModelError`). Their own modules reach them inside `db.withoutOrg()`:
  `webhookEvents(tx)` from `@travel-crm/db/webhooks`, `rateLimitCounters(tx)` from `@travel-crm/db/rate-limits`.

## Entry points

| Import                                | For                         | Gives                                                                         |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `@travel-crm/db`                      | every module                | `createDatabase`, `OrgTx`, `nextDocumentNumber`, `softDeleted`, `withDeleted` |
| `@travel-crm/db/identity`             | the identity module only    | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only    | a client that sees every organization                                         |
| `@travel-crm/db/webhooks`             | the webhooks module only    | `webhookEvents(tx)`: the `webhook_event` table, in `db.withoutOrg()`          |
| `@travel-crm/db/rate-limits`          | the rate-limits module only | `rateLimitCounters(tx)`: the `rate_limit_counter` table, in `db.withoutOrg()` |
| `@travel-crm/db/testing`              | tests only                  | `createTestOrganization`, the `DbUrls` type                                   |
| `@travel-crm/db/testing/global-setup` | other packages' Vitest      | the throwaway Postgres; `inject("dbUrls")` in tests                           |

dependency-cruiser enforces the "only" column. Another package's `vitest.config.ts` uses the test database like this:

    globalSetup: [createRequire(import.meta.url).resolve("@travel-crm/db/testing/global-setup")],

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration from the schema change alone, without a database. Save the schema as it was
   (`before=$(mktemp -d) && git archive HEAD prisma/schema | tar -x -C "$before"`, run in `packages/db`), make a
   folder `prisma/migrations/<timestamp>_<change>/`, then:
   `pnpm exec prisma migrate diff --from-schema "$before/prisma/schema" --to-schema prisma/schema --script --output prisma/migrations/<timestamp>_<change>/migration.sql`.
   Use `--output`, never shell redirection: Prisma prints "Loaded Prisma config…" to stderr, which would land in the file.
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Regenerate the client: `pnpm --filter @travel-crm/db generate`. The tests apply the migrations to a throwaway
   database and fail if the schema and migrations disagree. Never run `prisma migrate dev` or reset a shared database.
5. Add a row-creating fixture for the table to your module's file in `test/org-table-fixtures/` (one file per module,
   gathered by `test/org-table-fixtures.ts`). Mark it `appendOnly: true` when the runtime role can't update or delete
   the table's rows (like `outbox_event`): the suite then expects those statements to be refused outright.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing. Keys are checked too:

- A foreign key to another organization table includes `organization_id`:
  `@relation(fields: [organizationId, otherId], references: [organizationId, id])`.
- A unique constraint includes `organization_id`, e.g. `@@unique([organizationId, key])`, so one organization can't learn
  that another uses a value. Only a primary key on `id` alone is exempt.
- `organization_id` refers to `organization`, and never cascades an organization's deletion:
  `@relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Restrict)`. Postgres runs a
  cascade as the table's owner, past row-level security and past grants such as `audit_entry`'s.

## Soft delete

Rows of soft-delete models are never removed by the app (ADR 0004). To make a model soft-deletable:

1. Give it `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)` and `deletedBy String? @map("deleted_by") @db.Uuid`.
2. Add its model name to `softDeleteModels` in `src/soft-delete.ts`.
3. Make unique values ignore deleted rows: `@@unique([organizationId, name], where: { deletedAt: null })`.

`app_runtime` has no DELETE grant on these tables, and `upsert()` throws `SoftDeleteUpsertError`. Queries on
organization-owned models throw `SignInRelationError` if they use a relation named in `signInRelations` (today only
`organization`) at any depth of any argument (`where`, `data`, `include`, upsert's `create` and `update`...),
because that path leads to the sign-in tables; only `@travel-crm/db/identity` code starts from those. A new relation
from an organization table to a sign-in model must be added to `signInRelations` in `src/sign-in-guard.ts`;
`test/sign-in-relations.test.ts` fails until it is.

Delete with `tx.thing.update({ where: { id }, data: softDeleted(userId) })`. Reads and updates skip deleted rows;
`delete()` throws `HardDeleteError`. `withDeleted(() => …)` shows deleted rows for Trash screens and restoring.
Any module may call `withDeleted`: it is a view switch, not a permission, so who may see or restore deleted rows is
checked by the caller, like any other permission.

## Roles

| Role           | Used by          | Sees                                  |
| -------------- | ---------------- | ------------------------------------- |
| `app_migrator` | migrations       | everything (owns the tables)          |
| `app_runtime`  | api and worker   | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization                    |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
