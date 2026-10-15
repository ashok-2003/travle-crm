# profile

An organization's business profile (spec 7.1): what the platform enters at onboarding (legal name, GSTIN, the GST
state, a contact) and what its Owner completes on the setup checklist (address, bank details, invoice prefix,
branding for its documents).

## Public functions and values (`index.ts`)

- `getOrganizationProfile(tx)`: the transaction's organization's profile, or null before one was saved.
- `saveOrganizationProfile(tx, actor, input)`: saves the whole profile (onboarding, inside the new organization, and
  the Owner later). The input is `saveOrganizationProfileInput` from `@travel-crm/contracts/profile`.
- `setupChecklistOf(profile, activeStaff)`: the checklist's steps (`business-details`, `bank-details`,
  `invoice-prefix`, `branding`, `staff`) and whether each is done.

## Events

None. Saving records `organization-profile.saved` (record `organization`) with the names of the fields that changed,
never their values: bank details are for invoices, not for everyone who may read the audit log. Saving the same values
records nothing.

## Rules worth knowing

- One row per organization, under row-level security. The runtime role writes its fields but can't move it to
  another organization or delete it; the platform's purge deletes it with the organization.
- A GSTIN's first two digits are its state's code, and the database checks that too. An agency not registered for GST
  has no GSTIN but still a state: it decides whether a supply is intra-state.
- The organization's colours and terms are its own, on its documents; the product's brand is `@travel-crm/brand`.
