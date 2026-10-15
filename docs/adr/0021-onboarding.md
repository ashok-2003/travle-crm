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
- **What onboarding makes, in order** (`onboardOrganization`): the organization's row (name, code, time zone, contact
  email) as the platform role; then, inside it, the starter roles, the business profile (legal name, GSTIN, GST state,
  contact: ADR 0023), the invited Owner and `organization.onboarded` in its log; then, as the platform role again, the
  subscription (ADR 0019) and `organization.onboarded` in the platform log. Everything in the organization's log is
  under the platform admin's name, with source `platform`.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
  links keep working until they lapse, so asking twice never strands anyone.
- **The shared demo is rebuilt every night the same way** (spec 7.4). The console's `platform.reset-demo` job, at
  02:00 India time, purges the organization last night's reset built, then builds it again in one platform
  transaction (two transactions in all, so a failed build leaves no demo until the job's retry succeeds): the business profile, the starter roles, and three staff (Owner, Sales, Operations) who sign in with
  the demo's code and `DEMO_PASSWORD`, with no email and no invite; subscribed to the plan `DEMO_PLAN_KEY` names,
  paid a month ahead. It purges only an organization that has a `demo.reset` entry in the platform log, so a code
  set by mistake can't purge an agency, and it checks the plan before it purges anything.

## Context

- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own (a hash of
  `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so
  a change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
  sends nothing itself (it starts with the api's full environment, so it needs the SMTP settings to start, but never
  uses them), and a failed send is retried rather than lost. The token never travels in the event or the
  job: the listener makes it.

## Consequences

- A retried send can email a second link; both work. Removed, banned and placeholder-address people get nothing.
- Staff created by an organization's admins keep plan 2's temporary passwords; inviting them by email can reuse
  `requestInvite` later.
