# 0013: Public routes: rate limits, share links and the webhook intake

Date: 2026-10-15 · Status: accepted · Implements spec sections 9.3 (share links) and 9.7

## Decision

### Rate limits

- **Counted in Postgres**, in `rate_limit_counter` (`key`, `window_start`, `count`), with fixed windows. One
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per hit, in `db.withoutOrg()`.
- **Keys are hashed.** A key names the limit and the client (`share-links:203.0.113.7`); only its sha256 is stored, so
  the table holds no IP addresses.
- **Hono middleware** `rateLimit({ limiter, name, limit, windowSeconds, clientAddress })` answers 429 with
  `Retry-After` and `{ code: "RATE_LIMITED" }`, and sets `RateLimit-Remaining`. Requests without an address share one
  bucket per limit: an unknown client is limited, not let through.
- **The client's address is one it can't forge.** `clientAddressFrom({ headerNames, trustedProxies })` follows Better
  Auth's rule for sign-in (ADR 0006): in the first configured header present (`AUTH_IP_ADDRESS_HEADERS`), the first
  address from the right that isn't a trusted proxy (`AUTH_TRUSTED_PROXIES`); with no trusted proxies, only a header
  holding exactly one address. Anything else is null. IPv4-mapped IPv6 counts as IPv4, and IPv6 as its /64, so one
  host can't rotate addresses to dodge the limit (a token guesser would otherwise send a new fake leftmost
  `x-forwarded-for` value with every try).
- Better Auth's sign-in rate limit (ADR 0006) is separate and unchanged.

### Share links

- **`/p/<token>` opens one record** (`share_link`: record type and id, a label for staff, who made it, expiry,
  revocation). Links expire after 30 days unless made otherwise, or never (`expires_at` null); revoking is final.
- **The token carries its organization**: base64url of the organization's id (22 characters), then 32 random bytes
  (43 characters). Opening a link runs `db.forOrg()` for the organization the token names and looks the secret's
  sha256 up through `@@unique([organizationId, tokenHash])`. Only the hash is stored; the token is shown once.
- **Every open is recorded** (`share_link_open`, append-only) with the visitor's network (IPv4 /24, IPv6 /48) and a
  shortened User-Agent, and announced as `share-link.opened` in the same transaction.
- **The route answers customers in a browser**: the resolver registered for the record type shows the record (for an
  issued document, a redirect to its PDF); a link that doesn't work gets a small HTML page, 404 for unknown and 410
  for expired or revoked, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- **Links are revoked, never edited or deleted**: the runtime role may update only `revoked_at` and `revoked_by`.

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

## Consequences

- Old windows are deleted when their key is hit again; `purgeExpired` (scheduled daily by the worker) clears the rest.
