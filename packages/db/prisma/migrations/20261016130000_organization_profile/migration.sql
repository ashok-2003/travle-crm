-- CreateTable
CREATE TABLE "organization_profile" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "legal_name" TEXT NOT NULL,
    "gstin" TEXT,
    "gst_state_code" TEXT NOT NULL,
    "address" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_name" TEXT,
    "invoice_prefix" TEXT,
    "brand_colour" TEXT,
    "document_terms" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "organization_profile_pkey" PRIMARY KEY ("organization_id")
);

-- AddForeignKey
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('organization_profile');

-- The same rules as the contracts': a regular GSTIN in capitals whose state is the profile's, a state code, E.164
-- phones, Indian bank codes, a document-number prefix, a colour, and bounded text.
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_legal_name_length CHECK (char_length(legal_name) BETWEEN 1 AND 120),
  ADD CONSTRAINT organization_profile_gstin_format
    CHECK (gstin IS NULL OR (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' AND left(gstin, 2) = gst_state_code)),
  ADD CONSTRAINT organization_profile_gst_state_code_format CHECK (gst_state_code ~ '^[0-9]{2}$'),
  ADD CONSTRAINT organization_profile_address_length CHECK (char_length(address) <= 500),
  ADD CONSTRAINT organization_profile_contact_name_length CHECK (char_length(contact_name) <= 100),
  ADD CONSTRAINT organization_profile_contact_phone_format CHECK (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT organization_profile_bank_account_name_length CHECK (char_length(bank_account_name) <= 120),
  ADD CONSTRAINT organization_profile_bank_account_number_format CHECK (bank_account_number ~ '^[0-9]{9,18}$'),
  ADD CONSTRAINT organization_profile_bank_ifsc_format CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  ADD CONSTRAINT organization_profile_bank_name_length CHECK (char_length(bank_name) <= 120),
  ADD CONSTRAINT organization_profile_invoice_prefix_format CHECK (invoice_prefix ~ '^[A-Z]{2,5}$'),
  ADD CONSTRAINT organization_profile_brand_colour_format CHECK (brand_colour ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT organization_profile_document_terms_length CHECK (char_length(document_terms) <= 2000);

-- The api writes the profile, but never moves it to another organization, and never deletes it: the platform's purge
-- does, with the organization.
REVOKE UPDATE, DELETE ON TABLE "organization_profile" FROM app_runtime;
GRANT UPDATE (legal_name, gstin, gst_state_code, address, contact_name, contact_phone, bank_account_name,
  bank_account_number, bank_ifsc, bank_name, invoice_prefix, brand_colour, document_terms, updated_at, updated_by)
  ON TABLE "organization_profile" TO app_runtime;
