# Fast screens: request checks, browser cache, polling and the service worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take production screens from 5–13 s to about 1–2 s without changing the database or its host.

**Architecture:** The api resolves a member's access and the subscription's stored facts once per request and keeps
them in process memory for 5 minutes; the browser keeps slow-changing data for 10 minutes, polls less, streams batch
results and starts dependent queries together; the service worker refreshes its shells only for a new build.

**Tech Stack:** tRPC 11.19 (`httpBatchStreamLink`, `splitLink`), TanStack Query 5, Hono, Prisma 7.10, Vitest, Next.

**Spec:** the owner's decisions of 2026-11-02 below (production audit in session "optimizer-agent"; memory
`perf-audit-2026-11-02`).

## Spec: what was measured and what the owner decided

Measured on www.veeper.in (main 077d7a8e), browser → Vercel → Oracle micro VM (Mumbai) → Neon (Singapore, ~68 ms a
round trip):

- Every agency call costs ~1.3–1.5 s before its handler: ~15–19 sequential round trips (impersonation re-check,
  `resolveAccess` in its own `forOrg`, `recordActivity`, `entitlementsOf` in another `forOrg` with time zone and
  policy reads, then the handler's `forOrg`). A batch repeats them for every procedure in it. A 400 still costs 1.5 s.
- Pool 5; each tab polls `salesInbox.summary` every 15 s (staleTime 0), the bell every 60 s, `usage.track` every 30 s
  and twice per navigation: calls queue for 5–20 s.
- The service worker refreshes ~50 shells (~360 KB each) after every page load; after a deploy it held page HTML
  10–18 s and scripts ~10 s.
- Client N+1: every desktop Call button mounts `CallNoteDialog`, which fetches `leads.get` at once (20–25 on Today).
- Waterfalls: Home (`me.get` → 10-call batch → `quotes.moneySummary`), lead page (`leads.get` → 11 panels), Reports,
  Inbox, the console's organization page; the console dashboard loops organizations one by one (10–12 s for 7); the
  console log fetches `organizations.get` once per organization.
- Bugs: no request timeout (a hung call leaves a skeleton for 40+ s); "Good evening, Mr." for titled names; Home's
  "Today at a glance" shows 0 while loading; opening a lead page while impersonating marks its chat read.

Owner's decisions:

1. Cache a member's role and permissions and the subscription for up to 10 minutes; we use **5 minutes** (the
   database saving flattens past ~2 minutes and a console change applies sooner). Changes made in the app apply at
   once; console changes within 5 minutes. Money, roles and exports stay fresh (`freshProcedure`).
2. The database and its host stay as they are. Pool size, VM size and region are deploy-agent items, not this plan.
3. Page visits move to PostHog later (ADR to come), so `usage.track` only gets cheaper here, not rewritten.
4. PostHog, Sentry and the other tools are a later to-do (the "Later" section), not this plan.

## Global Constraints

- Everything in `CLAUDE.md`, `docs/agent-playbook.md` and `DESIGN.md` holds; nothing here relaxes a data rule.
- Every tRPC call stays a POST with its input in the body (`methodOverride: "POST"` on every link).
- `ACCESS_CACHE_TTL_MS = 5 * 60_000`, `ACCESS_CACHE_MAX_ENTRIES = 5_000`, `SLOW_DATA_STALE_MS = 10 * 60_000`,
  `QUERY_TIMEOUT_MS = 30_000`, `INBOX_SUMMARY_POLL_MS = 60_000` off the Inbox (15 s on it, as now),
  `PAGE_TRACK_BEAT_MS = 120_000`, `ACTIVITY_STEP_MS` (a day) as now.
- No new runtime dependency. No `any`, no `!`. Each new file starts with a one-line comment saying what it is for.
- Commits: Conventional Commits, files staged by name, no `--no-verify`, no `Co-Authored-By` trailer.

## Review Focus

1. A member removed or demoted in the app must lose access on their very next call (cache cleared by the mutation).
2. A member told to change their password must get in right after changing it (an access with a pending step is
   never cached).
3. A trial or payment date passing must change what the subscription allows at that minute, not 5 minutes later
   (the cache holds stored facts; the state is computed from them with the clock on every call).
4. A query that hangs must end in the screen's error state with Try again within 30 s; a mutation is never timed
   out or retried (it may have landed).
5. Streaming must not drop a refusal: a 401 still signs the person out and a pending step still redirects.

