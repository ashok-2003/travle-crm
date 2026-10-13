# Travel CRM: Foundation design

- **Status:** draft for review
- **Date:** 2026-10-13
- **Scope:** Phase 1, build step 1 (Foundation)
- **Source:** three rounds of design review on the "Travel Agency OS Blueprint". The old Yatra Hikes CRM is a reference for how agencies work, not a code base to build on.

## 1. Context

**Product.** A subscription platform that runs Indian travel agencies: leads, WhatsApp, quotes and itineraries, group departures, suppliers and partners, and GST accounts in one place. "Travel Agency OS" is a working name. It lives only in the brand package (section 10).

**Who buys.** Many Indian travel agencies, on a monthly or yearly subscription. In the product, each agency is an **organization**.

**How it grows.** In phases, with no fixed date; quality comes first.

1. Small Indian agencies.
2. Indian tour operators broadly: bigger teams, team-level permissions, a customer portal, B2B links.
3. Global: other currencies, tax systems and languages.

**Phase 1 build order.** Each step gets its own spec, plan and build.

1. **Foundation** (this spec)
2. CRM + WhatsApp inbox
3. Catalog + quotes
4. Bookings + departures
5. Suppliers + partner portal
6. Accounts & GST
7. Reports

**How we sell.** Sales-led: the platform team demos, creates the organization and invoices by hand. Self-serve sign-up, free trials and online billing come later, on the same data model.

**How it's used.** A mobile-first PWA installed on staff phones. Native apps (Expo) come later from the same monorepo.

**How it's built.** Mostly by Claude, directed by the product owner, in short iterations that ship to the pilot. The pilot is Yatra Hikes, starting with fresh data and no migration.

**Parked: not designed for in Phase 1.**
- White-label, custom domains per organization, and one-time or self-hosted sales.
- Self-serve sign-up and online subscription billing.
- Sign-in with a phone code.
- Working fully offline.
- Native apps.
- AI features (Q10).

## 2. What the Foundation delivers

A running skeleton that later modules plug into. When it is done:

1. The platform team can create an organization with a plan and subscription dates, and invite its owner.
2. The owner and staff can sign in, either with email and password or with organization code, username and password.
3. Owners can create staff, including staff without email, edit roles and permissions, and remove staff.
4. Every request passes the checks in section 6.4. Organization isolation is enforced by Postgres and proven by tests on every pull request.
5. The subscription lifecycle (section 7.3) runs from a scheduled job.
6. The shared services in section 9 exist and are each used at least once:
   - jobs and the outbox
   - files
   - a PDF
   - notifications
   - audit log
   - soft delete
   - money and tax types
   - typed errors
   - webhook intake
7. CI runs every gate in section 12.1. Docker images for web, api and worker build and run locally with Docker Compose.

No business modules (CRM, quotes and so on) are built here. Each has its own spec.

## 3. Architecture

A TypeScript modular monolith in a Turborepo + pnpm monorepo.

```
apps/
  web/           Next.js PWA · screens only · TanStack Query
  api/           Hono · tRPC, auth, webhooks, public routes; `worker` command for jobs
  mobile/        later · Expo
packages/
  domain/        business rules, one folder per module, public index.ts each
  api/           thin tRPC routers; apps import their types only
  db/            Prisma 7 schema (one file per module), migrations, RLS SQL
  contracts/     Zod schemas for every input and output
  integrations/  adapters: email, storage, PDF, jobs; later WhatsApp, Razorpay
  brand/         product name, logo, icons, colours (section 10)
  ui/            shadcn components + shared widgets
  config/        TypeScript, ESLint, dependency-cruiser settings
```

**Request path.**

```
browser → /api/trpc → router (checks) → domain → db.forOrg() → Postgres
```

**Rules.**
- The API is the only thing that touches data. The web app imports the API's types, never its code.
- The browser always calls `/api` on the address it loaded the app from: a Next.js rewrite in development, a reverse proxy or load balancer rule when deployed. Cookies stay first-party.
- Domain code never calls a vendor SDK. It calls an adapter in `packages/integrations`.
- Webhooks (`/webhooks/*`) and public routes (`/public/*`, `/p/{token}`) live in the same Hono app.

## 4. Data isolation

**One database, one set of tables.** Every organization-owned table has `organization_id uuid NOT NULL`.

**Postgres enforces it** with row-level security (RLS).

```sql
-- applied to every organization-owned table, in the migration that creates it
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
ALTER TABLE <t> ALTER COLUMN organization_id
  SET DEFAULT NULLIF(current_setting('app.org_id', true), '')::uuid;
CREATE POLICY org_isolation ON <t>
  USING      (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
```

