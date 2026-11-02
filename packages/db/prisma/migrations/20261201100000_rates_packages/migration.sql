-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "template_id" UUID;

-- AlterTable
ALTER TABLE "quote_settings" ADD COLUMN     "default_markup_basis_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "min_margin_basis_points" INTEGER,
ADD COLUMN     "min_margin_per_person_paise" BIGINT;

-- AlterTable
ALTER TABLE "quote_template" ADD COLUMN     "cancellation_notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "default_traveller_level" TEXT,
ADD COLUMN     "destination_id" UUID,
ADD COLUMN     "from_price_paise" BIGINT,
ADD COLUMN     "highlights" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "nights" INTEGER,
ADD COLUMN     "price_display" TEXT NOT NULL DEFAULT 'on_enquiry',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "summary" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "supplier_rate_season" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_rate_season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_rate" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "meal_plan" TEXT NOT NULL DEFAULT '',
    "occupancy" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "cost_paise" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_template_tier" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_template_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_page_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "about" TEXT NOT NULL DEFAULT '',
    "instagram_url" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_page_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "package_enquiry" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "departure_id" UUID,
    "outcome" TEXT NOT NULL,
    "lead_id" UUID,
    "person_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_rate_season_supplier" ON "supplier_rate_season"("organization_id", "supplier_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rate_season_organization_id_id_key" ON "supplier_rate_season"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rate_organization_id_id_key" ON "supplier_rate"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rate_once" ON "supplier_rate"("organization_id", "season_id", "item", "meal_plan", "occupancy", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "quote_template_tier_organization_id_id_key" ON "quote_template_tier"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_template_tier_name_once" ON "quote_template_tier"("organization_id", "template_id", "name");

-- CreateIndex
CREATE INDEX "package_enquiry_person" ON "package_enquiry"("organization_id", "person_id", "created_at") WHERE (person_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "package_enquiry_package" ON "package_enquiry"("organization_id", "package_id", "created_at");

-- CreateIndex
CREATE INDEX "package_enquiry_sweep" ON "package_enquiry"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "package_enquiry_organization_id_submission_id_key" ON "package_enquiry"("organization_id", "submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_template_live_slug" ON "quote_template"("organization_id", "slug") WHERE ("deleted_at" IS NULL);

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_rate_season" ADD CONSTRAINT "supplier_rate_season_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_rate_season" ADD CONSTRAINT "supplier_rate_season_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "supplier"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_rate" ADD CONSTRAINT "supplier_rate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_rate" ADD CONSTRAINT "supplier_rate_organization_id_season_id_fkey" FOREIGN KEY ("organization_id", "season_id") REFERENCES "supplier_rate_season"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_template_tier" ADD CONSTRAINT "quote_template_tier_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_template_tier" ADD CONSTRAINT "quote_template_tier_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public_page_settings" ADD CONSTRAINT "public_page_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_enquiry" ADD CONSTRAINT "package_enquiry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_enquiry" ADD CONSTRAINT "package_enquiry_organization_id_package_id_fkey" FOREIGN KEY ("organization_id", "package_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_enquiry" ADD CONSTRAINT "package_enquiry_organization_id_departure_id_fkey" FOREIGN KEY ("organization_id", "departure_id") REFERENCES "departure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_enquiry" ADD CONSTRAINT "package_enquiry_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_enquiry" ADD CONSTRAINT "package_enquiry_organization_id_person_id_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "person"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_template" ADD CONSTRAINT "quote_template_organization_id_destination_id_fkey" FOREIGN KEY ("organization_id", "destination_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Release 7b, rates and packages. Additive: new tables, new columns with defaults or nullable (quote.template_id, the quote
-- settings' markup and minimum margin, the package fields on quote_template), and checks; nothing the running version reads
-- changes meaning. A quote's items keep their JSON shape: the new keys (costUnitPaise, rateId, needsRate) are optional.

-- Seasons of one supplier never overlap, so a date has at most one season: a date with none has no rate.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "supplier_rate_season"
  ADD CONSTRAINT supplier_rate_season_no_overlap EXCLUDE USING gist (
    "organization_id" WITH =, "supplier_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&),
  ADD CONSTRAINT supplier_rate_season_dates_order CHECK (ends_on >= starts_on),
  ADD CONSTRAINT supplier_rate_season_label_length CHECK (char_length(label) BETWEEN 1 AND 80);
ALTER TABLE "supplier_rate"
  ADD CONSTRAINT supplier_rate_item_length CHECK (char_length(item) BETWEEN 1 AND 160),
  ADD CONSTRAINT supplier_rate_note_length CHECK (char_length(note) <= 300),
  ADD CONSTRAINT supplier_rate_meal_plan_value CHECK (meal_plan IN ('', 'EP', 'CP', 'MAP', 'AP')),
  ADD CONSTRAINT supplier_rate_occupancy_value CHECK (
    occupancy IN ('', 'single', 'double', 'triple', 'extra_bed', 'child_with_bed', 'child_no_bed')),
  ADD CONSTRAINT supplier_rate_unit_value CHECK (unit IN ('per_room_night', 'per_person_night', 'per_day', 'per_trip')),
  ADD CONSTRAINT supplier_rate_cost_value CHECK (cost_paise BETWEEN 0 AND 10000000000);

ALTER TABLE "quote_settings"
  ADD CONSTRAINT quote_settings_markup_value CHECK (default_markup_basis_points BETWEEN 0 AND 100000),
  ADD CONSTRAINT quote_settings_min_margin_value CHECK (min_margin_basis_points IS NULL OR min_margin_basis_points BETWEEN 0 AND 10000),
  ADD CONSTRAINT quote_settings_min_margin_person_value CHECK (
    min_margin_per_person_paise IS NULL OR min_margin_per_person_paise BETWEEN 0 AND 10000000000);

ALTER TABLE "quote_template"
  ADD CONSTRAINT quote_template_slug_shape CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  ADD CONSTRAINT quote_template_nights_value CHECK (nights IS NULL OR nights BETWEEN 0 AND 60),
  ADD CONSTRAINT quote_template_summary_length CHECK (char_length(summary) <= 600),
  ADD CONSTRAINT quote_template_highlights_array CHECK (jsonb_typeof(highlights) = 'array'),
  ADD CONSTRAINT quote_template_price_display_value CHECK (price_display IN ('from', 'on_enquiry')),
  ADD CONSTRAINT quote_template_from_price_value CHECK (from_price_paise IS NULL OR from_price_paise BETWEEN 0 AND 10000000000),
  ADD CONSTRAINT quote_template_from_price_shown CHECK (price_display <> 'from' OR from_price_paise IS NOT NULL),
  ADD CONSTRAINT quote_template_level_value CHECK (
    default_traveller_level IS NULL OR default_traveller_level IN ('basic', 'detailed', 'international')),
  ADD CONSTRAINT quote_template_cancellation_length CHECK (char_length(cancellation_notes) <= 2000),
  ADD CONSTRAINT quote_template_published_has_slug CHECK (NOT published OR slug IS NOT NULL);

ALTER TABLE "quote_template_tier"
  ADD CONSTRAINT quote_template_tier_lines_array CHECK (jsonb_typeof(lines) = 'array'),
  ADD CONSTRAINT quote_template_tier_name_length CHECK (char_length(name) BETWEEN 1 AND 60);

ALTER TABLE "public_page_settings"
  ADD CONSTRAINT public_page_settings_about_length CHECK (char_length(about) <= 1000),
  ADD CONSTRAINT public_page_settings_instagram_https CHECK (
    instagram_url = '' OR (instagram_url LIKE 'https://%' AND char_length(instagram_url) <= 300));

ALTER TABLE "package_enquiry"
  ADD CONSTRAINT package_enquiry_outcome_value CHECK (outcome IN ('new_lead', 'repeat_enquiry', 'blocked', 'duplicate', 'spam'));

-- A package keeps its tiers and settings (changed or soft-deleted), and the ledger is append only: the runtime role deletes none
-- of them but a tier or a season, and updates no ledger row. The platform role sweeps and empties the ledger (erasure).
REVOKE DELETE ON TABLE "public_page_settings" FROM app_runtime;
REVOKE UPDATE, DELETE ON TABLE "package_enquiry" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('supplier_rate_season');
SELECT app_enable_org_rls('supplier_rate');
SELECT app_enable_org_rls('quote_template_tier');
SELECT app_enable_org_rls('public_page_settings');
SELECT app_enable_org_rls('package_enquiry');
