# Group packages (the agent's ground truth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A package can sell a group trip: its departures, a season price table by room type, GST, the advance and its QR, its files, pickup, "AI can sell", and a group quote priced from all of it; plus the agency's "we also plan custom trips" setting.

**Architecture:** New columns on `quote_template` and `departure`, one new table `package_season`, two new file record types. Pricing is pure code (`room-prices.ts`) that quotes, the public pages and (in plan 4) the agent all call. Weekly days create dated departures ahead, nightly and on save. The package editor gets cards for seasons, departures, files and selling.

**Tech Stack:** Prisma 7.10 + Postgres (RLS), tRPC, Zod contracts, Next.js web app (shadcn registry components), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-grounded-sales-agent-design.md`, section 1 ("Packages hold the facts") and decision 10 (custom trips). This is plan 1 of 4: 2 drafts packages from an agency's files, 3 is Payments to check, 4 is the agent.

## Global Constraints

- The repository's CLAUDE.md holds in full: `forOrg`, RLS on every new organization table plus a fixture in `packages/db/test/org-table-fixtures/`, keys including `organization_id` with `ON DELETE RESTRICT ON UPDATE RESTRICT`, strict Zod inputs, output schemas, audit for every change staff make, messages in `src/i18n/messages/en-IN/`, a sentence in `errors.json` for each new `DomainError` reason and in `audit.json` for each new audit action, registry components only, no border/ring/shadow classes outside `components/ui`, 44px targets, `DateField` for every date input.
- Money is integer paise: `BigInt` columns with `CHECK (... BETWEEN 0 AND 10000000000)`; numbers (`z.int()`) in contracts and in the pure pricing code.
- Dates are calendar days (`@db.Date`, `CalendarDate`, `calendarDate`); a season's `startsOn` and `endsOn` are both inside it.
- Room types, exactly: `single`, `double`, `triple`, `quad`, `child_bed`, `child_no_bed`. Every price is per person.
- Seasons of one package never overlap (an exclusion constraint, as `supplier_rate_season_no_overlap` in `packages/db/prisma/migrations/20261201100000_rates_packages/migration.sql:173-178`).
- "Prices include GST" is on by default: the price told is the price paid.
- Drafts are never sellable by themselves: `ai_sellable` defaults to false.
- Every shell command starts with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`. Conventional Commits, files staged by name, no `Co-Authored-By`.

## Review Focus

1. A date on a season's first or last day is priced by that season; a date between two seasons has no price (Task 2's tests).
2. A generated departure that staff cancelled or deleted is not created again by the next night's run (Task 5).
3. Room types taken off a package after its seasons were priced are no longer priced or offered (Task 2: `priceOn` filters by the offered types).
4. Weekly months that wrap the year (Dec and Jan) and a horizon that crosses 31 Dec create the right dates (Task 5).
5. A package with linked departures can't be deleted; the refusal says why (Task 5, `PACKAGE_HAS_DEPARTURES`).

