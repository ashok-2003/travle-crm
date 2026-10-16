# travel-crm

The platform that runs Indian travel agencies: leads, WhatsApp, quotes, departures, suppliers and GST accounts.

## Run it locally

You need Node 24 (`nvm install 24`), pnpm 12 and Docker.

    nvm use
    pnpm install
    cp .env.example .env    # then uncomment DEMO_ORGANIZATION_CODE and DEMO_PASSWORD for the demo agency
    pnpm services:up        # Postgres on :55432, MinIO on :59000 (console :59001), Mailpit on :58025
    pnpm db:migrate
    pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build

`.env.example` has everything development needs, including `NODE_ENV=development`. Without `NODE_ENV` the api assumes
production and refuses to start on http or with the example secret. An `.env` made before a plan added settings is
missing them, and the api refuses to start: copy `.env.example` again.

Then start the four processes, each in its own terminal:

    pnpm --filter @travel-crm/api-server dev       # the api, http://localhost:3001
    pnpm --filter @travel-crm/api-server worker    # jobs: PDFs, email, push, webhooks
    pnpm --filter @travel-crm/api-server console   # the platform console: its api on :3002, the lifecycle, purges, the demo reset
    pnpm --filter @travel-crm/web dev              # the web app, http://localhost:3000

Make the demo agency once (it also resets every night at 02:00 India time while the console runs):

    pnpm --filter @travel-crm/api-server demo

Open http://localhost:3000, choose "Organization code", and sign in with code `DEMO`, username `asha`
(Owner), `ravi` (Sales) or `meena` (Operations), and the password in `DEMO_PASSWORD`. Emails the app sends (password
resets, invites) land in Mailpit at http://localhost:58025.

To make the first platform super admin, who signs in at http://localhost:3000/sign-in and lands on the console:

    pnpm --filter @travel-crm/api-server first-super-admin -- --email you@example.com --name "Your Name"

A database created before plan 4 lacks the grant the console needs to step into one organization. Add it once:

    scripts/dev/compose.sh exec postgres psql -U postgres -d travel_crm -c "GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE;"

To run every check (format, typecheck, lint, tests, journeys, import rules):

    pnpm check

`pnpm check` needs Docker running: the tests start throwaway containers with Testcontainers. Stop the local
services with `pnpm db:down`.

### Everything at once

    pnpm dev

starts Postgres, MinIO and Mailpit (Docker), applies the migrations, then runs the api (http://localhost:3001), the
worker, the console (http://localhost:3002) and the web app (http://localhost:3000) together, their output side by
side. Ctrl+C stops the four; `pnpm db:down` stops the services.

### Each checkout's own containers

Every script that runs Compose (`pnpm dev`, `services:up`, `db:up`, `db:down`, `product:up`, `product:down`) goes
through `scripts/dev/compose.sh`, which names the project after the checkout's full path: `travel-crm-<checksum>`, and
`travel-crm-<checksum>-product` for the product. So `pnpm dev` in a second clone or worktree never recreates the
first's containers or touches its data. `COMPOSE_PROJECT_NAME`, in the environment or in `.env`, names the project
instead: **a checkout whose containers were made before** (`travel-crm-postgres-1` and the rest) keeps them, and their
data, with `COMPOSE_PROJECT_NAME=travel-crm` in its `.env`. Run any other Compose command through the helper too
(`scripts/dev/compose.sh ps`, `scripts/dev/compose.sh --product logs`). Every port is this computer's alone
(127.0.0.1), and the same in every checkout, so stop the other checkout's services first (`pnpm db:down` there).

### The demo agency

Set `DEMO_ORGANIZATION_CODE=DEMO` and a `DEMO_PASSWORD` of 12 characters or more in `.env` (both are in
`.env.example`, commented out), then run

    pnpm demo

It builds the shared demo agency in your database: its business profile, the starter roles and three staff, on the
demo's own plan. Sign in at http://localhost:3000/sign-in with the organization code `DEMO`, a username (`asha` the
Owner, `ravi` in Sales or `meena` in Operations) and `DEMO_PASSWORD`. Run it again for a fresh demo.

### The whole product in Docker

    pnpm product:up      # builds both images, starts everything behind a proxy, builds the demo
    pnpm product:down    # stops it, keeping its data

runs the images CI builds, routed as a deploy's load balancer will (`docker-compose.product.yml`), at
http://localhost:58080: sign in with `DEMO`, `asha` and `demo-only-password`. It is a project of its own, so it runs
beside `pnpm dev`; `pnpm product:down --volumes` drops its data too.
`pnpm images:smoke` and `pnpm product:smoke` check the images and the product end to end, as CI does.

### Mail and files

Email and files stay on your computer: Mailpit catches every email, and MinIO keeps every file.

|                                                          | `pnpm dev`             | `pnpm product:up`      |
| -------------------------------------------------------- | ---------------------- | ---------------------- |
| Mail (Mailpit)                                           | http://localhost:58025 | http://localhost:58081 |
| Files (MinIO's console: `minio-dev`, `minio-dev-secret`) | http://localhost:59001 | http://localhost:58091 |

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `docs/deploy-checklist.md`: what a hosted deploy must get right, process by process
- `apps/web/`: the web app, a mobile-first PWA ([README](apps/web/README.md))
- `apps/api/`: the api server, the worker and the platform console's process ([README](apps/api/README.md))
- `packages/api/`: tRPC routers and request checks ([README](packages/api/README.md))
- `packages/contracts/`: API input and output schemas ([README](packages/contracts/README.md))
- `packages/domain/`: business rules by module ([README](packages/domain/README.md))
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `scripts/`: the Docker smoke runs and CI's own checks; `docker-compose.product.yml` and `docker/`: the product in
  Docker
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
