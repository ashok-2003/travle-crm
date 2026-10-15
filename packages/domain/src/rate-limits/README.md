# rate-limits

Limits on the public routes (spec 9.7): share links, webhooks and, later, public forms. Counted in Postgres, so
every api instance counts against the same limit.

## Public functions and values (`index.ts`)

- `createRateLimiter(db, { keySecret })` returns a `RateLimiter` (`keySecret`: a string or `Uint8Array` of at least 32
  bytes, else `RangeError`):
  - `hit(key, { limit, windowSeconds }, now?)`: counts one hit and returns `{ allowed, remaining, retryAfterSeconds }`.
- `purgeExpiredRateLimits(db, olderThan, batchSize?)`: deletes windows that started before `olderThan`, in
  batches of `batchSize` rows (a whole number from 1 to 100,000; default 10,000), each in its own transaction, for a
  daily clean-up job. It needs no secret. `RATE_LIMIT_PURGE_QUEUE` (`rate-limits.purge`) is that job's queue.
- Types: `RateLimiter`, `RateLimiterOptions`, `RateLimitRule`, `RateLimitResult`.

The api's Hono middleware is `rateLimit(...)` in `apps/api/src/rate-limit.ts`.

## Events

None.

## Rules worth knowing

- Fixed windows: at most `limit` hits per key in each window of `windowSeconds`, the windows counted from the Unix
  epoch.
- Keys are stored as keyed hashes (HMAC-SHA256 under `keySecret`): `rate_limit_counter` never holds an IP address, and
  an address can't be recovered from the table without the secret. Changing the secret only resets the counts. The
  table has no `organization_id` and no row-level security: only this module reaches it, as `rateLimitCounters(tx)`
  from `@travel-crm/db/rate-limits` inside `db.withoutOrg()`. `OrgTx` leaves the model out, a transaction refuses it
  at run time (`UnscopedModelError`), dependency-cruiser keeps the entry point to this module, and ESLint flags raw
  SQL naming `rate_limit_counter` anywhere else.
- A key's finished windows are deleted when the key is hit again; `purgeExpiredRateLimits` clears keys that never come
  back.
- Each limiter remembers (up to 10,000 keys, oldest forgotten first) which keys it refused until their window ends, and
  answers those without asking the database. So the stored count stops growing once a key is refused.
