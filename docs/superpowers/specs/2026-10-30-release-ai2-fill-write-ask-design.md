# Release ai2 design: AI, the next wave (2026-10-30)

Built on main (releases 5 and 6 in, 7a being built). Scope: 3.6, 3.7, 4.7 (the write-up only), 5.9 of `2026-10-16-phase-1-product-scope.md`,
plus "ask reports in plain words", which the scope parks in Phase 2 (see Decisions). Reuses Ayush's AI module (`packages/domain/src/ai`,
ADR 0029): `aiAllowed`, `aiEnabled`, `reserveAiCall`/`releaseAiCall`, `recordDraftSent`, `promptOf`, `knowledgeWords`, the `AiModel` port.

## 0. The split and the order
- **ai2a "Fill it for me"**: features 1, 2, 3 and the engine they share. Order: (1) engine and a spike on audio formats (see 3.2);
  (2) quick-add lead from typed text, a paste and an inbox chat (no upload yet); (3) after-call voice note (adds the mic);
  (4) screenshots, the lead edit form, the quote editor; (5) WhatsApp leads that arrive filled in (last: it writes unattended).
- **ai2b "Write and ask"**: features 4, 5, 6. Order: (1) the quote write-up; (2) ask reports; (3) rooming requests; (4) empty
  seats. (3) and (4) start only after 7a is merged; (1) and (2) need nothing from 7a and may build beside it.

## 1. Intent
"I talk or paste, and the form fills itself in violet. I check it and save. After a call I say two sentences and confirm the note and
the follow-up with one tap. A new WhatsApp enquiry already has Manali, 15 Dec, 4 adults, 1 lakh on it. I get a message for the customer
I can edit and send. I ask 'how many leads from Instagram last month' and get the table. A batch with empty seats shows me who to ask."

## 2. What the AI is allowed to do (every feature)
- Propose, never save. A fill returns a proposal to the browser; saving is the form's own mutation (its own audit, permission, plan
  and lifecycle checks). The one exception is feature 3, which writes empty lead fields as `suggested` (scope 3.7).
- Prices, tax, GST place, payment amounts and booking status are never in any fill schema or prompt output. A customer's stated budget
  is a fact the customer said, so it may be filled; a quote line's price may not. The write-up and the messages contain tokens
  (`{total}`, `{link}`, `{price}`) that plain code fills; a ₹ or "Rs" amount typed by the model is removed and flagged.
- Asks instead of guessing: a required value the source doesn't give comes back as a question line ("Which month?"), not an invention.
- Plain code does dates (the model returns what was said; code resolves "kal", "next Friday", "15 Dec" in the organization's zone and
  today's date, never into the past), phone digits, destination matching (an existing destination, else "new" for the person to
  confirm), money to paise, enums.
- Languages: English, Hindi, Hinglish in; field values out in English (names as spoken, in Latin letters), a call note in the speaker's language.

## 3. Features
### 3.1 The fill engine (feature 1, shared by 2 and 3)
- **Contracts** `packages/contracts/src/ai/fill.ts`: `fillTargets` = `lead` (quick-add), `lead_edit`, `quote`, `call_note`. Each target has a
  fill schema built from the real form schema (`createLeadInput.person/trip/note`, `tripInput`, `quoteFields` minus `unitPricePaise`,
  `taxRateBasisPoints`, `placeOfSupply`, `logCallInput`): all keys optional and nullable, `z.strictObject`. The model's JSON is parsed
  with it; keys it doesn't know are dropped, bad values drop that field and become a question.
