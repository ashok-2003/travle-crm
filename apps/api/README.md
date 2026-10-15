# @travel-crm/api-server

The api: one Hono app on Node. Settings come from environment variables (`src/environment.ts` checks them at start-up).

## Routes

| Route                        | What it is                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                                       |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                                         |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, password reset, `/change-password`, `/two-factor/*`, `/admin/*` |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                                              |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                                               |
| `GET /p/<token>`             | a share link (ADR 0013): an issued document's PDF; 30 requests a minute per address                   |
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address                    |

## The worker

`pnpm --filter @travel-crm/api-server worker` starts the worker from the same code and image (spec 9.1). It needs the
same environment as the api, connects as `app_runtime` too and opens no port. `src/worker-jobs.ts` lists what it runs:

| Queue                                     | What it does                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `documents.render-pdf`                    | renders an issued document's PDF once and stores it (ADR 0012)            |
| `notifications.deliver`                   | emails and pushes a notification, respecting opt-outs (ADR 0014)          |
| `notifications.forget-push-subscriptions` | deletes a removed member's push subscriptions (`staff.removed`, ADR 0007) |
| `share-links.notify-sharer`               | tells whoever shared a link that it was opened                            |
| `webhooks.process`                        | hands a stored webhook to its provider, once (ADR 0013)                   |
| `rate-limits.purge`                       | every day at 03:30 India time, deletes rate-limit windows over a day old  |

It also relays the outbox every second, and logs as the api does (below). Like the api, it refuses to start when the
environment isn't valid, the database role is wrong, the bucket can't be used or a listener or schedule can't be
registered. Stop it with SIGTERM: it stops relaying, lets running jobs finish (up to 30 seconds), closes its pools and
exits 0. Run more copies to go faster: pg-boss gives each job to one of them.

## The log

Both processes write their problems to one log on stderr, a line each, ids and codes only: `api: ...` and
`worker: ...`. An error appears as its name and code and its causes' (three levels down, `describeError`), never as
its message or the error itself, which can quote a person's data (a Prisma validation error quotes the query's values).

- **The api:** a tRPC call or a route that fails unexpectedly (`tRPC <path> failed: ...`, `GET /p failed: ...`, never
  a share link's token), Better Auth's warnings and errors with email addresses and long numbers masked, a reset email
  that couldn't be sent, the rate limit's warning about requests with no trusted address, and a failed shutdown. A
  customer whose share link fails gets the "This link doesn't work" page with the usual privacy headers; any other
  caller gets `{ "code": "INTERNAL_SERVER_ERROR", "message": "Something went wrong" }`.
- **The worker:** a failing job by queue, job id and error, pg-boss's own errors and warnings, the relay's failures,
  jobs whose event wasn't found, and a failed shutdown.
- **Start-up is the one exception.** A process that can't start prints one `<process> start-up failed` message with
  the error in full, closes its pools and exits 1. Only set-up has run by then, so the error quotes no one's data
  (`src/start-up.ts`).

## Environment

| Variable                                   | Required | Default                 | Meaning                                                                                   |
| ------------------------------------------ | -------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | yes      |                         | Postgres as the `app_runtime` role                                                        |
| `BETTER_AUTH_SECRET`                       | yes      |                         | at least 32 characters; `openssl rand -base64 32`                                         |
| `BETTER_AUTH_URL`                          | yes      |                         | where browsers reach the api; https in production                                         |
| `TRUSTED_ORIGINS`                          | no       | none                    | other origins allowed to call with cookies, comma-separated                               |
| `AUTH_RATE_LIMIT`                          | no       | `true`                  | sign-in rate limiting; off only in development and test                                   |
| `AUTH_IP_ADDRESS_HEADERS`                  | no       | `x-forwarded-for`       | header(s) the load balancer puts the client's IP in                                       |
| `AUTH_TRUSTED_PROXIES`                     | no       | none                    | proxy IPs/CIDRs in front of the api; see `.env.example`                                   |
| `DATABASE_POOL_SIZE`                       | no       | `10`                    | the size of each of the process's two database pools (see below)                          |
| `S3_BUCKET`                                | yes      |                         | the bucket files and PDFs are stored in; checked at start-up                              |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes      |                         | object storage credentials                                                                |
| `S3_ENDPOINT`                              | no       | AWS S3                  | an S3-compatible server, e.g. MinIO's `http://localhost:59000`                            |
| `S3_REGION`                                | no       | `ap-south-1`            | the bucket's region                                                                       |
| `S3_FORCE_PATH_STYLE`                      | no       | `false`                 | `true` for MinIO                                                                          |
| `SMTP_HOST`                                | yes      |                         | SMTP, or Amazon SES's SMTP endpoint; Mailpit locally                                      |
| `SMTP_PORT`, `SMTP_SECURE`                 | no       | `587`, `false`          | `SMTP_SECURE=true` for TLS from the first byte (port 465)                                 |
| `SMTP_USER`, `SMTP_PASSWORD`               | no       | none                    | SMTP credentials                                                                          |
| `EMAIL_FROM_ADDRESS`                       | yes      |                         | the address email comes from, on our domain                                               |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`    | yes      |                         | web push keys: `pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys` |
| `VAPID_SUBJECT`                            | yes      |                         | `mailto:` an address, or an https URL                                                     |
| `APP_URL`                                  | no       | `http://localhost:3000` | the web app: email links point there; a trusted origin; https in production               |
| `PORT`                                     | no       | `3001`                  |                                                                                           |
| `NODE_ENV`                                 | no       | `production`            | production needs https, rate limiting and a strong secret                                 |

A process opens up to `2 × DATABASE_POOL_SIZE + 5` connections: one pool for the database, one for identity, and
pg-boss's 5. That is 25 by default, and Postgres allows 100. For more than 3 instances (api and worker together), put
a connection pooler in front of Postgres, or lower the size.

The api never reads `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate step, and only the
platform module may connect as the role that sees every organization. The public routes' rate-limit key is derived
from `BETTER_AUTH_SECRET` (HKDF), so it needs no variable of its own.

`src/services.ts` builds what the api (and the worker) run on, once per process: the database, identity, S3, SMTP, web
push and pg-boss. The api refuses to start when the storage bucket can't be used. `pnpm services:up` starts Postgres,
MinIO (with the bucket made) and Mailpit locally, matching `.env.example`.

## Tests

`pnpm --filter @travel-crm/api-server test` runs end-to-end tests through `app.request()` against a throwaway Postgres.
`test/support/` has the cookie jar, tRPC call helpers, and helpers that create agencies, staff and platform admins.
