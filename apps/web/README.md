# @travel-crm/web

The organization app: a mobile-first Next.js PWA (spec 11). Screens only: every piece of data comes from the api over
HTTP, and the app imports the api's types, never its code.

## Run it

    pnpm db:up && pnpm db:migrate
    pnpm --filter @travel-crm/api-server dev       # the api on http://localhost:3001
    pnpm --filter @travel-crm/api-server worker    # PDFs, notifications, the outbox
    pnpm --filter @travel-crm/api-server console   # the platform console's api on http://localhost:3002
    pnpm --filter @travel-crm/web dev              # the app on http://localhost:3000, the console at /console

`/api/*` reaches the api on the same address the app was loaded from (spec 3), so cookies stay first-party and the
api needs no CORS. In development and the end-to-end tests a Next.js rewrite sends it to `API_ORIGIN` (default
`http://localhost:3001`), `/p/*` and `/webhooks/*` too, and `/api/platform/*` first to `CONSOLE_ORIGIN` (default
`http://localhost:3002`). Rewrites are fixed when the app is built: a deployment routes these paths at its load
balancer instead, and the api's `TRUSTED_ORIGINS` (or `BETTER_AUTH_URL`) must hold the app's address.
`STORAGE_ORIGIN` (default `http://localhost:9000` in development) is fixed at build time as well: the
Content-Security-Policy lets the browser upload to it and show the logo from it (ADR 0026).

## How it's put together

- `scripts/generate.ts` (Turborepo runs it before dev, build, typecheck, lint and test) writes
  `src/generated/brand.css`, the brand's colours as CSS variables, copies the brand's icons to `public/icons`, and
  bundles the service worker from `src/service-worker` into `public/sw.js`. The first two come from
  `@travel-crm/brand`; git keeps none of the three.
- `DESIGN.md` at the repository root holds the design rules. Its palette must equal `brand.colours`
  (`test/design-tokens.test.ts`).
- `security-headers.ts`: the headers every response carries.
- `src/data/`: the tRPC client, the TanStack Query cache saved to IndexedDB, the sign-in calls (`auth-client.ts`), and
  signing out (`session.ts`), which wipes the cache here and in other tabs.
- `src/session/` and `src/shell/`: the session gate (me.get, pending steps), the navigation by permission, banners.
- `src/account/`, `src/organization/`: the account and organization screens; `src/pwa/`, `src/service-worker/`: the
  installable app, its offline shell and its pushes.
- `src/console/` (routes in `src/app/console/`): the platform console, with its own query cache and tRPC client
  (ADR 0025).
- `src/subscription/`: the subscription's banners and locked screens, and `useWriteAccess()`; `src/business/`: the
  business profile and the setup checklist; `src/files/`: uploads straight to storage and the reusable
  `AttachmentsPanel`; `src/branding/`, `src/documents/`: the branding with its logo, the sample quotation, issued
  documents and their share links; `src/notifications/`: the bell, the notification choices and push on this device;
  `src/audit/`: the audit log viewer (ADR 0026).
- `src/i18n/messages/en-IN/`: every word on screen, one file per feature.
- `test/`: Vitest unit and component tests; `test/e2e/`: Playwright journeys. `pnpm --filter @travel-crm/web e2e`
  starts a throwaway Postgres, MinIO and Mailpit, the api, the worker, the console process and a fresh build on free
  ports (Docker must be running; install Chromium once with `pnpm --filter @travel-crm/web exec playwright install
chromium`).
- `turbopack/workspace-imports-loader.cjs`: our packages import `./file.js` for `./file.ts`, which Turbopack can't
  map yet (vercel/next.js#82945); the loader drops the `.js` for files under `packages/*/src`. Remove it when
  Turbopack resolves such imports itself.
