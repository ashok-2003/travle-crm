# 0019: The platform console: its own process, the platform role's transactions, the platform log

Date: 2026-10-16 · Status: accepted · Implements spec sections 4 (the `app_platform` role) and 7, with spec 5's
"audit record in the platform log"

## Decision

- **The console is its own process.** The api image gets a third command, `console`, beside the api and the worker. It
  serves the console's tRPC at `/api/platform/trpc` (`createConsoleApp`) and runs the platform's own jobs, and it is the
  only process that reads `DATABASE_PLATFORM_URL` (plan 2's rule; deploys give it to no other, though locally all three
  commands load the same `.env`, which sets it): the api and the worker never read it. The load balancer, and in
  development the web app's server, route `/api/platform/*` to it, so the browser still calls `/api` on the address it
  loaded the app from (spec 3) and cookies stay first-party. Platform staff sign in through the api's `/api/auth` like
  everyone else; the console reads the same session cookie, always from the database.
- **Two levels of platform staff.** Support (Better Auth role `admin`, as in plan 2) works with organizations:
  onboarding, subscriptions, impersonation, failed jobs. A super admin (role `super-admin`) also manages plans,
  platform staff and permanent deletion (spec 5: "a super-admin action"). Both have no membership, ever. The console's
  builders check them on every request: `staffProcedure` (either level, and no temporary password left to replace)
  and `superAdminProcedure`. On Better Auth's own endpoints support may only start an impersonation (its role grants
  `user: impersonate` alone); a super admin keeps the admin plugin's powers, which the side doors limit. Either level
  must first replace a temporary password: the console and the side doors both refuse until then (`CHANGE_PASSWORD`).
- **Better Auth's admin endpoints are closed over HTTP**, except starting and stopping support's impersonation
  (`/admin/impersonate-user`, `/admin/stop-impersonating`), which answer as before. Every other `/admin/*` path is a
  404 for everyone, platform staff included: the console has its own API, and some of those endpoints would skip our
  rules (`/admin/remove-user` deletes a user outright, past soft delete; `/admin/set-user-password` skips
  must-change-password). Server-side `auth.api.*` admin calls still run the same hook, so they need a platform admin's
  request headers; our own code makes none: identity writes platform staff's levels itself (below).
