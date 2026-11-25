# Easy Package Editing, Step 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a group trip's page becomes one page of section summaries with per-section saves and a price calendar. The
hard edits get their own tools: special prices that split the seasons, adding many dates, reopening a cancelled date,
copying a notes line to other trips, and bigger brochures.

**Architecture:**
- **Five new server operations**, each a domain function behind one tRPC procedure, all built on existing audited writes:
  - `departures.reopen`, `departures.addPackageDates`;
  - `packages.saveSpecialPrices`, `packages.updatePart`, `packages.copyNote`.
- **The web page** `/packages/<id>` is rebuilt from four section components. Each section saves through
  `packages.updatePart` with only its own fields.
- **The price calendar** is the registry `Calendar` (react-day-picker 10) with modifiers and a custom day button.

**Tech stack:** TypeScript, Prisma 7.10 on Postgres (row-level security via `db.forOrg`), tRPC, Zod contracts,
Next.js and shadcn registry components, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-easy-package-editing-design.md`. This plan is its step 1. Step 2, the AI
change assistant, gets its own plan.

## Global Constraints

- **Commands:** start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`. "Done" means
  `pnpm check` is green, and each task's own tests pass before its commit.
- **Test first:** write the failing test, watch it fail, then make it pass.
- **TypeScript:** strict; no `any`, no `!` non-null assertions. Each source file starts with a one-line comment saying
  what it is for, and about 200 lines is a smell.
- **Contracts:**
  - Every new input schema is `z.strictObject` in `@travel-crm/contracts`, and every output is `z.object`.
  - Procedures come from `orgProcedure.requires("module:action")`.
- **Data and audit:**
  - Organization data is touched only inside `db.forOrg`.
  - Every staff change records `recordAudit` in the same transaction. A new audit action gets its sentence in
    `apps/web/src/i18n/messages/en-IN/audit.json`, and a new `DomainError` reason gets its sentence in `errors.json`.
- **Formats:** money in integer paise, and dates as `CalendarDate` (`yyyy-mm-dd`).
- **Web components:**
  - shadcn registry components only, with no `border`/`divide-`/`ring-`/`shadow` classes outside `components/ui`.
  - Colours come from brand tokens.
  - Every date input is `DateField`, and dates shown use `formatCalendarDay`.
  - Touch targets are at least 44px.
  - A dialog that sends a request is `FormDialog`/`ConfirmDialog`/`ResponsiveDialog` with `busy`.
- **Words:** every word on screen is a next-intl message in `apps/web/src/i18n/messages/en-IN/packages.json` (or
  `departures.json` for departure words).
- **Data rules to keep:** seasons of one package never overlap (`package_season_no_overlap`), and a package has at most
  one departure per day (`departure_package_day`). Both stay; the new operations keep them true.
- **Public repo:** no agency or person names in code, tests, docs or commit messages.
- **Commits:** Conventional Commits, staging files by name, with no `Co-Authored-By` and no `--no-verify`.
- **Migrations:** this plan needs none. If one becomes necessary, its timestamp must be later than `20261219000100`.

## Review Focus

1. A special-price period that starts on a season's first day, ends on its last day, sits inside one season, spans two
   seasons, or covers a season entirely: the seasons outside the period keep exactly their old days and prices, and no
   two seasons overlap (Task 3 tests every case).
2. A Prices & dates save that changes the weekly days makes and reconciles departures exactly as the old full save did,
   and leaves every other section's fields untouched (Task 4 router test).
3. Add dates on a trip without nights or seats per departure, with a range starting today or earlier, or longer than
   62 days: refused with a sentence, and nothing is created (Task 2 tests).
4. Reopening a cancelled departure whose start date has passed is refused (`DEPARTURE_IN_PAST`), and its cancelled
   bookings stay cancelled (Task 1 tests).
5. At a phone width of 390 px, the calendar's days are tappable (44 px) and the legend wraps with no horizontal scroll
   (Task 11 journey, phone project).

---

### Task 1: Reopen a cancelled departure

**Files:**
- Modify: `packages/domain/src/departures/departure-changes.ts`, adding `reopenCancelledDeparture` beside
  `reopenScheduledDeparture`.
- Modify: `packages/domain/src/departures/index.ts`, to export it.
- Modify: `packages/api/src/routers/departures.ts`, adding procedure `reopen` on `editor`
  (`departures:view` + `departures:edit`), input `departureIdInput`.
