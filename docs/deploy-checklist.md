# Deploy checklist

What a hosted deploy must get right that the code can't set for itself. Plan 5's deploy starts from this list and adds
to it; each item names the ADR that explains why. Where a process checks an item at start-up, the item says so.

## The database (ADRs 0002, 0019)

- **Postgres 16 or later.** The platform role's membership of the runtime role is granted
  `WITH INHERIT FALSE, SET TRUE`, which Postgres 16 introduced.
- **The three roles**, as `packages/db/sql/bootstrap.sql` creates them locally, with strong passwords of their own:
  `app_migrator` (owns the tables, runs migrations), `app_runtime` (the api and the worker), `app_platform` (the
  console alone). None may bypass row-level security.
- **The grant** `GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE`, run by a role that holds ADMIN
  OPTION on `app_runtime`: on a managed service, the role that created `app_runtime` (usually the service's admin
  user). Without it the console refuses to start (`OrganizationStepRefusedError`), as every step into an organization
  would fail.
- **Poolers.** A transaction-mode pooler (PgBouncer and the like) is fine: the role switch (`SET LOCAL ROLE`) and the
  organization (`app.org_id`) last only until the transaction ends.
- **Connections.** Each process opens up to `2 × DATABASE_POOL_SIZE + 5`, and the console 3 more for the platform
  role (`apps/api/README.md`). Size Postgres or the pooler for every instance of all three.
- **Who holds which URL.** The api and the worker get `DATABASE_URL` alone, the console `DATABASE_URL` and
  `DATABASE_PLATFORM_URL`; migrations run as a separate step with `DATABASE_MIGRATOR_URL`, which no process holds.

## The processes (ADR 0019)

- **Three services from one image:** `api`, `worker` and `console`. One console instance is enough, and it must stay
  up: it runs the nightly lifecycle, the sweeps of stored files and exports, and the demo reset.
- **Routing.** The load balancer sends `/api/platform/*` to the console and everything else under `/api` to the api.
  The console can be locked down further (an IP allow-list) without touching the api.
- **Stopping.** Each process drains on SIGTERM; the console waits 30 seconds for its jobs, so allow it that long
  before a hard kill (`apps/api/README.md`).

## Sign-in behind the load balancer (ADR 0006)

- **The client's address.** The load balancer overwrites `x-forwarded-for` (or the header named in
  `AUTH_IP_ADDRESS_HEADERS`) with the single client address, or the deploy sets `AUTH_TRUSTED_PROXIES` to the proxies'
  addresses. Otherwise every client shares one rate limit, and three failed sign-ins lock everyone out.
- **Rate limits are kept in memory**, per instance: with more than one api instance, move them to the database or a
  shared store (Better Auth's `rateLimit.storage`) before launch.
- **The reset link's token** is in the path of `GET /api/auth/reset-password/<token>`: keep the load balancer's access
  logs short-lived, or strip that path from them.

## Object storage (ADR 0011)

- **ACLs disabled** (bucket owner enforced): unsigned `x-amz-acl` headers could otherwise ride on a presigned `PUT`.
- **Deleted means gone.** The bucket is unversioned, or has a lifecycle rule that expires noncurrent versions and
  expired delete markers within a day; on a versioned bucket a delete only adds a marker, and a purged passport stays.
- **Keys per process.** Static access keys for now. The api's and the worker's need `s3:PutObject`, `s3:GetObject` and
  `s3:ListBucket` (without it, `head` on a missing key gets 403); only the console's add `s3:DeleteObject`, so the
  console needs keys of its own in its environment. Every process checks the bucket at start-up.
