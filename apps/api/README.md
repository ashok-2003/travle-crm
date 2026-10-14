# @travel-crm/api-server

The api: one Hono app on Node. Settings come from environment variables (`src/environment.ts` checks them at start-up).

## Routes

| Route                        | What it is                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                       |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                         |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, `/change-password`, `/two-factor/*`, `/admin/*` |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                              |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                               |

## Environment

| Variable                  | Required | Default           | Meaning                                                     |
| ------------------------- | -------- | ----------------- | ----------------------------------------------------------- |
| `DATABASE_URL`            | yes      |                   | Postgres as the `app_runtime` role                          |
| `BETTER_AUTH_SECRET`      | yes      |                   | at least 32 characters; `openssl rand -base64 32`           |
| `BETTER_AUTH_URL`         | yes      |                   | where browsers reach the api; https in production           |
| `TRUSTED_ORIGINS`         | no       | none              | other origins allowed to call with cookies, comma-separated |
| `AUTH_RATE_LIMIT`         | no       | `true`            | sign-in rate limiting; cannot be off in production          |
| `AUTH_IP_ADDRESS_HEADERS` | no       | `x-forwarded-for` | header(s) the load balancer puts the client's IP in         |
| `DATABASE_POOL_SIZE`      | no       | `10`              | connections per instance                                    |
| `PORT`                    | no       | `3001`            |                                                             |
| `NODE_ENV`                | no       | `development`     | `production` turns on HTTPS and rate-limit requirements     |

The api never reads `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate step, and only the
platform module may connect as the role that sees every organization.

## Tests

`pnpm --filter @travel-crm/api-server test` runs end-to-end tests through `app.request()` against a throwaway Postgres.
`test/support/` has the cookie jar, tRPC call helpers, and helpers that create agencies, staff and platform admins.
