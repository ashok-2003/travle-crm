-- The agency's own UPI ID, kept once beside its bank details (lite agent, plan 2): the agent quotes it with the advance.
-- The bank columns already exist; the payment QR is an attachment of record type agency_payment_qr.
ALTER TABLE "organization_profile"
  ADD COLUMN "upi_id" TEXT,
  ADD CONSTRAINT organization_profile_upi_id_length CHECK (char_length(upi_id) BETWEEN 3 AND 100);

-- The runtime role updates the profile column by column (see organization_profile's migration).
GRANT UPDATE (upi_id) ON TABLE "organization_profile" TO app_runtime;
