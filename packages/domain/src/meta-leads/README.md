# meta-leads

Connecting an agency's Facebook Pages and bringing their lead forms in (Meta lead ads; spec
`docs/superpowers/specs/2026-10-23-meta-lead-ads-design.md`, ADR 0034). L0, beside `imports` and `sheets`: crm calls it, and
it never calls crm or today. crm (`crm/lead-meta/`) turns the leads Meta gives into leads: the webhook's work, the catch-up,
Check again and the import of a form's last 30 days.

- **Limits** (`limits.ts`) are the only place a number is written: five Pages, the half-hour catch-up with its ten-minute
  overlap, 50 leads a read, the per-organization Graph budget (600 calls an hour; the catch-up may use 300 of it).
- **Meta is reached through the `MetaGraph` port** (`@travel-crm/integrations/meta-graph`) and only through `callGraph`
  (`graph-calls.ts`), which spends the budget and returns a failure as a value carrying Meta's codes; nothing it throws is
  read, because a message may hold a URL with a token.
- **A Page token is sealed** (`tokens.ts`, the `SecretBox`), bound to the organization and the Page's row. It leaves this
  module only to be put in a Graph call's header, and no procedure returns it or its ciphertext.
- **Connecting** (`connect.ts`): the login's address with a signed, single-use state; the code exchanged for the Pages the
  person shared, each kept as a `connecting` row; the ticked ones subscribed and run. Reconnect finishes in the same call.
- **`routes.ts` is the only file that names `meta_page_route`** (no row-level security; ids and times only), through
  `@travel-crm/db/meta-routes` inside `db.withoutOrg()`. `meta.page-changed` keeps it (`route-listener.ts`).
- **The ledger** (`ledger.ts`) has one row per Meta lead id and holds no answer: a delivery, a retry and the catch-up converge on
  it, and an erased person's rows keep only the ids (`erasure.ts`).
- **Forms** (`forms.ts`, `bring-in.ts`, `question-fields.ts`, `lead-as-row.ts`): a form is known from first sight; its
  questions are matched by Meta's key; a lead is read as the row of a file so the import's own reading makes the enquiry.
- **Health** (`health.ts`), **the sweep** (`sweep.ts`), **the dispatcher** (`dispatch.ts`) and **the deletion callback**
  (`deletion.ts`) complete the module.
