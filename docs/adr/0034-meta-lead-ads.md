# 0034: Meta lead ads

Date: 2026-10-23 · Status: accepted · Applies to the Meta lead ads release (an agency's Facebook Page lead forms become
leads by themselves, read only apart from the Page's webhook subscription; spec
`docs/superpowers/specs/2026-10-23-meta-lead-ads-design.md`)

## Decision

### One app, a port, and nothing written but the subscription

- **The app.** One Meta app, owned by the agencyOS business portfolio, serves every agency. An agency connects a Page
  through Facebook Login for Business and shares the Pages it chooses; the app reads their lead forms. Nothing is posted,
  and nothing is written to Meta but a Page's webhook subscription (and, for the optional test button, one test lead).
- **The port `MetaGraph`** (`@travel-crm/integrations/meta-graph`, ADR 0008) is the only code that calls
  `graph.facebook.com`. It has a real adapter (plain `fetch`, a 10-second timeout, `v25.0` in one constant, the token
  in an `Authorization: Bearer` header, never the URL) and an in-memory one with a settable clock and fault switches for
  every test. An error carries Meta's `code`, `subcode` and `type` and nothing else: never the body, the URL or a token.
  It adds no dependency: `fetch` and `node:crypto`.
- **Spike items** (token type, field names and paging, permission list, test leads under Standard Access, the lead's
  `platform` field, ad fields, test-lead markers) are marked `// SPIKE:` where the build rests on an assumption, and are
  settled against a real test app before the release goes to a pilot.

### Tokens are sealed, with where they are kept

- **`SecretBox`** (`@travel-crm/integrations/secret-box`) seals a Page's access token with AES-256-GCM, a random
  12-byte nonce, and the Page and organization ids as associated data, so a ciphertext copied to another row fails to open.
  The key is `META_TOKEN_KEY` (32 random bytes, base64), a list with the newest first: new seals use the first, any opens.
  The row keeps the ciphertext, the nonce and a key version, which is a digest of the key (so the list can be reordered
  and a key retired without renumbering). The user's login token is used once to list the Pages and then discarded.
- No procedure returns a token, and the audit log, job data, logs and error messages hold none.

### One table outside row-level security, the Page route

`meta_page_route` carries `organization_id` (restricting deletion and update like every other) but has no row-level
security, so the webhook can find a Page's agency from the Page id in a signed delivery, the worker can find the Pages
whose catch-up is due, and the deletion callback can find the Pages a Meta user connected, each without entering an
organization, and so a Page can be unique across every agency (an agency's `meta_page` row cannot see another's). It
holds ids and times only (a test fixes its columns). It follows ADR 0031's pattern for the Sheets schedule: `OrgTx`,
`IdentityTx` and the identity client leave its model out and refuse a cast past the types; it is reached only inside
`db.withoutOrg()` through `@travel-crm/db/meta-routes`, which dependency-cruiser keeps to the meta-leads module's
`routes.ts`; ESLint flags raw SQL naming it elsewhere. `unscopedScheduleTables` and `crossOrganizationUniques` in
`packages/db/test/org-table-fixtures.ts` name it, and nothing else is exempted. A listener of `meta.page-changed`
writes it after the Page's own transaction, so it is never lost and a stale row is harmless.

### The webhook and the callbacks

- `POST /webhooks/meta-leads` is a `WebhookProvider` that checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with
  the app secret) before storing anything and answers before any Graph call; its stored body is ids only. The worker
  fetches each lead with the Page's token and saves it through the one save path, `saveEnquiry`, keyed on the Meta lead
  id in a ledger (`meta_lead`), so a retry, a duplicate and the catch-up converge on one lead. `GET` answers Meta's
  verify challenge in constant time.
- A periodic catch-up reads each brought-in form's recent leads from a stored cursor (a 10-minute overlap, the ledger
  making the overlap free), so a missed webhook never loses a lead.
- `POST /api/meta/data-deletion` verifies Meta's `signed_request` with the app secret, disconnects every Page that user
  connected and deletes their tokens, and answers `{ url, confirmation_code }`. It deletes no lead: those belong to the
  agency.
- Every Graph call goes through a per-organization hourly budget in the rate-limits module; the webhook path borrows from
  the catch-up share first.

### Settings: all five or none

`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_LOGIN_CONFIG_ID` and `META_TOKEN_KEY`. One alone
stops the process, naming the variable and never printing a value; none at all turns Meta off, and the Lead sources
page says so. The demo has no Meta.
