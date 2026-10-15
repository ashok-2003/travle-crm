# 0006: Identity and sessions

Date: 2026-10-14 · Status: accepted · Implements spec sections 6.1 to 6.4

## Decision

- **Better Auth 1.7.7 runs inside the api**, configured in `packages/domain/src/identity/auth/create-auth.ts`. Spec
  section 4 lets only the identity module touch the sign-in tables, so the configuration lives there and reaches the
  database through `@travel-crm/db/identity`, which dependency-cruiser keeps to the identity module.
- **Plugins:** username, organization (its `slug` is our `code`), admin, two-factor (TOTP). Email and password sign-in
  with sign-up switched off and passwords of 10 to 128 characters.
- **Organization-code sign-in.** Better Auth stores the username as `<org code>:<username>`, lowercased
  (`sharma:ravi`), so its global uniqueness is our per-organization uniqueness. `POST /api/auth/sign-in/org` takes
  `{ orgCode, username, password }`, builds that username and hands the request to Better Auth's username sign-in,
  so rate limiting, two-factor, cookies and hooks apply unchanged.
- **Staff without email** get the placeholder `<code>-<username>@no-email.invalid` (Better Auth requires an email).
  Our API never shows it: tRPC outputs show `null` and their schemas refuse `.invalid` addresses, and the two-factor
  setup link is relabelled `<CODE> <username>` for the authenticator app. Better Auth's own `/get-session` and sign-in
  responses do include the raw `user.email`, so the web app must never display it (plan 5 handles that in the UI).
- **Staff are created in one transaction** of our own (user, password account, membership), with Better Auth's
  password hasher. Every new member gets a temporary password and must change it at first sign-in
  (`user.must_change_password`, cleared by Better Auth hooks after `/change-password` or a password reset).
- **Sessions** are database rows plus a 5-minute JWE cookie cache (answering the spec's open item). Each session
  carries its organization (`active_organization_id`), set by a hook when the session is created.
- **Request checks.** `protectedProcedure` trusts the cookie cache. `orgProcedure` also reads the membership, role and
  permissions from the database on every request. `freshProcedure` (money, roles, exports, staff management) and
  the console's `staffProcedure` and `superAdminProcedure` (`packages/api/src/platform/procedures.ts`; plan 4
  replaced the earlier `platformProcedure`) re-read the session itself, ignoring the cache.
- **Password reset by email** (plan 3): `POST /api/auth/request-password-reset` with `redirectTo` set to the web
  app's reset page (`${APP_URL}/reset-password`) emails a one-hour link from our address under the product's name.
  Opening it leads back to that page with a token, and `POST /api/auth/reset-password` sets the new password, clears
  `must_change_password` and deletes every session the person had (what that ends at once is in Context). The token
  works once and is stored only as a hash.
  - **The same answer for every address.** Staff without email are never emailed (their admin resets their
    password), and every request gets the same status, headers and body whether or not the address exists. Sending
    starts on a later turn of the event loop, after the answer, so the time to answer is close for every address too.
  - **Only the reset page.** A `redirectTo` that names anything else (another page on a trusted origin, or no page at
    all) is refused by a side door before the address is looked up, word for word as Better Auth refuses an untrusted
    origin (403).
  - **Limits.** Better Auth allows 3 requests a minute per client address, read as sign-in reads it. One address gets
    at most 3 reset emails an hour, counted in Postgres across instances; over that, nothing is sent and the answer
    is unchanged.
  - **Logs.** A failed send is logged by its code alone: the message could quote the link, whose token must never
    reach a log.
  - **Placeholders.** No side door answers a placeholder address early. Better Auth stays the only source of the
    answer for every address, so that answer can't drift from a real address's on an upgrade; the sender skips
    placeholders instead.
- **Two-factor** is optional per person. An organization with `require_two_factor` refuses members without it
  everywhere except `me.get` and Better Auth's `/two-factor/*` endpoints. Turning the requirement on needs
  `settings:manage` and two-factor on the person doing it; turning it off needs an Owner (`OWNER_ONLY`), since spec 6.2
  makes requiring it an Owner's choice.
- **Platform staff** have user role `admin` and no membership, ever (removed members count). They may impersonate a
  user for up to an hour. Starting and stopping it is recorded in that member's organization's audit log, and
  everything done meanwhile is recorded with `source: "impersonation"` and the admin's id (ADR 0015).
