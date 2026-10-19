# Deploy checklist

What a hosted deploy must get right that the code can't set for itself; each item names the ADR that explains why.
Where a process checks an item at start-up, the item says so. The first four sections are the database's, the
processes', sign-in's and storage's (plans 2-4); the rest are the release's (ADR 0027): environments, the images,
every process's settings, routing, health and stopping, migrations, the first super admin, hosting, HTTPS, backups,
logs, and what is still open.

## The database (ADRs 0002, 0019)

- **Postgres 17 or 18.** CI applies every migration to Postgres 18, and the suites also pass on 17
  (`TEST_POSTGRES_IMAGE=postgres:17-alpine pnpm --filter @travel-crm/db test`, and the same for the domain): ids raw SQL
  inserts are made in code (`newUuidV7`), not with Postgres 18's `uuidv7()`. The platform role's membership of the
  runtime role is granted `WITH INHERIT FALSE, SET TRUE`, which Postgres 16 introduced.
- **The trusted extensions `pg_trgm` and `btree_gist`** (release 1, R6; ADR 0028). The `leads_by_hand` migration
  creates them as `app_migrator` (`CREATE EXTENSION IF NOT EXISTS`). Postgres allows that to a role with `CREATE`
  on the database because both are trusted. `sql/bootstrap.sql` doesn't create them, so local databases, the
  tests and `pnpm migrations:check` run that same statement as the migrator. A hosted Postgres must offer them
  (Cloud SQL and RDS do): check `SELECT name FROM pg_available_extensions WHERE name IN ('pg_trgm', 'btree_gist')`
  before the first `migrate`. If the service doesn't let the migrator create them, create them once as its admin
  user before that `migrate`.
- **The three roles**, as `packages/db/sql/bootstrap.sql` creates them locally, with strong passwords of their own:
  `app_migrator` (owns the tables, runs migrations), `app_runtime` (the api and the worker), `app_platform` (the
  console alone). None may bypass row-level security.
- **The grant** `GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE`, run by a role that holds ADMIN
  OPTION on `app_runtime`: on a managed service, the role that created `app_runtime` (usually the service's admin
  user). Without it the console refuses to start (`OrganizationStepRefusedError`), as every step into an organization
  would fail.
- **Poolers.** A transaction-mode pooler (PgBouncer and the like) is fine for the three processes: the role switch
  (`SET LOCAL ROLE`) and the organization (`app.org_id`) last only until the transaction ends. **Never for
  migrations:** `DATABASE_MIGRATOR_URL` connects to Postgres directly, or through a session-mode pooler. Prisma
  Migrate's lock is a session's advisory lock, so through a transaction-mode pooler two `migrate` runs can overlap,
  or fail part-way. The same goes for every `migrate` and `migrate resolve` below, the restore drill's among them.
- **Connections.** Each process opens up to `2 × DATABASE_POOL_SIZE + 5`, and the console 3 more for the platform
  role (`apps/api/README.md`). Size Postgres or the pooler for every instance of all three.
- **Who holds which URL.** The api and the worker get `DATABASE_URL` alone, the console `DATABASE_URL` and
  `DATABASE_PLATFORM_URL`; migrations run as a separate step with `DATABASE_MIGRATOR_URL`, which no process holds.

## The processes (ADR 0019)

- **Three services from one image:** `api`, `worker` and `console`. One console instance is enough, and it must stay
  up: it runs the nightly lifecycle, the sweeps of stored files and exports (the hourly `platform.sweep-bulk-files`
  among them, which deletes an import's file 7 days after it ends and an export's 24 hours after it is ready), and the
  demo reset.
