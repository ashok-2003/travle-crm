# 0007: Removing staff

Date: 2026-10-14 · Status: accepted · Implements spec section 6.3, "Removing someone"

## Decision

Removing a member is one transaction:

1. The membership is soft-deleted (`member.deleted_at`, `deleted_by`).
2. The user row is retired: `former_email` keeps their email, `email` becomes `removed-<user id>@no-email.invalid`,
   `username` is cleared, the credential account's password hash is wiped, and `banned` is set. `name` and
   `display_username` stay on the retired row.
3. All their sessions are deleted.

A person who joins again, here or in another organization, gets a new user row.

## Context

- **The email must be released**, because email is unique across the product and Better Auth needs a non-null one.
  Moving it to `former_email` frees it and keeps it for support and audit lookups.
- **The username must be released** so the organization can give it to someone else.
- **The user row is never reused**, because `member.user_id` is unique (one user, one organization, spec section 4):
  the old membership row still points at it. Keeping the row keeps every "created by" reference valid.
- **Three locks keep the retired row from signing in.** The retired address can be worked out from the user id, which
  staff managers see, so clearing the email and username is not enough. Sign-in by email refuses every `.invalid`
  address (the sign-in hook), wiping the password hash makes Better Auth refuse with "Password not found", and the ban
  makes it refuse any new session, impersonation included. The tests check the hook first, then point the retired
  user at an ordinary address and check the wipe and the ban each on its own, with the other undone.
- **Owners can't strand an organization.** Removing or demoting an Owner locks the organization's active Owner rows in
  id order, checks the actor is still one of them, and refuses `LAST_OWNER` if none would remain. Two Owners removing
  each other at once therefore leave exactly one. Every change to a member is also conditional on the role that was
  checked (`STAFF_CHANGED` otherwise), so a promotion that lands meanwhile is never overwritten.
- **It takes effect at once.** Sessions are deleted; `orgProcedure` reads the membership on every request, so the next
  request is refused even while the 5-minute session cookie is still cached.
- Rejected alternatives: deleting the user (breaks history and cascades), and Better Auth's `removeMember` and
  `banUser` endpoints (they need an admin session and are not one transaction with our changes).

## Consequences

- A DPDP erasure request must also clear `former_email`, `name` and `display_username` on the retired row (the
  platform purge, spec section 5).
- Who removed whom is in `member.deleted_by`; the audit log (spec 9.5) will record it too.