- **Side doors closed** by a `hooks.before` middleware in `auth/side-doors.ts`: `/update-user` refuses `username` and
  `displayUsername` (only our staff API changes them), `/is-username-available` is closed, `/change-password` refuses
  a new password equal to the current one, and every `/admin/*` path re-checks the caller against our definition of
  platform staff (Better Auth checks `user.role` alone) and refuses to make a member a platform admin. Better Auth's server-side
  `auth.api.*` calls also run this hook, so a server-side admin call needs a platform admin's request headers; the
  platform console makes none: identity writes platform staff's levels itself (ADR 0019).
- **Hardening:** origin and CSRF checks pinned on; `/api/auth/organization/*` closed; request bodies on `/api/auth/*`
  and `/api/trpc/*` capped at 64 KB (413); trusted origins, secure cookies and the client-IP header come from the
  environment; production requires HTTPS and rate limiting.

## Context

- **Why not Better Auth's `createUser` and `addMember`.** Two calls, not atomic: a failure between them leaves a user
  with no organization. Our one transaction also holds the role (`FOR SHARE`), checks that the person adding staff may
  give it, and reads the organization code, before it writes the rows.
- **Cookie cache staleness.** A revoked session passes the cache for up to 5 minutes. Because `orgProcedure` reads the
  membership from the database, a removed member is refused on their next request anyway; only `me.get` still
  answers from the cache, with no organization.
- **What a password reset ends at once.** The person's session rows are deleted, so `freshProcedure` and the console's
  `staffProcedure` and `superAdminProcedure`, which re-read the session, refuse a stolen cookie straight away. Its
  5-minute cookie cache can still pass `protectedProcedure` and the other organization procedures until it expires: the
  window plan 2 accepted above. If that ever needs closing, one option is a `sessions_valid_after` time on the user, set
  by a reset and checked in `resolveAccess` against when the session was created.
- **The reset link's token outside the api (plan 5).** The emailed link is `GET /api/auth/reset-password/<token>`, so
  a load balancer's access log records the token: the deploy keeps those logs short-lived or strips that path
  (`docs/deploy-checklist.md`).
  The web app's reset page gets the token in its address, so it must send `Referrer-Policy: no-referrer`, remove the
  token from the address bar with `history.replaceState` once it has read it, and load no third-party scripts.
- **Better Auth skips its origin check when `NODE_ENV` is `test`.** We pin `disableOriginCheck: false`, so tests prove
  the same CSRF protection production has.
- **Rate limits are kept in memory**, per instance. With several instances behind a load balancer, move them to the
  database or a shared store (Better Auth `rateLimit.storage`) before launch. The client address comes from the
  header named in `AUTH_IP_ADDRESS_HEADERS`; the load balancer must set it, or all clients share one limit.
- **The client address behind proxies.** Better Auth 1.7.7 trusts `x-forwarded-for` only when it holds a single value,
  unless `advanced.ipAddress.trustedProxies` is set. Behind a proxy that appends to the header, every client would fall
  into one shared bucket and three failed sign-ins would lock everyone out. So either the load balancer overwrites the
  header with the single client address, or the deploy sets `AUTH_TRUSTED_PROXIES` (IPs or CIDRs of the proxies); the
  client is then the first address from the right that isn't a trusted proxy. The deploy checklist
  (`docs/deploy-checklist.md`) repeats this.
- **`/api/auth/sign-in/org` is our own route**, so Better Auth's JSON-only gate doesn't cover it: it sits behind the
  same trusted-origin and JSON check as tRPC mutations (403 for a foreign or missing `Origin`, 415 for other content
  types) and an 8 KB body limit. Without that a cross-site form post could sign a visitor into an attacker's account.
- **`closeSideDoors` also refuses** `/organization/*` over HTTP only (404, in case a path spelling slips past the Hono
  route; server-side `auth.api.*` calls stay possible for later plans); `/sign-in/email` with a placeholder `.invalid`
  address, over HTTP and from server-side calls alike (answered exactly like a wrong password);
  `/sign-in/username` from a cross-site browser request (`Sec-Fetch-Site: cross-site`); and
  `/request-password-reset` with any `redirectTo` but the reset page (see the password reset above), over HTTP and
  from server-side `auth.api.requestPasswordReset` calls alike: code that sends someone a reset link must pass the
  reset page as `redirectTo`.
- **Safe environment defaults.** `NODE_ENV` defaults to production. In production the api refuses an http base URL,
  `AUTH_RATE_LIMIT=false`, http trusted origins, and a weak or example `BETTER_AUTH_SECRET`.

## Consequences

- One Better Auth upgrade touches one folder. The Better Auth CLI (`npx auth@1.7.7 generate`) is a reference only:
  the schema in `packages/db/prisma/schema/identity-auth.prisma` is maintained by hand in our naming.
- The organization code must never change once an organization has staff: usernames contain it. Only the platform
  console can change it (the api has no UPDATE right on that column).
