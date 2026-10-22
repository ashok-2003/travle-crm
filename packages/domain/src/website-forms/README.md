# website-forms

An agency's one enquiry form, shared by link and pasted into its website (website form spec
`docs/superpowers/specs/2026-10-22-website-form-design.md`, ADR 0033). L0, beside `sheets`: crm calls it
(`receiveWebsiteEnquiry`), and it never calls crm or today.

- **The key** (`key.ts`): the organization's id as 22 base64url characters and 16 random ones, 38 in all (F12).
  `parseFormKey` accepts only the spelling `formKeyOf` writes.
- **The open check** (`open-state.ts`): `formOpenState` names why a form is closed for the settings page;
  `assertFormOpen` answers a visitor with `FORM_NOT_FOUND` (wrong key) or one `FORM_UNAVAILABLE` for every closed state.
  It runs inside the submission's transaction (W23).
- **The opened token** (`opened-token.ts`): HMAC-SHA256 under a key derived from the auth secret; under 2 seconds is
  `FORM_TOO_FAST`, over 24 hours or another form's is `FORM_EXPIRED`.
- **The ledger** (`ledger.ts`): ids, outcomes and times only. `findSubmission` takes an advisory lock on the submission id,
  so two racing submissions take turns; `recordSubmission` ignores a row a racer wrote first.
- **`limits.ts`** is the only place a number is written. **`checks.ts`** holds the text checks; **`flood.ts`** the once-an-hour
  `form.busy` notice.
- Audit: record type `website_form`; the log holds modes, flags and text lengths, never the key or the agency's words.
