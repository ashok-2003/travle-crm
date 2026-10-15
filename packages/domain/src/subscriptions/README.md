# subscriptions

Plans, each organization's subscription, and the payments recorded against it (spec 7.2-7.4).

## Public functions and values (`index.ts`)

Every function takes a transaction. Writes need the platform role (the console runs them in a platform transaction,
naming the organization); under `app_runtime` they fail with "permission denied", whatever the code does.

- Plans: `createPlan(tx, input)`, `updatePlan(tx, input)` (returns `before` and `after`), `archivePlan(tx, planId)`
  (returns whether it changed), `listPlans(tx, { includeArchived })`, `findPlan(tx, planId)`.
- A subscription: `startSubscription(tx, by, input, now?)` (onboarding: a trial to its last day, or active and paid
  through a day), `getSubscription(tx, organizationId)`, `changePlan`, `setOverrides`, `setTrialEnd`,
  `setPaidThrough`, `suspend`, `cancel` (each `(tx, by, input, now?)`).
- Payments: `recordPayment(tx, by, input, { now?, provider? })`, `voidPayment(tx, by, input)`,
  `listPayments(tx, organizationId)`.
- The policy: `getSubscriptionPolicy(tx)`, `setSubscriptionPolicy(tx, by, policy)`.
- `by` is a `ConsoleActor`, `{ userId }`: the platform admin, or `null` for the platform's own jobs.
- The lifecycle (pure, on calendar days): `nextStep(state, policy)` (the next state and its first day, or null) and
  `dueState(state, policy, today)` (every step whose day has come).
- What an organization may use: `entitlementsOf(tx, organizationId, now)` (plan and overrides, and the status due
  today, or null without a subscription), `createSubscriptionAccess({ db, now? })` (the api's one read per request),
  `overviewOf(entitlements)` (what `subscription.get` shows), `lifecycleAccessOf(status)`.
- Request checks 2 and 3: `assertLifecycleAllows(entitlements, { kind, isOwner })` (`kind` is `view`, `change`,
  `export` or `always`), `assertModulesOnPlan(entitlements, permissionModules)`, `planModuleOf(permissionModule)`.
- The daily job: `advanceSubscriptions({ db, organizationIds, now?, onError? })`, each organization in its own
  `forOrg()`; `advanceSubscription(tx, organizationId, now)` for one.

## Events

None. Every change to a subscription is recorded in its organization's audit log, entity `subscription`, the id the
organization's:

| Action                                 | Before                  | After                                                    |
| -------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `subscription.started`                 |                         | plan key, billing cycle, status, trial end, paid through |
| `subscription.plan-changed`            | plan key, billing cycle | plan key, billing cycle                                  |
| `subscription.overrides-changed`       | the three overrides     | the three overrides                                      |
| `subscription.trial-end-changed`       | trial end               | trial end                                                |
| `subscription.paid-through-changed`    | paid through, status    | paid through, status, reason                             |
| `subscription.payment-recorded`        | paid through, status    | payment id, amount, paid on, paid through, status        |
| `subscription.payment-voided`          |                         | payment id, amount, reason                               |
| `subscription.suspended`, `.cancelled` | status                  | status, reason                                           |
| `subscription.status-changed`          | status                  | status, the day it began (the daily job)                 |

A platform admin is recorded under their own name with source `platform`; the platform's own jobs as the system.
Changing something to what it already is records nothing.

## Rules worth knowing

- Plans are data: no code names a plan. A plan's key never changes; an archived plan takes no new subscriptions, and
  organizations already on it keep it and get its changes at once.
- One subscription per organization, keyed by `organization_id`. A trial has its last day; dates are calendar days in
  the organization's time zone (`trialEndsOn`, `paidThrough`, a payment's `paidOn` and `paidThrough`).
- Paying through today or later makes an organization active again from any state, cancelled included; a day in the
  past changes no status. An older payment never moves `paidThrough` back.
- Every change locks the subscription row first (`FOR UPDATE`), so two changes, or a change and the lifecycle job,
  can't interleave.
- A provider's payment (Razorpay, later) carries its own id: `recordPayment` with `provider` finds a repeat by
  `(organization, provider, providerPaymentId)` and records nothing twice.
- Payments are never deleted: `voidPayment` marks one, and changes no dates.
- The lifecycle (spec 7.3): a trial or a paid period ends, and the next day the organization is past due; after the
  policy's days (7) it is read-only, after its days (14) suspended. Only a person cancels, or ends a suspension (by
  recording a payment or giving time). Days count from the day a state was due, in the organization's time zone.
- The request checks compute the state due today on every request, so a late or failed job never leaves an
  organization more access than it has paid for. The job records the change, as the system, once: it writes only if
  the subscription is still as it read it, so a change from the console in the meantime wins.
- What each state allows: trial, active and past due everything (past due shows a banner); read-only views and
  exports; suspended only the Owner's exports (and, later, paying); cancelled nothing. Calls of kind `always` (me.get,
  `subscription.get`) work in every state, so the app can say why the rest are refused.
- A permission's module maps to a plan module (`leads` to `crm`; `staff`, `roles`, `settings`, `audit`, `money` and
  `documents` to none: every plan has them). A new permission module must be added to the map; a test reads the
  catalog and fails until it is.
