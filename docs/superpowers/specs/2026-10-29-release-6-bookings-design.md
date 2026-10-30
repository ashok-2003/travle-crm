# Release 6 design: Bookings and the trip (2026-10-29)

Built on main 4df309b1+. Scope sections: 4.6, 5.1-5.4, 5.6-5.8 of `2026-10-16-phase-1-product-scope.md`. Group departures
(5.5), rooming and empty seats (5.9), suppliers and package pages are release 7.

## 1. Intent

Today an accepted quote is the booking. The agency gets a real booking: it confirms the request, collects money with a
traveller who says "I've paid" and a staff check, gives the traveller one trip page with vouchers and a PDF, collects each
traveller's details, reminds them before departure, asks for feedback, and cancels with a refund worked out from the
agency's policy. Nothing the agency does today (quotes, payments, receipts, /finance, reports) changes meaning.

## 2. Features

### 2.1 The booking, and how today's accepted quotes carry over
- A `booking` is one accepted quote. It is created by a listener on `quote.accepted` (quotes publishes it, in the accepting
  transaction, `publishEvent`), so `bookings` stays above `quotes` in the layering. Unique on `(organization_id, quote_id)`,
  so a repeat event adds nothing. The booking number is `BK-<year>-<0001>` from the organization's counter.
- Status: Requested (traveller accepted, agent has not confirmed) -> Confirmed -> Completed (a nightly job, the day after the
  end date); Cancelled from Requested or Confirmed. A payment recorded by staff on a sent quote accepts it today
  (`recordPayment`), so that path creates the booking already Confirmed. Voiding that first payment reverts the quote
  (existing code); the booking is then soft-deleted with it.
- **Requested** puts a task "Confirm booking" on the lead owner (Today) and a notification. "Confirm" is one tap; the page
  then shows the advance payment. If the quote has no instalments, Confirm offers the agency's default schedule (advance %
  and balance days before departure from `booking_settings`) and creates `QuoteInstallment` rows. Staff can edit them.
- **Carry-over (migration backfill, additive):** one booking per quote with `status = 'accepted'` and `deleted_at IS NULL`,
  status Confirmed (Completed if the end date is past), `start_date` copied from the quote, number from the counter in
  `accepted_at` order, travellers none, policy snapshot null. No task, notification or reminder is created for them
  (Owner Q4). Money stays where it is: **`QuotePayment`, `QuoteInstallment`, `TripCost`, receipts and invoices keep
  pointing at the quote.** The booking reads them through its `quote_id`. So `/finance`, reports and the pilot's receipts
  are unchanged. The only finance edit: `listBookings` and the report queries join `booking` and skip Cancelled (below).
- The Bookings screen (`bookings:view`) lists bookings with status chips (Requested, Confirmed, Cancelled, Completed), the
  paid/balance, "3 of 4 details". The booking detail has Payments, Travellers, Trip page (stays, driver, vouchers), Reminders,
  Timeline. Lead page gets a link. Timeline events (existing lead timeline) for each step below.

### 2.2 "I've paid" and the Check payment task
- On the public page (`/p/<token>`, quote or trip) each payment due has "I've paid": amount (prefilled with what is due),
  UPI reference, optional screenshot (image, 5 MB, uploaded straight to storage through a presigned upload that the token
  scopes to this booking; `createFiles`, record type `payment_claim`). Rate-limited like every public route.
- Creates a `payment_claim` (Pending) and one task "Check payment of ₹X" on the lead owner (record type `payment_claim`),
  due now, plus `notify()`. The traveller sees "Payment being verified".
- Staff (`quotes:record_payments`, `freshProcedure`) see the claim with the screenshot and reference. **Confirm** calls the
  existing `recordPayment` with `requestId = claim id`, method `upi`, so a double tap records once; sets the claim Confirmed,
  completes the task, and the traveller sees "Received". They may change the amount first. **Reject** needs a reason code
  (not found, wrong amount, other), completes the task, and the page says "We couldn't match this payment, please contact
  <agent>" with Talk to <agent>. The traveller can claim again. No automatic bank matching (ruled out).
- A pending claim older than a day re-raises the task's due time and shows red in Today (existing overdue behaviour).

