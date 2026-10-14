-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headers" JSONB NOT NULL,
    "payload" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_provider_event_id_key" ON "webhook_event"("provider", "provider_event_id");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Provider names are path segments; ids and types are short; kept headers are a JSON object.
ALTER TABLE "webhook_event"
  ADD CONSTRAINT webhook_event_provider_format CHECK (provider ~ '^[a-z][a-z0-9-]{1,31}$'),
  ADD CONSTRAINT webhook_event_provider_event_id_length CHECK (char_length(provider_event_id) BETWEEN 1 AND 255),
  ADD CONSTRAINT webhook_event_event_type_length CHECK (char_length(event_type) BETWEEN 1 AND 255),
  ADD CONSTRAINT webhook_event_headers_object CHECK (jsonb_typeof(headers) = 'object'),
  ADD CONSTRAINT webhook_event_attempts_not_negative CHECK (attempts >= 0);
