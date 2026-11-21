# Leads: the "Show" filter (Hot, Follow-up overdue, Not contacted yet, AI needs a person)

Owner-led, 2026-11-20/21 (web revamp, after PR #63).

## Why

Home lists hot leads, overdue work, new leads waiting and what the AI needs, but the Leads page can't show any of
these: Home's "View all" on Hot leads to call opens the whole list. The owner: "on home page we have hot leads and
all.. so on the lead page we should have filter for those too!"

## Approaches

- **Where:** first in the stage chip row, a row of their own, or inside Filters. **Owner: inside Filters.**
- **Which:** Hot, Follow-up overdue, Not contacted yet, AI needs you. **Owner: all four.**

## Decided (owner, 2026-11-21, every recommendation taken)

1. **A "Show" choice in the Leads page's Filters panel:** All leads (the default), Hot, Follow-up overdue, Not
   contacted yet, AI needs a person ("AI needs you" while the Mine tab is open). One at a time. It is in the address
   (`?show=hot|overdue|uncontacted|ai`), so a link opens it and Back keeps it, and while on it shows as an active filter
   that can be removed like the others (and counts in the Filters button's number). It works with the whose tabs,
   the stage chips, search and the numbered pages, and the stage chips' counts follow it.
2. **Whose leads:** each option follows the tab: Mine is the member's own leads, Everyone every lead the member may
   see, Unassigned the leads nobody owns. Scope rules (scopeFilter) still apply underneath.
3. **What each means:**
   - **Hot:** Home's rule (`packages/domain/src/sales/hot-leads.ts`): an open lead that opened its quote or asked to
     book in the last 7 days, travels within the agency's hot days, or has a budget at or over its mark. **All of
     them, not the top 25**, hottest first, paged like the rest. Home keeps its five.
   - **Follow-up overdue:** a lead with an open (not done) follow-up whose due time has passed, longest overdue first.
   - **Not contacted yet (new rule):** still in New, **and** no call logged on it **and** no message sent to its person
     since it came in. Longest waiting first. **My tasks' "New lead, not contacted yet" (and Home's tasks card that
     shows it) uses the same rule**, so the counts agree everywhere. My call: a message the AI sent counts as a reply
     (the customer did get one).
   - **AI needs a person:** the chats the AI handed over and its open Lost / Not a lead suggestions, on the leads the
     tab covers (Mine: the member's own, and, for someone who manages the AI, the unowned ones as Home does). Newest
     first.
4. **Export follows the list's filters,** Show included, and the existing bug where Export ignored the "came in"
   (created) filter is fixed with it.
5. **Home:** "View all" on Hot leads to call opens the Leads page with Show: Hot (and Everyone for a member who sees
   all leads, as the Leads card's links do). The other cards' links stay.

## Not in this change

New data, a second Show at once, the lead page.

## Done when

- Unit tests: the Show choice in Filters writes and reads `show` in the address; the active filter shows and is
  removable; each option asks the api for it; Home's Hot "View all" link; Export sends the same filters.
- Domain and api tests: each option returns exactly its leads, ordered as above, within the tab and scope (a
  salesperson never sees another's lead); Hot returns more than 25 when more are hot; Not contacted yet leaves out a
  New lead with a logged call or a sent message, in the list and in My tasks; the counts follow Show; Export with Show
  and with "came in"; the performance tests' EXPLAINs still pass (update any query they pin).
- The Leads journeys and the My tasks journeys pass.
- On the running app with real-shaped data: each option at 390, 1024 and 1440, and Home's View all.