Each line is pinned by a test in the task that owns it (S3: 1–3, W1: 4–5).

## Tracks and file ownership

Builders work in their own worktree and branch from `perf/fast-screens`; a change to another track's file goes under
"Needs from others". Run at most two DB-backed tracks at once (Docker has 8 GB).

| Track | Branch | Owns |
|---|---|---|
| S: server checks | `perf/s-checks` | `packages/api/src/{procedures,context,access-cache}.ts`, `apps/api/src/app.ts` (cache wiring only), `packages/domain/src/subscriptions/{state,entitlements,index}.ts`, `packages/domain/src/identity/{member-activity,identity}.ts`, the inbox module's mark-read function, their tests |
| W: web data | `perf/w-web` | `apps/web/src/data/**`, `apps/web/src/console/data/console-trpc.ts`, `apps/web/src/usage/**`, `apps/web/src/inbox/use-sales-inbox.ts`, `apps/web/src/leads/lead/use-lead.ts`, `apps/web/src/leads/call/**`, the Home and lead-page screen files the waterfalls touch, the greeting and glance-tile files, their tests |
| SW: service worker | `perf/sw-shells` | `apps/web/src/service-worker/**`, `apps/web/scripts/service-worker.ts`, their tests |
| C: console | `perf/c-console` | `packages/domain/src/platform/{dashboard,log*}.ts`, `packages/api/src/platform/routers/{operations,log*}.ts`, `packages/contracts/src/platform/**` (log output only), `apps/web/src/console/{dashboard,log,organizations}/**`, their tests |

Order: S and SW first (SW is unit tests only), W in parallel once S's interfaces are fixed (W needs none of S's code),
C after S merges.

---

## Track S: server checks

### Task S1: Subscription facts, loaded once and computed with the clock

**Files:**
- Modify: `packages/domain/src/subscriptions/state.ts`, `packages/domain/src/subscriptions/entitlements.ts`,
  `packages/domain/src/subscriptions/index.ts`
- Test: `packages/domain/test/subscriptions/entitlements.test.ts`

**Interfaces:**
- Produces:
  - `interface SubscriptionFacts { row: StoredSubscription; timeZone: string; policy: SubscriptionPolicy }`
  - `loadSubscriptionFacts(tx: OrgTx, organizationId: string): Promise<SubscriptionFacts | null>` (3 reads, as today)
  - `subscriptionTodayFrom(facts: SubscriptionFacts, now: Date): SubscriptionToday` (pure);
    `subscriptionToday(tx, row, now)` keeps its signature and uses it
  - `entitlementsFrom(facts: SubscriptionFacts, now: Date): Entitlements` (pure); `entitlementsOf(tx, id, now)` keeps
    its signature: load, then `entitlementsFrom`
  - `SubscriptionAccess` gains `factsOf(organizationId: string): Promise<SubscriptionFacts | null>` (one `forOrg`)

- [ ] **Step 1: Write the failing tests** in `entitlements.test.ts`:
  `"entitlementsFrom gives what entitlementsOf gives"` (seeded trial org, same `now`: deep-equal), and
  `"a trial ends at its day with facts loaded before it"`: load facts on the trial's last day, then
  `entitlementsFrom(facts, <first instant of the day after trialEndsOn in the org's zone>).status` is the status
  `dueState` gives for that day (not `"trial"`), with no further database read.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain test -- subscriptions/entitlements` → FAIL (not exported).
- [ ] **Step 3:** Implement the functions above; no behaviour change for existing callers.
- [ ] **Step 4:** Same command → PASS, and the whole `subscriptions` folder passes.
- [ ] **Step 5:** Commit `refactor(domain): load a subscription's facts once and compute its state from them`.

### Task S2: The access cache

**Files:**
- Create: `packages/api/src/access-cache.ts`
- Test: `packages/api/test/access-cache.test.ts` (pure unit test, no database)

**Interfaces:**
- Consumes: `MemberAccess`, `pendingStep` (`@travel-crm/domain/identity`); `SubscriptionFacts` (S1).
- Produces:
  ```ts
  export const ACCESS_CACHE_TTL_MS = 5 * 60_000;
  export const ACCESS_CACHE_MAX_ENTRIES = 5_000;
  export interface MemberKey { userId: string; organizationId: string; impersonatedBy: string | null }
  export interface AccessCache {
    member(key: MemberKey, load: () => Promise<MemberAccess | null>, options?: { fresh?: boolean }): Promise<MemberAccess | null>;
    subscription(organizationId: string, load: () => Promise<SubscriptionFacts | null>, options?: { fresh?: boolean }): Promise<SubscriptionFacts | null>;
    forgetOrganization(organizationId: string): void;
  }
  export function createAccessCache(options: { ttlMs: number; maxEntries: number; now?: () => number }): AccessCache;
  /** ttlMs 0: every call loads (the default for tests and for any caller that passes none). */
  export const noAccessCache: AccessCache;
  ```
