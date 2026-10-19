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
- `startImportFromBytes(db, files, input, now)`: a Google Sheet's rows as CSV bytes (the Sheets sync's connect-time
  import), stored by the system as the import's file, the import `reading` for `startedBy` with its
  `source_sheet_id`, and `import.uploaded`. Asked again with the same `importId`, it stores and publishes once.
- `requestImportAdd(db, access, kind, importId, now)`: Add, from `checked` only: `adding`, `import.started`
  (`{ kind, rowsToAdd }`) and `import.add-requested` (`{ importId, kind }`). A second press is `IMPORT_NOT_READY`;
  while another import of the agency adds, `IMPORT_ALREADY_RUNNING` (`import_batch_one_adding`, B29, D35).
- `stopImport(tx, access, kind, importId)`: while adding, asks the add to stop after its batch; again, nothing.
- `cancelImport(tx, access, kind, importId, now)`: from a waiting status, `cancelled` and `import.cancelled`
  (`{ kind, status }`).
- `decideLeadImport(tx, access, input)`: at the preview, whether the add takes blocked contacts' rows, rows
  already imported (B16, B33) and a Google Sheet's rows for people who already have a lead (`addInCrm`, plan `in_crm`,
  off unless sent).
- `findImport(tx, access, kind, importId)`, `importDetail(tx, access, kind, importId)` and
  `recentImports(tx, access, kind)` (the person's last ten). `importCounts(tx, batch)`: the preview's counts,
  with a sheet's `in_crm` rows by whether the lead is open. The detail names a sheet's connection (`sourceSheet`).
- `holdImport(tx, importId)`: the batch's row locked, so two runs of a job take turns (B26).
  `isAnyImportAdding(tx)`: whether any import of the agency is adding (B29), which a sheet's check waits for.
- `jobMemberAccess({ identity, subscriptions }, { organizationId, userId, impersonatedBy }, required)`: a member's
  access afresh for a job, or `no_longer_a_member`, `lost_permission` or `organization_cannot_change`;
  `importerAccess(dependencies, batch, required)` is it for the import's starter (B31).
- `encodeRowReason(reason)` and `decodeRowReason(text)`: a row's reasons as `import_row.reasons` keeps them (D8).
- Reading (B1-B6, B9-B11): `readImportFileListener(dependencies)` (`imports.read-file` on `import.uploaded`) reads the
  file outside any transaction, keeps its SHA-256, sheet and `rows_total`, and each column's header (cut to 200), three
  samples and, for at most fifty different values, the values with their counts (`summariseColumns`); it guesses each
  column's field and suggests a target for every listed value, then moves to `matching` and publishes `import.read`
  (`{ importId, kind }`), or to `unreadable` with the adapter's reason. `readImportFile(dependencies, batch)` is the
  check's and the add's one reader, with the kind's limits (`readLimitsOf`); `importFileBytes` fails
  `ATTACHMENT_NOT_FOUND` once the file is withdrawn.
- Guesses (B9, D13, D14): `headerKey(header)`, `guessFields(kind, headers, remembered, { wordsInHeader })` (on for a
  Google Sheet's leads only: Google Forms' own headers, then a word inside the header, S12), and the agency's memory,
  `rememberedFields(tx, kind, keys)`, `rememberedHeaderFields(tx, kind)` (all of a kind's) and
  `rememberHeaderFields(tx, kind, matches, now)` (by header key, the last match winning, safe two at once, B10).
- Matching (B8, B10-B13): `matchImportColumns(tx, access, kind, input, { owners, roleKeys, now })`, from `matching`
  or `checked`: refuses a field on two columns but Note (`FIELD_MATCHED_TWICE`), a lead file without Name and a
  phone, email or Instagram (`IMPORT_NEEDS_NAME_AND_CONTACT`), a staff file without Name, a Username or Email and a
  Role column or role (`IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE`), an owner who can't work leads (`NOT_A_LEAD_WORKER`)
  and a role the agency hasn't (`ROLE_NOT_FOUND`). It keeps each column's field (a changed one loses its guess),
  each changed value as `chosen` and every listed value's row count from the column matched to its field, the
  defaults, every header for next month's file; empties the last check's rows, and moves to `checking` with
  `import.columns-matched` (`{ importId, kind }`). `columnMatchesOf(tx, importId)`: the fields by position.
- Rows (B25-B27): `replaceImportRows(context, importId, plans)` (1,000 a transaction, moving `rows_done`, while the
  import is checking), `markImportChecked(tx, importId, summary, now)`, `importRowsPage(tx, access, kind, input)`
  (examples by plan and first reason, a page after a row number), `rowsToAdd(tx, importId, limit)` (no outcome, a
  plan to add, in row order) and `recordRowOutcomes(tx, importId, outcomes)` (each row once, clearing its password
  hash, moving `rows_done` and `rows_added`).
- Fingerprints (B33, D9): `rowFingerprint(kind, values)`, the SHA-256 of `[kind, ...values]`;
  `earlierFingerprints(tx, kind, fingerprints, exceptImportId)` (by `fingerprintHex`, with when they were added) and
  its `earlierFingerprintsQuery`, `= ANY` on `import_row_fingerprint`.
- The end (B28, B34): `finishImport(context, dependencies, importId, end, alsoInTransaction?)`, only while adding:
  rows never reached become `not_added` with `not_reached`, un-ticked blocked and already imported rows `left_out`;
  with `report`, the report of rows not added (`makeImportReport`: the uploaded format, "Why it wasn't added", "Row",
  then the file's columns, `reportFileName`, stored under the import's id as `import_report`); then one transaction:
  the status, `finished_at`, `import.finished` in the audit log (as the system) and the outbox, the importer's
  notice (`import.finished`, D20) and `alsoInTransaction`. `reportSentence(reason, today)`: the report's words.
- `importReportLink(db, files, access, kind, importId)`: a 5-minute link, recording `import.report-downloaded`;
  `EXPORT_NOT_READY` before the report exists, `EXPORT_EXPIRED` once swept (D33).
- Values (B11): `suggestValueMatches(identity, batch, columns)` (made outside the transaction: identity runs its own),
  `writeValueMatches(tx, batchId, suggestions)`, and `valueTargetsFor(context, identity, batch, field, values)`: each
  value's stored target, else its automatic one (a column of more than fifty values is matched here), else null. A
  value over 200 characters is never listed. `valueFieldsOf[kind]`: owner and stage for leads, role for staff.
- Keeping (B53, B55): `importsToSweep(tx, now, limit, visited)` and `sweepImport(tx, item, now)`, the console's
  hourly sweep, one import a platform transaction (a held one skipped); `withdrawImportFiles(tx, organizationId, now,
forget)`, an erasure's step; `deleteImportFiles` and `emptyKeptValues`, which both use.
- Types: `ImportBatchRow`, `ImportIdentity`, `ImportJobDependencies`, `SweepItem`.

## Rules worth knowing

- An import is its starter's alone (D6): another person's, another kind's or another organization's is `NOT_FOUND`.
  A step asked at another status is `CONFLICT`/`IMPORT_NOT_READY`.
- A job acts as the importer, resolved afresh each run: source `job`, or `impersonation` with support's id when support
  started the import while impersonating, so the audit log shows support as it does on `import.started` (the audit
  log names support exactly on impersonation entries).
- Events, job data, audit snapshots and errors hold ids, counts and codes, never a cell, a file name or a password.
