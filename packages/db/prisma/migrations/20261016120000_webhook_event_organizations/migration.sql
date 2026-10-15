-- AlterTable
ALTER TABLE "webhook_event" ADD COLUMN     "resolved_organization_id" UUID,
ADD COLUMN     "tombstoned_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "webhook_event_resolved_organization_id_idx" ON "webhook_event"("resolved_organization_id");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- The worker records which organization an event was about when it processes it, and nothing else new. Only the
-- platform role tombstones an event (ADR 0013, ADR 0023): it blanks the payload and the headers, keeping the
-- provider's id so a replay of the event is still ignored.
GRANT UPDATE (resolved_organization_id) ON TABLE "webhook_event" TO app_runtime;
ALTER TABLE "webhook_event"
  ADD CONSTRAINT webhook_event_tombstone_blank CHECK (tombstoned_at IS NULL OR (payload = '' AND headers = '{}'::jsonb));
