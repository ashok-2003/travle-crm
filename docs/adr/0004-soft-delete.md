# 0004: Soft delete

Date: 2026-10-14 · Status: accepted · Implements spec section 5

## Decision

- Soft-deletable tables have `deleted_at` and `deleted_by`. Their models are listed in `softDeleteModels`
  (`packages/db/src/soft-delete.ts`): `Role` and `Member` so far.
- A Prisma client extension, on every client `@travel-crm/db` creates:
  - adds `deletedAt: null` to the `where` of finds, counts, aggregates, group-bys and updates, so deleted rows can't be
    seen or changed;
  - refuses `delete` and `deleteMany` with `HardDeleteError`, and `upsert` with `SoftDeleteUpsertError`, before any
    SQL is sent (an upsert could update a deleted row and restore it);
  - the app's runtime role can't delete these rows: the ORM refuses, and Postgres has no DELETE grant on `role` and
    `member` for `app_runtime` (migration `runtime_cannot_delete_soft_deleted_rows`), so nested deletes and raw SQL fail
    too. Only the platform role's purge removes rows. Foreign-key cascades run with the table owner's rights and are
    unaffected.
- Deleting is an update: `tx.role.update({ where: { id }, data: softDeleted(userId) })`.
- `withDeleted(() => …)` shows deleted rows to the queries inside it, for Trash screens and restoring.
- Values unique among live rows, such as role names, use partial unique indexes:
  `@@unique([organizationId, name], where: { deletedAt: null })`, from Prisma's `partialIndexes` preview feature. A
  deleted role's name can be used again.
- Identifiers that other rows refer to without a foreign key are never reused, deleted or not. Role keys, which
  `member.role` holds, have a plain unique index.

## Context

- **Deletes are refused, not rewritten.** The spec says deletes become updates. A rewritten `delete()` could not record
  who deleted the row (`deleted_by`), and a query extension cannot switch to another operation without leaving the
  interactive transaction, and with it `db.forOrg()`'s organization. Refusing deletes and offering
  `softDeleted(userId)` keeps both.
- **`withDeleted()` uses AsyncLocalStorage.** The escape is scoped to one callback, works inside or around
  `db.forOrg()`, and changes no types at call sites.
- **Partial indexes come from Prisma, not hand-written SQL.** Plan 1's drift check (`prisma migrate diff`) would report
  an index Prisma doesn't know about. With the preview feature Prisma writes
  `CREATE UNIQUE INDEX … WHERE ("deleted_at" IS NULL)` itself and the drift check stays strict. If Prisma drops the
  feature, the indexes move to hand-written SQL and the drift check needs an exception.
- **Organization code can't reach the sign-in tables.** Every organization table has an `organization` relation, and
  from `Organization` an include reaches `member`, `user` and `account` (password hashes), none of which has row-level
  security. Three things keep organization code out:
  - `OrgTx` hides the sign-in models, so `tx.user` and the like don't exist outside the identity module.
  - The client extension throws `SignInRelationError` for a relation to a sign-in model (the names in
    `signInRelations`, today only `organization`) at any depth of any argument (`where`, `data`, `include`, `select`,
    `orderBy`, upsert's `create` and `update`, and whatever Prisma adds) on organization-owned models. A hand-picked
    list of arguments once missed upsert's `update`, which reached every member's role. It follows relations through
    Prisma's description of the models, so it skips the values of Json fields, where an `organization` key is data
    (except a Json field named like one of Prisma's arguments, such as `data`, which is walked so it can't hide a
    nested write). Any new relation from an organization table to a sign-in model must be added to
    `signInRelations`; `sign-in-relations.test.ts` reads the schema and fails until it is. Queries rooted at sign-in
    models, used by the identity module, are unrestricted.
  - ESLint flags a tagged `$queryRaw`/`$executeRaw` that names a sign-in table outside the identity module, because
    `OrgTx` keeps the raw-SQL methods.
- **The identity client checks its role once.** The first query, raw or model, verifies `current_user` is
  `app_runtime`; `IdentityDatabase.forOrg()` awaits the check before opening a transaction, so a small pool can't
  deadlock on it. A dropped connection during the check is retried; a wrong role fails every query.
- **Hiding `$*RawUnsafe` is only part of the raw-SQL story.** The type narrowing hides the raw-string methods; the
  ESLint guard (Task 1) covers tagged templates, flagging `set_config`, `app.org_id`, `SET ROLE`, `RESET` and
  `CREATE TEMP` outside `packages/db`, and SQL naming a sign-in table outside the identity module.
- **Includes are not filtered.** `include: { member: true }` returns a deleted member. Query the soft-delete model
  itself when that matters.

## Consequences

- A removed person or a deleted role disappears from every read but stays for history and restoring.
- Permanent deletion (spec section 5: platform purge, DPDP erasure) needs raw SQL as the platform role: a deliberate
  step, designed with the platform console.