### 2.3 The trip page
- The same share link. `share-link-resolvers.ts` resolves the quote token; if the quote has a Confirmed booking the page is
  the trip page, else the quote page. After Request feedback it also shows the feedback form (2.8). Cancelled shows a
  plain notice and the cancellation terms. Staff can switch the link off as today.
- Sections, in this order on a phone: status and next payment ("Pay now" with UPI, existing `payLink`, plus bank details
  from settings); the plan with times; hotels (name, address, map link, check-in/out); vouchers and tickets; payments
  (schedule, paid, due, receipts, "I've paid"); travellers' details (2.5); driver or guide, reporting time and place, and
  the emergency contact; packing list; cancellation terms (policy snapshot in plain words); "Download trip PDF".
- Never shows ID numbers or ID photos back, only "Details received". No margins or costs.
- Written for offline: the PDF is the offline copy; the page itself stays server-rendered without organization data.

### 2.4 Vouchers and the itinerary PDF
- Staff fill **Trip essentials** on the booking: stays (`booking_stay`), reporting time and place, driver or guide name and
  phone, emergency contact (default from `booking_settings`).
- **Voucher**: per stay, "Issue voucher" calls `issueDocument` (template `voucher`: booking number, traveller names, hotel,
  dates, room/meal notes, agency contact). Numbered `DOC-...`, frozen, rendered once by the worker (`documents.render-pdf`).
  Changing a stay shows "Voucher is out of date, issue again"; the old one stays in the list. The page shows the latest.
- **Itinerary PDF** (`itinerary` template): plan, stays with addresses, essentials, payment summary without costs, vouchers
  listed. "Prepare trip PDF" is a staff button; it goes stale on any change to the plan or essentials ("out of date") and
  the traveller downloads the latest issued one. Never automatic: each issue takes a document number.
- Tickets and other files staff upload are attachments on the booking (`AttachmentsPanel`, record type `booking_voucher`,
  not sensitive) and appear on the trip page.
- Supplier-facing vouchers are parked (section 8); these are for the traveller.

### 2.5 Travellers' own details
- `booking_traveller`: one row per head (adults + children from the quote), created when the booking is. Anyone with the link
  can fill any row (name as on ID, date of birth, gender, phone). A **level** per booking: Basic (name, DOB), Detailed (plus
  emergency contact, medical notes), International (plus passport number, issue/expiry, nationality). Default from
  `booking_settings`; staff change per booking; release 7's package sets it. Required fields follow the level.
- ID numbers live in `booking_traveller_identity`, apart from the plain row, readable only with `documents:view_sensitive`.
  ID photo upload is optional (`createFiles`, record type `booking_traveller`, **sensitive = true**) and downloadable only
  with that permission. The page shows "Details received ✓", never the values.
- Editable until the cut-off (`booking_settings.details_cutoff_days`, default 3 days before departure); then locked except
  for staff. Progress on the booking and list: "3 of 4 complete". Booking edits to traveller count add/remove empty rows.
- Today: bookings departing in the next 14 days with incomplete travellers show as one line each with the count. The release
  that does "Today's extras" owns the layout; this adds a source.

### 2.6 Cancellation policies (spec 4.6)
- Agency default only in this release: `cancellation_policy_rule` rows (`days_before_min`, `charge_basis_points`, e.g.
  30+ days 10%, 15-29 days 25%, 0-14 days 100%) plus free-text notes in `booking_settings` ("flight tickets non-refundable").
  Settings screen (`settings:manage`) edits it; a rule table with no gaps is validated (first rule starts at 0, no overlaps).
- Shown in plain words on the quote page (before accept, "I agree to the terms and cancellation policy" already stores the
  accepted terms) and the trip page. At booking creation the policy is **snapshotted** into `booking.policy_snapshot`, so a
  later policy edit never changes an accepted booking. Backfilled bookings have none and use the default when cancelled.

