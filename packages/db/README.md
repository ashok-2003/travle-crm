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

## Entry points

| Import                                | For                      | Gives                                                                         |
| ------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `@travel-crm/db`                      | every module             | `createDatabase`, `OrgTx`, `nextDocumentNumber`, `softDeleted`, `withDeleted` |
| `@travel-crm/db/identity`             | the identity module only | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only | a client that sees every organization                                         |
| `@travel-crm/db/testing`              | tests only               | `createTestOrganization`, the `DbUrls` type                                   |
| `@travel-crm/db/testing/global-setup` | other packages' Vitest   | the throwaway Postgres; `inject("dbUrls")` in tests                           |

dependency-cruiser enforces the "only" column. Another package's `vitest.config.ts` uses the test database like this:

    globalSetup: [createRequire(import.meta.url).resolve("@travel-crm/db/testing/global-setup")],

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration: `pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing. A foreign key to another organization table must
include `organization_id` (`@relation(fields: [organizationId, otherId], references: [organizationId, id])`).

## Soft delete

Rows of soft-delete models are never removed (ADR 0004). To make a model soft-deletable:

1. Give it `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)` and `deletedBy String? @map("deleted_by") @db.Uuid`.
2. Add its model name to `softDeleteModels` in `src/soft-delete.ts`.
3. Make unique values ignore deleted rows: `@@unique([organizationId, name], where: { deletedAt: null })`.

Delete with `tx.thing.update({ where: { id }, data: softDeleted(userId) })`. Reads and updates skip deleted rows;
`delete()` throws `HardDeleteError`. `withDeleted(() => …)` shows deleted rows for Trash screens and restoring.

## Roles

| Role           | Used by          | Sees                                  |
| -------------- | ---------------- | ------------------------------------- |
| `app_migrator` | migrations       | everything (owns the tables)          |
| `app_runtime`  | api and worker   | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization                    |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
