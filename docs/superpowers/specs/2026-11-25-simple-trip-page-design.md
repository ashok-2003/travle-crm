# A simple trip page, and the AI change assistant: design

Follows `2026-11-24-easy-package-editing-design.md` (step 1, live in PR #80). The owner clicked through a real agency's
trips on 2026-11-25 and found step 1 too hard for an agency owner who is not technical. This document is what they
approved in chat: what goes, what gets fixed, the page that is left, and the AI change assistant (that document's step
2, built now, with the changes below).

## Why

A group trip comes down to two things: **when it leaves** (departures) and **how much it costs** (prices by season).
Step 1 spread them over seven places and four words (dates, departures, batches, seasons):

- four ways to add a departure (a tapped day, Add dates, the Add a departure form, the weekly days in Edit);
- "Add a season" beside "Add special prices", where only the second works once the seasons cover the year;
- the same prices under the calendar and in the Seasons card, the regular price stored as two rows around Christmas;
- a Departures card repeating the calendar;
- no price anywhere for a departure: the calendar shows the seats left (an unlabelled "40"), the tapped day's panel
  shows neither, the departure's own page shows seats only;
- a "From" price typed by hand, which goes stale;
- itinerary days that cannot be reordered;
- regular prices that end (13 Nov 2027), with no price after;
- the packages list saying "AI sells it" when the trip says "AI doesn't sell it" (the list reads the switch alone).

**Goal:** an agency owner looks at the calendar and knows: my departure is on this date, at this price, with these
seats left. Adding a season is one button at the top. A change they describe in their own words, the AI makes.

**Words:** "departure" (the owner's own word) for a day the group leaves, everywhere on the agency's screens. "Season"
for a set of prices over some dates. No "batch", no "dates" button, no "special prices".

## The page, top to bottom (group trips)

1. **Header:** name, "AI sells it" or "AI doesn't sell it: <first reason>" (a link to the switch), page live or not,
   "From ₹X" and the next departure.
2. **Tell the AI what changed** (the assistant, below).
3. **Prices:** **+ Add season** first, then one table: a row per room type sold, a column per season, the price per
   person in each cell, typed in place, one Save for the table. A blank cell is "not sold" for that season. **+ Room
   type** adds a row; a row's remove clears it from every season. Each column wears its season's colour, shows its
   dates ("18 Dec to 1 Jan", "all other days" for the open-ended one), and has Change dates, Rename and Remove.
4. **Departures:** the calendar.
   - Desktop: a large month grid (Google Calendar's month view). Every day wears its season's colour, with a legend.
     A day with a departure shows its lowest price and the seats left ("₹5,999 · 32 left"); a cancelled one shows
     "Cancelled", a full one "Full". Months by arrows.
   - Phone: the same month as a list of its departures ("Fri 4 Dec · ₹5,999 · 32 of 40 left").
   - Tapping a day opens a panel (a side panel on a wide screen, a sheet on a phone):
     - a departure: its season and each room's price that day, seats booked and left, and Change seats, Price for
       this departure only, Cancel this departure (the existing flow with its reason), Open (its page: bookings,
       rooming, costs);
     - a cancelled one: Reopen;
     - an empty day ahead: **Add a departure on Fri 4 Dec** with its seats (the trip's default) and **Repeat every
       week** until a date or with no end;
     - a past day: what it was, nothing to change.
   - Under the calendar, in plain words: the repeats ("Every Friday in Nov, Dec and Jan; new departures appear 12
     weeks ahead", Change, Stop), the seats each new departure gets, and the advance to hold a seat.
5. **Trip details:** itinerary (days with Move up and Move down), inclusions, exclusions, pickup points with where it
   starts, notes, cancellation notes. Copy a line to other trips stays.
6. **Page and AI:** the AI switch with what it still needs at the top, photos, brochures, publish.
7. **More** (closed by default): the page address, the title on a quote, what travellers fill in, prices include GST.

A custom trip keeps its From price, tiers and Calculate from the catalog; none of this changes it.

## Removed from group trips

Add dates; the Add a departure form on the trip page (the departure's own page keeps Change); the Departures card;
the Seasons card and the price list under the calendar; Set special prices from here; Add special prices (folded into
Add season); Tiers; the typed From price and Calculate from the catalog; Departs on and Months it departs as a form
(now the repeats line); the separate Prices & dates summary.

## Fixed

- **A departure's price is shown** on the calendar, in the day panel and on the departure's own page.
- **Price for this departure only** uses the departure's own prices, the form filled with that day's season prices,
  so no room drops out by being left empty; Use the season's prices clears them. The departure's Change form no
  longer shows an empty Destination for a trip's departure.
- **Regular prices can run with no end:** stored as a season ending `OPEN_SEASON_END` (31 Dec 2099), shown as "all
  other days" or "onwards" on the page, the public page and the AI's trip text. A season added "until I change it"
  runs to the day before the next season, or with no end when none follows (this replaces the one-year cap).
- **The From price of a group trip is worked out:** the cheapest room price on a departure ahead (its own price, else
  its season's), never typed.
- **Itinerary days reorder** (Move up, Move down).
- **The packages list** shows the same "AI sells it" as the trip, and the first reason when it doesn't.
- **The summary never contradicts the calendar:** the repeats line describes the weekly rule; one-off departures are
  on the calendar.

## The AI change assistant

As step 2 of the earlier design (inputs, questions, the change table with What / Now / New and ticks, red flags,
grounding by cited lines, apply in one transaction with one audit entry, Undo all, one AI credit per run, Langfuse
prompt with a code fallback, a structured-output call), with these changes:

- It sits at the top of every trip page (group and custom), for whoever holds `quotes:edit` with AI on the plan.
- What it proposes maps onto this page's operations: a season added or changed (dates, prices, rooms not sold), the
  regular prices, departures added (one day, or every week until a date), cancelled or reopened, a departure's own
  price or seats, the repeats, seats for new departures, the advance, note lines added or removed, pickup points,
  inclusions, exclusions, cancellation notes, itinerary days (change, reorder, add, remove), the AI selling on or off.
- Replacing a brochure from an attached PDF is left out of this build (the agency uploads it in Page and AI), to keep
  files out of the apply transaction; the table says so when a PDF looks like a brochure.
- Undo all keeps the before-values of the run in a table of its own (`package_change_run`), offered for the latest
  run while nothing on the trip changed since.

## Constraints

Every rule in CLAUDE.md: shadcn registry components only (a large month grid is the registry Calendar with its own
day content, or registry pieces), no borders or shadows outside `components/ui`, brand tokens only (season colours
reuse the brand's decorative tints), DateField, money in paise, permissions, audit, the request checks, every word in
messages, no agency or person names in the repo. Seasons never overlap, one departure a day per trip: the operations
keep both. A migration's timestamp comes after `20261219000100`.

## Calls I made (the owner can overturn)

- `OPEN_SEASON_END` rather than a schema change for prices with no end.
- "Price for this departure only" uses the departure's own prices, not a one-day season, so the table stays short.
- The weekly repeat stays the stored rule (rolling 12 weeks); a repeat with an end date makes the departures at once.
- Where it starts stays a field, beside pickup points in Trip details.
- No multi-day selection on the calendar: Add season covers date ranges, Repeat covers many departures.
- The brochure replacement is left out of the assistant for now.
