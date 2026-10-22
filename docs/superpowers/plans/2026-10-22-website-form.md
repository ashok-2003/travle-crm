# Website Enquiry Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> The plan runs as **one shared-first branch, then four parallel track branches, then one closing branch** (see "Branches
> and merge order"). Builders of a track edit only the files their track owns.

**Goal:** Every agency gets one enquiry form it can share by link and paste into its own website. A visitor's answer
becomes a lead in seconds, through the one save path of release 1, with no duplicates, no leak of who is a customer, and
spam kept out without losing real people.

**Architecture:**

- **A new L0 domain module, `website-forms`,** holds the settings row, the key, the open check (`assertFormOpen`), the
  signed opened-token, the ledger and its counts, the limits and the text checks. It imports no crm and no catalog.
  **crm (L1)** gains `receiveWebsiteEnquiry` and the consent ledger, over `saveEnquiry`, which becomes usable by a
  system actor and learns `unverified`.
- **Public routes are plain Hono routes** in the api (`/api/public/website-forms/...`, `/api/public/client-address`),
  not tRPC, same-origin by design (no CORS), rate-limited per address and per agency by a form-only address reader
  (`PUBLIC_FORM_PROXY_HOPS`). A `BotCheck` port (ADR 0008) fronts Cloudflare Turnstile.
- **The pages are in the web app and client-rendered** (`/f/[key]`, `/embed/[key]`, static `/embed.js`), so they work
  through the pilot api's cold start and stay out of the service worker, IndexedDB and every cookie. One form
  component serves the hosted page, the embed and the settings Preview.
- **Settings** are tRPC (`websiteForm.*`) behind `leads:create` + `settings:manage`; the screens sit under
  `/settings/lead-sources/website-form`.

**Tech Stack:** The Foundation's and releases 1 to 2's, unchanged. **No new package.** No new registry component beyond
what `components/ui` holds (Task C0 checks: `Switch`, `Select`, `Tabs`, `ToggleGroup`, `Checkbox`, `Textarea`,
`InputGroup`, `Card`, `Item`, `Alert`); any missing one is added with `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`.

