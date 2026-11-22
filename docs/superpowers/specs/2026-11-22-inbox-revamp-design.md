# Web revamp: the Inbox, chat first and live (part 1: the feel; part 2: the look and the message fixes)

Owner-led, 2026-11-22. Approved by the owner ("lgtm") after the discussion below.

## Why

The Inbox is the page sales agents live in; the goal is that they use it instead of their own WhatsApp (owner). Today:

- **Choosing a chat rebuilds the whole Inbox.** `/inbox` and `/inbox/<id>` are separate pages that each render
  `InboxScreen`, so the list remounts and jumps to the top (owner: "the whole page is getting refreshed").
- **It isn't live.** New messages wait for a 15 s poll (`INBOX_POLL_MS`). Polling faster would load the small Oracle api
  server for nothing (10 agents at 3 s ≈ 15,500 requests an hour, most answering "nothing new").
- **The chat doesn't come first.** The list column spends about 490px on a title, three rows of chips and three selects
  before the first chat (about five fit); rows are about 115px and repeat the owner's name; the panes don't size to the
  screen (owner: "based on screen size ... percent wise ... and some min also ... the chats view priority").
- **Bubbles and the reply area are noisy:** "From the phone · time" on every bubble; the AI pause line names the AI by
  the member's own name ("Ritesh waits until 2:48 pm"); ⚡ and ₹ tools without words; the mic outside the box.
