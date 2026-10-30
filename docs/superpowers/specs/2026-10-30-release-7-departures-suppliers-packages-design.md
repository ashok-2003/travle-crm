# Release 7 design: Departures, suppliers and packages (2026-10-30)

Built on main 8f71ae3c (releases 5 and 6 in). Scope: 4.1, 4.2, 4.5, 5.5, 5.9 (rooming only), step 5/6 mentions of suppliers
in `2026-10-16-phase-1-product-scope.md`. AI rate sheets (4.8), empty-seat finder, AI itineraries and the partner portal stay out.

## 0. The split: 7a first, then 7b
- **7a "Departures and suppliers"**: group departures (seats, holds, waitlist, bookings against seats, rooming list, Today's
  "Departures"), supplier records with contacts, and supplier dues linked to `TripCost`. A group-tour agency can run a batch
  end to end with no public page. Nothing in 7a needs a rate or a template.
- **7b "Rates, packages and public pages"**: rate catalog by season, quote lines priced from it, the minimum-margin warning,
  tiered package templates, public package pages with enquiry. 7b needs 7a's suppliers (rates belong to a supplier) and
  its departures (the public page lists dates). Order is forced the other way round only if the pilot wants the website first.

## 1. Intent
"I run a Kedarnath batch on 3 Nov with 20 seats. I see how many are sold, held and free, hold seats for a lead for two days,
book people onto it, and send the hotel a rooming list. I know who I owe, how much and by when. I price a quote from last
season's hotel rates, get warned when the margin is thin, start a quote from my Standard or Deluxe package, and share one
page per package with a form that lands in my leads."

## 2. Features: 7a
### 2.1 Departures (`departures:*`)
- A **departure**: title (default from package/destination), destination (optional), start and end date, seats total, price per
  person (optional, `Money`), booking cut-off date (optional), status `open|closed|cancelled`, notes. Screen "Departures": list
  by date with chips Upcoming, Past, Cancelled; row: date, title, `sold + held / total`, status word. Create/edit in `FormDialog`.
- **Seats are computed, never stored counts:** sold = adults+children of live Requested/Confirmed bookings on it; held = active
  holds; free = total - sold - held. Showing status words: **Open**, **Filling fast** (free <= agency setting, default 20% of
  total), **Full** (free <= 0), **Closed** (staff). Staff seat counts are exact; the public page shows words only (7b).
- **Hold**: on the departure or a lead: lead, seats, expires at (default 48 h from `departure_settings`), note. Counts as held
  until it expires, is released, or turns into a booking. Creating a hold locks the departure row (`FOR UPDATE`) and refuses
  more than free (`DEPARTURE_FULL`). A job (every 10 min) expires holds, notifies and creates a task "Hold expired: <lead>"
  for the lead owner; a hold ending within 4 h shows red in Today.
- **Book against seats:** "Make quote" on a hold, or "Add to departure" on a draft quote, sets `quote.departure_id`; the
  quote's dates come from the departure. When the traveller accepts, release 6's listener copies `departure_id` onto the
  booking and converts that lead's active hold. The booking then counts as sold. A cancelled booking frees its seats on its own
  (it no longer counts). If a quote is accepted when the departure is full, acceptance still works (the traveller agreed), the
  departure shows **Overbooked by N** in red and the lead owner gets a task; staff never get a silent refusal.
- **Waitlist** (Full): staff add a lead with seats (`departure_waitlist`). When seats free (booking cancelled, hold released,
  seats raised), `notify()` goes to the first waitlisted lead's owner, once per event id. Public joins arrive in 7b as leads.
- Departure page tabs: Seats (sold bookings with travellers filled "3 of 4", holds, waitlist), Rooming, Costs (2.3), Timeline.
  Cancelling a departure needs a reason, lists bookings still on it, and does not cancel them (staff move or cancel each).
- Lead page shows "On departure <date>" beside the booking; booking page links back.

### 2.2 Rooming list (plain code; spec 5.9 without the AI)
- Travellers state requests on the trip page (release 6 form): new fields on `booking_traveller`: `room_request` (one of
  `none|single_room|ground_floor|near_group`) and `room_note` (free text, 200 chars). Staff can edit them. The words are the
  traveller's own; nothing is read from chats or notes in this release.
- A departure has **stays** (hotel name, optional supplier, check-in, check-out). Each stay has **rooms** (label, capacity 1-4,
  tag `ground_floor`) and **assignments** (traveller -> room, `locked` when staff placed it).
- **Draft rooms** (button on a stay): deletes unlocked assignments and refills: each booking's party stays together (rooms of the
  default capacity, 2 unless set); `single_room` gets a one-bed room; `ground_floor` goes to ground-floor rooms first; solo
  travellers on a group departure are paired only with the same gender (set on the traveller; unknown gender stays alone and is
  flagged "needs a roommate decision"). Whoever does not fit shows under **Unassigned**. Deterministic: same input, same result.
