# The sales inbox: WhatsApp that a sales team runs its day from

- **Status:** approved by the owner in conversation (2026-10-25: "everything a sales team needs, and a UI like an
  enhanced WhatsApp"). Phases 1-3 are built in order on `ayush`; phase 4 waits for the owner's accounts and choices.
- **Builds on:** `2026-10-23-whatsapp-design.md` (the inbox, the chat, replies, templates: unchanged rules), the crm's
  lead stages, owners, notes and tasks, `DESIGN.md` (the People violet is the inbox's colour; stages keep their badges).

## 1. Why

The inbox works but reads like a list of records. A sales agent lives in it all day, so it must feel like WhatsApp Web
(fast, familiar, one screen) and let them act on the sale without leaving the chat: see where the deal is, move it,
hand it on, tag it, set a reminder, send the payment details, write a note only the team sees.

## 2. The rulings (decided, recorded)

- Ruling: the look follows WhatsApp Web's layout (list, chat, contact panel; bubbles with tails; date chips; a chat
  wallpaper) in our tokens, never WhatsApp's green — the brand rules bind every screen and the People violet already
  means "inbox" — cost if wrong: a colour pass, no structure change.
- Ruling: "converted" is the lead's existing `won` stage, and every sales action in the chat calls the crm's existing
  procedures (`leads.moveStage`, `leads.reassign`, `leads.addNote`, `leads.editTrip`, `tasks.add`) — one rule for a lead,
  wherever it is changed — cost if wrong: none, it is the same data.
- Ruling: payment details are the agency's own UPI and bank details, kept as the quick reply with the shortcut
  `payment` (no table of their own) and put in the box by the reply bar's ₹ button; a QR picture is attached by hand for
  now; payment links (Razorpay) wait for the owner's gateway account (phase 4) — cost if wrong: phase 4 adds a second
  button beside the first.
- Ruling: tags and quick replies are written with `inbox:templates` (the Owner and Admins), tagging, pinning and
  archiving a chat with `inbox:reply`; a tag on a chat and a read mark are links the runtime role may delete — cost if
  wrong: a permission of their own later.
- Ruling: tags are the agency's own list (name only), shown as neutral badges; colour stays for stages and status
  (DESIGN.md: colour carries meaning) — cost if wrong: a colour column added later.
- Ruling: unread is per member (each person's last read message per chat), beside the shared "Waiting for reply" —
  the spec's D6 kept "Waiting for reply" as the team's signal; unread is each agent's own — cost if wrong: one table.
- Ruling: pin and archive are the team's (per chat, for everyone), like a shared mailbox — cost if wrong: a per-member
  column later.
- Ruling: team notes in a chat are the lead's existing notes, shown inline in the chat in the People tint and never
  sent; a chat with no lead keeps notes on the conversation — cost if wrong: notes move tables.

## 3. Phase 1: the look and the feel (web only, today's api)

- **Layout.** Full height under the app's header. Computer: the list (fixed 380px), the chat, and the contact panel
  (360px, toggled from the chat header, open by default at 1280px and wider). Phone: the list; a chat fills the screen
  with its own top bar and back arrow; the contact panel opens as a sheet.
- **The list.** Search on top, then filter chips. A row: avatar (initials on a People tint), name, time; under it the
  last message with ✓/✓✓ for ours, and on the right a People-violet count when it waits for a reply. The stage as a small
  stage badge and the owner's initials. The open chat is highlighted. Long lists load more at the bottom.
- **The chat.** A header bar: avatar, name (a link to the lead), the phone, the stage badge, "last wrote 2h ago";
  actions: search in chat, contact panel. The messages sit on a quiet wallpaper (`surface`). Bubbles: the customer's on
  `canvas`, ours on the People tint with its dark ink, a tail on the first of a run, consecutive messages from one side
  grouped, the time and the ticks inside the bubble's corner, read ticks in the People colour. Day chips centred
  ("Today", "Yesterday", "16 Oct"). A round "down" button with the count of messages that arrived below. Photos open
  in a lightbox. A quoted message shows as a block above the reply.
- **The composer.** One rounded bar: emoji, the text (grows to 6 lines), attach; the microphone turns into Send when
  there is text. Enter sends on a computer, Shift+Enter is a new line. Window closed: the bar is replaced by the
  template prompt (unchanged rule).
- **Keyboard.** `/` focuses the search when not typing, `Esc` closes the contact panel, then the chat.

## 4. Phase 2: act on the sale from the chat (today's api)

The contact panel, top to bottom: the person (name, phone, copy, "open lead"); **Stage** (the stage badges as a choice;
Won is "Converted", Lost asks for the reason the crm already asks for); **Owner** (assign, for `leads:assign`);
**Trip** (destination, dates or month, travellers, budget, editable through the lead's own form); **Follow-up** (add a
task: today, tomorrow, a date and time, with a note; the next open one shown with Done and Snooze); **Notes** (add a
note; the latest three, then "all on the lead"); **Other leads** of the person; **Media** shared in the chat (a grid of
photos and a list of files). A chat with no lead shows **Start a lead** instead of Stage, Owner and Trip.

## 5. Phase 3: new data for a sales team (migrations)

- **Tags.** `inbox_tag` (organization, name, unique among live tags, soft delete) and `conversation_tag` (a chat, a
  tag). Manage in Settings, WhatsApp; add and remove from the contact panel and the list's menu; filter by tag.
  Permission: `inbox:tags` to manage the list; anyone who can reply can tag a chat.
- **Quick replies.** `inbox_quick_reply` (organization, shortcut, title, body with `{name}`, `{destination}`,
  `{agent}`, `{month}`; soft delete). Typing `/` in the composer opens them (search as you type, arrows, Enter fills the
  box with the blanks filled from the chat). Managed in Settings, WhatsApp (`inbox:templates`).
- **Payment details.** The quick reply with the shortcut `payment` (UPI id, payee, bank, account, IFSC in the agency's
  own words). The reply bar's ₹ button puts it in the box with its blanks filled; staff can edit before sending. Inside
  the 24-hour window only, like any reply.
- **Unread.** `conversation_read` (organization, conversation, member, last read message id and time), updated when a
  member has the chat open. The list shows each member's unread count; the filter "Unread".
- **Pin and archive.** Columns on the conversation: `pinned_at`, `archived_at`. Pinned chats stay on top; archived ones
  leave the main list until the customer writes again; the filter "Archived".
- **Team notes in the chat.** Shown inline between messages at their time, in the People tint with "Note · Priya",
  never sent. A chat without a lead keeps them in `conversation_note`.
- **Filters.** Unread, Waiting for reply, Mine, Unassigned, All, Archived; and a filter sheet: stage, owner, tag,
  last message (today, 7 days, 30 days).

## 6. Phase 4: waits for the owner

Payment links (Razorpay account), broadcasts to a tagged list (Meta's limits and the marketing cap), away messages and
auto-replies, the AI helper (roadmap release F), response-time reports per agent, sending quotes and itineraries as PDF
(the quotes release).

## 7. Rules that stay

Everything in the WhatsApp spec's sections 4, 6 and 8 (window, consent, caps, scope, no personal data in logs); the
owner's UI rules (registry components, no hand-drawn borders or shadows, tokens only, 44px targets); words in the
feature's message files; every refusal has its sentence.
