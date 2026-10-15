# 0021: The subscription lifecycle, and request checks 2 and 3

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.3 and 6.5 (checks 2 and 3), and the owner's pricing
for 7.2 (amending ADR 0020)

## Decision

- **The lifecycle is rules on calendar days.** A trial or a paid period ends; the next day the organization is past
  due; after the policy's past-due days (7) it is read-only; after its read-only days (14) suspended. A person cancels,
  and a person ends a suspension or a cancellation, by recording a payment or giving time (ADR 0020). The days count
  in the organization's time zone, from the day each state was due. The policy is one row, `subscription_policy`,
  which super admins change in the console (Q3); it also holds the trial's length (7 days, today the first), which
  onboarding uses when it is given no last day.
- **Every rule and screen uses the state due today; the nightly job records it.** `subscriptionToday` reads the
  subscription, its plan and the policy, and follows the lifecycle from what was recorded up to today. The request
  checks, the console's decisions (whether a trial can be moved, what a payment does) and what the console shows all
  use it, never the stored status, so whether the job has run changes no answer. The console's `subscriptions.get`
  shows both: `status` (today) and `recorded`. A console change writes the state due today with its own change.
- **The job runs in the console process, as the platform role.** `advanceSubscriptions` is scheduled at 00:15 India
  time by the console (`subscriptions.advance-lifecycle`), not the worker. For each subscription the lifecycle can still
  move, in its own platform transaction, it locks the row, recomputes from the row as held, and writes the change with
  `subscription.status-changed` by the system. An organization that fails is logged by id (the console's log, names
  and codes only), the others still run, and then the job fails with one `LifecycleJobError` naming them, so pg-boss
  records and retries it and the failed-jobs list shows it; a rerun finds nothing more to do.
- **Every change takes the same lock first.** The console's changes, payments and voids, and the job all begin with
  `SELECT … FOR NO KEY UPDATE` on the subscription row, then read it. So a payment and the job never interleave:
  whichever comes second waits, then reads what the first wrote. `FOR NO KEY UPDATE`, not `FOR UPDATE`, because a
  payment's insert takes `KEY SHARE` on the row through its foreign key, which a full lock would wait on (and, with the
  locks taken in the other order, deadlock with). `lockSubscription` offers the same lock to other platform work (a
  purge's last look).
- **Only the platform role writes a subscription.** `app_runtime` keeps `SELECT` for its request checks and has no
  `UPDATE` at all, so no api or worker query, nor injected SQL, can give an organization access. The table also checks
  that active means paid through a day (`subscription_active_paid`), as a trial has its last day
  (`subscription_trial_dated`): neither state can last for ever by mistake.
- **A suspension made by hand is its own mark.** Platform staff suspend an organization at once, whatever it has
  paid (`manual_suspension_at`, `_by`, `_reason`). While it is set the organization is suspended (unless cancelled,
  which is further still), and no payment clears it; only a super admin lifts it (`subscriptions.liftSuspension`),
  recorded as `subscription.suspension-lifted`. A payment's own day decides whether it revives an organization, so a
  payment for an older period never does, even where the subscription was paid ahead.
- **Check 2, the organization active**, by what a call does: trial, active and past due allow everything; read-only
  allows views and exports but no changes (`ORGANIZATION_READ_ONLY`); suspended allows only the Owner's exports
  (`ORGANIZATION_SUSPENDED`); cancelled allows nothing (`ORGANIZATION_CANCELLED`); an organization without a
  subscription nothing either (`NO_SUBSCRIPTION`). Calls every state allows (`me.get`, `subscription.get`) let the app
  say why; `subscription.get` refuses an organization without a subscription with the same `NO_SUBSCRIPTION`. All of
  these are `FORBIDDEN`.
- **Revoking access is always possible, because security outranks billing.** Read-only allows it to anyone with the
  permission, and suspended to the Owner, like an export: removing staff (`staff.remove`), a new temporary password
  (`staff.resetPassword`, which signs the person out everywhere), and requiring two-factor
  (`settings.setTwoFactorRequirement` turning it on). Nothing else: turning two-factor off loosens sign-in, and a role
  change (`staff.updateRole`) may give as well as take, so both stay changes. Read-only is "view and export, no new
  records" (spec 7.3), and taking a departed employee's access away is no new record: an agency, as the data
  fiduciary, must be able to cut someone off whatever it has paid, rather than wait out its read-only days with
  them still able to look.
- **Check 3, the module on the plan, for every procedure.** Each procedure declares the plan module it belongs to in
  its meta (`planModule`), or `"core"` for the Foundation's own features. `requires()` declares it from the first
  permission's module, as plan 2 arranged (`leads` belongs to `crm`, `quotes` to `quotes`, and so on, while `staff`,
  `roles`, `settings`, `audit`, `money` and `documents` are core), and also checks every required permission's module.
  A module neither on the plan nor switched on early fails with `FEATURE_LOCKED` (`MODULE_NOT_ON_PLAN`). An
  organization procedure that declares nothing refuses every call (a 500), and a test walks the app router so none
  ships.
