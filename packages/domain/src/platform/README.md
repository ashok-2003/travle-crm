# platform

The platform console's work across organizations (spec sections 5 and 7). It is the only module that uses
`@travel-crm/db/platform`, whose transactions see every organization; the console process is the only one that holds
`DATABASE_PLATFORM_URL` ([ADR 0018](../../../../docs/adr/0018-platform-console.md)).

## Public functions and values (`index.ts`)

- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
  one entry in the platform log, in the platform transaction that makes the change. `actor` is `{ userId }`, the
  platform admin, or `{ userId: null }` for the platform's own jobs.
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.

## Events

None.

## Rules worth knowing

- A platform transaction (`PlatformTx`) has no organization: every query names the organization it means. Work that
  belongs to one organization (module code written for `db.forOrg()`) runs inside `asOrganization(tx, orgId, …)`,
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes to an organization's data is recorded twice: in the platform log, and in that
  organization's audit log as `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too.
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
  hold ids and small facts, never secrets or personal data, so they can outlive the organization they name.
