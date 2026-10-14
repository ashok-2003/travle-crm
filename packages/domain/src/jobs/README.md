# jobs

Domain events and the work the worker does after a change commits (spec 9.1).

## Public functions and values (`index.ts`)

- `publishEvent(tx, { type, payload })`: writes an event to the outbox inside the change's own transaction and returns
  its id. The event exists exactly when the change commits.
- `defineListener({ name, eventType, payload, handle })`: a listener whose handler gets the payload checked by
  `payload` (a Zod schema from `@travel-crm/contracts`). `name` is also its job queue, e.g. `documents.render-pdf`.
- Types: `DomainEvent`, `EventListener`, `ListenerContext` (the worker's actor and a `forOrg` for the event's
  organization), `EventPayload`, `JsonValue`, `PayloadSchema`.

## Events

None of its own. Event types read `<entity>.<what happened>` (`document.issued`); payloads are JSON objects of ids
and small facts.

## Rules worth knowing

- Publish in the same transaction as the change, never after it.
- A payload holds ids and small facts; listeners read the rest inside `forOrg`. Never put personal data in a job.
- Listeners run at least once and are keyed by event id. Make any work outside the database (an email, an upload)
  safe to repeat.
- `outbox_event` is append-only for the api and worker: they may only set `relayed_at`.
