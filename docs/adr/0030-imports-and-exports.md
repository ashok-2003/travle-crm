# 0030: Imports and exports

Date: 2026-10-19 · Status: accepted · Applies to release 2, bulk in and out (lead import, lead export, staff import,
staff export; spec `docs/superpowers/specs/2026-10-19-bulk-in-and-out-design.md`)

## Decision

### Spreadsheets go through a port (spec 6.1, 15.16)

- **`Spreadsheets`** (`@travel-crm/integrations/spreadsheets`, ADR 0008) is the only way to read or write a CSV or an
  .xlsx file. `read(bytes, { kind, maxRows, maxColumns, maxCellLength })` gives the first sheet's name, its header row
  and its rows of text cells (a date as `yyyy-mm-dd`), or throws `SpreadsheetUnreadableError` with one of eight
  reasons (`not_a_spreadsheet`, `protected`, `old_excel`, `no_column_names`, `no_rows`, `too_many_rows`,
  `too_many_columns`, `too_large_unpacked`). `writer({ kind, sheetName, columns })` takes rows in batches and ends with
  the file's bytes, holding only its compressed output; each column says its kind (text, phone, number, date,
  date-time).
- **The real adapter** reads CSV with `csv-parse` and writes it with `csv-stringify` (the `csv` project: maintained,
  MIT, no dependencies); reads .xlsx with `read-excel-file`, only after a bounded pre-inflate with `fflate` (at most
  50 MB unpacked, and the sheet's rows and columns counted before it is parsed, by `saxen` from npm, of which
  read-excel-file vendors a copy, with the names read as the reader reads them and a test holding the two to the same
  events: never with patterns, which a `>` inside an attribute or single quotes would fool); writes .xlsx with our own
  small streaming writer on
  `fflate`'s `Zip` (one sheet of values, a bold frozen header row, date styles). All five are pinned exactly
  (`csv-parse` 7.0.3, `csv-stringify` 6.9.0, `read-excel-file` 9.3.12, `fflate` 0.8.3, `saxen` 11.2.0), and
  dependency-cruiser's `vendor-sdks-only-in-integrations` names them. **The in-memory adapter** keeps sheets as JSON
  bytes and can fail the next read with any reason.
- **An .xlsx is read in a thread of its own (D1, fix round 2).** One staff member's file reaches a worker every agency
  shares, and two rounds of review each found markup the sizing read differently from the reader. So the sizing is
  the fast first refusal, not the only one: the unpack, the first sheet's lookup, the sizing and read-excel-file all
  run in a `worker_threads` thread with a 128 MB heap, a 16 MB young generation, a 4 MB stack and a minute. Running
  out of any of them is `too_large_unpacked` ("too large once opened", whose advice to save a smaller copy or a CSV
  holds); a thread that can't run is our error, named by its code, and the worker reads a one-cell workbook this way
  before it starts, so a deploy without the thread's module refuses to start. The largest file the limits take
  (10,000 rows of 50 columns) reads in about 1.5 seconds on a laptop, so ten times that or more on the pilot's tenth
  of a CPU: the round's suggested 20 seconds would refuse it there, hence a minute. The bytes are transferred in, and
  only the bounded rows come back. The api's bundle carries the thread as an entry of its own, `xlsx-thread.mjs`.
- **Why these:** SheetJS's npm package `xlsx` stops at 0.18.5 with published advisories, and newer versions come only
  from its own CDN; ExcelJS has had no release since October 2023; `write-excel-file` builds the whole sheet in memory.
  Measured for 50,000 leads of 16 columns, it grew the process from 64 MB to 430 MB against 130 MB for the streaming
  writer, and the pilot runs the api and the worker in one 512 MB container.
- **A cell is always a value, never a formula** (B40): a text cell starting with `=`, `+`, `-`, `@`, a tab or a return
  is written with a leading apostrophe, and reading drops one leading apostrophe, so a file this product exported
  imports back. A phone our own code formatted is written as it is.

### Only the worker reads a file (spec 15.1)

- The browser sends the file straight to storage (a presigned upload of the files module, ADR 0011) as an attachment
  of the import (`import_batch`), which takes the two spreadsheet types alone, at most 10 MB. The api never opens it.
- The worker reads it when `import.uploaded` arrives, in its own memory (a 10 MB file, under 20 MB parsed), and reads
  it again from storage at every later step. Only a column's samples and listed values and a not-added row's examples
  are stored, never the file's rows.
- One reader serves the preview and the add; a zip bomb hurts a job, never a phone or the api; the web app carries no
  spreadsheet library.

### Each step is an event (spec 7)

