# 0013: Public routes: rate limits, share links and the webhook intake

Date: 2026-10-15 · Status: accepted · Implements spec sections 9.3 (share links) and 9.7

## Decision

### Rate limits

- **Counted in Postgres**, in `rate_limit_counter` (`key`, `window_start`, `count`), with fixed windows. One
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per hit, in `db.withoutOrg()`.
- **Keys are keyed hashes.** A key names the limit and the client (`share-links:203.0.113.7`); only its HMAC-SHA256
  under a server secret is stored, so the table holds no IP addresses and none can be recovered from it without the
  secret (a plain hash of an IPv4 address can be reversed by trying all of them in minutes). The runtime role may
  update only `count`; the platform role has no access.
- **The secret** (`keySecret`, at least 32 bytes) is derived by the Integration task from `BETTER_AUTH_SECRET` with
  `hkdfSync("sha256", secret, "", "rate-limit-keys", 32)`, so there is no new environment variable. Rotating it only
  resets the counts.
- **Hono middleware** `rateLimit({ limiter, name, limit, windowSeconds, clientAddress })` answers 429 with
  `Retry-After` and `{ code: "RATE_LIMITED" }`, and sets `RateLimit-Remaining`.
- **The client's address is one it can't forge.** `clientAddressFrom({ headerNames, trustedProxies })` follows Better
  Auth's rule for sign-in (ADR 0006): in the first configured header present (`AUTH_IP_ADDRESS_HEADERS`), the first
  address from the right that isn't a trusted proxy (`AUTH_TRUSTED_PROXIES`); with no trusted proxies, only a header
  holding exactly one address. Anything else is null. It differs from Better Auth on purpose in one way: it never
  falls through to the next header when the first present one is unusable, so a client can't choose which header is
  read. IPv4-mapped IPv6 counts as IPv4, and IPv6 as its /64, so one host can't rotate addresses to dodge the limit (a
  token guesser would otherwise send a new fake leftmost `x-forwarded-for` value with every try).
- **Deployment rule (from ADR 0006).** With `AUTH_TRUSTED_PROXIES` empty, the api must be reachable only through an
  edge that overwrites the address header, and every name in `AUTH_IP_ADDRESS_HEADERS` must be set or stripped by
  that edge. For plan 5: believe these headers only when the TCP peer is a trusted proxy.
- **Requests with no trusted address share one bucket per limit, and that is deliberate.** An unknown client is
  limited, not let through. The cost: one client can exhaust that bucket for everyone in it, and a load balancer that
  stops setting the header puts every visitor there. The middleware logs a warning once per process the first time a
  request lands in it, so the misconfiguration is noticed.
- **It fails closed.** If the counter can't be reached, the request gets a 500 and the route is not run: a public
  route without a working limit is not served.
- **Refused keys are cheap.** Each limiter remembers (10,000 keys at most, oldest forgotten first) the keys it refused
  until their window ends and answers them without a database call. The stored count therefore stops growing once a
  key is refused. The memo is per instance, so another instance may still count a few more hits.
- **The purge keeps up.** `purgeExpiredRateLimits` deletes in batches of 10,000 rows, each in its own short
  transaction, using an index on `window_start`.
- Better Auth's sign-in rate limit (ADR 0006) is separate and unchanged.

### Share links

- **`/p/<token>` opens one record** (`share_link`: record type and id, a label for staff, who made it, expiry,
  revocation). Links expire after 30 days unless made otherwise, or never (`expires_at` null); revoking is final.
- **The token carries its organization**: base64url of the organization's id (22 characters), then 32 random bytes
  (43 characters). Opening a link runs `db.forOrg()` for the organization the token names and looks the secret's
  sha256 up through `@@unique([organizationId, tokenHash])`. Only the hash is stored; the token is shown once.
- **Every customer open is recorded** (`share_link_open`, append-only) with the visitor's network (IPv4 /24, IPv6
  /48) and a shortened User-Agent, and announced as `share-link.opened` in the same transaction. The announcement goes
  out at most once per link in 10 minutes, so a customer reloading doesn't flood staff.
- **Previews are not opens.** WhatsApp and email scanners fetch a link when it is pasted or delivered. HEAD requests,
  `Sec-Purpose`/`Purpose: prefetch`, and known preview User-Agents (WhatsApp, facebookexternalhit, Facebot, Slackbot,
  TelegramBot, Twitterbot, LinkedInBot, Discordbot, SkypeUriPreview, Google-PageRenderer, Applebot) are checked like any
  open but record nothing and announce nothing.
  Known limits: a scanner that fetches the link with an ordinary browser User-Agent still counts as an open, and a
  prerendered page that the customer opens later makes no second request, so that open is not counted again.
- **An open is recorded after the record was shown**: the route finds the link, runs the record type's resolver, and
  records the open only if the resolver answered with success (below 400). A 404, a 503 "being prepared" or a failure
  doesn't count or notify.