**Spec:** `docs/superpowers/specs/2026-10-22-website-form-design.md` is the authority (rules W1-W42, sections 0-17;
section 0.1 is the owner's three answers). Screens: `2026-10-22-website-form-screens.html`; where it and the text
differ, the text wins. Builds on release 1 (`saveEnquiry`, blocking, Returning), the bulk spec (B15, B16, B26), the
Sheets spec and release 4's assignment code (`chooseOwner`, `assign` on `saveEnquiry`). Inputs: `CLAUDE.md`,
`DESIGN.md`, ADR 0028, `docs/agent-playbook.md`, `docs/ui-build-loop.md`.

## Global Constraints

Every task's requirements include these.

- **Shell and Node.** Start every shell command with `cd <worktree> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
  Never touch `/Users/ak/personal/travel-crm` (the owner's `main`; only the controller merges there), ports 3000-3002 or
  the owner's `travel-crm-*` containers. Never `pnpm dev`, `pnpm services:up` or a bare `docker compose` in a worktree;
  tests start their own containers. Every worktree sets its own `COMPOSE_PROJECT_NAME` (`scripts/dev/compose.sh
  --print-name` first).
- **Git.** Never `git stash`, never `--no-verify`, never push. Stage files by name (never `-A`, `.`, `-a`).
  Conventional Commits, header at most 100 characters, no `Co-Authored-By` trailer, never a `.env`.
- **Test first.** Every task writes its failing test, sees it fail, then writes the code. "Done" is the task's gate green.
- **Gates are narrow.** A task runs only the commands in its **Gate**, in the foreground, under 10 minutes a call.
  At most **two** builders run Docker tests at once (the machine has 8 GB). The one full gate is the closing task, F9.
- **Migrations are applied by hand, never on deploy** (`docs/serverless.md`: the api does not run `migrate` on start;
  step 3 and "Day to day" apply them with the image's `migrate` command **before** the release). So the migration of
  Task A2 is applied to the pilot database by the owner before the merge is deployed, and must suit the old release
  (additive only: new tables, one widened CHECK). `pnpm migrations:check` runs once, in F9.
- **No personal data in logs, jobs, errors, audit snapshots or the ledger.** Log ids, outcome names, counts and timings
  (ADR 0032). The form key's random part, the Turnstile secret, an address, a phone, an email, a message, a name, a
  browser string are never logged, never in an audit snapshot, never in a notification's `sourceEventId`.
- **Data rules (CLAUDE.md, spec 7).** Every new table has `organization_id` referring to `organization` with
  `ON DELETE RESTRICT ON UPDATE RESTRICT`; UUID v7 ids; `SELECT app_enable_org_rls('<table>');` in the migration that
  makes it; every unique constraint and composite foreign key includes `organization_id`; a fixture each in
  `packages/db/test/org-table-fixtures/` (`appendOnly` for the two ledgers). Never `forOrg()` inside `forOrg()`.
  Never `OFFSET`. Money is `BigInt` paise. No soft delete (`website_form` turns off with `enabled = false`).
- **Layers.** `website-forms` is L0 beside `catalog`, `tasks`, `imports`, `exports`, `sheets`: add it to
  `business-modules-call-down` in `.dependency-cruiser.cjs`. It never calls crm. crm calls it.
- **Permissions and lifecycle.** The form's tRPC procedures are `orgProcedure.requires("leads:create", "settings:manage")`
  (plan module `crm`); `turnOff` and `changeLink` add `.meta({ lifecycle: "revoke" })`, the rest are views or changes.
  The consent withdrawal is `leads:edit`. Public routes run the same checks inside the transaction (`assertFormOpen`).
- **Words the tests read.** Every `DomainError` reason has its literal sentence in `errors.json`; every `recordAudit`
  action its sentence in `audit.json`; the new notification kind its entry in `kinds.ts` and words in
  `notifications.json`; every word on screen is a next-intl message (`website-form.json` for the visitor's form,
  `website-form-settings.json` for the agency's screens; ruling F6).
- **The owner's UI rules 1-7, `DESIGN.md` and the shared pieces (CLAUDE.md).** Registry components only; no `border`,
  `ring`, `shadow` or `divide` class outside `components/ui`; 44px targets; `ResponsiveDialog`/`ConfirmDialog` hold while
  pending; a change's button asks `useWriteAccess("change")`, **Turn off** and **Change the link** ask `"revoke"`; every
  screen has loading, empty, error-with-retry and refusal states. The agency's colour is data set as shadcn's own
  `--primary`, `--primary-foreground`, `--ring` on the form's wrapper, never a class (spec 8).
- **`features.marketingConsent = false`** (spec 0.1.2) in `packages/contracts/src/features/index.ts`. While false: the
  settings page shows no offers switch, `GET` returns `offersTickbox: false`, the form shows no tickbox, and a
  submission with `offers` set is refused `VALIDATION`. Every consent test runs with
  `vi.mock("@travel-crm/contracts/features", () => ({ features: { marketingConsent: true } }))`; journeys follow the
  constant (a consent journey that asserts the *absence* runs while it is false).
- **Scale (ADR 0028).** Plans are read with `EXPLAIN` as `app_runtime` inside `forOrg`; performance tests run in the
  performance tests' own database with the large agency (50,000 leads). A missed budget is fixed in the query or index.
- **Readable code.** One-line header comment per file saying what it is for; about 200 lines is a smell; no `any`, no
  `!`, no abbreviations in public names. Inputs are `z.strictObject`, outputs `z.object`.

## Review Focus

Conditions most likely to bite that no single rule spells out. Each is pinned by the test named, in the task that owns it.

1. **One answer for everything (W20).** A new lead, a repeat enquiry, a blocked contact, a fourth-in-a-day, a duplicate
   `submissionId` and a tripped honeypot must be indistinguishable: status, headers that differ per outcome, and body.
   Pinned by A5/B4: "answers every non-refusal outcome with the same status and the same body".
2. **The visitor changes nobody (W18).** An existing person's name, email and handle are untouched; a differing or held
   email goes into the note; the match is by phone alone. Pinned by A5: "an unverified enquiry adds no contact to an
   existing person and puts a differing email in the note".
3. **A form that closes between page load and Send (W6, W23).** The submission re-checks inside its transaction; a
   subscription that went read-only a second ago gets `FORM_UNAVAILABLE`, never a thank-you. Pinned by A4:
   "assertFormOpen refuses every closed state with one error" and B4: "refuses a submission when the agency went read-only after the page loaded".
4. **Reading the visitor's address.** A forged leftmost `X-Forwarded-For` entry is never the one read; too few entries
   is "no address", which skips the address limits (never one shared bucket) and lowers the agency limit to 20; sign-in's
   strict reader is unchanged. Pinned by B1.
5. **Framing and storage.** `/embed/*` can be framed by any https site, `/f/*` cannot, and neither registers the service
   worker, opens IndexedDB, or sets a cookie or `localStorage` key. Pinned by D5: "the root providers skip /f and /embed" and
   "the CSP rules for /f, /embed and /embed.js".
6. **A double tap and a retry after a sleep (W21).** Two submissions with one `submissionId`, even racing, make one lead.
   Pinned by A4: "the ledger's unique submission id under a race" and A5.
7. **The consent switch (0.1.2).** With the flag false no screen, response or input shows or accepts consent; with it true
   the exact words shown are stored and an unticked box records nothing. Pinned by A5 and C4.
8. **The key (W4).** The organization id inside the key is an unambiguous 22-character encoding (ruling F12); a wrong
   random part is `FORM_NOT_FOUND` after the organization is opened, with no timing difference worth reading.
   Pinned by A4: "round-trips an organization id and a secret" and "a wrong secret is FORM_NOT_FOUND, not UNAVAILABLE".

## Branches and merge order

| Branch          | Worktree                                  | Tasks    | Waits for                                              | Owner of                                         |
| --------------- | ----------------------------------------- | -------- | ------------------------------------------------------ | ------------------------------------------------ |
| `forms/website` | `/Users/ak/personal/travel-crm-forms`     | A1-A7    | `docs/website-form` and the logging branch on `main`   | everything shared (migration, contracts, domain, crm, router, web plumbing) |
| `forms/api`     | `/Users/ak/personal/travel-crm-forms-api` | B1-B5    | A7 merged                                              | the public routes, address reader, bot check, settings |
| `forms/settings`| `/Users/ak/personal/travel-crm-forms-settings` | C0-C5 | A7 merged (C3 waits for D1)                        | the agency's screens                             |
| `forms/hosted`  | `/Users/ak/personal/travel-crm-forms-hosted` | D1-D6 | A7 merged                                              | the visitor's form, pages, embed, headers        |
| `forms/platform`| `/Users/ak/personal/travel-crm-forms-platform` | E1-E4 | A7 merged                                             | erasure, demo, sweep, performance                |
| `forms/website` (again) | the first worktree                | F1-F9    | B, C, D, E merged into it                              | journeys, audit, docs, deploy rows, CLAUDE.md, the full gate |

The controller creates each worktree from `forms/website` (`git worktree add ../travel-crm-forms-api -b forms/api
forms/website`), then runs `pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter
@travel-crm/brand build && pnpm --filter @travel-crm/web generate`. A track merges back with `git merge --no-ff` into
`forms/website`; conflicts should be import lines only. The final merge into `main` is the controller's
(`chore: merge forms/website (website enquiry form)`), after F9 is green.

**Needs from earlier work (Task A1 checks each and stops with a report if one is missing):** `main` holds the structured
logging (`Logger` port, ADR 0032), release 2's sheets and bulk, release 4's `lead_assignment` migration, `saveEnquiry`'s
`assign` option, and this branch's spec and plan.

**Files no track may edit unless it owns them (merge-conflict map):**
`packages/api/src/routers/app-router.ts`, `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/routes.ts`,
`apps/web/src/notifications/preferences/kinds.ts`, `errors.json`, `audit.json`, `notifications.json`,
`packages/contracts/src/features/index.ts`, `.dependency-cruiser.cjs`, `packages/db/prisma/schema/*`: all **A**-owned
and final by A7. A track that needs a change there lists it under "Needs from others" in its report.

## Rulings ledger

Format: `Ruling: <what> - <why> - <cost if wrong>`. The planner's calls where the spec leaves a gap or the code differs.
A builder adds its own to its report.

- F1. Ruling: the ADR is **0033** (`docs/adr/0033-public-website-form.md`), not 0032 - 0032 is structured logging, merged
  into this branch - none.
- F2. Ruling: `/api/public/plans` (spec 5.1 "beside") does not exist; `/api/public/*` is new, mounted in `createApp`
  before the 404. `/api` is already in the web app's `API_PATHS`, so the service worker and the catch-all header rule
  already leave it alone, and both the Vercel rewrite and Caddy already send `/api/*` to the api - no routing change.
- F3. Ruling: there is no "sign-in guard's public list"; the sign-in gate is the `(app)` layout's `SessionGate`, which
  `/f` and `/embed` (top-level routes) never enter. The real problem is the **root layout**: it wraps every page in
  `DataProviders` (opens IndexedDB, saves the query cache) and `ServiceWorkerRegistration`, which W29 forbids on the form.
  The root layout therefore renders a new client component `AppProviders` that returns `children` bare for a path
  under `/f/` or `/embed/` (`isPublicFormPath(pathname)` in `lib/routes.ts`) and the two providers otherwise - cost if
  wrong: a cache or worker on the public page.
- F4. Ruling: Next's header rules cannot *remove* `X-Frame-Options`; a later rule only replaces a value, and an
  unknown value (`ALLOW-FROM`) is ignored inconsistently. So the catch-all rule's `PAGES` pattern also excludes `/embed`,
  and `/embed/:path*` gets its own full header set built by the same function minus `X-Frame-Options`, with
  `frame-ancestors https:` and Turnstile's origins. `/f/:path*` gets the catch-all set plus Turnstile's origins in its
  CSP. `/embed.js` is a file in `public/` with `Cache-Control: public, max-age=3600`.
- F5. Ruling: `saveEnquiry` and `addRepeatEnquiry` take the kernel's `Actor` (what they use), not `MemberAccess`. The one
  thing in `addRepeatEnquiry` that needs a member (`leadId: isLeadInScope(access, ...)` in its return) moves to its one
  caller that returns it to a person (`create-lead.ts`); `saveEnquiry` discards that value anyway. The form passes
  `publicActor(organizationId)` (`source: "public"`, `userId: null`); the lead's owner is `options.ownerUserId`, resolved
  from `identity.firstOwner` before the transaction. The Owner's `MemberAccess` (`identity.resolveAccess`) is needed only
  by the public `GET` for the logo link (`files.downloadLink`).
- F6. Ruling: two message files, `website-form.json` (visitor screens: D) and `website-form-settings.json` (agency
  screens: C), where the spec names one - disjoint ownership, no conflict - none. `errors.json`, `audit.json` and
  `kinds.ts` are A's.
- F7. Ruling: the journeys' "in-memory Turnstile" is a fake siteverify HTTP server in the harness
  (`support/fake-turnstile.ts`, like `fake-google.ts`), reached through a fourth, test-only setting
  `TURNSTILE_VERIFY_URL` (refused outside `NODE_ENV=development|test`, and without both keys); the real adapter defaults
  to Cloudflare's address. The harness sets `PUBLIC_FORM_PROXY_HOPS=1`; journeys that need an address send direct
  requests to the api with a crafted `X-Forwarded-For`; browser journeys (through Next's rewrite, one entry) have "no
  address" and use only the 20-an-hour agency limit. No lowered-limit knob: journey 6 sends 21 direct-without-header
  enquiries - cost if wrong: a knob is added.
- F8. Ruling: a submission writes **three** rate-limit buckets (`form-submit-agency-visitor`, `form-submit-visitor`,
  `form-submit-agency`), a page view one; spec 12's "four" is a miscount - none.
- F9. Ruling: the destinations offered (top 100 by lead count, then name) is a crm query, `offeredDestinations`, because
  crm owns the leads; `website-forms` takes no destination code. The route composes both - none.
- F10. Ruling: the tRPC router, the contracts and the domain core ship in the shared branch (A), because the settings
  track and the form track both type against them. Tracks B-E add no contract.
- F11. Ruling: `website_form` and `website_form_submission` are in `schema/website-forms.prisma`; `person_consent` in
  `schema/crm.prisma`; one migration `20261029100000_website_form` - one hand-applied step for the owner.
- F12. Ruling: the key is `base64url(16 uuid bytes)` (22 characters, no padding) + 16 random characters from
  `A-Za-z0-9_-` = 38; `parseFormKey` returns the organization's UUID string or `null`. The spec's "22 characters" is
  that encoding; a hyphenated UUID is 36 - none.
- F13. Ruling: `people.consent({ leadId })` and `people.withdrawConsent({ leadId })` take the **lead's** id (the card is on
  a lead), checked in scope with `getLead` like the lead page, so no caller names a person it cannot see - cost if wrong:
  a person-id variant is added.
- F14. Ruling: the demo (W6, spec 11) is refused by `isOnDemoPlan` inside `formOpenState`; the demo's row exists with
  `enabled = false` and the settings switch is disabled with "Not available in the demo".
- F15. Ruling: `receiveWebsiteEnquiry` is the only caller of `recordSubmission` for `new_lead`, `repeat_enquiry`,
  `blocked`, `duplicate`; the honeypot's `spam` row is written by the route through the same domain function, in its own
  short transaction, after `assertFormOpen`.
- F17. Ruling: spec W35's nudge on the settings page (when no address can be read) is dropped; the once-per-process log line
  stays. An agency cannot act on it and cannot set Turnstile; the owner has the log and spec section 15 - cost if wrong: one
  `Alert` added to C0, fed by a flag `get` returns.
- F16. Ruling: the settings page's "Last 30 days" and the flood notice read the ledger with the form's id; the
  `form.busy` notification is sent by domain code (`noteFlood`), called by the route when the agency bucket refuses,
  with `sourceEventId` = `form-busy:<formId>:<UTC hour>`.

## File structure

**Shared (A).**

- `docs/adr/0033-public-website-form.md`; `docs/adr/README.md` (a row).
- `packages/db/prisma/schema/website-forms.prisma`, `schema/crm.prisma` (`PersonConsent`), `schema/organization.prisma`
  (back-relations); `prisma/migrations/20261029100000_website_form/migration.sql`;
  `test/org-table-fixtures/website-forms.ts` and `crm.ts`; `test/website-forms-tables.test.ts`.
- `packages/contracts/src/website-forms/{index,settings,public-form,enquiry,wording}.ts`;
  `src/crm/consent.ts` (+ export from `crm/index.ts`); `src/features/index.ts`; `src/audit/audit.ts` (`public`).
- `packages/domain/src/kernel/actor.ts` (`"public"`, `publicActor`); `src/website-forms/*`; `src/crm/{save-enquiry,
  repeat-enquiry,create-lead,website-enquiry,consent,offered-destinations}.ts` and `crm/index.ts`.
- `packages/api/src/routers/{website-form,people}.ts`, `app-router.ts`.
- `apps/web/src/lib/routes.ts`, `src/i18n/messages.ts`, the two empty message files, `errors.json`, `audit.json`,
  `notifications.json`, `src/notifications/preferences/kinds.ts`, `src/website-form/form-props.ts` (the shared types).

**Track B (api).** `apps/api/src/{website-form-routes,form-client-address,form-limits,environment,services,app,server,
service-variables}.ts`, `.env.example`; `packages/integrations/src/bot-check/{index,bot-check,memory-bot-check,
turnstile-bot-check}.ts` (+ `package.json` export map if it lists adapters by name); `apps/api/test/website-form-*.test.ts`.

**Track C (settings).** `apps/web/src/lead-sources/website-form/**`, `src/lead-sources/lead-sources-screen.tsx` (the
row), `src/app/(app)/settings/lead-sources/website-form/page.tsx`, `src/leads/lead/person-consent.tsx` (+ the one line in
the person card that mounts it), `src/i18n/messages/en-IN/website-form-settings.json`, `test/lead-sources/website-form/**`.

**Track D (hosted/embed).** `apps/web/src/website-form/**` (all but `form-props.ts`, A's), `src/app/f/[key]/**`,
`src/app/embed/[key]/**`, `public/embed.js`, `security-headers.ts`, `test/security-headers.test.ts`,
`src/service-worker/strategy.ts` (+ its test), `src/app/layout.tsx`, `src/pwa/app-providers.tsx`,
`test/lighthouse-budgets.test.ts`, `src/i18n/messages/en-IN/website-form.json`, `test/website-form/**`.

**Track E (platform).** `packages/domain/src/platform/{erasure,erase-customer,demo,website-forms-sweep}.ts`,
`packages/domain/src/crm/{demo-leads,demo-lead-data,customer-erasure}.ts`, `apps/api/src/console-jobs.ts`,
`packages/domain/test/{platform,performance}/website-form-*.test.ts`.

**Closing (F).** `apps/web/test/e2e/website-form-*.spec.ts`, `test/e2e/support/{website-form,fake-turnstile,embed-host}.ts`
(+ `servers.ts` env), `test/e2e/audit/website-form.audit.ts`; `docs/deploy-checklist.md`, `docs/serverless.md`,
`docs/superpowers/specs/2026-10-22-website-form-design.md` (status line), `CLAUDE.md`, `packages/domain/README.md`.

---

# Part A: shared first (branch `forms/website`, one builder, in order)

## Task A1: Prerequisites gate, ADR 0033, the switch and the `public` actor

**Files:** Create `docs/adr/0033-public-website-form.md`. Modify `docs/adr/README.md`;
`packages/contracts/src/features/index.ts`; `packages/contracts/src/audit/audit.ts`; `packages/domain/src/kernel/actor.ts`
and `kernel/index.ts`; `.dependency-cruiser.cjs`; tests `packages/domain/test/kernel/actor.test.ts`,
`packages/contracts/test/features.test.ts` (find the existing one).

**Interfaces:**

- Produces: `features.marketingConsent: boolean` (`false`, documented like `automaticAssignment`, pointing at the owner's
  2026-10-22 answer and the legal read); `ActorSource` gains `"public"`; `auditSource` enum gains `"public"`;
  `publicActor(organizationId: string): Actor` = `{ organizationId, userId: null, source: "public", impersonatedBy: null }`.
- ADR 0033 records: the abuse model, the hop rule and its known gap (W34), the framing exception (W30), the unverified-
  contact rule (W18), the consent ledger, and rulings F3-F4.

- [ ] **Step 1: the gate.** Check `main` has the logging port, sheets, bulk and `lead_assignment`: `ls
  packages/integrations/src/logging packages/db/prisma/migrations | tail -3`, `grep -n "assign" packages/domain/src/crm/save-enquiry.ts`. Missing: stop and report.
- [ ] **Step 2: tests.** "publicActor is source public with no user"; "auditSource accepts public"; "the features file
  has marketingConsent false"; a depcruise rule check is the gate's `depcruise`.
- [ ] **Step 3: implement**, adding `website-forms` to the `from` list of `business-modules-call-down`.
- [ ] **Step 4: ADR 0033 and the README row.**

**Gate:** `pnpm --filter @travel-crm/contracts test && pnpm --filter @travel-crm/contracts typecheck && pnpm --filter
@travel-crm/domain exec vitest run test/kernel && pnpm run depcruise`. Commit: `feat(kernel): the public actor and the marketing-consent switch`.

## Task A2: The tables, the migration, the fixtures

**Files:** Create `packages/db/prisma/schema/website-forms.prisma`; `prisma/migrations/20261029100000_website_form/migration.sql`;
`test/org-table-fixtures/website-forms.ts`; `test/website-forms-tables.test.ts`. Modify `schema/crm.prisma`,
`schema/organization.prisma`, `test/org-table-fixtures/crm.ts` and `test/org-table-fixtures.ts` (register), `packages/db/README.md` (the table list).

**Interfaces (spec 7; names are the Prisma models):**

- `WebsiteForm` (`website_form`): `id`, `organizationId`, `keySecret` (CHECK `~ '^[A-Za-z0-9_-]{16}$'`), `enabled` (false),
  `allowEmbed` (true), `emailMode`/`destinationMode`/`travelMonthMode`/`travellersMode`/`budgetMode`/`messageMode`
  (text, CHECK in `off|optional|required`; defaults per W2), `offersTickbox` (false), `heading` 80, `introduction` 200,
  `thankYouMessage` 500, `websiteUrl` 300 (CHECK `~ '^https://'`), `websiteButtonText` 40, `privacyUrl` 300 (CHECK https),
  all nullable with length CHECKs; `keyChangedAt`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (plain uuids).
  `@@unique([organizationId, id])`, `@@unique([organizationId])` (named `website_form_one_per_organization`).
- `WebsiteFormSubmission` (`website_form_submission`, append only): `id`, `organizationId`, `formId`, `submissionId` (uuid),
  `outcome` (CHECK `new_lead|repeat_enquiry|blocked|duplicate|spam`), `reason` (nullable, CHECK `honeypot`),
  `leadId?`, `personId?`, `createdAt`. Unique `(organization_id, submission_id)`; composite keys
  `(organization_id, form_id)`, `(organization_id, lead_id)`, `(organization_id, person_id)`; indexes
  `website_form_submission_counts (organization_id, form_id, created_at)` and `website_form_submission_person
  (organization_id, person_id, created_at) WHERE person_id IS NOT NULL`. **No name, phone, email, message, address or
  browser string.**
- `PersonConsent` (`person_consent`, append only): `id`, `organizationId`, `personId`, `purpose` (CHECK `marketing`),
  `action` (CHECK `granted|withdrawn`), `wording` 300, `wordingVersion` int, `source` (CHECK `web_form|staff`),
  `sourceFormId?`, `recordedAt`, `recordedBy?`; index `person_consent_latest (organization_id, person_id, recorded_at DESC)`.
- The migration also widens `audit_entry_source_value` to include `'public'` (drop and re-add, as the platform migration
  did) and gives `app_runtime` INSERT and SELECT on the two ledgers and the usual grants on `website_form`. The platform
  role may UPDATE and DELETE the two ledgers (erasure and sweep) - check how `sheet_row` grants are written and copy.

- [ ] **Step 1: tests first.** `website-forms-tables.test.ts`: "the key secret CHECK refuses a short or illegal secret";
  "a second form for one organization is refused"; "a mode outside off|optional|required is refused"; "the https CHECKs";
  "the ledger refuses UPDATE and DELETE as app_runtime"; "a duplicate submission id in one organization is refused,
  in another is allowed". The isolation, key and unique-constraint tests read the schema and fail until the fixtures exist.
- [ ] **Step 2: schema, migration, fixtures** (`appendOnly` for both ledgers).
- [ ] **Step 3:** `pnpm --filter @travel-crm/db generate`.

**Gate:** `pnpm --filter @travel-crm/db exec vitest run test/website-forms-tables.test.ts test/isolation.test.ts
test/organization-keys.test.ts test/unscoped-tables.test.ts test/schema-check.test.ts` (Docker). Commit:
`feat(db): the website form's tables and the consent ledger`. **Note in the report: the owner applies this migration by hand before the merge deploys.**

## Task A3: Contracts

**Files:** Create `packages/contracts/src/website-forms/{index,settings,public-form,enquiry,wording}.ts`,
`packages/contracts/src/crm/consent.ts`; modify `crm/index.ts`; tests `packages/contracts/test/website-forms.test.ts`.

**Interfaces (Produces):**

```ts
export const fieldMode = z.enum(["off", "optional", "required"]);                       // FieldMode
export const websiteFormSettings = z.object({ enabled, allowEmbed, emailMode, destinationMode, travelMonthMode,
  travellersMode, budgetMode, messageMode, offersTickbox: z.boolean(), heading, introduction, thankYouMessage,
  websiteUrl, websiteButtonText, privacyUrl: z.string().nullable() /* each */ });
