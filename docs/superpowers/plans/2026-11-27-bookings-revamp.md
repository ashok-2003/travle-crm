# Bookings revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookings and Quotes become searchable, filterable, exportable tables with numbered pages; staff add a booking in
one step; a booking's page leads with its trip, says what needs them, holds all its money, and pre-fills its travellers
from the lead.

**Architecture:** Task 1 puts each payment due's state (paid, due, overdue) in the domain and the contracts. Then two
tracks run in parallel worktrees: the lists (Tasks 2–5: a shared server-side `DataTable`, `bookings.page`,
`quotes.page`, two export kinds, New booking) and the booking page (Tasks 6–8: header and Needs you with the travel
date, the money moved in, travellers pre-filled). They meet only in `bookings.json`/`quotes.json` (separate keys) and the
bookings router (separate procedures).

**Tech Stack:** Next.js 16.4 (never `next upgrade`), React 19, Tailwind v4, shadcn radix-nova registry, next-intl, tRPC
+ TanStack Query, Prisma 7.10 with row-level security, the exports module and `Spreadsheets` port, Vitest, Playwright
journeys and the audit camera.

**Spec:** `docs/superpowers/specs/2026-11-27-bookings-revamp-design.md` (section 5 holds the rules not to guess).

## Global Constraints

- CLAUDE.md binds: `db.forOrg`; `recordAudit` (and an `audit.json` sentence) for every staff change; inputs
  `z.strictObject`, outputs `z.object`; a field this release adds is read on the web through `mayBeMissing`; a new
  `DomainError` reason gets its `errors.json` sentence; dependency-cruiser's module layering.
- Registry components only; no `border`/`ring`/`shadow`/`divide` classes outside `components/ui`; brand tokens; every
  word in `src/i18n/messages/en-IN/*.json`; 44px targets; Indian formats (`formatMoney`/whole rupees where the spec says,
  `formatCalendarDay`); the numbers font only on amounts and numbers, never on a sentence.
- Lists: filters and page in the URL (ids and fixed values only), the search's text in the tab (`tab-storage`), never
  the URL; every tRPC call a JSON POST; scope own-or-all (`scopeFilter`) for rows, totals, search and exports.
- Pages: rows per page 25, 50, 100 (default 25); every sort ends on `id`; Bookings default sort travel date ascending,
  no date last.
- Money procedures stay the quote's (`quotes.recordPayment`, `voidPayment`, `issueReceipt`, `issueInvoice`,
  `finance.*`); permissions, plan modules and audits unchanged.
- Overdue: unpaid and its day before the agency's today; due today is not overdue; an unchecked claim is not paid.
- Migrations only add (one for the export kinds' CHECK, one for travellers' pre-filled fields).
- Commits: Conventional, lowercase subject, header ≤ 100 characters, staged by name, `git commit -m … -- <paths>`, no
  Co-Authored-By, never `git add -A`, never `git stash`, never push. Node 24: `source ~/.nvm/nvm.sh && nvm use >/dev/null
  && …`. Tests in the FOREGROUND; stop Docker containers you start; leave ports 3000/3001 and the `travel-crm-revamp-*`
  containers alone.

## Review Focus

1. A member who sees only their own bookings: the rows, the total, the search and the export hold only theirs, and
   the salesperson filter is hidden. (Tasks 2, 3, 4 each test it.)
2. A booking with no travel date: last in the default sort, "Add the travel date" in Needs you; setting it rebuilds only
   the reminders not yet sent. (Tasks 2, 6.)
3. A booking on a departure: its travel date is not editable; New booking on a full departure refuses with the
   departure's own words. (Tasks 5, 6.)
4. A member who records payments but has no `accounts:view` sees Record payment and no Costs and profit; one without
   `quotes:record_payments` sees the money read-only. (Task 7.)
5. The release window: the new web on an older api shows the lists' load-failed alert with Try again (never a blank
   page), and every new field reads through `mayBeMissing`. (Tasks 2, 3, 6.)

---

### Task 1: A payment due's state, from the domain

**Files:** `packages/domain/src/quotes/due-states.ts` (new; the money summary's rule moves here and
`money-summary.ts` uses it), `packages/contracts/src/quotes/quotes.ts` (`installment`), the quote and booking reads that
build installments, `apps/web/src/quotes/quote-money.tsx` (reads the state instead of working it out), tests in
`packages/domain/test/quotes/` and `apps/web/test/quotes/`.

