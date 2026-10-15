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

To make the first platform super admin (for the console's api; its screens come in plan 5B):

    pnpm --filter @travel-crm/api-server first-super-admin -- --email you@example.com --name "Your Name"

A database created before plan 4 lacks the grant the console needs to step into one organization. Add it once:

    docker compose exec postgres psql -U postgres -d travel_crm -c "GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE;"

To run every check (format, typecheck, lint, tests, journeys, import rules):

    pnpm check

`pnpm check` needs Docker running: the tests start throwaway containers with Testcontainers. Stop the local
services with `pnpm db:down`.

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `apps/web/`: the web app, a mobile-first PWA ([README](apps/web/README.md))
- `apps/api/`: the api server, the worker and the platform console's process ([README](apps/api/README.md))
- `packages/api/`: tRPC routers and request checks ([README](packages/api/README.md))
- `packages/contracts/`: API input and output schemas ([README](packages/contracts/README.md))
- `packages/domain/`: business rules by module ([README](packages/domain/README.md))
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