export const saveWebsiteFormInput = z.strictObject({ ...settings minus `enabled`, https-checked urls });  // FORM_LINK_INVALID on a non-https url
export const websiteFormView = z.object({ settings, key: z.string().nullable(), link: z.string().nullable(),
  embedLink: z.string().nullable(), state: formState, ownerName: z.string().nullable() });
export const formState = z.object({ open: z.boolean(), reason: z.enum(["off","read_only","suspended","cancelled","plan","demo","no_owner"]).nullable() });
export const websiteFormPublic = z.object({ available: z.boolean(), form: publicForm.nullable() });
// publicForm: organizationName, logoUrl|null, colour: {primary, ink}|null, heading|null, introduction|null,
// thankYouMessage, websiteUrl|null, websiteButtonText|null, privacyUrl|null, fields: { email, destination,
// travelMonth, travellers, budget, message: FieldMode }, offersTickbox: boolean, offersWording: string|null,
// destinations: {id, name}[], months: string[] /* "2026-11" x12 from this month in the agency's zone */,
// openedToken: string, turnstileSiteKey: string|null. When available is false, only the name, logo, website pair.
export const websiteEnquiryInput = z.strictObject({ submissionId: z.uuid(), openedToken: z.string(),
  via: z.enum(["hosted","embedded"]), embeddedOn: z.string().max(80).optional(), homepage: z.string().max(200),
  turnstileToken: z.string().max(2048).optional(), answers: enquiryAnswers });
// enquiryAnswers (strict): name 1-120, phone (kernel phoneNumber), email?, destination? ({kind:"existing",destinationId}|{kind:"typed",text<=80}),
// travelMonth? ("YYYY-MM"|"flexible"|null), adults? 1-20, childrenAges? (0-17, max 10), budget? ({rupees: int 1000..10_000_000, basis: "everyone"|"per_person"}), message? <=1000, offers? boolean.
export const OFFERS_WORDING_VERSION = 1; export function offersWording(agencyName: string): string; // "Send me travel offers and updates from {agencyName}."
export const personConsentState = z.object({ state: z.enum(["granted","withdrawn"]).nullable(), at: z.iso.datetime().nullable() });
export const FORM_KEY_LENGTH = 38;
```

- [ ] **Step 1: tests first.** "an unknown key in a submission is rejected"; "a name that is a web address is rejected";
  "budget bounds 1,000 and 1 crore"; "children ages above 17 rejected"; "a typed destination over 80 characters rejected";
  "a non-https website or privacy url is rejected"; "offersWording names the agency"; "the output schemas strip unknown keys".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/contracts test && pnpm --filter @travel-crm/contracts typecheck && pnpm --filter @travel-crm/contracts lint`.
Commit: `feat(contracts): the website form's settings, public form and enquiry`.

## Task A4: The `website-forms` domain module

**Files:** Create `packages/domain/src/website-forms/{index,key,limits,opened-token,settings,open-state,ledger,
checks,flood,README}.ts(md)`; tests `packages/domain/test/website-forms/*.test.ts`. Modify `packages/domain/README.md`,
`apps/web/src/i18n/messages/en-IN/{errors,audit,notifications}.json`, `src/notifications/preferences/kinds.ts`.

**Interfaces (Produces; each exported from `index.ts`):**

