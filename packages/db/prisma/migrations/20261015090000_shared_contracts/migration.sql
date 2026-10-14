-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- CreateTable
CREATE TABLE "outbox_event" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relayed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_event_unrelayed" ON "outbox_event"("organization_id", "id") WHERE ("relayed_at" IS NULL);

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('outbox_event');

-- Event types read "<entity>.<what happened>", e.g. "document.issued"; a payload is a JSON object.
ALTER TABLE "outbox_event"
  ADD CONSTRAINT outbox_event_type_format CHECK (type ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT outbox_event_payload_object CHECK (jsonb_typeof(payload) = 'object');

-- An event is a fact: the api and worker may record that it was relayed, and change or delete nothing else.
REVOKE UPDATE, DELETE ON TABLE "outbox_event" FROM app_runtime;
GRANT UPDATE (relayed_at) ON TABLE "outbox_event" TO app_runtime;
