# Web revamp, part 1: Home, My tasks, Follow-ups and the contact buttons

Status: design, for the owner's approval. Branch `feat/web-revamp` (from `origin/main` 6b7fc221). Built and checked
locally first; the owner iterates on the running screens before any pull request.

## 1. Why

The owner walked the live product page by page and found the agency's daily screens hard to read: Home repeats the
same counts three ways and four of its six tiles open the same page; Today and Follow-ups show the same follow-up
twice with different details; buttons are coloured by habit rather than by what they do; WhatsApp opens the staff
member's own WhatsApp instead of the agency's inbox. The revamp makes each page answer one question for a
salesperson, with nothing shown twice:

- **Home:** how are my leads doing, and what needs me (a summary, each part a way into its page).
- **My tasks** (was Today): what must I do now.
- **Follow-ups:** whom did I promise to get back to, and what's the next move with each.

Success: any member, whatever their role, understands each page at first sight; no item appears on two of these
pages; every button's colour says what it does.

Non-goals: the other pages (Leads, Inbox, Bookings and the rest come in later parts); new AI behaviour; Reports.
Anti-goals: the "AI look" (pastel icon tiles, rows of identical stat boxes, decorative icons by every figure; see
DESIGN.md's KPI rule), clutter, extra explanation text a first-time user has to read.

## 2. Constraints

- `CLAUDE.md` (data, API and the owner's seven UI rules), `DESIGN.md`, `docs/agent-playbook.md`,
  `docs/ui-build-loop.md`. Shared pieces before screens; registry components only; colours from brand tokens.
- New libraries the owner allowed: Cult UI's animated number (a shadcn-compatible registry, added with the shadcn
  CLI; it brings `motion`). The pie uses the registry Chart already in `components/ui/chart.tsx` (Recharts).
- Every count respects the member's scope: someone who sees only their own leads sees their own figures.
- Times and periods are the agency's time zone.

## 3. Approaches considered

1. **Build these three pages and the buttons now, see them locally, iterate, then ship** (chosen by the owner,
   2026-11-18). Real screens to react to early; the next pages' design learns from these.
2. Design every page first, then build everything: most consistent, but nothing to look at for weeks and one huge
   change.
3. One pull request per page straight to production: fastest to users, but the owner wants to iterate locally first.

## 4. Shared pieces (built first)

### 4.1 Contact buttons (`leads/contact-buttons.tsx`, used everywhere)

- **WhatsApp:** when the agency has WhatsApp connected (`inbox.status`) and the member may use the inbox, it opens
  the customer's chat in our inbox (`inbox.leadChat`, `inboxRoute`); with no chat yet, the inbox's existing Start
  chat flow (`inbox/lead-chat.tsx`). Only an agency without WhatsApp connected, or a member without the inbox, gets
  `wa.me` as today.
- **Icons:** the real WhatsApp logo, in WhatsApp green (owner); a solid filled handset in the current iOS / Android
  style for Call (owner: "cool", app-like), from a free icon set (not Apple's or Google's app icon: their
  trademarks). Both as small inline SVG components in one file, licence noted in its comment. The logo's green is a
  new brand token (`packages/brand`, `DESIGN.md` palette, an exception line in DESIGN.md: the WhatsApp logo alone
  may be green; it is a brand mark, not a status).
- **Compact form in lists:** round icon-only buttons, 44px hit area, a tooltip and an accessible name ("Call Priya
  Nair", "WhatsApp Priya Nair"), on the same line as the row's other buttons. The lead's own page keeps icon and word.
- Call keeps today's behaviour: `tel:` on a phone (then "how did the call go?"), the call panel on a wide screen.

### 4.2 Button colours by what the button does (every screen)

DESIGN.md's rule, applied everywhere: blue fill for the one main action of a screen or dialog; destructive (outline,
red text; red fill only on a dialog's final confirm) for anything that ends or removes (Mark lost, Not a lead,
Delete, Cancel a booking); plain outline (ink) for everything else (Done, Snooze, Keep, Edit, Open chat). Known
breaks: the AI's "Yes, mark Lost" suggestion button is blue fill; Done and Snooze are blue text that reads as links.
A sweep of every screen lists and fixes the rest.

## 5. Home (`/dashboard`)

Top to bottom (the owner's sketch); on a phone the same order, stacked.

1. **Header:** the greeting and the day as now. Its action is the **period filter** (Today, This week, This month,
   All time; a registry ToggleGroup), replacing New lead and Pipeline. The setup card stays above everything for
   whoever may manage settings, until setup is done (it already hides itself).
2. **Leads card** (members who see leads): a donut by stage, **Total leads**, and one card per stage (New,
   Contacted, Quote sent, Booking requested, Won, Lost; Not a lead left out), each in its stage's tint with its dot
   (DESIGN.md Stage Colours), each opening Leads filtered to that stage and period. Counts = leads that **came in**
   during the period, by their stage now. An "Open reports" link in the card's corner (Reports opens at its own
   period). Total leads is a figure, not a link. The stage tint as a card's background is the owner's choice and a
   named DESIGN.md exception (written into DESIGN.md beside the KPI rule): the tint is the stage's meaning, never
   emphasis, and the stage's word is always there. One info hint, on the card's title, says how the figures are
   counted (leads that came in during the period, by their stage now); the stage cards need none.
3. **Your tasks today:** the first 5 of My tasks' first three sections (Overdue, Due today, New leads to contact),
   leaving out the AI's items, which are in Needs your attention; and one line "6 follow-ups due · 2 replied →
   Follow-ups"; View all opens My tasks.
4. **Hot leads to call:** hottest first, up to 5, each with its reason and Call; View all opens Leads (unfiltered
   until the lead-type filter exists).
5. **Departures leaving soon:** the departures Today shows now; View all opens Departures.
6. **AI insights** (members who manage the AI): AI calls used this month against the monthly limit as a small pie
   (always this month: the limit is monthly), and the chats the AI answered in the chosen period, counting up from 0
   (Cult UI animated number, still under reduced motion).
7. **Needs your attention:** the AI's flags for this member (the same items as My tasks' "AI needs you"); View all
   opens the AI agent page (members who manage the AI) or My tasks.