- Modify: `apps/web/src/i18n/messages/en-IN/errors.json`, adding `DEPARTURE_IN_PAST` and `DEPARTURE_NOT_CANCELLED`.
- Test: `packages/domain/test/departures/reopen-cancelled.test.ts` (fixtures from `./support.js`: `openWorld`,
  `aDeparture`, `aBookingOn`) and `packages/api/test/departures-reopen-router.test.ts` (`createHarness`, `anAgency`,
  `callerOf`, `refusal` from `./forms-support.js`).

**Interfaces:**
- Produces: `reopenCancelledDeparture(tx: OrgTx, actor: Actor, departureId: string, today: CalendarDate): Promise<void>`
  and tRPC `departures.reopen({ departureId })`.

- [ ] **Step 1: Write the failing tests.**
  - "reopens a cancelled departure: open again, with its seats, the reason cleared and a departure.reopened audit entry";
  - "refuses a departure that isn't cancelled" (code `DEPARTURE_NOT_CANCELLED`, status CONFLICT);
  - "refuses a departure whose start date is before today" (`DEPARTURE_IN_PAST`);
  - "leaves the departure's cancelled bookings cancelled";
  - router: "refuses a member without departures:edit".
- [ ] **Step 2: Run the tests to see them fail.**
  `pnpm --filter @travel-crm/domain test test/departures/reopen-cancelled.test.ts` and
  `pnpm --filter @travel-crm/api test test/departures-reopen-router.test.ts`. Expected: FAIL, not defined.
- [ ] **Step 3: Implement it.** Read the departure with `findDepartureForChange`. Refuse anything but `cancelled`.
  Refuse `startDate < today`. Update to `status: "open", cancelledReason: null`, keeping `seatsTotal`. Audit
  `departure.reopened` with before `{status: "cancelled"}`. The router passes `agencyToday(ctx)`.
- [ ] **Step 4: Run the tests to see them pass.** Same commands. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(departures): a cancelled departure can be reopened while its day is still ahead`.

### Task 2: Add a trip's dates in bulk

**Files:**
- Create: `packages/domain/src/departures/package-dates.ts`, exported from `index.ts`.
- Modify: `packages/contracts/src/departures/departures.ts`, adding `addPackageDatesInput`, `addPackageDatesResult` and
  `MAX_ADDED_DATES`.
- Modify: `packages/api/src/routers/departures.ts`, adding procedure `addPackageDates` on `creator`
  (`departures:view` + `departures:create`), with output `addPackageDatesResult`.
- Modify: `errors.json`, adding `PACKAGE_SCHEDULE_INCOMPLETE` and `DATES_NOT_AHEAD`.
- Test: `packages/domain/test/departures/package-dates.test.ts`, plus contract tests in the same file or
  `packages/contracts/test/departures/package-dates.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export const MAX_ADDED_DATES = 62;
  export const addPackageDatesInput = z.strictObject({
    packageId: recordId,
    from: calendarDate,
    to: calendarDate,
    /** 0 Sunday … 6 Saturday; empty means every day. */
    weekdays: z.array(z.int().min(0).max(6)).max(7),
  }); // refined: to >= from, and at most MAX_ADDED_DATES days from `from` to `to` inclusive
  export const addPackageDatesResult = z.object({
    added: z.array(calendarDate),
    alreadyThere: z.array(calendarDate),
    cancelled: z.array(z.object({ date: calendarDate, departureId: recordId })),
  });
  addPackageDates(tx: OrgTx, actor: Actor, input: AddPackageDatesInput, today: CalendarDate): Promise<AddPackageDatesResult>
  ```
  The result's `cancelled` lists days that hold a cancelled departure, so the web offers Reopen (Task 1).

- [ ] **Step 1: Write the failing tests.**
  - "adds a departure on every day of the range, named after the trip, ending after its nights, with its seats per departure";
  - "adds only the chosen weekdays";
  - "lists days that already have a departure under alreadyThere and adds nothing there";
  - "lists a day holding a cancelled departure under cancelled, with its id, and adds nothing there";
  - "refuses a trip without nights or seats per departure" (`PACKAGE_SCHEDULE_INCOMPLETE`);
  - "refuses a range starting today or earlier" (`DATES_NOT_AHEAD`);
  - contract: "refuses more than 62 days" and "refuses an end before the start".
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @travel-crm/domain test test/departures/package-dates.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Read the package (`findPackage`) and require `kind === "group"`, `nights !== null` and `seatsPerDeparture !== null`.
  - Read the package's departures in the range once, cancelled ones included.
  - Create each new day through `createDeparture`: `title` is the package name, `endDate` is `addDays(day, nights)`,
    prices are all null, `cutoffOn` null, `notes` "" and `templateId` the package id.
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(departures): add a trip's departures for a range of days at once`.

