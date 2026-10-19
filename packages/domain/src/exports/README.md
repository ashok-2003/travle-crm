# exports

Taking an agency's leads and staff out as files (release 2, spec 4.6, 4.8; layer L0). An export (`data_export`) is
asked for with a format and, for leads, the list's filter as the person sent it; the worker makes its file a page at a
time and keeps it 24 hours for its requester alone. crm (L1) supplies the lead export's rows; identity the staff's.

## Public functions (`index.ts`)

- `startExport(tx, access, kind, { format, filter }, now)`: a `making` export of the requester's, and
  `export.requested` (`{ exportId, kind }`).
- `exportDetail(tx, access, kind, exportId)`: the export's page (its state, its file while kept, the stored filter);
  another person's, kind's or organization's is `NOT_FOUND`.
- `exportDownloadLink(db, files, access, kind, exportId, now)`: a 5-minute link while ready and within 24 hours,
  recording `export.downloaded`; `EXPORT_NOT_READY` before, `EXPORT_EXPIRED` after (D33).
- `runExport(event, context, dependencies, source)`: what a kind's listener calls with its `ExportSource` (its
  permission, sheet, columns, file name, stored filter's reader, row limit, `count`, `page`, `auditFilter` and
  `keptFilter`). It acts only on a `making` export of the source's kind. It resolves the requester's access afresh
  (`no_longer_a_member`, `lost_permission`), counts (`too_many_rows` past the limit), writes the pages into one file
  (`rows_done` a page at a time), stores it with `storeGeneratedFile` under the export's id (record type
  `data_export`), then in one transaction: `ready` until 24 hours on, the search emptied, `export.made`
  (`{ kind, format, rows, filter }`, the filter by ids and fixed values, `searched: true` for a search) in the audit
  log and the outbox, and `export.ready` to the requester, as the system (D20). A failure empties the search too.
- `makeStaffExportListener(dependencies)`: `exports.make-staff-export` on `export.requested`, the staff export's;
  until the staff branch builds it, it ignores the leads' exports and refuses a staff one.
- `findExport`, `holdExport`, `EXPORT_KEPT_MS`. Types: `ExportSource`, `ExportIdentity`, `ExportJobDependencies`,
  `DataExportRow`.

## Rules worth knowing

- Two listeners share `export.requested`, each acting on its own kind.
- The job acts as the requester: source `job`, or `impersonation` with support's id when support asked for the export
  while impersonating, as the audit log names support.
- Audit entries and events hold ids, counts and fixed values: never the search's text, a row or a file's name.