- Rules: concurrent misses for one key share one in-flight promise; a rejected load is not kept; a `null` member and a
  member with `pendingStep(access) !== null` are returned but not kept; `fresh` always loads and replaces; the TTL
  runs from when the load resolved; past `maxEntries` the least recently used entry goes; `forgetOrganization` drops
  that organization's members and subscription only.

- [ ] **Step 1: Write the failing tests**, one `it` per rule above, with a fake `now` and a counting `load`:
  hit within 5 min loads once; at 5 min + 1 ms loads again; two concurrent misses load once; a rejection is retried
  next call; null and pending-step members load every call; `fresh` loads every call; `forgetOrganization("a")`
  reloads `a` and keeps `b`; with `maxEntries: 2`, touching `x`, `y`, `x`, then `z` evicts `y`.
- [ ] **Step 2:** `pnpm --filter @travel-crm/api test -- access-cache` → FAIL.
- [ ] **Step 3:** Implement with one `Map` per kind (insertion order as the LRU: delete and re-set on a hit).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(api): keep members' access and subscriptions in memory for five minutes`.

### Task S3: Use the cache in every organization procedure

**Files:**
- Modify: `packages/api/src/procedures.ts`, `packages/api/src/context.ts` (`ApiDependencies.accessCache?:
  AccessCache`, default `noAccessCache`; on the context as `accessCache`), `apps/api/src/app.ts` (one
  `createAccessCache({ ttlMs: ACCESS_CACHE_TTL_MS, maxEntries: ACCESS_CACHE_MAX_ENTRIES })` per process, passed in)
- Test: `packages/api/test/access-cache-checks.test.ts` (database-backed, like `request-checks.test.ts`)

**Interfaces:**
- Consumes: S1's `factsOf`/`entitlementsFrom`, S2's `AccessCache`.
- Produces: no new exports; `memberAccessFor` keeps its result shape.