`NULLIF(..., '')` matters. Once a custom setting has been used in a pooled session, it reads back as `''` rather than NULL, and casting `''` to uuid would raise an error. With `NULLIF`, an unset organization matches no rows (fails closed), and inserts fail on `NOT NULL`.

**`db.forOrg(orgId, fn)`** is the only way to reach organization data.
- It opens a Prisma interactive transaction.
- Its first statement is `select set_config('app.org_id', $1, true)`, which is transaction-local and therefore safe behind a transaction-mode connection pooler.
- It then runs `fn(tx)`.
- A lint rule bans importing the raw Prisma client anywhere except `packages/db`.

**Database roles.**

| Role | Used by | Bypasses RLS? |
|---|---|---|
| `app_migrator` | migrations; owns the tables | not used at runtime |
| `app_runtime` | api and worker | never (`FORCE ROW LEVEL SECURITY`, no `BYPASSRLS`) |
| `app_platform` | platform console only, separate client and connection | yes, for cross-organization admin work |

**Sign-in tables are outside RLS.** These are Better Auth's tables: user, account, session and verification, plus the organization plugin's organization, member and invitation tables. Better Auth reads them before or while the organization is being worked out. Only `packages/domain/identity` may import them, and dependency-cruiser enforces that. The schema check (below) has an explicit allow-list for them.

**Checks on every pull request.**
- **Isolation suite:** creates two organizations, writes as A, and asserts B cannot select, update or delete any of A's rows, for every organization-owned table.
- **Schema check:** fails if any table with an `organization_id` column lacks RLS, forced RLS, or the `org_isolation` policy, unless it is on the sign-in allow-list.

**Smaller rules.**
- **IDs:** UUID v7.
- **Human-readable numbers** (for example `BK-2026-0042`): come from a per-organization counter table, incremented inside the same transaction.
- **One user, one organization:** enforced by a unique constraint on `member.user_id`. Relaxing it later means dropping that one constraint. Platform staff have platform accounts, not memberships.
- **Demo and trial organizations** are ordinary organizations.
- **Escape route:** a very large organization can later move to its own database with the same schema.

## 5. Soft delete and data retention

- **Delete means hide.**
  - Every business table has `deleted_at` and `deleted_by`.
  - A Prisma client extension turns deletes into updates and hides deleted rows from reads.
  - An explicit `withDeleted()` exists for Trash screens and restore.
- **Unique values** such as usernames and organization codes use partial unique indexes (`WHERE deleted_at IS NULL`), so a deleted value can be reused. These are written in SQL migrations.
- **Money documents** (invoices, receipts, payments) are never deleted, only cancelled or credited.
- **Permanent deletion** happens only through a super-admin action in the platform console.
  - It covers a whole organization, or one traveller's data on a DPDP erasure request passed on by the organization.
  - Steps: export, typed confirmation, purge job, then an audit record in the platform log.
- **Traveller ID documents** (Aadhaar, passport) are soft-deleted like everything else; they are not auto-purged. They carry a `sensitive` flag and need the `documents:view_sensitive` permission to view.
- **Cancelled organizations** keep their data, locked, with no time limit, until a super admin deletes it.

## 6. Identity, sign-in and permissions

### 6.1 Who signs in

| Who | Where | Notes |
|---|---|---|
| Platform team | Platform console | Platform accounts. Support can impersonate an organization user for up to 1 hour. Impersonation shows a banner and is written to that organization's audit log. |
| Organization staff | Organization app (PWA) | Created by the organization's admins. There is no self sign-up. |
| Partner operators | Partner portal (step 5) | A role type the organization creates. The portal itself is built in step 5. |
| Customers | `/p/{token}` links | No login in Phase 1. |

### 6.2 Better Auth

Better Auth is a library inside `apps/api` with its tables in our Postgres. Plugins used:

- **Email and password:** passwords are stored only as hashes; reset is by email link.
- **Organization:** organizations, members, roles. Limited to one membership per user (Q2: confirm its custom-roles API fits; otherwise use our own `role` and `role_permission` tables).
- **Admin:** create users, revoke sessions, impersonation.
- **Two-factor:** TOTP. Optional per user; an owner can require it for the whole organization.
- **Built-in sign-in rate limiting.** Cloudflare Turnstile is added after repeated failures.

### 6.3 Signing in

- **One address for everyone.** Two ways in:
  - **Email** plus password.
  - **Organization code + username** plus password. The PWA remembers the organization code after the first sign-in.