### Task 3: Special prices that split the seasons

**Files:**
- Create: `packages/domain/src/quotes/special-prices.ts`, exported from the quotes index.
- Modify: `packages/contracts/src/quotes/packages.ts`, adding `saveSpecialPricesInput`.
- Modify: `packages/api/src/routers/packages.ts`, adding procedure `saveSpecialPrices` on `editor` with output
  `z.object({ id: z.uuid() })`.
- Test: `packages/domain/test/quotes/special-prices.test.ts` (`openWorld` from `../bookings/support.js`, as in
  `package-seasons.test.ts`).

**Interfaces:**
- Consumes: `savePackageSeason(tx, access, input)` and `removePackageSeason(tx, access, seasonId)` from
  `package-seasons.ts`.
- Produces:
  ```ts
  export const saveSpecialPricesInput = z.strictObject({
    packageId: recordId,
    label: text(60).min(1),
    startsOn: calendarDate,
    /** null: "until I change them". */
    endsOn: calendarDate.nullable(),
    prices: roomPrices,
  }); // refined: endsOn null or >= startsOn; at least one price
  saveSpecialPrices(tx: OrgTx, access: MemberAccess, input: SaveSpecialPricesInput): Promise<{ id: string }>
  ```
- **The algorithm**, since the signature doesn't fix it. Let `start = startsOn` and
  `end = endsOn ?? (endsOn of the season covering start, else addDays(start, 364))`. For each existing season
  overlapping `[start, end]`:
  - inside it entirely: remove it;
  - starting before `start` and ending inside: shorten it to end on `start - 1`;
  - starting inside and ending after `end`: move its start to `end + 1`;
  - starting before `start` and ending after `end`: shorten it to `start - 1`, and add a copy (same label and prices)
    from `end + 1` to its old end.

  Then save the new period. Every write goes through the two functions above, so each is audited and checked. Shrink
  and remove first, then add, all in the caller's transaction.

- [ ] **Step 1: Write the failing tests.** Seasons are given as `[from, to]`:
  - "puts the period inside one season, keeping that season before and after it, with its prices";
  - "shortens a season that ends inside the period";
  - "moves the start of a season that begins inside the period";
  - "removes a season the period covers entirely";
  - "starting on a season's first day and ending on its last replaces that season";
  - "a period spanning two seasons trims both";
  - "until I change them runs to the end of the season it splits";
  - "until I change them with no season covering the start runs 365 days (start + 364)";
  - "a room type given no price stays unsold in the period";
  - "a refused period changes nothing" (e.g. no price at all).
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @travel-crm/domain test test/quotes/special-prices.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement `saveSpecialPrices`** as in the algorithm.
- [ ] **Step 4: Run them to see them pass,** with `test/quotes/package-seasons.test.ts` too. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(quotes): special prices for some dates split the trip's seasons around them`.

### Task 4: Save one section of a trip

**Files:**
- Modify: `packages/contracts/src/quotes/packages.ts`, adding `updatePackagePartInput`.
- Create: `packages/domain/src/quotes/package-part.ts`, exported from the quotes index.
- Create: `packages/api/src/routers/package-save.ts`, holding
  `savePackageWithSchedule(ctx, before: PackageRow, input: UpdatePackageInput)`. It is the schedule-change block now
  inline in `packages.update` (`same(...)` and `changed`, then `reconcilePackageDepartures` and
  `generatePackageDepartures` when `mayMakeDepartures(ctx)`), so `update` and `updatePart` share it.
- Modify: `packages/api/src/routers/packages.ts`, where `update` uses the helper and the new `updatePart` sits on `editor`.
- Test: `packages/domain/test/quotes/package-part.test.ts`, and the router test
  `packages/api/test/package-part-router.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export const updatePackagePartInput = z.strictObject({
    packageId: recordId,
    ...z.object(packageFields).partial().shape,
    newDestinationName: destinationName.optional(),
  }); // refined: names at least one field besides packageId
  mergePackagePart(before: PackageRow, part: UpdatePackagePartInput): UpdatePackageInput
  ```
  `updatePart` merges the part onto the stored package (`findPackage`), then saves the merged input through
  `updatePackage` and `savePackageWithSchedule`.