**Interfaces — Produces:**
- `dueStatesOf(installments: { id: string; amountPaise: number; dueOn: CalendarDate }[], paidPaise: number, today: CalendarDate): Map<string, DueState>` with `type DueState = "paid" | "due" | "overdue"` (covered by `coveredInstallments` → paid; else `dueOn < today` → overdue; else due).
- Contract `installment.state: z.enum(["paid", "due", "overdue"])` beside the existing `paid` (kept for older webs).
- `bookingSummary.paymentState: z.enum(["paid", "part_paid", "nothing", "overdue"])` (overdue wins over part paid and
  nothing; paid only when the balance is 0).

- [ ] Failing domain tests: a due on today reads due, yesterday overdue, a covered one paid whatever its day; the money
  summary's totals are unchanged; `paymentState` for a booking with nothing paid, part paid, one overdue, all paid.
- [ ] Implement; `money-summary.ts` and the quote and booking reads use `dueStatesOf` with the agency's today.
- [ ] Web: `quote-money.tsx` shows the api's state (`mayBeMissing`, falling back to its own rule for an older api).
- [ ] Run the domain quotes and bookings tests, the web quotes tests, typecheck, lint.
- [ ] Commit `feat(quotes): each payment due says paid, due or overdue, worked out once in the domain`.

### Task 2: The shared table, and Bookings on it

**Files:** `apps/web/src/components/data-table/` (new: `data-table.tsx`, `table-toolbar.tsx`, `applied-filters.tsx`;
built on the registry Table and the existing `components/table-pagination.tsx`), `packages/contracts/src/bookings/bookings.ts`
(`bookingTablePageInput`, `bookingTablePage`), `packages/domain/src/bookings/table-page.ts` (new), the bookings router
(`page`), `apps/web/src/bookings/bookings-screen.tsx` (+ `bookings-table.tsx`, `bookings-filters.tsx`), `bookings.json`,
tests.

**Interfaces — Produces:**
- `bookingTablePageInput = z.strictObject({ page: z.int().min(1), limit: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25), search: text(80).optional(), status: bookingStatus.optional(), claimsPending: z.boolean().optional(), travelFrom: calendarDate.optional(), travelTo: calendarDate.optional(), ownerUserId: recordId.optional(), payment: z.enum(["paid","part_paid","nothing","overdue"]).optional(), sort: z.enum(["travel","created","customer","total"]).default("travel"), direction: z.enum(["asc","desc"]).default("asc") })`.
- `bookingTablePage = z.object({ items: z.array(bookingSummary.extend({ adults: z.int(), children: z.int(), ownerName: z.string().nullable() })), total: z.int() })`.
- `bookings.page` (viewer). `bookings.list` stays as it is (pickers and older webs use it).
- `DataTable<Row>({ columns, rows, total, page, limit, onPage, onLimit, sort, onSort, onRowOpen, loading, error, onRetry, toolbar, empty })` and `TableToolbar({ search, onSearch, filters, exportButton })`, `AppliedFilters({ chips: { label: string; onRemove: () => void }[] })`.

- [ ] Failing domain tests (`table-page.test.ts`): search by name, phone digits, title and number; each filter; the
  default sort (travel date ascending, no date last, then id); `total` across pages; a member with own scope sees only
  the bookings of leads they own and gets the same total; the salesperson filter is refused for own scope (or ignored:
  say which, test it).
- [ ] Implement `bookingTablePageOf(tx, access, input)` and the router entry.
- [ ] Failing web tests: wide screen shows the table with the columns booking, trip, travel date, people, status, total,
  paid/to pay (red when overdue), details, salesperson; a row press opens `/bookings/<id>`; the search box sends
  `search` only when it has text; Filters applies travel dates and payment and shows them as chips that remove;
  "Showing 1–25 of 132", rows per page 25/50/100, arrows; status chips stay; a phone shows stacked rows with the same
  toolbar; an older api without `bookings.page` shows the load-failed alert with Try again; the salesperson filter only
  for a member who sees all.
- [ ] Implement; the URL keeps status, filters, sort and page; the search stays in the tab.
- [ ] Run domain bookings, web bookings and components tests, typecheck, lint; one audit shot of the list (phone and
  desktop) in the bookings audit; look at it.
- [ ] Commit `feat(web): the bookings list is a searchable, filterable table with numbered pages`.

### Task 3: Quotes on the shared table

**Files:** `packages/contracts/src/quotes/quotes.ts` (`quoteTablePageInput`, `quoteTablePage`),
`packages/domain/src/quotes/table-page.ts` (new), the quotes router (`page`), `apps/web/src/quotes/quotes-screen.tsx`
(and its table file), `quotes.json`, tests.

