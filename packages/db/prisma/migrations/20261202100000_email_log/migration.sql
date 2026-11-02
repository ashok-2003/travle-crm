-- The email log (the owner, 2026-11-02; the failed-emails spec): every email the product sends, as sent, so the
-- console lists the ones that failed and sends them again. Only adds.

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "source_ref" TEXT,
    "to_address" TEXT NOT NULL,
    "to_name" TEXT,
    "from_name" TEXT NOT NULL,
    "reply_to" TEXT,
    "subject" TEXT NOT NULL,
    "text_body" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'sending',
    "failure_source" TEXT,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "resent_from_id" UUID,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_log_failed" ON "email_log"("id" DESC) WHERE ("status" = 'failed');

-- CreateIndex
CREATE INDEX "email_log_created" ON "email_log"("created_at");

-- CreateIndex
CREATE INDEX "email_log_source_ref" ON "email_log"("source_ref");

-- CreateIndex
CREATE INDEX "email_log_resent_from" ON "email_log"("resent_from_id");

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_resent_from_id_fkey" FOREIGN KEY ("resent_from_id") REFERENCES "email_log"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A purpose is lower-case words joined by hyphens; a failed row, and only a failed row, says where it failed, how and
-- when; a sent row says when. The provider's reason is cut to 1,000 characters before it is stored.
ALTER TABLE "email_log"
  ADD CONSTRAINT email_log_purpose_format CHECK (purpose ~ '^[a-z][a-z-]*$' AND char_length(purpose) <= 40),
  ADD CONSTRAINT email_log_source_ref_length CHECK (char_length(source_ref) BETWEEN 1 AND 200),
  ADD CONSTRAINT email_log_status_value CHECK (status IN ('sending', 'sent', 'failed')),
  ADD CONSTRAINT email_log_failure_source_value CHECK (failure_source IN ('smtp', 'provider')),
  ADD CONSTRAINT email_log_failure
    CHECK ((status = 'failed') = (failure_source IS NOT NULL AND failure_code IS NOT NULL AND failed_at IS NOT NULL)),
  ADD CONSTRAINT email_log_failure_code_length CHECK (char_length(failure_code) BETWEEN 1 AND 100),
  ADD CONSTRAINT email_log_failure_reason_length CHECK (char_length(failure_reason) <= 1000),
  ADD CONSTRAINT email_log_sent_at CHECK (status <> 'sent' OR sent_at IS NOT NULL),
  ADD CONSTRAINT email_log_headers_object CHECK (jsonb_typeof(headers) = 'object');

-- The api, the worker and the console record a send and then its outcome: the runtime role inserts, and may change
-- only the outcome, never what was sent, and deletes nothing. The platform role reads (the console's list) and deletes
-- (the purge, an erasure), and writes nothing: a resend is recorded by the console's runtime connection like any send.
-- A purge's ON DELETE SET NULL runs as the table's owner.
REVOKE UPDATE, DELETE ON TABLE "email_log" FROM app_runtime;
GRANT UPDATE (status, failure_source, failure_code, failure_reason, sent_at, failed_at) ON TABLE "email_log" TO app_runtime;
REVOKE INSERT, UPDATE, TRUNCATE ON TABLE "email_log" FROM app_platform;
