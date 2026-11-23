# Several WhatsApp numbers per agency: design

Status: written 2026-11-22 from the owner's ten decisions, with no further round of questions. Code read on `main`
71141a33. Marks used below:
- **(owner)**: the owner's decision, binding.
- **(lead's call)**: the smallest sensible call where the decisions are silent, open to the owner's change. Section 16
  lists them all.

This spec replaces "One number per agency (Phase 1)" in `2026-10-23-whatsapp-design.md` (section 1, and the partial
unique index in its data model).

## 1. Why

Agencies split their WhatsApp across several numbers, each worked by its own staff, because calls and messages pile up
on one. They want every number in the product, with the AI agent on each. The Growth plan sells 2 numbers (owner).

## 2. The owner's decisions

1. **Sending.** A chat always replies from its own number: staff, the AI agent and automatic messages. A customer we've
   never chatted with gets their first message from the agency's main number. Sends outside a chat use the number the
   customer last chatted on, else the main number: the lead page's WhatsApp button, payment reminders and the other
   automatic messages.
2. **The main number.** The first number connected is the main one; platform staff can change it in the console. The
   "WhatsApp us" link on trip pages and quotes uses it. Broadcasts default to it, and staff can pick another.
3. **The same customer on two numbers:** two chats (one per number), one person, one lead. A chat links to the
   customer's other chat.
4. **Labels.** Each number gets a short label set when it's connected ("Sales 1"). The inbox shows it on every chat and
   can filter by number.
5. **Who sees what:** everyone who sees the inbox sees all numbers. No per-number permissions for now.
6. **The AI agent.** One agent across all numbers: the same name, the same trips, one credit pool per agency. Each
   number has its own AI on/off switch, which defaults to the agency's AI switch.
7. **Lead assignment:** a new rule condition, "came in on WhatsApp number X → person", beside source, destination and
   trip type. Otherwise the agency's mode applies (the Owner, turns, or fewest open leads).
8. **Plan limit:** the console counts live numbers against the plan's limit (Starter 1, Growth 2) and refuses one too
   many. Trials follow their plan.
9. **Disconnecting a number:** its chats stay readable but can't send. To reach those customers again, staff start a
   fresh chat from the main number.
10. **Existing agencies:** their single number becomes their main number.

## 3. What the code does today

**Already per number:**
- `whatsapp_conversation` is unique on (organization, connection, phone): a chat is one phone on one number.
- Templates (`whatsapp_template_key`), `whatsapp_usage_month` and the two caps are per connection.
- `whatsapp_number_route` maps each integrated number to its organization and connection; the webhook, inbound,
  echoes, statuses and the health check all work by connection.
- **The worker sends from the chat's number.** `queuedMessage` (`inbox/queued-message.ts`) reads
  `conversation.connection.integratedNumber`. A message row always leaves from its chat's number, so choosing the
  number means choosing the chat.
- `assertTemplateAllowed` (`inbox/template-send.ts`) refuses a template that isn't on the chat's number.
- One person and one lead across chats: `receiveWhatsAppContact` (`crm/whatsapp-contact.ts`) finds the person by phone
  and joins their open lead.
- Trials use their plan's limit: `entitlementsFrom` reads `row.plan.whatsappNumberLimit`.

**Built for one number:**
- The partial unique index `whatsapp_connection_live` (one non-disconnected connection per organization), and the
  `WHATSAPP_NUMBER_LIMIT` refusal in `connectNumber` (`inbox/connection.ts`).
- `liveConnection()` (`inbox/connection-row.ts`, a `findFirst` on "not disconnected"), called in `outbox.ts`,
  `system-send.ts`, `views.ts`, `templates.ts` (twice), `template-send.ts` (twice), `broadcast.ts`,
  `broadcast-send.ts`, `broadcast-audience.ts`, `connection.ts` and `sales/send.ts`. With two live numbers it returns
  either one; `sendableChat` and `queueSystemText` then refuse every chat on the other number.
- `adoptChats` (`inbox/adopt.ts`) adopts one number's chats. The console's functions (`platform/whatsapp.ts`) take an
  organization, not a number, and read its first live connection.
- The day's template cap and the month's marketing cap count the whole agency's messages against one number's cap.
- `editTemplate` sends to the live number, not the template's own.
- Automatic messages store a template id (`sales_settings`, `booking_settings`), and a template belongs to one number.
- The per-agency jobs walk the number routes (`routesPage`): the inbox's due work, the sales due work, adoption and the
  AI's nudges would each run twice for an agency with two numbers.
- The web: the console shows one number; `inbox.status` has one status and one number; the reply box reads the
  agency's status, not the chat's.

## 4. Data model

One migration, `20261218800000_multi_number_whatsapp`.

`whatsapp_connection` gains:

| Column | Type | What |
| ------ | ---- | ---- |
| `label` | `text NOT NULL DEFAULT 'WhatsApp'`, CHECK 1–20 characters | The short label (owner 4). |
| `is_main` | `boolean NOT NULL DEFAULT false` | The main number (owner 2). |
| `ai_answers` | `boolean NOT NULL DEFAULT true` | The number's AI switch (owner 6). |

Indexes:
- **Dropped:** `whatsapp_connection_live`.
- **New** `whatsapp_connection_main`: unique `(organization_id)` where `is_main AND status <> 'disconnected'`.
- **New** `whatsapp_connection_live_number`: unique `(organization_id, integrated_number)` where
  `status <> 'disconnected'`. An agency can't record the same number twice; the route already keeps a number to one
  agency.

`assignment_rule` gains `whatsapp_connection_id uuid NULL`, with a key
`(organization_id, whatsapp_connection_id) → whatsapp_connection (organization_id, id)`, `ON DELETE RESTRICT ON UPDATE
RESTRICT`.

Nothing else is stored. The link between a customer's chats is worked out by phone.

**Lead's calls:**
- **Labels:** existing rows and test fixtures get `'WhatsApp'`, and the console's form always asks for one. At most 20
  characters. Not unique: the console shows the number beside it. Platform staff can rename a number.
- **The AI switch is ANDed with the agency's:** the AI answers on a number when the agency's switch is on and the
  number's is on. The number's switch starts on, so a new number does what the agency's switch says (owner 6's
  "defaults to"). The agency's switch stays the master.
