# A simple trip page: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a group trip's page that an agency owner reads at a glance: a price table (room types × seasons) with Add
season on top, a big calendar showing each departure's price and seats, a day panel that does everything a day needs,
and the removals and fixes in the spec.

**Architecture:** three domain/api tasks first (open-ended seasons and per-room price fallback; the price table, the
departure calendar read and narrow departure writes; the list's AI state and a worked-out From price), then two web
batches in parallel worktrees: the page and its sections, and the departures calendar as self-contained components the
page mounts. The AI change assistant has its own plan (`2026-11-25-ai-change-assistant.md`) built on tasks 1-3.

**Tech stack:** TypeScript, Prisma 7.10 on Postgres, tRPC, Zod 4, Next.js with next-intl, shadcn/ui (radix-nova),
react-day-picker (the registry Calendar), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-simple-trip-page-design.md` (and, for what stays,
`docs/superpowers/specs/2026-11-24-easy-package-editing-design.md`).

## Global constraints

- Every rule in `CLAUDE.md` and `docs/agent-playbook.md`: test first; strict TypeScript (no `any`, no `!`); one-line
  purpose comment at the top of each file; `z.strictObject` inputs, `z.object` outputs; every procedure from
  `procedures.ts` with its permission; audit every staff change; money in integer paise; dates as `CalendarDate`.
- Web: shadcn registry components only; no `border`, `divide-`, `ring-`, `shadow` classes outside `components/ui`;
  colours from brand tokens only; every word a next-intl message in `src/i18n/messages/en-IN/packages.json` (or the
  feature's file); `DateField` for every date input; 44px touch targets; dates on screen via `formatCalendarDay`.
- Words on the agency's screens: "departure" (never "batch" or "dates" as a noun for departures), "season", "price per
  person". No "special prices".
- `OPEN_SEASON_END` is `"2099-12-31"`, exported from `@travel-crm/contracts/quotes`.
- No agency or person names in code, tests or docs.
- Stage files by name; Conventional Commits with lower-case subjects; never `--no-verify`.
- Shell commands start with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

## Review focus

1. A trip whose seasons leave gaps (days with no season): the table, the calendar and the From price show "no price"
   for those days, never ₹0 or a crash.
2. Editing the regular column of a trip whose regular season is split around Christmas: both pieces change, the
   Christmas column does not.
3. A departure with its own price for only Quad: Quad shows its own price, the other rooms the season's (the new
   per-room fallback), on the calendar, the panel, the AI's trip text and a group quote.
4. "Until I change it" on the last season: the new season ends at `OPEN_SEASON_END` and the calendar shows it on
   every later month.
5. The list and the trip header agree on "AI sells it" for a trip whose only departure has passed.

---

### Task 1: open-ended seasons and a per-room price fallback (domain)

**Files:**
- Modify: `packages/contracts/src/quotes/packages.ts` (export `OPEN_SEASON_END`), `packages/domain/src/quotes/room-prices.ts`,
  `packages/domain/src/quotes/special-prices.ts`, `packages/domain/src/ai/natural/trips/trip-text.ts`
- Test: `packages/domain/test/quotes/room-prices.test.ts`, `packages/domain/test/quotes/special-prices.test.ts`,
  `packages/domain/test/ai/natural/trips/trip-text.test.ts` (extend the existing files; find them with `rg -l`)

**Interfaces:**
- Produces: `OPEN_SEASON_END: CalendarDate` (`"2099-12-31"`); `priceOn` keeps its signature, with per-room fallback.

- [ ] **Step 1: failing tests**
  - `priceOn`: a departure with only `quad` set inside a season → `prices.quad` is the departure's, `prices.double`
    the season's, `source: "departure"`; a departure with no own price → the season's, `source: "season"`; a date with
    no season and a departure with only `quad` → `{quad: own, others: null}`, `source: "departure"`.
  - `saveSpecialPrices` with `endsOn: null` on a trip whose regular season runs to 13 Nov 2027 with a Christmas season
    after the start: the new season ends the day before Christmas begins; with no later season it ends at
    `OPEN_SEASON_END` (not one year on).
  - `tripInFull`: a season ending `OPEN_SEASON_END` reads "(from 2 Jan onwards)" with the existing short-day format.
- [ ] **Step 2:** run them, see them fail.
- [ ] **Step 3:** implement. `priceOn` merges per room: own price where set, else the season's (then `offeredOnly`).
  Update the AI wording that said a departure's own prices replace the season's, so it says which rooms have their own
  price. `saveSpecialPrices` "until changed": day before the next season starting after `startsOn`, else
  `OPEN_SEASON_END`. `tripInFull`: `until === OPEN_SEASON_END` → "from <day> onwards".
- [ ] **Step 4:** `pnpm --filter @travel-crm/domain test -- room-prices special-prices trip-text` passes; then the
  whole domain `quotes` and `ai/natural` folders.
- [ ] **Step 5:** commit `feat(domain): seasons may run with no end, and a departure's own price falls back per room`.

### Task 2: the price table, the departure calendar read and narrow departure writes (contracts, domain, api)

**Files:**
- Create: `packages/contracts/src/quotes/season-columns.ts` (pure grouping, exported from the quotes index),
  `packages/domain/src/quotes/price-table.ts`, `packages/domain/src/departures/package-calendar.ts`
- Modify: `packages/contracts/src/quotes/packages.ts`, `packages/contracts/src/departures/departures.ts`,
  `packages/domain/src/departures/departures.ts` (or a new `departure-quick-changes.ts`), `packages/api/src/routers/packages.ts`,
  `packages/api/src/routers/departures.ts`, the domain module index files
- Test: `packages/contracts/test/quotes/season-columns.test.ts`, `packages/domain/test/quotes/price-table.test.ts`,
  `packages/domain/test/departures/package-calendar.test.ts`, `packages/domain/test/departures/departure-quick-changes.test.ts`,
  the routers' permission tests

**Interfaces:**
- Produces (contracts):
  - `seasonColumns(seasons: PackageSeasonView[]): SeasonColumn[]`, `SeasonColumn = { key: string; label: string;
    seasonIds: string[]; ranges: {startsOn, endsOn}[]; prices: RoomPrices; open: boolean }`. Groups seasons with the
    same label and the same prices; `open` when a range ends `OPEN_SEASON_END`. Order: the open column first, else the
    column covering the most days; then by first `startsOn`. `key` is the first season id.
  - `savePriceTableInput = z.strictObject({ packageId, roomTypes: z.array(roomType).min(1), columns:
    z.array(z.strictObject({ seasonIds: z.array(recordId).min(1), label, prices: roomPrices })).min(1) })`.
  - `departureCalendarInput = z.strictObject({ packageId, from: calendarDate, to: calendarDate })` (to - from ≤ 45
    days); `calendarDeparture = z.object({ departureId, startDate, endDate, status: "open"|"closed"|"cancelled",
    seatsTotal, seatsSold, seatsHeld, seatsFree, prices: roomPricesOutput, ownPrices: roomPricesOutput,
    priceSource: "departure"|"season"|"none", seasonLabel: string.nullable() })`.
  - `setDepartureSeatsInput = z.strictObject({ departureId, seatsTotal })`,
    `setDeparturePricesInput = z.strictObject({ departureId, prices: roomPrices })` (all null = use the season's).
- Produces (domain): `savePriceTable(tx, access, input): Promise<void>`; `packageCalendar(tx, input):
  Promise<CalendarDeparture[]>`; `setDepartureSeats(tx, access, input)`, `setDeparturePrices(tx, access, input)`.
- Produces (api): `packages.savePriceTable` (editor), `departures.calendar` (requires `departures:view`, a query),
  `departures.setSeats` and `departures.setPrices` (the departures editor).

- [ ] **Step 1: failing tests**
  - `seasonColumns`: Regular split in two around Christmas → two columns, Regular first with two ranges; same label
    with different prices → two columns; an open-ended range → `open: true` and first.
  - `savePriceTable`: changing the Regular column's Double updates both pieces, leaves Christmas alone, records one
    `package.season-saved` per piece; a season id of another trip → `NOT_FOUND`; dropping `single` from `roomTypes`
    nulls Single in every season of the trip and saves `roomTypes`; a column with no price among `roomTypes` →
    refused (`INVALID_INPUT` with the column's path).
  - `packageCalendar`: returns the trip's departures starting in [from, to], cancelled included, each with resolved
    `prices` through `priceOn`, `priceSource`, `seasonLabel` and seat counts matching `listDepartures`'s for the same
    departure; range over 45 days refused by the contract.
  - `setDepartureSeats`: below sold + held → refused with the existing reason `updateDeparture` uses; audits
    `departure.changed`. `setDeparturePrices`: stores own prices, all null clears them; audits `departure.changed`.
  - Router tests: each new procedure refuses without its permission.
- [ ] **Step 2:** run them, see them fail.
- [ ] **Step 3:** implement. `savePriceTable` composes `savePackageSeason` per season id (dates unchanged, new label
  and prices, rooms outside `roomTypes` null) and the room types through `findPackageForChange` + `mergePackagePart` +
  `updatePackage` in the same transaction. Seat counts reuse the code `listDepartures` uses (extract a helper if it is
  inline). The narrow writes reuse `updateDeparture`'s checks and audit view.
- [ ] **Step 4:** the new tests and `pnpm --filter @travel-crm/domain test -- quotes departures`,
  `pnpm --filter @travel-crm/api test -- packages departures`, `pnpm --filter @travel-crm/contracts test` pass.
- [ ] **Step 5:** commit `feat(api): a trip's price table, its departure calendar and quick departure changes`.

### Task 3: the list's AI state and a worked-out From price (domain, api, public page)

**Files:**
- Modify: `packages/domain/src/quotes/package-sell-gaps.ts` (export the batch), `packages/domain/src/quotes/packages.ts`,
  `packages/domain/src/quotes/package-edit.ts` (`getPackage`), `packages/domain/src/package-pages/rows.ts` and `read.ts`,
  `packages/contracts/src/quotes/packages.ts`
- Create: `packages/domain/src/quotes/group-from-price.ts`
- Test: `packages/domain/test/quotes/packages.test.ts` (list), `packages/domain/test/quotes/group-from-price.test.ts`,
  the package-pages read test

**Interfaces:**
- Produces: `quotePackage` gains `aiSells: z.boolean()` and `aiGap: sellGap.nullable()` (the first gap when the switch
  is on and the AI still doesn't sell it); `groupFromPrices(tx, packageIds, today): Promise<Map<string, number | null>>`
  (the lowest adult room price over the open departures ahead, through `priceOn`; child rooms ignored); for a group
  trip, `packageDetail.fromPricePaise` and `quotePackage.fromPricePaise` and the public page's "From" use it,
  whatever `priceDisplay` says.

- [ ] **Step 1: failing tests**
  - list: a group trip with the switch on and no departure ahead → `aiSellable: true`, `aiSells: false`,
    `aiGap: "departures"`; a ready one → `aiSells: true`, `aiGap: null`; the switch off → `aiSells: false`,
    `aiGap: null`; the list's query count stays fixed as trips grow (follow the file's existing count test if any,
    else assert one call of the batch).
  - `groupFromPrices`: lowest of Quad ₹5,999 (season) and a departure's own Quad ₹5,499 → 549900; no departure ahead
    → null; a departure on a day no season covers and no own price → ignored.
  - public page: a group trip with `priceDisplay: "on_enquiry"` and departures ahead shows "From" the worked-out
    price; with none ahead, no price.
- [ ] **Step 2:** run, fail. **Step 3:** implement (one batch read of seasons and departures, like `gapsOfRows`).
- [ ] **Step 4:** domain `quotes` and `package-pages` tests pass. **Step 5:** commit
  `feat(domain): the packages list says what the trip says about the AI, and a group trip's From price is worked out`.

---

The web tasks run as two batches in parallel worktrees once tasks 1-3 are merged. Batch W1 owns `package-screen.tsx`
and every section; batch W2 owns the departures calendar, in new files only, mounted by W1 through one component.

**The seam:** `apps/web/src/packages/departures-card.tsx` exports `DeparturesCard({ detail }: { detail: PackageDetail })`.
W1 mounts it after the Prices card on group trips (until W2 lands, W1 commits a placeholder file with that export that
renders the existing `PriceCalendar`; W2 replaces the file).

### Task 4 (batch W1): the page, the price table and the sections

**Files:**
- Create: `apps/web/src/packages/price-table.tsx` (table + Save), `apps/web/src/packages/season-dialog.tsx` (rewritten:
  Add season / Change dates, with "until I change it"), `apps/web/src/packages/section-trip-details.tsx`,
  `apps/web/src/packages/section-more.tsx`, `apps/web/src/packages/season-colours.ts` (season index → the brand's
  decorative tints, as `components/card-tints.ts` does for cards; shared with W2)
- Modify: `package-screen.tsx`, `package-header.tsx`, `packages-screen.tsx`, `section-page.tsx` (becomes Page and AI:
  sell card first; From price and Calculate from the catalog only on custom trips), `section-itinerary.tsx` (Move up /
  Move down per day; folded into Trip details), `section-details.tsx` (folded into Trip details; Where it starts
  beside Pickup points), `sell-card.tsx`, `apps/web/src/departures/departure-screen.tsx` and
  `departure-form-dialog.tsx` (show the departure's prices; no Destination field for a trip's departure; empty own-price
  boxes show the season price as their placeholder and mean "the season's price"), `packages.json` and the departures
  messages
- Delete: `add-dates-dialog.tsx`, `seasons-card.tsx`, `special-prices-dialog.tsx`, `prices-editor.tsx`,
  `section-prices.tsx`, `package-departures-card.tsx` (and their tests and unused messages); Tiers render only on
  custom trips
- Test: `apps/web/test/packages/price-table.test.tsx`, `season-dialog.test.tsx`, `package-screen.test.tsx`,
  `packages-screen.test.tsx`, `section-trip-details.test.tsx`, the departure screen/form tests

**Interfaces:**
- Consumes: `seasonColumns`, `savePriceTableInput`, `OPEN_SEASON_END`, `packages.savePriceTable`,
  `packages.saveSpecialPrices` (Add season), `packages.saveSeason` (Change dates, Rename, "no end"),
  `packages.removeSeason`, `quotePackage.aiSells/aiGap`, worked-out `fromPricePaise`, `departures.calendar` fields for
  the departure page price (or `departures.get` if it already carries the resolved price after task 2).
- Produces: `DeparturesCard` placeholder (see the seam); `seasonTint(index: number): string` in `season-colours.ts`.

- [ ] **Step 1: failing tests**
  - price table: renders a row per room type and a column per `seasonColumns` entry with its dates ("all other days"
    for the open one); typing ₹7,200 in Regular/Double and Save sends one `savePriceTable` with both Regular season ids;
    a blank cell reads "Not sold"; + Room type adds a row from the room types not yet shown; removing a row drops it
    from `roomTypes`; Save disabled until something changed; read-only without `quotes:edit`.
  - Add season sits above the table; it prefills prices from the first column; "Until I change it" sends `endsOn: null`.
  - Change dates on the open column offers "No end date"; on a closed last column too.
  - page order: header, (AI box slot left for the assistant plan), Prices, Departures, Trip details, Page and AI, More
    (closed); a custom trip shows its From price and Tiers; a group trip shows neither.
  - header: "AI doesn't sell it: no departures ahead" when the switch is on with a gap, linking to the sell card.
  - list: the badge follows `aiSells`, and a switched-on trip with a gap shows the gap's sentence.
  - itinerary: Move up on day 2 swaps days 1 and 2 in the saved `days`; Move up disabled on day 1, Move down on the last.
  - departure page: shows each room's price for its first day; the Change form has no Destination for a trip's
    departure and leaves blank own prices blank.
- [ ] **Step 2:** run, fail. **Step 3:** implement with registry pieces only (`Table`, `Input` via `MoneyField`,
  `Card`, `Collapsible` for More, `ResponsiveDialog`/`FormDialog`). Remove the deleted files and every message nothing
  reads any more.
- [ ] **Step 4:** `pnpm --filter @travel-crm/web run typecheck`, `pnpm --filter @travel-crm/web test`, lint pass.
- [ ] **Step 5:** commit in two or three steps (`feat(web): ...`), the deletions in their own commit.

### Task 5 (batch W2): the departures calendar and the day panel

**Files:**
- Create (replacing W1's placeholder): `apps/web/src/packages/departures-card.tsx`, `departures-month.tsx` (desktop
  grid), `departures-agenda.tsx` (phone list), `day-panel.tsx`, `repeats-line.tsx`, `use-departure-calendar.ts`
- Modify: `price-calendar-days.ts` (or replace it), `use-departures.ts` (hooks for `setSeats`, `setPrices`)
- Delete: `price-calendar.tsx`, `calendar-day-actions.tsx` and their tests once nothing imports them
- Test: `apps/web/test/packages/departures-card.test.tsx`, `day-panel.test.tsx`, `repeats-line.test.tsx`

**Interfaces:**
- Consumes: `departures.calendar`, `departures.addPackageDates`, `departures.reopen`, `departures.setSeats`,
  `departures.setPrices`, `CancelDepartureDialog`, `packages.updatePart` (weekly days, months, seats per departure,
  advance), `seasonTint` and `seasonColumns` (legend and day colours), `formatCalendarDay`, `rupees`.

- [ ] **Step 1: failing tests**
  - month grid (desktop): each day wears its season's tint; a departure day shows "₹5,999" (the lowest priced room)
    and "32 left"; cancelled shows "Cancelled"; full shows "Full"; a day no season covers shows no price; a legend
    lists each season column with its tint; arrows change month and refetch the month's range.
  - agenda (phone width): the month's departures as a list, "Fri 4 Dec · ₹5,999 · 32 of 40 left".
  - day panel, departure ahead: the season label, each room's price, seats booked and left, Change seats (sends
    `setSeats`), Price for this departure only (boxes with the season price as placeholder; sends `setPrices`; "Use
    the season's prices" sends all null), Cancel this departure (the existing dialog), Open (its page).
  - day panel, cancelled ahead: Reopen sends `reopen`. Empty day ahead: "Add a departure on Fri 4 Dec" sends
    `addPackageDates` for that one day; with "Repeat every week until 31 Jan" it sends that weekday from the day to the
    date (more than 62 days → split into several calls, or say the cap; pick one and test it); "Repeat every week, no
    end" adds the weekday to the trip's weekly days through `updatePart`. A past day: read only.
  - repeats line: "Every Friday in Nov, Dec and Jan · new departures appear 12 weeks ahead" with Change (weekday and
    month picks) and Stop (clears weekly days through `updatePart`); "Seats on each new departure: 40" and "Advance to
    hold a seat: ₹2,000", each changeable in place.
  - every change refreshes the month and the trip (`useRefreshWork` or the package query keys).
- [ ] **Step 2:** run, fail. **Step 3:** implement: the registry `Calendar` with a custom `DayButton` and larger day
  cells (size classes only), or a grid of registry pieces if the Calendar can't hold the content; `Sheet` on a phone
  and a side `Card` on a wide screen for the panel. Sizes and colours through tokens and size utilities only.
- [ ] **Step 4:** web typecheck, tests, lint pass. **Step 5:** commit `feat(web): a trip's departures calendar shows each
  departure's price and seats, and a day panel`.

### Task 6: journeys and the final check (after W1 and W2 merge)

**Files:** `apps/web/test/e2e/package-calendar-journey.spec.ts`, `group-packages-journey.spec.ts`,
`package-pages-journey.spec.ts`, `package-drafts-journey.spec.ts`, `departures-journey.spec.ts` (only where they
touch the removed pieces).

- [ ] Rewrite the calendar journey for the new page: set Regular prices in the table, Add season "Christmas" 18 Dec
  to 1 Jan, add a departure on an empty day with Repeat every week until a date, see its price and seats on the
  calendar, give one departure its own Quad price, cancel and reopen one. Keep the accessibility checks.
- [ ] Update the other journeys' steps that used Add dates, the seasons card or the Prices & dates form.
- [ ] Run each changed journey locally (`pnpm --filter @travel-crm/web exec playwright test test/e2e/<spec>
  --reporter=line`), then push and let CI run the rest.
- [ ] Commit `test(web): journeys follow the simple trip page`.
