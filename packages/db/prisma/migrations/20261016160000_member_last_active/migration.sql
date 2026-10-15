-- AlterTable
ALTER TABLE "member" ADD COLUMN     "last_active_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Hand-written. The api writes a member's last activity as requests arrive (identity's recordMemberActivity), and
-- app_runtime may update only the member columns granted to it (20261014130000_runtime_column_grants): add this one.
GRANT UPDATE (last_active_at) ON "member" TO app_runtime;
