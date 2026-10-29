-- The autopilot writes notes on leads, sends the agency's media and its payment details, follows the agency's strict
-- rules and takes bookings with the customer's payment proof; and the owner chooses who on the team gets email and a
-- copy of every team alert (the owner, 2026-10-29). Additive: columns with defaults and three new tables; nothing the
-- running version reads changes.

ALTER TABLE "ai_autopilot"
  ADD COLUMN "lead_notes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "send_media" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "payment_details" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "strict_rules" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_autopilot"
  ADD CONSTRAINT ai_autopilot_payment_details_length CHECK (char_length(payment_details) <= 2000),
  ADD CONSTRAINT ai_autopilot_strict_rules_length CHECK (char_length(strict_rules) <= 4000);

ALTER TABLE "lead_note" ADD COLUMN "by_ai" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_media" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "when_to_send" TEXT NOT NULL DEFAULT '',
    "attachment_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "ai_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_booking" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "proof_message_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_routing" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "email_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "copy_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_routing_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_media_organization_id_id_key" ON "ai_media"("organization_id", "id");

-- CreateIndex
CREATE INDEX "ai_booking_by_lead" ON "ai_booking"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "ai_booking_by_chat" ON "ai_booking"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_booking_organization_id_id_key" ON "ai_booking"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_media" ADD CONSTRAINT "ai_media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_routing" ADD CONSTRAINT "notification_routing_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_media"
  ADD CONSTRAINT ai_media_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT ai_media_when_to_send_length CHECK (char_length(when_to_send) <= 400);
ALTER TABLE "ai_booking"
  ADD CONSTRAINT ai_booking_status_value CHECK (status IN ('awaiting_payment', 'proof_received', 'confirmed', 'cancelled')),
  ADD CONSTRAINT ai_booking_summary_length CHECK (char_length(summary) BETWEEN 1 AND 300),
  ADD CONSTRAINT ai_booking_details_object CHECK (jsonb_typeof(details) = 'object');

-- Media is soft-deleted, a booking confirmed or cancelled and the routing replaced: the runtime role deletes none of them.
-- A customer's erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "ai_media", "ai_booking", "notification_routing" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_media');
SELECT app_enable_org_rls('ai_booking');
SELECT app_enable_org_rls('notification_routing');