Behaviour of `memberAccessFor`:
- Loads the member (`ctx.accessCache.member`) and the subscription facts (`ctx.accessCache.subscription`) **together**
  (`Promise.all`; the organization id is the session's), then `entitlementsFrom(facts, new Date())`.
- `freshMember` passes `{ fresh: true }` to both.
- `recordActivity` stays where it is (S4 makes it cheap).
- A middleware on both member chains calls `ctx.accessCache.forgetOrganization(organizationId)` after a **mutation**
  that succeeded (`const result = await next(); if (type === "mutation" && result.ok) …`).
- Update the file's and `access.ts`'s header comments: access is read from the database at most every 5 minutes,
  at once after any change made through the api, and always for `freshProcedure`.

- [ ] **Step 1: Write the failing tests** (pass a real `createAccessCache` with a fake clock):
  - `"a batch resolves the member once"`: three org queries in one request → `identity.resolveAccess` called once.
  - `"a second request within five minutes reads nothing again"` → still once.
  - `"a role changed through the api applies to the next call"`: owner demotes a member via the staff/roles mutation;
    the member's next call to a procedure the old role allowed → `FORBIDDEN MISSING_PERMISSION`.
  - `"a member removed through the api is refused at once"` → `NOT_A_MEMBER`.
  - `"a role changed outside the api applies within five minutes"`: update the member row directly; next call still
    allowed; advance the clock 5 min + 1 ms; refused.
  - `"a pending password change is never cached"`: member with `mustChangePassword`, gets `CHANGE_PASSWORD`; clear the
    flag in the database; the next call passes with no clock change.
  - `"a trial ends at its minute"`: facts cached on the last trial day; advance the clock past the end of the day
    (and grace, per the seeded policy); a change call follows the new state without a reload.
  - `"freshProcedure always reads the member"` → `resolveAccess` called on every call.
- [ ] **Step 2:** `pnpm --filter @travel-crm/api test -- access-cache-checks` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** That file and `request-checks`, `impersonation-checks`, `procedure-modules`, `context` → PASS.
- [ ] **Step 5:** Commit `perf(api): resolve access once per request and reuse it for five minutes`.

### Task S4: Note member activity at most once a day per process

**Files:**
- Modify: `packages/domain/src/identity/member-activity.ts`, `packages/domain/src/identity/identity.ts`
- Test: the identity test that covers `recordMemberActivity` (add to it)

**Interfaces:**
- Produces: `createActivityRecorder(database: IdentityDatabase, options?: { now?: () => Date; maxEntries?: number }):
  (access: MemberAccess) => Promise<void>`; `identity.recordActivity` uses one recorder per identity instance.
  It skips the UPDATE when this recorder wrote for that member less than `ACTIVITY_STEP_MS` ago (bounded map,
  default 10 000, oldest out); impersonation still writes nothing.

- [ ] **Step 1: Failing test** `"a busy member costs one update a day"`: two calls 1 min apart → one `updateMany`
  (spy); a call `ACTIVITY_STEP_MS` later → a second.
- [ ] **Step 2:** run the identity tests → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `perf(domain): note a member's activity at most once a day per process`.

### Task S5: Support's impersonation never marks a chat read

**Files:**
- Modify: the inbox module's mark-read function (find it from `inbox.markRead` in `packages/api/src/routers`)
- Test: the inbox domain test of mark-read (add to it)

- [ ] **Step 1: Failing test** `"impersonation leaves a chat unread"`: unread conversation; `markRead` with an access
  whose `impersonatedBy` is set → unread count unchanged, returns normally.
- [ ] **Steps 2–4:** run → FAIL, implement (return early, as `trackVisit` does), run → PASS.
- [ ] **Step 5:** Commit `fix(domain): leave chats unread when support opens them`.

---

## Track W: web data

### Task W1: Links: stream queries, time them out, keep mutations and page visits apart

**Files:**
- Create: `apps/web/src/data/links.ts`
- Modify: `apps/web/src/data/trpc.ts`, `apps/web/src/console/data/console-trpc.ts`
- Test: `apps/web/test/data/links.test.ts`, and keep the existing test that reads a query's input from the body

**Interfaces:**
- Produces: `QUERY_TIMEOUT_MS = 30_000`; `apiLinks(url: string): TRPCLink<AnyRouter>[]`:
  `splitLink` → `usage.track` to `httpLink`; other mutations to `httpBatchLink`; queries to `httpBatchStreamLink`
  whose `fetch` adds `AbortSignal.any([init.signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)])`. All three with
  `methodOverride: "POST"`. Both clients use `apiLinks("/api/trpc")` / `apiLinks("/api/platform/trpc")`.

- [ ] **Step 1: Failing tests** with a stubbed `fetch`: two queries in one tick → one POST, request header
  `trpc-accept: application/jsonl`, inputs in the body; a mutation → POST without that header; `usage.track` → its
  own POST to `/api/trpc/usage.track`; a query whose fetch never answers rejects after `QUERY_TIMEOUT_MS` (fake
  timers); a mutation is not timed out; a streamed 401 for one query and data for another → the 401 surfaces as
  `refusalOf(error).status === 401` and the other resolves.
- [ ] **Step 2:** `pnpm --filter @travel-crm/web test -- data/links` → FAIL. **Step 3:** implement. **Step 4:** PASS,
  plus the existing data tests.
- [ ] **Step 5:** Commit `perf(web): stream query batches and give up on a hung query after 30 seconds`.

### Task W2: Keep slow-changing data for 10 minutes

**Files:**
- Modify: `apps/web/src/data/query-client.ts` (and the console's query client if it builds its own)
- Test: `apps/web/test/data/query-client.test.ts`

**Interfaces:**
- Produces: `SLOW_DATA_STALE_MS = 10 * 60_000`; `SLOW_DATA: readonly string[]` = the tRPC paths `me.get`,
  `subscription.get`, `organization.logo.forShell`, `roles.list`, `staff.list`, `leads.owners`, `settings.get`,
  `quotes.settings`, `inbox.status`, `inbox.tags`, `usage.welcome`, `me.ownPassword`, `organization.setup.get`, and in
  the console `whoAmI`, `plans.list`, `plans.policy`, `platformStaff.list`; each gets
  `setQueryDefaults([[...path.split(".")]], { staleTime: SLOW_DATA_STALE_MS, refetchOnWindowFocus: false })`.
  Check the key shape `trpc.<path>.queryKey()` produces and match it. Changes made in the app already invalidate
  these (`useRefreshWork`, mutations' `onSuccess`): confirm for roles, staff, settings and the logo, and add an
  invalidation where one is missing.

- [ ] **Step 1: Failing test**: `queryClient.getQueryDefaults(trpc.subscription.get.queryKey()).staleTime ===
  SLOW_DATA_STALE_MS` for each listed path; `leads.list` keeps 30 s.
- [ ] **Steps 2–4:** run → FAIL, implement, run → PASS. **Step 5:** Commit `perf(web): keep slow-changing data for ten minutes`.

### Task W3: Poll less and track page visits cheaply

**Files:**
- Modify: `apps/web/src/inbox/use-sales-inbox.ts`, `apps/web/src/usage/page-tracker.tsx`
- Test: `apps/web/test/inbox/…` and `apps/web/test/usage/page-tracker.test.tsx` (create if absent)

**Interfaces:**
- `useInboxSummary()` polls every `INBOX_SUMMARY_POLL_MS = 60_000` unless the pathname starts with `/inbox` (then
  `INBOX_POLL_MS`, 15 s); `staleTime` 15 s instead of 0.
- `PageTracker`: no report when a page opens; reports when it closes, when the tab hides, and every
  `PAGE_TRACK_BEAT_MS = 120_000` while visible; sends nothing while `me.get` says `impersonatedBy` is set.

- [ ] **Step 1: Failing tests**: summary interval 60 000 on `/leads`, 15 000 on `/inbox`; tracker with fake timers →
  no call on mount, one after 120 s, one on unmount, none at all when impersonating.
- [ ] **Steps 2–4**, **Step 5:** Commit `perf(web): poll the inbox count once a minute and report page visits every two minutes`.

### Task W4: The call dialog loads its lead only when it opens

**Files:**
- Modify: `apps/web/src/leads/lead/use-lead.ts` (`useLead(leadId: string, options?: { enabled?: boolean })`),
  `apps/web/src/leads/call/call-note-dialog.tsx` (`useLead(leadId, { enabled: held.open })`)
- Test: the call-note dialog's test (add to it)

- [ ] **Step 1: Failing test** `"a closed call dialog asks for nothing"`: render `CallButton` (wide) for a lead →
  no `leads.get` request; open the dialog → one.
- [ ] **Steps 2–4**, **Step 5:** Commit `perf(web): load a lead for the call dialog only once it opens`.

### Task W5: Start dependent queries together

**Files:** the components that gate them (find each with the network list below): Home's money tile and AI status,
the lead page's panels, Reports' second batch, the Inbox's conversations and owners.
- Test: one test per screen asserting the queries are all requested in the first render's batch (a stubbed `fetch`
  that records paths), where the screen has a component test; otherwise the measurement in Task V.

**Interfaces:**
- Lead page: `LeadScreen` prefetches every panel's query from the route's `leadId` (`queryClient.prefetchQuery` with
  the same `queryOptions` the panels use) in the same render that asks for `leads.get`; the panels keep their own
  `useQuery`. Same pattern for the others: prefetch where the gate is only "wait for the parent", keep a gate that
  is a real rule (a module not on the plan, a permission the role lacks) — W2 makes those gates answer from cache.

- [ ] **Step 1:** record the first-render requests per screen in a test → FAIL (second batch missing).
- [ ] **Steps 2–4**, **Step 5:** Commit `perf(web): start each screen's queries together`.

### Task W6: Two small bugs on Home

**Files:** the greeting's and the glance tiles' components (Home, `apps/web/src/dashboard/…`)
- Test: their existing tests (add to them)

- [ ] **Step 1: Failing tests**: greeting for "Mr. Anish Sharma" → "Anish"; for "Dr. Meena Iyer" → "Meena"; for
  "Ayush" → "Ayush" (titles: Mr, Mrs, Ms, Miss, Dr, Shri, Smt, Kumari, with or without a dot, any case). A tile while
  its query is loading shows the registry Skeleton, not "0".
- [ ] **Steps 2–4**, **Step 5:** Commit `fix(web): greet people by name, not title, and show no zeros while Home loads`.

---

## Track SW: service worker

### Task SW1: Refresh shells only for a new build, a few at a time

**Files:**
- Modify: `apps/web/src/service-worker/sw.ts`, `apps/web/scripts/service-worker.ts` (bundle a `BUILD_ID` constant:
  the Next build id or the commit, so every deploy changes `sw.js`)
- Test: the service worker's existing tests in `apps/web/test/` (shells/strategy), add to them

**Interfaces:**
- `keepShells()` runs at install (as now) and no longer after every page load; a page load that the network answered
  triggers it only when the stored build id differs from `BUILD_ID` (kept in the pages cache under a fixed key).
- `refreshShells` fetches shells and files with a concurrency of 4, never all at once.

- [ ] **Step 1: Failing tests**: the bundled worker contains the build id; `sw.js` differs between two build ids; a
  page load with the same build id starts no shell fetch; with a different one it starts them, at most 4 in flight.
- [ ] **Steps 2–4**, **Step 5:** Commit `perf(web): refresh the offline shells only for a new build, four at a time`.

---

## Track C: console

### Task C1: The dashboard in one pass, the log with names

**Files:**
- Modify: `packages/domain/src/platform/dashboard.ts`, the log listing in `packages/domain/src/platform/`,
  `packages/contracts/src/platform/` (log entry output gains `organizationName: z.string().nullable()`),
  `apps/web/src/console/log/**` (use it; drop the per-organization `organizations.get`)
- Test: `packages/domain/test/platform/dashboard.test.ts` (or where `organizationsOverview` is tested), the log's tests

**Interfaces:**
- `organizationsOverview` returns exactly what it returns today. Replace the per-organization loop with set-based
  reads in one platform transaction where the platform role may read those tables directly (subscriptions with plans,
  time zones, policy, bytes stored, counts since each organization's month start). Where a count must run as the
  runtime role under row-level security (`asOrganization`), keep that step per organization but run them
  concurrently up to the console's pool size (3), never one by one.
- Console client: `dashboard.organizations` and `dashboard.incidents` get `staleTime: 60_000`.
- Console organization page: `organizations.get`, `organizations.members` and `whatsapp.get` are asked for in the same
  render (prefetch from the route's id), not one after another; `whatsapp.get` stops polling unless a number is being
  connected.

- [ ] **Step 1: Failing tests**: same output as before for three seeded organizations (snapshot of today's result);
  a test that counts transactions: one, or at most `ceil(n / 3)` waves; the log's entries carry their organization's
  name; the console log screen makes no `organizations.get` call.
- [ ] **Steps 2–4**, **Step 5:** Commit `perf(console): build the dashboard in one pass and name organizations in the log`.

---

## Task V: Verify and measure (controller)

- [ ] Local gate per track: format, typecheck, lint, depcruise, the touched packages' tests, the key journeys on phone
  (`today`, `leads`, `inbox`, a lead page, console dashboard). Full `pnpm check` runs on GitHub CI.
- [ ] Merge the tracks into `perf/fast-screens`, push it; the owner opens the PR and merges.
- [ ] After the deploy, re-measure the same screens on www.veeper.in as the 2026-11-02 audit did and report the
  before/after table.

## Later (owner's to-do, not this plan)

- **PostHog** (EU cloud, through a `/ingest` rewrite, autocapture off): page views and named events per member and
  agency; replaces `usage.track` and the console's Usage screen. Needs an ADR, a CSP entry, a privacy-policy line.
- **Sentry**: errors and tRPC/Prisma timings in the api and the web app; alerts on hangs and dropped requests.
- **Uptime checks** (Better Stack or UptimeRobot, free): `/api/auth/ok` and the console's health, with alerts.
- **VM metrics** (Grafana Cloud free or Netdata): memory, swap and CPU on both micro VMs (the api server had 561 MB in
  swap on 2026-11-02).
- **Slow-query view**: `pg_stat_statements` / Neon's query insights.
- **Deploy-agent items**: pool size 5 → 10 once the load drops; a bigger VM (A1 on Pay As You Go); database and api in
  one region (owner: not now).

## Ledger

Rulings go here as `Ruling: <what> — <why> — <cost if wrong>`.

- Ruling: one plan file holds the spec — the owner decided in conversation and the audit is in memory — a later reader
  must read both.
- Ruling: TTL 5 min, not 10 — DB saving is flat past ~2 min — console changes take up to 5 min.
- Ruling: impersonation keeps its per-request session re-check — only support pays it and it guards support access —
  support's calls stay ~0.3 s slower.
- Ruling: clear the organization's cache after any successful member mutation, not per write point — covers every
  identity change without listing them — one extra lookup per active member after each change.