### 2.7 Reminders
- Three kinds, plain code, no AI: **balance due** (before each unpaid instalment's due date, default 3 days and on the day),
  **details and packing list** (default 10 days before departure, only while details are incomplete), **reporting** (the day
  before, 6 pm, with time, place and driver). Days are agency settings.
- `booking_reminder` rows are made when the booking is Confirmed and rebuilt (unsent rows only) when dates, instalments or
  essentials change. Unique `(organization_id, booking_id, kind, instalment_id)`. A minute job sends what is due, through
  the WhatsApp port with the approved utility template the agency mapped for that kind, params filled by code, each with the
  trip link. Safe to repeat: the row is claimed before sending and the message keyed by the row id.
- Sent only with the traveller's "Send me trip updates on WhatsApp" consent (kept at Accept; this release widens the consent
  ledger's purpose list with `trip_updates`, source `quote_accept`; staff can record it for staff-made bookings). Without
  consent or a mapped template, the row becomes a task "Remind <name> by hand" instead. Never email.
- Staff see each reminder on the booking and timeline (sent, skipped, by hand) and can pause a booking (`reminders_paused_at`).
  Paid-up instalments and cancelled bookings skip theirs.

### 2.8 Feedback
- "Request feedback" (staff button, once; manual by rule). Sends the trip link by WhatsApp (template if outside 24 hours,
  otherwise free text); the trip page then shows the form: overall stars, hotel, transport, guide ratings, comment, up to 5
  photos (`booking_feedback`, attachments non-sensitive), and "Can we share your review and photos?".
- 1-3 stars notifies the lead owner and every member holding `bookings:edit` with all-records scope, immediately
  (`notify()` keyed on the feedback id). The Google review link (`booking_settings.google_review_url`) is shown to
  everyone after the private feedback. Approval to show reviews on package pages and rating reports are release 7.

### 2.9 Cancellations and refunds
- "Cancel booking" (`bookings:edit`, `freshProcedure`): reason, cancellation date (today). Code computes days before departure,
  picks the rule, shows: paid so far, cancellation charge, refund due. **Charge** = rule basis points of the trip total
  including GST (Owner Q2); staff can override the charge with a required reason (audited: before, after, reason).
  Refund due = max(0, paid - charge). Paid beyond that is the agency's to keep, never negative.
- Booking becomes Cancelled; unsent reminders skipped; open tasks for the booking cancelled; the trip link shows the
  cancellation notice. If a refund is due, `booking_refund` (Due) is made with a task "Refund ₹X" for the lead owner.
- "Mark refunded" (`quotes:record_payments`): date, method, reference; the refund is paid outside the product. No credit
  notes. **Finance**: refunds are their own rows, never negative payments, so existing payment sums stay right. A cancelled
  booking's revenue is its retained charge (before GST); cash collected is payments minus refunds. Reports use these.
- Travellers do not cancel from the page; they ask the agent.

## 3. Data (one additive migration; all organization tables)
Every table: `organization_id` default from `app.org_id`, `ON DELETE/UPDATE RESTRICT` to `organization`, composite FKs
`(organization_id, x_id)`, unique constraints include `organization_id`, `SELECT app_enable_org_rls('<table>')`, a fixture in
`packages/db/test/org-table-fixtures/bookings.ts` (`appendOnly` for `payment_claim` history is not needed; rows update).
- `booking`: id, quote_id (unique per org), lead_id, number (unique per org), status (CHECK), start_date, end_date, level
  (basic|detailed|international), reporting_time/place, driver_name/phone, emergency_name/phone, policy_snapshot jsonb,
  cancelled_at/by/reason, charge_paise, reminders_paused_at, feedback_requested_at, trip_pdf_document_id (-> issued_document),
  created/updated, deleted_at/by (soft delete; listed in `softDeleteModels`, unique among live rows on quote_id).
- `booking_stay` (booking_id, name, address, map_url, check_in, check_out, notes, voucher_document_id, position).
- `booking_traveller` (booking_id, position, name, date_of_birth, gender, phone, emergency, medical_notes, complete_at,
  deleted_at); `booking_traveller_identity` (traveller_id unique, kind, number, issued_on, expires_on, nationality).
- `payment_claim` (booking_id, installment_id?, amount_paise BigInt, reference, screenshot_file_id?, status
  pending|confirmed|rejected, reject_reason, payment_id?, decided_by/at, task_id?).
- `booking_refund` (booking_id, amount_paise, status due|refunded, refunded_on, method, reference, recorded_by).
- `booking_reminder` (booking_id, kind, installment_id?, send_at, status scheduled|sent|by_hand|skipped, message_id?, sent_at).
- `booking_feedback` (booking_id unique, overall, hotel, transport, guide ints 1-5 CHECK, comment, may_share bool).
- `cancellation_policy_rule` (days_before_min, charge_basis_points 0-10000; unique org+days_before_min).
- `booking_settings` (one row per org, like `quote_settings`): defaults for schedule, cut-off, level, reminder days and the
  three template ids, packing list, emergency contact, cancellation notes, google_review_url.
- Widen `person_consent_purpose_value` and `_source_value` CHECKs. New permissions/plan rows need no table.
- **Erasure**: `platform/erasure.ts` step for a customer: traveller rows, identity numbers, ID photos, claim references and
  screenshots, feedback comments and photos, refund references; names on voucher PDFs follow issued-document rules. Org purge
  reads the catalog; storage files go through the existing deletion sweep. Job data and audit hold ids only.
- Events: `booking.created`, `booking.confirmed`, `booking.cancelled`, `payment-claim.submitted`, `feedback.submitted`
  (ids only); audit actions and `errors.json`/`audit.json` sentences for each; notification kinds in `kinds.ts`.

## 4. Permissions and plan modules
Existing `bookings:view|create|edit` (scoped view via `scopeFilter`) and the `bookings` plan module (already in the plans).
Confirming payments and refunds: `quotes:record_payments`. Sensitive fields and photos: `documents:view_sensitive`.
Settings and policy: `settings:manage`. Cancel and money procedures use `freshProcedure`. Public procedures take the share
token, are `z.strictObject`, rate-limited, never return sensitive values. No new permission; `departures:*` untouched.

## 5. Out of scope
Group departures and waitlists; rooming lists; package-level policies, traveller levels and reminder plans; supplier
vouchers; supplier dues; review approval on package pages and rating reports; credit notes; split payments; automatic
receipts; automatic feedback; bank matching; email reminders; traveller self-cancel; reading IDs by AI.

## 6. Decisions already made
- Quote stands in as the booking until now (owner, 2026-10-28); this release adds the separate object.
- 5.2: "I've paid" with reference or screenshot; staff get a Check payment task and confirm in one tap; traveller sees
  "Payment being verified" then "Received". Money never passes through us. Receipts are never automatic.
- 5.3: the quote's link becomes the trip page then the feedback page; sensitive details never shown back.
- 5.4: one row per traveller, anyone with the link fills any row, locked at a cut-off, "3 of 4 complete", missing in Today.
- 5.6: plain scheduled WhatsApp utility templates, with consent, pausable, staff remind by hand otherwise, no email.
- 5.7: staff-triggered feedback; 1-3 stars alert the manager; Google link shown to everyone.
- 5.8: policy works out the refund, staff change it with a logged reason, paid outside the product, no credit notes,
  travellers cancel through the agent. 4.6: default plus notes (package override arrives with package pages).
- Section 8 ruled out: credit notes, automatic receipts and feedback, email backup, split payments, bank matching.

## 7. OWNER QUESTIONS
1. Who gets the "Check payment" task and the 1-3 star alert? (a) the lead's owner only; (b) the lead's owner plus anyone with
   `quotes:record_payments` / `bookings:edit` all-records (managers). Recommend (b) for the star alert, (a) for Check payment
   with a bell to managers after a day unconfirmed.
2. What is the cancellation charge a percentage of? (a) the trip total including GST; (b) the amount paid so far; (c) the total
   before GST. Recommend (a): it is what the traveller agreed to pay and what the policy table reads like.
3. Default reminder timing (agency can change): (a) balance 3 days before and on the due day, details 10 days before,
   reporting the day before at 6 pm; (b) balance 7 and 1 days before, details 14 days, reporting 2 days and the day before.
   Recommend (a), fewer messages.
4. The pilot's existing accepted quotes become bookings: (a) all Confirmed with no tasks (nothing changes for them);
   (b) future trips with no payment yet become Requested and raise "Confirm booking" tasks. Recommend (a), then the agency
   closes the quiet ones by hand.

## OWNER ANSWERS (2026-10-29)
The owner accepted every recommendation in OWNER QUESTIONS above. Build to those recommended options.