- **The worker's memory** (ADR 0030). It reads an import's file, at most 10 MB, and holds its parsed rows in its own
  memory (under 20 MB at the limits), and it streams an export in pages of 1,000 rows (under 200 MB resident). The api
  never reads a file. Imports and exports add no environment variable.
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
- **CORS.** The browser PUTs uploads to their presigned URLs and loads logos straight from the bucket (plan 5B), so
  the bucket's CORS rule allows the app's origin (`APP_URL`), the methods `PUT` and `GET`, and the request headers
  `content-type` and `if-none-match`, nothing more. The web image's `STORAGE_ORIGIN` is the bucket's origin (The
  images, below).

## Environments (spec 12.2)

| Environment | What runs                                                                          | Its data and keys                                        |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Local       | `pnpm dev` (the processes from source), or `pnpm product:up` (the images, proxied) | throwaway; `.env.example`'s dev-only secrets             |
| Staging     | every merge to `main` (its pipeline is still open), the demo on (`DEMO_*` set)     | demo data only, test keys, its own database and bucket   |
| Production  | only a release the product owner approves (spec 12.1)                              | real organizations; its own keys from the secret manager |

- **The same images move from staging to production.** Nothing in the api's image depends on where it runs. The web
  image holds one address, `STORAGE_ORIGIN`: with path-style URLs on one regional endpoint (`S3_FORCE_PATH_STYLE`),
  staging's and production's buckets share that origin and one build serves both; otherwise build the web image once
  per storage origin.

## The images (ADR 0027)

- **Two images**, built from the repository's root: `apps/api/Dockerfile` and `apps/web/Dockerfile`. CI's images job
  builds both and runs each command (`pnpm images:smoke`). Build the web image with
  `--build-arg CACHE_VERSION=<the commit>`, so browsers drop a query cache saved by another build, and
  `--build-arg STORAGE_ORIGIN=<the bucket's origin>` (such as `https://s3.ap-south-1.amazonaws.com`), which its
  Content-Security-Policy allows for uploads and logos.
- **The api's image runs one command per service:** `api` (the default), `worker` and `console`, and the one-off
  `migrate`, `first-super-admin` and `demo`. Each runs as the `node` user and writes nothing to its own file system:
  run them read-only, with `/tmp` writable.
- **The web image rewrites nothing.** It is built without `API_ORIGIN`, so the load balancer routes (below); an `/api`
  request that reaches it is a 404.
- **Ports:** the api 3001 (`PORT`), the console 3002 (`CONSOLE_PORT`), the web app 3000 (`PORT`); the worker has none.

## Settings and secrets, per process

Checked at start-up by `apps/api/src/environment.ts` (with `service-variables.ts`) and `console-environment.ts`; a
process refuses to start on a missing or wrong one, naming it. ● needed, ○ optional, blank: never given to it.
Secrets come from the platform's secret manager as environment variables, never in an image (spec 12.3).

