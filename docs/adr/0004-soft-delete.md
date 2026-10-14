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
- **Organization-owned models can't follow relations into the sign-in tables.** Every organization table has an
  `organization` relation, and from `Organization` an include reaches `member`, `user` and `account` (password hashes),
  none of which has row-level security. The client extension throws `SignInRelationError` for an `organization` key at
  any depth of `include`, `select`, `where`, `data` or `orderBy` on organization-owned models. Queries rooted at sign-in models, used by
  the identity module, are unrestricted.
- **The identity client checks its role once.** The first query, raw or model, verifies `current_user` is
  `app_runtime`; `IdentityDatabase.forOrg()` awaits the check before opening a transaction, so a small pool can't
  deadlock on it. A dropped connection during the check is retried; a wrong role fails every query.
- **Hiding `$*RawUnsafe` is only part of the raw-SQL story.** The type narrowing hides the raw-string methods; the
  ESLint guard (Task 1) covers tagged templates, flagging `set_config`, `app.org_id`, `SET ROLE`, `RESET` and
  `CREATE TEMP` outside `packages/db`.
- **Includes are not filtered.** `include: { member: true }` returns a deleted member. Query the soft-delete model
  itself when that matters.

## Consequences

- A removed person or a deleted role disappears from every read but stays for history and restoring.
- Permanent deletion (spec section 5: platform purge, DPDP erasure) needs raw SQL as the platform role: a deliberate
  step, designed with the platform console.
