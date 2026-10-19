-- AlterTable
ALTER TABLE "member" ADD COLUMN     "phone_e164" TEXT;

-- ---------------------------------------------------------------------------
-- Hand-written. A staff member's phone (B51) is E.164, like every phone we keep, and optional. Staff change it from
-- the Staff screen (identity's changeStaffPhone), and app_runtime may update only the member columns granted to it
-- (20261014130000_runtime_column_grants): add this one.
ALTER TABLE "member" ADD CONSTRAINT "member_phone_format" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
GRANT UPDATE (phone_e164) ON "member" TO app_runtime;
