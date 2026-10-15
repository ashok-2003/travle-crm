-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "extra_seat_monthly_price_paise" INTEGER,
ADD COLUMN     "extra_seat_yearly_price_paise" INTEGER;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "manual_suspension_at" TIMESTAMPTZ(6),
ADD COLUMN     "manual_suspension_by" UUID,
ADD COLUMN     "manual_suspension_reason" TEXT;

-- AlterTable
ALTER TABLE "subscription_policy" ADD COLUMN     "trial_days" INTEGER NOT NULL DEFAULT 7;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- The owner's pricing (spec 7.2): a flat price per organization, monthly and/or yearly, and a price per extra seat
-- for either, all before GST. No plan is seeded here: the prices aren't confirmed, and production plans are the
-- platform team's to enter. The demo reset and the tests seed placeholder tiers themselves.
ALTER TABLE "plan" DROP CONSTRAINT plan_prices_not_negative;
ALTER TABLE "plan"
  ADD CONSTRAINT plan_prices_not_negative CHECK (
    coalesce(monthly_price_paise, 0) >= 0 AND coalesce(yearly_price_paise, 0) >= 0
    AND coalesce(extra_seat_monthly_price_paise, 0) >= 0 AND coalesce(extra_seat_yearly_price_paise, 0) >= 0);

-- Active always means paid through a day: without one the lifecycle has no next step, so an active row without it
-- would keep full access for ever. A manual suspension is recorded with its reason, and who made it.
ALTER TABLE "subscription"
  ADD CONSTRAINT subscription_active_paid CHECK (status <> 'active' OR paid_through IS NOT NULL),
  ADD CONSTRAINT subscription_manual_suspension CHECK (
    (manual_suspension_at IS NULL) = (manual_suspension_reason IS NULL)
    AND (manual_suspension_at IS NOT NULL OR manual_suspension_by IS NULL)
    AND char_length(manual_suspension_reason) <= 200);

-- A payment pays from the day it was paid, never for days before it.
ALTER TABLE "subscription_payment"
  ADD CONSTRAINT subscription_payment_dates CHECK (paid_through >= paid_on);

-- The trial's length is the policy's, beside the past-due and read-only days.
ALTER TABLE "subscription_policy" DROP CONSTRAINT subscription_policy_days;
ALTER TABLE "subscription_policy"
  ADD CONSTRAINT subscription_policy_days CHECK (
    trial_days BETWEEN 1 AND 90 AND past_due_days BETWEEN 1 AND 90 AND read_only_days BETWEEN 1 AND 180);

-- Only the platform role writes a subscription. The lifecycle job now runs in the console process as that role
-- (ADR 0020), so the runtime role loses the status columns it could update; it keeps SELECT for its request checks.
REVOKE UPDATE (status, status_changed_at, updated_at) ON TABLE "subscription" FROM app_runtime;
REVOKE UPDATE ON TABLE "subscription" FROM app_runtime;
