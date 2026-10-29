# Release 5 design: Calling and the daily rhythm (2026-10-29)

Built on main 4df309b1+. Scope: `docs/superpowers/specs/2026-10-16-phase-1-product-scope.md` 3.3, 3.4, 3.5, 4.4. No AI,
no recording, no phone provider (scope 3.4, section 8).

## 1. Intent

"I open a lead, tap Call, talk, and write one line about how it went. The lead remembers the call and my next
follow-up. In the morning my phone tells me '8 things today, 2 overdue'. Today also shows customers who opened the
quote and went quiet, and payments about to fall due. My owner keeps one set of messages with the blanks filled in."

## 2. Features

### 2.1 Call panel (lead page)

- A `CallPanel` on the lead page (and the Call button on a Today item opens it): the number as `formatPhoneNumber`,
  `CopyButton`, a `tel:` link, **Send to my phone**, and a QR code. Reuses `contact-buttons.tsx` and the existing
  `QrCode` (`account/qr-code.tsx`, uqr, no new dependency).
- The QR holds `tel:+91...`. It is drawn in the browser only; the number never leaves the page. Works on any phone, signed
  in or not.
- **Send to my phone** calls `calls.sendToMyPhone({ leadId })`: one `notify(tx, actor, ...)` to the signed-in person,
  kind `call.dial`, title "Call {name}", link `/call/<leadId>`. The push opens that page in the app; it shows the
  name, the number, and one big **Call now** button (`tel:`), and fires `tel:` on its own where the browser allows
  (Android). iPhone is the one extra tap, as the scope says. The page checks the lead is in the person's scope.
- No push device registered: the button is disabled with a hint ("Turn on notifications on your phone first") linking
  to the existing `push-on-this-device` settings. The push respects the person's own opt-outs, except this kind is
  shown as "Calls you send to your phone" in `kinds.ts` and defaults on. It is rate limited per person (10 a minute).
- On a phone, Call opens the dialler directly. When the person comes back (page visible again within 30 minutes of
  the tap), a `CallNoteDialog` opens: "How did the call go?". Stored per tab in `tab-storage.ts`, never in a URL.
- Calling does not need a plan module of its own: it is `core`/`leads` (below). Read-only subscription: the panel
  still shows the number and dial buttons (viewing); logging the note is a change (`useWriteAccess("change")`).

### 2.2 Call note and call log

- `CallNoteDialog` (`FormDialog`): **Outcome** (`ChoiceField`: Spoke, No answer, Busy or call later, Wrong number),
  **Note** (typed, up to 2000 chars, optional), **Next follow-up** (`DueField`, optional, same control as adding a
  follow-up) and the lead's stage change is not offered here (one thing at a time).
- Saving writes a call row, adds a `call` entry to the lead timeline (a lead event with `recordType: "lead_call"`,
  like notes), and, when a next follow-up is given, creates it through the tasks module (`follow-up-added` event
  appears as usual). All in one transaction, `recordAudit` with the outcome only; the note text is never copied into
  the audit log or an event (as notes, R28).
- The timeline shows: outcome `StatusDot`, the note, who, when (`formatDayTime`). A "Calls" count appears in the lead's
  header facts. Newest first, paged by the existing timeline.
- Logging a call counts as contact: it marks the lead contacted (the existing `mark-contacted` rule) when the outcome
  is Spoke. No answer does not.
- Edge cases: a lead the person can't see refuses (404 as elsewhere); a blocked contact shows no call panel; an
  erased person's calls are removed by the customer erasure step; the note can be edited or deleted by its author
  within 24 hours (soft delete, ADR 0004), then only by a holder of `leads:assign`. Not `leads:edit`: every salesperson holds that, so it would let any rep rewrite anyone's call after a day.

### 2.3 Message library (blanks)

