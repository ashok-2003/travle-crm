-- CreateTable
CREATE TABLE "platform_export" (
    "id" UUID NOT NULL,
    "target_organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'requested',
    "parts_written" INTEGER NOT NULL DEFAULT 0,
    "part_count" INTEGER,
    "row_count" INTEGER,
    "person_count" INTEGER,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "expired_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_export_organization" ON "platform_export"("target_organization_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "platform_export_due" ON "platform_export"("state", "expires_at");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- An export moves from requested to done, or to failed (and back, when a retry finishes it), and at last to expired.
-- Done means its parts are stored and counted; the counts are never negative, and no more parts than were stored.
ALTER TABLE "platform_export"
  ADD CONSTRAINT platform_export_state_value CHECK (state IN ('requested', 'done', 'failed', 'expired')),
  ADD CONSTRAINT platform_export_done_counted CHECK (
    state <> 'done' OR (completed_at IS NOT NULL AND part_count IS NOT NULL AND row_count IS NOT NULL
      AND person_count IS NOT NULL)),
  ADD CONSTRAINT platform_export_expired_at CHECK (state <> 'expired' OR expired_at IS NOT NULL),
  ADD CONSTRAINT platform_export_counts CHECK (
    parts_written >= 0 AND part_count >= 0 AND part_count <= parts_written AND row_count >= 0 AND person_count >= 0),
  ADD CONSTRAINT platform_export_expiry CHECK (expires_at > requested_at);

-- The console keeps these; the api and worker have no business with them. Rows are marked expired, never removed.
REVOKE ALL ON TABLE "platform_export" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "platform_export" FROM app_platform;

-- One page of an organization's rows in one of its tables, for the platform's export job (ADR 0022): the rows of the
-- organization asOrganization() set (app.org_id) in primary-key order, after the row `after_row` (null for the first
-- page), at most `page_size` of them, each as JSON. Every table with organization_id qualifies, and organization itself
-- (by its id), so a module's new table needs no change here. The name is checked against the catalog and quoted
-- before it reaches SQL. SECURITY INVOKER: called as app_runtime inside asOrganization, so row-level security and the
-- runtime role's grants apply as to any of its queries; with no organization set it returns nothing.
CREATE FUNCTION app_export_organization_rows(table_name text, after_row jsonb, page_size integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  scope_column text := CASE WHEN table_name = 'organization' THEN 'id' ELSE 'organization_id' END;
  key_columns text;
BEGIN
  IF page_size IS NULL OR page_size NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'app_export_organization_rows: page_size must be 1 to 1000';
  END IF;
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY k.position)
    INTO key_columns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
    CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
   WHERE c.relname = table_name AND c.relkind IN ('r', 'p') AND NOT c.relispartition
     AND EXISTS (
       SELECT 1 FROM pg_attribute s WHERE s.attrelid = c.oid AND s.attname = scope_column AND NOT s.attisdropped);
  IF key_columns IS NULL THEN
    RAISE EXCEPTION 'app_export_organization_rows: % is not a table of an organization''s rows', table_name;
  END IF;
  -- Inside the subquery the key's names are the populated record's; outside, the table row's.
  RETURN QUERY EXECUTE format(
    'SELECT to_jsonb(t) FROM public.%1$I t
      WHERE t.%2$I = NULLIF(current_setting(''app.org_id'', true), '''')::uuid
        AND ($1 IS NULL OR (%3$s) > (SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1)))
      ORDER BY %3$s
      LIMIT $2',
    table_name, scope_column, key_columns)
  USING after_row, page_size;
END
$$;

-- Only the console's export calls it, as app_runtime inside asOrganization.
REVOKE ALL ON FUNCTION app_export_organization_rows(text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_export_organization_rows(text, jsonb, integer) TO app_runtime;