The period filter changes the Leads card and the chats answered only. Tasks, hot leads and departures are "now";
AI calls are monthly. Removed from Home: the six tiles, the today nudge, "This month so far", "Money to come", the
screens list. A card the member's role or plan can't see is left out; a card with nothing to show says so in one
quiet line (hot leads and departures simply hide).

## 6. My tasks (was Today; the address stays `/today`)

The page and its sidebar entry are named **My tasks**; `/today` stays (the morning push and bookmarks link there).

- **Header:** "My tasks", the day and how many things ("Wed 18 Nov · 9 to do · 4 overdue"), **Add a task**. Under
  it, one line for follow-ups: "6 follow-ups due · 2 replied → Follow-ups" (hidden when none are due). The Away switch
  stays, for members who take new leads in turn.
- **Four sections, always in this order, each hidden when empty,** each with its count and up to 5 rows:
  1. **Overdue:** my own plain tasks past their time.
  2. **Due today:** my own plain tasks due later today.
  3. **New leads to contact:** my own New leads not contacted yet; View all opens Leads filtered to New.
  4. **AI needs you:** chats the AI handed over and the AI's Lost / Not a lead suggestions, as rows. A salesperson
     sees those on leads they own (a chat belongs to its lead's owner; chats have no assignee of their own); members
     who manage the AI also see the ones on leads nobody owns, and their View all opens the AI agent page. A
     handed-over chat's button is Open chat; a suggestion's are "Mark lost" / "Not a lead" (destructive) and Keep.
     **Payments to check** stay as today: one line with their count leading to Payments, for whoever may record
     payments (not by lead ownership: a salesperson can't act on a payment).
  Overdue and Due today's View all shows the rest in place. All four empty: "Nothing to do right now."
- **Follow-ups never show here** (they live on Follow-ups); plain tasks never show on Follow-ups. Add a task already
  makes a plain task. Each thing appears once (a payment to check and its own "Check payment" task are one thing).
- **Rows:** the person (or the task's title), when it's due (red only when late), what to do and the trip in one
  line, then the compact Call and WhatsApp, then the row's own buttons (Done and Snooze; Mark contacted for a new
  lead; Open chat or the suggestion's two buttons for an AI item).
- **Gone from this page:** the hot leads card and departures (on Home), "Quote opened, no reply" (already a hot
  lead reason), the stale footer line, and for now "Payments due" and "Trips leaving soon, details missing" (their
  new place is decided with the Bookings page; this branch does not ship before that).
- The morning push counts what My tasks shows and the follow-ups due ("5 tasks and 6 follow-ups today").

## 7. Follow-ups (`/leads/follow-ups`)

The customers I promised to get back to, and where each conversation stands.

- **Header:** "Follow-ups" and one line, "6 due · 2 replied". Tabs **Due** (sections Overdue and Due today) and
  **Later** (grouped Tomorrow, This week, Later). Mine / Everyone stays for members who see every lead. "All" goes.
- **Row:** the lead's name and stage, when it's due, what to do, the customer's last message (who, when, the words),
  then one **next move** line worked out by fixed rules (no AI), the first that applies:
  - the customer wrote last (**replied**: their message is the chat's latest, however old) and the 24-hour window is
    open: "She replied. Answer her on WhatsApp.";
  - the customer wrote last and the window has closed: "She replied. Call, or send a template.";
  - the AI reminded them and no reply came: "Call him.";
  - the AI couldn't write (window closed, no chat, opted out, failed): "Call, or send a template.";
  - otherwise (nothing yet): nothing extra.
  "2 replied" in the headers counts replied follow-ups among the Due ones.
  This line replaces today's separate "Window open", "AI wrote…" and "Added by AI" lines. Then the compact Call and
  WhatsApp, and Done, Snooze, Edit.
- **Order:** within each section, customers who replied first (they're waiting on us), then by due time.
- **Done asks "When's the next follow-up?"**: Tomorrow, In 3 days, Next week, or No more follow-ups. Choosing a time
  adds the next follow-up on the same lead, for the same person, with the same words (editable later).

## 8. Server work these pages need

1. Lead counts by stage for a period (today, this week from Monday, this month from the 1st, all time, in the
   agency's zone), counted by the leads' current stage, in the member's scope.
2. A "came in" filter on the Leads list (`?created=today|week|month`), in the api's list and count inputs and in the
   address (`leads/list/list-filters.ts`), so a stage card and the list it opens show the same leads.
3. The AI's chats answered for a period (the AI overview counts the last 24 hours only today).
4. "AI needs you" for salespeople: the handed-over chats (today `ai:manage` only) and the stage suggestions, limited
   to leads the member owns unless they manage the AI.
5. My tasks' sections: Overdue and Due today without follow-ups; the summary's counts and the morning push to match.

Each follows the data rules (`forOrg`, scope filters, contracts with strict inputs and output schemas) and is tested
first.

## 9. Left to the builder

Component structure, query shapes and names, the exact icon set, the donut's size and legend layout, loading and
error states (the shared pieces), messages' exact words within the owner's sentences above, and how journeys and
tests change. The visual audit (ui-build-loop.md) shoots the three pages on a phone and a desktop before the owner
looks.

## 10. Calls made in conversation (owner may overrule)

- The address of My tasks stays `/today`.
- "This week" starts on Monday; "This month" on the 1st; periods count leads by when they came in.
- Total leads is not a link.
- AI insights is shown only to members who manage the AI.
- Needs your attention's View all goes to My tasks for members who don't manage the AI.
- The animated number keeps still under reduced motion.
- Payments to check stay a count line for whoever may record payments, not rows by lead ownership.
- Home's tasks preview leaves out the AI's items (they are in Needs your attention), so nothing shows twice.
- "Replied" means the customer's message is the chat's latest, however old; "2 replied" counts Due follow-ups only.
- The stage cards' tint is a named DESIGN.md exception; one info hint on the Leads card's title.
- The colour sweep covers the shared pieces, these pages, and ending actions shown blue anywhere on agency screens.
- The morning push counts My tasks and the follow-ups due.