Ruling against the spec's wording, recorded here: GST is rounded per tax head, so some totals can't be reached exactly from a pre-tax subtotal. A group quote's total equals the told total where the arithmetic allows, and is otherwise within 2 paise of it (Task 2 pins this).

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/db/prisma/schema/sales.prisma` (`QuoteTemplate`), `packages/db/prisma/schema/departures.prisma` (`Departure`), `packages/db/prisma/schema/ai.prisma` (`AiSettings`)
- Create: `packages/db/prisma/schema/package-seasons.prisma` (`PackageSeason`), `packages/db/prisma/migrations/20261205100000_group_packages/migration.sql`
- Modify: `packages/db/test/org-table-fixtures/rates-packages.ts` (fixture `package_season`)

**Interfaces:**
- Produces: columns `quote_template.kind` (`'custom'|'group'`, default `'custom'`), `room_types text[]` (default `'{}'`, each one of the six), `prices_include_gst boolean` (default true), `advance_per_person_paise bigint` (null), `payment_details text` (default `''`), `pickup_points text` (default `''`), `start_city text` (default `''`), `weekly_days int[]` (0 Sunday … 6 Saturday, default `'{}'`), `departure_months int[]` (1–12, default `'{}'` = every month), `seats_per_departure int` (null, 1–`MAX_SEATS`), `ai_sellable boolean` (default false); `departure.template_id uuid` (null; FK `(organization_id, template_id)` → `quote_template(organization_id, id)`), `departure.price_single_paise … price_child_no_bed_paise` (six `bigint` nulls); table `package_season (organization_id, id, template_id, label, starts_on, ends_on, price_single_paise … price_child_no_bed_paise, created_by, created_at, updated_at)`, rows hard-deleted (no soft delete; runtime may DELETE); unique partial index `departure (organization_id, template_id, start_date) WHERE template_id IS NOT NULL AND deleted_at IS NULL`; `ai_settings.custom_trips boolean` (default false). Prisma model `PackageSeason` with fields `templateId`, `label`, `startsOn`, `endsOn`, `priceSinglePaise`, `priceDoublePaise`, `priceTriplePaise`, `priceQuadPaise`, `priceChildBedPaise`, `priceChildNoBedPaise`.

- [ ] **Step 1:** Add the `package_season` fixture (creates a package with `aPackage(tx)` and one season "Nov" 2026-11-01..2026-11-30 with a triple price). Run `pnpm --filter @travel-crm/db test` → FAIL (no model).
- [ ] **Step 2:** Write the schema and the migration: the columns above with their CHECKs (`kind IN ('custom','group')`; `room_types <@ ARRAY['single','double','triple','quad','child_bed','child_no_bed']`; `weekly_days <@ ARRAY[0,1,2,3,4,5,6]`; `departure_months <@ ARRAY[1..12]`; each price `BETWEEN 0 AND 10000000000`; `ends_on >= starts_on`), the exclusion constraint `package_season_no_overlap EXCLUDE USING gist (organization_id WITH =, template_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)`, `SELECT app_enable_org_rls('package_season');`.
- [ ] **Step 3:** `pnpm --filter @travel-crm/db test` and `pnpm migrations:check` → PASS (fixtures, isolation, key and constraint checks, drift).
- [ ] **Step 4:** Commit `feat(db): group package columns, package seasons and room prices on departures`.

### Task 2: Room prices, totals and GST (pure code)

**Files:**
- Create: `packages/contracts/src/quotes/room-prices.ts` (exported from the quotes contracts' index), `packages/domain/src/quotes/room-prices.ts`, `packages/domain/test/quotes/room-prices.test.ts`

**Interfaces:**
- Produces (contracts): `roomTypes` (the six, in that order), `roomType`, `type RoomType`; `roomCapacity: Record<RoomType, number | null>` = single 1, double 2, triple 3, quad 4, children null; `roomPrices = z.strictObject({ single, double, triple, quad, child_bed, child_no_bed })`, each `paise.nullable()`; `type RoomPrices`; `roomBooking = z.strictObject({ roomType, people: z.int().min(1).max(MAX_SEATS) })`.
- Produces (domain):
  - `interface SeasonPrices { label: string; startsOn: CalendarDate; endsOn: CalendarDate; prices: RoomPrices }`
  - `priceOn(date: CalendarDate, seasons: readonly SeasonPrices[], departure: { title: string; prices: RoomPrices } | null, offered: readonly RoomType[]): { prices: RoomPrices; source: "departure" | "season"; label: string } | null`. When the departure sets any price, only its prices are used (a premium batch never borrows the season's); otherwise the season covering the date. Types not in `offered` come back null. Null when nothing prices the date.
  - `totalFor(prices: RoomPrices, rooms: readonly RoomBooking[]): { ok: true; totalPaise: number; lines: { roomType: RoomType; people: number; pricePaise: number; amountPaise: number }[] } | { ok: false; reason: "NO_PRICE" | "ROOM_SPLIT"; roomType: RoomType }`. `ROOM_SPLIT` when `people` isn't a multiple of the room's capacity.
  - `exTaxSubtotal(totalPaise: number, rateBasisPoints: number, taxOf: (subtotalPaise: number) => number): number`: the pre-tax subtotal whose subtotal + tax equals the total, searched around `total × 10000 / (10000 + rate)`; when none exists, the one whose sum is closest, never more than 2 paise away.

- [ ] **Step 1: Failing tests** in `room-prices.test.ts`:
  - `"prices a date on a season's first and last day, and none between seasons"`: seasons Nov (2026-11-01..30, triple 699900) and Peak (2026-12-20..2027-01-05, triple 799900); 2026-11-01 and 2026-11-30 → Nov; 2026-12-10 → null; 2027-01-05 → Peak.
  - `"a batch's own prices win whole"`: departure "Premium, 27 Nov" with only double 749900 → double 749900, triple null, source "departure", label "Premium, 27 Nov".
  - `"room types not offered are not priced"`: offered `["triple"]`, season sets double and triple → double null.
  - `"totals by room, and refuses a split that doesn't fit"`: triple 699900 × 3 people → 2099700; double × 3 people → `{ ok: false, reason: "ROOM_SPLIT", roomType: "double" }`; quad with no price → `NO_PRICE`.
  - `"takes GST out so the quote's total is the price told"`: with `taxOf` = intra-state 5% from `indiaGst`, `exTaxSubtotal(699900, 500, taxOf)` + its tax = 699900; and for every whole-rupee total from ₹1,000 to ₹50,000, intra- and inter-state, the sum is within 2 paise of the total.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain exec vitest run test/quotes/room-prices.test.ts` → FAIL.
