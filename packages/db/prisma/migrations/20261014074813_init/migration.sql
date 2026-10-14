-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_code_key" ON "organization"("code");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization codes: 3-12 capital letters or digits, e.g. SHARMA.
ALTER TABLE "organization"
  ADD CONSTRAINT organization_code_format CHECK (code ~ '^[A-Z0-9]{3,12}$');

-- Migration history is for the migrator only. (Absent in Prisma's shadow database, hence the guard.)
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM app_runtime, app_platform;
  END IF;
END $$;

-- Turns on organization isolation for one table. Call it in the migration that creates any table
-- with an organization_id column:  SELECT app_enable_org_rls('table_name');
--   org_isolation    the api and worker see and write only rows of the organization set by db.forOrg()
--   platform_access  the platform console and migrations see every row
-- FORCE makes the rules apply to the table owner too (the migrator), hence its explicit policy.
CREATE FUNCTION app_enable_org_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY org_isolation ON %s TO app_runtime '
    'USING (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
    'WITH CHECK (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
    target);
  EXECUTE format(
    'CREATE POLICY platform_access ON %s TO app_platform, app_migrator USING (true) WITH CHECK (true)',
    target);
END;
$$;
