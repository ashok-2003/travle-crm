# Bookings revamp: lists you can search, a booking you can work from

Owner-led, 2026-11-27 (web revamp). Reviewed together on DadhichTrips' live bookings. Decisions are the owner's unless
marked "(my call)"; the owner approved the proposal ("yes") and the money move ("yes").

## Why

On a live agency the Bookings list is a narrow table with no search, no filter beyond status chips, no export and no
way to add a booking; it is sorted by when the booking was made, not when the trip leaves. A booking's page leads with the
customer's name, keeps the trip's date only inside its title (so a trip that ended on 13 Nov still reads Confirmed, an
advance due 2 Nov reads "To pay" instead of overdue, and the balance falls due after the trip), counts 1 traveller for a
"2 travellers" trip, shows three payment proofs but no recorded payment (recording one is a link away on the quote page,
and costs and profit live only there), makes "Upload a file" the loudest button, and leaves every traveller's details
for the customer to type, though the lead already has their name and phone.

Facts the design rests on (code, 2026-11-27):
- A booking copies the quote's `startDate` once, when it is made, and nothing changes it after. It drives completion,
  the default balance day, the details cut-off, the details and reporting reminders, the trip page and Today.
- Overdue exists only on the quote page (worked out in the web) and in the dashboard's money summary.
- Travellers are plain rows with no tie to the lead's person; their count at creation is the quote's adults + children.
- Recording, voiding, receipts, invoices and costs are on the quote page; the booking page shows money read-only.
- `bookings.list` is a cursor list (status, claims pending) with no search or total; `quotes.list` is the newest 200 with
  a search. Only Leads has numbered pages with a total (`TablePagination`), and only leads and staff have exports.
- There is no one-step "make a booking": staff go quote → send → accept → confirm.

## Decided

### 1. One table for the lists (Bookings and Quotes now, the other lists later)

- The registry Table, server-side: search, filters, sort and numbered pages run in the api, with a total. The Leads
  list's numbered pages (`TablePagination`, filters and page in the URL, the search's text in the tab, never the URL)
  are the template; the AiGuru admin table (`~/work/AiGuru/hospitals-learning-and-development/apps/frontend/components/admin/foundation/data-table.tsx`)
  is the look the owner wants.
- Above the table, right: the search box, **Export CSV**, **Filters**. Applied filters show as chips that remove
  themselves. The status chips stay above it (my call: the filter used most, one tap).
- The table: sortable headers, status and payment pills in the app's colours, the whole row opens the record, the header
  stays while the rows scroll inside the table, the full width of the page.
- Under it: "Showing 1–25 of 132", rows per page (25, 50, 100), and page arrows.
- A phone keeps stacked rows (as every list), with the search, Filters and Export above them.
- **Bookings columns:** booking (customer and number), trip (title, departure), travel date, people, status, total,
  paid and to pay (red when a payment is overdue), travellers' details ("1 of 2"), salesperson.
  - Search: customer's name, phone digits, trip title, booking number.
  - Filters: status, travel dates (from–to), salesperson, payment (paid in full, part paid, nothing received, overdue),
    payment to check.
  - Sorted by travel date, soonest first, trips without a date last (my call: staff think in trips); any header sorts.
- **Quotes columns:** customer, trip, travel date, status (with "Waiting for payment" / "Hold expired"), total, last
  change, salesperson. Search as today; filters: status, travel dates, salesperson, balance due.
- **Export CSV** (and Excel, as the leads export offers): the current filters, every row they match, made in the
  background and downloaded when ready, exactly as the leads export works (new export kinds `bookings` and `quotes`).

### 2. New booking (on the Bookings list)

