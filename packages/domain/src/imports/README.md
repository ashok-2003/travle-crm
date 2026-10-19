# imports

Bringing leads and staff in from a CSV or .xlsx file (release 2, spec 4.1-4.5, 4.7; layer L0). An import is a batch
(`import_batch`) with its columns, the matches of its Owner, Stage and Role values, every row's plan and outcome, and
the agency's remembered header matches. The browser never reads a file: it goes straight to storage, and the worker
reads it through the spreadsheets port (ADR 0030). crm (L1) calls this module for the lead import; it never calls crm.

## The steps

| Status      | Who moves it on                                                       | Next                          |
| ----------- | --------------------------------------------------------------------- | ----------------------------- |
| `uploading` | the importer confirms the upload (`confirmImportUpload`)              | `reading`                     |
| `reading`   | `imports.read-file` on `import.uploaded`                              | `matching` or `unreadable`    |
| `matching`  | the importer matches the columns (`import.columns-matched`)           | `checking`                    |
| `checking`  | the kind's check listener (a dry run, B25)                            | `checked`                     |
| `checked`   | the importer presses Add (`requestImportAdd`, `import.add-requested`) | `adding`, or `checking` again |
| `adding`    | the kind's add listener, then `finishImport`                          | `done`, `stopped`, `failed`   |

Any waiting status (`uploading` to `checked`) may be `cancelled`; the console's sweep marks an import `expired` a
week after its last change (D5), deleting its file and report and emptying what it keeps of the rows (B53).

## Public functions (`index.ts`)

- `startImport(db, files, access, kind, input, now)`: records the import (`uploading`, the starter and anyone
  impersonating them, kept a week) and returns its presigned upload, under record type `import_batch`. A refused
  upload (storage full) leaves it `cancelled`.
- `confirmImportUpload(db, files, access, kind, importId, now)`: once storage holds the file, `reading` and
  `import.uploaded` (`{ importId }`); asked again while reading, nothing.
- `requestImportAdd(db, access, kind, importId, now)`: Add, from `checked` only: `adding`, `import.started`
  (`{ kind, rowsToAdd }`) and `import.add-requested` (`{ importId, kind }`). A second press is `IMPORT_NOT_READY`;
  while another import of the agency adds, `IMPORT_ALREADY_RUNNING` (`import_batch_one_adding`, B29, D35).
- `stopImport(tx, access, kind, importId)`: while adding, asks the add to stop after its batch; again, nothing.
- `cancelImport(tx, access, kind, importId, now)`: from a waiting status, `cancelled` and `import.cancelled`
  (`{ kind, status }`).
- `decideLeadImport(tx, access, input)`: at the preview, whether the add takes blocked contacts' rows and rows
  already imported (B16, B33).
- `findImport(tx, access, kind, importId)`, `importDetail(tx, access, kind, importId)` and
  `recentImports(tx, access, kind)` (the person's last ten). `importCounts(tx, batch)`: the preview's counts.
- `holdImport(tx, importId)`: the batch's row locked, so two runs of a job take turns (B26).
- `importerAccess({ identity, subscriptions }, batch, required)`: the starter's access afresh for a job (B31), or
  `no_longer_a_member`, `lost_permission` or `organization_cannot_change`.
- `encodeRowReason(reason)` and `decodeRowReason(text)`: a row's reasons as `import_row.reasons` keeps them (D8).
- Reading (B1-B6, B9-B11): `readImportFileListener(dependencies)` (`imports.read-file` on `import.uploaded`) reads the
  file outside any transaction, keeps its SHA-256, sheet and `rows_total`, and each column's header (cut to 200),
  three samples and, for at most fifty different values, the values with their counts (`summariseColumns`); it
  guesses each column's field and suggests a target for every listed value, then moves to `matching`, or to
  `unreadable` with the adapter's reason. `readImportFile(dependencies, batch)` is the check's and the add's one
  reader, with the kind's limits (`readLimitsOf`); `importFileBytes` fails `ATTACHMENT_NOT_FOUND` once the file is
  withdrawn.
- Guesses (B9, D13, D14): `headerKey(header)`, `guessFields(kind, headers, remembered)`, and the agency's memory,
  `rememberedFields(tx, kind, keys)` and `rememberFields(tx, organizationId, kind, matches)` (upserts, B10).
- Values (B11): `suggestValueMatches(identity, batch, columns)` (made outside the transaction: identity runs its own),
  `writeValueMatches(tx, batchId, suggestions)`, and `valueTargetsFor(context, identity, batch, field, values)`: each
  value's stored target, else its automatic one (a column of more than fifty values is matched here), else null. A
  value over 200 characters is never listed. `valueFieldsOf[kind]`: owner and stage for leads, role for staff.
- Types: `ImportBatchRow`, `ImportIdentity`, `ImportJobDependencies`.

## Rules worth knowing

- An import is its starter's alone (D6): another person's, another kind's or another organization's is `NOT_FOUND`.
  A step asked at another status is `CONFLICT`/`IMPORT_NOT_READY`.
- A job acts as the importer, resolved afresh each run: source `job`, or `impersonation` with support's id when support
  started the import while impersonating, so the audit log shows support as it does on `import.started` (the audit
  log names support exactly on impersonation entries).
- Events, job data, audit snapshots and errors hold ids, counts and codes, never a cell, a file name or a password.