- **Two kinds of message look broken:** "This message type can't be shown here" (a type our MSG91 parser doesn't know;
  `parse-msg91-event.ts` keeps only "unsupported") and "Photo, not loaded yet" that never loads (a file never stored,
  `media_state` stuck at `pending`, seen on photos sent from the agent's phone).

## Approaches

- **Live updates:** faster polling (simple; load grows with every open tab) or **server-sent events** (one quiet
  connection per open tab, a tiny event only when something changes). **Owner: SSE** ("what if this can ddos our own
  server?").
- **Order of work:** one change, or **two parts**: the feel (structure, widths, live) first, then the look and the
  message fixes. **Owner: two parts.**

## Decided

### Part 1: the feel

1. **The list never rebuilds.** The chat list lives in a layout shared by `/inbox` and `/inbox/<id>` (a route group, so
   `/inbox/broadcasts` keeps its own pages); only the chat area changes. The list keeps its scroll, search and filters
   when a chat is chosen, and on a phone Back returns to the same place in it.
2. **Widths by the screen, the chat first:** the list `clamp(300px, 24%, 400px)`, the chat everything left with a
   **min of 520px**, the contact panel `clamp(300px, 22%, 380px)` when open. When the panel would push the chat under
   its min, it floats over the chat's right edge instead (a sheet from the right, the floating shadow), never squeezing
   it. Whether the panel is open is remembered in the browser. Edge to edge as now; phones unchanged in structure.
3. **Instant switching:** a row's chat (its header and the newest page of messages) is fetched when the pointer rests
   on the row or it gets focus, so it opens at once; each chat keeps its unsent draft (as now) and its scroll position
   for the tab; opening a chat lands on its first unread message; scrolled up, a "N new messages ↓" button appears.
4. **Live over SSE:**
   - The api serves `GET /api/live` as `text/event-stream` for a signed-in member who may read the inbox (the session
     as every request reads it), and sends `inbox` events carrying ids only (the chat's id, and what changed:
     a message in, a message's status, the chat's state), never a number or a word of a message.
   - Events reach the api from wherever the change is saved (the worker's webhook processing, the api's own sends)
     through Postgres `NOTIFY` in the same transaction (delivered on commit), one `LISTEN` connection per api process,
     through `@travel-crm/db` (no vendor SDK outside its adapter; no session state left on a pooled connection).
   - The api sends a member only events for chats their inbox scope lets them see (as the list's own rule), so no
     event says a chat exists that the member couldn't open.
   - A comment line every 25 s keeps proxies from closing the stream; the browser's EventSource reconnects by itself
     and, on every (re)connect, the inbox reads its lists once again. A slow poll (60 s) stays as a safety net; nothing
     polls in a hidden tab. A member may hold a handful of streams (tabs) at once; more are refused.
   - On an event the browser refetches only what it touches (the list's first page, that chat's header and newest
     messages). The 3 s/10 s polling discussed is **not** built.
   - Production runs the web on Vercel, which rewrites `/api/*` to the api's server: if Vercel ends long streams, the
     browser's reconnect covers it (note it in `docs/deploy-checklist.md`; Caddy must not buffer the stream).
5. **Sound and desktop alerts** (owner: "yes ... if this will not harm our server and app"): in the browser only,
   driven by the same events. A soft sound (made with the Web Audio API, no file) and, when the member has allowed it,
   a desktop notification ("New message from <name>", opening the chat) when a customer writes to a chat of theirs
   (or an unassigned one, for whoever takes unassigned) and that chat isn't the one in front of them. Both are off until
   the member turns them on in the Inbox (a small settings menu); the browser's permission is asked only then. Never in
   the console; nothing is sent to the server for it.
6. **Keyboard:** ↑ / ↓ move between chats (when the focus isn't in a box; Alt+↑ / Alt+↓ anywhere), Ctrl/⌘+K focuses
   the search, Esc closes the contact panel; Enter sends and Shift+Enter makes a new line as now. A "Keyboard shortcuts"
   item in the settings menu lists them.

### Part 2: the look and the message fixes

7. **A compact top-left:** no big "Inbox" title on a computer (the page keeps its name for screen readers and the tab),
   Broadcasts as an icon button with its name; the search; one row of filter chips that scrolls sideways (each count
   once: "Waiting 213" in red when some are late, not "213 213"); the stage, time and tag choices move into a Filters
   button (as the Leads page). About 200px more for chats.
8. **Two-line rows (about 70px):** line 1 the name, how long the customer has waited ("waiting 25m", amber from 15 min,
   red when late by the inbox's own late rule) or else the last message's time, and the unread count in the people
   violet; line 2 our ticks and the last message's first words, and the stage pill. The owner shows only when it isn't
   the member (initials with the name on hover and for screen readers).
9. **Quieter bubbles:** messages in a row from the same side group together; "from the phone" (or the sender, or "sent
   by the AI") shows once per group as a small mark, with each bubble's time.
10. **A clear AI line:** "The AI is paused till 2:48 pm because you replied", in the AI violet, with "Let AI answer now";
    the AI is called "the AI" here, never by the name it signs with.
11. **The reply box:** the mic inside the box; every tool with its word (Templates, Trip details, Quick replies,
    Payment), behind "+" on a phone as now.
12. **Messages that looked broken:**
    - Keep the type name of a message the parser doesn't know (a column on the message; ids and the type's name only),
      count them, and show the common ones properly (find them from production's logs or the new column: likely polls,
      orders, deleted messages, system notices); the rest keep a plain line, worded as "A <type> message: open it on
      the phone" when the type is known by name.
    - A file stuck `pending`: find why (a phone-sent photo's copy may come without a link to fetch; other sessions'
      #64/#70 changed how phone echoes are read), fetch the file where MSG91 gives a way, a job that retries stuck ones
      for a few days, and "Photo not available" (not "not loaded yet") when it never can be.

## Not in this change

Reactions, polls sent by us, typing indicators, read receipts by member, mobile push for inbox messages (the existing
notifications stay as they are), the broadcasts pages.

## Done when

- **Part 1:** unit tests for the shared layout (choosing a chat keeps the list's scroll and filters), the widths and
  the floating panel, prefetch on hover/focus, per-chat scroll, the new-messages button, the keyboard, the sound and
  notification settings; api/domain tests for `/api/live` (auth, scope filtering, ids only, heartbeat, the per-member
  cap) and the `NOTIFY` on each change; the inbox journeys pass, with one that sees a message arrive without reloading
  (a webhook posted while the chat is open shows within a few seconds). On real-shaped data: switching chats doesn't
  move the list; the panes at 1024, 1280, 1440, 1728 and 1920.
- **Part 2:** unit tests for the header, chips, Filters, rows (waiting colours, owner only when not mine), grouping,
  the AI line, the reply box; integration tests for the unknown type kept and the stuck file retried; the inbox journeys
  pass; shots at 390, 1024, 1440 and 1728.
