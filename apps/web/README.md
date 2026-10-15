# @travel-crm/web

The organization app: a mobile-first Next.js PWA (spec 11). Screens only: every piece of data comes from the api over
HTTP, and the app imports the api's types, never its code.

## Run it

    pnpm db:up && pnpm db:migrate
    pnpm --filter @travel-crm/api-server dev    # the api on http://localhost:3001
    pnpm --filter @travel-crm/web dev           # the app on http://localhost:3000

`/api/*` reaches the api on the same address the app was loaded from (spec 3), so cookies stay first-party and the
api needs no CORS. In development and the end-to-end tests a Next.js rewrite sends it to `API_ORIGIN` (default
`http://localhost:3001`). Rewrites are fixed when the app is built: a deployment routes `/api/*` to the api at its
load balancer instead, and the api's `TRUSTED_ORIGINS` (or `BETTER_AUTH_URL`) must hold the app's address.

## How it's put together

- `scripts/generate.ts` (Turborepo runs it before dev, build, typecheck, lint and test) writes
  `src/generated/brand.css`, the brand's colours as CSS variables, and copies the brand's icons to `public/icons`.
  Both come from `@travel-crm/brand`; git keeps neither.
- `DESIGN.md` at the repository root holds the design rules. Its palette must equal `brand.colours`
  (`test/design-tokens.test.ts`).
- `security-headers.ts`: the headers every response carries.
- `src/data/`: the tRPC client, the TanStack Query cache saved to IndexedDB, the sign-in calls (`auth-client.ts`), and
  signing out (`session.ts`), which wipes the cache here and in other tabs.
- `src/session/` and `src/shell/`: the session gate (me.get, pending steps), the navigation by permission, banners.
- `src/account/`, `src/organization/`: the account and organization screens; `src/pwa/`, `src/service-worker/`: the
  installable app and its offline shell.
- `src/i18n/messages/en-IN/`: every word on screen, one file per feature.
- `test/`: Vitest unit and component tests; `test/e2e/`: Playwright journeys. `pnpm --filter @travel-crm/web e2e`
  starts a throwaway Postgres, the api and a fresh build on free ports (Docker must be running; install Chromium
  once with `pnpm --filter @travel-crm/web exec playwright install chromium`).
- `turbopack/workspace-imports-loader.cjs`: our packages import `./file.js` for `./file.ts`, which Turbopack can't
  map yet (vercel/next.js#82945); the loader drops the `.js` for files under `packages/*/src`. Remove it when
  Turbopack resolves such imports itself.