- **Managing platform staff** is a super admin's alone (`platformStaff.*`, all `superAdminProcedure`; support sees
  itself through `whoAmI`). Identity writes `user.role` in the console's platform transaction, beside the platform
  log's entry, never through Better Auth. Every change first takes one lock (`pg_advisory_xact_lock` on a fixed key)
  and checks everything after it, the acting super admin included, so changes take turns: two super admins demoting
  or removing each other leave one, and the last super admin can't be demoted or removed (`LAST_SUPER_ADMIN`).
  Every write checks `hasEverBeenMember`: a member, a removed one, or someone coming back by the address they had
  before their removal never gets a level (`EVER_A_MEMBER`).
  - **Adding** makes a user with no membership, a password account and `mustChangePassword`: the temporary password
    is in the response alone, never logged, emailed, stored in the log or carried by a job. A taken address is
    `STAFF_EMAIL_TAKEN`. A super admin can also set a new temporary password (`resetPassword`), which ends every
    session the person has; platform staff may also reset their own by email, like anyone.
  - **Demoting** a super admin to support keeps the impersonations they started: support may impersonate.
  - **Removing** clears the role (`describePlatformStaff` reads the role, not the ban), bans the user ("Removed from
    platform staff") and deletes their sessions and every session whose `impersonated_by` is them, in the same
    transaction: their next console call is a 401, and the api's per-request check refuses the impersonated member's
    next request. The user row stays, so the logs' ids still resolve, and so does its address: adding it again is
    `STAFF_EMAIL_TAKEN`. Restoring a removed person is a later feature.
  - **Two-factor is required of platform staff.** Plan 5B enforces it once the console's screens can set it up, as
    the step after a new password; the staff list shows `twoFactorEnabled` already, so nothing built now changes.
  - **The first super admin** comes from a one-off command run with the console's environment, never over HTTP:
    `first-super-admin -- --email <address> --name <name>`. It takes the same lock and refuses once any super admin
    exists, so two runs at once make one. It prints the temporary password to the operator's terminal (stdout), and
    nothing else: the one secret our processes print, since that terminal is where it must go.
  - **The record:** each change is a platform log entry (`platform-staff.added`, `.level-changed`, `.password-reset`,
    `.removed`; target type `platform_staff`, the person's user id), by the acting super admin (no one for the
    command), with the level before and after. Never a name, an address or a password.
- **Support impersonates only an organization's active staff**: a member who isn't removed or banned. Anyone else
  (someone who was never a member, a removed member, a banned one) is refused with `IMPERSONATION_TARGET_NOT_A_MEMBER`
  before a session exists, so every impersonation has an organization's audit log to be recorded in.
- **The platform role's transactions.** `@travel-crm/db/platform` gives the platform module
  `createPlatformDatabase(url).transaction(tx => …)`: one transaction as `app_platform`, which sees every organization
  (its `platform_access` policy) and has the rights the api never gets: creating organizations, writing plans and
  subscriptions, purging. It checks it really is `app_platform` and, like `forOrg()`, can't be nested.
- **Stepping into one organization.** Inside a platform transaction, `asOrganization(tx, orgId, orgTx => …)` runs
  `SET LOCAL ROLE app_runtime` and sets `app.org_id`, so the code inside runs as in `db.forOrg()`: row-level security
  limits it to that organization, new rows take its id, and only the runtime role's grants apply. Then it resets the
  role, even when the work failed. Onboarding, for example, creates the organization as `app_platform` and its roles
  and Owner through the identity module's own code, in one transaction. The platform role may switch to the runtime
  role without inheriting its rights (`GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE`); no role may
  switch to `app_platform`.
- **One step at a time per transaction.** A second step, inside the first or beside it (`Promise.all`), is refused
  before any SQL (`NestedForOrgError`), and so is any use of the platform transaction's own `tx` while a step is open
  (`OrganizationStepOpenError`). A step's transaction works only until its work settles: a query made in it but
  awaited later, or a helper begun in it and awaited outside, is refused (`OrganizationStepEndedError`). Queries are
  checked when they run, not only when they are made. A step that fails in the database leaves the transaction
  aborted: every later use, and the commit, throw `PlatformTransactionAbortedError` instead of Postgres's silent
  rollback.
- **Platform admins act in their own name.** A change a platform admin makes to an organization's data is recorded in
  that organization's audit log with source `platform` and the admin as the actor (`platformActor(organizationId,
adminUserId)`), not as the system.
- **The platform log.** `platform_audit_entry` records what belongs to no organization's own log (plans, the
  policy, retried jobs and removed schedules), what happens to an organization as a whole (onboarding, corrections,
  exports, purges, erasures, and support's billing changes: ADR 0020) and the platform's own jobs: who (or the
  system), the action, the target and the organization it concerns, and small before and after snapshots with the
  same checks as the organizations' log. It has no foreign key to `organization`, so it outlives a purge (spec 5:
  "an audit record in the platform log"). So it keeps ids and codes, never an organization's name: a sole
  proprietor's agency is often named after its owner, and a correction (`organization.updated`) records only
  `nameChanged`, as it records only whether there is a contact email; the organization's own log, purged with it,
  keeps the names. It is append-only even for `app_platform`, and `app_runtime` has no rights on it.

- **The console process runs the platform's own jobs** (purge, erasure, an organization's export and its expiry, the
  stored files' deletions and their hourly sweep, the exports' daily sweep, the nightly subscription lifecycle and
  demo reset), which need the platform role, with `startJobHandlers`: handlers and schedules only. It runs no
  listeners and no outbox relay; the worker's relay is the only one, since a relay that knew no listeners would mark
  every event relayed with nothing queued for it.
- **Failed jobs and schedules.** The console lists failed jobs, runs one again, and lists the schedules; a super admin
  removes a schedule whose job the code no longer has (ADR 0010), never one the console registers at every start
  (`SCHEDULE_IS_THE_CONSOLES`: it would only stop until the next start). It reaches pg-boss through the
  `JobAdministration` port (`@travel-crm/integrations/jobs`). pg-boss acts on its own connection, outside the
  platform's transactions, so each retry and removed schedule is recorded in the platform log first, in a transaction
  of its own, and a failure after it (`job.retry-failed`, `schedule.removal-failed`): nothing is done unlogged. Job
  data holds only ids, so the list shows nothing personal.

## Context

- **Why a separate process.** The api answers every organization's staff and the public routes; holding a connection
  that sees every organization there would turn any bug in it into a cross-organization leak. The console has a few
  users and a small surface, and can be locked down further (an IP allow-list at the load balancer) without touching
  the api. It costs one more service to deploy, from the same image.
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
- **Why our own writes for platform staff, under one lock.** Better Auth's `setRole` and `banUser` would need a
  platform admin's request headers to pass the side doors, and they know nothing of memberships or of the last super
  admin. A row lock can't guard "at least one super admin remains", which is about rows that may not exist yet (the
  first super admin) or that another change is about to alter; one advisory lock for every change to platform staff
  makes them take turns, and changes are rare enough that turns cost nothing.

## Consequences

- Deploying runs three services from one image: `api`, `worker` and `console` (one instance is plenty; it must stay
  up for the platform's scheduled jobs).
- A hosted database needs the same `GRANT` when its roles are created (plan 5's deploy checklist); a local database
  bootstrapped before plan 4 needs it run once (`packages/db/README.md`).
- Everything a platform transaction does outside `asOrganization` must name its organization; reviewers check it.
- Inside a step `session_user` is still `app_platform`, so SQL there that ran `RESET ROLE` or `SET ROLE app_platform`
  would see every organization. Only `packages/db` writes such SQL (the ESLint tripwire); inside `forOrg()` nothing can
  leave `app_runtime`.
- dependency-cruiser keeps `@travel-crm/domain/platform` to the console's own code (`apps/api/src/console*.ts`,
  `packages/api/src/platform/`) and tests, and `@travel-crm/api/platform`, the console's routers, to the console's own
  files, so the api and the worker never load the platform's code.
- Removed platform staff can't be restored yet: their address stays taken until a later feature brings them back.
  Two-factor for platform staff is required but not yet enforced (plan 5B).
