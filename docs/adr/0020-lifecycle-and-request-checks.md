# 0020: The subscription lifecycle, and request checks 2 and 3

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.3 and 6.5 (checks 2 and 3)

## Decision

- **The lifecycle is rules on calendar days.** A trial or a paid period ends; the next day the organization is past
  due; after the policy's past-due days (7) it is read-only; after its read-only days (14) suspended. A person cancels,
  and a person ends a suspension, by recording a payment or giving time (ADR 0019). The days count in the
  organization's time zone, from the day each state was due. The two durations are one row,
  `subscription_policy`, which super admins change in the console (Q3).
- **The request checks compute today's state; the daily job records it.** `entitlementsOf` reads the subscription,
  its plan and the policy, and follows the lifecycle up to today, so access is right even if the job ran late or not
  at all. The job (`advanceSubscriptions`, scheduled daily by the worker) writes the state down and records
  `subscription.status-changed` in the organization's log, by the system. It writes only if the subscription is still
  as it read it: a change from the console in the meantime wins.
- **Check 2, the organization active**, by what a call does: trial, active and past due allow everything; read-only
  allows views and exports but no changes (`ORGANIZATION_READ_ONLY`); suspended allows only the Owner's exports
  (`ORGANIZATION_SUSPENDED`); cancelled allows nothing (`ORGANIZATION_CANCELLED`); an organization without a
  subscription nothing either (`NO_SUBSCRIPTION`). Calls every state allows (`me.get`, the subscription's own
  status) let the app say why. All of these are `FORBIDDEN`.
- **Check 3, the module on the plan**, from each permission's module, as plan 2 arranged: `leads` belongs to the
  `crm` module, `quotes` to `quotes`, and so on, while `staff`, `roles`, `settings`, `audit`, `money` and `documents`
  belong to every plan. A permission whose module is neither on the plan nor switched on early fails with
  `FEATURE_LOCKED` (`MODULE_NOT_ON_PLAN`).

- **In the procedure builders.** `orgProcedure` and `freshProcedure` read the member and then the subscription,
  apply check 2 by the call's type (a query views, a mutation changes) unless the procedure's meta says it exports
  (`lifecycle: "export"`) or must work in every state (`lifecycle: "always"`), and `requires()` applies check 3 before
  check 4. `subscription.get` (any member, every state) shows the status, the next change's day, the modules and the
  limits, for the past-due banner and the app's navigation.
- **Support's impersonation ends with its session.** `protectedProcedure` trusts the 5-minute cookie cache, except
  for an impersonation session: that one is read from the database on every request, and its admin re-checked as
  platform staff. Stopping, the hour running out, or the admin losing platform access ends it at once, not up to five
  minutes later.

## Context

- **Why compute rather than trust the stored status.** A scheduled job can be late, fail or be paused. Reading the
  dates on every request costs one small query in a transaction the request opens anyway, and means a missed job
  never grants access nobody paid for.
- **Why days count from when a state was due.** If the job missed a week, an organization must not get an extra
  week of grace; and a re-run must find the same answer.

## Consequences

- Each request reads the subscription, its plan and the policy in one extra transaction (spec 6.4 allows caching
  these per container later).
- A later step's new permission module must be mapped to a plan module before the catalog test passes.
