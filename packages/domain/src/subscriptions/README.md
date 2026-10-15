# subscriptions

Plans, each organization's subscription, and the payments recorded against it (spec 7.2-7.4).

## Public functions and values (`index.ts`)

Every function takes a transaction. Writes, and the lock, need the platform role (the console runs them in a platform
transaction, naming the organization); under `app_runtime` they fail with "permission denied", whatever the code does.
Changes take `now?` last (the tests' clock); dates are calendar days in the organization's time zone.

- Plans: `createPlan(tx, input)`, `updatePlan(tx, input)` (returns `before` and `after`), `archivePlan(tx, planId)`
  (returns whether it changed), `listPlans(tx, { includeArchived })`, `findPlan(tx, planId)`, `planColumns(fields)`.
- Placeholder tiers, for the demo reset and tests only: `placeholderPlans`, `seedPlaceholderPlans(tx)` (puts any
  missing one on sale; changes none that exists).
- A subscription: `startSubscription(tx, by, input, now?)` (onboarding: a trial to its last day, or the policy's trial
  days, today included, when none is given; or active and paid through a day; on a cycle the plan is sold on;
  `SUBSCRIPTION_EXISTS` for a second one),
  `getSubscription(tx, organizationId, now?)`, `lockSubscription(tx, organizationId, now?)` (the same, holding the
  row until the transaction ends), `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `suspend`,
  `liftSuspension` (super admins: the console checks), `cancel` (each `(tx, by, input, now?)`). Each returns the
  `SubscriptionDetails` the console shows: the state due today (`status`, `access`, `since`, `nextChangeOn`), what was
  `recorded`, a `manualSuspension`, the dates and overrides, and the `price`.
- Payments: `recordPayment(tx, by, input, { now?, provider? })`, `voidPayment(tx, by, input)`,
  `listPayments(tx, organizationId)`.
- Prices: `subscriptionPriceOf(plan, { billingCycle, extraSeats, customPricePaise })` (the cycle's flat or agreed
  price, the extra seats at the plan's seat price, the subtotal, GST at `SUBSCRIPTION_GST_BASIS_POINTS`, 1800 or 18 %,
  and the total, in paise; null when the cycle has no price), `planPriceFor(plan, cycle)`, `assertSoldOn(plan, cycle)`
  (`NOT_SOLD_MONTHLY`, `NOT_SOLD_YEARLY`).
- The policy: `getSubscriptionPolicy(tx)` (`trialDays`, `pastDueDays`, `readOnlyDays`),
  `setSubscriptionPolicy(tx, by, policy)` (returns `before`, `after` and whether it `changed`), `samePolicy(a, b)`.
- `by` is a `ConsoleActor`, `{ userId }`: the platform admin, or `null` for the platform's own jobs.
- The lifecycle (pure, on calendar days): `nextStep(state, policy)` (the next state and its first day, or null) and
  `dueState(state, policy, today)` (every step whose day has come).
- What an organization may use: `entitlementsOf(tx, organizationId, now)` (plan and overrides, and the state today,
  or null without a subscription), `createSubscriptionAccess({ db, now? })` (the api's one read per request),
  `overviewOf(entitlements)` (what `subscription.get` shows: no price), `lifecycleAccessOf(status)`.
- `planLimits(access)`: the seats (the plan's plus those bought) and the storage in bytes, as identity's `seatLimit` and the
  files module's `storageLimitBytes` take them, read when they are needed; none without a subscription.
- Request checks 2 and 3: `assertLifecycleAllows(entitlements, { kind, isOwner })` (`kind` is `view`, `change`,
  `export` or `always`), `assertOnPlan(entitlements, planModules)` (a procedure's own module; `"core"` always passes),
  `assertModulesOnPlan(entitlements, permissionModules)`, `planModuleOf(permissionModule)`, the type
  `ProcedureModule`.
- The nightly job: `advanceSubscriptions({ db, organizationIds?, now?, onError? })`, where `db` runs platform
  transactions (`SubscriptionWriter`, the console's `platformDb`): each subscription the lifecycle can still move in
  its own transaction, each failure to `onError` (the console logs its id), then one `LifecycleJobError` naming any
  that failed; `advanceSubscription(tx, organizationId, now)` for
  one. The console process runs it on `ADVANCE_SUBSCRIPTIONS_QUEUE` (`subscriptions.advance-lifecycle`) at 00:15 India
  time.

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
| `subscription.suspension-lifted`       | status, reason          | status, reason                                           |
| `subscription.status-changed`          | status                  | status, the day it began (the nightly job)               |

A platform admin is recorded under their own name with source `platform`; the platform's own jobs as the system. A
console change records the state due today before and after it; the nightly job the recorded status it moved from,
and to. Changing something to what it already is records nothing.

## Rules worth knowing

- Plans are data: no code names a plan. A plan's key never changes; an archived plan takes no new subscriptions, and
  organizations already on it keep it and get its changes at once.
- The owner's pricing: a plan is a tier with a flat price per organization, monthly and/or yearly, the seats it
  includes, a price per extra seat for either cycle (or none), its storage and modules. Every price is INR in paise
  before GST, which the console shows apart at 18 %. A plan is sold only on the cycles it has a price for. An agreed
  price replaces the plan's flat price; extra seats still cost the plan's seat price (nothing where it sells none).
  The agency's staff never see a price (`subscription.get` has none). No migration seeds a plan: the placeholder
  tiers (`placeholderPlans`, `seedPlaceholderPlans`) are for the demo reset and tests.
- One subscription per organization, keyed by `organization_id`. A trial has its last day; an active subscription is
  always paid through a day (the table checks both).
- Every rule and screen uses the state due today (`subscriptionToday`): the lifecycle followed from what was recorded,
  in the organization's time zone, then a suspension made by hand on top. So whether the nightly job has run changes
  no answer. A console change writes the state due today with its own change.
- Paying through today or later makes an organization active again from any state, cancelled included. The payment's
  own day decides: one for an older period makes nothing active, and never moves `paidThrough` back. A correction
  that moves `paidThrough` back puts the organization wherever those dates take it today.
- A suspension made by hand is a mark of its own: the organization is suspended while it is set, whatever is paid.
  Payments never clear it; only a super admin lifts it.
- Every change, payment, void and the nightly job holds the subscription row first (`FOR NO KEY UPDATE`, which a
  payment's foreign-key `KEY SHARE` passes), then reads it. So a payment and the job can't interleave: the second waits
  and works from what the first wrote.
- Only the platform role writes these tables, the nightly job included, which runs in the console process. The
  runtime role reads them for its request checks, and can neither update nor lock a subscription.
- A provider's payment (Razorpay, later) carries its own id: `recordPayment` with `provider` finds a repeat by
  `(organization, provider, providerPaymentId)` and records nothing twice.
- Payments are never deleted: `voidPayment` marks one, once, and changes no dates. A payment pays through the day it
  was paid on or later.
- The lifecycle (spec 7.3): a trial (the policy's 7 days, today the first, unless onboarding gives its last day) or a
  paid period ends,
  and the next day the organization is past due; after the policy's days (7) it is read-only, after its days (14)
  suspended. Only a person cancels, or ends a suspension or cancellation (by recording a payment or giving time). Days
  count from the day a state was due, in the organization's time zone.
- What each state allows: trial, active and past due everything (past due shows a banner); read-only views and
  exports; suspended only the Owner's exports (and, later, paying); cancelled nothing. Calls of kind `always` (me.get,
  `subscription.get`) work in every state, so the app can say why the rest are refused.
- Check 3 applies to every procedure: each declares its plan module (`requires()` does it from its first permission)
  or `"core"`. A permission's module maps to a plan module (`leads` to `crm`; `staff`, `roles`, `settings`, `audit`,
  `money` and `documents` to none: every plan has them). A new permission module must be added to the map; a test
  reads the catalog and fails until it is.
