# 0004: Soft delete

Date: 2026-10-14 · Status: accepted · Implements spec section 5

## Decision

- Soft-deletable tables have `deleted_at` and `deleted_by`. Their models are listed in `softDeleteModels`
  (`packages/db/src/soft-delete.ts`): `Role` and `Member` so far.
- A Prisma client extension, on every client `@travel-crm/db` creates:
  - adds `deletedAt: null` to the `where` of finds, counts, aggregates, group-bys and updates, so deleted rows can't be
    seen or changed;
  - refuses `delete` and `deleteMany` with `HardDeleteError`, before any SQL is sent.
- Deleting is an update: `tx.role.update({ where: { id }, data: softDeleted(userId) })`.
- `withDeleted(() => …)` shows deleted rows to the queries inside it, for Trash screens and restoring.
- Values unique among live rows, such as role keys, use partial unique indexes:
  `@@unique([organizationId, key], where: { deletedAt: null })`, from Prisma's `partialIndexes` preview feature.

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
- **Includes are not filtered.** `include: { member: true }` returns a deleted member. Query the soft-delete model
  itself when that matters.

## Consequences

- A removed person or a deleted role disappears from every read but stays for history and restoring.
- Permanent deletion (spec section 5: platform purge, DPDP erasure) needs raw SQL as the platform role: a deliberate
  step, designed with the platform console.
