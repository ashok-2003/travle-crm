-- Plans as quoted: a plan may be priced for 3 months, carries the AI credits an agency may use each month (every
-- existing plan keeps today's 10,000), and the platform's GST on its own subscriptions is a policy figure, 0 for now.
ALTER TABLE "plan" ADD COLUMN "quarterly_price_paise" INTEGER,
ADD COLUMN "extra_seat_quarterly_price_paise" INTEGER,
ADD COLUMN "ai_credits_per_month" INTEGER NOT NULL DEFAULT 10000;

ALTER TABLE "subscription_policy" ADD COLUMN "subscription_gst_basis_points" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "plan" DROP CONSTRAINT plan_priced;
ALTER TABLE "plan" DROP CONSTRAINT plan_prices_not_negative;
ALTER TABLE "plan"
  ADD CONSTRAINT plan_priced CHECK (
    monthly_price_paise IS NOT NULL OR quarterly_price_paise IS NOT NULL OR yearly_price_paise IS NOT NULL),
  ADD CONSTRAINT plan_prices_not_negative CHECK (
    coalesce(monthly_price_paise, 0) >= 0 AND coalesce(quarterly_price_paise, 0) >= 0
    AND coalesce(yearly_price_paise, 0) >= 0 AND coalesce(extra_seat_monthly_price_paise, 0) >= 0
    AND coalesce(extra_seat_quarterly_price_paise, 0) >= 0 AND coalesce(extra_seat_yearly_price_paise, 0) >= 0),
  ADD CONSTRAINT plan_ai_credits_positive CHECK (ai_credits_per_month >= 1);

ALTER TABLE "subscription" DROP CONSTRAINT subscription_billing_cycle_value;
ALTER TABLE "subscription"
  ADD CONSTRAINT subscription_billing_cycle_value CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly'));

-- A VIP invite may start a 3-month subscription too.
ALTER TABLE "vip_invite" DROP CONSTRAINT vip_invite_billing_cycle_value;
ALTER TABLE "vip_invite"
  ADD CONSTRAINT vip_invite_billing_cycle_value CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly'));

ALTER TABLE "subscription_policy"
  ADD CONSTRAINT subscription_policy_gst CHECK (subscription_gst_basis_points IN (0, 1800));