- A **New booking** button opens the same centred popup as New quote: choose the lead (newest first, search, or make a
  new lead), then the trip (a package, with its departure for a group trip, or a custom trip with its title and travel
  date), the people (adults, children), and the price (the package's price, or a total), then **Create booking**.
- It makes the quote and books it in one step, confirmed, with the agency's default payment plan, and opens the booking.
  Behind it, it is still a quote (PDF, receipts, invoices keep working) and the same booking every other path makes.
- No payment is taken in the dialog (my call: Record payment is the first thing the booking's page offers).

### 3. A booking's page

- **Header:** the trip's name big (the title font); under it in ink, the travel date with its weekday, the people, the
  customer as a link to the lead, the booking number; the status pill; the departure link for a group trip.
- **Actions in one row**, as on the quote page: the WhatsApp icon button (send the trip link), Trip link with Copy, and a
  "⋯" menu with Cancel booking. Blue only for the page's one main action; everything else outline.
- **Needs you** (amber, only when something waits): a payment overdue (Record payment), payments the customer says they
  made or proofs to check (Check), travellers' details missing (Fill in), the travel date missing (Add the travel date),
  the booking waiting to be confirmed (Confirm). Each line one tap to its action.
- **Travel date:** the booking keeps its own travel date. Staff set or change it (an audited change that moves the end
  date, the details cut-off and the reminders with it). A booking without one says so in Needs you.
- **Money, all of it here** (owner: "yes"): the paid bar; each payment due with its pill (Paid, Due 25 Nov, Overdue in
  red); **Record payment**, void, receipts and the invoice; change payments due; customers' claims (Confirm / Reject);
  the proofs from the chat as small picture tiles (my call: each tile loads its existing signed link; no new preview
  service); the refund after a cancellation; then **Costs and profit** for whoever keeps the accounts.
- **The quote page of a booked quote** keeps the trip, price and plan, and in place of its money says "This quote is
  booking BK-2026-0001. Its payments are on the booking." with a link. A sent quote still records a payment (which books
  it), as today.
- **Travellers** (below): pre-filled (section 4); the "what each traveller fills in" choice and the count move into the
  card's ⋯ menu (my call: they are settings, not the work).
- **Trip** (essentials, stays, trip PDF, tickets and files) and **Reminders** and **Feedback** keep their content in the
  new look. "Upload a file" becomes an outline button.
- **"They agreed to trip updates"** moves into the Reminders card's ⋯ menu behind a confirmation that says staff are
  recording the traveller's agreement (my call: it records consent on the customer's behalf; it stays audited).
- Numbers font only on amounts and numbers, never on a sentence ("0 of 1 complete").

### 4. Travellers pre-filled from the lead

- When a booking is made (every path: accepted quote, the AI, New booking, a payment on a sent quote), traveller 1 takes
  the lead's person's name and phone.
- Each pre-filled field sits on a subtle primary (blue) background, like a browser's autofill, on the booking page and on
  the customer's trip page, until a person saves that traveller (staff or the traveller): saving means someone looked
  (my call). WhatsApp names are often not real names, so the highlight says "check me".
- The other travellers and fields (birth date, ID) stay empty to fill.
- Bookings made before this change keep their rows as they are (my call: no backfill of customer data).

### 5. Rules the builder must not guess (my calls, from the builder check)

- **New booking** takes the path a payment on a sent quote takes today: the quote ends **accepted**, the booking is made
  by `createBookingFromQuote` and confirmed with the default schedule in the same transaction, audited as each step is
  today, and the `quote.accepted` listener must not make a second booking. On a departure it counts seats as every
  confirmed booking does, and a full departure refuses (the departure's own rule and words).
- **Travel date:** a booking on a departure follows its departure and is not edited on the booking (change the departure
  instead). Otherwise staff set or change it on the booking: the end date moves by the trip's length, the reminders not
  yet sent are rebuilt (sent ones stay sent), and the payments due stay as they are (staff change them with "Change
  payments due"). The quote page and the quote's PDF keep the date the quote was sent with.
- **Overdue** is one rule in the domain, the money summary's: an unpaid payment due whose day is before the agency's
  today (due today is not yet overdue). A customer's unchecked claim does not count as paid; "nothing received" means no
  recorded payment. The api sends each payment due's state (paid, due, overdue) to the list, its filter, the booking page
  and the quote page; the web stops working it out itself.
- **Money procedures stay the quote's** (`quotes.recordPayment`, `voidPayment`, `issueReceipt`, `issueInvoice`,
  `finance.*` costs): the booking page calls them with the booking's quote. Permissions, plan modules and audit entries
  do not change.
- **Pre-fill:** the lead's one person; a person without a phone gives the name alone. One flag per traveller row (the
  fields that were pre-filled); any save of that traveller by a person clears its highlight.
- **Exports** follow the leads export: the list's own view permission and scope, `lifecycle: "export"`, a fresh session,
  the table's columns plus the customer's phone (as the leads file has), the same 24-hour sweep and erasure.
- **Scope:** search, count, total and export all respect the member's own-or-all view; the salesperson filter shows
  only to members who see all.
- **Order:** every sort ends on the id, so pages are stable; a count per request is fine at an agency's size (Leads does
  the same).

## Not in this change

The other lists (Leads already has pages; Packages, Departures, Payments to check, Suppliers next). A payment taken
inside New booking. Thumbnails made by a preview service. Moving a departure's date for all its bookings.

## Approaches considered

- Lists: (chosen) server-side search, filters and pages with a total, like Leads; rejected: TanStack in the browser over
  the newest N (breaks past N rows, and the export would disagree with the screen).
- New booking: (chosen) one api call that makes the quote and the booking in the same transaction; rejected: chaining
  the existing calls from the browser (four requests, and a half-made booking when one fails).
- Money: (chosen) the booking page holds it and the quote page points there; rejected: both pages keep it (two places to
  record the same payment).
