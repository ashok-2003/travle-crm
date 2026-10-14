-- Hand-written. The api changes a role only by renaming, deleting or restoring it, and a member only by giving them
-- another role or removing them. Column-level grants make every other change impossible for app_runtime, whatever
-- the code does:
--   role.key        member.role holds it with no foreign key, so a changed key would free it for reuse (ADR 0005);
--   role.is_owner   would hand out every permission;
--   member.organization_id, member.user_id   would move a person into another organization or onto another user.
-- Prisma sets role.updated_at on every update. Better Auth's organization plugin writes only member.role.
REVOKE UPDATE ON "role" FROM app_runtime;
GRANT UPDATE (name, updated_at, deleted_at, deleted_by) ON "role" TO app_runtime;
REVOKE UPDATE ON "member" FROM app_runtime;
GRANT UPDATE (role, deleted_at, deleted_by) ON "member" TO app_runtime;
