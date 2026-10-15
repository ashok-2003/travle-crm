# 0011: Files and storage

Date: 2026-10-15 · Status: accepted · Implements spec section 9.2 and the sensitive flag of section 5

## Decision

- **Object storage behind the `ObjectStorage` port** (ADR 0008): `createS3Storage` for AWS S3 or any S3-compatible
  server, `createMemoryStorage` for tests. One contract test runs against both, the S3 one on MinIO in a container,
  so tests that use the in-memory adapter rely on checked behaviour.
- **Files go straight between the browser and storage.** An upload is a presigned `PUT` (10 minutes) whose
  `Content-Type` and `Content-Length` are signed: storage refuses a file of another size or type. A download is a
  presigned `GET` (5 minutes) that saves the file under its own name (`Content-Disposition` with an RFC 6266
  `filename*` for names in any script, and a sanitised ASCII fallback). The api never streams file bytes.
- **One `attachment` table links a file to any record** (`record_type`, `record_id`). A row starts `pending` and
  becomes `ready` when `confirmUpload` finds the promised size and type in storage (a check constraint ties `ready`
  to `confirmed_at`). Only ready files are listed or downloadable.
- **Storage keys are derived, not stored**: `organizations/<organization id>/attachments/<attachment id>`. A row
  can't point at another organization's file, because the key comes from the row's own organization and id.
- **Sensitive files** (passports, Aadhaar) have `sensitive = true`; a download link needs `documents:view_sensitive`
  (Owner, Admin and Operations by default). Trusted server code (share links) gets links only to ordinary files.
- **Storage is counted per organization**: every attachment row's size, deleted ones included, because their bytes
  stay stored until a purge. `requestUpload` refuses past the limit that `storageLimitBytes` returns (plan 4 passes
  the plan's limit). Files the server makes (rendered PDFs) count but are never refused: an invoice must render.
- **Attachments are soft-deleted** (ADR 0004): `app_runtime` has no DELETE grant; the platform's purge and erasure
  (plan 4, ADR 0022) remove rows and queue their stored files in the deletions' outbox, which the console's job
  empties. The port's `delete` and `deletePrefix` (one organization's folder, `organizations/<id>/`, 1,000 keys a
  request) are for that alone.
- **Uploads allowed**: PDF, JPEG, PNG, WebP and HEIC, up to 25 MB, names without folders, control or bidi
  characters (`@travel-crm/contracts/files`). SVG and HTML are refused: they can carry scripts.
- **Operations name their record.** `confirmUpload`, `downloadLink` and `remove` take
  `{ recordType, recordId, attachmentId }`; a file of another record is "not found", so a router that authorised one
  record can't be handed another's file. Only `systemDownloadLink` (server code, ordinary files only) takes the id
  alone. Sensitive files also hide their name from listings and from `confirmUpload` unless the member holds
  `documents:view_sensitive`, and only such members may remove them.
- **Uploads can't overwrite.** The presigned `PUT` signs `If-None-Match: *`, so storage refuses (412) a second upload
  to a key that holds a file, after `confirmUpload` has checked it. Keys are validated in both adapters (no empty,
  absolute, dotted or control-character keys). A client whose retried PUT gets 412 knows the first one arrived and
  calls `confirmUpload`, which is idempotent.
- **A missing bucket is an error, not "no such key".** `get` answers null only for `NoSuchKey`; `head` only for
  `NotFound` (S3 sends no body on a HEAD 404, so a wrong bucket looks the same there). The S3 adapter's
  `checkBucket()` runs at start-up to catch a wrong bucket name.
- **Deployment requirements.** Static access keys for now (no instance or task roles). The bucket must have ACLs
  disabled (Bucket owner enforced), because unsigned `x-amz-acl` headers could ride on a presigned `PUT`; plan 5's
  deploy checklist repeats this. The credentials need `s3:ListBucket`, or `head` on a missing key gets 403.
  - **"Deleted for good" needs the right bucket.** On a versioned bucket a delete only adds a delete marker and the
    file stays, passports included. The bucket must be unversioned, or have a lifecycle rule that expires noncurrent
    versions and expired delete markers (within a day): plan 5's deploy checklist states which.
  - **Only the console process deletes.** Its jobs (the purge, the erasure, the deletions' outbox, the platform's own
    exports) are the only callers of `delete` and `deletePrefix`. Give `s3:DeleteObject` to the console's access keys
    alone; the api's and the worker's need `s3:PutObject`, `s3:GetObject` and `s3:ListBucket`. Today the three
    processes read the same storage settings, so the console needs its own keys in its environment.
- **Locally, MinIO** from the community build `pgsty/minio`, because MinIO no longer publishes images. The adapter
  is plain S3, so another S3-compatible image is a one-line swap.
- **The AWS SDK's checksums are off unless required** (`requestChecksumCalculation: "WHEN_REQUIRED"`). Otherwise it
  signs a checksum of an empty body into presigned uploads, which S3 then refuses for the real file.

## Context

- **Why a confirm step.** The api never sees the bytes, so it can't know an upload finished. Until `confirmUpload`
  checks storage, the file is pending and invisible; an abandoned upload leaves a pending row and maybe an object,
  both swept by a later cleanup job.
- **Why server-made files are written row first.** `storeGeneratedFile` inserts a pending row, uploads, then marks
  it ready. A failed upload leaves an invisible pending row rather than a stored file no row accounts for.
- **Why the limit check isn't locked.** Two uploads at the same moment can both pass the check; a plan's storage
  limit is commercial, not a safety rule, and the next upload is refused.

## Consequences

- The bucket needs CORS rules allowing `PUT` from the web app's origin before browsers can upload (plan 5).
- Later: malware scanning before a file becomes ready (spec 9.2), and a job that sweeps pending uploads older than a
  day. Each attachment's record module decides who may attach and see files on its records.
