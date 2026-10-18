# @travel-crm/api-server

The api: one Hono app on Node. Settings come from environment variables (`src/environment.ts` checks them at start-up).

## Routes

| Route                        | What it is                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                                  |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                                    |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, password reset, `/change-password`, `/two-factor/*`        |
| `/api/auth/admin/*`          | closed (404), but support's `/admin/impersonate-user` and `/admin/stop-impersonating` (ADR 0019) |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                                         |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                                          |
| `GET /p/<token>`             | a share link (ADR 0013): an issued document's PDF; 30 requests a minute per address              |
| `POST /webhooks/<provider>`  | the webhook intake (ADR 0013): verify, store, 200, queue; 600 a minute per address               |

`/api/auth/two-factor/*` exists only while `features.twoFactor` is on; it is off (owner, 2026-10-16; ADR 0006).

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
| `identity.send-invite`                    | emails an invited Owner the link to choose a password (`staff.invited`)   |

It also relays the outbox every second, and logs as the api does (below). Like the api, it refuses to start when the
environment isn't valid, the database role is wrong, the bucket can't be used or a listener or schedule can't be
registered. Stop it with SIGTERM: it stops relaying, lets running jobs finish (up to 30 seconds), closes its pools and
exits 0. Run more copies to go faster: pg-boss gives each job to one of them.

## The log

Every process writes its problems to one log on stderr, a line each, ids and codes only: `api: ...`, `worker: ...`
and `console: ...`. An error appears as its name and code and its causes' (three levels down, `describeError`), never as
its message or the error itself, which can quote a person's data (a Prisma validation error quotes the query's values).

- **The api:** a tRPC call or a route that fails unexpectedly (`tRPC <path> failed: ...`, `GET /p failed: ...`, never
  a share link's token), Better Auth's warnings and errors with email addresses and long numbers masked, a reset email
  that couldn't be sent, the rate limit's warning about requests with no trusted address, and a failed shutdown. A
  customer whose share link fails gets the "This link doesn't work" page with the usual privacy headers; any other
  caller gets `{ "code": "INTERNAL_SERVER_ERROR", "message": "Something went wrong" }`.
- **The worker:** a failing job by queue, job id and error, pg-boss's own errors and warnings, the relay's failures,
  jobs whose event wasn't found, and a failed shutdown.
- **The console:** a console call that fails unexpectedly (`console tRPC <path> failed: ...`), a failing platform job,
  each organization the nightly lifecycle couldn't advance, a purge's or an erasure's files left to the deletions'
  job, pg-boss's own errors and warnings, and a failed shutdown. The platform's services carry this log
  (`PlatformServices.log`).
- **An error nothing handled**, in any of the three once started (a promise rejected with no handler, an exception
  nothing caught): one line, `<process>: unhandled rejection: ...` or `<process>: uncaught exception: ...`, by names
  and codes, never Node's default print of the whole error; then the same drain as SIGTERM, exiting 1, or after 45
  seconds exiting 1 anyway, should the drain hang (`stopOnUnhandledErrors` in `src/start-up.ts`).
- **Start-up is the one exception.** A process that can't start prints one `<process> start-up failed` message with
  the error in full, closes its pools and exits 1. Only set-up has run by then, so the error quotes no one's data
  (`src/start-up.ts`).

## The console

`pnpm --filter @travel-crm/api-server console` starts the platform console's process from the same code and image
(ADR 0019): the console's tRPC at `/api/platform/trpc` on `CONSOLE_PORT`, which the load balancer (and the web app's
development server) routes there, and the platform's own jobs, from `src/console-jobs.ts`:

