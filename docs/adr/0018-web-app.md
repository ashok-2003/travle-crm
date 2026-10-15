# 0018: The web app

Date: 2026-10-15 · Status: accepted · Implements spec sections 3, 11 and 12.1 (gate 6) for the organization app

## Decision

- **Next.js 16 (App Router, Turbopack), built as a standalone Node server** for a container (spec 12.3). Screens are
  client components fed by tRPC's TanStack Query integration; server-rendered HTML holds no organization data, so
  every page is a static shell the service worker may keep for offline use.
- **Same origin.** The browser calls `/api/*` on the address it loaded the app from (spec 3). In development and the
  journeys a Next.js rewrite sends it to `API_ORIGIN`; rewrites are fixed at build time, so a deployment routes
  `/api/*` to the api at its load balancer. The api's `BETTER_AUTH_URL` is the app's address (browsers reach the api
  there), and its trusted origins hold it, so its origin and JSON checks pass with no CORS.
- **The api's types only.** The app imports `type AppRouter`; at run time it may use only the brand package, the
  contracts' Zod schemas (forms validate with the api's own rules) and the kernel's formatting.
  dependency-cruiser enforces it (`web-reaches-the-api-over-http`).
- **Styling from the brand.** `scripts/generate.ts` writes the brand's colours as CSS variables and Tailwind colours;
  Tailwind's own palette is switched off and a test refuses colour literals. shadcn/ui (`radix-nova`, Radix, Lucide)
  maps its variables onto the brand's roles; DESIGN.md holds the rules and its palette must equal `brand.colours`.
- **Fonts served by us.** Figtree, EB Garamond and IBM Plex Mono from the Fontsource packages through `next/font/local`
  (preloaded, with size-matched fallbacks). Each has a Latin file and a Latin-extended file limited by unicode-range
  (the second has ₹). Noto fonts for nine Indian scripts load only when a page shows that script. No Google Fonts.
- **The cache.** Queries are fresh for 30 seconds and refresh when the window regains focus or the device reconnects;
  refusals are never retried. The cache is saved to IndexedDB (idb-keyval), keyed by build, shown at once on the next
  visit and then refreshed. Signing out ends the session, empties the cache and its saved copy, and tells the app's
  other tabs (BroadcastChannel), which do the same. A 401 does it too; a pending step sends the person to take it.
- **Sign-in calls** go to Better Auth's endpoints and our `/api/auth/sign-in/org` through a small typed client that
  keeps nothing of Better Auth's user object: for staff without email it holds the placeholder address, which is
  never shown. Who is signed in comes from `me.get` only.
- **Words** go through next-intl (spec 9.6) without i18n routing: one locale, `en-IN`, one message file per feature,
  and the api's refusal reasons mapped to sentences in `errors.json`.
- **Security headers** on every response, with a Content-Security-Policy limited to our own origin. Scripts and styles
  allow `'unsafe-inline'`: Next.js inlines its boot scripts, and nonces would make every page render per request,
  which the offline shell can't use. React escapes everything it renders, and the app renders no user HTML.
- **The PWA.** A manifest from the brand package; a hand-written service worker (bundled by esbuild) keeps build files
  and visited pages, falls back to an offline page, and never touches `/api`.
- **Tests.** Vitest in jsdom for logic and components. Playwright journeys on a phone and a desktop against the real
  api and a throwaway Postgres (the same setup as the api's tests), on free ports, with an axe check on each screen.

## Context

- **Turbopack doesn't resolve `./file.js` to `./file.ts`** (vercel/next.js#82945), which every package of ours
  imports, as Node's module resolution wants. A ten-line Turbopack loader drops the `.js` from relative imports in
  files under `packages/*/src`. Remove it when Turbopack resolves them itself.
- **eslint-config-next isn't used:** it bundles eslint-plugin-react, jsx-a11y and import, whose peers stop at ESLint 9.
  The app uses Next.js's own plugin and React's hook rules on top of the shared strict config; axe checks
  accessibility in the journeys instead.
- **Lighthouse 12 removed its PWA category,** so spec 12.1's "Lighthouse PWA score" became installability checks in
  the journeys. A Lighthouse run for performance and accessibility belongs to the release pipeline.
- **Serwist** (which Next.js's docs name) works with Turbopack only through a route handler that rebuilds the worker
  with esbuild at request time. A small worker of our own is easier to read and test.

## Consequences

- The Docker image (plan 5) needs a load-balancer rule for `/api/*`, or a runtime proxy route if the platform can't
  route by path.
- Behind a load balancer, `AUTH_TRUSTED_PROXIES` must be set as for the api alone: the rewrite forwards
  `x-forwarded-for` unchanged.
- Adding a screen means a message file entry, a navigation item if it is a destination, and a journey.