- **Organization code:** short, uppercase and unique (for example `SHARMA`). It is set when the platform team creates the organization.
- **Username** is unique within its organization. Email is unique across the product.
- **Username sign-in** is resolved by our own pre-step: (organization code, username) → user, then Better Auth's sign-in runs. Its username plugin enforces global uniqueness, so we don't use it for lookup.
- **Staff without email are allowed.**
  - Their admin sets a temporary password, which must be changed at the next sign-in.
  - Only the admin can reset it later.
  - If Better Auth requires an email on every user, these users get an internal placeholder address that is never shown or emailed. Confirm in planning.
- **Removing someone:** revoke all their sessions, soft-delete the membership, and release their email by moving it to `former_email`, so another organization can add that person later.

### 6.4 Sessions

- **Database sessions** (Better Auth default) plus a **5-minute signed cookie cache**, using the `jwe` or `compact` strategy (decide in planning).
- **Most requests** are verified from the cookie alone. The session row is read at most once per device every 5 minutes.
- **Sensitive procedures** read the session from the database every time: money, roles and permissions, exports, staff management. Removal therefore takes effect immediately for them, and within 5 minutes everywhere else.
- **Scale path:** move sessions to Redis with Better Auth `secondaryStorage` (configuration, not redesign). The per-request organization, plan and role lookups can be cached briefly in each container.
- **Native app (later):** the same session token, kept in secure storage and sent as a bearer token.

### 6.5 Permissions and request checks

- **Permission catalog in code** as `module:action`, for example `leads:create`, `bookings:edit`, `money:view_margin`, `staff:manage`, `roles:manage`.
- **Roles** are named sets of permissions, stored per organization. Each organization starts with five: Owner, Admin, Sales, Operations, Accounts. Owners can edit them or add new ones; Owner always keeps every permission.
- **View scope:** each view permission carries a scope of `own` (records assigned to me) or `all`. Team scope comes in Phase 2.
- **Margin fields:** the response schemas leave out cost, margin and profit fields unless the caller has `money:view_margin`.
- **Procedure builder:**
  ```ts
  orgProcedure.requires('leads:create').requiresFeature('crm')
  ```
- **Every request runs these checks in order:**

| # | Check | Fails with |
|---|---|---|
| 1 | Signed in (session) | 401 |
| 2 | Organization active (subscription state, section 7.3) | read-only or blocked |
| 3 | Module on the plan (entitlements) | `FEATURE_LOCKED` |
| 4 | Role permission | 403 |
| 5 | Record in scope (`own`/`all`) | not found |
| 6 | Postgres RLS | 0 rows |

## 7. Platform admin and subscriptions

### 7.1 Onboarding

The platform team creates an organization with:
- name
- GSTIN
- state (for GST place of supply)
- contacts
- organization code
- plan and subscription dates

The owner then gets an email invite and lands on a setup checklist: logo and branding, GST and bank details, invoice prefix, staff, and later WhatsApp and lead import.

### 7.2 Plans are data

- **`plan`** holds:
  - the INR price, monthly or yearly
  - limits: seats, WhatsApp numbers, storage
  - which modules it includes
- **`subscription`** is per organization: plan, dates, status, and overrides (extra seats, a custom price, a module switched on early).
- **Entitlements** = plan + overrides. They are checked on every request. Overrides double as feature flags, which is how the pilot gets modules early.

### 7.3 Lifecycle

```
trial ─▶ active ─▶ past_due ─▶ read_only ─▶ suspended ─▶ cancelled
                       ▲           │            │
                       └── payment recorded ◀───┘
```

| State | Access |
|---|---|
| `past_due` | Full access plus a warning banner. Default 7 days. |
| `read_only` | View and export, no new records. Default 14 days. |
| `suspended` | The owner can only export or pay. |
| `cancelled` | Data kept and locked until a super admin deletes it. |

- Both durations are settings (Q3 confirms the defaults).
- A daily job moves states; recording a payment returns the organization to `active`.

### 7.4 Billing and other platform features

- **Billing:** outside the product in Phase 1. The console records amount, dates and status. Razorpay Subscriptions webhooks update the same record later.
- **Demo organization:** one shared demo with realistic sample data, reset nightly by a job.
- **Platform dashboard:** organizations with status, days left, seats used, last activity, and monthly usage counters.

## 8. Module map (context for later specs)

Calls go only down the layers, through each module's `index.ts`; events go up through the outbox.

