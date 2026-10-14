-- CreateTable
CREATE TABLE "attachment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_organization_id_record_type_record_id_idx" ON "attachment"("organization_id", "record_type", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_organization_id_id_key" ON "attachment"("organization_id", "id");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('attachment');

-- Record types are lower-case words with underscores, e.g. issued_document; sizes are positive; an attachment is
-- pending until its file is confirmed in storage, and confirmed exactly when it is ready.
ALTER TABLE "attachment"
  ADD CONSTRAINT attachment_record_type_format CHECK (record_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT attachment_size_positive CHECK (size_bytes > 0),
  ADD CONSTRAINT attachment_status_value CHECK (status IN ('pending', 'ready')),
  ADD CONSTRAINT attachment_confirmed_when_ready CHECK ((status = 'ready') = (confirmed_at IS NOT NULL));

-- Soft-deleted (ADR 0004): only the platform role's purge removes rows, together with their stored files.
REVOKE DELETE ON TABLE "attachment" FROM app_runtime;
