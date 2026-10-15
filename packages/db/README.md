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
- The tables without `organization_id` have no row-level security, so `OrgTx` and the identity module's client leave
  their models out, and every transaction and that client (its own transactions included; it refuses `$extends`)
  refuse them at run time (`UnscopedModelError`). Their own modules reach them inside `db.withoutOrg()`:
  `webhookEvents(tx)` from `@travel-crm/db/webhooks`, `rateLimitCounters(tx)` from `@travel-crm/db/rate-limits`.
  ESLint flags raw SQL naming either table outside its module.

## Entry points

| Import                                | For                         | Gives                                                                         |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `@travel-crm/db`                      | every module                | `createDatabase`, `OrgTx`, `nextDocumentNumber`, `softDeleted`, `withDeleted` |
| `@travel-crm/db/identity`             | the identity module only    | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only    | transactions that see every organization, and `asOrganization` inside them    |
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
   the table's rows (like `outbox_event`): the suite then expects those statements to be refused outright. When the
   role may update only some columns (granted by name, like `outbox_event.relayed_at`), name one as `updatableColumn`,
   so another organization's update is tested on it. The suite reads the grants and fails when that is missing.
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

## The platform role's transactions

`createPlatformDatabase(DATABASE_PLATFORM_URL).transaction(tx => …)` runs as `app_platform`, which sees and may change
every organization's rows: name the organization in every query. Inside such a transaction,
`asOrganization(tx, orgId, orgTx => …)` switches to `app_runtime` in one organization (`SET LOCAL ROLE`, then
`app.org_id`), so module code written for `db.forOrg()` runs unchanged under row-level security and the runtime role's
grants, in the same transaction as the platform's own writes ([ADR 0019](../../docs/adr/0019-platform-console.md)).
It returns to `app_platform` afterwards, even when its work failed, and can't be nested. One step at a time: nothing
may run beside it (no `Promise.all`), the platform `tx` itself is refused while a step is open, and a step's `orgTx`
is refused once its work settles (`OrganizationStepEndedError`). After a step fails in the database, the transaction
can't be used further or committed (`PlatformTransactionAbortedError`). The switch needs
`GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE` (in `sql/bootstrap.sql`); a local database made before
it needs that line run once as the `postgres` superuser:

    docker compose exec postgres psql -U postgres -d travel_crm -c "GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE"

Platform transactions also reach the tables without `organization_id` through their entry points
(`webhookEvents(tx)`); a transaction stepped into an organization does not.

The platform's own tables (`prisma/schema/platform.prisma`) have no `organization_id` and no row-level security, and
the runtime role has no rights on them: the platform log (`platform_audit_entry`), the deletions' outbox
(`stored_file_deletion`) and the organizations' exports (`platform_export`, with `platform_export_file` for the files
each copied). They name the organization they concern as `target_organization_id`, with no foreign key, so a purge's
catalog walk leaves them and they outlive it.

For permanent deletion (ADR 0023), `deleteOrganizationRows(tx, organizationId)` deletes the organization's rows in
every table that has `organization_id`, found from the catalog and ordered so no foreign key trips (`audit_entry`
first), then the organization; `organizationRows(tx, organizationId, { except })` returns them as JSON, by table (the
console's export no longer uses it: it reads a page at a time through the `app_export_organization_rows` function). A
new organization table is covered without being listed anywhere.
