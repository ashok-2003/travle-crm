# Foundation 05A: The Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is built for parallel execution: after the four groundwork tasks (G1-G4), the three tracks (A, O, P) run at the same time, each in its own git worktree, and the Integration task runs last.

**Goal:** A mobile-first Next.js PWA in `apps/web` on the brand's tokens and DESIGN.md, talking to plan 2's real api through tRPC and TanStack Query with an IndexedDB cache wiped on sign-out, with every account screen (both sign-ins, the first-login password change, two-factor setup and challenge, password reset) and the staff, roles and settings screens, proven by unit tests and Playwright journeys against the real api.

**Architecture:**
- `apps/web` (`@travel-crm/web`) is a Next.js 16 App Router app built as a standalone Node server for a container. Screens are client components: data comes only from tRPC's TanStack Query integration, and server-rendered HTML holds no organization data, so the service worker can keep pages for offline use.
- The browser calls `/api/*` on the address it loaded the app from (spec 3). A Next.js rewrite sends it to `API_ORIGIN` in development and in the journeys; a deployment routes `/api/*` to the api at the load balancer. The api's trusted origin is the app's address, so plan 2's origin and JSON checks pass with no CORS.
- The app imports `type AppRouter` from `@travel-crm/api` and nothing else of the api's code; at run time it uses only `@travel-crm/brand`, the contracts' Zod schemas and the kernel's formatting (a dependency-cruiser rule).
- Styling: Tailwind 4 with a theme generated from `@travel-crm/brand` (Tailwind's own palette switched off), shadcn/ui (`radix-nova`) mapped onto the brand's roles, the brand's fonts served by us through `next/font/local`, and Noto fallbacks for Indian scripts.
- Words go through next-intl (one locale, `en-IN`), one message file per feature, so the tracks never edit each other's words.

**Tech Stack:**
- Plans 1-3's stack: Node 24, pnpm 12.11.2, Turborepo 2.11.8, TypeScript 6.0.3, Prisma 7.10.0, Postgres 18, Vitest 5.0.4, Testcontainers 12.2.1, ESLint 10.12.0, dependency-cruiser 18.6.0, better-auth 1.7.7, tRPC 11.19.0, Zod 4.6.7, React 19.3.0 (catalog), tsx 4.23.15, esbuild 0.28.2 (already in the lockfile through tsx).
- New: next 16.4.0 (see the security note in Global Constraints), @next/eslint-plugin-next 16.4.0, eslint-plugin-react-hooks 7.1.1; tailwindcss and @tailwindcss/turbopack 4.3.3; the shadcn CLI 4.21.4 with what it installs (radix-ui 1.8.1, class-variance-authority 0.7.1, cn 0.4.0, lucide-react 1.56.0, tw-animate-css 1.4.0, sonner 2.0.8, input-otp 1.5.0); @tanstack/react-query, @tanstack/react-query-persist-client and @tanstack/query-async-storage-persister 5.104.2; @trpc/client and @trpc/tanstack-react-query 11.19.0; idb-keyval 6.3.0; next-intl 4.14.9; react-hook-form 7.90.0, @hookform/resolvers 5.9.1; uqr 0.1.3 (QR codes); the Fontsource packages 5.3.0 (`@fontsource-variable/figtree`, `eb-garamond`, nine Noto families; `@fontsource/ibm-plex-mono`); tests: jsdom 30.1.2, @testing-library/react 16.3.3, @testing-library/user-event 14.6.8, @testing-library/jest-dom 7.0.1, fake-indexeddb 6.2.5, @playwright/test 1.64.0, @axe-core/playwright 4.13.0.

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md`, sections 3 (the request path, same origin), 6 (sign-in and permissions, as screens), 10 (the brand package's tokens and icons), 11 (the frontend shell) and 12.1 (the CI gates, here: typecheck, lint, import rules, the product-name check, unit tests and Playwright journeys), with `DESIGN.md` (committed in Task G1) as the design rules. This is plan 5A, the first part of plan 5 of the Foundation:

1. Repo and data isolation (done; merged to `main`)
2. API and identity (done; merged to `main`)
3. Shared services (on `foundation/03-shared-services`, integrating)
4. Platform and subscriptions (planned in parallel; API and domain only)
5. Web app and release: **5A, this plan** (the web foundation); later parts add the platform console, the bell, uploads, share links, the audit viewer, Docker images and the release pipeline.

**How this plan was checked.**
- Every file in it was written and run in a scratch clone of `foundation/03-shared-services` at `b47f170` (plan 3's tracks merged, its Task I1 done; Tasks I2-I4 not yet). The groundwork tasks were built there in order, then each track in its own clone from Task G4's commit, at the same time, then the tracks were merged in the order A, O, P (each merge textually clean) and the Integration task built on top.
- Every task's gate was green when its commit was made, including the Playwright journeys against the real api and a throwaway Postgres. After the Integration task, `pnpm check` (format, typecheck, lint, every package's tests, the journeys, the import rules) was green: 29 Turborepo tasks, 1,061 unit and integration tests, 63 journeys passed and 1 skipped (the prefetch journey on the phone project).
- The code blocks are the committed files after Prettier and ESLint, copied from the commits by script and compared with them byte for byte. Each track's section was checked the same way against its own commits.
- The shadcn components are written by the shadcn CLI from the registry, as the owner asked; the ones this plan changes are given in full, so a registry update can't change them unnoticed.

---

## Shared files and merge notes

The plan works in its own worktrees, on branches made from `foundation/03-shared-services`, while plan 3's integration
finishes there. Almost everything it writes is new, under `apps/web/`. These files outside `apps/web` change, each
with the exact change in the task named:

| File | Task | Change |
| --- | --- | --- |
| `DESIGN.md` (root) | G1 | new: the owner's first draft, formatted by Prettier |
| `packages/brand/src/brand.ts` | G1 | the palette becomes DESIGN.md's: `muted` `#6b6b6b`; new `inputBorder`, `actionTint`, `onAction`, `moneyTint`; status colours become `{ dot, fill, ink }` with a `neutral` set. Nothing outside the brand package reads the status colours today |
| `packages/brand/src/index.ts`, `packages/brand/package.json`, `packages/brand/README.md` | G1 | `brandAssets` (absolute file paths, built with `node:path` at import) moves from the main entry to a new `@travel-crm/brand/files` export, so the main entry is browser-safe. Only the brand package and the web app's build script use `brandAssets` |
| `packages/brand/test/{assets,icons}.test.ts` | G1 | import `brandAssets` from `../src/assets.js` |
| `packages/brand/test/{contrast,browser-safe}.test.ts` | G1 | new |
| `pnpm-workspace.yaml` | G1, G3 | catalog gains `react-dom` and `@types/react-dom` 19.3.0 (G1); `allowBuilds` denies `@parcel/watcher` and `@swc/core` (next-intl's extractor) and `permissions` declines `@trpc/client`'s and `@trpc/tanstack-react-query`'s agent skills (G3) |
| `.dependency-cruiser.cjs` | G1, G4 | `.tsx` resolved; the `@/` alias read from `apps/web/depcruise-aliases.cjs`; `no-orphans` skips Next.js's route files and the Turbopack loader; two rules for the web app (G1); `apps/web/public/` excluded (G4) |
| `packages/contracts/src/identity/me.ts`, `packages/domain/src/identity/access.ts`, `apps/api/test/request-checks.test.ts` | G3 | `me.get` returns `organization.timeZone` (the web app shows dates in it). Plan 4 may also add fields to `meOutput`: put them beside it |
| `package.json` (root) | G4 | a new `e2e` script; `check` adds `e2e` to its Turborepo run |
| `turbo.json` | G4 | a new `e2e` task |
| `.prettierignore` | G4 | the web app's generated `public/sw.js` and Playwright's output folders |
| `CLAUDE.md` | I1 | a new last section, "The web app" (commands and rules). Nothing else in the file changes |
| `docs/adr/README.md`, `docs/adr/0018-web-app.md` | I1 | one new row; one new ADR |
| `pnpm-lock.yaml` | every task that adds a package | regenerate with `pnpm install` after merging; never merge it by hand |

**Merging after plan 3.**
- **Order:** merge plan 3 into `main` first, then this plan's branch `foundation/05a-web`. Every file above except
  `pnpm-lock.yaml` merges textually, as long as plan 3's Tasks I2-I4 haven't touched the same lines; the list shows
  which lines this plan touches. Resolve `pnpm-lock.yaml` by taking `main`'s and running `pnpm install`.
- **Plan 3's Task I2 makes the api need more settings** (S3, SMTP, VAPID, `APP_URL`). The journeys' api already
  receives harmless values for all of them (`apps/web/test/e2e/support/servers.ts`), so they keep running after the
  merge. Re-run `pnpm check` on the merge: if Task I2's final environment checks something these values fail, fix
  them there.
- **Plan 3's Task I3 (password reset by email) is not merged yet.** Track A builds the forgot and reset screens against
  its plan text and tests them with a fake api; before I3, the api answers the reset request with
  `RESET_PASSWORD_DISABLED`, which the screen explains. A journey through the real email (Mailpit) is owed after I3.
- **Plan 4** leaves `meOutput` alone (agreed with its planner), so `organization.timeZone` merges cleanly. Plan 4 owns
  the organization settings api (lead's ruling); 5A's settings screen shows only what plan 2's routers serve (the
  two-factor requirement, the organization code). Names agreed with plan 4's planner, for the later plan-5 parts:
  `organization.profile.get/update`, `organization.branding.get/update`, `organization.setup.get` (settings:manage);
  `subscription.get` (any member, every lifecycle state: `status`, `access`, `planName`, `modules`, `trialEndsOn`,
  `paidThrough`, `nextChangeOn`, `limits`); refusals `ORGANIZATION_READ_ONLY`, `ORGANIZATION_SUSPENDED`,
  `ORGANIZATION_CANCELLED` and `FEATURE_LOCKED`/`MODULE_NOT_ON_PLAN`; `planModuleOf(moduleOf(permission))`; the
  console's own endpoint `/api/platform/trpc` (`PlatformRouter`, port 3002 locally). Plan 4's Owner invite links to
  `/reset-password?token=…`, which Track A builds.
- **Setting up for a deploy** (plan 5's release part): route `/api/*` to the api at the load balancer, set the api's
  `BETTER_AUTH_URL` (or `TRUSTED_ORIGINS`) to the app's address, and `AUTH_TRUSTED_PROXIES` as plan 3 says: the
  rewrite and the load balancer pass `x-forwarded-for` on unchanged.

## Rulings made in planning

Each with why, and the cost if it is wrong. The tracks' own rulings are at the top of each track.

- Ruling: the browser reaches the api through a Next.js rewrite of `/api/*` to `API_ORIGIN` in development and the
  journeys, and through a load-balancer rule when deployed — spec 3 says exactly this; a runtime `proxy.ts` rewrite
  was tried and leaks the api's internal address in an `x-middleware-rewrite` response header and buffers bodies — cost
  if wrong: a platform that can't route by path needs a runtime proxy route (one file) or a build per environment.
- Ruling: Turbopack, with a ten-line loader that drops `.js` from relative imports in `packages/*/src`, not webpack —
  Turbopack is Next 16's builder and Tailwind's own loader targets it; it doesn't map `./file.js` to `./file.ts` yet
  (vercel/next.js#82945) — cost if wrong: `next build --webpack` with `experimental.extensionAlias` and
  `@tailwindcss/postcss`, a config change.
- Ruling: `brandAssets` moves from `@travel-crm/brand` to `@travel-crm/brand/files` — it builds paths with `node:path`
  and `import.meta.dirname` at import, which crashed Turbopack's server bundle and can't run in a browser; only the
  brand package and the web app's build script use it — cost if wrong: none found; a later import from the main entry
  fails to compile.
- Ruling: the brand package takes DESIGN.md's palette, and a web test keeps the two equal — the owner fixed the
  palette in DESIGN.md (the status colours the brand track chose were marked "to confirm"); nothing reads the old
  status shape — cost if wrong: token values in one file.
- Ruling: shadcn components live in `apps/web/src/components/ui`, not a `packages/ui` (spec 3 lists one) — one app
  uses them, and shadcn's monorepo mode adds a second `components.json` and cross-package Tailwind sources for no
  consumer — cost if wrong: a `git mv` and an alias change when the console or a second app needs them.
- Ruling: shadcn's Radix base with the `nova` preset, components restyled for DESIGN.md (pill 44px buttons, 44px
  inputs, the scrim without blur) — Radix is what most shadcn-compatible registries build on, which keeps the owner's
  later registries open — cost if wrong: re-run `shadcn add` with another base.
- Ruling: next-intl from the first screen, without i18n routing, one message file per feature — spec 9.6 says "from day
  one", and per-feature files let the tracks run apart — cost if wrong: two denied install scripts (`@parcel/watcher`,
  `@swc/core`) for an extractor nobody runs.
- Ruling: `me.get` returns the organization's time zone (contracts, domain, one api test line) — dates must show in
  it (spec 9.6) and nothing else on the client knows it — cost if wrong: a merge beside plan 4's `meOutput` fields.
- Ruling: fonts through `next/font/local` from the Fontsource packages, not `next/font/google` — no request to Google
  at build or run time, and still preloading and size-matched fallbacks (DESIGN.md: no layout shift) — cost if wrong:
  the woff2 paths in `fonts.ts` change if Fontsource renames files.
- Ruling: the Content-Security-Policy allows `'unsafe-inline'` scripts and styles, with no nonces — nonces force every
  page to render per request, and the offline shell needs static pages; React escapes everything and the app renders
  no user HTML — cost if wrong: weaker defence in depth against injected script.
- Ruling: the saved cache is shown at once on the next visit and every query then refreshes — the IndexedDB copy is
  written at most once a second, so it can predate a change made just before a reload (Track O's journeys caught it) —
  cost if wrong: one extra request per open screen when the app opens.
- Ruling: eslint-config-next isn't used; Next.js's own plugin and React's hook rules are — eslint-config-next bundles
  eslint-plugin-react, jsx-a11y and import, whose peers stop at ESLint 9 — cost if wrong: JSX lint rules missing;
  axe checks accessibility in every journey.
- Ruling: no Cache Components (`cacheComponents`, on in Next 16.4's template) — the screens fetch on the client, so
  every page is a static shell already — cost if wrong: one flag and some Suspense boundaries later.
- Ruling: no organization switcher — one user, one organization (spec 4) — cost if wrong: none until that changes.
- Ruling: the journeys build the app on every run, on free ports, with their own Postgres — the rewrite's target is
  fixed at build time, and three worktrees run journeys at once — cost if wrong: about ten seconds per run.
- Ruling: the journeys reuse `@travel-crm/db/testing/global-setup` with a small recorder in place of Vitest's project
  — the same Postgres, roles, migrations and drift check as the api's tests — cost if wrong: a change to that setup's
  signature shows up only when the journeys run.

## Tracks

Tasks G1-G4 run first, in order, on `foundation/05a-web` in the worktree `/Users/ak/personal/travel-crm-05a`. Then
every track starts from Task G4's commit in its own worktree and branch, and the three run at the same time. Within a
track, tasks run in order. When every track is merged, the Integration task runs.

| Track | Tasks | Owns (and only it edits) | Depends on |
| --- | --- | --- | --- |
| **G Groundwork** (first, in order) | G1-G4 | every shared file above; `apps/web`'s configuration, `package.json` and lockfile; the data layer, the shell, the shared components, the message files (left `{}` for the tracks), the journeys' harness | plan 3's branch at `b47f170` or later |
| **A Account** | A1-A3 | `src/app/(account)/**`, `src/app/(app)/account/**`, `src/account/**`, `account.json`, `test/account/**`, `test/e2e/account-*.spec.ts`, `test/e2e/support/{totp,account-steps}.ts` | G4 |
| **O Organization** | O1-O3 | `src/app/(app)/{staff,roles,settings}/**`, `src/organization/**`, `{staff,roles,settings}.json`, `test/organization/**`, `test/e2e/{staff,roles,settings}.spec.ts`, `test/e2e/support/{settled,sign-in-with-code,organization-two-factor}.ts` | G4 |
| **P PWA** | P1-P2 | `src/app/manifest.ts`, `src/app/offline/**`, `src/pwa/**`, `src/service-worker/**`, `scripts/service-worker.ts`, `pwa.json`, `test/pwa/**`, `test/e2e/pwa-*.spec.ts`; and these lines of groundwork files: `layout.tsx` (icons, registration), `generate.ts`, `next.config.ts` (`/sw.js` headers), `apps/web/{turbo.json,.gitignore,tsconfig.json}`, `apps/web/package.json` (the `typecheck` script) | G4 |
| **I Integration** (last) | I1 | the merges; one shared journey helper; `CLAUDE.md`, the ADR and its index | every track merged |

(Paths in the table are under `apps/web/` unless they start at the root.)

**Why the tracks never collide.**
- **Dependencies and components come first.** Task G2 installs every shadcn component and G4 every package a track
  uses, so no track touches `package.json` (except P's one script line) or the lockfile.
- **Words are split by feature.** Task G3 creates one message file per feature, left `{}`, and imports them all; each
  track fills only its own.
- **Screens are new files.** The shell's navigation (G4) already points at `/staff`, `/roles`, `/settings` and
  `/account`; a track adds the page at its own path. Only Track P edits the root layout.
- **Journeys make their own data.** Each journey gets a new organization from the fixtures (G4), and every run picks
  free ports and its own Postgres container, so three tracks can run their journeys at once.

**Running the tracks.**
- Before a track's first task, make its worktree from Task G4's commit (each track section repeats the command):
  ```bash
  cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05a-<track> -b foundation/05a-<track> foundation/05a-web
  cd /Users/ak/personal/travel-crm-05a-<track> && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
  ```
  with `<track>` one of `account`, `organization`, `pwa`.
- A track's gate is the web app's checks plus its journeys (each section gives the command); the whole `pnpm check`
  runs in Task I1. Docker is shared with other work: never restart it, and if it is down, wait and retry. Run at most
  two other heavy checks at the same time.
- When a track's last task is committed, it is ready to merge (Task I1).

## Global Constraints

- **Node 24 for every command, from the right folder.** Every shell call starts in another directory, so prefix each
  command with `cd <folder> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`, where the folder is
  `/Users/ak/personal/travel-crm-05a` for Tasks G1-G4 and I1, and the track's worktree
  `/Users/ak/personal/travel-crm-05a-<track>` for a track's tasks. Node 22 remains the machine default; do not change it.
- **Before Task G1**, make the plan's worktree and branch from plan 3's branch (the main checkout is busy with plan 3):
  ```bash
  cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05a -b foundation/05a-web foundation/03-shared-services
  cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate
  ```
- **Docker must be running**, as for plans 1-3: the db, domain, integrations and api-server tests and the journeys
  start throwaway containers. It is shared with other work: run heavy checks with `--concurrency=3`, never restart
  Docker, and if it is down, wait and retry.
- **Chromium for the journeys,** once per machine, from Task G4 on:
  `pnpm --filter @travel-crm/web exec playwright install chromium`.
- **Pinned versions.** Use exactly the versions in the Tech Stack, never "latest"; `pnpm add` takes `name@version`.
  If `pnpm install` refuses a package as published in the last 24 hours, add `"<name>@<version>"` to
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
- **Security release.** Next.js 16.4.1 and React 19.3.1 were published on 2026-10-14 from 16:47 UTC, fixing
  GHSA-673q-mjm6-r5xr and GHSA-2464-fhr4-w9xw (critical: code execution through `use cache` and through the
  image optimizer with SVG) and GHSA-p3m5-59mp-jv5r (denial of service through Server Actions). The plan was built on
  16.4.0 and 19.3.0 because the fixes were under a day old. The app avoids all three paths (no `use cache`, the image
  optimizer is off, no Server Actions). If Task G1 starts after 2026-10-15 17:44 UTC, use `next` and
  `@next/eslint-plugin-next` 16.4.1 and the catalog's `react`, `react-dom` 19.3.1 instead, and run the gates as usual.
- **Package names.** `apps/web` is `@travel-crm/web`; `apps/api` is `@travel-crm/api-server`; `packages/api` is
  `@travel-crm/api` (the web app imports its `AppRouter` type only).
- **Readable code.** Files stay small and single-purpose; a file over ~200 lines needs a reason. Every source file opens
  with a one-line comment saying what it is for (the shadcn registry's files in `src/components/ui/` are the one
  exception, with a README there). Comments explain *why*. No abbreviations in public names. Strict TypeScript: no
  `any`, no `!` non-null assertions.
- **The web app's rules** (ADR 0018, written in Task I1):
  - It imports `@travel-crm/api` with `import type` only; at run time just `@travel-crm/brand`, `@travel-crm/contracts`
    and `@travel-crm/domain/kernel` (dependency-cruiser's `web-reaches-the-api-over-http`).
  - No colour literal in its source: colours are the brand's tokens (`test/no-colour-literals.test.ts`).
  - Every word on screen is a next-intl message in the feature's file under `src/i18n/messages/en-IN/`.
  - Never show a `.invalid` placeholder email, and never read who is signed in from Better Auth's `/get-session`:
    `me.get` says it.
  - Server-rendered HTML holds no organization data.
- **The product's name** is read from `@travel-crm/brand`, never typed: `packages/brand/test/product-name.test.ts`
  refuses "Travel Agency OS" or "Agency OS", in any case or as a slug, in any file outside `packages/brand/` and
  `docs/`. That includes tests, comments, message files and DESIGN.md.
- **Tracks edit only the files the Tracks table gives them.** If a track finds it needs a change to another file, it
  stops and reports it; the change goes into the groundwork or Task I1.
- **Commits.** Conventional Commits, a header of at most 100 characters, staged by name (never `git add -A`, `.` or
  `-a`). The git hooks run Prettier, ESLint and commitlint: fix what they report, never use `--no-verify`. **Never add a
  `Co-Authored-By` trailer.** No secrets or `.env` files in git.
- **Git.** Don't push; there is no remote. Don't touch the main checkout's working tree: plan 3's integration is
  running there.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each is pinned by tests in the tasks named.

1. **An organization's data left on a shared or lost phone after signing out**: in the query cache, in IndexedDB, in
   another open tab, or when sign-out happens offline. Expected: all three copies are gone at once, other tabs go to
   sign-in, and the device holds nothing readable even if the api can't be reached. Pinned in G3
   (`test/data/session.test.ts`: wipe, offline wipe, other tabs) and G4 (the sign-out journey reads IndexedDB).
2. **A placeholder `.invalid` email reaching a screen.** Better Auth's own answers (sign-in, `/get-session`) carry it
   for staff without email (ADR 0006). Expected: never shown; the app keeps nothing of Better Auth's user object and
   reads people from `me.get`. Pinned in G3 (`auth-client.test.ts`), O1 (`staff-list.test.tsx` gives a row a
   placeholder and finds none on screen) and A2 (the account page).
3. **Being sent somewhere wrong**: a session that ends mid-use, a pending password change or two-factor setup, a
   `?next=` naming another site, or a redirect loop on the sign-in page. Expected: a 401 goes to sign-in and back after,
   a pending step goes to its screen, `?next=` is followed only to this app's paths, signed-out screens never redirect.
   Pinned in G3 (`routes.test.ts`, `refusals.test.ts`), G4 (the signed-out journey) and A1-A2 (sign-in with `?next=`,
   the first-login journey).
4. **Stale data shown as current**: a reload a second after a change (the saved copy is written at most once a
   second), an optimistic change the api refuses, offline. Expected: the saved copy shows at once and is refreshed in
   the background; a refused quick action rolls back with the reason's message; offline, a banner says so. Pinned in
   G3 (the provider refreshes after restoring), O1 and O3 (role change and two-factor switch roll back; journeys reload
   after removing someone and after changing a role) and P2 (the offline journey shows the banner).
5. **Indian names, numbers and dates at the edges**: Devanagari and other scripts in names, ₹ (in the fonts'
   Latin-extended files only), lakh grouping, paise, and days near midnight and New Year in India. Expected: names in
   their script with the Noto fallbacks, never truncated; `₹12,50,000`; "16 Oct" by the organization's clock. Pinned in
   G3 (`format.test.ts`), G2 (the font stacks; `fonts.ts` limits each Latin-extended file to its range) and O1 (a staff
   name in Devanagari in `staff-list.test.tsx`).

## File Structure

```
travel-crm/
├── DESIGN.md                          the design rules (owner's first draft); its palette equals brand.colours
├── packages/brand/                    + DESIGN.md's palette; `@travel-crm/brand/files` for Node-only file paths
├── packages/contracts, packages/domain, apps/api   me.get returns the organization's time zone
└── apps/web/                          @travel-crm/web
    ├── next.config.ts                 standalone output, security headers, the /api rewrite, Turbopack rules, next-intl
    ├── security-headers.ts            every response's headers, testable apart from the config
    ├── turbopack/                     the loader that maps our packages' ./file.js imports to ./file.ts
    ├── scripts/                       `pnpm generate`: brand.css, the brand's icons, the service worker (P2)
    ├── src/app/                       routes: (account) signed-out and pending-step screens, (app) the shell's
    │                                  screens, manifest, offline; layout.tsx, globals.css, fonts.ts
    ├── src/components/                PageTitle, StatusBadge, EmptyState, ErrorState, Delayed; ui/ = shadcn
    ├── src/data/                      tRPC client, query cache, IndexedDB copy, auth calls, signing out
    ├── src/session/, src/shell/       me.get gate and context, permission checks; sidebar, bottom bar, banners
    ├── src/lib/                       routes, Indian formats, error messages, cn
    ├── src/i18n/                      next-intl config and one message file per feature
    ├── src/account/, src/organization/, src/pwa/, src/service-worker/   the tracks' screens and pieces
    └── test/                          Vitest (jsdom); test/e2e/ Playwright journeys and their harness
```

Calls only go one way: `apps/web` → `/api` over HTTP; in code, `apps/web` → `@travel-crm/brand`,
`@travel-crm/contracts`, `@travel-crm/domain/kernel`, and types from `@travel-crm/api`. The journeys' harness
(`test/e2e/`) also uses `@travel-crm/db/testing`, `@travel-crm/db/platform` and `@travel-crm/domain/identity` to start
Postgres and create organizations, as the api's own tests do.

---

## Groundwork

Tasks G1-G4 run in order on `foundation/05a-web` in `/Users/ak/personal/travel-crm-05a`.

### Task G1: DESIGN.md, the brand's palette, and a web app that builds

The owner's design rules are committed as `DESIGN.md`; the brand package takes DESIGN.md's palette and becomes safe to
import in a browser; and `apps/web` starts: a Next.js app that builds, with its colours generated from the brand, its
security headers, and the checks every package has (typecheck, lint, tests, import rules).

**Files:**
- Create: `DESIGN.md`
- Modify: `packages/brand/src/brand.ts`, `packages/brand/src/index.ts`, `packages/brand/package.json`,
  `packages/brand/README.md`, `packages/brand/test/assets.test.ts`, `packages/brand/test/icons.test.ts`
- Test: `packages/brand/test/contrast.test.ts`, `packages/brand/test/browser-safe.test.ts`
- Modify: `pnpm-workspace.yaml`, `.dependency-cruiser.cjs`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`,
  `apps/web/security-headers.ts`, `apps/web/eslint.config.js`, `apps/web/vitest.config.ts`, `apps/web/turbo.json`,
  `apps/web/.gitignore`, `apps/web/README.md`, `apps/web/depcruise-aliases.cjs`,
  `apps/web/turbopack/workspace-imports-loader.cjs`, `apps/web/scripts/{brand-css,brand-icons,generate}.ts`,
  `apps/web/src/app/{globals.css,layout.tsx,page.tsx}`
- Test: `apps/web/test/{brand-css,design-tokens,security-headers,workspace-imports-loader}.test.ts`

**Interfaces:**
- Consumes: `brand`, `Brand` (`@travel-crm/brand`); `brandAssets` (now `@travel-crm/brand/files`); the shared ESLint
  config `base()` and tsconfig `@travel-crm/tsconfig/base.json`.
- Produces:
  - `brand.colours` with `inputBorder`, `actionTint`, `onAction`, `moneyTint` and `status.{good,attention,bad,neutral}`
    as `StatusColour = { dot, fill, ink }`.
  - `@travel-crm/brand/files` exporting `brandAssets`; the main entry exports `brand`, `pwaIcons` and types only.
  - `colourTokens(colours): [string, string][]` and `brandCss(colours): string` (`apps/web/scripts/brand-css.ts`);
    `copyBrandIcons(targetDirectory, sourceDirectory?)` (`scripts/brand-icons.ts`).
  - `securityHeaders({ development })`, `contentSecurityPolicy({ development })` (`apps/web/security-headers.ts`).
  - `pnpm --filter @travel-crm/web generate`, which Turborepo runs before `dev`, `build`, `typecheck`, `lint` and `test`.
  - The `@/` import alias for `apps/web/src`.

- [ ] **Step 1: Add DESIGN.md**

Create `DESIGN.md` at the repository root with exactly this content (the owner's first draft, as Prettier formats it):

````markdown
---
name: travel-crm
status: first-draft
colors:
  canvas: "#fffdf9"
  surface: "#f5f4f0"
  hairline: "#e6e3dc"
  input-border: "#8a8a82"
  ink: "#1a1a1a"
  ink-muted: "#6b6b6b"
  action: "#2563eb"
  action-hover: "#1d4ed8"
  action-tint: "#eef2ff"
  people: "#6a4bbd"
  people-pressed: "#5b3fa6"
  people-tint: "#efe7fd"
  people-tint-ink: "#4c2f97"
  money: "#034f46"
  money-pressed: "#07352f"
  money-tint: "#e3f1ee"
  status-red: { dot: "#d92d20", bg: "#fdecea", ink: "#9b1c1c" }
  status-amber: { dot: "#d97706", bg: "#fff3d6", ink: "#7a4100" }
  status-green: { dot: "#16a34a", bg: "#e3f4e7", ink: "#14532d" }
  status-neutral: { dot: "#6b6b6b", bg: "#ecebe6", ink: "#4a4a4a" }
typography:
  page-title: { family: "EB Garamond", size: 30px, weight: 500, lineHeight: 36px, tracking: "-0.01em" }
  section-title: { family: "Figtree", size: 16px, weight: 600, lineHeight: 24px, tracking: "0" }
  body: { family: "Figtree", size: 15px, weight: 400, lineHeight: 22px, tracking: "0" }
  label: { family: "Figtree", size: 13px, weight: 500, lineHeight: 18px, tracking: "0" }
  caption: { family: "Figtree", size: 12px, weight: 400, lineHeight: 16px, tracking: "0.01em" }
  number:
    { family: "IBM Plex Mono", size: 14px, weight: 400, lineHeight: 20px, tracking: "0", features: "tabular-nums" }
  number-lg:
    {
      family: "IBM Plex Mono",
      size: 24px,
      weight: 500,
      lineHeight: 30px,
      tracking: "-0.01em",
      features: "tabular-nums",
    }
radii: { badge: 4px, input: 6px, card: 10px, pill: 9999px, dialog: 14px }
spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 12: 48px }
shadows:
  overlay: "0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)"
  none-at-rest: "none"
---

# Design System: travel-crm (first draft)

> First draft, to be improved. Tokens above are the source of truth; map them to Tailwind theme variables and shadcn/ui CSS variables. The product name is a working name and lives only in the brand package. Never hard-code it in components, titles or copy.

## 1. Overview

**Creative north star: "The well-kept ledger-desk."** A travel agent works through the day between a WhatsApp conversation, a quote, a departure list and a payment. The interface is a calm, quiet desk: warm paper, hairline rules, dense but ordered information, and colour that appears only when it means something. References: Notion and Linear for restraint and density; the Razorpay dashboard for money and status screens.

Principles:

- **Colour carries meaning, not decoration.** Most of any screen is ink on warm white. Each colour has one job (section 2).
- **Dense, not cluttered.** Tables and lists are compact; whitespace separates groups, hairlines separate rows.
- **Mobile first.** Agents work from phones between calls. Design at 360px, then expand.
- **Numbers are first-class.** Money, counts, dates and ids are mono and aligned.
- **Honest states.** Always design loading, empty and error, not just the happy path.

## 2. Colour

Strategy: **Full palette with strict roles.** Neutral ink on warm canvas, plus three role colours and a status set.

| Role                | Colour                                                           | Used for (and only for)                                                                                                 |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Canvas              | `#fffdf9`                                                        | Page background                                                                                                         |
| Surface             | `#f5f4f0`                                                        | Sidebar, table headers, inset panels, input-adjacent wells                                                              |
| Hairline            | `#e6e3dc`                                                        | Dividers, card and table borders (decorative only)                                                                      |
| Ink                 | `#1a1a1a`                                                        | Primary text                                                                                                            |
| Ink muted           | `#6b6b6b`                                                        | Secondary text, captions, placeholders                                                                                  |
| **Action (blue)**   | `#2563eb`, hover `#1d4ed8`, tint `#eef2ff`                       | Primary buttons, links, focus rings, active nav item, selected filters                                                  |
| **People (violet)** | `#6a4bbd`, pressed `#5b3fa6`, tint `#efe7fd`, tint ink `#4c2f97` | WhatsApp inbox, unread messages and counts, follow-ups and reminders, assignment and assignee avatars, later AI helpers |
| **Money (forest)**  | `#034f46`, pressed `#07352f`, tint `#e3f1ee`                     | Amounts received, profit and margin, invoices, the Accounts area                                                        |
| **Status**          | red / amber / green / neutral                                    | State of a record only: confirmed, payment due, overdue, lost                                                           |

Named rules:

- **One Action Colour.** Blue is the only interactive colour. A violet or forest element is never a button; it is information. If it is clickable, it gets blue treatment (underline or hover) on top.
- **Status Is Only Status.** Red, amber and green never decorate, never colour a chart series for variety, never tint a card for emphasis.
- **Dot Plus Word.** Status is always a dot and a word, never colour alone.
- **Forest Is Not Green.** Status green is a bright, light-bodied green (`#16a34a` dot, `#e3f4e7` bg); forest is a deep blue-green used for money text and Accounts chrome. Never use forest for a status badge or green for a money total.
- **Tint Surfaces Carry Dark Ink.** Text on a role tint uses the role's dark ink (`#4c2f97`, `#034f46`, `#1d4ed8`), never muted grey.
- Money direction is shown by sign and label ("Received", "Due"), not by red/green on the amount itself. Overdue is a status badge next to the amount.

Status vocabulary (extend, do not reinvent):

- Green: Confirmed, Paid, Completed
- Amber: Payment due, Pending, On hold, Awaiting reply
- Red: Overdue, Lost, Cancelled, Failed
- Neutral: Draft, New, Archived

## 3. Typography

| Role               | Font                          | Size / line                 | Weight |
| ------------------ | ----------------------------- | --------------------------- | ------ |
| Page title         | EB Garamond                   | 30 / 36 (24 / 30 on mobile) | 500    |
| Section title      | Figtree                       | 16 / 24                     | 600    |
| Body               | Figtree                       | 15 / 22                     | 400    |
| Label              | Figtree                       | 13 / 18                     | 500    |
| Caption            | Figtree                       | 12 / 16                     | 400    |
| Number             | IBM Plex Mono, `tabular-nums` | 14 / 20                     | 400    |
| Number large (KPI) | IBM Plex Mono, `tabular-nums` | 24 / 30                     | 500    |

Rules:

- **Garamond for page titles only.** One per screen (`h1`). Never in cards, buttons, tables or dialogs. Dialog titles use Figtree 600.
- **Every number is mono with tabular-nums**: money, counts, percentages, ids (e.g. `Q-1042`), phone numbers, and dates in tables. Dates inside running prose may stay Figtree.
- Minimum text size is 12px; body on mobile is never below 15px (inputs are 16px to stop iOS zoom).
- Body line length 65-75ch. `text-wrap: balance` on titles, `pretty` on prose.
- No uppercase tracked eyebrows, no gradient text, no letter-spacing tighter than -0.02em.
- **Indian scripts.** Customer names, places and messages may be Devanagari, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Gurmukhi and others. Neither Figtree, Garamond nor Plex Mono covers them. Font stacks must append fallbacks, in order: `"Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Gujarati", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gurmukhi", system-ui, sans-serif`. For the Garamond title add `"Noto Serif Devanagari"` before the sans fallbacks. Load Noto subsets by `unicode-range` so Latin-only users download nothing extra. Indic scripts need more line-height: use at least 1.6 for body text containing them; never clip descenders or matras with fixed heights.
- Load fonts with `font-display: swap` and size-adjusted fallbacks to avoid layout shift.

## 4. Spacing and shape

- Spacing scale (4px base): 4, 8, 12, 16, 20, 24, 32, 48. Vary it: tight inside a row (8-12), looser between groups (24-32). Equal padding everywhere is a smell.
- Page gutter 16px on mobile, 24px tablet, 32px desktop. Content max width 1200px; reading/detail panels 720px.
- **Touch targets are at least 44x44px** on every interactive element (extend the hit area with padding if the visual is smaller). Spacing between adjacent targets at least 8px.
- Radii: buttons are **pills** (`9999px`); inputs 6px; status badges 4px; cards and panels 10px; dialogs 14px. Chips (filters) are pills.
- Borders are 1px hairline. No side-stripe borders (a coloured `border-left` over 1px) on cards, rows or alerts.
- No nested cards. A card contains rows, fields and dividers, never another card. Use hairlines and spacing inside.
- Semantic z-index scale: base 0, sticky 10, dropdown 20, overlay 30, dialog 40, toast 50, tooltip 60.

## 5. Elevation

Surfaces are **flat at rest**: no shadow on cards, tables, buttons or inputs. Separation comes from hairlines and the surface tone.

Shadows only on floating overlays that sit above the page: dropdown menus, popovers, dialogs, sheets, toasts, tooltips. Token: `0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)`. Dialogs add a scrim of `rgba(26,26,26,0.40)`. No glassmorphism, no blur on surfaces.

## 6. Components

Build on shadcn/ui; restyle with the tokens. Define colours as CSS variables on `:root`, not literals in components.

**Buttons.** Pill. Heights 44px (default, mobile and desktop), 36px dense only in desktop table toolbars where an adjacent 44px hit area is provided. Primary: blue fill, white text (5.17:1), hover `#1d4ed8`. Secondary: canvas fill, hairline-strong border (`#8a8a82`), ink text. Ghost: no border, blue text. Destructive: ink-outline with red text; red fill only in the final confirm step of a dialog. One primary button per view region. Disabled: muted ink on surface, no pointer events, and say why in a hint. Loading: spinner replaces label width-stable, button stays disabled.

**Inputs.** 44px high (16px text), 6px radius, 1px border `#8a8a82` (3.4:1 as a UI boundary), canvas fill, visible label above (never placeholder-only). Placeholder is ink muted. Focus: 2px blue ring with 2px offset. Error: red border plus message below with an icon, `aria-describedby` linked. Phone fields use `+91` prefix and mono digits. Money fields show `₹` prefix, mono, right-aligned, Indian grouping on blur.

**Badges and chips.** Status badge: 4px radius, tinted bg, dark ink, a 6px dot in the status colour, then the word (12-13px, weight 500). Example: green dot + "Confirmed" on `#e3f4e7` with `#14532d` text. Role badges (violet "Unread 3", forest "Invoice") follow the same shape using role tint + tint ink. Filter chips are pills: unselected hairline border; selected blue tint `#eef2ff` with blue ink and a check icon.

**Cards.** Canvas fill, 1px hairline, 10px radius, no shadow, 16px padding. Use cards only for self-contained objects (a lead on mobile, a departure, a supplier). Lists of homogeneous rows are tables or divided lists, not card grids.

**Tables.** Dense desktop default: 44px rows (40px dense option), surface-toned header with label type, hairline row dividers, no zebra. Numeric columns are right-aligned, mono, tabular. Sortable headers show a direction icon. Row hover is the surface tone; selected row is blue tint. Sticky header and sticky first column on horizontal scroll. Footer totals use mono at weight 500 in forest if money. Below 768px, tables become divided lists (name and status on line one, key numbers on line two) or cards.

**Navigation.** Desktop: 232px left sidebar on surface tone, grouped items (Leads, Inbox, Quotes, Departures, Bookings, Suppliers, Accounts). Active item: blue tint bg, blue ink, no side stripe. The Inbox item carries a violet count; the Accounts item uses forest only on its icon when active. Mobile: bottom nav with 4-5 destinations (Leads, Inbox, Departures, Accounts, More), 56px high, 44px+ targets, labels always visible, active item blue. "More" opens a drawer for the rest plus organization switcher.

**KPI / stat.** A label, a mono value, and an **info hint** (an "i" button, 44px hit area, opens a tooltip or popover explaining how the figure is computed and its period). Every KPI has one, no exceptions. Value uses `number-lg`; money KPIs in forest. Optional delta line in muted ink with sign. No hero-metric template: no oversized number with gradient or accent decoration; KPIs sit in a hairline-divided strip, not a row of identical boxes.

**Toasts and dialogs.** Toasts bottom-center on mobile, bottom-right on desktop, overlay shadow, 4s (errors persist with a dismiss button), `role="status"` (errors `role="alert"`), include Undo where possible. Dialogs: 14px radius, scrim, focus trapped, Escape closes, Figtree title, primary action on the right (desktop) or stacked full-width (mobile). On mobile, prefer bottom sheets for forms and pickers.

**Empty states.** Short sentence saying what belongs here and the one action to fill it ("No quotes yet. Create your first quote."), a simple line illustration or icon in muted ink, one blue primary button. Filtered-empty says "No results for these filters" with a clear-filters link. Never blank.

**Loading and error states.** Loading: skeletons matching the final layout (surface tone, subtle pulse behind `motion-safe`), no full-page spinners; show skeletons after 200ms. Error: inline message with what failed and a Retry button; keep the user's input; offline shows a persistent banner and queues writes where possible.

**Money display.** Always `₹` plus Indian grouping, mono, tabular, right-aligned in columns: `₹12,50,000`. Paise only when non-zero or on invoices (`₹1,250.50`). Negative as `-₹4,500` (minus sign, not parentheses). Large KPIs may use `₹12.5 L` / `₹1.2 Cr` with the full value in the info hint or tooltip. Money text is forest only for received/profit/margin/Accounts; amounts due use ink, with a status badge for state.

**Status display.** Badge as above, always dot plus word. In dense lists, the dot plus word may sit inline without background. Do not use colour-only icons, row tints or progress bars to signal status. A record has one primary status badge; secondary facts are plain text.

**Mobile patterns.**

- **List to detail.** Mobile: list screen pushes a full-screen detail screen with a back button top-left and a 44px sticky action bar at the bottom (e.g. Call, WhatsApp, Create quote). Desktop 1024px+: split view, list 360px left, detail right, URL reflects selection.
- **Inbox.** Conversation list with violet unread dot and count; thread view full-screen on mobile, composer pinned above the keyboard; assignment and follow-up chips in violet.
- **Safe areas.** Respect `env(safe-area-inset-*)` for bottom nav and sticky bars.
- **PWA.** Installable, `theme-color` matches canvas, standalone display, an offline shell, and cached last-viewed lists.

**Motion.** Ease-out only (`cubic-bezier(0.22, 1, 0.36, 1)`), 120-200ms for state changes, up to 240ms for sheets and dialogs. Animate opacity and transform only. All animation sits behind Tailwind `motion-safe:`; the `motion-reduce` fallback is an instant change or a short crossfade. No bounce, no parallax, no entrance animation on every list item.

## 7. Do's and Don'ts

Do:

- Use blue for every interactive affordance and nothing else.
- Put every number in mono with `tabular-nums`, right-aligned in columns.
- Pair every status colour with a word and a dot.
- Give each KPI an info hint.
- Use hairlines before whitespace, whitespace before cards, cards before shadows.
- Write real empty, loading and error states for every list and form.
- Keep copy plain and specific: "Payment due 16 Oct", not "Action required".

Don't:

- Use violet or forest for buttons, or green/red/amber for anything but status.
- Use eyebrows (small uppercase tracked kickers), gradient text, hero-metric blocks, side-stripe borders, nested cards, glassmorphism, or identical icon-heading-text card grids.
- Use Garamond outside page titles.
- Put shadows on resting surfaces.
- Rely on placeholders as labels or on colour alone for meaning.
- Hard-code the product name or any colour literal in components.
- Truncate Indian-script names to fit; wrap or give more room.

## 8. Accessibility

Target WCAG 2.2 AA. Contrast checked with the WCAG relative-luminance formula (computed against canvas `#fffdf9` unless stated).

| Pair                                                                                  | Ratio  | Use                                                      |
| ------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| Ink `#1a1a1a` on canvas                                                               | 17.1:1 | Body                                                     |
| Ink on surface `#f5f4f0`                                                              | 15.8:1 | Text on panels                                           |
| Ink muted `#6b6b6b` on canvas                                                         | 5.25:1 | Secondary text (AA)                                      |
| Ink muted on surface                                                                  | 4.84:1 | Secondary text on panels (AA)                            |
| Blue `#2563eb` on canvas                                                              | 5.09:1 | Links, focus ring                                        |
| White on blue `#2563eb`                                                               | 5.17:1 | Primary button                                           |
| White on blue hover `#1d4ed8`                                                         | 6.7:1  | Button hover                                             |
| Blue `#1d4ed8` on tint `#eef2ff`                                                      | 5.99:1 | Active nav, selected chip                                |
| White on violet `#6a4bbd`                                                             | 6.26:1 | Violet fills (unread counts)                             |
| Tint ink `#4c2f97` on lavender `#efe7fd`                                              | 8.11:1 | Violet badges                                            |
| Forest `#034f46` on canvas                                                            | 9.35:1 | Money text                                               |
| Forest on tint `#e3f1ee`                                                              | 8.18:1 | Money badges                                             |
| Red ink `#9b1c1c` on `#fdecea`                                                        | 7.13:1 | Status badge                                             |
| Amber ink `#7a4100` on `#fff3d6`                                                      | 7.37:1 | Status badge                                             |
| Green ink `#14532d` on `#e3f4e7`                                                      | 7.97:1 | Status badge                                             |
| Neutral ink `#4a4a4a` on `#ecebe6`                                                    | 7.42:1 | Status badge                                             |
| Input border `#8a8a82` on canvas                                                      | 3.42:1 | UI boundary (needs 3:1)                                  |
| Status dots on canvas: red `#d92d20` 4.76, amber `#d97706` 3.14, green `#16a34a` 3.24 | n/a    | Non-text, meets 3:1; the word carries the meaning anyway |

Hairline `#e6e3dc` (1.26:1) is decorative only; never the sole indicator of an input, button or selected state.

Requirements:

- Visible focus on every interactive element (2px blue ring, 2px offset); never remove outlines.
- Full keyboard operation; logical tab order; skip-to-content link; dialogs trap and restore focus.
- Semantic landmarks (`nav`, `main`), one `h1` per screen, tables with proper `th` scope.
- Icon-only buttons have accessible names; the KPI info hint is a real `button` with `aria-label="How is this calculated?"`.
- Live regions for toasts and new inbox messages (polite); errors announced.
- Respect `prefers-reduced-motion`; support 200% zoom and text scaling without clipped content; set `lang` per record where known (`lang="hi"` etc.) so screen readers and font fallbacks pick the right script.
- Never convey meaning by colour alone (status, unread, direction of money).

## 9. Indian locale details

- **Currency:** `₹` with lakh/crore grouping: `₹12,50,000` (use `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`; never hand-roll). Short forms `₹12.5 L`, `₹1.2 Cr` only in KPIs and charts, with the full value on hover/info hint.
- **Dates:** `16 Oct` in the current year, `16 Oct 2027` otherwise; ranges `16 - 21 Oct`; never US month-first. Times in 12-hour with `am/pm` (`4:30 pm`) in the **organization's time zone** (default `Asia/Kolkata`), stored as UTC; show a zone label only when it differs from the viewer's. Weeks start Monday by default, configurable.
- **Numbers:** en-IN grouping everywhere (`1,23,456`), mono and tabular.
- **Phones:** `+91 98765 43210` format, stored E.164; WhatsApp deep links use the number without `+`.
- **GST:** show GSTIN in mono (15 chars, no wrapping mid-id), tax lines as separate rows (CGST/SGST or IGST) with rate and amount, invoice totals in forest, financial year as `FY 2026-27`.
- **Names and text:** support Indic scripts and mixed-script strings in names, places, notes and messages (section 3 fallbacks); search must be diacritic and script tolerant; sort with `Intl.Collator("en-IN")`; never assume first/last name structure (single field "Full name").
- **Language:** UI copy is English first with plain wording; structure strings for later translation (no concatenated sentences, no baked-in plurals).
- **Addresses:** state-aware (place of supply drives GST); PIN code is a 6-digit mono field.
````

- [ ] **Step 2: Write the failing brand tests**

The palette must meet WCAG 2.2 AA as DESIGN.md section 8 says, and the brand package's main entry must load nothing a
browser lacks, because the web app will import it in client code.

`packages/brand/test/contrast.test.ts`:
```ts
// The palette meets WCAG 2.2 AA (DESIGN.md section 8): text 4.5:1 on what it sits on, control edges 3:1.
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const { colours } = brand;

describe("contrast", () => {
  it("computes the WCAG ratio", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("gives every text colour 4.5:1 on the surfaces it is used on", () => {
    const textPairs: [string, string, string][] = [
      ["ink on canvas", colours.ink, colours.canvas],
      ["ink on surface", colours.ink, colours.surface],
      ["muted on canvas", colours.muted, colours.canvas],
      ["muted on surface", colours.muted, colours.surface],
      ["action on canvas", colours.action, colours.canvas],
      ["text on action", colours.onAction, colours.action],
      ["text on pressed action", colours.onAction, colours.actionPressed],
      ["pressed action on its tint", colours.actionPressed, colours.actionTint],
      ["text on people", colours.onAction, colours.people],
      ["people ink on its tint", colours.peopleTintInk, colours.peopleTint],
      ["money on canvas", colours.money, colours.canvas],
      ["money on its tint", colours.money, colours.moneyTint],
      ...Object.entries(colours.status).map(([name, status]): [string, string, string] => [
        `${name} status`,
        status.ink,
        status.fill,
      ]),
    ];
    for (const [name, foreground, background] of textPairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives input borders and status dots 3:1 on canvas, as control edges and graphics need", () => {
    expect(contrast(colours.inputBorder, colours.canvas)).toBeGreaterThanOrEqual(3);
    for (const [name, status] of Object.entries(colours.status)) {
      expect(contrast(status.dot, colours.canvas), name).toBeGreaterThanOrEqual(3);
    }
  });
});
```

`packages/brand/test/browser-safe.test.ts`:
```ts
// The package's main entry is plain data, so the web app can import it in the browser: nothing it loads may import
// a Node module or read import.meta (bundlers give browser code neither). File paths live at @travel-crm/brand/files.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

/** The relative files a source file imports, followed recursively, as paths under src/. */
function loadedFiles(file: string, seen = new Set<string>()): Set<string> {
  seen.add(file);
  const text = readFileSync(path.join(sourceDirectory, file), "utf8");
  for (const [, specifier = ""] of text.matchAll(/from "(\.\/[^"]+)\.js"/g)) {
    const next = `${specifier.slice(2)}.ts`;
    if (!seen.has(next)) loadedFiles(next, seen);
  }
  return seen;
}

describe("the main entry", () => {
  it("loads no Node module and no import.meta", () => {
    const files = [...loadedFiles("index.ts")];
    expect(files).toEqual(expect.arrayContaining(["index.ts", "brand.ts", "icons.ts"]));
    for (const file of files) {
      const text = readFileSync(path.join(sourceDirectory, file), "utf8");
      expect(text, file).not.toMatch(/from "node:|import\.meta/);
    }
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand test`

Expected: FAIL. The contrast tests find no `onAction`, `inputBorder`, `actionTint` or `moneyTint` and no status `dot`
(the luminance of `undefined` is not a number); the browser-safety test finds `from "node:path"` and
`import.meta.dirname` in `assets.ts`, which `index.ts` loads.

- [ ] **Step 4: Give the brand package DESIGN.md's palette, and move the file paths out of its main entry**

In `packages/brand/src/brand.ts`:

replace:
```ts
/** A status colour: text and dot, background and border. Status colours mean status only (confirmed, due, lost). */
export interface StatusColour {
  readonly ink: string;
  readonly fill: string;
  readonly border: string;
}
```
with:
```ts
/**
 * A status colour (DESIGN.md section 2): a dot, a tinted badge background, and the dark text on it. Status colours
 * mean status only (confirmed, due, lost), and always come with a word.
 */
export interface StatusColour {
  readonly dot: string;
  readonly fill: string;
  readonly ink: string;
}
```

replace:
```ts
  /** Colour tokens, read by Tailwind (plan 5), the PDF templates and the email layout. */
  colours: {
    /** Text and the darkest surfaces. */
    ink: "#1a1a1a",
    /** Secondary text. */
    muted: "#6b6b70",
    /** Page background: warm white. */
    canvas: "#fffdf9",
    /** Panels, table headers and the sidebar. */
    surface: "#f5f4f0",
    /** Thin lines between flat surfaces. */
    hairline: "#e6e3dc",
    /** The main action, the active item and focus. */
    action: "#2563eb",
    actionPressed: "#1d4ed8",
    /** People and conversations. */
    people: "#6a4bbd",
    peoplePressed: "#5b3fa6",
    peopleTint: "#efe7fd",
    peopleTintInk: "#4c2f97",
    /** Money: amounts, margins, payments. */
    money: "#034f46",
    moneyPressed: "#07352f",
    status: {
      good: { ink: "#166534", fill: "#e6f6ec", border: "#bfe5cc" },
      attention: { ink: "#8a5a00", fill: "#fdf3d8", border: "#f1d999" },
      bad: { ink: "#9f1f17", fill: "#fde8e6", border: "#f5c4bf" },
    } satisfies Record<string, StatusColour>,
  },
```
with:
```ts
  /**
   * Colour tokens, read by the web app's Tailwind theme, the PDF templates and the email layout. The values are the
   * ones in DESIGN.md's front matter; a web app test fails when the two disagree.
   */
  colours: {
    /** Text and the darkest surfaces. */
    ink: "#1a1a1a",
    /** Secondary text, captions and placeholders: 5.25:1 on canvas. */
    muted: "#6b6b6b",
    /** Page background: warm white. */
    canvas: "#fffdf9",
    /** Panels, table headers and the sidebar. */
    surface: "#f5f4f0",
    /** Thin lines between flat surfaces. Decorative only: never the one sign of a control or a selection. */
    hairline: "#e6e3dc",
    /** The edge of inputs and secondary buttons: 3.42:1 on canvas, enough for a control's boundary. */
    inputBorder: "#8a8a82",
    /** The one interactive colour: buttons, links, focus rings, the active item. */
    action: "#2563eb",
    actionPressed: "#1d4ed8",
    /** Selected chips and the active navigation item, with actionPressed as their text. */
    actionTint: "#eef2ff",
    /** Text on an action fill: 5.17:1 on action. */
    onAction: "#ffffff",
    /** People and conversations: the inbox, follow-ups, assignees. Information, never a button. */
    people: "#6a4bbd",
    peoplePressed: "#5b3fa6",
    peopleTint: "#efe7fd",
    peopleTintInk: "#4c2f97",
    /** Money: amounts received, margins, invoices and the Accounts area. Never a status. */
    money: "#034f46",
    moneyPressed: "#07352f",
    moneyTint: "#e3f1ee",
    status: {
      good: { dot: "#16a34a", fill: "#e3f4e7", ink: "#14532d" },
      attention: { dot: "#d97706", fill: "#fff3d6", ink: "#7a4100" },
      bad: { dot: "#d92d20", fill: "#fdecea", ink: "#9b1c1c" },
      neutral: { dot: "#6b6b6b", fill: "#ecebe6", ink: "#4a4a4a" },
    } satisfies Record<string, StatusColour>,
  },
```

Replace `packages/brand/src/index.ts` with:
```ts
// Public API of @travel-crm/brand: the product's name, colours, fonts, contacts and icon list. Plain data, so the
// web app can use it in the browser; the logo files' paths are Node-only, at @travel-crm/brand/files.
export { brand, type Brand, type StatusColour } from "./brand.js";
export { pwaIcons, type PwaIcon } from "./icons.js";
```

In `packages/brand/package.json`:

replace:
```json
    ".": "./src/index.ts",
    "./assets/*": "./assets/*"
```
with:
```json
    ".": "./src/index.ts",
    "./files": "./src/assets.ts",
    "./assets/*": "./assets/*"
```

In `packages/brand/test/assets.test.ts`:

replace:
```ts
import { brand, brandAssets } from "../src/index.js";
```
with:
```ts
import { brandAssets } from "../src/assets.js";
import { brand } from "../src/index.js";
```

In `packages/brand/test/icons.test.ts`:

replace:
```ts
import { brand, brandAssets, pwaIcons } from "../src/index.js";
```
with:
```ts
import { brandAssets } from "../src/assets.js";
import { brand, pwaIcons } from "../src/index.js";
```

In `packages/brand/README.md`:

replace:
```markdown
    import { brand, brandAssets } from "@travel-crm/brand";
```
with:
```markdown
    import { brand } from "@travel-crm/brand";
    import { brandAssets } from "@travel-crm/brand/files"; // Node only
```

replace:
```markdown
  paths only, until a designed logo replaces them. Other packages can import them as `@travel-crm/brand/assets/<file>`.
```
with:
```markdown
  paths only, until a designed logo replaces them. Other packages can import them as `@travel-crm/brand/assets/<file>`.
- The main entry is plain data, safe in the browser (`test/browser-safe.test.ts`). `brandAssets`, the logo files'
  absolute paths, is Node-only and comes from `@travel-crm/brand/files`.
```

- [ ] **Step 5: Run the brand tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/brand test && pnpm --filter @travel-crm/brand typecheck`

Expected: 25 tests pass (21 before, plus 3 contrast tests and the browser-safety test); the typecheck is clean. The
PDF and email adapters read only `ink`, `muted`, `canvas`, `surface`, `hairline`, `money` and `action`, which keep
their names.

- [ ] **Step 6: Create the web app's package and configuration**

In `pnpm-workspace.yaml`:

replace:
```yaml
  react: 19.3.0
  "@types/react": 19.3.0
```
with:
```yaml
  react: 19.3.0
  react-dom: 19.3.0
  "@types/react": 19.3.0
  "@types/react-dom": 19.3.0
```

`apps/web/package.json`:
```json
{
  "name": "@travel-crm/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "dev": "pnpm run generate && next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/eb-garamond": "5.3.0",
    "@fontsource-variable/figtree": "5.3.0",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@travel-crm/brand": "workspace:*",
    "next": "16.4.0",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "16.4.0",
    "@tailwindcss/turbopack": "4.3.3",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "eslint": "catalog:",
    "eslint-plugin-react-hooks": "7.1.1",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", "scripts", "test", "*.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/eslint.config.js` (Next.js's own plugin and React's hook rules on top of the shared config;
eslint-config-next isn't used because three of the plugins it bundles stop at ESLint 9):
```js
// ESLint for @travel-crm/web: the shared strict config, plus Next.js's and React's hook rules.
import nextPlugin from "@next/eslint-plugin-next";
import { base } from "@travel-crm/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname, ignores: [".next/**", "next-env.d.ts", "public/**"] }),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
  // The Turbopack loader and dependency-cruiser's alias file are CommonJS, which the tools that load them need.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
```

`apps/web/vitest.config.ts`:
```ts
// Unit tests for the web app's logic and components, in a simulated browser. No api, no database.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
```

`apps/web/turbo.json` (the app's `generate` needs the brand's icons, so it waits for the brand's build; `$TURBO_ROOT$`
lets its inputs include the brand's source):
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "extends": ["//"],
  "tasks": {
    "generate": {
      "dependsOn": ["^generate", "@travel-crm/brand#build"],
      "inputs": ["scripts/**", "$TURBO_ROOT$/packages/brand/src/**"],
      "outputs": ["src/generated/**", "public/icons/**"]
    }
  }
}
```

`apps/web/.gitignore`:
```text
# Written by `pnpm generate` from the brand package (scripts/generate.ts).
/public/icons/
# Playwright's reports and traces.
/test-results/
/playwright-report/
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install && pnpm --filter @travel-crm/brand build`

Expected: install succeeds without prompts; the brand build writes 7 icons to `packages/brand/dist/icons`.

- [ ] **Step 7: Write the failing web tests**

`apps/web/test/brand-css.test.ts`:
```ts
// The brand's colours reach the stylesheet as custom properties, one per colour, named after the brand's keys.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { brandCss, colourTokens } from "../scripts/brand-css.js";

describe("brandCss", () => {
  it("turns nested colour names into dashed custom property names", () => {
    expect(colourTokens(brand.colours)).toContainEqual(["input-border", brand.colours.inputBorder]);
    expect(colourTokens(brand.colours)).toContainEqual(["status-good-dot", brand.colours.status.good.dot]);
  });

  it("writes every brand colour on :root, and nothing typed by hand", () => {
    const css = brandCss(brand.colours);
    const declared = [...css.matchAll(/--brand-([a-z-]+): (#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]);
    expect(declared).toEqual(colourTokens(brand.colours));
    expect(declared.length).toBeGreaterThan(20);
    expect(css).toMatch(/^\/\* Generated by scripts\/generate.ts/);
  });
});
```

`apps/web/test/design-tokens.test.ts` (DESIGN.md holds the palette in its front matter, the brand package in code; this
keeps them equal):
```ts
// DESIGN.md lists the palette in its front matter and the brand package holds it in code. Code reads only the brand
// package, so this test keeps the two in step: change either one and it fails until the other matches.
import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";

const designMd = readFileSync(path.resolve(import.meta.dirname, "../../../DESIGN.md"), "utf8");

/** The `colors:` block of the front matter as name → value, with status rows flattened ("status-red.dot"). */
function designColours(): Map<string, string> {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? "";
  const block = /^colors:\n((?: {2}.*\n)+)/m.exec(`${frontMatter}\n`)?.[1] ?? "";
  const colours = new Map<string, string>();
  for (const line of block.split("\n").filter((entry) => entry.trim() !== "")) {
    const [, name = "", rest = ""] = /^ {2}([a-z-]+): (.*)$/.exec(line) ?? [];
    const nested = [...rest.matchAll(/([a-z]+): "(#[0-9a-f]{6})"/g)];
    if (nested.length > 0) for (const [, key = "", value = ""] of nested) colours.set(`${name}.${key}`, value);
    else colours.set(name, /"(#[0-9a-f]{6})"/.exec(rest)?.[1] ?? "");
  }
  return colours;
}

const { colours } = brand;

/** Where each DESIGN.md colour lives in the brand package. */
const brandValueOf: Record<string, string> = {
  canvas: colours.canvas,
  surface: colours.surface,
  hairline: colours.hairline,
  "input-border": colours.inputBorder,
  ink: colours.ink,
  "ink-muted": colours.muted,
  action: colours.action,
  "action-hover": colours.actionPressed,
  "action-tint": colours.actionTint,
  people: colours.people,
  "people-pressed": colours.peoplePressed,
  "people-tint": colours.peopleTint,
  "people-tint-ink": colours.peopleTintInk,
  money: colours.money,
  "money-pressed": colours.moneyPressed,
  "money-tint": colours.moneyTint,
  ...Object.fromEntries(
    (
      [
        ["status-red", colours.status.bad],
        ["status-amber", colours.status.attention],
        ["status-green", colours.status.good],
        ["status-neutral", colours.status.neutral],
      ] as const
    ).flatMap(([name, status]) => [
      [`${name}.dot`, status.dot],
      [`${name}.bg`, status.fill],
      [`${name}.ink`, status.ink],
    ]),
  ),
};

describe("DESIGN.md and the brand package", () => {
  it("list the same palette", () => {
    const fromDesign = designColours();
    expect(fromDesign.size).toBeGreaterThan(20);
    expect(Object.fromEntries(fromDesign)).toEqual(brandValueOf);
  });
});
```

`apps/web/test/security-headers.test.ts`:
```ts
// Every page is sent with the strict headers spec 12.4 asks for, and the policy allows only our own origin.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../security-headers";

describe("security headers", () => {
  it("refuse framing, sniffing and other origins", () => {
    const headers = Object.fromEntries(securityHeaders({ development: false }).map(({ key, value }) => [key, value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    const policy = headers["Content-Security-Policy"] ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/https?:|\*/);
  });

  it("let only development evaluate code", () => {
    expect(contentSecurityPolicy({ development: false })).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy({ development: true })).toContain("'unsafe-eval'");
  });
});
```

`apps/web/test/workspace-imports-loader.test.ts`:
```ts
// The Turbopack loader drops ".js" from relative imports in our packages' TypeScript, and touches nothing else.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { withoutJsExtensions } = require("../turbopack/workspace-imports-loader.cjs") as {
  withoutJsExtensions: (source: string) => string;
};

describe("workspace imports loader", () => {
  it("drops .js from relative import and export specifiers", () => {
    const source = [
      'import { brand } from "./brand.js";',
      "import type { Money } from '../kernel/money.js';",
      'export * from "./fields.js";',
      'export { pwaIcons, type PwaIcon } from "./icons.js";',
      'const lazy = await import("./later.js");',
    ].join("\n");
    expect(withoutJsExtensions(source)).toBe(
      [
        'import { brand } from "./brand";',
        "import type { Money } from '../kernel/money';",
        'export * from "./fields";',
        'export { pwaIcons, type PwaIcon } from "./icons";',
        'const lazy = await import("./later");',
      ].join("\n"),
    );
  });

  it("leaves package imports, other extensions and ordinary strings alone", () => {
    const source = [
      'import { z } from "zod";',
      'import data from "./data.json";',
      'import { x } from "@travel-crm/contracts/kernel";',
      'const file = "./report.js";',
    ].join("\n");
    expect(withoutJsExtensions(source)).toBe(source);
  });
});
```

- [ ] **Step 8: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run`

Expected: FAIL. `../scripts/brand-css.js`, `../security-headers` and `../turbopack/workspace-imports-loader.cjs` don't
exist; the design-tokens test passes already (DESIGN.md and the brand package agree since Step 4).

- [ ] **Step 9: Write the generator, the headers and the Turbopack loader**

`apps/web/scripts/brand-css.ts`:
```ts
// The brand's colours as CSS custom properties (--brand-ink, --brand-status-good-dot...), so the Tailwind theme and
// every component read them from the brand package instead of typing a colour.
import type { Brand } from "@travel-crm/brand";

/** "inputBorder" → "input-border". */
function kebabCase(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Every colour as [name, value], nested names joined by dashes: ["status-good-dot", "#16a34a"]. */
export function colourTokens(colours: Brand["colours"]): [string, string][] {
  const walk = (value: object, prefix: string): [string, string][] =>
    Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
      const name = prefix + kebabCase(key);
      if (typeof child === "string") return [[name, child] as [string, string]];
      return child !== null && typeof child === "object" ? walk(child, `${name}-`) : [];
    });
  return walk(colours, "");
}

/** The stylesheet the web app imports: one custom property per colour on :root. */
export function brandCss(colours: Brand["colours"]): string {
  const lines = colourTokens(colours).map(([name, value]) => `  --brand-${name}: ${value};`);
  return [
    "/* Generated by scripts/generate.ts from @travel-crm/brand. Do not edit: change packages/brand/src/brand.ts. */",
    ":root {",
    ...lines,
    "}",
    "",
  ].join("\n");
}
```

`apps/web/scripts/brand-icons.ts`:
```ts
// Copies the icons the brand package renders (its build writes dist/icons) to where the web app serves them,
// public/icons, for the manifest, the favicon and the home-screen icon.
import { cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { brandAssets } from "@travel-crm/brand/files";

/** The brand package's dist/icons folder, found from its logo file, which it exports. */
export const brandIconsDirectory = path.resolve(path.dirname(brandAssets.logo), "../dist/icons");

/** Replaces targetDirectory with a copy of the brand's icons and returns the file names copied. */
export async function copyBrandIcons(
  targetDirectory: string,
  sourceDirectory = brandIconsDirectory,
): Promise<string[]> {
  const files = await readdir(sourceDirectory).catch(() => {
    throw new Error(`No icons in ${sourceDirectory}: run \`pnpm --filter @travel-crm/brand build\` first`);
  });
  await rm(targetDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, targetDirectory, { recursive: true });
  return files.sort();
}
```

`apps/web/scripts/generate.ts`:
```ts
// `pnpm --filter @travel-crm/web generate` (Turborepo runs it before dev, build, typecheck, lint and test): writes the
// files the app is built from that git doesn't keep, because they come from other packages.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brand } from "@travel-crm/brand";
import { brandCss } from "./brand-css.js";
import { copyBrandIcons } from "./brand-icons.js";

const appDirectory = path.resolve(import.meta.dirname, "..");

await mkdir(path.join(appDirectory, "src/generated"), { recursive: true });
await writeFile(path.join(appDirectory, "src/generated/brand.css"), brandCss(brand.colours));
const icons = await copyBrandIcons(path.join(appDirectory, "public/icons"));
console.log(`Wrote src/generated/brand.css and ${String(icons.length)} icons in public/icons`);
```

`apps/web/security-headers.ts`:
```ts
// The headers every response carries (spec 12.4: strict security headers). Kept apart from next.config.ts so a test
// can read them.

/**
 * The Content-Security-Policy. Scripts and styles allow 'unsafe-inline' because Next.js inlines its boot scripts and
 * the component library sets inline styles; nonces would make every page render per request, and pages must stay
 * static so the service worker can keep them for offline use. Everything else is our own origin only.
 */
export function contentSecurityPolicy({ development }: { development: boolean }): string {
  return [
    "default-src 'self'",
    // React's development build evaluates code for its error overlays.
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders({ development }: { development: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ development }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    // Browsers ignore it over plain http (local development); deployments are https only.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
```

`apps/web/turbopack/workspace-imports-loader.cjs` (Turbopack doesn't resolve `./brand.js` to `./brand.ts`,
vercel/next.js#82945, and every package of ours imports that way, as Node wants):
```js
// A Turbopack loader for our workspace packages' TypeScript: they import "./brand.js" for "./brand.ts", as
// Node's module resolution wants, and Turbopack can't map one to the other yet (vercel/next.js#82945).
"use strict";

/** Relative specifiers ending in .js after `from`, or inside `import(` / `export ... from`. */
const relativeJsSpecifier = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*?)\.js\2/g;

/** The source with ".js" dropped from relative import specifiers, so Turbopack finds the .ts file. */
function withoutJsExtensions(source) {
  return source.replace(relativeJsSpecifier, "$1$2$3$2");
}

module.exports = function workspaceImportsLoader(source) {
  return withoutJsExtensions(source);
};
module.exports.withoutJsExtensions = withoutJsExtensions;
```

`apps/web/next.config.ts`:
```ts
// Next.js settings. The output is a standalone Node server for a container (spec 12.3), so nothing here is
// specific to one host.
import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers";

/**
 * Where /api/* goes (spec 3): the browser always calls the api on the address it loaded the app from, so cookies stay
 * first-party and the api needs no CORS. Rewrites are fixed when the app is built, so this is for development and the
 * end-to-end tests; a deployment routes /api/* to the api at its load balancer, before Next.js sees the request.
 */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would write an AGENTS.md here when an AI agent runs it; the repo's guidance is CLAUDE.md.
  agentRules: false,
  // No image optimization endpoint: the app shows no remote images, and the endpoint is work and attack surface.
  images: { unoptimized: true },
  // Tailwind's own Turbopack loader compiles every stylesheet (no PostCSS step).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      "*.ts": {
        condition: { path: /^packages\/[^/]+\/src\// },
        loaders: [path.join(import.meta.dirname, "turbopack/workspace-imports-loader.cjs")],
        as: "*.ts",
      },
    },
  },
  headers: () =>
    Promise.resolve([
      { source: "/:path*", headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) },
    ]),
  rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
};

export default nextConfig;
```

`apps/web/src/app/globals.css`:
```css
@import "tailwindcss";
@import "../generated/brand.css";
```

`apps/web/src/app/layout.tsx`:
```tsx
// The root layout: the document, its language and the global styles.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@travel-crm/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:
```tsx
// The home page, until the app shell takes over.
import { brand } from "@travel-crm/brand";

export default function HomePage() {
  return <h1>{brand.productName}</h1>;
}
```

`apps/web/depcruise-aliases.cjs`:
```js
// The web app's "@/..." import alias (tsconfig.json's paths), for dependency-cruiser, which reads aliases from a
// webpack-style resolve block. Only the web app uses it.
"use strict";
const path = require("node:path");

module.exports = { resolve: { alias: { "@": path.join(__dirname, "src") } } };
```

`apps/web/README.md`:
````markdown
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
````

- [ ] **Step 10: Run the tests, the generator and a build**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm generate && pnpm exec vitest run && pnpm build`

Expected: `Wrote src/generated/brand.css and 7 icons in public/icons`; 7 tests pass in 4 files; the build compiles
with Turbopack, runs its TypeScript check, and prerenders `/` and `/_not-found` as static. Without the loader in
`next.config.ts` the build fails with `Module not found: Can't resolve './assets.js'` in `packages/brand/src/index.ts`.

- [ ] **Step 11: Teach dependency-cruiser the web app**

In `.dependency-cruiser.cjs`:

replace:
```js
      from: { path: "^packages/brand/src/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/brand/" },
    },
```
with:
```js
      from: { path: "^packages/brand/src/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/brand/" },
    },
    {
      name: "web-reaches-the-api-over-http",
      comment:
        "The web app imports the API's types, never its code (spec 3): it reaches data through /api. At run time it " +
        "may use the brand, the contracts' schemas (for forms) and the kernel's money and date formatting, nothing " +
        "that touches the database, the server or a vendor.",
      severity: "error",
      from: { path: "^apps/web/(src|scripts)/" },
      to: {
        path: "^(apps/api/|packages/(api|db|integrations)/|packages/domain/src/(?!kernel/))",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "web-pages-skip-node-only-brand-files",
      comment:
        "@travel-crm/brand/files holds absolute file paths, built with Node's path module at import: it breaks in " +
        "a browser bundle. Only the web app's build scripts may use it.",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^packages/brand/src/assets\\.ts$" },
    },
```

replace:
```js
          "(^|/)src/(index|platform)\\.ts$", // a package's public entry point is never imported inside the package
```
with:
```js
          "(^|/)src/(index|platform)\\.ts$", // a package's public entry point is never imported inside the package
          "^apps/web/turbopack/", // Turbopack loaders, named in next.config.ts
          "^apps/web/src/app/", // Next.js loads the app's routes, layouts and special files by their names
```

replace:
```js
    // webpackConfig: {
    //  fileName: 'webpack.config.js',
    //  env: {},
    //  arguments: {}
    // },
```
with:
```js
    // Only for its resolve.alias: the web app's "@/..." imports (apps/web/src), as its tsconfig's paths say.
    webpackConfig: {
      fileName: "apps/web/depcruise-aliases.cjs",
    },
```

replace:
```js
      extensions: [".ts", ".d.ts", ".js"],
```
with:
```js
      extensions: [".ts", ".tsx", ".d.ts", ".js"],
```

(dependency-cruiser's `tsConfig` option can't be used for the alias: its paths plugin resolves them against the
folder it runs from, the repository root, not `apps/web`.)

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run depcruise`

Expected: no dependency violations.

- [ ] **Step 12: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green. Test counts: api-server 98, api 5, brand 25, contracts 68, db 179, domain 400, eslint-config 65,
integrations 117, web 7 (964). The product-name check (brand) passes: the web app reads the name from the brand
package.

```bash
cd /Users/ak/personal/travel-crm-05a
git add DESIGN.md packages/brand pnpm-workspace.yaml pnpm-lock.yaml .dependency-cruiser.cjs apps/web/.gitignore apps/web/README.md apps/web/package.json apps/web/tsconfig.json apps/web/turbo.json apps/web/next.config.ts apps/web/security-headers.ts apps/web/eslint.config.js apps/web/vitest.config.ts apps/web/depcruise-aliases.cjs apps/web/turbopack apps/web/scripts apps/web/src apps/web/test
git commit -m "feat(web): start the web app on the brand's palette, with DESIGN.md as its design rules"
```

---

### Task G2: The brand's look: tokens, fonts, shadcn/ui and the honest states

Tailwind's theme becomes the brand's tokens and DESIGN.md's type scale, radii, shadows and focus ring; the brand's three
typefaces are served from our own address with Indian-script fallbacks; shadcn/ui is set up through its CLI and
registry with every component the tracks need, restyled for DESIGN.md; and the shared pieces every screen uses
(page title, status badge, empty, error and delayed-loading states) exist with tests.

**Files:**
- Create (by the shadcn CLI): `apps/web/components.json`, `apps/web/src/lib/utils.ts`,
  `apps/web/src/components/ui/{alert,alert-dialog,badge,button,card,checkbox,dialog,dropdown-menu,field,input,input-otp,label,select,separator,sheet,skeleton,sonner,spinner,switch,table,tabs}.tsx`
- Then replace: `apps/web/src/components/ui/{button,input,badge,dialog,alert-dialog,sheet,sonner,field,input-otp}.tsx`,
  `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/ui/README.md`, `apps/web/src/app/fonts.ts`,
  `apps/web/src/components/{page-title,status-badge,empty-state,error-state,delayed}.tsx`
- Modify: `apps/web/package.json`, `apps/web/scripts/brand-css.ts`, `apps/web/src/app/globals.css`,
  `apps/web/src/app/layout.tsx`, `apps/web/vitest.config.ts`
- Test: `apps/web/test/setup.ts`, `apps/web/test/brand-css.test.ts`, `apps/web/test/no-colour-literals.test.ts`,
  `apps/web/test/components/{status-badge,state-components}.test.tsx`

**Interfaces:**
- Consumes: Task G1's `colourTokens`, `brandCss`, the generated `src/generated/brand.css`.
- Produces:
  - Tailwind colours for every brand token (`bg-canvas`, `text-status-good-ink`, `bg-action-tint`...), shadcn's names on
    the brand's roles (`bg-primary` = action, `bg-accent` = action tint, `text-muted-foreground` = muted,
    `border-input` = input border), `bg-scrim`; fonts `font-sans`, `font-title`, `font-mono`; text sizes `text-title`,
    `text-title-mobile`, `text-section`, `text-body`, `text-label`, `text-caption`, `text-number`, `text-number-lg`;
    `rounded-badge`; the `numbers` utility (mono, tabular figures).
  - `PageTitle({ children, className? })`, `StatusBadge({ tone: "good" | "attention" | "bad" | "neutral", children })`,
    `EmptyState({ icon, message, action? })`, `ErrorState({ message, retryLabel, onRetry })`,
    `Delayed({ children, after = 200 })` in `@/components/*`; `cn` from `@/lib/utils`; every shadcn component in
    `@/components/ui/*`, with `Toaster` (sonner) mounted by the root layout.

- [ ] **Step 1: Add the test tools and write the failing tests**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm add -D jsdom@30.1.2 @testing-library/react@16.3.3 @testing-library/user-event@14.6.8 @testing-library/jest-dom@7.0.1`

Replace `apps/web/vitest.config.ts` with:
```ts
// Unit tests for the web app's logic and components, in a simulated browser (jsdom). No api, no database.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
  },
});
```

`apps/web/test/setup.ts`:
```ts
// Runs before every test file: DOM matchers such as toBeVisible, and an empty document after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

Replace `apps/web/test/brand-css.test.ts` with (the stylesheet also gets a Tailwind colour per token, and switches
Tailwind's own palette off):
```ts
// The brand's colours reach the stylesheet as custom properties and Tailwind colours, named after the brand's keys.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { brandCss, colourTokens } from "../scripts/brand-css.js";

describe("brandCss", () => {
  it("turns nested colour names into dashed names", () => {
    expect(colourTokens(brand.colours)).toContainEqual(["input-border", brand.colours.inputBorder]);
    expect(colourTokens(brand.colours)).toContainEqual(["status-good-dot", brand.colours.status.good.dot]);
  });

  it("declares every brand colour once on :root, and a Tailwind colour reading each", () => {
    const css = brandCss(brand.colours);
    const declared = [...css.matchAll(/--brand-([a-z-]+): (#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]);
    expect(declared).toEqual(colourTokens(brand.colours));
    expect(declared.length).toBeGreaterThan(20);
    const themed = [...css.matchAll(/--color-([a-z-]+): var\(--brand-([a-z-]+)\);/g)];
    expect(themed.map((match) => match[1])).toEqual(declared.map(([name]) => name));
    expect(themed.every((match) => match[1] === match[2])).toBe(true);
    expect(css).toMatch(/^\/\* Generated by scripts\/generate.ts/);
    expect(css).toContain("@theme inline {\n  --color-*: initial;\n");
  });
});
```

`apps/web/test/no-colour-literals.test.ts`:
```ts
// Colours come from the brand package only (DESIGN.md: never a colour literal in components). The generated
// brand.css is the one place that holds values; every other stylesheet and component reads tokens.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Hex codes, colour functions, and Tailwind's own palette (switched off, but a class would silently do nothing). */
const colourLiteral =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(bg|text|border|ring|fill|stroke|outline|from|to|via|shadow|divide|accent|caret|decoration)-(black|white|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/i;

describe("colour literals", () => {
  it("appear nowhere in the app's source but the generated brand stylesheet", () => {
    const files = sourceFiles(sourceDirectory);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ file: path.relative(sourceDirectory, file), line: index + 1, text: line.trim() }))
        .filter(({ text }) => colourLiteral.test(text)),
    );
    expect(offenders).toEqual([]);
  });
});
```

`apps/web/test/components/status-badge.test.tsx`:
```tsx
// A status is a dot and a word: the word carries the meaning, the dot is decoration screen readers skip.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("shows the word, with a dot hidden from screen readers", () => {
    render(<StatusBadge tone="attention">Payment due</StatusBadge>);
    const badge = screen.getByText("Payment due");
    expect(badge).toHaveClass("bg-status-attention-fill", "text-status-attention-ink");
    const dot = badge.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("bg-status-attention-dot");
  });
});
```

`apps/web/test/components/state-components.test.tsx`:
```tsx
// The honest states every list has (DESIGN.md section 6): loading only after a pause, errors with a retry.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";

describe("Delayed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing for the first 200ms, so a quick load never flashes a skeleton", () => {
    render(<Delayed>Loading list</Delayed>);
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.queryByText("Loading list")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Loading list")).toBeVisible();
  });
});

describe("ErrorState", () => {
  it("announces what failed and retries on request", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Staff didn't load." retryLabel="Try again" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Staff didn't load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run`

Expected: FAIL. `brandCss` writes no `@theme` block; `@/components/status-badge`, `@/components/delayed` and
`@/components/error-state` don't exist; the colour-literal test finds fewer than 10 source files.

- [ ] **Step 3: Set up shadcn/ui through its CLI**

From `apps/web`, with the registry's Radix base and the `nova` preset (Lucide icons):

```bash
cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null
CI=1 pnpm dlx shadcn@4.21.4 init --base radix --preset nova --no-monorepo --no-rtl --yes
CI=1 pnpm dlx shadcn@4.21.4 add button input label badge skeleton separator sonner alert card dialog alert-dialog sheet dropdown-menu select checkbox switch tabs table input-otp field spinner --yes
```

Expected: `init` writes `components.json` (style `radix-nova`, aliases `@/components`, `@/lib/utils`, `@/components/ui`,
`@/lib`, `@/hooks`, `registries: {}`), `src/lib/utils.ts`, rewrites `src/app/globals.css` and adds Geist from
`next/font/google` to `src/app/layout.tsx`; `add` creates the 21 files in `src/components/ui/`. Both add dependencies
with `^` ranges and add `next-themes`. The next steps replace what doesn't fit: no Google Fonts, exact versions, no
dark theme, the brand's colours.

Replace `apps/web/package.json` with (exact versions; `next-themes` gone; the brand's fonts for Indian scripts added):
```json
{
  "name": "@travel-crm/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "dev": "pnpm run generate && next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/eb-garamond": "5.3.0",
    "@fontsource-variable/figtree": "5.3.0",
    "@fontsource-variable/noto-sans-bengali": "5.3.0",
    "@fontsource-variable/noto-sans-devanagari": "5.3.0",
    "@fontsource-variable/noto-sans-gujarati": "5.3.0",
    "@fontsource-variable/noto-sans-gurmukhi": "5.3.0",
    "@fontsource-variable/noto-sans-kannada": "5.3.0",
    "@fontsource-variable/noto-sans-malayalam": "5.3.0",
    "@fontsource-variable/noto-sans-tamil": "5.3.0",
    "@fontsource-variable/noto-sans-telugu": "5.3.0",
    "@fontsource-variable/noto-serif-devanagari": "5.3.0",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@travel-crm/brand": "workspace:*",
    "class-variance-authority": "0.7.1",
    "cn": "0.4.0",
    "input-otp": "1.5.0",
    "lucide-react": "1.56.0",
    "next": "16.4.0",
    "radix-ui": "1.8.1",
    "react": "catalog:",
    "react-dom": "catalog:",
    "shadcn": "4.21.4",
    "sonner": "2.0.8",
    "tw-animate-css": "1.4.0"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "16.4.0",
    "@tailwindcss/turbopack": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "eslint": "catalog:",
    "eslint-plugin-react-hooks": "7.1.1",
    "jsdom": "30.1.2",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install && pnpm format`

- [ ] **Step 4: Put the theme on the brand's tokens, and serve the brand's fonts**

Replace `apps/web/scripts/brand-css.ts` with:
```ts
// The brand's colours as CSS: one custom property each on :root (--brand-ink, --brand-status-good-dot...), and a
// Tailwind colour for each (bg-ink, text-status-good-ink...), so components read colours from the brand package
// instead of typing them.
import type { Brand } from "@travel-crm/brand";

/** "inputBorder" → "input-border". */
function kebabCase(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Every colour as [name, value], nested names joined by dashes: ["status-good-dot", "#16a34a"]. */
export function colourTokens(colours: Brand["colours"]): [string, string][] {
  const walk = (value: object, prefix: string): [string, string][] =>
    Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
      const name = prefix + kebabCase(key);
      if (typeof child === "string") return [[name, child] as [string, string]];
      return child !== null && typeof child === "object" ? walk(child, `${name}-`) : [];
    });
  return walk(colours, "");
}

/** The stylesheet globals.css imports after Tailwind. */
export function brandCss(colours: Brand["colours"]): string {
  const tokens = colourTokens(colours);
  return [
    "/* Generated by scripts/generate.ts from @travel-crm/brand. Do not edit: change packages/brand/src/brand.ts. */",
    ":root {",
    ...tokens.map(([name, value]) => `  --brand-${name}: ${value};`),
    "}",
    "",
    // Only the brand's colours exist: Tailwind's own palette (red-500, black, white...) is switched off.
    "@theme inline {",
    "  --color-*: initial;",
    ...tokens.map(([name]) => `  --color-${name}: var(--brand-${name});`),
    "}",
    "",
  ].join("\n");
}
```

Replace `apps/web/src/app/globals.css` with:
```css
/* The app's one stylesheet: Tailwind, the brand's colours, and the design rules of DESIGN.md as theme values. */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
/* The brand's colours, and only those: it switches Tailwind's own palette (red-500, black, white...) off. */
@import "../generated/brand.css";

/* No dark theme yet: dark: classes in shadcn components apply only under a .dark class nobody sets. */
@custom-variant dark (&:is(.dark *));

@theme inline {
  /* shadcn/ui's colour names, on the brand's roles (DESIGN.md section 2). */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  /* The dialog and sheet scrim: ink at 40 %. */
  --color-scrim: color-mix(in srgb, var(--brand-ink) 40%, transparent);

  /* Font stacks: the Latin file, its extended twin, then Indian scripts (DESIGN.md section 3). */
  --font-sans:
    var(--font-ui-extended), var(--font-ui), "Noto Sans Devanagari Variable", "Noto Sans Bengali Variable",
    "Noto Sans Tamil Variable", "Noto Sans Telugu Variable", "Noto Sans Gujarati Variable",
    "Noto Sans Kannada Variable", "Noto Sans Malayalam Variable", "Noto Sans Gurmukhi Variable", system-ui, sans-serif;
  --font-heading: var(--font-sans);
  --font-title:
    var(--font-title-extended), var(--font-title), "Noto Serif Devanagari Variable", "Noto Sans Bengali Variable",
    "Noto Sans Tamil Variable", "Noto Sans Telugu Variable", "Noto Sans Gujarati Variable",
    "Noto Sans Kannada Variable", "Noto Sans Malayalam Variable", "Noto Sans Gurmukhi Variable", serif;
  --font-mono: var(--font-numbers-extended), var(--font-numbers), ui-monospace, monospace;

  /* The type scale (DESIGN.md section 3): text-title, text-body, text-number... */
  --text-title: 1.875rem;
  --text-title--line-height: 2.25rem;
  --text-title-mobile: 1.5rem;
  --text-title-mobile--line-height: 1.875rem;
  --text-section: 1rem;
  --text-section--line-height: 1.5rem;
  --text-body: 0.9375rem;
  --text-body--line-height: 1.375rem;
  --text-label: 0.8125rem;
  --text-label--line-height: 1.125rem;
  --text-caption: 0.75rem;
  --text-caption--line-height: 1rem;
  --text-number: 0.875rem;
  --text-number--line-height: 1.25rem;
  --text-number-lg: 1.5rem;
  --text-number-lg--line-height: 1.875rem;

  /* Radii (DESIGN.md section 4): sm 6px for inputs, lg 10px for cards, xl 14px for dialogs, badge 4px. */
  --radius-badge: 4px;
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);

  /* Flat at rest; only floating overlays cast a shadow (DESIGN.md section 5). */
  --shadow-xs: none;
  --shadow-sm: none;
  --shadow-md: var(--overlay-shadow);
  --shadow-lg: var(--overlay-shadow);
  --shadow-xl: var(--overlay-shadow);

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}

:root {
  --radius: 0.625rem;
  --overlay-shadow:
    0 8px 24px color-mix(in srgb, var(--brand-ink) 10%, transparent),
    0 1px 2px color-mix(in srgb, var(--brand-ink) 6%, transparent);
  --background: var(--brand-canvas);
  --foreground: var(--brand-ink);
  --card: var(--brand-canvas);
  --card-foreground: var(--brand-ink);
  --popover: var(--brand-canvas);
  --popover-foreground: var(--brand-ink);
  --primary: var(--brand-action);
  --primary-foreground: var(--brand-on-action);
  --secondary: var(--brand-surface);
  --secondary-foreground: var(--brand-ink);
  --muted: var(--brand-surface);
  --muted-foreground: var(--brand-muted);
  /* Hover and selection: the action tint with its dark blue (the active nav item, a selected row). */
  --accent: var(--brand-action-tint);
  --accent-foreground: var(--brand-action-pressed);
  --destructive: var(--brand-status-bad-ink);
  --border: var(--brand-hairline);
  --input: var(--brand-input-border);
  --ring: var(--brand-action);
}

@layer base {
  * {
    @apply border-border;
  }
  html {
    @apply font-sans;
    -webkit-text-size-adjust: 100%;
  }
  body {
    @apply bg-background text-body text-foreground antialiased;
  }
  h1,
  h2,
  h3 {
    text-wrap: balance;
  }
  p {
    text-wrap: pretty;
  }
  /* Indian scripts need room for matras and conjuncts (DESIGN.md section 3). */
  :where(:lang(hi), :lang(mr), :lang(bn), :lang(ta), :lang(te), :lang(gu), :lang(kn), :lang(ml), :lang(pa)) {
    line-height: 1.6;
  }
}

/* Numbers are mono with tabular figures, so columns line up (DESIGN.md section 3). */
@utility numbers {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/*
 * Every focusable element shows a 2px action-blue outline 2px away when focused from the keyboard (DESIGN.md
 * section 8). Left outside any layer on purpose: unlayered rules win over Tailwind's utilities, so a component's
 * outline-none can't hide it.
 */
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

`apps/web/src/app/fonts.ts` (next/font needs each option written as a literal, so the range is repeated; the woff2
files are read from the Fontsource packages at build time and served from `/_next/static/media`):
```ts
// The brand's three typefaces (brand.fonts), served from our own address: Figtree for the interface, EB Garamond
// for page titles, IBM Plex Mono for numbers. next/font preloads them and sizes a local fallback to match, so text
// doesn't jump when they arrive (DESIGN.md section 3). Each comes in two files: "latin" has the digits but not ₹,
// "latin-ext" has ₹ and accented letters. The second is limited to its characters by unicode-range, so it downloads
// only when a page shows one of them. globals.css puts each pair, then the Noto fonts for Indian scripts, in a stack.
// next/font needs every option written out as a literal, so the range is repeated.
import localFont from "next/font/local";

export const ui = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-ui",
  adjustFontFallback: "Arial",
});

export const uiExtended = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-ui-extended",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

export const title = localFont({
  src: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2",
  weight: "400 800",
  variable: "--font-title",
  adjustFontFallback: "Times New Roman",
});

export const titleExtended = localFont({
  src: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-ext-wght-normal.woff2",
  weight: "400 800",
  variable: "--font-title-extended",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

export const numbers = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-numbers",
  adjustFontFallback: "Arial",
});

export const numbersExtended = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2",
      weight: "500",
    },
  ],
  variable: "--font-numbers-extended",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

/** Every font's CSS variable, for the <html> element. */
export const fontVariables = [ui, uiExtended, title, titleExtended, numbers, numbersExtended]
  .map((font) => font.variable)
  .join(" ");
```

Replace `apps/web/src/app/layout.tsx` with:
```tsx
// The root layout: the document, its language, the brand's fonts and styles, and the toast region.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@travel-crm/brand";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "./fonts";
// Indian scripts (DESIGN.md section 3). Each file's faces carry a unicode-range, so a browser downloads one only when
// a page shows that script.
import "@fontsource-variable/noto-sans-devanagari/wght.css";
import "@fontsource-variable/noto-sans-bengali/wght.css";
import "@fontsource-variable/noto-sans-tamil/wght.css";
import "@fontsource-variable/noto-sans-telugu/wght.css";
import "@fontsource-variable/noto-sans-gujarati/wght.css";
import "@fontsource-variable/noto-sans-kannada/wght.css";
import "@fontsource-variable/noto-sans-malayalam/wght.css";
import "@fontsource-variable/noto-sans-gurmukhi/wght.css";
import "@fontsource-variable/noto-serif-devanagari/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
  applicationName: brand.productName,
};

export const viewport: Viewport = {
  themeColor: brand.colours.canvas,
  width: "device-width",
  initialScale: 1,
  // Content may sit under the notch and home bar; the shell pads by env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

Replace `apps/web/src/lib/utils.ts` (the CLI's one line re-exports `cn` from shadcn's `cn` package) with:
```ts
// Class-name merging for Tailwind (shadcn/ui's `cn`). Components from other shadcn registries import it from here.
export { cn } from "cn";
```

- [ ] **Step 5: Restyle the components DESIGN.md changes**

Make these files exactly as below. They are the CLI's files after `pnpm format`, with DESIGN.md's changes (listed in
the README below). If the registry has moved on and a file differs elsewhere, keep this version: the colour-literal
test and the journeys check what matters.

`apps/web/src/components/ui/button.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-action-pressed",
        outline:
          "border-input bg-background text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-primary hover:bg-accent hover:text-accent-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border-foreground bg-background text-destructive hover:bg-status-bad-fill focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-11",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

`apps/web/src/components/ui/input.tsx`:
```tsx
import * as React from "react";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-input bg-background px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

`apps/web/src/components/ui/badge.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-badge border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
```

`apps/web/src/components/ui/dialog.tsx`:
```tsx
"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

`apps/web/src/components/ui/alert-dialog.tsx`:
```tsx
"use client";

import * as React from "react";
import { cn } from "cn";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm";
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action data-slot="alert-dialog-action" className={cn(className)} {...props} />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" className={cn(className)} {...props} />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
```

`apps/web/src/components/ui/sheet.tsx`:
```tsx
"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
```

`apps/web/src/components/ui/sonner.tsx`:
```tsx
"use client";

// Toasts (DESIGN.md section 6): bottom right on desktop, full width at the bottom on phones, the overlay shadow.
// The app has one light theme, so shadcn's next-themes lookup is left out. Errors stay until dismissed: callers pass
// { duration: Infinity } with toast.error.
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      duration={4000}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast shadow-md" } }}
      {...props}
    />
  );
};

export { Toaster };
```

`apps/web/src/components/ui/field.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn("mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base", className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-0.5 leading-snug", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50 *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn("relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2", className)}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: ({ message?: string } | undefined)[];
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors.length == 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
```

`apps/web/src/components/ui/input-otp.tsx`:
```tsx
"use client";

import * as React from "react";
import { cn } from "cn";
import { OTPInput, OTPInputContext } from "input-otp";
import { MinusIcon } from "lucide-react";

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn("cn-input-otp flex items-center has-disabled:opacity-50", containerClassName)}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        "flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
```

`apps/web/src/components/ui/README.md`:
````markdown
# shadcn/ui components

These files come from the shadcn/ui registry (`components.json`: style `radix-nova`, Radix primitives, Lucide
icons), added with `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`. They are ours to change, but kept close to the
registry so updates stay easy, so they skip the repo's purpose-comment rule. They take their colours from the
brand's tokens through the CSS variables in `src/app/globals.css`; none of them may hold a colour literal
(`test/no-colour-literals.test.ts`).

Changes made after adding them, for DESIGN.md:

- `button.tsx`: pill shape (`rounded-full`), 44px default height (`h-11`), 36px `sm`, 44px `icon`; primary hover is
  `action-pressed`; outline has the input border; ghost is blue text; destructive is an ink outline with red text.
- `input.tsx`: 44px high, 16px text at every width (no iOS zoom), 6px radius, canvas fill.
- `badge.tsx`: 4px radius.
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`: the overlay is the `scrim` token, without blur.
- `sonner.tsx`: one light theme (no `next-themes`), bottom right, a close button.
- `field.tsx`, `input-otp.tsx`: three small fixes the repo's strict lint rules ask for.

Adding a component from another shadcn-compatible registry: list the registry under `registries` in
`components.json`, then `pnpm dlx shadcn@4.21.4 add @<registry>/<name>`. Check the result against DESIGN.md, replace
any colour literal with a token, and pin any dependency the CLI added to an exact version.
````

- [ ] **Step 6: Write the shared pieces**

`apps/web/src/components/page-title.tsx`:
```tsx
// A screen's one h1 (DESIGN.md section 3): EB Garamond, 24px on phones and 30px from tablets up. Never used for
// cards, dialogs or tables.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("font-title text-title-mobile font-medium tracking-[-0.01em] md:text-title", className)}>
      {children}
    </h1>
  );
}
```

`apps/web/src/components/status-badge.tsx`:
```tsx
// A record's status (DESIGN.md section 6): always a dot and a word, never colour alone. Status colours mean status
// only: good (Confirmed, Paid), attention (Payment due, Pending), bad (Overdue, Lost), neutral (Draft, New).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "good" | "attention" | "bad" | "neutral";

// Written out in full so Tailwind finds every class.
const toneClasses: Record<StatusTone, { badge: string; dot: string }> = {
  good: { badge: "bg-status-good-fill text-status-good-ink", dot: "bg-status-good-dot" },
  attention: { badge: "bg-status-attention-fill text-status-attention-ink", dot: "bg-status-attention-dot" },
  bad: { badge: "bg-status-bad-fill text-status-bad-ink", dot: "bg-status-bad-dot" },
  neutral: { badge: "bg-status-neutral-fill text-status-neutral-ink", dot: "bg-status-neutral-dot" },
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const classes = toneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-badge px-2 text-caption font-medium whitespace-nowrap",
        classes.badge,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", classes.dot)} />
      {children}
    </span>
  );
}
```

`apps/web/src/components/empty-state.tsx`:
```tsx
// What a list shows when it has nothing (DESIGN.md section 6): what belongs here, one way to add it, never a blank.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, message, action }: { icon: LucideIcon; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <Icon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
      <p className="max-w-[40ch] text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
```

`apps/web/src/components/error-state.tsx`:
```tsx
"use client";

// What a screen shows when its data didn't load (DESIGN.md section 6): what failed, and a way to try again.
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <TriangleAlertIcon aria-hidden="true" className="size-10 text-status-bad-ink" strokeWidth={1.25} />
      <p className="max-w-[40ch]">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
```

`apps/web/src/components/delayed.tsx`:
```tsx
"use client";

// Shows its children only after a short wait (DESIGN.md: skeletons after 200ms), so a quick load never flashes one.
import { useEffect, useState, type ReactNode } from "react";

export function Delayed({ children, after = 200 }: { children: ReactNode; after?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, after);
    return () => {
      clearTimeout(timer);
    };
  }, [after]);
  return shown ? children : null;
}
```

- [ ] **Step 7: Run the tests and a build**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm generate && pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`

Expected: 11 tests pass in 7 files; typecheck and lint clean; the build prerenders `/` as static. In the built CSS
(`.next/static/chunks/*.css`) there is no `--color-red-500`, the unlayered `:focus-visible{outline:2px solid
var(--ring)...}` comes after Tailwind's layers, and `.next/static/media` holds the Figtree, EB Garamond and IBM Plex
Mono files, with each Latin-extended face limited by `unicode-range`.

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint && pnpm --filter @travel-crm/web test && pnpm run depcruise`

Expected: green; web 11 tests.

```bash
cd /Users/ak/personal/travel-crm-05a
git add apps/web/components.json apps/web/package.json apps/web/scripts/brand-css.ts apps/web/src apps/web/test apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(web): style the app with the brand's tokens, its fonts and shadcn/ui components"
```

---

### Task G3: Talking to the api, in Indian English

The data layer every screen uses (spec 11): the tRPC client with TanStack Query, a cache that refreshes in the
background, is saved to IndexedDB, is shown at once on the next visit and is wiped on sign-out in every tab; what a
refusal means (sign in again, take a pending step, or show the reason); the sign-in calls the account screens make;
next-intl with one message file per feature; and money, counts and dates the Indian way, in the organization's time
zone, which `me.get` now returns.

**Files:**
- Modify: `packages/contracts/src/identity/me.ts`, `packages/domain/src/identity/access.ts`,
  `apps/api/test/request-checks.test.ts`, `pnpm-workspace.yaml`
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/data/{trpc,api-error,query-client,persistence,auth-client,session}.ts`,
  `apps/web/src/data/providers.tsx`, `apps/web/src/lib/{routes,format,error-message}.ts`,
  `apps/web/src/i18n/{messages,request}.ts`, `apps/web/src/i18n/types.d.ts`,
  `apps/web/src/i18n/messages/en-IN/{common,errors,account,staff,roles,settings,shell}.json`
- Test: `apps/web/test/support/api-errors.ts`, `apps/web/test/data/{refusals,auth-client,session}.test.ts`,
  `apps/web/test/lib/{routes.test.ts,error-message.test.tsx}`, `apps/web/test/format.test.ts`

**Interfaces:**
- Consumes: `AppRouter` (type, `@travel-crm/api`); `MeOutput`, `PendingStep` (`@travel-crm/contracts/identity`);
  `formatMoney`, `formatIndianNumber`, `formatDateTime`, `yearIn`, `Money`, `money` (`@travel-crm/domain/kernel`).
- Produces:
  - `me.get`'s `organization.timeZone: string`.
  - `TRPCProvider`, `useTRPC()`, `useTRPCClient()`, `createApiClient()` (`@/data/trpc`).
  - `refusalOf(error): { status: number; reason: string | null } | null`, `isWorthRetrying(error)` (`@/data/api-error`).
  - `createQueryClient({ onSignedOut, onPendingStep })`, `handleRefusal(error, handlers)`, `QUERY_CACHE_MAX_AGE`
    (`@/data/query-client`); `DataProviders` (`@/data/providers`), mounted in the root layout.
  - `createQueryPersister()`, `deletePersistedQueries()`, `hasPersistedQueries()` (`@/data/persistence`; IndexedDB
    database `travel-crm`, store `query-cache`, key `queries`).
  - `authClient` and `createAuthClient(fetch?)` with `signInWithEmail`, `signInWithCode`, `verifyTwoFactorCode`,
    `verifyBackupCode`, `changePassword`, `startTwoFactorSetup`, `confirmTwoFactor`, `turnOffTwoFactor`,
    `requestPasswordReset`, `resetPassword`, `signOut`, each returning
    `AuthResult<T> = { ok: true; data: T } | { ok: false; status; code; retryAfterSeconds }`; types `AuthClient`,
    `SignInOutcome = { twoFactorRequired }`, `TwoFactorSetup = { totpUri, backupCodes }` (`@/data/auth-client`).
  - `wipeLocalData(queryClient)`, `signOut(queryClient, auth)`, `announceSignOut()`, `listenForSignOut(callback)`
    (`@/data/session`).
  - `routes` (`home`, `signIn`, `twoFactorChallenge`, `forgotPassword`, `resetPassword`, `changePassword`,
    `twoFactorSetup`, `account`, `staff`, `roles`, `settings`), `isPublicRoute(path)`, `pendingStepRoute(step)`,
    `signInRoute(from?)`, `isAppPath(path)` (`@/lib/routes`).
  - `formatRupees(amount, { paise? })`, `formatCount(value)`, `formatDay(instant, { timeZone, now? })`,
    `formatTime(instant, { timeZone })` (`@/lib/format`).
  - `useErrorMessage(): { apiError(error), authError(failure) }` (`@/lib/error-message`).
  - `locale` (`"en-IN"`), `messages`, `Messages` (`@/i18n/messages`); message namespaces `common`, `errors` (filled
    here), and `account`, `staff`, `roles`, `settings`, `shell`, left `{}` for the tasks that own them.
  - In tests: `refusal(httpStatus, reason?)`, `unanswered()` (`test/support/api-errors.ts`).

- [ ] **Step 1: Write the failing api test**

In `apps/api/test/request-checks.test.ts`:

replace:
```ts
    expect(me.organization).toMatchObject({ id: agency.organizationId, code: agency.code, requireTwoFactor: false });
```
with:
```ts
    expect(me.organization).toMatchObject({
      id: agency.organizationId,
      code: agency.code,
      requireTwoFactor: false,
      timeZone: "Asia/Kolkata",
    });
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/request-checks.test.ts -t "tells a member"`

Expected: FAIL: the received organization has no `timeZone`.

- [ ] **Step 2: Return the organization's time zone from me.get**

In `packages/contracts/src/identity/me.ts`:

replace:
```ts
    .object({ id: recordId, name: z.string(), code: z.string(), requireTwoFactor: z.boolean() })
```
with:
```ts
    .object({
      id: recordId,
      name: z.string(),
      code: z.string(),
      requireTwoFactor: z.boolean(),
      /** An IANA zone such as "Asia/Kolkata": the web app shows dates and times in it (spec 9.6). */
      timeZone: z.string(),
    })
```

In `packages/domain/src/identity/access.ts`:

replace:
```ts
      requireTwoFactor: organization.requireTwoFactor,
    },
```
with:
```ts
      requireTwoFactor: organization.requireTwoFactor,
      timeZone: organization.timeZone,
    },
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server exec vitest run test/request-checks.test.ts`

Expected: 14 tests pass.

- [ ] **Step 3: Add the data and translation packages**

In `pnpm-workspace.yaml`:

replace:
```yaml
  esbuild: true
```
with:
```yaml
  esbuild: true
  # next-intl's message extractor, which the web app doesn't run; both ship prebuilt binaries.
  "@parcel/watcher": false
  "@swc/core": false
```

replace:
```yaml
# @trpc/server ships "agent skills" for AI coding tools; we don't install them.
permissions:
  "@trpc/server":
    skills: false
```
with:
```yaml
# tRPC's packages ship "agent skills" for AI coding tools; we don't install them.
permissions:
  "@trpc/server":
    skills: false
  "@trpc/client":
    skills: false
  "@trpc/tanstack-react-query":
    skills: false
```

Replace `apps/web/package.json` with:
```json
{
  "name": "@travel-crm/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "dev": "pnpm run generate && next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/eb-garamond": "5.3.0",
    "@fontsource-variable/figtree": "5.3.0",
    "@fontsource-variable/noto-sans-bengali": "5.3.0",
    "@fontsource-variable/noto-sans-devanagari": "5.3.0",
    "@fontsource-variable/noto-sans-gujarati": "5.3.0",
    "@fontsource-variable/noto-sans-gurmukhi": "5.3.0",
    "@fontsource-variable/noto-sans-kannada": "5.3.0",
    "@fontsource-variable/noto-sans-malayalam": "5.3.0",
    "@fontsource-variable/noto-sans-tamil": "5.3.0",
    "@fontsource-variable/noto-sans-telugu": "5.3.0",
    "@fontsource-variable/noto-serif-devanagari": "5.3.0",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@tanstack/query-async-storage-persister": "5.104.2",
    "@tanstack/react-query": "5.104.2",
    "@tanstack/react-query-persist-client": "5.104.2",
    "@travel-crm/brand": "workspace:*",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@trpc/client": "11.19.0",
    "@trpc/server": "11.19.0",
    "@trpc/tanstack-react-query": "11.19.0",
    "class-variance-authority": "0.7.1",
    "cn": "0.4.0",
    "idb-keyval": "6.3.0",
    "input-otp": "1.5.0",
    "lucide-react": "1.56.0",
    "next": "16.4.0",
    "next-intl": "4.14.9",
    "radix-ui": "1.8.1",
    "react": "catalog:",
    "react-dom": "catalog:",
    "shadcn": "4.21.4",
    "sonner": "2.0.8",
    "tw-animate-css": "1.4.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "16.4.0",
    "@tailwindcss/turbopack": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@travel-crm/api": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "eslint": "catalog:",
    "eslint-plugin-react-hooks": "7.1.1",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.2",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

Expected: no prompt about build scripts or agent skills.

- [ ] **Step 4: Write the failing web tests**

`apps/web/test/support/api-errors.ts`:
```ts
// tRPC errors as the client builds them from the api's answers, for tests of how the app reacts to refusals.
import { TRPCClientError } from "@trpc/client";

/** A refusal with the api's error shape: an HTTP status and, for domain errors, a reason. */
export function refusal(httpStatus: number, reason: string | null = null): TRPCClientError<never> {
  return TRPCClientError.from({
    error: {
      message: reason ?? "Refused",
      code: -32603,
      data: { code: "FORBIDDEN", httpStatus, domainCode: reason ? "FORBIDDEN" : null, reason },
    },
  });
}

/** A call that never got an answer, as when the device is offline. */
export function unanswered(): TRPCClientError<never> {
  return TRPCClientError.from(new TypeError("Failed to fetch"));
}
```

`apps/web/test/data/refusals.test.ts`:
```ts
// How the data layer treats the api's answers: refusals aren't retried, a 401 signs the person out, a pending step
// sends them to take it, and anything else is left to the screen that made the call.
import { describe, expect, it, vi } from "vitest";
import { isWorthRetrying, refusalOf } from "@/data/api-error";
import { handleRefusal } from "@/data/query-client";
import { refusal, unanswered } from "../support/api-errors";

describe("refusalOf", () => {
  it("reads the status and domain reason the api sent", () => {
    expect(refusalOf(refusal(403, "MISSING_PERMISSION"))).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(refusalOf(refusal(401))).toEqual({ status: 401, reason: null });
  });

  it("finds no refusal when the call got no answer", () => {
    expect(refusalOf(unanswered())).toBeNull();
    expect(refusalOf(new Error("boom"))).toBeNull();
  });
});

describe("isWorthRetrying", () => {
  it("retries unanswered calls and server faults, never a refusal", () => {
    expect(isWorthRetrying(unanswered())).toBe(true);
    expect(isWorthRetrying(refusal(500))).toBe(true);
    expect(isWorthRetrying(refusal(403, "MISSING_PERMISSION"))).toBe(false);
    expect(isWorthRetrying(refusal(401))).toBe(false);
  });
});

describe("handleRefusal", () => {
  const handlers = () => ({ onSignedOut: vi.fn(), onPendingStep: vi.fn() });

  it("signs the person out on a 401", () => {
    const spies = handlers();
    handleRefusal(refusal(401), spies);
    expect(spies.onSignedOut).toHaveBeenCalledOnce();
    expect(spies.onPendingStep).not.toHaveBeenCalled();
  });

  it("sends the person to a step the api insists on", () => {
    const spies = handlers();
    handleRefusal(refusal(403, "CHANGE_PASSWORD"), spies);
    handleRefusal(refusal(403, "SET_UP_TWO_FACTOR"), spies);
    expect(spies.onPendingStep.mock.calls).toEqual([["CHANGE_PASSWORD"], ["SET_UP_TWO_FACTOR"]]);
  });

  it("leaves other refusals and failures to the screen", () => {
    const spies = handlers();
    handleRefusal(refusal(403, "MISSING_PERMISSION"), spies);
    handleRefusal(unanswered(), spies);
    expect(spies.onSignedOut).not.toHaveBeenCalled();
    expect(spies.onPendingStep).not.toHaveBeenCalled();
  });
});
```

`apps/web/test/data/auth-client.test.ts`:
```ts
// The sign-in and account calls: JSON POSTs to /api/auth on the app's own address, reading only what screens need.
import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "@/data/auth-client";

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status, headers })));
}

/** The JSON body of the fetch call made. */
function sentBody(fetch: ReturnType<typeof answering>): unknown {
  return JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
}

describe("authClient", () => {
  it("posts JSON to the same origin, with the cookies", async () => {
    const fetch = answering(200, { redirect: false, token: "t", user: { email: "x@no-email.invalid" } });
    await createAuthClient(fetch).signInWithEmail({ email: "asha@example.in", password: "secret-password" });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(sentBody(fetch)).toEqual({ email: "asha@example.in", password: "secret-password" });
  });

  it("keeps nothing of Better Auth's user, so a placeholder email can't leak to a screen", async () => {
    const fetch = answering(200, { token: "t", user: { email: "sharma-ravi@no-email.invalid" } });
    const result = await createAuthClient(fetch).signInWithCode({ orgCode: "SHARMA", username: "ravi", password: "p" });
    expect(result).toEqual({ ok: true, data: { twoFactorRequired: false } });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/auth/sign-in/org");
  });

  it("says when a two-factor code must follow", async () => {
    const result = await createAuthClient(answering(200, { twoFactorRedirect: true })).signInWithEmail({
      email: "a@b.in",
      password: "p",
    });
    expect(result).toEqual({ ok: true, data: { twoFactorRequired: true } });
  });

  it("asks for other sessions to end when the password changes", async () => {
    const fetch = answering(200, { token: "t" });
    await createAuthClient(fetch).changePassword({ currentPassword: "old-password", newPassword: "new-password-1" });
    expect(sentBody(fetch)).toEqual({
      currentPassword: "old-password",
      newPassword: "new-password-1",
      revokeOtherSessions: true,
    });
  });

  it("reads the two-factor setup link and backup codes", async () => {
    const fetch = answering(200, { totpURI: "otpauth://totp/x?secret=ABC", backupCodes: ["a1", "b2", 3] });
    const result = await createAuthClient(fetch).startTwoFactorSetup({ password: "p" });
    expect(result).toEqual({ ok: true, data: { totpUri: "otpauth://totp/x?secret=ABC", backupCodes: ["a1", "b2"] } });
  });

  it("returns the error code and the wait a rate limit asks for", async () => {
    const refused = await createAuthClient(answering(401, { code: "INVALID_EMAIL_OR_PASSWORD" })).signInWithEmail({
      email: "a@b.in",
      password: "wrong",
    });
    expect(refused).toEqual({ ok: false, status: 401, code: "INVALID_EMAIL_OR_PASSWORD", retryAfterSeconds: null });
    const limited = await createAuthClient(answering(429, {}, { "x-retry-after": "42" })).signInWithEmail({
      email: "a@b.in",
      password: "p",
    });
    expect(limited).toEqual({ ok: false, status: 429, code: "TOO_MANY_REQUESTS", retryAfterSeconds: 42 });
  });

  it("reports an unreachable api as a network failure", async () => {
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await createAuthClient(offline).signOut()).toEqual({
      ok: false,
      status: 0,
      code: "NETWORK",
      retryAfterSeconds: null,
    });
  });
});
```

`apps/web/test/data/session.test.ts`:
```ts
// Signing out leaves nothing readable on the device: the cache in memory and its IndexedDB copy are gone, and the
// app's other tabs are told, even when the api can't be reached.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/data/auth-client";
import { createQueryPersister, hasPersistedQueries } from "@/data/persistence";
import { listenForSignOut, signOut } from "@/data/session";

/** A cache holding one organization's staff list, saved to IndexedDB as the app saves it. */
async function savedCache(): Promise<QueryClient> {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["staff", "list"], [{ name: "Ravi", email: "ravi@sharma.in" }]);
  await persistQueryClientSave({ queryClient, persister: createQueryPersister() });
  expect(await hasPersistedQueries()).toBe(true);
  return queryClient;
}

function authAnswering(signOutResult: ReturnType<AuthClient["signOut"]>): AuthClient {
  return { signOut: vi.fn(() => signOutResult) } as unknown as AuthClient;
}

describe("signOut", () => {
  it("ends the session, then wipes the cache and its saved copy", async () => {
    const queryClient = await savedCache();
    const auth = authAnswering(Promise.resolve({ ok: true, data: null }));
    await signOut(queryClient, auth);
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("wipes the device even when the api can't be reached", async () => {
    const queryClient = await savedCache();
    await signOut(queryClient, authAnswering(Promise.reject(new TypeError("Failed to fetch")))).catch(() => undefined);
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("tells the app's other tabs", async () => {
    const otherTab = vi.fn();
    const stopListening = listenForSignOut(otherTab);
    await signOut(new QueryClient(), authAnswering(Promise.resolve({ ok: true, data: null })));
    await vi.waitFor(() => {
      expect(otherTab).toHaveBeenCalledOnce();
    });
    stopListening();
  });
});
```

`apps/web/test/lib/routes.test.ts`:
```ts
// Redirects only ever lead to a page of this app: a ?next= naming another site is ignored.
import { describe, expect, it } from "vitest";
import { isAppPath, isPublicRoute, pendingStepRoute, routes, signInRoute } from "@/lib/routes";

describe("routes", () => {
  it("brings the person back to an app path after signing in", () => {
    expect(signInRoute("/staff")).toBe("/sign-in?next=%2Fstaff");
    expect(signInRoute()).toBe("/sign-in");
  });

  it("refuses paths that lead to another site", () => {
    expect(isAppPath("/roles")).toBe(true);
    for (const path of ["//evil.example", "https://evil.example", "/\\evil.example", "staff"]) {
      expect(isAppPath(path), path).toBe(false);
      expect(signInRoute(path)).toBe("/sign-in");
    }
  });

  it("knows the signed-out screens and where each pending step is taken", () => {
    expect(isPublicRoute(routes.signIn)).toBe(true);
    expect(isPublicRoute(routes.resetPassword)).toBe(true);
    expect(isPublicRoute(routes.staff)).toBe(false);
    expect(pendingStepRoute("CHANGE_PASSWORD")).toBe(routes.changePassword);
    expect(pendingStepRoute("SET_UP_TWO_FACTOR")).toBe(routes.twoFactorSetup);
  });
});
```

`apps/web/test/lib/error-message.test.tsx`:
```tsx
// The sentence for a failure: the reason's own message if it has one, else one for the status or for being offline.
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { useErrorMessage } from "@/lib/error-message";
import { refusal, unanswered } from "../support/api-errors";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("useErrorMessage", () => {
  const { result } = renderHook(() => useErrorMessage(), { wrapper });

  it("uses the domain reason's message", () => {
    expect(result.current.apiError(refusal(409, "ROLE_IN_USE"))).toBe(messages.errors.reasons.ROLE_IN_USE);
  });

  it("falls back to the status, and to the network message when nothing answered", () => {
    expect(result.current.apiError(refusal(403, "SOMETHING_NEW"))).toBe(messages.errors.forbidden);
    expect(result.current.apiError(refusal(500))).toBe(messages.errors.generic);
    expect(result.current.apiError(unanswered())).toBe(messages.errors.network);
  });

  it("explains sign-in failures by their code", () => {
    const wrongPassword = {
      ok: false,
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      retryAfterSeconds: null,
    } as const;
    expect(result.current.authError(wrongPassword)).toBe(messages.errors.auth.INVALID_EMAIL_OR_PASSWORD);
    expect(result.current.authError({ ...wrongPassword, status: 429, code: "TOO_MANY_REQUESTS" })).toBe(
      messages.errors.tooManyRequests,
    );
  });
});
```

`apps/web/test/format.test.ts`:
```ts
// Indian formats (DESIGN.md section 9): lakh and crore grouping, paise only when there are some, and dates in the
// organization's zone, where 18:30 UTC is already the next day.
import { money } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { formatCount, formatDay, formatRupees, formatTime } from "@/lib/format";

describe("formatRupees", () => {
  it("groups by lakh and crore, and shows paise only when there are some", () => {
    expect(formatRupees(money(125_000_000))).toBe("₹12,50,000");
    expect(formatRupees(money(125_050))).toBe("₹1,250.50");
    expect(formatRupees(money(-450_000))).toBe("-₹4,500");
    expect(formatRupees(money(0))).toBe("₹0");
  });

  it("always shows paise when asked, as invoices do", () => {
    expect(formatRupees(money(125_000_000), { paise: "always" })).toBe("₹12,50,000.00");
  });
});

describe("formatCount", () => {
  it("groups the Indian way", () => {
    expect(formatCount(123_456)).toBe("1,23,456");
    expect(formatCount(999)).toBe("999");
  });
});

describe("formatDay", () => {
  const now = new Date("2026-10-15T06:00:00Z");

  it("leaves the year out for this year and shows it for others", () => {
    expect(formatDay(new Date("2026-10-16T06:00:00Z"), { timeZone: "Asia/Kolkata", now })).toBe("16 Oct");
    expect(formatDay(new Date("2027-10-16T06:00:00Z"), { timeZone: "Asia/Kolkata", now })).toBe("16 Oct 2027");
  });

  it("counts the day in the organization's zone, not in UTC", () => {
    // 18:45 UTC on 15 October is 00:15 on 16 October in India.
    const lateEvening = new Date("2026-10-15T18:45:00Z");
    expect(formatDay(lateEvening, { timeZone: "Asia/Kolkata", now })).toBe("16 Oct");
    expect(formatDay(lateEvening, { timeZone: "UTC", now })).toBe("15 Oct");
  });

  it("decides 'this year' in the organization's zone too", () => {
    // 31 Dec 2026 20:00 UTC is already 1 Jan 2027 in India.
    const newYearInIndia = new Date("2026-12-31T20:00:00Z");
    expect(formatDay(newYearInIndia, { timeZone: "Asia/Kolkata", now: new Date("2027-01-02T00:00:00Z") })).toBe(
      "1 Jan",
    );
  });
});

describe("formatTime", () => {
  it("uses the 12-hour clock in the organization's zone", () => {
    expect(formatTime(new Date("2026-10-15T11:00:00Z"), { timeZone: "Asia/Kolkata" })).toBe("4:30 pm");
  });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run`

Expected: FAIL: `@/data/*`, `@/lib/routes`, `@/lib/format`, `@/lib/error-message` and `@/i18n/messages` don't exist.
The 11 tests from Task G2 still pass.

- [ ] **Step 6: Write the words**

`apps/web/src/i18n/messages/en-IN/common.json`:
```json
{
  "loading": "Loading",
  "tryAgain": "Try again",
  "save": "Save",
  "saving": "Saving",
  "cancel": "Cancel",
  "close": "Close",
  "back": "Back",
  "continue": "Continue",
  "skipToContent": "Skip to content",
  "offline": "You're offline. Showing what was last loaded; changes wait until you're back online."
}
```

`apps/web/src/i18n/messages/en-IN/errors.json` (each api reason a 5A screen can meet, and Better Auth's codes for the
sign-in calls; `RESET_PASSWORD_DISABLED` is Better Auth's answer to a reset request until plan 3's Task I3 is merged):
```json
{
  "generic": "Something went wrong. Try again.",
  "network": "Couldn't reach the server. Check your connection and try again.",
  "signedOut": "Your session has ended. Sign in again.",
  "forbidden": "You don't have permission to do this.",
  "notFound": "This no longer exists. It may have been removed.",
  "tooManyRequests": "Too many attempts. Wait a minute and try again.",
  "invalid": "Some details aren't right. Check them and try again.",
  "loadFailed": "This didn't load.",
  "reasons": {
    "MISSING_PERMISSION": "Your role doesn't allow this. Ask an Owner or Admin.",
    "NOT_A_MEMBER": "You're not a member of an organization.",
    "OWNER_ONLY": "Only an Owner can do this.",
    "OWNER_ROLE_IS_FIXED": "The Owner role always holds every permission and can't be changed.",
    "CANNOT_CHANGE_YOURSELF": "You can't change your own role or remove yourself.",
    "EXCEEDS_YOUR_PERMISSIONS": "You can only give permissions you hold yourself.",
    "ENABLE_TWO_FACTOR_FIRST": "Turn on two-factor sign-in for yourself first.",
    "LAST_OWNER": "The organization needs at least one Owner.",
    "STAFF_CHANGED": "Someone changed this person at the same time. Look again and retry.",
    "EMAIL_OR_USERNAME_TAKEN": "That email or username is already in use.",
    "EMAIL_OR_USERNAME_REQUIRED": "Give an email, a username or both.",
    "INVALID_USERNAME": "Usernames use 2-32 letters, digits, dots, dashes or underscores.",
    "MEMBER_NOT_FOUND": "This person is no longer on the staff list.",
    "ROLE_NOT_FOUND": "This role no longer exists.",
    "ROLE_IN_USE": "Staff still have this role. Give them another role first.",
    "ROLE_NAME_TAKEN": "Another role already has this name.",
    "SCOPE_REQUIRED": "Choose whether this role sees its own records or all of them.",
    "SCOPE_NOT_ALLOWED": "Only view permissions take a scope.",
    "UNKNOWN_PERMISSION": "One of these permissions doesn't exist any more. Reload and try again.",
    "CHANGE_PASSWORD": "Choose a new password first.",
    "SET_UP_TWO_FACTOR": "Set up two-factor sign-in first.",
    "PLATFORM_ONLY": "Only platform staff can do this."
  },
  "auth": {
    "INVALID_EMAIL_OR_PASSWORD": "That email and password don't match.",
    "INVALID_USERNAME_OR_PASSWORD": "That organization code, username and password don't match.",
    "VALIDATION": "Give your organization code, username and password.",
    "BANNED_USER": "This account can't sign in. Ask your organization's admin.",
    "INVALID_PASSWORD": "Your current password isn't right.",
    "NEW_PASSWORD_MUST_DIFFER": "Choose a password different from the current one.",
    "PASSWORD_TOO_SHORT": "Use at least 10 characters.",
    "PASSWORD_TOO_LONG": "Use at most 128 characters.",
    "INVALID_CODE": "That code isn't right. Codes change every 30 seconds.",
    "INVALID_BACKUP_CODE": "That backup code isn't right, or it was used already.",
    "INVALID_TWO_FACTOR_COOKIE": "Your sign-in timed out. Start again.",
    "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE": "Too many wrong codes. Start signing in again.",
    "INVALID_TOKEN": "This reset link has expired or was used already. Ask for a new one.",
    "RESET_PASSWORD_DISABLED": "Password reset by email isn't available yet. Ask your organization's admin."
  }
}
```

Create `apps/web/src/i18n/messages/en-IN/account.json`, `staff.json`, `roles.json`, `settings.json` and `shell.json`,
each holding only `{}` and a newline. Their features fill them (Tasks G4, A1-A3, O1-O3).

`apps/web/src/i18n/messages.ts`:
```ts
// Every message the app shows, by namespace (spec 9.6: next-intl from day one, English only in Phase 1). Each feature
// owns one namespace file, so features can be written side by side without touching each other's words.
import account from "./messages/en-IN/account.json";
import common from "./messages/en-IN/common.json";
import errors from "./messages/en-IN/errors.json";
import roles from "./messages/en-IN/roles.json";
import settings from "./messages/en-IN/settings.json";
import shell from "./messages/en-IN/shell.json";
import staff from "./messages/en-IN/staff.json";

export const locale = "en-IN";

export const messages = { account, common, errors, roles, settings, shell, staff };

export type Messages = typeof messages;
```

`apps/web/src/i18n/request.ts`:
```ts
// next-intl's request configuration: one locale and its messages. Without i18n routing there's no locale in the URL;
// a second language adds routing then.
import { getRequestConfig } from "next-intl/server";
import { locale, messages } from "./messages";

export default getRequestConfig(() => Promise.resolve({ locale, messages }));
```

`apps/web/src/i18n/types.d.ts`:
```ts
// Types next-intl checks message keys and the locale against: t("staff.title") fails to compile if the key is missing.
import type { locale, Messages } from "./messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof locale;
    Messages: Messages;
  }
}
```

- [ ] **Step 7: Write the data layer, the routes and the formats**

`apps/web/src/data/trpc.ts`:
```ts
// The tRPC client and its TanStack Query hooks (spec 11). The web app knows the api only by its AppRouter type; calls
// go to /api/trpc on the address the app was loaded from (spec 3), batched, as GET for queries and JSON POST for
// mutations, which the api requires (it refuses other origins and content types).
import type { AppRouter } from "@travel-crm/api";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createApiClient() {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc" })] });
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

`apps/web/src/data/api-error.ts`:
```ts
// What the api said when it refused a call: its HTTP status and the domain reason (spec 9.7), read from a tRPC error.
import type { AppRouter } from "@travel-crm/api";
import { TRPCClientError } from "@trpc/client";

export interface ApiRefusal {
  /** The HTTP status, e.g. 403. */
  status: number;
  /** The domain reason, e.g. "MISSING_PERMISSION" or "SET_UP_TWO_FACTOR", or null. */
  reason: string | null;
}

/** The refusal in a failed call, or null when the call never got an answer (offline, the api down). */
export function refusalOf(error: unknown): ApiRefusal | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data = (error as TRPCClientError<AppRouter>).data;
  if (!data) return null;
  return { status: data.httpStatus, reason: data.reason };
}

/** A refusal is the api's answer: trying again gives the same one. Only unanswered calls and server faults retry. */
export function isWorthRetrying(error: unknown): boolean {
  const refusal = refusalOf(error);
  return refusal === null || refusal.status >= 500;
}
```

`apps/web/src/data/query-client.ts`:
```ts
// The app's TanStack Query cache (spec 11): queries stay fresh for 30 seconds and refresh in the background when the
// window regains focus or the device reconnects; a refusal is never retried. Two refusals change where the person
// is: a 401 (the session ended) and a pending step (a password change or two-factor setup the api insists on).
import type { PendingStep } from "@travel-crm/contracts/identity";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isWorthRetrying, refusalOf } from "./api-error";

const DAY = 24 * 60 * 60 * 1000;

export interface RefusalHandlers {
  /** The session is gone: the person must sign in again. */
  onSignedOut: () => void;
  /** The api wants this done before anything else. */
  onPendingStep: (step: PendingStep) => void;
}

export function handleRefusal(error: unknown, handlers: RefusalHandlers): void {
  const refusal = refusalOf(error);
  if (refusal?.status === 401) handlers.onSignedOut();
  else if (refusal?.reason === "CHANGE_PASSWORD" || refusal?.reason === "SET_UP_TWO_FACTOR") {
    handlers.onPendingStep(refusal.reason);
  }
}

export function createQueryClient(handlers: RefusalHandlers): QueryClient {
  const onError = (error: unknown) => {
    handleRefusal(error, handlers);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Kept for a day, as long as the copy in IndexedDB, so the last lists show on a weak connection.
        gcTime: DAY,
        retry: (failures, error) => failures < 2 && isWorthRetrying(error),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

export const QUERY_CACHE_MAX_AGE = DAY;
```

`apps/web/src/data/persistence.ts`:
```ts
// The query cache's copy in IndexedDB (spec 11: for weak connections), so the last lists show at once, even offline.
// It holds organization data, so signing out wipes it, here and in every other tab of the app.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set, type UseStore } from "idb-keyval";

const DATABASE = "travel-crm";
const STORE = "query-cache";
const KEY = "queries";

let store: UseStore | undefined;

/** The IndexedDB store, opened on first use: there is no IndexedDB while a page renders on the server. */
function cacheStore(): UseStore {
  store ??= createStore(DATABASE, STORE);
  return store;
}

export function createQueryPersister(): Persister {
  return createAsyncStoragePersister({
    key: KEY,
    storage: {
      getItem: (key) => get<string>(key, cacheStore()),
      setItem: (key, value: string) => set(key, value, cacheStore()),
      removeItem: (key) => del(key, cacheStore()),
    },
    // Write at most once a second, however busy the cache is.
    throttleTime: 1000,
  });
}

/** Removes the saved copy. */
export async function deletePersistedQueries(): Promise<void> {
  await del(KEY, cacheStore());
}

/** Whether a saved copy exists, for tests and the sign-out check. */
export async function hasPersistedQueries(): Promise<boolean> {
  return (await get(KEY, cacheStore())) !== undefined;
}
```

`apps/web/src/data/auth-client.ts`:
```ts
// Better Auth's endpoints the screens use, and our organization-code sign-in, as small typed calls. All are JSON
// POSTs to /api/auth on the app's own address, so the browser sends the session cookie and a trusted Origin.
// Only what the screens need is read from each answer: Better Auth's user objects are never kept, because for staff
// without email they hold the placeholder address, which is never shown (ADR 0006). me.get says who is signed in.

export type AuthResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** The HTTP status, or 0 when the api couldn't be reached. */
      status: number;
      /** Better Auth's or our error code, e.g. "INVALID_EMAIL_OR_PASSWORD"; "NETWORK" when unreachable. */
      code: string;
      /** From a 429: how long to wait before trying again. */
      retryAfterSeconds: number | null;
    };

export interface SignInOutcome {
  /** The password was right and the person uses two-factor: a code must follow. */
  twoFactorRequired: boolean;
}

export interface TwoFactorSetup {
  /** The otpauth:// link an authenticator app reads, shown as a QR code and as text. */
  totpUri: string;
  /** One-time codes for when the phone is lost. */
  backupCodes: string[];
}

type Fetch = typeof fetch;

/** The JSON body of a response, or {} when it has none or isn't JSON. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createAuthClient(fetchImplementation: Fetch = (...arguments_) => fetch(...arguments_)) {
  async function post<T>(path: string, body: unknown, read: (body: Record<string, unknown>) => T) {
    let response: Response;
    try {
      response = await fetchImplementation(`/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
    } catch {
      return { ok: false, status: 0, code: "NETWORK", retryAfterSeconds: null } satisfies AuthResult<T>;
    }
    const json = await bodyOf(response);
    if (response.ok) return { ok: true, data: read(json) } satisfies AuthResult<T>;
    const retryAfter = Number(response.headers.get("x-retry-after") ?? response.headers.get("retry-after"));
    return {
      ok: false,
      status: response.status,
      code: typeof json.code === "string" ? json.code : response.status === 429 ? "TOO_MANY_REQUESTS" : "UNKNOWN",
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    } satisfies AuthResult<T>;
  }

  const signInOutcome = (body: Record<string, unknown>): SignInOutcome => ({
    twoFactorRequired: body.twoFactorRedirect === true,
  });
  const nothing = (): null => null;

  return {
    signInWithEmail: (input: { email: string; password: string }) => post("/sign-in/email", input, signInOutcome),
    signInWithCode: (input: { orgCode: string; username: string; password: string }) =>
      post("/sign-in/org", input, signInOutcome),
    /** The second step of a two-factor sign-in. trustDevice skips it on this device for 30 days. */
    verifyTwoFactorCode: (input: { code: string; trustDevice: boolean }) =>
      post("/two-factor/verify-totp", input, nothing),
    verifyBackupCode: (input: { code: string; trustDevice: boolean }) =>
      post("/two-factor/verify-backup-code", input, nothing),
    /** Every other session ends, so a stolen temporary password stops working everywhere. */
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      post("/change-password", { ...input, revokeOtherSessions: true }, nothing),
    /** The first half of two-factor setup: the link to scan. confirmTwoFactor's code turns it on. */
    startTwoFactorSetup: (input: { password: string }) =>
      post("/two-factor/enable", input, (body): TwoFactorSetup => ({
        totpUri: typeof body.totpURI === "string" ? body.totpURI : "",
        backupCodes: Array.isArray(body.backupCodes) ? body.backupCodes.filter((code) => typeof code === "string") : [],
      })),
    confirmTwoFactor: (input: { code: string }) => post("/two-factor/verify-totp", input, nothing),
    turnOffTwoFactor: (input: { password: string }) => post("/two-factor/disable", input, nothing),
    /** Answers the same whether or not anyone has the address, so it can't tell who has an account. */
    requestPasswordReset: (input: { email: string; redirectTo: string }) =>
      post("/request-password-reset", input, nothing),
    resetPassword: (input: { token: string; newPassword: string }) => post("/reset-password", input, nothing),
    signOut: () => post("/sign-out", {}, nothing),
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient = createAuthClient();
```

`apps/web/src/data/session.ts`:
```ts
// Leaving a session: the api ends it, and every copy of the organization's data on this device goes with it, the
// query cache in memory and in IndexedDB, in this tab and in every other tab of the app (spec 11).
import type { QueryClient } from "@tanstack/react-query";
import type { AuthClient } from "./auth-client";
import { deletePersistedQueries } from "./persistence";

const CHANNEL = "travel-crm-session";

interface SignOutMessage {
  type: "signed-out";
}

/** Other versions of the app may share the channel, so messages are checked, not trusted. */
function isSignOutMessage(data: unknown): data is SignOutMessage {
  return data !== null && typeof data === "object" && (data as { type?: unknown }).type === "signed-out";
}

/** Empties the cache, then removes its saved copy, so no in-flight query can write it back. */
export async function wipeLocalData(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  await deletePersistedQueries();
}

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

/** Tells the app's other tabs that this device signed out. */
export function announceSignOut(): void {
  const sender = channel();
  sender?.postMessage({ type: "signed-out" } satisfies SignOutMessage);
  sender?.close();
}

/** Calls onSignedOutElsewhere when another tab signs out. Returns the unsubscribe function. */
export function listenForSignOut(onSignedOutElsewhere: () => void): () => void {
  const receiver = channel();
  if (!receiver) return () => undefined;
  receiver.onmessage = (event: MessageEvent<unknown>) => {
    if (isSignOutMessage(event.data)) onSignedOutElsewhere();
  };
  return () => {
    receiver.close();
  };
}

/**
 * Signs out: the api ends the session, then local data is wiped and other tabs are told, whether or not the api
 * answered (offline, the cookie stays until the session expires, but nothing readable is left on the device).
 */
export async function signOut(queryClient: QueryClient, auth: AuthClient): Promise<void> {
  try {
    await auth.signOut();
  } finally {
    await wipeLocalData(queryClient);
    announceSignOut();
  }
}
```

`apps/web/src/data/providers.tsx`:
```tsx
"use client";

// The data layer for every screen: the query cache, saved to IndexedDB, and the tRPC client. A refusal that means
// "sign in again" or "do this first" moves the person there; signing out in another tab wipes this one too.
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { isPublicRoute, pendingStepRoute, signInRoute } from "@/lib/routes";
import { createQueryPersister } from "./persistence";
import { createQueryClient, QUERY_CACHE_MAX_AGE } from "./query-client";
import { listenForSignOut, wipeLocalData } from "./session";
import { createApiClient, TRPCProvider } from "./trpc";

/** Changes with every build, so a cache saved by an older version of the app is thrown away, not misread. */
const cacheVersion = process.env.NEXT_PUBLIC_CACHE_VERSION ?? "development";

/** A full page load: it also drops everything the old page held in memory. */
function goTo(path: string): void {
  window.location.assign(path);
}

export function DataProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      onSignedOut: () => {
        if (isPublicRoute(window.location.pathname)) return;
        void wipeLocalData(client).finally(() => {
          goTo(signInRoute(window.location.pathname));
        });
      },
      onPendingStep: (step) => {
        if (window.location.pathname !== pendingStepRoute(step)) goTo(pendingStepRoute(step));
      },
    });
    return client;
  });
  const [persister] = useState(createQueryPersister);
  const [apiClient] = useState(createApiClient);

  useEffect(
    () =>
      listenForSignOut(() => {
        void wipeLocalData(queryClient).finally(() => {
          goTo(signInRoute());
        });
      }),
    [queryClient],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: QUERY_CACHE_MAX_AGE, buster: cacheVersion }}
      // What was restored shows at once; then every query refreshes in the background, because the saved copy can be
      // older than its timestamps say (it's written at most once a second, so a change just before a reload is lost).
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <TRPCProvider trpcClient={apiClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}
```

`apps/web/src/lib/routes.ts`:
```ts
// Every screen's address, in one place, so links and redirects can't drift apart.
import type { PendingStep } from "@travel-crm/contracts/identity";

export const routes = {
  home: "/",
  signIn: "/sign-in",
  twoFactorChallenge: "/sign-in/two-factor",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  changePassword: "/change-password",
  twoFactorSetup: "/two-factor-setup",
  account: "/account",
  staff: "/staff",
  roles: "/roles",
  settings: "/settings",
} as const;

/** Screens for people who aren't signed in. A refused call never sends anyone away from these. */
const publicRoutes: readonly string[] = [
  routes.signIn,
  routes.twoFactorChallenge,
  routes.forgotPassword,
  routes.resetPassword,
];

export function isPublicRoute(path: string): boolean {
  return publicRoutes.includes(path);
}

/** Where a person goes to take the step the api insists on. */
export function pendingStepRoute(step: PendingStep): string {
  return step === "CHANGE_PASSWORD" ? routes.changePassword : routes.twoFactorSetup;
}

/** The sign-in address that brings the person back to `from` (a path in this app) afterwards. */
export function signInRoute(from?: string): string {
  return from && isAppPath(from) ? `${routes.signIn}?next=${encodeURIComponent(from)}` : routes.signIn;
}

/** A path inside this app ("/staff"), never another site ("//evil.example", "https://..."). */
export function isAppPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
```

`apps/web/src/lib/format.ts`:
```ts
// Money, counts and dates the Indian way (spec 9.6, DESIGN.md section 9), built on the kernel's formatting so the app,
// the PDFs and the emails agree: ₹12,50,000, 1,23,456, "16 Oct" in the organization's time zone.
import { formatDateTime, formatIndianNumber, formatMoney, yearIn, type Money } from "@travel-crm/domain/kernel";

/** "₹12,50,000", "₹1,250.50", "-₹4,500". Paise only when there are some, unless always is asked for (invoices). */
export function formatRupees(amount: Money, { paise = "when-not-zero" }: { paise?: "always" | "when-not-zero" } = {}) {
  const text = formatMoney(amount);
  return paise === "always" ? text : text.replace(/\.00$/, "");
}

/** "1,23,456". */
export function formatCount(value: number): string {
  return formatIndianNumber(value);
}

const dayMonthFormatters = new Map<string, Intl.DateTimeFormat>();

/** "16 Oct" in the current year, "16 Oct 2027" in any other, both as the organization's clocks show the day. */
export function formatDay(instant: Date, { timeZone, now = new Date() }: { timeZone: string; now?: Date }): string {
  if (yearIn(instant, timeZone) !== yearIn(now, timeZone)) {
    return formatDateTime(instant, { timeZone, style: "date" });
  }
  let formatter = dayMonthFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone });
    dayMonthFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

/** "4:30 pm" in the organization's zone. */
export function formatTime(instant: Date, { timeZone }: { timeZone: string }): string {
  return formatDateTime(instant, { timeZone, style: "time" });
}
```

`apps/web/src/lib/error-message.ts`:
```ts
"use client";

// The sentence a person reads when something they did was refused or failed: the domain reason's own message when
// there is one (spec 9.7), otherwise one for the HTTP status, or for not reaching the server at all.
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { refusalOf } from "@/data/api-error";
import type { AuthResult } from "@/data/auth-client";
import errors from "@/i18n/messages/en-IN/errors.json";

type Reason = keyof typeof errors.reasons;
type AuthCode = keyof typeof errors.auth;

const isReason = (value: string | null): value is Reason => value !== null && Object.hasOwn(errors.reasons, value);
const isAuthCode = (value: string): value is AuthCode => Object.hasOwn(errors.auth, value);

type Failure = Extract<AuthResult<unknown>, { ok: false }>;

export function useErrorMessage() {
  const t = useTranslations("errors");

  const forStatus = useCallback(
    (status: number): string => {
      if (status === 0) return t("network");
      if (status === 401) return t("signedOut");
      if (status === 403) return t("forbidden");
      if (status === 404) return t("notFound");
      if (status === 429) return t("tooManyRequests");
      if (status === 400) return t("invalid");
      return t("generic");
    },
    [t],
  );

  /** For a failed tRPC call. */
  const apiError = useCallback(
    (error: unknown): string => {
      const refusal = refusalOf(error);
      if (!refusal) return t("network");
      return isReason(refusal.reason) ? t(`reasons.${refusal.reason}`) : forStatus(refusal.status);
    },
    [t, forStatus],
  );

  /** For a failed sign-in, password or two-factor call. */
  const authError = useCallback(
    (failure: Failure): string => (isAuthCode(failure.code) ? t(`auth.${failure.code}`) : forStatus(failure.status)),
    [t, forStatus],
  );

  return { apiError, authError };
}
```

Replace `apps/web/next.config.ts` with (next-intl's plugin, and a cache version per build):
```ts
// Next.js settings. The output is a standalone Node server for a container (spec 12.3), so nothing here is
// specific to one host.
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./security-headers";

/**
 * Where /api/* goes (spec 3): the browser always calls the api on the address it loaded the app from, so cookies stay
 * first-party and the api needs no CORS. Rewrites are fixed when the app is built, so this is for development and the
 * end-to-end tests; a deployment routes /api/* to the api at its load balancer, before Next.js sees the request.
 */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

/** Changes with every build (or set CACHE_VERSION), so the browser drops a query cache an older build saved. */
const cacheVersion = process.env.CACHE_VERSION ?? String(Date.now());

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would write an AGENTS.md here when an AI agent runs it; the repo's guidance is CLAUDE.md.
  agentRules: false,
  // No image optimization endpoint: the app shows no remote images, and the endpoint is work and attack surface.
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_CACHE_VERSION: cacheVersion },
  // Tailwind's own Turbopack loader compiles every stylesheet (no PostCSS step).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      "*.ts": {
        condition: { path: /^packages\/[^/]+\/src\// },
        loaders: [path.join(import.meta.dirname, "turbopack/workspace-imports-loader.cjs")],
        as: "*.ts",
      },
    },
  },
  headers: () =>
    Promise.resolve([
      { source: "/:path*", headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) },
    ]),
  rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
```

Replace `apps/web/src/app/layout.tsx` with (the translations and the data layer around every page):
```tsx
// The root layout: the document, its language, the brand's fonts and styles, and the toast region.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@travel-crm/brand";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";
import { DataProviders } from "@/data/providers";
import { fontVariables } from "./fonts";
// Indian scripts (DESIGN.md section 3). Each file's faces carry a unicode-range, so a browser downloads one only when
// a page shows that script.
import "@fontsource-variable/noto-sans-devanagari/wght.css";
import "@fontsource-variable/noto-sans-bengali/wght.css";
import "@fontsource-variable/noto-sans-tamil/wght.css";
import "@fontsource-variable/noto-sans-telugu/wght.css";
import "@fontsource-variable/noto-sans-gujarati/wght.css";
import "@fontsource-variable/noto-sans-kannada/wght.css";
import "@fontsource-variable/noto-sans-malayalam/wght.css";
import "@fontsource-variable/noto-sans-gurmukhi/wght.css";
import "@fontsource-variable/noto-serif-devanagari/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
  applicationName: brand.productName,
};

export const viewport: Viewport = {
  themeColor: brand.colours.canvas,
  width: "device-width",
  initialScale: 1,
  // Content may sit under the notch and home bar; the shell pads by env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        <NextIntlClientProvider>
          <DataProviders>{children}</DataProviders>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Run the tests and a build**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`

Expected: 40 tests pass in 13 files; typecheck and lint clean (the typecheck follows `AppRouter` into the api's
packages); the build still prerenders `/` as static (next-intl without routing needs no request data).

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise`

Expected: green. Test counts: api-server 98, api 5, brand 25, contracts 68, db 179, domain 400, eslint-config 65,
integrations 117, web 40 (997).

```bash
cd /Users/ak/personal/travel-crm-05a
git add apps/web apps/api/test/request-checks.test.ts packages/contracts/src/identity/me.ts packages/domain/src/identity/access.ts pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(web): reach the api through tRPC and TanStack Query, saved to IndexedDB and wiped on sign-out"
```

---

### Task G4: The app shell, its navigation by permission, and journeys against the real api

The frame around every signed-in screen (spec 11): `me.get` decides who gets in (sign in again, take a pending step,
or "this app is for organization staff"); the navigation shows what the member's role allows, as a sidebar on desktop
and a bottom bar with "More" on phones, and starts loading a destination's data when its link is pointed at; banners
say when the device is offline or support is impersonating; signing out wipes the device. The Playwright harness
starts a throwaway Postgres, the real api and a fresh build of the app on free ports, so every track can write
journeys. This task also adds every package the tracks use, so they never touch `package.json`.

**Files:**
- Modify: `apps/web/package.json`, `apps/web/eslint.config.js`, `apps/web/src/i18n/messages.ts`,
  `apps/web/src/i18n/messages/en-IN/shell.json`; root `package.json`, `turbo.json`, `.prettierignore`,
  `.dependency-cruiser.cjs`
- Create: `apps/web/src/i18n/messages/en-IN/pwa.json`, `apps/web/src/session/{me-context,session-gate,require-permission}.tsx`,
  `apps/web/src/shell/{navigation,prefetch,use-online}.ts`,
  `apps/web/src/shell/{app-shell,sidebar,bottom-bar,banners,sign-out}.tsx`, `apps/web/src/app/(app)/layout.tsx`,
  `apps/web/src/app/(app)/page.tsx`, `apps/web/playwright.config.ts`
- Delete: `apps/web/src/app/page.tsx` (the home page moves into the shell)
- Test: `apps/web/test/support/members.ts`, `apps/web/test/shell/navigation.test.ts`,
  `apps/web/test/e2e/global-setup.ts`, `apps/web/test/e2e/support/{servers,fixtures,accessibility}.ts`,
  `apps/web/test/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: Task G3's `useTRPC`, `authClient`, `signOut`, `routes`, `pendingStepRoute`; Task G2's components; plan 2's
  `me.get`, `staff.list`, `roles.list`, `settings.get`; for the journeys, `setup`/`teardown`
  (`@travel-crm/db/testing/global-setup`), `createTestOrganization` (`@travel-crm/db/testing`), `createPlatformClient`
  (`@travel-crm/db/platform`), `createIdentity` and its `seedStarterRoles`, `createOrganizationOwner`,
  `resolveAccess`, `staff.create` (`@travel-crm/domain/identity`).
- Produces:
  - `SignedInMember` (me.get's answer with a member and organization), `MeProvider`, `useMe()`,
    `holds(me, permission)`, `useHolds(permission)`, `isSignedInMember(me)` (`@/session/me-context`);
    `SessionGate`, `RequirePermission({ permission, children })`.
  - `NavigationItem` (`key: "home" | "staff" | "roles" | "settings"`, `href`, `icon`, `requires`, `module`),
    `navigationItems`, `visibleNavigationItems(me)`, `isCurrent(item, pathname)`, `BOTTOM_BAR_ITEMS`
    (`@/shell/navigation`); `usePrefetchDestination()`, `prefetchHandlers(prefetch)`; `useSignOut()`,
    `SignOutButton`; `AppShell`, `MAIN_CONTENT_ID`; `useOnline()`.
  - The `(app)` route group: every page in it is inside the session gate and the shell.
  - Journeys: `test`, `expect`, `signInByEmail(page, { email, password })`, and the fixtures `agency`
    (`{ organizationId, code, name, owner: { name, email, password } }`, a new organization per test) and
    `addStaff({ name, username, roleKey, mustChangePassword? })` → `{ name, username, password }`
    (`test/e2e/support/fixtures.ts`); `expectAccessible(page)` (`support/accessibility.ts`); the env
    `E2E_BASE_URL`, `E2E_DATABASE_URL`, `E2E_PLATFORM_DATABASE_URL`; in unit tests, `member({ isOwner?, permissions? })`
    (`test/support/members.ts`).
  - `pnpm e2e` (root) and `pnpm --filter @travel-crm/web e2e`; `pnpm check` runs the journeys.

- [ ] **Step 1: Add every package the shell and the tracks use**

Replace `apps/web/package.json` with (Playwright and axe for the journeys; the db package for the journeys' setup;
react-hook-form, its resolvers and uqr for Track A's and O's forms and Track A's QR code; esbuild for Track P's
service worker):
```json
{
  "name": "@travel-crm/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "dev": "pnpm run generate && next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@fontsource-variable/eb-garamond": "5.3.0",
    "@fontsource-variable/figtree": "5.3.0",
    "@fontsource-variable/noto-sans-bengali": "5.3.0",
    "@fontsource-variable/noto-sans-devanagari": "5.3.0",
    "@fontsource-variable/noto-sans-gujarati": "5.3.0",
    "@fontsource-variable/noto-sans-gurmukhi": "5.3.0",
    "@fontsource-variable/noto-sans-kannada": "5.3.0",
    "@fontsource-variable/noto-sans-malayalam": "5.3.0",
    "@fontsource-variable/noto-sans-tamil": "5.3.0",
    "@fontsource-variable/noto-sans-telugu": "5.3.0",
    "@fontsource-variable/noto-serif-devanagari": "5.3.0",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@hookform/resolvers": "5.9.1",
    "@tanstack/query-async-storage-persister": "5.104.2",
    "@tanstack/react-query": "5.104.2",
    "@tanstack/react-query-persist-client": "5.104.2",
    "@travel-crm/brand": "workspace:*",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@trpc/client": "11.19.0",
    "@trpc/server": "11.19.0",
    "@trpc/tanstack-react-query": "11.19.0",
    "class-variance-authority": "0.7.1",
    "cn": "0.4.0",
    "idb-keyval": "6.3.0",
    "input-otp": "1.5.0",
    "lucide-react": "1.56.0",
    "next": "16.4.0",
    "next-intl": "4.14.9",
    "radix-ui": "1.8.1",
    "react": "catalog:",
    "react-dom": "catalog:",
    "react-hook-form": "7.90.0",
    "shadcn": "4.21.4",
    "sonner": "2.0.8",
    "tw-animate-css": "1.4.0",
    "uqr": "0.1.3",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0",
    "@next/eslint-plugin-next": "16.4.0",
    "@playwright/test": "1.64.0",
    "@tailwindcss/turbopack": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@travel-crm/api": "workspace:*",
    "@travel-crm/db": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "esbuild": "0.28.2",
    "eslint": "catalog:",
    "eslint-plugin-react-hooks": "7.1.1",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.2",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install && pnpm --filter @travel-crm/web exec playwright install chromium`

Expected: install succeeds; Chromium's headless shell is downloaded once per machine.

- [ ] **Step 2: Write the failing navigation tests**

`apps/web/test/support/members.ts`:
```ts
// me.get answers for tests: an Owner, and a member of a role with the given permissions.
import type { SignedInMember } from "@/session/me-context";

export function member({
  isOwner = false,
  permissions = [],
}: { isOwner?: boolean; permissions?: string[] } = {}): SignedInMember {
  return {
    user: {
      id: "0199a000-0000-7000-8000-000000000001",
      name: "Asha",
      email: null,
      username: "asha",
      twoFactorEnabled: false,
    },
    impersonatedBy: null,
    isPlatformAdmin: false,
    organization: {
      id: "0199a000-0000-7000-8000-000000000002",
      name: "Sharma Travels",
      code: "SHARMA",
      requireTwoFactor: false,
      timeZone: "Asia/Kolkata",
    },
    member: {
      memberId: "0199a000-0000-7000-8000-000000000003",
      role: isOwner
        ? { key: "org-owner", name: "Owner", isOwner: true }
        : { key: "sales", name: "Sales", isOwner: false },
      permissions: permissions.map((permission) => ({ permission, scope: null })),
    },
    pendingStep: null,
  };
}
```

`apps/web/test/shell/navigation.test.ts`:
```ts
// The navigation follows the member's permissions: an Owner sees every destination, a salesperson only Home.
import { describe, expect, it } from "vitest";
import { holds } from "@/session/me-context";
import { isCurrent, navigationItems, visibleNavigationItems } from "@/shell/navigation";
import { member } from "../support/members";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("visibleNavigationItems", () => {
  it("shows an Owner everything", () => {
    expect(keys(visibleNavigationItems(member({ isOwner: true })))).toEqual(["home", "staff", "roles", "settings"]);
  });

  it("shows each item only to roles holding its permission", () => {
    expect(keys(visibleNavigationItems(member({ permissions: ["leads:view"] })))).toEqual(["home"]);
    expect(keys(visibleNavigationItems(member({ permissions: ["staff:manage", "settings:manage"] })))).toEqual([
      "home",
      "staff",
      "settings",
    ]);
  });

  it("names a module (none yet) and a permission the catalog knows for each item", () => {
    for (const item of navigationItems) {
      expect(item.module).toBeNull();
      if (item.requires !== null) expect(item.requires).toMatch(/^[a-z_]+:[a-z_]+$/);
    }
  });
});

describe("holds", () => {
  it("is true for an Owner whatever the list says", () => {
    expect(holds(member({ isOwner: true }), "roles:manage")).toBe(true);
    expect(holds(member({ permissions: ["staff:manage"] }), "roles:manage")).toBe(false);
  });
});

describe("isCurrent", () => {
  const [home, staff] = navigationItems;

  it("marks Home only on the home page, and other items on their pages and below", () => {
    if (!home || !staff) throw new Error("navigation items missing");
    expect(isCurrent(home, "/")).toBe(true);
    expect(isCurrent(home, "/staff")).toBe(false);
    expect(isCurrent(staff, "/staff")).toBe(true);
    expect(isCurrent(staff, "/staff/new")).toBe(true);
    expect(isCurrent(staff, "/staffing")).toBe(false);
  });
});
```

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/shell`

Expected: FAIL: `@/session/me-context` and `@/shell/navigation` don't exist.

- [ ] **Step 3: Write the session gate and the shell**

Replace `apps/web/src/i18n/messages/en-IN/shell.json` with:
```json
{
  "navigation": {
    "label": "Main",
    "home": "Home",
    "staff": "Staff",
    "roles": "Roles",
    "settings": "Settings",
    "more": "More",
    "account": "Your account",
    "signOut": "Sign out",
    "signingOut": "Signing out"
  },
  "home": {
    "title": "Welcome, {name}",
    "intro": "{organization} runs here. Set it up:",
    "staff": "Add your staff and give each a role",
    "roles": "Decide what each role may see and do",
    "settings": "Choose how your staff sign in",
    "nothingToSetUp": "Your organization's admins set things up. Your work will appear here as modules arrive."
  },
  "session": {
    "loading": "Opening your organization",
    "loadFailed": "Your organization didn't load.",
    "notStaff": "This app is for the staff of an organization. Platform staff use the platform console.",
    "noAccess": "Your role doesn't include this screen. Ask an Owner or Admin if you need it."
  },
  "banners": {
    "offline": "You're offline. You see what was last loaded, and changes wait until you're back online.",
    "impersonated": "Support is signed in as you. Everything they do is recorded in the audit log."
  }
}
```

Create `apps/web/src/i18n/messages/en-IN/pwa.json` holding only `{}` and a newline (Track P fills it), and replace
`apps/web/src/i18n/messages.ts` with:
```ts
// Every message the app shows, by namespace (spec 9.6: next-intl from day one, English only in Phase 1). Each feature
// owns one namespace file, so features can be written side by side without touching each other's words.
import account from "./messages/en-IN/account.json";
import common from "./messages/en-IN/common.json";
import errors from "./messages/en-IN/errors.json";
import pwa from "./messages/en-IN/pwa.json";
import roles from "./messages/en-IN/roles.json";
import settings from "./messages/en-IN/settings.json";
import shell from "./messages/en-IN/shell.json";
import staff from "./messages/en-IN/staff.json";

export const locale = "en-IN";

export const messages = { account, common, errors, pwa, roles, settings, shell, staff };

export type Messages = typeof messages;
```

`apps/web/src/session/me-context.tsx`:
```tsx
"use client";

// Who is signed in, for every screen inside the app shell: their organization, role and permissions (me.get). The
// session gate provides it once me.get has answered, so screens never see a missing member.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { createContext, useContext, type ReactNode } from "react";

/** me.get's answer for a member: a member and organization are certain here. */
export type SignedInMember = MeOutput & {
  member: NonNullable<MeOutput["member"]>;
  organization: NonNullable<MeOutput["organization"]>;
};

const MeContext = createContext<SignedInMember | null>(null);

export function MeProvider({ me, children }: { me: SignedInMember; children: ReactNode }) {
  return <MeContext value={me}>{children}</MeContext>;
}

export function useMe(): SignedInMember {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() is for screens inside the app shell's session gate");
  return me;
}

/**
 * Whether the member's role holds a permission, e.g. "staff:manage". For showing or hiding things only: the api
 * checks every call itself (spec 6.5).
 */
export function holds(me: SignedInMember, permission: string): boolean {
  return me.member.role.isOwner || me.member.permissions.some((grant) => grant.permission === permission);
}

export function useHolds(permission: string): boolean {
  return holds(useMe(), permission);
}

/** Narrows me.get's answer to a member of an organization. */
export function isSignedInMember(me: MeOutput): me is SignedInMember {
  return me.member !== null && me.organization !== null;
}
```

`apps/web/src/session/session-gate.tsx`:
```tsx
"use client";

// The way into the app shell. me.get says who is signed in; until it answers the screen shows a skeleton, from the
// saved cache at once when there is one. Signed out, the data layer sends the person to sign in; with a password
// change or two-factor setup pending, they go to take it; platform staff, who belong to no organization, are told
// this app isn't theirs.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { pendingStepRoute } from "@/lib/routes";
import { SignOutButton } from "@/shell/sign-out";
import { isSignedInMember, MeProvider } from "./me-context";

export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations("shell.session");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const me = useQuery(trpc.me.get.queryOptions());
  const pendingStep = me.data?.pendingStep ?? null;

  useEffect(() => {
    if (pendingStep) window.location.replace(pendingStepRoute(pendingStep));
  }, [pendingStep]);

  if (me.data === undefined) {
    if (me.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void me.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex min-h-dvh">
          <Skeleton className="hidden w-58 md:block" />
          <div className="flex flex-1 flex-col gap-4 p-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-40 w-full max-w-[720px]" />
          </div>
        </div>
      </Delayed>
    );
  }
  if (pendingStep) return null;
  if (!isSignedInMember(me.data)) {
    return (
      <div className="mx-auto flex max-w-[40ch] flex-col items-center gap-4 px-4 py-16 text-center">
        <p>{t("notStaff")}</p>
        <SignOutButton />
      </div>
    );
  }
  return <MeProvider me={me.data}>{children}</MeProvider>;
}
```

`apps/web/src/session/require-permission.tsx`:
```tsx
"use client";

// Shows a screen only to members whose role holds its permission; others read why it isn't there. A convenience:
// the api refuses the screen's calls anyway (spec 6.5).
import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { useHolds } from "./me-context";

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const t = useTranslations("shell.session");
  return useHolds(permission) ? children : <EmptyState icon={LockIcon} message={t("noAccess")} />;
}
```

`apps/web/src/shell/navigation.ts`:
```ts
// The app's destinations and who sees them (spec 11: navigation follows the caller's permissions). Hiding is for
// convenience only; the api refuses whatever a role doesn't allow. When plans and entitlements arrive (plan 4), an
// item's `module` is what the organization's plan must include for it to show.
import { HouseIcon, SettingsIcon, ShieldCheckIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { holds, type SignedInMember } from "@/session/me-context";
import { routes } from "@/lib/routes";

export interface NavigationItem {
  /** Also the message key in the "shell.navigation" namespace. */
  key: "home" | "staff" | "roles" | "settings";
  href: string;
  icon: LucideIcon;
  /** The permission the item needs, if any. */
  requires: string | null;
  /** The module of the plan (spec 7.2) the item belongs to; null for the Foundation's own screens. */
  module: string | null;
}

export const navigationItems: readonly NavigationItem[] = [
  { key: "home", href: routes.home, icon: HouseIcon, requires: null, module: null },
  { key: "staff", href: routes.staff, icon: UsersIcon, requires: "staff:manage", module: null },
  { key: "roles", href: routes.roles, icon: ShieldCheckIcon, requires: "roles:manage", module: null },
  { key: "settings", href: routes.settings, icon: SettingsIcon, requires: "settings:manage", module: null },
];

/** The items this member may use, in order. */
export function visibleNavigationItems(me: SignedInMember): NavigationItem[] {
  return navigationItems.filter((item) => item.requires === null || holds(me, item.requires));
}

/** How many items fit in the phone's bottom bar before the rest move to "More" (DESIGN.md: 4-5 destinations). */
export const BOTTOM_BAR_ITEMS = 4;

/** Whether the item is the current page: the home item only on "/", the others on their path and below it. */
export function isCurrent(item: NavigationItem, pathname: string): boolean {
  return item.href === routes.home
    ? pathname === routes.home
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

`apps/web/src/shell/prefetch.ts` (TanStack Query 5.104 deprecates `prefetchQuery` in favour of `query()`):
```ts
"use client";

// Loading a destination's data before it opens (spec 11: prefetch of likely next screens). When a navigation link
// is pointed at, focused or touched, the screen's first query starts, so it usually opens with its data. The screens
// ask for the same queries, so they find them in the cache.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";
import type { NavigationItem } from "./navigation";

export function usePrefetchDestination(): (key: NavigationItem["key"]) => void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    (key) => {
      // A failed prefetch is ignored: the screen asks again when it opens, and shows the failure then.
      const ignore = () => undefined;
      if (key === "staff") queryClient.query(trpc.staff.list.queryOptions()).catch(ignore);
      else if (key === "roles") queryClient.query(trpc.roles.list.queryOptions()).catch(ignore);
      else if (key === "settings") queryClient.query(trpc.settings.get.queryOptions()).catch(ignore);
    },
    [trpc, queryClient],
  );
}

/** The link props that start a prefetch. */
export function prefetchHandlers(prefetch: () => void) {
  return { onPointerEnter: prefetch, onFocus: prefetch, onTouchStart: prefetch };
}
```

`apps/web/src/shell/use-online.ts`:
```ts
"use client";

// Whether the browser thinks it has a connection, for the offline banner (DESIGN.md: a persistent banner offline).
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // While the page renders on the server there is no browser to ask: assume online.
    () => true,
  );
}
```

`apps/web/src/shell/banners.tsx`:
```tsx
"use client";

// Banners above every screen: offline (DESIGN.md: persistent while it lasts), and support impersonating the member
// (spec 6.1: impersonation always shows a banner).
import { HeadsetIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMe } from "@/session/me-context";
import { useOnline } from "./use-online";

export function Banners() {
  const t = useTranslations("shell.banners");
  const online = useOnline();
  const me = useMe();
  return (
    <>
      {me.impersonatedBy !== null && (
        <p className="flex items-center gap-2 bg-status-attention-fill px-4 py-2 text-label text-status-attention-ink">
          <HeadsetIcon aria-hidden="true" className="size-4 shrink-0" />
          {t("impersonated")}
        </p>
      )}
      {!online && (
        <p role="status" className="flex items-center gap-2 bg-surface px-4 py-2 text-label text-foreground">
          <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
          {t("offline")}
        </p>
      )}
    </>
  );
}
```

`apps/web/src/shell/sign-out.tsx`:
```tsx
"use client";

// Signing out: the api ends the session, the device forgets the organization's data, and the sign-in screen opens.
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/data/auth-client";
import { signOut } from "@/data/session";
import { routes } from "@/lib/routes";

export function useSignOut() {
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const run = async () => {
    setSigningOut(true);
    try {
      await signOut(queryClient, authClient);
    } finally {
      window.location.assign(routes.signIn);
    }
  };
  return { signingOut, signOut: run };
}

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("shell.navigation");
  const { signingOut, signOut: run } = useSignOut();
  return (
    <Button variant="ghost" className={className} disabled={signingOut} onClick={() => void run()}>
      <LogOutIcon aria-hidden="true" />
      {signingOut ? t("signingOut") : t("signOut")}
    </Button>
  );
}
```

`apps/web/src/shell/sidebar.tsx`:
```tsx
"use client";

// The desktop navigation (DESIGN.md section 6): a 232px column on the surface tone, the organization's name, the
// destinations, and the person's account and sign-out at the bottom. The current page has the blue tint.
import { UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { isCurrent, visibleNavigationItems } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { SignOutButton } from "./sign-out";

export function Sidebar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const pathname = usePathname();
  const prefetch = usePrefetchDestination();
  return (
    <aside className="hidden w-58 shrink-0 flex-col gap-6 border-r bg-surface px-3 py-5 md:flex">
      <p className="px-3 text-section font-semibold">{me.organization.name}</p>
      <nav aria-label={t("label")} className="flex flex-1 flex-col gap-1">
        {visibleNavigationItems(me).map((item) => {
          const current = isCurrent(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              {...prefetchHandlers(() => {
                prefetch(item.key);
              })}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 font-medium text-foreground hover:bg-accent",
                current && "bg-accent text-accent-foreground",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t pt-4">
        <Link
          href={routes.account}
          aria-current={pathname === routes.account ? "page" : undefined}
          className="flex h-11 items-center gap-3 rounded-lg px-3 hover:bg-accent"
        >
          <UserIcon aria-hidden="true" className="size-5" />
          <span className="min-w-0">
            <span className="block font-medium break-words">{me.user.name}</span>
            <span className="block text-caption text-muted-foreground">{t("account")}</span>
          </span>
        </Link>
        <SignOutButton className="justify-start px-3" />
      </div>
    </aside>
  );
}
```

`apps/web/src/shell/bottom-bar.tsx`:
```tsx
"use client";

// The phone navigation (DESIGN.md section 6): a 56px bar at the bottom with up to four destinations and "More",
// labels always shown, above the home indicator. "More" opens a sheet with the rest, the account and sign-out.
import { EllipsisIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { BOTTOM_BAR_ITEMS, isCurrent, visibleNavigationItems } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { SignOutButton } from "./sign-out";

const tabClasses = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium";

export function BottomBar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const prefetch = usePrefetchDestination();
  const items = visibleNavigationItems(me);
  const inBar = items.slice(0, BOTTOM_BAR_ITEMS);
  const inMore = items.slice(BOTTOM_BAR_ITEMS);
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {inBar.map((item) => {
        const current = isCurrent(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            {...prefetchHandlers(() => {
              prefetch(item.key);
            })}
            className={cn(tabClasses, current ? "text-primary" : "text-muted-foreground")}
          >
            <item.icon aria-hidden="true" className="size-5" />
            {t(item.key)}
          </Link>
        );
      })}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={cn(tabClasses, "text-muted-foreground")}>
          <EllipsisIcon aria-hidden="true" className="size-5" />
          {t("more")}
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{me.organization.name}</SheetTitle>
            <SheetDescription>{me.user.name}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {[
              ...inMore.map((item) => ({ key: item.key, href: item.href, icon: item.icon })),
              { key: "account" as const, href: routes.account, icon: UserIcon },
            ].map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                onClick={() => {
                  setMoreOpen(false);
                }}
                className="flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-accent"
              >
                <entry.icon aria-hidden="true" className="size-5" />
                {t(entry.key)}
              </Link>
            ))}
            <SignOutButton className="justify-start px-3" />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
```

`apps/web/src/shell/app-shell.tsx`:
```tsx
"use client";

// The frame around every signed-in screen: a skip link, the sidebar on desktop, the banners, the page, and the
// bottom bar on phones (DESIGN.md sections 4 and 6). The page gutter is 16px on phones, 24px on tablets, 32px wide.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Banners } from "./banners";
import { BottomBar } from "./bottom-bar";
import { Sidebar } from "./sidebar";

export const MAIN_CONTENT_ID = "main-content";

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Banners />
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8"
        >
          {children}
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
```

`apps/web/src/app/(app)/layout.tsx`:
```tsx
// Every signed-in screen: the session gate, then the shell around the page.
import type { ReactNode } from "react";
import { SessionGate } from "@/session/session-gate";
import { AppShell } from "@/shell/app-shell";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
```

`apps/web/src/app/(app)/page.tsx`:
```tsx
"use client";

// The home screen. Business modules (leads, quotes, bookings) arrive in later steps; until then it points those who
// can set the organization up at what to do first.
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { useMe } from "@/session/me-context";
import { visibleNavigationItems, type NavigationItem } from "@/shell/navigation";

type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home"> };

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const setUp = visibleNavigationItems(me).filter((item): item is SetUpItem => item.key !== "home");
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title", { name: me.user.name })}</PageTitle>
      {setUp.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-muted-foreground">{t("intro", { organization: me.organization.name })}</p>
          <ul className="divide-y rounded-lg border">
            {setUp.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent">
                  <item.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{t(item.key)}</span>
                  <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted-foreground">{t("nothingToSetUp")}</p>
      )}
    </div>
  );
}
```

Delete `apps/web/src/app/page.tsx`: `/` is now the shell's home page.

- [ ] **Step 4: Run the unit tests**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run && pnpm typecheck && pnpm lint`

Expected: 45 tests pass in 14 files; typecheck and lint clean.

- [ ] **Step 5: Write the journeys' harness and the shell's journeys**

`apps/web/playwright.config.ts`:
```ts
// The journeys (spec 12.1, gate 6), in Chromium on a phone and on a desktop, against the real api and Postgres that
// test/e2e/global-setup.ts starts. Run them with `pnpm --filter @travel-crm/web e2e`; Docker must be running.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./test/e2e/global-setup.ts",
  // Building the app and starting Postgres takes a while; each journey itself is quick.
  globalTimeout: 10 * 60_000,
  timeout: 30_000,
  workers: 2,
  forbidOnly: true,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

`apps/web/test/e2e/support/servers.ts` (the api runs from source with tsx; the app is built with `API_ORIGIN` pointing
at that api, because rewrites are fixed at build time, and runs as the standalone server a container would run; plan
3's services get harmless settings, so the api still starts once plan 3's Task I2 makes them required):
```ts
// Starts the real api and the built web app for the journeys, on free ports, the way a deployment runs them: the
// api from its source with tsx, the web app as Next.js's standalone server. The web app is built here, because its
// /api rewrite is fixed at build time and must point at this api.
import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const webDirectory = path.resolve(import.meta.dirname, "../../..");
const apiDirectory = path.resolve(webDirectory, "../api");

/** A port nothing listens on now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

/** Runs a command to the end, failing with its output if it fails. */
function run(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${String(code)}:\n${output}`));
    });
  });
}

/** Starts a long-running process. Its output is shown only if it stops before stop() is called. */
function start(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let stopping = false;
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.once("exit", (code) => {
    if (!stopping) console.error(`${command} stopped early with ${String(code)}:\n${output}`);
  });
  return {
    stop: () => {
      stopping = true;
      child.kill();
    },
  };
}

/** Waits until url answers 200, for up to a minute. */
async function waitUntilUp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} didn't come up within a minute`);
}

export interface Servers {
  webUrl: string;
  stop(): void;
}

export async function startServers({ databaseUrl }: { databaseUrl: string }): Promise<Servers> {
  const [apiPort, webPort] = [await freePort(), await freePort()];
  const webUrl = `http://127.0.0.1:${String(webPort)}`;

  const api = start(path.join(apiDirectory, "node_modules/.bin/tsx"), ["src/server.ts"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: "e2e-only-secret-".padEnd(48, "x"),
      // Browsers reach the api through the web app's address (spec 3), so that is its URL and the trusted origin.
      BETTER_AUTH_URL: webUrl,
      APP_URL: webUrl,
      TRUSTED_ORIGINS: "",
      // Journeys sign in many times from one address.
      AUTH_RATE_LIMIT: "false",
      // Plan 3's services are configured from the environment; the journeys send no email and store no files.
      S3_BUCKET: "e2e",
      S3_ACCESS_KEY_ID: "e2e",
      S3_SECRET_ACCESS_KEY: "e2e-secret",
      S3_ENDPOINT: "http://127.0.0.1:9",
      S3_FORCE_PATH_STYLE: "true",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "9",
      EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
      VAPID_PUBLIC_KEY: "BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY",
      VAPID_PRIVATE_KEY: "UrS7-d1PFp4TPIVRSD5qGMXmRPN_NbpYvsJxhc6j3nU",
      VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
    },
  });

  await run(path.join(webDirectory, "node_modules/.bin/next"), ["build"], {
    cwd: webDirectory,
    env: { ...process.env, API_ORIGIN: `http://127.0.0.1:${String(apiPort)}` },
  });
  // The standalone server serves .next/static and public only when they sit beside it, as a Docker image puts them.
  const standalone = path.join(webDirectory, ".next/standalone/apps/web");
  await cp(path.join(webDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
  await cp(path.join(webDirectory, "public"), path.join(standalone, "public"), { recursive: true });
  const web = start(process.execPath, ["server.js"], {
    cwd: standalone,
    env: { ...process.env, NODE_ENV: "production", PORT: String(webPort), HOSTNAME: "127.0.0.1" },
  });

  await waitUntilUp(`http://127.0.0.1:${String(apiPort)}/health`);
  await waitUntilUp(webUrl);
  return {
    webUrl,
    stop: () => {
      api.stop();
      web.stop();
    },
  };
}
```

`apps/web/test/e2e/global-setup.ts` (the same Postgres setup as the api's tests; it hands its URLs to Vitest's
`provide`, so a small recorder stands in for Vitest's project):
```ts
// Before the journeys: a throwaway Postgres with every migration (the same setup the api's tests use), then the api
// and the built web app. The journeys read where everything is from environment variables; each test makes its own
// organization, so tests never share data.
import type { TestProject } from "vitest/node";
import { setup as startDatabase, teardown as stopDatabase, type DbUrls } from "@travel-crm/db/testing/global-setup";
import { startServers } from "./support/servers";

export default async function globalSetup(): Promise<() => Promise<void>> {
  let urls: DbUrls | undefined;
  // The database setup hands its URLs to Vitest's provide(); here they are simply kept.
  const recorder = {
    provide: (key: string, value: DbUrls) => {
      if (key === "dbUrls") urls = value;
    },
  };
  await startDatabase(recorder as unknown as TestProject);
  if (!urls) throw new Error("the database setup gave no URLs");
  const servers = await startServers({ databaseUrl: urls.runtime });
  process.env.E2E_BASE_URL = servers.webUrl;
  process.env.E2E_DATABASE_URL = urls.runtime;
  process.env.E2E_PLATFORM_DATABASE_URL = urls.platform;
  return async () => {
    servers.stop();
    await stopDatabase();
  };
}
```

`apps/web/test/e2e/support/fixtures.ts`:
```ts
// What every journey starts from: the web app's address, and a new organization of its own with an Owner who signs
// in by email, made directly in the database the way onboarding (plan 4) will. Staff are added the same way.
import { test as base, expect, type Page } from "@playwright/test";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createIdentity, type Identity, type MemberAccess } from "@travel-crm/domain/identity";

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the journeys with \`pnpm --filter @travel-crm/web e2e\``);
  return value;
}

export interface Agency {
  organizationId: string;
  code: string;
  name: string;
  owner: { name: string; email: string; password: string };
}

export interface Staff {
  name: string;
  username: string;
  password: string;
}

interface Database {
  identity: Identity;
  platform: PlatformClient;
}

interface Fixtures {
  agency: Agency;
  /** Adds staff without email to the agency. With mustChangePassword they must replace the password at sign-in. */
  addStaff: (options: {
    name: string;
    username: string;
    roleKey: string;
    mustChangePassword?: boolean;
  }) => Promise<Staff>;
}

export const test = base.extend<Fixtures, { database: Database }>({
  baseURL: async ({}, use) => {
    await use(environment("E2E_BASE_URL"));
  },
  database: [
    async ({}, use) => {
      const identity = createIdentity({
        databaseUrl: environment("E2E_DATABASE_URL"),
        maxConnections: 2,
        auth: {
          appName: "E2E",
          secret: "e2e-only-secret-".padEnd(48, "x"),
          baseUrl: environment("E2E_BASE_URL"),
          trustedOrigins: [],
          secureCookies: false,
          rateLimit: false,
          ipAddressHeaders: ["x-forwarded-for"],
          trustedProxies: [],
        },
      });
      const platform = createPlatformClient(environment("E2E_PLATFORM_DATABASE_URL"));
      await use({ identity, platform });
      await identity.disconnect();
      await platform.$disconnect();
    },
    { scope: "worker" },
  ],
  agency: async ({ database }, use) => {
    const organizationId = await createTestOrganization(database.platform, "Sharma Travels");
    const { code } = await database.platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
    await database.identity.seedStarterRoles(organizationId);
    const owner = {
      name: "Asha Sharma",
      email: `owner-${code.toLowerCase()}@example.test`,
      password: "owner-password-1",
    };
    await database.identity.createOrganizationOwner(organizationId, { ...owner, mustChangePassword: false });
    await use({ organizationId, code, name: "Sharma Travels", owner });
  },
  addStaff: async ({ database, agency }, use) => {
    const ownerAccess = async (): Promise<MemberAccess> => {
      const user = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
      const access = await database.identity.resolveAccess(user.id, agency.organizationId);
      if (!access) throw new Error("the agency's owner has no access");
      return access;
    };
    await use(async ({ name, username, roleKey, mustChangePassword = false }) => {
      const password = `${username}-password-1`;
      const created = await database.identity.staff.create(await ownerAccess(), {
        name,
        username,
        roleKey,
        temporaryPassword: password,
      });
      if (!mustChangePassword) {
        await database.platform.user.update({ where: { id: created.userId }, data: { mustChangePassword: false } });
      }
      return { name, username, password };
    });
  },
});

export { expect };

/** Signs in through the api, as the sign-in screen does, so a journey can start inside the app. */
export async function signInByEmail(page: Page, { email, password }: { email: string; password: string }) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    // The api accepts sign-ins only from the web app's own origin, which a browser would send.
    headers: { origin: environment("E2E_BASE_URL") },
  });
  expect(response.ok()).toBe(true);
}
```

`apps/web/test/e2e/support/accessibility.ts`:
```ts
// An accessibility check for a journey's screen (spec 12.1; DESIGN.md section 8 targets WCAG 2.2 AA), with axe.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(" ")) })),
  ).toEqual([]);
}
```

`apps/web/test/e2e/shell.spec.ts`:
```ts
// The app shell: a signed-in member lands in their organization with the navigation their role allows, every page
// carries the security headers, and signing out leaves no organization data on the device.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";

test("an Owner sees their organization and every destination", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  for (const destination of testInfo.project.name === "phone"
    ? ["Home", "Staff", "Roles", "Settings", "More"]
    : ["Home", "Staff", "Roles", "Settings"]) {
    await expect(
      navigation.getByRole(testInfo.project.name === "phone" && destination === "More" ? "button" : "link", {
        name: destination,
      }),
    ).toBeVisible();
  }
  await expectAccessible(page);
});

test("a salesperson sees only what their role allows", async ({ page, addStaff, agency }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  const response = await page.request.post("/api/auth/sign-in/org", {
    data: { orgCode: agency.code, username: ravi.username, password: ravi.password },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(navigation.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(page.getByText("Your organization's admins set things up.")).toBeVisible();
});

test("pointing at a destination loads its data before it opens", async ({ page, agency }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "phones have no pointer; touching the link does the same");
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  const staffList = page.waitForRequest((request) => request.url().includes("/api/trpc/staff.list"));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Staff" }).hover();
  await staffList;
});

test("pages carry the security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});

test("signing out wipes the saved data and ends the session", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The query cache saves itself to IndexedDB within a second of changing.
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await page.evaluate(savedQueries)).toBe(0);
  const me = await page.request.get("/api/trpc/me.get");
  expect(me.status()).toBe(401);
});

/** How many saved query-cache entries IndexedDB holds (runs in the page). */
function savedQueries(): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("travel-crm");
    opening.onerror = () => {
      reject(opening.error ?? new Error("IndexedDB failed"));
    };
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains("query-cache")) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction("query-cache").objectStore("query-cache").count();
      counting.onsuccess = () => {
        database.close();
        resolve(counting.result);
      };
    };
  });
}
```

Replace `apps/web/eslint.config.js` with (Playwright's fixtures look like React hooks to the hooks rule; Playwright
writes its results while lint may be running):
```js
// ESLint for @travel-crm/web: the shared strict config, plus Next.js's and React's hook rules.
import nextPlugin from "@next/eslint-plugin-next";
import { base } from "@travel-crm/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  base({
    tsconfigRootDir: import.meta.dirname,
    // Build output, served files, and Playwright's results (written while lint may be running).
    ignores: [".next/**", "next-env.d.ts", "public/**", "test-results/**", "playwright-report/**"],
  }),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
  // Playwright fixtures take an empty pattern and call `use`, which isn't React's hook.
  {
    files: ["test/e2e/**"],
    rules: { "no-empty-pattern": "off", "react-hooks/rules-of-hooks": "off" },
  },
  // The Turbopack loader and dependency-cruiser's alias file are CommonJS, which the tools that load them need.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
```

- [ ] **Step 6: Run the journeys**

Run: `cd /Users/ak/personal/travel-crm-05a/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm e2e`

Expected: 11 passed and 1 skipped (the prefetch journey on the phone project, which has no pointer), in about 20
seconds including Postgres and the build. The api's and the app's ports are free ports, so another worktree can run
its journeys at the same time.

- [ ] **Step 7: Run the journeys from Turborepo and `pnpm check`, and keep generated output out of the root checks**

In `package.json` (root):

replace:
```json
    "check": "pnpm run format:check && turbo run typecheck lint test && pnpm run depcruise",
```
with:
```json
    "check": "pnpm run format:check && turbo run typecheck lint test e2e && pnpm run depcruise",
```

replace:
```json
    "db:migrate": "pnpm --filter @travel-crm/db db:migrate:deploy"
```
with:
```json
    "db:migrate": "pnpm --filter @travel-crm/db db:migrate:deploy",
    "e2e": "turbo run e2e"
```

In `turbo.json`:

replace:
```json
    "dev": { "cache": false, "persistent": true }
```
with:
```json
    "dev": { "cache": false, "persistent": true },
    "e2e": {
      "dependsOn": ["generate", "^generate"],
      "cache": false,
      "passThroughEnv": ["DOCKER_HOST", "TESTCONTAINERS_*"]
    }
```

In `.prettierignore`, after the line `.turbo/`, add:
```
# The web app's generated and test output (apps/web/.gitignore; Prettier reads only the root's ignore files).
apps/web/public/sw.js
apps/web/test-results/
apps/web/playwright-report/
```

In `.dependency-cruiser.cjs`:

replace:
```js
    exclude: { path: "(^|/)\\.next/|next-env\\.d\\.ts$" },
```
with:
```js
    // The web app's public/ holds files served as they are (icons, the bundled service worker), never imported.
    exclude: { path: "(^|/)\\.next/|next-env\\.d\\.ts$|^apps/web/public/" },
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test e2e --concurrency=3 && pnpm run depcruise`

Expected: green, 29 Turborepo tasks. Test counts: api-server 98, api 5, brand 25, contracts 68, db 179, domain 400,
eslint-config 65, integrations 117, web 45 (1,002); journeys 11 passed, 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a
git add apps/web package.json turbo.json .prettierignore .dependency-cruiser.cjs pnpm-lock.yaml
git commit -m "feat(web): the app shell, its navigation by permission, and journeys against the real api"
```

When this commit is made, the three tracks can start, each from this commit in its own worktree.

---

## The tracks

Each track starts from Task G4's commit in its own worktree, and the three run at the same time. A track touches only
the files the Tracks table gives it.

## Track A: Account screens

Signing in both ways, the two-factor code step, the steps the api can insist on (a new password, two-factor setup),
the person's own account page, and password reset by email. Built in its own worktree from the groundwork's last
commit; it edits only the files listed in the Tracks table.

Before Task A1, make the worktree:

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05a-account -b foundation/05a-account foundation/05a-web
cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

Each task's gate (all green before its commit), from the worktree:

```bash
cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint && pnpm --filter @travel-crm/web test && pnpm --filter @travel-crm/web e2e && pnpm run depcruise
```

---

### Task A1: Sign in by email or organization code, then the two-factor code

**Files:**
- Create: `apps/web/src/account/form-errors.ts`
- Create: `apps/web/src/account/text-field.tsx`
- Create: `apps/web/src/account/form-alert.tsx`
- Create: `apps/web/src/account/remembered-code.ts`
- Create: `apps/web/src/account/next-path.ts`
- Create: `apps/web/src/account/finish-sign-in.ts`
- Create: `apps/web/src/account/email-sign-in-form.tsx`
- Create: `apps/web/src/account/code-sign-in-form.tsx`
- Create: `apps/web/src/account/sign-in-screen.tsx`
- Create: `apps/web/src/account/two-factor-challenge.tsx`
- Create: `apps/web/src/app/(account)/layout.tsx`
- Create: `apps/web/src/app/(account)/sign-in/page.tsx`
- Create: `apps/web/src/app/(account)/sign-in/two-factor/page.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/account.json` (the groundwork left it `{}`)
- Test: `apps/web/test/account/render.tsx`
- Test: `apps/web/test/account/next-path.test.ts`
- Test: `apps/web/test/account/sign-in-forms.test.tsx`
- Test: `apps/web/test/account/sign-in-screen.test.tsx`
- Test: `apps/web/test/account/two-factor-challenge.test.tsx`
- Test: `apps/web/test/e2e/support/totp.ts`
- Test: `apps/web/test/e2e/account-sign-in.spec.ts`

**Interfaces:**
- Consumes (groundwork): `authClient`, `AuthClient`, `AuthResult`, `SignInOutcome` (`@/data/auth-client`);
  `wipeLocalData(queryClient)` (`@/data/session`); `useErrorMessage().authError(failure)` (`@/lib/error-message`);
  `routes`, `isAppPath` (`@/lib/routes`); `PageTitle`; shadcn `Tabs`, `Field*`, `Input`, `InputOTP*`, `Checkbox`,
  `Alert`, `Button`, `Spinner`; the journeys' `test`, `expect`, `signInByEmail`, `addStaff`, `expectAccessible`;
  the contracts' `emailAddress`, `passwordAttempt`, `orgSignInInput`.
- Produces (Tasks A2 and A3 use them): `useFieldErrorMessages(): z.core.$ZodErrorMap`;
  `TextField<Values>({ control, name, label, hint?, type?, autoComplete?, inputMode?, autoCapitalize?, spellCheck?,
  className? })`; `AuthFailureAlert({ failure: AuthFailure | null })` and `type AuthFailure`;
  `rememberedOrganizationCode()`, `useRememberedOrganizationCode()`, `rememberOrganizationCode(code)`;
  `nextPath(searchParams): string`; `useFinishSignIn(): (next: string) => Promise<void>`; the `(account)` layout;
  test support `renderScreen(element)`, `answers(result)`, `ok(data)`, `refused(status, code, retryAfterSeconds?)`;
  journey support `totpCode(base32Secret, now?)`, `secretOf(totpUri)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/account/render.tsx`:
```tsx
// Renders an account screen as the app does: with its messages and a query cache of its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { AuthResult } from "@/data/auth-client";
import { locale, messages } from "@/i18n/messages";

// jsdom has no layout: the one-time-code input asks for ResizeObserver and elementFromPoint (password managers'
// badges); neither matters here.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  },
);
Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true });

export function renderScreen(screen: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>{screen}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** An auth call that answers once with result. */
export function answers<T>(result: AuthResult<T>) {
  return vi.fn(() => Promise.resolve(result));
}

export const ok = <T,>(data: T): AuthResult<T> => ({ ok: true, data });

export const refused = (status: number, code: string, retryAfterSeconds: number | null = null): AuthResult<never> => ({
  ok: false,
  status,
  code,
  retryAfterSeconds,
});
```

`apps/web/test/account/next-path.test.ts`:
```ts
// After signing in, a person returns to the page they were sent from, but never to another site.
import { describe, expect, it } from "vitest";
import { nextPath } from "@/account/next-path";

describe("nextPath", () => {
  it("returns an app path from ?next=, and home otherwise", () => {
    expect(nextPath(new URLSearchParams("next=/staff"))).toBe("/staff");
    expect(nextPath(new URLSearchParams())).toBe("/");
    expect(nextPath(new URLSearchParams("next=//evil.example"))).toBe("/");
    expect(nextPath(new URLSearchParams("next=https://evil.example"))).toBe("/");
  });
});
```

`apps/web/test/account/sign-in-forms.test.tsx`:
```tsx
// The two sign-in forms check what was typed with the api's own rules, send it, and say plainly why a sign-in was
// refused. The organization code is remembered only after it worked.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeSignInForm } from "@/account/code-sign-in-form";
import { EmailSignInForm } from "@/account/email-sign-in-form";
import { rememberedOrganizationCode } from "@/account/remembered-code";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;

afterEach(() => {
  window.localStorage.clear();
});

describe("EmailSignInForm", () => {
  it("asks for what's missing before sending anything", async () => {
    const signInWithEmail = answers(ok({ twoFactorRequired: false }));
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail }} />);
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findAllByText(account.fields.required)).toHaveLength(2);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(account.fields.invalidEmail)).toBeVisible();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("sends the email as the api compares it, and reports the outcome", async () => {
    const signInWithEmail = answers(ok({ twoFactorRequired: true }));
    const onSignedIn = vi.fn();
    renderScreen(<EmailSignInForm onSignedIn={onSignedIn} auth={{ signInWithEmail }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "  Asha@Example.IN ");
    await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(signInWithEmail).toHaveBeenCalledWith({ email: "asha@example.in", password: "owner-password-1" });
    expect(onSignedIn).toHaveBeenCalledWith({ twoFactorRequired: true });
  });

  it("says why a sign-in was refused, and how long to wait after too many tries", async () => {
    const signInWithEmail = vi
      .fn()
      .mockResolvedValueOnce(refused(401, "INVALID_EMAIL_OR_PASSWORD"))
      .mockResolvedValueOnce(refused(429, "TOO_MANY_REQUESTS", 42));
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(errors.auth.INVALID_EMAIL_OR_PASSWORD)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText("Too many attempts. Try again in 42 seconds.")).toBeVisible();
  });
});

describe("CodeSignInForm", () => {
  it("sends the code in capitals and remembers it once the sign-in worked", async () => {
    const signInWithCode = answers(ok({ twoFactorRequired: false }));
    renderScreen(<CodeSignInForm rememberedCode={null} onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    await userEvent.type(screen.getByLabelText(account.fields.organizationCode), "sharma");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "ravi-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(signInWithCode).toHaveBeenCalledWith({ orgCode: "SHARMA", username: "ravi", password: "ravi-password-1" });
    expect(rememberedOrganizationCode()).toBe("SHARMA");
  });

  it("starts with the remembered code, and forgets nothing on a refusal", async () => {
    window.localStorage.setItem("travel-crm.organization-code", "SHARMA");
    const signInWithCode = answers(refused(401, "INVALID_USERNAME_OR_PASSWORD"));
    renderScreen(<CodeSignInForm rememberedCode="SHARMA" onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    expect(screen.getByLabelText(account.fields.organizationCode)).toHaveValue("SHARMA");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(errors.auth.INVALID_USERNAME_OR_PASSWORD)).toBeVisible();
    expect(rememberedOrganizationCode()).toBe("SHARMA");
  });

  it("refuses a code the api would refuse", async () => {
    const signInWithCode = answers(ok({ twoFactorRequired: false }));
    renderScreen(<CodeSignInForm rememberedCode={null} onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    await userEvent.type(screen.getByLabelText(account.fields.organizationCode), "SH");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "p");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText("Use 3-12 letters or digits")).toBeVisible();
    expect(signInWithCode).not.toHaveBeenCalled();
  });
});
```

`apps/web/test/account/sign-in-screen.test.tsx`:
```tsx
// The sign-in screen opens on email, or on the organization code once this device has used one, filled in.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "@/account/sign-in-screen";
import { messages } from "@/i18n/messages";
import { renderScreen } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { account } = messages;

afterEach(() => {
  window.localStorage.clear();
});

describe("SignInScreen", () => {
  it("opens on email the first time", () => {
    renderScreen(<SignInScreen />);
    expect(screen.getByRole("tab", { name: account.signIn.byEmail })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: account.fields.email })).toBeVisible();
  });

  it("opens on the organization code, filled in, once one worked here", () => {
    window.localStorage.setItem("travel-crm.organization-code", "SHARMA");
    renderScreen(<SignInScreen />);
    expect(screen.getByRole("tab", { name: account.signIn.byCode })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: account.fields.organizationCode })).toHaveValue("SHARMA");
  });
});
```

`apps/web/test/account/two-factor-challenge.test.tsx`:
```tsx
// The code step: six digits from the app (or a backup code), sent with the trust-device choice; an expired first
// step sends the person back to sign in.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const finishSignIn = vi.fn();
vi.mock("@/account/finish-sign-in", () => ({ useFinishSignIn: () => finishSignIn }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("next=/staff") }));

const { account, errors } = messages;

describe("TwoFactorChallenge", () => {
  it("sends the six digits, then opens the page the person came for", async () => {
    const verifyTwoFactorCode = answers(ok(null));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode, verifyBackupCode: vi.fn() }} />);
    const submit = screen.getByRole("button", { name: account.twoFactor.submit });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(account.fields.code), "123456");
    await userEvent.click(screen.getByLabelText(account.twoFactor.trustDevice));
    await userEvent.click(submit);
    expect(verifyTwoFactorCode).toHaveBeenCalledWith({ code: "123456", trustDevice: true });
    expect(finishSignIn).toHaveBeenCalledWith("/staff");
  });

  it("takes a backup code instead", async () => {
    const verifyBackupCode = answers(refused(401, "INVALID_BACKUP_CODE"));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode: vi.fn(), verifyBackupCode }} />);
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.useBackupCode }));
    await userEvent.type(screen.getByLabelText(account.fields.backupCode), " abcde-12345 ");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345", trustDevice: false });
    expect(await screen.findByText(errors.auth.INVALID_BACKUP_CODE)).toBeVisible();
  });

  it("sends the person back to sign in when the first step has expired", async () => {
    const verifyTwoFactorCode = answers(refused(401, "INVALID_TWO_FACTOR_COOKIE"));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode, verifyBackupCode: vi.fn() }} />);
    await userEvent.type(screen.getByLabelText(account.fields.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(await screen.findByRole("link", { name: account.twoFactor.startAgain })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fstaff",
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account`

Expected: FAIL. Vite can't resolve `@/account/sign-in-screen`, `@/account/email-sign-in-form` and the other
`@/account/...` modules, which don't exist yet.

- [ ] **Step 3: The words**

Replace `apps/web/src/i18n/messages/en-IN/account.json` (it holds `{}`) with:


```json
{
  "fields": {
    "email": "Email",
    "password": "Password",
    "organizationCode": "Organization code",
    "organizationCodeHint": "Your organization's short code, for example SHARMA",
    "username": "Username",
    "code": "Code from your authenticator app",
    "backupCode": "Backup code",
    "required": "Fill this in.",
    "invalidEmail": "Type an email like name@example.com.",
    "tooLong": "This is too long."
  },
  "signIn": {
    "title": "Sign in",
    "byEmail": "Email",
    "byCode": "Organization code",
    "submit": "Sign in",
    "submitting": "Signing in",
    "forgotPassword": "Forgot your password?",
    "noEmailHint": "Staff without an email sign in with the organization code. Your admin can reset your password.",
    "waitSeconds": "Too many attempts. Try again in {seconds, plural, one {# second} other {# seconds}}."
  },
  "twoFactor": {
    "title": "Enter your code",
    "intro": "Open your authenticator app and type the 6-digit code it shows for this account.",
    "backupIntro": "Type one of the backup codes you saved when you set up two-factor sign-in. Each works once.",
    "useBackupCode": "Use a backup code instead",
    "useAuthenticator": "Use the authenticator app instead",
    "trustDevice": "Don't ask again on this device for 30 days",
    "submit": "Continue",
    "submitting": "Checking",
    "startAgain": "Start signing in again"
  }
}
```

- [ ] **Step 4: The form pieces every account screen uses**

Field checks are the api's own Zod schemas from `@travel-crm/contracts/identity`; a schema's own message wins, and
`useFieldErrorMessages` words the generic ones. Inputs are 44px, 16px text, label above, error below with an icon.

`apps/web/src/account/form-errors.ts`:
```ts
"use client";

// Messages for the checks a form runs before sending (the same Zod schemas the api uses). A schema's own message
// ("Use 3-12 letters or digits") wins; this covers the generic ones Zod would otherwise phrase for developers.
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { z } from "zod";

export function useFieldErrorMessages(): z.core.$ZodErrorMap {
  const t = useTranslations("account.fields");
  return useMemo<z.core.$ZodErrorMap>(
    () => (issue) => {
      if (issue.code === "too_small" && issue.origin === "string" && issue.minimum === 1) return t("required");
      if (issue.code === "invalid_format" && issue.format === "email") {
        return issue.input === "" ? t("required") : t("invalidEmail");
      }
      if (issue.code === "too_big" && issue.origin === "string") return t("tooLong");
      return undefined;
    },
    [t],
  );
}
```

`apps/web/src/account/text-field.tsx`:
```tsx
"use client";

// One labelled input bound to a form field (DESIGN.md: a visible label above, never a placeholder alone; the error
// below with an icon, linked by aria-describedby; inputs 16px so iOS doesn't zoom).
import { CircleAlertIcon } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type InputProps = Pick<
  ComponentProps<"input">,
  "type" | "autoComplete" | "inputMode" | "autoCapitalize" | "spellCheck"
>;

export function TextField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
  ...inputProps
}: InputProps & {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            id={id}
            {...inputProps}
            {...field}
            value={typeof field.value === "string" ? field.value : ""}
            aria-invalid={fieldState.invalid}
            aria-describedby={[hint ? `${id}-hint` : null, fieldState.error ? `${id}-error` : null]
              .filter((part) => part !== null)
              .join(" ")}
          />
          {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
          {fieldState.error && (
            <FieldError id={`${id}-error`} className="flex items-start gap-1.5">
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {fieldState.error.message}
            </FieldError>
          )}
        </Field>
      )}
    />
  );
}
```

`apps/web/src/account/form-alert.tsx`:
```tsx
"use client";

// Why a form was refused, above its button: the api's reason in plain words, or how long to wait after too many tries.
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthResult } from "@/data/auth-client";
import { useErrorMessage } from "@/lib/error-message";

export type AuthFailure = Extract<AuthResult<unknown>, { ok: false }>;

export function AuthFailureAlert({ failure }: { failure: AuthFailure | null }) {
  const t = useTranslations("account.signIn");
  const { authError } = useErrorMessage();
  if (!failure) return null;
  const message =
    failure.status === 429 && failure.retryAfterSeconds !== null
      ? t("waitSeconds", { seconds: failure.retryAfterSeconds })
      : authError(failure);
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
```

`apps/web/src/account/remembered-code.ts`:
```ts
// The organization code the app remembers after a code sign-in (spec 6.3), so staff type only their username and
// password next time. Kept in localStorage: it isn't secret (it's on every invoice). Storage can be blocked or full,
// which just means typing the code again.
import { useSyncExternalStore } from "react";

const KEY = "travel-crm.organization-code";

export function rememberedOrganizationCode(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Pages are rendered ahead of time, where nothing is remembered; the browser then reads the real value. */
export function useRememberedOrganizationCode(): string | null {
  return useSyncExternalStore(subscribe, rememberedOrganizationCode, () => null);
}

/** Another tab signing in with a code updates the remembered one here too. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
  };
}

export function rememberOrganizationCode(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Not remembered; nothing else changes.
  }
}
```

`apps/web/src/account/next-path.ts`:
```ts
// Where to go after signing in: the ?next= page the person was sent from, if it is a page of this app, else home.
import { isAppPath, routes } from "@/lib/routes";

export function nextPath(searchParams: Pick<URLSearchParams, "get">): string {
  const next = searchParams.get("next");
  return next !== null && isAppPath(next) ? next : routes.home;
}
```

`apps/web/src/account/finish-sign-in.ts`:
```ts
"use client";

// The last step of every sign-in: forget whatever an earlier session left on this device, then open the app with a
// full page load, so nothing from before survives in memory either.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { wipeLocalData } from "@/data/session";

export function useFinishSignIn(): (next: string) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (next) => {
      await wipeLocalData(queryClient);
      window.location.assign(next);
    },
    [queryClient],
  );
}
```

- [ ] **Step 5: The sign-in forms, the screen and the code step**

The organization code is remembered only after a sign-in with it worked, and the screen opens on that tab with it
filled (spec 6.3). Every sign-in ends with `wipeLocalData` and a full page load, so nothing an earlier session left
on the device survives. The trust-device choice keeps Better Auth's default of 30 days (`trustDeviceMaxAge`
2,592,000 seconds in better-auth 1.7.7's two-factor plugin; `createAuth` doesn't change it).

`apps/web/src/account/email-sign-in-form.tsx`:
```tsx
"use client";

// Signing in with an email and password (spec 6.3), checked with the same field rules the api uses.
import { zodResolver } from "@hookform/resolvers/zod";
import { emailAddress, passwordAttempt } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type SignInOutcome } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

const emailSignIn = z.strictObject({ email: emailAddress, password: passwordAttempt });

export function EmailSignInForm({
  onSignedIn,
  auth = authClient,
}: {
  onSignedIn: (outcome: SignInOutcome) => Promise<void> | void;
  auth?: Pick<AuthClient, "signInWithEmail">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const form = useForm<z.input<typeof emailSignIn>, unknown, z.output<typeof emailSignIn>>({
    resolver: zodResolver(emailSignIn, { error: errorMessages }),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    const result = await auth.signInWithEmail(values);
    if (result.ok) await onSignedIn(result.data);
    else setFailure(result);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="email"
          label={t("fields.email")}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="password"
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("signIn.submitting") : t("signIn.submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/account/code-sign-in-form.tsx`:
```tsx
"use client";

// Signing in with the organization code, a username and a password (spec 6.3), for staff with or without email.
// The code is remembered after a successful sign-in, so next time only the username and password are typed.
import { zodResolver } from "@hookform/resolvers/zod";
import { orgSignInInput } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type SignInOutcome } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { rememberOrganizationCode } from "./remembered-code";
import { TextField } from "./text-field";

export function CodeSignInForm({
  rememberedCode,
  onSignedIn,
  auth = authClient,
}: {
  rememberedCode: string | null;
  onSignedIn: (outcome: SignInOutcome) => Promise<void> | void;
  auth?: Pick<AuthClient, "signInWithCode">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const form = useForm<z.input<typeof orgSignInInput>, unknown, z.output<typeof orgSignInInput>>({
    resolver: zodResolver(orgSignInInput, { error: errorMessages }),
    defaultValues: { orgCode: rememberedCode ?? "", username: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    const result = await auth.signInWithCode(values);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    rememberOrganizationCode(values.orgCode);
    await onSignedIn(result.data);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="orgCode"
          label={t("fields.organizationCode")}
          hint={t("fields.organizationCodeHint")}
          autoComplete="organization"
          autoCapitalize="characters"
          spellCheck={false}
          className="[&_input]:numbers [&_input]:uppercase"
        />
        <TextField
          control={form.control}
          name="username"
          label={t("fields.username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="password"
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("signIn.submitting") : t("signIn.submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/account/sign-in-screen.tsx`:
```tsx
"use client";

// The sign-in screen (spec 6.3): one address for everyone, two ways in. The organization-code way opens first, with
// the code filled in, once this device has used it. A person with two-factor sign-in goes on to type a code.
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthClient, SignInOutcome } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { CodeSignInForm } from "./code-sign-in-form";
import { EmailSignInForm } from "./email-sign-in-form";
import { useFinishSignIn } from "./finish-sign-in";
import { nextPath } from "./next-path";
import { useRememberedOrganizationCode } from "./remembered-code";

type Way = "email" | "code";

export function SignInScreen({ auth }: { auth?: Pick<AuthClient, "signInWithEmail" | "signInWithCode"> }) {
  const t = useTranslations("account.signIn");
  const router = useRouter();
  const next = nextPath(useSearchParams());
  const finishSignIn = useFinishSignIn();
  const rememberedCode = useRememberedOrganizationCode();
  // Until the person picks a tab, a remembered code decides which one opens.
  const [chosenWay, setChosenWay] = useState<Way | null>(null);
  const way = chosenWay ?? (rememberedCode ? "code" : "email");

  const onSignedIn = async ({ twoFactorRequired }: SignInOutcome) => {
    if (twoFactorRequired) router.push(`${routes.twoFactorChallenge}?next=${encodeURIComponent(next)}`);
    else await finishSignIn(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <Tabs
        value={way}
        onValueChange={(value) => {
          setChosenWay(value === "code" ? "code" : "email");
        }}
        className="gap-5"
      >
        {/* 44px tall, the smallest touch target (DESIGN.md section 4). */}
        <TabsList className="w-full group-data-horizontal/tabs:h-11">
          <TabsTrigger value="email" className="text-muted-foreground data-active:text-foreground">
            {t("byEmail")}
          </TabsTrigger>
          <TabsTrigger value="code" className="text-muted-foreground data-active:text-foreground">
            {t("byCode")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailSignInForm onSignedIn={onSignedIn} {...(auth ? { auth } : {})} />
        </TabsContent>
        <TabsContent value="code">
          {/* Keyed by the code, so the form starts again filled in once the browser has read it. */}
          <CodeSignInForm
            key={rememberedCode ?? ""}
            rememberedCode={rememberedCode}
            onSignedIn={onSignedIn}
            {...(auth ? { auth } : {})}
          />
          <p className="mt-4 text-label text-muted-foreground">{t("noEmailHint")}</p>
        </TabsContent>
      </Tabs>
      <Link href={routes.forgotPassword} className="text-primary underline-offset-4 hover:underline">
        {t("forgotPassword")}
      </Link>
    </div>
  );
}
```

`apps/web/src/account/two-factor-challenge.tsx`:
```tsx
"use client";

// The second step of a two-factor sign-in: the 6-digit code from the authenticator app, or a backup code. Better
// Auth remembers the first step in a short-lived cookie; if it has expired the person starts again.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFinishSignIn } from "./finish-sign-in";
import { nextPath } from "./next-path";

const CODE_LENGTH = 6;

export function TwoFactorChallenge({
  auth = authClient,
}: {
  auth?: Pick<AuthClient, "verifyTwoFactorCode" | "verifyBackupCode">;
}) {
  const t = useTranslations("account");
  const next = nextPath(useSearchParams());
  const finishSignIn = useFinishSignIn();
  const id = useId();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ready = useBackup ? code.trim().length > 0 : code.length === CODE_LENGTH;
  const expired =
    failure?.code === "INVALID_TWO_FACTOR_COOKIE" || failure?.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE";

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setFailure(null);
    const input = { code: code.trim(), trustDevice };
    const result = useBackup ? await auth.verifyBackupCode(input) : await auth.verifyTwoFactorCode(input);
    if (result.ok) {
      await finishSignIn(next);
      return;
    }
    setFailure(result);
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("twoFactor.title")}</PageTitle>
      <p className="text-muted-foreground">{useBackup ? t("twoFactor.backupIntro") : t("twoFactor.intro")}</p>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor={`${id}-code`}>{useBackup ? t("fields.backupCode") : t("fields.code")}</FieldLabel>
          {useBackup ? (
            <Input
              id={`${id}-code`}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="numbers"
            />
          ) : (
            <InputOTP
              id={`${id}-code`}
              maxLength={CODE_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              pattern="^[0-9]+$"
              autoComplete="one-time-code"
              autoFocus
            >
              <InputOTPGroup className="numbers">
                {Array.from({ length: CODE_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-11 text-number-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-trust`}
            checked={trustDevice}
            onCheckedChange={(checked) => {
              setTrustDevice(checked === true);
            }}
          />
          <FieldLabel htmlFor={`${id}-trust`} className="font-normal">
            {t("twoFactor.trustDevice")}
          </FieldLabel>
        </Field>
        <AuthFailureAlert failure={failure} />
        {expired ? (
          <Button asChild>
            <Link href={`${routes.signIn}?next=${encodeURIComponent(next)}`}>{t("twoFactor.startAgain")}</Link>
          </Button>
        ) : (
          <Button type="submit" disabled={!ready || submitting}>
            {submitting && <Spinner />}
            {submitting ? t("twoFactor.submitting") : t("twoFactor.submit")}
          </Button>
        )}
      </form>
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setUseBackup(!useBackup);
          setCode("");
          setFailure(null);
        }}
      >
        {useBackup ? t("twoFactor.useAuthenticator") : t("twoFactor.useBackupCode")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: The pages**

`(account)` is a route group: no shell, one narrow column, the brand's mark (`/icons/favicon.svg`, which the
groundwork's `generate` copies) and name. Pages that read `?next=` wrap their screen in `Suspense`, because the
search parameters are known only in the browser and the pages are prerendered.

`apps/web/src/app/(account)/layout.tsx`:
```tsx
// The frame of the screens outside the app shell (signing in, passwords, two-factor): the product's name and one
// narrow column, centred on wide screens and edge to edge with a 16px gutter on phones.
import { brand } from "@travel-crm/brand";
import Image from "next/image";
import type { ReactNode } from "react";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <main className="flex w-full max-w-sm flex-col gap-8">
        <p className="flex items-center gap-2 text-section font-semibold">
          {/* The brand's mark, which the build copies to /icons; the name next to it says what it is. */}
          <Image src="/icons/favicon.svg" alt="" width={28} height={28} />
          {brand.productName}
        </p>
        {children}
      </main>
    </div>
  );
}
```

`apps/web/src/app/(account)/sign-in/page.tsx`:
```tsx
// /sign-in: by email, or by organization code and username (spec 6.3).
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInScreen } from "@/account/sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // The screen reads ?next=, which is only known in the browser.
  return (
    <Suspense>
      <SignInScreen />
    </Suspense>
  );
}
```

`apps/web/src/app/(account)/sign-in/two-factor/page.tsx`:
```tsx
// /sign-in/two-factor: the code after the password, for people with two-factor sign-in.
import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";

export const metadata: Metadata = { title: "Enter your code" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorChallenge />
    </Suspense>
  );
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account`

Expected: 12 tests pass.

- [ ] **Step 8: The journeys**

`apps/web/test/e2e/support/totp.ts`:
```ts
// The 6-digit code an authenticator app shows (RFC 6238: HMAC-SHA1 over 30-second steps), for journeys that sign
// in with two-factor. The secret is the base32 text in the otpauth:// link.
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Bytes(text: string): Buffer {
  let bits = "";
  for (const character of text.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) throw new Error(`Not base32: ${character}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

export function totpCode(base32Secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", base32Bytes(base32Secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

/** The secret in an otpauth:// link. */
export function secretOf(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get("secret");
  if (!secret) throw new Error("no secret in the link");
  return secret;
}
```

`apps/web/test/e2e/account-sign-in.spec.ts`:
```ts
// Signing in (spec 6.3, spec 12.1's first journey): by email, and by organization code and username, which the device
// then remembers; a wrong password says so; with two-factor on, the code comes next.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { secretOf, totpCode } from "./support/totp";

test("an Owner signs in by email", async ({ page, agency }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password").fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
});

test("staff sign in with the organization code, which the device then remembers", async ({
  page,
  agency,
  addStaff,
}, testInfo) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Organization code" }).click();
  await page.getByRole("textbox", { name: "Organization code" }).fill(agency.code.toLowerCase());
  await page.getByRole("textbox", { name: "Username" }).fill(ravi.username);
  await page.getByLabel("Password").fill(ravi.password);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();

  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("tab", { name: "Organization code" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Organization code" })).toHaveValue(agency.code);
});

test("a wrong password says so, and signs nobody in", async ({ page, agency }) => {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match." })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("with two-factor on, the code from the app comes after the password", async ({ page, agency }) => {
  // Turn two-factor on through the api, as the setup screen does, and keep the secret the phone would hold.
  await signInByEmail(page, agency.owner);
  const origin = { origin: process.env.E2E_BASE_URL ?? "" };
  const enable = await page.request.post("/api/auth/two-factor/enable", {
    data: { password: agency.owner.password },
    headers: origin,
  });
  const secret = secretOf(((await enable.json()) as { totpURI: string }).totpURI);
  await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCode(secret) }, headers: origin });
  await page.context().clearCookies();

  await page.goto("/sign-in?next=%2F");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password").fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter your code" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Code from your authenticator app").fill(totpCode(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec playwright test account-sign-in`

Expected: 8 passed (4 journeys on the phone and the desktop). The two-factor journey turns two-factor on through the
api (as Task A2's screen will) and keeps the secret, then signs in through the form and types the code.

- [ ] **Step 9: Check and commit**

Run the track's gate (above). Expected: green; web unit tests 57, journeys 19 passed and 1 skipped (the shell's
desktop-only prefetch journey on the phone), no dependency violations.

```bash
cd /Users/ak/personal/travel-crm-05a-account
git add "apps/web/src/app/(account)" apps/web/src/account apps/web/src/i18n/messages/en-IN/account.json apps/web/test/account apps/web/test/e2e/account-sign-in.spec.ts apps/web/test/e2e/support/totp.ts
git commit -m "feat(web): sign in by email or by organization code, with the two-factor code step"
```

---

### Task A2: A new password, two-factor setup, and the person's own account

**Files:**
- Create: `apps/web/src/account/current-person.ts`
- Create: `apps/web/src/account/change-password-form.tsx`
- Create: `apps/web/src/account/change-password-screen.tsx`
- Create: `apps/web/src/account/qr-code.tsx`
- Create: `apps/web/src/account/two-factor-setup.tsx`
- Create: `apps/web/src/account/two-factor-setup-screen.tsx`
- Create: `apps/web/src/account/turn-off-two-factor.tsx`
- Create: `apps/web/src/account/account-screen.tsx`
- Create: `apps/web/src/app/(account)/change-password/page.tsx`
- Create: `apps/web/src/app/(account)/two-factor-setup/page.tsx`
- Create: `apps/web/src/app/(app)/account/page.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/account.json`, `apps/web/test/account/render.tsx` (adds the tRPC provider)
- Test: `apps/web/test/account/change-password-form.test.tsx`
- Test: `apps/web/test/account/two-factor-setup.test.tsx`
- Test: `apps/web/test/account/account-screen.test.tsx`
- Test: `apps/web/test/e2e/support/account-steps.ts`
- Test: `apps/web/test/e2e/account-steps.spec.ts`

**Interfaces:**
- Consumes: Task A1's `TextField`, `AuthFailureAlert`, `useFieldErrorMessages`, `renderScreen`, `answers`, `ok`,
  `refused`, `totpCode`; groundwork `useTRPC`, `pendingStepRoute`, `routes`, `useMe`, `MeProvider`,
  `SignedInMember`, `StatusBadge`, `Delayed`, the test support `member()`; `uqr`'s `encode`; the contracts'
  `newPassword`, `passwordAttempt`.
- Produces: `useCurrentPerson()` (me.get for screens outside the shell), `useContinueAfterStep(): () => Promise<void>`
  (asks me.get again and opens the next pending step, or home); `ChangePasswordForm({ temporary, onChanged, auth? })`;
  `TwoFactorSetup({ pending, onDone, auth? })`; `QrCode({ value, label, className? })`; `TurnOffTwoFactor({
  onTurnedOff, auth? })`; `AccountScreen()`; the routes `/change-password`, `/two-factor-setup`, `/account`; journey
  support `signInWithCode(page, code, person)`, `setUpTwoFactor(page, password): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

The screens are tested with a fake auth client; `render.tsx` gains the tRPC provider the account screen needs (no
test lets it call the api). Replace `apps/web/test/account/render.tsx` with:


```tsx
// Renders an account screen as the app does: with its messages, a query cache of its own and the tRPC client (which
// these tests never let call the api).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { AuthResult } from "@/data/auth-client";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";

// jsdom has no layout: the one-time-code input asks for ResizeObserver and elementFromPoint (password managers'
// badges); neither matters here.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  },
);
Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true });

export function renderScreen(screen: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          {screen}
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** An auth call that answers once with result. */
export function answers<T>(result: AuthResult<T>) {
  return vi.fn(() => Promise.resolve(result));
}

export const ok = <T,>(data: T): AuthResult<T> => ({ ok: true, data });

export const refused = (status: number, code: string, retryAfterSeconds: number | null = null): AuthResult<never> => ({
  ok: false,
  status,
  code,
  retryAfterSeconds,
});
```

`apps/web/test/account/change-password-form.test.tsx`:
```tsx
// Changing a password: the new one twice, at least 10 characters, and the current one checked by the api.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/account/change-password-form";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;

async function fill(current: string, chosen: string, again: string) {
  await userEvent.type(screen.getByLabelText(account.fields.temporaryPassword), current);
  await userEvent.type(screen.getByLabelText(account.fields.newPassword), chosen);
  await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), again);
  await userEvent.click(screen.getByRole("button", { name: account.changePassword.submit }));
}

describe("ChangePasswordForm", () => {
  it("asks for the new password twice, and long enough, before sending", async () => {
    const changePassword = answers(ok(null));
    renderScreen(<ChangePasswordForm temporary onChanged={vi.fn()} auth={{ changePassword }} />);
    await fill("temporary-1", "short", "different");
    expect(await screen.findByText("Use at least 10 characters")).toBeVisible();
    expect(screen.getByText(account.fields.passwordsDiffer)).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("sends the current and new passwords, then moves on", async () => {
    const changePassword = answers(ok(null));
    const onChanged = vi.fn();
    renderScreen(<ChangePasswordForm temporary onChanged={onChanged} auth={{ changePassword }} />);
    await fill("temporary-1", "my-own-password", "my-own-password");
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "temporary-1", newPassword: "my-own-password" });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("says when the current password is wrong", async () => {
    const changePassword = answers(refused(400, "INVALID_PASSWORD"));
    const onChanged = vi.fn();
    renderScreen(<ChangePasswordForm temporary onChanged={onChanged} auth={{ changePassword }} />);
    await fill("wrong", "my-own-password", "my-own-password");
    expect(await screen.findByText(errors.auth.INVALID_PASSWORD)).toBeVisible();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
```

`apps/web/test/account/two-factor-setup.test.tsx`:
```tsx
// Setting up two-factor: the password, then the code to scan with the key written out, then the 6 digits that turn
// it on, then the backup codes, shown once.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorSetup } from "@/account/two-factor-setup";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;
const setup = {
  totpUri: "otpauth://totp/Test:asha%40example.in?secret=JBSWY3DPEHPK3PXPJBSW&issuer=Test",
  backupCodes: ["aaaaa-11111", "bbbbb-22222"],
};

describe("TwoFactorSetup", () => {
  it("walks from the password to the backup codes", async () => {
    const startTwoFactorSetup = answers(ok(setup));
    const confirmTwoFactor = vi
      .fn()
      .mockResolvedValueOnce(refused(401, "INVALID_CODE"))
      .mockResolvedValueOnce(ok(null));
    const onDone = vi.fn();
    renderScreen(<TwoFactorSetup pending onDone={onDone} auth={{ startTwoFactorSetup, confirmTwoFactor }} />);
    expect(screen.getByText(account.twoFactorSetup.pendingIntro)).toBeVisible();

    await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.start }));
    expect(startTwoFactorSetup).toHaveBeenCalledWith({ password: "owner-password-1" });
    expect(screen.getByRole("img", { name: account.twoFactorSetup.qrLabel })).toBeVisible();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW")).toBeVisible();

    await userEvent.type(screen.getByLabelText(account.twoFactorSetup.confirmStep), "000000");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(await screen.findByText(errors.auth.INVALID_CODE)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(confirmTwoFactor).toHaveBeenLastCalledWith({ code: "000000" });

    expect(await screen.findByText("aaaaa-11111")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.done }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("says when the password is wrong", async () => {
    const startTwoFactorSetup = answers(refused(400, "INVALID_PASSWORD"));
    renderScreen(
      <TwoFactorSetup pending={false} onDone={vi.fn()} auth={{ startTwoFactorSetup, confirmTwoFactor: vi.fn() }} />,
    );
    expect(screen.getByText(account.twoFactorSetup.intro)).toBeVisible();
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.start }));
    expect(await screen.findByText(errors.auth.INVALID_PASSWORD)).toBeVisible();
  });
});
```

`apps/web/test/account/account-screen.test.tsx`:
```tsx
// The account page shows the person's own details from me.get (no email for staff without one), and offers turning
// two-factor off only when the organization doesn't require it.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountScreen } from "@/account/account-screen";
import { messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";
import { renderScreen } from "./render";

const { account } = messages.account;

function renderAccount(me: SignedInMember) {
  return renderScreen(
    <MeProvider me={me}>
      <AccountScreen />
    </MeProvider>,
  );
}

describe("AccountScreen", () => {
  it("shows a username and no email row for staff without email", () => {
    renderAccount(member());
    expect(screen.getByText("asha")).toBeVisible();
    expect(screen.queryByText(account.email)).toBeNull();
    expect(screen.getByRole("link", { name: account.changePassword })).toHaveAttribute("href", "/change-password");
  });

  it("offers setting two-factor up while it is off", () => {
    renderAccount(member());
    expect(screen.getByText(account.twoFactorOff)).toBeVisible();
    expect(screen.getByRole("link", { name: account.setUp })).toHaveAttribute("href", "/two-factor-setup");
  });

  it("offers turning two-factor off, unless the organization requires it", () => {
    const on = member();
    on.user.twoFactorEnabled = true;
    const { unmount } = renderAccount(on);
    expect(screen.getByRole("button", { name: account.turnOff })).toBeVisible();
    unmount();
    renderAccount({ ...on, organization: { ...on.organization, requireTwoFactor: true } });
    expect(screen.queryByRole("button", { name: account.turnOff })).toBeNull();
    expect(screen.getByText(account.twoFactorRequired)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account`

Expected: FAIL. `@/account/change-password-form`, `@/account/two-factor-setup` and `@/account/account-screen`
can't be resolved; Task A1's 12 tests still pass.

- [ ] **Step 3: The words**

Replace `apps/web/src/i18n/messages/en-IN/account.json` with:


```json
{
  "fields": {
    "email": "Email",
    "password": "Password",
    "organizationCode": "Organization code",
    "organizationCodeHint": "Your organization's short code, for example SHARMA",
    "username": "Username",
    "code": "Code from your authenticator app",
    "backupCode": "Backup code",
    "required": "Fill this in.",
    "invalidEmail": "Type an email like name@example.com.",
    "tooLong": "This is too long.",
    "currentPassword": "Current password",
    "temporaryPassword": "Temporary password",
    "newPassword": "New password",
    "newPasswordHint": "At least 10 characters",
    "confirmPassword": "New password again",
    "passwordsDiffer": "The two passwords are different."
  },
  "signIn": {
    "title": "Sign in",
    "byEmail": "Email",
    "byCode": "Organization code",
    "submit": "Sign in",
    "submitting": "Signing in",
    "forgotPassword": "Forgot your password?",
    "noEmailHint": "Staff without an email sign in with the organization code. Your admin can reset your password.",
    "waitSeconds": "Too many attempts. Try again in {seconds, plural, one {# second} other {# seconds}}."
  },
  "twoFactor": {
    "title": "Enter your code",
    "intro": "Open your authenticator app and type the 6-digit code it shows for this account.",
    "backupIntro": "Type one of the backup codes you saved when you set up two-factor sign-in. Each works once.",
    "useBackupCode": "Use a backup code instead",
    "useAuthenticator": "Use the authenticator app instead",
    "trustDevice": "Don't ask again on this device for 30 days",
    "submit": "Continue",
    "submitting": "Checking",
    "startAgain": "Start signing in again"
  },
  "changePassword": {
    "title": "Choose a new password",
    "pendingIntro": "Your admin gave you a temporary password. Choose your own to continue.",
    "intro": "Choose a new password. You'll stay signed in here; other devices are signed out.",
    "submit": "Save new password",
    "submitting": "Saving",
    "changed": "Your password is changed."
  },
  "twoFactorSetup": {
    "title": "Set up two-factor sign-in",
    "pendingIntro": "Your organization asks everyone to sign in with a code from an authenticator app as well as a password.",
    "intro": "Sign in with a code from an authenticator app as well as your password.",
    "passwordStep": "Confirm your password to start.",
    "start": "Continue",
    "starting": "Checking",
    "scan": "Scan this code with an authenticator app such as Google Authenticator or Microsoft Authenticator.",
    "qrLabel": "QR code to add this account to an authenticator app",
    "manualKey": "Can't scan it? Type this key instead:",
    "confirmStep": "Then type the 6-digit code the app shows.",
    "confirm": "Turn on",
    "confirming": "Turning on",
    "backupTitle": "Save your backup codes",
    "backupIntro": "If you lose your phone, each of these codes signs you in once. Keep them somewhere safe; they won't be shown again.",
    "copyCodes": "Copy codes",
    "copied": "Codes copied",
    "done": "I've saved them"
  },
  "account": {
    "title": "Your account",
    "name": "Name",
    "email": "Email",
    "username": "Username",
    "organization": "Organization",
    "role": "Role",
    "password": "Password",
    "changePassword": "Change password",
    "twoFactor": "Two-factor sign-in",
    "twoFactorOn": "On",
    "twoFactorOff": "Off",
    "twoFactorRequired": "Your organization requires it, so it stays on.",
    "setUp": "Set up",
    "turnOff": "Turn off",
    "turnOffTitle": "Turn off two-factor sign-in?",
    "turnOffIntro": "You'll sign in with your password only. Confirm your password to turn it off.",
    "turningOff": "Turning off",
    "turnedOff": "Two-factor sign-in is off."
  }
}
```

- [ ] **Step 4: Changing the password**

After a change, `useContinueAfterStep` asks me.get again (`staleTime: 0`), so the cache the shell reads is fresh,
then opens the next pending step or home. A voluntary change goes back to the account page. Better Auth signs other
devices out (`revokeOtherSessions`, set by the groundwork's auth client) and keeps this one signed in.

`apps/web/src/account/current-person.ts`:
```ts
"use client";

// For the screens outside the app shell that still need a signed-in person (changing a password, setting up
// two-factor): who they are, from me.get, and where they go once a step is done, by what the api still asks of them.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";
import { pendingStepRoute, routes } from "@/lib/routes";

export function useCurrentPerson() {
  const trpc = useTRPC();
  return useQuery(trpc.me.get.queryOptions());
}

/** Asks me.get again, then opens the next pending step or, with none left, the home screen. */
export function useContinueAfterStep(): () => Promise<void> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    const me = await queryClient.query({ ...trpc.me.get.queryOptions(), staleTime: 0 });
    router.replace(me.pendingStep ? pendingStepRoute(me.pendingStep) : routes.home);
  }, [trpc, queryClient, router]);
}
```

`apps/web/src/account/change-password-form.tsx`:
```tsx
"use client";

// Choosing a new password: the current one (or the temporary one an admin gave), and the new one twice. Better Auth
// checks the current password; the api's hook refuses a "new" password equal to it.
import { zodResolver } from "@hookform/resolvers/zod";
import { newPassword, passwordAttempt } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

export function ChangePasswordForm({
  temporary,
  onChanged,
  auth = authClient,
}: {
  /** The current password is the temporary one an admin set. */
  temporary: boolean;
  onChanged: () => Promise<void> | void;
  auth?: Pick<AuthClient, "changePassword">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const schema = useMemo(
    () =>
      z
        .strictObject({ currentPassword: passwordAttempt, newPassword, confirmPassword: z.string() })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t("fields.passwordsDiffer"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: errorMessages }),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ currentPassword, newPassword: chosen }) => {
    setFailure(null);
    const result = await auth.changePassword({ currentPassword, newPassword: chosen });
    if (result.ok) await onChanged();
    else setFailure(result);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="currentPassword"
          label={temporary ? t("fields.temporaryPassword") : t("fields.currentPassword")}
          type="password"
          autoComplete="current-password"
        />
        <TextField
          control={form.control}
          name="newPassword"
          label={t("fields.newPassword")}
          hint={t("fields.newPasswordHint")}
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label={t("fields.confirmPassword")}
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("changePassword.submitting") : t("changePassword.submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/account/change-password-screen.tsx`:
```tsx
"use client";

// /change-password: the first sign-in with a temporary password ends here (the CHANGE_PASSWORD step), and anyone may
// come here from their account. Afterwards the app asks the api what's next; other devices are signed out.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Delayed } from "@/components/delayed";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { ChangePasswordForm } from "./change-password-form";
import { useContinueAfterStep, useCurrentPerson } from "./current-person";

export function ChangePasswordScreen() {
  const t = useTranslations("account.changePassword");
  const me = useCurrentPerson();
  const router = useRouter();
  const continueAfterStep = useContinueAfterStep();

  if (!me.data) {
    return (
      <Delayed>
        <Skeleton className="h-64 w-full" />
      </Delayed>
    );
  }
  const pending = me.data.pendingStep === "CHANGE_PASSWORD";
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{pending ? t("pendingIntro") : t("intro")}</p>
      <ChangePasswordForm
        temporary={pending}
        onChanged={async () => {
          if (pending) {
            await continueAfterStep();
            return;
          }
          toast.success(t("changed"));
          router.push(routes.account);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Setting up and turning off two-factor**

The QR code is drawn from `uqr`'s `encode()` as one SVG path in `currentColor`, so it needs no image and no colour
literal. The base32 key is shown in groups of four for typing by hand. Backup codes are shown once, after the code
turned two-factor on.

`apps/web/src/account/qr-code.tsx`:
```tsx
// A QR code drawn as an SVG, in the text colour, so it needs no image and no colour of its own.
import { encode } from "uqr";

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  // One path of 1x1 squares: small to send, crisp at any size.
  const squares = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [])),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={squares.join("")} fill="currentColor" />
    </svg>
  );
}
```

`apps/web/src/account/two-factor-setup.tsx`:
```tsx
"use client";

// Setting up two-factor sign-in, in three steps: confirm the password, scan the code and type the 6 digits the app
// shows (which turns it on), then save the backup codes, shown this once. An organization that requires two-factor
// sends its members here (the SET_UP_TWO_FACTOR step); anyone may come from their account.
import { useTranslations } from "next-intl";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type TwoFactorSetup as Setup } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { QrCode } from "./qr-code";

const CODE_LENGTH = 6;

type Step = { name: "password" } | { name: "scan"; setup: Setup } | { name: "backup"; setup: Setup };

/** The base32 secret in an otpauth:// link, grouped in fours for typing. */
function manualKey(totpUri: string): string {
  const secret = URL.parse(totpUri)?.searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

export function TwoFactorSetup({
  pending,
  onDone,
  auth = authClient,
}: {
  /** The organization requires two-factor and this is why the person is here. */
  pending: boolean;
  onDone: () => Promise<void> | void;
  auth?: Pick<AuthClient, "startTwoFactorSetup" | "confirmTwoFactor">;
}) {
  const t = useTranslations("account");
  const id = useId();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const start = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.startTwoFactorSetup({ password });
      if (result.ok) setStep({ name: "scan", setup: result.data });
      else setFailure(result);
    });
  };

  const confirm = (event: SubmitEvent<HTMLFormElement>, setup: Setup) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.confirmTwoFactor({ code });
      if (result.ok) setStep({ name: "backup", setup });
      else setFailure(result);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("twoFactorSetup.title")}</PageTitle>
      <p className="text-muted-foreground">{pending ? t("twoFactorSetup.pendingIntro") : t("twoFactorSetup.intro")}</p>

      {step.name === "password" && (
        <form noValidate onSubmit={start} className="flex flex-col gap-5">
          <p>{t("twoFactorSetup.passwordStep")}</p>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>{t("fields.password")}</FieldLabel>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          <AuthFailureAlert failure={failure} />
          <Button type="submit" disabled={busy || password === ""}>
            {busy && <Spinner />}
            {busy ? t("twoFactorSetup.starting") : t("twoFactorSetup.start")}
          </Button>
        </form>
      )}

      {step.name === "scan" && (
        <form
          noValidate
          onSubmit={(event) => {
            confirm(event, step.setup);
          }}
          className="flex flex-col gap-5"
        >
          <p>{t("twoFactorSetup.scan")}</p>
          <QrCode
            value={step.setup.totpUri}
            label={t("twoFactorSetup.qrLabel")}
            className="size-48 self-center rounded-lg border bg-background p-2 text-foreground"
          />
          <p className="text-label text-muted-foreground">
            {t("twoFactorSetup.manualKey")}{" "}
            <span className="numbers break-all text-foreground">{manualKey(step.setup.totpUri)}</span>
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-code`}>{t("twoFactorSetup.confirmStep")}</FieldLabel>
            <InputOTP
              id={`${id}-code`}
              maxLength={CODE_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              pattern="^[0-9]+$"
              autoComplete="one-time-code"
            >
              <InputOTPGroup className="numbers">
                {Array.from({ length: CODE_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-11 text-number-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>
          <AuthFailureAlert failure={failure} />
          <Button type="submit" disabled={busy || code.length !== CODE_LENGTH}>
            {busy && <Spinner />}
            {busy ? t("twoFactorSetup.confirming") : t("twoFactorSetup.confirm")}
          </Button>
        </form>
      )}

      {step.name === "backup" && (
        <section className="flex flex-col gap-5" aria-labelledby={`${id}-backup`}>
          <h2 id={`${id}-backup`} className="text-section font-semibold">
            {t("twoFactorSetup.backupTitle")}
          </h2>
          <p>{t("twoFactorSetup.backupIntro")}</p>
          <ul className="numbers grid grid-cols-2 gap-2 rounded-lg border bg-surface p-4">
            {step.setup.backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(step.setup.backupCodes.join("\n")).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? t("twoFactorSetup.copied") : t("twoFactorSetup.copyCodes")}
          </Button>
          <Button
            onClick={() => {
              void run(async () => {
                await onDone();
              });
            }}
            disabled={busy}
          >
            {t("twoFactorSetup.done")}
          </Button>
        </section>
      )}
    </div>
  );
}
```

`apps/web/src/account/two-factor-setup-screen.tsx`:
```tsx
"use client";

// /two-factor-setup: the setup, then on to whatever the api still asks, or home.
import { Delayed } from "@/components/delayed";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueAfterStep, useCurrentPerson } from "./current-person";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupScreen() {
  const me = useCurrentPerson();
  const continueAfterStep = useContinueAfterStep();
  if (!me.data) {
    return (
      <Delayed>
        <Skeleton className="h-64 w-full" />
      </Delayed>
    );
  }
  return <TwoFactorSetup pending={me.data.pendingStep === "SET_UP_TWO_FACTOR"} onDone={continueAfterStep} />;
}
```

`apps/web/src/account/turn-off-two-factor.tsx`:
```tsx
"use client";

// Turning two-factor sign-in off, which Better Auth allows only with the password. Not offered while the
// organization requires two-factor (the api would then send the person straight back to set it up).
import { useTranslations } from "next-intl";
import { useId, useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";

export function TurnOffTwoFactor({
  onTurnedOff,
  auth = authClient,
}: {
  onTurnedOff: () => Promise<void> | void;
  auth?: Pick<AuthClient, "turnOffTwoFactor">;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await auth.turnOffTwoFactor({ password });
    setBusy(false);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setOpen(false);
    toast.success(t("account.turnedOff"));
    await onTurnedOff();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setPassword("");
        setFailure(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">{t("account.turnOff")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("account.turnOffTitle")}</DialogTitle>
            <DialogDescription>{t("account.turnOffIntro")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>{t("fields.password")}</FieldLabel>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          <AuthFailureAlert failure={failure} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tCommon("cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={busy || password === ""}>
              {busy && <Spinner />}
              {busy ? t("account.turningOff") : t("account.turnOff")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: The account page**

It reads only me.get, which never holds a placeholder email (the contracts' `shownEmailAddress` refuses one), so staff
without email see their username and no email row. Turning two-factor off isn't offered while the organization
requires it.

`apps/web/src/account/account-screen.tsx`:
```tsx
"use client";

// /account: who the person is (from me.get, so a placeholder email is never shown), and their password and
// two-factor sign-in.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { TurnOffTwoFactor } from "./turn-off-two-factor";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-label text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-3 break-words">{children}</dd>
    </div>
  );
}

export function AccountScreen() {
  const t = useTranslations("account.account");
  const me = useMe();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user, organization, member } = me;

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <dl className="divide-y rounded-lg border">
        <Row label={t("name")}>{user.name}</Row>
        {user.email !== null && <Row label={t("email")}>{user.email}</Row>}
        {user.username !== null && <Row label={t("username")}>{user.username}</Row>}
        <Row label={t("organization")}>
          {organization.name} <span className="numbers text-muted-foreground">{organization.code}</span>
        </Row>
        <Row label={t("role")}>{member.role.name}</Row>
        <Row label={t("password")}>
          <Button variant="outline" asChild>
            <Link href={routes.changePassword}>{t("changePassword")}</Link>
          </Button>
        </Row>
        <Row label={t("twoFactor")}>
          {user.twoFactorEnabled ? (
            <>
              <StatusBadge tone="good">{t("twoFactorOn")}</StatusBadge>
              {organization.requireTwoFactor ? (
                <span className="text-label text-muted-foreground">{t("twoFactorRequired")}</span>
              ) : (
                <TurnOffTwoFactor
                  onTurnedOff={() => queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() })}
                />
              )}
            </>
          ) : (
            <>
              <StatusBadge tone="neutral">{t("twoFactorOff")}</StatusBadge>
              <Button variant="outline" asChild>
                <Link href={routes.twoFactorSetup}>{t("setUp")}</Link>
              </Button>
            </>
          )}
        </Row>
      </dl>
    </div>
  );
}
```

- [ ] **Step 7: The pages**

`apps/web/src/app/(account)/change-password/page.tsx`:
```tsx
// /change-password: replacing a temporary password at first sign-in, or changing one's own.
import type { Metadata } from "next";
import { ChangePasswordScreen } from "@/account/change-password-screen";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ChangePasswordPage() {
  return <ChangePasswordScreen />;
}
```

`apps/web/src/app/(account)/two-factor-setup/page.tsx`:
```tsx
// /two-factor-setup: turning on two-factor sign-in with an authenticator app.
import type { Metadata } from "next";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";

export const metadata: Metadata = { title: "Set up two-factor sign-in" };

export default function TwoFactorSetupPage() {
  return <TwoFactorSetupScreen />;
}
```

`apps/web/src/app/(app)/account/page.tsx`:
```tsx
// /account: the signed-in person's own details, password and two-factor sign-in.
import type { Metadata } from "next";
import { AccountScreen } from "@/account/account-screen";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return <AccountScreen />;
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account`

Expected: 20 tests pass.

- [ ] **Step 9: The journeys**

`apps/web/test/e2e/support/account-steps.ts`:
```ts
// Steps several account journeys share: signing in with the organization code through the form, and setting up
// two-factor on the setup screen with the key it shows.
import { expect, type Page } from "@playwright/test";
import { totpCode } from "./totp";

export async function signInWithCode(page: Page, code: string, person: { username: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Organization code" }).click();
  await page.getByRole("textbox", { name: "Organization code" }).fill(code);
  await page.getByRole("textbox", { name: "Username" }).fill(person.username);
  await page.getByLabel("Password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Completes the setup screen and returns the secret, as the person's phone would keep it. */
export async function setUpTwoFactor(page: Page, password: string): Promise<string> {
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  // The key for typing by hand: base32, in groups of four.
  const key = await page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).textContent();
  const secret = (key ?? "").replaceAll(" ", "");
  await page.getByLabel("Then type the 6-digit code the app shows.").fill(totpCode(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await page.getByRole("button", { name: "I've saved them" }).click();
  return secret;
}
```

`apps/web/test/e2e/account-steps.spec.ts`:
```ts
// The steps the api can insist on before anything else (spec 6.3, 6.2): a temporary password replaced at the first
// sign-in, and two-factor set up when the organization requires it; and two-factor turned on from one's account.
import { expectAccessible } from "./support/accessibility";
import { setUpTwoFactor, signInWithCode } from "./support/account-steps";
import { expect, signInByEmail, test } from "./support/fixtures";
import { totpCode } from "./support/totp";

test("staff with a temporary password choose their own at the first sign-in", async ({ page, agency, addStaff }) => {
  const meera = await addStaff({
    name: "Meera Iyer",
    username: "meera",
    roleKey: "operations",
    mustChangePassword: true,
  });
  await signInWithCode(page, agency.code, meera);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("Your admin gave you a temporary password.")).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Temporary password").fill(meera.password);
  await page.getByLabel("New password", { exact: true }).fill("meeras-own-password");
  await page.getByLabel("New password again").fill("meeras-own-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Meera Iyer" })).toBeVisible();

  await page.context().clearCookies();
  await signInWithCode(page, agency.code, { username: meera.username, password: "meeras-own-password" });
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Meera Iyer" })).toBeVisible();
});

test("an organization that requires two-factor sends staff to set it up first", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await signInWithCode(page, agency.code, ravi);
  await expect(page).toHaveURL(/\/two-factor-setup$/);
  await expect(page.getByText("Your organization asks everyone")).toBeVisible();
  await expectAccessible(page);
  await setUpTwoFactor(page, ravi.password);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
});

test("an Owner turns two-factor on from their account, then signs in with a code", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText(agency.owner.email)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Set up" }).click();
  const secret = await setUpTwoFactor(page, agency.owner.password);
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password").fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The next 30-second code: the current one was just used to turn two-factor on.
  await page.getByLabel("Code from your authenticator app").fill(totpCode(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec playwright test account-steps`

Expected: 6 passed. The pending two-factor journey turns the organization's requirement on directly in the database
(the settings screen is Track O's), then signs a member in.

- [ ] **Step 10: Check and commit**

Run the track's gate. Expected: green; web unit tests 65, journeys 25 passed and 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a-account
git add "apps/web/src/app/(account)/change-password" "apps/web/src/app/(account)/two-factor-setup" "apps/web/src/app/(app)/account" apps/web/src/account apps/web/src/i18n/messages/en-IN/account.json apps/web/test/account apps/web/test/e2e/account-steps.spec.ts apps/web/test/e2e/support/account-steps.ts
git commit -m "feat(web): replace a temporary password, set up two-factor, and see one's own account"
```

---

### Task A3: Reset a forgotten password from the emailed link

Plan 3's Task I3 makes the api send the reset email (`POST /api/auth/request-password-reset` with `redirectTo` on
the web app; the link opens `/api/auth/reset-password/<token>`, which redirects to `/reset-password?token=…`, or
`?error=INVALID_TOKEN`). This task builds the two screens against that plan text. Until I3 is merged Better Auth
answers the request with 400 `RESET_PASSWORD_DISABLED`, whose message (Task G3's `errors.json`) says it isn't
available yet.

**Files:**
- Create: `apps/web/src/account/forgot-password-form.tsx`
- Create: `apps/web/src/account/reset-password-form.tsx`
- Create: `apps/web/src/account/reset-password-screen.tsx`
- Create: `apps/web/src/app/(account)/forgot-password/page.tsx`
- Create: `apps/web/src/app/(account)/reset-password/page.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/account.json`
- Test: `apps/web/test/account/password-reset.test.tsx`
- Test: `apps/web/test/e2e/account-reset.spec.ts`

**Interfaces:**
- Consumes: Task A1's `TextField`, `AuthFailureAlert`, `useFieldErrorMessages`, test support; groundwork
  `authClient.requestPasswordReset` and `resetPassword`, `routes`; the contracts' `emailAddress`, `newPassword`.
- Produces: `ForgotPasswordForm({ auth? })`, `ResetPasswordForm({ token: string | null, auth? })`,
  `ResetPasswordScreen()`; the routes `/forgot-password` and `/reset-password`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/account/password-reset.test.tsx`:
```tsx
// Resetting a forgotten password by email (spec 6.2): the request always gets the same answer, the link's token
// sets the new password, and an expired or used link says so and offers a new one.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { ResetPasswordForm } from "@/account/reset-password-form";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;

describe("ForgotPasswordForm", () => {
  it("asks for a link that leads back to the reset screen, and answers the same for any address", async () => {
    const requestPasswordReset = answers(ok(null));
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "Asha@Example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "asha@example.in",
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(await screen.findByText(account.forgotPassword.sent)).toBeVisible();
  });

  it("says reset by email isn't available while the api can't send it", async () => {
    const requestPasswordReset = answers(refused(400, "RESET_PASSWORD_DISABLED"));
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    expect(await screen.findByText(errors.auth.RESET_PASSWORD_DISABLED)).toBeVisible();
  });
});

describe("ResetPasswordForm", () => {
  it("sets the new password with the link's token", async () => {
    const resetPassword = answers(ok(null));
    renderScreen(<ResetPasswordForm token="token-1" auth={{ resetPassword }} />);
    await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
    await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
    expect(resetPassword).toHaveBeenCalledWith({ token: "token-1", newPassword: "a-brand-new-password" });
    expect(await screen.findByText(account.resetPassword.done)).toBeVisible();
    expect(screen.getByRole("link", { name: account.resetPassword.signIn })).toHaveAttribute("href", "/sign-in");
  });

  it("offers a new link when this one expired, before or after typing", async () => {
    const { unmount } = renderScreen(<ResetPasswordForm token={null} auth={{ resetPassword: answers(ok(null)) }} />);
    expect(screen.getByText(account.resetPassword.invalidLink)).toBeVisible();
    unmount();
    const resetPassword = answers(refused(400, "INVALID_TOKEN"));
    renderScreen(<ResetPasswordForm token="used" auth={{ resetPassword }} />);
    await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
    await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
    expect(await screen.findByRole("link", { name: account.resetPassword.askAgain })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account/password-reset.test.tsx`

Expected: FAIL. `@/account/forgot-password-form` and `@/account/reset-password-form` can't be resolved.

- [ ] **Step 3: The words**

Replace `apps/web/src/i18n/messages/en-IN/account.json` with:


```json
{
  "fields": {
    "email": "Email",
    "password": "Password",
    "organizationCode": "Organization code",
    "organizationCodeHint": "Your organization's short code, for example SHARMA",
    "username": "Username",
    "code": "Code from your authenticator app",
    "backupCode": "Backup code",
    "required": "Fill this in.",
    "invalidEmail": "Type an email like name@example.com.",
    "tooLong": "This is too long.",
    "currentPassword": "Current password",
    "temporaryPassword": "Temporary password",
    "newPassword": "New password",
    "newPasswordHint": "At least 10 characters",
    "confirmPassword": "New password again",
    "passwordsDiffer": "The two passwords are different."
  },
  "signIn": {
    "title": "Sign in",
    "byEmail": "Email",
    "byCode": "Organization code",
    "submit": "Sign in",
    "submitting": "Signing in",
    "forgotPassword": "Forgot your password?",
    "noEmailHint": "Staff without an email sign in with the organization code. Your admin can reset your password.",
    "waitSeconds": "Too many attempts. Try again in {seconds, plural, one {# second} other {# seconds}}."
  },
  "twoFactor": {
    "title": "Enter your code",
    "intro": "Open your authenticator app and type the 6-digit code it shows for this account.",
    "backupIntro": "Type one of the backup codes you saved when you set up two-factor sign-in. Each works once.",
    "useBackupCode": "Use a backup code instead",
    "useAuthenticator": "Use the authenticator app instead",
    "trustDevice": "Don't ask again on this device for 30 days",
    "submit": "Continue",
    "submitting": "Checking",
    "startAgain": "Start signing in again"
  },
  "changePassword": {
    "title": "Choose a new password",
    "pendingIntro": "Your admin gave you a temporary password. Choose your own to continue.",
    "intro": "Choose a new password. You'll stay signed in here; other devices are signed out.",
    "submit": "Save new password",
    "submitting": "Saving",
    "changed": "Your password is changed."
  },
  "twoFactorSetup": {
    "title": "Set up two-factor sign-in",
    "pendingIntro": "Your organization asks everyone to sign in with a code from an authenticator app as well as a password.",
    "intro": "Sign in with a code from an authenticator app as well as your password.",
    "passwordStep": "Confirm your password to start.",
    "start": "Continue",
    "starting": "Checking",
    "scan": "Scan this code with an authenticator app such as Google Authenticator or Microsoft Authenticator.",
    "qrLabel": "QR code to add this account to an authenticator app",
    "manualKey": "Can't scan it? Type this key instead:",
    "confirmStep": "Then type the 6-digit code the app shows.",
    "confirm": "Turn on",
    "confirming": "Turning on",
    "backupTitle": "Save your backup codes",
    "backupIntro": "If you lose your phone, each of these codes signs you in once. Keep them somewhere safe; they won't be shown again.",
    "copyCodes": "Copy codes",
    "copied": "Codes copied",
    "done": "I've saved them"
  },
  "account": {
    "title": "Your account",
    "name": "Name",
    "email": "Email",
    "username": "Username",
    "organization": "Organization",
    "role": "Role",
    "password": "Password",
    "changePassword": "Change password",
    "twoFactor": "Two-factor sign-in",
    "twoFactorOn": "On",
    "twoFactorOff": "Off",
    "twoFactorRequired": "Your organization requires it, so it stays on.",
    "setUp": "Set up",
    "turnOff": "Turn off",
    "turnOffTitle": "Turn off two-factor sign-in?",
    "turnOffIntro": "You'll sign in with your password only. Confirm your password to turn it off.",
    "turningOff": "Turning off",
    "turnedOff": "Two-factor sign-in is off."
  },
  "forgotPassword": {
    "title": "Reset your password",
    "intro": "Type the email you sign in with. If it has an account, we'll send a link to choose a new password.",
    "submit": "Send the link",
    "submitting": "Sending",
    "sent": "If an account has that email, a link to reset its password is on its way. It works for one hour.",
    "noEmail": "Staff who sign in with the organization code and a username: ask your admin to reset your password.",
    "backToSignIn": "Back to sign in"
  },
  "resetPassword": {
    "title": "Choose a new password",
    "submit": "Save new password",
    "submitting": "Saving",
    "done": "Your password is changed, and you're signed out everywhere. Sign in with the new password.",
    "invalidLink": "This reset link has expired or was used already.",
    "askAgain": "Ask for a new link",
    "signIn": "Sign in"
  }
}
```

- [ ] **Step 4: The two screens**

The request always gets the same answer, so the screen can't tell anyone which addresses have accounts. The reset
screen reads `?token=`; `?error=` (or an `INVALID_TOKEN` refusal on submit) shows the expired-link state.

`apps/web/src/account/forgot-password-form.tsx`:
```tsx
"use client";

// Asking for a password-reset link by email (spec 6.2). The answer is the same whether or not anyone has the
// address, so the screen can't be used to find out who has an account. Staff without email ask their admin.
import { zodResolver } from "@hookform/resolvers/zod";
import { emailAddress } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

const resetRequest = z.strictObject({ email: emailAddress });

export function ForgotPasswordForm({ auth = authClient }: { auth?: Pick<AuthClient, "requestPasswordReset"> }) {
  const t = useTranslations("account.forgotPassword");
  const tFields = useTranslations("account.fields");
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const form = useForm<z.input<typeof resetRequest>, unknown, z.output<typeof resetRequest>>({
    resolver: zodResolver(resetRequest, { error: errorMessages }),
    defaultValues: { email: "" },
  });

  const submit = form.handleSubmit(async ({ email }) => {
    setFailure(null);
    // The link in the email leads back here, to the reset screen, which reads the token Better Auth adds.
    const result = await auth.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}${routes.resetPassword}`,
    });
    if (result.ok) setSent(true);
    else setFailure(result);
  });

  if (sent) {
    return (
      <Alert>
        <AlertDescription>{t("sent")}</AlertDescription>
      </Alert>
    );
  }
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <TextField
        control={form.control}
        name="email"
        label={tFields("email")}
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
      />
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/account/reset-password-form.tsx`:
```tsx
"use client";

// Choosing a new password from the emailed link. Better Auth opened the link, checked it and sent the browser here
// with ?token=, or with ?error=INVALID_TOKEN when it had expired or been used. A reset signs the person out
// everywhere (plan 3, Task I3), so they then sign in with the new password.
import { zodResolver } from "@hookform/resolvers/zod";
import { newPassword } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

export function ResetPasswordForm({
  token,
  auth = authClient,
}: {
  /** The token from the link, or null when Better Auth found the link expired or used. */
  token: string | null;
  auth?: Pick<AuthClient, "resetPassword">;
}) {
  const t = useTranslations("account");
  const [outcome, setOutcome] = useState<"form" | "done" | "invalid">(token === null ? "invalid" : "form");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const schema = useMemo(
    () =>
      z
        .strictObject({ newPassword, confirmPassword: z.string() })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t("fields.passwordsDiffer"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: errorMessages }),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ newPassword: chosen }) => {
    if (token === null) return;
    setFailure(null);
    const result = await auth.resetPassword({ token, newPassword: chosen });
    if (result.ok) setOutcome("done");
    else if (result.code === "INVALID_TOKEN") setOutcome("invalid");
    else setFailure(result);
  });

  if (outcome === "invalid") {
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>{t("resetPassword.invalidLink")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href={routes.forgotPassword}>{t("resetPassword.askAgain")}</Link>
        </Button>
      </div>
    );
  }
  if (outcome === "done") {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertDescription>{t("resetPassword.done")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href={routes.signIn}>{t("resetPassword.signIn")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="newPassword"
          label={t("fields.newPassword")}
          hint={t("fields.newPasswordHint")}
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label={t("fields.confirmPassword")}
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/account/reset-password-screen.tsx`:
```tsx
"use client";

// /reset-password: reads the token (or the error) Better Auth put in the address.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { ResetPasswordForm } from "./reset-password-form";

export function ResetPasswordScreen() {
  const t = useTranslations("account.resetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("error") === null ? searchParams.get("token") : null;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <ResetPasswordForm token={token} />
    </div>
  );
}
```

`apps/web/src/app/(account)/forgot-password/page.tsx`:
```tsx
// /forgot-password: a reset link by email (spec 6.2); staff without email ask their admin instead.
import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { PageTitle } from "@/components/page-title";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const t = useTranslations("account.forgotPassword");
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ForgotPasswordForm />
      <p className="text-label text-muted-foreground">{t("noEmail")}</p>
      <Link href={routes.signIn} className="text-primary underline-offset-4 hover:underline">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
```

`apps/web/src/app/(account)/reset-password/page.tsx`:
```tsx
// /reset-password: where the emailed reset link leads, with ?token= or ?error=INVALID_TOKEN.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordScreen } from "@/account/reset-password-screen";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/account`

Expected: 24 tests pass.

- [ ] **Step 6: The journeys**

`apps/web/test/e2e/account-reset.spec.ts`:
```ts
// Resetting a forgotten password (spec 6.2). The emailed link needs plan 3's Task I3 (the api sending reset email,
// read here from Mailpit); until it is merged these journeys cover the screens and the token check.
import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./support/fixtures";

test("the forgot-password screen explains both ways to get a new password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  await expect(page.getByText("ask your admin to reset your password")).toBeVisible();
  await expectAccessible(page);
});

test("an expired or used link offers a new one", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("This reset link has expired or was used already.")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/reset-password?token=not-a-real-token");
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("New password again").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByRole("link", { name: "Ask for a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-account && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec playwright test account-reset`

Expected: 4 passed. The used-token journey posts a made-up token to `/api/auth/reset-password`, which Better Auth
refuses with `INVALID_TOKEN` whether or not I3 is merged.

Owed once plan 3's Task I3 is merged (it needs the api to send email, read from Mailpit): a journey that asks for a
link, opens it from the email, sets a new password and signs in with it.

- [ ] **Step 7: Check and commit**

Run the track's gate. Expected: green; web unit tests 69, journeys 29 passed and 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a-account
git add "apps/web/src/app/(account)/forgot-password" "apps/web/src/app/(account)/reset-password" apps/web/src/account apps/web/src/i18n/messages/en-IN/account.json apps/web/test/account apps/web/test/e2e/account-reset.spec.ts
git commit -m "feat(web): reset a forgotten password from the emailed link"
```

When the track's last task is committed it is ready to merge (the Integration task).

---

## Track O: Organization screens (staff, roles, settings)

Spec 6.3 (staff with or without email), 6.5 (roles, permissions, own/all scope), 6.2 (the two-factor requirement,
Owner-only to turn off) and 11 (optimistic quick actions, targeted invalidation), on plan 2's existing `staff`,
`roles`, `settings` and `me` routers. No api change.

**Worktree.** Track O starts from the last groundwork commit (Task G4) in its own worktree and branch:

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05a-organization -b foundation/05a-organization foundation/05a-web
cd /Users/ak/personal/travel-crm-05a-organization && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

**Owns (only this track edits them):** `apps/web/src/app/(app)/{staff,roles,settings}/**`,
`apps/web/src/organization/**`, `apps/web/src/i18n/messages/en-IN/{staff,roles,settings}.json` (groundwork left them
`{}`), `apps/web/test/organization/**`, `apps/web/test/e2e/{staff,roles,settings}.spec.ts`, and three new journey
helpers: `apps/web/test/e2e/support/{settled,sign-in-with-code,organization-two-factor}.ts`. Nothing else: every
dependency and shadcn component it uses was added by the groundwork.

**Gate for every task in this track** (all green before its commit; Docker must be running, never restart it):

```bash
cd /Users/ak/personal/travel-crm-05a-organization && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint && pnpm --filter @travel-crm/web test && pnpm --filter @travel-crm/web e2e && pnpm run depcruise
```

---

### Task O1: The staff screen: add staff with or without email, change roles, reset passwords, remove

**Files:**
- Create: `apps/web/src/app/(app)/staff/page.tsx`
- Create: `apps/web/src/organization/responsive-dialog.tsx`, `apps/web/src/organization/copy-button.tsx`
- Create in `apps/web/src/organization/staff/`: `staff-details.ts`, `temporary-password.ts`, `create-staff-values.ts`,
  `use-staff.ts`, `create-staff-form.tsx`, `handover.tsx`, `create-staff-dialog.tsx`, `change-role-dialog.tsx`,
  `reset-password-dialog.tsx`, `remove-staff-dialog.tsx`, `staff-actions.tsx`, `staff-list.tsx`, `staff-screen.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/staff.json` (from `{}`)
- Test: `apps/web/test/organization/{render.tsx,staff-details.test.ts,temporary-password.test.ts,create-staff-values.test.ts,staff-list.test.tsx}`,
  `apps/web/test/e2e/staff.spec.ts`, `apps/web/test/e2e/support/{settled,sign-in-with-code}.ts`

**Interfaces:**
- Consumes (groundwork): `useMe()`, `SignedInMember`, `MeProvider` (`@/session/me-context`); `RequirePermission`
  (`@/session/require-permission`); `useTRPC()` (`@/data/trpc`); `useErrorMessage().apiError(error): string`
  (`@/lib/error-message`); `formatDay(instant, { timeZone })` (`@/lib/format`); `PageTitle`, `EmptyState`,
  `ErrorState`, `Delayed`, `StatusBadge`; the shadcn components in `@/components/ui`; `member()` from
  `test/support/members.ts`; the journeys' `test`, `expect`, `signInByEmail`, and the `agency` and `addStaff` fixtures
  (`test/e2e/support/fixtures.ts`); `expectAccessible(page)`. The shell prefetches `trpc.staff.list.queryOptions()`,
  so the screen asks for exactly those options.
- Produces (Tasks O2 and O3 use them):
  - `ResponsiveDialog({ open, onOpenChange, title, description, children })` and `useWideScreen(): boolean`
    (`@/organization/responsive-dialog`): a dialog from 768px up, a bottom sheet below.
  - `CopyButton({ value, label })` (`@/organization/copy-button`).
  - `renderAs(ui, me?)` and `screenIs("phone" | "wide")` (`test/organization/render.tsx`).
  - `animationsSettled(page)` (`test/e2e/support/settled.ts`): waits for opening animations before an axe check.
  - `signInWithCode(request, { orgCode, username, password })` (`test/e2e/support/sign-in-with-code.ts`).

- [ ] **Step 1: Write the failing unit tests**

`apps/web/test/organization/render.tsx`:
```tsx
// Renders an organization screen's parts as a signed-in member sees them: with the app's messages, the member, and a
// phone-sized or wide screen.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";

/** jsdom has no matchMedia: answer every query as a screen of the given width would. */
export function screenIs(width: "phone" | "wide"): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: width === "wide", addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

export function renderAs(ui: ReactNode, me: SignedInMember = member({ isOwner: true })) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <MeProvider me={me}>{ui}</MeProvider>
    </NextIntlClientProvider>,
  );
}
```

`apps/web/test/organization/staff-details.test.ts`:
```ts
// Staff are shown by what they sign in with, and never by the placeholder address staff without email carry.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { signInName, withRole } from "@/organization/staff/staff-details";

const ravi: StaffMember = {
  memberId: "0199a000-0000-7000-8000-00000000000a",
  userId: "0199a000-0000-7000-8000-00000000000b",
  name: "Ravi Kumar",
  email: null,
  username: "ravi",
  role: { key: "sales", name: "Sales" },
  twoFactorEnabled: false,
  mustChangePassword: true,
  joinedAt: "2026-10-15T06:00:00.000Z",
};

describe("signInName", () => {
  it("is the email when there is one, else the username", () => {
    expect(signInName({ email: "ravi@sharma.in", username: "ravi" })).toBe("ravi@sharma.in");
    expect(signInName({ email: null, username: "ravi" })).toBe("ravi");
  });

  it("never shows a placeholder address, even if one reached the app", () => {
    expect(signInName({ email: "sharma-ravi@no-email.invalid", username: "ravi" })).toBe("ravi");
    expect(signInName({ email: "X@NO-EMAIL.INVALID", username: null })).toBe("");
  });
});

describe("withRole", () => {
  it("changes one person's role and leaves the rest as they were", () => {
    const meera = { ...ravi, memberId: "0199a000-0000-7000-8000-00000000000c", name: "Meera" };
    const changed = withRole([ravi, meera], ravi.memberId, { key: "operations", name: "Operations" });
    expect(changed[0]?.role).toEqual({ key: "operations", name: "Operations" });
    expect(changed[1]).toBe(meera);
    expect(ravi.role.key).toBe("sales");
  });
});
```

`apps/web/test/organization/temporary-password.test.ts`:
```ts
// Temporary passwords are long enough for the api, easy to read aloud, and different every time.
import { newPassword } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { temporaryPassword } from "@/organization/staff/temporary-password";

describe("temporaryPassword", () => {
  it("is 12 characters with no look-alikes (0 O 1 l I), and the api accepts it", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const password = temporaryPassword();
      expect(password).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{12}$/);
      expect(newPassword.safeParse(password).success).toBe(true);
    }
  });

  it("differs every time", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => temporaryPassword()));
    expect(passwords.size).toBe(20);
  });
});
```

`apps/web/test/organization/create-staff-values.test.ts`:
```ts
// The add-staff form keeps plain text; the api's own schema decides what's valid, and each problem is shown on the
// field it belongs to.
import { describe, expect, it } from "vitest";
import { toCreateStaffInput, type CreateStaffValues } from "@/organization/staff/create-staff-values";

const values: CreateStaffValues = {
  name: "Ravi Kumar",
  email: "",
  username: "ravi",
  roleKey: "sales",
  temporaryPassword: "temporary-1",
};

describe("toCreateStaffInput", () => {
  it("leaves blank fields out, so staff without email are allowed", () => {
    expect(toCreateStaffInput(values)).toEqual({
      ok: true,
      input: { name: "Ravi Kumar", username: "ravi", roleKey: "sales", temporaryPassword: "temporary-1" },
    });
    expect(toCreateStaffInput({ ...values, email: " Ravi@Sharma.in ", username: "  " })).toEqual({
      ok: true,
      input: { name: "Ravi Kumar", email: "ravi@sharma.in", roleKey: "sales", temporaryPassword: "temporary-1" },
    });
  });

  it("asks for an email or a username when both are blank", () => {
    expect(toCreateStaffInput({ ...values, username: "" })).toEqual({
      ok: false,
      problems: { username: "emailOrUsername" },
    });
  });

  it("puts each problem on its field", () => {
    expect(
      toCreateStaffInput({ name: " ", email: "not-an-email", username: "r", roleKey: "", temporaryPassword: "short" }),
    ).toEqual({
      ok: false,
      problems: {
        name: "nameRequired",
        email: "emailInvalid",
        username: "usernameInvalid",
        roleKey: "roleRequired",
        temporaryPassword: "passwordTooShort",
      },
    });
  });

  it("refuses a placeholder address like any address that isn't real", () => {
    expect(toCreateStaffInput({ ...values, email: "someone@no-email.invalid" })).toEqual({
      ok: false,
      problems: { email: "emailInvalid" },
    });
  });
});
```

`apps/web/test/organization/staff-list.test.tsx`:
```tsx
// The staff list shows each person by name, how they sign in, their role and when they joined (in the
// organization's zone), flags a temporary password still to change, and offers no actions on the viewer's own row.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffList } from "@/organization/staff/staff-list";
import { member } from "../support/members";
import { renderAs, screenIs } from "./render";

const owner = member({ isOwner: true });

const staff: StaffMember[] = [
  {
    memberId: owner.member.memberId,
    userId: owner.user.id,
    name: "Asha",
    email: "asha@sharma.in",
    username: null,
    role: { key: "org-owner", name: "Owner" },
    twoFactorEnabled: true,
    mustChangePassword: false,
    joinedAt: "2026-01-02T05:00:00.000Z",
  },
  {
    memberId: "0199a000-0000-7000-8000-00000000000a",
    userId: "0199a000-0000-7000-8000-00000000000b",
    name: "रवि कुमार",
    email: null,
    username: "ravi",
    role: { key: "sales", name: "Sales" },
    twoFactorEnabled: false,
    mustChangePassword: true,
    // 18:45 UTC on 15 October is already 16 October in India.
    joinedAt: "2026-10-15T18:45:00.000Z",
  },
];

const roles: RoleSummary[] = [
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 },
];

describe("StaffList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a table on wide screens, with dates in the organization's zone", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const ravi = screen.getByRole("row", { name: /रवि कुमार/ });
    expect(within(ravi).getByText("ravi")).toBeVisible();
    expect(within(ravi).getByText("Sales")).toBeVisible();
    expect(within(ravi).getByText("Must change password")).toBeVisible();
    expect(within(ravi).getByText(/^16 Oct/)).toBeVisible();
    expect(within(ravi).getByRole("button", { name: "Actions for रवि कुमार" })).toBeVisible();
  });

  it("offers no actions on the viewer's own row", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const asha = screen.getByRole("row", { name: /Asha/ });
    expect(within(asha).getByText("You")).toBeVisible();
    expect(within(asha).queryByRole("button")).toBeNull();
  });

  it("is a divided list on phones", () => {
    screenIs("phone");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Sales · ravi · Joined 16 Oct/)).toBeVisible();
  });

  it("never shows a placeholder address", () => {
    screenIs("wide");
    const leaked = staff.map((person) =>
      person.username === "ravi" ? { ...person, email: "s-ravi@no-email.invalid" } : person,
    );
    const { container } = renderAs(<StaffList staff={leaked} roles={roles} />, owner);
    expect(container.textContent).not.toMatch(/\.invalid/i);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization`

Expected: FAIL, four files: `Failed to resolve import "@/organization/staff/staff-details"` (and
`temporary-password`, `create-staff-values`, `staff-list`).

- [ ] **Step 3: Write the rules: how staff are shown, temporary passwords, the form's values**

`staff-details.ts` shows a person by what they sign in with and never by a placeholder address, even though the api
never sends one. `create-staff-values.ts` keeps the form's text and lets the api's own `createStaffInput` decide
what is valid: a blank email or username is left out (staff without email are allowed), and every problem is named
for its field. That is why the form uses this resolver rather than `zodResolver(createStaffInput)`, which would
refuse a blank optional email.

`apps/web/src/organization/staff/staff-details.ts`:
```ts
// How a staff member is shown: by what they sign in with, never by the placeholder address that staff without email
// carry (ADR 0006). The api never sends one; it is checked here too, because showing one would leak it.
import type { StaffMember } from "@travel-crm/contracts/identity";

const isPlaceholder = (email: string) => email.toLowerCase().endsWith(".invalid");

/** The email when there is a real one, else the username, else nothing. */
export function signInName(member: Pick<StaffMember, "email" | "username">): string {
  if (member.email !== null && !isPlaceholder(member.email)) return member.email;
  return member.username ?? "";
}

/** The staff list with one person's role replaced: what the screen shows while the change is on its way. */
export function withRole(staff: StaffMember[], memberId: string, role: StaffMember["role"]): StaffMember[] {
  return staff.map((member) => (member.memberId === memberId ? { ...member, role } : member));
}
```

`apps/web/src/organization/staff/temporary-password.ts`:
```ts
// Temporary passwords for new staff and resets: 12 characters an admin can read out over the phone, so no 0/O, 1/l/I.
// They only have to last until the person signs in and chooses their own.
const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random bytes past this would favour the first letters of the alphabet, so they are drawn again. */
const fairLimit = 256 - (256 % alphabet.length);

export function temporaryPassword(length = 12): string {
  let password = "";
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < fairLimit && password.length < length) password += alphabet.charAt(byte % alphabet.length);
    }
  }
  return password;
}
```

`apps/web/src/organization/staff/create-staff-values.ts`:
```ts
// The add-staff form's values, as text, turned into the api's input. The api's own schema (createStaffInput) decides
// what is valid; each problem is named so the form can show its message on the field it belongs to.
import { createStaffInput, type CreateStaffInput } from "@travel-crm/contracts/identity";

export interface CreateStaffValues {
  name: string;
  email: string;
  username: string;
  roleKey: string;
  temporaryPassword: string;
}

export type CreateStaffField = keyof CreateStaffValues;

/** Message keys in the "staff.form" namespace. */
export type CreateStaffProblem =
  "nameRequired" | "emailInvalid" | "usernameInvalid" | "emailOrUsername" | "roleRequired" | "passwordTooShort";

const problemOf: Record<CreateStaffField, CreateStaffProblem> = {
  name: "nameRequired",
  email: "emailInvalid",
  username: "usernameInvalid",
  roleKey: "roleRequired",
  temporaryPassword: "passwordTooShort",
};

const isField = (value: unknown): value is CreateStaffField =>
  typeof value === "string" && Object.hasOwn(problemOf, value);

export function toCreateStaffInput(
  values: CreateStaffValues,
):
  | { ok: true; input: CreateStaffInput }
  | { ok: false; problems: Partial<Record<CreateStaffField, CreateStaffProblem>> } {
  const email = values.email.trim();
  const username = values.username.trim();
  const parsed = createStaffInput.safeParse({
    name: values.name,
    roleKey: values.roleKey,
    temporaryPassword: values.temporaryPassword,
    // A blank field is one the admin left out: staff may have an email, a username or both.
    ...(email === "" ? {} : { email }),
    ...(username === "" ? {} : { username }),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<CreateStaffField, CreateStaffProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isField(field) || problems[field] !== undefined) continue;
    // The schema's one cross-field rule (an email or a username) is a custom issue on the username.
    problems[field] = issue.code === "custom" && field === "username" ? "emailOrUsername" : problemOf[field];
  }
  return { ok: false, problems };
}
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization`

Expected: `staff-details`, `temporary-password` and `create-staff-values` pass (9 tests); `staff-list.test.tsx`
still fails to resolve `@/organization/staff/staff-list`.

- [ ] **Step 4: Write the words, the shared dialog and copy button, the calls and the screen**

`apps/web/src/i18n/messages/en-IN/staff.json`:
```json
{
  "title": "Staff",
  "intro": "Everyone who signs in to your organization, and the role that decides what each of them may do.",
  "add": "Add staff",
  "loadFailed": "The staff list didn't load.",
  "empty": "Nobody else is here yet. Add the people who work with you.",
  "you": "You",
  "columns": {
    "name": "Name",
    "signIn": "Signs in with",
    "role": "Role",
    "twoFactor": "Two-factor",
    "joined": "Joined",
    "actions": "Actions"
  },
  "twoFactorOn": "On",
  "twoFactorOff": "Off",
  "mustChangePassword": "Must change password",
  "joinedOn": "Joined {date}",
  "actionsFor": "Actions for {name}",
  "create": {
    "title": "Add staff",
    "description": "Give them an email, a username or both. Staff without email sign in with your organization code and their username.",
    "name": "Full name",
    "email": "Email",
    "emailHint": "Optional. They can sign in with it and reset their own password.",
    "username": "Username",
    "usernameHint": "Optional. 2-32 letters, digits, dots, dashes or underscores.",
    "role": "Role",
    "temporaryPassword": "Temporary password",
    "temporaryPasswordHint": "They choose their own password the first time they sign in.",
    "newPassword": "Make another",
    "submit": "Add",
    "submitting": "Adding",
    "added": "{name} was added",
    "handover": "Give {name} these details to sign in:",
    "organizationCode": "Organization code",
    "copy": "Copy",
    "copied": "Copied",
    "done": "Done"
  },
  "form": {
    "nameRequired": "Give their full name.",
    "emailInvalid": "Use a real email address.",
    "usernameInvalid": "Use 2-32 letters, digits, dots, dashes or underscores.",
    "emailOrUsername": "Give an email, a username or both.",
    "roleRequired": "Choose a role.",
    "passwordTooShort": "Use at least 10 characters."
  },
  "changeRole": {
    "action": "Change role",
    "title": "Change {name}'s role",
    "description": "The new role applies from their next action.",
    "submit": "Change role",
    "changed": "{name} is now {role}"
  },
  "resetPassword": {
    "action": "Reset password",
    "title": "Reset {name}'s password",
    "description": "They are signed out everywhere and must choose a new password with this temporary one.",
    "submit": "Reset password",
    "submitting": "Resetting",
    "done": "Give {name} this temporary password:"
  },
  "remove": {
    "action": "Remove",
    "title": "Remove {name}?",
    "description": "They are signed out at once and can't sign in again. What they did stays in your records.",
    "confirm": "Remove",
    "removed": "{name} was removed"
  }
}
```

`apps/web/src/organization/responsive-dialog.tsx`:
```tsx
"use client";

// A form or confirmation over the page: a dialog on wider screens, a bottom sheet on phones (DESIGN.md: on mobile,
// prefer bottom sheets for forms and pickers). Both trap focus, close on Escape and give focus back afterwards.
import { useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const wide = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(wide);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Whether the screen is tablet-wide or more. Phones first: false until the browser says otherwise. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(wide).matches,
    () => false,
  );
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (useWideScreen()) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

`apps/web/src/organization/copy-button.tsx`:
```tsx
"use client";

// Copies a value an admin hands over (a temporary password, the organization code) and says so.
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("staff.create");
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => toast.success(t("copied")));
      }}
    >
      <CopyIcon aria-hidden="true" />
      {t("copy")}
    </Button>
  );
}
```

The role change is the screen's quick action: the list shows the new role at once, and puts the old one back if the
api refuses. Every change then refreshes exactly the staff list and the roles list (whose member counts move).

`apps/web/src/organization/staff/use-staff.ts`:
```ts
"use client";

// The staff screen's calls. Each change refreshes exactly what it affects: the staff list, and the roles list whose
// member counts move with it. A role change is a quick action: the list shows the new role at once and goes back if
// the api refuses (spec 11: optimistic updates for quick actions).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { withRole } from "./staff-details";

function useRefreshStaff() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.staff.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.roles.list.queryKey() }),
    ]);
  };
}

export function useCreateStaff() {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  return useMutation(trpc.staff.create.mutationOptions({ onSettled: refresh }));
}

export function useResetStaffPassword() {
  const trpc = useTRPC();
  return useMutation(trpc.staff.resetPassword.mutationOptions());
}

export function useRemoveStaff() {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  return useMutation(trpc.staff.remove.mutationOptions({ onSettled: refresh }));
}

export function useChangeStaffRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshStaff();
  const { apiError } = useErrorMessage();
  const t = useTranslations("staff.changeRole");
  const staffKey = trpc.staff.list.queryKey();
  return useMutation(
    trpc.staff.updateRole.mutationOptions({
      onMutate: async ({ memberId, roleKey }) => {
        // Stop a refresh in flight from overwriting the new role with the old one.
        await queryClient.cancelQueries({ queryKey: staffKey });
        const before = queryClient.getQueryData<StaffMember[]>(staffKey);
        const role = queryClient.getQueryData(trpc.roles.list.queryKey())?.find((entry) => entry.key === roleKey);
        if (before && role) {
          queryClient.setQueryData(staffKey, withRole(before, memberId, { key: role.key, name: role.name }));
        }
        return { before };
      },
      onSuccess: (member) => {
        toast.success(t("changed", { name: member.name, role: member.role.name }));
      },
      onError: (error, _variables, onMutateResult) => {
        if (onMutateResult?.before) queryClient.setQueryData(staffKey, onMutateResult.before);
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: refresh,
    }),
  );
}
```

`apps/web/src/organization/staff/create-staff-form.tsx`:
```tsx
"use client";

// The add-staff form: name, an email or a username (or both), a role and a temporary password, checked by the api's
// own schema before it is sent. Problems show under their fields; a refusal from the api shows above the buttons.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { Controller, useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrorMessage } from "@/lib/error-message";
import { toCreateStaffInput, type CreateStaffValues } from "./create-staff-values";
import { temporaryPassword } from "./temporary-password";
import { useCreateStaff } from "./use-staff";

/** The roles new staff may be given: every role but Owner, which only an Owner hands over later. */
export function assignableRoles(roles: RoleSummary[]): RoleSummary[] {
  return roles.filter((role) => !role.isOwner);
}

export function CreateStaffForm({
  roles,
  onCreated,
}: {
  roles: RoleSummary[];
  onCreated: (member: StaffMember, password: string) => void;
}) {
  const t = useTranslations("staff");
  const { apiError } = useErrorMessage();
  const create = useCreateStaff();
  const resolver: Resolver<CreateStaffValues> = (values) => {
    const result = toCreateStaffInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<CreateStaffValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as keyof CreateStaffValues] = { type: "validate", message: t(`form.${problem}`) };
    }
    return { values: {}, errors };
  };
  const form = useForm<CreateStaffValues>({
    resolver,
    defaultValues: {
      name: "",
      email: "",
      username: "",
      roleKey: assignableRoles(roles).find((role) => role.key === "sales")?.key ?? "",
      temporaryPassword: temporaryPassword(),
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    const result = toCreateStaffInput(values);
    if (!result.ok) return;
    create.mutate(result.input, {
      onSuccess: (member) => {
        onCreated(member, values.temporaryPassword);
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.name !== undefined}>
          <FieldLabel htmlFor="staff-name">{t("create.name")}</FieldLabel>
          <Input
            id="staff-name"
            autoComplete="off"
            aria-invalid={errors.name !== undefined}
            {...form.register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={errors.email !== undefined}>
          <FieldLabel htmlFor="staff-email">{t("create.email")}</FieldLabel>
          <Input
            id="staff-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-invalid={errors.email !== undefined}
            {...form.register("email")}
          />
          <FieldDescription>{t("create.emailHint")}</FieldDescription>
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={errors.username !== undefined}>
          <FieldLabel htmlFor="staff-username">{t("create.username")}</FieldLabel>
          <Input
            id="staff-username"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.username !== undefined}
            {...form.register("username")}
          />
          <FieldDescription>{t("create.usernameHint")}</FieldDescription>
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={errors.roleKey !== undefined}>
          <FieldLabel htmlFor="staff-role">{t("create.role")}</FieldLabel>
          <Controller
            control={form.control}
            name="roleKey"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="staff-role" className="h-11 w-full" aria-invalid={errors.roleKey !== undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles(roles).map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.roleKey]} />
        </Field>
        <Field data-invalid={errors.temporaryPassword !== undefined}>
          <FieldLabel htmlFor="staff-password">{t("create.temporaryPassword")}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="staff-password"
              className="numbers"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.temporaryPassword !== undefined}
              {...form.register("temporaryPassword")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.setValue("temporaryPassword", temporaryPassword());
              }}
            >
              {t("create.newPassword")}
            </Button>
          </div>
          <FieldDescription>{t("create.temporaryPasswordHint")}</FieldDescription>
          <FieldError errors={[errors.temporaryPassword]} />
        </Field>
      </FieldGroup>
      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(create.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={create.isPending} className="self-end">
        {create.isPending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
```

`apps/web/src/organization/staff/handover.tsx`:
```tsx
"use client";

// What an admin gives a new or reset person so they can sign in: the organization code and username (or email), and
// the temporary password, each with a copy button. Shown once; nobody can read the password again later.
import { useTranslations } from "next-intl";
import { CopyButton } from "../copy-button";

export function Handover({
  name,
  organizationCode,
  signInName,
  password,
}: {
  name: string;
  organizationCode: string | null;
  signInName: string | null;
  password: string;
}) {
  const t = useTranslations("staff");
  const rows = [
    ...(organizationCode === null ? [] : [{ label: t("create.organizationCode"), value: organizationCode }]),
    ...(signInName === null ? [] : [{ label: t("columns.signIn"), value: signInName }]),
    { label: t("create.temporaryPassword"), value: password },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>{t("create.handover", { name })}</p>
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-40 text-label text-muted-foreground">{row.label}</dt>
            <dd className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span className="numbers break-all">{row.value}</span>
              <CopyButton value={row.value} label={`${t("create.copy")} ${row.label}`} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

`apps/web/src/organization/staff/create-staff-dialog.tsx`:
```tsx
"use client";

// "Add staff": the form, then the details to hand over once the person exists.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/session/me-context";
import { ResponsiveDialog } from "../responsive-dialog";
import { CreateStaffForm } from "./create-staff-form";
import { Handover } from "./handover";

export function CreateStaffDialog({ roles }: { roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ member: StaffMember; password: string } | null>(null);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setCreated(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          changeOpen(true);
        }}
      >
        <UserPlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        title={created ? t("create.added", { name: created.member.name }) : t("create.title")}
        description={created ? t("create.temporaryPasswordHint") : t("create.description")}
      >
        {created ? (
          <div className="flex flex-col gap-6">
            <Handover
              name={created.member.name}
              organizationCode={created.member.username === null ? null : me.organization.code}
              signInName={created.member.username ?? created.member.email}
              password={created.password}
            />
            <Button
              className="self-end"
              onClick={() => {
                changeOpen(false);
              }}
            >
              {t("create.done")}
            </Button>
          </div>
        ) : (
          <CreateStaffForm
            roles={roles}
            onCreated={(member, password) => {
              setCreated({ member, password });
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
```

`apps/web/src/organization/staff/change-role-dialog.tsx`:
```tsx
"use client";

// Changing someone's role: pick it and the list shows it at once; the api's answer confirms it or puts it back.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "../responsive-dialog";
import { useChangeStaffRole } from "./use-staff";

export function ChangeRoleDialog({
  member,
  roles,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  roles: RoleSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff");
  const [roleKey, setRoleKey] = useState(member.role.key);
  const changeRole = useChangeStaffRole();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("changeRole.title", { name: member.name })}
      description={t("changeRole.description")}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (roleKey !== member.role.key) changeRole.mutate({ memberId: member.memberId, roleKey });
          onOpenChange(false);
        }}
      >
        <Field>
          <FieldLabel htmlFor={`role-${member.memberId}`}>{t("columns.role")}</FieldLabel>
          <Select value={roleKey} onValueChange={setRoleKey}>
            <SelectTrigger id={`role-${member.memberId}`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.key} value={role.key}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" className="self-end">
          {t("changeRole.submit")}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}
```

`apps/web/src/organization/staff/reset-password-dialog.tsx`:
```tsx
"use client";

// Resetting someone's password: a new temporary one, which signs them out everywhere and which they replace at sign-in.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { useMe } from "@/session/me-context";
import { ResponsiveDialog } from "../responsive-dialog";
import { Handover } from "./handover";
import { temporaryPassword } from "./temporary-password";
import { useResetStaffPassword } from "./use-staff";

export function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff");
  const me = useMe();
  const { apiError } = useErrorMessage();
  const [password, setPassword] = useState(temporaryPassword);
  const reset = useResetStaffPassword();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("resetPassword.title", { name: member.name })}
      description={t("resetPassword.description")}
    >
      {reset.isSuccess ? (
        <div className="flex flex-col gap-6">
          <Handover
            name={member.name}
            organizationCode={member.username === null ? null : me.organization.code}
            signInName={member.username ?? member.email}
            password={password}
          />
          <Button
            className="self-end"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("create.done")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            reset.mutate({ memberId: member.memberId, temporaryPassword: password });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`reset-${member.memberId}`}>{t("create.temporaryPassword")}</FieldLabel>
            <Input
              id={`reset-${member.memberId}`}
              className="numbers"
              value={password}
              minLength={10}
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          {reset.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(reset.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={reset.isPending || password.length < 10} className="self-end">
            {reset.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
```

The remove dialog stays open until the api answers: closing it at once would unmount it, and TanStack Query drops
the callbacks passed to `mutate()` when their component unmounts, so the confirmation would never show.

`apps/web/src/organization/staff/remove-staff-dialog.tsx`:
```tsx
"use client";

// Removing someone (ADR 0007): asked once more, because they are signed out at once and can't come back.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useErrorMessage } from "@/lib/error-message";
import { useRemoveStaff } from "./use-staff";

export function RemoveStaffDialog({
  member,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff.remove");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const remove = useRemoveStaff();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: member.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={remove.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so the answer is shown here and the button can't be pressed twice.
              event.preventDefault();
              remove.mutate(
                { memberId: member.memberId },
                {
                  onSuccess: () => {
                    toast.success(t("removed", { name: member.name }));
                    onOpenChange(false);
                  },
                  onError: (error) => toast.error(apiError(error), { duration: Infinity }),
                },
              );
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`apps/web/src/organization/staff/staff-actions.tsx`:
```tsx
"use client";

// The actions on one person: change their role, reset their password, remove them. Nobody acts on themselves here
// (the api refuses it), so their own row has none.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangeRoleDialog } from "./change-role-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

type OpenDialog = "role" | "password" | "remove" | null;

export function StaffActions({ member, roles }: { member: StaffMember; roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const [open, setOpen] = useState<OpenDialog>(null);
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name: member.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setOpen("role");
            }}
          >
            {t("changeRole.action")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setOpen("password");
            }}
          >
            {t("resetPassword.action")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              setOpen("remove");
            }}
          >
            {t("remove.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "role" && <ChangeRoleDialog member={member} roles={roles} open onOpenChange={closeWhen("role")} />}
      {open === "password" && <ResetPasswordDialog member={member} open onOpenChange={closeWhen("password")} />}
      {open === "remove" && <RemoveStaffDialog member={member} open onOpenChange={closeWhen("remove")} />}
    </>
  );
}
```

`apps/web/src/organization/staff/staff-list.tsx`:
```tsx
"use client";

// The staff list (DESIGN.md section 6): a table on tablets and wider, a divided list on phones with the name and
// status on the first line and the details on the second. Names wrap rather than being cut off.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWideScreen } from "../responsive-dialog";
import { StaffActions } from "./staff-actions";
import { signInName } from "./staff-details";

export function StaffList({ staff, roles }: { staff: StaffMember[]; roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const me = useMe();
  const wide = useWideScreen();
  const joined = (member: StaffMember) => formatDay(new Date(member.joinedAt), { timeZone: me.organization.timeZone });
  const isMe = (member: StaffMember) => member.memberId === me.member.memberId;
  const status = (member: StaffMember) =>
    member.mustChangePassword ? <StatusBadge tone="attention">{t("mustChangePassword")}</StatusBadge> : null;
  const actions = (member: StaffMember) =>
    isMe(member) ? (
      <span className="text-label text-muted-foreground">{t("you")}</span>
    ) : (
      <StaffActions member={member} roles={roles} />
    );

  if (!wide) {
    return (
      <ul className="divide-y rounded-lg border">
        {staff.map((member) => (
          <li key={member.memberId} className="flex items-start gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words">{member.name}</span>
                {status(member)}
              </div>
              <p className="text-label text-muted-foreground break-words">
                {member.role.name} · {signInName(member)} · {t("joinedOn", { date: joined(member) })}
              </p>
            </div>
            {actions(member)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.name")}</TableHead>
          <TableHead scope="col">{t("columns.signIn")}</TableHead>
          <TableHead scope="col">{t("columns.role")}</TableHead>
          <TableHead scope="col">{t("columns.twoFactor")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.joined")}
          </TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((member) => (
          <TableRow key={member.memberId}>
            <TableCell className="whitespace-normal">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{member.name}</span>
                {status(member)}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal break-all">{signInName(member)}</TableCell>
            <TableCell>{member.role.name}</TableCell>
            <TableCell>{member.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}</TableCell>
            <TableCell className="numbers text-right">{joined(member)}</TableCell>
            <TableCell className="text-right">{actions(member)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

After a reload the screen shows the copy restored from IndexedDB at once, and the data layer asks again in the
background (Task G3 refreshes every query after a restore), so someone just removed never stays listed.

`apps/web/src/organization/staff/staff-screen.tsx`:
```tsx
"use client";

// The staff screen (spec 6.3): who signs in to the organization and with which role, and adding, changing and
// removing them. It asks for the same staff list the navigation prefetches, so it usually opens with it.
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { CreateStaffDialog } from "./create-staff-dialog";
import { StaffList } from "./staff-list";

export function StaffScreen() {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB after a reload can predate a change
  // made a moment earlier, such as someone just removed.
  const staff = useQuery(trpc.staff.list.queryOptions());
  const roles = useQuery(trpc.roles.list.queryOptions());

  const body = () => {
    if (staff.data && roles.data) {
      // The person looking is always on the list: with nobody else on it, the screen says what belongs here.
      return (
        <>
          <StaffList staff={staff.data} roles={roles.data} />
          {staff.data.length <= 1 && <EmptyState icon={UsersIcon} message={t("empty")} />}
        </>
      );
    }
    if (staff.isError || roles.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            void staff.refetch();
            void roles.refetch();
          }}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {roles.data && <CreateStaffDialog roles={roles.data} />}
      </div>
      {body()}
    </div>
  );
}
```

`apps/web/src/app/(app)/staff/page.tsx`:
```tsx
// /staff: the organization's staff, for members whose role may manage them.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffScreen } from "@/organization/staff/staff-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

export default function StaffPage() {
  return (
    <RequirePermission permission="staff:manage">
      <StaffScreen />
    </RequirePermission>
  );
}
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization`

Expected: PASS, 13 tests in 4 files.

- [ ] **Step 5: Write the journeys**

Two helpers. `animationsSettled` waits for a dialog's or sheet's opening animation before an axe check: halfway
through its fade, text is half-transparent and fails the contrast rule. `signInWithCode` signs staff in through the
api, as Track A's sign-in screen will.

`apps/web/test/e2e/support/settled.ts`:
```ts
// Waits for a page's opening animations (a dialog fading in, a sheet sliding up) to end, so checks such as colour
// contrast see the screen as a person does, not half-transparent. Endless animations (skeleton pulses) are ignored,
// and so are animations cancelled on the way (a menu closing as the dialog it opened appears).
import type { Page } from "@playwright/test";

export async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}
```

`apps/web/test/e2e/support/sign-in-with-code.ts`:
```ts
// Signs staff in with the organization code through the api, as the sign-in screen does, so organization journeys
// can act as them without depending on that screen.
import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";

export async function signInWithCode(
  request: APIRequestContext,
  credentials: { orgCode: string; username: string; password: string },
): Promise<void> {
  const response = await request.post("/api/auth/sign-in/org", {
    data: credentials,
    // The api accepts sign-ins only from the web app's own origin, which a browser would send.
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(response.status()).toBe(200);
}
```

`apps/web/test/e2e/staff.spec.ts`:
```ts
// Staff management (spec 6.3): an Owner adds staff with or without email, changes a role, removes someone; the new
// person can sign in with what the Owner hands over; a role without staff:manage sees why the screen isn't there.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { signInWithCode } from "./support/sign-in-with-code";

test("an Owner adds staff without email, who can then sign in with the organization code", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByLabel("Full name").fill("Ravi Kumar");
  await form.getByLabel("Username").fill("ravi");
  const password = await form.getByLabel("Temporary password").inputValue();
  await animationsSettled(page);
  await expectAccessible(page);
  await form.getByRole("button", { name: "Add", exact: true }).click();

  const handover = page.getByRole("dialog", { name: "Ravi Kumar was added" });
  await expect(handover.getByText(agency.code, { exact: true })).toBeVisible();
  await expect(handover.getByText(password, { exact: true })).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);
  await handover.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Ravi Kumar")).toBeVisible();
  await expect(page.getByText("Must change password")).toBeVisible();

  // Ravi, on his own device, signs in with what the Owner gave him and must choose a new password first.
  const ravisPhone = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
  await signInWithCode(ravisPhone.request, { orgCode: agency.code, username: "ravi", password });
  const me = await ravisPhone.request.get("/api/trpc/me.get");
  expect(((await me.json()) as { result: { data: { pendingStep: string } } }).result.data.pendingStep).toBe(
    "CHANGE_PASSWORD",
  );
  await ravisPhone.close();
});

test("an Owner adds staff with an email", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  const email = `meera-${agency.code.toLowerCase()}@example.test`;
  await form.getByLabel("Full name").fill("Meera Iyer");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("dialog", { name: "Meera Iyer was added" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("the form says what to fix before anything is sent", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form.getByText("Give their full name.")).toBeVisible();
  await expect(form.getByText("Give an email, a username or both.")).toBeVisible();
});

test("a role change shows at once and sticks", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await page.getByRole("menuitem", { name: "Change role" }).click();
  const dialog = page.getByRole("dialog", { name: "Change Ravi Kumar's role" });
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Operations" }).click();
  await dialog.getByRole("button", { name: "Change role" }).click();
  await expect(page.getByText("Ravi Kumar is now Operations")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Operations/).first()).toBeVisible();
  await expect(page.getByText("Sales", { exact: true })).toHaveCount(0);
});

test("removing someone takes them off the list", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove Ravi Kumar?" });
  await animationsSettled(page);
  await expectAccessible(page);
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Ravi Kumar was removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions for Ravi Kumar" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expect(page.getByText("Ravi Kumar")).toHaveCount(0);
});

test("a salesperson sees why the staff screen isn't there", async ({ page, agency, addStaff }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInWithCode(page.request, { orgCode: agency.code, username: ravi.username, password: ravi.password });
  await page.goto("/staff");
  await expect(page.getByText("Your role doesn't include this screen.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add staff" })).toHaveCount(0);
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm e2e`

Expected: PASS, 23 passed and 1 skipped (the shell's 11 and 1, and these 6 journeys on the phone and the desktop).

- [ ] **Step 6: Check and commit**

Run the track's gate (above). Expected: green; web unit tests 58 (45 + 13), journeys 23 passed and 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a-organization
git add "apps/web/src/app/(app)/staff" apps/web/src/organization/staff apps/web/src/organization/responsive-dialog.tsx apps/web/src/organization/copy-button.tsx apps/web/src/i18n/messages/en-IN/staff.json apps/web/test/organization/render.tsx apps/web/test/organization/staff-details.test.ts apps/web/test/organization/staff-list.test.tsx apps/web/test/organization/temporary-password.test.ts apps/web/test/organization/create-staff-values.test.ts apps/web/test/e2e/staff.spec.ts apps/web/test/e2e/support/settled.ts apps/web/test/e2e/support/sign-in-with-code.ts
git commit -m "feat(web): the staff screen: add staff with or without email, change roles, reset passwords, remove"
```

---

### Task O2: The roles screens: create a role, choose its permissions and scopes, delete an unused one

**Files:**
- Create: `apps/web/src/app/(app)/roles/page.tsx`, `apps/web/src/app/(app)/roles/[key]/page.tsx`
- Create in `apps/web/src/organization/roles/`: `permission-grants.ts`, `permission-labels.ts`, `use-roles.ts`,
  `create-role-dialog.tsx`, `permissions-editor.tsx`, `delete-role-dialog.tsx`, `role-editor.tsx`,
  `roles-screen.tsx`, `role-editor-screen.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/roles.json` (from `{}`)
- Test: `apps/web/test/organization/{permission-grants.test.ts,permissions-editor.test.tsx}`,
  `apps/web/test/e2e/roles.spec.ts`

**Interfaces:**
- Consumes: Task O1's `ResponsiveDialog`, `renderAs`, `animationsSettled`; `routes.roles` (`@/lib/routes`);
  `roleName`, `PermissionCatalogEntry`, `PermissionGrant`, `PermissionGrantInput`, `PermissionScope`, `RoleSummary`
  (`@travel-crm/contracts/identity`); `roles.list`, `roles.permissionCatalog`, `roles.create`, `roles.update`,
  `roles.delete`.
- Produces: `byModule(catalog)`, `toggle(grants, entry, granted)`, `setScope(grants, permission, scope)`,
  `toGrantInputs(grants)` and `type Grant` (`@/organization/roles/permission-grants`); `usePermissionLabels()`
  (`{ permission(key), moduleName(key) }`).

A new role is created with its name and no permissions, and opens in the editor at `/roles/<key>`, where its
permissions are chosen. Role keys always end in a random suffix (`senior-sales-3f9a2c`), so no key collides with a
static route.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/organization/permission-grants.test.ts`:
```ts
// The roles editor's grants: permissions grouped by module in the catalog's order, view permissions ticked with the
// narrowest scope first, and the api's input with a scope only where the permission takes one.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { byModule, setScope, toGrantInputs, toggle, type Grant } from "@/organization/roles/permission-grants";

const leadsView: PermissionCatalogEntry = { permission: "leads:view", module: "leads", scoped: true };
const leadsCreate: PermissionCatalogEntry = { permission: "leads:create", module: "leads", scoped: false };

const catalog: PermissionCatalogEntry[] = [
  { permission: "staff:manage", module: "staff", scoped: false },
  leadsView,
  leadsCreate,
  { permission: "roles:manage", module: "roles", scoped: false },
];

describe("byModule", () => {
  it("groups permissions by module, in the catalog's order", () => {
    expect(byModule(catalog).map(({ module, entries }) => [module, entries.map((entry) => entry.permission)])).toEqual([
      ["staff", ["staff:manage"]],
      ["leads", ["leads:view", "leads:create"]],
      ["roles", ["roles:manage"]],
    ]);
  });
});

describe("toggle", () => {
  it("grants a view permission for the member's own records first", () => {
    expect(toggle([], leadsView, true)).toEqual([{ permission: "leads:view", scope: "own" }]);
    expect(toggle([], leadsCreate, true)).toEqual([{ permission: "leads:create", scope: null }]);
  });

  it("takes a permission away, and never lists one twice", () => {
    const grants: Grant[] = [{ permission: "leads:view", scope: "all" }];
    expect(toggle(grants, leadsView, false)).toEqual([]);
    expect(toggle(grants, leadsView, true)).toEqual(grants);
  });
});

describe("setScope", () => {
  it("changes whose records a view permission covers", () => {
    expect(setScope([{ permission: "leads:view", scope: "own" }], "leads:view", "all")).toEqual([
      { permission: "leads:view", scope: "all" },
    ]);
  });
});

describe("toGrantInputs", () => {
  it("sends a scope only with the permissions that take one", () => {
    expect(
      toGrantInputs([
        { permission: "leads:view", scope: "all" },
        { permission: "leads:create", scope: null },
      ]),
    ).toEqual([{ permission: "leads:view", scope: "all" }, { permission: "leads:create" }]);
  });
});
```

`apps/web/test/organization/permissions-editor.test.tsx`:
```tsx
// The permissions editor names every permission in plain words, grouped by module, asks whose records a view
// permission covers once it is ticked, and shows the Owner role as holding everything, unchangeable.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Grant } from "@/organization/roles/permission-grants";
import { PermissionsEditor } from "@/organization/roles/permissions-editor";
import { renderAs } from "./render";

const catalog: PermissionCatalogEntry[] = [
  { permission: "leads:view", module: "leads", scoped: true },
  { permission: "leads:create", module: "leads", scoped: false },
  { permission: "staff:manage", module: "staff", scoped: false },
  { permission: "leads:export", module: "leads", scoped: false },
];

describe("PermissionsEditor", () => {
  it("groups permissions under their module, in plain words, with the key for one that has none yet", () => {
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={vi.fn()} readOnly={false} />);
    const leads = screen.getByRole("group", { name: "Leads" });
    expect(within(leads).getByRole("checkbox", { name: "See leads" })).not.toBeChecked();
    expect(within(leads).getByRole("checkbox", { name: "leads:export" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Staff" })).toBeVisible();
  });

  it("ticks a view permission for the person's own records first", async () => {
    const onChange = vi.fn<(grants: Grant[]) => void>();
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={onChange} readOnly={false} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "See leads" }));
    expect(onChange).toHaveBeenCalledWith([{ permission: "leads:view", scope: "own" }]);
  });

  it("asks whose records a ticked view permission covers", () => {
    renderAs(
      <PermissionsEditor
        catalog={catalog}
        grants={[{ permission: "leads:view", scope: "all" }]}
        onChange={vi.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Whose records: See leads" })).toHaveTextContent("Everyone's");
  });

  it("shows the Owner role holding everything, unchangeable", () => {
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={vi.fn()} readOnly />);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization/permission-grants.test.ts test/organization/permissions-editor.test.tsx`

Expected: FAIL: `Failed to resolve import "@/organization/roles/permission-grants"` and
`"@/organization/roles/permissions-editor"`.

- [ ] **Step 3: Write the grants, the labels and the editor**

`apps/web/src/organization/roles/permission-grants.ts`:
```ts
// What the roles editor holds while someone changes a role: the permissions it grants, and for view permissions
// whose records they cover (spec 6.5: own or all). Pure functions, so the editor's rules are tested on their own.
import type {
  PermissionCatalogEntry,
  PermissionGrant,
  PermissionGrantInput,
  PermissionScope,
} from "@travel-crm/contracts/identity";

export type Grant = PermissionGrant;

/** The catalog grouped by module ("leads", "staff"...), modules and permissions in the catalog's order. */
export function byModule(catalog: PermissionCatalogEntry[]): { module: string; entries: PermissionCatalogEntry[] }[] {
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of catalog) groups.set(entry.module, [...(groups.get(entry.module) ?? []), entry]);
  return [...groups].map(([module, entries]) => ({ module, entries }));
}

/** Grants or takes away a permission. A view permission starts with the member's own records: the narrower one. */
export function toggle(grants: Grant[], entry: PermissionCatalogEntry, granted: boolean): Grant[] {
  const without = grants.filter((grant) => grant.permission !== entry.permission);
  if (!granted) return without;
  if (without.length < grants.length) return grants;
  return [...grants, { permission: entry.permission, scope: entry.scoped ? "own" : null }];
}

export function setScope(grants: Grant[], permission: string, scope: PermissionScope): Grant[] {
  return grants.map((grant) => (grant.permission === permission ? { ...grant, scope } : grant));
}

/** The grants as the api takes them: a scope only on the permissions that have one. */
export function toGrantInputs(grants: Grant[]): PermissionGrantInput[] {
  return grants.map(({ permission, scope }) => (scope === null ? { permission } : { permission, scope }));
}
```

`apps/web/src/i18n/messages/en-IN/roles.json`:
```json
{
  "title": "Roles",
  "intro": "A role is a set of permissions. Each person has one role; changing a role changes what everyone with it may do.",
  "add": "New role",
  "loadFailed": "The roles didn't load.",
  "columns": {
    "name": "Role",
    "members": "People",
    "permissions": "Permissions"
  },
  "people": "{count, plural, =0 {Nobody} one {# person} other {# people}}",
  "permissionCount": "{count, plural, =0 {No permissions} one {# permission} other {# permissions}}",
  "everyPermission": "Every permission",
  "ownerNote": "The Owner role always holds every permission, including ones added later. It can't be changed.",
  "create": {
    "title": "New role",
    "description": "Name it, then choose what it may do.",
    "name": "Name",
    "nameHint": "For example: Senior sales.",
    "nameRequired": "Give the role a name of up to 40 characters.",
    "submit": "Create",
    "submitting": "Creating"
  },
  "editor": {
    "back": "All roles",
    "name": "Name",
    "permissions": "Permissions",
    "permissionsHint": "View permissions also say whose records the role sees: only those assigned to the person, or all of them.",
    "save": "Save",
    "saving": "Saving",
    "saved": "{name} was saved",
    "notFound": "This role no longer exists.",
    "scope": "Whose records",
    "scopeOwn": "Only their own",
    "scopeAll": "Everyone's"
  },
  "delete": {
    "action": "Delete role",
    "inUse": "{count, plural, one {# person has} other {# people have}} this role. Give them another role before deleting it.",
    "title": "Delete {name}?",
    "description": "Nobody has this role, and its name becomes free to use again.",
    "confirm": "Delete",
    "deleted": "{name} was deleted"
  },
  "modules": {
    "staff": "Staff",
    "roles": "Roles",
    "settings": "Settings",
    "audit": "Audit log",
    "money": "Money",
    "documents": "Traveller documents",
    "leads": "Leads",
    "quotes": "Quotes",
    "bookings": "Bookings",
    "departures": "Departures",
    "suppliers": "Suppliers",
    "accounts": "Accounts"
  },
  "permissions": {
    "staff:manage": "Add, change and remove staff",
    "roles:manage": "Create and change roles",
    "settings:manage": "Change the organization's settings",
    "audit:view": "See the audit log",
    "money:view_margin": "See costs, margins and profit",
    "documents:view_sensitive": "See passports, Aadhaar and other ID documents",
    "leads:view": "See leads",
    "leads:create": "Add leads",
    "leads:edit": "Change leads",
    "quotes:view": "See quotes",
    "quotes:create": "Create quotes",
    "quotes:edit": "Change quotes",
    "bookings:view": "See bookings",
    "bookings:create": "Create bookings",
    "bookings:edit": "Change bookings",
    "departures:view": "See departures",
    "departures:create": "Create departures",
    "departures:edit": "Change departures",
    "suppliers:view": "See suppliers",
    "suppliers:create": "Add suppliers",
    "suppliers:edit": "Change suppliers",
    "accounts:view": "See invoices, receipts and payments",
    "accounts:create": "Create invoices, receipts and payments",
    "accounts:edit": "Change invoices, receipts and payments"
  }
}
```

`apps/web/src/organization/roles/permission-labels.ts`:
```ts
"use client";

// Names for modules and permissions, from the roles messages. A permission added to the catalog before its words
// shows its key ("leads:export") rather than nothing.
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import roles from "@/i18n/messages/en-IN/roles.json";

type Permission = keyof typeof roles.permissions;
type Module = keyof typeof roles.modules;

const isPermission = (value: string): value is Permission => Object.hasOwn(roles.permissions, value);
const isModule = (value: string): value is Module => Object.hasOwn(roles.modules, value);

export function usePermissionLabels() {
  const t = useTranslations("roles");
  const permission = useCallback((key: string) => (isPermission(key) ? t(`permissions.${key}`) : key), [t]);
  const moduleName = useCallback((key: string) => (isModule(key) ? t(`modules.${key}`) : key), [t]);
  return { permission, moduleName };
}
```

`apps/web/src/organization/roles/permissions-editor.tsx`:
```tsx
"use client";

// The permissions of a role, grouped by module: a checkbox each, and for view permissions whose records they cover.
// Read-only for the Owner role, which holds everything.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { byModule, setScope, toggle, type Grant } from "./permission-grants";
import { usePermissionLabels } from "./permission-labels";

export function PermissionsEditor({
  catalog,
  grants,
  onChange,
  readOnly,
}: {
  catalog: PermissionCatalogEntry[];
  grants: Grant[];
  onChange: (grants: Grant[]) => void;
  readOnly: boolean;
}) {
  const t = useTranslations("roles.editor");
  const labels = usePermissionLabels();
  const grantOf = (permission: string) => grants.find((grant) => grant.permission === permission);
  return (
    <div className="flex flex-col gap-6">
      {byModule(catalog).map(({ module, entries }) => (
        <FieldSet key={module} className="gap-3">
          <FieldLegend variant="label">{labels.moduleName(module)}</FieldLegend>
          {entries.map((entry) => {
            const grant = grantOf(entry.permission);
            const id = `permission-${entry.permission.replace(":", "-")}`;
            return (
              <div key={entry.permission} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Field orientation="horizontal" className="min-h-11 w-auto flex-1">
                  <Checkbox
                    id={id}
                    checked={readOnly || grant !== undefined}
                    disabled={readOnly}
                    onCheckedChange={(checked) => {
                      onChange(toggle(grants, entry, checked === true));
                    }}
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {labels.permission(entry.permission)}
                  </FieldLabel>
                </Field>
                {entry.scoped && grant !== undefined && !readOnly && (
                  <Select
                    value={grant.scope ?? "own"}
                    onValueChange={(scope) => {
                      onChange(setScope(grants, entry.permission, scope === "all" ? "all" : "own"));
                    }}
                  >
                    <SelectTrigger
                      className="h-11 w-44"
                      aria-label={`${t("scope")}: ${labels.permission(entry.permission)}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">{t("scopeOwn")}</SelectItem>
                      <SelectItem value="all">{t("scopeAll")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </FieldSet>
      ))}
    </div>
  );
}
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization`

Expected: PASS, 22 tests in 6 files.

- [ ] **Step 4: Write the calls and the screens**

`apps/web/src/organization/roles/use-roles.ts`:
```ts
"use client";

// The roles screens' calls. A change to a role refreshes the roles list, and the staff list, which shows role names.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

function useRefreshRoles() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.roles.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.staff.list.queryKey() }),
    ]);
  };
}

export function useCreateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.create.mutationOptions({ onSettled: refresh }));
}

export function useUpdateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.update.mutationOptions({ onSettled: refresh }));
}

export function useDeleteRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.delete.mutationOptions({ onSettled: refresh }));
}
```

`apps/web/src/organization/roles/create-role-dialog.tsx`:
```tsx
"use client";

// "New role": a name first, with no permissions; the editor it opens is where permissions are chosen.
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { roleName } from "@travel-crm/contracts/identity";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { ResponsiveDialog } from "../responsive-dialog";
import { useCreateRole } from "./use-roles";

export function CreateRoleDialog() {
  const t = useTranslations("roles.create");
  const tRoles = useTranslations("roles");
  const { apiError } = useErrorMessage();
  const router = useRouter();
  const create = useCreateRole();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {tRoles("add")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t("title")} description={t("description")}>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = roleName.safeParse(name);
            setInvalid(!parsed.success);
            if (!parsed.success) return;
            create.mutate(
              { name: parsed.data, permissions: [] },
              {
                onSuccess: (role) => {
                  router.push(`${routes.roles}/${role.key}`);
                },
              },
            );
          }}
        >
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="role-name">{t("name")}</FieldLabel>
            <Input
              id="role-name"
              value={name}
              maxLength={40}
              aria-invalid={invalid}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <FieldDescription>{t("nameHint")}</FieldDescription>
            {invalid && <FieldError>{t("nameRequired")}</FieldError>}
          </Field>
          {create.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(create.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={create.isPending} className="self-end">
            {create.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </ResponsiveDialog>
    </>
  );
}
```

`apps/web/src/organization/roles/delete-role-dialog.tsx`:
```tsx
"use client";

// Deleting a role: only one nobody has (the api refuses others), asked once more. Its name becomes free again.
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { useDeleteRole } from "./use-roles";

export function DeleteRoleDialog({ role }: { role: RoleSummary }) {
  const t = useTranslations("roles.delete");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const router = useRouter();
  const remove = useDeleteRole();
  const [open, setOpen] = useState(false);
  const inUse = role.memberCount > 0;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="destructive"
        disabled={inUse}
        aria-describedby={inUse ? "role-in-use" : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      {inUse && <FieldDescription id="role-in-use">{t("inUse", { count: role.memberCount })}</FieldDescription>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title", { name: role.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
              className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate(
                  { key: role.key },
                  {
                    onSuccess: () => {
                      toast.success(t("deleted", { name: role.name }));
                      router.push(routes.roles);
                    },
                    onError: (error) => toast.error(apiError(error), { duration: Infinity }),
                  },
                );
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

`apps/web/src/organization/roles/role-editor.tsx`:
```tsx
"use client";

// One role's name and permissions, saved together. The Owner role is shown read-only: it holds every permission.
import { roleName, type PermissionCatalogEntry, type RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { DeleteRoleDialog } from "./delete-role-dialog";
import { toGrantInputs, type Grant } from "./permission-grants";
import { PermissionsEditor } from "./permissions-editor";
import { useUpdateRole } from "./use-roles";

export function RoleEditor({ role, catalog }: { role: RoleSummary; catalog: PermissionCatalogEntry[] }) {
  const t = useTranslations("roles");
  const { apiError } = useErrorMessage();
  const update = useUpdateRole();
  const [name, setName] = useState(role.name);
  const [grants, setGrants] = useState<Grant[]>(role.permissions);
  const [nameInvalid, setNameInvalid] = useState(false);

  if (role.isOwner) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-muted-foreground">{t("ownerNote")}</p>
        <PermissionsEditor catalog={catalog} grants={[]} onChange={() => undefined} readOnly />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = roleName.safeParse(name);
        setNameInvalid(!parsed.success);
        if (!parsed.success) return;
        update.mutate(
          { key: role.key, name: parsed.data, permissions: toGrantInputs(grants) },
          { onSuccess: (saved) => toast.success(t("editor.saved", { name: saved.name })) },
        );
      }}
    >
      <Field data-invalid={nameInvalid}>
        <FieldLabel htmlFor="role-name">{t("editor.name")}</FieldLabel>
        <Input
          id="role-name"
          value={name}
          maxLength={40}
          aria-invalid={nameInvalid}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {nameInvalid && <FieldError>{t("create.nameRequired")}</FieldError>}
      </Field>
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">{t("editor.permissions")}</h2>
        <FieldDescription>{t("editor.permissionsHint")}</FieldDescription>
        <PermissionsEditor catalog={catalog} grants={grants} onChange={setGrants} readOnly={false} />
      </section>
      {update.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(update.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 border-t pt-6">
        <DeleteRoleDialog role={role} />
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </form>
  );
}
```

`apps/web/src/organization/roles/roles-screen.tsx`:
```tsx
"use client";

// The roles screen (spec 6.5): every role, how many people have it and how much it allows, each opening its editor.
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { CreateRoleDialog } from "./create-role-dialog";

export function RolesScreen() {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a change just made.
  const roles = useQuery(trpc.roles.list.queryOptions());

  const body = () => {
    if (roles.data) {
      return (
        <ul className="divide-y rounded-lg border">
          {roles.data.map((role) => (
            <li key={role.key}>
              <Link
                href={`${routes.roles}/${role.key}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium break-words">{role.name}</span>
                  <span className="text-label text-muted-foreground">
                    {role.isOwner ? t("everyPermission") : t("permissionCount", { count: role.permissions.length })}
                  </span>
                </span>
                <span className="numbers text-muted-foreground">{t("people", { count: role.memberCount })}</span>
                <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    if (roles.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void roles.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <CreateRoleDialog />
      </div>
      {body()}
    </div>
  );
}
```

The editor is keyed by what the role holds, so when the copy restored from IndexedDB is replaced by the api's newer
answer (Task G3 refreshes every query after a restore), the form starts again from it. Without that, a reload a
second after saving would show the role as it was before, and saving from there would undo the save.

`apps/web/src/organization/roles/role-editor-screen.tsx`:
```tsx
"use client";

// /roles/<key>: one role in the editor. The role comes from the roles list (there is no single-role call), so the
// list screen and the editor share one cached answer.
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { RoleEditor } from "./role-editor";

export function RoleEditorScreen({ roleKey }: { roleKey: string }) {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // An editor starts from the api's latest answer: a copy restored from IndexedDB can be a few seconds older than a
  // save just made, and saving from it would undo that save.
  const roles = useQuery(trpc.roles.list.queryOptions());
  const catalog = useQuery(trpc.roles.permissionCatalog.queryOptions());
  const role = roles.data?.find((entry) => entry.key === roleKey);

  const body = () => {
    if (roles.data && catalog.data) {
      // Keyed by what the role holds, so the editor starts again from the saved role when it changes: when the cached
      // copy shown first is replaced by the api's answer, or someone else changes it.
      return role ? (
        <RoleEditor
          key={`${role.key}:${role.name}:${JSON.stringify(role.permissions)}`}
          role={role}
          catalog={catalog.data}
        />
      ) : (
        <EmptyState icon={SearchXIcon} message={t("editor.notFound")} />
      );
    }
    if (roles.isError || catalog.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            void roles.refetch();
            void catalog.refetch();
          }}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full max-w-sm" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Link href={routes.roles} className="flex min-h-11 w-fit items-center gap-2 text-primary hover:underline">
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t("editor.back")}
      </Link>
      <PageTitle>{role?.name ?? t("title")}</PageTitle>
      {body()}
    </div>
  );
}
```

`apps/web/src/app/(app)/roles/page.tsx`:
```tsx
// /roles: the organization's roles, for members whose role may manage them.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RolesScreen } from "@/organization/roles/roles-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roles");
  return { title: t("title") };
}

export default function RolesPage() {
  return (
    <RequirePermission permission="roles:manage">
      <RolesScreen />
    </RequirePermission>
  );
}
```

`apps/web/src/app/(app)/roles/[key]/page.tsx`:
```tsx
// /roles/<key>: one role's name and permissions.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleEditorScreen } from "@/organization/roles/role-editor-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roles");
  return { title: t("title") };
}

export default async function RolePage({ params }: PageProps<"/roles/[key]">) {
  const { key } = await params;
  return (
    <RequirePermission permission="roles:manage">
      <RoleEditorScreen roleKey={key} />
    </RequirePermission>
  );
}
```

- [ ] **Step 5: Write the journeys**

`apps/web/test/e2e/roles.spec.ts`:
```ts
// Roles (spec 6.5): an Owner creates a role, gives it a view permission over everyone's records and more, and the
// choice sticks; a role people have can't be deleted, an unused one can; the Owner role can't be changed.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

test("an Owner creates a role and gives it a view permission over everyone's records", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { level: 1, name: "Roles" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog", { name: "New role" });
  await dialog.getByLabel("Name").fill("Senior sales");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/roles\/senior-sales-[0-9a-f]{6}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Senior sales" })).toBeVisible();

  await page.getByRole("checkbox", { name: "See leads" }).click();
  await page.getByRole("combobox", { name: "Whose records: See leads" }).click();
  await page.getByRole("option", { name: "Everyone's" }).click();
  await page.getByRole("checkbox", { name: "Add leads" }).click();
  await animationsSettled(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Senior sales was saved")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "See leads" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Whose records: See leads" })).toHaveText("Everyone's");
  await expect(page.getByRole("checkbox", { name: "Add leads" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Change leads" })).not.toBeChecked();
});

test("a role people have can't be deleted, and an unused one can", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await page.getByRole("link", { name: /^Sales/ }).click();
  await expect(page.getByRole("button", { name: "Delete role" })).toBeDisabled();
  await expect(page.getByText("1 person has this role.", { exact: false })).toBeVisible();

  await page.goto("/roles");
  await page.getByRole("link", { name: /^Accounts/ }).click();
  await page.getByRole("button", { name: "Delete role" }).click();
  await page.getByRole("alertdialog", { name: "Delete Accounts?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/roles$/);
  await expect(page.getByText("Accounts was deleted")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Accounts/ })).toHaveCount(0);
});

test("the Owner role can't be changed", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await page.getByRole("link", { name: /^Owner/ }).click();
  await expect(page.getByText("The Owner role always holds every permission", { exact: false })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Add, change and remove staff" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm e2e`

Expected: PASS, 29 passed and 1 skipped.

- [ ] **Step 6: Check and commit**

Run the track's gate. Expected: green; web unit tests 67, journeys 29 passed and 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a-organization
git add "apps/web/src/app/(app)/roles" apps/web/src/organization/roles apps/web/src/i18n/messages/en-IN/roles.json apps/web/test/e2e/roles.spec.ts apps/web/test/organization/permission-grants.test.ts apps/web/test/organization/permissions-editor.test.tsx
git commit -m "feat(web): the roles screens: create a role, choose its permissions and scopes, delete an unused one"
```

---

### Task O3: The settings screen: the organization's code, and the two-factor requirement

**Files:**
- Create: `apps/web/src/app/(app)/settings/page.tsx`
- Create in `apps/web/src/organization/settings/`: `two-factor-requirement-rules.ts`, `use-settings.ts`,
  `two-factor-requirement.tsx`, `settings-screen.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/settings.json` (from `{}`)
- Test: `apps/web/test/organization/two-factor-requirement.test.ts`, `apps/web/test/e2e/settings.spec.ts`,
  `apps/web/test/e2e/support/organization-two-factor.ts`

**Interfaces:**
- Consumes: Task O1's `CopyButton` and `signInWithCode`; `refusalOf(error)` (`@/data/api-error`); `routes.account`;
  `settings.get`, `settings.setTwoFactorRequirement`, `me.get`; the journeys' `database` worker fixture (its
  `platform` client).
- Produces: `requirementSwitch({ required, isOwner }): { disabled: boolean; reason: "ownerOnly" | null }`;
  `authenticatorCode(secret, now?)` and `turnOnTwoFactor(request, password): Promise<string>`
  (`test/e2e/support/organization-two-factor.ts`).

- [ ] **Step 1: Write the failing test**

`apps/web/test/organization/two-factor-requirement.test.ts`:
```ts
// Anyone who may change settings can require two-factor sign-in; only an Owner can stop requiring it (spec 6.2).
import { describe, expect, it } from "vitest";
import { requirementSwitch } from "@/organization/settings/two-factor-requirement-rules";

describe("requirementSwitch", () => {
  it("lets anyone with settings:manage turn the requirement on", () => {
    expect(requirementSwitch({ required: false, isOwner: false })).toEqual({ disabled: false, reason: null });
  });

  it("lets only an Owner turn it off, and says why to everyone else", () => {
    expect(requirementSwitch({ required: true, isOwner: true })).toEqual({ disabled: false, reason: null });
    expect(requirementSwitch({ required: true, isOwner: false })).toEqual({ disabled: true, reason: "ownerOnly" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run test/organization/two-factor-requirement.test.ts`

Expected: FAIL: `Failed to resolve import "@/organization/settings/two-factor-requirement-rules"`.

- [ ] **Step 3: Write the rule, the quick action and the screen**

`apps/web/src/organization/settings/two-factor-requirement-rules.ts`:
```ts
// Who may flip the two-factor requirement (spec 6.2): anyone with settings:manage may require it, only an Owner may
// stop requiring it. The api enforces this; the switch only says so up front.

export function requirementSwitch({ required, isOwner }: { required: boolean; isOwner: boolean }): {
  disabled: boolean;
  /** A message key in "settings.security", or null. */
  reason: "ownerOnly" | null;
} {
  return required && !isOwner ? { disabled: true, reason: "ownerOnly" } : { disabled: false, reason: null };
}
```

`apps/web/src/i18n/messages/en-IN/settings.json`:
```json
{
  "title": "Settings",
  "loadFailed": "The settings didn't load.",
  "organization": {
    "heading": "Organization",
    "name": "Name",
    "code": "Organization code",
    "codeHint": "Staff without email sign in with this code and their username.",
    "copyCode": "Copy the organization code"
  },
  "security": {
    "heading": "Sign-in security",
    "requireTwoFactor": "Require two-factor sign-in for everyone",
    "requireTwoFactorHint": "Everyone then signs in with a code from an authenticator app as well as their password. Staff who haven't set it up are asked to at their next sign-in.",
    "ownerOnly": "Only an Owner can stop requiring two-factor sign-in.",
    "setUpYours": "Set up two-factor for yourself",
    "turnedOn": "Two-factor sign-in is now required for everyone",
    "turnedOff": "Two-factor sign-in is now optional"
  }
}
```

The switch is optimistic: it moves at once, and moves back with the reason's message if the api refuses
(`ENABLE_TWO_FACTOR_FIRST`, `OWNER_ONLY`). Settings and `me.get` (which carries the requirement) are refreshed after.

`apps/web/src/organization/settings/use-settings.ts`:
```ts
"use client";

// The two-factor requirement as a quick action (spec 11: optimistic updates): the switch moves at once and moves
// back if the api refuses. Settings and me.get, which carries the organization's requirement, are refreshed after.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSetTwoFactorRequirement() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settingsKey = trpc.settings.get.queryKey();
  return useMutation(
    trpc.settings.setTwoFactorRequirement.mutationOptions({
      onMutate: async ({ required }) => {
        await queryClient.cancelQueries({ queryKey: settingsKey });
        const before = queryClient.getQueryData(settingsKey);
        queryClient.setQueryData(settingsKey, { requireTwoFactor: required });
        return { before };
      },
      onError: (_error, _variables, onMutateResult) => {
        if (onMutateResult?.before) queryClient.setQueryData(settingsKey, onMutateResult.before);
      },
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: settingsKey }),
          queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() }),
        ]);
      },
    }),
  );
}
```

`apps/web/src/organization/settings/two-factor-requirement.tsx`:
```tsx
"use client";

// The switch that makes two-factor sign-in compulsory for the whole organization (spec 6.2). A refusal is shown
// under it, and when the reason is that the person hasn't set it up for themselves, a link to do so.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { refusalOf } from "@/data/api-error";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { requirementSwitch } from "./two-factor-requirement-rules";
import { useSetTwoFactorRequirement } from "./use-settings";

export function TwoFactorRequirement() {
  const t = useTranslations("settings.security");
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const me = useMe();
  const { apiError } = useErrorMessage();
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a change just made.
  const settings = useQuery(trpc.settings.get.queryOptions());
  const change = useSetTwoFactorRequirement();

  if (!settings.data) {
    return settings.isError ? (
      <ErrorState
        message={tSettings("loadFailed")}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void settings.refetch()}
      />
    ) : (
      <Skeleton className="h-16 w-full" />
    );
  }
  const required = settings.data.requireTwoFactor;
  const { disabled, reason } = requirementSwitch({ required, isOwner: me.member.role.isOwner });

  return (
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal" data-disabled={disabled}>
        <FieldContent>
          <FieldLabel htmlFor="require-two-factor">{t("requireTwoFactor")}</FieldLabel>
          <FieldDescription>{reason === null ? t("requireTwoFactorHint") : t(reason)}</FieldDescription>
        </FieldContent>
        <Switch
          id="require-two-factor"
          checked={required}
          disabled={disabled || change.isPending}
          onCheckedChange={(checked) => {
            change.mutate(
              { required: checked },
              { onSuccess: (saved) => toast.success(saved.requireTwoFactor ? t("turnedOn") : t("turnedOff")) },
            );
          }}
        />
      </Field>
      {change.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-2">
            {apiError(change.error)}
            {refusalOf(change.error)?.reason === "ENABLE_TWO_FACTOR_FIRST" && (
              <Link href={routes.account} className="text-primary underline underline-offset-4">
                {t("setUpYours")}
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

`apps/web/src/organization/settings/settings-screen.tsx`:
```tsx
"use client";

// The settings screen: the organization's name and sign-in code, read-only here (the platform team sets them), and
// whether everyone must use two-factor sign-in.
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { useMe } from "@/session/me-context";
import { CopyButton } from "../copy-button";
import { TwoFactorRequirement } from "./two-factor-requirement";

export function SettingsScreen() {
  const t = useTranslations("settings");
  const me = useMe();
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <PageTitle>{t("title")}</PageTitle>
      <section aria-labelledby="organization-heading" className="flex flex-col gap-3">
        <h2 id="organization-heading" className="text-section font-semibold">
          {t("organization.heading")}
        </h2>
        <dl className="divide-y rounded-lg border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-44 text-label text-muted-foreground">{t("organization.name")}</dt>
            <dd className="flex-1 break-words">{me.organization.name}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-44 text-label text-muted-foreground">{t("organization.code")}</dt>
            <dd className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span className="numbers">{me.organization.code}</span>
              <CopyButton value={me.organization.code} label={t("organization.copyCode")} />
            </dd>
          </div>
        </dl>
        <p className="text-label text-muted-foreground">{t("organization.codeHint")}</p>
      </section>
      <section aria-labelledby="security-heading" className="flex flex-col gap-3">
        <h2 id="security-heading" className="text-section font-semibold">
          {t("security.heading")}
        </h2>
        <div className="rounded-lg border p-4">
          <TwoFactorRequirement />
        </div>
      </section>
    </div>
  );
}
```

`apps/web/src/app/(app)/settings/page.tsx`:
```tsx
// /settings: the organization's code and its sign-in security, for members whose role may change settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsScreen } from "@/organization/settings/settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <SettingsScreen />
    </RequirePermission>
  );
}
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec vitest run`

Expected: PASS, 69 tests.

- [ ] **Step 4: Write the journeys**

Turning the requirement on needs a person who uses two-factor. The helper turns it on through Better Auth's
endpoints with codes computed as an authenticator app does (RFC 6238), from the secret in the `otpauth://` link.

`apps/web/test/e2e/support/organization-two-factor.ts`:
```ts
// Two-factor sign-in for the settings journeys: turn it on for the signed-in person through Better Auth's endpoints,
// with codes an authenticator app would show (RFC 6238: HMAC-SHA1 over 30-second steps, 6 digits).
import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";

/** RFC 4648 base32, as otpauth:// links carry the secret. */
function base32Bytes(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of text.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** The code an authenticator app shows now for a base32 secret. */
export function authenticatorCode(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", base32Bytes(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String(digest.readUInt32BE(offset) & 0x7fffffff)
    .slice(-6)
    .padStart(6, "0");
}

/** Turns two-factor on for whoever `request` is signed in as. Returns the secret, for later codes. */
export async function turnOnTwoFactor(request: APIRequestContext, password: string): Promise<string> {
  const headers = { origin: process.env.E2E_BASE_URL ?? "" };
  const enabled = await request.post("/api/auth/two-factor/enable", { data: { password }, headers });
  expect(enabled.status()).toBe(200);
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  const verified = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code: authenticatorCode(secret) },
    headers,
  });
  expect(verified.status()).toBe(200);
  return secret;
}
```

`apps/web/test/e2e/settings.spec.ts`:
```ts
// Settings (spec 6.2): the organization's code to hand out, and the two-factor requirement, which an Owner can only
// turn on once they use two-factor themselves, which sticks, and which only an Owner can turn off again.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { turnOnTwoFactor } from "./support/organization-two-factor";
import { signInWithCode } from "./support/sign-in-with-code";

test("an Owner without two-factor is told to set it up before requiring it", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByText(agency.code, { exact: true })).toBeVisible();
  await expectAccessible(page);

  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await requirement.click();
  await expect(page.getByText("Turn on two-factor sign-in for yourself first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up two-factor for yourself" })).toBeVisible();
  await expect(requirement).not.toBeChecked();
});

test("an Owner who uses two-factor requires it for everyone, and it sticks", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await turnOnTwoFactor(page.request, agency.owner.password);
  await page.goto("/settings");
  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await requirement.click();
  await expect(requirement).toBeChecked();
  await expect(page.getByText("Two-factor sign-in is now required for everyone")).toBeVisible();
  await page.reload();
  await expect(requirement).toBeChecked();
  await requirement.click();
  await expect(requirement).not.toBeChecked();
  await expect(page.getByText("Two-factor sign-in is now optional")).toBeVisible();
});

test("an Admin can't stop requiring two-factor, and sees why", async ({ page, agency, addStaff, database }) => {
  const admin = await addStaff({ name: "Kiran Admin", username: "kiran", roleKey: "org-admin" });
  await signInWithCode(page.request, { orgCode: agency.code, username: admin.username, password: admin.password });
  await turnOnTwoFactor(page.request, admin.password);
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await page.goto("/settings");
  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await expect(requirement).toBeChecked();
  await expect(requirement).toBeDisabled();
  await expect(page.getByText("Only an Owner can stop requiring two-factor sign-in.")).toBeVisible();
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-organization/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm e2e`

Expected: PASS, 35 passed and 1 skipped.

- [ ] **Step 5: Check and commit**

Run the track's gate. Expected: green; web unit tests 69, journeys 35 passed and 1 skipped.

```bash
cd /Users/ak/personal/travel-crm-05a-organization
git add "apps/web/src/app/(app)/settings" apps/web/src/organization/settings apps/web/src/i18n/messages/en-IN/settings.json apps/web/test/e2e/settings.spec.ts apps/web/test/e2e/support/organization-two-factor.ts apps/web/test/organization/two-factor-requirement.test.ts
git commit -m "feat(web): the settings screen: the organization's code, and the two-factor requirement"
```

The track is ready to merge (Task I1).

---

## Track P: Installable, and an offline shell

The PWA half of spec 11 and DESIGN.md section 6: the app installs on a phone under the brand's name and icons, and a
service worker keeps the pages and build files already visited, so the app opens without a connection and shows the
last data the query cache saved (Task G3). The worker never stores an api answer.

**Owns:** `apps/web/src/app/manifest.ts`, `apps/web/src/app/offline/`, `apps/web/src/pwa/`,
`apps/web/src/service-worker/`, `apps/web/scripts/service-worker.ts`, `apps/web/test/pwa/`,
`apps/web/test/e2e/pwa-*.spec.ts`, `apps/web/src/i18n/messages/en-IN/pwa.json`; and these edits to groundwork files,
which no other track touches: `apps/web/src/app/layout.tsx` (metadata icons and the registration component),
`apps/web/scripts/generate.ts`, `apps/web/next.config.ts` (the `/sw.js` headers), `apps/web/turbo.json`,
`apps/web/.gitignore`, `apps/web/tsconfig.json` (`exclude`), `apps/web/package.json` (the `typecheck` script).

**Depends on:** Tasks G1-G4. The root `.prettierignore` must list `apps/web/public/sw.js` and dependency-cruiser's
`exclude` must cover `^apps/web/public/` (Task G4 adds both): the bundled worker is generated, and the root's Prettier
and dependency-cruiser don't read `apps/web/.gitignore`.

Before the first task, make the track's worktree from Task G4's commit:
```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-05a-pwa -b foundation/05a-pwa foundation/05a-web
cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

**Rulings in this track:**
- Ruling: a hand-written service worker (two small files, bundled by esbuild 0.28.2 in `pnpm generate`) instead of
  Serwist — Next.js's PWA guide names Serwist for offline caching, but its Turbopack integration (`@serwist/turbopack`
  9.5.13) is a route-handler workaround that bundles the worker with esbuild at request time, keeps esbuild at run time
  (`serverExternalPackages`) and is written for builds without `cacheComponents`; the app needs four rules
  (`strategy.ts`, unit-tested) — cost if wrong: no precache manifest, so a page or file is offline only once visited
  (the offline page is precached); Serwist can replace the worker later without touching the app.
- Ruling: spec 12.1's "Lighthouse PWA score" becomes Playwright installability checks — Lighthouse 12 removed the PWA
  category (Lighthouse 13.5 is current), so there is no score to gate on — the journeys check what browsers require to
  install: the manifest link, `name`/`short_name`, `start_url`, `display: standalone`, 192 and 512 px icons that load as
  PNG, a maskable icon, the theme colour, a service worker controlling the page, and a page that answers offline — cost
  if wrong: a Lighthouse CI run for performance and accessibility is still worth adding with the release pipeline.
- Ruling: the worker takes over at once (`skipWaiting`, `clients.claim`) with no "new version" prompt — pages come from
  the network first and build files are named by their content, so an old and a new worker never mix versions — cost if
  wrong: a page open across a deploy fetches the new build's files on its next navigation, as without a worker.

### Task P1: The app installs under the brand's name

**Files:**
- Create: `apps/web/src/app/manifest.ts`
- Modify: `apps/web/src/app/layout.tsx` (metadata icons)
- Test: `apps/web/test/pwa/manifest.test.ts`, `apps/web/test/e2e/pwa-install.spec.ts`

**Interfaces:**
- Consumes: `brand`, `pwaIcons` (`@travel-crm/brand`); the icons `scripts/generate.ts` copies to `public/icons`
  (Task G1); the journey fixtures `test`, `expect` (`test/e2e/support/fixtures.ts`, Task G4).
- Produces: `GET /manifest.webmanifest`; `<link rel="manifest">`, `<link rel="icon">` (favicon.ico, favicon.svg) and
  `<link rel="apple-touch-icon">` on every page.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/pwa/manifest.test.ts`:
```ts
// The web app manifest makes the app installable (DESIGN.md section 6: standalone, theme colour of the canvas) under
// the brand's name and with the brand's icons, read from the brand package (spec 10).
import { brand, pwaIcons } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("manifest", () => {
  it("installs the app under the brand's name, standalone, opening at home", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: brand.productName,
      short_name: brand.shortName,
      description: brand.tagline,
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: brand.colours.canvas,
      background_color: brand.colours.canvas,
    });
  });

  it("lists the brand's icons: 192 and 512 pixels, and a maskable one", () => {
    const icons = manifest().icons ?? [];
    expect(icons).toEqual(pwaIcons.map((icon) => ({ ...icon })));
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
```

`apps/web/test/e2e/pwa-install.spec.ts`:
```ts
// The app can be installed (spec 12.1 asks for a PWA check; Lighthouse 12 dropped its PWA category, so these are
// the installability rules browsers apply): every page links the manifest, which names the app, opens it standalone
// at home, and lists icons that load; the favicon and home-screen icon load too.
import { brand } from "@travel-crm/brand";
import { expect, test } from "./support/fixtures";

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test("the manifest names the app, opens it standalone, and its icons load", async ({ page }) => {
  await page.goto("/sign-in");
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const response = await page.request.get(manifestUrl ?? "");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    name: brand.productName,
    short_name: brand.shortName,
    start_url: "/",
    display: "standalone",
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"], icon.src).toBe("image/png");
  }
});

test("pages link a favicon, a home-screen icon and the canvas theme colour, and they load", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", brand.colours.canvas);
  const hrefs = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toEqual(
    expect.arrayContaining(["/icons/favicon.ico", "/icons/favicon.svg", "/icons/apple-touch-icon.png"]),
  );
  for (const href of hrefs) expect((await page.request.get(href)).status(), href).toBe(200);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/pwa`

Expected: FAIL: `Failed to resolve import "@/app/manifest"`. (The journeys would fail too: no page links a manifest.)

- [ ] **Step 3: Add the manifest and the icons**

`apps/web/src/app/manifest.ts`:
```ts
// The web app manifest (served at /manifest.webmanifest): what a phone needs to install the app on its home screen
// under the brand's name, with the brand's icons, opening standalone at home (DESIGN.md section 6, spec 10).
import type { MetadataRoute } from "next";
import { brand, pwaIcons } from "@travel-crm/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.productName,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: brand.colours.canvas,
    background_color: brand.colours.canvas,
    icons: pwaIcons.map((icon) => ({ ...icon })),
  };
}
```

In `apps/web/src/app/layout.tsx`:

replace:
```ts
  applicationName: brand.productName,
};
```
with:
```ts
  applicationName: brand.productName,
  // The brand's icons, which scripts/generate.ts copies to public/icons.
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "32x32" },
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};
```

- [ ] **Step 4: Run the tests and the install journeys**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/pwa && pnpm --filter @travel-crm/web exec playwright test pwa-install`

Expected: 2 unit tests pass; 4 journeys pass (2 tests, phone and desktop).

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm --filter @travel-crm/web typecheck lint test e2e && pnpm run depcruise`

Expected: green. Web: 47 unit tests; journeys 15 passed, 1 skipped (the desktop-only prefetch journey on the phone).

```bash
cd /Users/ak/personal/travel-crm-05a-pwa
git add apps/web/src/app/manifest.ts apps/web/src/app/layout.tsx apps/web/test/pwa/manifest.test.ts apps/web/test/e2e/pwa-install.spec.ts
git commit -m "feat(web): make the app installable, with the brand's manifest and icons"
```

---

### Task P2: An offline shell

**Files:**
- Create: `apps/web/src/service-worker/strategy.ts`, `apps/web/src/service-worker/sw.ts`,
  `apps/web/src/service-worker/tsconfig.json`, `apps/web/src/pwa/register-service-worker.ts`,
  `apps/web/src/pwa/service-worker-registration.tsx`, `apps/web/scripts/service-worker.ts`,
  `apps/web/src/app/offline/page.tsx`
- Modify: `apps/web/src/i18n/messages/en-IN/pwa.json` (its first messages), `apps/web/scripts/generate.ts`,
  `apps/web/.gitignore`, `apps/web/turbo.json`, `apps/web/tsconfig.json`, `apps/web/package.json`,
  `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`
- Test: `apps/web/test/pwa/strategy.test.ts`, `apps/web/test/pwa/registration.test.ts`,
  `apps/web/test/e2e/pwa-offline.spec.ts`

**Interfaces:**
- Consumes: `routes.home` (`@/lib/routes`), `PageTitle`, `Button` (Task G2); the query cache saved in IndexedDB database
  `travel-crm`, store `query-cache` (Task G3); the offline banner (Task G4); `signInByEmail` and the `agency` fixture
  (Task G4).
- Produces: `strategyFor(request: RequestFacts, appOrigin: string): Strategy` with
  `Strategy = "network-only" | "cache-first" | "page"` and `RequestFacts = { url: string; method: string; mode: string }`;
  `cachesToDelete(cacheNames: readonly string[]): string[]`; `CACHE_NAMES`, `OFFLINE_PAGE` (`"/offline"`);
  `registerServiceWorker(navigator, nodeEnvironment): Promise<boolean>`; `buildServiceWorker(appDirectory): Promise<string>`
  (writes `public/sw.js`); `<ServiceWorkerRegistration />`; the `/offline` page; `/sw.js` served with
  `Cache-Control: no-cache` and `Service-Worker-Allowed: /`.

- [ ] **Step 1: Write the failing unit tests**

`apps/web/test/pwa/strategy.test.ts`:
```ts
// How the service worker answers each request (spec 11: an offline shell; cached data lives in the query cache, not
// here). It never touches the api, so no organization data is ever stored by the worker.
import { describe, expect, it } from "vitest";
import { CACHE_NAMES, cachesToDelete, OFFLINE_PAGE, strategyFor } from "@/service-worker/strategy";

const origin = "https://app.example.in";
const request = (path: string, { method = "GET", mode = "cors" }: { method?: string; mode?: string } = {}) => ({
  url: `${origin}${path}`,
  method,
  mode,
});

describe("strategyFor", () => {
  it("leaves every api call to the network, page loads of api links included", () => {
    expect(strategyFor(request("/api/trpc/staff.list?batch=1"), origin)).toBe("network-only");
    expect(strategyFor(request("/api/trpc/staff.create", { method: "POST" }), origin)).toBe("network-only");
    // The password-reset link in an email opens /api/auth/reset-password/<token>, which redirects to the app.
    expect(strategyFor(request("/api/auth/reset-password/abc", { mode: "navigate" }), origin)).toBe("network-only");
  });

  it("answers page loads from the network first, falling back to a saved copy", () => {
    expect(strategyFor(request("/", { mode: "navigate" }), origin)).toBe("page");
    expect(strategyFor(request("/staff", { mode: "navigate" }), origin)).toBe("page");
  });

  it("serves the build's files and the icons from the cache, as their names change when their content does", () => {
    expect(strategyFor(request("/_next/static/chunks/0a1b2c.js"), origin)).toBe("cache-first");
    expect(strategyFor(request("/_next/static/media/figtree.woff2"), origin)).toBe("cache-first");
    expect(strategyFor(request("/icons/icon-192.png"), origin)).toBe("cache-first");
  });

  it("leaves everything else alone: other methods and sites, the worker itself, data the router fetches", () => {
    expect(strategyFor(request("/staff", { method: "POST", mode: "navigate" }), origin)).toBe("network-only");
    expect(strategyFor({ url: "https://fonts.example/x.css", method: "GET", mode: "cors" }, origin)).toBe(
      "network-only",
    );
    expect(strategyFor(request("/sw.js"), origin)).toBe("network-only");
    expect(strategyFor(request("/staff?_rsc=1x2y"), origin)).toBe("network-only");
    expect(strategyFor(request("/manifest.webmanifest"), origin)).toBe("network-only");
  });
});

describe("cachesToDelete", () => {
  it("drops caches an older worker made and keeps the current ones", () => {
    expect(cachesToDelete(["pages-v0", CACHE_NAMES.pages, CACHE_NAMES.static, "static-v0"])).toEqual([
      "pages-v0",
      "static-v0",
    ]);
  });
});

describe("OFFLINE_PAGE", () => {
  it("is a page of the app", () => {
    expect(OFFLINE_PAGE).toBe("/offline");
  });
});
```

`apps/web/test/pwa/registration.test.ts`:
```ts
// The service worker is registered only by production builds (a worker caching development builds would serve stale
// code), for the whole app, and a browser without service workers simply gets none.
import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "@/pwa/register-service-worker";

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app, never reading it from the HTTP cache", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register } }, "production");
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing in development or without service worker support", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register } }, "development");
    await registerServiceWorker({}, "production");
    expect(register).not.toHaveBeenCalled();
  });

  it("keeps the app working when registration fails", async () => {
    const register = vi.fn(() => Promise.reject(new Error("SecurityError")));
    await expect(registerServiceWorker({ serviceWorker: { register } }, "production")).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/pwa`

Expected: FAIL: `Failed to resolve import "@/service-worker/strategy"` and `"@/pwa/register-service-worker"`.

- [ ] **Step 3: Write the worker, its rules, and its registration**

`apps/web/src/service-worker/strategy.ts`:
```ts
// How the service worker answers each request, decided from the request alone so it can be tested without a worker.
// It keeps pages and the build's files for an offline shell (spec 11, DESIGN.md: an offline shell). It never stores
// an api answer: the organization's data is kept only by the query cache, which signing out wipes. Pages are safe to
// keep because they hold no data of anyone's: every screen loads its data in the browser, through the api.

/** network-only: the worker stays out of it. cache-first: files whose name changes with their content. page: a page
 * load, from the network when possible, else the copy kept from the last visit, else the offline page. */
export type Strategy = "network-only" | "cache-first" | "page";

export interface RequestFacts {
  url: string;
  method: string;
  /** "navigate" for a page load. */
  mode: string;
}

/** Bump a version when a cache's content changes shape: activation then drops the old one. */
export const CACHE_NAMES = { pages: "pages-v1", static: "static-v1" } as const;

/** Shown for a page that was never visited when there is no connection. Kept when the worker installs. */
export const OFFLINE_PAGE = "/offline";

export function strategyFor(request: RequestFacts, appOrigin: string): Strategy {
  if (request.method !== "GET") return "network-only";
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return "network-only";
  // Before the page check: a password-reset email opens /api/auth/reset-password/<token> as a page load.
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return "network-only";
  if (request.mode === "navigate") return "page";
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) return "cache-first";
  // Everything else, such as the data Next.js's router fetches between pages (?_rsc=): a failed one makes the router
  // load the page itself, which the "page" strategy then answers.
  return "network-only";
}

/** The caches an older version of the worker made. */
export function cachesToDelete(cacheNames: readonly string[]): string[] {
  const current: readonly string[] = Object.values(CACHE_NAMES);
  return cacheNames.filter((name) => !current.includes(name));
}
```

`apps/web/src/service-worker/sw.ts`:
```ts
// The service worker, bundled into public/sw.js by scripts/service-worker.ts. It keeps an offline shell: the pages
// visited, the build's files and the icons, and the offline page. strategy.ts decides how each request is answered.
import { CACHE_NAMES, cachesToDelete, OFFLINE_PAGE, strategyFor } from "./strategy";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(CACHE_NAMES.pages)).add(OFFLINE_PAGE);
      // Take over at once: pages come from the network first and the build's files are named by their content, so
      // a new worker never mixes versions.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(cachesToDelete(await caches.keys()).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request, self.location.origin);
  if (strategy === "cache-first") event.respondWith(cacheFirst(event.request));
  else if (strategy === "page") event.respondWith(page(event.request));
  // "network-only": not answered here, so the browser fetches as if there were no worker.
});

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(CACHE_NAMES.static)).put(request, response.clone());
  return response;
}

async function page(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE_NAMES.pages)).put(request, response.clone());
    return response;
  } catch {
    return (
      (await caches.match(request, { cacheName: CACHE_NAMES.pages })) ??
      (await caches.match(OFFLINE_PAGE, { cacheName: CACHE_NAMES.pages })) ??
      Response.error()
    );
  }
}
```

`apps/web/src/service-worker/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2024", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": []
  },
  "include": ["."]
}
```

`apps/web/src/pwa/register-service-worker.ts`:
```ts
// Registers the service worker (src/service-worker), for the whole app. Only production builds do: a worker
// keeping a development build's files would serve stale code. Registration failing leaves the app working, online.

interface NavigatorWithWorkers {
  serviceWorker?: { register: (url: string, options: RegistrationOptions) => Promise<unknown> };
}

/** Returns whether a worker was registered. */
export async function registerServiceWorker(
  navigator: NavigatorWithWorkers,
  nodeEnvironment: string,
): Promise<boolean> {
  if (nodeEnvironment !== "production" || !navigator.serviceWorker) return false;
  try {
    // updateViaCache "none": the browser always asks the server for a newer sw.js, never its HTTP cache.
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return true;
  } catch {
    return false;
  }
}
```

`apps/web/src/pwa/service-worker-registration.tsx`:
```tsx
"use client";

// Registers the service worker once the page has loaded (see register-service-worker.ts).
import { useEffect } from "react";
import { registerServiceWorker } from "./register-service-worker";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    void registerServiceWorker(navigator, process.env.NODE_ENV);
  }, []);
  return null;
}
```

`apps/web/scripts/service-worker.ts`:
```ts
// Bundles the service worker (src/service-worker/sw.ts) into one classic script, public/sw.js, which every browser
// that has service workers can run.
import path from "node:path";
import { build } from "esbuild";

export async function buildServiceWorker(appDirectory: string): Promise<string> {
  const outfile = path.join(appDirectory, "public/sw.js");
  await build({
    entryPoints: [path.join(appDirectory, "src/service-worker/sw.ts")],
    outfile,
    bundle: true,
    format: "iife",
    target: "es2022",
    minify: true,
    logLevel: "warning",
  });
  return outfile;
}
```

In `apps/web/scripts/generate.ts`:

replace:
```ts
// files the app is built from that git doesn't keep, because they come from other packages.
```
with:
```ts
// files the app is built from that git doesn't keep: they come from other packages, or are bundled from our source.
```
replace:
```ts
import { copyBrandIcons } from "./brand-icons.js";
```
with:
```ts
import { copyBrandIcons } from "./brand-icons.js";
import { buildServiceWorker } from "./service-worker.js";
```
replace:
```ts
console.log(`Wrote src/generated/brand.css and ${String(icons.length)} icons in public/icons`);
```
with:
```ts
await buildServiceWorker(appDirectory);
console.log(`Wrote src/generated/brand.css, ${String(icons.length)} icons in public/icons, and public/sw.js`);
```

In `apps/web/.gitignore`:

replace:
```gitignore
/public/icons/
```
with:
```gitignore
/public/icons/
# Bundled by `pnpm generate` from src/service-worker (scripts/service-worker.ts).
/public/sw.js
```

In `apps/web/turbo.json`:

replace:
```json
      "inputs": ["scripts/**", "$TURBO_ROOT$/packages/brand/src/**"],
      "outputs": ["src/generated/**", "public/icons/**"]
```
with:
```json
      "inputs": ["scripts/**", "src/service-worker/**", "$TURBO_ROOT$/packages/brand/src/**"],
      "outputs": ["src/generated/**", "public/icons/**", "public/sw.js"]
```

In `apps/web/tsconfig.json`:

replace:
```jsonc
  "exclude": ["node_modules"]
```
with:
```jsonc
  // The service worker runs in a worker, not a page: src/service-worker/tsconfig.json checks it with the worker's types.
  "exclude": ["node_modules", "src/service-worker"]
```

In `apps/web/package.json`:

replace:
```json
    "typecheck": "next typegen && tsc --noEmit",
```
with:
```json
    "typecheck": "next typegen && tsc --noEmit && tsc --noEmit -p src/service-worker",
```

In `apps/web/next.config.ts`:

replace:
```ts
      { source: "/:path*", headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) },
    ]),
```
with:
```ts
      { source: "/:path*", headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) },
      // The browser checks for a new worker on every visit; the worker's scope is the whole app.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]),
```

In `apps/web/src/app/layout.tsx`:

replace:
```tsx
import { DataProviders } from "@/data/providers";
```
with:
```tsx
import { DataProviders } from "@/data/providers";
import { ServiceWorkerRegistration } from "@/pwa/service-worker-registration";
```
replace:
```tsx
          <Toaster />
        </NextIntlClientProvider>
```
with:
```tsx
          <Toaster />
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
```

- [ ] **Step 4: Run the unit tests and the generator**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec vitest run test/pwa && pnpm --filter @travel-crm/web generate`

Expected: 11 tests pass; the generator prints `Wrote src/generated/brand.css, 7 icons in public/icons, and public/sw.js`.

- [ ] **Step 5: Add the offline page and its messages**

`apps/web/src/i18n/messages/en-IN/pwa.json`:
```json
{
  "offline": {
    "title": "You're offline",
    "body": "This page isn't saved on this device yet. Pages you've opened before still work offline.",
    "tryAgain": "Try again",
    "home": "Go to the home screen"
  }
}
```

(The file was `{}`; this is its whole content.)

`apps/web/src/app/offline/page.tsx`:
```tsx
// The page the service worker shows for an address that was never visited, while there is no connection. It is
// kept when the worker installs, so it needs no network; "Try again" is a plain form, which works without scripts.
import type { Metadata } from "next";
import { WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa.offline");
  return { title: t("title") };
}

export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[40ch] flex-col items-center justify-center gap-4 px-4 text-center">
      <WifiOffIcon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("body")}</p>
      {/* A GET form without an action reloads the address the person tried. */}
      <form className="flex flex-col items-center gap-3">
        <Button type="submit">{t("tryAgain")}</Button>
        <Link href={routes.home} className="text-primary underline-offset-4 hover:underline">
          {t("home")}
        </Link>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Write the offline journeys**

`apps/web/test/e2e/pwa-offline.spec.ts`:
```ts
// The offline shell (spec 11, DESIGN.md: an offline shell and cached last-viewed screens): once the service worker
// controls the app, a screen opened before still opens without a connection, from the saved page and the saved query
// cache, under the offline banner; an address never opened shows the offline page.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "./support/fixtures";

/** Waits for the service worker to be active and to control this page (a reload gives it control). */
async function controlledByServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** How many saved query-cache entries IndexedDB holds (runs in the page). */
function savedQueries(): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("travel-crm");
    opening.onerror = () => {
      reject(opening.error ?? new Error("IndexedDB failed"));
    };
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains("query-cache")) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction("query-cache").objectStore("query-cache").count();
      counting.onsuccess = () => {
        database.close();
        resolve(counting.result);
      };
    };
  });
}

test("the service worker registers and controls the app", async ({ page }) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  const response = await page.request.get("/sw.js");
  expect(response.headers()["cache-control"]).toBe("no-cache");
  expect(response.headers()["service-worker-allowed"]).toBe("/");
});

test("a screen opened before opens offline, with its data and the offline banner", async ({
  page,
  context,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await controlledByServiceWorker(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await expect(page.getByText("You're offline. You see what was last loaded")).toBeVisible();
  await context.setOffline(false);
});

test("an address never opened shows the offline page while offline", async ({ page, context }) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  await context.setOffline(true);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
```

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/web exec playwright test pwa`

Expected: 10 journeys pass (5 tests, phone and desktop). Chromium's offline emulation reaches the service worker: the
third test can only pass if the worker's own fetch fails and it answers with the offline page. Without Step 3 the
journeys time out waiting for `navigator.serviceWorker.ready`.

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm-05a-pwa && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm --filter @travel-crm/web typecheck lint test e2e && pnpm run depcruise`

Expected: green. Web: 56 unit tests; journeys 21 passed, 1 skipped. `next build` lists `/offline` and
`/manifest.webmanifest` as static.

```bash
cd /Users/ak/personal/travel-crm-05a-pwa
git add apps/web/.gitignore apps/web/next.config.ts apps/web/package.json apps/web/scripts/generate.ts apps/web/scripts/service-worker.ts apps/web/src/app/layout.tsx apps/web/src/app/offline/page.tsx apps/web/src/i18n/messages/en-IN/pwa.json apps/web/src/pwa apps/web/src/service-worker apps/web/tsconfig.json apps/web/turbo.json apps/web/test/e2e/pwa-offline.spec.ts apps/web/test/pwa/registration.test.ts apps/web/test/pwa/strategy.test.ts
git commit -m "feat(web): an offline shell from a service worker that keeps pages and build files, not api data"
```

The track is ready to merge (Task I1).

---

## Integration

### Task I1: Merge the tracks, and record the web app's decisions

**Files:**
- Merge: `foundation/05a-account`, `foundation/05a-organization`, `foundation/05a-pwa`
- Modify: `apps/web/test/e2e/support/organization-two-factor.ts` (one authenticator-code helper for every journey),
  `apps/web/README.md`, `CLAUDE.md`, `docs/adr/README.md`
- Create: `docs/adr/0018-web-app.md`

**Interfaces:**
- Consumes: every track's last commit; Track A's `totpCode(secret, now?)` and `secretOf(totpUri)`
  (`test/e2e/support/totp.ts`).
- Produces: `foundation/05a-web` with the whole plan, ready to merge after plan 3.

- [ ] **Step 1: Merge the tracks**

```bash
cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null
git merge --no-ff foundation/05a-account -m "chore: merge foundation/05a-account (the account screens)"
git merge --no-ff foundation/05a-organization -m "chore: merge foundation/05a-organization (the staff, roles and settings screens)"
git merge --no-ff foundation/05a-pwa -m "chore: merge foundation/05a-pwa (installable, with an offline shell)"
pnpm install --frozen-lockfile && pnpm --filter @travel-crm/web generate
```

Expected: every merge is textually clean (the tracks' files are disjoint); the lockfile is unchanged by the merges.

- [ ] **Step 2: One authenticator-code helper**

Tracks A and O each needed an authenticator's code in their journeys and couldn't share one while they ran apart.
Replace `apps/web/test/e2e/support/organization-two-factor.ts` with (Track A's `totp.ts` computes the code):
```ts
// Two-factor sign-in for the settings journeys: turns it on for the signed-in person through Better Auth's endpoints,
// with the code an authenticator app would show.
import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";
import { secretOf, totpCode } from "./totp";

/** Turns two-factor on for whoever `request` is signed in as. Returns the secret, for later codes. */
export async function turnOnTwoFactor(request: APIRequestContext, password: string): Promise<string> {
  const headers = { origin: process.env.E2E_BASE_URL ?? "" };
  const enabled = await request.post("/api/auth/two-factor/enable", { data: { password }, headers });
  expect(enabled.status()).toBe(200);
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  const secret = secretOf(totpURI);
  const verified = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totpCode(secret) },
    headers,
  });
  expect(verified.status()).toBe(200);
  return secret;
}
```

- [ ] **Step 3: Record the decisions**

`docs/adr/0018-web-app.md`:
````markdown
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
````

In `docs/adr/README.md`, after the row for 0017, add:
```markdown
| [0018](0018-web-app.md)                   | The web app: same origin, the api's types only, brand tokens, the saved cache, the PWA     |
```

At the end of `CLAUDE.md`, after the repo map, add:
```markdown

## The web app (`apps/web`, ADR 0018)

- `pnpm --filter @travel-crm/web dev` runs it on http://localhost:3000 with the api on :3001 (`/api/*` is rewritten to
  `API_ORIGIN`). `pnpm e2e` runs the journeys against a real api and Postgres; once per machine, first run
  `pnpm --filter @travel-crm/web exec playwright install chromium`. `pnpm check` runs them too.
- It imports the api's types only (`import type { AppRouter }`); at run time just the brand, the contracts' schemas
  and the kernel's formatting. Data comes from tRPC hooks (`useTRPC()`); server-rendered HTML holds no organization
  data, because the service worker keeps pages for offline use.
- Colours come from the brand's tokens (`bg-canvas`, `text-status-bad-ink`, shadcn's `bg-primary`...), never a literal;
  a test refuses `#hex`, `rgb()` and Tailwind's palette. DESIGN.md holds the design rules; its palette must equal
  `brand.colours`.
- Every word on screen is a next-intl message in the feature's file in `src/i18n/messages/en-IN/`; a refusal shows the
  sentence for its reason (`errors.json`, `useErrorMessage()`).
- shadcn components: `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`, then the checks in
  `src/components/ui/README.md`.
- Never show a `.invalid` email, and never read people from Better Auth's `/get-session`: `me.get` says who is signed
  in. Hiding a button is a convenience; the api checks every call.
```

Replace `apps/web/README.md` with:
````markdown
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
````

- [ ] **Step 4: Check everything and commit**

Run: `cd /Users/ak/personal/travel-crm-05a && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm format && pnpm run format:check && pnpm exec turbo run typecheck lint test e2e --concurrency=3 && pnpm run depcruise`

Expected: green, 29 Turborepo tasks, no dependency violations. Test counts: api-server 98, api 5, brand 25,
contracts 68, db 179, domain 400, eslint-config 65, integrations 117, web 104 (1,061); journeys 63 passed and 1
skipped (the prefetch journey on the phone project).

```bash
cd /Users/ak/personal/travel-crm-05a
git add apps/web/test/e2e/support/organization-two-factor.ts apps/web/README.md CLAUDE.md docs/adr/README.md docs/adr/0018-web-app.md
git commit -m "docs: record the web app's decisions, and share one authenticator-code helper"
```

---

## After the last task

The controller (not an implementer):

1. Proves the branch from a clean clone, as CI will:
   ```bash
   cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
   rm -rf /private/tmp/travel-crm-plan5a-clean && git clone -q /Users/ak/personal/travel-crm /private/tmp/travel-crm-plan5a-clean
   cd /private/tmp/travel-crm-plan5a-clean && git checkout -q foundation/05a-web
   pnpm install --frozen-lockfile && pnpm --filter @travel-crm/web exec playwright install chromium && pnpm check
   ```
   Expected: the counts of Task I1. Then `rm -rf /private/tmp/travel-crm-plan5a-clean`.
2. Requests a whole-branch review, with DESIGN.md beside it and screenshots of each screen on a phone and a desktop.
3. After plan 3 is merged into `main`, merges this branch (see "Shared files and merge notes"), regenerates the
   lockfile, runs `pnpm check`, then removes the worktrees and branches:
   `for track in account organization pwa; do git worktree remove ../travel-crm-05a-$track && git branch -d foundation/05a-$track; done`
   and `git worktree remove ../travel-crm-05a` once `foundation/05a-web` is merged.
4. Carries these forward:
   - **After plan 3's Task I3 merges:** a journey through the real reset email (Mailpit): ask for a reset, open the
     link from the email, choose a password, sign in with it.
   - **After plan 4 merges** (names in "Shared files and merge notes"): filter `visibleNavigationItems` by
     `subscription.get`'s `modules` through each item's `module`; the past-due and read-only banners in
     `src/shell/banners.tsx` (`nextChangeOn` gives "N days left"); write buttons disabled with the reason in
     `read_only`; sentences in `errors.json` for `ORGANIZATION_READ_ONLY`, `ORGANIZATION_SUSPENDED`,
     `ORGANIZATION_CANCELLED` and `MODULE_NOT_ON_PLAN`; the settings screens for the profile, GST, branding and the
     setup checklist over `organization.profile`, `organization.branding` and `organization.setup`; a
     `/api/platform/:path*` rewrite to the console process (port 3002 locally) before the `/api/:path*` one.
   - **Plan 5, later parts:** the platform console; the bell, notification preferences and web push (the browser
     needs `VAPID_PUBLIC_KEY`; the service worker gains `push` and `notificationclick`); uploads; share links; the
     audit viewer; the typed list of every refusal reason (`@travel-crm/contracts/errors`), replacing
     `errors.json`'s hand-kept list; field-level errors from the api (today forms validate with the contracts before
     sending, and a refusal shows one message).
   - **Release:** the web Docker image (copy `.next/standalone`, `.next/static` and `public`, as
     `test/e2e/support/servers.ts` does), a load-balancer rule for `/api/*` or a runtime proxy route if the platform
     can't route by path, `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` set to the app's address, `AUTH_TRUSTED_PROXIES`;
     a Lighthouse run for performance and accessibility in CI; a check on a real iPhone and Android phone.
   - **For the product owner to confirm:** DESIGN.md's first draft as committed; the two-factor screen's "Don't ask
     again on this device for 30 days" where an organization requires two-factor (Better Auth's default; remove it or
     shorten `trustDeviceMaxAge` if not wanted).
