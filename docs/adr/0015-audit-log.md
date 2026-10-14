# 0015: The audit log

Date: 2026-10-15 · Status: accepted · Implements spec section 9.5, and closes the impersonation gap in ADR 0006

## Decision

- **One `audit_entry` table**, organization-owned under row-level security, with who acted (`actor_user_id`, null for
  the system), the source (`web`, `api`, `job`, `impersonation`), the platform admin while support impersonates
  (`impersonated_by`, set exactly when the source is `impersonation`), the action (`staff.removed`), the record
  (`entity_type`, `entity_id`) and JSON objects of the fields before and after. Checks hold each of these.
- **Append-only by grant.** `app_runtime` has no UPDATE, DELETE or TRUNCATE on the table, so neither the ORM, nested
  writes nor raw SQL can change or remove an entry. The isolation suite knows it as append-only. The platform role
  alone removes entries (a whole organization, or one person's records for erasure) and may update only `before` and
  `after`, to redact them; it can't change who did what or when.
- **Same transaction.** `recordAudit(tx, actor, change)` (`@travel-crm/domain/audit`) writes in the change's own
  transaction: the entry exists exactly when the change commits. It names the actor's organization explicitly, so an
  actor of another organization fails row-level security rather than being recorded here.
- **The actor says where a change came from.** `MemberAccess` is an `Actor` (ADR 0009); the request checks pass the
  session's `impersonatedBy`, so anything support does while impersonating a member is recorded with
  `source: "impersonation"` and the admin's id. Onboarding and the worker act as `systemActor(organizationId)`.
- **What identity records:** staff created, given another role, reset and removed; roles created, changed and
  deleted; the two-factor requirement changed; support's impersonation started and stopped (a Better Auth plugin's
  after hooks, only when the call succeeded, in the impersonated member's organization, the admin being both actor and
  impersonator). Changes that change nothing record nothing, and refused changes record nothing either: the entry is
  written last, after the locks and conditional writes of ADR 0007, so a change that loses a race (`STAFF_CHANGED`,
  `OWNER_ONLY` for the losing Owner) rolls back with its entry. The full list is in the identity module's README.
- **Snapshots are curated.** Callers pass the fields that changed, never a whole row, and `recordAudit` refuses any
  key that looks like a secret (`password`, `secret`, `token`, `hash`, `otp`, `credential`, `apiKey`, `privateKey`,
  `backupCodes`) or a side over 8192 bytes. Personal fields appear only in entries about that person's own record, and
  fields gated by a narrower permission are never recorded by value. Identity's staff entries hold ids, role keys and
  flags: no name, username or email address, and the member id leads to the user row, which erasure clears.
- **Reading:** `listAuditEntries(tx, input)`, newest first with a cursor, or one record's history. The API checks
  `audit:view` (Owner and Admin hold it); the router comes with the audit log viewer (plan 5).

## Context

- **Why grants, not a trigger.** A trigger that refuses updates can be dropped or bypassed by its owner; a missing
  grant can't be used by the runtime role at all, and the isolation suite proves it on every run.
- **Why no names or email addresses in staff entries.** The log is append-only and outlives the account: a removed
  person's email is released for reuse (ADR 0007), and a DPDP erasure request should not have to edit the audit log.
  The member id leads to the person while their user row exists; erasure clears the name there (ADR 0007).
- **Why record impersonation in an after hook.** Only Better Auth knows whether the call succeeded; the hook reads the
  new session's `impersonatedBy` on start, and the session being ended on stop. The start entry records when the
  session expires, so the log bounds an impersonation that lapses or ends by sign-out. If writing the start entry
  fails, the hook deletes the session it just created and the call fails, so no impersonation goes unrecorded. If
  writing the stop entry fails, the call fails but the session row is already gone: there is no stop entry, and the
  cookie cache (up to 5 minutes) may keep the session usable until it lapses; the start entry's expiry still bounds it.
- **Why the admin is the actor of start and stop.** They act in their own name there; during the impersonation the
  member is the actor and the admin is `impersonated_by`, which is what an organization's staff need to tell apart.

## Consequences

- Entries are kept as long as the organization. Plan 4's purge of a whole organization removes them with it, as the
  platform role, which deletes the `audit_entry` rows explicitly before the organization (the foreign key restricts);
  erasure of one person redacts their entries the same way. Nothing else can change or remove an entry.
- The key from `audit_entry` to `organization` is `ON DELETE RESTRICT ON UPDATE RESTRICT`, like every plan 3 table's,
  and never a cascade: Postgres runs a cascade as the table's owner, past row-level security and past the grants that
  keep the log append-only. For the same reason `actor_user_id` and `impersonated_by` have no foreign key to `user`: every key to `user`
  cascades, so deleting a user would delete or change entries.
- Every module that changes data calls `recordAudit` in its own transactions. A change no person made (a scheduled job)
  is recorded with `source: "job"` and no user.
- The `api` source is reserved for API clients, which arrive later.