| Layer | Modules |
|---|---|
| L5 | reports (read-only) |
| L4 | accounts |
| L3 | bookings |
| L2 | quotes, departures |
| L1 | crm |
| L0 | catalog, suppliers, inbox |
| base | platform/identity (organizations, plans, members, roles, settings); shared kernel (money, tax, dates, ids) |

- dependency-cruiser fails CI on calls that go upward or across into another module's tables.
- The Prisma schema has one file per module. Cross-module foreign keys are allowed, but only the owning module queries its tables.
- **Example:** `bookings.confirm()` calls `departures.holdSeats()` in the same transaction and writes a `booking.confirmed` outbox row. The worker then delivers it to accounts (which drafts the invoice) and notifications.

The Foundation builds only the base layer.

## 9. Shared services

### 9.1 Jobs and the outbox

- **pg-boss** in Postgres; no extra queue server.
- **Domain events** are written to an `outbox` table in the same transaction as the change. A relay moves them to pg-boss.
- **The worker** is `apps/api` started with the `worker` command, from the same image. It processes events, notifications, PDFs, imports and scheduled jobs. It scales by adding copies.
- **Organization context:** every job carries `organizationId` and runs inside `db.forOrg()`.
- **Listeners** are idempotent, keyed by event id.
- **Failures:** retries back off exponentially. After the last retry, a job lands in a failed-jobs list in the platform console.
- **Scheduled jobs** in the Foundation: the subscription lifecycle, demo reset, and outbox relay sweep. Later steps add reminders, digests and Sheets sync.
- **Times** follow each organization's time zone.

### 9.2 Files

- Behind an S3-compatible storage adapter: AWS S3 or another provider in the cloud, MinIO locally.
- Uploads and downloads go directly from the browser using short-lived presigned URLs.
- One `attachment` table links a file to any record. Files count toward the plan's storage limit.
- Sensitive files: see section 5. Malware scanning comes later.

### 9.3 PDFs and share links

- **React-PDF** templates use the organization's own logo, colours and terms.
- **Rendering** happens in the worker. An issued document's PDF is stored and never regenerated.
- **Share links** look like `/p/{token}`. The token is random, can expire and can be revoked, and opening the link is recorded.
- The Foundation ships the renderer, the share-link mechanism, and one sample template.

### 9.4 Notifications

- One `notify()` service with these channels:
  - in-app bell
  - web push
  - email (SES or SMTP adapter)
  - WhatsApp templates, added in step 2
- Email comes from our domain, with Reply-To set to the organization. Sending from an organization's own domain comes later.
- Opt-outs are respected (DPDP, WhatsApp rules).

### 9.5 Audit log

- Append-only and organization-scoped, written in the same transaction as each change.
- Each entry records who, what, before and after, when, and the source: web, api, job, or support impersonation.

### 9.6 Shared kernel

- **`Money`:** integer paise plus a currency code. All arithmetic and rounding live in one place.
- **`TaxEngine` interface.** Phase 1 implements India GST: CGST+SGST or IGST by place of supply, SAC codes, and a rate per item.
- **Time:** stored in UTC and shown in the organization's time zone. Departure dates use the `date` type.
- **Display:** Indian number format (₹12,50,000).
- **Translation:** next-intl from day one; Phase 1 is English only.
- **Phone numbers:** normalised to E.164 on save (libphonenumber-js, India by default).

### 9.7 Errors, webhooks, abuse protection

