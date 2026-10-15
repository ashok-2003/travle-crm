-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price_paise" INTEGER,
    "yearly_price_paise" INTEGER,
    "seat_limit" INTEGER NOT NULL,
    "whatsapp_number_limit" INTEGER NOT NULL,
    "storage_limit_bytes" BIGINT NOT NULL,
    "modules" TEXT[],
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "plan_id" UUID NOT NULL,
    "billing_cycle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "trial_ends_on" DATE,
    "paid_through" DATE,
    "extra_seats" INTEGER NOT NULL DEFAULT 0,
    "custom_price_paise" INTEGER,
    "extra_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "subscription_payment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "paid_through" DATE NOT NULL,
    "reference" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "provider_payment_id" TEXT,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "subscription_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_policy" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "past_due_days" INTEGER NOT NULL DEFAULT 7,
    "read_only_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "subscription_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_key" ON "plan"("key");

-- CreateIndex
CREATE INDEX "subscription_payment_organization_id_paid_on_idx" ON "subscription_payment"("organization_id", "paid_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_organization_id_id_key" ON "subscription_payment"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_organization_id_provider_provider_paym_key" ON "subscription_payment"("organization_id", "provider", "provider_payment_id");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_subscription_fkey" FOREIGN KEY ("organization_id") REFERENCES "subscription"("organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration). Plans and the policy have no organization.
SELECT app_enable_org_rls('subscription');
SELECT app_enable_org_rls('subscription_payment');

-- Plan keys are stable slugs; a plan has a price and real limits; its modules are ones the product has (spec 7.2).
-- Prisma makes list columns nullable, so the module checks also refuse NULL.
ALTER TABLE "plan"
  ADD CONSTRAINT plan_key_format CHECK (key ~ '^[a-z][a-z0-9-]{1,31}$'),
  ADD CONSTRAINT plan_name_length CHECK (char_length(name) BETWEEN 1 AND 60),
  ADD CONSTRAINT plan_priced CHECK (monthly_price_paise IS NOT NULL OR yearly_price_paise IS NOT NULL),
  ADD CONSTRAINT plan_prices_not_negative
    CHECK (coalesce(monthly_price_paise, 0) >= 0 AND coalesce(yearly_price_paise, 0) >= 0),
  ADD CONSTRAINT plan_limits_positive CHECK (seat_limit > 0 AND whatsapp_number_limit >= 0 AND storage_limit_bytes > 0),
  ADD CONSTRAINT plan_modules_known CHECK (modules IS NOT NULL AND modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports']::text[]);

-- The lifecycle's states (spec 7.3); a trial has its last day; overrides add, never take away.
ALTER TABLE "subscription"
  ADD CONSTRAINT subscription_billing_cycle_value CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD CONSTRAINT subscription_status_value
    CHECK (status IN ('trial', 'active', 'past_due', 'read_only', 'suspended', 'cancelled')),
  ADD CONSTRAINT subscription_trial_dated CHECK (status <> 'trial' OR trial_ends_on IS NOT NULL),
  ADD CONSTRAINT subscription_overrides_not_negative CHECK (extra_seats >= 0 AND coalesce(custom_price_paise, 0) >= 0),
  ADD CONSTRAINT subscription_extra_modules_known CHECK (extra_modules IS NOT NULL AND extra_modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports']::text[]);

-- A payment is money received; a provider's payment carries the provider's id; voiding records why.
ALTER TABLE "subscription_payment"
  ADD CONSTRAINT subscription_payment_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT subscription_payment_provider_value CHECK (provider IN ('manual', 'razorpay')),
  ADD CONSTRAINT subscription_payment_provider_id CHECK (provider = 'manual' OR provider_payment_id IS NOT NULL),
  ADD CONSTRAINT subscription_payment_reference_length CHECK (char_length(reference) <= 100),
  ADD CONSTRAINT subscription_payment_voided
    CHECK ((voided_at IS NULL) = (void_reason IS NULL) AND char_length(void_reason) <= 200);

-- One row holds the policy, with the spec's defaults (Q3: 7 days past due, then 14 read-only).
ALTER TABLE "subscription_policy"
  ADD CONSTRAINT subscription_policy_one_row CHECK (id),
  ADD CONSTRAINT subscription_policy_days CHECK (past_due_days BETWEEN 1 AND 90 AND read_only_days BETWEEN 1 AND 180);
INSERT INTO "subscription_policy" (id) VALUES (true);

-- The api reads all of these for its request checks; only the platform role writes them. The worker's lifecycle job
-- may move a subscription's status along, and change nothing else.
REVOKE INSERT, UPDATE, DELETE ON TABLE "plan", "subscription_policy", "subscription", "subscription_payment"
  FROM app_runtime;
GRANT UPDATE (status, status_changed_at, updated_at) ON TABLE "subscription" TO app_runtime;
