-- The automatic WhatsApps (greeting, day 1/3/7 follow-ups, payment reminders), off by default and the agency's to turn on.
-- Additive: three new tables, nothing the running version reads changes.

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

-- AddForeignKey
ALTER TABLE "sales_automation" ADD CONSTRAINT "sales_automation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_cadence" ADD CONSTRAINT "lead_cadence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_cadence" ADD CONSTRAINT "lead_cadence_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sales_touch" ADD CONSTRAINT "sales_touch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

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

-- Settings are replaced, a cadence is stopped, touches are a log: the runtime role deletes none of them and changes no touch.
-- Erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "sales_automation", "lead_cadence", "sales_touch" FROM app_runtime;
REVOKE UPDATE ON TABLE "sales_touch" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('sales_automation');
SELECT app_enable_org_rls('lead_cadence');
SELECT app_enable_org_rls('sales_touch');
