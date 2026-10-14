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
- `startOutboxRelay({ ...those, intervalMs?, onError? })`: the relay in a loop, for the worker; `stop()` ends it.
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
3. Make it safe to run twice. Its database writes go through `context.forOrg`; anything outside the database (an
   email, an upload) may repeat after a crash between doing it and recording the run.

Queue names follow the same rule for plain handlers and schedules (`webhooks.process`, `rate-limits.purge`).

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run at least once and are keyed by event id. Make any work outside the database (an email, an upload)
  safe to repeat.
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
