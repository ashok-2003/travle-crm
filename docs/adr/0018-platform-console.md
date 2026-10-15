# 0018: The platform console: its own process, the platform role's transactions, the platform log

Date: 2026-10-16 · Status: accepted · Implements spec sections 4 (the `app_platform` role) and 7, with spec 5's
"audit record in the platform log"

## Decision

- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
  `createPlatformDatabase(url).transaction(tx => …)`: one transaction as `app_platform`, which sees every organization
  (its `platform_access` policy) and has the rights the api never gets: creating organizations, writing plans and
  subscriptions, purging. It checks it really is `app_platform` and, like `forOrg()`, can't be nested.
- **Stepping into one organization.** Inside a platform transaction, `asOrganization(tx, orgId, orgTx => …)` runs
  `SET LOCAL ROLE app_runtime` and sets `app.org_id`, so the code inside runs exactly as in `db.forOrg()`: row-level
  security limits it to that organization, new rows take its id, and only the runtime role's grants apply. Then it
  resets the role, even when the work failed. Onboarding, for example, creates the organization as `app_platform` and
  its roles and Owner through the identity module's own code, in one transaction. The platform role may switch to the
  runtime role without inheriting its rights (`GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE`); no
  role may switch to `app_platform`.
- **Platform admins act in their own name.** A change a platform admin makes to an organization's data is recorded in
  that organization's audit log with source `platform` and the admin as the actor (`platformActor(organizationId,
adminUserId)`), not as the system.
- **The platform log.** `platform_audit_entry` records every console change and the platform's own jobs: who (or the
  system), the action, the target and the organization it concerns, and small before and after snapshots with the
  same checks as the organizations' log. It has no foreign key to `organization`, so it outlives a purge (spec 5:
  "an audit record in the platform log"). It is append-only even for `app_platform`, and `app_runtime` has no rights on
  it.

## Context

- **Why switch roles instead of filtering by hand.** As `app_platform` nothing scopes a query: module code written for
  `forOrg()` that relies on row-level security (counting a table, a default `organization_id`) would read or write
  across organizations. Switching to `app_runtime` inside the transaction keeps one rule for all module code (it always
  runs under row-level security) and still lets platform-only writes share the transaction, so an onboarding that fails
  halfway leaves nothing behind.
- **Why `SET LOCAL`.** It ends with the transaction, so a pooled connection never carries the role over, the same
  reason `app.org_id` is transaction-local. ESLint keeps `SET ROLE` out of every package but `packages/db`.
- **Why `INHERIT FALSE`.** With inheritance the platform role would also hold the runtime role's grants (rate-limit
  counters, which it has no business with) and be subject to its policies; without it, the membership only allows the
  explicit switch.

## Consequences

- A hosted database needs the same `GRANT` when its roles are created (plan 5's deploy checklist); a local database
  bootstrapped before plan 4 needs it run once (`packages/db/README.md`).
- Everything a platform transaction does outside `asOrganization` must name its organization; reviewers check it.
