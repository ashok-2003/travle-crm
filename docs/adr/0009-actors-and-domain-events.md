# 0009: Actors, domain events and the outbox

Date: 2026-10-15 · Status: accepted · Implements spec sections 8, 9.1 and 9.5

## Decision

- **An `Actor` says who is acting**: `organizationId`, `userId` (null for the system), `source` (`web`, `api`, `job`
  or `impersonation`) and `impersonatedBy`. It lives in the kernel. `MemberAccess` is an `Actor`: the API passes the
  session's `impersonatedBy` to `resolveAccess`, so anything support does while impersonating a member carries
  `source: "impersonation"` and the admin's id. The worker acts as `systemActor(organizationId)`.
- **Domain events go through an outbox.** `publishEvent(tx, { type, payload })` (`@travel-crm/domain/jobs`) writes an
  `outbox_event` row in the change's own transaction. The worker's relay queues each event's listeners after the
  commit. Event types read `<entity>.<what happened>`; payloads are JSON objects of ids and small facts, checked by
  the table (`outbox_event_type_format`, `outbox_event_payload_object`).
- **Listeners** are `EventListener`s, built with `defineListener`, which checks the payload with a Zod schema before
  the handler runs. A listener's name is its job queue. The worker gives it a `ListenerContext`: the system actor and
  a `forOrg` bound to the event's organization.
- **Events are facts.** The api and worker may set `outbox_event.relayed_at` and nothing else, and may not delete
  events (column-level grant). The isolation suite knows such tables as append-only.
- **Other modules ask identity about people and organizations**: `organizationProfile(organizationId)` (name, code,
  `time_zone`, `contact_email`) and `memberContacts(organizationId, userIds)` (names and real email addresses of
  active members). They can't read the sign-in tables themselves (spec 4).
- **Each organization has a time zone** (`organization.time_zone`, default `Asia/Kolkata`) and a contact email
  (`organization.contact_email`, set at onboarding in plan 4).

## Context

- **Why an outbox and not a job sent straight from the request.** pg-boss's tables are outside our transaction, so a
  job sent from a request could exist without the change (rolled back) or the change without the job (a crash before
  sending). The outbox row commits or rolls back with the change.
- **Why ids in payloads.** Listeners read records inside `forOrg`, under row-level security, and an event's payload
  outlives the record's later edits; ids keep the listener working from the current state.
- **Why isolation fixtures moved to one file per module.** Plan 3 builds modules in parallel tracks; one shared
  fixture file would collide on every merge. `packages/db/test/org-table-fixtures/<module>.ts` files are gathered at
  load time, and the suite still fails for any organization table without a fixture.

## Consequences

- A listener runs at least once. It is keyed by event id, but work outside the database (an email, an upload) can
  repeat after a crash between doing it and recording it, so it must be safe to repeat.
- Old outbox rows are never deleted by the app. A retention purge, if needed, runs as the platform role.
