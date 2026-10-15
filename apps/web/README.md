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
- `turbopack/workspace-imports-loader.cjs`: our packages import `./file.js` for `./file.ts`, which Turbopack can't
  map yet (vercel/next.js#82945); the loader drops the `.js` for files under `packages/*/src`. Remove it when
  Turbopack resolves such imports itself.
