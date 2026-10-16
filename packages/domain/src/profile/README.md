# profile

An organization's business profile (spec 7.1): what the platform enters at onboarding (legal name, GSTIN, the GST
state, a contact) and what its Owner completes on the setup checklist (address, contact phone, logo, branding for its
documents, bank details, invoice prefix).

## Public functions and values (`index.ts`)

- `getOrganizationProfile(tx, organizationId)`: the organization's profile, or null before one was saved. It names
  the organization rather than rely on row-level security, so a platform transaction gets that one, never another's.
- `saveOrganizationProfile(tx, actor, input)`: saves the whole profile (onboarding, inside the new organization, and
  the Owner later). The input is `saveOrganizationProfileInput` from `@travel-crm/contracts/profile`.
- `updateOrganizationProfile(tx, actor, input)`: saves the business details, keeping the branding.
- `saveOrganizationBranding(tx, actor, input)`: saves the colour and document terms, keeping the details; fails with
  `PROFILE_NOT_SAVED` (CONFLICT) before a profile exists.
- `createProfiles({ db })`: the api's `Profiles`, `get(organizationId)`, `save`, `update` and `saveBranding`, each in
  the organization's own transaction.
- `setupChecklistOf({ profile, activeStaff, hasLogo })`: the checklist's steps, in the order an Owner takes them, and
  whether each is done: `business-details` (the legal name and the address), `contact-phone`, `logo` (one confirmed),
  `branding` (the colour or the terms), `bank-details` (the account number and the IFSC), `invoice-prefix` and `staff`
  (someone besides the Owner).

## Events

None. Saving records `organization-profile.saved` (record `organization`) with the names of the fields that changed,
never their values: bank details are for invoices, not for everyone who may read the audit log. Saving the same values
records nothing.

## Rules worth knowing

- Saves of one organization take turns (an advisory lock until the transaction ends), so the audit log's changed-field
  lists stay true when two saves race.
- One row per organization, under row-level security. The runtime role writes its fields but can't move it to
  another organization or delete it; the platform's purge deletes it with the organization.
- A GSTIN's first two digits are its state's code, and the database checks that too. An agency not registered for GST
  has no GSTIN but still a state: it decides whether a supply is intra-state.
- The invoice prefix is never one the platform numbers its own documents with (`reservedDocumentPrefixes` in
  `@travel-crm/contracts/documents`: `SMPL` for samples, `DOC`), in the contract and by a CHECK, so no invoice shares
  their number series.
- The organization's colours and terms are its own, on its documents; the product's brand is `@travel-crm/brand`.
