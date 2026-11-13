-- The move to the lite agent arrives paused (plan 5): the every-agency pause is turned on before the new worker starts,
-- so no agency's agent answers until a super admin resumes it from the console, one agency at a time. Rows only: the
-- release before never reads these columns, so it keeps working while this applies.
-- The pause names a person (CHECK subscription_policy_agent_pause): the first super admin, as no one pressed it. A
-- database with no super admin (a fresh one: tests, development, CI) has no agency to protect and stays as it is, and a
-- pause already on keeps its time and author. Safe to run twice.
UPDATE "subscription_policy"
SET "ai_agent_paused_at" = now(),
    "ai_agent_paused_by" = first_admin.id
FROM (
  SELECT u."id" FROM "user" u
  WHERE u."role" = 'super-admin' AND u."banned" IS NOT TRUE
  ORDER BY u."created_at", u."id"
  LIMIT 1
) AS first_admin
WHERE "subscription_policy"."id" = true AND "subscription_policy"."ai_agent_paused_at" IS NULL;