- Staff move a traveller with a "Move to room" select (44px, works on a phone; drag and drop is out, rule 3 "simpler"), which sets
  `locked`. **Copy to other stays** repeats a stay's layout. A room over capacity is refused.
- Export: **PDF** for the hotel via `issueDocument` (template `rooming_list`: hotel, dates, room, names, requests; numbered and
  frozen, rendered by the worker) and **CSV** (opens in Excel). Names only plus requests; no IDs, phones or money. Reissue when
  changed ("out of date"), as release 6 vouchers do.

### 2.3 Suppliers (`suppliers:*`) and what the agency owes
- A **supplier**: kind (`hotel|transport|guide|other`), name, destination/city, notes, GSTIN (optional), payment terms text, bank/UPI
  details (plain text, shown only with `suppliers:edit`). **Contacts** (name, role, phone, WhatsApp, email), many per supplier.
  Screen "Suppliers": search by name, filter by kind; the page lists contacts, linked costs, and (7b) rates.
- **Link to `TripCost`:** add nullable `trip_cost.supplier_id`. Add-cost dialog picks a supplier (`SearchCombobox`, with `Add
  "Hotel X"` creating one); `trip_cost.supplier` text stays as the name at the time, so nothing existing changes. The supplier page
  offers **Link N costs named like this one** (exact name match, case-insensitive, one tap, audited). No automatic backfill.
- **Group costs:** `trip_cost.quote_id` becomes nullable and `departure_id` is added, with `CHECK (num_nonnulls(quote_id,
  departure_id) = 1)` (Owner Q1). A departure cost (the hotel block, the bus) appears under the departure and in dues, not in any
  one booking's margin. The departure shows revenue (its bookings, before GST) minus its costs and per-booking costs.
- **Dues** ("Supplier dues", `accounts:view`, because the scope limits money views to chosen roles): unpaid, unvoided costs by
  supplier, with due date, overdue in red, total owed per supplier. "Mark paid" reuses `markTripCostPaid`. A daily job tasks the
  account keepers (holders of `accounts:edit`) for costs due in 2 days via `notify()`, keyed on the cost id. Today gets no money.
- Supplier delete is soft; a supplier with unpaid costs cannot be deleted. Merging duplicates: out of scope.

### 2.4 Today's "Departures" section
- Source in `departures` (called by `today`, which sits above): departures starting in the next 14 days, one line each: date, title,
  `sold/total`, and a short reason chip: holds ending soon, travellers' details incomplete, rooming not drafted (within 7 days),
  overbooked. Visible with `departures:view`. Added to `todaySectionNames` as `departures`; the morning push counts them.

## 3. Features: 7b
### 3.1 Rate catalog (`suppliers:edit`)
- On a supplier: **seasons** (label, start, end; no overlaps per supplier, an `EXCLUDE ... USING gist` on `daterange`, `btree_gist`
  is already trusted) and **rates** per season: item (room type or vehicle+route), meal plan (EP/CP/MAP/AP, hotels), occupancy
  (single/double/triple/extra bed/child with/without bed), unit (`per_room_night|per_person_night|per_day|per_trip`), cost in paise
  (what the supplier charges the agency). Table editing in a plain screen; "Copy season to next year, add X%" is plain code. No
  import in this release (the AI sheet reader is release 12).
- A date with no season is "no rate", never a guess.

### 3.2 Pricing quote lines from rates, and the margin warning
- A quote line gets optional `costUnitPaise` and `rateId` (additive keys in the `items` JSON; the schema stays `z.strictObject`).
  "Price from rate" in the quote editor: pick supplier and rate, the quote's start date must fall in a season (else "No rate for
  these dates"), quantity is entered, and the line's cost is **copied** (a snapshot; later rate edits never change a quote).
  Selling unit price = cost + the agency's default markup (`quote_settings.default_markup_basis_points`, default 0 meaning staff
  type it), editable. Money in paise; markup rounds to whole rupees up.
- **Minimum margin** (`settings:manage`): `quote_settings.min_margin_basis_points` and/or `min_margin_per_person_paise`. Margin =
  (subtotal before GST - sum of line costs) / subtotal, over a quote whose lines all have costs; with some lines unpriced it says
  "margin known for 3 of 5 lines" and warns only on what is known. Below the minimum: a warning at the top of the editor and in
  the Send dialog, with "Send anyway" (the quote can still be sent). Staff without `money:view_margin` see the sentence "Below the
  agency's minimum margin, check with your manager" and no figures; `costUnitPaise` is stripped from their reads. The audit entry
  for `quote.sent` records `belowMinimumMargin: true`.