- [ ] **Step 1: Write the failing tests.**
  - "saves only the given fields and keeps every other field as stored";
  - "runs a full save's checks: a taken slug and a missing from-price are refused";
  - router: "changing weekly days in a part makes the new departures, as a full save does";
  - router: "a part naming no field is refused with 400";
  - router: "refuses a member without quotes:edit".
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement the merge, the helper and `updatePart`.** Move the old `update` body into the helper unchanged.
- [ ] **Step 4: Run them to see them pass,** with `packages/api/test/package-departures-router.test.ts` (it covers `update`).
  Expected: PASS.
- [ ] **Step 5: Commit** with `feat(quotes): save one section of a trip without resending the rest`.

### Task 5: Copy a notes line to other trips

**Files:**
- Create: `packages/domain/src/quotes/copy-note.ts`, exported from the quotes index.
- Modify: `packages/contracts/src/quotes/packages.ts`, adding `copyNoteInput` and `copyNoteResult`.
- Modify: `packages/api/src/routers/packages.ts`, adding `copyNote` on `editor`.
- Modify: `audit.json`, adding `actions.package.note-copied`: "Copied a line into a package's notes".
- Test: `packages/domain/test/quotes/copy-note.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export const copyNoteInput = z.strictObject({ line: text(300).min(1), packageIds: z.array(recordId).min(1).max(50) });
  export const copyNoteResult = z.object({
    copied: z.array(recordId),
    alreadyThere: z.array(recordId),
    tooLong: z.array(recordId),
  });
  copyNoteToPackages(tx: OrgTx, access: MemberAccess, input: CopyNoteInput): Promise<CopyNoteResult>
  ```
  The line goes **first** in the notes (`line + "\n" + notes`). That is the part of the notes the AI's prompt keeps when
  it shortens them.

- [ ] **Step 1: Write the failing tests.**
  - "puts the line first in each chosen trip's notes, with a package.note-copied audit entry";
  - "skips a trip whose notes already have the line";
  - "skips a trip whose notes would pass 3,000 characters";
  - "refuses an id that isn't one of the agency's packages" (`NOT_FOUND`).
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement it** with `tx.quoteTemplate.update` on `notes` and an audit entry per trip.
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(quotes): copy a notes line to other trips`.

### Task 6: Brochures up to 25 MB

**Ruling, for the owner to confirm before this task runs:** raise the brochure limit instead of shrinking files.
- The repository has no PDF image tool, and adding one (a WASM PDF engine) is a large dependency for one feature.
- WhatsApp accepts documents up to 100 MB.
- The limit becomes the app's attachment limit, 25 MB, which covers the 12.9 MB brochure that was refused.
- **If the owner wants shrinking instead,** this task is replaced by a worker job that re-processes the stored PDF.

**Files:**
- Modify: `packages/contracts/src/files/attachments.ts`, setting `MAX_PACKAGE_BROCHURE_BYTES = MAX_ATTACHMENT_BYTES`.
- Modify: the 10 MB words in `packages.json`'s `files.*`.
- Modify: tests asserting 10 MB (`apps/web/test/packages/package-files-card.test.tsx`, the brochure check test,
  `packages/api/test/package-brochures-router.test.ts`, `packages/domain/test/quotes/package-files.test.ts`).

- [ ] **Step 1: Change the tests** to "accepts a 12.9 MB brochure" and "refuses a brochure over 25 MB", and run them to
  see them fail.
- [ ] **Step 2: Change the constant and the words,** and run them to see them pass.
- [ ] **Step 3: Commit** with `feat(packages): brochures up to 25 MB`.

### Task 7: The price calendar

**Files:**
- Create: `apps/web/src/packages/price-calendar-days.ts`, pure helpers:
  - `seasonOn(seasons: PackageSeasonView[], day: CalendarDate): PackageSeasonView | null`;
  - `calendarDaysOf(seasons, departures: DepartureSummary[]): Map<CalendarDate, CalendarDay>`, where
    `CalendarDay = { departure: DepartureSummary | null; seasonIndex: number | null }`.
- Create: `apps/web/src/packages/price-calendar.tsx` (the registry `Calendar` with modifiers `departure`, `cancelled`,
  `full` and one per season index, a custom `DayButton` showing seats left, and a legend of seasons with their room
  prices via `formatMoney`).
- Create: `apps/web/src/packages/calendar-day-actions.tsx`, the menu for a tapped day. In order:
  - no departure: "Add a departure", which calls `departures.addPackageDates` with `from = to = day` and
    `weekdays: []`;
  - open: a link to the departure and "Cancel" (the existing `CancelDepartureDialog`);
  - cancelled and ahead: "Reopen", which calls `departures.reopen`;
  - a day not ahead: no actions.
- Modify: `apps/web/src/departures/use-departures.ts`, adding `addPackageDates` and `reopen` to
  `useDepartureChanges()`, invalidating departures and `packages` queries.
- Modify: `packages.json`, adding the `calendar.*` words.
- Test: `apps/web/test/packages/price-calendar-days.test.ts` and `apps/web/test/packages/price-calendar.test.tsx`
  (`renderWithApi`, `stubApi`, `aPackage`).

**Interfaces:**
- Produces:
  `PriceCalendar({ detail, departures, onSelectRange }: { detail: PackageDetail; departures: DepartureSummary[]; onSelectRange(range: { from: CalendarDate; to: CalendarDate }): void })`.

- [ ] **Step 1: Write the failing tests.**
  - helpers: "finds the season a day falls in" and "a day in no season has none";
  - "marks each departure day with its seats left";
  - "marks a cancelled day ahead and offers Reopen, which calls departures.reopen";
  - "a day with no departure offers Add a departure for that day";
  - "a day before tomorrow offers nothing";
  - "lists each season in the legend with its room prices";
  - "choosing a first and last day asks for special prices for that range".
- [ ] **Step 2: Run them to see them fail.**
  `pnpm --filter @travel-crm/web exec vitest run test/packages/price-calendar*`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers, the calendar and the day menu.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(web): a trip's price calendar shows its departures and price periods`.

