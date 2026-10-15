# 0021: Onboarding in one transaction, and the Owner's invite

Date: 2026-10-16 · Status: accepted · Implements spec section 7.1, and replaces plan 2's temporary password for the
first Owner

## Decision

- **Onboarding is one platform transaction.** The console creates the organization's row as the platform role (the
  api never may), then steps into the new organization (`asOrganization`, ADR 0018) for everything identity does
  there: the five starter roles and the first Owner. If any step fails, nothing is left behind: no organization without
  an Owner, no Owner without roles.
- **The Owner is invited by email, with no password.** `inviteOwner` creates the Owner's user and membership and no
  password account, records `staff.created` and `staff.invited` under the platform admin's name, and publishes
  `staff.invited`. The worker's `identity.send-invite` listener stores a Better Auth reset token for them and emails a
  link to the web app's `/reset-password` page. Choosing a password there goes through Better Auth's own
  `/reset-password`, which creates the password account; then they sign in. `requestInvite` sends a new link later.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
  links keep working until they lapse, so asking twice never strands anyone.

## Context

- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own
  (a hash of `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so a
  change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
  needs no SMTP settings, and a failed send is retried rather than lost. The token never travels in the event or the
  job: the listener makes it.

## Consequences

- A retried send can email a second link; both work. Removed, banned and placeholder-address people get nothing.
- Staff created by an organization's admins keep plan 2's temporary passwords; inviting them by email can reuse
  `requestInvite` later.
