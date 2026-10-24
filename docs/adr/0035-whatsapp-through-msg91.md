# 0035: WhatsApp through MSG91

Date: 2026-10-23 · Status: accepted · Applies to the WhatsApp release (a chat with an agency's number becomes a lead and a
shared inbox; spec `docs/superpowers/specs/2026-10-23-whatsapp-design.md`)

## Decision

### One MSG91 account, a port, and nothing of MSG91's outside the adapter

- **One account that we own.** Every agency's number sits in one MSG91 account; we pay MSG91 and Meta; agencies never see
  MSG91. Our team adds a number in MSG91's panel and records it in the platform console. Lead ads stay on our own Meta app
  (ADR 0034); WhatsApp does not use it.
- **The port `WhatsAppProvider`** (`@travel-crm/integrations/whatsapp`, ADR 0008) is the only code that calls
  `control.msg91.com`. Its methods return a value and never throw on a provider's answer: `{ ok: true, wamid, requestId }` or a
  typed failure (`window_closed`, `not_on_whatsapp`, `bad_number`, `template_not_approved`, `rate_limited`, `tier_limit`,
  `provider_down`, `unsure`, `other`) carrying MSG91's and Meta's codes and nothing else, never a body, a URL or the key. It
  has a real adapter (plain `fetch`, a 10-second timeout, 30 for media, the key in an `authkey` header) and an in-memory one
  with a settable clock and a switch for every failure, used by every test. No dependency is added.
- **The parser `parseMsg91Event`** turns MSG91's own, loosely named payloads (several names for one field, JSON inside
  strings, one object or a list) into `inbound`, `echo`, `status` or `unknown` events. It never throws and never logs a body.
  Where MSG91's real payloads are unconfirmed it follows its public samples and marks `SPIKE(Sn)`; a fix stays inside the
  adapter, the parser and the fixtures.
- **Spike items S1-S10** wait for the owner's MSG91 account; nothing in the domain, the api or the web depends on an
  unconfirmed field name.

### One webhook, two secrets, never a 4xx for anyone who has them

- **`POST /webhooks/msg91-whatsapp/<token>`** is a `WebhookProvider` (`msg91-whatsapp`) behind one small route in the api,
  since the generic intake has one path segment. MSG91 signs nothing, so `verify` is true only when the path token and the
  static header `x-travel-crm-key` both equal the settings, compared in constant time. The settings are `MSG91_AUTHKEY`,
  `MSG91_WEBHOOK_TOKEN` and `MSG91_WEBHOOK_KEY`: all three or none, never in the database, a log, a job or a response.
- **A 4xx pauses MSG91's webhook for every agency.** So `identify` never returns null (the event id is a hash of the raw
  body, the type the first event's content or status name, or `unknown`), a body over 64 KB is answered 200 and dropped, and
  the only 4xx ever sent is 401 to a caller without both secrets.
- **Store, then work.** The raw event is stored first with no organization; the worker's `process` finds the agency from the
  integrated number in `whatsapp_number_route`, tells the intake with `isAbout`, and handles each event of a batch on its own.
  Dedupe is per message (the unique wamid in `whatsapp_message`) and per status (wamid and status, forward only), never per
  request. A number with no route is counted in `whatsapp_unrouted` and does nothing. The stored payload holds personal data,
  so an hourly sweep blanks it after 7 days, routed or not, and purge and erasure blank it as ADR 0023 says.

### Two tables outside row-level security

`whatsapp_number_route` (integrated number, organization, connection: ids only, unique across every agency) and
`whatsapp_unrouted` (a number, first and last seen, a count: no organization at all) let the webhook find an agency from a
number without entering one. They follow ADR 0034's pattern for `meta_page_route`: `OrgTx`, `IdentityTx` and the identity
client leave their models out and refuse a cast past the types; they are reached only inside `db.withoutOrg()` through
`@travel-crm/db/whatsapp-routes`, which dependency-cruiser keeps to the inbox module's `routes.ts`; ESLint flags raw SQL naming
either elsewhere; the isolation tests' named lists and the exact-columns test cover them. A listener of
`whatsapp.connection-changed` keeps the route table, so it is never lost and a stale row is harmless.

### What is stored

Every other table is an organization table under row-level security: the connection, the conversation (one per person and
number, not per lead), the message (the dedupe ledger and the record of what was said), the template and the monthly usage.
Messages are plain columns, with no per-message encryption (the database is the agency's trust boundary, as for notes and
files); a message is never an audit row, and no log, job, event or notification holds a customer's number or words.