### Task 8: The Special prices and Add dates dialogs

**Files:**
- Create: `apps/web/src/packages/special-prices-dialog.tsx`, a `FormDialog`. Its fields:
  - label, defaulting to the message `calendar.specialLabel`;
  - from (`DateField`);
  - to (`DateField`), or an "Until I change them" switch that sends `endsOn: null`;
  - one `MoneyField` per room type the trip sells.

  It calls `packages.saveSpecialPrices`.
- Create: `apps/web/src/packages/add-dates-dialog.tsx`, a `FormDialog` with from, to and weekdays (`Picks` from
  `group-fields.tsx`; none picked means every day). It calls `departures.addPackageDates`. The result says how many
  were added, lists days already there, and offers Reopen beside each cancelled day.
- Modify: `apps/web/src/packages/use-packages.ts`, adding `saveSpecialPrices`, `updatePart` and `copyNote` to
  `usePackageChanges()`, each invalidating `packages.pathKey()` and `quotes.packages.pathKey()`.
- Test: `apps/web/test/packages/special-prices-dialog.test.tsx` and `apps/web/test/packages/add-dates-dialog.test.tsx`.

- [ ] **Step 1: Write the failing tests.**
  - "saves special prices with the dates and room prices typed";
  - "Until I change them sends no end date";
  - "shows only the room types the trip sells";
  - "sends the range and the picked weekdays and says how many dates were added";
  - "lists days already taken, and offers Reopen beside a cancelled one".
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement both dialogs and the hooks.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(web): dialogs for special prices and adding many dates`.

### Task 9: The one-page trip layout

**Files:**
- Rewrite: `apps/web/src/packages/package-screen.tsx`, with a header, a side index of `TextLink`s to the section anchors,
  and the four sections.
- Create:
  - `package-header.tsx`, the status line (AI sells it, page live, from-price, next departure, dates ahead);
  - `package-section.tsx`, a registry `Card` with heading, anchor id, summary, and Edit → editor with Save and Cancel;
  - one file per section: `section-prices.tsx`, `section-itinerary.tsx`, `section-details.tsx`, `section-page.tsx`.
- Each section editor is a `useCheckedForm` form sending `packages.updatePart` with **only its fields**:
  | Section (anchor) | Fields it saves | What else it shows |
  |---|---|---|
  | **Prices & dates** (`prices-and-dates`) | kind, roomTypes, weeklyDays, departureMonths, seatsPerDeparture, advancePerPersonPaise, startCity | Group trips: `PriceCalendar`, `SeasonsCard` with an "Add special prices" button (Task 8), "Add dates" (Task 8), `PackageDeparturesCard`. Custom trips: `TiersCard` and fromPricePaise. |
  | **Itinerary** (`itinerary`) | name, title, destinationId/newDestinationName, nights, days | |
  | **Details & rules** (`details-and-rules`) | inclusions, exclusions, pickupPoints, notes, cancellationNotes, defaultTravellerLevel, pricesIncludeGst | |
  | **Page & files** (`page-and-files`) | slug, summary, highlights, priceDisplay, fromPricePaise | `PublishCard`, `SellCard`, `PackagePhotos`, `PackageFilesCard`, and `TiersCard` for group trips |
- Move the field groups out of `package-form.tsx` and `group-fields.tsx` into the section editors. Keep
  `package-form-values.ts` helpers where they still fit, and delete what nothing uses.
- Modify: `sell-card.tsx`, pointing the gap links to the new anchors (`#prices-and-dates`, `#itinerary`,
  `#details-and-rules`, `#page-and-files`).
