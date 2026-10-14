# @travel-crm/db

The database layer: Prisma schema, migrations, and the rules that keep each organization's data apart.

## Using it

    import { createDatabase, nextDocumentNumber } from "@travel-crm/db";

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const db = createDatabase(url);   // must connect as the app_runtime role; forOrg() checks
    const number = await db.forOrg(orgId, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }));

Organization data is reachable only inside `db.forOrg()`. Postgres row-level security limits every query in that
transaction to `orgId`'s rows; outside it, queries see nothing. Only the platform console imports
`@travel-crm/db/platform`, which sees every organization.

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration: `pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing.

## Roles

| Role           | Used by          | Sees                                  |
| -------------- | ---------------- | ------------------------------------- |
| `app_migrator` | migrations       | everything (owns the tables)          |
| `app_runtime`  | api and worker   | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization                    |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