- **Input** `ai.fill`: `{ target, subjectId?, source }`, source one of `text` (up to 4000 chars: typed, dictated or a pasted forwarded
  message; Ayush's `whatsapp-export.ts` strips pasted-chat timestamps), `upload` (an `ai_input` attachment: a voice recording or an image),
  or `chat` (a conversation id, read server-side from the member's visible conversation, last 20 messages).
- **Output** `{ fillId, fields: [{ path, value, from: "voice"|"text"|"image"|"chat", excerpt }], questions: string[] }`.
- **Calls** three short transactions like `suggestReply`: checks and `reserveAiCall`, the model, then the `ai_fill` row; a model that
  doesn't answer gives the call back. One fill is one monthly call.
- **Review** `AiFillSheet` (`ResponsiveDialog`, `busy` while working): a mic (tap to start, tap to stop, 44px), a textarea, "Add a
  screenshot" and paste-an-image. Then the proposal: per field the old value, the new value and the excerpt, each ticked; empty fields
  start ticked, fields that already have a value start unticked and show before and after. Apply copies the ticked values into the open
  form (unsaved); they are violet (the People-violet tint token, DESIGN.md lists violet for "later AI helpers") until the person edits
  that field, and a violet source hint (`Popover`) shows the excerpt. "Undo AI fill" restores the form as it was. Nothing is sent to the
  server by Apply.
- **Audit** each save mutation takes an optional `aiFillId` (additive). In the same transaction `recordFillApplied(tx, access, fillId,
  values)` marks the row used once, stores which paths were applied and which the member then changed (compared by hash, as
  `recordDraftSent` does), and writes `recordAudit` `ai.fill-applied`: "drafted by AI, approved by X". A fill that isn't the member's, the
  target's or already used is refused as NOT_FOUND.
- **Where:** a "Fill with AI" button on the quick-add lead form, the lead edit form and the quote editor; in the inbox chat header menu
  "Make a lead from this chat" (the quick-add form opens prefilled with the chat's number and the AI's proposal; same `createLead`).
  Hidden when the AI switch, plan or `ai` module is off; disabled with `WriteHint` when the subscription refuses the form's write.
- **The quote target** fills title, start date, adults, children, day titles and descriptions, inclusions, exclusions, notes and item
  descriptions and quantities with the price left empty. Changing an existing itinerary by talking stays out.
- Edge cases: empty or silent recording ("I couldn't hear anything", call given back); source longer than the limit (the newest part is
  used, and it says so); two phone numbers (first is the lead's, second goes to the note); a number that already belongs to a person
  uses the form's existing `knownContact` check; image with no readable text (a question, not a guess).

### 3.2 Voice and images: the model port
- `AiMessage.content` becomes `string | AiPart[]`, `AiPart` = `text | image {mimeType, bytes} | audio {format, bytes}`. The OpenAI-compatible
  adapter sends `image_url` (data URL) and `input_audio`; the memory adapter records parts. New `AiFeature`s: `fill_form`, `write_up`,
  `ask_report`, `read_requests`, `reach_out`, mapped onto the existing `AI_CHAT_MODELS` and `AI_FAST_MODELS` lists in
  `apps/api/src/ai-services.ts` (fill_form needs a multimodal model; the owner's Gemini is one). No new environment variable unless a
  deploy's chat list is text-only; then one `AI_MULTIMODAL_MODELS`, and the deploy checklist gets it.
- **Files never pass through the api (CLAUDE.md):** the browser records, then `uploadFile()` puts it straight in storage as an attachment of
  record type `ai_input`; the fill reads it through the `ObjectStorage` port. Kept 30 days for quality checks (scope 3.6: "kept for now;
  how long ... decided before general release"), then purged by a nightly job in `worker-jobs.ts`; erased with the customer or organization.
  Limits: a recording up to 2 minutes and 4 MB, an image up to 5 MB, jpeg/png/webp.
- **Risk to settle first (a spike, day one of ai2a):** Gemini's OpenAI-compatible endpoint takes WAV and MP3 in `input_audio`. Browsers record
  webm/opus (Chrome) or mp4/aac (Safari), and WhatsApp voice notes are ogg/opus. If other formats are refused, the browser encodes 16 kHz mono
  WAV itself (about 4 MB for 2 minutes), and WhatsApp voice notes (feature 3) need either that conversion in the worker or a second adapter
  speaking Gemini's native API. The spike picks one before anything else is built.

### 3.3 After-call voice note (feature 2)
- `CallNoteDialog` (release 5) gets a mic. Target `call_note`: outcome (the four values), note (cleaned, in the speaker's language,
  up to 2000 chars), follow-up (`wallClockTime` plus title, shown as a real date in full, "Thu 3 Dec, 5:00 pm"), and optionally the lead's
  food, hotel category, room type and trip details the call mentioned (`lead_edit` fields, shown as a second group in the same review).
- One tap: when the proposal has no question, the dialog shows the filled form and a single "Save call" (the existing save); the lead
  changes are a separate ticked group that applies through `updateLead` in the same click. A follow-up the model puts in the past is
  dropped and asked about. "No answer" or "busy" with no speech fills only the outcome.
- The note text is still never copied into the audit log or an event (release 5 rule); the audit says the AI drafted it.

### 3.4 WhatsApp leads that arrive filled in (feature 3)
- **What Ayush's scoring already covers:** `scoreLead` reads the last 20 messages and stores `insightFacts` (destination, when, travellers,
  budget as free text) on `lead_ai_insight`; nothing is structured, nothing reaches the lead's fields, and voice notes and images are not
  read. This feature extends that same call (`scoreAnswer` gains a structured `trip` object matching `tripInput` partially), so no
  extra monthly call for text. Opening voice notes and images (first 5 customer messages, audio up to 1 minute, up to 3 images) add one
  more call, only while the lead is still incomplete.
- **Rules:** runs for the first 10 customer messages of a lead's chat, only into fields that are empty or unknown, never over a person's
  value, stops once destination, dates or month, adults and budget are all present. Values are saved on the lead's real fields (so lists
  and assignment rules can use them, scope 3.7) and flagged in `lead_ai_field` as `suggested`.
- **Violet:** the lead page and the edit form show a `suggested` field in violet with its excerpt a tap away and a "Confirm" (confirms all)
  or Dismiss (clears the values that are still suggested). The tint disappears by itself once the lead's value no longer equals the
  suggestion (a person edited it), so crm never has to call the ai module.
- **Missing details:** if fields stay empty 30 minutes after the customer's last message, the lead card shows "Ask for the missing
  details", which opens Suggest reply with those fields as its hint. Nothing is sent by itself.
- Runs as `systemActor`, gated by `aiAllowed`, the AI switch and a new `ai_settings.fill_leads` (default on), audited as
  `ai.lead-filled` with field names only. Idempotent per message id like the scoring job.

### 3.5 Quote write-up (feature 4)
- "Write for the customer" on the quote screen. Choices: English or Hindi, for WhatsApp (short, few emojis) or email (greeting, sections,
  sign-off). Input to the model: the quote's day plan, item descriptions (no unit prices), inclusions, exclusions, notes, the lead's first
  name and the agency's instructions, knowledge and writing style. New `ai_settings.write_style` (`warm|premium|short`, default `warm`),
  chosen once in Settings, AI (scope 4.7).
- Output is text with tokens `{total}`, `{advance}`, `{link}` that code fills from the quote (`formatMoney`, the share-link path); a draft
  quote has no link and the token is dropped. Staff edit in a textarea. "Copy" and "Put in the chat box" (the lead's open chat, going through
  the inbox's own send, so `recordDraftSent` records it); email is Copy only (the product sends no customer email).
- Edge: stale after the quote changes ("The quote changed; write again"); a quote with no days asks for them.

### 3.6 Ask reports (feature 5)
- An "Ask" box on Reports (`leads:view` like the other report procedures, `freshProcedure`). A **fixed catalogue** in
  `packages/domain/src/reports/queries.ts`: each entry is `{ id, title, params (Zod), requires, run(tx, access, params) }` using the existing
  report SQL patterns and `scopeFilter()`. Today's three (overview, staff, sales) become entries; new ones: leads by source, by destination,
  by stage, quotes sent and accepted, payments collected, follow-ups overdue by person, lost leads, and (after 7a) departures' fill.
- The model sees only the question and the catalogue (ids, titles, parameter shapes), never agency data, and answers
  `{ queryId, params }` or `{ cannot: reason }`. Params are parsed by the entry's schema; a named range ("last month", "this quarter") is
  resolved by code in the organization's zone. The answer is drawn by the existing report components, with "I understood this as: Leads by
  source, last month" and controls to change the range. It runs with the asker's own permissions and scope.
- Cannot answer: says so and lists the three closest questions it can answer. The question text is stored nowhere (a usage count only).

### 3.7 Rooming requests (after 7a)
- On a departure's Rooming tab, "Read requests" (`departures` edit permission of 7a): the AI reads each traveller's `room_note`, the
  booking's notes and the lead's AI notes (`addAiLeadNote`) and maps each to 7a's fixed `room_request` values (`none|single_room|
  ground_floor|near_group`) plus the excerpt. Staff tick and Apply through 7a's own update (audited with `aiFillId`). Unknown stays `none`.
  Plain code then drafts the rooms exactly as 7a does. Reading WhatsApp chats for this is left out (the AI notes carry what autopilot kept).

### 3.8 Empty seats (after 7a)
- On a departure that is Open or Filling fast, "Find interested people": plain query (no AI) for leads of the last 12 months whose destination
  matches the departure's, not booked on it, person not blocked, no opt-out recorded in the consent module, not offered this departure in
  the last 14 days, within the viewer's scope, ranked by recency then Ayush's score, at most 50 shown. Staff tick up to 20.
- "Write messages": one `reach_out` call per person (their first name, the earlier enquiry's destination, dates and party size, the departure's
  dates and words for seats left, never a count unless the agency's setting allows; `{price}` filled by code). Each is edited, then sent by the
  route chosen in OWNER QUESTION 2. Sent marks `departure_offer` and adds a timeline note on the lead; nothing is sent in bulk.

## 4. Data (additive migrations; each org table gets `app_enable_org_rls`, a fixture in `packages/db/test/org-table-fixtures/ai.ts`,
`organization_id` in every key and unique, RESTRICT/RESTRICT to `organization`)
- `ai_fill`: `id` uuid v7, `target` (CHECK: lead, lead_edit, quote, call_note, quote_writeup, room_requests, departure_offer),
  `subject_type`, `subject_id` (nullable, no FK: polymorphic), `requested_by`, `input_kind` (text|voice|image|chat), `input_attachment_id`
  (nullable, FK `(organization_id, id)` to attachment), `model`, `proposal_hash`, `fields text[]` (paths proposed), `applied_at`,
  `applied_by`, `applied_fields text[]`, `changed_fields text[]`, `created_at`. Words and values are kept nowhere (as `ai_draft`).
- `lead_ai_field`: `id`, `lead_id` (FK `(organization_id, lead_id)`), `field` (CHECK), `state` (suggested|confirmed|dismissed), `value_hash`,
  `excerpt` (up to 200 chars of the customer's own words), `message_ids uuid[]`, timestamps; unique `(organization_id, lead_id, field)`.
- `departure_offer` (ai2b, after 7a): `id`, `departure_id`, `lead_id`, `drafted_by`, `fill_id`, `sent_at`; unique `(organization_id, departure_id, lead_id)`.
- Columns on `ai_settings`: `fill_leads boolean default true`, `write_style text default 'warm'` (CHECK). Storage: attachments of record type `ai_input`.
- **Erasure** in `withdrawAiParts` / `platform/erasure.ts`: a customer's `lead_ai_field`, `ai_fill` rows with their lead as subject, their
  `departure_offer` rows and `ai_input` attachments; an organization's purge reads the catalog as usual.

## 5. Permissions and plan modules
- Existing `ai:suggest` for every AI action, plus the target's own permission on the same procedure (`orgProcedure.requires("ai:suggest",
  "leads:edit")`, quotes' edit permission, the call's `leads:edit`, `inbox:view` for the chat, report permissions, 7a's departures
  permission); `ai:manage` for the two new settings. No new permission module. Plan module `ai` plus the target's own (`core`, quotes,
  departures); lifecycle `mutation` for fills that are saved, `query` for report asks.
- Everything also goes through `aiAllowed`, the agency's AI switch and the monthly limit (`MONTHLY_AI_LIMIT`, shared with autopilot and scoring).
- New `DomainError` reasons in `errors.json`; audit actions `ai.fill-applied`, `ai.lead-filled`, `ai.writeup-used`, `ai.offer-sent` in `audit.json`.
  UI strings in `ai.json`; 44px targets; `FormDialog`/`ResponsiveDialog` rules 7; no tables or borders on top of shadcn.

## 6. Out of scope
Itinerary drafts and rate sheets (need 7b); changing an itinerary by talking; reading WhatsApp chats for rooming; transcribing customers'
voice notes anywhere but a new lead's opening messages; AI morning brief; sending anything to a customer without a person; raw SQL from AI;
regional languages beyond Hindi/Hinglish; the traveller-details form fill (scope 3.6 lists it, it waits for release 6's form to settle).

## 7. Decisions already made
- Scope 2: "AI only where language is involved ... Prices, tax, dates, counts, reminders ... are plain code." "AI drafts; people decide ...
  before applying (before, after, the excerpt), AI-filled fields tinted violet with their source a tap away, the audit log records
  'drafted by AI, approved by ...'."
- Scope 3.6: the first fill covers new lead, call/follow-up log, traveller details; English, Hindi, Hinglish; mic tap to start, tap to stop;
  recordings kept for now.
- Scope 3.7: new WhatsApp leads filled from opening messages incl. voice notes and images; saved as Suggested (violet), usable by lists and
  assignment; one tap confirms; after a call, field updates, preferences, a follow-up with its real date, a call note.
- Scope 4.7: the write-up follows the agency's picked style; English, Hindi on request. Scope 5.9: rooming by plain logic, empty seats by a
  plain query, personal AI-written message sent by staff from their own WhatsApp.
- Scope section 1 puts "ask your reports in plain words" in Phase 2; the lead has now asked for it in this wave, so it is built (3.6)
  with the narrowest design, and unanswerable questions are NOT sent to us (the scope's Phase 2 terms line is not needed).
- ADR 0029 and the owner's 2026-10-15/28 rules: ZDR providers, per-agency switch, `ai` plan module, monthly limit, AI as the signed-in person.
  Note: Gemini direct needs a paid-tier key (no training on prompts) before real customers' audio and screenshots go to it; OpenRouter's
  ZDR flags are not sent to Google's endpoint (`openrouter.ts`).

## OWNER QUESTIONS
1. **Ask reports: how big in this wave?** (a) Only today's three reports answered in words (thin, quick); (b) a fixed set of about 10
   questions (leads by source, destination and stage, quotes, payments, overdue follow-ups, lost leads) (recommended); (c) leave to Phase 2 as
   the scope says. Recommended (b); unanswerable questions are simply declined, not sent to us.
2. **Empty seats: how do the messages go out?** (a) AI-written personal message that opens the person's chat in the staff member's own
   WhatsApp (`wa.me`), staff press send one by one; works outside the 24-hour window and needs no template (recommended); (b) an approved
   template with blanks filled by code, sent through the product (needs Meta approval and marketing consent); (c) both.
3. **The monthly AI limit (1,000 calls, shared with autopilot and scoring).** Voice and screenshot fills add calls. (a) Keep 1,000 shared;
   (b) raise to 3,000 for every plan (recommended: autopilot alone can use 1,000 in a busy month); (c) separate pools, 1,000 for autopilot
   and scoring and 500 for the people-driven features.
4. **How long to keep the voice and screenshot inputs?** Scope says "for now". (a) 30 days then deleted (recommended); (b) delete as soon as
   the model has read them (best for privacy, no way to check quality); (c) keep until the lead is erased.

## OWNER ANSWERS (2026-10-30)
The owner accepted every recommendation: about 10 fixed report questions (b), personal wa.me messages for empty seats (a), monthly AI limit raised to 3,000 for every plan (b), voice and screenshot inputs deleted after 30 days (a). Build ai2a first, then ai2b (rooming and empty seats after 7a lands).