- [ ] **Step 3:** Implement the contracts and the three functions.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(domain): price a group trip by room type, season and batch`.

### Task 3: Package seasons (domain, contracts, api)

**Files:**
- Create: `packages/domain/src/quotes/package-seasons.ts`, `packages/domain/test/quotes/package-seasons.test.ts`
- Modify: `packages/contracts/src/quotes/packages.ts`, `packages/domain/src/quotes/package-edit.ts` (`getPackage` adds seasons), `packages/api/src/routers/packages.ts`, `apps/web/src/i18n/messages/en-IN/errors.json`, `apps/web/src/i18n/messages/en-IN/audit.json`

**Interfaces:**
- Consumes: Task 1's model, Task 2's `roomPrices`, `SeasonPrices`.
- Produces: contracts `packageSeason = z.object({ id, label, startsOn: calendarDate, endsOn: calendarDate, prices: roomPrices })`; `savePackageSeasonInput = z.strictObject({ packageId, seasonId: recordId.optional(), label: text(60).min(1), startsOn, endsOn, prices: roomPrices })` refined `endsOn >= startsOn` and at least one price; `removePackageSeasonInput = z.strictObject({ seasonId })`; `packageDetail.seasons: packageSeason[]` (ordered by `startsOn`). Domain: `seasonsOf(tx, packageId): Promise<SeasonPrices & { id: string }[]>`, `savePackageSeason(tx, access, input): Promise<{ id: string }>`, `removePackageSeason(tx, access, seasonId): Promise<void>`. Router: `packages.saveSeason`, `packages.removeSeason` on the `editor` builder. Reason `PACKAGE_SEASON_OVERLAPS` (CONFLICT; pre-checked, and the constraint's error mapped as `overlapOnExclusionViolation` does in `suppliers/rates.ts:112`). Audit actions `package.season-saved`, `package.season-removed` (entity `quote_template`, the package's id; before/after hold label, dates and prices).

- [ ] **Step 1: Failing tests** (`openWorld` from `../bookings/support.js`): `"saves seasons in date order, and refuses one that overlaps"` (Nov, then 2026-11-25..12-05 → `PACKAGE_SEASON_OVERLAPS`; the same dates for another package are fine); `"changes and removes a season, each audited"`; `"another agency's season is not found"`.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain exec vitest run test/quotes/package-seasons.test.ts` → FAIL.
- [ ] **Step 3:** Implement; add the sentences to `errors.json` and `audit.json`.
- [ ] **Step 4:** Same command, then `pnpm --filter @travel-crm/web exec vitest run test/i18n` (or the messages tests that check reasons and actions) → PASS.
- [ ] **Step 5:** Commit `feat(quotes): seasons with room prices on a package`.

### Task 4: Group fields and "AI can sell"

**Files:**
- Modify: `packages/contracts/src/quotes/packages.ts`, `packages/domain/src/quotes/package-edit.ts`, `packages/api/src/routers/packages.ts`, `errors.json`, `audit.json`
- Test: `packages/domain/test/quotes/package-selling.test.ts`

