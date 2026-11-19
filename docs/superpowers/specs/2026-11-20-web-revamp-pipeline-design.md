# Web revamp part 4: the Pipeline board

Owner-led, 2026-11-20. The page the Leads header's Pipeline opens (`/leads/pipeline`).

## Why

- **Slow moves.** A drop waits for `leads.moveStage` (about 1.5 s a call in production, perf audit 2026-11-02), then a
  toast, then every column loads again, so the board stalls and jumps. The owner: "it should feel instant and the api
  acknowledgment should happen in background".
- **Not usable on a phone.** Five 288px columns scroll sideways; dragging doesn't work with a thumb.
- **Columns all look alike,** and the cards are tall and noisy: "No trip details yet" and the owner's name on every
  card, a blue wrapping name link, the Move to icon wandering as names wrap.

## Approaches

- **Phone:** stage chips with counts over one stage's cards (chosen), or one full-width column at a time swiped like
  Trello (counts of the other stages hidden). Owner: chips.
- **Moves:** optimistic with Undo (chosen), or keep waiting for the server.

## Decided (owner approved, 2026-11-20)

1. **Instant moves.** Dropping a card or choosing a stage moves it at once: it leaves its column, lands at the top of
   the new one, and both columns' counts change, before the api answers. `leads.moveStage` runs in the background. A
   refusal puts the card back where it was and says why (the refusal's sentence, `errors.json`). Success shows no
   reload: a toast "Moved Sneha to Quote sent" with **Undo** (which moves it back the same instant way), and the
   columns refresh quietly afterwards, keeping what is on screen while they do. Lost and Not a lead (from Move to)
   take the card off the board the same way.
2. **Each column in its stage's colour:** New sky, Contacted teal, Quote sent amber, Booking requested lime, Won
   green (DESIGN.md Stage Colours), as a faint tint the way Home's day cards are tinted (the colour's fill mixed into
   the card in oklab, the column's edge and muted text from its ink); the cards stay the card colour on top.
3. **Compact cards:**
   - the name in ink, semibold; the whole card opens the lead (one link stretched over the card), the Move to
     button above it, in the same top-right corner on every card;
   - the trip line only when there are trip details (no "No trip details yet");
   - what's next on one line with its urgency colour;
   - the owner only in Everyone's view, as their initials (registry Avatar) with their name for screen readers and on
     hover;
   - while dragged, the card lifts (a floating shadow: DESIGN.md allows shadows on what floats).
4. **The board's width:** the five columns share the page's width (1440px pages) at no less than 260px each; below
   that the board scrolls sideways inside its own box, never the page.
5. **A phone (below 768px):** the stages as chips with their counts (the Leads stage chips' look: dot and word,
   chosen in ink) scrolling sideways in their strip, then the chosen stage's cards full width, a page at a time. No
   dragging; Move to opens a bottom sheet (registry Sheet) with the stages as 44px buttons; the move is instant there
   too.

## Not in this change

The lead page, the Leads list, new data on the cards (budget, days in stage), reordering cards within a column.

## Done when

- Unit tests: a move shows the card in its new column before the api answers; a refusal puts it back and says why;
  Undo moves it back; counts follow; the trip line hides when empty; initials only in Everyone's view; the phone's
  chips, one stage at a time, and the sheet's move.
- The journeys that open the pipeline pass.
- On production-shaped data at 390, 768, 1024, 1280, 1440 and 1728: no page scrolls sideways; columns tinted; a move
  lands in under 100 ms (measured from the drop to the card in its new column, the api slowed); frames of a move
  recorded for the controller.
