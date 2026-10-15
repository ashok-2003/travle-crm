# travel-crm

The platform that runs Indian travel agencies: leads, WhatsApp, quotes, departures, suppliers and GST accounts.

## Run it locally

You need Node 24 (`nvm install 24`), pnpm 12 and Docker.

    nvm use
    pnpm install
    cp .env.example .env
    pnpm db:up        # Postgres 18 on localhost:55432
    pnpm db:migrate
    pnpm check        # typecheck, lint, tests, import rules

`pnpm check` needs Docker running: the tests start a throwaway Postgres with Testcontainers.

`.env.example` has everything development needs, including `NODE_ENV=development`. Without `NODE_ENV` the api assumes
production and refuses to start on http or with the example secret.

Then start the api:

    pnpm --filter @travel-crm/api-server dev
    curl http://localhost:3001/health

### Everything at once

    pnpm dev

starts Postgres, MinIO and Mailpit (Docker), applies the migrations, then runs the api (http://localhost:3001), the
worker, the console (http://localhost:3002) and the web app (http://localhost:3000) together, their output side by
side. Ctrl+C stops the four; `pnpm db:down` stops the services.

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
beside `pnpm dev`; `docker compose --file docker-compose.product.yml down --volumes` drops its data too.
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
- `apps/api/`: the api server ([README](apps/api/README.md))
- `packages/api/`: tRPC routers and request checks ([README](packages/api/README.md))
- `packages/contracts/`: API input and output schemas ([README](packages/contracts/README.md))
- `packages/domain/`: business rules by module ([README](packages/domain/README.md))
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `scripts/`: the Docker smoke runs and CI's own checks; `docker-compose.product.yml` and `docker/`: the product in
  Docker
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
