-- CreateTable
CREATE TABLE "trip_cost" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "due_on" DATE,
    "paid_on" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,

    CONSTRAINT "trip_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_expense" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "spent_on" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,

    CONSTRAINT "agency_expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_cost_quote" ON "trip_cost"("organization_id", "quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_cost_organization_id_id_key" ON "trip_cost"("organization_id", "id");

-- CreateIndex
CREATE INDEX "agency_expense_spent_on" ON "agency_expense"("organization_id", "spent_on");

-- CreateIndex
CREATE UNIQUE INDEX "agency_expense_organization_id_id_key" ON "agency_expense"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "trip_cost" ADD CONSTRAINT "trip_cost_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_cost" ADD CONSTRAINT "trip_cost_organization_id_quote_id_fkey" FOREIGN KEY ("organization_id", "quote_id") REFERENCES "quote"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "agency_expense" ADD CONSTRAINT "agency_expense_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (finance).
ALTER TABLE "trip_cost"
  ADD CONSTRAINT trip_cost_category_value CHECK (category IN ('hotel', 'transport', 'flight', 'train', 'activity', 'visa', 'guide', 'other')),
  ADD CONSTRAINT trip_cost_supplier_length CHECK (char_length(supplier) BETWEEN 1 AND 120),
  ADD CONSTRAINT trip_cost_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT trip_cost_voided CHECK ((voided_at IS NULL) = (voided_by IS NULL));
ALTER TABLE "agency_expense"
  ADD CONSTRAINT agency_expense_category_value CHECK (category IN ('salary', 'rent', 'marketing', 'software', 'utilities', 'commission', 'travel', 'other')),
  ADD CONSTRAINT agency_expense_description_length CHECK (char_length(description) BETWEEN 1 AND 200),
  ADD CONSTRAINT agency_expense_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT agency_expense_voided CHECK ((voided_at IS NULL) = (voided_by IS NULL));

-- Money records are voided, never deleted: the runtime role deletes neither. Erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "trip_cost", "agency_expense" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('trip_cost');
SELECT app_enable_org_rls('agency_expense');