**Interfaces:**
- Consumes: Task 3's `seasonsOf`, Task 2's `priceOn`.
- Produces: `packageKinds = ["custom", "group"]`; `packageFields` gains `kind`, `roomTypes: z.array(roomType).max(6)` (unique), `pricesIncludeGst`, `advancePerPersonPaise: paise.nullable()`, `paymentDetails: text(1000)`, `pickupPoints: text(500)`, `startCity: text(80)`, `weeklyDays: z.array(z.int().min(0).max(6)).max(7)` (unique), `departureMonths: z.array(z.int().min(1).max(12)).max(12)` (unique), `seatsPerDeparture: z.int().min(1).max(MAX_SEATS).nullable()`; `packageDetail` gains `sellable: boolean` and `sellGaps: SellGap[]`; `sellGaps = ["room_types", "prices", "advance", "departures", "from_price"]`; `setPackageSellableInput = z.strictObject({ packageId, sellable: z.boolean() })`. Domain: `packageSellGaps(tx, packageId, today): Promise<SellGap[]>` (group: no room types → `room_types`; no season ending on or after today and no open linked departure from today with a price for an offered type → `prices`; no advance → `advance`; no open linked departure from today → `departures`; custom: no from price → `from_price`), `setPackageSellable(tx, access, input, today)`: turning on with gaps throws `PACKAGE_NOT_READY_TO_SELL` (VALIDATION); turning off always works; audit `package.sellable-changed`. Router `packages.setSellable` on the `publisher` builder (`freshProcedure.requires("quotes:edit", "settings:manage")`).

- [ ] **Step 1: Failing tests:** `"a group package can't be sold until it has room types, prices, an advance and a departure"` (gaps listed in that order, then none); `"a custom package needs a from price"`; `"turning selling off always works, and both are audited"`; `"saving group fields keeps them"`.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain exec vitest run test/quotes/package-selling.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(quotes): group trip fields, and a package the AI may sell`.

### Task 5: Departures linked to a package, made from its weekly days

**Files:**
- Create: `packages/domain/src/departures/package-departures.ts`, `packages/domain/test/departures/package-departures.test.ts`
- Modify: `packages/contracts/src/departures/departures.ts` (`departureFields` gains `templateId: recordId.nullable()`, `prices: roomPrices`; `listDeparturesInput` gains `templateId: recordId.optional()`), `packages/domain/src/departures/departures.ts` (`createDeparture`, `updateDeparture`, `listDepartures`), `packages/domain/src/quotes/packages.ts` (`deletePackage`), `packages/api/src/routers/packages.ts` (after `update`), `apps/api/src/worker-jobs.ts` (the nightly schedule), `errors.json`, `audit.json`

**Interfaces:**
- Consumes: Task 4's group fields.
- Produces: `DEPARTURE_HORIZON_DAYS = 84`; `generatePackageDepartures(tx, actor: Actor, packageId: string, today: CalendarDate): Promise<{ created: number }>`: for a group package with weekly days, nights and seats per departure, a departure for each day from `today + 1` to `today + 84` whose weekday is in `weeklyDays` and month in `departureMonths` (all months when empty), unless a linked departure (any status, deleted ones included) already starts that day; title = package name, destination = package's, `endDate = startDate + nights`, `seatsTotal = seatsPerDeparture`, no own prices; audited per departure as `createDeparture` does. Queue `packages.generate-departures`, cron `"20 3 * * *"`, `Asia/Kolkata`, every agency with a group package, as the other nightly per-agency jobs iterate. The `packages.update` procedure calls it after saving when weekly days, months, nights or seats changed. A linked departure takes the package's destination; one with own prices sets `pricePaise` to its lowest price, so today's lists keep a per-person figure. `deletePackage` refuses a package with linked departures: `PACKAGE_HAS_DEPARTURES` (CONFLICT).

- [ ] **Step 1: Failing tests** (`./support.js` helpers): `"makes the Friday and Saturday departures of the next twelve weeks"` (today Mon 2026-11-02 → first Fri 2026-11-06, 24 departures); `"only in the months chosen, across the new year"` (months [12, 1], today 2026-11-20 → December and January only, none in February); `"never makes again a departure staff cancelled or deleted"`; `"running twice makes nothing new"`; `"a package with departures can't be deleted"`; `"lists a package's departures"`.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain exec vitest run test/departures/package-departures.test.ts` → FAIL.
- [ ] **Step 3:** Implement, register the schedule, add sentences.
- [ ] **Step 4:** Same command, then `pnpm --filter @travel-crm/api-server exec vitest run test/worker-jobs` (the schedule list test) → PASS.
- [ ] **Step 5:** Commit `feat(departures): departures of a package, made from its weekly days`.

