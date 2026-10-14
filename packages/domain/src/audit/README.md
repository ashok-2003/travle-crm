# audit

The audit log (spec 9.5): who changed what in an organization, from where, and the state before and after.

## Public functions and values (`index.ts`)

- `recordAudit(tx, actor, { action, entityType, entityId, before?, after? })`: writes one entry in the change's own
  transaction, so the entry exists exactly when the change commits. The `actor` (an `Actor`, such as `MemberAccess`
  or `systemActor(organizationId)`) gives who acted, the source (`web`, `api`, `job`, `impersonation`) and the
  platform admin while support impersonates a member.
- `listAuditEntries(tx, input)`: the log newest first, a page at a time (`before` is the last id of the previous
  page), or one record's history (`entityType` with `entityId`). The API checks `audit:view` first.
- Types: `AuditChange`, `AuditSnapshot`. The contracts are in `@travel-crm/contracts/audit`.

## Events

None.

## Rules worth knowing

- Record in the same transaction as the change, and only when something changed.
- Snapshots are curated: the fields that changed, never a whole row. A key that looks like a secret (`password`,
  `secret`, `token`, `hash`) is refused before anything is written.
- `audit_entry` is append-only: `app_runtime` has no UPDATE or DELETE on it. An entry is recorded in the actor's own
  organization; an actor of another organization fails row-level security.
- `action` reads `<entity>.<what happened>` (`staff.removed`); `entityType` is a record kind in lower case
  (`member`, `role`, `organization`).
