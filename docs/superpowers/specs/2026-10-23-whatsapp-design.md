# WhatsApp: chats become leads, and a shared inbox to answer them

- **Status:** draft for the owner's answers in section 0.
- **Date:** 2026-10-23
- **Scope:** Phase 1, the WhatsApp release, built in three parts on one branch (`whatsapp/inbox`) and tested by the owner
  once: (1) a message to the agency's number becomes a lead, and chats are readable in a shared inbox and on the lead's
  page; (2) staff reply inside WhatsApp's 24-hour window, with photos and files, and see sent, delivered and read; (3)
  templates for outside the window, and what to do with the history of a number that already has chats.
- **Input:** `docs/superpowers/specs/2026-10-23-meta-lead-ads-design.md` (the house pattern: intake, ledger, problems, catch-up,
  budgets, erasure), the Phase 1 scope (3.1, 3.8), the bulk and website-form specs (one save path, no duplicates), release
  4's `assign`, ADR 0028, 0034, `CLAUDE.md`, the research file `.superpowers/research/2026-10-23-whatsapp-msg91-vs-direct.md`.
- **Decided by the owner, not re-asked (2026-10-23):**
  - **Route: MSG91**, under **one MSG91 account that we own**. Every agency's number sits in it. We pay MSG91 and Meta. Agencies never see MSG91.
  - **Billing:** WhatsApp is an add-on the platform prices per agency, on the normal subscription invoice, "unlimited"
    messages on fair use, marketing capped. No wallet or credits now. We use the plan's existing WhatsApp-numbers limit and
    the `inbox` plan module. No new billing code.
  - **Onboarding is done by our team.** The agency sends us its number; we add it in MSG91's panel (new number, or
    coexistence with the WhatsApp Business App) and record it in the **platform console**: number, MSG91's ids, status,
    connected date, usage counts. Super admins manage it. Agencies see "WhatsApp connected" and their inbox.
  - **One number per agency** (Phase 1). Lead ads stay direct on our own Meta app; WhatsApp does not use it.
  - Design for always-on paid hosting. No AI in this feature. The UI must not look AI-made.
- **Also from the Phase 1 scope:** who sees a chat follows its lead's own/all scope; a reply sent from the phone app reaches
  us as an echo; groups never sync; messages sent from the product are charged at Meta's rates, phone-app ones are free;
  a daily template limit and a warning when the number's quality rating drops protect the agency's number.

## 0. The owner's decisions (2026-10-23)

The owner chose the default in all six (2026-10-23). They are binding: build exactly these.

1. **Who sees which chats?** Default: **the same people who see the lead.** A salesperson sees chats of their own leads, a
   manager or owner sees all, and anyone who can edit a lead can reply. Why: it is the rule you already set in the scope
   (3.8); a separate rule would mean two lists of who may see a customer.
2. **Does a message from a new number always become a lead?** Default: **a number we don't know becomes a lead at once**
   (source "WhatsApp"), owner by your assignment rules. A **known customer with an open lead** just gets the message in that
   lead's chat and the owner is told. A **past customer whose leads are all closed** gets the chat in the inbox and a button
   **Start a new lead**, not an automatic lead. Why: a returning "thanks!" or "ok" should not open a lead and pollute
   reports; a real new enquiry costs one tap.
3. **Where are message templates written?** Default: **in our app**, by the agency's Owner or Admin (a short form), sent for
   Meta's approval through MSG91, with the status shown. Our team can also create them in MSG91's panel and the app picks
   them up. Why: agencies need their own wording (a Diwali offer) and waiting for our team each time is slow. If you want
   less to build, I do only "pick up what our team made" first and add the form after (it is the last step of part 3).
4. **The chat history of a number already on WhatsApp.** When an agency keeps its WhatsApp Business App (coexistence), Meta
   can share up to 180 days of old chats, once, within 24 hours of connecting. Default: **do not import history into the
   first build**. We receive and keep everything from the day of connecting, including messages staff send from the phone.
   After the spike shows how MSG91 delivers history, import it only as read-only chat for people **already in the CRM**,
   never creating leads from it. Why: old chats are mostly finished deals and would flood the lead list; and it is a
   one-shot import, so we should not try it blind.
5. **Broadcasts and the fair-use cap.** Default: **no broadcasts** (one message to many) in this release. Staff can send an
   approved template to one person at a time. Replies and utility templates (booking updates) are not capped; **marketing
   templates are capped at 300 per agency per month** (about Rs 260 of Meta's charges at today's rate), changeable per
   agency in the console. Why: marketing messages are the costly ones, and they are what gets a number reported and
   blocked.
6. **May staff start a chat with a lead who never messaged us?** Default: **yes, with an approved template only**, and only
   if the person has not asked to stop and staff tick "they agreed to WhatsApp messages" (recorded once, with who and when).
   Why: Meta requires opt-in, and the DPDP burden of proof is on the sender.

**The owner's additions (2026-10-24), built in part 3d:**

7. **A WhatsApp-like chat.** The chat has a height of its own: the messages scroll inside it (the registry `scroll-area`), it
   opens at the newest message, and the reply box stays pinned at the bottom, on a phone and a computer, in the inbox and on
   the lead's page (a smaller box there). A new message scrolls into view only when the person is already at the bottom, or
   sent it; otherwise a "New messages" button jumps there. Earlier messages load at the top as the person scrolls up.
8. **Emoji on computers.** An emoji button beside the clip inserts at the cursor. The shadcn registry has no emoji picker, so
   it is Frimousse's registry item (`frimousse` 0.4.0, pinned). Its data is `emojibase-data` (17.0.0, pinned), served from our
   own origin at `/emojibase`, never a CDN (the content security policy). Phones, whose keyboards have emoji, do not show it.
9. **Voice notes.** A microphone button records with the browser's MediaRecorder (the microphone is asked for on the first
   press, and a refusal says how to allow it), with a running time, Cancel and Send, for at most five minutes and 16 MB. It
   records `audio/ogg;codecs=opus` where the browser can, else `audio/mp4`, else WebM Opus, which a small remuxer of our own
   turns into Ogg Opus before the upload (WhatsApp refuses WebM). It goes through the file upload and media send, and an Ogg
   Opus file is sent with Meta's `voice` flag (`SPIKE(S4)`: how MSG91 takes it). The page's Permissions-Policy allows the
   microphone for our own origin (`microphone=(self)`).

## 1. Why this feature

Indian travel enquiries mostly happen on WhatsApp. Today they live on one phone: whoever holds it answers, nobody else sees
the chat, nothing reaches the CRM, and when a salesperson leaves the chats go with the SIM.

**Goals**

- A message to the agency's number is in the CRM in seconds: a lead with the right owner, or a message on the existing lead.
- Every salesperson who may see a lead sees its chat, and answers it from the CRM, from a phone or a PC.
- Nothing is lost: a message is stored before anything else is done with it, and kept even if lead creation fails.
- No duplicates: one person, one chat, one open lead, however often MSG91 delivers an event.
- A broken connection is noticed by us before the agency notices (section 8.4).

**Non-goals:** broadcasts, WhatsApp calls, groups, catalog or payment messages, chatbots or auto-replies, quote and itinerary
sending (the quotes release will use the template path built here), voice-note transcription (AI, later), editing or
deleting sent messages, a self-serve "connect WhatsApp" for agencies, per-agency MSG91 accounts.

**Anti-goals:** the MSG91 key or a webhook secret in a log, job, error or the browser; one agency reading another's chats;
a second lead for the same person from a burst of messages; a message sent twice; a customer's number or words in a job,
event, log line or notification.

## 2. What MSG91 and Meta give us (checked 2026-10-23)

Facts below carry their source. Anything not confirmed is **SPIKE**, settled by build step 0 (section 14) against a real
MSG91 account and a test number, and written back into this spec before anything rests on it.

**Confirmed from MSG91's public pages**

- **One webhook, set by hand.** "Open the MSG91 Dashboard, open the microservice (WhatsApp), then select Webhook (New)"; you
  add a URL and custom key-value headers. <https://msg91.com/help/webhook-new>. There is no signature. **SPIKE:** whether
  the webhook is per account or per number (the docs say per microservice, so I design for one for all our numbers), and
  whether an API can set it.
- **Event shape.** One JSON object per event, MSG91's own, not Meta's raw payload. Fields seen in MSG91's sample:
  `companyId`, `requestedAt`, `customerNumber` (digits with country code, no `+`), `customerName`, `eventName`
  (`delivered`; the docs list Sent, Delivered, Failed, Read), `uuid` (the WhatsApp message id, `wamid.…`), `integratedNumber`
  (**our** number: this routes the event to an agency), `direction` ("0" inbound, "1" outbound), `contentType` (`text`,
  `image`, …), `text`, `caption`, `filename`, `url`, `latitude`, `longitude`, `button`, `reaction`, `interactive`,
  `replyMsgId`, `templateName`, `templateLanguage`, `reason` (failures), `ts`. Stringified JSON inside the JSON: `messages`,
  `contacts`, `content`, `button`, `orders`. Field names differ between MSG91's pages (`customerNumber`, `customer_number`,
  `mobile`; `crqid`/`CRQID`). <https://msg91.com/help/webhook-new/how-to-receive-whatsapp-delivery-reports-via-webhook-new>
