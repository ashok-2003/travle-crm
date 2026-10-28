-- CreateTable
CREATE TABLE "quote" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" DATE,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "days" JSONB NOT NULL DEFAULT '[]',
    "items" JSONB NOT NULL DEFAULT '[]',
    "inclusions" TEXT NOT NULL DEFAULT '',
    "exclusions" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 500,
    "place_of_supply" TEXT,
    "subtotal_paise" BIGINT NOT NULL DEFAULT 0,
    "tax_paise" BIGINT NOT NULL DEFAULT 0,
    "total_paise" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "replaced_by_id" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pdf_document_id" UUID,
    "pdf_version" INTEGER,
    "invoice_document_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_installment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "due_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_payment" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "received_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "request_id" UUID,
    "quote_status_before" TEXT,
    "lead_stage_before" TEXT,
    "recorded_by" UUID,
    "receipt_document_id" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "upi_id" TEXT NOT NULL DEFAULT '',
    "upi_name" TEXT NOT NULL DEFAULT '',
    "default_tax_rate_basis_points" INTEGER NOT NULL DEFAULT 500,
    "default_terms" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "quote_lead" ON "quote"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_organization_id_id_key" ON "quote"("organization_id", "id");

-- CreateIndex
CREATE INDEX "quote_installment_quote" ON "quote_installment"("organization_id", "quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_installment_organization_id_id_key" ON "quote_installment"("organization_id", "id");

-- CreateIndex
CREATE INDEX "quote_payment_quote" ON "quote_payment"("organization_id", "quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_payment_organization_id_id_key" ON "quote_payment"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_payment_request_once" ON "quote_payment"("organization_id", "request_id");

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_pdf_document_id_fkey" FOREIGN KEY ("organization_id", "pdf_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_invoice_document_id_fkey" FOREIGN KEY ("organization_id", "invoice_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_replaced_by_id_fkey" FOREIGN KEY ("organization_id", "replaced_by_id") REFERENCES "quote"("organization_id", "id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_installment" ADD CONSTRAINT "quote_installment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_installment" ADD CONSTRAINT "quote_installment_organization_id_quote_id_fkey" FOREIGN KEY ("organization_id", "quote_id") REFERENCES "quote"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_payment" ADD CONSTRAINT "quote_payment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_payment" ADD CONSTRAINT "quote_payment_organization_id_quote_id_fkey" FOREIGN KEY ("organization_id", "quote_id") REFERENCES "quote"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_payment" ADD CONSTRAINT "quote_payment_organization_id_receipt_document_id_fkey" FOREIGN KEY ("organization_id", "receipt_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quote_settings" ADD CONSTRAINT "quote_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (quotes).
ALTER TABLE "quote"
  ADD CONSTRAINT quote_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT quote_travellers CHECK (adults BETWEEN 0 AND 500 AND children BETWEEN 0 AND 500),
  ADD CONSTRAINT quote_days_array CHECK (jsonb_typeof(days) = 'array'),
  ADD CONSTRAINT quote_items_array CHECK (jsonb_typeof(items) = 'array'),
  ADD CONSTRAINT quote_tax_rate_value CHECK (tax_rate_basis_points IN (0, 500, 1800)),
  ADD CONSTRAINT quote_status_value CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'replaced')),
  ADD CONSTRAINT quote_replaced_by CHECK ((status = 'replaced') = (replaced_by_id IS NOT NULL)),
  ADD CONSTRAINT quote_amounts CHECK (subtotal_paise >= 0 AND tax_paise >= 0 AND total_paise = subtotal_paise + tax_paise),
  ADD CONSTRAINT quote_version_positive CHECK (version >= 1);
ALTER TABLE "quote_installment"
  ADD CONSTRAINT quote_installment_label_length CHECK (char_length(label) BETWEEN 1 AND 80),
  ADD CONSTRAINT quote_installment_amount_positive CHECK (amount_paise > 0);
ALTER TABLE "quote_payment"
  ADD CONSTRAINT quote_payment_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT quote_payment_method_value CHECK (method IN ('upi', 'bank', 'cash', 'card', 'other')),
  ADD CONSTRAINT quote_payment_voided CHECK ((voided_at IS NULL) = (voided_by IS NULL));
ALTER TABLE "quote_settings"
  ADD CONSTRAINT quote_settings_tax_rate_value CHECK (default_tax_rate_basis_points IN (0, 500, 1800));

-- A quote is soft-deleted (ADR 0004), a payment is voided and a setting replaced: the runtime role deletes none of them.
-- An instalment is plain data and may be removed. Erasure and purge, the platform's, delete the rest.
REVOKE DELETE ON TABLE "quote", "quote_payment", "quote_settings" FROM app_runtime;

-- Quotations and receipts are numbered apart from invoices, so no agency may choose their prefixes for its invoices.
-- NOT VALID: a live agency that already chose QT or RCT must not fail the deploy; every new or changed prefix is checked.
ALTER TABLE "organization_profile" DROP CONSTRAINT organization_profile_invoice_prefix_not_reserved;
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_invoice_prefix_not_reserved CHECK (invoice_prefix NOT IN ('SMPL', 'DOC', 'QT', 'RCT')) NOT VALID;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('quote');
SELECT app_enable_org_rls('quote_installment');
SELECT app_enable_org_rls('quote_payment');
SELECT app_enable_org_rls('quote_settings');
