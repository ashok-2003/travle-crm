# Phase 1 product scope: what the business modules must do

- **Status:** approved by the product owner, 2026-10-16
- **For:** the specs and plans of Phase 1 build steps 2-7 (spec section 1). Each step still gets its own spec, plan
  and build; this document is their product input.
- **With:** ADR 0028 (data rules for the business modules) and ADR 0029 (AI features, small models, OpenRouter).
- **Source:** feature deep dives with the owner on 15-16 October 2026. Where this document and the Foundation spec
  differ, this document is newer (AI is no longer parked: Q10).

## 1. Scope at a glance

- **Step 2, CRM + WhatsApp inbox:** leads from everywhere (leads arriving by themselves, from the agency's Google
  Sheet and from Meta lead ads, are the product's main selling point), assignment rules, Today's work list,
  calling from the PC with a recorded or spoken note, message templates, AI form filling, WhatsApp leads that fill
  themselves in.
- **Step 3, catalog + quotes:** itinerary templates, package pages, the live quote page, "quote opened" alerts,
  margins, cancellation policies, AI itinerary drafts, suppliers' rate sheets read by AI.
- **Step 4, bookings + departures:** booking requests, payment schedules, paying by UPI, one trip page, travellers'
  own details, reminders, group departures, feedback, refunds, rooming lists, empty seats.
- **Step 5, suppliers + partner portal:** the supplier records that rate sheets attach to. The rest of step 5 hasn't
  been discussed yet.
- **Step 6, accounts & GST:** what the agency owes suppliers; payments move here from bookings (Q5); the agency's GST
  method.
- **Step 7, reports:** bookings by source, with spend per source.

**Phase 2** (not now): staff performance, repeat-customer features (the person record itself is Phase 1), "ask your
reports in plain words".

**Delivery:** Phase 1 ships as small releases, each usable by the pilot on its own. Nothing that waits on someone else
goes first. The order the owner agreed with the development lead:

1. Leads by hand.
2. Leads from the agency's Google Sheet (one way, into the product), plus bulk CSV and Excel upload.
3. The website form, and the link for other tools.
4. Automatic assignment.
5. Calling without AI, message templates, the morning push.
6. Meta lead ads, then WhatsApp, as Meta approves us. The pilot can use lead ads as a tester during Meta's app review.
7. Quotes, bookings and the rest of steps 3-7.
8. The AI features, last of all.

The WhatsApp inbox comes in a later release (3.8).

## 2. Rules that cover every feature

- **AI only where language is involved** (ADR 0029). Prices, tax, dates, counts, reminders, assignment and the
  cheaper option for an over-budget draft are plain code.
- **AI drafts; people decide.** AI never sends to a customer, sets a price, computes tax, records money or changes a
  booking's status. Every proposal is shown before it applies (before, after, the excerpt it came from), AI-filled
  fields are tinted violet with their source a tap away, and the audit log records "drafted by AI, approved by …".
- **AI providers keep no data**, reached through OpenRouter; models are configuration with fallbacks. AI is a plan
  module (plans are data), with usage recorded per organization.
- **WhatsApp:** agencies connect their number through Meta's coexistence, so they keep the WhatsApp Business app on
  their phone (broadcast lists switch off and group chats don't sync). Meta-approved templates are made in Meta's own
  tools in Phase 1; the product uses the approved ones. Free-form messages only inside the 24-hour window.
- **Consent is recorded per person:** marketing consent with how it was given, and "Send me trip updates on WhatsApp"
  ticked at Accept.
- **Mobile first.** Home is a short nudge of the few most important things, never a cluttered list.
- **Scale:** every list and chart works for an agency with 500+ staff (counts, top 10s, search, paging; ADR 0028).

## 3. Step 2: CRM + WhatsApp inbox

### 3.1 Leads from everywhere

Every enquiry lands in one list within seconds, with its source and an owner.

- Sources in Phase 1:
  - **the agency's Google Sheet, one way**: leads the agency collects in a sheet (usually from Google Forms) arrive by
    themselves; staff work them in the product and nothing is written back to the sheet. The release's spec
    (`2026-10-19-sheets-sync-design.md`) settles how the sheet is connected and how duplicates are kept out;
  - **Meta lead ads** (Facebook and Instagram), directly. Meta notifies us of each new lead, and a regular re-check
    catches any notification that never came (they stop silently when an access token expires);
  - WhatsApp;
  - a website form (a snippet for the agency's own site, plus a hosted link);
  - package-page enquiries (step 3);
  - quick add (by hand, by voice, or by pasting text or a screenshot);
  - bulk upload of a CSV or Excel file;
  - a secure link per agency that other tools can post leads to (Pabbly Connect, Zapier, Make).
- Leads that arrive by themselves (the Google Sheet and Meta lead ads) are the product's main selling point, on top of
  adding leads by hand.
- Not in Phase 1: leads from phone calls, email and lead portals, Instagram DMs. Instagram messages still arrive two
  ways: a pasted DM screenshot, and the Instagram bio pointing at the agency's package pages.
- **One person, many enquiries.** A person is one record per agency, matched by phone number (+91 international
  format), with email and Instagram handle as extra matches. Each trip enquiry is its own lead.
- **A repeat enquiry** from someone with an open lead goes on that lead's timeline and its owner is told. With no
  open lead, a new lead is marked "Returning customer".
- Each lead keeps its **first source** with details (which package page, campaign or tool), and later contacts go on
  its timeline.
- A "Not a lead" button and spam blocking keep junk out of reports.
- **Stages are one fixed set** for every agency, so reports compare: New → Contacted → Quote sent → Booking requested
  → Won, plus Lost and Not a lead. "Returning customer" is a marker, not a stage; there are no lost reasons.
- Fields that came up: destination, travel dates or month, adults, children with their ages, budget, departure city,
  trip type, hotel category, preferences (food such as veg or Jain, room type), source and its details, owner,
  first-reply time, marketing consent. The step 2 spec settles the details with the owner.
- **One WhatsApp number per agency.**

### 3.2 Lead assignment rules

- By default every new lead goes to the agency's owner, who can switch on automatic assignment: taking turns among
  the sales pool, skipping anyone marked away, optionally fewest open leads first.
- The owner can set rules by destination, trip type or source ("Kashmir & Ladakh → Priya").
- Order: a returning customer goes to their previous owner (if still on staff), then the owner's rules, then
  automatic assignment if on, otherwise the owner. Nobody available: an "Unassigned" queue for managers.
- No reply within the time limit (a setting; about 15 minutes of working time suggested): the manager is alerted. No
  automatic reassignment.
- Staff can mark themselves away; the agency sets working hours. Reassignment needs a permission and is logged.

### 3.3 Today's work list

- Plain queries:
  - overdue items;
  - new leads with no reply;
  - quotes opened but not answered for a day;
  - follow-ups due;
  - payments due soon;
  - departures and pickups;
  - travellers with missing details.
- Actions on each item: Call, WhatsApp, Done, Snooze; unfinished items roll over.
- Staff add their own tasks, linked to a lead or booking, with a due time.
- A morning push with the plain count ("8 things today, 2 overdue") at a time each person picks; staff can switch it
  off.
- Managers see the team: charts first, then a person's detail. It must work for 500+ staff.

### 3.4 Calling customers (no phone provider)

No cloud telephony in Phase 1; agencies won't pay for it.

- On the PC, the lead's Call panel shows the number (with Copy), **Send to my phone** and a QR code:
  - **Send to my phone** pushes a notification to the staff member's phone that dials there: on Android it opens the
    dialler, on iPhone one more tap;
  - scanning the QR code with the phone dials too.
- During the call the PC offers **Record** (the phone on speaker, the PC's microphone records both sides; recording
  starts only when staff tap it) or, afterwards, **Tell us how it went** (a spoken or typed summary).
- The recording uploads in pieces as it goes, so a closed tab or a lost connection doesn't lose it.
- The AI proposes the lead's changes on a review screen: field by field, before and after, each with the excerpt it
  came from; untick or edit, then Apply. Nothing changes before that. The call goes on the timeline with its summary,
  transcript and audio.
- On a phone with no PC, tapping Call opens the dialler, and "How did the call go?" appears when staff come back to
  the app.
- Agencies tell customers that calls may be recorded (a line in their terms or first message).

### 3.5 Message templates

One shared library, managed by the owner, with blanks filled in automatically ({name}, {destination}, {link},
{amount}). No personal templates.

### 3.6 AI: filling forms by voice, text or screenshot

- The first release fills the three busiest forms: new lead, call or follow-up log, traveller details.
- Spoken languages: English, Hindi, Hinglish. Regional languages come once the speech provider is proven.
- The mic is tap to start, tap to stop. Recordings are kept for now so quality can be checked; how long to keep them
  is decided before general release.

### 3.7 AI: WhatsApp leads that arrive filled in, and the after-call note

- A new WhatsApp lead is filled from its opening messages, including voice notes and images, once the details look
  complete (destination, dates or month, travellers, budget). If they never complete, it fills what is there after a
  quiet spell and drafts a question asking for the rest.
- Only the opening messages are read; updating a lead as a chat goes on is later work.
- Filled fields are saved as **Suggested** (a violet tag). Lists and assignment rules can use them; one tap confirms.
- After a call (3.4) the AI proposes field updates, customer preferences (food such as veg or Jain, room type, hotel
  category), a follow-up with its real date shown in full, and a call note. "Apply all" starts with everything ticked.

### 3.8 The WhatsApp inbox (a later part of Phase 1)

Reading and replying to chats inside the product is not in the first part of Phase 1; the owner will settle it with
the development agent. Already decided for when it comes:

- Who sees a conversation follows its lead: salespeople their own, managers and owners all (the own/all scope).
- Replies sent from the phone app reach the product as Meta's message echoes, so a 1:1 thread is complete.
  WhatsApp for Windows isn't mirrored, and group chats never sync.
- Open: whether to import the up to 180 days of chat history an agency can share when it connects (asked for within
  24 hours of connecting, once only), and whether to create people or leads from it.
- Messages sent from the product are charged at Meta's rates; those sent from the phone app stay free.

## 4. Step 3: Catalog + quotes

### 4.1 Itinerary templates

The day-by-day plan, linked catalog items, hotel options by category (3★, 4★, 5★, offered on the live quote page),
inclusions, exclusions and terms. Priced when a quote is made, from the catalog's rates for those dates; never a fixed
price. "Save as template" from any quote.

### 4.2 Package pages

- A public page per package: photos, highlights, the plan, inclusions, terms, the agency's branding, good link
  previews. Its address is under our domain with the agency's name (…/yatra-hikes/kedarnath-yatra); agencies' own
  domains stay parked.
- Its "Enquire" form makes a lead whose source is the package page.
- The price shows as "From ₹X per person" or "Price on enquiry", the agency's choice per package.
- An "all packages" page per agency, searchable by destination: a mini website and the Instagram bio link.
- Fixed departure dates are listed (section 5.5) with no seat counts.
- **Open:** whether a package page is built from an itinerary template or written separately. To be asked of the
  pilot agency; a middle way is a page that starts from a template, keeps its own marketing text, and takes the plan
  and prices from the template.

### 4.3 The live quote page

- A link instead of a PDF:
  - the trip summary and the day-by-day plan with photos;
  - hotel options the traveller picks, with the price updating;
  - the price per person and in total, with GST, never itemised costs or markups;
  - inclusions, exclusions, cancellation and refund terms;
  - "Talk to <agent>" (WhatsApp and Call);
  - the agency's branding.
- The link always shows the latest version (no version history); it is hard to guess and staff can switch it off
  (the Foundation's share links). A PDF download is offered.
- **Accept**: the traveller ticks "I agree to the terms and cancellation policy" (the exact terms and time are kept)
  and "Send me trip updates on WhatsApp", which sends a booking request. The agent is alerted, checks availability and
  confirms; the page then shows the advance payment (5.2).
- A sent quote keeps the prices it was sent with. When rates change, staff see "Rates have changed since this was
  sent" and may reprice.

### 4.4 "Quote opened" alerts

- Each view is recorded: count, time, minutes on the page, which hotel option, whether the price was reached. Full
  detail shows on the lead's timeline; a PDF download counts as an open.
- Link-preview robots (WhatsApp and Facebook fetch links to build previews) and staff's own views are ignored.
- Alerts on the first open and once more when it turns hot (e.g. 3 opens in 24 hours), through `notify()`; a Hot badge
  moves the lead up. Opened but no reply after a day: a task in Today.

### 4.5 Margins

- Each quote line has cost, markup and selling price. The agency picks its GST method once (on the whole package or
  on the service fee), because the margin depends on it.
- Anyone building a quote sees its costs and margin. Agency-wide money views (revenue and margin in reports, payment
  overviews, supplier dues) are limited to the roles the owner chooses.
- Below the owner's minimum margin (a % or ₹ per person): a clear warning; the quote can still be sent.

### 4.6 Cancellation policies

A table of charges by days before departure (an agency default each package can change), plus free-text notes
("flight tickets non-refundable"). Shown in plain words on the quote and trip pages.

### 4.7 AI: itinerary drafts, changes by talking, the write-up

- A draft starts from the agency's closest template and adapts it to the lead, using only the agency's catalog with
  realistic travel times. Gaps are marked "needs a supplier rate"; prices are never invented.
- Plain code prices it. When it is over budget, plain logic offers a cheaper option beside it (a lower hotel
  category, one night fewer).
- Changes by talking ("hotel near Mall Road, drop the Solang day") show as before and after on the quote lines, with
  Apply and Undo.
- The write-up (day descriptions, inclusions, exclusions) follows the writing style the agency picked once (warm and
  friendly, premium, or short and simple): English, with Hindi on request.

### 4.8 AI: suppliers' new-season rate sheets

- A PDF, Excel file or photo, uploaded on the supplier's page, is read into a review table. For hotels that's room
  type, meal plan (EP, CP, MAP, AP), season dates and occupancy (single, double, extra bed, child with or without
  bed); for transporters, vehicle and route.
- Each row shows where it came from in the sheet and how it differs from current rates; rows the AI is unsure of are
  flagged.
- "Approve all" once the flagged rows are checked; nothing enters the catalog unapproved. Rates apply to stays in
  their dates, and seasons can't overlap (ADR 0028).

## 5. Step 4: Bookings + departures

### 5.1 Booking requests

Accept on a quote (4.3) or Join on a departure (5.5) creates a booking request; the agent confirms it.

### 5.2 Payments: schedules and UPI

- Each booking gets a schedule: an advance (a % or ₹) and the balance due a set number of days before departure,
  from an agency default each booking can change.
- **Money never passes through us.** The agency enters its UPI ID once; each payment shows a UPI QR code with the
  amount and booking number filled in (a standard UPI payment link; an uploaded QR image is the fallback), plus the
  agency's bank details for NEFT/RTGS with the booking number as the reference.
- The traveller taps "I've paid" with the UPI reference or a screenshot. Staff get a "Check payment" task and confirm
  against their bank app in one tap; the traveller sees "Payment being verified", then "Received".
- Staff can also record payments themselves. Due and overdue payments show in Today and in an overdue report.
- A "Send receipt" button issues a numbered receipt PDF; receipts are not automatic.

### 5.3 One trip page

- The quote's link becomes the trip page after confirmation, and the feedback page after the trip: one link for the
  whole journey.
- It shows:
  - the booking's status and the plan with times;
  - hotels with addresses and map links;
  - vouchers and tickets staff upload;
  - payments (schedule, paid, due, pay buttons, receipts);
  - the travellers' details form;
  - the driver or guide and the agency's emergency contact;
  - the packing list and the cancellation terms.
- Sensitive details (ID numbers, ID photos) are never shown back on it: only "Details received ✓". Staff see them in
  the app behind `documents:view_sensitive`.
- "Download trip PDF" (plan, vouchers, hotel addresses, contacts) for places with no signal.

### 5.4 Travellers fill in their own details

- One row per traveller on the booking; whoever has the link can fill any row. Co-travellers are names on the booking
  only, not people records.
- The agency picks the required fields per package (medical notes and an emergency contact for treks, passport
  details for international trips, names and dates of birth for simple trips). An ID photo upload is optional and
  stored as a sensitive file.
- Editable until a cut-off the agency sets (e.g. 3 days before departure), then locked except for staff. Progress
  shows on the booking ("3 of 4 complete"); missing details show in Today.

### 5.5 Group departures

- Fixed batches are dates on the package page, not pages of their own. "Join this departure" (a date and the number
  of people) creates a booking request directly, with no quote.
- There is no seat stock in Phase 1; staff set each date's status by hand: Open, Filling fast, Full (join the
  waitlist; waitlist joins arrive as leads).

### 5.6 Reminders before departure

- Plain scheduled messages, each linking to the trip page: the balance due with the pay link; missing details and the
  packing list; the reporting time and place and the driver the day before.
- Sent automatically; staff see them on the booking's timeline and can pause them for a booking.
- WhatsApp only, through approved "utility" templates and the traveller's consent at Accept. Without either, staff
  remind by hand; there is no email fallback.
- The agency has a default plan; each package can change it (a trek adds a fitness reminder 30 days out).

### 5.7 Feedback and reviews

- Staff send it with "Request feedback" (not automatic). The trip link then shows the form: overall stars, ratings
  for the hotel, transport and guide, a comment, optional photos, and "Can we share your review and photos?".
- A rating of 1-3 stars alerts the manager straight away.
- The Google review link is shown to everyone after the private feedback. Showing it only to happy travellers breaks
  Google's review policy.
- Reviews and photos travellers agreed to share appear on package pages once staff approve them. Average ratings by
  package, hotel, driver and guide go to reports.

### 5.8 Cancellations and refunds

The policy (4.6) works out the refund due; staff can change it with a reason, which is logged. The refund is paid
outside the product and marked Refunded. No credit notes. Travellers cancel through the agent, not the trip page.

### 5.9 AI: rooming lists and empty seats

- **Rooming list:** the AI reads travellers' requests from booking notes and their WhatsApp chats ("ground floor for
  my mother") into tagged requests. Plain logic builds each hotel's list: each booking's party stays together,
  requests are honoured, solo travellers on group trips are paired by gender. Staff adjust by drag and drop and export
  a PDF or Excel file for the hotel.
- **Empty seats:** on a date marked Open or Filling fast, staff tap "Find interested people". A plain query finds
  leads from the last 12 months who asked about the package or destination and didn't book. Messages go out either
  through an approved template whose blanks plain code fills (marketing consent needed), or as an AI-written personal
  message that staff send from their own WhatsApp. A daily template limit (agency setting, safe default) and a warning
  when the number's quality rating drops protect the agency's WhatsApp number.

## 6. Step 6: Accounts & GST

- What the agency owes each supplier, by when, comes from bookings' costs and lives here.
- Payments recorded on bookings (5.2) are taken over by accounts (open item Q5).

## 7. Step 7: Reports

**Bookings by source:**

- One row per source, broken down by package page, campaign or tool: leads, quotes sent, bookings, conversion,
  revenue, margin, average time from enquiry to booking. Filters: date range and staff member.
- Credit goes to the first source; returning customers get their own row.
- A monthly spend entry per source gives cost per lead, cost per booking and return on spend.
- Money columns only for roles with money access. Read from summary tables (ADR 0028).

## 8. Parked and ruled out

**Parked for later:**

- seat stock;
- vouchers sent to suppliers;
- a trip leader's view and cash expenses during a trip;
- teams and team permissions;
- phone-provider calling;
- phone-call, email and Instagram-DM lead sources;
- creating Meta templates inside the product;
- trip-anniversary reminders;
- AI that reads whole conversations: summaries, intent labels, follow-up nudges, upset-customer alerts, suggested
  replies;
- reading passports and IDs;
- matching supplier confirmations to bookings.

**Ruled out:**

- quote validity dates and versions;
- reasons for lost leads;
- campaigns to customer groups;
- referral codes;
- split payments;
- credit notes;
- "plan my next trip";
- a visa checklist;
- birthday and anniversary reminders;
- co-travellers as linked people;
- automatic receipts;
- automatic feedback requests;
- email backup for reminders;
- highlighting rate jumps;
- AI that transcribes customers' WhatsApp voice notes in the inbox (beyond a new lead's opening messages);
- translation;
- reading supplier invoices;
- bank matching;
- GST or TCS flags;
- an AI morning briefing;
- AI for setting up a new agency.

## 9. What the owner has to do (outside the code)

- Start Meta's paperwork now; it takes weeks.
  - Business verification and tech-provider registration (or a WhatsApp partner), Q7: WhatsApp leads, templates and
    reminders depend on them.
  - **App review for lead ads** (the `leads_retrieval` permission and the page permissions that go with it), with a
    screencast of the working flow: direct lead ads depend on it. The pilot can use lead ads as a tester while the
    review runs.
- Check Google's rules for reading and writing agencies' sheets. Apps that ask for access to people's spreadsheets can
  need Google's verification of the app; the Google Sheets release's spec chooses the permission and says whether it
  does.
- Set up the OpenRouter account with zero data retention enforced.
- Get the pilot agency's permission to use anonymised messages and calls for the AI test sets.
- Ask the pilot agency the package-page question (4.2).
- Add to our terms with agencies: calls may be recorded and processed, and unanswerable report questions (Phase 2)
  reach us with names removed.

## 10. Owner decisions 2026-10-28

Made on reviewing the quotes, finance, sales and AI work of 27 October (branch `release/quotes`). They win over sections 3
to 7 where they differ.

- **Quotes as built.** A quote has a day-by-day plan, priced lines, GST at 0, 5 or 18 % (CGST and SGST within the agency's
  state, IGST outside it, the place of supply chosen on the quote), inclusions, up to 12 payments due, options beside each
  other, a numbered quotation PDF and a link the customer opens, pays by UPI from and accepts on. A sent quote keeps its
  prices: it is changed by making a new version, a draft that replaces it, and the old link says so (spec 4.3).
- **An accepted quote IS the booking, for now.** There is no separate bookings object or screen yet; it comes later. The
  first payment recorded on a sent quote accepts it and wins its lead, and voiding that payment puts both back. Payments
  only record money: nothing confirms a UPI payment, and no one is paid through us. Recording and voiding payments, and
  issuing invoices and receipts, are the `quotes:record_payments` permission (Owner, Admin, Accounts). Finance (costs,
  running costs, profit) and the sales and collections reports (`money:view_reports`) are for whoever keeps the money.
- **Parked: automatic WhatsApp messages.** The new-lead greeting, the day 1, 3 and 7 follow-ups and the payment
  reminders are not built, and their tables are not in the database. They return only if the owner decides to bring them back,
  as one automation system built on the inbox's own listener.
- **Kept from sales execution.** Hot leads (a quote opened again, or a buying word in a chat; the owner is alerted with fixed
  words, never the customer's), lost reasons, broadcasts to lost or won leads, ready packages and quote options, reports
  and each staff member's performance.
- **AI, in two steps (decided later on 2026-10-28), off by default.** Step 1, in this release: Suggest reply (the AI drafts a
  reply in a chat for staff to read, change and send; it never sends by itself, and a reply sent from a draft is audited as
  drafted by AI, sent by the member); what the agency tells its AI to know (typed words, or a PDF's or text file's; deleting
  one deletes its file); and the AI's guess of how each lead will go (hot, warm or cold, a next step, a fake check), only for
  agencies with the AI on, shown as "AI's guess" in the AI's violet tint, at most once for each burst of the customer's
  messages, never moving a stage, erased with the customer. An agency has it when its plan includes the `ai` module and its
  Owner or Admin turns it on in Settings, AI; no AI for a suspended or cancelled agency; one monthly limit of AI calls per
  agency, shared by every feature; when the provider is down the person is told. Requests go through OpenRouter with zero data
  retention. Step 2, the next release: the autopilot (the AI answering chats by itself, never denying being an AI when
  sincerely asked), nudges, writing-style learning from the staff member's own messages only, and nightly learning, each
  erased with the customer, honouring STOP in every chat, marked and audited in the chat, and tried on a real number with the
  pilot agency first.
- **Home and sidebar: his layout in our style.** Home has the greeting with the date, New lead and Pipeline, the hot leads
  card first (Call buttons, reason pills), one key-figures strip (the dashboard's component: no icon per figure, an info
  hint on each, no red for a normal count) with only what Today doesn't show: chats waiting, hot leads, and money to come
  (only for whoever holds `money:view_reports`; without it two figures), "N things today", "This month so far" with Open
  reports (only with the money permission), then the setup steps. The sidebar keeps Sign out visible at the bottom with the
  name and a Your account link, and has Quotes, Reports and Finance (Reports and Finance only for the money permission)
  and the Today and Inbox counts. The dashboard's charts moved to Reports: the period chips, new leads by day, where they
  came from, where they are now, time to first reply, top destinations and the team table.

## 10. Accepted risks, 2026-10-29

The owner's decision on 2026-10-29 was to take Ayush's behaviour for the automatic WhatsApps and the per-chat voice, with the
safety fixes we kept (below). The risks are accepted for now and revisited after the pilot tests these features. What we kept
that Ayush did not have: the automatic messages are marked as automation, a lead's follow-ups switch is audited, a customer's
erasure takes the run and every touch and the AI's state and memory of their chats; the AI is off until an Owner or Admin
turns it on (autopilot and learning both default off), every AI call counts against the agency's monthly limit, no AI runs
for a plan without it or a subscription that is read-only, suspended or cancelled, every message the AI sends is marked and
audited, and the AI never replies to a chat whose customer wrote STOP or withdrew consent, a chat with no person linked too.
Where the list below says Ayush's own, it is as he built it.

later. We will record it right now." Each risk below is accepted for now and revisited after the pilot tests these
features.

1. **Automatic consent for every enquirer.** The "contact enquirers" setting records WhatsApp consent for every new lead
   (Meta ads, website, Google Sheets, Excel imports, including old contacts) and the automatic greeting, follow-ups and
   reminders message them.
   - **Risk:** people who never agreed report spam. Meta lowers the number's quality rating and can restrict or block
     it. All agencies send through one MSG91 account, so one agency's reports can affect others.
   - It records consent nobody gave (India's DPDP Act; WhatsApp Business policy asks for opt-in).
   - The owner's view: a lead who left their number wants to be contacted, and agencies normally do this.
2. **STOP, then writing again.** After a customer sends STOP, their consent is withdrawn. If they later write again
   (say "any update?"), the next payment reminder silently marks them as agreed again, and automatic messages resume.
   - **Risk:** writing again is not the same as opting back in to reminders and marketing.
   - The owner's view: this is right; a customer who writes again is open to contact.
3. **AI lead scoring on by default** (Ayush's setting) for every agency once the key is set. Every agency's customer
   chats go to Google Gemini. Gemini is called directly (not OpenRouter), so there is no zero-retention routing, and on
   the free tier Google may use prompts. Keep billing on for the Google project.
4. **Autopilot writes as a named staff member** ("a customer should not be able to tell"). It still says it is an AI
   assistant when sincerely asked.
5. **Writing-style learning.** A chat export sends both sides of a real chat (the customer's messages too) to the AI
   provider. Any inbox replier can upload one.
6. **Erasure gaps.** The agency voice (verbatim messages) and the nightly lessons are not erased when a customer asks
   to be deleted.
7. **AI cost.** There is no monthly cap per agency, only Ayush's per-chat daily cap and his per-minute nudge rate.
   Suspended or cancelled agencies still get AI.
8. **Prices from the AI.** "Quote prices only from the knowledge" is a prompt instruction. Nothing checks the reply's
   numbers before the autopilot sends it.
9. **The invite link** (recorded 2026-10-28). Anyone holding an invite link can get into that agency until the owner
   sets a password. The link doesn't expire. Two-factor is off.

**Background list** (fixed after the push, without changing what users see unless the owner agrees): erasure of voice,
lessons and cadence data; a monthly AI cap; the lifecycle check; the enrolment filter; the claimTouch race; audits;
retention of page_visit; the invite-link hardening; a WhatsApp opt-in question on Meta lead forms.

