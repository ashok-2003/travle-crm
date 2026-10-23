# Meta lead ads: Facebook and Instagram enquiries into the CRM

- **Status:** draft for the owner's answers in section 0.
- **Date:** 2026-10-23
- **Scope:** Phase 1, the Meta release: an agency connects its Facebook Page, chooses which lead forms to bring in, and
  every answer to those forms becomes a lead by itself, as a Google Sheet row or a website enquiry does. Nothing is
  ever written to Meta except the Page's webhook subscription.
- **Input:** the Sheets spec (`2026-10-19-sheets-sync-design.md`, "S" rules: connecting, column matching, catching up,
  budgets, erasure), the bulk spec (`2026-10-19-bulk-in-and-out-design.md`, "B": one save path, no duplicates), the
  website form spec (`2026-10-22-website-form-design.md`, "W": a source and its detail), release 4's spec (`assign`),
  `CLAUDE.md`, `apps/api/src/webhook-providers.ts` and `packages/domain/src/webhooks`. The reverted connectors commit
  (38d898f9) gave ideas only: the leadgen parser, signature check and "fetch the lead with the Page's token".
- **Decided elsewhere, not re-asked:** leads arriving by themselves is the product's USP; Meta comes after Sheets and
  the website form; the pilot can use it as an app tester during App Review (`phase-1-releases`); design for
  always-on hosting (`design-for-paid-hosting`); no duplicates, in the owner's words, everywhere.

## 0. For the owner

Five questions that change what is built. Each has my recommendation; if you say nothing I build the recommendation.

1. **How many Facebook Pages per agency?** Recommend **up to 5** (one constant, ready to become a plan limit like the
   Sheets limit). Agencies often keep a brand Page and a few destination Pages. Each Page has its own token and its own
   forms, so 5 costs nothing extra. An Instagram-only business is covered: Instagram lead ads use lead forms that live on
   a Facebook Page, and an Instagram account must be linked to a Page to run them. No separate Instagram login.
2. **What is the lead's source?** Recommend **one source value, `meta_lead_ad`** (it is already in `leadSources`),
   worded "Facebook or Instagram lead ad", with the detail "<form name> · Facebook" or "· Instagram" taken from the lead's
   platform. Splitting it into two source values would change the lead table's check, the filters, the export words and
   the audit words for a distinction the detail already shows. If you want two filters in Reports later, it is a view on
   the detail, not a new value.
3. **Leads from before connecting?** Recommend **ask at bring-in, default "only new leads"**, with a second choice
   "Also check the last 30 days" through the import's preview and its "Already in your CRM" group (S14, section 3.3 there).
   Meta keeps a form's leads for a limited time (90 days is the figure in Meta's help; its API reference doesn't state a
   period), so a longer look-back isn't promised.
