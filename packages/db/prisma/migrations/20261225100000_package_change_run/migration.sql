-- The AI change assistant's runs: one per "Show the changes" for a trip, with the proposal, what was applied and the
-- before-values Undo all needs. It only adds a table (safe before the release deploys).
CREATE TABLE "package_change_run" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposal" JSONB NOT NULL,
    "trip_stamp" TEXT NOT NULL,
    "applied_change_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "before" JSONB,
    "stamp_after" TEXT,
    "applied_at" TIMESTAMPTZ(6),
    "undone_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "package_change_run_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "package_change_run_status_value" CHECK ("status" IN ('proposed', 'applied', 'undone'))
);

CREATE UNIQUE INDEX "package_change_run_organization_id_id_key" ON "package_change_run"("organization_id", "id");
CREATE INDEX "package_change_run_by_template" ON "package_change_run"("organization_id", "template_id", "created_at" DESC);

ALTER TABLE "package_change_run" ADD CONSTRAINT "package_change_run_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "package_change_run" ADD CONSTRAINT "package_change_run_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

SELECT app_enable_org_rls('package_change_run');
