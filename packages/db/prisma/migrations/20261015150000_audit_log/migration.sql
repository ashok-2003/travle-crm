-- CreateTable
CREATE TABLE "audit_entry" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "impersonated_by" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entry_newest" ON "audit_entry"("organization_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_entry_entity" ON "audit_entry"("organization_id", "entity_type", "entity_id");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('audit_entry');

-- Where the change came from (spec 9.5), and the admin's id exactly when support was impersonating.
ALTER TABLE "audit_entry"
  ADD CONSTRAINT audit_entry_source_value CHECK (source IN ('web', 'api', 'job', 'impersonation')),
  ADD CONSTRAINT audit_entry_impersonation CHECK ((source = 'impersonation') = (impersonated_by IS NOT NULL)),
  ADD CONSTRAINT audit_entry_action_format CHECK (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT audit_entry_entity_type_format CHECK (entity_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT audit_entry_before_object CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  ADD CONSTRAINT audit_entry_after_object CHECK (after IS NULL OR jsonb_typeof(after) = 'object');

-- The log is append-only: the api and worker may add entries, never change or delete one. Only the platform role's
-- purge of a whole organization removes them.
REVOKE UPDATE, DELETE ON TABLE "audit_entry" FROM app_runtime;
