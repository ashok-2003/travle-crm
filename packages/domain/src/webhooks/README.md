# webhooks

The generic webhook intake (spec 9.7). Providers (Razorpay, Meta's WhatsApp, ...) arrive with their modules; the
Foundation ships the intake and the signature helper.

## Public functions and values (`index.ts`)

- `receiveWebhook({ db, queue, providers }, providerName, { headers, rawBody })`: verifies the signature, stores the
  raw event, queues `webhooks.process`, and returns `{ status }` (200, or 404 for an unknown provider, 401 for a bad
  signature, 400 for a signed body the provider can't identify, which is not stored; also 400 if `verify` or `identify`
  throws, which they should never do).
- `processWebhookEvent({ db, providers }, webhookEventId)` and `processWebhookJob(deps, jobData)`: run the provider's
  handler for a stored event at least once (see the rules below). Return `"processed"`, `"already-processed"` or
  `"event-not-found"`; a failing handler's error name or code (never its message) is recorded on the event and the
  error rethrown so the job retries.
- `hmacSha256Signature({ secret, header, prefix?, encoding })`: a `verify` for providers that sign the raw body
  with HMAC-SHA256.
- `WEBHOOK_PROCESS_QUEUE` (`"webhooks.process"`), and the types `WebhookProvider`, `WebhookRequest`,
  `StoredWebhookEvent`, `WebhookDependencies`, `WebhookReceipt`, `ProcessWebhookDependencies`,
  `WebhookProcessResult`.

The route is `webhookRoutes(...)` in `apps/api/src/webhook-route.ts`.

## Events

None. The intake queues a plain job (`webhooks.process`, data `{ webhookEventId }`), not a domain event: there is no
organization yet.

## Rules worth knowing

- A provider is `{ name, keptHeaders, verify, identify, process }`. `verify` (which may be asynchronous) returns false
  for a bad signature, and neither `verify` nor `identify` should throw; `process` runs in the worker, finds the
  organization from the payload and works in `db.forOrg()`.
- Repeats are ignored by the provider's event id (`@@unique([provider, providerEventId])`), and the job's id is the
  event's id, so a repeated delivery queues nothing new.
- Processing is at least once, not exactly once: the handler and the mark-processed update are separate
  transactions. A provider's `process` must do its work idempotently inside `db.forOrg()`, keyed by `event.id` or
  `event.providerEventId` (for example a unique key on the payment record).
- `webhook_event` has no `organization_id` and no row-level security: only this module reads it, as
  `webhookEvents(tx)` from `@travel-crm/db/webhooks` inside `db.withoutOrg()`. `OrgTx` leaves the model out, a
  transaction refuses it at run time (`UnscopedModelError`), and dependency-cruiser keeps the entry point to this
  module. The runtime role may update only `processed_at`, `attempts` and `last_error`. It keeps the raw payload and
  the headers the provider names, never cookies or authorization.