- **Delivery rules.** 8-second timeout; 5xx and 429 retried up to 5 times; **"a 4XX (except 429) pauses the webhook
  automatically"**; MSG91 says multiple events for one message are expected and to deduplicate on event + wamid. Bulk sends
  give one event per recipient. Same page.
- **Inbound media URLs work for 30 days**, then answer "media not found". Same page.
- **Templates:** create is `POST https://control.msg91.com/api/v5/whatsapp/client-panel-template/` with a JSON body of
  `integrated_number`, `template_name`, `language`, `category` (Authentication, Marketing, Utility), `button_url`,
  `components` (a third-party mirror of MSG91's docs; confirm). <https://www.withone.ai/knowledge/msg91>
- **Session send:** `POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/` with `text`, `content_type`,
  `recipient_number`, `integrated_number` and an `authkey` header (third-party; confirm). MSG91's own list of endpoints
  (<https://docs.msg91.com/whatsapp>) names: Send Message (once Session Started), Send WhatsApp Template, Get/Create/Edit/Delete
  Template, interactive, logs, analytics, prepaid balance, "To Fetch Whatsapp Number".
- **Coexistence** is done in MSG91's panel (Add Number, pick the portfolio, "connect an existing WhatsApp Business App
  account", scan the QR, share history on the phone). Needs 30+ days of business chats; groups not synced; broadcast lists
  read-only. <https://msg91.com/help/whatsapp/whatsapp-coexistence>
- **Data and the BSP.** MSG91 hosts in the United States or Germany; Meta and Jio Haptik act as processors; the WhatsApp provider
  behind MSG91 is Jio Haptik. <https://msg91.com/privacy-policy>
- **Meta's limit on business-started messages** (confirmed): an unverified business portfolio may message at most **250
  different people per rolling 24 hours outside the 24-hour window**, shared by all its numbers; a verified portfolio starts
  at **2,000**, then scales with quality. Replies inside the window do not count. <https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits>
- **Meta's pricing** (research file, facts 5-6): customer-started messages free; replies free up to 1,000 a number a month, then
  charged; utility templates charged; marketing the costliest.

**SPIKE (not confirmed; each is marked `// SPIKE:` in the code where a build rests on it)**

- S1. Exact inbound payloads for image, document, video, audio, sticker, location, contact card, reaction and a reply (quoted
  message); which field carries the quoted message id (`replyMsgId` or a `context` object).
- S2. Whether a message **sent from the phone app** (coexistence echo) reaches the webhook, with which `eventName`/`direction`,
  and how the 180-day history is delivered (webhook, API, or not at all).
- S3. Whether the webhook is per account or per number; whether a custom header and the path are both kept; whether MSG91 tells
  us when it pauses it.
- S4. The session-send body for text, image, document, video; whether media is sent by a public link (we would give a
  short-lived presigned download) or an uploaded id; the response (does it return the wamid at once?); whether it is idempotent.
- S5. The template send body (variables, header media, buttons); template list/get response and status values (Pending,
  Approved, Rejected, Paused, Disabled) and Meta's rejection reason field; whether Hindi and `en`/`en_US` codes differ.
- S6. Error codes for a send outside the window (Meta's 131047 re-engagement), a bad number, a number not on WhatsApp, the
  tier limit (131048/130429), and MSG91's own rate limits.
- S7. Whether the media `url` needs MSG91's `authkey` to download, its largest size, and its content types.
- S8. Whether quality-rating and display-name events arrive on the webhook; "To Fetch Whatsapp Number" response (what the
  console can read about a number: quality, tier, status).
- S9. A logs/messages API to read inbound messages and statuses since a time (MSG91 keeps reports 100 days), for catching up
  after a paused webhook (section 4.7).
- S10. Whether Rs 500 a month is per number or per account, and whether a WABA made through MSG91 is tied to Jio Haptik.
  (Ask MSG91; the research file has the email.)

**The frictions, plainly** (each is designed around, sections 4 and 8)

1. The webhook is pasted by hand in MSG91's panel, once, for everyone. A wrong paste or a rotated secret stops every agency.
2. No signature. The only protection is a long random secret in the URL plus a static header, over HTTPS. Anyone who learns both
   can forge messages into any agency, so both are secrets and rotate together.
3. **One 4xx pauses the webhook for every agency.** Once an event is stored we always answer 200; the only 4xx we ever send is
   to a caller without the secret.
4. Payloads are MSG91's own, loosely named, with JSON inside strings. The parser is tolerant and never throws.
5. Media URLs die after 30 days; we copy each file into our storage at once.
6. A WABA made through MSG91 is likely tied to Jio Haptik: moving to another provider may need a new WABA and loses template
   approvals and history. The `WhatsAppProvider` port keeps our code ready to move to Meta's Cloud API.
7. Data is hosted in the US or Germany. **The privacy policy must say so** and name MSG91, Jio Haptik and Meta as
   processors (owner's checklist, section 13).
8. We carry all of MSG91's and Meta's cost across all agencies, so fair use is enforced by us (sections 8.2, 9).

## 3. Who uses it and the screens

- **Platform super admins** record and manage the connection in the console (3.5). Support staff may look, not change.
- **Agency staff** see the inbox and the lead's chat by permission (section 6.3): `inbox:view` (own or all, like
  `leads:view`), `inbox:reply`, `inbox:templates`. The Owner holds all. Starter roles: Admin all; Sales roles view their own
  scope and reply; a role without lead editing can read but not reply.
- Built from registry components and the shared pieces (`CLAUDE.md`); each screen has loading, empty, error-with-retry and
  refusal states. Replies and templates ask `useWriteAccess("change")`. Words in `inbox.json`, a refusal in `errors.json`.
  Mobile first. No pastel icon tiles, no rows of identical boxed cards (DESIGN.md): the inbox is a dense list and a
  conversation, like the apps staff already use.

**3.1 Inbox (`/inbox`, in the main navigation when the `inbox` module is on the plan and a number is connected).**
Desktop: a list on the left, the chat on the right. Phone: the list, and a tap opens `/inbox/<conversationId>` with a
`BackLink`. The page address carries only the id. `PageHeader` "Inbox". Filter chips (the lead list's pattern): **Waiting for
reply** (default), **All**, **Mine**. A search box (name or phone digits, kept in the tab like the lead search). Each row
is an `Item`: an `Avatar` with initials, the customer's name, the first words of the last message, the time (`formatDay` /
time today), and a `StatusDot` when the customer wrote last and nobody has answered. A row for an unknown person with no lead
says "New number". States: not connected ("WhatsApp is not set up for your agency. Ask us to connect your number: <support
contact from the brand>", never MSG91); no chats yet; load failed (`LoadFailedAlert`); "WhatsApp is having trouble: new
messages may arrive late" when the connection's status is `problem` (8.4).

**3.2 The chat (the right pane, the lead's WhatsApp section, and the phone page).** One component, `ChatPanel`.
- Header: the person's name (a `TextLink` to their lead), phone, the lead's stage and owner, and **Start a new lead** when the
  chat has no open lead (Q2). A day `Separator` between days ("Today", "16 Oct").
- Messages, oldest at the bottom end as in WhatsApp, a page at a time upward (`useCursorPages` with `ShowMoreButton` reading
  "Earlier messages"). Customer messages on one side with a muted background token, staff on the other with the brand's
  token; the staff member's first name under their messages; time; for ours a status: clock (queued), one tick (sent), two
  (delivered), two in the brand colour (read), and a red "Not sent" with the reason's sentence and **Try again**. No
  borders or shadows on bubbles; the tokens only.
- Kinds: text (links made tappable, never HTML); image (a thumbnail, tap for the full picture in a dialog); video and
  audio (the browser's player, from a presigned link); document (name, size, **Download**); location (the address-less pin as
  "Location: 12.9716, 77.5946" and an "Open in Maps" `TextLink`); contact card (name and numbers, **Add as a person** is
  out of scope: shown as text); a reaction (shown on the message it is for); a reply shows the quoted message above in a
  muted line; unsupported ("This message type can't be shown here. Open it on the phone.").
- Media still copying shows "Photo loading"; if it could not be saved, "This photo expired before we could save it."
- **The composer:** a growing `Textarea`, **Attach** (a file or photo, `uploadFile()`), **Send** (disabled when empty or
  while the subscription refuses it, with `WriteHint`). Enter sends on a PC, a new line on a phone (the browser's own
  touch detection). Under the box, while the window is open: "Open until 4:10 pm today" (`formatDayTime`).
- **Window closed** (more than 24 hours since the customer's last message, or the customer never wrote): the composer is
  replaced by an `Item` "You can reply with free text only within 24 hours of their last message. It closed on 22 Oct,
  4:10 pm." and **Send a template**, which opens a `ResponsiveDialog` (3.3).
- A staff member who has no `inbox:reply` sees the messages and no composer.

**3.3 Send a template (a dialog, part 3).** A `SearchCombobox`-style list of Approved templates (name, a two-line preview);
choosing one shows a form of its variables prefilled from the CRM where it can (customer name, destination, agent's name,
travel month) as `TextField`s, and a live preview of the final message. If the person has not agreed to WhatsApp messages (Q6)
and the chat was started by us, a `ChoiceField` "They agreed to WhatsApp messages" must be ticked (R3 below). A person who
has opted out (they wrote STOP) shows "Asked to stop WhatsApp messages" instead and no template can be chosen. A marketing template shows
how many of the month's allowance the agency has left. **Send** (busy while pending).

**3.4 Templates and WhatsApp settings (`/settings/whatsapp`, with `settings:manage` to view the state and `inbox:templates` for
templates).** `PageHeader` "WhatsApp". A status group (`Details`): **Connected** (`StatusBadge`), the number as the
agency knows it, connected on, "Marketing messages this month: 112 of 300", "Template messages today: 14 of 100" (both set
by us), quality rating once S8 shows it. Below it **Templates** (part 3): a `Table` of name, category (Utility, Marketing),
language, `StatusBadge` (Pending, Approved, Rejected with Meta's reason on a tap, Paused), last used, with **New
template** (a `FormDialog`: name, category as `ChoiceField` (Authentication is not offered), language, body text where typing
`{` inserts a variable chosen from a short list of CRM fields, each with a sample value Meta needs, an optional footer; the
rules Meta enforces are checked before sending: no variable at the very start or end, no two adjacent variables, a body of at
most 1,024 characters, sample values present) and **Refresh status**. A template that is Approved can be **Archived** (hidden
from the picker; it is not deleted at Meta). Rejected ones show Meta's reason and **Edit and send again**. Not connected: the
page says so in the same sentence as 3.1.

**3.5 The console (`/console/whatsapp`, and a WhatsApp group on an organization's page).**
- **List** (`/console/whatsapp`, `staffProcedure` to view): a `Table` of connections: organization, number, mode (new number or
  coexistence), `StatusBadge` (Setting up, Connected, Paused, Problem, Disconnected), connected on, last event seen,
  this month's messages in and out, marketing sent against its cap. A banner when any connection has the problem described in
  8.4 ("No delivery reports from MSG91 for 40 minutes after sending"), and the **account webhook** block: the URL to paste in
  MSG91's panel and the header name and value, shown once per page view behind **Show secret** with `CopyButton`
  (super admin only; they come from the process settings, section 13, never the database).
- **An organization's WhatsApp group** (`superAdminProcedure`): shows the connection or **Connect a number**, a
  `FormDialog` with: the number (a `PhoneField`, the number the agency's customers message), the **integrated number** as MSG91
  writes it (digits, prefilled from the same number), mode, MSG91's reference for the number and the WABA/phone-number ids
  (free text, optional, as MSG91 gives them), and a note. Saving creates the connection as **Setting up** and starts routing
  its events (counted, not turned into leads). The group then says **Waiting for the first message: send a WhatsApp to <number>
  from any phone.** When MSG91's first event for the number arrives it shows "Webhook received 10:42"; only then is **Mark
  connected** enabled (it also needs the organization's plan to have the `inbox` module and a WhatsApp-numbers limit of at
  least 1). After that: **Pause** (inbound still stored, no replies sent), **Disconnect** (`ConfirmDialog`: "Stop WhatsApp for
  <agency>? Chats stay. Remove the number in MSG91's panel too."), the two caps (marketing a month, templates a day), usage by
  month (a small `Table`: messages in; replies; utility templates; marketing templates; failed), and **Check with MSG91** (S8).
  Changes are audited in the platform log and the organization's audit log (section 11).

## 4. How it behaves

### 4.1 The provider port

`packages/integrations/src/whatsapp/` (ADR 0008; only this code calls `control.msg91.com`):

- **Port `WhatsAppProvider`**: `sendText(number, to, text)`, `sendMedia(number, to, { kind, url, caption?, filename? })`,
  `sendTemplate(number, to, { name, language, parameters })`, `listTemplates(number)`, `createTemplate(number, template)`,
  `fetchNumber(number)` (S8), `downloadMedia(url)` (S7), and optionally `messagesSince(number, since)` (S9). Methods return a
  value, never throw on a provider answer: `{ ok: true, wamid?, requestId }` or a typed failure (`window_closed`,
  `not_on_whatsapp`, `bad_number`, `template_not_approved`, `rate_limited`, `tier_limit`, `provider_down`, `unsure`, `other`)
  carrying MSG91's and Meta's codes and nothing else (never a body, URL or the key). `unsure` is a timeout or dropped
  connection after the request left (the message may or may not have gone).
- **Pure parser** `parseMsg91Event(body): ParsedEvent[]`: tolerant (aliases for each name, `JSON.parse` of the stringified
  fields in a try, strings trimmed, numbers normalised through the kernel's `phoneNumber` with the +91 default only when the
  digits are 10), returns `inbound` (kind, text, media ref, location, quoted wamid, customer name), `status` (wamid, status,
  reason code), `echo` (a message sent from the phone, S2) or `unknown` (kept, counted). It never throws and never logs the
  body. Fixtures for it come from the spike, one file per payload kind.
- **Real adapter:** `fetch`, 10-second timeout (30 for media), the key in the `authkey` header, one retry only when the
  request provably never left (DNS or connect error), never for a timeout. **In-memory adapter:** a scripted MSG91 holding
  numbers, templates and sent messages, a settable clock, switches for each failure kind, and a helper that produces the
  webhook bodies MSG91 would send (statuses on a timer you advance), used by every domain test and the journeys.
- The key is `MSG91_AUTHKEY`, one for the platform (not per agency, not in the database).

### 4.2 The webhook (store, then work)

- **W1. One provider, `msg91-whatsapp`,** in `apps/api/src/webhook-providers.ts` (built when the settings of section 13 are
  set), at `POST /webhooks/msg91-whatsapp/<token>`. The generic intake has one path segment, so `apps/api` gains one small
  route for this path that hands the token to the provider as an internal header, before the intake runs (the same place the
  Meta GET route sits). `verify` is true only when the path token **and** the static header (`x-travel-crm-key`, set in
  MSG91's panel) both equal the settings, compared in constant time. Anything else is 401 with nothing stored: only a stranger
  ever sees a 4xx.
- **W2. `identify` never returns null.** The request's event id is the sha256 of the raw body (so an identical re-delivery is
  not stored twice), the type is the content or status name of the first event, or `unknown`. A request may carry a batch;
  the body is parsed into events in `process`. Dedupe happens there, per message by its wamid (D4, the unique key) and per
  status by wamid + status (a status only moves forward, D1 of 4.5), never per request. A body we cannot read is stored and
  answered 200. Result: a payload surprise cannot make us answer 4xx and pause every agency's inbound.
- **W3. Body limit and rate.** The route is in the `webhooks` rate class (600 a minute). It also has a body ceiling (64 KB);
  larger is answered 200 and dropped with a log line counting it, because 413 would pause the webhook (no personal data
  is in the line).
- **W4. `process` (the worker, at least once)** handles each parsed event on its own:
  1. The intake has already stored the event with no organization (before routing). Look up the connection by
     `integratedNumber` in `whatsapp_number_route` (inside `db.withoutOrg`). Found: `processing.isAbout(organizationId)` gives the
     stored event its organization. No row: a quiet success that upserts the number into `whatsapp_unrouted` (a count and
     first/last seen, ids only) so a number we never recorded cannot fill anything, and the console lists such numbers with
     their counts (3.5) so our team notices a number added in MSG91 but not recorded here. The event stays with no
     organization and its payload is blanked after 7 days like the rest.
  2. In `db.forOrg`: a connection in `setup` only stamps `last_event_at` and stops. `disconnected`: stop. `paused`: inbound
     is stored (4), statuses applied, nothing else.
  3. **Inbound:** section 4.3. **Status:** section 4.5. **Echo:** 4.6. **Unknown:** counted on the connection, nothing else.
  4. Every path ends in one transaction that also stamps `last_event_at` (and `last_inbound_at` for inbound), which feeds the
     health check (8.4).
- **W5. The stored payload holds personal data** (the customer's number, name and words) in `webhook_events`, which is outside
  row-level security. It is the raw event kept as received (ADR 0028), tied to the organization through `isAbout`, so purge and
  erasure blank it (ADR 0023). A sweep (`whatsapp.blank-events`, hourly, in the worker) also blanks the payload of events
  processed more than 7 days ago, **routed or unrouted**, keeping the id, type and times. Nothing else is read from the table.

### 4.3 An inbound message

- **I1. Store first.** In one `db.forOrg` transaction: upsert the **conversation** (unique `(organization_id,
  connection_id, phone_e164)`), take its row lock, insert the **message** with `ON CONFLICT (organization_id, wamid) DO
  NOTHING`. If nothing was inserted this is a repeat: stop. The unique wamid is the ledger; there is no second table.
  The message is stored even when the next steps fail, and the conversation lock makes two messages from a new person
  (they often send three in a row) make one lead.
- **I2. Find the person and lead** (`receiveWhatsAppContact` in crm, section 6.2), inside the same transaction, under the lock:
  - **Matching (R2):** the number is matched to a person by **any of their stored phones**, with crm's existing one-person-per-phone
    rule (`matchPerson`); a number that matches nobody is an unknown number.
  - phone matches nobody: `saveEnquiry` creates the person and lead (`from: "import"`, not `unverified`: WhatsApp has verified the
    number), source **`whatsapp`** (already in `leadSources`), detail "WhatsApp chat", name from the customer's WhatsApp
    profile name or, when empty, "WhatsApp +91 98765 43210" for staff to correct; enquiry date the message's time; note the
    first message's text (at most 1,000 characters; "Sent a photo" for media); **`assign`** as in release 4 (rules, mode, away,
    working hours; the agency Owner is the fallback); actor `systemActor(organizationId)` with source `integration`, the
    connection's id as detail. A lead made this way publishes `lead.created` as always, so the slow-reply alert is armed.
  - phone matches a person with an **open lead**: no new lead and **no repeat-enquiry row** per message (a chat is not an
    enquiry each line). The chat is the person's, so it already shows on that lead. The first message after a quiet 24 hours adds one timeline
    entry (`whatsapp.contact`, "Wrote on WhatsApp") so the lead's history shows the thread restarted.
  - phone matches a person with **only closed leads**: per Q2, the chat waits in the inbox, flagged "Past customer", with
    **Start a new lead** (which makes a lead marked **Returning**, source `whatsapp`, through the same path). Who is told is 4.8.
  - the person is a **blocked contact**: the message is stored with the conversation hidden from the inbox, nothing else
    happens (no lead, no notice). Unblocking shows it.
- **I3. The lead's first reply time.** A staff reply (4.4) or an echo from the phone (4.6) sets `firstReplyAt` through the
  existing crm function, so the lead list's reply time and the slow-reply alert see WhatsApp answers.
- **I4. Media** (an image, video, audio, document or sticker): the message row is `media_state = pending` with the MSG91 url
  kept in the row (a URL, not a credential, S7), and a job `whatsapp.copy-media` (ids only) downloads it through the port
  (size cap 64 MB, type allowlist, 30-second timeout), writes it to object storage with the files module as an
  attachment on the record type `whatsapp_message`, and sets `stored`. It retries with backoff for 25 days, then
  `expired`. A file over the storage limit sets `failed` with reason `storage_full` and tells the Owner once. Nothing is
  rendered or resized on our server; the browser shows it from a presigned link. Files received are ordinary attachments
  (a staff member can mark one sensitive, as for any file; passports sent over WhatsApp are the agency's to mark).
- **I5. Order.** Messages may reach us out of order or late. Display order is the provider's own time (`occurred_at`), ties
  by our id (UUID v7). The conversation's `last_message_at` and the 24-hour window only ever move forward.
- **I6. Reactions** set an emoji on the target message (by wamid) and are not rows of their own. An unknown target is kept
  as a row of kind `reaction`. A message that quotes another stores the quoted wamid and the view looks it up.
- **I7. Hindi and other scripts, emoji, long text:** text is stored as received (Unicode), displayed with `dir="auto"`, at most
  4,096 characters (WhatsApp's own ceiling); longer is cut with a marker, never an error.

### 4.4 Sending (part 2)

- **S1. One path, an outbox.** `inbox.send` does, in one transaction: check the permission and the plan; check the window
  (section 4.4 below); insert the message as `queued` with the sender, a client token from the browser (unique with the
  organization, so a double tap or a retried request is one message), and `publishEvent(tx, 'whatsapp.message-queued')`.
  A listener in the worker sends it through the port, outside any transaction, and in a second transaction sets `sent` with
  the wamid, or `failed` with a reason code. The browser shows the message at once as queued and updates by refetch
  (`useRefreshWork`-style, every 5 seconds while a message is unsettled, no websocket).
- **S2. At most once, never silently twice.** The listener claims the row (`queued` to `sending`, with a time) before the call.
  After `ok` it records the wamid. After a definite failure it sets `failed`. After `unsure` (timeout) it sets `failed` with
  reason `unsure` and the sentence "We couldn't confirm this was sent. Check before sending again." **Try again** on any failed
  message creates a new message and marks the old one `superseded`. A row left `sending` for more than 2 minutes (a crashed
  worker) becomes `failed/unsure` by the health job. Automatic retries only for `provider_down` and `rate_limited`, 3 times
  over 5 minutes, because those never reached WhatsApp.
- **S3. The window.** Free text and media need `now < last_inbound_at + 24h` for that conversation (the customer's latest
  message, any kind). The check runs in `inbox.send` (a refusal `WINDOW_CLOSED` with its sentence) and again in the listener
  (a window that closed while queued fails as `window_closed`, which the chat shows as "Window closed: send a template").
  A provider's own answer (Meta 131047, S6) maps to the same reason, because our clock and Meta's can differ by seconds.
- **S4. Media out** (an image, a PDF or other document, a video): the browser uploads straight to storage (`uploadFile()`),
  then `inbox.sendMedia` names the confirmed file; the listener gives the port a presigned download link valid for 10 minutes
  (S4 spike: or uploads the bytes). Limits as WhatsApp's: images 5 MB, video 16 MB, documents 100 MB; we cap at 16 MB for all
  (constant). Allowed types: jpeg, png, mp4, pdf, docx, xlsx, pptx, txt. Voice notes (section 0, item 9) are sent as audio; no stickers.
  The sent file stays attached to the message.
- **S5. Budgets.** Sends pass the rate-limits module per organization (60 a minute; a constant) and a platform ceiling (a second
  constant, below MSG91's own once S6 tells it). Over budget a message waits `queued` and is retried by the listener.
- **S7. Consent and opt-out (R3).** Consent is the existing `person_consent` ledger, append-only, latest row decides, with a new
  purpose **`whatsapp`** and sources **`staff`** (the "they agreed" tick, recorded once with who and when) and **`customer`**
  (an opt-out). An inbound message whose whole text, trimmed and in any case, is `STOP`, `UNSUBSCRIBE` or `stop messages`
  records a customer opt-out and the chat shows "Asked to stop". From then on `inbox.sendTemplate` refuses the person
  (`NO_CONSENT_FOR_TEMPLATE`); replies **inside a window the customer opens again** by writing are still allowed. Staff cannot
  override an opt-out: it clears only when the customer asks again to hear from us and staff re-tick the box, which is audited
  (`whatsapp.consent-restored`). The opt-out is also a "stop offers" for the existing marketing consent when the person never
  granted it.
- **S6. Status changes of a subscription.** Read-only, suspended or cancelled subscriptions refuse sends (check 2: `inbox.send`
  is a "change"); reading chats stays open for read-only (a view) and for nothing else.

### 4.5 Delivery statuses

- **D1.** A status event updates the message with that wamid in `wamid`'s organization: `sent` < `delivered` < `read`, only
  forward (a "delivered" arriving after "read" is ignored), each with its time; `failed` sets the reason code and a
  sentence's key. Idempotent by nature.
- **D2.** A status for a wamid we don't have yet (MSG91 can be faster than our own save of the send's answer) throws a retryable
  error, so the intake's retry (30 seconds, up to 10 times) finds it. A status for a message older than 2 minutes with no
  row is dropped and counted (a phone-sent message whose echo we never got, S2).
- **D3.** A `failed` status for a template (not approved, number not on WhatsApp, quality hold) is shown on the message in
  the chat and counted on the connection's usage as `failed`.
- **D4.** The 24-hour window and Meta's 250/2,000 business-started limit: a `tier_limit` failure (S6) stops further template
  sends to new people for the agency for one hour and says so in the dialog; the Owner is told once (4.8).

### 4.6 Messages sent from the phone (coexistence echoes) and history (part 3)

- **E1.** If MSG91 delivers an event for a message the agency sent from the WhatsApp Business App (S2), it is stored as an
  outbound message with `origin = staff_phone`, no sender, and a status from the event. It counts as a reply for `firstReplyAt`
  and does not open or reopen the window. A chat that starts with an echo (staff messaged first from the phone, the person
  never wrote) is stored and linked to the person if the number is known; it never creates a lead.
- **E2.** If S2 shows echoes are not delivered, the inbox says so in the console group and the agency is told once during
  onboarding: "Messages you send from the phone appear here only if you send them from the CRM." (Owner's checklist.)
- **E3. History** (Q4, last step of part 3, built only after S2 says how it arrives): messages dated before the connection's
  `connected_at` are stored with `origin = history`, only into conversations whose phone already belongs to a person in the
  CRM (a past customer or an open lead). History from unknown numbers is counted and discarded. History is stored without
  notifications, without touching the window (it must not reopen it), and does not set `firstReplyAt`. It runs once, bounded
  by Meta's own rule (24 hours after onboarding); the console group shows "History: received N messages, kept for M people".
  Its media is copied only if the URL still works.

### 4.7 A paused or broken webhook, and catching up

- **C1. What can go wrong:** MSG91 paused the webhook after a 4xx we sent (we try never to); the secret was changed on one side;
  our api was down for longer than MSG91's retries; a partner removal left inbound dead (research, fact 3).
- **C2. What we do about it:** the health check (8.4) notices; platform staff see it in the console and fix the setting in
  MSG91's panel (checklist, 13). After a gap, **Catch up from MSG91** in the console group (visible only if S9 gives a
  messages API) reads inbound messages and statuses since `last_event_at` for that number, and feeds each through the same
  `process` code path as a webhook event (the wamid unique key makes the overlap free). If S9 gives no API, the gap's inbound
  messages are lost to the CRM; for a coexistence number the agency can still read them on the phone, and the console says
  so plainly.
- **C3. A webhook is never answered with a 5xx for our own bug** after the event is stored: the store is the only step
  that can fail (the database is down), and then MSG91's retries cover it.

### 4.8 Notifications

`notify()` with kinds added to `kinds.ts` and their sentences in `notifications.json`; none carries message text (a push or
email may be read on a lock screen): "Priya wrote on WhatsApp".
- **`whatsapp.message`** to the lead's owner for a message on an existing lead's chat, once per 10 minutes per conversation
  (a burst is one notice), keyed on the first message's id; not sent while a staff member has the chat open (the page
  reports presence every 30 seconds through `inbox.seen`, kept in memory in the api, not stored; best effort, and acceptable
  while there is one api instance: with two, a notice may be sent to someone who has the chat open).
- A **new lead from a chat** uses the existing `lead.assigned` (and `lead.unassigned` for the Owner when nobody is on duty).
  No new kind.
- **Who gets `whatsapp.message` (R1):** the owner of the person's most recently active open lead; if they have no open lead, the
  owner of their most recent lead; if that member is inactive (removed or away-and-gone), the holders of `leads:assign`.
- **`whatsapp.past-customer`** (4.3, third case) goes to the same person by the same rule: "A past customer wrote on WhatsApp".
- **`whatsapp.send-failed`** to the sender when a message ends `failed` after settling ("Your message to Priya wasn't sent").
- **`whatsapp.needs-attention`** to the Owner once per change into a bad state that the agency can act on: template rejected,
  storage full for media, tier limit reached, quality rating Low. Connection trouble that is ours (MSG91, the webhook) is
  shown in the inbox banner, never as the Owner's task.

## 5. Data

All but `whatsapp_number_route` are organization tables under row-level security (ADR 0028): `organization_id` referring to
`organization` `ON DELETE RESTRICT ON UPDATE RESTRICT`, `SELECT app_enable_org_rls('<table>');` in the migration that creates
them, UUID v7 ids, keys and unique constraints including `organization_id`, CHECK lists for fixed values, and a fixture each
in `packages/db/test/org-table-fixtures/inbox.ts` (`whatsapp_message` is marked append-only apart from status columns: the
runtime role can update it, never delete it; it holds no soft delete). Migrations only add. Nothing is seeded.

- **whatsapp_connection:** `integrated_number` (digits as MSG91 writes them), `display_number` (E.164), `mode` (new_number,
  coexistence, demo), `status` (setup, connected, paused, problem, disconnected), `provider_ref`, `waba_id`, `phone_number_id`
  (text, nullable, as MSG91 gives them, S8), `quality_rating` (nullable text), `connected_at`, `disconnected_at`,
  `last_event_at`, `last_inbound_at`, `last_send_ok_at`, `last_report_at` (last status event), `problem_since`,
  `marketing_cap_month` (int, default from the constant), `template_cap_day`, `events_unrouted`/`events_unknown` (counters),
  `history_state` (not_applicable, waiting, received, skipped), `created_by`, `impersonated_by`. Unique `(organization_id,
  id)`; partial unique `(organization_id)` where `status <> 'disconnected'` (one number a phase 1); the number-limit check is
  in the connect function (plan limit, section 8.5).
- **whatsapp_conversation:** `connection_id`, `phone_e164`, `person_id` (composite key, nullable only for an
  unknown number's first instant: the lead creation of I2 sets it in the same transaction), `profile_name` (cache, the WhatsApp name; emptied by erasure),
  `last_inbound_at` (the window), `last_message_id`, `last_message_at`, `needs_reply` (boolean: the customer wrote last and no
  staff or phone reply followed; cleared by a reply, an echo, or **Mark as answered**), `hidden` (blocked contact), `state`
  (open, erased). Unique `(organization_id, connection_id, phone_e164)`. Indexes: `(organization_id, last_message_at DESC, id
  DESC)` for the inbox; partial `(organization_id, last_message_at DESC, id DESC)` where `needs_reply AND NOT hidden`;
  `(organization_id, person_id)` for erasure and every lead page of the person. **The chat belongs to the person and the agency's number, not to a lead:** it
  shows on each lead page of that person. There is no `lead_id`; whom to notify is recomputed from the person's leads (R1, 4.8).
- **whatsapp_message:** `conversation_id`, `direction` (in, out), `origin` (customer, staff_crm, staff_phone, history),
  `kind` (text, image, video, audio, document, sticker, location, contacts, reaction, template, unsupported), `body` (text,
  at most 4,096), `caption`, `file_name`, `latitude`/`longitude` (numeric), `wamid` (nullable until sent), `quoted_wamid`,
  `reaction` (emoji), `client_token` (nullable, for sends), `template_id` (nullable), `template_params` (text[]; the values
  sent), `sent_by` (user id, nullable), `status` (received, queued, sending, sent, delivered, read, failed, superseded),
  `failure_code`, `occurred_at`, `sent_at`, `delivered_at`, `read_at`, `media_state` (none, pending, stored, expired, failed),
  `media_url` (nullable; blanked when stored), `media_attempts`, `created_at`. Unique `(organization_id, wamid)` where `wamid
  IS NOT NULL`; unique `(organization_id, client_token)` where not null. Index `(organization_id, conversation_id,
  occurred_at DESC, id DESC)` for the chat; partial `(organization_id, id)` where `status IN ('queued','sending')` for the
  outbox and the stuck-row check; partial where `media_state = 'pending'` for the copier. It holds the words (the typed
  columns are what the inbox queries; ADR 0028's "jsonb only for payloads as received" applies to the webhook event).
- **whatsapp_template:** `connection_id`, `name` (lower-case slug), `language`, `category` (utility, marketing),
  `body` (with `{{1}}` markers), `footer`, `variables` (text[]: the CRM field behind each marker, or `custom`), `samples`
  (text[]), `provider_ref`, `status` (draft, pending, approved, rejected, paused, disabled, archived), `reason` (Meta's
  rejection text, shown to staff), `synced_at`, `created_by`, `last_used_at`. Unique `(organization_id, connection_id, name,
  language)`. Templates our team made in MSG91's panel arrive by sync with `created_by` null. **Meta's category wins (R6):** `category` is
  synced from MSG91 on every refresh (Meta can re-classify a template), and the caps and `whatsapp_usage_month` count by the
  category Meta charged for the send (taken from the status event if it carries one, S8; otherwise the template's synced
  category).
- **whatsapp_usage_month:** `connection_id`, `month` (date, the first, in the organization's zone), `inbound`, `replies`
  (session messages out), `utility`, `marketing`, `failed`, `media_bytes_copied`. Unique `(organization_id, connection_id,
  month)`; incremented in the message transaction (an upsert). The console reads it; the marketing cap reads `marketing`.
- **whatsapp_unrouted (outside row-level security, same exemption and guards as the route table):** `integrated_number`
  (primary key), `first_seen_at`, `last_seen_at`, `events` (count). Ids and counts only; the console lists it (R5).
- **whatsapp_number_route (outside row-level security, an explicit reviewed exemption as `meta_page_route` is, ADR 0034):**
  `integrated_number` (primary key: unique across all agencies, the claim that one number belongs to one agency),
  `organization_id` (restricting deletion), `connection_id`. Ids only. The provider has to find the organization from a
  number without entering one. It is reached only through `@travel-crm/db/whatsapp-routes` inside `db.withoutOrg`,
  guarded as Meta's: the isolation test's named list gains it, `schedule-table.test.ts`-style grants are pinned,
  dependency-cruiser keeps the entry point to the inbox module's `routes.ts`, the raw-SQL ESLint guard flags SQL naming it
  elsewhere. A listener of `whatsapp.connection-changed` (published in the connection's transaction, safe to run twice)
  keeps it: `setup`, `connected`, `paused` and `problem` have a row, `disconnected` has none.
- **Enumerations that change:** `lead.source` already has `whatsapp`; its export and audit words ("WhatsApp") are added if
  missing. Lead event kind `whatsapp.contact` (timeline). Plan module `inbox` exists. Permission module `inbox` (section 6.3).
- **Contracts** (`@travel-crm/contracts/inbox`): strict inputs, outputs strip; no output holds the MSG91 key, a webhook secret
  or a provider url for media (the browser gets a presigned link by `inbox.mediaUrl`).

## 6. Modules, permissions, api

### 6.1 The port (4.1) and settings

`packages/integrations/src/whatsapp/` as in 4.1, adding no dependency (`fetch`, `node:crypto`). The webhook helpers for tests
(`msg91Signer`, which builds the path, header and a body) live beside the in-memory adapter.

### 6.2 The domain module `inbox` (above `crm`, beside `today`)

It calls crm and `files`, `notifications`, `jobs`, `kernel`; nothing calls it except the api and the worker (the web reads it
through tRPC). dependency-cruiser's `business-modules-call-down` gains it at L2. It holds connection, routes, parser use,
conversations, messages, the outbox, statuses, media copying, templates, usage, health and the console functions. `index.ts` is
the public API; files small and single-purpose.

**crm (L1) gains** `receiveWhatsAppContact(tx, actor, contact, now)` (find or create the person and lead per 4.3, one
timeline entry, `firstReplyAt` setter for I3) and `startLeadFromChat(tx, actor, personId, now)` (Q2's button). It reuses
`saveEnquiry`, `matchPerson`, `addRepeatEnquiry`-free paths and the assignment code; the crm owners list each small change.
The slow-reply and `lead.created` behaviour needs no change.

### 6.3 Permissions, plan module, procedures, routes

- **Permissions** in `permissions.ts`: `inbox:view` (scoped; **own = conversations of a person with any lead (open or closed) the member can see under their
  `leads:view` scope**, so a past customer's chat is covered by their closed lead; all), `inbox:reply`,
  `inbox:templates`. The Owner gets them automatically. `request-rules.ts` maps the permission module `inbox` to the plan
  module `inbox`, and `request-rules.test.ts` covers it. A conversation whose person has no lead (only possible for an echo or history to a known
  person with no lead, or an erased one) is visible to the `all` scope only. The chat shows on **every** lead page of the
  person to anyone who can see that lead **and** holds `inbox:view`, and "Start a new lead" is offered to whoever can see the
  chat and holds `leads:create`. List queries use
  `scopeFilter()`.
- **Procedures** (tRPC `inbox.*`, `orgProcedure.requires("inbox:view")` etc.): `status` (connected?, banner state, counts),
  `conversations` (cursor list, filter, search), `conversation` (header), `messages` (cursor page), `leadChat(leadId)`,
  `send`, `sendMedia`, `retry`, `markAnswered`, `startLead`, `mediaUrl` (presigned, view-scoped; sensitive files obey
  `documents:view_sensitive`), `seen`; `whatsappTemplates.list/create/archive/refresh` with `inbox:templates` and `sendTemplate`
  with `inbox:reply`. Reads are views; the rest are changes. Sending a template to a person who never wrote also needs
  `leads:edit` on that lead. None uses `freshProcedure` (no money, roles or exports).
- **Console** (`staffProcedure`/`superAdminProcedure`, `@travel-crm/api/platform`, domain `@travel-crm/domain/platform`):
  `whatsapp.list`, `whatsapp.get(organizationId)`, `whatsapp.connect`, `whatsapp.markConnected`, `whatsapp.pause`,
  `whatsapp.resume`, `whatsapp.disconnect`, `whatsapp.setCaps`, `whatsapp.checkWithProvider`, `whatsapp.catchUp`,
  `whatsapp.webhookSettings` (super admin; the URL and header from the process). Writes run as `platformActor(organizationId,
  adminUserId)` inside `asOrganization`, source `platform`, like subscriptions. Nothing the api server or the worker runs reaches
  the platform code (dependency-cruiser), and the connection rows are read by the agency's api only through the inbox module.
- **Plain HTTP:** `POST /webhooks/msg91-whatsapp/<token>` (W1) only. No GET verification (MSG91 sends none).
- **Reasons** (sentences in `errors.json`): `WHATSAPP_NOT_CONNECTED`, `WHATSAPP_PAUSED`, `WINDOW_CLOSED`,
  `TEMPLATE_NOT_APPROVED`, `TEMPLATE_CAP_REACHED`, `MARKETING_CAP_REACHED`, `NO_CONSENT_FOR_TEMPLATE`, `ATTACHMENT_TOO_BIG`,
  `ATTACHMENT_TYPE`, `NUMBER_NOT_ON_WHATSAPP`, `WHATSAPP_NUMBER_TAKEN`, `WHATSAPP_NUMBER_LIMIT`, `WHATSAPP_UNAVAILABLE`.

## 7. The web app

`apps/web/src/inbox/` (inbox, `ChatPanel`, composer, template dialog), `apps/web/src/settings/whatsapp/` and the console's
`apps/web/src/console/whatsapp/` (which nothing else imports), routes `/inbox`, `/inbox/[conversationId]`,
`/settings/whatsapp`, `/console/whatsapp`; words in `inbox.json`, `whatsapp-settings.json` and the console's own file. Data
through tRPC hooks only; **server-rendered HTML holds no chat** (the service worker keeps pages). Offline: the chat is not
cached by the worker; sending offline is refused with the connection sentence, never queued in the browser. Every message's
text is data in the query cache (memory plus IndexedDB per the agency app's rules) and is wiped at sign-out like the rest. No
conversation id or phone is in a URL beyond the `<conversationId>` UUID; the inbox search text lives in tab storage. Uses
`PageHeader`, `Item`/`ItemGroup`, `Avatar`, `Separator`, `StatusBadge`/`StatusDot`, `ResponsiveDialog`, `FormDialog`,
`ConfirmDialog` (with `returnFocusTo`), `SearchCombobox`, `useCursorPages`/`ShowMoreButton`, `LoadFailedAlert`, `RefusalAlert`,
`WriteHint`, `CopyButton`, `uploadFile()`, and a registry `ToggleGroup`/chips for filters; the chat's scrolling uses the
registry `ScrollArea`. No hand-drawn borders, no literal colours, 44px touch targets, `formatDay`/`formatDayTime`.
New components wanted from the registry: `avatar`, `textarea`, `scroll-area` if not already added
(`pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`, then the `components/ui/README.md` checks).

## 8. Limits and safety

- **8.1 Secrets.** `MSG91_AUTHKEY` and the webhook token and header value are process settings (section 13), never in the
  database, the audit log, job data, logs, errors or any response. The adapter builds errors from codes only. A test makes the
  fake MSG91 fail with a message containing the key and asserts the stored reason and the log are clean (as Meta's M2).
- **8.2 Fair use (our cost control).** The console shows per agency, per month, messages in and out and templates by category
  (the usage table). A soft fair-use line (constant, 5,000 outbound a month) turns the row amber in the console list; nothing
  is blocked. Hard limits are only: the marketing cap (default 300 a month), the template cap (default 100 a day),
  and the per-minute send budget. The caps are columns, editable per agency by a super admin, audited.
- **8.3 No personal data in logs, jobs, events or errors.** Job and event data: organization, connection, conversation and
  message ids. Logs: codes and counts. A failed job's error (visible to platform staff) is a reason code. The notification
  text holds a name at most, never a message. The adapter and parser never log a body. The only personal data outside
  organization tables is the webhook event payload (W5), blanked by a sweep and by purge/erasure.
- **8.4 Health.** `whatsapp.health` runs every 5 minutes in the worker over `connected` connections, outside any transaction
  except small writes:
  1. **No delivery reports:** messages sent (`sent`, with a wamid) more than 20 minutes ago and none of them has a status, and
     `last_report_at` older than that: the webhook is probably dead or paused. Status `problem`, `problem_since` set, a log
     line at error level naming the connection, the console banner. This is the check for the "paused after a 4xx" case: our
     own sends prove the path is down without needing customers to message.
  2. **Quiet inbound while sends work:** only a console hint (the agency may simply be quiet, nights).
  3. **Stuck outbox:** `sending` over 2 minutes becomes `failed/unsure`; `queued` over 10 minutes is reported.
  4. **A daily check** (`fetchNumber`, S8) updates quality and status, and warns when quality is Low.
  A connection returns to `connected` by itself when a status or inbound event arrives. **Check with MSG91** runs 4 on demand.
- **8.5 Plans.** The `inbox` plan module must be on the plan for the screens and procedures. The console refuses to connect a
  number beyond the plan's WhatsApp-numbers limit (and the limit 0 means none); the connection function checks it under the
  subscription's row lock (plan limits are data). **Inbound while the subscription is not in full access:** messages are
  stored, nothing else is done (no lead, no notice); an hourly job (`whatsapp.adopt`) makes the leads for stored
  conversations with no lead when access returns (cheap, since chats are few). After **cancellation** inbound is still stored while the organization
  exists (read-only access shows it; purge removes it with the rest), and the console flags the connection "cancelled, number
  still connected" so our team removes the number in MSG91's panel and disconnects it. The demo has no MSG91.
- **8.6 Abuse.** The webhook accepts only the secret path and header, 64 KB, rate-limited by address with a generous
  ceiling (MSG91 sends from few addresses). A forged event can only add a message to a chat of a number we route: the cost of
  a leaked secret is spam into inboxes, so the secret rotates (13). Staff cannot send to a number that is not in a
  conversation they can see, or to a lead they cannot see. Text is rendered as text; links open with `rel="noopener noreferrer"`;
  files are never rendered by the server. Media from strangers is untrusted: the type allowlist applies on download, the
  browser's own sandbox for images and the download attribute for documents.

## 9. Pilot behaviour and limits Meta imposes

- Until the agency's business portfolio is verified, Meta lets it start conversations (templates outside the window) with at
  most **250 different people per 24 hours**, shared by its numbers; verified: 2,000 and rising with quality (section 2,
  confirmed). Replies within 24 hours and customer-started chats are not counted. The dialog and the console list show the
  agency's use of it only if S8 gives the figure; otherwise a `tier_limit` failure (D4) is the signal.
- New display names need Meta's approval; quality (Low) can reduce the tier. The console shows the rating; the Owner is told
  when it drops (4.8).
- A new number on MSG91 shows "pending display name approval" for a while; a coexistence number keeps its existing name.
- For the pilot: **Yatra Hikes** (or a test agency) with a spare number, our team adding it, everything in this spec working
  except what S2 says about echoes and history.

## 10. Erasure, disconnecting, the demo

- **Erasing a customer** (`eraseCustomerParts`) gains a step through the inbox module's `withdrawWhatsApp(tx, organizationId,
  personId, now)`: every message of the person's conversations has `body`, `caption`, `file_name`, `latitude`, `longitude`,
  `media_url`, `template_params` emptied and `kind` kept, its media files deleted through the files module (`deleteRecordFiles`
  for the record type `whatsapp_message`, after commit as the other steps), `wamid` kept (a wamid is not personal data and keeping
  it stops a late retry from re-creating the message); the conversation loses `person_id`, `profile_name`,
  `phone_e164` is replaced by `erased:<uuid>` and its `state` becomes `erased`, so the same person writing again later is a new
  chat and, per the crm's rule, a new enquiry. The confirmation tells the agency that WhatsApp (Meta), MSG91 and the customer's
  phone still hold their copy. `erasure.ts` and its test gain the step. The webhook event payloads for that organization are
  blanked as in W5/ADR 0023.
- **Disconnect** (console): the route row is removed, the connection becomes `disconnected`, queued messages fail as
  `WHATSAPP_NOT_CONNECTED`, chats stay readable and cannot be answered. The agency's leads are untouched. The console says
  to remove the number in MSG91's panel too (it does not remove it from Meta).
- **Purge** takes the tables with the rest (`deleteOrganizationRows` reads the catalog); the route row goes first. Media files are
  deleted by the existing record-files purge; the console's purge test gains an inbox row.
- **The demo:** `resetDemoOrganization` seeds a connection with mode `demo`, no number and no route, and three sample chats
  (a new enquiry, a lead mid-conversation with a reply and a template, a past customer), with media-less messages. The inbox
  works for reading; sending says "Not available in the demo". No call to MSG91 is possible there.

## 11. Audit and notifications

- **Audit** (`recordAudit`, record type `whatsapp_connection`, `whatsapp_template` and, for chat actions, the lead; sentences in
  `audit.json`): `whatsapp.connected`, `.paused`, `.resumed`, `.disconnected`, `.caps-changed` (old and new values), `.problem`
  and `.recovered` (system), `.template-created`, `.template-archived`, `.chat-started` (a template sent to a person who never
  wrote: person, template, "agreed" ticked), `.consent-granted`, `.consent-restored`, `.opted-out` (system), `.lead-started-from-chat`. The platform log (`recordPlatformAudit`) holds
  connect, disconnect and cap changes by admin. **Each ordinary message is not an audit row**: the message table is its own
  append-only record with sender and time (sends are changes with a durable record), and a row per message would only copy
  customers' words into the log. A test asserts that no audit snapshot holds a message body.
- **Notifications:** section 4.8.

## 12. Performance, journeys and tests

- **Performance (ADR 0028):** the inbox list is one indexed read on `(organization_id, last_message_at DESC, id DESC)` with the
  lead join for the scope; the chat is the message index; an inbound event is one lookup by primary key (route), one upsert,
  one insert on a unique key, a person lookup by phone (the existing exact index) and at most one lead. The agency of the
  seed (1,000,000 messages, 50,000 leads) gets budgets: inbox first page, chat first page, event processing, and a test reads the
  plans as `app_runtime` inside `forOrg()` (RLS changes plans, playbook 5). Search by name uses the existing trigram-free design
  (ADR 0028: measured, not asserted). Media copying and sends are in the worker, never the api request.
- **Test first** (domain, with the in-memory MSG91 and DB): parser fixtures for every payload kind including garbage, empty and
  renamed fields (never throws); `verify` right/wrong path token and header; `identify` on unreadable bodies (stored, 200);
  the same event delivered three times makes one message; three quick messages from a new number make one lead and one chat;
  a known person with an open lead gets no new lead and no repeat enquiry; a past customer waits for **Start a new lead**;
  a blocked contact is stored hidden; a number with no route does nothing; a `setup` connection only stamps; read-only
  stores without a lead and the adopt job makes it later; media copy (success, expiry, storage full, wrong type, too big);
  send once (a double submit with the same client token), a window that closed in the queue fails as `window_closed`, a timeout
  becomes `failed/unsure` and is never auto-retried, a provider down retries 3 times; statuses forward-only and out-of-order, a
  status before its message retried then dropped; reactions; permissions and scope (own/all, no reply without `inbox:reply`);
  the marketing cap and daily cap; the 5-minute health check (statuses missing for 20 minutes means `problem`, recovery on the
  next event); the route table's guards; erasure (bodies blanked, files deleted, wamid kept, the next message is a new chat);
  the key never in a log or error (8.1); the audit holds no body.
- **Journeys** (against the api, worker, Postgres, MinIO and the in-memory MSG91; harness `test/e2e/support/whatsapp.ts`):
  1. **Connect:** a super admin records a number in the console, sends the test message, sees "Webhook received", marks it
     connected; the agency sees the inbox.
  2. **A new enquiry:** a signed webhook delivers a message from an unknown number; a lead appears with source, owner by the
     rules and a notice; the chat shows on the lead's page and in the inbox; a photo from the customer arrives and shows.
  3. **Reply:** staff answer within the window, the ticks go sent, delivered, read as the fake MSG91 reports them; the lead's
     first reply time is set; a double tap sends one.
  4. **Window and template:** 25 hours later the composer is replaced; staff send a template (part 3); a rejected send shows
     "Not sent" and Try again.
  5. **Broken webhook:** the fake stops delivering reports after sends; the connection goes to `problem`, the console banner
     shows, the inbox shows its sentence; a later event recovers it.
  Mobile layouts of the inbox and the template dialog are covered by `pnpm e2e:audit`.

## 13. Settings, secrets and the owner's checklist

New settings (`apps/api/src/environment.ts` checks them at start-up; a bad value stops the process naming the variable and
never printing it; `docs/deploy-checklist.md`'s table gains the rows):

| Variable                                                                         | api | worker | console | Secret |
| -------------------------------------------------------------------------------- | --- | ------ | ------- | ------ |
| `MSG91_AUTHKEY`: the account's API key                                           | ●   | ●      | ●       | yes    |
| `MSG91_WEBHOOK_TOKEN`: at least 32 random characters; the path segment           | ●   |        | ●       | yes    |
| `MSG91_WEBHOOK_KEY`: at least 32 random characters; the value of the static header | ●   |        | ●       | yes    |

All three or none; absent, WhatsApp is off, the console says so and the inbox shows "not set up". The console process reads the
three to show the webhook block (3.5) and to run **Check with MSG91**; the console never writes the webhook. The header name is
a constant (`x-travel-crm-key`). `/webhooks/*` already routes to the api; `/inbox` and `/settings/whatsapp` are web routes. To
rotate the secrets: change them in Render and in MSG91's panel within minutes of each other; events in between are 401 and are
lost to the CRM unless S9 gives a catch-up, so rotate when quiet and do the catch-up after.

**The owner's steps, in order.** "Pilot" = before the owner tests on the pilot. "Real" = before real agencies.

1. **(Pilot) Sign up for MSG91 and complete KYC** with the registered business's name, GST and PAN, and a business email on
   the business's domain. Choose the WhatsApp plan (Titan, Rs 500 + 18% GST a month after two free months; **ask MSG91
   whether this is per number or per account** and whether there is a reseller rate: S10).
2. **(Pilot) Recharge the wallet** (the amount is yours to choose; Meta's charges for utility and marketing templates come out of
   it, customer-started chats are free).
3. **(Pilot) Add a test number.** Either a spare SIM that has never been on WhatsApp, or a number on the WhatsApp Business App
   with 30+ days of chats (for coexistence). In MSG91's panel: WhatsApp, **Add Number**; sign in to Facebook when asked,
   pick the business portfolio that will own the WhatsApp Business Account (use a **new** portfolio for the test, not
   "agencyOS", until you have read the lock-in note, friction 6), choose the display name, approve the code that arrives by SMS
   or call. For coexistence choose "connect an existing WhatsApp Business App account", scan the QR with the phone, and say
   whether to share history.
4. **(Pilot) Display name approval.** Meta reviews the display name; it can take a day or more. Use the business's real name.
5. **(Pilot) Send us the secrets plan:** I generate `MSG91_WEBHOOK_TOKEN` and `MSG91_WEBHOOK_KEY` (`openssl rand -base64 32`
   each) and `MSG91_AUTHKEY` comes from MSG91 (Settings, API keys). You put all three in Render for `travel-crm-api`,
   `travel-crm-worker` and the console service, as secrets, and redeploy; the start-up line says WhatsApp is on.
6. **(Pilot) Paste the webhook in MSG91's panel:** WhatsApp, Webhook (New). URL `https://<api>/webhooks/msg91-whatsapp/<token>`
   (the console shows the exact line with **Show secret**), method POST, JSON, and one custom header `x-travel-crm-key` with the
   key. Turn on inbound messages **and** delivery reports. Save. Do this once for the account. If the webhook ever says
   "paused", fix the cause and re-enable it here.
7. **(Pilot) Record the number in the console** (Organizations, the pilot agency, WhatsApp, Connect a number); send a message to
   it from a phone; wait for "Webhook received"; Mark connected. Give the pilot agency the `inbox` module and a WhatsApp-numbers
   limit of 1 on its plan first.
8. **(Pilot) Test as the owner:** message the number, check the lead and the chat, reply, send a photo, wait a day, send a
   template. Tell me what S2 shows for messages sent from the phone.
9. **(Real) Per agency: collect** the agency's WhatsApp number, whether it is on the Business App today, the person who will log
   in to Facebook during Add Number (that person must be an admin of the agency's business portfolio, or we use ours,
   friction 6), the display name they want, and their written agreement that we process their customers' chats (the privacy
   policy and terms, below).
10. **(Real) Per agency in MSG91's panel:** Add Number (step 3), record it in the console (step 7), and take the first
    screenshot of the quality rating.
11. **(Real) Meta's limit:** until the agency's business portfolio is verified, it can start conversations with at most 250
    different people per day. Ask the agency to verify its business in Meta Business Settings (days to weeks, their documents) if
    they plan outbound templates at volume. Replies and customer-started chats are not limited by this.
12. **(Real) Privacy policy and terms** (Ayush's drafts are parked for the landing-page agent): they must say that WhatsApp messages
    are processed by MSG91 (hosted in the United States or Germany), Jio Haptik and Meta; that the agency owns its customers'
    chats; what happens when an agency leaves (chats are exported with their data; the number stays with the agency's
    WhatsApp Business Account but may need re-onboarding elsewhere); and how a person asks for deletion. Have someone who knows
    India's DPDP Act read them. The agency must also tell its customers it uses WhatsApp for business (Meta's rule on opt-in).
13. **(Real) Ask MSG91 in writing** the open items in the research file (S3, S9, S10 and whether a WABA made through MSG91 can leave
    without a new one) before the first paying agency.
14. **(Real, later) Move to Meta directly** when you decide to (the research file's recommendation A): a second adapter behind the
    same port; agencies' WABAs may need re-onboarding.

## 14. Build order

One branch, `whatsapp/inbox`, which already contains `meta/lead-ads` (merged to main, PR #9). Shared files are the webhook
providers list, `kinds.ts`, `erasure.ts`, `permissions.ts`, `request-rules.ts`, `demo.ts` and the settings navigation.

**The build does not wait for the spike.** Parts 0-3 are built against the confirmed docs (section 2) and fixtures written from
them. The spike runs when the owner's MSG91 account and test number exist (checklist 1-6); its fixes stay inside the adapter, the
parser and the fixtures, which is why those are isolated behind the port. Nothing in the domain, the api or the web depends on
an unconfirmed field name.

0. **The shared pieces (one builder, a day or two; the tracks start when it merges):** ADR 0035 (WhatsApp through MSG91: the
   port, the one webhook, the exempt route table, what is stored), the `WhatsAppProvider` port with the in-memory adapter and
   `msg91Signer`, the parser with fixtures from the confirmed samples, the migration and schema (all tables), the route table with
   its guards and the fixture file, the contracts, `environment.ts`/`.env.example`, the permissions, the plan-module mapping.
   **The spike** (S-items, section 2) then runs alongside parts 1-3 once the account exists, and its answers are written into
   section 2 and the fixtures.
1. **Part 1: inbound and reading** (tracks by file ownership, each merged by the lead):
   - **A, integrations:** the real adapter, `downloadMedia`, `fetchNumber`.
   - **B, domain `inbox`:** connection and routes, the provider's `process`, conversations, I1-I7, media copy, usage, health,
     adopt, the blank-events sweep, erasure step, demo seeds.
   - **C, crm:** `receiveWhatsAppContact`, `startLeadFromChat`, the timeline entry, `firstReplyAt` setter, source words.
   - **D, api, worker and console backend:** the webhook provider and route, `worker-jobs.ts` (copier, health, sweeps,
     listeners), `packages/api` inbox read procedures, the platform `whatsapp.*` procedures and `platform/` functions.
   - **E, web:** the console screens, inbox list, read-only `ChatPanel` on the inbox and the lead page, settings page status.
   Gate: journeys 1 and 2.
2. **Part 2: replying:** the outbox listener and statuses (B, D), `send`/`sendMedia`/`retry`/`markAnswered`, the composer,
   attach, ticks, window rule, caps (E, D). Gate: journeys 3 and 5.
3. **Part 3: templates and history:**
   - 3a sync of templates and **Send a template** (the dialog, consent, caps, tier limit);
   - 3b **New template** in the app (create, edit-and-resend, archive) if Q3 stands;
   - 3c history and echo handling per what S2 showed and Q4.
   Gate: journey 4.
4. **Docs and gates:** `docs/deploy-checklist.md` rows (settings, the webhook path in the routing table and `docker/Caddyfile`),
   the owner's steps in `docs/` (copy of 13), `pnpm check` green, all journeys, the review in slices (server and security;
   agency screens; console and release), and one fix wave.

## 15. Decisions I made (small, say if you disagree)

- **D1.** One webhook token and header for the whole MSG91 account (settings, not the database), because the webhook is per
  account (S3). The console records per-agency ids and shows webhook health per number; if S3 shows a webhook per number, a
  per-connection hash column is added (additive) and checked in `verify`.
- **D2.** The webhook path carries the token and a header carries the key (two secrets, as the owner asked), through one small
  route in `apps/api` because the generic intake takes one path segment.
- **D3.** `identify` never returns null and we never answer 4xx to anything carrying the secrets, because one 4xx pauses
  every agency's inbound.
- **D4.** The message table is the dedupe ledger (unique wamid), not a second table.
- **D5.** A chat is not a repeat enquiry per message; the timeline gets one entry when a thread restarts after 24 quiet hours.
- **D6.** "Waiting for reply" (the customer wrote last) is the shared signal, not per-person unread counts, because the inbox is
  shared and the number that matters to a sales manager is chats nobody has answered.
- **D7.** A timeout on send becomes "couldn't confirm", never an automatic second send. A customer getting a quote twice is
  worse than a staff tap.
- **D8.** No audit row per message (the message table is the record); audit rows for connection, caps, templates and chats
  started by us.
- **D9.** Webhook event payloads are blanked after 7 days; the message is the durable copy.
- **D10.** Nothing is cached offline and nothing is queued in the browser while offline.
- **D11.** Inbound while the subscription is not in full access is stored and turned into leads when access returns; after
  cancellation it is still stored while the organization exists (R8), and the console flags the connection so our team removes
  the number by hand.
- **D12.** Messages are stored in plain columns in Postgres under row-level security; there is no per-message encryption
  (the database and backups are the agency's trust boundary, like notes and files). Changing this later is a column-level
  sealing with `SecretBox`.
- **D13.** Stickers out and reactions out are not built. A customer's voice note shows as a player, and staff may record and send voice notes (the owner's addition of 2026-10-24, section 0, item 9).
- **D14.** Authentication templates are not offered (no one-time codes in this product).
- **D15.** The 7-day Click-to-WhatsApp free window and Meta's pricing are not modelled; the product counts messages by kind and
  leaves cost to MSG91's and Meta's statements.
- **D16.** Agencies ask for a connection by contacting us (the brand's support contact); there is no request form or table.
- **D17 (R1).** A chat belongs to the person and the agency's number, not to a lead. Visibility, replying and notices follow the
  person's leads (any lead, open or closed, for seeing; the most recently active open lead's owner for notices, else the most
  recent lead's, else `leads:assign` holders if that member is inactive).
- **D18 (R2).** A number is matched to a person by any stored phone with crm's one-person-per-phone rule; otherwise it is unknown.
- **D19 (R3).** WhatsApp consent reuses `person_consent` (purpose `whatsapp`, sources `staff` and `customer`); STOP, UNSUBSCRIBE or
  "stop messages" records an opt-out; staff cannot override it; a reply inside a window the customer reopens is still allowed.
- **D20 (R4).** The request's event id is a hash of the raw body; dedupe is per message by wamid and per status by wamid + status;
  a batch is fine.
- **D21 (R5).** Events are stored before routing with no organization and get one afterwards; unrouted events are blanked after 7
  days; the console lists unrouted numbers with counts (`whatsapp_unrouted`).
- **D22 (R6).** Meta's category wins: the template category is synced from MSG91, and caps and usage count the category Meta charged.
- **D23 (R7).** The base is main (2f96c8ab and later): Meta lead ads and release 4's automatic assignment are both there.
- **D24 (R9).** Presence is best effort in api memory, fine for one api instance.