- **Typed `DomainError` codes:** `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `LIMIT_REACHED`, `FEATURE_LOCKED`, `VALIDATION`. Each maps to an HTTP or tRPC status and a translated message.
- **Webhook intake**, in order:
  1. Verify the signature.
  2. Store the raw payload.
  3. Reply 200.
  4. Queue a job.
  5. Process it, ignoring repeats by provider event id.
  The Foundation ships the generic intake; providers arrive in later steps.
- **Rate limiting:** on sign-in, public forms and share links. Public forms also get Turnstile.

## 10. Brand package: one source of truth

`packages/brand` holds:

- `brand.ts`:
  - product name, short name, tagline
  - colours as design tokens, read by Tailwind and the PDF templates
  - support email and phone
  - legal company name
  - website address
  - email sender name
- `assets/logo.svg` and `assets/logo-dark.svg`. App icons, the PWA manifest icons and the favicon are generated from them at build time.

**Consumers:**
- screens: header, sign-in, page titles
- PWA manifest
- email layouts
- PDF footer
- platform console and error pages

**Rules:**
- Code reads the name through the package's import.
- A CI check fails if the product name string appears outside `packages/brand`.

**Not the same as an organization's own branding.** An organization's logo, colours and terms on its quotes and invoices are per-organization settings stored in the database.

## 11. Frontend shell

- **Stack:** Next.js PWA with Tailwind and shadcn/ui, mobile-first.
- **Data:** all data goes through tRPC's TanStack Query integration.
  - Cached queries with background refresh.
  - Prefetch of likely next screens.
  - Optimistic updates for quick actions.
  - Targeted invalidation by query key.
  - The cache is persisted to IndexedDB for weak connections and wiped on sign-out.
- **Navigation and actions** are driven by the caller's permissions and entitlements. Hiding things is for convenience only; the API enforces everything.
- **Foundation screens:**
  - **Account:** sign-in (both ways), forgot or reset password, first-login password change, two-factor setup.
  - **Organization:** setup checklist, settings (profile, GST, branding, organization code display), staff (list, create with or without email, edit, remove, reset password), roles editor, audit log viewer, Trash.
  - **Platform console:** organizations, plans, subscriptions and overrides, impersonation, failed jobs, dashboard.

## 12. Quality, environments and hosting

### 12.1 CI gates on every pull request

1. Install, then `prisma generate`.
2. Strict TypeScript typecheck; build errors are never ignored.
3. Lint, including dependency-cruiser boundaries and the brand-name check.
4. Unit and API tests with Vitest against real Postgres (Testcontainers).
5. Isolation suite and RLS schema check.
6. Playwright journeys. Foundation journeys:
   - sign-in both ways
   - an owner creating staff
   - a forbidden action
   - an organization in `read_only`
   - impersonation
7. Build Docker images for web, api and worker.

**Releases.** Merges to `main` deploy to staging. Production deploys only a release the product owner approves.

### 12.2 Environments

| Environment | Runs |
|---|---|
| Local | Docker Compose: Postgres (with the three roles), MinIO, Mailpit |
| Staging | Demo data, test keys |
| Production | Real organizations |

### 12.3 Hosting

**Docker images on a serverless container platform in Mumbai**, either Google Cloud Run (`asia-south1`) or AWS ECS Fargate (`ap-south-1`). The platform is chosen before the first staging deploy (Q11, Q6). The Foundation commits to rules that keep any choice open:

- **Stateless containers:** no local files; sessions in the database; settings from environment variables.
- **Startup and shutdown:** a health endpoint, and graceful shutdown on SIGTERM.
- **Connection pooling:** Postgres sits behind a transaction-mode pooler. This is safe because of the transaction-local `app.org_id`.
- **Migrations** run as a one-off job from the api image before traffic shifts. Schema changes follow expand, migrate, contract.
- **Secrets** come from the cloud's secret manager as environment variables, never baked into images.
- **Backups:** daily, with point-in-time restore, switched on before the first paying organization. A restore is practised every quarter.
- **Logs** carry a request id and an organization id. Sentry collects errors from web, api and worker.

### 12.4 Security housekeeping

- Renovate and GitHub code scanning.
- HTTPS only, with strict security headers.
- Before the first paying organization: a privacy policy, a data processing agreement, and written breach-response steps (DPDP).

### 12.5 Working agreements

- **Repo guardrails:**
  - a `CLAUDE.md` recording these conventions
  - a README per module listing its public functions and events
  - a pull request template asking what was tested
  - architecture decision records in `docs/adr`, with this spec as the first set
- **Vertical slices** in 1 to 2 week iterations with the pilot. Small pull requests go to `main` behind plan-override flags.
- **"Done" means:**
  - CI is green
  - the new behaviour has tests
  - the module README is updated
  - it runs on staging
  - the product owner has seen it

## 13. Open items

| Item | Needed by | Default or plan |
|---|---|---|
| Q2: Better Auth organization plugin custom roles fit | planning | verify; fall back to our own role tables |
| Q3: `past_due` and `read_only` durations | before the lifecycle job ships | 7 and 14 days, configurable |
| Q4: plans and INR prices | first paying organization | plans are data; no code impact |
| Q5: payments recorded on bookings until Accounts (step 6) | step 4 spec | — |
| Q6, Q11: cloud account owner and hosting platform | first staging deploy | Cloud Run or ECS Fargate in Mumbai |
| Q7: Meta Tech Provider registration | step 2 | start early; verification takes weeks |
| Q8: product name | any time | brand package; one edit |
| Q10: AI features | later phase | — |
| Better Auth with users that have no email | planning | placeholder address if required |
| Cookie cache strategy (`jwe` or `compact`) | planning | — |