- **When the main number is disconnected,** `mainConnection()` falls back to the oldest live number, connected ones
  before one still being set up. No code moves the flag. The console shows the main number worked out this way, and can
  set it.

## 5. The sending rule, in one function

`sendFrom(tx, target)` in `packages/domain/src/inbox/send-from.ts`. Every path that queues a WhatsApp message asks it
which chat to write in:

```ts
type SendTarget =
  | { chat: string }                                                        // in a chat
  | { customer: { phoneE164: string; personId: string | null }; make: boolean }; // outside any chat
type SendFrom =
  | { ok: true; chat: SendingChat; connection: ConnectionRow }
  | { ok: false; code: "not_connected" | "paused" | "disconnected" | "none_yet" };
```

1. **In a chat (owner 1):** the chat's own number, always. If that number is down, the send is refused for the number's
   state; it never moves to another number.
2. **Outside a chat (owner 1):** among the customer's chats (the same phone) on numbers that aren't disconnected, the
   one they last wrote in (latest `last_inbound_at`). If they've written in none, the main number's chat with them,
   made when `make` is set; `none_yet` when it isn't.
3. **The number must be usable:** connected or problem sends; paused is `paused`; set-up or demo is `not_connected`;
   disconnected is `disconnected`.
4. **Templates:** a template belongs to one number. When an automatic message's chosen template is on another number,
   `templateOnNumber(tx, templateId, connectionId)` takes the approved template with the same name and language on the
   sending number. If there's none, the send is skipped with the reason `TEMPLATE_NOT_ON_NUMBER`. It is never sent from
   a different number. (lead's call)
5. **The worker keeps sending each row from its chat's number.** It never chooses a number.

`liveConnection()` and `requireConnection()` are deleted at the end, so no path can ask for "the agency's number"
again.

**Lead's calls:**
- **"Last chatted on" means where the customer last wrote** (`last_inbound_at`), not where we last sent. A broadcast
  from the main number doesn't move a customer off the number they talk to.
- **A paused number keeps its sends waiting** (`later`), as one paused number does today. They don't fall to the main
  number.
- **The customer's chats are found by phone,** since a chat is one phone on one number.

## 6. Every send path and its number

| # | Path | Code | Number |
| - | ---- | ---- | ------ |
| 1 | Staff text reply | `inbox/outbox.ts` `queueText` → `sendableChat` | the chat's |
| 2 | Staff file | `outbox.ts` `requestMediaUpload`, `queueMedia` | the chat's |
| 3 | Staff template in a chat | `inbox/template-send.ts` `queueTemplate` | the chat's; the dialog lists that number's templates |
| 4 | Try again | `inbox/retry.ts` `retryMessage` | the chat's |
| 5 | Staff trip kit | `inbox/trip-kit-send.ts` | the chat's |
| 6 | Scheduled message | `inbox/scheduled.ts` → `queueSystemText` | the chat's |
| 7 | Away, welcome and keyword answers | `inbox/automation-answer.ts` → `queueSystemText` | the chat's |
| 8 | Keyword trip kit | `trip-kit-send.ts` `sendTripKitOnKeyword` | the chat's |
| 9 | AI replies, files, QR, payment message, offer card, tap-booking line, follow-up nudges | `ai/agent-send.ts` `sendAiText` → `queueSystemText` | the chat's |
| 10 | A broadcast's recipient | `inbox/broadcast-send.ts` | the broadcast's number (section 7) |
| 11 | Payment confirmed or not found, in the booking's chat when the lead has no phone | `bookings/payment-messages.ts` → `sales/send.ts` `sendToChat` | the chat's |
| 12 | Lead page WhatsApp button and the lead's WhatsApp section | `inbox/views.ts` `leadChatOf` | outside a chat, not made |
| 13 | Start a chat with a lead (template) | `template-send.ts` `startChatForLead` | outside a chat, made |
| 14 | Speed-to-lead message and follow-up nudges | `sales/cadence.ts` → `sendToLead` → `chatForLead` | outside a chat |
| 15 | Sales reminders | `sales/reminders.ts` → `sendToLead` | outside a chat |
| 16 | Booking reminders (balance, details, reporting) | `bookings/reminders.ts` → `sendToLead` | outside a chat |
| 17 | Feedback ask | `bookings/feedback.ts` → `sendToLead` | outside a chat |
| 18 | Payment confirmed or not found | `payment-messages.ts` `chatToTellIn` → `chatForLead` | outside a chat |
| 19 | "WhatsApp us" on the public trip page | `packages/api/src/public-package.ts` → `package-view.tsx` | main |
| 20 | A new broadcast's number | the web's new broadcast dialog | main unless staff pick another |

Paths 1–11 reach `sendFrom({ chat })` through `sendableChat`, `queueSystemText` or `broadcast-send.ts`. Paths 12–18
reach `sendFrom({ customer })` through `leadChatOf`, `startChatForLead` and `chatForLead`. Path 12 opens a chat; it
falls back to the person's most recent chat when none is on a live number, so a disconnected number's chat stays
readable from the lead (owner 9).

## 7. Templates, caps and broadcasts

- **Templates stay per number.**
  - The templates screen gets a number picker, main first, when the agency has 2+ numbers. A new template is written
    on the picked number.
  - Refresh and the half-hourly sync read every live number's templates. A rejected template is edited and sent again
    on its own number (lead's call).
- **The send dialog in a chat** lists only the chat's number's approved templates.
- **The automation settings** (sales, bookings) keep one chosen template each. Their pickers list the main number's
  templates, and a send from another number uses the same name and language there (section 5, rule 4). The owner's
  operational note stands: each new number needs its templates set up and approved again, or its customers' automatic
  messages are skipped. They are not sent from the main number instead (lead's call).
- **Caps are per number (lead's call).** The day's template cap and the month's marketing cap are columns of each
  number, so each counts that number's messages only. WhatsApp's tier-limit pause (an hour after a `tier_limit`
  refusal) stays agency-wide, as today.
- **A broadcast goes from one number: its template's (lead's call).**
  - The dialog's number defaults to the main one (owner 2) and filters the templates.
  - The audience is the tagged or segmented chats on that number. The preview counts the matching chats on other
    numbers as "on another number".
  - To reach every number's customers, staff send one broadcast per number. A template can only go from its own
    number, and making chats on another number would start conversations customers never had there.
- **The send budget (60 a minute) stays shared** by the agency's numbers (lead's call).

## 8. The AI agent

- **One agent (owner 6):** the same name, trips, prompt and credit pool. Nothing is per number but the switch.
- **When it answers:** the AI answers in a chat when everything checked today passes, the chat's number has its switch
  on, and that number isn't disconnected.
  - `agentAnswers(mode, autopilot, numberOn)` gains the third argument, so every caller must pass it (`may-write.ts`,
    `lite/act-gates.ts`, `insight.ts`).
  - The same switch is read by the worker's queue and "AI has it" mark (`agent-worker.ts` `turnFor`), the chat's AI card
    (`chat-state.ts`), and keyword trip kits (`inbox/automation.ts` `aiAgentOn`), which stand aside only where the
    agent answers.
- **Where staff flip it:** the AI agent page lists the live numbers with a switch each, shown when the agency has 2+
  live numbers. It needs `ai:manage` and a fresh session, and is audited (`whatsapp.number-ai-on` / `-off`). The chat's
  AI card says when the AI is off for the chat's number.
- **The setup checklist's WhatsApp step** is done when at least one number is connected, and its line counts them
  (lead's call).
- **The AI reads only the chat it answers (lead's call).** A customer on two numbers has two AI conversations, each
  with its own summary, offer and day's cap, sharing their lead.

## 9. Lead assignment

- **A fourth condition** (owner 7): "came in on WhatsApp number", stored in `assignment_rule.whatsapp_connection_id`.
  It counts as the rule's one required condition.
- **What it matches:** a lead made from a WhatsApp message on that number. That is a first message (`inbound.ts`), the
  hourly adoption of chats stored while changes were off (`adopt.ts`), and Start a new lead in a chat
  (`chat-actions.ts`, `ai/lite/open-lead.ts`). Every other lead has no number and never matches it.
- **How it's passed:** `LeadFacts` gains `whatsappConnectionId`, passed by `receiveWhatsAppContact` through
  `saveEnquiry`'s `assign` to `chooseOwner`. The order is unchanged: a returning customer's owner, then the rules, then
  the mode (owner 7).
- **The settings screen** offers the condition when the agency has 2+ numbers; the list comes with the settings. A rule
  naming a disconnected number stays, matches nothing, and is marked.
- **Saving** checks the number is the agency's (`NOT_FOUND` otherwise).

## 10. The console

- **An organization's WhatsApp section** lists its live numbers. Each shows its label, number, status, a Main badge,
  mode, quality and this month's usage, with its own actions: Mark connected, Pause, Resume, Disconnect, Check with
  MSG91, Make main, Rename. Connect a number (its form gains Label) shows while the plan has room, with "1 of 2
  numbers".
- **Every per-number procedure takes `{ organizationId, connectionId }`.** The step into the organization reads the
  connection under row-level security, so another agency's number is "not found".
- **The plan limit (owner 8):**
  - Recording a number is refused when the agency's live numbers (setting up, connected, problem or paused) already
    reach `limits.whatsappNumbers`, and Mark connected checks again.
  - Both checks run under the subscription's lock (`lockSubscription`), so two records at once can't both take the last
    place. The refusal is `WHATSAPP_NUMBER_LIMIT`, whose sentence exists.
- **The main number:**
  - The first number recorded for an agency with no live number is its main one. Owner 2 says "connected"; a number is
    recorded before it's connected (lead's call).
  - Make main moves the flag in one transaction, audited `whatsapp.made-main` and in the platform log. Rename is
    `whatsapp.renamed`.
- **Disconnect (owner 9)** works on one number as today: its route goes and its chats stay readable. If it was the
  main number, the main falls to the oldest live number (section 4), and the confirm says which.
- **The all-numbers list** (`/console/whatsapp`) gains Label and Main columns.
- **A plan downgrade disconnects nothing (lead's call).** The section shows "3 of 2 numbers" and refuses a new one.

## 11. The agency's screens

Labels and number choices show only when the agency has 2+ numbers. A one-number agency sees no change.
- **Inbox list:**
  - Each chat shows its number's label.
  - A Number filter sits beside Stage, Period and Tag, kept in the tab like them.
  - The chip counts stay for all numbers, as they do with a tag (lead's call).
- **Chat header:** the chat's number's label. When the customer has a chat on another number that the member may see,
  a link "Also on Sales 2" (owner 3).
- **Reply box, by the chat's own number:**
  - Paused: today's paused note.
  - Disconnected: "This number was disconnected", with Start a chat, which opens the lead's chat by section 5's rule:
    the number they last wrote to, else the main one (owner 9).
- **Inbox banner:** names each number that is paused or in trouble.
- **WhatsApp settings:** the list of numbers (label, number, status, Main) replaces the one number, and the templates
  section gets the number picker.
- **New broadcast:** the number choice, and the preview's "on another number".
- **Lead page:** the WhatsApp section and button open the chat by section 5's rule. The other chat is linked from its
  header.
- **AI agent page and chat AI card:** section 8.
- **Assignment settings:** section 9.
- **Public trip page:** "WhatsApp us" goes to the main number, or the agency's contact phone when no number is
  connected, as today. Call keeps the contact phone.

**The contracts change:**
- `inbox.status` gains `numbers: [{ id, label, displayNumber, status, main, aiAnswers }]`: every number the agency has
  had, live ones first. Its `connectionStatus` and `number` go.
- List items gain `connectionId`.
- The header gains `number: { id, label, status }` and `otherChats: [{ id, label }]`.

## 12. Background jobs

The per-agency jobs walk organizations, not routes. A new `routedOrganizationsPage` (each organization with a route,
once) feeds `runDueWork`, `runSalesDueWork`, `runAiNudges` and `adoptAll`. The per-number jobs keep walking routes: the
health check, and the template sync, which now syncs that route's own number.

## 13. Migration and backfill (owner 10)

```sql
ALTER TABLE whatsapp_connection
  ADD COLUMN label text NOT NULL DEFAULT 'WhatsApp',
  ADD COLUMN is_main boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_answers boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT whatsapp_connection_label_length CHECK (char_length(label) BETWEEN 1 AND 20);
-- The old index allowed one live number per agency: this flags exactly one main number each.
UPDATE whatsapp_connection SET is_main = true WHERE status <> 'disconnected';
DROP INDEX whatsapp_connection_live;
CREATE UNIQUE INDEX whatsapp_connection_main ON whatsapp_connection (organization_id)
  WHERE is_main AND status <> 'disconnected';
CREATE UNIQUE INDEX whatsapp_connection_live_number ON whatsapp_connection (organization_id, integrated_number)
  WHERE status <> 'disconnected';
ALTER TABLE assignment_rule ADD COLUMN whatsapp_connection_id uuid,
  ADD CONSTRAINT assignment_rule_whatsapp_connection_fkey FOREIGN KEY (organization_id, whatsapp_connection_id)
    REFERENCES whatsapp_connection (organization_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

- **Nothing changes for existing agencies:** their number is main, labelled "WhatsApp" (shown nowhere while it's the
  only one), and its AI switch is on, so the AI answers as the agency's switch says.
- **Safe to apply before the code deploys.** It only adds, plus one index swap; the old console still refuses a second
  number in code.
- **Undoing it** brings back the old index, which works only while every agency has one live number.

## 14. Out of scope

- Per-number permissions or inboxes (owner 5).
- Per-number AI settings beyond on and off: the name, prompt, trips and limits stay the agency's (owner 6).
- Moving or merging chats between numbers, and the AI reading the customer's other chat.
- A per-number assignment pool, or per-number turns.
- Copying a template from one number to another: staff write it on each, or set it up in MSG91.
- A "WhatsApp us" link on the quote page and the confirmed trip page (`/p/<token>`): they have none today (section 17).
- Per-number send budgets, reports by number (the console's usage stays per number), and disconnecting numbers on a
  downgrade.
- The lead's AI insight and write-up keep reading the person's most recent chat.

## 15. Risks

1. **A send from the wrong number.** This is the one that matters: a customer gets a message from a number they've
   never seen, a reply to Sales 2's chat leaves from Sales 1, or a payment reminder starts a new thread on the main
   number while the customer talks on Sales 2. Where it could come from:
   - a path still asking for "the agency's number";
   - the customer rule choosing the wrong chat;
   - a template of one number queued in another number's chat.

   What guards against it:
   - the worker sends only from the row's chat's number;
   - every path goes through `sendFrom`, and `liveConnection()` is deleted so no other way compiles;
   - `assertTemplateAllowed` already refuses another number's template;
   - every send path in section 6 has a test with two numbers that proves which number it used: the chat it wrote in
     and the number the in-memory MSG91 saw. The expected number is never the one a `findFirst` would pick by
     accident;
   - one journey sends a reply in a second number's chat through the real api and worker.
2. **A number without the automation templates.** Its customers' reminders and follow-ups are skipped
   (`TEMPLATE_NOT_ON_NUMBER`), and booking reminders become a task to remind by hand, as a missing template does today.
   The skip reason shows on the booking's reminders. Before an agency's second number goes live, its templates are set
   up and approved (the owner's note).
3. **Per-agency jobs run twice**, so a scheduled message or a nudge is looked at twice. The client tokens already stop a
   double send; the jobs walk organizations once (section 12).
4. **The main number disconnected.** The main falls to the oldest live number. With none left, outside sends are
   refused `not_connected`, as with no number today.
5. **The AI answering on a number staff meant to keep human:** the number's switch, shown on the AI agent page and in
   the chat's AI card.
6. **Two threads with one customer** confuse staff. The header links the other chat, the lead page opens the one they
   last wrote in, and the list labels each.
7. **Two numbers recorded at once past the plan's limit:** the subscription's lock (section 10).
8. **Caps:** each number's day and month caps now count only that number, so an agency with two numbers may send up to
   twice what one number's caps allow. These are our fair-use caps per number, set by super admins.

## 16. The lead's calls, for the owner to check

The owner approved all of these on 2026-11-23.

1. The number's AI switch is ANDed with the agency's and starts on.
2. When the main number is disconnected, the oldest live number becomes main by itself.
3. The first number recorded (not connected) is the main one.
4. Labels: default "WhatsApp", 20 characters at most, not unique, and platform staff can rename them.
5. "Last chatted on" is where the customer last wrote, not where we last sent.
6. A paused number holds its customers' outside sends; they don't move to the main number.
7. An automatic message uses the same-named template on the sending number, and is skipped (never sent from another
   number) when that number lacks it. The settings' pickers list the main number's templates.
8. A broadcast goes from its template's number, to that number's chats only. Staff send one per number to reach all.
9. The template caps count per number; the tier-limit pause and the 60-a-minute budget stay agency-wide.
10. The AI reads only the chat it answers.
11. The setup checklist's WhatsApp step is done with at least one number connected.
12. The assignment condition and every label or number choice show only with 2+ numbers.
13. The inbox's chip counts stay for all numbers; the Number filter narrows the list only.
14. A plan downgrade disconnects nothing.
15. A disconnected number's chat offers Start a chat by the same rule as the lead page.
16. The public trip page's "WhatsApp us" falls back to the contact phone when no number is connected.

## 17. Where the code makes a decision hard

- **"WhatsApp us" on trip pages and quotes (owner 2).** Only the public trip page (`package-view.tsx`) has a WhatsApp
  button, and it uses the agency profile's contact phone. The quote page and the confirmed trip page at `/p/<token>`
  have no WhatsApp link, only a call link. The owner decided (2026-11-23) that all three get one: the trip page's button
  points at the main number, and the quote page and the confirmed trip page gain a "WhatsApp us" link to the main
  number beside their call link (Task 13).
- **Templates belong to one number,** so automatic messages and broadcasts can't simply "use the number": each number
  needs its own approved copy, matched by name and language (rule 4, section 7).
