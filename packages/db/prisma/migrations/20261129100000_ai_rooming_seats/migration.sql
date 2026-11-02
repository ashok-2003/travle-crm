-- AI part 3 (release ai3): rooming requests read by the AI and AI-written messages that offer a departure's empty seats. Additive:
-- one table (a message sent to a lead about a departure, with no words in it), a switch on the departure settings, and two more
-- values for what an AI fill is for. Nothing the running version reads changes.

ALTER TABLE "departure_settings" ADD COLUMN "share_seat_counts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "departure_offer" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "drafted_by" UUID NOT NULL,
    "fill_id" UUID,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departure_offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departure_offer_organization_id_id_key" ON "departure_offer"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_offer_once" ON "departure_offer"("organization_id", "departure_id", "lead_id");

-- CreateIndex
CREATE INDEX "departure_offer_lead" ON "departure_offer"("organization_id", "lead_id");

-- AddForeignKey
ALTER TABLE "departure_offer" ADD CONSTRAINT "departure_offer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_offer" ADD CONSTRAINT "departure_offer_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_offer" ADD CONSTRAINT "departure_offer_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- What a fill is for: the rooming requests the AI read on a departure, and the message offering a lead its empty seats.
ALTER TABLE "ai_fill" DROP CONSTRAINT ai_fill_target_value;
ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_target_value CHECK (target IN ('lead', 'lead_edit', 'quote', 'call_note', 'room_requests', 'departure_offer'));

-- An offer is kept as the record of who was asked and when: the runtime role does not delete it. A customer's erasure and
-- the purge, the platform's, do.
REVOKE DELETE ON TABLE "departure_offer" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('departure_offer');
