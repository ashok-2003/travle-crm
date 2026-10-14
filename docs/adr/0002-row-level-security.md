# 0002: How organization isolation is implemented

Date: 2026-10-14 · Status: accepted · Implements spec section 4

## Decision

- Every organization-owned table has `organization_id uuid NOT NULL`, defaulting to the transaction's organization.
- `db.forOrg(orgId, fn)` opens a transaction and runs `set_config('app.org_id', orgId, true)` first.
  The setting is transaction-local, so it is safe behind a transaction-mode connection pooler.
- The SQL function `app_enable_org_rls(table)` enables and **forces** row-level security and creates two policies:
  `org_isolation` (role `app_runtime`: only rows of `app.org_id`) and `platform_access` (roles `app_platform` and
  `app_migrator`: all rows). Every migration that creates an organization-owned table calls it.
- The policies compare against `NULLIF(current_setting('app.org_id', true), '')::uuid`.

## Context

- **No BYPASSRLS.** Hosted Postgres services may not allow granting `BYPASSRLS`. Per-role policies give the
  platform console and migrations the same reach on any Postgres.
- **FORCE applies RLS to the table owner too.** Without FORCE the migrator (owner) silently bypasses RLS. With FORCE
  and no policy it sees nothing, hence `app_migrator` in `platform_access`.
- **`''` versus NULL.** After a transaction that set `app.org_id` ends, the same connection reads the setting back as
  `''`, not NULL. Casting `''` to uuid would error; `NULLIF` turns it into "no rows" instead.
- **Invalid ids are rejected in TypeScript.** `forOrg` throws `InvalidOrganizationIdError` before any SQL.

## Consequences

- A forgotten filter returns nothing instead of leaking.
- The test suite proves isolation for every table with `organization_id`, and fails if a table lacks the policies
  or an isolation fixture.
- The organization table itself has no RLS: it is read during sign-in, before an organization is known.
- Views must be `security_invoker`, materialized views are not allowed, and SECURITY DEFINER functions are banned
  unless allow-listed: otherwise they run with the owner's rights and skip the policies. The schema check enforces this.
- Each organization table has exactly the two standard policies (`org_isolation`, `platform_access`), nothing extra.
- The runtime role has no TEMP rights, and `forOrg()` refuses to run as any role but `app_runtime`.
