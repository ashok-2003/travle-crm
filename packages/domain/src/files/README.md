# files

Files attached to any record, kept in object storage and counted per organization (spec 9.2). Traveller ID
documents are marked sensitive (spec 5).

## Public functions and values (`index.ts`)

- `createFiles({ db, storage, storageLimitBytes? })` builds the module. `storage` is an `ObjectStorage` from
  `@travel-crm/integrations/storage` (S3 in the api and worker, the in-memory one in tests); `storageLimitBytes`
  gives an organization's limit (plan 4 passes its plan's), and without it there is none. The `Files` it returns has:
  - `requestUpload(actor, input)`: records a pending file and returns it with the presigned upload (10 minutes) the
    browser sends the file to, with the headers it must send unchanged. Refuses `LIMIT_REACHED`/`STORAGE_LIMIT_REACHED`
    past the storage limit;
  - `confirmUpload(actor, { attachmentId })`: marks it ready once storage holds the promised size and type
    (`NOT_FOUND`/`UPLOAD_NOT_FOUND`, `VALIDATION`/`UPLOAD_DOES_NOT_MATCH`); harmless to repeat;
  - `downloadLink(member, { attachmentId })`: a 5-minute link that saves the file under its name; a sensitive file
    needs `documents:view_sensitive` (`FORBIDDEN`/`MISSING_PERMISSION`);
  - `list(actor, { recordType, recordId })`: the record's ready files, sensitive ones marked;
  - `remove(actor, { attachmentId })`: a soft delete;
  - `storeGeneratedFile(actor, file)`: stores a file the server made (a rendered PDF) and returns it ready;
  - `systemDownloadLink(organizationId, { attachmentId })`: for server code that has already decided the viewer may
    see the file (share links); refuses sensitive files (`FORBIDDEN`/`SENSITIVE_FILE`);
  - `storageUsedBytes(organizationId)`.
- Types: `Files`, `FilesDependencies`, `GeneratedFile`, `DownloadLink`. Inputs and outputs are in
  `@travel-crm/contracts/files`.

## Events

None yet.

## Rules worth knowing

- The calling module checks that the actor may see or change the record; this module checks organization,
  readiness and sensitivity. Another organization's file is always "not found".
- A file's storage key is `organizations/<organization id>/attachments/<attachment id>`, made from the row and never
  stored, so a row can't point at another organization's file.
- Pending files (uploads not yet confirmed) are never listed or downloadable.
- Deleted files stay in storage, and count toward the limit, until the platform's purge.
