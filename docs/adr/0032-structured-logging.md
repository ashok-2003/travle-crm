# 0032: Structured logging

Date: 2026-10-22 · Status: accepted · Applies to the api, the worker and the console

## Why

The pilot is live, and a 500 on a first sign-in's password change could not be diagnosed: nothing recorded the api's
error. Each process wrote one `<process>: <line>` to stderr per problem, with ids and codes, no levels, and no request
or job lines. The owner asked for levelled, structured logs (debug, info, warn, error) that can be read on Render, and
stored and searched for free.

## Decision

### The Logger port (ADR 0008)

- **`Logger`** (`@travel-crm/integrations/logging`): `child(bindings)` and `debug`, `info`, `warn`, `error` taking
  `(fields, message)`. Domain and api code take the port; only `packages/integrations` imports pino
  (dependency-cruiser's `vendor-sdks-only-in-integrations` names it). The real adapter is pino 10.3.1, pinned in the
  catalog; the in-memory adapter (`createMemoryLogger`) keeps the lines in an array for tests.
- **Output:** one JSON object per line on standard output, so Render's log explorer filters by level: `level`
  (`debug`, `info`, `warn`, `error`), `time` (ISO), `process` (`api`, `worker`, `console`), `msg`, and the fields.
  Written synchronously, so a line written just before an exit is not lost.
- **`LOG_LEVEL`** (`debug`, `info`, `warn`, `error`) is the least important line written. Unset: `info` in production,
  `debug` in development and tests. It is checked at start-up with the rest of the environment.
- **Pretty-printing** for development is left out: it needs `pino-pretty`, a dependency for a nicety. `pnpm dev`'s lines
  are JSON; pipe them through `jq` if wanted.

### Privacy: ids, codes, counts and timings only

CLAUDE.md's rule for logs holds for every line, and the adapters enforce it as a safety net:

- Both adapters pass every line's fields and message through `censorFields` / `censorMessage`: a key that names personal
  data or a secret (email, phone, name, password, token, authorization, cookie, key, secret, search, query, body, text,
  content, url, headers and their kin) is replaced by `[redacted]` at any depth, every string value has email
  addresses and long numbers masked (`maskPersonalData`), and an `Error` among the fields becomes its name, code and
  frames. pino's `redact` option takes paths of fixed depth, so the walk is ours.
- **Errors are written as `errorFields(error)`:** `errorName`, `errorCode` (Node's, Postgres's, Prisma's, a
  `DomainError`'s), `errorCause` (the causes' names and codes, three deep) and `errorStack` (the `at ...` frames only).
  Never the message, which can quote an email address or a reset link. A test throws an error whose message holds an
  email address and proves it does not appear.
- Callers still do not pass personal data: the censor is the net, not the plan.

### What is written

- **A request line** per request in the api and the console (`request-log.ts`): a request id (an incoming
  `x-request-id` when it is a plain token, else a UUID v7; echoed on the response), `method`, `route` (the pattern, or
  `/api/trpc` with the `procedures` named; Better Auth's paths keep only the words that name an action), `status`,
  `durationMs`, and `organizationId` and `userId` when the session is read. `info`; `warn` for a 4xx, with the tRPC
  refusal's `refusalCode` and `reason`; `error` for a 5xx, with the error's fields; health checks at `debug`.
- **Unexpected errors:** the api's error handler and a failing tRPC call write an `error` line with the request id and
  the error's fields; Better Auth's own logger writes through the request's logger (an `AsyncLocalStorage`), so its
  failures carry the request id.
- **Jobs** (the pg-boss adapter): `job started` (`debug`), `job finished` (`info`, with the outcome and duration),
  `job failed` (`error`, with the error's fields), each with `queue`, `jobId`, `retryCount` and the `organizationId`
  the job's data names. The outbox relay writes `outbox relayed` (`debug`, with the count), a listener skipping an event
  it already handled writes a `debug` line, and a Google Sheets check, an import and an export each write one `info`
  summary (ids, status, counts, duration).
- **Start-up:** each process writes `<process> starting` with its version (the commit: `GIT_SHA`, or Render's
  `RENDER_GIT_COMMIT`), `NODE_ENV` and log level; `listening` / `running` lines with fields; the Google Sheets line.
  A failed start-up still prints its error in full with `console.error`, the one exception to the rule: it comes from
  set-up and quotes no one's data.

### Shipping to Axiom (optional)

- **Settings:** `AXIOM_TOKEN` and `AXIOM_DATASET`, both or neither, secrets, for the api, worker and console;
  `AXIOM_URL` (default `https://api.axiom.co`, https outside development) for the EU region. Unset, the lines go to
  standard output only. Axiom's Personal plan keeps 30 days and 500 GB a month for free; the runbook's "Turn on
  Axiom" has the steps, with a token that can only ingest.
- **A transport of our own** (`axiom-transport.ts`) on `pino-abstract-transport` 3.0.0 (already pino's own
  dependency), run by pino in a worker thread: it batches up to 100 lines or a second, posts them as NDJSON to
  `/v1/datasets/<dataset>/ingest` with the token as a bearer (`time` becomes Axiom's `_time`), retries a failed post
  twice, then drops the batch and says once, on stderr at the end, how many lines it dropped. It needs no package
  beyond those pino brings, and the test points it at a fake endpoint.
- **Flushing:** the Render free instances sleep and redeploy, so every exit path (SIGTERM, SIGINT, an unhandled error's
  drain) goes through `exitAfterLogs`, which closes the logger first: the transport posts what it holds, bounded at 10
  seconds. The standard-output copy is synchronous and never waits.
- **The image:** the transport is an entry of its own in the api's bundle (`axiom-transport.mjs`, beside
  `xlsx-thread.mjs`); `pnpm images:smoke` runs a container with a fake Axiom and checks the lines arrive after a
  SIGTERM.

## Not covered

The web app (Next.js on Vercel) is out of scope: Vercel's Hobby plan keeps runtime logs for an hour and has no drains.
Server-side errors of the web app are not logged with a request id; there is no hook for it today.

## Consequences

- A diagnosis starts from a request id: the request line, the error line and Better Auth's line share it.
- Tests that expected console output now read the memory logger's entries; `apps/api/test/support/problem-logger.ts`
  keeps the warnings and errors of a flow that should go quietly.
- `process-log.ts` (the `<process>: <line>` writer) and `workerProblemLine` are gone.
