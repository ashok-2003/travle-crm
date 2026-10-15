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
  `/reset-password`, which creates the password account; then they sign in. `requestInvite` sends a new link later,
  but only to someone with no password yet: anyone who has one (`PASSWORD_ALREADY_SET`) resets it, within the reset's
  hour. The invite is the agency's email (spec 9.4): its name as the sender, Reply-To its contact address.
- **What onboarding makes, in order** (`onboardOrganization`): the organization's row (name, code, time zone, contact
  email) as the platform role; then, inside it, the starter roles, the business profile (legal name, GSTIN, GST state,
  contact: ADR 0023), the invited Owner and `organization.onboarded` in its log; then, as the platform role again, the
  subscription (ADR 0019) and `organization.onboarded` in the platform log. Everything in the organization's log is
  under the platform admin's name, with source `platform`.
- **Invite links last 72 hours**, against a password reset's hour: an Owner may open the email the next day. Earlier
  links keep working until they lapse, so asking twice never strands anyone.
- **Invites have a cap of their own.** An address gets at most five invite emails an hour, counted in Postgres under
  `staff-invite-recipient:<address>`, apart from plan 3's resets (three an hour, under their own key). Anyone may ask
  for resets to an address, so resets must never use up invites. Only platform staff ask for invites, each one
  recorded, so abuse is visible and bounded. Every attempt counts, retries included: five leaves room for a failed
  send's retries.
- **Past the cap the job fails, never quietly.** The listener stores no link, sends nothing, and throws
  `InviteCapReachedError`, an error of ours with an ids-only message that the failed jobs keep. After its retries the
  job stays in the console's failed jobs, where support sees it and retries it once the hour is out. So a send that
  keeps failing ends there too: five failed sends use up the hour, and the last retry fails on the cap.
- **The shared demo is rebuilt every night the same way** (spec 7.4). The console's `platform.reset-demo` job, at 02:00
  India time, purges the organization last night's reset built, then builds it again in one platform transaction (two
  transactions in all, so a failed build leaves no demo until the job's retry succeeds): the business profile, the
  starter roles, and three staff (Owner, Sales, Operations) who sign in with the demo's code and `DEMO_PASSWORD`, with
  no email and no invite; subscribed to the demo's own plan, never for sale (ADR 0019), paid a month ahead. It purges
  only an organization that has a `demo.reset` entry in the platform log, so a code set by mistake can't purge an
  agency, and it checks the plan before it purges anything.

## Context

- **Why Better Auth's reset token.** It is the one way Better Auth sets a password on an account it didn't create,
  and the web app's reset page already handles it. The token is stored as Better Auth stores its own (a hash of
  `reset-password:<token>`, the user's id as the value); the invite tests run the whole path through Better Auth, so
  a change in that format fails them.
- **Why an event, not an email from the console.** The worker already has the email adapter and retries; the console
  sends nothing itself (it starts with the api's full environment, so it needs the SMTP settings to start, but never
  uses them), and a failed send is retried rather than lost. The token never travels in the event or the job: the
  listener makes it.

## Consequences

- A retried send can email a second link; both work. Removed, banned and placeholder-address people get nothing, nor
  does anyone who has chosen a password by the time the listener runs: those jobs end done. A retry counts against
  the cap again, so a long mail outage shows in the failed jobs as the cap's error, not the mail server's.
- Staff created by an organization's admins keep plan 2's temporary passwords, so they are never invited:
  `requestInvite` refuses anyone with a password. Inviting staff by email instead would mean adding them with no
  password, as onboarding adds the Owner.