```ts
// key.ts
export function newKeySecret(): string;                                       // 16 chars of A-Za-z0-9_-, crypto.randomBytes
export function formKeyOf(organizationId: string, keySecret: string): string; // 38 chars (F12)
export function parseFormKey(key: string): { organizationId: string; keySecret: string } | null;
// limits.ts: every number of spec 6.3 and the others, once
export const formLimits: { view: Rule; submitAgencyVisitor: Rule; submitVisitor: Rule; submitAgency: Rule;
  submitAgencyNoAddress: Rule; clientAddress: Rule; minFillSeconds: 2; tokenMaxAgeHours: 24; perPersonPerDay: 3;
  maxBodyBytes: 16384; maxLinks: 2; destinationsOffered: 100; countDays: 30; ledgerKeepDays: 90 };
// opened-token.ts
export function formTokenKey(authSecret: string): Buffer;                      // HMAC-derived, fixed label (W37)
export function signOpenedToken(key: Buffer, formId: string, at: Date): string;
export function checkOpenedToken(key: Buffer, token: string, formId: string, now: Date): void; // FORM_TOO_FAST < 2 s; FORM_EXPIRED > 24 h or unreadable; other form's: FORM_EXPIRED
// settings.ts (all in forOrg)
export async function readWebsiteForm(tx: OrgTx): Promise<WebsiteFormRow | null>;
export async function saveWebsiteForm(tx: OrgTx, actor: Actor, input: SaveWebsiteFormInput): Promise<WebsiteFormRow>;   // creates the row on first save (W1); audits fields/words/embed changes
export async function setWebsiteFormEnabled(tx: OrgTx, actor: Actor, enabled: boolean): Promise<WebsiteFormRow>;       // turned-on / turned-off
export async function changeWebsiteFormLink(tx: OrgTx, actor: Actor, now: Date): Promise<WebsiteFormRow>;             // new keySecret, keyChangedAt, audit link-changed with no key
// open-state.ts
export type FormClosedReason = NonNullable<FormState["reason"]>;
export async function formOpenState(tx: OrgTx, input: { organizationId: string; form: WebsiteFormRow | null; ownerUserId: string | null; now: Date }): Promise<FormState>;
export async function assertFormOpen(tx: OrgTx, input: { key: string; organizationId: string; ownerUserId: string | null; now: Date }): Promise<WebsiteFormRow>; // FORM_NOT_FOUND (wrong secret / no row) 404; FORM_UNAVAILABLE 403 for every closed state; FORM_NEEDS_OWNER only for the settings page's state, never to a visitor
// ledger.ts
export async function findSubmission(tx: OrgTx, submissionId: string): Promise<SubmissionRow | null>;
export async function recordSubmission(tx: OrgTx, input: { formId: string; submissionId: string; outcome: SubmissionOutcome; reason?: "honeypot"; leadId?: string; personId?: string; now: Date }): Promise<void>;   // unique violation -> returns quietly (a racer already wrote it)
export async function recentEnquiryCount(tx: OrgTx, personId: string, now: Date): Promise<number>; // last 24 h, outcomes new_lead|repeat_enquiry
export async function formCounts(tx: OrgTx, formId: string, now: Date): Promise<{ enquiries: number; newLeads: number; repeatEnquiries: number; stopped: number }>;
// checks.ts
export function assertAnswersMatchModes(form: WebsiteFormRow, answers: EnquiryAnswers): EnquiryAnswers; // required missing -> VALIDATION; off present -> dropped
export function assertNoLinks(answers: EnquiryAnswers): void;     // message > 2 web addresses or an HTML tag -> FORM_LINKS_NOT_ALLOWED; name/typed destination any web address -> same
export function assertNotBot(result: "pass" | "fail" | "unreachable"): void; // fail -> FORM_BOT_CHECK_FAILED; unreachable passes (W39)
// flood.ts
export async function noteFlood(tx: OrgTx, actor: Actor, input: { formId: string; ownerUserId: string; now: Date }): Promise<void>; // notify() kind form.busy, sourceEventId form-busy:<formId>:<hour>
```

