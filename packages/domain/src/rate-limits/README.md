# rate-limits

Limits on the public routes (spec 9.7): share links, webhooks and, later, public forms. Counted in Postgres, so
every api instance counts against the same limit.

## Public functions and values (`index.ts`)

- `createRateLimiter(db)` returns a `RateLimiter`:
  - `hit(key, { limit, windowSeconds }, now?)`: counts one hit and returns `{ allowed, remaining, retryAfterSeconds }`;
  - `purgeExpired(olderThan)`: deletes windows that started before `olderThan`, for a daily clean-up job.
- Types: `RateLimiter`, `RateLimitRule`, `RateLimitResult`.

The api's Hono middleware is `rateLimit(...)` in `apps/api/src/rate-limit.ts`.

## Events

None.

## Rules worth knowing

- Fixed windows: at most `limit` hits per key in each window of `windowSeconds`, the windows counted from the Unix epoch.
- Keys are stored as sha256 hashes: `rate_limit_counter` never holds an IP address. The table has no
  `organization_id` and is reached with `db.withoutOrg()`.
- A key's finished windows are deleted when the key is hit again; `purgeExpired` clears keys that never come back.
