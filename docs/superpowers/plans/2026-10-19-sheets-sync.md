# Google Sheets Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> This plan runs as one branch, `sheets/sync`, built by one builder, in the order of its tasks. It starts from `main`
> once `bulk/shared` and `bulk/lead-import` are merged, and once the "Needs from earlier branches" below have landed
> there (Task 1 checks that they did).

**Goal:** An agency connects a Google Sheet once, by sharing it with our address and pasting its link, and the sheet's
new rows become leads by themselves within about two minutes, with no duplicates, whatever the agency does to the
sheet. Nothing is ever written to a sheet.

**Architecture:**

- **A port with two adapters.** A `GoogleSheets` port in `packages/integrations` (ADR 0008, and the new ADR 0031) has
  three methods and no writer. The real adapter is `fetch` plus `google-auth-library`'s `JWT`; the in-memory one models
  a sheet that can be shared, sorted, edited and deleted.
- **A new L0 module, `sheets`,** holds connections, the steps that make them, the cursor and fingerprint engine, and
  the schedule. crm (L1) turns the rows it finds into leads in `crm/lead-sheets/`, through the bulk release's
  `readLeadRow`, `saveEnquiry` and `rowFingerprint`. The worker finds due sheets in a small table outside row-level
  security and checks each one in its own organization.
- **A row is known by its hash, never by its place;** a person is found by contact, never by where a row came from.
  So a sort, an insert, a delete, a second sheet or a file import cannot make a second lead.

**Tech Stack:**

- The Foundation's, release 1's and the bulk release's stack, unchanged.
- One new package, in `packages/integrations` only, pinned exactly (spec 6.1): `google-auth-library` 11.3.1.
- No new registry component: `Item`, `Card`, `Table`, `Select`, `RadioGroup`, `Alert`, `DropdownMenu`, `InputGroup` and
  `Progress` are all in `components/ui` already.

**Spec:**

- `docs/superpowers/specs/2026-10-19-sheets-sync-design.md` is the authority: rules S1-S45 and section 15. The owner
  settled one way only, sharing with our address (no proof step), deleted/sorted/inserted rows changing nothing, no
  duplicates, the existing-rows question, New stage and the Owner column, 5 sheets, 2-minute checks with Sync now, rows
  that can't be added listed, lost access noticed once, and managers connecting.
- The screen reference is `docs/superpowers/specs/2026-10-19-sheets-sync-screens.html`. Where it and the spec differ,
  the spec wins.
- It builds on `2026-10-19-bulk-in-and-out-design.md` ("B", sections 4.2-4.5 and 14) and
  `docs/superpowers/plans/2026-10-19-bulk-in-and-out.md` ("the bulk plan": Part 0 and Part 1). Names, signatures and
  files below are the bulk plan's Interfaces blocks.
- Inputs: `CLAUDE.md`, `DESIGN.md`, ADR 0028, `docs/agent-playbook.md`, `docs/ui-build-loop.md`.

## Global Constraints

Every task's requirements include these.

- **Shell and Node.**
  - Start every shell command with `cd <worktree> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
  - The worktree is `/Users/ak/personal/travel-crm-sheets`. Never touch `/Users/ak/personal/travel-crm`, which is the
    owner's `main` checkout and only the controller merges there.
- **Git.**
  - Never `git stash`: worktrees share one stash. Never `--no-verify`. Never push.
  - Stage files by name; never `git add -A`, `.` or `-a`.
  - Conventional Commits, header at most 100 characters, no `Co-Authored-By` trailer, never a `.env`.
- **Test first.** Every task writes its failing test, sees it fail, then writes the code.
- **Read only (S1, S2).**
  - The Google scope is exactly `https://www.googleapis.com/auth/spreadsheets.readonly`.
  - The port has no method that writes; a test lists its methods.
  - A Viewer share is all an agency gives.
- **Limits (S8, S15, S18, S33, S35-S39), each written once in `packages/domain/src/sheets/limits.ts`:**
  - `maxSheetsPerOrganization = 5`; drafts count.
  - `maxSheetRows = 20_000`, `maxSheetColumns = 50`, `maxCellLength = 4_000`, `maxResponseBytes = 25 * 1024 * 1024`.
  - `connectImportMaxRows = 10_000` (the newest rows).
  - `lookbackRows = 100`; the daily full read is the first check after 03:00 in the agency's zone.
  - `checkIntervalSeconds = 120`; the dispatcher runs every minute; the queue runs 4 checks at a time.
  - `maxReadsPerMinutePerAccount = 50` (Google allows 300 a minute for the project and 60 for one user).
  - `claimSeconds = 300`: a dispatched or running check holds its sheet for five minutes.
  - `syncCooldownSeconds = 30`; `lostAccessAfterFailures = 3`.
  - `rowsPerTransaction = 50` for a check, `baselineRowsPerTransaction = 1_000`.
  - A request to Google times out at 20 seconds.
  - A draft untouched for 24 hours is deleted; resolved problems are dropped after 7 days.
- **No duplicates (S19, S23).** A row is known by `(raw_hash, occurrence)`; duplicates are decided in S23's order
  (known, erased, blocked, fingerprint, open lead, returning, new). A person has at most one open lead.
- **Secrets (S4, S43, section 14).**
  - `GOOGLE_SHEETS_SERVICE_ACCOUNTS` is read by the api and the worker, never the console.
  - `SHEETS_HASH_KEY` is at least 32 characters, never stored in the database, never logged, never rotated.
  - Hashes are HMAC-SHA256 keyed with it. A key, a token, a sheet's title, a header or a cell value is never in a log,
    a job's data or error, an audit snapshot or a notification's `sourceEventId`.
- **Data rules (CLAUDE.md, spec 5).**
  - Every new table has `organization_id` referring to `organization` with `ON DELETE RESTRICT ON UPDATE RESTRICT`;
    UUID v7 ids; CHECK lists; unique constraints that include `organization_id`.
  - All but `sheet_check_schedule` and `sheet_spreadsheet_claim` have `SELECT app_enable_org_rls('<table>');` and a
    fixture in `packages/db/test/org-table-fixtures/sheets.ts`. None is soft-deleted.
  - The two exempt tables are reached only through `@travel-crm/db/sheet-schedule` inside `db.withoutOrg()`.
  - Never `forOrg()` inside `forOrg()`. Never `$queryRawUnsafe`. Never `OFFSET`. Ids of other modules' records are
    plain uuids.
- **Layers.** `sheets` is L0 beside `imports` and `exports`; it never calls crm or today. crm may call it.
- **Who may (S10, spec 2).**
  - Connecting, steps, pausing, Sync now and watching need both `leads:create` and `leads:assign`.
  - `confirm`, `takeOver`, `resume`, `pause` and `disconnect` are `freshProcedure`s; the last three are
    `.meta({ lifecycle: "always" })`.
  - Every check resolves the connector's access afresh and honours ADR 0021's check 2.
- **Words the tests read.**
  - Every new `DomainError` reason has its literal sentence in `errors.json`; every `recordAudit` action its sentence
    in `audit.json` (record type `sheet_connection`); every notification kind its entry in `kinds.ts` and its words in
    `notifications.json`.
  - Every word on screen is a next-intl message in `sheets.json`.
- **The owner's UI rules 1-7, `DESIGN.md` and the shared pieces (CLAUDE.md).**
  - Registry components only, no `border`, `ring`, `shadow` or `divide` class outside `components/ui`; 44px targets.
  - A dialog that sends a request holds while it is pending.
  - Dates show as "16 Oct" (`formatDay`); the times of a check in the agency's zone; counts in mono.
  - A change's button asks `useWriteAccess("change")`; Pause, Resume and Disconnect ask `useWriteAccess("revoke")`.
  - Every screen has its loading, empty, error-with-retry and refusal states.
- **Scale (ADR 0028, spec 11).** Performance tests run in the performance tests' own database with the large agency
  seeded (50,000 leads). Every plan is read with `EXPLAIN` as `app_runtime` inside `forOrg`. A missed budget is a
  finding: fix the query or the index, never the budget.
- **Pinned versions.** `google-auth-library` 11.3.1, exactly. If pnpm's release-age rule refuses it, stop and report.
- **Docker.** Tests start their own containers. Never `pnpm dev`, `pnpm services:up` or `docker compose` in a worktree.
  Use `--concurrency=3`, run checks in the foreground, and keep each call under 10 minutes.
- **Readable code.** Each source file opens with a one-line comment saying what it is for; ~200 lines is a smell. No
  `any`, no `!`, no abbreviations in public names. Inputs are `z.strictObject`; outputs are `z.object`.

## Review Focus

These five conditions are the ones most likely to bite a person that no rule of the spec spells out. Each is pinned by
the test named, in the task that owns the code.

1. **A sheet whose locale is month-first.**
   - The case: a Google Form's Timestamp in a US-set sheet reads `10/12/2026 14:32:10` for 12 October.
   - Expected: the enquiry date is never read as 10 December. An ambiguous date from a month-first sheet is not trusted:
     the lead is added now and the cell goes into the note. An unambiguous one (`10/25/2026`) is still read.
   - Pinned by: Task 10: "does not trust an ambiguous date from a month-first sheet: the lead is added now, the cell in
     the note".
2. **What Google hands back that a file never does.**
   - The cases: trailing empty cells left out of a row; a phone `098765 43210` or `+91 98765-43210` as shown; a formula
     showing `#REF!`, `#N/A` or `#VALUE!`; a 10 MB cell; a million rows; a header of 5,000 columns.
   - Expected: rows are padded and cut to the header; the leading zero is kept; an error value is an empty cell, never
     a name or a phone; nothing past 20,000 rows, 50 columns or 4,000 characters is kept or read into memory.
   - Pinned by: Task 1: "pads short rows, cuts cells and treats a Sheets error value as empty"; Task 1: "bounds a
     million rows, a 10 MB cell and 5,000 columns"; Task 10: "keeps a phone's leading zero as shown and reads it as
     +919876543210".
3. **A half-typed row, and an edit.**
   - The cases: someone types a row cell by cell; a row without a contact is later given one; a row is edited after it
     was added.
   - Expected: an unfinished row waits one check and then is listed; fixing it adds one lead and clears the line; an
     edit to an added row is a repeat enquiry on the person's open lead, never a second lead.
   - Pinned by: Task 11: "holds an unfinished row one check, then lists it; the fixed row adds one lead and clears the
     line"; Task 11: "reads an edited row as a new row: a repeat enquiry, never a second lead".
4. **A worker that slept, and two checks at once.**
   - The cases: the worker wakes after an hour with every sheet overdue; a dispatch and Sync now overlap; a check is
     retried after a crash.
   - Expected: the next check reads every row since the cursor; each row is added once; the second check does nothing
     or takes its turn; a check that outlives five minutes keeps its claim by saving.
   - Pinned by: Task 11: "adds each row once when two checks overlap or one is retried after a crash"; Task 13:
     "reads every row since the cursor after a sleep of an hour".
5. **The sheet changes under the sync.**
   - The cases: a column is inserted in front of the matched ones; a header is renamed; a sort happens while Sync now
     reads; the connector leaves while rows wait.
   - Expected: columns are found by header, so nothing shifts; a renamed header that leaves a row with no name or
     contact stops the check without consuming a row and says which columns are gone; nothing is added twice or lost;
     rows that waited are added after Take over.
   - Pinned by: Task 9: "finds a matched column by its header after one is inserted before it"; Task 11: "stops
     without consuming a row while a needed column is missing, then adds the waiting rows when it returns"; Task 12:
     "adds the rows that waited after Take over".

## Branch and merge order

| Branch       | Worktree                              | Tasks   | Waits for                                                        |
| ------------ | ------------------------------------- | ------- | ---------------------------------------------------------------- |
| `sheets/sync` | `/Users/ak/personal/travel-crm-sheets` | 1-21    | `bulk/shared` and `bulk/lead-import` merged; "Needs" landed first |

**Making the worktree** (the controller runs the first line):

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-sheets -b sheets/sync main
cd /Users/ak/personal/travel-crm-sheets && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

**The branch gate** is `pnpm check`'s parts, each in the foreground, with `W` the worktree:

```bash
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm run scripts:test && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=phone
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=desktop
```

**The merge gate** is the branch gate, then CI's other jobs, each in the foreground:

```bash
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm migrations:check
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm audit --audit-level=high
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm workflows:lint
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm images:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm product:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm lighthouse
```

**Gate rules:** each task ends green on the parts it touches; the last task ends green on the merge gate. A timing test
the branch doesn't touch (`relay.test.ts`, `counters.test.ts`) may need one rerun alone. To run one journey, use
`./node_modules/.bin/playwright test test/e2e/<spec>` from `apps/web`.

**Merging** (Task 21, then the controller): in the worktree `git merge --no-edit main`, run the merge gate again, and the
controller merges in the main checkout with `git merge --no-ff sheets/sync -m "chore: merge sheets/sync (Google Sheets sync)"`.

## Needs from earlier branches

The bulk plan froze these files, or gave them to `bulk/lead-import`, while three branches ran at once. They are
changes to **how an earlier piece behaves, or to what it stores**, so `sheets/sync` does not edit them: the controller
makes them on `main` in one small branch, `bulk/sheets-prereq`, before `sheets/sync` is created, and Task 1 refuses to
go on until a test of each passes. Each item names the file, the change and the test that proves it.

