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
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`, `ListenerJobData`, `RelayDependencies`, `OutboxRelay`.

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
