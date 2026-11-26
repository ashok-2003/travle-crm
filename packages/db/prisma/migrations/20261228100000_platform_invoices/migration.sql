-- CreateTable
CREATE TABLE "platform_billing_details" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "legal_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "pan" TEXT,
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_name_branch" TEXT,
    "upi_id" TEXT,
    "default_terms" TEXT,
    "proforma_prefix" TEXT NOT NULL DEFAULT 'PI',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "platform_billing_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoice_counter" (
    "kind" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "platform_invoice_counter_pkey" PRIMARY KEY ("kind","financial_year")
);

-- CreateTable
CREATE TABLE "platform_invoice" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issued_on" DATE NOT NULL,
    "due_on" DATE,
    "bill_to_name" TEXT NOT NULL,
    "bill_to_address" TEXT,
    "bill_to_state_code" TEXT,
    "bill_to_gstin" TEXT,
    "lines" JSONB NOT NULL,
    "gst_rate_basis_points" INTEGER NOT NULL,
    "subtotal_paise" BIGINT NOT NULL,
    "cgst_paise" BIGINT NOT NULL,
    "sgst_paise" BIGINT NOT NULL,
    "igst_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "notes" TEXT,
    "seller" JSONB NOT NULL,
    "pdf_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "platform_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoice_number_key" ON "platform_invoice"("number");

-- CreateIndex
CREATE INDEX "platform_invoice_newest" ON "platform_invoice"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoice_sequence_key" ON "platform_invoice"("kind", "financial_year", "sequence");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

ALTER TABLE "platform_billing_details"
  ADD CONSTRAINT platform_billing_details_one_row CHECK (id),
  ADD CONSTRAINT platform_billing_details_prefixes CHECK (
    proforma_prefix ~ '^[A-Z0-9-]{1,8}$' AND invoice_prefix ~ '^[A-Z0-9-]{1,8}$')
  -- A number is unique across both kinds, and each kind counts on its own, so equal prefixes would repeat a number.
  , ADD CONSTRAINT platform_billing_details_prefixes_differ CHECK (proforma_prefix <> invoice_prefix);

ALTER TABLE "platform_invoice_counter"
  ADD CONSTRAINT platform_invoice_counter_kind_value CHECK (kind IN ('proforma', 'invoice')),
  ADD CONSTRAINT platform_invoice_counter_value CHECK (value >= 1);

ALTER TABLE "platform_invoice"
  ADD CONSTRAINT platform_invoice_kind_value CHECK (kind IN ('proforma', 'invoice')),
  ADD CONSTRAINT platform_invoice_status_value CHECK (status IN ('issued', 'cancelled')),
  ADD CONSTRAINT platform_invoice_rate_value CHECK (gst_rate_basis_points IN (0, 500, 1200, 1800, 2800)),
  ADD CONSTRAINT platform_invoice_amounts CHECK (
    subtotal_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0
    AND sequence >= 1),
  ADD CONSTRAINT platform_invoice_lines_array CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 20),
  ADD CONSTRAINT platform_invoice_seller_object CHECK (jsonb_typeof(seller) = 'object'),
  ADD CONSTRAINT platform_invoice_cancel_fields CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
    AND (status = 'cancelled' OR (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)));

-- An issued invoice never changes: the only update that is allowed marks it cancelled, once.
CREATE FUNCTION platform_invoice_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
     AND (to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
       = (to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An issued invoice cannot be changed' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER platform_invoice_frozen BEFORE UPDATE ON "platform_invoice"
  FOR EACH ROW EXECUTE FUNCTION platform_invoice_frozen();

-- The platform's alone: the api and worker have no business with them, and invoices and their numbers are a legal
-- record that nobody, not even the platform role, removes.
REVOKE ALL ON TABLE "platform_billing_details", "platform_invoice_counter", "platform_invoice" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "platform_invoice", "platform_invoice_counter" FROM app_platform;
