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
- **Attachments are soft-deleted** (ADR 0004): `app_runtime` has no DELETE grant; the platform's purge (plan 4)
  removes rows and their stored files together.
- **Uploads allowed**: PDF, JPEG, PNG, WebP and HEIC, up to 25 MB, names without folders, control or bidi
  characters (`@travel-crm/contracts/files`). SVG and HTML are refused: they can carry scripts.
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
- Later: malware scanning before a file becomes ready (spec 9.2), a job that sweeps pending uploads older than a day,
  and the purge (plan 4). Each attachment's record module decides who may attach and see files on its records.