### Task 6: A group quote

**Files:**
- Create: `packages/domain/src/quotes/group-quote.ts`, `packages/domain/test/quotes/group-quote.test.ts`
- Modify: `packages/contracts/src/quotes/packages.ts`, `packages/api/src/routers/packages.ts`, `errors.json`

**Interfaces:**
- Consumes: Task 2 (`priceOn`, `totalFor`, `exTaxSubtotal`), Task 3 (`seasonsOf`), departures' `findDeparture`, `seatsSoldAndHeld`, `countsOf`, `stateOf`, quotes' `createQuote`, `indiaGst`.
- Produces: `makeGroupQuoteInput = z.strictObject({ leadId, packageId, departureId, rooms: z.array(roomBooking).min(1).max(6) })`; `makeGroupQuote(tx, access, input, context: QuoteContext, today: CalendarDate): Promise<QuoteDetail>`: one line per room type, quantity 1, described "<package name>, <room type> × <people>" (words from the quotes messages), `departureId` set, the package's tax rate; with prices including GST each line carries its share of `exTaxSubtotal` (the remainder on the last line). Reasons: `DEPARTURE_NOT_OPEN` (not linked to this package, not open, cut off or past), `NOT_ENOUGH_SEATS`, `NO_PRICE_FOR_DATE`, `ROOM_SPLIT`, `ROOM_NOT_PRICED`. Router `packages.makeGroupQuote` on the `maker` builder.

- [ ] **Step 1: Failing tests:** `"three in triple on a November departure: ₹20,997 told, ₹20,997 quoted"` (total within 2 paise, GST inside); `"a premium batch is priced from its own prices"`; `"refuses a full, closed or past departure, and too few seats"`; `"refuses a date no season prices"`; `"prices without GST add it on top"`.
- [ ] **Step 2:** `pnpm --filter @travel-crm/domain exec vitest run test/quotes/group-quote.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(quotes): a group trip's quote from its departure and rooms`.

### Task 7: Package files: brochures and the payment QR

**Files:**
- Create: `packages/domain/src/quotes/package-files.ts`, `packages/domain/test/quotes/package-files.test.ts`
- Modify: `packages/contracts/src/files/attachments.ts`, `packages/domain/src/files/record-types.ts`, `packages/contracts/src/quotes/packages.ts`, `packages/api/src/routers/packages.ts`

**Interfaces:**
- Consumes: the files service as `package-photos.ts` uses it.
- Produces: `PACKAGE_BROCHURE_RECORD_TYPE = "package_brochure"` (PDF, JPEG, PNG, WebP; `MAX_PACKAGE_BROCHURE_BYTES` = 10 MB; at most `MAX_PACKAGE_BROCHURES = 5`), `PACKAGE_PAYMENT_QR_RECORD_TYPE = "package_payment_qr"` (JPEG, PNG, WebP; 2 MB; one: a new one replaces the old after it is confirmed). `requestPackageFileUpload(deps, access, { packageId, kind: "brochure" | "payment_qr", fileName, contentType, sizeBytes })`, `confirmPackageFile(deps, access, { packageId, kind, attachmentId })`, `removePackageFile(deps, access, { packageId, kind, attachmentId })`, `listPackageFiles(deps, access, packageId): Promise<{ brochures: PackageFile[]; paymentQr: PackageFile | null }>` with `PackageFile = { attachmentId, fileName, contentType, url }`. Router `packages.files`, `requestFileUpload`, `confirmFile`, `removeFile` on `editor`.

- [ ] **Step 1: Failing tests:** `"keeps up to five brochures"`; `"a new payment QR replaces the old one"`; `"refuses a PDF as the QR and a sixth brochure"`.
- [ ] **Step 2–4:** Run `vitest run test/quotes/package-files.test.ts` → FAIL; implement; → PASS.
- [ ] **Step 5:** Commit `feat(quotes): a package's brochures and payment QR`.

### Task 8: The public page lists a package's own departures

**Files:** Modify `packages/domain/src/departures/public-list.ts` and its caller in `packages/domain/src/package-pages/read.ts`; test in `packages/domain/test/package-pages/`.

**Interfaces:** `publicDepartures` takes the package: a package with linked departures lists those (open, from today, not cut off, 12 at most), each with its price from `priceOn` (the lowest offered); a package without lists by destination as today.

