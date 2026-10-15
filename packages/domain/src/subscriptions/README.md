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
