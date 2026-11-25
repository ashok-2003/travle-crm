# Store a sent file once: pointers instead of byte copies, and a one-off cleanup

Owner-asked, 2026-11-25. Brief: `.superpowers/sdd/2026-11-25-files/brief-store-once.md`.

## Why

`copyFile`/`copyFileIn` ran S3's CopyObject: every WhatsApp send of a brochure, a trip kit's file or the payment QR stored
the file's bytes again and counted them again against the agency's plan storage. One agency's storage filled, and its AI
then refused to send (`STORAGE_LIMIT_REACHED`). A file should be stored once.

## The principle

**Every attachment row keeps behaving exactly as if it had its own copy**: reads, links, access checks, soft delete,
erasure, purge and exports. Sharing bytes is a storage detail inside the files module.

## Design

- **`attachment.stored_as_id`** (uuid, nullable): the attachment whose stored object holds this row's bytes. Null: the
  row holds its own (a *holder*); set: a *pointer*. The foreign key is `(organization_id, stored_as_id)` to
  `attachment (organization_id, id)`, `ON DELETE RESTRICT ON UPDATE RESTRICT`, with an index on
  `(organization_id, stored_as_id)`. Only a holder is ever named: a copy of a pointer names the pointer's holder, so
  there are no chains.
- **Copy** inserts a row with `stored_as_id = source.stored_as_id ?? source.id`, ready at once: no CopyObject, and no
  storage-limit refusal (it adds no bytes). The idempotency stays: the same copy asked for again finds the earlier row (a
  ready one is the answer; a pending one, left by the old CopyObject code, becomes a ready pointer).
- **Reads** turn a row into its bytes' key through one function, `bytesKeyOf(row)` =
  `storageKeyOf({ organizationId, id: row.storedAsId ?? row.id })`: download links (members and system), `systemFile`
  (the AI's file reads, PDFs' logos, imports' files), the WhatsApp sender (it takes a system link), the subject export's
  links and the organization export's copies. Every reader is in the files module; `storageKeyOf` (a row's *own* key)
  is left only to what writes or deletes a row's own object: the presigned upload, its confirm, a generated file's put,
  and the deletions' outbox.
- **Counting:** `bytesStored` counts only holders (`stored_as_id IS NULL`).
- **Soft delete** of a holder is unchanged: its bytes stay, and count, until a purge; its pointers keep working (a read
  of a pointer never needs the holder's row).
- **Hard delete** (`deleteRecordFiles`, every erasure and sweep goes through it):
  - a pointer: its row goes; its holder's bytes are never queued. The outbox deletes by the row's own key, which a
    pointer doesn't use (nothing is stored there, or an orphan from a rolled-back promotion, which should go anyway);
  - a holder whose pointers include rows not deleted in the same step: one survivor is **promoted** (the oldest): its
    holder's object is copied in storage to the survivor's own key, its `stored_as_id` set to null, and the other
    survivors re-pointed to it; only then does the old holder's row go and its bytes get queued. Each copy survives
    its source's deletion, as before;
  - an organization's purge deletes its whole folder and every row in one statement per table: unchanged.
- **The organization export** copies each row's bytes (its holder's object) beside the export under the row's own id,
  so the export holds a standalone copy per row, as before.

## One-off cleanup of copies already stored

`dedupe-files [--apply] [--organization <uuid>]`, a console command of the api image (like `demo`), dry run by default.
Per organization:

1. Group the ready holders (`stored_as_id IS NULL`, removed ones included) by `file_name`, `size_bytes` and
   `content_type`, leaving out the short-lived record types (an import's file and report, an export).
2. Within a group, keep only rows whose stored objects are byte-identical: equal storage ETags (`ObjectStorage.head`
   now returns the ETag; CopyObject keeps it). A row whose object is missing, or has no ETag, is left alone.
3. Choose the holder: a row whose record is not a `whatsapp_message`, else the oldest.
4. Point the others at it (their own pointers re-pointed too, so no chains), and queue their own objects in the
   deletions' outbox, which the console's job empties (the command also runs it at once for that organization).
5. Print counts and bytes freed only, never a name.

## Rulings

- Ruling: the promotion's storage copy runs inside the deleting transaction, so `deleteRecordFiles` and its callers
  take the `ObjectStorage` — the old holder's bytes go only after the commit (the outbox), so a rollback leaves at most
  an orphan copy under the survivor's own key, which that row's own deletion (or the purge's folder) removes; and the
  promoted row is readable the moment the transaction commits — cost if wrong: a slow storage copy lengthens an erasure
  transaction, only when a deleted file is shared, which is rare.
- Ruling: a promotion whose holder's object is missing still promotes (copying nothing) — the survivor was already
  unreadable, and an erasure must not be blocked by a file storage lost — cost if wrong: none beyond the lost file.
- Ruling: the record's rows are read `FOR UPDATE` before a hard delete, and a copy reads its source's holder under
  `FOR SHARE` in the transaction that inserts the pointer — so a copy made at the moment its source is deleted, promoted
  or deduplicated waits and then names the right holder (or finds the source gone), and never makes a chain or names a
  holder whose bytes are queued — cost if wrong: a pointer to bytes about to be deleted.
- Ruling: the cleanup compares ETags, not bytes — every object here is a single-part upload or put, whose ETag is the
  MD5 of its bytes on S3 and R2, and the size and type must match too — cost if wrong: a false match would point a file
  at different bytes of the same name, size and type, which an MD5 collision alone could cause.
- Ruling: the cleanup leaves out the short-lived record types (import files and reports, exports) — they are deleted
  within days anyway, and they are never copied (CSV and .xlsx go only to an import), so their deletion never meets a
  shared file — cost if wrong: none; they free themselves.
- Ruling: the copy keeps `sensitive` from its source (unchanged), and every access check reads the row's own flags —
  sharing bytes changes no permission — cost if wrong: none.
