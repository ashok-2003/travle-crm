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

## Context

- **Why Postgres, not memory.** Containers are stateless and run as several copies (spec 12.3): a limit kept in one
  container's memory would multiply by the number of copies. Postgres is already there; one indexed upsert per public
  request is cheap at our scale. A shared cache (Redis) can replace it later behind the same `RateLimiter` interface.
- **Why fixed windows.** Simple and exact to test. A client can double its rate across a window boundary, which is
  acceptable for abuse protection.

## Consequences

- Old windows are deleted when their key is hit again; `purgeExpired` (scheduled daily by the worker) clears the rest.