Each step's change publishes the next step's event in its own transaction (ADR 0009), so a lost queue send can't
strand an import:

| Event                    | Listener (the lead one, the staff one)                | What it does                             |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| `import.uploaded`        | `imports.read-file`                                   | reads the file, its columns and values   |
| `import.columns-matched` | `crm.check-lead-import`, `imports.check-staff-import` | the check: what each row would become    |
| `import.add-requested`   | `crm.add-lead-import`, `imports.add-staff-import`     | the add, then the report and the notices |
| `export.requested`       | `crm.make-lead-export`, `exports.make-staff-export`   | the file, a page of rows at a time       |
| `import.finished`        | none yet: later releases' summary tables follow it    |                                          |
| `export.made`            | none yet                                              |                                          |

- Payloads hold the import's or export's id and its kind. Where two listeners share an event, each acts on its own
  kind; a listener does nothing for an import or export no longer at its step, so a second run is harmless.
- The job acts as the importer or requester, with their access resolved afresh when it starts: source `job`, or
  `impersonation` with the admin's id when support started it, as the audit log's impersonation rule requires.
- One import adds at a time in an agency (`import_batch_one_adding`, a unique index on the agency's adding import):
  two imports of the same people would make each other's leads repeat enquiries.

### How long the files are kept (B53, B54, spec 9)

- **An import's file and its report** are kept 7 days after the import's last change (`keep_until`). The console's
  hourly `platform.sweep-bulk-files` (`apps/api/src/console-jobs.ts`) then deletes them for good through the
  deletions' outbox, empties what the import kept of its rows and columns (samples, values, examples, password
  hashes, and each column's header, which a file with no header row fills with its first row of data) and marks it
  expired, each import in its own short transaction. Its counts, outcomes and fingerprints stay, so a file imported
  again is still "Already imported".
- **Fingerprints are kept, not deleted with the rest (M9).** B53 lists "hashes" among what the sweep empties; a row's
  fingerprint is what B33's "Already imported" reads, so it stays. It is a SHA-256 of the row's values, scoped to the
  organization under row-level security, never leaves the database, and an erasure empties the erased person's. If
  that changes, keyed hashes would mean fingerprinting every kept row again.
- **An export's file** is kept 24 hours after it is ready (`expires_at`), for its requester alone, then the same sweep
  deletes it and forgets the search text. An export still being made a day after it was asked for expires too.
- **An erasure** (a customer's or a removed member's) withdraws every import and export file of the organization at
  once, in the erasure's transaction, empties the erased person's import rows and forgets the agency's header memory
  (a header may have been a customer's details). A file can't be searched for one person, and it is a week's worth at
  most. The memory never takes a header that reads as data: four digits, an @, a + before digits, or six words.
- The files module knows the three record types (`import_batch`, `import_report`, `data_export`): the last two are
  made by the system (`storeGeneratedFile`), never uploaded, and are short-lived, so their files are deleted with
  their record.

### Recent imports are the person's own (D5)

The spec and the plan name `import_batch_recent` on `(organization_id, kind, id DESC)`. It is `(organization_id,
started_by, kind, id DESC)`: Recent imports lists the person's own imports (D6), and on the spec's key the planner
rightly prefers the organization's id index and filters the person (the plan's R33).

### The shared pieces land first, with stubs (the plan's D1)

The shared part (bulk plan, Part 0) reached `main` before the three features, with each feature's slots as stubs, so
three branches never edit the same lines:

- a feature's listener takes its real first step, then throws `Not built yet: bulk plan, Task <n>`;
- its router is `router({})`, its header button `() => null`, its message key `{}`.

The stubs are unreachable on `main`: no procedure publishes their events and no screen links to them until the
feature merges and replaces its own.

## Context

The owner asked for bulk import and export of leads and staff as the second release of Phase 1's build step 2
("important are giving the bulk import and export feature.. for lead and employees"). Agencies arrive with years of
enquiries in Excel and Google Sheets, and must be able to take their data away again (ADR 0021: a read-only agency
may still export).

## Consequences

- Five new packages, pinned and covered by `pnpm audit`.
- The worker holds an import's file and its parsed rows in memory (under 20 MB), and an export streams in pages of
  1,000 (resident memory under 200 MB). No new environment variable.
- The console must keep running for the sweep, as it already must for the nightly jobs (`docs/deploy-checklist.md`).
- Six new organization tables (`import_batch`, `import_column`, `import_value_match`, `import_row`,
  `import_header_match`, `data_export`), each with row-level security and CHECK constraints for its values; the
  runtime role can't delete an import, its columns, its remembered headers or an export.
- A failed job's error names the import or export by id, never a file's content (spec 9's job data rule).