- Reuse **quick replies** as the one library. They already hold `{name} {destination} {month} {agent}` and are
  owner/admin managed (`inbox:templates`). Add `{amount}` (the lead's latest live quote: next unpaid instalment, else
  total, `formatMoney`) and `{link}` (the quote's share link, created on use through `createShareLink`).
- Filling moves into one shared function `fillBlanks(text, facts)` in the domain, used by the inbox ("/" picker) and
  by the new **Messages** button on the lead page (copy the filled text, or open WhatsApp with it where the chat
  exists). The inbox browser-side fill is replaced by the same function through a `leads.messagePreview` query so the
  two cannot disagree (no second copy of a helper).
- A blank with no value (no quote yet) stays visible and highlighted for the person to type; Send is refused while a
  `{...}` remains. Unknown blanks are refused when the owner saves the message.
- Trip kits stay as they are (itinerary, files, auto-send). The library screen links to them; not merged.
- Owner screen: the existing quick-reply section, renamed "Message library", gains a blanks cheat sheet (`InfoHint`)
  and a live preview with a made-up customer. No personal templates (scope 3.5).

### 2.4 Morning push

- Each person: **Morning summary** on/off and a time (default 09:00, in the agency's zone), in their notification
  settings next to the push-on-this-device toggle.
- A worker schedule `today.morning-push` runs every 15 minutes (`*/15`), for each organization finds members whose
  time fell in the last window and who have not had today's. It reuses `todaySummary` counts: "8 things today, 2
  overdue" (overdue + due today + new leads waiting + the two new Today sections). Nothing to do: no push. Link: `/today`.
- Sent with `notify()`, kind `today.morning`, push only (a bell entry is added too, since `notify` always writes it;
  expires with the day's read). Dedupe by a per-person `last_sent_on` date, written in the same transaction; `notify`
  gets a `sourceEventId` of a UUID v5 over (user, day) so a retry adds nothing.
- Only for active members who hold a push device and are not away (`awayUntil` ignored: away people still see their
  count). Counts only; no names or numbers in the push (job data holds ids only).

### 2.5 Today gains two sections

- **Quote opened, no reply** (scope 4.4): leads whose quote was opened (`LeadSignal`, staff views already excluded)
  more than 24 hours ago, with no customer reply or note/call/quote change since, owned by the person. Item shows the
  quote, opens count, "opened 2 days ago". Actions: Call, WhatsApp, Done (= snooze 1 day, writes a `LeadSignal`
  dismissal so it does not return).
- **Payment due**: instalments of accepted quotes on leads the person owns, due within the agency's reminder days
  (`SalesAutomation` setting) or already missed, not covered by `coveredInstallments`. Item shows the customer, amount
  (`formatMoney`) and due day (`formatCalendarDay`); actions Call, WhatsApp.
- Both are plain queries in `domain/today`, calling down into `quotes`/`sales` through their `index.ts` (today sits
  above them). The summary gains `counts.quoteOpened` and `counts.paymentsDue`; `TodaySectionName` gains
  `"quote-opened"` and `"payments-due"`. Sections follow the existing cursor/`useCursorPages` shape. Order:
  overdue, payments due, new leads, quote opened, due today. `today-nudge.tsx` shows the top item as before.
- The morning count includes both.

## 3. Data (additive migration)

- `lead_call` (org table): `id` uuid v7, `organization_id`, `lead_id`, `outcome` (CHECK in four values), `note text`,
  `occurred_at timestamptz`, `created_by`, `created_at`, `deleted_at`, `deleted_by`. FK `(organization_id, lead_id)` to
  the lead, `organization_id` to `organization` RESTRICT/RESTRICT. `@@unique([organizationId, id])`. Index
  `(organization_id, lead_id, occurred_at desc)`. In `softDeleteModels`. `SELECT app_enable_org_rls('lead_call')`, a
  fixture in `packages/db/test/org-table-fixtures/crm.ts`. `lead_event.kind` CHECK gains `call` (new migration alters
  the constraint).
- `morning_push_setting` (org table): `organization_id`, `user_id`, `enabled bool default true`, `local_time text`
  (CHECK `HH:MM`, 15-minute steps), `last_sent_on date null`. PK `(organization_id, user_id)`; RLS and fixture.
- `lead_signal`: add `dismissed_at timestamptz null` for the quote-opened "Done".
- Erasure: `platform/erase-customer.ts` deletes the person's calls; `deleteOrganizationRows` reads the catalog (both
  tables purge with the organization); a member's erasure removes their morning setting.
- Events: `lead.call-logged` (ids only). No listener needed yet.
- No quick-reply table change: blanks are text.

## 4. Permissions and plan modules

- Seeing the panel / sending to my phone: `leads:view` (scoped); logging a call note: `leads:edit`; editing within 24h
  by the author, after that `leads:assign` (a manager), not `leads:edit`, which every salesperson holds. Plan module `leads` (core).
- Message library read: `inbox:view`/`leads:view` (everyone who may reply); manage: `inbox:templates` (existing). The
  lead-page Messages button needs `leads:view` and works without the WhatsApp module (it copies text); the WhatsApp
  open needs `inbox:reply` and the inbox plan module.
- Today sections: `leads:view`, `quotes:view` (scoped by `scopeFilter()`). Morning setting: `protectedProcedure` (about
  themselves). `calls.sendToMyPhone`: `orgProcedure.requires("leads:view")`, lifecycle `always`.
- Contracts: `z.strictObject` inputs, output schemas, new `DomainError` reasons in `errors.json`, audit actions in
  `audit.json`, notification kinds `call.dial` and `today.morning` in `kinds.ts` and `notifications.json`.

## 5. Out of scope

Call recording, transcripts, AI notes and the after-call review screen (AI release); cloud telephony, call duration
or missed-call capture; WhatsApp calling; a manager's call report (Reports later); departures and travellers on Today
(later release); personal templates; creating Meta templates; email morning summary.

## 6. Decisions already made

- Scope 3.4: no provider; panel shows number + Copy, Send to my phone (Android opens the dialler, iPhone one more
  tap), QR dials too; phone with no PC: Call opens the dialler and "How did the call go?" shows on return.
- Scope 3.5: "One shared library, managed by the owner, with blanks filled in automatically ({name}, {destination},
  {link}, {amount}). No personal templates."
- Scope 3.3: "A morning push with the plain count ('8 things today, 2 overdue') at a time each person picks; staff can
  switch it off." Quotes opened but unanswered for a day, and payments due soon, are Today queries.
- Scope 4.4: "Opened but no reply after a day: a task in Today." Section 2 and ADR 0029: counts and reminders are plain code.
- Status.md: quick replies and trip kits exist but no single library with blanks.

## 7. OWNER QUESTIONS

1. **Morning push default.** Options: (a) on for everyone at 9:00, each person can change or switch off;
   (b) off until each person turns it on. Recommend (a): it is the habit-builder, and it only ever sends a count.
2. **After a "No answer" call.** Options: (a) only log it; (b) pre-fill the next follow-up for 2 hours later, which the
   person can clear; (c) create it automatically. Recommend (b): fast, yet nothing is created without a look.
3. **What "payment due" on Today covers.** Options: (a) instalments due within the agency's reminder days or missed;
   (b) only due today or missed; (c) a separate setting "show N days ahead". Recommend (a): it matches the customer
   reminders already sent, so staff and customers hear about the same payments.

## OWNER ANSWERS (2026-10-29)
The owner accepted every recommendation in OWNER QUESTIONS above. Build to those recommended options.