### 3.3 Package templates (reuse `QuoteTemplate`; "packages" in the UI)
- Add to `quote_template`: `slug`, `destination_id`, `nights`, `summary`, `highlights` (JSON list of short lines), `price_display`
  (`from|on_enquiry`), `from_price_paise`, `published`, `default_traveller_level` (release 6's booking level), and
  `cancellation_notes` (release 6 said package overrides arrive here; the rule table stays agency-wide).
- **Tiers** (`quote_template_tier`: Standard, Deluxe...). A tier's lines are template lines with `rateId` and a `quantityRule`
  (`fixed|per_traveller|per_night|per_room_night`, rooms = ceil(travellers / 2)) or a fixed price. Existing templates keep working:
  their `items` are the implicit single tier.
- **Make a quote from a package**: pick tiers and the start date; each chosen tier becomes an option of the quote (the existing
  options mechanism). Lines are priced from the season covering the date. A line without a rate becomes a `needs a rate` line at
  zero; **a quote with such a line cannot be sent** until it is priced (prices are never invented). "Save as template" works as now.
- "From ₹X": staff-entered `from_price_paise`; a "Calculate from the catalog" helper prices the cheapest tier for 2 adults in the
  next season and fills the field for staff to accept. Never refreshed automatically.

### 3.4 Public package pages and enquiry
- Under the agency's link (Owner Q2): `/a/<agency>/<slug>` and `/a/<agency>`. Per package: photos (up to 6, served through the same
  system link the logo uses; `AttachmentsPanel`, non-sensitive), highlights, the day plan, inclusions, exclusions, cancellation
  notes, upcoming departures (date and a status word, never seat counts), "From ₹X per person" or "Price on enquiry", agency name,
  logo, colour, phone/WhatsApp from the profile, good link previews (`generateMetadata`, og image = first photo). The **all packages**
  page lists published packages, filter by destination chips and a search box held in the tab only, never in the URL (CLAUDE.md).
- Server-rendered public content is allowed here (it is marketing data the agency chose to publish, nothing private); the service
  worker does not cache these pages. The data comes from a public, rate-limited route `/api/public/packages/...` that returns only
  published fields, `Cache-Control: s-maxage=60`. A package off or unpublished returns a plain "not available" page, 404 status.
- Publishing is outward-facing: a package needs a name, slug (unique per organization, lower-case, live rows), summary and one photo;
  `settings:manage` switches the agency's pages on (`public_page_settings.enabled`, off by default) and publishes a package.
- **Enquire** form reuses the website form's pieces (Turnstile, limits, consent line, duplicate handling): name, phone (required),
  email, travel month or a chosen departure, number of travellers, message. It creates a lead through the same domain function the
  website form uses, `source = "package_page"` (widens `lead_source_value`), the destination from the package, and a first note
  "Enquired about <package>". Assignment rules and the slow-reply alert apply as for any new lead. `lead_enquiry` gets
  `package_id` and `departure_id`.
- **Join this departure** is the same form with the date fixed and a seat count; on a Full date the button reads "Join the
  waitlist". Both create a lead and a task, then staff hold seats or make a quote in one tap. This differs from scope 5.5, which says
  it creates a booking request without a quote: release 6's booking needs a quote, so a nameless one would be junk.

## 4. Data (additive migrations: `*_departures_suppliers`, then `*_rates_packages`)
All organization tables: `organization_id` default from `app.org_id`, `ON DELETE/UPDATE RESTRICT` to `organization`, composite FKs
including `organization_id`, uniques include `organization_id`, `SELECT app_enable_org_rls(...)`, a fixture in
`packages/db/test/org-table-fixtures/departures.ts`, `suppliers.ts` (`appendOnly` where the runtime role cannot update).
**7a**
- `departure` (title, destination_id?, start_date, end_date, seats_total CHECK >= 0, price_paise?, cutoff_on?, status CHECK, notes,
  cancelled_reason, created/updated, soft delete; unique live `(organization_id, id)`).
- `departure_hold` (departure_id, lead_id, seats CHECK > 0, expires_at, status `active|released|expired|converted`, booking_id?, note,
  created_by). `departure_waitlist` (departure_id, lead_id, seats, created_at; unique per org+departure+lead).
- `departure_stay`, `departure_room`, `departure_room_assignment` (traveller_id unique per stay, locked bool).
- `departure_settings` (one row per org: hold hours, filling-fast percent, default room capacity).
- `supplier` (kind CHECK, name, city, gstin, payment_terms, payment_details, notes, soft delete; unique live name), `supplier_contact`.
- Columns: `quote.departure_id`, `booking.departure_id` (composite FK to departure), `trip_cost.supplier_id`, `trip_cost.departure_id`
  and `quote_id` nullable with the CHECK above (finance queries that join the quote already skip rows with no quote), and
  `booking_traveller.room_request`, `room_note`. Indexes on `(organization_id, departure_id)`.
