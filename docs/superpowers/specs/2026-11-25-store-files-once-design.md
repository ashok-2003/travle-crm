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

## Addendum (2026-11-25): generated and downloaded files are stored once too

The owner's storage report for Arrow Trips: of 5.5 GB of WhatsApp files, 4.9 GB are files staff sent from their own
phone (echoes the media job downloads one by one through `storeGeneratedFile`), 488 MB the AI's and automations' sends
(copies) and 96 MB customers' media; 67 distinct files took 924 copies, one stored 101 times. Pointers on copy alone
would fix only the 488 MB, so:

- **`attachment.content_sha256`** (hex text, nullable, indexed with `organization_id`): the SHA-256 of a holder's bytes,
  set only where the server had them (a generated or downloaded file, or a holder the clean-up read).
- **`storeGeneratedFile` stores once** (`files/generated.ts`): it hashes the bytes it already has, and before uploading
  looks for a live holder in the same organization with the same `size_bytes` and `content_sha256` (ready,
  `stored_as_id IS NULL`, the oldest), read under a share lock. Found: the row becomes a pointer to it and nothing is
  uploaded. Not found: it uploads as before and keeps the hash on the new holder. Pointers keep no hash. Same rules as
  copies: they count nothing, reads use the holder's key, and a holder hands its bytes (and its hash) on at a hard
  delete. The media job's idempotency holds: a retry under the message's id finds its row, ready or pending.
- **The clean-up groups by `size_bytes` and `content_type`**, not by name (a phone sends a file under any name); equal
  ETags stay the gate. Each set's holder gets `content_sha256` from its bytes, read once through the port when
  applying, so files sent again later find it.

## One-off cleanup of copies already stored

`dedupe-files [--apply] [--organization <uuid>]`, a console command of the api image (like `demo`), dry run by default.
Per organization:

1. Group the ready holders (`stored_as_id IS NULL`, removed ones included) by `size_bytes` and `content_type` (not by
   name, per the addendum), leaving out the short-lived record types (an import's file and report, an export).
2. Within a group, keep only rows whose stored objects are byte-identical: equal storage ETags (`ObjectStorage.head`
   now returns the ETag; CopyObject keeps it). A row whose object is missing, or has no ETag, is left alone.
3. Choose the holder: a live row (not removed) on a record that lasts (not an AI input), not a `whatsapp_message` if
   another will do, then the oldest (review round 1).
4. Point the others at it (their own pointers re-pointed too, so no chains), keep the bytes' SHA-256 on the holder (read
   once), and queue the others' own objects in the deletions' outbox, due once every link handed out for them has
   lapsed (`LINKS_LAPSED_MS`, 20 minutes), which the console's job empties.
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
- Ruling (review round 1): an object freed by the clean-up or a hand-over is deleted 20 minutes later
  (`LINKS_LAPSED_MS`), longer than every link the product signs (5 minutes for a download, 15 for an export's files),
  so a link already handed out keeps working — cost if wrong: the space frees 20 minutes later.
- Ruling (review round 1, I1): the outbox job holds a queued attachment's row (`FOR SHARE`) while storage deletes its
  object, and skips the delete when the row holds its own bytes again; a hand-over locks its heir (`FOR UPDATE`) and
  cancels the heir's queued deletion before copying — so the job never deletes bytes a hand-over just gave the heir, in
  either order — cost if wrong: an heir left with no bytes.
- Ruling: the hash is hex text and lives on holders only; a generated file matches only a live holder (a removed file's
  bytes are not reused) and only by size plus SHA-256, not by type or name — a removed file is on its way out, and the
  same bytes are the same file whatever a phone calls it — cost if wrong: an extra stored copy after a removal.
- Ruling: short-lived generated files (an import's report, an export) are stored apart with no hash — they go within
  days, and keeping them apart keeps their sweeps free of hand-overs — cost if wrong: none.
- Ruling: two generated stores of the same new bytes at the same moment may both upload, making two holders — no lock
  is worth it for that; the next store matches the oldest, and the clean-up can join them — cost if wrong: one extra
  copy.
- Ruling (review round 1): only a row `storeGeneratedFile` creates may share; a retry's pending row is stored under its
  own key again, and an upload always writes `stored_as_id = NULL` — the failed try may already have filled that key,
  and a racing retry must not leave a hash on a sharing file — cost if wrong: a retried file is stored once more.
- Ruling (review round 1, accepted): a copy and an erasure of the same shared file at the same moment can deadlock;
  Postgres aborts one. The AI's reply turn, the keyword trip-kit send and the erasure job retry through pg-boss; the AI's
  follow-up nudge, a member's Send details, Save as package and `dedupe-files --apply` don't, and each is safe to
  repeat. The data stays right either way — making every path take its locks in one order costs more than this rare
  retry — cost if wrong: a member taps again.
- Ruling (review round 1, accepted): an organization export running during `dedupe-files --apply` can miss a sharer
  its job copies more than 20 minutes after the apply, once the sharer's own object is gone — the command's README
  says not to apply while an export runs — cost if wrong: one file missing from that export.
- Ruling (review round 1, accepted): `--apply` finds the sets again rather than replaying what the dry run printed —
  files change in between, and each set is checked again under lock anyway — cost if wrong: the counts differ a little.
- Ruling (review round 1, accepted): a file stored before this release has no hash, and uploads confirmed from the
  browser are never hashed, so the same bytes can still be stored once more — running the clean-up again later joins
  them — cost if wrong: some extra copies until then.
