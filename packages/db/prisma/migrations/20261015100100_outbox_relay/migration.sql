-- The outbox relay's one look across organizations (ADR 0010): which organizations have events waiting, oldest
-- first. It returns organization ids only, which app_runtime can read from the organization table anyway, never an
-- event. SECURITY DEFINER: it runs as its owner, the migrator, whose platform_access policy sees every row; the
-- relay then reads each organization's events inside db.forOrg(), under row-level security as usual.
CREATE FUNCTION app_organizations_with_unrelayed_events(max_organizations integer)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM outbox_event
  WHERE relayed_at IS NULL
  GROUP BY organization_id
  ORDER BY min(occurred_at)
  LIMIT max_organizations
$$;

-- Only the api and worker call it.
REVOKE ALL ON FUNCTION app_organizations_with_unrelayed_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_organizations_with_unrelayed_events(integer) TO app_runtime;
