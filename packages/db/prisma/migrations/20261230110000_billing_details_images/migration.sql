-- The firm's logo and signature (keys of images in object storage, under platform/billing/) and the signatory's name and
-- title, printed on the invoice. All optional. It only adds; undoing it drops the four columns.
ALTER TABLE "platform_billing_details"
  ADD COLUMN "logo_key" TEXT,
  ADD COLUMN "signature_key" TEXT,
  ADD COLUMN "signatory_name" TEXT,
  ADD COLUMN "signatory_title" TEXT;
