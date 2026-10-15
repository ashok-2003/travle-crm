# 0019: Plans, subscriptions and payments as data

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.2 and 7.4, and the data behind 7.3

## Decision

- **Plans are rows** (`plan`): a stable key, a name, a flat INR price per organization in paise per month and per
  year (at least one; a plan is sold only on the cycles it is priced for), a price per extra seat for either, all
  before GST, limits (seats, WhatsApp numbers, storage bytes) and the business modules they include (`crm`, `inbox`,
  `catalog`, `quotes`, `bookings`, `departures`, `suppliers`, `accounts`, `reports`). The Foundation's own features
  (staff, roles, settings, the audit log, documents) come with every plan. Super admins edit plans in the console; no
  code names one and no migration seeds one (Q4: prices are data). The demo's own plan is not for sale (ADR 0020).
- **One subscription per organization** (`subscription`, keyed by `organization_id`, under row-level security): its
  plan and billing cycle, status, when the status last changed, the trial's last day, the last day paid for, and the
  overrides of spec 7.2: extra seats, an agreed price, modules switched on early. Overrides double as feature flags
  (the pilot gets modules early this way).
- **Payments are recorded, not taken** (spec 7.4: billing is outside the product in Phase 1): `subscription_payment`
  holds the amount, the day it was paid, the day it pays through, a reference, and who recorded it. Recording one
  moves the paid-through day forward and, from today on, makes the organization active again. A mistaken payment is
  voided, never deleted.
- **Only the platform role writes these tables**, the nightly lifecycle job included, which runs in the console
  process (ADR 0020). The api and the worker only read them, for the request checks. The console's changes run in
  platform transactions and are recorded in the organization's own audit log under the platform admin's name; plan
  changes, which belong to no organization, go in the platform log.
- **Billing readiness (spec 7.4: "Razorpay Subscriptions webhooks update the same record later").** A subscription
  has a `provider_subscription_id`, and a payment a `provider` and `provider_payment_id`, unique per organization:
  `recordPayment(…, { provider: { provider: "razorpay", providerPaymentId } })` records a repeated webhook's payment
  once. The Razorpay provider itself (its `verify` with `hmacSha256Signature`, `identify` and `process`) comes with
  online billing; the Foundation ships no Razorpay code. Recording a payment needs the platform role, which the api and
  the worker never hold, so a Razorpay webhook's payment step must run in the console process: the api stores and
  verifies the webhook as today, and hands the payment to the console through the outbox or a console job.

## Context

- **Why grants and not only code.** An organization's staff must never be able to give themselves seats or modules.
  Even a bug in the api, or SQL that slips past review, can't: `app_runtime` has no right to write these columns.
- **Why calendar dates.** "Paid through 31 October" is a day in the organization's time zone, not an instant; the
  console and the lifecycle job both read today in that zone.
- **Why a provider's payment id is unique per organization, not globally.** Every key on an organization's table
  includes `organization_id` (ADR 0002's key rule); a webhook's handler finds the organization first, from the
  provider's subscription.

## Consequences

- Adding a business module later means adding it to the module list (contracts and the table's check) and mapping
  its permissions to it (ADR 0020).
- Plan changes apply to every organization on the plan at once; a price agreed for one organization is its override.
