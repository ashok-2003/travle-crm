# webhooks

The generic webhook intake (spec 9.7). Providers (Razorpay, Meta's WhatsApp, ...) arrive with their modules; the
Foundation ships the intake and the signature helper.

## Public functions and values (`index.ts`)

- `receiveWebhook({ db, queue, providers }, providerName, { headers, rawBody })`: verifies the signature, stores the
  raw event, queues `webhooks.process`, and returns `{ status }` (200, or 404 for an unknown provider, 401 for a bad
  signature, 400 for an event the provider can't identify).
- `processWebhookEvent({ db, providers }, webhookEventId)` and `processWebhookJob(deps, jobData)`: run the provider's
  handler for a stored event once. Return `"processed"`, `"already-processed"` or `"event-not-found"`; a failing
  handler's error is recorded on the event and rethrown so the job retries.
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

- A provider is `{ name, keptHeaders, verify, identify, process }`. `verify` returns false for a bad signature and
  never throws; `process` runs in the worker, finds the organization from the payload and works in `db.forOrg()`.
- Repeats are ignored by the provider's event id (`@@unique([provider, providerEventId])`), and the job's id is the
  event's id, so a repeated delivery queues nothing new.
- `webhook_event` has no `organization_id` and no row-level security: only this module reads it, through
  `db.withoutOrg()`. It keeps the raw payload and the headers the provider names, never cookies or authorization.