| Queue                             | What it does                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `platform.purge-organization`     | deletes a cancelled, exported organization for good, when a super admin asks (spec 5)        |
| `platform.erase-subject`          | erases a removed person or one record in every module (spec 5)                               |
| `platform.export-organization`    | writes an organization's export to the platform's storage, kept 7 days (spec 5)              |
| `platform.expire-exports`         | deletes the parts and file copies of exports past their 7 days, or withdrawn by an erasure   |
| `platform.delete-stored-files`    | deletes the stored files a purge or an erasure queued, retrying until done (ADR 0023)        |
| `platform.sweep-stored-files`     | every hour, deletes what the deletions' outbox holds that no job will reach (ADR 0023)       |
| `platform.sweep-expired-exports`  | every day at 03:45 India time, clears exports past their 7 days that no job cleared          |
| `subscriptions.advance-lifecycle` | every day at 00:15 India time, records each subscription's state, as the platform role (7.3) |
| `platform.reset-demo`             | every night at 02:00 India time, purges and rebuilds the shared demo (spec 7.4)              |

It is the only process that reads `DATABASE_PLATFORM_URL` (deploys give it to no other), and it needs everything else
the api does. It refuses to start when that connection isn't the platform role, or when the platform role can't step
into an organization as `app_runtime` (`OrganizationStepRefusedError`: the grant a hosted database needs, ADR 0019 and
`docs/deploy-checklist.md`), as well as for everything the api refuses. It runs no listeners and relays nothing: the
worker does. One instance is enough; keep it running for the demo reset.

It stops on SIGTERM like the api, but its jobs can run long, so the drain may cut one short: pg-boss waits 30 seconds
for running jobs, then the pools close under whatever is still running. Both long jobs are safe to cut. A purge is one
transaction, which rolls back, and pg-boss runs it again once the attempt's time is up. An export cut midway restarts
only after its attempt's 2-hour limit (`EXPORT_JOB_SECONDS`), when pg-boss counts the attempt failed and retries it.
Give the console at least 30 seconds between SIGTERM and a hard kill.

| Variable                 | Required | Default | Meaning                                                                        |
| ------------------------ | -------- | ------- | ------------------------------------------------------------------------------ |
| `DATABASE_PLATFORM_URL`  | yes      |         | Postgres as the `app_platform` role; never the api's or the worker's           |
| `CONSOLE_PORT`           | no       | `3002`  |                                                                                |
| `DEMO_ORGANIZATION_CODE` | no       | no demo | the demo's sign-in code; both `DEMO_` variables or neither                     |
| `DEMO_PASSWORD`          | no       |         | every demo account's password (12 characters or more): `asha`, `ravi`, `meena` |

### The console's one-off commands

Each runs once with the console's environment (the same variables and checks, so the same `console start-up failed`
when one is wrong), serves nothing, runs no jobs and exits (`src/console-command.ts`). Never over HTTP.

- **`pnpm --filter @travel-crm/api-server run first-super-admin -- --email <address> --name <name>`** makes the first
  super admin, who adds everyone else from the console (ADR 0019). It refuses once any super admin exists, also when
  two runs start at once, and exits 1 with the reason on stderr. It prints the new super admin's temporary password to
  stdout and nothing else: the one secret a process of ours prints, on purpose, since the operator's own terminal is
  where it must go. Pass it on in person; they replace it at their first sign-in, by email, before the console opens.
