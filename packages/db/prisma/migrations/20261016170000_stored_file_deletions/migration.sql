-- CreateTable
CREATE TABLE "stored_file_deletion" (
    "id" UUID NOT NULL,
    "target_organization_id" UUID NOT NULL,
    "attachment_id" UUID,
    "due_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_file_deletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_file_deletion_due_at_id_idx" ON "stored_file_deletion"("due_at", "id");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- The deletions' outbox (ADR 0023): the console's purge and erasure add rows in their own transactions, and its job
-- removes each once the file is gone. The api and worker have no business with it, and nobody changes a row.
REVOKE ALL ON TABLE "stored_file_deletion" FROM app_runtime;
REVOKE UPDATE, TRUNCATE ON TABLE "stored_file_deletion" FROM app_platform;
