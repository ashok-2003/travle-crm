# jobs

Domain events and the work the worker does after a change commits (spec 9.1).

## Public functions and values (`index.ts`)

- `publishEvent(tx, { type, payload })`: writes an event to the outbox inside the change's own transaction and returns
  its id. The event exists exactly when the change commits.
- `defineListener({ name, eventType, payload, handle })`: a listener whose handler gets the payload checked by
  `payload` (a Zod schema from `@travel-crm/contracts`). `name` is also its job queue, e.g. `documents.render-pdf`.
- `relayOutbox({ db, queue, listeners, batchSize?, organizationsPerPass?, organizationIds? })`: one pass of the outbox
  relay. For each waiting event it queues a job on the queue of every listener of that event type, with data
  `{ organizationId, eventId, eventType }` and the id `listenerJobId(listener, event)`, then marks the event relayed.
  Returns how many events it relayed.
- `startOutboxRelay({ ...those, intervalMs?, onError? })`: the relay in a loop, for the worker; `stop()` ends it. One
  failing organization doesn't stop a pass (each failure goes to `onError`); after failed passes it waits longer, up to
  a minute. Defaults: 50 organizations per pass, 100 events per organization, 1 s between idle passes.
- `listenerJobId(listenerName, eventId)`: the deterministic job id, so relaying an event twice queues it once.
- `organizationsWithEventsWaiting(db, limit)`: the organizations with events waiting, oldest first (ids only).
- `runListenerJob({ db, listener, data })`: runs one listener on the event a relayed job names, in that event's
  organization, unless `processed_event` says it already has: `"handled"`, `"already-handled"` or
  `"event-not-found"` (a job naming the wrong organization finds nothing under row-level security).
- `startWorker({ db, runner, queue, listeners, handlers?, schedules?, relay?, onError? })`: what the `worker` command
  runs. Every listener's queue gets `runListenerJob`; each `JobHandler` (`{ queue, handle(data) }`, work with no
  organization yet, such as webhooks) and `ScheduledJob` (`{ queue, cron, timeZone, data?, handle(data) }`) gets its
  queue; then the relay starts. `stop()` stops the relay; the caller stops pg-boss after it.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`,
  `ListenerRunOutcome`, `JobHandler`, `ScheduledJob`, `Worker`, `WorkerDependencies`.

## Adding a listener

1. Define it with `defineListener({ name: "<module>.<what it does>", eventType, payload: <Zod schema>, handle })`,
   in the module that reacts. Its name is its job queue: lower case, dots between parts, unique.
2. Pass it to `startWorker`'s `listeners` in the api's `worker` command. The relay queues its jobs from then on.
3. Make it safe to run twice. Its database writes go through `context.forOrg` and must be keyed on `event.id` (a
   unique constraint, an upsert), and anything outside the database (an email, an upload) may repeat too.

Queue names follow the same rule for plain handlers and schedules (`webhooks.process`, `rate-limits.purge`).

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run AT LEAST once, not exactly once. The "already handled?" check, the listener's work and the record
  are separate transactions, so a crash after the work, or a second delivery (pg-boss re-dispatches a job that ran
  past its expiry: 900 s by default in pg-boss 12, and each expiry uses up a retry), runs the listener again, and two runs may overlap. Database writes may repeat as well as emails
  and uploads: key them on `event.id`.
- A failed job's error is stored in pg-boss and shown to platform staff: keep personal data out of error messages
  (ids only). pg-boss stores a cut-down copy (`Name: message`, emails and numbers of 7+ digits, also written with
  spaces or hyphens, masked, 200 characters); the original goes to `onError`, the log. The masking is a safety net:
  names, addresses, PAN numbers and emails without a domain are not masked. A job whose event isn't found is not retried but is reported to `onError`.
- Removing a listener or schedule from the code leaves its pg-boss queue, jobs and schedule behind until they are
  reconciled (plan 4).
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
- Don't test that an event stays unrelayed after its transaction commits: a relay running in another test (or the
  worker) may relay it at once. Read it back inside the publishing transaction instead. And in tests, always give
  the relay `organizationIds`: one that looks at every organization takes other test files' events.
- The relay finds waiting organizations through `app_organizations_with_unrelayed_events`, the one SECURITY DEFINER
  function (ids only, ADR 0010); it reads the events themselves inside `forOrg`.
- A failing job is retried 5 times with exponential backoff from 10 seconds, then lands in pg-boss's failed list
  (`PgBossJobs.failedJobs()`, shown in the platform console in plan 4).
- Upgrading pg-boss: a new version may change its schema. Generate a migration from
  `getMigrationPlans("pgboss", <current schema version>)` (the version is in `pgboss.version`), like
  `20261015100000_pgboss`, and apply it before the new worker starts (ADR 0010).
