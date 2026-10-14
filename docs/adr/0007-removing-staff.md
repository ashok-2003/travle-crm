# 0007: Removing staff

Date: 2026-10-14 · Status: accepted · Implements spec section 6.3, "Removing someone"

## Decision

Removing a member is one transaction:

1. The membership is soft-deleted (`member.deleted_at`, `deleted_by`).
2. The user row is retired: `former_email` keeps their email, `email` becomes `removed-<user id>@no-email.invalid`,
   `username` is cleared, and `banned` is set.
3. All their sessions are deleted.

A person who joins again, here or in another organization, gets a new user row.

## Context

- **The email must be released**, because email is unique across the product and Better Auth needs a non-null one.
  Moving it to `former_email` frees it and keeps it for support and audit lookups.
- **The username must be released** so the organization can give it to someone else.
- **The user row is never reused**, because `member.user_id` is unique (one user, one organization, spec section 4):
  the old membership row still points at it. Keeping the row keeps every "created by" reference valid.
- **Banning is belt and braces.** With email and username gone, the old password can't be used to sign in anyway.
  Better Auth's admin plugin also refuses any new session for a banned user, impersonation included.
- **It takes effect at once.** Sessions are deleted; `orgProcedure` reads the membership on every request, so the next
  request is refused even while the 5-minute session cookie is still cached.
- Rejected alternatives: deleting the user (breaks history and cascades), and Better Auth's `removeMember` and
  `banUser` endpoints (they need an admin session and are not one transaction with our changes).

## Consequences

- A DPDP erasure request must also clear `former_email` (the platform purge, spec section 5).
- Who removed whom is in `member.deleted_by`; the audit log (spec 9.5) will record it too.