Reasons thrown here, each with a sentence in `errors.json` (spec 8 and 6.4/6.5): `FORM_NOT_FOUND`, `FORM_UNAVAILABLE`,
`FORM_NEEDS_OWNER`, `FORM_TOO_FAST`, `FORM_EXPIRED`, `FORM_LINKS_NOT_ALLOWED`, `FORM_BOT_CHECK_FAILED`, `FORM_LINK_INVALID`.
Audit actions (record type `website_form`; snapshots hold modes, flags and text *lengths*, never the key): `website-form.turned-on`,
`.turned-off`, `.fields-changed`, `.words-changed`, `.embed-changed`, `.link-changed`. New kind `form.busy` ("Your website
form is getting more enquiries than usual...", spec 6.4) in `kinds.ts` and `notifications.json`.

- [ ] **Step 1: tests first.** `key.test.ts`: "round-trips an organization id and a secret", "rejects a 37 or 39 character key, a bad
  alphabet, a non-uuid id"; `opened-token.test.ts`: "signed under a key derived from the auth secret", "under two seconds is
  FORM_TOO_FAST", "older than 24 hours is FORM_EXPIRED", "another form's token is refused", "a tampered token is refused";
  `settings.test.ts`: "opening the page writes nothing: no row until the first save", "the first save creates the row off", "turn on writes one
  audit entry", "change the link writes a new secret and no audit entry holds a key", "the old key stops working";
  `open-state.test.ts`: "assertFormOpen refuses every closed state with one error" (off, read-only, suspended, cancelled, plan without crm, the demo,
  no owner), "a wrong secret is FORM_NOT_FOUND, not UNAVAILABLE"; `ledger.test.ts`: "the ledger's unique submission id under a race"
  (two concurrent `recordSubmission`), "counts the last 30 days", "recentEnquiryCount ignores blocked, duplicate and spam"; `checks.test.ts`:
  "a required field missing is VALIDATION", "an off field present is dropped", "three links refused, two allowed", "an HTML tag refused", "unreachable
  Turnstile passes"; `flood.test.ts`: "one notice per hour however many refusals". Words tests (`errors`, `audit`, `kinds`) run in the web gate below.
- [ ] **Step 2: implement**; the sentences and the kind's words as above (visitor-readable, English).

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/website-forms && pnpm --filter @travel-crm/domain typecheck && pnpm
--filter @travel-crm/domain lint && pnpm --filter @travel-crm/web exec vitest run test/support test/notifications` (words). Commit: `feat(domain): the website-forms module`.

## Task A5: crm - `saveEnquiry` for a system actor, `receiveWebsiteEnquiry`, the consent ledger

**Files:** Create `packages/domain/src/crm/{website-enquiry,consent,offered-destinations}.ts`; tests
`packages/domain/test/crm/{website-enquiry,consent,offered-destinations,save-enquiry-unverified}.test.ts`. Modify
`crm/save-enquiry.ts`, `crm/repeat-enquiry.ts`, `crm/create-lead.ts`, `crm/people.ts` (an `unverified` match helper only), `crm/index.ts`,
`apps/web/src/i18n/messages/en-IN/audit.json` (`person.consent-recorded`, `person.consent-withdrawn`).

**Interfaces:**

```ts
// save-enquiry.ts: the actor param is `Actor` (F5); options gain `unverified?: true` on the "import" arm.
export async function saveEnquiry(tx: OrgTx, actor: Actor, enquiry: Enquiry, now: Date, options: EnquiryOptions): Promise<SavedEnquiry>;
//   unverified: matchPerson by phone only (not by an email another person holds); an existing person is never changed
//   (no fillMissingContacts); a differing or held email is returned as `leftOut: { email?: string }` for the note; a new
//   person gets the email only if no live person holds it.
export interface SavedEnquiry { ...existing; leftOut: { email: string | null } }
// website-enquiry.ts
export interface WebsiteEnquiryContext { organizationId: string; ownerUserId: string; workers: ReadonlySet<string>;
  form: WebsiteFormRow; agencyName: string; via: "hosted" | "embedded"; embeddedOn: string | null; now: Date }
export type WebsiteEnquiryOutcome = "new_lead" | "repeat_enquiry" | "blocked" | "duplicate";
export async function receiveWebsiteEnquiry(tx: OrgTx, context: WebsiteEnquiryContext, input: WebsiteEnquiryInput): Promise<WebsiteEnquiryOutcome>;
// one transaction (caller's): findSubmission (answer as the first did) -> blocked check (isBlocked; record `blocked`) ->
// recentEnquiryCount >= 3 for the matched person (record `duplicate`) -> saveEnquiry with
// { from: "import", ownerUserId, stage: "new", createdAt: null, notify: "each", assign: { workers }, unverified: true }, source "web_form",
// sourceDetail "Hosted link" or the host (80 chars, host-name checked, else "Embedded") -> note (W12) -> recordSubmission ->
// recordConsent when input.answers.offers === true and features.marketingConsent. Unique-violation on the phone: the CALLER reruns once (B26).
// offered-destinations.ts
export async function offeredDestinations(tx: OrgTx): Promise<{ id: string; name: string }[]>; // 100 live, most leads first, then name
// consent.ts
export async function recordConsent(tx: OrgTx, actor: Actor, input: { personId: string; wording: string; wordingVersion: number; formId: string; now: Date }): Promise<void>;
export async function withdrawConsent(tx: OrgTx, actor: MemberAccess, input: { personId: string; now: Date }): Promise<void>; // source staff
export async function consentStateOf(tx: OrgTx, personId: string): Promise<{ state: "granted" | "withdrawn" | null; at: Date | null; fromForm: boolean }>; // latest row decides
```

- [ ] **Step 1: tests first.** `save-enquiry-unverified`: "an unverified enquiry adds no contact to an existing person and puts a
  differing email in the note", "a held email is left out of a new person and noted", "an unverified enquiry is matched by phone alone, not by an email another
  person holds", "the verified paths (form, import, sheets) still fill missing contacts" (regression), "createdBy is null for the public actor";
  `website-enquiry`: "a person with an open lead gets a repeat enquiry and the lead's owner the usual notice", "a known person with only closed
  leads gets a Returning lead", "a blocked phone or email saves nothing and records blocked", "a fourth enquiry in 24 hours saves nothing and
  records duplicate", "a repeated submissionId saves nothing and answers as the first", "a destination chosen by id is on the lead; a typed
  one that matches a live name ignoring case and spaces is that destination; any other creates no destination and sits in the note", "the note holds
  the message then the destination and email lines", "the audit entries carry source public", "the owner is told once per new lead", **"answers
  every non-refusal outcome with the same status and the same body"** (a pure function `answerOf(outcome)` returns the one body; tested here and in B4),
  "an offers tick with the switch off is VALIDATION"; `consent` (flag mocked on): "the tick stores the exact words and version", "no tick records
  nothing and never withdraws", "staff withdrawal makes the latest row decide", "a later tick grants again", "the audit has no wording";
  `offered-destinations`: "100 most used first, then by name, none deleted".
- [ ] **Step 2: implement.** Update `create-lead.ts` for F5 (the scoped `leadId`); run `pnpm --filter @travel-crm/domain typecheck` to find every caller.

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/crm test/website-forms && pnpm --filter @travel-crm/domain typecheck && pnpm
--filter @travel-crm/domain lint && pnpm run depcruise`. Commit: `feat(crm): receive a website enquiry; saveEnquiry for a system actor`.

## Task A6: The tRPC router

**Files:** Create `packages/api/src/routers/{website-form,people}.ts`; tests `packages/api/test/{website-form,people}-router.test.ts`.
Modify `packages/api/src/routers/app-router.ts`; `packages/contracts/src/website-forms/index.ts` only if a procedure needs an output not yet there.

**Interfaces:**

```ts
const manager = orgProcedure.requires("leads:create", "settings:manage");
websiteForm: router({
  get:        manager.output(websiteFormView).query(...),                                   // view: row or defaults; key and links only when a row exists
  save:       manager.input(saveWebsiteFormInput).output(websiteFormView).mutation(...),    // change
  turnOn:     manager.output(websiteFormView).mutation(...),                                // change
  turnOff:    manager.meta({ lifecycle: "revoke" }).output(websiteFormView).mutation(...),
  changeLink: manager.meta({ lifecycle: "revoke" }).output(websiteFormView).mutation(...),
  preview:    manager.input(saveWebsiteFormInput).output(publicForm).query(...),            // view: the same payload visitors get, from unsaved settings, token "preview"
  counts:     manager.output(formCountsView).query(...),                                    // view
})
people: router({
  consent:         orgProcedure.requires("leads:view").input(leadIdInput).output(personConsentState).query(...),
  withdrawConsent: orgProcedure.requires("leads:edit").input(leadIdInput).output(personConsentState).mutation(...),
})
```

`get` and `preview` include the owner's name (identity `memberNames`) and `formOpenState` (so the page names the reason).
The links are `${APP_URL}/f/<key>` and `/embed/<key>`; the api receives `APP_URL` as it already does. The settings page disables the demo's switch; the router also refuses the demo's `turnOn` with `FORM_UNAVAILABLE` (F14).
`save` and `preview` refuse `offersTickbox: true` with `VALIDATION` while `features.marketingConsent` is false.

- [ ] **Step 1: tests first.** "get on an agency with no row returns defaults and writes nothing"; "a salesperson without settings:manage is FORBIDDEN";
  "turnOff and changeLink work while the agency is read-only, turnOn and save do not"; "changeLink returns a new link, the old key is FORM_NOT_FOUND";
  "preview returns what the public GET would, with the sample token"; "people.consent hides a lead outside the caller's scope as NOT_FOUND";
  "people.withdrawConsent needs leads:edit"; "offersTickbox true is refused while the switch is off".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/api exec vitest run test/website-form-router.test.ts test/people-router.test.ts && pnpm --filter @travel-crm/api typecheck && pnpm --filter @travel-crm/api lint`.
Commit: `feat(api): the website form's and consent procedures`.

## Task A7: Web plumbing every track needs, then the tracks start

**Files:** Modify `apps/web/src/lib/routes.ts`, `apps/web/src/i18n/messages.ts`. Create
`apps/web/src/i18n/messages/en-IN/{website-form,website-form-settings}.json` (each `{}`),
`apps/web/src/website-form/form-props.ts`; test `apps/web/test/lib/routes.test.ts` additions.

**Interfaces (Produces, frozen for B-E):**

```ts
// lib/routes.ts
routes.websiteForm = "/settings/lead-sources/website-form";
export function hostedFormRoute(key: string): string;     // `/f/${key}`
export function embeddedFormRoute(key: string): string;   // `/embed/${key}`
export function isPublicFormPath(pathname: string): boolean; // under /f/ or /embed/
// website-form/form-props.ts
export interface WebsiteFormViewProps {
  form: PublicForm;                                 // from @travel-crm/contracts/website-forms
  mode: "hosted" | "embedded" | "preview";
  width?: number;                                   // preview frame
  send: (body: WebsiteEnquiryInput) => Promise<void>;   // rejects with a refusal reason the form shows (W41)
}
```

- [ ] **Step 1: tests first.** "isPublicFormPath is true for /f/x and /embed/x, false for /fx, /settings and /embedded"; "messages.ts
  loads both namespaces". **Step 2: implement.** **Step 3:** the controller merges `forms/website` and creates the four track worktrees.

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/lib test/i18n && pnpm --filter @travel-crm/web typecheck`.
Commit: `feat(web): the website form's routes, words files and view props`.

---

# Part B: the api track (branch `forms/api`)

## Task B1: The form-only address reader and `/api/public/client-address`

**Files:** Create `apps/api/src/form-client-address.ts`; tests `apps/api/test/form-client-address.test.ts`. Modify `apps/api/src/rate-limit.ts` (export `parseHop`, `countedAddress`; no behaviour change).

**Interfaces:**

```ts
export interface FormAddressSettings extends ClientAddressSettings { proxyHops: number | null }
export function formClientAddressFrom(settings: FormAddressSettings): (request: Request) => string | null;
//  hops null: delegates to clientAddressFrom(settings) (the sign-in rule, so Oracle/Caddy needs nothing)
//  hops N: first header of headerNames, split on commas, k entries; k < N + 1 -> null; else entry k-N from the left; must be a valid IP; IPv6 -> its /64 (countedAddress)
export function clientAddressReport(request: Request, settings: FormAddressSettings): { address: string | null; entries: number; hops: number | null };
```

- [ ] **Step 1: tests first.** "reads entry k-N counting from the left", "a forged leftmost entry is never the one read" (with N=1 and N=2), "k <= N is no
  address", "an invalid entry is no address", "IPv6 counts as its /64", "an IPv4-mapped IPv6 is the IPv4", "hops unset follows the trusted-proxy or single-entry rule", "the sign-in reader
  is unchanged" (the existing `rate-limit` tests still pass), "the report names entries and hops and never other headers".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/api-server exec vitest run test/form-client-address.test.ts test/rate-limit.test.ts && pnpm --filter @travel-crm/api-server typecheck`. Commit: `feat(api): read the visitor's address by a configured number of hops`.

## Task B2: The `BotCheck` port and its adapters, and the three (four) settings

**Files:** Create `packages/integrations/src/bot-check/{index,bot-check,memory-bot-check,turnstile-bot-check}.ts`; tests
`packages/integrations/test/bot-check/*.test.ts`. Modify `apps/api/src/{environment,services,service-variables}.ts`, `.env.example`, `apps/api/test/environment.test.ts`.

**Interfaces:**

```ts
// @travel-crm/integrations/bot-check
export type BotCheckResult = "pass" | "fail" | "unreachable";
export interface BotCheck { verify(input: { token: string; address: string | null }): Promise<BotCheckResult> }
export function createTurnstileBotCheck(options: { secretKey: string; verifyUrl?: string; timeoutMs?: number; fetch?: typeof fetch }): BotCheck;  // POST siteverify; non-2xx, timeout or network error -> "unreachable"; success:false -> "fail"
export function createMemoryBotCheck(): BotCheck & { willAnswer(result: BotCheckResult): void; seen(): { token: string; address: string | null }[] };
// environment.ts
PUBLIC_FORM_PROXY_HOPS: emptyAsUnset(z.coerce.number().int().min(1).max(5).optional())
TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY: both or neither (problem() naming the variable, never printing it)
TURNSTILE_VERIFY_URL: test-only, only with both keys and NODE_ENV development|test
// services.ts: `botCheck: BotCheck | null`
```

- [ ] **Step 1: tests first.** Adapters: "the real adapter posts the secret, token and address and reads success", "a 500, a timeout and a network error are unreachable",
  "a refusal is fail", "the secret is never in an error message", "the memory adapter records what it saw". Environment: "one key alone stops start-up naming the other variable",
  "hops 0 and 6 are refused", "a bad value never prints the secret", "the verify url is refused in production".
- [ ] **Step 2: implement**; `.env.example` carries Cloudflare's published always-passes test keys with a comment.

**Gate:** `pnpm --filter @travel-crm/integrations exec vitest run test/bot-check && pnpm --filter @travel-crm/api-server exec vitest run test/environment.test.ts && pnpm --filter @travel-crm/integrations typecheck && pnpm --filter @travel-crm/api-server typecheck && pnpm run depcruise`.
Commit: `feat(integrations): the bot-check port with a Turnstile adapter`.

## Task B3: The public `GET`, limits and the address page

**Files:** Create `apps/api/src/{website-form-routes,form-limits}.ts`; tests `apps/api/test/website-form-get.test.ts`. Modify `apps/api/src/app.ts`, `server.ts` (dependencies).

**Interfaces:**

```ts
// form-limits.ts: the order of 6.1, as small functions over RateLimiter
export async function hitFormLimits(input: { limiter: RateLimiter; organizationId: string; address: string | null; kind: "view" | "submit" }): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number; agencyRefused: boolean }>;
//  with address null: per-address buckets skipped (never a shared "no-address" bucket); agency bucket 20/hour; one warn line per process
// website-form-routes.ts
export function websiteFormRoutes(dependencies: WebsiteFormRouteDependencies): Hono;  // mounted at /api/public
//  GET /website-forms/:key        -> 200 { available, form } | 404 FORM_NOT_FOUND; Cache-Control: no-store
//  GET /client-address            -> 200 { address, entries, hops }; limited 20/min per address
export interface WebsiteFormRouteDependencies { db: Database; identity: Identity; files: Files; limiter: RateLimiter; botCheck: BotCheck | null; turnstileSiteKey: string | null;
  authSecret: string; appUrl: string; address: (r: Request) => string | null; report: (r: Request) => ClientAddressReport; logger: Logger; now?: () => Date }
```

The GET: `parseFormKey` (no database) -> `hitFormLimits(view)` -> `forOrg(organizationId, tx => ...)`: `readWebsiteForm`, `assertFormOpen` (a closed state answers
`{ available:false, form:{ name, logo, website pair } }`, 200, same sentence for every closed state), name and colour from the profile, the newest ready `organization_logo` link (1 hour;
the Owner's `resolveAccess`), `offeredDestinations`, the twelve months in the agency's zone, `signOpenedToken`, the colour pair (white or near-black by 4.5:1 contrast, else `null`).
The request line gets `organizationId`.

- [ ] **Step 1: tests first.** "returns the form, the logo link, the destinations and a signed token with no-store", "a closed form (off, read-only, suspended, plan without crm, the demo)
  answers available false with one body", "a wrong secret is 404 FORM_NOT_FOUND and a malformed key is 404 without touching the database", "the colour pair falls back to null when neither ink reaches 4.5:1",
  "the 61st view in a minute from one address is 429 with Retry-After", "no address skips the address bucket", "the response holds no owner name, email or id", "offersTickbox is false while the switch is off".
  The client-address page: "shows address, entries and hops", "is limited".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/api-server exec vitest run test/website-form-get.test.ts && pnpm --filter @travel-crm/api-server typecheck && pnpm --filter @travel-crm/api-server lint`. Commit: `feat(api): the public website form page and the address check`.

## Task B4: The public `POST`

**Files:** Modify `apps/api/src/website-form-routes.ts` (and split into `website-form-submit.ts` if over ~200 lines); tests `apps/api/test/website-form-submit.test.ts`.

**Interfaces:** `POST /website-forms/:key/enquiries`: `requireTrustedJson` (W28) -> `limitBody(16 * 1024)` -> the order of 6.1. Answers `201 { ok: true }` for **every non-refusal
outcome** through the one `answerOf(outcome)` of A5; refusals are `{ code, reason, message }` with the reason's HTTP status: 400 `VALIDATION`/`FORM_TOO_FAST`/`FORM_EXPIRED`/`FORM_LINKS_NOT_ALLOWED`/
`FORM_BOT_CHECK_FAILED`, 403 `FORM_UNAVAILABLE`, 404 `FORM_NOT_FOUND`, 429 `RATE_LIMITED` with `Retry-After`. No CORS headers. Order: size and shape -> key shape -> `hitFormLimits("submit")` (on
agency refusal call `noteFlood` in its own transaction) -> `assertFormOpen` (outside the save's transaction) -> honeypot (record `spam`/`honeypot`, answer `201`) -> `checkOpenedToken` -> `assertNoLinks` ->
`botCheck.verify` outside any transaction when keys exist (`assertNotBot`) -> `forOrg`: `assertFormOpen` again, `assertAnswersMatchModes`, `receiveWebsiteEnquiry`, rerun once on a unique violation (W23, B26).

- [ ] **Step 1: tests first.** "a valid enquiry makes a lead with source web_form owned by the Owner, and the Owner is notified", "answers every non-refusal outcome with the same status and the same body" (new, repeat, blocked,
  fourth, duplicate id, honeypot), "a filled homepage is dropped with the thank-you and saves nothing", "a second after the page loaded is FORM_TOO_FAST and passes on the next try with the same token", "an expired token is FORM_EXPIRED", "three links
  are refused with their reason", "Turnstile fail is FORM_BOT_CHECK_FAILED; unreachable accepts and logs the lapse", "no keys: nothing is checked", **"refuses a submission when the agency went read-only after the page loaded"**, "a wrong origin or a form content type is
  403/415", "a 17 KB body is 413", "an unknown key in the body is 400", "the fourth submission from one address to one agency in ten minutes is 429; another agency still works", "no address: address limits skipped, the 21st enquiry of one agency in an hour is 429", "one flood notice per hour",
  "the unique violation rerun makes one lead", "nothing from the body (name, phone, email, message) reaches a log line" (read the memory logger), "no Access-Control-* header on any response".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/api-server exec vitest run test/website-form-submit.test.ts test/website-form-get.test.ts && pnpm --filter @travel-crm/api-server typecheck && pnpm --filter @travel-crm/api-server lint`. Commit: `feat(api): take a website enquiry`.

## Task B5: Mounting, the error handler's rows and the api README

**Files:** Modify `apps/api/src/app.ts` (mount `/api/public`, before tRPC's catch if any), `apps/api/src/error-handler.ts` (FORM_* statuses only if its table needs them), `apps/api/README.md` (routes list); test `apps/api/test/app-public.test.ts`.

- [ ] **Step 1: tests first.** "the app answers /api/public/website-forms/<key> without a session", "the routes are unaffected by AUTH_RATE_LIMIT", "an error nothing handled is logged by names and answered generically".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/api-server exec vitest run test/app-public.test.ts test/app.test.ts && pnpm --filter @travel-crm/api-server typecheck`. Commit: `feat(api): mount the public website form routes`.

---

# Part C: the agency's screens (branch `forms/settings`)

## Task C0: The page, its route and the Lead sources row

**Files:** Create `apps/web/src/lead-sources/website-form/{website-form-screen,use-website-form,status-card}.tsx`, `src/app/(app)/settings/lead-sources/website-form/page.tsx`;
tests `apps/web/test/lead-sources/website-form/screen.test.tsx`. Modify `src/lead-sources/lead-sources-screen.tsx` (second section **Website form**, one `Item`, `StatusBadge`), `website-form-settings.json`.

**Interfaces (Consumes):** `useTRPC().websiteForm.get|turnOn|turnOff`, `routes.websiteForm`. **Produces:** `useWebsiteForm(): { view, turnOn, turnOff, save }` (TanStack hooks over the router) and `<StatusCard />`.

- [ ] **Step 1: tests first.** "the row on Lead sources shows On, Off or Unavailable", "a page with no row shows the defaults and writes nothing", "the switch turns it on at once and off without a question", "Closed shows the read-only sentence in an Alert",
  "the turn-off switch stays open while read-only", "the demo's switch is disabled with 'Not available in the demo'", "no owner shows the FORM_NEEDS_OWNER sentence", "loading, error with Try again and refusal states", "needs leads:create and settings:manage (RequirePermission)".
- [ ] **Step 2: check the registry components** exist in `components/ui` (Switch, Select, Tabs, ToggleGroup, Checkbox, Textarea, InputGroup); add any missing with the pinned CLI and record in `components/ui/README.md`.
- [ ] **Step 3: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/lead-sources/website-form test/no-hand-drawn-borders.test.ts test/no-colour-literals.test.ts && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint`. Commit: `feat(web): the website form's page and its Lead sources row`.

## Task C1: Fields, words, look, Save

**Files:** Create `apps/web/src/lead-sources/website-form/{fields-card,words-card,look-card,save-bar,form-values}.tsx(ts)`; tests `.../fields-words.test.tsx`.

**Interfaces:** `<FieldsCard>` (six `Select`s Off/Optional/Required; Name and Phone "Always asked"; the offers `Switch` **rendered only while `features.marketingConsent`**), `<WordsCard>` (heading 80, introduction 200 with counts, thank-you 500, website link and button text, privacy link; https errors under the field via `useCheckedForm` and `saveWebsiteFormInput`), `<LookCard>` (reads Business profile; `TextLink` "Change in Business profile"), `<SaveBar>` (sticky on a phone; disabled with `WriteHint` read-only and when nothing changed; leaving with unsaved changes asks once).

- [ ] **Step 1: tests first.** "Save sends only changed settings and shows the saved state", "a non-https website link is an error under its field with the sentence", "Save is disabled when nothing changed and while read-only with its hint", "leaving with unsaved changes asks once", "no offers switch while the constant is false; present when mocked true", "character counts".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/lead-sources/website-form && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint`. Commit: `feat(web): the website form's fields, words and look`.

## Task C2: Share card and the snippet

**Files:** Create `.../website-form/{share-card,snippet-dialog,change-link-dialog}.tsx`; tests `.../share.test.tsx`.

**Interfaces:** `<ShareCard>`: read-only `InputGroup` with the hosted address, `CopyButton`, **Open** (new tab), **Change the link** (`ConfirmDialog`, `useWriteAccess("revoke")`, `returnFocusTo`), the "Allow my website to show this form" `Switch`, **Copy the snippet**; `<SnippetDialog>` (`ResponsiveDialog`, `Tabs` Script/Iframe; text exactly spec 3.3 with the app's origin from `window.location.origin`; with embed off, says so and offers the switch).

- [ ] **Step 1: tests first.** "the script and iframe snippets carry the key and the app origin", "Change the link holds while pending and shows the new link", "with embedding off the dialog offers the switch", "Copy puts the exact text on the clipboard", "Open has rel noopener".
- [ ] **Step 2: implement.**

**Gate:** same as C1 (`test/lead-sources/website-form`). Commit: `feat(web): share the form by link or snippet`.

## Task C3: Preview (waits for D1)

**Files:** Create `.../website-form/preview-dialog.tsx`; tests `.../preview.test.tsx`.

**Interfaces (Consumes):** `<WebsiteFormView mode="preview" width form send={...}>` from D1 (`@/website-form/website-form-view`), `websiteForm.preview`. `<PreviewDialog>`: `ResponsiveDialog` full screen on a phone, `ToggleGroup` Phone/Computer (390 or 960), "Preview. Nothing is sent.", Send disabled.

- [ ] **Step 1: tests first.** "Preview shows the unsaved settings", "the toggle sets the frame width", "Send is disabled", "closing returns focus to Preview". **Step 2: implement** (if D1 is not merged, build against `form-props.ts` with a stub view and replace it).

**Gate:** as C1. Commit: `feat(web): preview the form as visitors see it`.

## Task C4: The consent line on the person's card

**Files:** Create `apps/web/src/leads/lead/person-consent.tsx`; modify the person card file that lists the person's `Details` (find with `grep -rn "Details" apps/web/src/leads/lead`); tests `apps/web/test/leads/person-consent.test.tsx`.

**Interfaces:** `<PersonConsent leadId>`: nothing while `features.marketingConsent` is false **and** the person has no row; with a granted row "Agreed to offers on 22 Oct, from the website form" (`formatDay`) and **Record that they stopped** (ghost, `leads:edit`, `ConfirmDialog`); a withdrawn person shows "Asked to stop offers on 3 Nov" only.

- [ ] **Step 1: tests first** (flag mocked true): "shows the line and button for a granted person", "a person who never agreed shows nothing", "withdrawn shows the one sentence", "the button needs leads:edit and write access", "withdraw refreshes the lead".
- [ ] **Step 2: implement**; the existing lead-page tests still pass.

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/leads test/lead-sources/website-form && pnpm --filter @travel-crm/web typecheck`. Commit: `feat(web): the offers consent on a person`.

## Task C5: Last 30 days, the help text and the cold-start-friendly states

**Files:** Create `.../website-form/{counts-card,help-card}.tsx`; tests `.../counts.test.tsx`.

**Interfaces:** `<CountsCard>` (four mono-number cards each with `InfoHint`, "Stopped enquiries are never saved, so we can't show them."); `<HelpCard>` (the owner's item 5 of spec 15: the form is theirs; typed answers are personal data they now hold; the tick is a request, not proof; stopped enquiries aren't kept; changing the link breaks the old snippet); no "ask the platform to turn Turnstile on" nudge is shown (ruling F17).

- [ ] **Step 1: tests first.** "shows the four counts and the stopped note", "counts load again after a change". **Step 2: implement.**

**Gate:** as C1, plus `pnpm --filter @travel-crm/web exec vitest run test/support`. Commit: `feat(web): the form's counts and help text`.

---

# Part D: the visitor's form (branch `forms/hosted`)

## Task D1: The form component

**Files:** Create `apps/web/src/website-form/{website-form-view,form-fields,travellers-field,destination-field,month-field,budget-field,offers-field,form-values,colour-style}.tsx(ts)`; tests `apps/web/test/website-form/form.test.tsx`; `website-form.json`.

**Interfaces (Produces):** `export function WebsiteFormView(props: WebsiteFormViewProps): JSX.Element` (A7). Fields in the agency's order (spec 3.5): `TextField`, `PhoneField` (+91 first), Email, destination `Select` with **Somewhere else** (opens text, 80), **When?** (the `form.months` list, **I'm flexible**, **Not sure yet**), travellers (steppers, adults 2, children 0, an age `Select` per child), budget (`MoneyField` rupees + "for everyone / per person"), message (1,000 with count), the offers `Checkbox` only when `form.offersTickbox`, the honeypot (`homepage`: a text input off screen with `tabIndex={-1}`, `autoComplete="off"`, inside an `aria-hidden` wrapper, no label, **not** `display: none`), **Send enquiry** (agency colour via `colourStyle(form.colour)` setting `--primary`, `--primary-foreground`, `--ring` on the wrapper, 44px). Validation by `useCheckedForm` with the contract's schema; a `submissionId` (`crypto.randomUUID()`) made once per load and re-sent on every attempt.

- [ ] **Step 1: tests first.** "shows only the fields the agency set and in order", "name and phone required; a bad phone shows the sentence under the field", "Somewhere else opens a text field and sends a typed destination", "children above 0 ask an age each", "budget sends whole rupees and a basis", "no tickbox while the form says offersTickbox false", "the honeypot is off screen, not display none, aria-hidden and not tabbable", "the colour is set as variables on the wrapper, not a class", "Send shows Sending... and, after 15 seconds, the still-sending line (fake timers)", "a refusal shows its sentence in one Alert above the button and keeps what was typed and the same submissionId", "preview mode disables Send and says Nothing is sent", "axe: no violations".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/website-form test/no-hand-drawn-borders.test.ts test/no-colour-literals.test.ts test/no-inner-html.test.ts && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint`. Commit: `feat(web): the visitor's enquiry form`.

## Task D2: The pages, the thank-you and the unavailable states

**Files:** Create `apps/web/src/website-form/{form-page,use-public-form,thank-you,unavailable,waiting-note}.tsx(ts)`, `src/app/f/[key]/{page,layout}.tsx`, `src/app/embed/[key]/{page,layout}.tsx`; tests `apps/web/test/website-form/pages.test.tsx`.

**Interfaces:** `usePublicForm(key): { state: "loading" | "waking" | "ready" | "unavailable" | "not-found" | "failed"; form }` using plain `fetch("/api/public/website-forms/<key>", { cache: "no-store" })` (**not** tRPC and **not** the query cache - no storage): after 6 s `waking` ("Getting the form ready. This can take a minute."); a 5xx or network error retries after the cold-start wait once. Posting: one automatic retry for a 5xx with the same body. Thank-you replaces the form in place (no navigation): check icon, the agency's message, and the website button (`target="_top"` in the embed). Unavailable: "This form isn't taking enquiries right now." with name, logo and website button; not-found: "This form link doesn't work any more." with no name and no logo. `/f` and `/embed` set `robots: noindex`; `/f` has a best-effort `generateMetadata` asking the api for the name with a 2 s limit (generic title if it fails). `embedded` mode posts `{ type: "travel-crm-form:height", height }` to `window.parent` on every size change (ResizeObserver) and sets `embeddedOn` from `new URL(document.referrer).host` when it validates as a host name.

- [ ] **Step 1: tests first.** "ready renders the form for a good key", "five-second-plus wait shows the waking words", "unavailable and not-found show their sentences and nothing more", "thank-you replaces the form and shows the website button; embedded sets target _top", "a second send needs a reload", "a 503 on send retries once with the same submissionId", "the embed posts its height and embeddedOn is a host or 'Embedded'", "no cookie, localStorage or IndexedDB call is made" (spy on `document.cookie`, `localStorage`, `indexedDB`), "no tRPC request is made", "noindex metadata".
- [ ] **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/website-form && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint`. Commit: `feat(web): the hosted and embedded form pages`.

## Task D3: Turnstile in the form

**Files:** Create `apps/web/src/website-form/turnstile-widget.tsx`; tests `.../turnstile.test.tsx`.

**Interfaces:** `<TurnstileWidget siteKey onToken onReset ref>` loads `https://challenges.cloudflare.com/turnstile/v0/api.js` once with `async defer`, renders managed mode above the button, `onToken(token)`; `reset()` after a `FORM_BOT_CHECK_FAILED`. Renders nothing when `form.turnstileSiteKey` is null (no script load).

- [ ] **Step 1: tests first** (stub `window.turnstile`): "no key, no script", "a token is sent with the submission", "a bot-check refusal resets the widget and shows its sentence", "Send waits for a token when keys exist". **Step 2: implement.**

**Gate:** as D2. Commit: `feat(web): the Turnstile widget on the form`.

## Task D4: `embed.js`

**Files:** Create `apps/web/public/embed.js` (under 2 KB, no dependencies); tests `apps/web/test/website-form/embed-script.test.ts` (jsdom).

**Interfaces:** finds its own `<script>` (`document.currentScript`), reads `data-form`, validates `/^[A-Za-z0-9_-]{38}$/`, inserts an `iframe` (`title="Enquiry form"`, `loading="lazy"`, `width: 100%`, `border: 0`, `src` = `<script origin>/embed/<key>`) after the script; listens for `message` only from that iframe's `contentWindow` **and** the script's origin, accepts `{ type: "travel-crm-form:height", height }` with a finite number clamped 200-4000, sets the height. Reads nothing from the page, sends nothing.

- [ ] **Step 1: tests first.** "inserts the iframe from a valid key", "a malformed key inserts nothing", "ignores messages from another origin or another window", "clamps the height", "ignores a wrong type", "the file is under 2 KB" (read the file size). **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/website-form/embed-script.test.ts`. Commit: `feat(web): the embed script`.

## Task D5: Headers, service worker, root providers

**Files:** Modify `apps/web/security-headers.ts`, `test/security-headers.test.ts`, `src/service-worker/strategy.ts` (+ `test/pwa/strategy.test.ts`), `src/app/layout.tsx`, `next.config.ts` (only if the rule list needs `/embed.js`); create `src/pwa/app-providers.tsx`, `test/pwa/app-providers.test.tsx`.

**Interfaces:** `securityHeaderRules(settings)` returns, in order: the catch-all (its `PAGES` pattern excludes `API_PATHS` **and `embed`**), `TOKEN_PAGES` rules, `/f/:path*` (the catch-all headers, `connect-src`, `script-src`, `frame-src` plus `https://challenges.cloudflare.com`), `/embed/:path*` (the whole set built by `securityHeaders` **without** `X-Frame-Options`; CSP with `frame-ancestors https:` and the Turnstile origins; `Referrer-Policy: strict-origin`), and `/embed.js` (`Cache-Control: public, max-age=3600`). `strategyFor` returns `network-only` for `/f/` and `/embed` paths and `/embed.js` (`isPublicFormPath`). `AppProviders` wraps `DataProviders` + `ServiceWorkerRegistration` except on `isPublicFormPath(usePathname())`.

- [ ] **Step 1: tests first.** "the CSP rules for /f, /embed and /embed.js": "/f/x keeps frame-ancestors 'none' and X-Frame-Options DENY and adds Turnstile only to script, frame and connect", "/embed/x has frame-ancestors https: and no X-Frame-Options anywhere in the response headers", "no other route mentions challenges.cloudflare.com", "http: is not a frame ancestor", "the catch-all no longer matches /embed", "/embed.js caches for an hour"; service worker: "/f/ and /embed are network-only and never cached as pages"; providers: **"the root providers skip /f and /embed"** (DataProviders and the registration are not rendered; an IndexedDB spy is never called), "other paths still get both".
- [ ] **Step 2: implement.** Read `.next` output in D6, not here.

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/security-headers.test.ts test/pwa test/lib && pnpm --filter @travel-crm/web typecheck && pnpm --filter @travel-crm/web lint`. Commit: `feat(web): frame rules, worker exclusions and providers for the form`.

## Task D6: Weight and a built-page check

**Files:** Modify `apps/web/test/lighthouse-budgets.test.ts` and `scripts/lighthouse` config (find with `grep -rn "lighthouse" package.json scripts`: the public pages list gains `/f/<sample>`? the sample key needs the api - so only the weight test is added here); create `apps/web/test/website-form/build-weight.test.ts`.

**Interfaces:** the test reads `.next/app-build-manifest.json` or the build trace and fails if the `/f/[key]` first-load JS exceeds 150 KB gzipped (skipped with a clear message when no build exists; F9's full gate builds); asserts `public/embed.js` under 2 KB and the form page loads no web font beyond the app's own.

- [ ] **Step 1: write the test; Step 2: run `pnpm --filter @travel-crm/web build` once** (not in other gates) and fix weight by dynamic-importing the Turnstile widget and the destination list if needed.

**Gate:** `pnpm --filter @travel-crm/web build && pnpm --filter @travel-crm/web exec vitest run test/website-form/build-weight.test.ts`. Commit: `test(web): hold the form's weight to its budget`.

---

# Part E: platform (branch `forms/platform`)

## Task E1: Erasure of a customer

**Files:** Modify `packages/domain/src/platform/erase-customer.ts`, `packages/domain/src/platform/erasure.ts`, `packages/domain/src/crm/customer-erasure.ts`; tests `packages/domain/test/platform/website-form-erasure.test.ts`.

**Interfaces:** `eraseCustomerParts` gains a step in the platform transaction: delete the person's `person_consent` rows; `UPDATE website_form_submission SET person_id = NULL, lead_id = NULL` for their ledger rows (platform role); counts in the platform log (`consentRows`, `ledgerRows`).

- [ ] **Step 1: tests first.** **"erasing a customer removes their consent rows and nulls their ledger ids and the lead and note with them"**, "another person's rows are untouched", "the erasure counts include the new steps", "a person who erases themselves and enquires again is a new person". **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/platform/website-form-erasure.test.ts test/platform/erasure.test.ts test/crm && pnpm --filter @travel-crm/domain typecheck`. Commit: `feat(platform): erase a customer's consent and ledger ids`.

## Task E2: The demo

**Files:** Modify `packages/domain/src/platform/demo.ts`, `packages/domain/src/crm/{demo-leads,demo-lead-data}.ts`; tests `packages/domain/test/platform/website-form-demo.test.ts`.

**Interfaces:** `resetDemoOrganization` creates the demo's `website_form` row (`enabled false`, defaults, a sample thank-you) and two sample leads with source `web_form` (details "Hosted link" and "sharmatravels.in"); one has a `person_consent` row (flag-independent sample data: the line appears only when the switch is on or the row exists, per C4).

- [ ] **Step 1: tests first.** "the demo has an off form with default fields", "two web_form leads, one with consent, exist after a reset", "formOpenState refuses the demo even if enabled", "a second reset leaves exactly one form row". **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/platform/website-form-demo.test.ts test/platform/demo.test.ts && pnpm --filter @travel-crm/domain typecheck`. Commit: `feat(platform): the demo's website form and sample leads`.

## Task E3: The 90-day ledger sweep

**Files:** Create `packages/domain/src/platform/website-forms-sweep.ts`; modify `apps/api/src/console-jobs.ts`; tests `packages/domain/test/platform/website-forms-sweep.test.ts`.

**Interfaces:** `WEBSITE_FORMS_SWEEP_QUEUE = "platform.sweep-website-forms"`; `sweepWebsiteFormsNow(services, now): Promise<{ ledgerRowsDeleted: number }>` (pages of 200 in platform transactions, as `sheets-sweep.ts`); `websiteFormsSweepSchedule(services): ScheduledJob` cron `47 * * * *` Asia/Kolkata.

- [ ] **Step 1: tests first.** "deletes ledger rows older than 90 days and keeps newer", "pages through a backlog", "never touches another table". **Step 2: implement and register in `console-jobs.ts`** (the console's jobs list in its test gains the queue).

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/platform/website-forms-sweep.test.ts && pnpm --filter @travel-crm/api-server exec vitest run test/console-jobs.test.ts && pnpm --filter @travel-crm/domain typecheck`. Commit: `feat(platform): sweep the website form's ledger after 90 days`.

## Task E4: Query plans and budgets

**Files:** Create `packages/domain/test/performance/website-form-at-scale.test.ts`; modify `packages/domain/test/performance/large-agency.ts` only if the seed lacks a form (add the row).

**Interfaces:** reads each plan with `EXPLAIN` as `app_runtime` inside `forOrg` (`query-plans.ts` helper): the form by organization, `offeredDestinations`, `recentEnquiryCount`, `formCounts`, `findSubmission`.

- [ ] **Step 1: write the tests.** "the public GET's reads are index scans and total under 60 ms in the 50,000-lead agency", "receiveWebsiteEnquiry completes within 250 ms", "recentEnquiryCount is one index range read", "offeredDestinations is within budget" (a miss is fixed with an index in a new migration **in A's migration file only if still unmerged; otherwise a follow-up migration the owner applies by hand** - report it). **Step 2: fix what misses.**

**Gate:** `pnpm --filter @travel-crm/domain exec vitest run test/performance/website-form-at-scale.test.ts` (Docker, its own database). Commit: `test(domain): the website form's plans and budgets at scale`.

---

# Part F: closing (branch `forms/website`, after B, C, D, E are merged into it)

## Task F1: The journeys' harness

**Files:** Create `apps/web/test/e2e/support/{website-form,fake-turnstile,embed-host}.ts`, `fake-turnstile.test.ts`. Modify `apps/web/test/e2e/support/servers.ts` (starts the fake, sets `TURNSTILE_SITE_KEY`/`SECRET_KEY`/`VERIFY_URL`, `PUBLIC_FORM_PROXY_HOPS=1`, returns `apiUrl`), `global-setup.ts` if it needs the fake's address.

**Interfaces:** `fakeTurnstile(): Promise<{ url: string; willAnswer("pass" | "fail" | "error"): void; close() }>`; `embedHost(webUrl): Promise<{ origin: string; pageWith(key: string): string; close() }>` (a second origin on a free port serving a page with the `embed.js` tag); `support/website-form.ts`: `turnOnForm(page, options)`, `openHosted(context, key)`, `postEnquiry(request, key, body, headers?)` (direct to the api with Origin).

- [ ] **Step 1: tests first** (`fake-turnstile.test.ts`, like `fake-google.test.ts`). **Step 2: implement.**

**Gate:** `pnpm --filter @travel-crm/web exec vitest run test/e2e/support/fake-turnstile.test.ts && pnpm --filter @travel-crm/web typecheck`. Commit: `test(web): the form journeys' harness`.

## Task F2: Journeys 1, 2, 3, 4, 11 (the owner and the people)

**Files:** Create `apps/web/test/e2e/website-form-owner.spec.ts`, `website-form-people.spec.ts`.

Spec 13's journeys, each with axe after (the existing `accessible-after-each.ts`), phone and desktop: **1** the Owner turns it on, edits, saves, opens the link in a second signed-out context, sends; the lead is "Website form", Owner-owned, noticed; Preview shows the same form with Send off. **2** required/optional switches change the page; invalid phone and missing required show sentences; Somewhere else creates no destination and the text is in the note; a chosen destination is on the lead. **3** open lead -> repeat enquiry, person unchanged, email in the note; closed leads -> Returning; blocked -> thank-you, no lead; fourth in a day -> thank-you, nothing saved. **4** the responses' status and body compare equal across 3. **11** one `submissionId` twice -> one lead; erasing the customer removes the consent rows and ledger ids.

**Gate (run alone):** `cd apps/web && ./node_modules/.bin/playwright test test/e2e/website-form-owner.spec.ts test/e2e/website-form-people.spec.ts --project=phone` then `--project=desktop`. Commit: `test(web): journeys for the owner's setup and the people rules`.

## Task F3: Journeys 5, 6, 7 (spam, limits, address)

**Files:** Create `apps/web/test/e2e/website-form-spam.spec.ts`, `website-form-limits.spec.ts`.

**5** honeypot dropped with thank-you; a second-after-load submission told to retry and passing on the second try; three links refused with the sentence; fake Turnstile "fail" shows the sentence and resets the widget; "error" accepts. **6** (direct requests with a crafted `X-Forwarded-For: 203.0.113.<n>, 198.51.100.1`) the fourth to one agency in ten minutes is 429; the same address uses another agency; 21 header-less enquiries to one agency -> the 21st is 429; the Owner has exactly one flood notice. **7** `GET /api/public/client-address` with a forged leftmost header returns the real (non-forged) address; with a single entry returns none.

**Gate:** as F2 for these two files (`--project=phone` is enough for 6 and 7, which are request-level; 5 runs both). Commit: `test(web): journeys for spam, limits and the visitor's address`.

## Task F4: Journeys 8, 9, 10, 12 (availability, embed, consent, cold start)

**Files:** Create `apps/web/test/e2e/website-form-availability.spec.ts`, `website-form-embed.spec.ts`, `website-form-consent.spec.ts`, `website-form-cold-start.spec.ts`.

**8** off, read-only, suspended, a plan without crm, the demo and a changed link each show their page (3.8); the old link shows "doesn't work any more"; Turn off and Change the link work while read-only (use `support/subscription-states.ts`). **9** the embed host page on another origin: the iframe appears, sizes itself, posts an enquiry (the lead arrives), shows the thank-you; with embedding off the frame shows the message; `/f/` in an iframe is refused by the browser, `/embed/` loads. **10** consent: while the constant is false, no tickbox, no switch, `offers` in a direct post is 400; the same file holds the flag-on cases under `test.skip(!features.marketingConsent, ...)` (unit tests in A5 prove them with the mock). **12** `page.route` delays the api's GET and POST by 8 seconds: the waking words show after 6 s and the enquiry arrives once.

**Gate:** as F2 for these files, both projects. Commit: `test(web): journeys for availability, the embed, consent and a cold start`.

## Task F5: The visual audit

**Files:** Create `apps/web/test/e2e/audit/website-form.audit.ts`.

Per `docs/ui-build-loop.md`: shoot every new screen on a phone and a desktop: Lead sources row (on, off, unavailable), the page (all states, read-only, demo), the snippet dialog (both tabs, embed off), Preview (phone and computer widths), the hosted form with **three sample colours** (a dark one, a light one that falls back, none) and with each field mode, the thank-you, unavailable, not-found, the waking note, a refusal alert, the embed in the host page, and the person card with consent (flag mocked via a seeded row). Round 1 reviewed by vision reviewers into `AUDIT_OUT=test-results/audit/round-1`; shared pieces first, then per-screen fixes by ownership; round 2 into `round-2`; **no "must" left**.

**Gate:** `cd apps/web && AUDIT_OUT=test-results/audit/round-2 ./node_modules/.bin/playwright test --config playwright.audit.config.ts --grep "website form" --project=phone` then `desktop`. Commit: `test(web): the website form's visual audit`.

## Task F6: The docs and the deploy rows

**Files:** Modify `docs/deploy-checklist.md` (the settings table rows of spec 16, the notes, the routing table's three paths, the Hosting note, the console's jobs list gains the 90-day sweep), `docs/serverless.md` (a step after "5. Vercel: the web app": choose `PUBLIC_FORM_PROXY_HOPS` by the checks of spec 15 item 1, with the owner's click-by-click steps for Turnstile and the keep-awake ping, and a line in "Day to day" that this release **brings migration `20261029100000_website_form`: apply it by hand first**), `docs/superpowers/specs/2026-10-22-website-form-design.md` (status line: built), `packages/domain/README.md` (the module row), `docs/adr/README.md`.

- [ ] **Step 1:** write the rows and steps verbatim from spec 15-16 where they exist; change "ADR 0032" to "0033" in any text copied. **Step 2:** `pnpm format` on the files.

**Gate:** `pnpm exec prettier --check docs/deploy-checklist.md docs/serverless.md docs/adr/README.md packages/domain/README.md && pnpm run workflows:lint`. Commit: `docs: the website form's deploy rows, hosting steps and module notes`.

## Task F7: The CLAUDE.md lines

**Files:** Modify `CLAUDE.md` (repo root of the worktree).

Add, in the existing sections, in the file's own style (short, "why" clauses): **Shared services**, a bullet "Website form": the public routes (`/api/public/website-forms/*`, `/api/public/client-address`) are same-origin, no CORS, and run `assertFormOpen` inside the save's transaction; an enquiry is saved only through `receiveWebsiteEnquiry`; `unverified` means the visitor changes nobody; every non-refusal outcome answers the same body (W20). **Repo map / domain modules:** `website-forms` at L0, `person_consent` owned by crm. **The web app:** `/f` and `/embed` are outside the providers (no IndexedDB, no worker, no storage), the form message file split, `features.marketingConsent` off until the owner says. **The release:** the four new settings in the table and the hand-applied migration.

**Gate:** `pnpm exec prettier --check CLAUDE.md`. Commit: `docs: the website form's rules in CLAUDE.md`.

## Task F8: The branch gate, fixes and the spec-coverage review

- [ ] **Step 1:** the whole-branch review in three slices (server and security; agency screens and the visitor's form; docs and release), each hunting the seams (a reason with no sentence, an api kind the screen ignores, the same helper built twice, docs that disagree with the code), per `docs/agent-playbook.md` section 2.
- [ ] **Step 2:** one fix dispatch by file ownership, one scoped re-review.
- [ ] **Step 3:** tick the "Spec coverage" table below against the code; any row without a test is a finding.

**Gate:** none of its own (reviews). Commit: `fix(...)`: one per fix.

## Task F9: The one full gate

The only full gate. One builder, nothing else running Docker.

```bash
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm run scripts:test && pnpm exec turbo run typecheck lint test --concurrency=2 && pnpm run depcruise
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=phone
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=desktop
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm migrations:check
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm workflows:lint
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm audit --audit-level=high
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm images:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm product:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm lighthouse
```

`relay.test.ts` and `counters.test.ts` may need one re-run alone. Then the controller merges `forms/website` into `main` with
`git merge --no-ff forms/website -m "chore: merge forms/website (website enquiry form)"`; **the owner applies the migration by hand first**.

## Spec coverage (self-review)

| Spec                         | Task(s)                | | Spec                          | Task(s)             |
| ---------------------------- | ---------------------- |-| ----------------------------- | ------------------- |
| W1, W2 settings, defaults    | A2, A4, A6, C0-C1      | | W22 three a day               | A4, A5, F2          |
| W3 words, no HTML            | A3, C1, D1             | | W23 re-check in the save      | A4, B4              |
| W4, W5 key, change the link  | A4, A6, C2             | | W24 audit with actor public   | A1, A5              |
| W6 closed states             | A4, B3, B4, F4         | | W25-W27 consent               | A3, A5, C4, F4      |
| W7 the Owner owns it         | A5, B3                 | | W28, W29 same origin, no storage | B4, D2, D5       |
| W8 destinations              | A5, B3, F2             | | W30, W31 framing, snippet     | D4, D5, F4          |
| W9-W11 month, travellers, budget | A3, D1             | | W32-W35 address reading       | B1, B3, F3          |
| W12, W13 note, name/phone    | A3, A5                 | | W36-W38 honeypot, time, links | A4, B4, D1, F3      |
| W14, W15 source, stage       | A5                     | | W39 Turnstile, fail open      | B2, B4, D3, F3      |
| W16-W17 the one save path    | A5                     | | W40 flood notice once         | A4, B4, F3          |
| W18 unverified               | A5, F2                 | | W41, W42 refusals, cold start | D1, D2, F4          |
| W19 blocked                  | A5, F2                 | | 3.1-3.9 screens               | C0-C5, D1-D2        |
| W20 one answer               | A5, B4, F2             | | 10 erasure, 11 demo, 7.2 sweep | E1, E2, E3         |
| W21 double send              | A4, A5, B4, F2         | | 12 performance                | D6, E4              |
| 14 build order               | Parts A-F              | | 15 owner steps, 16 rows       | F6                  |