**Interfaces — Consumes:** Task 2's `DataTable`, `TableToolbar`, `AppliedFilters`. **Produces:** `quotes.page` with
`quoteTablePageInput` (page, limit, search, status, travelFrom, travelTo, ownerUserId, balanceDue, sort
`updated|travel|customer|total`, direction; default updated desc) and `quoteTablePage = { items: QuoteSummary & { ownerName }, total }`.
`quotes.list` stays.

- [ ] Failing domain tests: search, filters, sort, total, own scope; `paymentWait` still on each row.
- [ ] Implement; web tests: columns customer, trip, travel date, status (Waiting for payment / Hold expired), total, last
  change, salesperson; the New quote button stays; the existing quotes-screen tests still pass where they apply.
- [ ] Run tests, typecheck, lint; an audit shot of the list; commit `feat(web): the quotes list is a searchable,
  filterable table with numbered pages`.

### Task 4: Export bookings and quotes

**Files:** `packages/contracts/src/exports/data-export.ts` (`exportKinds` gains `bookings`, `quotes`), a migration
widening `data_export_kind_value`, `packages/domain/src/exports/export-runner.ts` (`nounOf`), new sources and
listeners `packages/domain/src/bookings/booking-export/` and `packages/domain/src/quotes/quote-export/` (modelled on
`crm/lead-export/`), contracts for their filters (the table inputs without page, limit, sort), routers
`booking-exports.ts` and `quote-exports.ts` mounted in the app router, `apps/api/src/worker-jobs.ts` (register),
web buttons and export pages reusing `apps/web/src/exports/*` (routes `/bookings/exports/[exportId]`,
`/quotes/exports/[exportId]`), messages, tests. Check the staff export listener ignores the new kinds.

- [ ] Failing domain tests: the file's columns are the table's plus the customer's phone; the current filters and
  search apply; own scope applies; a kind's listener ignores the other kinds; `too_many_rows` past the max as leads.
- [ ] Implement; permissions `bookings:view` / `quotes:view`, `.meta({ lifecycle: "export" })`, fresh session, as the
  leads export; notification and audit words.
- [ ] Web tests: Export CSV opens the export dialog with the list's current filters; the export page downloads.
- [ ] Run domain exports, bookings and quotes tests, api tests, web tests, typecheck, lint; `pnpm migrations:check` if
  Docker allows; commit `feat(exports): bookings and quotes export to csv or excel with the list's filters`.

### Task 5: New booking