4. **A new form appears on a connected Page, or an unselected form gets a lead?** Recommend **never bring it in
   silently**: its leads are not saved, the Owner is told once ("A lead came from 'Diwali offers', a form you haven't
   brought in. Bring it in?"), and bringing it in matches its questions and then catches up the leads it skipped. A form
   brought in blind could put an unmatched phone question in the note and miss the phone.
5. **Who may connect?** Recommend **anyone holding both `leads:create` and `leads:assign`** (the Owner, the Admin
   starter role), as for Sheets, and the connecting person must hold the ADVERTISE task on the Page at Meta (Meta's own
   rule for the token). Agencies where the ads are run by an outside marketer: that person connects and the Owner is told.

## 1. Why this feature

A travel agency's best-paying enquiries come from lead ads: someone taps an ad, a form opens inside Facebook or Instagram
with their name and phone already filled, and they tap Send. Today those answers sit in Meta's Leads Center and are
downloaded as a file, or copied by someone, hours or days later, when the lead has gone cold.

**Goals**

- An Owner connects a Page in about three minutes and a new answer is a lead in the CRM within seconds (the webhook), with
  an owner by the agency's rules and a notice.
- **Nothing is lost:** a missed webhook (ours down for a deploy, Meta's retry window over) is made up by a periodic read of
  each form's recent leads from a stored cursor. This is about correctness at any hosting size, not about sleeping.
- **No duplicates:** a person is one person with one open lead whichever way they arrive, however often Meta delivers.
- A broken connection (expired token, removed from the Page, form deleted) is noticed, said plainly and told once.

**Non-goals:** posting to Meta, replying to a lead by Messenger or Instagram DM (the WhatsApp release); creating or editing
forms, ads or audiences; ad spend or cost per lead (the ads API is a different permission set); Conversions API feedback;
a "sign in with Instagram" for anything.

**Anti-goals:** a token in a log, a job or an error message; a lead's answers in a log or job; a second lead for the same
Meta lead id; one agency receiving another's leads (a Page connected to two agencies); the webhook blocking on the Graph API.

## 2. What Meta requires (checked 2026-10-23)

Read from Meta's current documentation; items I could not confirm are marked **spike** and are settled by the first build
step (section 14), which runs against a real test app before anything else is built on them.

- **Graph API version:** latest is **v26.0** (released 2026-07-29, expiry not yet set); v25.0 (2026-02-18) is supported
  until 2028-07-29. We pin **v25.0** as one constant and move on purpose, as the project pins everything; the app's
  Webhooks "API version" is set to the same.
  <https://developers.facebook.com/docs/graph-api/changelog/versions>
- **The webhook:** subscribe the Page object's `leadgen` field in the App Dashboard, and install the app on each Page with
  `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` using a Page access token. A delivery carries
  `object: "page"` and `entry[].changes[]` with `field: "leadgen"` and `value`: `leadgen_id`, `page_id`, `form_id`,
  `ad_id`, `adgroup_id`, `created_time`: **ids only, never the answers**. Up to 1,000 changes may be batched in one
  delivery, so every change is handled on its own.
  <https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/quickstart/webhooks-integration>
- **Webhook mechanics:** a `GET` with `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge` when the callback is
  saved (answer the challenge only if the token matches); each `POST` is signed in `X-Hub-Signature-256: sha256=<hex>`,
  the HMAC-SHA256 of the raw body with the app secret; the endpoint must be HTTPS; on failure Meta retries at once and
  then at falling frequency for 36 hours and then drops the update, and tells us to deduplicate.
  <https://developers.facebook.com/docs/graph-api/webhooks/getting-started>
- **Reading leads:** `GET /{form-id}/leads?fields=id,created_time,field_data,ad_id,ad_name,form_id,platform` (the field list
  is a **spike**), `field_data` being `[{ name, values: [..] }]`, paged with `paging.cursors`, and filtered by time with
  `filtering=[{field:"time_created",operator:"GREATER_THAN",value:<unix>}]`. A single lead is `GET /{leadgen_id}`.
  A custom disclaimer's tick boxes are not in `field_data`; they come from `custom_disclaimer_responses`.
  The call limit is "200 x 24 x the number of leads the Page created in the past 90 days" within 24 hours, with error
  code 80005 when exceeded; a quiet Page has a small allowance, so every call here must be worth making (section 8).
  <https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving>
- **Listing forms and their questions:** `GET /{page-id}/leadgen_forms` and `GET /{form-id}?fields=name,status,questions`
  (**spike**: field names and paging; the reference page for reading the edge was not fetchable).
- **Permissions** (names as Meta writes them; its pages disagree on `lead_retrieval` and `leads_retrieval`, the
  Retrieving page uses **`leads_retrieval`**, and the webhook page omits it and `pages_manage_ads`): for the webhook
  `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `ads_management`; for reading leads
  **`leads_retrieval`**, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` and `ads_management`. We request
  that union. **Spike:** whether `ads_management` can be dropped (it is the permission App Review scrutinises most).
  The token must come from a person who can perform the ADVERTISE task on the Page; if the business restricted Leads
  Access Manager, a Page admin may still not be allowed to read leads.
- **Facebook Login for Business:** a saved *configuration* (permissions, assets, token type) is passed as `config_id`
  instead of `scope`. Two token types: a **user access token** (short-lived, from the person's account) and a **business
  integration system user token** (tied to the agency's business portfolio, never expires unless asked to, authorization
  code grant, web only). To serve businesses we don't own, the app needs **Advanced Access** through App Review; a
  Login for Business app needs `public_profile` Advanced Access before going live.
  <https://developers.facebook.com/docs/facebook-login/facebook-login-for-business>
  **Spike:** which token type yields a durable Page token for `subscribed_apps` and `/leads`. My expectation is the user
  token, exchanged on our server for a long-lived one, from which `GET /me/accounts` gives each Page's token;
  the system-user token is the alternative if Pages can be reached with it. The port (6.1) hides the choice; the table
  stores the kind and an optional expiry either way (4.3).
- **Testing:** the Lead Ads Testing Tool (<https://developers.facebook.com/tools/lead-ads-testing>) creates one test lead
  per form, needs a Page role of Advertiser or above, and **cannot be used while the app is in developer mode**; the
  API's `POST /{form-id}/test_leads` makes one too (one per form, Page access token). See section 9.
  <https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/testing-troubleshooting>
- **Data deletion:** the app must have a Data Deletion Request URL (HTTPS) or a deletion-instructions URL. Meta POSTs a
  `signed_request` (`<signature>.<payload>`, base64url, payload `{algorithm, expires, issued_at, user_id}` with the
  app-scoped user id, HMAC-SHA256 with the app secret) and expects JSON `{ url, confirmation_code }`.
  <https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback>
- **Modes:** unapproved permissions work only for people with a role on the app; Business-type apps have no
  Development/Live switch and are governed by access levels instead (the Facebook Login for Business app type is
  Business). So "development mode" below means "Standard Access, role holders only". App Review and Business
  Verification are in section 13.
  <https://developers.facebook.com/documentation/development/build-and-test/app-modes>

## 3. Who uses it and the screens

- **Connecting, choosing forms, matching, pausing, disconnecting:** whoever holds `leads:create` and `leads:assign` (Q5).
- **Everyone else** sees the leads like any lead (source, detail, owner); they don't see the connection, the tokens
  (nobody sees tokens), or the problem list (it shows names).
- **The agency Owner** gets the notices (section 11). **Platform staff** see counts on an organization's page only.

Built from the registry components and the shared pieces (`CLAUDE.md`); each screen has loading, empty,
error-with-retry and refusal states. Changes ask `useWriteAccess("change")`, Disconnect and Pause `"revoke"`. Words in
`meta-leads.json`. Mobile first.

**3.1 Lead sources (Settings, `/settings/lead-sources`, the page Sheets made).** A new group **Facebook and Instagram
lead ads** under Google Sheets: an `ItemGroup` of connected Pages, each an `Item` with the Page's name, "N forms brought
in · last checked 10:42" and a `StatusBadge` (**Running**, **Paused**, **Needs reconnecting** red, **Needs attention**
amber), and **Connect a Page** (primary; disabled at 5 Pages with its `WriteHint`; "Not available in the demo" in the
demo; the page says so where `META_APP_ID` is unset, as Sheets does for Google).

**3.2 Connect (`/settings/lead-sources/meta/connect`).** One step, then the Page's own page:
1. A sentence ("We read your lead forms' answers. We never post, message or change anything on your Page.") and
   **Continue with Facebook** (primary). It opens Facebook's own dialog for our *configuration*; the person logs in
   and chooses the Pages to share. The permissions in the dialog are Meta's; our sentence says what we do with them.
2. Back on `/settings/lead-sources/meta/callback` the api exchanges the code (the app secret never reaches the browser),
   lists the Pages the person shared that they can advertise on, and the screen shows them as checkboxes (those already
   connected here ticked and disabled; one connected to another agency, "already connected elsewhere", S4). **Connect N
   Pages** subscribes each (`subscribed_apps`) and stores its token. Every way it can fail has its own sentence: login
   cancelled, a permission refused ("Facebook didn't give us permission to read lead forms. Connect again and tick
   every box."), not allowed to advertise on the Page, limit reached, Meta not answering.

**3.3 A Page (`/settings/lead-sources/meta/pages/<pageId>`).** `PageHeader` with the Page's name and its badge; **Check
now** (S's "Sync now"); **Pause**, **Reconnect**, **Disconnect Page** (`ConfirmDialog`: "Stop bringing in leads from
<Page>? Leads already here stay. Facebook's copy is untouched."). Then **Lead forms**: a `Table` of the Page's forms
(name, Meta's status Active/Archived, "Brought in" or "Not brought in", leads added, last lead) with **Bring in** per row
and **Edit questions** for brought-in forms. Below it **Leads that couldn't be added**, with a reason each (a phone that
isn't a number, no name, a form with an unmatched required question), a name and a short example (kept 7 days after being
fixed, hidden by Hide, emptied by erasure like S's), and **Check again** per row, which re-reads the lead from Meta.

**3.4 Bring in a form.** A dialog route `/settings/lead-sources/meta/pages/<pageId>/forms/<formId>/bring-in`:
1. **Match questions:** the S/B `ColumnMatcher` with the form's questions in place of columns: each question's label, its
   Meta type (Full name, Email, Phone, City, or Custom), an example if Meta's last lead has one (never from a lead we
   haven't brought in), and a `Select` of our fields ("Add to the note" first for a custom question; "Don't import"
   second). Standard types are matched for the person (full name, first and last name joined, phone, email, and Meta's
   city/state/ZIP, kept in the note as "From: Jaipur"); custom questions go through `guessFields` on their label
   ("Where do you want to go?" to Destination, "How many people?" to Travellers); everything left goes to the note as
   "Question: answer", in the form's order. The checklist: a name and a phone, email or Instagram handle (Meta forms nearly
   always ask phone). **Next.**
2. **Earlier leads** (Q3): only new (default) or also the last 30 days, which makes an import named after the form
   ("Rajasthan winter ad · 23 Oct") reaching its preview with the "Already in your CRM" group. **Bring in the form**
   (confirm: "New answers become leads within seconds.").

A form whose questions change at Meta after being brought in (a question added or removed) raises "Needs attention" on the
form: lead answers to a question with no match still go to the note, so nothing is lost, and the Owner is asked to look
(11). Questions are matched by Meta's question key, not its wording.

## 4. How it behaves

### 4.1 Tokens and storage

- **M1. Tokens are encrypted at rest.** The Page token is sealed with AES-256-GCM (`node:crypto` through a `SecretBox`
  port in `packages/integrations`, a random nonce per value, the Page and organization ids as associated data so a
  ciphertext copied to another row fails to open) with a key from `META_TOKEN_KEY` (32 random bytes, base64) that lives in
  the environment only. The row stores `token_ciphertext`, `token_nonce`, `token_key_version` (so the key can be rotated:
  both versions are accepted in the setting, new writes use the newest). The user's login token is used once to list the
  Pages and then discarded; only Page tokens are kept.
- **M2. Tokens never leave the server.** No procedure returns a token or a ciphertext; the web app, the audit log, job
  data, error messages and logs hold none (the adapter builds errors from Meta's error `code`, `error_subcode` and `type`
  only, never the response body or the URL, because a Graph URL can carry `access_token`). The token goes in an
  `Authorization: Bearer` header, not the query. A test makes the fake Graph fail with a token-bearing message and asserts
  the log and the stored error are clean.
- **M3. Expiry and reconnecting.** A Meta error 190 (with subcodes for expired, password changed, session invalidated,
  app removed) or an OAuth permission error on a Page call moves the Page to **needs_reconnect**: bring-in and catch-up
  stop for it, the Owner is told once (11), and **Reconnect** repeats 3.2 for that Page. The Page keeps its forms,
  matches, cursors and ledger (they are keyed by Meta's ids), and the first catch-up after reconnecting reads from the
  cursor, so a lead made while it was down comes in if Meta still holds it. Where the token has a known expiry
  (`token_expires_at`, from Meta's `debug_token`), a daily check warns the Owner 7 days before. The `debug_token` call
  is the only one that uses the app token (`app_id|app_secret`), and it sends it in a header too.
- **M4. A Page belongs to one agency at a time.** `meta_page_route` (section 5) is unique on `page_id` across all
  organizations; connecting a Page held by another agency is refused ("already connected elsewhere"), as S4 does for a
  sheet. Disconnecting frees it. A person who runs one Page for two agencies connects it in one and disconnects it before
  the other.

### 4.2 The webhook (receive fast, work in the worker)

- **M5. `POST /webhooks/meta-leads`** is a `WebhookProvider` named `meta-leads` in `apps/api/src/webhook-providers.ts`,
  built when `META_APP_SECRET` is set. (WhatsApp's release adds its own `whatsapp` provider and callback URL; Meta lets
  each product have its own.) `verify` is the existing `hmacSha256Signature` on the raw body with header
  `x-hub-signature-256`, prefix `sha256=`, hex, constant-time; `keptHeaders` is that header; `identify` returns the first
  change's `leadgen_id` as the event id and `leadgen` as its type. The intake stores the delivery and answers 200 before
  any Graph call; a bad signature is refused with nothing stored. The stored payload holds ids only, so it holds no
  personal data (a webhook event row is outside row-level security, ADR 0023).
- **M6. `GET /webhooks/meta-leads`** answers Meta's verification: if `hub.mode` is `subscribe` and `hub.verify_token`
  equals `META_WEBHOOK_VERIFY_TOKEN` (constant-time), respond 200 with `hub.challenge` as plain text; otherwise 403. The
  generic intake is POST only today, so this is one small route in `apps/api` beside the intake, in the same rate-limit
  class as the other public routes, answering nothing about the app otherwise.
- **M7. The provider's `process`** (the worker, at least once per event) handles each change in the delivery
  independently, so one bad change doesn't block its neighbours:
  1. look up the Page in `meta_page_route` (inside `db.withoutOrg`) for its organization; no row (never connected, or
     disconnected) is a quiet success; `processing.isAbout(organizationId)`;
  2. in `db.forOrg`, read the Page, form and ledger. A form not brought in: count it, notify once (Q4), stop. A Page that is
     paused or in needs_reconnect: stop (the catch-up will find the lead once the Page runs again);
  3. insert the ledger row (`meta_lead_id` unique with the organization) as `pending`; a row already `added`, `merged`,
     `duplicate` or `erased` ends here (idempotent: Meta retries and the catch-up overlaps);
  4. **outside any transaction**, `GET /{leadgen_id}` with the Page's token through the per-organization Graph budget (8.1);
  5. in one `db.forOrg` transaction: `saveEnquiry` (M9) and the ledger update, so a lead is either saved and marked or not
     saved and `pending`; the catch-up retries any `pending` row older than 5 minutes.
- **M8. Failures.** A Graph error that is permanent for the lead (deleted lead, 100 invalid parameter, permission to this
  lead) marks the row `not_added` with a reason code and no retry; a transient one (network, 5xx, 429, error 80005 or 4/17/32
  rate codes) fails the attempt so the worker retries with backoff, and the catch-up covers it past that; error 190 is M3.

### 4.3 Saving the lead

- **M9. One save path.** The lead goes through `saveEnquiry` as an import does (`from: "import"`, `unverified` set only for a form the
  person typed freely: Meta prefills phone and email from the account, so the contact is treated as the import's, not the
  website form's), with source `meta_lead_ad`,
  the detail "<form name> · Facebook" or "· Instagram", the audit detail `{ metaLeadId, formId }`, an enquiry date from
  Meta's `created_time` (UTC, shown in the agency's zone), the note from M10, and **`assign`** set as in release 4 (the
  agency Owner is the fallback; the rules, mode, away and working hours apply the day they are on). The actor is the
  connector: `systemActor(organizationId)` with source `integration` and, as in S, the connection's id as the detail.
- **M10. The note.** Unmatched questions as "Question: answer" lines in the form's order, then "Ad: <ad name>" and
  "Campaign: <campaign name>" when Meta returns them (**spike**: they are lead fields needing ads permissions; drop them
  if they don't come), plain text, 4,000 characters at most. The answers are never logged.
- **M11. No duplicates (B15, as Sheets).** The person is found by phone, then email, then Instagram handle (the
  existing match). An open lead gets a **repeat enquiry** with the new answers in its note and the owner is told; a person
  with only closed leads gets a new lead marked **Returning**; an identical re-delivery (same `meta_lead_id`) is the ledger's
  and creates nothing. Meta lets one person submit a form twice: two different lead ids, so the second becomes a repeat
  enquiry, never a second lead. A phone Meta returns with a `p:` prefix (as its CSV does) or without a country code is
  read by the kernel's `phoneNumber` with the +91 default (S's rule); one that still isn't a number is `not_added`
  with reason `phone_invalid` and shown in the problem list.
- **M12. Test leads** (section 9) are saved like any lead but marked: Meta's test leads carry `is_organic`/test markers
  (**spike**); until the spike says how to tell them, the detail is the form's name and the lead is a lead.

### 4.4 Choosing forms and matching

- **M13. Forms are read when the Page connects and when its page is opened** (cached 5 minutes; a daily read refreshes
  names and Meta's status). A form is a `meta_form` row from first sight, `not_brought_in`; bringing it in creates its
  question rows from the mapping the person made. Only brought-in forms are saved from webhooks or read by the catch-up.
- **M14. Matches are by question key** (`meta_form_question.question_key`), kept per form; Edit questions reopens 3.4 step 1.
  Changing a match affects only leads after it (an already-added lead isn't rewritten). A new, unmatched question goes
  to the note until matched.

### 4.5 Catching up missed leads

- **M15. The cursor.** Each brought-in form has `catchup_cursor`: the Meta `created_time` (Unix seconds) of the newest lead
  fully handled, set at bring-in to "now" (or to 30 days ago for Q3's second choice, whose rows go through the import).
- **M16. The read.** The worker runs `meta.dispatch-catchups` every minute, which claims due Pages from
  `meta_page_route.next_catchup_at` (every 30 minutes per Page, plus Check now), and for each Page, for each brought-in
  form: `GET /{form}/leads` with `filtering = time_created GREATER_THAN (cursor - 600 s)`, paged 50 at a time, newest
  last. A 10-minute overlap guards against Meta's lead ordering and clock skew; the ledger makes the overlap free. Each
  lead not in the ledger goes through M7 steps 3 to 5 (the list response carries the answers, so there is no second
  fetch). The cursor moves to the newest `created_time` seen only after the page of leads is saved, so a crash re-reads.
  A form with nothing new costs one call. The same pass re-subscribes the Page if `subscribed_apps` no longer lists our
  app, retries `pending` ledger rows, and reports the Page's token health (M3).
- **M17. A quiet Page and the call limit.** Because the allowance is proportional to the Page's recent leads (section 2),
  the catch-up spaces its calls (30 minutes, one list call per form) and treats code 80005 as "back off until the next
  tick", not as a failure; the webhook path costs one call per lead.
- **M18. It runs in the worker with no hosting assumption.** Like Sheets' check it reads Meta outside any transaction and
  saves in small ones; unlike Sheets there is nothing to fear from missed ticks, because the cursor, not the tick count,
  decides what to read.

### 4.6 Disconnect, pause

- **Pause** stops saving and reading for a Page but keeps the subscription (leads in the meantime are found on Resume by
  the catch-up). **Disconnect Page** sets status `disconnected`, calls `DELETE /{page}/subscribed_apps` (best effort: if
  Meta fails the row is still disconnected and the token is still deleted), deletes the token fields and the route row, and
  keeps the forms, matches and ledger, so reconnecting resumes. **Disconnecting every Page** needs nothing else. Leads
  already saved are untouched.
- **Removing the person who connected** (staff removal) doesn't affect the Page; if they lose the Page role at Meta the
  token fails with 190/200 and M3 applies; "connected by" shows a removed member as "Former member".

## 5. Data

All but `meta_page_route` are organization tables under row-level security (ADR 0028): `organization_id` referring to
`organization` `ON DELETE RESTRICT ON UPDATE RESTRICT`, `SELECT app_enable_org_rls('<table>');` in the migration that creates
them, UUID v7 ids, keys and unique constraints including `organization_id`, CHECK lists for fixed values, and a row-creating
fixture each in `packages/db/test/org-table-fixtures/meta-leads.ts`. Migrations only add (a table, columns with defaults, an
index). Nothing is seeded. None is soft-deleted.

- **meta_page:** `page_id` (Meta's, text), `page_name` (cache; may be a business name, kept out of audit), `status`
  (connecting, running, paused, needs_reconnect, disconnected); `token_ciphertext`, `token_nonce`, `token_key_version`,
  `token_kind` (user_long_lived, system_user), `token_expires_at` (nullable); `meta_user_id` (the app-scoped id of whoever
  connected, for the deletion callback); `connected_by`, `impersonated_by`; `subscribed_at`; `last_checked_at`, `last_ok_at`,
  `consecutive_failures`, `attention_since`; `leads_added`, `leads_merged`, `leads_duplicate`; created and disconnected
  times. Unique `(organization_id, id)`; partial unique `(organization_id, page_id)` where `status <> 'disconnected'`; index
  `(organization_id, id DESC)`.
- **meta_form:** `page_id` (the row), `form_id`, `form_name` (cache), `meta_status`, `state` (not_brought_in, running,
  paused, needs_attention), `catchup_cursor` (bigint Unix seconds), `skipped_leads` (count, for Q4's notice), `questions_hash`,
  `brought_in_at`. Unique `(organization_id, form_id)`.
- **meta_form_question:** `form_id` (the row), `question_key`, `question_type` (full_name, first_name, last_name, email, phone,
  city, state, zip, custom, other), `label` (cache), `field` (null: don't import; "note": add to the note; or one of the lead
  import's fields; CHECK list). Unique `(organization_id, form_id, question_key)`.
- **meta_lead (the ledger):** `meta_lead_id` (text), `form_id`, `status` (pending, added, merged, duplicate, not_added,
  erased), `reasons` (text[] of codes), `lead_id`, `person_id` (composite keys), `created_at_meta`, `platform`
  (facebook, instagram, other), `example_name` (at most 120 characters, problems only, emptied by erasure), `resolved_at`,
  `first_seen_at`, `processed_at`. Unique `(organization_id, meta_lead_id)`; partial index on `(organization_id, form_id,
  first_seen_at)` where `status = 'not_added' AND resolved_at IS NULL`; one on `(organization_id, person_id)` for erasure;
  one on `(organization_id, first_seen_at)` where `status = 'pending'` for the retry. **It holds no answers and no contact.**
- **meta_page_route (outside row-level security; an explicit, reviewed exemption, as `sheet_check_schedule` is, ADR 0031):**
  `page_id` (primary key, unique across all agencies: this is the claim of M4), `organization_id` (restricting
  deletion like the others, so the keys test still covers it), `meta_user_id`, `next_catchup_at`, `claimed_until`. Ids and
  times only. The webhook provider has to find the organization from a Page id without entering one, and the deletion
  callback from a Meta user id, so it can't be under row-level security; therefore it is reached only through
  `@travel-crm/db/meta-routes` (`metaRoutes(tx)`) inside `db.withoutOrg`, guarded exactly as Sheets' exempt tables: the
  named `unscopedScheduleTables` list in the isolation test gains it, `schedule-table.test.ts` pins its columns and grants,
  dependency-cruiser keeps the entry point to the meta-leads module's `routes.ts`, and the ESLint raw-SQL guard flags SQL
  naming the table elsewhere. It is written by a listener of `meta.page-changed` (published in the Page's transaction, safe
  to run twice): a `running`, `paused` (still routed, so the webhook is ignored on purpose) or `needs_reconnect` Page has a row; a
  `connecting` or `disconnected` one has none.
- **Enumerations that change:** `lead.source` already has `meta_lead_ad`; its export and audit words ("Facebook or
  Instagram lead ad") are added if missing. Actor source `integration` already exists. `import_batch` gains `source_meta_form_id`
  (nullable) for Q3's second choice.
- **Contracts** (`@travel-crm/contracts/meta-leads`): strict input schemas, outputs strip, no output field ever holds a token.

## 6. Modules, the port, permissions, api

### 6.1 The Graph adapter (`packages/integrations/src/meta-graph/`)

A port and two adapters (ADR 0008), the only code that calls `graph.facebook.com`:

- **Port `MetaGraph`:** `exchangeLoginCode(code)` (returns the user's id and a long-lived user token), `listPages(userToken)`,
  `subscribePage(pageId, pageToken)` and `unsubscribePage`, `pageIsSubscribed`, `listForms(pageId, pageToken)`,
  `describeForm(formId, pageToken)` (questions), `getLead(leadId, pageToken)`, `listLeads(formId, pageToken, { since, after })`,
  `inspectToken(token)`, and `createTestLead(formId, pageToken)` (**spike**). Every method takes the budget gate (8.1) and returns
  normalised lead records (`{ id, createdAt, platform, answers: { key: string[] }, adName?, campaignName? }`) or a typed failure
  (`token_invalid`, `permission`, `rate_limited`, `not_found`, `unavailable`) carrying Meta's codes and nothing else.
- **Real adapter:** `fetch` with a 10-second timeout, `v25.0` in a constant, bearer token in a header, one retry on a network
  error. **In-memory adapter:** a scripted Graph holding Pages, forms and leads in order with a settable clock and fault
  switches (an expired token, a rate-limited Page), used by every domain test and the journeys through the api's services.
- **`SecretBox` port** with AES-GCM and in-memory adapters, and **`signedRequest`** and **`webhookSigner`** helpers for tests.

### 6.2 The domain module `meta-leads` (L0, beside `sheets`, `website-forms`)

Imports no crm; **crm (L1)** gains `receiveMetaLead(tx, actor, lead, mapping, now)` calling `saveEnquiry` (as
`receiveWebsiteEnquiry` does) and the import's "form" source, so crm calls `meta-leads` and never the reverse. The module holds
connect, pages, forms, mapping, the ledger, the catch-up, the routes, health and the deletion handler. `index.ts` is its public
API, the files small and single-purpose.

### 6.3 Permissions, plan module, procedures, routes

- **Permissions:** `orgProcedure.requires("leads:create", "leads:assign")` (names the plan module `crm`; both checked) for the
  `metaLeads.*` procedures; `settings:manage` is not added. No new permission or plan module. Disconnect and Pause carry
  `.meta({ lifecycle: "revoke" })`; the problem list and status are queries.
- **Procedures** (tRPC `metaLeads.*`): `status` (the Pages, the `META_APP_ID` configured flag), `connectStart` (builds the login
  parameters and a signed `state` binding the organization, the member and an expiry; no table), `connectFinish` (`code`,
  `state`: exchanges, lists the Pages), `connectPages` (chosen Page ids: subscribes and stores), `forms` (a Page's forms),
  `formQuestions`, `bringIn`, `saveQuestions`, `pause`, `resume`, `checkNow`, `reconnect`, `disconnect`, `problems`, `retryLead`,
  `hideProblem`. Any that moves money, roles or exports is none, so `orgProcedure` is right; connecting and Disconnect use
  `freshProcedure` (they hand out or revoke access to the agency's leads).
- **Plain HTTP:** the webhook GET and POST (M5, M6) and `POST /api/meta/data-deletion` (section 10) in `apps/api`, the
  latter authenticated by the signed request alone, not the trusted-origin rule (Meta is the caller), body limit 4 KB.
- **Reasons** (sentences in `errors.json`): `META_NOT_CONFIGURED`, `META_LOGIN_FAILED`, `META_PERMISSION_MISSING`,
  `META_PAGE_NOT_ALLOWED`, `META_PAGE_TAKEN`, `META_PAGE_LIMIT`, `META_FORM_NOT_FOUND`, `META_UNAVAILABLE`.

## 7. The web app

`apps/web/src/lead-sources/meta/` (screens in 3), routes under `/settings/lead-sources/meta/**`, words in `meta-leads.json`;
the callback page is client-side and reads `code` and `state` once, posts them, and clears the address (no code stays in the
URL, history or Referer); nothing here stores a token. The login is a redirect to Facebook's dialog with `config_id` and our
callback address, not a popup, so it works on a phone (most Owners). It uses the shared pieces listed in `CLAUDE.md`; no
hand-drawn borders; dates through `formatDay`/`formatDayTime`.

## 8. Limits and safety

- **8.1 Per-organization Graph budget.** Every Graph call goes through the existing rate-limits module with a per-organization
  counter (as Sheets' Google budget, its numbers constants): 600 calls an hour for webhook fetches and catch-up together, with
  the webhook path allowed to borrow from the catch-up share first, so a burst of 200 leads doesn't starve a Page's token
  check. Over budget a webhook fetch fails transiently (retried with backoff) and the catch-up skips the tick. A
  platform-wide ceiling (the app's own Graph limit is per app and per Page) is a second constant; reaching it logs one line
  with counts.
- **8.2 Retries and idempotency.** Intake retries (Meta's 36 hours), the worker's retries and the catch-up all converge on the
  one unique key `(organization_id, meta_lead_id)`; the lead is made in the same transaction that marks it. A delivery of 1,000
  changes is handled change by change.
- **8.3 No personal data in logs, jobs, events or errors.** Job data and events hold ids (organization, Page, form,
  Meta lead id), never an answer; the ledger holds an `example_name` only for problem rows, bounded, emptied on fix and on erasure;
  a failed job's error (visible to platform staff) is a reason code. The webhook body is ids only. Logs carry codes and
  counts. ESLint's raw-SQL guard and the dependency rules apply as ever; `packages/integrations` alone imports nothing new (it
  uses `fetch` and `node:crypto`).
- **8.4 Abuse.** The webhook is public but signed; the GET verify token is compared in constant time; unsigned and badly
  signed requests are refused before parsing; the route is rate-limited by address like the other public routes with a generous
  ceiling (Meta's callers come from a few addresses). A Page id in a signed delivery that is unknown does nothing. The
  deletion callback and the OAuth callback use signed values with short expiry (`expires`, `state`); `state` is single-use by
  consuming a nonce kept in the existing rate-limit counters, and is bound to the member who started.
- **8.5 Plans.** Closed like the other channels: read-only or suspended subscriptions stop bringing in (a webhook is
  accepted and ignored; the catch-up later brings it in when access returns, if Meta still holds the lead); the `crm` module
  must be on the plan; the demo organization has no Meta.

## 9. Test leads and the pilot before App Review

- **In the product:** a Page's page has **Send a test lead** (when a form is brought in): it calls `POST /{form-id}/test_leads`
  with the Page's token (**spike**: whether this works for role holders under Standard Access; if not, the button is hidden
  and the help text points to the next item). It creates the one test lead Meta allows per form (delete it first through the
  API, or "Delete the test lead" next to the button) and the webhook brings it in like any lead.
- **Meta's tool:** <https://developers.facebook.com/tools/lead-ads-testing> works once the app can send Page webhooks, but
  Meta says it can't be used in developer mode. The Webhooks dashboard's **Test** button sends a sample `leadgen` payload
  (fake ids): useful to prove the signature, the GET verification and the route, expected to end as "page not connected"
  or "lead not found", never as a lead.
- **The pilot (Yatra Hikes) before App Review:** Standard Access works for people with a role on the app. The owner adds the
  agency's Page admins as **Testers** (or Developers), they accept the invitation, and they connect their Page through the
  normal screen. Real leads from the agency's own ads (which they run, as an advertiser on the Page) then arrive through
  the webhook. The Pages must be ones those role-holders can advertise on. Anyone *without* a role cannot connect, which is
  the review's job to lift.
- **Automated tests never touch Meta:** the in-memory Graph and a webhook signer (section 12).

## 10. Erasure, the data deletion callback, disconnecting, the demo

- **Erasing a customer** (`eraseCustomerParts`) gains a step through the meta-leads module's `withdrawMetaLeads(tx,
  organizationId, personId, now)`: the person's ledger rows keep `meta_lead_id` and `form_id` (Meta ids are not personal
  data, and keeping them is what stops the same Meta lead coming back from the catch-up), lose `lead_id`, `person_id`, `example_name`,
  and become `erased`; every `example_name` in the organization is emptied (as S43.3). Unlike Sheets there is no hash tombstone
  on the contact: a person who erases themselves and fills a new ad form later is a new enquiry, which is what they asked for;
  only their *old* Meta lead ids are blocked. The confirmation tells the agency Facebook still holds the person's answers in its
  Leads Center for the agency to delete. `erasure.ts` and its test gain a ledger row.
- **Data deletion callback** (`POST /api/meta/data-deletion`, URL set in the app's settings): verify the `signed_request`
  (HMAC-SHA256 with the app secret, constant-time, `expires` honoured; bad input is 400 and nothing is stored); find, through
  `meta_page_route.meta_user_id`, every Page that user connected; for each, in its organization: disconnect it (section 4.6),
  delete its token fields and write the audit entry `meta.deleted-by-user`; answer 200 with `{ url, confirmation_code }`, the
  code the keyed HMAC of the user id and the request time (no table), and `url` the public status page
  `/meta/deletion?code=…` that says "Your connection data has been deleted" for any well-formed code (the deletion is done
  before we answer). **What it does not delete:** the leads, which belong to the agency as its customers' records, not to the
  Facebook user who connected the Page (the privacy policy says so, section 13). The platform log records the request by
  organization and Page ids only.
- **Disconnect** is 4.6. **Purge** takes the tables with the rest (`deleteOrganizationRows` reads the catalog); the route row
  goes with them; the agency also removes our app in Facebook's Business Integrations if it wants.
- **The demo:** no Meta is configured there, **Connect a Page** is off with "Not available in the demo", no Page is seeded
  (it would read Meta on a timer), and `resetDemoOrganization`'s sample leads gain two with source Facebook or Instagram lead
  ad and the details "Rajasthan winter ad · Facebook" and "Goa Diwali ad · Instagram".

## 11. Audit and notifications

- **Audit** (`recordAudit`, record type `meta_page`, sentences in `audit.json`): `meta.page-connected` (page id, count of forms; not the
  name), `meta.page-paused`, `.resumed`, `.reconnected`, `.disconnected`, `.access-lost`, `.access-restored`, `.form-brought-in`,
  `.form-questions-changed`, `.deleted-by-user`, `.problem-hidden`. The leads it makes are audited as by hand (`person.added`,
  `lead.added`, `lead.repeat-enquiry`), actor the connector, detail the Meta lead and form ids. Snapshots hold no token, no answer,
  no Page name.
- **Notifications** (`notify()`, each kind in `kinds.ts` and its sentence in `notifications.json`): `meta.needs-attention` to the
  Owner once per change into a bad state ("We can't read leads from your Page 'Yatra Hikes' any more. Connect again."; "'Winter ad'
  has a new question we haven't matched"); `meta.new-form` once per form (Q4); `lead.meta-added` to an owner only when a catch-up
  made more than 5 for them. Up to 5, the usual "New lead assigned to you" and "Repeat enquiry on your lead" go out, the first
  reading sensibly with no assigning member.

## 12. Performance, journeys and tests

- **Performance (ADR 0028):** the webhook path is one insert, one Graph call and one `saveEnquiry`; its indexes are the ledger's
  unique key and the Page route's primary key (no scan). A 200-lead burst is 200 events handled by the worker, not the api. The
  catch-up is one call per form per tick, 50 leads a page, saved 50 to a transaction. The ledger of a Page with 100,000 leads
  is 100,000 small rows with an index each. A performance test seeds 10,000 ledger rows and checks the lookup and the
  catch-up's overlap read stay within the Sheets feature's budget.
- **Test first** (domain, with the in-memory Graph and DB): signature accepted and refused (wrong secret, wrong prefix, altered
  body, unsigned); the GET challenge (right token, wrong token, wrong mode); the same `leadgen_id` delivered three times makes one
  lead; two lead ids with the same phone make a lead and a repeat enquiry; a returning customer; a lead with a `p:` phone, an
  invalid phone, a custom question to the note; an unselected form (counted, notified once, no lead) then brought in; a token
  error (190) moves the Page to needs_reconnect and notifies once, a rate-limit (80005) backs off without failing; the cursor with
  the overlap re-reads and saves nothing twice; a crash between the Graph read and the save leaves `pending` and the retry
  completes it; the log and errors never contain the token or an answer (M2); `SecretBox` opens only with the right Page id;
  the deletion callback (bad signature, expired, valid, a user with two Pages in two organizations); erasure keeps the ledger
  id and clears the rest, and the catch-up then skips it; a Page held by another agency is refused; the exempt table's guards.
- **Journeys (5, each against the api, worker, Postgres and the fake Graph and signer; the harness gains them as
  `test/e2e/support/meta.ts`):**
  1. **Connect and the first lead:** connect a Page through the fake login, bring in a form, match a custom question, deliver a signed
     webhook; the lead appears with its source, detail, note and owner by the rules, and the Owner is notified.
  2. **No duplicates:** the same webhook twice, then the same person on another form; one lead and a repeat enquiry on it.
  3. **Catching up:** a lead is made at the fake Meta with no webhook; advance the clock past the tick; the lead arrives; the cursor
     moves; a second tick adds nothing.
  4. **Expiry and reconnect:** the fake Graph rejects the token; the Page shows Needs reconnecting and the Owner is told once;
     reconnect; the leads missed meanwhile arrive.
  5. **Disconnect and deletion:** a signed deletion request removes the connection and its tokens and keeps the leads; Disconnect on
     another Page frees it for another agency.
  A bring-in dialog's mobile layout is covered by `pnpm e2e:audit`, not a sixth journey.

## 13. Settings, secrets and the owner's checklist

New settings (`apps/api/src/environment.ts` validates them at start-up; a bad value stops the process naming the variable and
never printing it; `docs/deploy-checklist.md`'s table gains the rows, api and worker, never the console):

| Variable                                                                    | api | worker | Secret |
| --------------------------------------------------------------------------- | --- | ------ | ------ |
| `META_APP_ID`: the Meta app's id                                            | ●   | ●      |        |
| `META_APP_SECRET`: signs webhooks, exchanges logins, verifies deletion      | ●   | ●      | yes    |
| `META_WEBHOOK_VERIFY_TOKEN`: at least 32 random characters                  | ●   |        | yes    |
| `META_LOGIN_CONFIG_ID`: the Facebook Login for Business configuration       | ●   |        |        |
| `META_TOKEN_KEY`: 32 random bytes, base64 (`openssl rand -base64 32`)       | ●   | ●      | yes    |

All five or none (one alone stops the process); absent, Meta is off and the Lead sources page says so. `META_TOKEN_KEY` is never
rotated casually: old Pages need the old key in the same variable (a list, newest first) until they are re-saved. Routing:
`/webhooks/*` already goes to the api; `POST /api/meta/data-deletion` is under `/api/*`; `/meta/deletion` goes to the web app
(the default rule).

**The owner's steps, in order** (the early ones take weeks; start them first):

1. **A registered business** (a company, LLP, partnership or proprietorship with documents Meta accepts: registration or GST
   certificate, utility bill or bank statement showing the legal name and address) and **a website on your own domain with a
   business email**. Business Verification needs the legal name, address, phone and a domain you can prove. The pilot's
   `vercel.app` address isn't enough; this is why the domain matters.
2. **Public pages on that domain:** a **Privacy Policy** (what we collect from Facebook: Page and lead-form answers on the
   agency's behalf; that the agency owns the leads; how a person asks for deletion; the deletion callback), **Terms of Service**
   and a **data deletion instructions** page. Ayush's drafts are parked for the landing-page agent; these three must be live URLs
   before App Review. Have someone who knows India's DPDP Act read them.
3. **Create a Meta Business portfolio** at business.facebook.com with the company's details; this is also where the agency's
   Pages are shared with ours for system-user tokens if the spike chooses them.
4. **Start Business Verification** (Business Settings, Security Center, Start Verification). It decides whether Advanced Access can
   be granted; it can take days to weeks and is repeated if documents are rejected.
5. **Create the app** at developers.facebook.com (Create App, use case "Other"/Business type), name "<product>", contact email,
   the privacy policy and terms URLs, an app icon; add **Facebook Login for Business** and **Webhooks**.
6. **Set the Webhooks:** product "Page", callback `https://<api>/webhooks/meta-leads`, verify token = `META_WEBHOOK_VERIFY_TOKEN`,
   subscribe the `leadgen` field; set the **Data Deletion Request URL** to `https://<api>/api/meta/data-deletion`.
7. **Create the Login configuration** (Facebook Login for Business, Configurations): token type per the spike, assets "Pages",
   permissions per section 2; copy its id to `META_LOGIN_CONFIG_ID`. Copy the App ID and App Secret (Basic settings) to the
   settings. Add `https://<web>/settings/lead-sources/meta/callback` as a valid redirect URI.
8. **Put the five settings in Render** (`travel-crm-api`, secrets as secrets), redeploy; the start-up line says Meta is on.
9. **Add the pilot as testers:** App roles, Roles, add the agency's Page admins as Testers by their Facebook accounts; each accepts
   at facebook.com/settings, Business Integrations. They must hold the ADVERTISE task on the Page. They connect from Settings,
   Lead sources, and you test with section 9.
10. **App Review** (after verification and a working pilot): request Advanced Access for `leads_retrieval`, `pages_show_list`,
    `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `ads_management` (if the spike keeps it) and
    `public_profile`. For each: a **screencast** (the whole flow: sign in to the CRM, Connect a Page, Facebook's dialog, choose a
    form, a lead arriving, the lead in the CRM), a written explanation of why it's needed, step-by-step **test instructions** with a
    demo login (the demo organization will not have Meta; give Meta a pilot test agency, with its test Page), and the policy URLs.
    The review team must be able to test; a rejection for "couldn't test" rejects the whole submission. Then switch the app to
    Live (or, for Business-type apps, the permissions become Advanced) and complete Meta's yearly **Data Use Checkup**.
11. **Before real agencies:** rerun Business Verification checks if the legal name or domain changes, and tell agencies in the
    help text what we read, that we never post, and how to remove us (Facebook, Business Integrations).

## 14. Build order

One branch, `meta/lead-ads`, after release 4's assignment (on main) and the Sheets and website form code it reuses. Inside it:

1. **The spike and the shared pieces first** (one builder, a day; nothing else starts until it reports): with a real test app and
   Page, settle section 2's **spike** items (token type, field names and paging, the permission list, test leads in Standard
   Access, `platform`, ad fields, test-lead markers) and write the answers into this spec. Then: ADR (Meta lead ads: the app, the
   token, the exempt route table, the callback), `SecretBox`, the `MetaGraph` port with the in-memory adapter and the signer
   helpers, the migration, schema, `meta_page_route` with its guards and the fixture file, the contracts, and
   `environment.ts`/`.env.example`. These are the files the tracks share.
2. **Parallel tracks by file ownership** (each its own files, merged by the lead):
   - **A, integrations:** `packages/integrations/src/meta-graph/` real adapter, its tests.
   - **B, domain:** `packages/domain/src/meta-leads/` (connect, pages, forms, mapping, ledger, catch-up, routes, deletion, health)
     and its tests; the `withdrawMetaLeads` erasure step and the demo's samples.
   - **C, crm and imports:** `receiveMetaLead`, the import's `source_meta_form_id` and the questions-as-columns reuse of
     `ColumnMatcher`'s inputs (`guessFields` on labels), the `lead.source` words; small changes in the bulk release's files,
     each listed in the PR.
   - **D, api and worker:** `apps/api` webhook provider, GET verify route, deletion route, `worker-jobs.ts` (the dispatcher,
     the health check, `meta.page-changed`), `packages/api` router and procedures.
   - **E, web:** screens, callback, words, then `pnpm e2e` journeys with `test/e2e/support/meta.ts` (after B and D).
3. **Docs and gates:** `docs/deploy-checklist.md` rows, the owner's steps in `docs/` (copy of section 13), `pnpm check` green, the
   journeys, the review.

## 15. Decisions I made (small, say if you disagree)

- **D1.** Pin Graph v25.0, not the newer v26.0 (3 months old, expiry unset).
- **D2.** Page tokens only are stored; the login token is discarded after listing Pages.
- **D3.** Catch-up every 30 minutes, with a 10-minute overlap; Check now on demand.
- **D4.** The webhook URL is `/webhooks/meta-leads` so WhatsApp's release has its own.
- **D5.** The ledger keeps Meta lead ids after erasure; contacts are not tombstoned.
- **D6.** Leads from a paused or unconnected Page are not saved by the webhook; the catch-up fetches them later.
- **D7.** Ad and campaign names go to the note only if Meta returns them without extra permissions.
- **D8.** The pilot test button is built only if the spike shows `test_leads` works under Standard Access.
