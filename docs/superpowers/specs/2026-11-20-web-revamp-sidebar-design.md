# Web revamp part 5: the agency sidebar

Owner-led, 2026-11-20.

## Why

- **It isn't predictable.** The Inbox folds the sidebar to its icons when it opens and opens it again when you leave
  (`apps/web/src/inbox/inbox-screen.tsx`), while every other page keeps it as you left it. Each switch also turns the
  page from the centred 1440px layout to edge to edge, so the page slides and changes width twice.
- **It doesn't look good** (the owner). Uppercase "WORK" / "TEAM" kickers (a DESIGN.md ban), thirteen same-weight rows,
  plain "99+" counts unlike the rest of the app's, a cramped top row, Sign out loose at the bottom.

## Approaches

- **A. A normal sidebar** that stays as the person left it on every page, collapsed or open by their own click.
  The owner first chose it for being predictable.
- **B. An icon rail on every page that opens the full sidebar on hover and closes it when the pointer leaves.** The
  owner then chose this, from Manu Arora's Sidebar on 21st.dev ("i really like the feature that it expand on hover
  directly and when we move out it get collapsed automatically"), keeping A's promise that nothing moves: the rail
  holds its place and the open sidebar floats over the page.

## Decided

1. **Behaviour (owner):** a 60px icon rail on every page, always the same, so no page ever moves when you switch
   (the Inbox's fold goes: it has nothing to fold). Hovering the rail opens the full sidebar over the page (a floating
   panel: it may cast DESIGN.md's floating shadow), and moving the pointer out closes it, as in the owner's example.
   The keyboard opens it too (focus inside it) and Escape closes it. A touch screen has no hover: the rail's top
   button opens the panel, a tap outside or on an item closes it. The rail's icons are named in tooltips and for
   screen readers. Nothing is remembered: it is always the rail at rest.
2. **Component (owner):** Manu Arora's Sidebar, added through the shadcn CLI from `https://21st.dev/r/manuarora700/sidebar`
   (the same component Aceternity publishes at `ui.aceternity.com/registry/sidebar.json`, the fallback if 21st.dev
   refuses the CLI), under its own name, `components/ui/aceternity-sidebar.tsx` (its own path,
   `components/ui/sidebar.tsx`, is our registry sidebar, which the console keeps), on our `motion` (`motion/react`), with lucide icons in place of `@tabler/icons-react` (my call: one
   icon set). It renders the agency's navigation from the same source as today (`shell/use-navigation-items.ts`,
   `shell/navigation.ts`), in its look: an icon and a label per row, the label nudged on hover, generous spacing.
3. **Our design on it (my calls, open to the owner):**
   - top: the agency's mark and name, the notifications bell;
   - the items in three groups split by space and a hairline, no uppercase labels: the day (Home, My tasks,
     Follow-ups, Leads, Inbox), the business (AI agent, Quotes, Packages, Bookings, Payments to check, Departures,
     Suppliers, Reports), the team (Staff, Roles); the current page in the action tint with its ink;
   - counts as small pills like the tabs' (`components/tab-count.tsx` look), the Inbox's in the people violet (DESIGN.md
     Navigation);
   - bottom: the person (initials, name) opening a menu with Your account and Sign out;
   - at rest: the 60px rail with each item's icon (and its count as a dot or small pill), named in a tooltip;
   - colour: light, in the warm surface tone like the owner's example, with the brand green kept for the agency's mark
     and nothing else; a single token swap gives the old deep green back if the owner prefers it.
4. **Phone:** the bottom bar stays as it is; the sidebar's phone menu (Aceternity's overlay) is not used.
5. **Every page keeps its width rules** (1440px, the Inbox edge to edge) beside the 60px rail; the open sidebar
   covers the page's edge and never pushes it.

## Not in this change

The console's sidebar (it keeps the registry one), the phone's bottom bar, what the navigation holds.

## Done when

- Unit tests: the items, groups, current page and counts; the panel opens on hover and on focus and closes on leave
  and Escape; the touch button opens it; no fold on the Inbox; names in the rail; the account menu's Sign out.
- The shell's journeys and the ones that open the Inbox pass.
- At 768, 1024, 1280, 1440 and 1728: going Home → Inbox → Leads moves nothing, and opening the panel on hover moves
  nothing under it (the rail's box and the page's left edge stay put; measured); shots of the rail and of the open
  panel, and frames of it opening and closing.
