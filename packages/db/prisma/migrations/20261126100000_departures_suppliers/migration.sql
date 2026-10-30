-- Release 7a, departures and suppliers: group departures with seats, holds, a waitlist and a rooming list; suppliers with
-- contacts; and the costs linked to them. Additive: new tables, new nullable columns (quote.departure_id, booking.departure_id,
-- trip_cost.departure_id and supplier_id, two room fields on a traveller), and trip_cost.quote_id becomes nullable under a
-- CHECK that a cost belongs to exactly one of a booking and a departure (owner, 2026-10-30). Nothing the running version reads
-- changes meaning: every existing cost keeps its quote.

-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "departure_id" UUID;

-- AlterTable
ALTER TABLE "booking_traveller" ADD COLUMN     "room_note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "room_request" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "departure_id" UUID;

-- AlterTable
ALTER TABLE "trip_cost" ADD COLUMN     "departure_id" UUID,
ADD COLUMN     "supplier_id" UUID,
ALTER COLUMN "quote_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "departure" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "destination_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "price_paise" BIGINT,
    "cutoff_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "cancelled_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "departure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_hold" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "booking_id" UUID,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "departure_hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_waitlist" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_stay" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "hotel_name" TEXT NOT NULL,
    "supplier_id" UUID,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "rooming_document_id" UUID,
    "rooming_fingerprint" TEXT,

    CONSTRAINT "departure_stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_room" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "ground_floor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "departure_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_room_assignment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "traveller_id" UUID NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "departure_room_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "hold_hours" INTEGER NOT NULL DEFAULT 48,
    "filling_fast_percent" INTEGER NOT NULL DEFAULT 20,
    "default_room_capacity" INTEGER NOT NULL DEFAULT 2,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departure_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "payment_terms" TEXT NOT NULL DEFAULT '',
    "payment_details" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contact" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "supplier_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_by_start" ON "departure"("organization_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "departure_organization_id_id_key" ON "departure"("organization_id", "id");

-- CreateIndex
CREATE INDEX "departure_hold_by_departure" ON "departure_hold"("organization_id", "departure_id", "status");

