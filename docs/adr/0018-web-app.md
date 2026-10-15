# 0018: The web app

Date: 2026-10-15 · Status: accepted · Implements spec sections 3, 11 and 12.1 (gate 6) for the organization app

## Decision

- **Next.js 16 (App Router, Turbopack), built as a standalone Node server** for a container (spec 12.3). Screens are
  client components fed by tRPC's TanStack Query integration; server-rendered HTML holds no organization data, so
  every page is a static shell the service worker may keep for offline use.
- **Same origin.** The browser calls `/api/*` on the address it loaded the app from (spec 3). In development and the
  journeys a Next.js rewrite sends it to `API_ORIGIN`; rewrites are fixed at build time, so a deployment routes
  `/api/*` to the api at its load balancer. A production build without `API_ORIGIN` has no rewrite at all (an `/api`
  request reaching the app is a 404, never one sent to localhost), and one that isn't an http(s) origin fails the
  build. The api's `BETTER_AUTH_URL` is the app's address (browsers reach the api there), and its trusted origins hold
  it, so its origin and JSON checks pass with no CORS.
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
  refusals are never retried. Successful queries are saved to IndexedDB (idb-keyval), keyed by build and recorded
  with whose they are (`me.get`'s user and organization); mutations never are, since their variables can hold a
  temporary password. Opening a page asks `me.get` once and waits for it however long it takes, then restores the
  copy only for that person and refreshes it. Only when the device reports offline (`navigator.onLine`, or
  TanStack's `onlineManager`) does the copy show before `me.get` answers. It shows at once then, and is dropped the
  moment `me.get` names someone else. Online, a slow or failing `me.get` shows nothing saved. So online the copy
  shows after one small request rather than at once: the price of never showing one person's data to another, or
  to a session that has ended.
- **Wiping.** A wipe stops the page saving first (the subscription ends, and a save waiting in the throttle can't
  land), then empties the caches, clears the IndexedDB store, and changes a data-free generation in localStorage that
  voids any copy another tab is still about to write. A sign-out leaves the service worker's page copies: it keeps
  only shells it fetched without cookies, which hold no organization data, and its offline page must outlive a
  sign-out.
- **Signing out** blanks the screen at once and wipes the device. It tells the app's other tabs (BroadcastChannel),
  which wipe too and go to sign-in unless they show a signed-out screen (sign-in, reset, offline). It records a
  data-free marker that a sign-out is owed, then loads the sign-in page without waiting for the api. The call to the
  api is sent with `keepalive`, so it still reaches the api after the page has gone. But that page can no longer
  hear the answer, so the marker usually reaches the sign-in page. That page settles it again before anything asks
  who is signed in, and so does coming back online; a second sign-out of a session already ended is harmless. A
  sign-in waits for a settle call under way, because that answer deletes the session cookie and must not land after
  the new one. A sign-in that succeeds clears the marker (`finishSignIn`), so nothing can sign the new session out on
  the old one's behalf. A 401 wipes and returns the person to sign in, then to where they were; a pending step sends
  them to take it.
- **Sign-in calls** go to Better Auth's endpoints and our `/api/auth/sign-in/org` through a small typed client that
  keeps nothing of Better Auth's user object: for staff without email it holds the placeholder address, which is
  never shown. Who is signed in comes from `me.get` only.
- **Words** go through next-intl (spec 9.6) without i18n routing: one locale, `en-IN`, one message file per feature,
  and the api's refusal reasons mapped to sentences in `errors.json`.
- **Security headers** on every response, with a Content-Security-Policy limited to our own origin, and
  `upgrade-insecure-requests` outside development. The reset-password and two-factor pages also send
  `Referrer-Policy: strict-origin`, so a token in their address never travels as a Referer, not even through the
  `/api` rewrite into the api's logs. Not `no-referrer`: under it a browser's own form POST (not `fetch()`, whose
  default mode keeps the real `Origin`) sends `Origin: null`, which the api's origin checks refuse; `strict-origin`
  keeps the token out either way.
- **`'unsafe-inline'` is an accepted risk.** Scripts and styles allow it: Next.js inlines its boot scripts, and nonces
  would make every page render per request, which the offline shell can't use. That leaves one guard against
  injected script: React escapes everything it renders, and the app never renders HTML from a string, which
  `test/no-inner-html.test.ts` enforces. What still limits an injection: `connect-src`, `form-action` and
  `base-uri` are our own origin only, `object-src` is none, and framing is refused. Revisit if the app ever needs
  to show rich text: sanitize it on the server, or move to nonces.
- **The PWA.** A manifest from the brand package; a hand-written service worker (bundled by esbuild) keeps a shell of
  every static page, which it fetches itself without cookies, the build files those shells name, and the icons. It
  never keeps a page load's own answer, so nothing a signed-in request returned is stored. It falls back to an
  offline page, and never touches `/api`.
- **Tests.** Vitest in jsdom for logic and components. Playwright journeys on a phone and a desktop against the real
  api and a throwaway Postgres (the same setup as the api's tests), on free ports, with an axe check after every
  journey, on the screen it ends on (an automatic fixture; a journey opts out only with a written reason). Turbo runs
  the journeys after the web app's typecheck and lint, because `next build` rewrites `.next/types` while those read
  it; a separate `distDir` would make Next.js rewrite `tsconfig.json` on every run.

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
- A screen that shows a secret it got from a query (a setup link, backup codes) sets `meta: { persist: false }`, so
  the saved copy never holds it.
- `includeSubDomains` in HSTS binds every subdomain of the app's domain to https: choose the domain with that in mind.