| Variable                                                         | api | worker | console | migrate | Secret |
| ---------------------------------------------------------------- | --- | ------ | ------- | ------- | ------ |
| `DATABASE_URL` (as `app_runtime`)                                | ●   | ●      | ●       |         | yes    |
| `DATABASE_PLATFORM_URL` (as `app_platform`)                      |     |        | ●       |         | yes    |
| `DATABASE_MIGRATOR_URL` (as `app_migrator`)                      |     |        |         | ●       | yes    |
| `DATABASE_POOL_SIZE`                                             | ○   | ○      | ○       |         |        |
| `DATABASE_TRANSACTION_MAX_WAIT_MS`, `..._TIMEOUT_MS` (slow host) | ○   | ○      | ○       |         |        |
| `BETTER_AUTH_SECRET`: one value for all three                    | ●   | ●      | ●       |         | yes    |
| `BETTER_AUTH_URL`, `APP_URL`: both the app's https address       | ●   | ●      | ●       |         |        |
| `TRUSTED_ORIGINS`                                                | ○   | ○      | ○       |         |        |
| `AUTH_RATE_LIMIT`, `AUTH_IP_ADDRESS_HEADERS`                     | ○   | ○      | ○       |         |        |
| `AUTH_TRUSTED_PROXIES`: the load balancer's addresses (Hosting)  | ●   | ●      | ●       |         |        |
| `S3_BUCKET`, `S3_REGION` (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`)  | ●   | ●      | ●       |         |        |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (the console's own)   | ●   | ●      | ●       |         | yes    |
| `SMTP_HOST`, `EMAIL_FROM_ADDRESS` (`SMTP_PORT`, `SMTP_SECURE`)   | ●   | ●      | ●       |         |        |
| `SMTP_USER`, `SMTP_PASSWORD`                                     | ○   | ○      | ○       |         | yes    |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`                              | ●   | ●      | ●       |         |        |
| `VAPID_PRIVATE_KEY`: the public key's pair (below)               | ●   | ●      | ●       |         | yes    |
| `GOOGLE_SHEETS_SERVICE_ACCOUNTS`: the Sheets sync's keys (below) | ●   | ●      |         |         | yes    |
| `SHEETS_HASH_KEY`: 32+ characters, never changed (below)         | ○   | ○      | ○       |         | yes    |
| `PORT` (3001)                                                    | ○   |        |         |         |        |
| `CONSOLE_PORT` (3002)                                            |     |        | ○       |         |        |
| `DEMO_ORGANIZATION_CODE`, `DEMO_PASSWORD`: both or neither       |     |        | ○       |         | yes    |

- **`NODE_ENV`** is `production` when unset, and production refuses http addresses, an off rate limit and a weak
  secret. Never set it to `development` in a deploy.
- **`AUTH_TRUSTED_PROXIES` is needed on both platforms:** their load balancers add to `X-Forwarded-For` rather than
  replace it (Hosting, below). The code can't tell, so it doesn't refuse to start without it.
- **One VAPID key pair per environment, kept for good:** make it once
  (`pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys`) and never replace it. Every browser's
  push subscription is tied to the public key, so a new pair silently drops them all. Production refuses
  `.env.example`'s pair.
- **Google Sheets** (the Sheets sync, ADR 0031; the owner's steps are in the spec's section 14):
  - Create a Google Cloud project with a company account, enable the **Google Sheets API** (the Drive API is not
    needed), create a **service account** with no roles (its email is the address agencies share their sheets with, so
    name it with that in mind) and download one **JSON key** for it.
  - `GOOGLE_SHEETS_SERVICE_ACCOUNTS` holds that key file as base64 on one line (`base64 -i key.json`), single-line JSON,
    or a list of several, on the api and the worker, never the console. Unset, the app says "Google Sheets isn't set up
    on this server" and the Connect button is off. A bad value stops the process with a message naming the variable.
  - `SHEETS_HASH_KEY` is at least 32 random characters (`openssl rand -base64 32`), required whenever the accounts are
    set, and given to the console as well (its erasure job writes the tombstones of a customer's sheet rows). It lives in
    the environment only, never in the database or a log, and is **never rotated**: changing it makes the claims and the
    tombstones stop matching, so keep it with the secrets that never change.
  - On Render: open `travel-crm-api`, Environment, add the variable as a secret, paste the base64 text, save and let
    the service redeploy; the api's and the worker's log say `Google Sheets: 1 service account` when it was read.
  - The worker may sleep (Render's free tier): it wakes when staff use the app and its first tick checks every sheet,
    so a sheet is as fresh as the worker is awake; **Sync now** checks at once. Keeping the worker awake makes it the
    promised two minutes. The console plays no part in checking sheets.
  - Add a second service account when one has about 80 connected sheets (Google allows 300 reads a minute for the
    project and 60 a minute per service account): repeat the steps and add its key to the list. Existing sheets stay with
    their first address.
  - Tell agencies in the help text that the address in the connect screen is ours, read only, and that removing it from
    the sheet's sharing stops the sync at once.
  - Locally, set both in `.env` (or the shell) to try a real sheet: `pnpm dev` and `pnpm product:up` pass them through.
- **The web app** needs nothing at run time: its image sets `NODE_ENV=production`, `HOSTNAME=0.0.0.0` and
  `PORT=3000`. Its build takes `CACHE_VERSION` and `STORAGE_ORIGIN` (The images, above).
- **One secret, three processes:** the console reads the api's session cookies, and the worker counts invite emails
  against the rate limits, whose key comes from `BETTER_AUTH_SECRET`.

## Routing at the load balancer (ADRs 0018, 0019)

| Path              | Goes to       | Why                                                       |
| ----------------- | ------------- | --------------------------------------------------------- |
| `/api/platform/*` | console, 3002 | the console's tRPC; this rule goes before the next one    |
| `/api/*`          | api, 3001     | Better Auth's sign-in and the organization app's tRPC     |
| `/p/*`            | api, 3001     | share links                                               |
| `/webhooks/*`     | api, 3001     | the webhook intake                                        |
| everything else   | web, 3000     | the app's pages, build files, manifest and service worker |

- **One address for everything** (spec 3): the app's https origin is `BETTER_AUTH_URL` and `APP_URL`, so cookies
  stay first-party and the api needs no CORS. Share links (`/p/*`) and the webhook intake (`/webhooks/*`) are the
  api's, not the web app's. `docker/Caddyfile` is this table, and `pnpm product:smoke` proves it path by path.
- **`/health` needs no public route:** the platform's health checks call each service on its own port (below). The
  local proxy sends it to the api, so the smoke run can ask through it.

## Health checks and stopping (spec 12.3)

| Service | Health check                                | On SIGTERM                                                             |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| api     | `GET /health` on 3001: `{ "status": "ok" }` | finishes open requests, closes its pools, exits 0                      |
| console | `GET /health` on 3002                       | the same, letting running jobs finish for up to 30 seconds             |
| worker  | none (no port): the platform watches it     | stops relaying, lets running jobs finish for up to 30 seconds, exits 0 |
| web     | `GET /sign-in` on 3000 (a static page)      | Next.js closes its server and exits 143                                |

- **A start that fails exits 1** before the health check can pass: a wrong role, a bucket it can't use, pg-boss, and
  for the console the platform role's grant. A broken deploy never turns healthy.
- **Give the worker and the console 35 seconds** between SIGTERM and SIGKILL. Where the platform allows less, their
  jobs are cut, which is safe (`apps/api/README.md`): the job runs again.

## Migrations: a one-off job before traffic (spec 12.3)

- **Run the api image's `migrate` once per release**, with `DATABASE_MIGRATOR_URL` alone, connected directly or
  through a session-mode pooler (Poolers, above), and move traffic to the new version only when it exits 0. It applies
  the pending migrations in order (`prisma migrate deploy`, under Prisma Migrate's advisory lock, which holds for its
  session, so two runs never overlap) and does nothing when none are pending.
- **Expand, migrate, contract.** The old version keeps serving while the new one's migrations apply, so a release's
  migrations must suit both: add a column as nullable or with a default (expand), ship the code that writes it, fill it
  in a later migration or job (migrate), and drop what the old code read only in a later release (contract). Never
  rename or retype a column in one step.
- **CI applies every migration to an empty Postgres 18** and finds no drift from the schema (`pnpm migrations:check`).
- **A migration that fails** is recorded as failed, and what it changed before it failed stays. First undo those
  partial changes by hand (the migration's SQL shows what they can be), then mark it rolled back, then fix it forward
  with a new migration. The image carries the Prisma CLI for that, with `DATABASE_MIGRATOR_URL` connected as for
  `migrate`:

      docker run --rm --env DATABASE_MIGRATOR_URL --entrypoint node --workdir /app/packages/db <the api image> \
        node_modules/prisma/build/index.js migrate resolve --rolled-back <the migration's name>

## The first super admin, plans and the demo (ADRs 0019, 0022)

- **Once per new database**, after the first `migrate`, **from an operator's own terminal, never as a platform job.**
  `first-super-admin` prints a temporary password on stdout, and a Cloud Run job's or an ECS task's stdout lands in
  the platform's logs, where anyone who can read them could sign in first and take the platform. Reach the database
  through its proxy (the Cloud SQL Auth Proxy, or SSM port forwarding to RDS), and run the api image with the
  console's settings, their database URLs pointing at the proxy (`host.docker.internal` instead of `localhost` on
  Docker Desktop, which has no host network):

      docker run --rm --network host --env-file <the console's settings> <the api image> \
        first-super-admin --email <address> --name <name>
      rm <the console's settings>

  The settings file holds the console's production secrets, so it goes as soon as the command has run. Then sign in
  with the temporary password straight away and replace it. It refuses once a super admin exists.

- **No plan is seeded:** the super admin creates the plans in the console before onboarding anyone.
- **Staging's demo:** set `DEMO_ORGANIZATION_CODE` and `DEMO_PASSWORD` on the console, which rebuilds the demo every
  night at 02:00 India time; the image's `demo` command builds it at once.

## Hosting: a serverless container platform in Mumbai (spec 12.3)

The owner chooses Google Cloud Run (`asia-south1`) or AWS ECS on Fargate (`ap-south-1`) before the first staging
deploy (Q6, Q11). Everything above holds on both; this is what differs. Until then, the pilot runs on one Oracle Cloud
server in Mumbai, with the same images under Docker Compose (`docker-compose.server.yml`), as
[runbook.md](runbook.md) describes.

|                     | Cloud Run (`asia-south1`)                                                                           | ECS on Fargate (`ap-south-1`)                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Routing by path     | an external Application Load Balancer, its URL map sending each path to a serverless NEG            | an Application Load Balancer, a listener rule per path to each target group |
| api, web            | services; both read the `PORT` Cloud Run sets (8080)                                                | services behind their target groups                                         |
| console             | a service with one instance always up and CPU between requests (its schedules); `CONSOLE_PORT=8080` | a service with one task                                                     |
| worker              | a worker pool: it has no port                                                                       | a service without a load balancer                                           |
| `migrate`           | a Cloud Run job from the api image                                                                  | a one-off task (`RunTask`) from the api's task definition                   |
| `first-super-admin` | never a job: an operator's terminal, through the Cloud SQL Auth Proxy (above)                       | never a task: an operator's terminal, through SSM port forwarding (above)   |
| Health checks       | startup and liveness probes: `/health` (api, console), `/sign-in` (web)                             | target group health checks on the same paths                                |
| SIGTERM to SIGKILL  | 10 seconds, fixed: a cut job runs again                                                             | `stopTimeout`: 35 seconds                                                   |
| Postgres 18         | Cloud SQL for PostgreSQL                                                                            | RDS for PostgreSQL                                                          |
| Secrets             | Secret Manager                                                                                      | Secrets Manager or Parameter Store                                          |
| Files               | S3, or Cloud Storage's S3-compatible API with HMAC keys (not yet tried)                             | S3                                                                          |
| Email               | Amazon SES's SMTP endpoint, or another SMTP service                                                 | Amazon SES's SMTP endpoint                                                  |
| Logs                | Cloud Logging                                                                                       | CloudWatch Logs                                                             |

- **A container health check** (ECS's, or Compose's) runs `node --eval` with `fetch`, as
  `docker-compose.product.yml` does: the images have no curl. The worker has no port to check.
- **The client's address.** Both load balancers add the address they saw to `X-Forwarded-For` rather than replace it,
  so set `AUTH_TRUSTED_PROXIES` to the load balancer's addresses (the ALB's subnets; Google's front ends) and check
  one sign-in's recorded address before launch (Sign-in behind the load balancer, above).

## HTTPS and headers (spec 12.4)

- **HTTPS only**, ended at the load balancer with a certificate it manages; plain http redirects. The api refuses to
  start in production with an http `BETTER_AUTH_URL`, `APP_URL` or `TRUSTED_ORIGINS`.
- **The web app sends the security headers itself** (`apps/web/security-headers.ts`: the Content-Security-Policy,
  two years of HSTS with subdomains, `nosniff`, framing denied, the referrer policy, the opener policy and the
  permissions policy), which the image smoke checks. The load balancer must pass them on, neither dropping nor
  repeating them, as `pnpm product:smoke` checks that the local proxy does.

## Backups and the quarterly restore (spec 12.3)

- **Daily backups with point-in-time restore**, switched on before the first paying organization: Cloud SQL's or
  RDS's automated backups.
- **How long backups are kept is the owner's to set** before the first paying organization, and to write here: the
  window in which a deletion or a bad migration can still be undone.
- **Files have no backup at all**, a risk the owner accepts in writing before the first paying organization, or
  replaces with a copy of the bucket. It is unversioned (Object storage, above) and copied nowhere, so a deleted or
  overwritten file, or a lost bucket, is gone for good, and a restore brings back the database alone: a file deleted
  since shows as missing.
- **Every quarter, practise a restore:** restore last night's backup to a new instance, run `migrate` against it
  (connected directly; nothing is pending), start a console on it (its start-up checks the roles and the grant), sign
  in, open an organization, then delete the instance. Write down how long it took.

## Logs (spec 12.3)

- **Each process writes one line per problem** to stderr, ids and codes only, never a person's data
  (`apps/api/README.md`, "The log"), and its start-up line to stdout. The platform keeps both.
- **The load balancer's access logs** keep the request's path, which for a password reset holds its token: keep them
  short-lived or strip that path (above).
- **Access logs must not record query strings for `/api/trpc/*` and `/api/platform/trpc/*`.** The web app posts every
  call, queries included, so a customer's phone, email or searched name stays in the body; a GET (tRPC's default, and
  what a test or a curl may still send) carries its input in the URL, where no erasure reaches it.
- **The web app's own page addresses hold no customer data,** so its access logs need no stripping for that: the lead
  list keeps its filters (ids and fixed values) in the address and its search text in the browser tab, never `?q=`
  (`apps/web/test/e2e/leads-add.spec.ts` checks every URL and Referer the browser sends).

## Still open before launch

- **The deploy pipeline** (spec 12.1). CI builds the images and runs them, but publishes nothing. Still to build: a
  push to the registry by digest, with OIDC and no long-lived keys; staging deployed from every merge to `main`;
  production only through an environment the owner approves; and a rollback that deploys the previous digests, never
  a down migration (expand, migrate, contract keeps the old version working).
- **CodeQL on a private repository needs GitHub Code Security** (the owner's): turn it on, or set the analysis's
  `upload: never` and keep its SARIF as a workflow artifact. Until then the CodeQL job fails at the upload.
- **Lighthouse's performance floor is 0.8 for now** (the owner's): it rises to 0.9 once CI's runs show the room. It
  measures the public pages alone (`/sign-in`, `/offline`); the signed-in pages come later, once a run can sign in.
- **A request id and the organization id on every log line** (spec 12.3): take the load balancer's trace header
  (`X-Cloud-Trace-Context` or `X-Amzn-Trace-Id`) as the request id.
- **Sentry** for errors from the web app, the api and the worker (spec 12.3), with source maps uploaded at build
  time: the api's bundle carries none.
- **A shared rate-limit store** before a second api instance (Sign-in behind the load balancer, above).
- **Turnstile** on public forms and after repeated failed sign-ins (spec 9.7), with the first public form.
- **The platform's own setup** (the load balancer, services, secrets, the database and bucket) once the owner has
  chosen, as code beside this repository.
- **A privacy policy, a data processing agreement and breach-response steps** before the first paying organization
  (spec 12.4).
