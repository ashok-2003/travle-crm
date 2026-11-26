# Packages revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Packages list shows what sells each trip, a trip's calendar is a compact month grid on every screen, prices
fit a phone, and the trip page's details and link are easy to reach.

**Architecture:** Task 1 adds a group trip's next departure (date and seats left) to the list's contract and rebuilds the
list (table on desktop, rows on a phone). Task 2 is the trip page's header, details, AI box and season words. Task 3 is the
departures calendar. Task 4 is the phone's price editor. Tasks 1, 2 and 3 run in parallel worktrees; Task 4 follows Task 2
in its worktree. They meet only in `apps/web/src/i18n/messages/en-IN/packages.json` (each adds its own keys).

**Tech Stack:** Next.js 16.4 (never `next upgrade`), React 19, Tailwind v4, shadcn radix-nova registry, react-day-picker
(through the registry Calendar), next-intl, TanStack Query + tRPC, Prisma 7.10, Vitest, Playwright audit camera.

**Spec:** `docs/superpowers/specs/2026-11-26-packages-revamp-design.md`

## Global Constraints

- CLAUDE.md binds: registry components only (Table, Item, DropdownMenu, Tabs, Calendar, Sheet, Card, Button…); no
  `border`/`divide-`/`ring-`/`shadow` classes outside `components/ui`; brand tokens only; every word in
  `src/i18n/messages/en-IN/packages.json`; 44px targets; Indian formats (`rupees`/`formatMoney`, `formatCalendarDay`);
  strict TypeScript, no `any`, no `!`; one-line purpose comment atop each new file; least code; test first.
- Contracts: outputs are `z.object`; a field this release adds is read on the web through `mayBeMissing`
  (`lib/older-api.ts`) while the api rolls out.
- Season colours: `seasonTint(index)` (`packages/season-colours.ts`), unchanged; colour means the season only.
- Seats: "few" is 5 or fewer seats free (`FEW_SEATS = 5`, one constant, in `departure-calendar-days.ts`).
- Commits: Conventional, lowercase subject, header ≤ 100 characters, staged by name, `git commit -m ... -- <paths>`,
  no Co-Authored-By, never push, never `git stash`, never `git add -A`.
- Run commands under Node 24: `source ~/.nvm/nvm.sh && nvm use >/dev/null && …`. Run tests in the FOREGROUND.

## Review Focus

1. A 360px phone: a calendar day with "₹12,300" and "20 left" never spills out of its cell, and the grid never makes the
   page scroll sideways.
2. A departure in no season (no price), a cancelled one, a full one, and a departure on a day shown from the next or
   previous month: each reads right in the grid and in its accessible name.
3. A member without `quotes:edit`: the list has no "⋯" menu, the phone's season tabs are read-only, the header's Copy link
   still works.
4. Unsaved price edits survive switching season tabs on a phone, and a season's menu is disabled while there are unsaved
   edits, as in the table.
5. An older api without `nextDeparture`: the list still renders (the From price and the departures count).

---

### Task 1: The Packages list

**Files:** `packages/contracts/src/quotes/packages.ts` (`quotePackage`), `packages/domain/src/quotes/packages.ts`
(`listPackages`), its domain test (the existing list test under `packages/domain/test/quotes/`), `apps/web/src/packages/packages-screen.tsx`
(split into small files if it grows past ~150 lines, e.g. `packages-table.tsx`, `package-row-menu.tsx`), `packages.json`
(`packages.list`), `apps/web/test/packages/` list test.

**Interfaces:** Produces `quotePackage.nextDeparture: { startDate: CalendarDate; seatsFree: number } | null`: a group
trip's first departure from the agency's today that is not cancelled (seats free as the departures calendar counts them);
null for a custom trip or a group trip with none.

- [ ] Failing domain test: two group trips and a custom one; the first trip's next departure is its earliest
  non-cancelled one from today with its seats free; a cancelled earlier one is skipped; the custom trip's is null; the
  list's query count does not grow with the number of trips (one batch, like `groupFromPrices`).