- **In the procedure builders.** `orgProcedure` and `freshProcedure` read the member and then the subscription, apply
  check 2 by the call's type (a query views, a mutation changes) unless the procedure's meta says it exports
  (`lifecycle: "export"`), revokes access (`lifecycle: "revoke"`) or must work in every state
  (`lifecycle: "always"`), then check 3 for its module, and
  `requires()` check 3 for its permissions before check 4. `subscription.get` (any member, every state) shows the
  status, the next change's day, the modules and the limits, for the past-due banner and the app's navigation, and no
  price.
- **The owner's pricing (spec 7.2; amends ADR 0020).** A plan is a tier with a flat price per organization, not per
  seat: monthly and/or yearly, at least one, and it is sold only on the cycles it has a price for (`NOT_SOLD_MONTHLY`,
  `NOT_SOLD_YEARLY`). It includes its seats, WhatsApp numbers, storage and modules, and may price an extra seat per
  month and per year. Every price is INR in paise before GST. A subscription is billed monthly or yearly, buys extra
  seats at the plan's seat price, and may have an agreed price in place of the plan's flat one. The seat limit is the
  plan's seats plus those bought. A plan can't drop a cycle's price while an organization pays it that way
  (`PLAN_CYCLE_IN_USE`; the plan row is held, so this can't race a move onto that cycle), so every subscription has
  a price. The console's `subscriptions.get` shows it with GST at 18 % apart, as CGST and SGST at 9 % each, rounded
  half-up on its own as the kernel's GST engine splits a line, so the halves always add up to the GST shown; the
  agency's own staff never see a price. No migration seeds a plan, as the prices aren't confirmed, and plans are
  global, so nothing seeds the tiers outside tests (`seedPlaceholderPlans`: placeholder Starter, Growth and Pro). The
  demo has its own plan, not for sale (`demoPlan`): never listed for onboarding nor accepted there, and put on an
  organization only by the platform's own demo job. Its key is reserved (`PLAN_KEY_RESERVED`) and it can't be archived
  (`DEMO_PLAN_LOCKED`), since nothing un-archives a plan and the nightly reset purges the demo before it subscribes
  the new one.
- **Support's impersonation ends with its session.** `protectedProcedure` trusts the 5-minute cookie cache, except
  for an impersonation session: that one is read from the database on every request, and its admin re-checked as
  platform staff. Stopping, the hour running out, or the admin losing platform access ends it at once, not up to five
  minutes later.

## Context

- **Why compute rather than trust the stored status.** A scheduled job can be late, fail or be paused. Reading the
  dates on every request costs one small query in a transaction the request opens anyway, and means a missed job
  never grants access nobody paid for, nor takes away access that was paid for.
- **Why days count from when a state was due.** If the job missed a week, an organization must not get an extra
  week of grace; and a re-run must find the same answer.
- **Why the job holds the row rather than check it hasn't changed.** A payment on an organization already active
  changes neither its status nor when it changed, so a write conditional on those two overwrote a payment made while
  the job ran (a paid-up organization ended suspended). Holding the row first means the job only ever works from what
  is committed.
- **Why the job moved to the console.** Its one column grant let the runtime role write any status and any date, which
  alone could give an organization unlimited full access. The console already runs the platform's own jobs with the
  platform role (ADR 0019), so the grant could go.
- **Why a suspension by hand is a mark, not a status.** The lifecycle's own suspension ends with a payment; a person's
  suspension (a chargeback, abuse) must not, or any payment, even one for an old period, would undo it.

## Consequences

- Each request reads the subscription, its plan, the organization's time zone and the policy in one extra transaction
  (spec 6.4 allows caching these per container later).
- The worker runs no subscription job; deploying the console process is what keeps the recorded state current (the
  request path never depends on it).
- A later step's new permission module must be mapped to a plan module before the catalog test passes, and a new
  procedure without permissions must declare its `planModule`.
- A payment may pay for days before it was paid (arrears): money that arrives today for a past period is recorded
  with the day it arrived, and the lifecycle decides what it changes (a day already past makes nothing active).
