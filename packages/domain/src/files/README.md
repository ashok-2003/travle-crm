# files

Files attached to any record, kept in object storage and counted per organization (spec 9.2). Traveller ID
documents are marked sensitive (spec 5).

## Public functions and values (`index.ts`)

- `createFiles({ db, storage, storageLimitBytes? })` builds the module. `storage` is an `ObjectStorage` from
  `@travel-crm/integrations/storage` (S3 in the api and worker, the in-memory one in tests); `storageLimitBytes`
  gives an organization's limit (plan 4 passes its plan's), and without it there is none. The `Files` it returns has:
  - `requestUpload(actor, input)`: records a pending file and returns it with the presigned upload (10 minutes) the
    browser sends the file to, with the headers it must send unchanged. Refuses `LIMIT_REACHED`/`STORAGE_LIMIT_REACHED`
    past the storage limit, and `FORBIDDEN`/`SYSTEM_OWNED_FILE` for a system-owned record type (only
    `storeGeneratedFile` writes those);
  - `confirmUpload(actor, { recordType, recordId, attachmentId })`: marks it ready once storage holds the promised
    size and type (`NOT_FOUND`/`UPLOAD_NOT_FOUND`, `VALIDATION`/`UPLOAD_DOES_NOT_MATCH`); harmless to repeat, which is
    the answer to a retried PUT that storage refuses with 412 (the first arrived). Like `list`, it shows a sensitive
    file's real name only to members with `documents:view_sensitive`;
  - `downloadLink(member, { recordType, recordId, attachmentId })`: a 5-minute link that saves the file under its
    name; a sensitive file needs `documents:view_sensitive` (`FORBIDDEN`/`MISSING_PERMISSION`);
  - `list(actor, { recordType, recordId })`: the record's ready files, sensitive ones marked; a sensitive file's name
    shows only to members with `documents:view_sensitive`, others (and the system) see "Sensitive file";
  - `remove(actor, { recordType, recordId, attachmentId })`: a soft delete; only members with
    `documents:view_sensitive` may remove a sensitive file (the system may not), and no one may remove a file of a
    system-owned record type, today `issued_document` (`FORBIDDEN`/`SYSTEM_OWNED_FILE`);
  - `storeGeneratedFile(actor, file)`: stores a file the server made (a rendered PDF) and returns it ready. With a
    chosen `attachmentId` a retry stores it once (`CONFLICT`/`ATTACHMENT_ID_IN_USE` if the id belongs to another
    record, organization or a deleted file); a retry after a failed upload completes the pending row with its own
    size and type; the name must pass `attachmentFileName` (`VALIDATION`/`INVALID_FILE_NAME`);
  - `systemDownloadLink(organizationId, { attachmentId })`: for server code that has already decided the viewer may
    see the file (share links); refuses sensitive files (`FORBIDDEN`/`SENSITIVE_FILE`);
  - `storageUsedBytes(organizationId)`.
- Types: `Files`, `FilesDependencies`, `GeneratedFile`, `DownloadLink`. Inputs and outputs are in
  `@travel-crm/contracts/files`.

- Permanent deletion, for the platform's purge and erasure (spec 5, ADR 0023), in a platform transaction. The bytes
  can't go inside it, so each function queues them in the deletions' outbox (`stored_file_deletion`, ids only) in the
  same transaction:
  - `queueOrganizationFileDeletion(tx, organizationId, now)`: a purge's, before its rows go. Queues the whole storage
    folder, due at once and again after `LATE_WRITES_MS` (15 minutes, once upload links handed out before the purge
    have lapsed), and returns how many files the organization's rows held, removed ones and unfinished uploads
    included;
  - `deleteRecordFiles(tx, { organizationId, recordType, recordId }, now)`: an erasure's. Deletes the record's rows,
    removed ones included, queues each file's bytes due at `now`, and returns how many went. A system-owned record's
    files are refused (`FORBIDDEN`/`SYSTEM_OWNED_FILE`);
  - for the job that empties the outbox: `dueFileDeletions(tx, { now, limit, organizationId? })`,
    `deleteQueuedFile(storage, deletion)` (the file, or the whole folder, `organizationFolder(id)`),
    `forgetFileDeletion(tx, id)` and `nextFileDeletionDue(tx, organizationId?)`. Each is safe to repeat.
- Exports: `exportedFiles(tx, storage, where, linkSeconds)` (files with download links). `bytesStored(tx)`: the
  storage used.

## Events

None yet.

## Rules worth knowing

- The calling module checks that the actor may see or change the record; this module checks organization,
  record, readiness and sensitivity. Another organization's file, or another record's, is always "not found":
  confirm, download and remove take the record along with the id.
- A file's storage key is `organizations/<organization id>/attachments/<attachment id>`, made from the row and never
  stored, so a row can't point at another organization's file.
- Pending files (uploads not yet confirmed) are never listed or downloadable.
- Deleted files stay in storage, and count toward the limit, until the platform's purge.
- The outbox holds an organization's id and an attachment's id, never a key or a name: the key is made from them, as
  for any file. A row stays until storage has confirmed the delete, so a storage error or a restart after the
  platform's transaction delays a file's deletion and never forgets it.
