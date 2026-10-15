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
| `DATABASE_POOL_SIZE`                       | no       | `10`                    | connections per instance                                                                  |
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

The api never reads `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate step, and only the
platform module may connect as the role that sees every organization. The public routes' rate-limit key is derived
from `BETTER_AUTH_SECRET` (HKDF), so it needs no variable of its own.

`src/services.ts` builds what the api (and the worker) run on, once per process: the database, identity, S3, SMTP, web
push and pg-boss. The api refuses to start when the storage bucket can't be used. `pnpm services:up` starts Postgres,
MinIO (with the bucket made) and Mailpit locally, matching `.env.example`.

## Tests

`pnpm --filter @travel-crm/api-server test` runs end-to-end tests through `app.request()` against a throwaway Postgres.
`test/support/` has the cookie jar, tRPC call helpers, and helpers that create agencies, staff and platform admins.