| #   | File (owner)                                                                                                   | The change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Test that proves it                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| N1  | `packages/integrations/src/spreadsheets/index.ts` (0.1)                                                        | Exports the reader's own naming as `nameHeaders(raw: readonly string[]): string[]` (a blank is "Column C", a repeat "(2)", D13) and `columnLetters(index: number): string`; extract them if the reader keeps them private. S11 names headers the same way.                                                                                                                                                                                                                                                  | `nameHeaders(["Name","","Name"])` is `["Name","Column B","Name (2)"]`; `columnLetters(27)` is `"AB"`                          |
| N2  | `packages/domain/src/imports/guesses.ts` (0.6)                                                                 | `guessFields(kind, headers, remembered, options?: { wordsInHeader?: boolean })`, off by default. On: Google Forms' own headers first ("Timestamp" is `enquiry_date`; "Email Address" is `email`; "Full name"; "Phone number"; "WhatsApp number"), then, when no common name fits, S12's words inside the header (`phone`/`mobile`/`whatsapp`, `email`/`mail`, `name`, `destination`/`place`/`package`, `adults`/`persons`/`pax`, `budget`, `date`/`when` as `travel_from`, `message`/`remarks`/`requirement` as `note`). | `guessFields("leads", ["Timestamp","Email Address","Where do you want to go?"], new Map(), { wordsInHeader: true })` and off |
| N3  | `packages/domain/src/imports/{batches,read-listener,index}.ts` (0.4, 0.6)                                      | (a) `startImportFromBytes(db: Database, files: Files, input: StartImportFromBytesInput, now: Date): Promise<{ importId: string }>`: stores `bytes` as the batch's file (record type `import_batch`, `text/csv`), makes the batch `reading` for `input.startedBy`, with `source_sheet_id` (N5), and publishes `import.uploaded`; safe to call again with the same `input.importId`. (b) The read listener, when it moves a batch to `matching`, also publishes `import.read` (`{ importId, kind }`). (c) `isAnyImportAdding(tx: OrgTx): Promise<boolean>`. (d) `rememberedHeaderFields(tx: OrgTx, kind: ImportKind): Promise<ReadonlyMap<string, ImportField \| null>>` and `rememberHeaderFields(tx: OrgTx, kind: ImportKind, matches: readonly { headerKey: string; field: ImportField \| null }[], now: Date): Promise<void>` (B10, the header memory 0.6 and 0.7 use). (e) `jobMemberAccess(dependencies: Pick<ImportJobDependencies, "identity" \| "subscriptions">, who: { organizationId: string; userId: string; impersonatedBy: string \| null }, required: readonly Permission[]): Promise<{ access: MemberAccess } \| { failure: ImportFailureReason }>`, extracted from `importerAccess`, which becomes a call to it. | `startImportFromBytes` twice with one `importId` makes one batch and one `import.uploaded`; the listener publishes `import.read` once; `importerAccess` still passes its tests |
| N4  | `packages/db/prisma/schema/imports.prisma` and a migration `20261022100000_sheet_import_links` (0.2)         | `import_batch.source_sheet_id uuid NULL`, `import_batch.add_in_crm boolean NOT NULL DEFAULT false`, index `import_batch_by_sheet (organization_id, source_sheet_id) WHERE (source_sheet_id IS NOT NULL)`; `import_row_plan_value` gains `in_crm`. `ImportBatchRow` gains `sourceSheetId: string \| null` and `addInCrm: boolean`.                                                                                                                                                                              | `bulk-tables.test.ts`: the plan CHECK accepts `in_crm`; the index exists; a batch keeps a sheet id                          |
| N5  | `packages/contracts/src/{imports,crm}/**` and `imports.json`'s `reasons` (0.3, lead-import)                   | `rowPlans` gains `in_crm`; `rowReasonCodes` gains `in_crm_open` and `in_crm_closed` (with sentences "Has an open lead with you" and "Has a closed lead with you"); `importDetail` gains `sourceSheet: { sheetId: string } \| null` and `choices.addInCrm: boolean`; `decideLeadImportInput` gains `addInCrm: z.boolean().default(false)`; `SheetOrigin` (below) is exported from `@travel-crm/contracts/imports`.                                                                                          | contracts tests: the new plan and reasons parse; `decide` without `addInCrm` parses as `false`                              |
| N6  | `packages/domain/src/crm/lead-import/{row-values,lead-row,lead-lookups,lead-check,lead-add}.ts` (1.2-1.4)    | **`LeadRowContext.origin?: SheetOrigin`** with `SheetOrigin = { detail: string; timeZone: string; monthFirstDates: boolean }`. With an origin: source `google_sheet`, source detail `origin.detail` (cut to 120) followed by a Their source cell; the Enquiry date is read **with its time** when the cell has one, in `origin.timeZone`, stored as that moment (a date only is the start of that day in the agency's zone, as now; a date in the future is `createdAt: null`); when `monthFirstDates` and both parts of a `d/m/y` are 12 or less, the date is unreadable (kept in the note). `fingerprintValues` holds the calendar day of the date either way, so a sheet row and the same row in a file fingerprint alike. In the check and the add, a batch with `sourceSheetId` builds its context with `dependencies.sheetOrigin(tx, sourceSheetId)` (`ImportJobDependencies` gains `sheetOrigin?: (tx: OrgTx, sheetId: string) => Promise<SheetOrigin \| null>`). **`in_crm`:** for such a batch, after blocked and already imported, a row whose contacts match a person with any live lead (`anyLeadOfQuery(personIds)`, `LeadLookups.hasLead(personId)`) is planned `in_crm` with reason `in_crm_open` or `in_crm_closed`; the add leaves it out (`left_out`) unless `add_in_crm`, and then saves it as any row (a repeat enquiry on the open lead, or a lead marked Returning). `decideLeadImport` stores `add_in_crm`. | `lead-row.test.ts`: the origin cases; `lead-check.test.ts`: `in_crm` open/closed counts; `lead-add.test.ts`: left out, then added when ticked |
| N7  | `packages/domain/src/crm/save-enquiry.ts` (1.1)                                                                | The import variant of `EnquiryOptions` gains `notify?: "each" \| "none"` (default `"none"`, so imports are unchanged). `"each"` sends the lead's owner the form's own "New lead assigned to you" or "Repeat enquiry on your lead", by the same helper `createLead` uses.                                                                                                                                                                                                                                          | `save-enquiry.test.ts`: `"each"` notifies the owner once; the default notifies nobody                                       |
| N8  | `apps/web/src/leads/import/check-step.tsx`, `lead-import-screen.tsx`, `leads.json`'s `import` key (1.6, 1.7) | For an import whose detail has `sourceSheet`: the caption "From your Google Sheet. New rows added to the sheet meanwhile are being added by the sheet itself."; the question "Rows with no stage get: New" (re-sends `leadImports.match` with the same columns and the chosen default, B13); the group **Already in your CRM** ("212 rows are for people who already have a lead with you (140 with an open lead, 72 with only closed leads). Left out unless you tick them."), its `Checkbox` sending `decide` with `addInCrm`. | `check-step.test.tsx`: the group, its counts and the tick                                                                    |
| N9  | `ImportJobDependencies`, `packages/api` context and `packages/api/src/routers/lead-imports.ts` (0.4, 1.5)      | `requestImportAdd(db, access, kind, importId, now, guards?: readonly AddGuard[])` with `type AddGuard = (tx: OrgTx, now: Date) => Promise<void>` run inside the Add request's transaction; the api context carries `addGuards: readonly AddGuard[]` (empty by default) and `leadImports.add` passes it. (S26, the reverse direction.)                                                                                                                                                                  | `import-steps.test.ts`: a guard that throws `IMPORT_ALREADY_RUNNING` refuses the Add and leaves the batch `checked`          |
| N10 | `packages/contracts/src/crm/file-words.ts`, `leads.json` (0.3)                                                | Verify only: `google_sheet` is already a `leadSource` (fields.ts, the lead table's CHECK, `createdFrom`). `leadFileWords.source` and `leads.json`'s `sources` gain `google_sheet`: "Google Sheet" if either lacks it, so a lead export and the Leads filter show it.                                                                                                                                                                                                                                       | `file-words.test.ts` and `leads.json` carry "Google Sheet"                                                                    |
| N11 | `packages/domain/src/crm/demo-lead-data.ts`, `packages/domain/test/platform/demo.test.ts` (1.8)                | The demo's sample leads gain two with source `google_sheet` and the detail "Goa Diwali campaign · Form responses 1", one each for Asha and Ravi, so the source shows in the list and on a lead (spec 10). No connection is seeded.                                                                                                                                                                                                                                                                       | `demo.test.ts`: two leads from a Google Sheet, no `sheet_connection`                                                          |

`SheetOrigin` is `{ detail: string; timeZone: string; monthFirstDates: boolean }`. `StartImportFromBytesInput` is
`{ importId: string; organizationId: string; startedBy: string; impersonatedBy: string | null; fileName: string;
bytes: Uint8Array; sourceSheetId: string }`.

**Registries `sheets/sync` edits itself.** The bulk plan froze these against its three parallel branches. No branch runs
beside `sheets/sync`, so it makes **additive** edits to them, each named in its task: `apps/api/src/{services,worker-jobs,console-jobs,environment,console-environment}.ts`,
`packages/api/src/routers/app-router.ts`, `packages/domain/src/crm/index.ts`, `packages/domain/src/platform/{erasure,erase-customer,index}.ts`,
`errors.json`, `audit.json`, `notifications.json`, `kinds.ts`, `apps/web/src/i18n/messages.ts`, `routes.ts`,
`apps/web/test/e2e/audit/shot-list.ts`, `.dependency-cruiser.cjs`, `CLAUDE.md`, `packages/domain/README.md`,
`docs/adr/**` and `docs/deploy-checklist.md`. If the controller prefers them in `bulk/sheets-prereq`, they move there
unchanged. (Ruling S1 below.)

## Rulings ledger

Format: `Ruling: <what> — <why> — <cost if wrong>`. These are the planner's calls on what the spec leaves open or where it
conflicts with the code. The builder adds its own to its report.

**Spec gaps**

- S1. Ruling: the registries listed above are edited by `sheets/sync` — the bulk plan froze them to stop parallel
  branches colliding, and none runs — cost if wrong: they move to the prereq branch.
- S2. Ruling: the scheduled check is a plain job handler (`sheets.check`), not an event. The spec's `sheet.check-due`
  would write an outbox row and a `processed_event` row for every check of every sheet, 720 a day each, in two
  append-only tables nothing purges. Sync now still publishes `sheet.sync-requested` (a rare, user-made event) for the
  listener `crm.check-lead-sheet`, and both call the same `checkLeadSheet` — cost if wrong: one handler becomes a
  listener.
- S3. Ruling: `ColumnMatcher` needs no new prop to hide Stage. It takes `fields`, so the sheet's screens pass the lead
  import's fields without `stage` — cost if wrong: none.
- S4. Ruling: `JobHandler` and `EventListener` gain an optional `concurrency`, passed to `runner.work(queue, handler,
  { concurrency })`. `startWorker` passes none today, and S36 asks for four checks at a time — cost if wrong: one option.
- S5. Ruling: `sheet_connection` gains `claim_id uuid` (the claim row's id) and `touched_at` (a draft's last step, for
  "untouched for 24 hours"), and `sheet_column` gains `is_new boolean` (a header the sheet gained that nobody has seen,
  S15). The claim is released by `claim_id`, and the sweep drops claims no live connection holds, so the console never
  needs `SHEETS_HASH_KEY` to release one; spec 5 lists none of the three — cost if wrong: three columns.
- S6. Ruling: the console's erasure job writes the tombstones (S43), so the console, and only the console besides the
  api and the worker, gets `SHEETS_HASH_KEY` — not the service-account key. Erasing a customer of an organization that
  has sheet rows while the key is missing fails the job loudly (`ownMessage`), never silently skipping — cost if wrong:
  an erasure waits for the setting.
- S7. Ruling: `organization-keys.test.ts` demands unique constraints with `organization_id`; the claim's hash must be
  unique across agencies. The named list gains `crossOrganizationUniques = ["sheet_spreadsheet_claim_hash"]` beside
  `unscopedScheduleTables`, with the same comment — cost if wrong: one entry.
- S8. Ruling: an account's rate-limit hold (S37) lives in the worker's memory (`AccountHolds`), shared by the dispatcher
  and the checks of that process, and in the connection's `hold_until`. The exempt schedule table has exactly the
  spec's columns, so it cannot say which account is held — cost if wrong: a restart forgets a hold for a minute.
- S9. Ruling: a ledger row is **known** only when its status is `before_connect`, `added`, `merged`, `duplicate` or
  `erased`. A `pending` or `not_added` row is processed again whenever its hash is read: that is how unblocking a
  contact and pressing Sync now adds a blocked row (S23), and how a half-typed row is listed at the next check (S29).
  A `pending` row whose hash left the sheet is deleted — cost if wrong: a blocked row would never come back.
- S10. Ruling: in a normal check, `(raw_hash, occurrence)` is numbered within the rows read, so two identical rows in
  the window are two rows, and an identical row whose twin lies before the window waits for the daily full read. A full
  read numbers the whole tab — cost if wrong: a rare identical row waits up to a day.
- S11. Ruling: the window starts at the smaller of `cursor_row - 100` and the first row number of any `pending` row, so
  a half-typed row is never left behind the lookback — cost if wrong: it waits for the daily full read.
- S12. Ruling: a check refreshes `check_started_at` in every 50-row transaction (its heartbeat) and clears it at the
  end. "A check is saving" for N9 is `check_started_at` within the last 30 seconds; "a check started" for the claim is
  within five minutes. Before each batch a check looks for an import that has started adding (S26) and, finding one,
  stops without moving the cursor — cost if wrong: an Add waits up to a minute.
- S13. Ruling: no sample values are stored. Steps that show samples (tab and columns, Match again) call
  `leadSheets.verify`, which reads Google once. A sheet's columns hold headers and fields only — cost if wrong: one
  Google read per visit.
- S14. Ruling: the dispatcher's claim is indexed by `(next_check_at)` (spec 5), not the `(status, last_checked_at)`
  index spec 11 names; the schedule table has no status — cost if wrong: none.
- S15. Ruling: the connect-time import's leads carry source `google_sheet` with the sheet's name and tab, not Import
  (N6), so the source filter finds every lead a sheet brought. Spec 3.3 says "an ordinary lead import"; its pipeline is
  ordinary, its source is not — cost if wrong: one origin.
- S16. Ruling: `leadSheets.verify` (re-describe a draft or a running sheet, returning tabs, headers with up to three
  samples and the guessed or matched fields) and `leadSheets.recheck` (Check again for Lost access or Tab missing,
  with an optional new tab) are the spec's `verify` and `recheck` — cost if wrong: names.
- S17. Ruling: tests and journeys reach a Google that isn't real two ways. Domain and api tests use the in-memory
  adapter in the process. The journeys run the api and the worker as separate processes, so the harness serves the
  in-memory adapter over HTTP (`support/fake-google.ts`), speaking the two Sheets v4 endpoints, and the real adapter is
  pointed at it by `GOOGLE_SHEETS_TEST_SERVER_URL` (development and tests only; production refuses it). The journeys
  also set `SHEETS_CHECK_INTERVAL_SECONDS` (default 120; refused in production) to 1 so a wait is one dispatcher tick —
  cost if wrong: a longer wait.
- S18. Ruling: a contact's tombstone hash is `HMAC-SHA256(SHEETS_HASH_KEY, "<kind>:<normalised value>")` with the kind
  `phone`, `email` or `instagram`; a re-keyed row hash is `HMAC-SHA256(SHEETS_HASH_KEY, <the plain SHA-256 bytes>)`.
  The kind prefix stops a handle equal to an email from colliding — cost if wrong: none.
- S19. Ruling: the check itself, not the dispatcher, removes the schedule row (a stale row is harmless, spec 5), and a
  check ends by writing `next_check_at` in its own `withoutOrg` transaction after the organization's — cost if wrong:
  a stale row costs one no-op check.

- S20. Ruling: a refusal's sentence carries no name (release 1's R32), so `SHEET_ALREADY_CONNECTED` reads "This sheet is
  already connected here." — spec S7 shows the sheet's name in it. The list on the Lead sources page names it — cost if
  wrong: the sentence gains a name through a typed detail.
- S21. Ruling: a baseline that meets a permanent Google answer (the share was removed between Confirm and the job) puts
  the never-connected sheet in `lost_access`, so the page says so and **Check again** (`recheck`, which re-requests
  the baseline for a sheet with no `connected_at`) fixes it — cost if wrong: the Owner is noticed for a sheet just made.
- S22. Ruling: `SHEETS_UNAVAILABLE` ("Google isn't answering. Try again in a minute.") is a reason the spec does not
  list: `begin` and `verify` meet a busy Google (`rate_limited`, `unavailable`, `too_large`) and need a sentence — cost if
  wrong: one reason.
- S23. Ruling: `leadSheets.verify` reads the tab once (up to 20,000 rows) so that step 3 can say how many rows the sheet
  holds and the Owner column can list its values; `begin` only describes. A grid's `rowCount` is its size, not its data —
  cost if wrong: step 3's number is a read away.
- S24. Ruling: the demo has Google unset, so its Lead sources page says "Not available in the demo" for the demo
  organization and "Google Sheets isn't set up on this server." elsewhere. Both turn **Connect a sheet** off — cost if
  wrong: one sentence.

## File structure

```
packages/integrations/src/google-sheets/                 1, 2   the port, the real and in-memory adapters
packages/db/prisma/schema/sheets.prisma                  3      seven tables
packages/db/prisma/migrations/20261023100000_sheets_sync/ 3
packages/db/src/sheet-schedule.ts                        3      the exempt tables' one entry point
packages/contracts/src/sheets/                           5
packages/domain/src/sheets/                              6-8, 11-13   connections, steps, engine, schedule, erasure, sweep
packages/domain/src/crm/lead-sheets/                     9, 10  rows to leads, the check
packages/api/src/routers/lead-sheets.ts                  14
apps/web/src/lead-sources/                               16-18  the list, the connect steps, the sheet's page
apps/web/src/app/(app)/settings/lead-sources/            16-18
apps/web/test/e2e/sheets-*.spec.ts, support/fake-google.ts, audit/12-sheets.audit.ts   19, 20
```

---

## Task 1: The prerequisites gate, and the Google port with its in-memory adapter

**Files:**

- Create, in `packages/integrations/src/google-sheets/`: `index.ts`, `google-sheets.ts` (the port, `GoogleSheetsError`,
  the scope), `shape-rows.ts`, `memory-google-sheets.ts`.
- Create the tests: `packages/integrations/test/google-sheets/{port,shape-rows,memory-google-sheets}.test.ts` and
  `packages/domain/test/sheets/prerequisites.test.ts`.

**Interfaces** (produces, from `@travel-crm/integrations/google-sheets`):

```ts
export const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
/** The port's methods, listed so a test can prove none writes (S1). */
export const googleSheetsMethods = ["accounts", "describe", "readRows"] as const;
export interface GoogleAccount { index: number; email: string }
export interface SheetTab { gid: string; title: string; isGrid: boolean; rowCount: number } // rowCount: the grid's size
export interface SheetDescription {
  title: string; locale: string; timeZone: string; tabs: readonly SheetTab[];
  chosenTab: SheetTab | null;                      // the tab with `tabGid`, else the first grid tab
  header: readonly string[];                       // the chosen tab's row 1, as shown
  sampleRows: readonly (readonly string[])[];      // rows 2-4
}
export interface ReadRowsOptions { tabTitle: string; fromRow: number; maxRows: number; maxColumns: number; maxCellLength: number }
/** header: row 1. rows: from `fromRow`, each padded to the header's width, "" for empty. lastRow: the last row with a value. */
export interface SheetRead { header: readonly string[]; rows: readonly { rowNumber: number; cells: readonly string[] }[]; lastRow: number; truncated: boolean }
export const googleSheetsErrorReasons = ["not_shared", "not_found", "not_a_sheet", "tab_missing", "rate_limited", "unavailable", "too_large"] as const;
export type GoogleSheetsErrorReason = (typeof googleSheetsErrorReasons)[number];
export class GoogleSheetsError extends Error { readonly reason: GoogleSheetsErrorReason; readonly retryAfterSeconds: number | null }
export interface GoogleSheets {
  accounts(): readonly GoogleAccount[];
  describe(accountIndex: number, spreadsheetId: string, options?: { tabGid?: string }): Promise<SheetDescription>;
  readRows(accountIndex: number, spreadsheetId: string, options: ReadRowsOptions): Promise<SheetRead>;
}
/** Pads short rows to the header's width, cuts columns past maxColumns and cells past maxCellLength, and reads a Sheets error value as "". */
export function shapeRows(values: readonly (readonly unknown[])[], limits: { maxColumns: number; maxCellLength: number }): string[][];
export interface MemoryGoogleSheets extends GoogleSheets {
  addSpreadsheet(sheet: { id: string; title: string; locale?: string; timeZone?: string; kind?: "sheet" | "excel";
    tabs: { gid: string; title: string; rows: string[][] }[] }): void; // rows[0] is the header
  share(spreadsheetId: string, accountEmail: string): void;
  unshare(spreadsheetId: string, accountEmail: string): void;
  deleteSpreadsheet(spreadsheetId: string): void;
  append(spreadsheetId: string, tabTitle: string, row: string[]): void;
  insertAt(spreadsheetId: string, tabTitle: string, rowNumber: number, row: string[]): void;
  deleteAt(spreadsheetId: string, tabTitle: string, rowNumber: number): void;
  sort(spreadsheetId: string, tabTitle: string, compare: (a: string[], b: string[]) => number): void; // data rows only
  editCell(spreadsheetId: string, tabTitle: string, rowNumber: number, columnIndex: number, value: string): void;
  rename(spreadsheetId: string, title: string): void;
  renameTab(spreadsheetId: string, gid: string, title: string): void;
  failNext(reason: GoogleSheetsErrorReason, options?: { retryAfterSeconds?: number; times?: number; accountIndex?: number }): void;
  readonly calls: { total: number; describes: number; reads: number; byAccount: Readonly<Record<number, number>> };
}
export function createMemoryGoogleSheets(options?: { accountEmails?: readonly string[] }): MemoryGoogleSheets; // default one account
```

- The errors follow S5: a sheet nobody shared with the account answers `not_shared`, a deleted one
  `not_found`, an Excel file `not_a_sheet`, a renamed tab (read by its old title) `tab_missing`.
- An error value is exactly one of `#N/A`, `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?`, `#NUM!`, `#NULL!`, `#ERROR!`.
- `readRows` asks for at most `maxRows` rows and reports `truncated` when the tab holds more.

**Prerequisites gate.** `prerequisites.test.ts` fails with the number of the "Needs" item that is missing.

- [ ] **Step 1: Write the failing tests.**

```ts
// packages/domain/test/sheets/prerequisites.test.ts (one it per Needs item; each names its item in the title)
it("N1: nameHeaders and columnLetters are exported by the spreadsheets port", …) // ["Name","Column B","Name (2)"]; "AB"
it("N2: guessFields reads Google Forms' headers and words in a header, only when asked", …) // Timestamp → enquiry_date, Email Address → email; off: no guess for "Where do you want to go?" → destination only with wordsInHeader? "go" has none: use "Which place?" → destination
it("N3: imports offer startImportFromBytes, isAnyImportAdding, rememberHeaderFields and jobMemberAccess", …) // typeof … === "function"
it("N4: an import batch keeps a sheet id and add_in_crm, and a row may plan in_crm", …) // aBatch(tx, { sourceSheetId }) round-trips; aRow plan "in_crm"
it("N5: the contracts know in_crm, its two reasons, sourceSheet and addInCrm", …) // rowPlans, rowReasonCodes, decideLeadImportInput.parse without addInCrm → false
it("N6: readLeadRow reads a sheet origin: source google_sheet, a date with its time, a month-first date unreadable", …) // 19/10/2026 14:32:10 Asia/Kolkata → 2026-10-19T09:02:10.000Z; 10/12/2026 with monthFirstDates → noted
it("N7: saveEnquiry notifies the owner when asked", …)
it("N9: requestImportAdd runs its guards", …)
it("N8: the lead import's check step shows the sheet's extras", …) // render the step with a detail holding sourceSheet
it("N10 and N11: Google Sheet is a source in the file words, and the demo has two leads from one", …)
```

```ts
// port.test.ts
it("has no method that writes", …) // googleSheetsMethods equals ["accounts","describe","readRows"]; the memory adapter's own keys not in that list are all control methods; GOOGLE_SHEETS_SCOPE is the readonly scope
// shape-rows.test.ts
it("pads short rows to the header's width and keeps a phone's leading zero as shown", …) // [["Name","Phone","City"],["Asha","098765 43210"]] → ["Asha","098765 43210",""]
it("cuts cells at maxCellLength and drops columns past maxColumns", …)
it("treats a Sheets error value as empty, only when it is the whole cell", …) // "#REF!" → ""; "#REF! in B3" kept
it("pads short rows, cuts cells and treats a Sheets error value as empty", …) // the Review Focus 2 composite
// memory-google-sheets.test.ts
it("answers not_shared until the account is shared, then not_found after the sheet is deleted", …)
it("describes title, locale, time zone, tabs, the first row and three rows below it, choosing the tab by gid, else the first grid tab", …)
it("answers not_a_sheet for an Excel file and tab_missing for a tab read by its old title after renameTab", …)
it("applies sort, insertAt, deleteAt, editCell and append to what readRows returns, with row numbers as a sheet has them", …)
it("fails the next call with any reason, rate_limited carrying retryAfterSeconds, for the times asked", …)
it("counts calls in total and by account", …)
it("bounds a million rows, a 10 MB cell and 5,000 columns", …) // maxRows 20,000 → 20,000 rows, truncated true; cells ≤ 4,000; width ≤ 50
```

- [ ] **Step 2: Run them to see them fail.**
  - Run `pnpm --filter @travel-crm/integrations test -- google-sheets` and
    `pnpm --filter @travel-crm/domain test -- sheets/prerequisites`.
  - Expected: the integrations tests FAIL (no module). The prerequisites test FAILs naming each Needs item that is
    missing. If any is missing, stop and report to the controller: do not build the item here.
- [ ] **Step 3: Implement** the port and the in-memory adapter by the Interfaces. `shapeRows` is shared by both adapters.
- [ ] **Step 4: Run the integrations tests and the import rules.**
  - Run the same integrations command, then `pnpm run depcruise`.
  - Expected: PASS. The prerequisites test passes only once the Needs have landed.
- [ ] **Step 5: Commit.** Message: `feat(integrations): the Google Sheets port, read only, with an in-memory adapter`.

## Task 2: The real Google adapter

**Files:**

- Create, in `packages/integrations/src/google-sheets/`: `real-google-sheets.ts`, `google-responses.ts` (Zod schemas
  for the two endpoints' answers and the error mapping).
- Create the tests: `packages/integrations/test/google-sheets/real-google-sheets.test.ts`, and recorded answers in
  `packages/integrations/test/google-sheets/recorded/{forbidden,not-found,bad-range,not-a-sheet,quota-403,rate-limited,unavailable}.json`
  (written from Google's documented error bodies).
- Modify: `packages/integrations/package.json` (`google-auth-library` 11.3.1 exactly), `pnpm-lock.yaml`,
  `.dependency-cruiser.cjs` (`vendor-sdks-only-in-integrations` gains `google-auth-library`),
  `apps/api/test/bundle.test.ts` (it keeps `google-auth-library` in the bundle).

**Interfaces:**

```ts
export interface ServiceAccountKey { client_email: string; private_key: string }
export interface RealGoogleSheetsOptions {
  accounts: readonly ServiceAccountKey[];
  apiBaseUrl?: string;                                  // default https://sheets.googleapis.com; the journeys' fake (S17)
  accessToken?: (accountIndex: number) => Promise<string>; // default: google-auth-library's JWT with GOOGLE_SHEETS_SCOPE
  fetch?: typeof fetch;
  timeoutMs?: number;                                   // 20_000
}
export function createRealGoogleSheets(options: RealGoogleSheetsOptions): GoogleSheets
```

- Two endpoints, both `GET`: `spreadsheets.get` with `fields` asking only for what `describe` needs, and
  `spreadsheets.values.batchGet` with `valueRenderOption=FORMATTED_VALUE` and `majorDimension=ROWS`. The id is one
  encoded path segment. `readRows` asks for the header (`'<tab>'!1:1`) and `'<tab>'!A<fromRow>:<last column><fromRow + maxRows>`
  in one request, so a million-row tab is never fetched.
- The body is read as a stream and stops with `too_large` past 25 MB. Answers are parsed with Zod; a body that does not
  parse is `unavailable`.
- Mapping (S5, S37, S39, S40): 403 `PERMISSION_DENIED` is `not_shared`; 404 is `not_found`; 400 "Unable to parse range"
  is `tab_missing`; 400 or `FAILED_PRECONDITION` "not supported for this document" is `not_a_sheet`; 429, or 403 with
  `RATE_LIMIT_EXCEEDED`/`rateLimitExceeded`, is `rate_limited` with `Retry-After` in seconds (null when absent or not a
  number); 5xx, 401, a network error and the timeout are `unavailable`. Messages are the reason's words only.

- [ ] **Step 1: Write the failing tests** (an injected `fetch` answers from the recorded files).

```ts
it("makes only GET requests, to the two endpoints, with the id as one encoded path segment", …) // an id "../x" is %2E%2E%2Fx
it("asks for FORMATTED_VALUE and only the fields describe needs", …)
it("sends the account's token as a bearer token, per account", …)
it("builds the default token source with the readonly scope", …) // inject google-auth-library's JWT factory; scopes equal [GOOGLE_SHEETS_SCOPE]
it("maps a recorded 403, 404, 400 bad range, 400 not-a-sheet, quota 403, 429 with Retry-After: 120, 429 without it, 500, 503, 401 to reasons", …) // table-driven; retryAfterSeconds 120 and null
it("maps a network error and a request past the timeout to unavailable", …) // fake timers at 20 s
it("never puts a sheet's content, a title or a token in an error's message", …) // message equals the reason
it("stops reading a 30 MB body at 25 MB with too_large", …) // counts bytes pulled from the stream
it("pads, cuts and empties error values as the memory adapter does", …) // the same cases as shape-rows
it("refuses an account index it doesn't have", …) // RangeError
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/integrations test -- real-google-sheets`.
  Expected: FAIL.
- [ ] **Step 3: Add the dependency** (`pnpm --filter @travel-crm/integrations add --save-exact google-auth-library@11.3.1`),
  then implement `createRealGoogleSheets`. If pnpm's release-age rule refuses the version, stop and report.
- [ ] **Step 4: Run the tests, the bundle test and the import rules.**
  - Run the integrations tests, `pnpm --filter @travel-crm/api-server test -- bundle` and `pnpm run depcruise`.
  - Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(integrations): the real Google Sheets adapter: fetch, with a service account's JWT`.

## Task 3: The tables, the two exempt tables, and ADR 0031

**Files:**

- Create:
  - `packages/db/prisma/schema/sheets.prisma`;
  - `packages/db/prisma/migrations/20261023100000_sheets_sync/migration.sql`;
  - `packages/db/src/sheet-schedule.ts`;
  - `packages/db/test/org-table-fixtures/sheets.ts`;
  - `packages/db/test/{sheets-tables,schedule-table}.test.ts`;
  - `docs/adr/0031-google-sheets-sync.md`.
- Modify:
  - `packages/db/prisma/schema/organization.prisma` (back-relations);
  - `packages/db/package.json` (`"./sheet-schedule": "./src/sheet-schedule.ts"`);
  - `packages/db/src/for-org.ts` (the unscoped model names gain `sheetCheckSchedule` and `sheetSpreadsheetClaim`);
  - `packages/db/test/org-table-fixtures.ts` (`unscopedScheduleTables`, `crossOrganizationUniques`);
  - `packages/db/test/{isolation,organization-keys,unscoped-tables}.test.ts` (filter the list as `signInTables` is);
  - `packages/db/README.md` (the entry-points table and the `withoutOrg` paragraph);
  - `packages/domain/eslint.config.js` (`rawSqlSelectorsAllowing` names both tables, allowed in
    `packages/domain/src/sheets/schedule.ts`);
  - `.dependency-cruiser.cjs` (`@travel-crm/db/sheet-schedule` only from `packages/domain/src/sheets/schedule.ts`);
  - `docs/adr/README.md`.

**Interfaces:**

- **Models** (snake_case through `@map`). Each organization table has `organizationId` (the README's line), `id` (UUID
  v7), `@@unique([organizationId, id])` and a Restrict/Restrict `organization` relation.
  - **`SheetConnection`:**
    - `status` (default `"connecting"`), `step` (default `"share"`), `existingRows?`;
    - `spreadsheetId`, `tabGid`, `tabTitle`, `sheetTitle`, `sheetLocale`, `sheetTimeZone`, `serviceAccountIndex Int`;
    - `cursorRow Int @default(1)`, `rowsSeen Int @default(0)`, `headerHash? Bytes`;
    - `connectedBy @db.Uuid`, `impersonatedBy? @db.Uuid`, `claimId? @db.Uuid` (S5);
    - `rowsAdded`, `rowsMerged`, `rowsDuplicate`, `consecutiveFailures` (ints, default 0);
    - `attentionSince?`, `lastCheckedAt?`, `lastOkAt?`, `lastFullReadAt?`, `checkStartedAt?`, `holdUntil?`;
    - `createdAt`, `touchedAt` (S5), `connectedAt?`, `disconnectedAt?`.
  - **`SheetColumn`:** `connectionId`, `headerKey`, `header`, `field?`, `isNew Boolean @default(false)` (S5).
  - **`SheetValueMatch`:** `connectionId`, `field`, `value`, `target? @db.Uuid`, `matchedBy`.
  - **`SheetRow`:** `connectionId`, `rawHash Bytes`, `occurrence Int`, `rowNumber Int`, `status`, `reasons String[]`,
    `fingerprint? Bytes`, `leadId?`, `personId?`, `exampleName?`, `exampleValue?`, `resolvedAt?`, `firstSeenAt`,
    `processedAt?`.
  - **`SheetErasedContact`:** `contactHash Bytes`, `erasedAt`.
  - **`SheetCheckSchedule`** (exempt): `id` (the connection's own, primary key), `organizationId` (no default: written
    outside an organization), `serviceAccountIndex Int`, `nextCheckAt`, `claimedUntil?`. Exactly these columns.
  - **`SheetSpreadsheetClaim`** (exempt): `id`, `organizationId` (no default), `spreadsheetHash Bytes`, `createdAt`.
    Exactly these columns.
- **Keys:** `sheet_column`, `sheet_value_match` and `sheet_row` refer to `sheet_connection` by
  `(organization_id, connection_id)`, Restrict/Restrict. Both exempt tables keep their `organization_id` key to
  `organization`, Restrict/Restrict. No key from `sheet_connection` to `member`, `user`, `lead` or `person` (other
  modules' ids are plain uuids).
- **Indexes, by exact name** (predicates as Postgres prints them, R1):
  - `sheet_connection_live`: unique `(organization_id, spreadsheet_id, tab_gid)` where `(status <> 'disconnected'::text)`;
  - `sheet_connection_recent (organization_id, id DESC)`;
  - `sheet_column_key` unique `(organization_id, connection_id, header_key)`;
  - `sheet_value_match_value` unique `(organization_id, connection_id, field, value)`;
  - `sheet_row_hash` unique `(organization_id, connection_id, raw_hash, occurrence)`;
  - `sheet_row_fingerprint (organization_id, fingerprint)` where `(fingerprint IS NOT NULL)`;
  - `sheet_row_problems (organization_id, connection_id, row_number)` where `((status = 'not_added'::text) AND (resolved_at IS NULL))`;
  - `sheet_row_person (organization_id, person_id)` where `(person_id IS NOT NULL)`;
  - `sheet_erased_contact_hash` unique `(organization_id, contact_hash)`;
  - `sheet_check_schedule_due (next_check_at)`;
  - `sheet_spreadsheet_claim_hash` unique `(spreadsheet_hash)`.
- **`@travel-crm/db/sheet-schedule`:** `sheetSchedule(tx: OrgTx)` and `spreadsheetClaims(tx: OrgTx)`, each
  `unscopedModel(tx, …)`, working in `db.withoutOrg()` only.
- **Fixtures:** `sheets.ts` makes a connection, a column, a value match, a row and an erased contact. `sheet_value_match`,
  `sheet_row` and `sheet_column` are not `undeletable`; `sheet_connection` and `sheet_erased_contact` are
  `undeletable: true`.

- [ ] **Step 1: Write the failing tests.**

```ts
// sheets-tables.test.ts (inserts as app_runtime in forOrg; CHECKs matched by their names)
it("holds statuses, steps, existing-row choices, row statuses, reasons and fields to their lists", …) // the 22 sheet fields (the lead import's less stage), 8 statuses, 5 steps, 7 row statuses
it("lets one live connection per spreadsheet and tab in an organization, and a second after the first is disconnected", …) // /sheet_connection_live/
it("keeps a fingerprint only on an added, merged, duplicate or erased row", …)
it("keeps examples to 120 characters and a tab title to 100", …)
it("refuses the same hash and occurrence twice in a connection, and allows the same hash in two connections", …)
it("lets the runtime role update every sheet table, and delete only rows, columns and value matches", …)
it("purges an organization with sheets, their rows, a schedule row and a claim", …) // deleteOrganizationRows resolves; rows gone
// schedule-table.test.ts
it("lists exactly the two exempt tables, each existing and carrying organization_id", …)
it("gives them no row-level security, and no other table is exempt", …) // pg_class.relrowsecurity false only for these two (and the sign-in and unscoped tables)
it("holds exactly the columns the spec names, so no personal data can be added", …) // schedule: id, organization_id, service_account_index, next_check_at, claimed_until; claim: id, organization_id, spreadsheet_hash, created_at
it("hides both from OrgTx, IdentityTx and the identity client, and refuses a cast past the types", …) // @ts-expect-error, UnscopedModelError
it("reaches them only in db.withoutOrg(), through sheetSchedule and spreadsheetClaims", …)
it("gives app_runtime select, insert, update and delete on the schedule, select, insert and delete on the claim, and nothing else", …) // information_schema.role_table_grants
it("lets the platform role read and delete both", …)
it("keeps the claim's hash unique across organizations", …) // a second organization's insert rejects /sheet_spreadsheet_claim_hash/
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/db test -- sheets-tables schedule-table`.
  Expected: FAIL.
- [ ] **Step 3: Write the schema and the migration** by the README's recipe (`prisma migrate diff … --output`).
  - Then append to `migration.sql`, the CHECKs first, named `<table>_<rule>`: `status_value`, `step_value`,
    `existing_rows_value`, `counts` (at least 0), `cursor_row` (at least 1), `text_lengths`, `spreadsheet_id_format`
    (`^[A-Za-z0-9_-]{20,80}$`), on `sheet_column` the field list, on `sheet_row` `status_value`, `reasons_value`,
    `fingerprint_status`, `example_lengths`, `occurrence_positive`.
  - Then the grants:
    - `REVOKE DELETE ON TABLE sheet_connection, sheet_erased_contact FROM app_runtime;`;
    - the exempt tables' grants as the test states, as `webhook_event`'s and `rate_limit_counter`'s migrations did, and
      the platform role's select and delete.
  - Then `SELECT app_enable_org_rls('<table>');` for the five organization tables.
  - Add `unscopedScheduleTables` and `crossOrganizationUniques` to `org-table-fixtures.ts`, each with its comment from
    spec 5 ("ids and times only, no organization data; reached only through @travel-crm/db/sheet-schedule inside
    db.withoutOrg()"), and make `isolation.test.ts`'s `tablesWithOrganizationId` and `organization-keys.test.ts` filter
    them, nothing more (S7). Run `pnpm --filter @travel-crm/db generate`.
  - Write ADR 0031: the service account and why not OAuth yet, read only and polling, `google-auth-library` with
    `fetch`, the spreadsheet claim, the two exempt tables and why they are safe, the worker's dispatch (S36), and the
    rulings S2, S5, S6, S8.
- [ ] **Step 4: Run the db tests and the import rules.** Run `pnpm --filter @travel-crm/db test`,
  `pnpm --filter @travel-crm/domain lint` and `pnpm run depcruise`. Expected: PASS, including the isolation,
  organization-keys, schema and drift checks.
- [ ] **Step 5: Commit.** Message: `feat(db): the sheet sync tables, with the schedule and claim outside row-level security`.

## Task 4: The settings: environment, services, and the deploy checklist

**Files:**

- Modify:
  - `apps/api/src/environment.ts`, `apps/api/src/console-environment.ts`;
  - `apps/api/src/services.ts`;
  - `apps/api/src/start-up.ts` (the start-up line);
  - `.env.example`;
  - `docs/deploy-checklist.md`;
  - `apps/api/test/environment.test.ts`, `apps/api/test/console-environment.test.ts`.
- Create `apps/api/src/sheets-settings.ts` (decoding the service accounts).
- Test `apps/api/test/{sheets-settings,sheets-services}.test.ts`.

**Interfaces:**

```ts
/** GOOGLE_SHEETS_SERVICE_ACCOUNTS: base64 or single-line JSON, one key or a list; each needs client_email and private_key. */
export function decodeServiceAccounts(text: string): ServiceAccountKey[] | null // null: not valid, with no part of the text kept
```

- `environment.ts` gains:
  - `GOOGLE_SHEETS_SERVICE_ACCOUNTS` (optional; transformed by `decodeServiceAccounts`; invalid stops the process with
    a message naming only the variable);
  - `SHEETS_HASH_KEY` (optional, at least 32 characters; required, and refused if shorter, whenever the accounts are set);
  - `GOOGLE_SHEETS_TEST_SERVER_URL` and `SHEETS_CHECK_INTERVAL_SECONDS` (optional; refused in production, S17).
- `console-environment.ts` gains the optional `SHEETS_HASH_KEY` only (S6), never the accounts.
- `Services` gains `google: GoogleSheets | null` (null when no accounts), `sheetsHashes: SheetsHashes | null` and
  `sheetsCheckIntervalSeconds: number`. Production builds `createRealGoogleSheets({ accounts })`; with
  `GOOGLE_SHEETS_TEST_SERVER_URL` it passes `apiBaseUrl` and a fixed `accessToken`.
- The start-up line, for the api and the worker: "Google Sheets: 2 service accounts" or "Google Sheets: not set up",
  counts only.

- [ ] **Step 1: Write the failing tests.**

```ts
it("reads a key file as base64, as single-line JSON, and a list of several as either", …)
it("refuses a value that is neither, or lacks client_email or private_key, naming the variable and never printing the value", …)
it("needs SHEETS_HASH_KEY of 32 characters when the accounts are set, and not otherwise", …)
it("refuses the test server URL and the interval in production", …)
it("lets the console read SHEETS_HASH_KEY, and never the service accounts", …)
it("builds no Google adapter without accounts, and the real one with them", …)
it("logs how many accounts were read, and nothing of them", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/api-server test -- environment sheets`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add to `docs/deploy-checklist.md`'s settings table:
  - `GOOGLE_SHEETS_SERVICE_ACCOUNTS`: api ●, worker ●, console blank, secret yes;
  - `SHEETS_HASH_KEY`: api ○, worker ○, console ○, secret yes (required with the accounts; never changed);
  - the notes of spec 14 (the Render steps, "check the log for how many service accounts were read", a second account at
    about 80 sheets, the worker may sleep, the help-text sentence about removing our address).
  - Add the two variables to `.env.example` as comments (the journeys' two test variables are not in it).
- [ ] **Step 4: Run the api tests and the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): the Google Sheets settings: service accounts and the hash key`.

## Task 5: The contracts

**Files:**

- Create: `packages/contracts/src/sheets/{index,sheet-link,sheet-connection,sheet-rows,sheet-inputs,events}.ts`.
- Modify: `packages/contracts/package.json` only if the wildcard export does not cover `sheets`.
- Test: `packages/contracts/test/sheets/{sheet-link,sheet-inputs}.test.ts`.

**Interfaces** (inputs `z.strictObject`, outputs `z.object`, `datetime` is `z.iso.datetime()`; from
`@travel-crm/contracts/sheets`):

- **Link (S3):** `sheetLink`, a string that parses to `{ spreadsheetId: string; gid: string | null }`. Only
  `https://docs.google.com/spreadsheets/d/<id>/…` with an id of letters, digits, `-` and `_`, 20 to 80 characters; the
  `gid` from `#gid=` or `?gid=`; no credentials, no port. The URL is never fetched. A refusal's message is the code
  `SHEET_LINK_INVALID`.
- **Lists** (each with its Zod enum and inferred type, e.g. `SheetStatus`, `AttentionState`, `SheetField`):
  - `sheetStatuses = ["connecting","running","paused","lost_access","tab_missing","columns_missing","needs_manager","disconnected"]`;
  - `attentionStates = ["lost_access","tab_missing","columns_missing","needs_manager"]`;
  - `sheetSteps = ["share","tab","columns","existing","done"]`;
  - `existingRowChoices = ["only_new","check"]`;
  - `sheetRowStatuses = ["before_connect","pending","added","merged","duplicate","not_added","erased"]`;
  - `sheetProblemReasons = ["no_name","no_contact","notes_too_long","blocked","erased"]`;
  - `sheetFields`, the lead import's fields less `stage` (22); `sheetValueFields = ["owner"]`.
- **Inputs:**
  - `beginSheetInput = { link: sheetLink }`;
  - `sheetIdInput = { sheetId: recordId }`;
  - `verifySheetInput = { sheetId, valuesOf?: headerKey }`;
  - `chooseSheetTabInput = { sheetId, tabGid: string }`;
  - `matchSheetColumnsInput = { sheetId, columns: { headerKey: string; field: sheetField | null }[] (≤50),
    values: { value: string (≤4000); target: recordId | null }[] (≤5000) }`;
  - `chooseExistingInput = { sheetId, existingRows: existingRowChoice }`;
  - `recheckSheetInput = { sheetId, tabGid?: string }`;
  - `hideProblemInput = { sheetId, rowId: recordId }`;
  - `sheetProblemsInput = { sheetId, after?: recordId, limit: 1..100 default 50 }`.
- **Outputs:**
  - `sheetListItem = { id, sheetTitle, tabTitle, status, attentionState | null, lastCheckedAt | null }`;
  - `sheetList = { items, limit: int, serviceAccountEmails: string[], configured: boolean }`;
  - `sheetDetail`:
    - `{ id, sheetTitle, tabTitle, tabGid, status, step, attentionState | null, attentionSince | null }`;
    - `connectedBy: { userId, name | null } | null`, `connectedAt | null`, `serviceAccountEmail`;
    - `lastCheckedAt | null`, `checkRunning`, `late`, `readOnly`, `rowsTruncated`;
    - `counts: { added, mergedIntoExisting, duplicates, couldntBeAdded }`;
    - `columns: { matched, total, newUnmatched: string[], missing: string[] }`;
    - `existingRows | null`, `existingImportId | null`, `defaultOwnerName | null`;
  - `sheetColumnsView`:
    - `{ sheetTitle, tabs: { gid, title }[], tabGid, rowCount }`;
    - `columns: { headerKey, header, samples: string[], field | null, guessedBy: "last-time" | "form" | "common-name" | "word" | null, isNew }[]`;
    - `ownerValues: { value, rows, target | null, matchedBy }[] | null`;
  - `sheetProblem = { id, rowNumber, name | null, value | null, reason: sheetProblemReason, firstSeenAt }`,
    `sheetProblemsPage = { items, nextCursor | null }`.
- **Events** (payloads hold ids): `sheetBaselineRequested = { sheetId }`, `sheetSyncRequested = { sheetId, mode: "sync-now" | "recheck" }`,
  `sheetAttention = { sheetId, state: attentionState }`, `sheetScheduleChanged = { sheetId }`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("takes a sheet link and gives its id and tab", …) // /spreadsheets/d/<id>/edit?usp=sharing#gid=123 → { id, "123" }; ?gid=7 too; no gid → null
it("refuses a link that isn't a Google Sheet, with SHEET_LINK_INVALID", …) // drive.google.com/file/d/…, http:, user@host, a port, an id of 19 or 81 characters, "../"
it("never fetches or keeps the rest of the URL", …) // the output holds only id and gid
it("refuses unknown keys in every sheet input", …)
it("lists the 22 sheet fields: the lead import's, without stage", …)
it("holds an owner value's target to a user id or null", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/contracts test -- sheets`. Expected: FAIL.
- [ ] **Step 3: Write the contracts.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(contracts): the sheet sync's links, inputs and shapes`.

## Task 6: The sheets module's core: hashes, claim, and the first check of a sheet

**Files:**

- Create, in `packages/domain/src/sheets/`: `index.ts`, `README.md`, `limits.ts`, `hashes.ts`, `dependencies.ts`,
  `connection-row.ts`, `claim.ts`, `begin.ts`.
- Modify: `packages/domain/src/kernel/` only if `DomainErrorCode` lacks a code a reason needs (the reasons use
  `VALIDATION`, `CONFLICT`, `LIMIT_REACHED`, `NOT_FOUND`); `.dependency-cruiser.cjs` (`business-modules-call-down`'s
  `from` gains `sheets`, so it never calls crm or today).
- Test: `packages/domain/test/sheets/{hashes,claim,begin}.test.ts`.
- Create `packages/domain/test/sheets/support/sheets.ts`: `aSheet(tx, overrides)`, `aSheetRow(tx, overrides)`,
  `aSheetColumn(tx, overrides)` (direct inserts), `aDeps({ accounts })` (memory Google, hashes, a 32-character key).

**Interfaces:**

```ts
// limits.ts: the numbers of Global Constraints, each named there, plus
export function sheetLimitFor(organizationId: string): Promise<number>   // today: maxSheetsPerOrganization (S8: a plan limit later changes only this)
// hashes.ts
export interface SheetsHashes {
  spreadsheetHash(spreadsheetId: string): Uint8Array;             // HMAC-SHA256(key, id)
  contactHash(kind: ContactKind, value: string): Uint8Array;      // HMAC-SHA256(key, `${kind}:${value}`) (S18)
  rekey(plainHash: Uint8Array): Uint8Array;                       // HMAC-SHA256(key, plain bytes)
}
export function createSheetsHashes(key: string): SheetsHashes
/** SHA-256 of the JSON array of the cells, each trimmed, trailing empty cells dropped (S19). */
export function rowHash(cells: readonly (string | null)[]): Uint8Array
/** A UUID made from text alone, so a retried job finds what it made. */
export function uuidFromText(text: string): string
export function accountIndexFor(connectionId: string, accountCount: number): number // SHA-256 of the id, mod count (S35)
// dependencies.ts
export interface SheetsDependencies { google: GoogleSheets | null; hashes: SheetsHashes | null }
// connection-row.ts
export interface SheetConnectionRow { /* every sheet_connection column, typed */ }
export function findSheet(tx: OrgTx, sheetId: string): Promise<SheetConnectionRow>   // NOT_FOUND when another organization's or disconnected
// claim.ts: both run inside db.withoutOrg()
export function takeSpreadsheetClaim(db: Database, organizationId: string, spreadsheetHash: Uint8Array, now: Date): Promise<{ claimId: string; created: boolean }> // SHEET_CLAIMED_ELSEWHERE
export function releaseClaimIfUnused(db: Database, organizationId: string, claimId: string): Promise<boolean> // no live connection holds it
// begin.ts
export function beginSheet(db: Database, dependencies: SheetsDependencies, access: MemberAccess, input: { spreadsheetId: string; gid: string | null }, now: Date): Promise<{ sheetId: string }>
```

- `beginSheet` is "Check the sheet" (S5), in this order:
  1. `SHEETS_NOT_SET_UP` when `google` or `hashes` is null;
  2. a new connection id, its account index, and one `describe` outside any transaction (the tab by `gid`, else the
     first grid tab), whose failures become `SHEET_NOT_SHARED` (`not_shared` and `not_found`),
     `SHEET_NOT_GOOGLE_SHEET`, `SHEET_EMPTY` (no header cell), or `SHEETS_UNAVAILABLE` (`rate_limited`,
     `unavailable`, `too_large`);
  3. `takeSpreadsheetClaim`;
  4. one transaction holding the organization row (`FOR NO KEY UPDATE`, as Add staff does) that refuses
     `SHEET_ALREADY_CONNECTED` (same spreadsheet and tab, S7) and `SHEET_LIMIT_REACHED` (S8, drafts counted), then
     inserts the draft (`connecting`, step `tab`, `claim_id`, the tab, title, locale and zone as read, and the header as
     `sheet_column` rows with `header_key` from `headerKey`, names from `nameHeaders`, `field` null);
  5. when step 4 refuses, `releaseClaimIfUnused` for a claim this call created, never for one the organization already held.
- The reasons carry no title, link or id in their message.

- [ ] **Step 1: Write the failing tests.**

```ts
// hashes.test.ts
it("hashes a row as the SHA-256 of its trimmed cells, trailing empties dropped", …) // ["a "," b","",""] and ["a","b"] alike; ["a","","b"] differs from ["a","b"]
it("keys the spreadsheet, contact and re-key hashes with the key, and kind-prefixes contacts", …) // another key differs; phone:+91… ≠ email:+91…
it("makes a UUID from text alone", …) // same text same uuid, version nibble 5
it("spreads connections over the accounts", …) // 1,000 ids over 3 accounts: each between 25% and 42%; stable per id
// claim.test.ts
it("takes a claim for the first agency and finds it theirs the second time", …) // created true then false, same claimId
it("refuses a second agency with SHEET_CLAIMED_ELSEWHERE, whose message names nothing", …)
it("lets exactly one of two agencies win a race for one spreadsheet", …) // Promise.all
it("releases a claim only when no live connection holds it", …) // two tabs of one spreadsheet: disconnecting one keeps it
// begin.test.ts
it("makes a draft from a shared sheet, with its tab, header and an account", …)
it("picks the tab the link names, else the first grid tab", …)
it("answers each failure with its reason: not set up, not shared (403 and 404), not a Google Sheet, empty, unavailable", …)
it("refuses the same spreadsheet and tab twice in one agency, and allows another tab of it", …)
it("holds the fifth sheet and refuses the sixth, drafts included, with two begins at once taking one place", …) // Promise.all at four sheets
it("releases a claim it just took when the limit refuses, and keeps one the agency already held", …)
it("keeps no title, link, id, key or cell in an error's message", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/domain test -- sheets`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the sheets tests and the import rules.** Run `pnpm run depcruise` too. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(sheets): hashes, the spreadsheet claim, and the first check of a sheet`.

## Task 7: The connect steps: tab, columns, existing rows, and confirm

**Files:**

- Create, in `packages/domain/src/sheets/`: `verify.ts`, `columns.ts`, `steps.ts`, `confirm.ts`.
- Modify: `packages/domain/src/sheets/index.ts`; `audit.json` (`actions.sheet.connected`,
  `actions.sheet.columns-changed`, `recordTypes.sheet_connection`). The reasons these tasks throw get their sentences
  together in Task 15, whose web test holds every reason to a sentence; until then the domain tests read the codes.
- Test: `packages/domain/test/sheets/{verify,columns,steps,confirm}.test.ts`.

**Interfaces:**

```ts
export interface SheetFieldLabelled { field: SheetField }
export interface VerifiedSheet extends SheetColumnsView {}
/** One Google read of the tab (up to maxSheetRows) for its rows, samples and the owner column's values (S13). */
export function verifySheet(db: Database, dependencies: SheetsDependencies, identity: Pick<Identity, "matchLeadWorkers">, access: MemberAccess, input: VerifySheetInput, now: Date): Promise<SheetColumnsView>
export function chooseSheetTab(db: Database, dependencies: SheetsDependencies, access: MemberAccess, input: ChooseSheetTabInput, now: Date): Promise<void>
export function matchSheetColumns(tx: OrgTx, access: MemberAccess, input: MatchSheetColumnsInput, context: { owners: ReadonlySet<string>; now: Date }): Promise<void>
export function chooseExistingRows(tx: OrgTx, access: MemberAccess, input: ChooseExistingInput, now: Date): Promise<void>
export function confirmSheet(db: Database, access: MemberAccess, sheetId: string, now: Date): Promise<void>
export function matchedFields(columns: readonly { field: SheetField | null }[]): { complete: boolean; missing: ("name" | "contact")[] }
```

- `verifySheet` guesses fields with `guessFields("leads", headers, remembered, { wordsInHeader: true })` (N2), the
  agency's last match for the same header first (`rememberedHeaderFields`, N3), and, for a column matched to Owner, its
  distinct values (at most 50, with rows) and `identity.matchLeadWorkers` targets. It refreshes the draft's `sheet_title`,
  `tab_title` and its columns (a new header becomes a column with `is_new` on a running sheet, off on a draft), and sets
  `touched_at`.
- `chooseSheetTab` is allowed from `tab` and `columns` of a draft (step becomes `columns`): it re-describes the tab,
  keeps `tab_gid`, and replaces the columns. A second connection to that tab is refused as `SHEET_ALREADY_CONNECTED`.
- `matchSheetColumns` is allowed from `columns`, `existing` and for a `running` sheet (Match columns again). It refuses
  `FIELD_MATCHED_TWICE` (Note excepted), `IMPORT_NEEDS_NAME_AND_CONTACT` (Name, and one of Phone, Email or Instagram),
  and `NOT_A_LEAD_WORKER`. It stores the fields, keeps the chosen owner values as `matched_by: "chosen"`, remembers the
  headers (`rememberHeaderFields`), moves a draft to `existing`, and, for a running sheet, records
  `sheet.columns-changed` (the number of columns matched, never a header) and clears `columns_missing` (Task 12).
- `chooseExistingRows` is allowed from `existing`; `confirmSheet` from `existing` with the fields complete. It sets
  `step = done`, `connected_by` and `impersonated_by` from the access, records `sheet.connected` (id, the choice, the
  number of columns matched), and publishes `sheet.baseline-requested`. A step out of turn is
  `CONFLICT`/`SHEET_NOT_READY`; a sheet of another organization or one already disconnected is `NOT_FOUND`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("guesses a Google Form's columns: Timestamp is the enquiry date, Email Address the email, Full name the name", …)
it("fills the agency's last match for a header first, as last time", …)
it("lists the owner column's values with their rows and an automatic match for each", …) // "Asha" → Asha's user id
it("keeps no sample or cell in the database", …) // sheet_column holds headers and fields only
it("moves tab to columns to existing, and refuses a step asked out of turn: SHEET_NOT_READY", …)
it("refuses a second tab already connected, a field matched twice but Note, a missing name or contact, and an owner who can't work leads", …)
it("remembers the matched headers for the next sheet and the next file import", …)
it("confirms once: step done, one sheet.connected audit entry, one baseline event", …) // a second confirm: SHEET_NOT_READY, nothing more
it("acts as the member who confirmed, with who impersonated them", …)
it("matches again on a running sheet, recording sheet.columns-changed without a header", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again, then the web's reasons and actions tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(sheets): the connect steps: tab, columns, existing rows and confirm`.

## Task 8: The baseline, the connect-time import, and the schedule's rows

**Files:**

- Create, in `packages/domain/src/sheets/`: `baseline.ts`, `schedule.ts`, `connect-import-file.ts`.
- Modify: `packages/domain/src/sheets/index.ts`.
- Test: `packages/domain/test/sheets/{baseline,schedule}.test.ts`.

**Interfaces:**

```ts
export interface SheetsJobDependencies extends SheetsDependencies {
  db: Database; files: Files; spreadsheets: Spreadsheets;
  identity: Pick<Identity, "resolveAccess" | "firstOwner" | "leadWorkers" | "matchLeadWorkers">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">; log: (line: string) => void;
}
export function baselineListener(dependencies: SheetsJobDependencies): EventListener      // "sheets.baseline" on "sheet.baseline-requested"
export function scheduleListener(dependencies: Pick<SheetsJobDependencies, "db">): EventListener // "sheets.update-schedule" on "sheet.schedule-changed"
export function hasScheduleRow(status: SheetStatus): boolean // running, lost_access, tab_missing, columns_missing, needs_manager
/** The newest rows (at most connectImportMaxRows) as a CSV in the sheet's own header names. */
export function connectImportCsv(spreadsheets: Spreadsheets, read: SheetRead): Promise<{ bytes: Uint8Array; rows: number }>
// schedule.ts: the one reader of sheet_check_schedule and sheet_spreadsheet_claim's raw SQL
export function upsertScheduleRow(db: Database, row: { sheetId: string; organizationId: string; serviceAccountIndex: number; nextCheckAt: Date }): Promise<void>
export function removeScheduleRow(db: Database, sheetId: string): Promise<void>
export function claimDueSheets(db: Database, input: { now: Date; accountIndex: number; limit: number; claimSeconds: number }): Promise<{ sheetId: string; organizationId: string }[]>
export function finishScheduledCheck(db: Database, input: { sheetId: string; nextCheckAt: Date | null }): Promise<void> // null removes the row
```

- **The baseline** acts only on a `connecting` sheet at step `done` (S14, section 7). It:
  1. reads the tab from row 2 to `maxSheetRows` with one `readRows`, outside any transaction;
  2. writes every row as `before_connect` (hash and occurrence only, S19) 1,000 to a transaction, with
     `skipDuplicates` so a rerun carries on;
  3. with `existing_rows = check` and rows present, writes the newest `connectImportMaxRows` as a CSV and calls
     `startImportFromBytes` (N3) with `importId = uuidFromText("sheet-import:" + sheetId)`, `sourceSheetId`, and the
     connector as `startedBy`;
  4. in one transaction sets the cursor to the tab's last row (1 for a header-only sheet), `rows_seen`,
     `header_hash`, `connected_at`, `last_checked_at`, `last_ok_at`, `last_full_read_at`, `status = running`, and
     publishes `sheet.schedule-changed`.
  - A permanent Google answer (`not_shared`, `not_found`, `not_a_sheet`, `tab_missing`) sets `status = lost_access`
    through Task 12's `enterAttention` (S21); `rate_limited`, `unavailable` and `too_large` fail the job for its retry.
- **The schedule listener** writes `sheet_check_schedule` in `db.withoutOrg()` after the connection's own transaction:
  a row (`next_check_at` now, or kept when one exists) for a status that `hasScheduleRow`, none and a delete for the
  rest. Running it twice is the same.
- `claimDueSheets` is S36's query, `SELECT … WHERE next_check_at <= $now AND (claimed_until IS NULL OR claimed_until <
  $now) AND service_account_index = $account ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT $n`, and sets
  `claimed_until` in the same transaction.

- [ ] **Step 1: Write the failing tests.**

```ts
it("records every row present as before_connect, with its hash and occurrence, and puts the cursor after the last row", …) // 2,500 rows: three transactions
it("records two identical rows as occurrences 1 and 2", …)
it("starts no import for 'only new rows', and one named by the sheet for 'also check'", …)
it("writes the newest 10,000 rows of a bigger sheet as the import's CSV, in the sheet's header names", …)
it("reads a cell starting with = back as the cell, not a formula", …) // the writer's apostrophe, dropped once by the reader
it("makes one import however often it is run", …) // importId from the sheet id
it("handles a header-only sheet: cursor 1, no import offered, running", …)
it("moves the sheet to running and publishes sheet.schedule-changed once", …)
it("ends a permanent Google answer in lost_access, and fails the job for a busy Google", …)
it("does nothing for a sheet no longer at its step", …)
it("writes a schedule row for running, lost_access, tab_missing, columns_missing and needs_manager, and none for connecting, paused and disconnected", …)
it("gives the same row when run twice, and removes it when the sheet is disconnected", …)
it("claims the most overdue first, skips a claimed row and another account's, and holds the claim for five minutes", …) // SKIP LOCKED: two claimers get disjoint sets
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** `schedule.ts` is the only file that names the exempt tables in SQL.
- [ ] **Step 4: Run them again and `pnpm --filter @travel-crm/domain lint`.** Expected: PASS, the raw-SQL guard included.
- [ ] **Step 5: Commit.** Message: `feat(sheets): the baseline, the connect-time import, and the check schedule`.

## Task 9: The engine: which rows are new

**Files:**

- Create, in `packages/domain/src/sheets/`: `read-plan.ts`, `numbered-rows.ts`, `ledger.ts`, `header-match.ts`.
- Modify: `packages/domain/src/sheets/index.ts`.
- Test: `packages/domain/test/sheets/{read-plan,numbered-rows,ledger,header-match}.test.ts`.

**Interfaces:**

```ts
// read-plan.ts
export type CheckMode = "scheduled" | "sync-now" | "recheck";
export interface ReadPlan { fromRow: number; full: boolean; reason: "sync-now" | "recheck" | "daily" | "window" }
/** S18, S11: a normal check reads from the cursor less lookbackRows (or the first pending row, if earlier); the rest read from row 2. */
export function decideRead(input: { connection: Pick<SheetConnectionRow, "cursorRow" | "lastFullReadAt">; mode: CheckMode; now: Date; timeZone: string; firstPendingRow: number | null }): ReadPlan
/** After a windowed read: a full read is needed when the header changed or the sheet has fewer rows than the cursor. */
export function followUpFullRead(connection: Pick<SheetConnectionRow, "cursorRow" | "headerHash">, read: SheetRead): "header-changed" | "rows-deleted" | null
/** The first check after 03:00 on a new local day is due its full read. */
export function dailyReadDue(lastFullReadAt: Date | null, now: Date, timeZone: string): boolean
// numbered-rows.ts
export interface ReadRow { rowNumber: number; cells: readonly string[]; hash: Uint8Array; occurrence: number }
/** Skips all-blank rows; numbers identical rows 1, 2, … within the rows given (S10). */
export function numberRows(rows: SheetRead["rows"]): ReadRow[]
// ledger.ts
export type LedgerStatus = SheetRowStatus;
export interface LedgerEntry { id: string; status: LedgerStatus; rowNumber: number }
/** Looks up (hash, occurrence) in chunks of 1,000, the plain hash and the re-keyed one; the map's key is `${hex}:${occurrence}`. */
export function lookUpLedger(tx: OrgTx, connectionId: string, rows: readonly ReadRow[], hashes: SheetsHashes | null): Promise<Map<string, LedgerEntry>>
export function ledgerKey(hash: Uint8Array, occurrence: number): string
/** S9: before_connect, added, merged, duplicate and erased are known; pending and not_added are read again. */
export function isKnown(entry: LedgerEntry | undefined): boolean
/** S31: marks resolved the unresolved not_added rows, and deletes the pending ones, whose hash the read no longer holds. */
export function clearVanishedRows(tx: OrgTx, connectionId: string, input: { read: readonly ReadRow[]; fromRow: number; full: boolean }, now: Date): Promise<{ resolved: number; dropped: number }>
// header-match.ts
export interface SheetColumnRow { headerKey: string; header: string; field: SheetField | null; isNew: boolean }
export interface HeaderMatch { matches: ColumnMatches; missing: SheetColumnRow[]; unseen: string[] /* headers with no column row */; positionOf: ReadonlyMap<string, number> }
/** S11: columns are found by header key in the row read, never by position. */
export function matchHeader(header: readonly string[], columns: readonly SheetColumnRow[]): HeaderMatch
/** S15: a missing matched column stops the check only when it leaves no name, or no phone, email or Instagram. */
export function stopsTheCheck(match: HeaderMatch, columns: readonly SheetColumnRow[]): { columns: string[] } | null
```

- [ ] **Step 1: Write the failing tests.**

```ts
// read-plan.test.ts
it("reads from the cursor less 100 rows, never before row 2", …) // cursor 5 → 2; cursor 300 → 200
it("reads from the first pending row when it is earlier than the window", …)
it("reads the whole tab for Sync now and Check again", …)
it("makes the first check after 03:00 in the agency's zone each day a full read, once", …) // Asia/Kolkata and America/Los_Angeles; 02:59 not, 03:00 yes; a second check the same day no
it("asks for a full read when the header changed or the sheet has fewer rows than the cursor", …)
// numbered-rows.test.ts
it("numbers two identical rows 1 and 2, and a lone row 1", …)
it("skips a row of only blanks and keeps the others' row numbers", …)
// ledger.test.ts
it("finds a known row whatever row it moved to: sorted, inserted above or deleted above", …) // same set of hashes, new row numbers
it("treats before_connect, added, merged, duplicate and erased as known, and pending and not_added as to be read again", …)
it("finds an erased row by its re-keyed hash", …)
it("looks up 20,000 rows in chunks of 1,000 hashes", …) // 20 statements, each = ANY on sheet_row_hash
it("marks a vanished not_added row resolved at the read that covers its place, and drops a vanished pending row", …)
it("leaves a not_added row alone when the read does not cover its place", …) // windowed read from row 300, row 12 untouched
// header-match.test.ts
it("finds a matched column by its header after one is inserted before it", …) // Review Focus 5: positions shift, fields don't
it("names a repeated header (2) and a blank one by its letter, as the reader does", …)
it("stops the check only when a missing column leaves no name or no contact", …) // Budget gone: no stop; Mobile No and Email gone: stop naming both
it("lists a header with no column row as unseen", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** `lookUpLedger` uses one `= ANY` query per chunk on `sheet_row_hash`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(sheets): the engine: the read window, row hashes, the ledger and header matching`.

## Task 10: crm reads a sheet row into a lead, and plans the rows

**Files:**

- Create, in `packages/domain/src/crm/lead-sheets/`: `index.ts`, `sheet-rows.ts`, `sheet-plan.ts`, `sheet-lookups.ts`.
- Create in `packages/domain/src/sheets/`: `origin.ts`, `fingerprints.ts`.
- Modify: `packages/domain/src/crm/index.ts` (its export of the sheet listener, Task 11).
- Test: `packages/domain/test/crm/lead-sheets/{sheet-rows,sheet-plan}.test.ts`,
  `packages/domain/test/sheets/fingerprints.test.ts`.

**Interfaces:**

```ts
// sheets/origin.ts
export function sheetOrigin(connection: Pick<SheetConnectionRow, "sheetTitle" | "tabTitle" | "sheetTimeZone" | "sheetLocale">): SheetOrigin // detail "Goa Diwali campaign · Form responses 1" cut to 120; monthFirstDates true for en_US-style locales
export function monthFirstLocale(locale: string): boolean
// sheets/fingerprints.ts: the sheets' own half of S23 step 4 (crm unions it with earlierFingerprints, so imports never calls sheets)
export function earlierSheetFingerprints(tx: OrgTx, fingerprints: readonly Uint8Array[], hashes: SheetsHashes | null): Promise<Map<string, Date>> // by hex, when first seen
// crm/lead-sheets/sheet-rows.ts
export interface SheetLeadContextInput { header: readonly string[]; columns: readonly SheetColumnRow[]; match: HeaderMatch; ownerTargets: ReadonlyMap<string, string | null>; defaultOwnerUserId: string; origin: SheetOrigin; today: CalendarDate; agencyTimeZone: string }
export function sheetLeadContext(input: SheetLeadContextInput): LeadRowContext // origin set; stage "new", budget basis for everyone
export function readSheetRow(row: ReadRow, context: LeadRowContext): LeadRowReading // cells "" → null
// crm/lead-sheets/sheet-plan.ts
export type SheetRowDecision =
  | { kind: "pending" }
  | { kind: "not_added"; reasons: SheetProblemReason[]; exampleName: string | null; exampleValue: string | null }
  | { kind: "duplicate"; fingerprint: Uint8Array }
  | { kind: "save"; reading: Extract<LeadRowReading, { kind: "enquiry" }>; fingerprint: Uint8Array }
export interface SheetPlanInput {
  row: ReadRow; reading: LeadRowReading; ledger: LedgerEntry | undefined;
  mode: CheckMode;                                         // sync-now and recheck end the wait of S29
  isErased(contacts: LeadRowContacts): boolean;
  isBlocked(contacts: LeadRowContacts): boolean;
  earlier: ReadonlyMap<string, Date>;                      // fingerprints already added anywhere (S23.4)
}
/** S23 in order: erased, blocked, same as a row added anywhere, then save (the save path makes it a repeat enquiry, a Returning lead, or new). Rows in one call meet each other (S24). */
export function planSheetRows(rows: readonly SheetPlanInput[]): SheetRowDecision[]
// crm/lead-sheets/sheet-lookups.ts
export function lookUpSheetRows(tx: OrgTx, readings: readonly LeadRowReading[], hashes: SheetsHashes | null): Promise<{ lookups: LeadLookups; isErased(c: LeadRowContacts): boolean; earlier: Map<string, Date> }>
```

- The reason codes of a row are `no_name`, `no_contact`, `notes_too_long` (B24's that apply to one row), `blocked`
  and `erased` (S27). A row that has neither a name nor a usable contact is `pending` the first time it is read (S29)
  and `not_added` the second, or at once for `sync-now` and `recheck`.
- `lookUpSheetRows` reuses 1.3's `lookUpLeadRows`, `earlierFingerprints(tx, "leads", …, NO_IMPORT)` (the nil UUID) and
  `earlierSheetFingerprints`, each one query per kind for the whole check, and looks up the tombstones of
  `sheet_erased_contact` by `= ANY` on the contacts' `contactHash`.

- [ ] **Step 1: Write the failing tests.**

```ts
// sheet-rows.test.ts
it("reads a Google Form's row: name, phone, email, destination and a Timestamp with its time as the enquiry moment", …) // "19/10/2026 14:32:10" Asia/Kolkata → 2026-10-19T09:02:10.000Z
it("sources the lead Google Sheet, with 'Goa Diwali campaign · Form responses 1' and their source cell after it, cut to 120", …)
it("keeps a phone's leading zero as shown and reads it as +919876543210", …) // "098765 43210"
it("does not trust an ambiguous date from a month-first sheet: the lead is added now, the cell in the note", …) // Review Focus 1: en_US "10/12/2026 14:32:10" → createdAt null, note "Enquiry date: 10/12/2026 14:32:10"
it("still reads an unambiguous date from a month-first sheet", …) // "10/25/2026 …" → 25 Oct
it("takes a date only as the start of that day in the agency's zone, and a date in the future as now", …)
it("keeps several question columns as 'Do you need visas?: Yes' lines in the note", …)
it("gives the owner column's target, else the agency Owner, and the stage always New", …)
it("reads a Sheets error value in a phone cell as no phone, not as a contact", …) // the cell reaches here empty
// sheet-plan.test.ts: S23 case by case
it("leaves a row of an erased customer out as 'erased', showing no name", …)
it("leaves a blocked contact out as 'blocked', and adds it at the next read once unblocked", …) // mode sync-now, ledger not_added, isBlocked false → save
it("leaves out a row whose fingerprint was added by another sheet, a file import or earlier in this check, as a duplicate", …)
it("saves a row for a person with an open lead, to become a repeat enquiry, and one with only closed leads, to become Returning", …) // the plan says save; the save path decides
it("makes the same fingerprint equal for a sheet row and the same row in a file", …) // rowFingerprint("leads", fingerprintValues) from both readings
it("holds a row without a name or contact one check, then lists it with its reason", …) // pending, then not_added [no_contact]; at once for sync-now
it("lists a row with notes over 4,000 characters at once", …)
it("meets rows of one check against each other: the later row of a person is saved, the identical one a duplicate", …)
// fingerprints.test.ts
it("finds a fingerprint in the sheets' ledger, plain or re-keyed, and not an unresolved problem's", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** by N6's `LeadRowContext.origin`, the pure functions first.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): read a sheet row into an enquiry and plan the rows of a check`.

## Task 11: The check

**Files:**

- Create, in `packages/domain/src/crm/lead-sheets/`: `check-lead-sheet.ts`, `sheet-save.ts`, `sheet-notices.ts`.
- Create in `packages/domain/src/sheets/`: `connector-access.ts`, `check-close.ts`, `account-holds.ts`.
- Modify: `packages/domain/src/crm/index.ts` (`export { checkLeadSheet, checkLeadSheetListener } from "./lead-sheets/index.js"`);
  `audit.json`, `notifications.json`, `kinds.ts` (`lead.sheet-added`).
- Test: `packages/domain/test/crm/lead-sheets/{check-lead-sheet,sheet-save,sheet-notices}.test.ts`.

**Interfaces:**

```ts
// sheets/connector-access.ts: importerAccess's twin for a connection, built on N3's jobMemberAccess
export function connectorAccess(dependencies: Pick<SheetsJobDependencies, "identity" | "subscriptions">, connection: SheetConnectionRow, required: readonly Permission[]): Promise<{ access: MemberAccess } | { failure: ImportFailureReason }>
// crm/lead-sheets/check-lead-sheet.ts
export interface AccountHolds { holdUntil(accountIndex: number, until: Date): void; isHeld(accountIndex: number, now: Date): boolean }
export function createAccountHolds(): AccountHolds // S8: one per worker process, shared by the dispatcher and the checks
export interface CheckLeadSheetDependencies extends SheetsJobDependencies { holds: AccountHolds; checkIntervalSeconds: number }
export interface CheckOutcome { result: "checked" | "skipped" | "yielded" | "failed"; nextCheckInSeconds: number; keepSchedule: boolean }
export function checkLeadSheet(dependencies: CheckLeadSheetDependencies, input: { organizationId: string; sheetId: string; mode: CheckMode }, now?: () => Date): Promise<CheckOutcome>
export function checkLeadSheetListener(dependencies: CheckLeadSheetDependencies): EventListener // "crm.check-lead-sheet" on "sheet.sync-requested", concurrency 4
// crm/lead-sheets/sheet-save.ts
/** One transaction of at most rowsPerTransaction decisions (S25): holds the connection, heartbeats, yields to an import that is adding, saves, writes outcomes and counters. */
export function saveSheetBatch(context: SaveBatchContext, decisions: readonly { row: ReadRow; decision: SheetRowDecision }[]): Promise<"more" | "yielded">
// crm/lead-sheets/sheet-notices.ts
/** S32: the owners whose candidate rows in this check number more than 5 get one lead.sheet-added; the rest got the usual notices. */
export function ownersToSummarise(candidates: ReadonlyMap<string, number>): ReadonlySet<string>
export function noticeSheetOwners(tx: OrgTx, access: MemberAccess, input: { sheetId: string; sheetTitle: string; counts: ReadonlyMap<string, number>; sourceEventId: string }): Promise<void>
```

- **The order of a check** (S17-S32, section 7, rulings S2, S9-S12):
  1. **Claim** (one transaction on the connection, `FOR NO KEY UPDATE`): do nothing (`skipped`) when the sheet is not
     `running`, `check_started_at` is under five minutes old (except for `sync-now`/`recheck` at the same moment),
     `hold_until` is in the future, or an import is adding (`isAnyImportAdding`, S26); resolve the connector with
     `connectorAccess` (`leads:create`, `leads:assign`) and, when they are gone, enter `needs_manager` (Task 12), or
     when the agency can't change (S44) read nothing and keep the cursor; set `check_started_at`.
  2. **Read** Google outside any transaction (`decideRead`, then `followUpFullRead` for one more full read).
     Failures go to Task 12's `handleReadFailure`. A holds-aware `rate_limited` records `AccountHolds`.
  3. **Header** (`matchHeader`, `stopsTheCheck`): a gap enters `columns_missing` and consumes no row; otherwise new
     unseen headers are added as `is_new` columns, and a changed `header_hash` is stored.
  4. **Plan** everything new: `numberRows`, `lookUpLedger`, `readSheetRow`, `lookUpSheetRows`, `planSheetRows`,
     `clearVanishedRows`.
  5. **Save** in transactions of 50 (`saveSheetBatch`): each re-reads its rows' blocked contacts and fingerprints (the
     rules again), saves with `saveEnquiry(tx, access, enquiry, now, { from: "import", ownerUserId, stage: "new",
     createdAt, notify })` where `notify` is `"each"` for an owner with at most 5 candidates and `"none"` otherwise, and
     writes each outcome to `sheet_row` (`added`/`merged` with lead, person and fingerprint; `duplicate`; `not_added`;
     `pending`) with the counters, in the same transaction. A unique violation runs the transaction once more.
  6. **Close** (`check-close.ts`, one transaction): `last_checked_at`, `last_ok_at`, `consecutive_failures = 0`, the
     cursor (the tab's last row, unless the check yielded), `rows_seen`, `check_started_at = null`, `hold_until = null`,
     the full-read time, a refreshed `sheet_title` on a full read, a recovery from `lost_access` (Task 12), and
     `noticeSheetOwners`.
- `nextCheckInSeconds` is `checkIntervalSeconds`, or the hold when Google was busy.

- [ ] **Step 1: Write the failing tests.**

```ts
// check-lead-sheet.test.ts (the memory Google and the real database)
it("adds a row appended to the sheet as a lead of the connector's choosing: source Google Sheet, New, the owner column's owner", …)
it("does nothing when the sheet isn't running, a check started under five minutes ago, or the account is held", …)
it("does nothing, and tries again, while an import of the agency is adding", …)
it("stops between batches when an import starts adding, leaving the cursor and the rest for the next check", …) // S12
it("reads nothing and keeps its cursor while the agency is read-only, then adds the waiting rows when it is active again", …) // S44
it("reads from the cursor less 100 rows, so a row inserted just above the end is met", …)
it("adds nothing for a sort, an insert in the middle or a deleted row, and a full read finds only the inserted one", …) // Journey 4 at domain level
it("adds each row once when two checks overlap or one is retried after a crash", …) // Review Focus 4: Promise.all of two checks; a throw after batch 1, then a rerun
it("holds an unfinished row one check, then lists it; the fixed row adds one lead and clears the line", …) // Review Focus 3
it("reads an edited row as a new row: a repeat enquiry, never a second lead", …) // S28; the old row's hash gone, the new one a repeat enquiry on the open lead
it("makes a later row for the same person a repeat enquiry on the lead the earlier row made", …) // S24, one check
it("makes a new lead marked Returning for a person whose leads are all closed", …)
it("leaves a person already at an open lead, added by hand, with one lead and a repeat enquiry", …)
it("counts added, added to an existing lead and duplicates exactly, in the rows' own transactions", …)
it("stops without consuming a row while a needed column is missing, then adds the waiting rows when it returns", …) // Review Focus 5; columns_missing then running
it("finds a matched column by its header after a column is inserted in front of it", …)
it("reads the whole tab once the header changed", …)
it("skips a million-row sheet's excess and a 10 MB cell without holding them", …) // S33 with the memory Google: ≤ 20,000 rows read, worker heap growth < 150 MB
// sheet-save.test.ts
it("saves 50 rows to a transaction, holding the connection first, and writes each outcome and the counters in it", …)
it("applies the rules again: a contact blocked since the plan is left out", …)
it("runs a batch again once on a unique violation", …)
it("never saves a row with a known outcome again", …)
// sheet-notices.test.ts
it("sends up to 5 leads' usual notices to their owner and one 'N new leads from X are now yours' for more", …) // 5 → five notices (New lead assigned / Repeat enquiry); 6 → one lead.sheet-added, linking the Leads list filtered by source Google Sheet
it("tells nobody about their own leads, and the summary names no customer", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `check-lead-sheet.ts` to the order above; each step is its own function in its own file.
- [ ] **Step 4: Run the crm and sheets tests and the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): check a lead sheet: read the window, plan the rows and add them 50 at a time`.

## Task 12: Attention, lost access, and the controls

**Files:**

- Create, in `packages/domain/src/sheets/`: `attention.ts`, `read-failure.ts`, `controls.ts`, `take-over.ts`, `problems.ts`.
- Modify: `packages/domain/src/sheets/index.ts`; `audit.json` (`actions.sheet.{paused,resumed,taken-over,disconnected,access-lost,access-restored,tab-missing,columns-changed,problem-hidden}`);
  `notifications.json`, `kinds.ts` (`sheet.needs-attention`); `errors.json` (`SHEET_BUSY`).
- Test: `packages/domain/test/sheets/{attention,read-failure,controls,take-over,problems}.test.ts`.

**Interfaces:**

```ts
// attention.ts
/** Records the change into an attention state (S45): status, attention_since, one audit entry by the system actor, sheet.attention, sheet.schedule-changed. False when already in that state. */
export function enterAttention(tx: OrgTx, input: { sheet: SheetConnectionRow; state: AttentionState; now: Date }): Promise<boolean>
/** Back to running after a check succeeds (S39): an audit entry, no notice. */
export function leaveAttention(tx: OrgTx, sheet: SheetConnectionRow, now: Date): Promise<void>
export function attentionListener(dependencies: Pick<SheetsJobDependencies, "identity">): EventListener // "sheets.notify-attention" on "sheet.attention"
// read-failure.ts
/** S37, S39, S40: a 429 or a busy Google ends the check with no fault and a hold; the third failure in a row, or any from Sync now and Check again, is lost_access; a missing tab is checked by describe and then tab_missing. */
export function handleReadFailure(dependencies: CheckLeadSheetDependencies, sheet: SheetConnectionRow, error: GoogleSheetsError, mode: CheckMode, now: Date): Promise<CheckOutcome>
// controls.ts
export function pauseSheet(tx: OrgTx, access: MemberAccess, sheetId: string, now: Date): Promise<void>
export function resumeSheet(tx: OrgTx, access: MemberAccess, sheetId: string, now: Date): Promise<void>
export function disconnectSheet(db: Database, access: MemberAccess, sheetId: string, now: Date): Promise<void> // S42, then releaseClaimIfUnused
export function requestSyncNow(tx: OrgTx, access: MemberAccess, sheetId: string, now: Date): Promise<void> // SHEET_BUSY within 30 s of the last check or while one runs
export function recheckSheet(db: Database, dependencies: SheetsJobDependencies, access: MemberAccess, input: RecheckSheetInput, now: Date): Promise<void> // Check again / Use this tab
// take-over.ts
export function takeOverSheet(tx: OrgTx, access: MemberAccess, sheetId: string, now: Date): Promise<void>
// problems.ts
export function sheetProblems(tx: OrgTx, input: SheetProblemsInput): Promise<SheetProblemsPage>   // 50 a page from sheet_row_problems, by row number
export function hideProblem(tx: OrgTx, access: MemberAccess, input: HideProblemInput, now: Date): Promise<void>
```

- **Lost access:** the first failed scheduled check only counts; the third in a row, or one from Sync now or Check again,
  enters `lost_access`. Checks go on at the normal pace, so sharing again fixes it within two minutes; a success leaves
  it with an audit entry and no notice. A notice goes only on entering a state, to the agency Owner (`firstOwner`) with
  `sourceEventId` the `sheet.attention` event's id: the same state twice notifies once, leaving and re-entering again.
- **Pause** keeps the cursor and removes the schedule row (through `sheet.schedule-changed`); **Resume** continues from
  the cursor. **Disconnect** deletes the sheet's ledger, columns and value matches in the same transaction, keeps the
  connection with its counters, records `sheet.disconnected` with the counters and no title, and releases the claim if no
  other live connection holds it. Pause, Resume and Disconnect are open while read-only (S44).
- **Check again** (`recheckSheet`, which publishes `sheet.sync-requested` with mode `recheck`) tries at once for `lost_access` and `tab_missing`; for a sheet with no `connected_at`
  (S21) it publishes `sheet.baseline-requested` again; with a `tabGid` it makes that the sheet's tab, keeping rows seen.
- **Take over** makes the caller the connector (one audit entry), clears `needs_manager`, and the waiting rows are added
  at the next check. **Hide** marks a problem resolved by hand (`sheet.problem-hidden`).

- [ ] **Step 1: Write the failing tests.**

```ts
// read-failure.test.ts
it("counts a first and second scheduled 403 without alarming, and enters lost_access on the third", …)
it("enters lost_access at once on a failure from Sync now or Check again", …)
it("holds the account for Retry-After on a 429, 60 seconds when absent, doubling to 10 minutes while it keeps happening, with no fault and no state change", …) // S37; AccountHolds
it("keeps Last checked at the last good time on a timeout, a 5xx or a network error", …)
it("finds a renamed tab by its gid and carries on, and enters tab_missing when the gid is gone", …) // S40
// attention.test.ts
it("tells the Owner once however many checks fail, and again after the sheet recovers and fails again", …) // Journey 6 at domain level: 3 failures → 1 notice; 10 more → still 1; share again → running; fail again → 2
it("tells the Owner even when someone else connected the sheet, and not the connector twice", …)
it("recovers to running with an audit entry and no notice", …)
it("enters columns_missing and needs_manager the same way", …)
it("enters needs_manager when the connector is no longer a member or lost leads:create or leads:assign, once", …) // S34
// controls.test.ts
it("refuses Sync now within 30 seconds of the last check or while one runs, with SHEET_BUSY", …)
it("publishes sheet.sync-requested once for a Sync now (mode sync-now), and reads the whole tab", …)
it("pauses and resumes from the cursor, so rows added meanwhile are added on resume", …)
it("disconnects: ledger, columns and value matches deleted, counters kept in the audit entry, claim released unless another tab holds it", …)
it("connects again after a disconnect and asks about the rows again, adding nothing twice", …)
it("opens Pause, Resume and Disconnect while the agency is read-only, and refuses Sync now", …)
it("rechecks a lost sheet at once and a sheet with a missing tab on a chosen tab, keeping rows seen", …)
// take-over.test.ts
it("adds the rows that waited after Take over", …) // Review Focus 5 (connector removed → needs_manager → Take over → next check adds)
it("makes the caller the connector with one audit entry", …)
// problems.test.ts
it("lists the unresolved problems by row number with their reason, name or value, and first seen, 50 a page", …)
it("hides a problem by hand and drops resolved ones after 7 days", …) // the sweep is Task 14: here only resolved_at is set
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again and the web's reasons, actions and kinds tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(sheets): lost access and the other attention states, and pause, disconnect and take over`.

## Task 13: The dispatcher, the check job, and catching up after sleep

**Files:**

- Create, in `packages/domain/src/sheets/`: `dispatch.ts`, `check-job.ts` (`AccountHolds` is Task 11's).
- Modify:
  - `packages/domain/src/jobs/{events,worker}.ts` (`concurrency?: number` on `JobHandler` and `EventListener`, passed
    to `runner.work`, S4), `packages/domain/src/jobs/README.md`;
  - `packages/domain/src/sheets/index.ts`;
  - `apps/api/src/worker-jobs.ts`, `apps/api/src/worker.ts`;
  - `apps/api/test/worker.test.ts`.
- Test: `packages/domain/test/sheets/{dispatch,check-job}.test.ts`, `packages/domain/test/jobs/concurrency.test.ts`.

**Interfaces:**

```ts
export const SHEETS_DISPATCH_QUEUE = "sheets.dispatch-checks";
export const SHEETS_CHECK_QUEUE = "sheets.check";
/** S36: for each account not held, claims at most maxReadsPerMinutePerAccount due sheets, most overdue first, and queues one sheets.check each. */
export function dispatchDueChecks(dependencies: { db: Database; queue: JobQueue; accounts: number; holds: AccountHolds }, now: Date): Promise<{ queued: number; byAccount: Record<number, number> }>
export function sheetsDispatchSchedule(dependencies: DispatchDependencies): ScheduledJob // every minute, "* * * * *", Asia/Kolkata
export function sheetsCheckHandler(dependencies: CheckLeadSheetDependencies): JobHandler // queue "sheets.check", concurrency 4
```

- The job's data is `{ sheetId, organizationId }` and is sent with `expireInSeconds: 3600`, so a backlog of 20,000 rows
  is not retried at 15 minutes. The handler checks the ids are UUIDs (an `ownMessage` error otherwise), runs
  `checkLeadSheet(…, mode "scheduled")`, then `finishScheduledCheck` with `now + nextCheckInSeconds`, or `null` when
  the connection is gone or no longer needs a row (S19).
- `worker-jobs.ts` gains, from `WorkerJobDependencies`' new `google`, `sheetsHashes`, `spreadsheets`, `subscriptions`,
  `holds` and `checkIntervalSeconds`: `baselineListener`, `scheduleListener`, `attentionListener`,
  `checkLeadSheetListener`, the dispatch schedule and the check handler, only when `google` is set.

- [ ] **Step 1: Write the failing tests.**

```ts
// dispatch.test.ts
it("queues one sheets.check for each due sheet, ids only", …) // job data { sheetId, organizationId }
it("queues the most overdue first, and at most 50 per account per tick", …) // 120 due, one account: 50, then 50, then 20 on three ticks
it("queues nothing for a sheet claimed under five minutes ago, and again once the claim lapses", …)
it("skips an account that is held until the hold ends, and carries on with the others", …)
it("finds every sheet overdue after the worker slept, and queues them within the budget over the next ticks", …) // no replay of missed ticks needed
it("reads every row since the cursor on the next check after a sleep of an hour", …) // Review Focus 4: 40 rows appended over an hour, no check; one check adds all 40, once
it("keeps the interval at 120 seconds, and stretches it past the budget with no sheet starved", …) // 120 sheets on one account: every sheet checked within 3 ticks
// check-job.test.ts
it("runs a check and sets the next time 120 seconds on, clearing the claim", …)
it("removes the schedule row when the sheet is disconnected, paused or gone", …)
it("rejects job data that is not two UUIDs without reading anything", …)
it("puts no title, link or cell in the job's data or in the error of a failed one", …)
// concurrency.test.ts
it("passes a handler's and a listener's concurrency to the runner", …) // the memory runner records it
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the three files, the jobs change, and `worker-jobs.ts`.
- [ ] **Step 4: Run the domain and `apps/api` worker tests and the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(worker): dispatch sheet checks every minute, four at a time, and catch up after sleep`.

## Task 14: Erasure, the sweep, the purge, and the demo

**Files:**

- Create:
  - `packages/domain/src/sheets/{erasure,sweep}.ts`;
  - `packages/domain/src/crm/customer-contacts.ts`;
  - `packages/domain/src/platform/sheets-sweep.ts`.
- Modify:
  - `packages/domain/src/crm/index.ts` (`customerContacts`);
  - `packages/domain/src/platform/{erase-customer,erasure,failed-jobs,index}.ts`, `platform/README.md`;
  - `apps/api/src/console-jobs.ts`, `apps/api/src/console-environment.ts` (already, Task 4);
  - `apps/web/src/console/jobs/platform-queues.ts`;
  - `docs/adr/0031-google-sheets-sync.md`.
- Test: `packages/domain/test/sheets/{erasure,sweep}.test.ts`; extend `packages/domain/test/platform/erasure.test.ts`,
  `apps/api/test/console-jobs.test.ts`, `apps/web/test/console/jobs/platform-queues.test.ts`.

**Interfaces:**

```ts
export interface ErasedContacts { phones: readonly string[]; emails: readonly string[]; instagramHandles: readonly string[] } // as stored: E.164, lower case, no @
export function customerContacts(tx: PlatformTx, subject: CustomerSubject): Promise<ErasedContacts> // read before eraseCustomer empties them
/** S43. Runs in the erasure's platform transaction. */
export function withdrawSheetRows(tx: PlatformTx, hashes: SheetsHashes | null, input: { organizationId: string; personId: string; contacts: ErasedContacts; now: Date }): Promise<{ rowsWithdrawn: number; contactsKept: number; examplesEmptied: number }>
export const SWEEP_SHEETS_QUEUE = "platform.sweep-sheets";
export function sweepSheets(tx: PlatformTx, now: Date, limit: number): Promise<{ draftsDeleted: number; problemsDropped: number; scheduleRowsDropped: number; claimsDropped: number }>
export function sheetsSweepSchedule(services: PlatformServices): ScheduledJob // hourly, "41 * * * *", Asia/Kolkata
```

- **`withdrawSheetRows`** (1) rewrites each of the person's `sheet_row` rows (by `person_id`): `raw_hash` and `fingerprint`
  become `rekey(…)`, `lead_id`, `person_id`, `example_name` and `example_value` are emptied, status `erased`; (2) writes
  each contact's `contactHash` to `sheet_erased_contact` (`skipDuplicates`), plaintext kept nowhere; (3) empties every
  `example_name` and `example_value` in the organization. When `hashes` is null and the organization has any sheet row or
  connection, it fails the job with an `ownMessage` error naming the variable (S6); with none it does nothing.
- **`sweepSheets`:** deletes drafts (`connecting`, never connected) untouched for 24 hours with their columns and value
  matches; drops `not_added` rows resolved for 7 days; drops schedule rows with no live connection; drops claims with no
  live connection older than an hour. Raw SQL on the exempt tables lives in `sheets/schedule.ts`.
- **Erasure** (spec 9): `eraseCustomerParts` reads `customerContacts` first, calls `withdrawSheetRows` and puts the
  counts in the platform log entry as `sheetRowsWithdrawn`. The console's `eraseDescription`
  (`console-platform.json`) gains the sentence "Rows naming a customer in an agency's Google Sheet stay in the sheet:
  ask the agency to delete them too. They won't be added again.", and its test.
- **Demo:** N11 supplies the two sample leads; `resetDemoOrganization` seeds no connection. With no Google set up in the
  demo, the Lead sources page says "Not available in the demo" (Task 17).

- [ ] **Step 1: Write the failing tests.**

```ts
// erasure.test.ts
it("re-keys the person's rows and empties their ids and examples", …) // status erased; hash ≠ plain; lead_id null
it("keeps a re-keyed row known: the same row read again is skipped", …) // lookUpLedger finds it by the keyed hash
it("leaves out a different row naming the erased phone, as 'erased'", …) // the tombstone; a row with the same email too
it("keeps only keyed hashes of the contacts, and no plaintext anywhere", …) // scan every sheet_* column of the organization for the phone, email and handle
it("empties every example in the organization", …)
it("fails loudly rather than skipping when the hash key is missing and the organization has sheet rows, and does nothing when it has none", …)
it("is part of the platform erasure: a customer with a sheet row and contact, and a second row of theirs read after the erasure", …) // erasure.test.ts
it("never lets an erased customer's row come back from a full read or Sync now", …)
// sweep.test.ts
it("deletes a draft untouched for 24 hours with its columns, and keeps a fresh one and a connected sheet", …)
it("drops resolved problems after 7 days and keeps unresolved ones", …)
it("drops schedule rows with no live connection and claims with none, only after an hour", …)
it("registers platform.sweep-sheets with the console's schedules, hourly", …) // console-jobs.test.ts and platform-queues.test.ts
it("purges an organization's sheet tables, schedule row and claim with the rest", …) // Task 3's purge test covers rows; here the platform purge job
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS, including N11's demo test.
- [ ] **Step 5: Commit.** Message: `feat(platform): erase a customer's sheet rows to keyed hashes, and sweep drafts and old problems`.

## Task 15: The `leadSheets` procedures

**Files:**

- Create: `packages/api/src/routers/lead-sheets.ts`.
- Modify:
  - `packages/api/src/routers/app-router.ts`;
  - `packages/api/src/context.ts` (`ApiDependencies` and the context gain `google`, `sheetsHashes` and `addGuards`);
  - `apps/api/src/{server,app}.ts` (building the context; the `addGuards` of N9 gain `assertNoSheetCheckSaving`);
  - `packages/domain/src/sheets/guards.ts` (`assertNoSheetCheckSaving`);
  - `errors.json`: `SHEET_LINK_INVALID`, `SHEET_NOT_SHARED`, `SHEET_NOT_GOOGLE_SHEET`, `SHEET_CLAIMED_ELSEWHERE`,
    `SHEET_EMPTY`, `SHEET_ALREADY_CONNECTED`, `SHEET_LIMIT_REACHED`, `SHEETS_NOT_SET_UP`, `SHEET_NOT_READY`,
    `SHEET_BUSY`, `SHEETS_UNAVAILABLE`.
- Test: `apps/api/test/lead-sheets.test.ts`, `apps/api/test/lead-sheets-flow.test.ts`,
  `packages/domain/test/sheets/guards.test.ts`.

**Interfaces:**

- `manager = orgProcedure.requires("leads:create", "leads:assign")` (the `crm` plan module):
  - queries: `list() → sheetList`, `get(sheetIdInput) → sheetDetail`, `problems(sheetProblemsInput) → sheetProblemsPage`;
  - mutations: `begin(beginSheetInput) → { sheetId }`, `verify(verifySheetInput) → sheetColumnsView`,
    `chooseTab`, `match`, `chooseExisting`, `syncNow`, `recheck`, `hideProblem`.
- `freshProcedure.requires("leads:create", "leads:assign")`: `confirm`, `takeOver`, `resume`, `pause` and `disconnect`;
  the last three `.meta({ lifecycle: "always" })`.
- `assertNoSheetCheckSaving(tx: OrgTx, now: Date): Promise<void>` is the `AddGuard` of N9: a connection with
  `check_started_at` within 30 seconds refuses with `CONFLICT`/`IMPORT_ALREADY_RUNNING` (B29's sentence, S26).
- The sentences are literal:

  | Reason                    | Sentence                                                                                                                                  |
  | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | `SHEET_LINK_INVALID`      | "That isn't a link to a Google Sheet. Open your sheet and copy the address from the browser."                                              |
  | `SHEET_NOT_SHARED`        | "We can't open that sheet yet. Share it with the address above as a Viewer, then check again."                                            |
  | `SHEET_NOT_GOOGLE_SHEET`  | "That is an Excel file kept in Google Drive. Open it in Google Sheets, choose Save as Google Sheets, and paste the new link."              |
  | `SHEET_CLAIMED_ELSEWHERE` | "This sheet is already connected elsewhere."                                                                                              |
  | `SHEET_EMPTY`             | "The first row of this tab is empty. Put your column names in the first row."                                                             |
  | `SHEET_ALREADY_CONNECTED` | "This sheet is already connected here."                                                                                                   |
  | `SHEET_LIMIT_REACHED`     | "You can connect up to 5 sheets. Disconnect one to connect another."                                                                      |
  | `SHEETS_NOT_SET_UP`       | "Google Sheets isn't set up on this server."                                                                                              |
  | `SHEET_NOT_READY`         | "This sheet has moved on. Reload to see where it is."                                                                                     |
  | `SHEET_BUSY`              | "Just checked. Try again in a few seconds."                                                                                               |
  | `SHEETS_UNAVAILABLE`      | "Google isn't answering. Try again in a minute."                                                                                          |

  A test holds "5" equal to `maxSheetsPerOrganization`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("lets only holders of both leads:create and leads:assign use a sheet procedure, on the crm plan module", …)
it("answers NOT_FOUND for another organization's sheet or a disconnected one, and SHEET_NOT_READY for a step out of turn", …)
it("reads the session from the database for confirm, take over, resume, pause and disconnect", …) // freshProcedure
it("keeps pause, resume and disconnect open on a read-only agency, and refuses begin, match and Sync now there", …) // lifecycle kinds
it("lists the sheets with the limit and the addresses to share with, and says when Google isn't set up", …)
it("connects a sheet end to end through the worker: begin, verify, match, choose, confirm, then a row appended becomes a lead", …) // flow test, the memory Google
it("shows a lost sheet's state and the late line, and counts and problems from the counters and the index", …)
it("refuses a Sync now within 30 seconds, and a second connection to one tab", …)
it("refuses an import's Add while a check is saving rows", …) // guards.test.ts, B29's sentence
it("holds every refusal's sentence in errors.json, and names nothing of another agency", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the handlers, each a call into `sheets` or crm with `ctx.db`, `ctx.google` and `ctx.identity`.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): the leadSheets procedures`.

## Task 16: Performance

**Files:**

- Create: `packages/domain/test/performance/sheets-at-scale.test.ts`, `packages/domain/test/performance/sheets-dispatch.test.ts`.
- Modify (only if a plan misses its index): the migration `20261023100000_sheets_sync` or a new one before the merge.

- [ ] **Step 1: Write the tests** in the performance tests' own database, with the large agency seeded (50,000 leads)
  and 100 connections, against the in-memory Google. A plan is read with `EXPLAIN` as `app_runtime` inside `forOrg`
  (the schedule's inside `withoutOrg`).

```ts
// sheets-at-scale.test.ts
it("checks a sheet with nothing new within 150 ms of our own time: one Google call, one claim, one ledger read of 100 hashes on sheet_row_hash, one update, no row written", …)
it("runs 100 such checks within 10 seconds at the queue's concurrency of 4", …)
it("checks 50 new rows within 2 seconds, each lookup once per kind for the batch", …) // counts statements; plans: person_*_live, lead_person, blocked_contact_live, import_row_fingerprint, sheet_row_fingerprint, sheet_erased_contact_hash
it("reads a 20,000-row sheet within 5 seconds of our own time, writes its baseline within 30 seconds at 1,000 rows a transaction, and holds the worker under 150 MB", …)
it("does a daily full read of 20,000 known rows within 10 seconds, in chunks of 1,000 hashes", …)
it("serves a sheet's page, its counters and 50 problems from sheet_row_problems, within 150 ms", …)
// sheets-dispatch.test.ts
it("claims due sheets of 1,000 connections within 100 ms on sheet_check_schedule_due", …)
it("dispatches the checks of 100 agencies within the quota: never more than 50 per account per minute, all queued within three ticks", …) // the adapter's call count per account per simulated minute
```

- [ ] **Step 2: Run them.** Run `pnpm --filter @travel-crm/domain test -- performance/sheets`. A miss is a finding: fix
  the query or the index, never the budget.
- [ ] **Step 3: Commit.** Message: `test(sheets): a 20,000-row sheet and 100 agencies' checks within their budgets`.

## Task 17: Web: the list of sheets, and the foundations

**Files:**

- Create:
  - `apps/web/src/app/(app)/settings/lead-sources/page.tsx`, inside two nested `RequirePermission`s, `leads:create`
    and `leads:assign`;
  - `apps/web/src/lead-sources/{lead-sources-screen,sheet-list,sheet-status-badge,use-lead-sheets,sheet-address}.tsx`
    (some `.ts`);
  - `apps/web/src/i18n/messages/en-IN/sheets.json`.
- Modify: `apps/web/src/i18n/messages.ts` (`sheets`); `apps/web/src/lib/routes.ts`
  (`leadSources: "/settings/lead-sources"`, `sheetConnectRoute`, `sheetRoute(id)`, `sheetConnectStepRoute(id)`);
  `apps/web/src/organization/settings/settings-sections.tsx` (a **Lead sources** section, shown to holders of both
  permissions, on the `crm` module); `settings.json`; `apps/web/test/e2e/support/sheets.ts` and the shot list's block
  are Task 20.
- Test: `apps/web/test/lead-sources/{lead-sources-screen,sheet-status-badge,use-lead-sheets}.test.tsx`.

**Interfaces** (paths under `apps/web/src`):

- `useLeadSheets()`: `leadSheets.list`; `useLeadSheet(sheetId)`: `leadSheets.get`, refetching every 2 seconds while
  `checkRunning` or the sheet is `connecting` at step `done`, else every 30 seconds while the page is open.
- `sheetListRefetch`, `leadSheetRefetchInterval(detail: SheetDetail | undefined): 2000 | 30000 | false`.
- `SheetStatusBadge({ status })`: **Running** good, **Paused** neutral, **Needs attention** attention (for
  `tab_missing`, `columns_missing`, `needs_manager`), **Lost access** bad, **Setting up** neutral (`connecting`).
- `SheetAddress({ emails })`: the read-only `InputGroup` with `CopyButton`, shared by the connect and lost-access screens.
- `LeadSourcesScreen()`: `PageHeader` "Lead sources" and the sentence ("Enquiries your agency collects elsewhere arrive
  here by themselves. We only read your sheets: nothing is ever written to them."), then **Google Sheets**: an
  `ItemGroup` of `Item`s (name, the tab in the description, "Last checked 10:42" in the agency's zone, the badge, the
  name linking to the sheet's page), and **Connect a sheet** (primary).

- [ ] **Step 1: Write the failing tests.**

```tsx
it("shows Lead sources in Settings to holders of both permissions only, on the crm plan", …)
it("lists the sheets with name, tab, Last checked in the agency's zone and a badge, the name linking to the sheet", …)
it("shows an EmptyState for an agency with no sheet, with its sentence", …)
it("disables Connect a sheet at five sheets with the hint 'You can connect up to 5 sheets. Disconnect one to connect another.' as the button's description", …) // WriteHint
it("says Google isn't set up and turns the button off", …) // and 'Not available in the demo' for the demo organization
it("badges Running green, Paused neutral, Needs attention amber and Lost access red, each with a dot and a word", …)
it("shows the loading rows, the error with Retry, and a refusal", …)
it("refetches every 2 seconds while a check runs and every 30 otherwise", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/web test -- lead-sources`. Expected: FAIL.
- [ ] **Step 3: Build them** as thin compositions of the registry parts. `sheets.json` holds `list`, `statuses`,
  `connect`, `sheet`, `attention`, `problems`, `disconnect` and `reasons` (the problem sentences: "No name", "No phone,
  email or Instagram we can use", "Notes over 4,000 characters", "Blocked contact", "A customer who asked to be erased").
- [ ] **Step 4: Run the web tests.** Expected: PASS, including the border, colour and touch-target guards.
- [ ] **Step 5: Commit.** Message: `feat(web): Lead sources: the list of connected sheets`.

## Task 18: Web: connecting a sheet

**Files:**

- Create:
  - `apps/web/src/app/(app)/settings/lead-sources/sheets/connect/page.tsx`;
  - `apps/web/src/app/(app)/settings/lead-sources/sheets/[sheetId]/connect/page.tsx`;
  - `apps/web/src/lead-sources/connect/{share-step,columns-step,existing-step,connect-screen,connect-caption,field-checklist}.tsx`
    and `use-connect-sheet.ts`.
- Modify: `sheets.json`.
- Test: `apps/web/test/lead-sources/connect/{share-step,columns-step,existing-step,connect-screen}.test.tsx`.

**Interfaces:**

- `ConnectScreen({ sheetId? })` picks the step from `step`: **Share and paste** (no sheet yet, at
  `/settings/lead-sources/sheets/connect`), **Tab and columns**, **Rows already in the sheet**, and "Reading your
  sheet…" while the sheet is `connecting` at step `done`; then it goes to the sheet's page, or, for "check", to the
  import's page (`/leads/import/<existingImportId>`). A caption: "Step 2 of 3 · Match columns".
- `ShareStep()`: two numbered `Item`s, the address and `CopyButton` with "In your sheet, press Share, paste the address
  and choose Viewer. We can only read, never change.", then the link field, then **Check the sheet** (`begin`); each
  failure has its sentence under the field (`useErrorMessage()`).
- `ColumnsStep({ sheetId })`: "Sheet 'Goa Diwali campaign (Responses)'", a `Select` of the tabs when there are several
  (`chooseTab`), the shared `ColumnMatcher` with **the lead import's fields without `stage`** (S3), `FieldChecklist`
  ("Name ✓", "a phone, email or Instagram ✓"), and for a column matched to Owner the `ValueMatcher` (`verify` with
  `valuesOf`), with "anything else to the agency Owner". **Next** sends `match`.
- `ExistingStep({ sheetId })`: "Your sheet already has 1,286 rows. What should we do with them?" and two choice cards
  (as the export's format card): **Only new rows from now on** (chosen) and **Also check the 1,286 rows already there**.
  A sheet with no rows skips the step; a bigger one says "Your sheet has 14,200 rows; the newest 10,000 can be
  checked." **Connect the sheet** asks once (`ConfirmDialog`): "Connect 'Goa Diwali campaign'? New rows will become
  leads about every 2 minutes. We never change your sheet." and sends `chooseExisting` then `confirm`.
- Every button asks `useWriteAccess("change")` with its `WriteHint`.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("shows the address with Copy, the instruction, and the link field, and checks the sheet", …)
it("says each way the check fails under the field: not shared, not a Google Sheet, an Excel file, already connected here, elsewhere, the limit, not set up", …)
it("opens the same step when the person leaves and comes back, by the sheet's address", …)
it("lists the tabs of a sheet with more than one, the link's tab first, and not for one", …)
it("fills the guesses, hides Stage, checks off Name and a phone, email or Instagram, and keeps Next off until they are matched", …)
it("lists an Owner column's values with their rows and an automatic match, 'anything else to the agency Owner'", …)
it("offers the two choices, with 'only new rows' chosen, and skips the step for an empty sheet", …)
it("says the newest 10,000 can be checked for a bigger sheet", …)
it("asks once before connecting, holds the dialog while it sends, and shows 'Reading your sheet…'", …)
it("goes to the sheet's page, or to the import's preview for the second choice", …)
it("disables its buttons with the hint while the agency is read-only", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from `PageHeader`, `FormField`, `TextField`, the import pieces, `ConfirmDialog` and `BackLink`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): connect a sheet: share, match the columns, and choose what to do with the rows there`.

## Task 19: Web: the sheet's page, its alerts, and the controls

**Files:**

- Create:
  - `apps/web/src/app/(app)/settings/lead-sources/sheets/[sheetId]/page.tsx`;
  - `apps/web/src/lead-sources/sheet/{sheet-screen,sheet-counts,sheet-problems,sheet-columns-card,sheet-details,attention-alert,sheet-actions,disconnect-dialog,sync-now-button}.tsx`.
- Modify: `sheets.json`.
- Test: `apps/web/test/lead-sources/sheet/*.test.tsx`.

**Interfaces:**

- `SheetScreen({ sheetId })`: `BackLink`, `PageHeader` with the name, its badge and "Tab 'Form responses 1' · connected
  by Asha Sharma on 12 Oct", **Sync now** (outline) and a `DropdownMenu` (**Match columns again**, **Pause**/**Resume**,
  **Take over** when `needs_manager`, **Disconnect**).
- `SyncNowButton`: shows "Checking…" then the new time; "Checks are running late. Sync now checks it at once." when
  `late`; the refusal sentence for `SHEET_BUSY`.
- `SheetCounts`: `Card`s in mono (Added, Added to an existing lead, Left out as duplicates, Couldn't be added) and
  "Rows already in the sheet when you connected are not counted." and "Changing a row after it was added adds a repeat
  enquiry"; "Only the first 20,000 rows are read. Move older rows to another tab." when `rowsTruncated`.
- `SheetProblems`: a `Table` on a computer and an `ItemGroup` on a phone: "Row 87", the name or value, the reason, "First
  seen 18 Oct", **Hide** (ghost); "Fix the row in your sheet. The next check adds it and clears this line. We never
  change your sheet."; fifty at a time with `useCursorPages` and `ShowMoreButton`.
- `SheetColumnsCard`: "6 of 9 columns are matched" with **Match columns again** (the connect step, saved with a
  `ConfirmDialog`: "Rows already added are not added again."), and the quiet "A new column 'Budget for the trip' isn't
  matched" linking to it. `SheetDetails`: name and tab, who owns new leads when no owner column matches (the agency
  Owner), "New leads come in as New".
- `AttentionAlert({ detail })` per state (S39-S44), each saying what, since when and the one thing to do:
  **Lost access** ("We can't open this sheet any more. Last checked 10:42 on 18 Oct. It may have been unshared or
  deleted. Share it again with <address> as a Viewer, then press Check again.", the address, **Check again**);
  **Tab missing** (a `Select`, **Use this tab**); **Columns missing** (names the columns, **Match columns again**);
  **Needs a manager** (**Take over**); **Read-only** ("Paused while your subscription is read-only. Rows wait in the
  sheet and are added when it's active again."); **Paused** (**Resume**). Google being busy shows no alert.
- `DisconnectDialog` (`ConfirmDialog`): "Disconnect 'Goa Diwali campaign'? Leads already added stay. We stop reading the
  sheet and forget its rows' record, so connecting it again asks about its rows once more. Nothing in your sheet
  changes; you may also remove <address> from its sharing."
- Sync now, Match again, Take over and Check again ask `useWriteAccess("change")`; Pause, Resume and Disconnect ask
  `useWriteAccess("revoke")` (open while read-only, S44).

- [ ] **Step 1: Write the failing tests.**

```tsx
it("shows the name, badge and who connected it and when, and Last checked in the agency's zone", …)
it("says 'Checks are running late' after ten minutes, and Sync now shows Checking… then the new time", …)
it("refuses a second Sync now with its sentence", …)
it("shows the four counts in mono and the notes under them", …)
it("lists the problems with row, name, reason and first seen, hides one, and shows fifty at a time", …)
it("shows the lost-access alert with the address, since when and Check again, and tells nothing for a busy Google", …)
it("shows the tab-missing select, the missing columns by name, the needs-a-manager Take over, the read-only and the paused alerts", …)
it("shows 6 of 9 columns matched and a quiet line for a new column, and asks before saving a new match", …)
it("disconnects after a confirmation that names what stays, and the sheet leaves the list", …)
it("keeps Pause, Resume and Disconnect open on a read-only agency and turns Sync now off with its hint", …)
it("refetches every 2 seconds while a check runs", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.**
- [ ] **Step 4: Run the web tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): a sheet's page: counts, problems, attention alerts and controls`.

## Task 20: Journeys, against a fake Google

**Files:**

- Create:
  - `apps/web/test/e2e/support/{fake-google,sheets}.ts`;
  - `apps/web/test/e2e/sheets-{connect,no-duplicates,problems,lost-access,controls,limits,erasure,read-only}.spec.ts`.
- Modify: `apps/web/test/e2e/global-setup.ts`, `apps/web/test/e2e/support/servers.ts` (start the fake, give the api and the
  worker `GOOGLE_SHEETS_SERVICE_ACCOUNTS` (a throwaway key per run), `SHEETS_HASH_KEY`, `GOOGLE_SHEETS_TEST_SERVER_URL`
  and `SHEETS_CHECK_INTERVAL_SECONDS=1`; the console gets only `SHEETS_HASH_KEY`).

**Interfaces:**

- `fake-google.ts`: `startFakeGoogle(): Promise<FakeGoogle>` serves the two Sheets v4 endpoints and a control surface
  over HTTP from one `createMemoryGoogleSheets`, answering errors in Google's own body shapes; `FakeGoogle` is
  `{ url, stop(), client: FakeGoogleClient }`. The tests' `fakeGoogle` is `FakeGoogleClient`: `addSpreadsheet`,
  `share`, `unshare`, `deleteSpreadsheet`, `append`, `insertAt`, `deleteAt`, `sort`, `editCell`, `renameTab`,
  `failNext`, `calls()`, each a `fetch` to the control surface. `accountEmail()` is the address the screen shows.
- `sheets.ts`: `aGoogleForm(fakeGoogle, rows)`, `connectSheet(page, { link, existing: "only_new" | "check" })`,
  `waitForLead(page, name)`, `syncNow(page)`.

- [ ] **Step 1: Write the journeys.** Each runs on phone and desktop, with axe after each (`accessible-after-each`).
  A scheduled check is awaited for at most one dispatcher tick; the others press Sync now.

```ts
test("an Owner connects a sheet: shares, pastes, matches, 'only new rows'; the form adds a row and within one check the lead shows with source Google Sheet, its owner and its notice", …) // 1
test("connect with 'also check the rows already there': the preview shows Already in your CRM with the open and closed counts, left out; tick one with a closed lead; add; that person gets a Returning lead; the sync adds none of the rest", …) // 2
test("a person with an open lead typed by hand fills the form: a repeat enquiry, not a second lead; the same row in a second connected sheet and in a file import is a duplicate; a person with only closed leads gets a Returning lead", …) // 3
test("sort the sheet, insert a row in the middle, delete a row: Sync now adds only the inserted one, nothing twice, nothing lost", …) // 4
test("a row with no contact is listed with its reason; the fake edits the cell to a phone; the next check adds the lead and the line clears; Hide removes another", …) // 5
test("unshare the sheet: after three failed checks the page says Lost access with the address, the Owner has exactly one notice; share again, Check again, running, the rows that arrived meanwhile are added", …) // 6
test("Sync now twice in a row: the second is refused with its sentence; Pause and Resume; Disconnect; connecting again asks about the rows again and adds nothing twice", …) // 7
test("the sixth sheet is refused with its sentence; a second connection to the same tab is refused; an Excel file is refused; a sheet connected to another agency is refused with the generic sentence naming nothing; disconnecting it there frees it here", …) // 8
test("erase a customer: their row is read again by a full read and is not added; a different row naming their phone is left out as erased", …) // 9
test("a read-only agency: the sheets are paused with their sentence, Sync now is off, Pause and Disconnect still work", …) // 10
```

- [ ] **Step 2: Run them until they pass.** Run `./node_modules/.bin/playwright test test/e2e/sheets-*.spec.ts` from
  `apps/web`, on both projects. A failure is fixed in the code it shows, never by lengthening a wait.
- [ ] **Step 3: Commit.** Message: `test(web): the Google Sheets journeys, against a fake Google`.

## Task 21: The visual audit, the docs, and the merge

**Files:**

- Create: `apps/web/test/e2e/audit/12-sheets.audit.ts`.
- Modify:
  - `apps/web/test/e2e/audit/shot-list.ts` (one block, below);
  - `CLAUDE.md`: the repo map's module `sheets` and adapter `google-sheets`; a "Google Sheets" bullet under shared
    services (the port, the schedule outside row-level security, the claim, the hash key); the data rules' list of
    tables outside row-level security gains the two; the commands unchanged;
  - `packages/domain/README.md` (the module, L0), `packages/db/README.md` (already, Task 3);
  - `docs/deploy-checklist.md` (checked: the two settings and the routing table need no new path);
  - `docs/adr/0031-google-sheets-sync.md` (final).

**The shots:** `lead-sources-empty`, `lead-sources-list`, `lead-sources-limit`, `sheet-connect-share`,
`sheet-connect-not-shared`, `sheet-connect-columns`, `sheet-connect-existing`, `sheet-connect-confirm`,
`sheet-connect-reading`, `sheet-import-check-in-crm`, `sheet-page`, `sheet-page-problems`, `sheet-page-late`,
`sheet-lost-access`, `sheet-tab-missing`, `sheet-columns-missing`, `sheet-needs-manager`, `sheet-read-only`,
`sheet-paused`, `sheet-disconnect`.

- [ ] **Step 1: Write the camera file** and the shot list's block.
- [ ] **Step 2: Run the visual audit loop** (`docs/ui-build-loop.md` section 5) until no must is left:
  1. Shoot on both projects:
     `AUDIT_OUT=test-results/audit/round-1 pnpm exec playwright test --config playwright.audit.config.ts --project=phone test/e2e/audit/12-sheets.audit.ts`,
     then with `--project=desktop`.
  2. Open every PNG and judge it against `DESIGN.md` and the owner's seven rules. List findings as
     `# | must/should/could | shots | what's wrong | file | the fix`.
  3. Fix every must and should in this branch's files. A fix to a shared piece goes under "Needs from others" in the
     report.
  4. Re-shoot into `round-2` and compare; repeat, and keep the table in the report.
- [ ] **Step 3: Write the docs.** Commit them with `docs: Google Sheets in the repo map, the module list and ADR 0031`.
- [ ] **Step 4: Run the merge gate** in the foreground (after `git merge --no-edit main`). Expected: PASS. `pnpm audit`
  covers `google-auth-library`; `pnpm migrations:check` runs the migration on an empty Postgres 18 and checks drift.
- [ ] **Step 5: Report**, with the gate's results, the audit table and the rulings added. The controller merges
  `sheets/sync` into `main`. Then the commit of the audit file: `test(web): the Google Sheets audit shots`.

## Spec coverage (self-review)

| Spec                                                      | Task                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1 goals and anti-goals                                    | 11 (no duplicates), 12 (lost access), 16 (10,000 rows), 20 (journeys)         |
| 2 who uses it                                             | 15 (procedures), 17 (the section)                                             |
| 3.1 Lead sources                                          | 17                                                                            |
| 3.2 Connect (three steps)                                 | 6, 7, 18                                                                      |
| 3.3 Rows already there: the preview's extra group         | N4-N6, N8 (earlier branches), 8 (the CSV and the import), 20 (journey 2)      |
| 3.4 The sheet's page; 3.5 attention; 3.6 disconnecting    | 19, 12                                                                        |
| S1, S2 read only, our address                              | 1, 2, 4                                                                       |
| S3 the link; S4 the claim; S5 what Check does              | 5, 6                                                                          |
| S6 drafts and the sweep; S7 once per tab; S8 five sheets   | 6, 14                                                                         |
| S9 not set up; S10 who acts                                | 4, 17, 7, 11                                                                  |
| S11-S13 columns, guesses, fields                           | 9, 7, N2                                                                      |
| S14 baseline and the choice; S15 bounds                    | 8, 9, 11                                                                      |
| S16-S20 cursor, window, hash identity                      | 9, 11                                                                         |
| S21-S28 a row becomes a lead; S27 problems; S28 edits       | 10, 11, N6, N7                                                                |
| S29 unfinished rows; S30 counts; S31 problems clear         | 10, 11, 9                                                                     |
| S32 notices of leads; S33 bounds; S34 the connector goes    | 11, N7; 1, 2, 11; 12                                                          |
| S35 accounts; S36 dispatcher; S37 backing off              | 6, 13; 8, 13; 12                                                              |
| S38 Sync now; S39 lost access; S40 tab missing              | 12                                                                            |
| S41 pause; S42 disconnect; S43 erasure; S44 read-only; S45  | 12; 12; 14; 11, 12; 12                                                        |
| 5 data, the two exempt tables, their guards                 | 3, 8                                                                          |
| 6.1 port and adapters; the dependency rule                  | 1, 2                                                                          |
| 6.2-6.4 modules, crm, notifications                         | 6-14, N6-N9                                                                   |
| 6.5 procedures and reasons                                  | 15                                                                            |
| 6.6 the web app                                             | 17-19                                                                         |
| 7 jobs and events; the console's sweep                      | 8, 11, 13, 14                                                                 |
| 8 audit and notifications                                   | 7, 11, 12                                                                     |
| 9 erasure and purge                                         | 14                                                                            |
| 10 the demo                                                 | N11, 14, 17                                                                   |
| 11 performance                                              | 16                                                                            |
| 12 journeys, tests, visual audit                            | 20, 21 and each task's own tests                                              |
| 13 build order; changes to the bulk release's pieces        | task order; the Needs table                                                   |
| 14 what the owner does                                      | 4 (the checklist); the controller tells the owner                             |

Not built, as the spec says: writing to a sheet, "Sign in with Google" and the Picker, Drive push notifications, more
than one tab per connection, following edits into a lead, a plan limit by tier.
