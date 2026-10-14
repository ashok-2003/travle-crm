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
  It is never shown: API responses show `null`, the response schemas refuse `.invalid` addresses, and the two-factor
  setup link is relabelled `<CODE> <username>` for the authenticator app.
- **Staff are created in one transaction** of our own (user, password account, membership), with Better Auth's
  password hasher. Every new member gets a temporary password and must change it at first sign-in
  (`user.must_change_password`, cleared by Better Auth hooks after `/change-password` or a password reset).
- **Sessions** are database rows plus a 5-minute JWE cookie cache (answering the spec's open item). Each session
  carries its organization (`active_organization_id`), set by a hook when the session is created.
- **Request checks.** `protectedProcedure` trusts the cookie cache. `orgProcedure` also reads the membership, role and
  permissions from the database on every request. `freshProcedure` (money, roles, exports, staff management) and
  `platformProcedure` re-read the session itself, ignoring the cache.
- **Two-factor** is optional per person. An organization with `require_two_factor` refuses members without it
  everywhere except `me.get` and Better Auth's `/two-factor/*` endpoints. Turning the requirement on needs two-factor
  on the person doing it.
- **Platform staff** have user role `admin` and no membership. They may impersonate a user for up to an hour.
- **Hardening:** origin and CSRF checks pinned on; `/api/auth/organization/*` closed; trusted origins, secure cookies
  and the client-IP header come from the environment; production requires HTTPS and rate limiting.

## Context

- **Why not Better Auth's `createUser` and `addMember`.** Two calls, not atomic: a failure between them leaves a user
  with no organization. Our transaction also checks the role and the organization code in the same place.
- **Cookie cache staleness.** A revoked session passes the cache for up to 5 minutes. Because `orgProcedure` reads the
  membership from the database, a removed member is refused on their next request anyway; only `me.get` still
  answers from the cache, with no organization.
- **Better Auth skips its origin check when `NODE_ENV` is `test`.** We pin `disableOriginCheck: false`, so tests prove
  the same CSRF protection production has.
- **Rate limits are kept in memory**, per instance. With several instances behind a load balancer, move them to the
  database or a shared store (Better Auth `rateLimit.storage`) before launch. The client address comes from the
  header named in `AUTH_IP_ADDRESS_HEADERS`; the load balancer must set it, or all clients share one limit.

## Consequences

- One Better Auth upgrade touches one folder. The Better Auth CLI (`npx auth@1.7.7 generate`) is a reference only:
  the schema in `packages/db/prisma/schema/identity-auth.prisma` is maintained by hand in our naming.
- The organization code must never change once an organization has staff: usernames contain it. Only the platform
  console can change it (the api has no UPDATE right on that column).