- **`pnpm --filter @travel-crm/api-server run demo`** builds the shared demo now, so a fresh local database has it
  without waiting for the 02:00 reset: the same reset (`resetDemoOrganization`), with `DEMO_ORGANIZATION_CODE` and
  `DEMO_PASSWORD` from `.env` (it says to set them when they aren't), purging the last demo it built. Run it after
  `pnpm services:up` and `pnpm db:migrate`. It prints the organization code and the usernames to sign in with (`asha`
  the Owner, `ravi` in Sales, `meena` in Operations), never a password: theirs is `DEMO_PASSWORD`.

## Environment

| Variable                                   | Required | Default                 | Meaning                                                                                      |
| ------------------------------------------ | -------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | yes      |                         | Postgres as the `app_runtime` role                                                           |
| `BETTER_AUTH_SECRET`                       | yes      |                         | at least 32 characters; `openssl rand -base64 32`                                            |
| `BETTER_AUTH_URL`                          | yes      |                         | where browsers reach the api; https in production                                            |
| `TRUSTED_ORIGINS`                          | no       | none                    | other origins allowed to call with cookies, comma-separated                                  |
| `AUTH_RATE_LIMIT`                          | no       | `true`                  | sign-in rate limiting; off only in development and test                                      |
| `AUTH_IP_ADDRESS_HEADERS`                  | no       | `x-forwarded-for`       | header(s) the load balancer puts the client's IP in                                          |
| `AUTH_TRUSTED_PROXIES`                     | no       | none                    | proxy IPs/CIDRs in front of the api; see `.env.example`                                      |
| `DATABASE_POOL_SIZE`                       | no       | `10`                    | the size of each of the process's two database pools (see below)                             |
| `DATABASE_TRANSACTION_MAX_WAIT_MS`         | no       | `2000`                  | a transaction's longest wait for a connection where the code names none; more on a slow host |
| `DATABASE_TRANSACTION_TIMEOUT_MS`          | no       | `5000`                  | a transaction's longest run where the code names none; more on a slow host                   |
| `S3_BUCKET`                                | yes      |                         | the bucket files and PDFs are stored in; checked at start-up                                 |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes      |                         | object storage credentials                                                                   |
| `S3_ENDPOINT`                              | no       | AWS S3                  | an S3-compatible server, e.g. MinIO's `http://localhost:59000`                               |
| `S3_REGION`                                | no       | `ap-south-1`            | the bucket's region                                                                          |
| `S3_FORCE_PATH_STYLE`                      | no       | `false`                 | `true` for MinIO                                                                             |
| `SMTP_HOST`                                | yes      |                         | SMTP, or Amazon SES's SMTP endpoint; Mailpit locally                                         |
| `SMTP_PORT`, `SMTP_SECURE`                 | no       | `587`, `false`          | `SMTP_SECURE=true` for TLS from the first byte (port 465)                                    |
| `SMTP_USER`, `SMTP_PASSWORD`               | no       | none                    | SMTP credentials                                                                             |
| `EMAIL_FROM_ADDRESS`                       | yes      |                         | the address email comes from, on our domain                                                  |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`    | yes      |                         | a pair per environment (`web-push generate-vapid-keys`); production refuses the example's    |
| `VAPID_SUBJECT`                            | yes      |                         | `mailto:` an address, or an https URL                                                        |
| `APP_URL`                                  | no       | `http://localhost:3000` | the web app: email links point there; a trusted origin; https in production                  |
| `PORT`                                     | no       | `3001`                  |                                                                                              |
| `NODE_ENV`                                 | no       | `production`            | production needs https, rate limiting and a strong secret                                    |

A process opens up to `2 × DATABASE_POOL_SIZE + 5` connections: one pool for the database, one for identity, and
pg-boss's 5. That is 25 by default, and Postgres allows 100; the console adds its platform pool of 3. For more than 3
instances (api, worker and console together), put a connection pooler in front of Postgres, or lower the size.

The platform pool has 3 connections (`platform/services.ts`) against long transactions (a purge may take 10 minutes, the
demo build 20 seconds), so a big purge plus an erasure leaves one for every console request. That is fine at today's
scale.

The api and the worker never read `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate
step, and only the console process connects as the role that sees every organization. The public routes' rate-limit
key is derived
from `BETTER_AUTH_SECRET` (HKDF), so it needs no variable of its own.

`src/services.ts` builds what the api (and the worker) run on, once per process: the database, identity, S3, SMTP, web
push and pg-boss. The api refuses to start when the storage bucket can't be used. `pnpm services:up` starts Postgres,
MinIO (with the bucket made) and Mailpit locally, matching `.env.example`.

## Tests

`pnpm --filter @travel-crm/api-server test` runs end-to-end tests through `app.request()` against a throwaway Postgres.
`test/support/` has the cookie jar, tRPC call helpers, and helpers that create agencies, staff and platform admins.
