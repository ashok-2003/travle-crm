# platform

The platform console's work across organizations (spec sections 5 and 7). It is the only module that uses
`@travel-crm/db/platform`, whose transactions see every organization; the console process is the only one that holds
`DATABASE_PLATFORM_URL` ([ADR 0019](../../../../docs/adr/0019-platform-console.md)).

## Public functions and values (`index.ts`)

- What the console runs on: `createPlatformServices(options)` (the platform role's pool beside the services the
  console shares with the api), and `checkPlatformConnection(platformDb)`, its start-up check: a platform transaction
  (the role is `app_platform`) with an empty step into an organization inside it (the role may switch to
  `app_runtime`), or `OrganizationStepRefusedError`, which names the grant a hosted database needs.
- Organizations: `onboardOrganization(services, staff, input)` (spec 7.1, one platform transaction: the
  organization, its roles, business profile, subscription and invited Owner), `resendInvite(services, staff,
{ organizationId, memberId })`, `getOrganization(services, organizationId)` (its row, profile and subscription with
  payments; the bank account by its last four digits), `updateOrganization(services, staff, input)` (name, time zone,
  contact email; never the code), `listOrganizationMembers(services, organizationId)` (its active members, oldest
  first, with their role, real email or none, whether they have a password yet and their last activity: whom support
  may impersonate, and an Owner a new invite may go to; `ORGANIZATION_NOT_FOUND` for none).
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
  and copies, then its whole folder (storage's `deletePrefix`); `expiredExportsSchedule(services)`
  (`SWEEP_EXPIRED_EXPORTS_QUEUE`, daily), which the console must schedule, runs it over every export due, for an
  export whose own job ran out of retries. `hasFreshExport(tx, organizationId, now)`: whether
  the organization has an export done in the last day and still kept, which a purge relies on; the
  `organization.exported` log entry stays after a withdrawal, so the log can't say this.
- Permanent deletion (spec 5), super admins only: `exportSubject(services, staff, { organizationId, subject })`
  (logged; an erasure needs one, and a purge an organization's fresh export, from the last day),
  `requestPurge(services, staff, { organizationId, confirmation })` (the code typed, the subscription cancelled) and
  `requestErasure(services, staff, { organizationId, subject, confirmation })` (a removed member, or a record that
  holds a person's data: an issued document is `KEPT_BY_LAW`, anything else not a person's `NOT_PERSONAL_DATA`), which
  queue `platform.purge-organization` and `platform.erase-subject` once the request is recorded; an erasure's job
  carries its `requestId`, so a repeat run only finishes the files. `purgeOrganization` and `eraseSubject`, the jobs,
  check again on the platform transaction: a purge is skipped as `organization.purge-skipped` (`not-cancelled`,
  `no-recent-export`), an erasure as `subject.erasure-skipped` (`organization-gone`, `no-recent-export`). An erasure
  also withdraws the organization's exports, and every import and export file of the organization (imports'
  `withdrawImportFiles` and exports' `withdrawExportFiles`, B55): the erased customer's or member's import rows lose
  their ids and fingerprints, and `subject.erased` logs `importsWithdrawn`, `exportsWithdrawn` and `bulkFiles`. A
  `person` record (one of the agency's customers, from a lead's address)
  is erasable: its subject export has a `customer` part (R39: the person and their leads, with the leads' files), and
  `subject.exported` logs `leads`; an export counts only for the very record type and id it was of. Its erasure runs
  `erase-customer.ts`: crm's `eraseCustomer`, then the leads' open tasks cancelled and every task title emptied, their
  notifications and their files, and `subject.erased` logs the `customer` counts. Stored files go after the commit,
  through the deletions' outbox:
  `DELETE_STORED_FILES_QUEUE` (`platform.delete-stored-files`) retries until it is empty, and
  `storedFileDeletionsSchedule(services)` (`SWEEP_STORED_FILES_QUEUE`, hourly), which the console must schedule,
  catches what no job will. `platformJobHandlers(services)`, for the console process's job runner.
- The bulk files (B53, B54): `bulkFilesSweepSchedule(services)` (`SWEEP_BULK_FILES_QUEUE`,
  `platform.sweep-bulk-files`, hourly at 17 past), which the console must schedule: `sweepBulkFiles(services, now)`
  takes imports a week past their last change and exports a day past ready (and any file stored late under an expired
  one), listing a page at a time (imports' `importsToSweep`, exports' `exportsToSweep`) and sweeping each in its own
  short platform transaction (`sweepImport`, `sweepExport`; one a job holds is skipped for the next hour). One that
  fails is left for the next run, and the run ends with `BulkFilesSweepFailedError` (counts only). Then it deletes each
  swept organization's queued files at once.
- The shared demo (spec 7.4): `resetDemoOrganization(services, { code, password }, now?)`, the console's nightly
  `RESET_DEMO_QUEUE` (`platform.reset-demo`) job: purges last night's demo (only an organization a reset built, as the
  platform log shows) and builds it again with its profile and three staff who sign in with the code (`demoStaff`),
  on the demo's own plan (the subscriptions module's `demoPlan`, never for sale), and its sample leads from crm's
  `addDemoLeads`. apps/api's `demo` command runs it once, at once.
- Plans and the policy: `listPlans(services, input)`, `createPlan`, `updatePlan`, `archivePlan(services, staff, …)`,
  `getSubscriptionPolicy(services)`, `setSubscriptionPolicy(services, staff, policy)`. Plans belong to no organization,
  so each change is recorded in the platform log.
- Platform staff (ADR 0019), super admins only: `listPlatformStaff(services)` (everyone with a level, and everyone
  removed, with `removedAt` from the log's `platform-staff.removed` entry), `addPlatformStaff(services, staff,
{ name, email, level })` and `resetPlatformStaffPassword(services, staff, { userId })` (each returns a temporary
  password, which nothing stores but as a hash), `setPlatformStaffLevel(services, staff, { userId, level })` and
  `removePlatformStaff(services, staff, { userId })`; `addFirstSuperAdmin(services, { name, email })`, the one-off
  command's. Each is one platform transaction: identity's write under its platform staff lock, and a log entry of ids
  and levels (target type `platform_staff`). An impersonation a removal or a reset ends gets a
  `support.impersonation-stopped` entry in its member's organization's log.
- `recordPlatformAudit(tx, actor, { action, targetType, targetId, targetOrganizationId?, before?, after? })`: writes
  one entry in the platform log, in the platform transaction that makes the change. `actor` is `{ userId }`, the
  platform admin, or `{ userId: null }` for the platform's own jobs.
- `listPlatformLog(tx, input)`: the log newest first, a page at a time, or one organization's entries.
- An organization's subscription: `getSubscription(services, organizationId)` (with its payments: the state due
  today beside what the nightly job last recorded, `recorded`, any manual suspension, and the price with CGST and
  SGST), and `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`, `voidPayment`,
  `suspend`, `liftSuspension` (super admins, which the console's procedure checks), `cancel`
  `(services, staff, input)`, each one platform transaction under the subscription's lock, recorded in the
  organization's own audit log and, when it changed something, in the platform log too (`billing-log.ts`). The
  nightly lifecycle job is the console's too (`apps/api/src/console-jobs.ts`).
- The dashboard (spec 7.4): `organizationsOverview(services, { limit, after? }, now?)`, every organization a page at
  a time (oldest first, the next page after the last one's id), with its status, plan, days to its next change, seats
  and storage against its limits, last activity, and this month's changes and documents. Each organization's counts
  take a short platform transaction of their own, so a page, not the whole list, is what one request waits for.
- Failed jobs (spec 9.1): `listFailedJobs(services, { limit, after?, queue? })` (newest first, a page at a time),
  `retryFailedJob(services, staff, { queue, jobId })` (one more attempt; never for the purge, the erasure or the
  export, which a super admin asks for again: `NOT_RETRYABLE`), `listSchedules(services)` and
  `removeSchedule(services, staff, queue)` (super admins; never a schedule the console registers itself:
  `SCHEDULE_IS_THE_CONSOLES`), through the `JobAdministration` port. pg-boss acts outside our transactions, so each
  retry and removal is recorded in the platform log first (`job.retried`, `schedule.removed`), in a transaction of its
  own, and a failure after it (`job.retry-failed`, `schedule.removal-failed`, with the reason or the error's names).
- Types: `PlatformActor`, `PlatformChange`. The contracts are in `@travel-crm/contracts/platform`.

## Events

None.

## Rules worth knowing

- A platform transaction (`PlatformTx`) has no organization: every query names the organization it means. Work that
  belongs to one organization (module code written for `db.forOrg()`) runs inside `asOrganization(tx, orgId, …)`,
  as `app_runtime` under row-level security, in the same transaction.
- A change a platform admin makes inside an organization is recorded in that organization's audit log as
  `platformActor(organizationId, adminUserId)` (source `platform`), so its staff see it too. Subscription changes are
  recorded there; every change platform staff make to a subscription or its billing also goes in the platform log,
  by ids, days and amounts, never a reason's or a reference's words, so a super admin can review them (ADR 0020).
  Onboarding, corrections, exports, purges and erasures also go in the platform log, and so do changes that belong
  to no organization (plans, the policy, jobs).
- The platform log is append-only even for the platform role, and the api and worker have no rights on it. Its entries
  hold ids and small facts, never secrets or personal data, so they can outlive the organization they name.
- An export is the platform's, not the organization's: `platform_export` has no `organization_id` and its parts are
  outside `organizations/<id>/`, so a purge, which deletes from every table with `organization_id` and the
  organization's own storage, leaves it, and the agency can still take its data, files and all, for the 7 days.
- What an export stores is counted (parts) or recorded (copies, `platform_export_file`) under its row's lock, and
  only while it is being written, so the expiry, which marks it expired first, finds everything to delete.
