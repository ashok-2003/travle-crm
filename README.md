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

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `apps/api/`: the api server ([README](apps/api/README.md))
- `packages/api/`: tRPC routers and request checks ([README](packages/api/README.md))
- `packages/contracts/`: API input and output schemas ([README](packages/contracts/README.md))
- `packages/domain/`: business rules by module ([README](packages/domain/README.md))
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
