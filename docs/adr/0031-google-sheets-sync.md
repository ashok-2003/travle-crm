# 0031: Google Sheets sync

Date: 2026-10-19 · Status: accepted · Applies to the Sheets sync (an agency's Google Sheet becomes leads by itself, one
way only; spec `docs/superpowers/specs/2026-10-19-sheets-sync-design.md`)

## Decision

### Read only, by a service account, by polling (spec 4.1, 4.6)

- **One way.** The Google scope is `https://www.googleapis.com/auth/spreadsheets.readonly`. The port `GoogleSheets`
  (`@travel-crm/integrations/google-sheets`, ADR 0008) has three methods, `accounts`, `describe` and `readRows`, and none
  writes; a test lists them. A Viewer share is all an agency gives.
- **A service account, not OAuth.** The agency shares the sheet with our address and pastes its link. There is no
  "Sign in with Google" screen, no Picker and no Google verification to wait for. The cost is that one service account
  can read every sheet shared with it, so anyone holding a sheet's link could connect it first (accepted by the owner,
  2026-10-19, and softened by the claim below). A second implementation of the same port, taking an OAuth credential
  in place of an account index, can replace the share step later without touching the checks, the rows or the screens.
- **Polling.** A check about every fifteen minutes (plus a random 0 to 5) while the worker is awake, and Sync now at once. Google Drive push notifications carry no detail and
  their channels expire within a day, so they would still need polling.
- **`google-auth-library` with plain `fetch`.** Two GET endpoints (`spreadsheets.get` with `fields`, and
  `spreadsheets.values.batchGet` with `FORMATTED_VALUE`) need no `googleapis` package, which is every Google API. The
  library's `JWT` client signs, caches and refreshes the service account's token and is what a future OAuth flow would
  use. It is pinned exactly (11.3.1) and named by dependency-cruiser's `vendor-sdks-only-in-integrations`. The adapter's
  answers are read with small typed guards, not Zod: every dependency of the integrations package stays outside the
  api's bundle (ADR 0027), and Zod is bundled with the contracts, so adding it to the adapter would move it.
  A request has a 20-second timeout, a response is read as a stream up to 25 MB, and Google's errors are mapped to seven
  reasons whose messages never hold a sheet's content, a title or a token.

### Which rows are new (spec 4.4)

- **A row is known by its hash, never its place.** `sheet_row` holds `(raw_hash, occurrence)` for each row read; a sort,
  an insert or a delete changes row numbers only. The connection keeps a cursor and a window of 100 rows before it, a
  daily full read and a full read for Sync now; every read starts from the stored cursor, so a worker that slept an hour
  adds every row since, once.
- **A spreadsheet is connected to one agency at a time.** `sheet_spreadsheet_claim` holds
  `HMAC-SHA256(SHEETS_HASH_KEY, spreadsheet id)`, unique across all agencies; a second agency is refused with one
  generic sentence.

### Two tables outside row-level security (spec 5, rulings S5-S8)

`sheet_check_schedule` and `sheet_spreadsheet_claim` carry `organization_id` (referring to `organization`, restricting
deletion and update like every other) but have no row-level security, so the worker can find the due sheets of every
organization without entering one, and the claim can be unique across organizations, which row-level security would
hide. They are safe because they hold ids, times and a keyed hash only (a test fixes their columns), `OrgTx`, `IdentityTx`
and the identity client leave their models out and refuse a cast past the types, and they are reached only inside
`db.withoutOrg()` through `@travel-crm/db/sheet-schedule`, which dependency-cruiser keeps to the sheets module's
`schedule.ts`; ESLint flags raw SQL naming them anywhere else. `isolation.test.ts`, `schema-check.test.ts` and
`organization-keys.test.ts` read two named lists, `unscopedScheduleTables` and `crossOrganizationUniques`, beside
`signInTables`, and nothing else is exempted. The schedule is written after the connection's own transaction by a
listener of `sheet.schedule-changed`, so it is never lost and a stale row is harmless: the check re-reads the connection
under `forOrg` and does nothing, and removes the row, when it isn't due.

### The worker dispatches the checks (spec 4.6, rulings S2, S4)

The console sleeps in the pilot, so the worker holds the schedule. `sheets.dispatch-checks` runs every minute (the
finest granularity pg-boss schedules have), claims the due rows with `FOR UPDATE SKIP LOCKED`, at most 50 per service
account a minute, most overdue first, setting `claimed_until` five minutes ahead, and queues one `sheets.check` job
for each with ids only. The check is a plain job handler rather than an event: an event would write an outbox row and a
processed-event row for every check of every sheet, in two append-only tables nothing purges. Sync now is a rare,
user-made event, `sheet.sync-requested`, and both call the same `checkLeadSheet`. A handler or listener may now name a
`concurrency`; the sheets check queue runs several checks at a time (never an .xlsx read: this path reads Google only).

### Erasure (spec 9, rulings S6, S18)

A customer's row stays in the agency's own sheet, which we never change, so the erasure must outlive it. Erasing a
customer re-keys their rows' hashes with `SHEETS_HASH_KEY` (an HMAC, so a hash that could be tested against guessed phone
numbers no longer can), empties their ids and examples, and writes each of their contacts to `sheet_erased_contact` as a
keyed hash and nothing else. The key lives in the environment, never in the database or a log, and is never rotated. The
console's erasure job holds it (the key, not the service-account key) and fails loudly rather than skip the step when it
is missing.
