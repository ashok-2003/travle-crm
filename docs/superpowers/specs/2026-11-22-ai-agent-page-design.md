# Web revamp: the AI agent page (`/ai-agent`)

Owner-led, 2026-11-22. Approved by the owner ("that looks good", then "lgtm" for the clickable numbers).

## Why

The owner (looking at a live agency's page): the numbers belong on top; "AI needs you" should have "a little overview so
that it gets noticed"; the tabs should be Overview and Try it only. Also seen: everything sits in a 720px column (half
the screen empty at 1440); Setup lists what's missing twice (the steps, then "Before the AI agent can be turned on, it
needs:" under a switch); its actions mix links and Edit buttons, and a Done step can still say "Connect your WhatsApp
number"; nothing says how far setup has come; the page doesn't wear the AI violet Home and the lead page now use.

## Decided

1. **Header:** the title with the agent's state beside it (the existing state badge: "On: answering WhatsApp chats",
   "Off", "Not set up yet", support's pause, "On, waiting for…"), a shorter intro ("Your WhatsApp sales assistant: what
   it's doing and what needs you."), and a **Setup** button at the top right that opens Setup as its own page; while
   setup isn't finished the button shows "4 of 7".
2. **Tabs: Overview and Try it only** (`?tab=try`); an old `?tab=setup` address opens the Setup page.
3. **Overview, the full page width:**
   - while the agent isn't answering for want of setup (or is on but not ready), an amber banner first: "The AI isn't
     answering yet: 3 steps left" with **Finish setup** (the missing steps named, once, here);
   - **Last 24 hours on top:** four tiles in the AI violet (Home's AI tint), big numbers, their ⓘ hints kept.
     **Clickable only when they open the exact list behind the number:**
     - **Chats answered** opens the Inbox filtered to **Answered by the AI** (chats where the AI sent a message in the
       last 24 hours; the inbox's scope applies), a new Inbox filter reachable from the address (`/inbox?show=ai-answered`,
       a fixed value) and shown as an active, removable filter there;
     - **Bookings requested** opens the list of **bookings the AI took in the last 24 hours** (what the number counts:
       `aiBooking` rows), through a new filter on the page that lists them (the Bookings page if it lists them; else
       wherever the agency already reviews AI bookings), from the address likewise;
     - **Messages sent** and **Flagged for a person** stay figures (no list matches them).
     A clickable tile has a hover state and an arrow; a figure has neither.
   - **Needs you · N** (N the total waiting): three tiles: **Chats handed to you**, **Lost or Not a lead to confirm**,
     **Payments to check**, each with its count and a button: the first two jump to their lists just below, the third
     opens Payments to check. A tile with something waiting is amber (attention); one with nothing is quiet.
   - Under them the handed-over chats and the suggestions (each with Yes and No) as today, in two columns from 1280px.
4. **Setup, its own page** (`/ai-agent/setup`, a way back to AI agent): "4 of 7 done" with a violet progress bar; each
   step one row with its state and **one** button of the same kind (Set up while To do, Edit or Manage while Done; never
   "Connect" beside Done); the on switch under the steps with one line when it can't be turned on yet ("Finish the steps
   above to turn it on"), never the missing list again.
5. **Try it** keeps its content; it takes the page's width like the rest.

## Not in this change

What the AI does, its settings' content, new numbers or periods (7 days, 30 days).

## Done when

- Unit tests: the header (state beside the title, Setup with "4 of 7"), the two tabs, the old `?tab=setup` address, the
  banner, the tiles (violet; the two clickable ones' links; the two figures not links), Needs you's tiles (counts,
  amber when waiting, their buttons), the Setup page (progress, one button kind per state, no repeated list).
- Domain/api tests: the Inbox's Answered by the AI filter (the AI's messages in 24 hours, scope, counts) and the AI
  bookings filter (24 hours, scope); each list's count equals the overview's number for the same moment.
- The journeys that open the AI agent page, the Inbox and the AI bookings' list pass.
- Shots at 390, 1024 and 1440.
