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

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
