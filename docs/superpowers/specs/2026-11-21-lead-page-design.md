# Web revamp: the lead page (`/leads/<id>`), and soft red for every destructive button

Owner-led, 2026-11-21. Approved by the owner ("Looks good to me") after the discussion below.

## Why

- The page answers its questions in no order: the name and phone twice (the header and "The person"), "what next" in
  three places (the AI's suggestion, Sales, Next follow-up), a 2,300px column of cards beside a short timeline, and a
  half-empty right side.
- The timeline is "so bland ... it doesn't really make sense until someone reads the whole" (owner): every entry looks
  alike, "The system · date" on each, long notes in full. "In real life people read things by colours too."
- AI content looks like everything else, and a destructive answer ("Yes, mark it Not a lead") is red words on an
  outline; the owner prefers a soft red fill with black words, everywhere.

## Decided

1. **The order of questions** (owner: think as a salesperson): is this worth my time (who, how warm, stage, and any AI
   warning first), what do I do now (the next follow-up), what happened last (the last message or call), what do they
   want (the trip and its gaps), then the AI's reasoning, the chat, the history, quotes and bookings.
2. **A compact header:** the name, the phone, the email and Instagram when there are, and the trip in one line
   (destination · from date · travellers); the AI's temperature ("Warm 65%", violet) beside the stage. Actions stay:
   Call, WhatsApp, Messages, ⋮. **"The person" card goes:** its email and Instagram join the header, and its Edit moves
   into ⋮ as "Edit person" (the same dialog). The stage bar keeps its look; its hint line "Choose a stage to move the
   lead there." goes.
3. **Colour by meaning** (as Home's day cards, DESIGN.md Colour roles; tints in oklab like `home/home-card.tsx`):
   - **AI in violet** (the people colour): the AI's suggestion (Not a lead, Lost, looks fake), the AI's guess, "Bookings
     taken by the AI", AI entries in the timeline.
   - **The trip in a soft sky tint.**
   - **One "Follow-ups" card** in place of Sales and Next follow-up: the next follow-up (red when overdue) with Done and
     Snooze, the last contact in one line ("They wrote 'Ok thanks' · 2h ago", or the last call), and the automatic
     follow-ups' state with Start/Stop.
4. **Soft red for every destructive button, app-wide:** Delete, Remove, Stop, Mark lost, Not a lead, cancel-a-thing,
   in dialogs too: the status-bad fill with ink words (the registry Button's `destructive` variant restyled in
   `components/ui/button.tsx`, so every use follows), its hover a little deeper. Red-outline and red-text "ending"
   buttons move to it. DESIGN.md's button rule says so.
5. **Desktop (from 1280px):** two columns. **Left, scrolling with the page:** the AI's suggestion (when there is one),
   Follow-ups, Trip, then the **WhatsApp chat, tall** (about two-thirds of the screen's height), then Quotes, Bookings,
   Departures, Owner and source. **Right, sticky at the screen's height:** the AI's guess on top (its "Why" folded until
   opened), then the **Timeline scrolling inside its own box**, so the history never pushes the page.
6. **The timeline, read by colour:**
   - each entry is one compact row: a coloured mark by kind, its title, its time on the right; a body only when there is
     one (a note's words, cut to 3 lines with "more");
   - colours: AI violet; calls blue; the customer's chats teal; stage moves the stage's own colour; follow-ups amber when
     set, green when done, grey when cancelled; bookings and payments green; the system's own entries (assigned,
     created, edited) grey and smaller, without "The system" on each;
   - grouped under day headings (Today, Yesterday, 6 Nov), each entry with its time only;
   - small filters on top: All, AI, Calls & chats;
   - the note box is one line until focused, then grows with its Add note button.
7. **Phone (below 768px), one column in the order of 1:** header (name, warmth, stage to tap), the AI's suggestion when
   there is one, Follow-ups (next and last contact), Trip with its gaps marked ("Budget not asked"), the AI's guess
   (its next step shown, Why folded), the chat preview, the timeline's last 5 (Show more), Quotes, Bookings, Owner and
   source. **A bar fixed at the bottom above the app's tab bar: Call, WhatsApp, + Note.**

## Not in this change

New data (a field the lead doesn't have), the Inbox, the Bookings and Quotes pages.

## Done when

- Unit tests: the header's lines and ⋮ Edit person; no person card; the Follow-ups card (next, last contact,
  automatic); each tint's class; the timeline's kinds, colours, day groups, filters and clamped notes; the phone's order
  and its bottom bar; the destructive variant's soft red (and no red-outline destructive left: a test that finds them).
- The journeys that open a lead, and those that press a destructive button, pass.
- On real-shaped data at 390, 768, 1024, 1280, 1440 and 1728: no sideways scroll, the right column and the timeline
  scroll as described, the chat tall on desktop; shots of a hot lead, an AI-suggested Not a lead, an AI booking.
