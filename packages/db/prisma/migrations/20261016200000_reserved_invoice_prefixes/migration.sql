-- An organization's invoice prefix may not be one the platform numbers its own documents with, so no invoice shares
-- their number series: SMPL (branding samples) and DOC (a document issued without a prefix). The list is the
-- contracts' reservedDocumentPrefixes (contracts documents/prefixes.ts); a domain test compares the two.
-- Hand-written: Prisma does not model CHECK constraints.
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_invoice_prefix_not_reserved CHECK (invoice_prefix NOT IN ('SMPL', 'DOC'));
