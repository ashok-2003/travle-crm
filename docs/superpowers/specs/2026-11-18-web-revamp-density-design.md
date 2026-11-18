# Web revamp, part 1b: less scrolling on Home, My tasks and Follow-ups

Status: approved by the owner in conversation, 2026-11-18 ("your suggested changes look good"; "make needs you above
the departures"; "departures should show the most recent upcoming, limited to 5 on Home: it's an overview").
Follows `2026-11-18-web-revamp-home-tasks-design.md` (part 1, merged as PR #62).

## Why

With a real agency's data (arrowtrip, desktop 1728×996) the part 1 pages make people scroll far too much: Home is 2.6
screens (Departures uncapped, ~20 rows; a 350px setup card on top; "Needs your attention" last), My tasks 3.2 screens
with only 5 rows a section (rows 110-200px; "View all" expands in place, so opening Overdue's 12 pushed Due today down
750px), and Follow-ups 1.7 screens for 9 items (rows 140-150px, six buttons each). Goal: each page reads at a glance;
opening more of one section never moves the others.

## Decisions

1. **Sections scroll inside themselves (desktop and tablet).** On My tasks (Overdue, Due today, New leads to contact,
   AI needs you, Payments due, Trips leaving soon) and Follow-ups (each section of either tab), a section is a
   fixed-height card showing about 5 rows, the rest reachable by scrolling inside the card (the registry ScrollArea);
   its header keeps the name and count. All of the section's items are in the card (loading more as the card's
   scroll nears its end, or a Show more at its foot); there is no "View all" on these two pages, so nothing pushes the
   next section down.
2. **Two sections a row on wide screens:** My tasks pairs Overdue | Due today, New leads to contact | AI needs you,
   Payments due | Trips leaving soon; Follow-ups pairs its sections the same way where there are two. One column below
   the wide breakpoint.
3. **Phones: collapsible sections, not nested scrolling** (a scroll box inside a scrolling page traps the thumb). Each
   section is a registry Collapsible with its name and count as the trigger; the first section with items starts
   open, the others closed; an open section shows its items in the page's own scroll.
4. **Denser rows, about 72px:** one line for the person and what to do, one muted line for the trip, the AI's reason
   or the last message, clamped to one line (the full text in the row's title/tooltip or on the lead's page); the
   when-mark and the buttons on the same line, at the right, on desktop. Follow-ups drops "Open chat" (the WhatsApp
   button already opens the chat in the inbox). The next-move sentence stays, as the row's muted second line when
   there is one.
5. **Home:**
   - Departures leaving soon shows the next 5 upcoming, soonest first (the list is already in date order: the first 5).
   - Every Home list card is capped at 5 rows, so cards in a row line up.
   - Order: the setup line, Leads, then a row of Your tasks today | Needs your attention, then Hot leads to call |
     Departures leaving soon, then AI insights. Needs your attention is above Departures (owner). Phones stack in
     that order.
   - The setup card becomes one slim line while setup isn't done: "Setup 3 of 7 · Next: Logo" and a "Finish setup →"
     link (ForwardLink to the setup screen), still hidden once done and only for those who may manage settings.
   - Home keeps "View all →" on its cards: it opens the full page.

## Left to the builder

Exact heights and breakpoints (from DESIGN.md's spacing and the registry components), the loading-more mechanics,
how the clamped text is revealed, and the tests. Registry components only; DESIGN.md rules; 44px touch targets.