-- CreateIndex
CREATE INDEX "departure_hold_due" ON "departure_hold"("organization_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "departure_hold_lead" ON "departure_hold"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_hold_organization_id_id_key" ON "departure_hold"("organization_id", "id");

-- CreateIndex
CREATE INDEX "departure_waitlist_lead" ON "departure_waitlist"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_waitlist_organization_id_id_key" ON "departure_waitlist"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_waitlist_once" ON "departure_waitlist"("organization_id", "departure_id", "lead_id");

-- CreateIndex
CREATE INDEX "departure_stay_departure" ON "departure_stay"("organization_id", "departure_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_stay_organization_id_id_key" ON "departure_stay"("organization_id", "id");

-- CreateIndex
CREATE INDEX "departure_room_stay" ON "departure_room"("organization_id", "stay_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_room_organization_id_id_key" ON "departure_room"("organization_id", "id");

-- CreateIndex
CREATE INDEX "departure_room_assignment_room" ON "departure_room_assignment"("organization_id", "room_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_room_assignment_organization_id_id_key" ON "departure_room_assignment"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_room_assignment_once" ON "departure_room_assignment"("organization_id", "stay_id", "traveller_id");

-- CreateIndex
CREATE INDEX "supplier_by_kind" ON "supplier"("organization_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_organization_id_id_key" ON "supplier"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_live_name" ON "supplier"("organization_id", "name") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "supplier_contact_supplier" ON "supplier_contact"("organization_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_contact_organization_id_id_key" ON "supplier_contact"("organization_id", "id");

-- CreateIndex
CREATE INDEX "booking_departure" ON "booking"("organization_id", "departure_id");

-- CreateIndex
CREATE INDEX "trip_cost_departure" ON "trip_cost"("organization_id", "departure_id");

-- CreateIndex
CREATE INDEX "trip_cost_supplier" ON "trip_cost"("organization_id", "supplier_id");

-- CreateIndex
CREATE INDEX "departure_hold_booking" ON "departure_hold"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_hold_one_active" ON "departure_hold"("organization_id", "departure_id", "lead_id") WHERE ("status" = 'active');

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure" ADD CONSTRAINT "departure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure" ADD CONSTRAINT "departure_organization_id_destination_id_fkey" FOREIGN KEY ("organization_id", "destination_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_hold" ADD CONSTRAINT "departure_hold_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_hold" ADD CONSTRAINT "departure_hold_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_hold" ADD CONSTRAINT "departure_hold_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_hold" ADD CONSTRAINT "departure_hold_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_waitlist" ADD CONSTRAINT "departure_waitlist_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_waitlist" ADD CONSTRAINT "departure_waitlist_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_waitlist" ADD CONSTRAINT "departure_waitlist_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_stay" ADD CONSTRAINT "departure_stay_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_stay" ADD CONSTRAINT "departure_stay_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_stay" ADD CONSTRAINT "departure_stay_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "supplier"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_stay" ADD CONSTRAINT "departure_stay_organization_id_rooming_document_id_fkey" FOREIGN KEY ("organization_id", "rooming_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room" ADD CONSTRAINT "departure_room_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room" ADD CONSTRAINT "departure_room_organization_id_stay_id_fkey" FOREIGN KEY ("organization_id", "stay_id") REFERENCES "departure_stay"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room_assignment" ADD CONSTRAINT "departure_room_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room_assignment" ADD CONSTRAINT "departure_room_assignment_organization_id_stay_id_fkey" FOREIGN KEY ("organization_id", "stay_id") REFERENCES "departure_stay"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room_assignment" ADD CONSTRAINT "departure_room_assignment_organization_id_room_id_fkey" FOREIGN KEY ("organization_id", "room_id") REFERENCES "departure_room"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_room_assignment" ADD CONSTRAINT "departure_room_assignment_organization_id_traveller_id_fkey" FOREIGN KEY ("organization_id", "traveller_id") REFERENCES "booking_traveller"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departure_settings" ADD CONSTRAINT "departure_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_cost" ADD CONSTRAINT "trip_cost_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_cost" ADD CONSTRAINT "trip_cost_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "supplier"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_contact" ADD CONSTRAINT "supplier_contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_contact" ADD CONSTRAINT "supplier_contact_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "supplier"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (departures and suppliers).
ALTER TABLE "departure"
  ADD CONSTRAINT departure_status_value CHECK (status IN ('open', 'closed', 'cancelled')),
  ADD CONSTRAINT departure_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT departure_text_lengths CHECK (char_length(notes) <= 1000 AND char_length(coalesce(cancelled_reason, '')) <= 500),
  ADD CONSTRAINT departure_seats_value CHECK (seats_total BETWEEN 0 AND 1000),
  ADD CONSTRAINT departure_price_value CHECK (price_paise IS NULL OR price_paise >= 0),
  ADD CONSTRAINT departure_dates_order CHECK (end_date >= start_date),
  ADD CONSTRAINT departure_cancelled_together CHECK ((status = 'cancelled') = (cancelled_reason IS NOT NULL));
ALTER TABLE "departure_hold"
  ADD CONSTRAINT departure_hold_seats_value CHECK (seats BETWEEN 1 AND 1000),
  ADD CONSTRAINT departure_hold_status_value CHECK (status IN ('active', 'released', 'expired', 'converted')),
  ADD CONSTRAINT departure_hold_note_length CHECK (char_length(note) <= 300),
  ADD CONSTRAINT departure_hold_ended_together CHECK ((status = 'active') = (ended_at IS NULL)),
  ADD CONSTRAINT departure_hold_converted_with_booking CHECK ((status = 'converted') = (booking_id IS NOT NULL));
ALTER TABLE "departure_waitlist"
  ADD CONSTRAINT departure_waitlist_seats_value CHECK (seats BETWEEN 1 AND 1000);
ALTER TABLE "departure_stay"
  ADD CONSTRAINT departure_stay_hotel_length CHECK (char_length(hotel_name) BETWEEN 1 AND 120),
  ADD CONSTRAINT departure_stay_dates_order CHECK (check_out >= check_in);
ALTER TABLE "departure_room"
  ADD CONSTRAINT departure_room_label_length CHECK (char_length(label) BETWEEN 1 AND 40),
  ADD CONSTRAINT departure_room_capacity_value CHECK (capacity BETWEEN 1 AND 4);
ALTER TABLE "departure_settings"
  ADD CONSTRAINT departure_settings_value CHECK (
    hold_hours BETWEEN 1 AND 720 AND filling_fast_percent BETWEEN 0 AND 100 AND default_room_capacity BETWEEN 1 AND 4);
ALTER TABLE "supplier"
  ADD CONSTRAINT supplier_kind_value CHECK (kind IN ('hotel', 'transport', 'guide', 'other')),
  ADD CONSTRAINT supplier_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT supplier_text_lengths CHECK (
    char_length(city) <= 80 AND char_length(gstin) <= 20 AND char_length(payment_terms) <= 300
    AND char_length(payment_details) <= 500 AND char_length(notes) <= 1000);
ALTER TABLE "supplier_contact"
  ADD CONSTRAINT supplier_contact_text_lengths CHECK (
    char_length(name) BETWEEN 1 AND 120 AND char_length(role) <= 80 AND char_length(phone) <= 40
    AND char_length(whatsapp) <= 40 AND char_length(email) <= 200);
ALTER TABLE "booking_traveller"
  ADD CONSTRAINT booking_traveller_room_request_value CHECK (room_request IN ('none', 'single_room', 'ground_floor', 'near_group')),
  ADD CONSTRAINT booking_traveller_room_note_length CHECK (char_length(room_note) <= 200);
ALTER TABLE "departure"
  ADD CONSTRAINT departure_cutoff_before_start CHECK (cutoff_on IS NULL OR cutoff_on <= start_date);
-- A cost belongs to one booking or to one whole departure, never both and never neither.
ALTER TABLE "trip_cost"
  ADD CONSTRAINT trip_cost_one_owner CHECK (num_nonnulls(quote_id, departure_id) = 1);

-- A departure, a hold and the settings are kept and changed, a supplier is soft-deleted (ADR 0004); the runtime role deletes
-- none of them. A waitlist entry, a stay, a room, an assignment and a contact are plain data and may be removed.
REVOKE DELETE ON TABLE "departure", "departure_hold", "departure_settings", "supplier" FROM app_runtime;

-- A departure's rooming list is numbered apart from invoices too (RML-2026-0001), so no agency may choose that prefix for its
-- invoices. NOT VALID, as bookings' was: a live agency that already chose it must not fail the deploy.
ALTER TABLE "organization_profile" DROP CONSTRAINT organization_profile_invoice_prefix_not_reserved;
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_invoice_prefix_not_reserved CHECK (invoice_prefix NOT IN ('SMPL', 'DOC', 'QT', 'RCT', 'BK', 'VCH', 'ITN', 'RML')) NOT VALID;

-- Sales holds seats for their leads (owner, 2026-10-30). ADR 0005 changes no existing role by itself, so every organization's
-- Sales role is given departures:create here, once. Custom roles are left to their Owners.
INSERT INTO role_permission (organization_id, role_id, permission, scope)
SELECT organization_id, id, 'departures:create', NULL
FROM role
WHERE key = 'sales' AND deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('departure');
SELECT app_enable_org_rls('departure_hold');
SELECT app_enable_org_rls('departure_waitlist');
SELECT app_enable_org_rls('departure_stay');
SELECT app_enable_org_rls('departure_room');
SELECT app_enable_org_rls('departure_room_assignment');
SELECT app_enable_org_rls('departure_settings');
SELECT app_enable_org_rls('supplier');
SELECT app_enable_org_rls('supplier_contact');
