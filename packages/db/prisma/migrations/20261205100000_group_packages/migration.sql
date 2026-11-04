-- Group packages (the agent's ground truth). Additive: new columns with defaults or nullable on quote_template, departure and
-- ai_settings, and one new table, package_season. Nothing the running version reads changes meaning.

-- A package can sell a group trip: its kind, rooms, payment terms, when it departs, and whether the AI may sell it.
ALTER TABLE "quote_template"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN "room_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "prices_include_gst" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "advance_per_person_paise" BIGINT,
  ADD COLUMN "payment_details" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pickup_points" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "start_city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "weekly_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "departure_months" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "seats_per_departure" INTEGER,
  ADD COLUMN "ai_sellable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quote_template"
  ADD CONSTRAINT quote_template_kind_value CHECK (kind IN ('custom', 'group')),
  ADD CONSTRAINT quote_template_room_types_value CHECK (
    room_types <@ ARRAY['single', 'double', 'triple', 'quad', 'child_bed', 'child_no_bed']::TEXT[]),
  ADD CONSTRAINT quote_template_weekly_days_value CHECK (weekly_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]),
  ADD CONSTRAINT quote_template_departure_months_value CHECK (departure_months <@ ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  ADD CONSTRAINT quote_template_advance_range CHECK (advance_per_person_paise BETWEEN 0 AND 10000000000),
  ADD CONSTRAINT quote_template_seats_per_departure_range CHECK (seats_per_departure BETWEEN 1 AND 1000);

-- A departure may sell one group package, with its own per-person prices by room type.
ALTER TABLE "departure"
  ADD COLUMN "template_id" UUID,
  ADD COLUMN "price_single_paise" BIGINT,
  ADD COLUMN "price_double_paise" BIGINT,
  ADD COLUMN "price_triple_paise" BIGINT,
  ADD COLUMN "price_quad_paise" BIGINT,
  ADD COLUMN "price_child_bed_paise" BIGINT,
  ADD COLUMN "price_child_no_bed_paise" BIGINT;

ALTER TABLE "departure"
  ADD CONSTRAINT departure_room_prices_range CHECK (
    price_single_paise BETWEEN 0 AND 10000000000 AND price_double_paise BETWEEN 0 AND 10000000000
    AND price_triple_paise BETWEEN 0 AND 10000000000 AND price_quad_paise BETWEEN 0 AND 10000000000
    AND price_child_bed_paise BETWEEN 0 AND 10000000000 AND price_child_no_bed_paise BETWEEN 0 AND 10000000000);

-- One live departure per package per day.
CREATE UNIQUE INDEX "departure_package_day" ON "departure"("organization_id", "template_id", "start_date")
  WHERE ("template_id" IS NOT NULL AND "deleted_at" IS NULL);

ALTER TABLE "departure" ADD CONSTRAINT "departure_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The AI may also plan a custom trip, not only sell group packages.
ALTER TABLE "ai_settings" ADD COLUMN "custom_trips" BOOLEAN NOT NULL DEFAULT false;

-- A group package's seasons: dates a set of per-person prices holds. Plain data, deleted for real.
CREATE TABLE "package_season" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "price_single_paise" BIGINT,
    "price_double_paise" BIGINT,
    "price_triple_paise" BIGINT,
    "price_quad_paise" BIGINT,
    "price_child_bed_paise" BIGINT,
    "price_child_no_bed_paise" BIGINT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "package_season_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "package_season_by_template" ON "package_season"("organization_id", "template_id", "starts_on");
CREATE UNIQUE INDEX "package_season_organization_id_id_key" ON "package_season"("organization_id", "id");

ALTER TABLE "package_season" ADD CONSTRAINT "package_season_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "package_season" ADD CONSTRAINT "package_season_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Seasons of one package never overlap, so a date has at most one season (btree_gist comes from release 7b).
ALTER TABLE "package_season"
  ADD CONSTRAINT package_season_no_overlap EXCLUDE USING gist (
    "organization_id" WITH =, "template_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&),
  ADD CONSTRAINT package_season_dates_order CHECK (ends_on >= starts_on),
  ADD CONSTRAINT package_season_label_length CHECK (char_length(label) BETWEEN 1 AND 80),
  ADD CONSTRAINT package_season_prices_range CHECK (
    price_single_paise BETWEEN 0 AND 10000000000 AND price_double_paise BETWEEN 0 AND 10000000000
    AND price_triple_paise BETWEEN 0 AND 10000000000 AND price_quad_paise BETWEEN 0 AND 10000000000
    AND price_child_bed_paise BETWEEN 0 AND 10000000000 AND price_child_no_bed_paise BETWEEN 0 AND 10000000000);

SELECT app_enable_org_rls('package_season');