- **Erasure**: customer erasure (`platform/erasure.ts`) clears `room_note` and removes the person's assignments, holds and waitlist
  rows by lead; PDFs follow issued-document rules. Suppliers and contacts are business data: the org purge reads the catalog. Job
  and event data hold ids only.
- Events: `departure.hold-expired`, `departure.seats-freed`, `departure.overbooked`, `supplier-cost.due-soon`; audit actions and
  sentences in `audit.json`, errors in `errors.json` (`DEPARTURE_FULL`, `SEAT_HOLD_EXPIRED`, `ROOM_FULL`, `SUPPLIER_HAS_UNPAID`).
**7b**
- `supplier_rate_season` (supplier_id, label, starts_on, ends_on, EXCLUDE overlap per supplier), `supplier_rate` (season_id, item,
  meal_plan?, occupancy?, unit CHECK, cost_paise BigInt, note).
- `quote_template` columns above, `quote_template_tier`, `quote_template_photo` (attachments, no table needed beyond files).
- `quote_settings` columns `default_markup_basis_points`, `min_margin_basis_points?`, `min_margin_per_person_paise?`.
- `public_page_settings` (enabled, about text, Instagram url https only); `lead_enquiry.package_id/departure_id`; widen
  `lead_source_value`.

## 5. Permissions and plan modules
Existing, none new: `departures:view|create|edit` and plan module `departures`; `suppliers:view|create|edit` and `suppliers`;
dues `accounts:view|edit` (module `accounts`); costs and margins `money:view_margin`; packages and tiers `quotes:create|edit` (module
`catalog` for the screens, `quotes` for making quotes); pages on/off, publishing, minimum margin `settings:manage`. Departure bookings
still need `bookings:*`. Money procedures use `freshProcedure`. Public routes: share-style rate limits, `z.strictObject` inputs.
Starter roles: the sales role gets `departures:view|create`, `suppliers:view`; accounts gets dues; check `starter-roles.ts`.

## 6. Out of scope
Per-hotel optimal room mixes, drag and drop, reading requests from chats (AI), AI rate sheets, empty-seat finder, per-person seat
selection (bus seat maps), partial supplier payments, supplier vouchers, partner portal, supplier merge, custom domains or slugs,
online payment on public pages, instalment plans per departure, review display on package pages, itinerary PDFs from templates.

## 7. Decisions already made
- 4.1: "Priced when a quote is made, from the catalog's rates for those dates; never a fixed price. 'Save as template' from any quote."
- 4.2: public page per package, "Enquire" makes a lead with the page as source, "From ₹X" or "Price on enquiry" per package, an "all
  packages" page searchable by destination, fixed dates listed "with no seat counts"; the template-versus-separate question has the
  middle answer (starts from a template, own marketing text, plan and prices from the template), built here.
- 4.5: below the minimum margin "a clear warning; the quote can still be sent"; supplier dues limited to chosen roles.
- 5.5: statuses Open, Filling fast, Full (join the waitlist, joins arrive as leads). The lead's brief for this release (seats,
  holds, bookings against seats) overrides the scope's "no seat stock"; status words are derived from seats, staff can still close.
- 5.9: rooming "each booking's party stays together, requests are honoured, solo travellers paired by gender"; PDF and Excel export.
- Release 6: package overrides for traveller level and cancellation notes arrive with packages; Today owns its sections.
- Owner, 2026-10-29: accepted release 6's recommendations (nothing carried over raises tasks).

## 8. OWNER QUESTIONS
1. Group costs: the hotel block or bus for a whole departure is paid once. (a) cost lines stay on one booking only, the agency splits by
   hand; (b) a cost can belong to a departure, shown in dues and in the departure's profit; (c) as (b) plus automatic split per seat.
   Recommend (b): that is how a batch is bought, and (c) invents allocation rules.
2. Public address: (a) `/a/<sign-in code>/<package>`, e.g. `veeper.in/a/sharma/kedarnath-yatra`, ready for every agency today; (b) the
   agency picks its own name once (`/yatra-hikes/...`), unique across all agencies, needs a platform-wide uniqueness check and a
   settings step. Recommend (a) now, (b) later as it only changes the prefix.
3. Hold length: (a) 48 hours for everyone, an agency setting (staff set shorter per hold); (b) no default, staff type the expiry each
   time. Recommend (a).
4. Which half first: (a) 7a departures and suppliers, then 7b rates, packages and public pages; (b) 7b first, because the website is how
   new customers find the agency. Recommend (a): the pilot agency's batches and supplier dues exist today, the website needs both.

## OWNER ANSWERS (2026-10-30)
The owner accepted every recommendation in OWNER QUESTIONS above: departure-level costs (b), public address /a/<sign-in code>/<package> now (a), 48-hour default hold (a), 7a first (a). Build 7a now; 7b after.