- [ ] Implement in `listPackages` (reuse the departures module's seat counting through its public `index.ts`; respect
  dependency-cruiser's layering; if quotes may not call departures, compute free seats from the same tables in the
  quotes module's own query and say so in the report).
- [ ] Failing web tests (`renderWithApi` + `answerApi`):
  - wide screen: a Table with headers Trip, From, Next departure, Departures, Status; a row reads
    "Manali 2N/3D", "Group trip · 2 nights", "₹5,000", "27 Nov · 20 left", "24";
  - phone: a row reads the name and "From ₹5,000 · 27 Nov · 20 left";
  - 5 or fewer seats free shows "3 left" in bold; 0 shows "Full";
  - badges: none for a trip the AI sells; "AI off" when `aiSellable` is false; the existing "AI can't sell: …" when
    `aiGap` is set; "No departures ahead" for a group trip with `departuresAhead` 0; no page badge;
  - Delete is a "⋯" menu item (`aria-label` "More for <name>") that opens the existing confirmation; no menu without
    `quotes:edit`;
  - an older api without `nextDeparture` renders the From price and the departures count.
- [ ] Implement with the registry Table (desktop, `useWideScreen`) and Item rows (phone); the `numbers` class only on
  spans holding numbers.
- [ ] Run the domain test (throwaway Postgres via Docker), the web tests, typecheck and lint for the touched packages.
- [ ] Commit `feat(web): the packages list shows each trip's price, next departure and seats left`.

### Task 2: The trip page's header, details, AI box and season words

**Files:** `apps/web/src/packages/package-header.tsx`, `apps/web/src/components/details.tsx` (a `stacked?: boolean` on
`Detail`: the value always under the label, left, full width), `apps/web/src/packages/section-details.tsx` (stacked for
inclusions, exclusions, pickup points, notes, cancellation notes; no `line-clamp`), `apps/web/src/packages/package-screen.tsx`
and/or `ai-changes/ai-changes-card.tsx` (collapsed to a button once the trip has prices), `apps/web/src/packages/season-words.ts`
and the legend's message (`packages.departuresCalendar.legendRanges`) and `price-table-parts.tsx`'s `SeasonHeadCell`,
`packages.json`, tests in `apps/web/test/packages/` and `apps/web/test/components/` for Details.

- [ ] Failing tests:
  - header: with the page published and pages on, "Copy link" (the `CopyButton`, copying
    `${origin}/a/<agencyCode>/<slug>`, as `publish-card.tsx` builds it) and "Open the page" (new tab) beside the title;
    neither when unpublished or pages are off;
  - Details: a `stacked` row puts its value under its label even when both would fit on one line;
  - trip details: a 6-line inclusions value shows all 6 lines (no clamp);
  - AI box: a group trip with any season price, or a custom trip with a From price or a tier, shows a button
    "Tell the AI what changed"; pressing it shows the card with the focus in "What changed"; a trip with no prices shows
    the card open;
  - season words: two ranges read "21 Nov to 18 Dec and 6 Jan 2027 to 18 Dec 2027"; the legend reads
    "Regular · 21 Nov to 18 Dec and 6 Jan 2027 to 18 Dec 2027".
- [ ] Implement; run the tests, typecheck, lint.
- [ ] Commit `feat(web): a trip's link in its header, its details in full, and the ai box as a button`.

### Task 3: The departures calendar, compact on every screen

**Files:** `apps/web/src/packages/departures-card.tsx`, `departures-month.tsx`, `departure-calendar-days.ts`
(`FEW_SEATS`), delete `departures-agenda.tsx` and its test, `packages.json` (`packages.departuresCalendar`), tests in
`apps/web/test/packages/`, and audit shots in `apps/web/test/e2e/audit/27-rates-packages.audit.ts`: a group trip with two
seasons and departures (its page, and the Packages list) on phone and desktop.

**Interfaces:** Consumes `useDepartureCalendar(packageId, month)` (one month a call) and `seasonTint`.

- [ ] Failing tests:
  - a phone (`screenIs("narrow")`) shows the month grid (a grid of days), not a list; tapping an empty day opens the
    sheet with the panel to add a departure; tapping a departure's day opens its panel;
  - a day reads its date, its price and "20 left"; 5 or fewer: "3 left" in bold; full: "Full" with the price struck
    through (`line-through`); cancelled: "Cancelled" struck through; a departure in no season: no season fill and
    "No price"; each day's accessible name says the same;
  - a wide screen shows two months side by side (this month and the next, both read) and the day's panel under them;
    the arrows move by one month.
- [ ] Implement with the registry Calendar (`numberOfMonths={2}` on a wide screen) and its custom day button. Phone days
  fill the card's width (seven equal columns, ~46px on a 390px phone) with a fixed minimum height; desktop days about
  56px wide. Text in the brand's caption size; at a 360px phone the price must fit its cell (if "₹" does not fit, the
  phone drops it and the accessible name keeps it).
- [ ] Add the audit shots; run `pnpm --filter @travel-crm/web exec playwright test --config playwright.audit.config.ts 27-rates-packages`
  with `AUDIT_OUT` in the scratchpad; look at the phone and desktop shots of the group trip and fix what they show
  (a 360px check too: resize the viewport in the audit's own step, or by a throwaway spec, deleted after).
- [ ] Run the tests, typecheck, lint.
- [ ] Commit `feat(web): a compact departures calendar on every screen, two months on a desktop`.

### Task 4: Prices on a phone, a season at a time

**Files:** `apps/web/src/packages/price-table.tsx` (keeps the state; renders the table on a wide screen and the tabs on a
phone), a new `price-season-tabs.tsx`, `packages.json`, tests in `apps/web/test/packages/`.

**Interfaces:** Consumes `PriceTable`'s `rows`, `cells`, `setCells`, the season menu's `actionsOf`/`choose`, and Task 2's
season words.

- [ ] Failing tests (`screenIs("narrow")`):
  - the registry Tabs, one per season, named by the season's label; the selected tab's panel says the season's dates on one
    line and has a full-width price field per room type ("Double", "Triple", "Quad"), with "Not sold" for a blank one;
  - typing in Christmas, switching to Regular and back keeps the typed price; Save sends the same input as the table;
  - a season's menu is in its tab panel and is disabled while there are unsaved edits; read-only without `quotes:edit`;
  - a wide screen still shows the table.
- [ ] Implement; each tab and its panel carry the season's tint (`seasonTint(index)`); run the tests, typecheck, lint.
- [ ] Commit `feat(web): a trip's prices on a phone, a season at a time`.
