# platform

The platform console's work across organizations (spec sections 5 and 7). It is the only module that uses
`@travel-crm/db/platform`, whose transactions see every organization; the console process is the only one that holds
`DATABASE_PLATFORM_URL` ([ADR 0018](../../../../docs/adr/0018-platform-console.md)).

## Public functions and values (`index.ts`)

- Organizations: `onboardOrganization(services, staff, input)` (spec 7.1, one platform transaction: the
  organization, its roles, business profile, subscription and invited Owner), `resendInvite(services, staff,
{ organizationId, memberId })`, `getOrganization(services, organizationId)` (its row, profile and subscription with
  payments; the bank account by its last four digits), `updateOrganization(services, staff, input)` (name, time zone,
  contact email; never the code).
- An organization's export (spec 5), super admins only, as a job: `requestOrganizationExport(services, staff,
organizationId)` records a `platform_export` row and queues `EXPORT_ORGANIZATION_QUEUE` (`platform.export-organization`),
  whose job, `runOrganizationExport(services, { exportId }, sizes?)`, reads every table a batch at a time (each batch
  its own transaction, inside `asOrganization`), stores JSON lines a part at a time under
  `platform/exports/<organizationId>/<exportId>/` and a copy of each file under its `files/` (storage's server-side
  `copy`), then logs `organization.exported`. Each attempt may run for two hours (`expireInSeconds`).
  `listOrganizationExports(services, organizationId)` and `downloadOrganizationExport(services, staff, exportId)`
  (15-minute links to its parts and its file copies, each download logged).
  `expireOrganizationExports(services, tx, organizationId, "erasure")`, in an erasure's platform transaction,
  withdraws the organization's exports (no download or writing from the commit). `EXPIRE_EXPORTS_QUEUE`'s job,
  `deleteExpiredExports(services, now?)`, expires those past their 7 days and deletes every expired export's parts
  and copies, then its whole folder (storage's `deletePrefix`). `hasFreshExport(tx, organizationId, now)`: whether
  the organization has an export done in the last day and still kept, which a purge relies on; the
  `organization.exported` log entry stays after a withdrawal, so the log can't say this.
- Permanent deletion (spec 5), super admins only: `exportSubject(services, staff, { organizationId, subject })`
  (logged; an erasure needs one, and a purge an organization's export, from the last day),
  `requestPurge(services, staff, { organizationId, confirmation })` (the code typed, the subscription
  cancelled) and `requestErasure(services, staff, { organizationId, subject, confirmation })` (a removed member or one
  record), which queue `platform.purge-organization` and `platform.erase-subject`; `purgeOrganization` (which keeps
  an organization no longer cancelled, as `organization.purge-skipped`) and `eraseSubject`, the jobs;
  `platformJobHandlers(services)`, for the console process's job runner.
- The shared demo (spec 7.4): `resetDemoOrganization(services, { code, planKey, password }, now?)`, the console's
  nightly `RESET_DEMO_QUEUE` (`platform.reset-demo`) job: purges last night's demo (only an organization a reset built,
  as the platform log shows) and builds it again with its profile and three staff who sign in with the code.
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
  `getSubscriptionPolicy(services)`, `setSubscriptionPolicy(services, staff, policy)`. Plans belong to no organization,
  so each change is recorded in the platform log.
- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
  one entry in the platform log, in the platform transaction that makes the change. `actor` is `{ userId }`, the
  platform admin, or `{ userId: null }` for the platform's own jobs.
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- An organization's subscription: `getSubscription(services, organizationId)` (with its payments), and
  `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`, `voidPayment`, `suspend`, `cancel`
  `(services, staff, input)`, each one platform transaction, recorded in the organization's own audit log.
- The dashboard (spec 7.4): `organizationsOverview(services, now?)`, every organization with its status, plan, days
  to its next change, seats and storage against its limits, last activity, and this month's changes and documents.
- Failed jobs (spec 9.1): `listFailedJobs(services, { limit, after?, queue? })` (newest first, a page at a time),
  `retryFailedJob(services, staff, { queue, jobId })` (one more attempt; never for the purge, the erasure or the
  export, which a super admin asks for again: `NOT_RETRYABLE`), `listSchedules(services)` and
  `removeSchedule(services, staff, queue)` (super admins), through the `JobAdministration` port. Each retry and removed
  schedule is recorded in the platform log.
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.

## Events

None.

## Rules worth knowing

- A platform transaction (`PlatformTx`) has no organization: every query names the organization it means. Work that
  belongs to one organization (module code written for `db.forOrg()`) runs inside `asOrganization(tx, orgId, …)`,
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes inside an organization is recorded in that organization's audit log as
  `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too; subscription changes are
  recorded only there (ADR 0019). Onboarding, corrections, exports, purges and erasures also go in the platform log,
  and so do changes that belong to no organization (plans, the policy, jobs).
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
  hold ids and small facts, never secrets or personal data, so they can outlive the organization they name.
- An export is the platform's, not the organization's: `platform_export` has no `organization_id` and its parts are
  outside `organizations/<id>/`, so a purge, which deletes from every table with `organization_id` and the
  organization's own storage, leaves it, and the agency can still take its data, files and all, for the 7 days.
- What an export stores is counted (parts) or recorded (copies, `platform_export_file`) under its row's lock, and
  only while it is being written, so the expiry, which marks it expired first, finds everything to delete.
