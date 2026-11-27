# Packages revamp: a list that sells, a compact calendar on every screen, prices that fit a phone

Owner-led, 2026-11-26 (web revamp). Approved by the owner ("yes looks good to me") after a review of GhoomoIndia's trips on
desktop and the audit camera's phone shots.

## Why

Sales staff open Packages on a phone to answer "when is the next Manali trip, how much, any seats?". Today the list says only
"Group trip · 2 nights · 24 departures ahead", in the number font; every row carries the same two green badges and a blue
delete icon. On a trip's page the departures are a list on a phone (the owner wants the calendar kept on phones), the
desktop calendar is one fat month with half the card empty, the price table is cut off and scrolls sideways on a phone,
long details are right-aligned and cut with "…", and the page's link is at the very bottom.

## Decided

1. **The list**
   - Each trip shows what sells it: its From price, and for a group trip its next departure with the seats left on it
     ("From ₹5,000 · 27 Nov · 20 left"); a custom trip keeps its days/nights words.
   - The number font only on the numbers, never on the whole line.
   - Badges only for what needs attention: the AI is off, the AI can't sell it (its first reason, as today), a group trip
     with no departures ahead. A trip that is fine shows no badge. (The page's state stays on the trip's page.)
   - Delete moves into a row's "⋯" menu (a destructive item, then the existing confirmation).
   - Desktop (768px and up): the registry Table (Trip · From · Next departure · Departures · Status · ⋯). Phone: rows.
   - Not now: search (8 trips today; add it when an agency has many more), photos on rows (owner was told: each would
     cost a storage lookup per trip on every load).
2. **The trip page**
   - "Copy link" and "Open the page" sit in the header, beside the name, while the page is published and the agency's
     pages are on (the Public page card keeps its own).
   - Long details (inclusions, exclusions, pickup points, notes, cancellation notes) sit left under their label at full
     width and are never cut with "…".
   - "Tell the AI what changed" is a single button once the trip has prices; it opens the card in place. A trip with no
     prices yet shows the card open, as today.
   - A season reads once: "Regular · 21 Nov to 18 Dec and 6 Jan 2027 to 18 Dec 2027" (label, a middle dot, ranges joined
     with "and"), in the legend and the price table's header.
   - "Take the page down" is a red (destructive) button. Every red button's fill is deeper (done: 22% of the status-bad
     dot in the tint, 32% on hover, ink words 11:1).
3. **The calendar (owner's choice A)**
   - The month grid on every screen, the phone included; the phone's list view goes. Tapping a day opens its panel (a
     bottom sheet on a phone, as today), an empty day included, which is how a phone adds a departure.
   - Compact days that still show everything: the date, the price and the seats left. About 46px wide on a 390px phone.
   - Colour means the season only (fixed order: green, amber, sky, rose, violet, sand). Seats are words: "20 left",
     "3 left" in bold when 5 or fewer, "Full" with the price struck through, "Cancelled" struck through. A departure in no
     season has no colour and says "No price".
   - Desktop shows two months side by side; the day's panel goes under them.
4. **Prices on a phone**: one season at a time. Season tabs in each season's colour, the season's dates under the tabs on
   one line, then each room type with a full-width price box. The same edits, Save, Undo and season menu as the table.
   Desktop keeps the table.

## Constraints

CLAUDE.md's UI rules: registry components only; no border/divide/ring/shadow classes outside components/ui; brand tokens;
every word in the messages files; 44px targets; Indian formats (formatMoney / rupees, formatCalendarDay); test first.

## Approaches considered

- Calendar: (A) every detail in each compact day, chosen; (B) price only with a coloured seats dot, rejected: the dot's
  colour would clash with the season colours, and seats would need a tap.
- A third-party calendar (Magic UI, Cult UI have none; Origin UI's pricing calendar is the same registry Calendar with a
  custom day) was rejected: the registry Calendar already is that pattern; the problem was size, not the component.
- Prices on a phone: a horizontally scrolling table (today, rejected: cut off, tiny boxes) vs a season at a time (chosen).