- Test: rewrite `apps/web/test/packages/package-screen.test.tsx`, and update tests that rendered `PackageForm`
  (`group-fields`, `package-destination`, `slug` tests).

- [ ] **Step 1: Write the failing tests.**
  - "shows the status line and four section summaries";
  - "editing Itinerary sends updatePart with only the itinerary's fields" (assert the keys with `lastInputTo`);
  - "Cancel leaves the section unchanged";
  - "each gap link's anchor holds its section's heading";
  - "a custom trip shows no calendar and no departures";
  - "a member without quotes:edit sees no Edit buttons".
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @travel-crm/web exec vitest run test/packages`. Expected: FAIL.
- [ ] **Step 3: Implement the layout and the editors.**
- [ ] **Step 4: Run the whole `test/packages` folder,** then `pnpm --filter @travel-crm/web exec tsc --noEmit`.
  Expected: PASS, with no type errors.
- [ ] **Step 5: Commit** with `feat(web): a trip's page is four sections, each saved on its own`.

### Task 10: Copy a line to other trips (web)

**Files:**
- Create: `apps/web/src/packages/copy-note-dialog.tsx`, opened from "Copy a line to other trips" in **Details & rules**.
  - Fields: the line, defaulting to the notes' first line, and a checklist of the agency's other trips (from
    `quotes.packages`).
  - It calls `packages.copyNote`, and the result names the trips skipped and why.
- Test: `apps/web/test/packages/copy-note-dialog.test.tsx`.

- [ ] **Step 1: Write the failing tests.**
  - "copies the line to the chosen trips and says which already had it";
  - "never lists the trip being edited";
  - "says which trips were skipped as too long".
- [ ] **Step 2: Run them to see them fail. Step 3: Implement it. Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** with `feat(web): copy a notes line to other trips`.

### Task 11: Journeys

**Files:**
- Modify: `apps/web/test/e2e/group-packages-journey.spec.ts`, `package-pages-journey.spec.ts` and
  `rates-packages-journey.spec.ts` wherever they used the old form's single "Save package".
- Create: `apps/web/test/e2e/package-calendar-journey.spec.ts`. It uses the helpers `aPackage`, `updatePackage`,
  `aSeason` (support/packages), `signInByEmail` and `expectAccessible`.

- [ ] **Step 1: Write the journey.**
  1. A group trip with a season and Friday departures.
  2. Open its page and "Add dates" for every day of a week four weeks ahead: the calendar shows them.
  3. Select two days and save special prices: the seasons list shows the split.
  4. Cancel a day, then Reopen it from the calendar.
  5. Edit Itinerary's title and save: the summary shows it and other sections are unchanged.
  6. `expectAccessible` on the page.
  7. On the phone project, the calendar has no horizontal scroll.
- [ ] **Step 2: Update the three journeys to the new sections.**
- [ ] **Step 3: Run them:**
  `pnpm e2e -- package-calendar-journey group-packages-journey package-pages-journey rates-packages-journey`.
  Expected: PASS on desktop and phone.
- [ ] **Step 4: Commit** with `test(web): journeys for the trip page's sections and calendar`.
