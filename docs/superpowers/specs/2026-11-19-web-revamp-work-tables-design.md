# Web revamp part 2: My tasks and Follow-ups as tabbed tables

Owner-led, 2026-11-19. Follows part 1c (fit at every width, a41f0b50).

## Why

On real data (DadhichTrips, at the owner's 1728px screen) both screens look cluttered and waste space:

- every row carries four or five outlined 52px round buttons: about 100 circles on a screen of 21 rows;
- rows are two lines tall mostly to hold the buttons, so a 360px card shows about three rows;
- cards scroll inside the page: rows are sliced at a card's bottom edge, and Follow-ups' one card stops at 360px with
  the rest of the screen empty;
- names overlap the task's words ("Digvijay", "Prince Bundela"): part 1c let a name shrink below its text.

The owner wants a clear, structured view where people see at once where work is waiting.

## Approaches

- **A. Tabs with counts, one full list:** one section at a time, its count on its tab. Owner: "better".
- **B. List and detail side by side** (DESIGN.md's split view): buttons once, for the selected item. Twice the work;
  kept for later, maybe for Follow-ups alone (the customer's chat beside the follow-up).
- **C. A table** (the owner's pick, after AiGuru's admin tables): columns, fixed widths, text wrapping in its column.

**Chosen: A and C together.** Tabs with counts on top; each tab is one table.

## Decided by the owner

1. Tabs with counts, so people see "I have something to see here".
2. A table with fixed column widths; text wraps inside its column, never over the next one.
3. The stage sits under the customer's name, in the same column (a label to scan by).
4. The table may scroll sideways; the buttons column stays pinned at the right while it does.
5. The buttons become icons only (Done, Call, WhatsApp...), small, so they take minimal space and look clean.

## The design (calls marked "my call" are the controller's, open to the owner)

**Tabs.** Registry Tabs, each trigger with its count (`Overdue 4`).

- My tasks: Overdue · Due today · New leads · AI needs you · Payments due · Trips leaving soon, in that order. A tab
  with nothing in it is hidden; the first with something is selected (my call). The follow-ups line, the day line and
  Add a task stay.
- Follow-ups: Due and Later, with counts; Mine / Everyone stays beside them. The Overdue / Today / Tomorrow groups go:
  rows are in due order and the due time keeps its urgency colour (my call).

**The table.** The registry Table (as on Leads), `table-fixed`:

- column widths are fixed; the flexible text columns share what is left and have a minimum width;
- when the screen is narrower than the columns' sum, the table scrolls sideways inside itself: the Customer column is
  pinned at the left (DESIGN.md: sticky first column) and the buttons column at the right;
- its box reaches at most the bottom of the window and scrolls down inside itself, with the header row pinned; a short
  list is only as tall as its rows (my call: a pinned header and sideways scroll need the table's own scroll box);
- text wraps in its column; a long message stops at three lines with "…" and the full text in its title (my call);
- the next page loads from Show more at the end of the rows, as now;
- pinned cells take the table's background, nothing else: no borders, rings or shadows (UI rule 2).

**Columns** (the content each row shows today, rearranged; no new data):

| Tab | Columns |
|---|---|
| Follow-ups | Customer (name, stage under it) · Remarks (the follow-up's title) · Next step (next move, else last message) · Due · Owner (Everyone only) · buttons: Call, WhatsApp, Done, Snooze, Edit |
| Overdue, Due today | Customer (stage under) · Task · Details (the trip line, Open booking) · Due · buttons: Call, WhatsApp, Done, Snooze |
| New leads | Customer (stage under) · Source · Trip · Waiting · buttons: Call, WhatsApp, Mark contacted |
| AI needs you | Customer · Why (handed over, or the suggestion) · Since · buttons as now (Open chat...) ; the payments-to-check line above the table |
| Payments due | Customer · Amount (mono, right) · Due · buttons: Call, WhatsApp |
| Trips leaving soon | Customer · Trip · Leaves · What's missing · buttons as now |

**The buttons.** Icons only, each with its name as `aria-label` and in a registry Tooltip on hover and focus. 32px to
see with a 44px hit area (DESIGN.md's touch rule: a registry Button size `icon-sm`, its hit area extended as `sm`
extends its height), 12px apart so hit areas never overlap. Done (and Mark contacted) is the row's main move: `ghost`
(blue); the rest `quiet` (ink); WhatsApp keeps its green logo. The buttons column has one fixed width per tab.

**Phone (below 768px).** Six columns can't fit 390px, so a phone keeps the stacked rows (DESIGN.md: below 768px a
table becomes a list): the tabs on top scroll sideways, then the rows, five and Show more, with the same icon buttons.

## Not in this change

Home, the Leads page (its sideways scroll at 768 stays open), sorting by column, the split view (B), a remembered tab.

## Done when

- Unit tests: tabs show counts, empty tabs are hidden, the first non-empty tab is selected; each tab's columns; every
  icon button is named (existing tests that find "Done", "Call"... by name keep passing).
- Journeys on these screens pass.
- On production-shaped data at 390, 768, 1024, 1280, 1440 and 1728: no page scrolls sideways; no text overlaps
  another cell's; every button sits inside the table's box, the buttons column and the Customer column stay in view
  while the table scrolls sideways; no empty space under a long table.