- [ ] **Step 1:** Failing test `"a group package's page lists its own departures with their season price"`.
- [ ] **Step 2–4:** Run → FAIL; implement; → PASS (the existing package-page tests still pass).
- [ ] **Step 5:** Commit `feat(package-pages): a group package shows its own departures`.

### Task 9: "We also plan custom trips"

**Files:** Modify `packages/contracts/src/ai/ai.ts` (`saveAiSettingsInput`, `aiSettings`: `customTrips: z.boolean()`), `packages/domain/src/ai/settings.ts`, `apps/web/src/ai/ai-settings-screen.tsx` (a Switch with an `InfoHint`), the AI messages file; test beside the AI settings tests.

- [ ] **Step 1:** Failing test `"saves whether the agency plans custom trips"` (off by default).
- [ ] **Step 2–4:** Run → FAIL; implement; → PASS.
- [ ] **Step 5:** Commit `feat(ai): an agency says whether it plans custom trips`.

### Task 10: The package editor: group fields and selling

**Files:**
- Create: `apps/web/src/packages/group-fields.tsx` (rendered inside `PackageForm` when the kind is group), `apps/web/src/packages/sell-card.tsx` (beside `PublishCard`)
- Modify: `apps/web/src/packages/package-form.tsx`, `apps/web/src/packages/package-screen.tsx`, `apps/web/src/packages/use-packages.ts`, `apps/web/src/i18n/messages/en-IN/packages.json`
- Test: `apps/web/test/packages/group-fields.test.tsx`, `apps/web/test/packages/sell-card.test.tsx`

**Interfaces:** `GroupFields` takes the form's control: kind (`ChoiceField`, inline), room types and weekly days and months (registry toggle group or checkboxes), seats per departure, prices include GST (Switch), advance per person (`MoneyField`), payment details, pickup points, start city (`TextField`). `SellCard` shows the switch, refused while gaps remain, the gaps as a list in words, and asks `useWriteAccess` with the same kind the package's other changes use.

- [ ] **Step 1:** Failing component tests: `"group fields appear only for a group package"`; `"the switch is off with the gaps listed until the package is ready"`.
- [ ] **Step 2–4:** `pnpm --filter @travel-crm/web exec vitest run test/packages` → FAIL; implement; → PASS.
- [ ] **Step 5:** Commit `feat(web): group trip fields and "AI can sell" on a package`.

### Task 11: The package editor: seasons, departures and files

**Files:**
- Create: `apps/web/src/packages/seasons-card.tsx`, `apps/web/src/packages/season-dialog.tsx` (`FormDialog`, two `DateField`s, a `MoneyField` per offered room type), `apps/web/src/packages/package-departures-card.tsx` (the next linked departures: day with `formatCalendarDay`, title, seats left, a `TextLink` to each), `apps/web/src/packages/package-files-card.tsx` (`uploadFile()`, brochures and the QR)
- Modify: `package-screen.tsx`, `use-packages.ts`, `packages.json`; the departure form gains the room prices for a linked departure (its single price field hidden then)
- Test: `apps/web/test/packages/seasons-card.test.tsx`

- [ ] **Step 1:** Failing tests: `"lists seasons with each offered room's price"`; `"an overlap shows its sentence on the dates"` (`useRefusalOnField`).
- [ ] **Step 2–4:** Run → FAIL; implement; → PASS.
- [ ] **Step 5:** Commit `feat(web): a package's seasons, departures and files`.

### Task 12: Journey

**Files:** Create `apps/web/test/e2e/group-packages-journey.spec.ts`.

- [ ] **Step 1:** The journey: the owner makes "Manali 5N6D" a group package (triple and double, Fridays and Saturdays, 20 seats, advance ₹2,000, prices include GST); adds seasons Nov (triple ₹6,999, double ₹7,799) and Dec–Jan peak; sees the departures; uploads a brochure and a QR; turns "AI can sell" on; makes a group quote for a lead, three in triple on a November departure → ₹20,997.00. `expectAccessible` on each screen, phone and desktop.
- [ ] **Step 2:** `pnpm --filter @travel-crm/web exec playwright test test/e2e/group-packages-journey.spec.ts` → PASS.
- [ ] **Step 3:** `pnpm check` parts that CI runs per job (typecheck, lint, the touched packages' tests) → PASS.
- [ ] **Step 4:** Commit `test(web): a group package from seasons to a quote`.
