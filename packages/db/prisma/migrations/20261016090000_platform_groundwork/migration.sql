-- CreateTable
CREATE TABLE "platform_audit_entry" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_organization_id" UUID,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "platform_audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_entry_newest" ON "platform_audit_entry"("occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_entry_organization" ON "platform_audit_entry"("target_organization_id", "occurred_at" DESC);

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A platform admin acting from the console (onboarding, a subscription change) is recorded in that organization's
-- log under their own name, with source "platform" (spec 7.1). Every other rule of the log stays.
ALTER TABLE "audit_entry"
  DROP CONSTRAINT audit_entry_source_value,
  ADD CONSTRAINT audit_entry_source_value CHECK (source IN ('web', 'api', 'job', 'impersonation', 'platform'));

-- Actions and target kinds read like the organizations' log; ids are short; snapshots are small JSON objects.
ALTER TABLE "platform_audit_entry"
  ADD CONSTRAINT platform_audit_entry_action_format CHECK (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT platform_audit_entry_target_type_format CHECK (target_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT platform_audit_entry_target_id_length CHECK (char_length(target_id) BETWEEN 1 AND 200),
  ADD CONSTRAINT platform_audit_entry_before_object CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  ADD CONSTRAINT platform_audit_entry_after_object CHECK (after IS NULL OR jsonb_typeof(after) = 'object'),
  ADD CONSTRAINT platform_audit_entry_before_size CHECK (octet_length(before::text) <= 16384),
  ADD CONSTRAINT platform_audit_entry_after_size CHECK (octet_length(after::text) <= 16384);

-- The api and worker have no business with the platform's log. The console adds entries and reads them; nobody
-- changes or removes one, not even the platform role.
REVOKE ALL ON TABLE "platform_audit_entry" FROM app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "platform_audit_entry" FROM app_platform;