- **The route answers customers in a browser**: the resolver registered for the record type shows the record (for an
  issued document, a redirect to its PDF); a link that doesn't work gets a small HTML page, 404 for unknown and 410
  for expired or revoked, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- **Links are revoked, never edited or deleted**: the runtime role may update only `revoked_at` and `revoked_by`, and
  a trigger makes revocation final: a revoked link can't be changed again. Concurrent revokes write once.

### The webhook intake

- **`POST /webhooks/<provider>`**, in the spec's order: verify the signature, store the raw payload, queue a job,
  reply 200; the job then processes the event, at least once. An unknown provider is 404, a bad signature 401
  (nothing stored), a signed body the provider can't identify 400 (not stored; a `verify` or `identify` that throws
  is answered 400 too, but neither should throw), and a body over 1 MB 413 before it is read in full.
- **Providers plug in** as `WebhookProvider` objects: `verify`, `identify` (the provider's event id and type) and
  `process` (in the worker). `hmacSha256Signature(...)` builds `verify` for the common HMAC-of-the-body scheme,
  compared in constant time.
- **`webhook_event`** keeps every event: the raw body exactly as received, the headers the provider names (never
  cookies or authorization), attempts and the last error. `@@unique([provider, providerEventId])` ignores repeats; the
  `webhooks.process` job's id is the event's id, so a repeat queues nothing new, and a repeat of an event whose job was
  never queued queues it then. The send passes a generous retry policy (10 retries, 30 s delay, doubling). A later
  sweep will re-queue old unprocessed rows.
- **Processing is at least once, not exactly once.** `provider.process` and the mark-processed update are separate
  transactions, so a crash between them, or a retry, runs `process` again. A provider's `process` must do its work
  idempotently inside `db.forOrg()`, keyed by `event.id` or `event.providerEventId` (for example a unique key on the
  payment record).
- **`last_error` holds no raw message.** Only the error's name or code, at most 100 characters: messages quote payloads
  and payloads hold personal data. The full error still reaches the logs and the job queue through the rethrow.
- **Payloads are kept as delivered**: the runtime role may update only `processed_at`, `attempts` and `last_error`, and
  can't delete events.
- **Not yet enforced: who can read `webhook_event`.** The rule is that only the webhooks module reads it (and the
  rate-limit table likewise belongs to its module), but `OrgTx` still exposes both models to every `forOrg()`
  transaction, so organization code could read every organization's raw payloads. Integration task I1 enforces it, by
  omitting `webhookEvent` and `rateLimitCounter` from `OrgTx` and giving this module dedicated database entry points.

## Context

- **Why Postgres, not memory.** Containers are stateless and run as several copies (spec 12.3): a limit kept in one
  container's memory would multiply by the number of copies. Postgres is already there; one indexed upsert per public
  request is cheap at our scale. A shared cache (Redis) can replace it later behind the same `RateLimiter` interface.
- **Why fixed windows.** Simple and exact to test. A client can double its rate across a window boundary, which is
  acceptable for abuse protection.
- **Why the token names the organization.** Without it, opening a link would need a lookup across organizations: a
  table outside row-level security or a SECURITY DEFINER function. An organization id is not a secret (the token's
  32-byte secret is), so carrying it costs nothing and keeps every share-link query inside `db.forOrg()`.
- **Why 410 for expired and revoked links.** The customer's next step differs from a mistyped link ("ask for a new
  one"), and knowing that a random 32-byte secret once existed tells an attacker nothing useful.
- **Why webhook events have no organization and no row-level security.** The organization is known only once the
  provider's handler has read the payload (a WhatsApp number, a Razorpay account). The table holds raw provider data,
  so only the webhooks module is meant to read it, through `db.withoutOrg()` (not yet enforced, see above); each
  provider's `process` moves what it needs into organization tables inside `db.forOrg()`.
- **Why store before replying.** Providers retry until they get a 2xx. Storing first means a 200 is never sent for an
  event we could lose, and a crash after storing is recovered by the provider's own retry (the repeat queues the job).
- **The raw body is kept as text.** Providers send UTF-8 JSON, and the signature is checked over the same text.

## Consequences

- Public forms get Turnstile (spec 9.7) when the first form arrives with its screen (plan 5); the rate limit here
  applies to them too.
- Stored webhook payloads are kept for now. Step 2 (the first real provider, WhatsApp) must add retention under DPDP:
  rows are kept a short fixed time after `processed_at`, then purged by blanking `payload` and `headers` while keeping
  `(provider, provider_event_id)` as a tombstone, because providers without a signed timestamp (Razorpay, Meta) rely on
  that unique key against replays. Blanking needs the platform role (or a column grant), because `app_runtime` can't
  update `payload` or `headers`. An organization or traveller purge must also reach these rows, so the processing
  step should record the organization it resolved. A sweep that re-queues old unprocessed rows belongs there too.
- Old rate-limit windows are deleted when their key is hit again; `purgeExpiredRateLimits` (scheduled daily by the
  worker) clears the rest.
