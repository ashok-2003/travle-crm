-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "lost_reason" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_broadcast" ADD COLUMN     "segments" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "sales_automation" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "speed_enabled" BOOLEAN NOT NULL DEFAULT false,
    "speed_template_id" UUID,
    "speed_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact_enquirers" BOOLEAN NOT NULL DEFAULT false,
    "follow_enabled" BOOLEAN NOT NULL DEFAULT false,
    "follow_steps" JSONB NOT NULL DEFAULT '[]',
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_template_id" UUID,
    "reminder_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reminder_days_before" INTEGER NOT NULL DEFAULT 1,
    "hot_keywords" TEXT[] DEFAULT ARRAY['price', 'rate', 'book', 'booking', 'confirm', 'advance', 'payment', 'kitna']::TEXT[],
    "hot_budget_paise" BIGINT,
    "hot_travel_days" INTEGER NOT NULL DEFAULT 30,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_automation_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "lead_cadence" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "next_at" TIMESTAMPTZ(6) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "stop_reason" TEXT,
    "stopped_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_cadence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_touch" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lead_id" UUID,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "message_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_touch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_signal" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_template" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "days" JSONB NOT NULL DEFAULT '[]',
    "items" JSONB NOT NULL DEFAULT '[]',
    "inclusions" TEXT NOT NULL DEFAULT '',
    "exclusions" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 500,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "quote_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_cadence_due" ON "lead_cadence"("organization_id", "state", "next_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_cadence_organization_id_id_key" ON "lead_cadence"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_cadence_one_per_lead" ON "lead_cadence"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "sales_touch_lead" ON "sales_touch"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_touch_organization_id_id_key" ON "sales_touch"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_touch_once" ON "sales_touch"("organization_id", "key");

-- CreateIndex
CREATE INDEX "lead_signal_lead" ON "lead_signal"("organization_id", "lead_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_signal_organization_id_id_key" ON "lead_signal"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_signal_once" ON "lead_signal"("organization_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "quote_template_organization_id_id_key" ON "quote_template"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_template_live_name" ON "quote_template"("organization_id", "name") WHERE ("deleted_at" IS NULL);

-- AddForeignKey
ALTER TABLE "sales_automation" ADD CONSTRAINT "sales_automation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_cadence" ADD CONSTRAINT "lead_cadence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_cadence" ADD CONSTRAINT "lead_cadence_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sales_touch" ADD CONSTRAINT "sales_touch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_signal" ADD CONSTRAINT "lead_signal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_signal" ADD CONSTRAINT "lead_signal_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_template" ADD CONSTRAINT "quote_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (sales execution).
ALTER TABLE "lead"
  ADD CONSTRAINT lead_lost_reason_value CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'dates', 'competitor', 'no_reply', 'changed_plans', 'other'));
ALTER TABLE "whatsapp_broadcast"
  ADD CONSTRAINT whatsapp_broadcast_segments_value CHECK (segments <@ ARRAY['lost', 'won']::text[]);
ALTER TABLE "sales_automation"
  ADD CONSTRAINT sales_automation_follow_steps_array CHECK (jsonb_typeof(follow_steps) = 'array'),
  ADD CONSTRAINT sales_automation_reminder_days CHECK (reminder_days_before BETWEEN 0 AND 14),
  ADD CONSTRAINT sales_automation_hot_travel_days CHECK (hot_travel_days BETWEEN 0 AND 365),
  ADD CONSTRAINT sales_automation_hot_keywords CHECK (cardinality(hot_keywords) <= 30);
ALTER TABLE "lead_cadence"
  ADD CONSTRAINT lead_cadence_state_value CHECK (state IN ('active', 'done', 'stopped')),
  ADD CONSTRAINT lead_cadence_step_positive CHECK (step >= 0);
ALTER TABLE "sales_touch"
  ADD CONSTRAINT sales_touch_kind_value CHECK (kind IN ('speed', 'follow', 'reminder')),
  ADD CONSTRAINT sales_touch_outcome_value CHECK (outcome IN ('sent', 'skipped'));
ALTER TABLE "lead_signal"
  ADD CONSTRAINT lead_signal_kind_value CHECK (kind IN ('quote_opened', 'asked_price'));
ALTER TABLE "quote_template"
  ADD CONSTRAINT quote_template_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT quote_template_days_array CHECK (jsonb_typeof(days) = 'array'),
  ADD CONSTRAINT quote_template_items_array CHECK (jsonb_typeof(items) = 'array'),
  ADD CONSTRAINT quote_template_tax_rate_value CHECK (tax_rate_basis_points IN (0, 500, 1800));

-- Settings are replaced, a cadence is stopped, touches and signals are a log, a package is soft-deleted: the runtime role
-- deletes none of them. Erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "sales_automation", "lead_cadence", "sales_touch", "lead_signal", "quote_template" FROM app_runtime;
REVOKE UPDATE ON TABLE "sales_touch", "lead_signal" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('sales_automation');
SELECT app_enable_org_rls('lead_cadence');
SELECT app_enable_org_rls('sales_touch');
SELECT app_enable_org_rls('lead_signal');
SELECT app_enable_org_rls('quote_template');
