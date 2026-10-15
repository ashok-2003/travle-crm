# 0023: The organization's business profile

Date: 2026-10-16 · Status: accepted · Implements the data of spec section 7.1 (onboarding's GSTIN, state and contacts,
and the setup checklist), with spec 10's "an organization's own branding … stored in the database"

## Decision

- **One `organization_profile` row per organization**, organization-owned under row-level security: legal name,
  GSTIN (optional), GST state, address, contact name and phone, bank account and IFSC, invoice prefix, the
  organization's colour and its document terms. The platform saves it at onboarding, inside the new organization; the
  Owner completes it from the setup checklist.
- **Not on the `organization` table.** That table has no row-level security (sign-in reads it), so every
  organization's bank details there would be readable by any query of it. The organization's name, code, time zone and
  contact email stay where sign-in and email need them.
- **The setup checklist is computed**, from the profile and the active staff count: business details, bank details,
  invoice prefix, branding, staff. The logo, WhatsApp and lead import join when their steps exist.
- **The audit log names the fields that changed**, never their values.

## Consequences

- The api serves it as `organization.profile` (`get`, `update`: legal name, GSTIN and state, address, contact, bank
  details, invoice prefix), `organization.branding` (`get`, `update`: the colour and document terms; the logo comes
  with uploads) and `organization.setup.get` (the checklist). Each needs `settings:manage`, since the profile holds the
  bank details; branding and the checklist never carry the account number. Saving reads the session afresh, as money
  and settings do. Branding can only be saved once the business details exist.
- **One rule for optional text:** a blank box is no value, so `""` (or spaces) becomes null for every optional field.
  Account numbers are accepted as printed on a cheque, with spaces or hyphens.
- **The database repeats the rules** as CHECK constraints, tested directly. The GST state must be one of the kernel's
  state codes (a test compares the database's list with the kernel's, so a new state needs a migration).
- **Saves take turns** (a transaction-scoped advisory lock per organization), so the audit log's changed-field lists
  are accurate when two saves race.
- Documents' frozen branding (ADR 0012) can read the colour and terms from here when quotes arrive; the logo comes with
  uploads (plan 5).
