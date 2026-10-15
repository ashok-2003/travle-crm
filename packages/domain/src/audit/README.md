# audit

The audit log (spec 9.5): who changed what in an organization, from where, and the state before and after.

## Public functions and values (`index.ts`)

- `recordAudit(tx, actor, { action, entityType, entityId, before?, after? })`: writes one entry in the change's own
  transaction, so the entry exists exactly when the change commits. The `actor` (an `Actor`, such as `MemberAccess`,
  `systemActor(organizationId)` or `platformActor(organizationId, adminUserId)`) gives who acted, the source (`web`,
  `api`, `job`, `impersonation`, `platform`) and the platform admin while support impersonates a member.
- `assertAuditable({ action, before?, after? })`: the checks `recordAudit` makes before writing (the action's shape, no
  secrets, at most 8192 bytes a side), for the platform's own log.
- `listAuditEntries(tx, input)`: the log newest first, a page at a time (`before` is the last id of the previous
  page), or one record's history (`entityType` with `entityId`). The API checks `audit:view` first.
- Types: `AuditChange`, `AuditSnapshot`. The contracts are in `@travel-crm/contracts/audit`.

- `auditEntriesAbout(tx, { organizationId, entityType, entityId })`: every entry about one record, for an export.
- `redactAuditEntries(tx, record)`: the platform role's erasure (spec 5): replaces each entry's `before` and `after`
  with `{ "redacted": true }` (sides with no state stay null), keeping who did what and when. Returns how many changed;
  a second run changes none.
- `auditEntriesSince(tx, since)`: changes recorded since a time, a usage counter for the platform dashboard.

## Events

None.

## Rules worth knowing

- Record in the same transaction as the change, and only when something changed.
- Snapshots are curated: the fields that changed, never a whole row. A key that looks like a secret (a word such as
  `password`, `secret`, `token`, `hash`, `otp`, `credential`, or `apiKey`, `privateKey`, `backupCodes`) is refused
  before anything is written. Each side is held to 8192 bytes of JSON (`RangeError`); the database checks twice that.
- Personal fields (a name, an address, a phone number) appear only in entries about that person's own record. Other
  records refer to people by id. Erasure then redacts one person's entries and nothing else.
- Fields gated by a narrower permission (for example `documents:view_sensitive` or `money:view_margin`) are never
  recorded by value, because anyone with `audit:view` could read them. Record only that they changed.
- `audit_entry` is append-only: `app_runtime` has no UPDATE, DELETE or TRUNCATE on it. The platform role removes
  entries (a whole organization, or one person's records for erasure) and may update only `before` and `after`, to
  redact them, never who did what or when. An entry is recorded in the actor's own organization; an actor of another
  organization fails row-level security. Everything but the system acts as a user (`audit_entry_actor_named`).
- `action` reads `<entity>.<what happened>` (`staff.removed`); `entityType` is a record kind in lower case
  (`member`, `role`, `organization`).