**Files:** `packages/domain/src/bookings/create-direct.ts` (new), contracts `createBookingInput`, the bookings router
(`create`, fresh, `bookings:edit` and `quotes:edit`), `apps/web/src/bookings/new-booking-dialog.tsx` (reusing the New
quote popup's lead step: `useFoundLeads`, `ResponsiveDialog centered`), `bookings.json`, tests.

**Interfaces — Produces:** `createBookingInput = z.strictObject({ leadId: recordId, packageId: recordId.nullable(), departureId: recordId.nullable(), title: text(120).min(1), startDate: calendarDate.nullable(), adults: z.int().min(1).max(500), children: z.int().min(0).max(500), totalPaise: paise.min(1), taxRateBasisPoints: quoteTaxRate })`; `bookings.create` → `{ bookingId: string }`.

- [ ] Failing domain tests: one call makes a quote that ends accepted, a confirmed booking with the default schedule,
  traveller rows for adults + children, the audits each step makes today; the `quote.accepted` listener then makes no
  second booking; from a package it takes the package's days, inclusions and terms; on a departure it takes the
  departure's date and a full departure refuses with the departure's own reason.
- [ ] Implement with `createBookingFromQuote` and the confirm step in one transaction (as `from-ai.ts` does for the AI).
- [ ] Web tests: New booking on the Bookings list (only with `bookings:edit`), a centred popup: the lead step (newest
  leads, search, New lead link), then trip (a package with its departure for a group trip, or a custom title and date),
  people, total; Create booking opens `/bookings/<id>`; busy while it saves.
- [ ] Run tests, typecheck, lint; commit `feat(bookings): new booking makes the quote and the confirmed booking in one step`.

### Task 6: The booking's header, Needs you and travel date

**Files:** `apps/web/src/bookings/booking-screen.tsx`, `booking-actions.tsx` (actions in one row), a new
`needs-you.tsx`, `reminders-card.tsx` (the consent button into a ⋯ menu with `ConfirmDialog`), `trip-card.tsx`
(Upload a file outline), domain `packages/domain/src/bookings/travel-date.ts` (new), contracts `setTravelDateInput`,
the bookings router (`setTravelDate`, editor), `audit.json`, `errors.json`, `bookings.json`, tests.

**Interfaces — Produces:** `setTravelDateInput = z.strictObject({ bookingId: recordId, startDate: calendarDate })`;
`bookings.setTravelDate`; refusal `BOOKING_ON_DEPARTURE` for a booking with a departure; audit
`booking.travel-date-changed`.

- [ ] Failing domain tests: setting the date moves `endDate` by the trip's length, rebuilds reminders not yet sent and
  keeps sent ones, leaves the payments due as they are, is audited; a booking on a departure refuses.
- [ ] Failing web tests:
  - the header: the trip's title as the heading, then the travel date with its weekday, people, the customer as a link
    to the lead, the number, the status pill, the departure link;
  - actions in one row: WhatsApp icon button, Trip link with Copy, ⋯ with Cancel booking;
  - Needs you lists, each with its action: an overdue due (Record payment, which Task 7 wires), claims or proofs to
    check, details missing (Fill in), no travel date (Add the travel date, opening a `DateField` dialog), waiting to be
    confirmed (Confirm); none of them → no box;
  - "They agreed to trip updates" only in the Reminders ⋯ menu, behind a confirmation;
  - "Upload a file" is an outline button.
- [ ] Implement; run tests, typecheck, lint; an audit shot of a booking (phone and desktop); commit
  `feat(web): a booking leads with its trip and says what needs you, and keeps its own travel date`.

### Task 7: All the money on the booking page

**Files:** `apps/web/src/bookings/payments-card.tsx` (split into `booking-money.tsx` and friends if it passes ~200
lines), reuse `apps/web/src/quotes/money-dialogs.tsx`, receipts and invoice buttons from `quote-money.tsx` (move shared
parts to a small module rather than copying), `apps/web/src/bookings/proof-card.tsx` (picture tiles),
`apps/web/src/finance/booking-costs-card.tsx` (rendered on the booking page), `apps/web/src/quotes/quote-screen.tsx`
(a booked quote points to its booking), `bookings.json`, `quotes.json`, tests.

**Interfaces — Consumes:** Task 1's `installment.state`; `quotes.recordPayment`, `voidPayment`, `issueReceipt`,
`issueInvoice`; `BookingCostsCard({ quoteId })`. Needs the booking's quote id (already on `BookingDetail.quoteId`) and,
for the quote page, the booking's id and number on the quote (add `booking: { id, number } | null` to the quote detail
contract if it is not there, through `mayBeMissing`).

- [ ] Failing web tests: the booking's money shows the paid bar and each due's pill (Paid, Due 25 Nov, Overdue red);
  Record payment, void, receipt and invoice work there for `quotes:record_payments`; read-only without it; Costs and
  profit only with `accounts:view` on a plan with accounts; proofs as picture tiles that open; a booked quote's page
  shows "This quote is booking BK-… Its payments are on the booking." with a link instead of its money; a sent quote
  still shows Record payment.
- [ ] Implement; run tests, typecheck, lint; the bookings and payments-to-check journeys; an audit shot; commit
  `feat(web): a booking holds all its money, and its quote points there`.

### Task 8: Travellers pre-filled from the lead

**Files:** a migration adding `booking_traveller.prefilled_fields text[] NOT NULL DEFAULT '{}'`, the Prisma model,
`packages/domain/src/bookings/create-booking.ts` (traveller 1 from the lead's person), `travellers.ts` (any save by a
person clears `prefilled_fields`), contracts (`traveller.prefilled: z.array(z.enum(["name","phone"]))`),
`apps/web/src/bookings/travellers-card.tsx` and `traveller-dialog.tsx` (the tint; "what each traveller fills in" and
the count into the card's ⋯ menu), the trip page's traveller form (`apps/api/src/trip-forms.ts`; this part waits until
`feat/customer-pages-polish` is on main and main is merged into this branch), tests.

- [ ] Failing domain tests: every path that makes a booking (accepted quote, AI, New booking, payment on a sent quote)
  fills traveller 1's name and phone from the lead's person and marks them pre-filled; a person without a phone gives
  the name alone; a staff save or a trip-page save clears the marks; bookings made before are untouched.
- [ ] Failing web tests: a pre-filled field sits on the primary tint (a shared class, e.g. `prefilledField` in
  `components/card-tints.ts`, from brand tokens) until saved; the ⋯ menu holds the level and the count.
- [ ] Trip page: the pre-filled inputs carry the same tint (a class in `public-html.ts`); api test.
- [ ] Run tests, typecheck, lint, the bookings journey; commit `feat(bookings): travellers start from the lead's name and
  phone, marked until someone checks them`.
