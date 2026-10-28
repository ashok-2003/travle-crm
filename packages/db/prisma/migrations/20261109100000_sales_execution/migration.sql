-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "lost_reason" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_broadcast" ADD COLUMN     "segments" TEXT[] DEFAULT ARRAY[]::TEXT[];

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
ALTER TABLE "lead_signal"
  ADD CONSTRAINT lead_signal_kind_value CHECK (kind IN ('quote_opened', 'asked_price'));
ALTER TABLE "quote_template"
  ADD CONSTRAINT quote_template_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT quote_template_days_array CHECK (jsonb_typeof(days) = 'array'),
  ADD CONSTRAINT quote_template_items_array CHECK (jsonb_typeof(items) = 'array'),
  ADD CONSTRAINT quote_template_tax_rate_value CHECK (tax_rate_basis_points IN (0, 500, 1800));

-- Signals are a log, a package is soft-deleted: the runtime role
-- deletes none of them. Erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "lead_signal", "quote_template" FROM app_runtime;
REVOKE UPDATE ON TABLE "lead_signal" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('lead_signal');
SELECT app_enable_org_rls('quote_template');
