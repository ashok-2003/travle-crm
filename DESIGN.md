---
name: travel-crm
status: first-draft
colors:
  canvas: "#ffffff"
  surface: "#f0f2f5"
  hairline: "#e9edef"
  input-border: "#7c8b95"
  ink: "#111b21"
  ink-muted: "#54656f"
  action: "#00785f"
  action-hover: "#005f4d"
  action-tint: "#e7f6f1"
  people: "#3b5bdb"
  people-pressed: "#2f4bc0"
  people-tint: "#e8edfd"
  people-tint-ink: "#2f45a8"
  money: "#034f46"
  money-pressed: "#07352f"
  money-tint: "#e3f1ee"
  sidebar: { fill: "#075e54", ink: "#ffffff", active: "#0f8073" }
  chat: { wallpaper: "#efeae2", out: "#d9fdd3", in: "#ffffff", bar: "#f0f2f5" }
  avatar-sky: { bg: "#d6ecfb", ink: "#0b4f75" }
  avatar-rose: { bg: "#fde2e7", ink: "#8a2742" }
  avatar-amber: { bg: "#fdecc8", ink: "#7a4a00" }
  avatar-mint: { bg: "#d7f5e6", ink: "#1d6142" }
  avatar-violet: { bg: "#e9e1fb", ink: "#4c2f97" }
  avatar-teal: { bg: "#d5f1ef", ink: "#0f5c56" }
  status-red: { dot: "#d92d20", bg: "#fdecea", ink: "#9b1c1c" }
  status-amber: { dot: "#c2680a", bg: "#fff3d6", ink: "#7a4100" }
  status-green: { dot: "#168f43", bg: "#e3f4e7", ink: "#14532d" }
  status-neutral: { dot: "#6b6b6b", bg: "#ecebe6", ink: "#4a4a4a" }
  stage-new: { dot: "#0c8bbb", bg: "#cbe9fb", ink: "#04516f" }
  stage-contacted: { dot: "#0b959b", bg: "#d5fcfe", ink: "#045b5f" }
  stage-booking-requested: { dot: "#719427", bg: "#edf9dc", ink: "#415a03" }
  role-owner: { bg: "#f9dfff", ink: "#693375" }
  role-rose: { bg: "#fee0eb", ink: "#802e53" }
  role-peach: { bg: "#fee3d4", ink: "#6f3f20" }
  role-gold: { bg: "#f7f7cc", ink: "#595501" }
  role-fern: { bg: "#d6f8d8", ink: "#36563a" }
  role-mint: { bg: "#d3fff2", ink: "#2e5b40" }
typography:
  page-title: { family: "EB Garamond", size: 30px, weight: 500, lineHeight: 36px, tracking: "-0.01em" }
  section-title: { family: "Figtree", size: 16px, weight: 600, lineHeight: 24px, tracking: "0" }
  body: { family: "Figtree", size: 15px, weight: 400, lineHeight: 22px, tracking: "0" }
  label: { family: "Figtree", size: 13px, weight: 500, lineHeight: 18px, tracking: "0" }
  caption: { family: "Figtree", size: 12px, weight: 400, lineHeight: 16px, tracking: "0.01em" }
  number:
    { family: "IBM Plex Mono", size: 14px, weight: 400, lineHeight: 20px, tracking: "0", features: "tabular-nums" }
  number-lg:
    {
      family: "IBM Plex Mono",
      size: 24px,
      weight: 500,
      lineHeight: 30px,
      tracking: "-0.01em",
      features: "tabular-nums",
    }
radii: { badge: 4px, input: 6px, card: 10px, pill: 9999px, dialog: 14px }
spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 12: 48px }
shadows:
  overlay: "0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)"
  none-at-rest: "none"
---

# Design System: travel-crm (first draft)

> **Theme, 2026-10-26 (the owner's decision): green everywhere.** The product wears WhatsApp's green throughout: the action
> colour is a teal green, the sidebar and the phone's top bar a dark teal with white words (the current page a lighter teal),
> the page a light grey with white cards, and the inbox a chat (beige wallpaper, green bubbles for ours). People and
> conversations are a blue (read ticks, unread counts, assignees), information and never a button. The console, the PDFs
> and emails (which read the brand's tokens) and the installed app's bar and icon follow. No WhatsApp logo or trademark is
> used anywhere.

> First draft, to be improved. Tokens above are the source of truth; map them to Tailwind theme variables and shadcn/ui CSS variables. The product name is a working name and lives only in the brand package. Never hard-code it in components, titles or copy.

## 1. Overview

**Creative north star: "The well-kept ledger-desk."** A travel agent works through the day between a WhatsApp conversation, a quote, a departure list and a payment. The interface is a calm, quiet desk: white cards on a light grey page, hairline rules, dense but ordered information, and colour that appears only when it means something. References: Notion and Linear for restraint and density; the Razorpay dashboard for money and status screens.

Principles:

- **Colour carries meaning, not decoration.** Most of any screen is ink on white. Each colour has one job (section 2).
- **Dense, not cluttered.** Tables and lists are compact; whitespace separates groups, hairlines separate rows.
- **Mobile first.** Agents work from phones between calls. Design at 360px, then expand.
- **Numbers are first-class.** Money, counts, dates and ids are mono and aligned.
- **Honest states.** Always design loading, empty and error, not just the happy path.

## 2. Colour

Strategy: **Full palette with strict roles.** Neutral ink on a white canvas, plus three role colours and a status set.

| Role               | Colour                                                           | Used for (and only for)                                                                                                 |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Canvas             | `#ffffff`                                                        | Cards, panels, dialogs and inputs                                                                                       |
| Surface            | `#f0f2f5`                                                        | The page behind the cards, table headers, wells                                                                         |
| Hairline           | `#e9edef`                                                        | Dividers and card borders (decorative only)                                                                             |
| Ink                | `#111b21`                                                        | Primary text                                                                                                            |
| Ink muted          | `#54656f`                                                        | Secondary text, captions, placeholders                                                                                  |
| **Action (green)** | `#00785f`, pressed `#005f4d`, tint `#e7f6f1`                     | Primary buttons, links, focus rings, selected filters; the sidebar (`#075e54`, current page `#0f8073`) is its dark form |
| **People (blue)**  | `#3b5bdb`, pressed `#2f4bc0`, tint `#e8edfd`, tint ink `#2f45a8` | WhatsApp unread messages and counts, follow-ups and reminders, assignment and assignee chips, later AI helpers          |
| **Money (forest)** | `#034f46`, pressed `#07352f`, tint `#e3f1ee`                     | Amounts received, profit and margin, invoices, the Accounts area                                                        |
| **Status**         | red / amber / green / neutral                                    | State of a record only: confirmed, payment due, overdue, lost                                                           |
| **Stage**          | sky, teal, lime, plus status amber, green, red, neutral          | A lead's stage, wherever it shows (see Stage Colours)                                                                   |
| **Role badge**     | orchid for Owner, five tints for the other roles                 | A staff role on Staff and Roles (see Role Badges)                                                                       |

Named rules:

- **One Action Colour.** Green is the only interactive colour. A blue or forest element is never a button; it is information. If it is clickable, it gets green treatment (underline or hover) on top.
- **Status Is Only Status.** Red, amber and green never decorate, never colour a chart series for variety, never tint a card for emphasis.
- **Dot Plus Word.** Status is always a dot and a word, never colour alone.
- **Status Green Is Not The Action Green.** Status green is a bright, light-bodied green (`#168f43` dot, `#e3f4e7` bg) used for a state with its word; the action green (`#00785f`) is what can be pressed. Forest (`#034f46`) is a deep blue-green for money text and Accounts chrome. Never use forest or the action green for a status badge, or status green for a button or a money total.
- **Tint Surfaces Carry Dark Ink.** Text on a role tint uses the role's dark ink (`#2f45a8`, `#034f46`, `#005f4d`), never muted grey.
- Money direction is shown by sign and label ("Received", "Due"), not by red/green on the amount itself. Overdue is a status badge next to the amount.
- **Green Is Done.** Something finished (a Won lead, a follow-up marked Done, a step completed) is status green, as a subtle tint or a dot beside its words. Nothing that isn't a state turns green.
- **Stage Colours.** A lead's stage is its status, so it is a badge of the status shape (tint, dark ink, dot plus word) wherever it shows: the Leads list, the stage chips and the Filters' stage list (the dot), the stage bar (its fill), the lead page and its timeline. Each stage has one subtle colour, fixed by meaning: New sky, Contacted teal, Quote sent status amber (awaiting the customer's reply), Booking requested lime (on its way to Won's green), Won status green, Lost status red, Not a lead status neutral. The open stages' hues are tints, never fills; none passes for the action green (a stage is never a button), the people blue, money's forest, a status or another stage: every stage colour keeps a ΔE76 of at least 8 from each of them (`packages/brand/test/palette-distance.test.ts`). Colour never stands alone: the word is always there.
- **Role Badges.** A staff role shows as a badge in its own tint (dark ink on the tint, 4px radius, no dot: a role is a kind of person, not a state). The Owner role is always orchid; every other role takes one of five tints (rose, peach, gold, fern, mint) picked by a hash of its stable key, so the same role is the same colour on every screen and every load, and the Owner and the four starter roles (Admin, Sales, Operations, Accounts) all differ. The pick depends on the tints' order and count: adding, removing or reordering a tint recolours the agencies' own roles, so change the list only on purpose. Role tints keep a ΔE76 of at least 8 from the action, people, money, status and stage colours, so a role never looks like a state, and they appear only where roles do (Staff, Roles).

Status vocabulary (extend, do not reinvent):

- Green: Confirmed, Paid, Completed, Done, Won
- Amber: Payment due, Pending, On hold, Awaiting reply, Quote sent
- Red: Overdue, Lost, Cancelled, Failed
- Neutral: Draft, Archived, Not a lead

## 3. Typography

| Role               | Font                          | Size / line                 | Weight |
| ------------------ | ----------------------------- | --------------------------- | ------ |
| Page title         | EB Garamond                   | 30 / 36 (24 / 30 on mobile) | 500    |
| Section title      | Figtree                       | 16 / 24                     | 600    |
| Body               | Figtree                       | 15 / 22                     | 400    |
| Label              | Figtree                       | 13 / 18                     | 500    |
| Caption            | Figtree                       | 12 / 16                     | 400    |
| Number             | IBM Plex Mono, `tabular-nums` | 14 / 20                     | 400    |
| Number large (KPI) | IBM Plex Mono, `tabular-nums` | 24 / 30                     | 500    |

Rules:

- **Garamond for page titles only.** One per screen (`h1`). Never in cards, buttons, tables or dialogs. Dialog titles use Figtree 600.
- **Every number is mono with tabular-nums**: money, counts, percentages, ids (e.g. `Q-1042`), phone numbers, and dates in tables. Dates inside running prose may stay Figtree.
- Minimum text size is 12px; body on mobile is never below 15px (inputs are 16px to stop iOS zoom).
- shadcn/ui components keep their own text sizes (`text-sm`, 14px, in buttons, items, cards, the sidebar); the 15px body is for running text outside them. (Proposed, for the owner to confirm.)
- Body line length 65-75ch. `text-wrap: balance` on titles, `pretty` on prose.
- No uppercase tracked eyebrows, no gradient text, no letter-spacing tighter than -0.02em.
- **Indian scripts.** Customer names, places and messages may be Devanagari, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Gurmukhi and others. Neither Figtree, Garamond nor Plex Mono covers them. Font stacks must append fallbacks, in order: `"Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Gujarati", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gurmukhi", system-ui, sans-serif`. For the Garamond title add `"Noto Serif Devanagari"` before the sans fallbacks. Load Noto subsets by `unicode-range` so Latin-only users download nothing extra. Indic scripts need more line-height: use at least 1.6 for body text containing them; never clip descenders or matras with fixed heights.
- Load fonts with `font-display: swap` and size-adjusted fallbacks to avoid layout shift.

## 4. Spacing and shape

- Spacing scale (4px base): 4, 8, 12, 16, 20, 24, 32, 48. Vary it: tight inside a row (8-12), looser between groups (24-32). Equal padding everywhere is a smell.
- Page gutter 16px on mobile, 24px tablet, 32px desktop. Content max width 1200px; reading/detail panels 720px.
- **Touch targets are at least 44x44px** on every interactive element (extend the hit area with padding if the visual is smaller). Spacing between adjacent targets at least 8px.
- Radii: buttons are **pills** (`9999px`); inputs 6px; status badges 4px; cards and panels 10px; dialogs 14px. Chips (filters) are pills.
- Borders are 1px hairline. No side-stripe borders (a coloured `border-left` over 1px) on cards, rows or alerts.
- No nested cards. A card contains rows, fields and dividers, never another card. Use hairlines and spacing inside.
- Semantic z-index scale: base 0, sticky 10, dropdown 20, overlay 30, dialog 40, toast 50, tooltip 60.

## 5. Elevation

Surfaces are **flat at rest**: no shadow on cards, tables, buttons or inputs. Separation comes from hairlines and the surface tone.

Shadows only on floating overlays that sit above the page: dropdown menus, popovers, dialogs, sheets, toasts, tooltips. Token: `0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)`. Dialogs add a scrim of `rgba(26,26,26,0.40)`. No glassmorphism, no blur on surfaces.

## 6. Components

Build on shadcn/ui; restyle with the tokens. Define colours as CSS variables on `:root`, not literals in components.

**Buttons.** Pill. Heights 44px (default, mobile and desktop), 36px dense only in desktop table toolbars where an adjacent 44px hit area is provided. Primary: green fill, white text (5.45:1), hover `#005f4d`. Secondary: canvas fill, input border (`#7c8b95`), ink text. Ghost: no border, green text. Destructive: ink-outline with red text; red fill only in the final confirm step of a dialog. One primary button per view region. Disabled: muted ink on surface, no pointer events, and say why in a hint. Loading: spinner replaces label width-stable, button stays disabled.

**Inputs.** 44px high (16px text), 6px radius, 1px border `#7c8b95` (3.5:1 as a UI boundary), canvas fill, visible label above (never placeholder-only). Placeholder is ink muted. Focus: 2px green ring with 2px offset. Error: red border plus message below with an icon, `aria-describedby` linked. Phone fields use `+91` prefix and mono digits. Money fields show `₹` prefix, mono, right-aligned, Indian grouping on blur.

**Badges and chips.** Status badge: 4px radius, tinted bg, dark ink, a 6px dot in the status colour, then the word (12-13px, weight 500). Example: green dot + "Confirmed" on `#e3f4e7` with `#14532d` text. A lead's stage badge is this shape in the stage's colour. Badges in the people or money colour (blue "Unread 3", forest "Invoice") follow the same shape using that colour's tint + tint ink; a staff role's badge (Role Badges) is its tint and ink with no dot. Filter chips are pills: unselected hairline border; selected green tint `#e7f6f1` with pressed-green ink and a check icon. A stage chip carries its stage's dot before the word while unselected; selected, the check takes the dot's place.

**Stage bar.** A lead's stages as one progress bar with their words under it. The bar spans the full width, 6px high with rounded ends, on a hairline track, and fills from its start to the end of the current stage's fifth (New one fifth, Quote sent three, Won all of it) in that stage's colour (its dot; Won's is status green). When the stage changes the fill slides there (200ms ease-out, behind `motion-safe`). The bar is decoration, hidden from screen readers: the section's name and the current step (`aria-current="step"`) say the stage. Under it, one 44px button per stage covers its fifth of the bar and its word together, so a tap on the bar moves the lead there, and hover (the action tint, as a ghost button's) and the focus outline sit on the whole stage; the bar lies over the hover tint and under a focused step's outline. Words in ink, never link green: a passed stage's word has a check wider than a phone (on a phone a fifth of the row has no room for it, and the fill says passed), the current stage's is semibold, later stages' are muted. A closed lead (Lost, Not a lead) shows its stage badge and Reopen instead.

**Cards.** Canvas fill, 1px hairline, 10px radius, no shadow, 16px padding. Use cards only for self-contained objects (a lead on mobile, a departure, a supplier). Lists of homogeneous rows are tables or divided lists, not card grids.

**Tables.** Dense desktop default: 44px rows (40px dense option), shadcn's default header with no fill of its own (owner-confirmed: no extra styling on shadcn), hairline row dividers, no zebra. Numeric columns are right-aligned, mono, tabular. Sortable headers show a direction icon. Row hover is the surface tone; selected row is the green tint. Sticky header and sticky first column on horizontal scroll. Footer totals use mono at weight 500 in forest if money. Below 768px, tables become divided lists (name and status on line one, key numbers on line two) or cards.

**Navigation.** Desktop: 232px left sidebar in the dark teal, grouped items (Leads, Inbox, Quotes, Departures, Bookings, Suppliers, Accounts). Desktop's sidebar is the dark teal with white words; the active item is a lighter teal (`#0f8073`, white words at 4.8:1), no side stripe. The Inbox item carries a blue count; the Accounts item uses forest only on its icon when active. Mobile: bottom nav with 4-5 destinations (Leads, Inbox, Departures, Accounts, More), 56px high, 44px+ targets, labels always visible, active item green. "More" opens a drawer for the rest plus organization switcher.

**Info hints.** "What does this mean?" beside a term a first-time user may not know (Returning, Not a lead, Owner, Source, a blocked contact): `InfoHint`, a small ⓘ ghost button, 20px to see with a 44px hit area, named "What does <term> mean?". With a mouse it is the registry Tooltip, on hover and on keyboard focus (a click keeps it open); on a touch screen, which can't hover, a tap opens the registry Popover. The words are a sentence or two of plain Indian English, announced with the button; Escape closes them. Hints are for the terms that truly need one: fewer than ten in the whole product, never one on every label.

**KPI / stat.** A label, a mono value, and an **info hint** (an "i" button, 44px hit area, opens a tooltip or popover explaining how the figure is computed and its period). Every KPI has one, no exceptions. Value uses `number-lg`; money KPIs in forest. Optional delta line in muted ink with sign. No hero-metric template: no oversized number with gradient or accent decoration; KPIs sit in a hairline-divided strip, not a row of identical boxes.

**Toasts and dialogs.** Toasts bottom-center on mobile, bottom-right on desktop, overlay shadow, 4s (errors persist with a dismiss button), `role="status"` (errors `role="alert"`), include Undo where possible. Dialogs: 14px radius, scrim, focus trapped, Escape closes, Figtree title, primary action on the right (desktop) or stacked full-width (mobile). On mobile, prefer bottom sheets for forms and pickers.

**Empty states.** Short sentence saying what belongs here and the one action to fill it ("No quotes yet. Create your first quote."), a simple line illustration or icon in muted ink, one green primary button. Filtered-empty says "No results for these filters" with a clear-filters link. Never blank.

**Loading and error states.** Loading: skeletons matching the final layout (surface tone, subtle pulse behind `motion-safe`), no full-page spinners; show skeletons after 200ms. Error: inline message with what failed and a Retry button; keep the user's input; offline shows a persistent banner and queues writes where possible.

**Money display.** Always `₹` plus Indian grouping, mono, tabular, right-aligned in columns: `₹12,50,000`. Paise only when non-zero or on invoices (`₹1,250.50`). Negative as `-₹4,500` (minus sign, not parentheses). Large KPIs may use `₹12.5 L` / `₹1.2 Cr` with the full value in the info hint or tooltip. Money text is forest only for received/profit/margin/Accounts; amounts due use ink, with a status badge for state.

**Status display.** Badge as above, always dot plus word. In dense lists, the dot plus word may sit inline without background. Do not use colour-only icons, row tints or progress bars to signal status (the stage bar's fill sits over the stages' words, never in place of them). A record has one primary status badge; secondary facts are plain text.

**Mobile patterns.**

- **List to detail.** Mobile: list screen pushes a full-screen detail screen with a back button top-left and a 44px sticky action bar at the bottom (e.g. Call, WhatsApp, Create quote). Desktop 1024px+: split view, list 360px left, detail right, URL reflects selection.
- **Inbox.** Conversation list with a green dot for a chat waiting for a reply and a blue count of unread messages; thread view full-screen on mobile, composer pinned above the keyboard; assignment and follow-up chips in blue.
- **Safe areas.** Respect `env(safe-area-inset-*)` for bottom nav and sticky bars.
- **PWA.** Installable, `theme-color` matches canvas, standalone display, an offline shell, and cached last-viewed lists.

**Motion.** Ease-out only (`cubic-bezier(0.22, 1, 0.36, 1)`), 120-200ms for state changes, up to 240ms for sheets and dialogs. Animate opacity and transform only. All animation sits behind Tailwind `motion-safe:`; the `motion-reduce` fallback is an instant change or a short crossfade. No bounce, no parallax, no entrance animation on every list item.

## 7. Do's and Don'ts

Do:

- Use green for every interactive affordance and nothing else.
- Put every number in mono with `tabular-nums`, right-aligned in columns.
- Pair every status colour with a word and a dot.
- Give each KPI an info hint.
- Use hairlines before whitespace, whitespace before cards, cards before shadows.
- Write real empty, loading and error states for every list and form.
- Keep copy plain and specific: "Payment due 16 Oct", not "Action required".

Don't:

- Use blue or forest for buttons, or green/red/amber for anything but status.
- Use eyebrows (small uppercase tracked kickers), gradient text, hero-metric blocks, side-stripe borders, nested cards, glassmorphism, or identical icon-heading-text card grids.
- Use Garamond outside page titles.
- Put shadows on resting surfaces.
- Rely on placeholders as labels or on colour alone for meaning.
- Hard-code the product name or any colour literal in components.
- Truncate Indian-script names to fit; wrap or give more room.

## 8. Accessibility

Target WCAG 2.2 AA. Contrast checked with the WCAG relative-luminance formula (computed against canvas `#ffffff` unless stated).

| Pair                                                                                  | Ratio           | Use                                                     |
| ------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| Ink `#111b21` on canvas                                                               | 17.5:1          | Body                                                    |
| Ink on surface `#f0f2f5`                                                              | 15.6:1          | Text on the page and panels                             |
| Ink muted `#54656f` on canvas                                                         | 6.06:1          | Secondary text (AA)                                     |
| Green `#00785f` on canvas                                                             | 5.45:1          | Links, focus ring                                       |
| White on green `#00785f`                                                              | 5.45:1          | Primary button                                          |
| White on green pressed `#005f4d`                                                      | 7.65:1          | Button hover                                            |
| Pressed green `#005f4d` on tint `#e7f6f1`                                             | 6.87:1          | Selected chip                                           |
| White on the sidebar `#075e54` / the active item `#0f8073`                            | 7.67:1 / 4.82:1 | Navigation                                              |
| White on blue `#3b5bdb`                                                               | 5.67:1          | Blue fills (unread counts)                              |
| Tint ink `#2f45a8` on `#e8edfd`                                                       | 7.08:1          | Blue badges                                             |
| Forest `#034f46` on canvas                                                            | 9.35:1          | Money text                                              |
| Forest on tint `#e3f1ee`                                                              | 8.18:1          | Money badges                                            |
| Red ink `#9b1c1c` on `#fdecea`                                                        | 7.13:1          | Status badge                                            |
| Amber ink `#7a4100` on `#fff3d6`                                                      | 7.37:1          | Status badge                                            |
| Green ink `#14532d` on `#e3f4e7`                                                      | 7.97:1          | Status badge                                            |
| Neutral ink `#4a4a4a` on `#ecebe6`                                                    | 7.42:1          | Status badge                                            |
| Input border `#7c8b95` on canvas                                                      | 3.51:1          | UI boundary (needs 3:1)                                 |
| Status dots on canvas: red `#d92d20` 4.76, amber `#c2680a` 3.92, green `#168f43` 4.10 | n/a             | Non-text, meets 3:1                                     |
| Status dots on their badge fill: red 4.22, amber 3.61, green 3.64, neutral 4.46       | n/a             | Non-text, meets 3:1; the word still carries the meaning |
| Stage inks on their tints: New 6.88, Contacted 7.19, Booking requested 7.14           | ≥ 6.8:1         | Stage badges                                            |
| Stage dots on canvas: New 3.81, Contacted 3.57, Booking requested 3.46                | n/a             | Non-text (dots, the stage bar's fill), meets 3:1        |
| Stage dots on their tints: New 3.06, Contacted 3.32, Booking requested 3.21           | n/a             | Non-text, meets 3:1; the word still carries the meaning |
| Role inks on their tints: Owner 7.30, the five tints 7.02 to 7.20                     | ≥ 7:1           | Role badges                                             |

Hairline `#e9edef` (1.18:1) is decorative only; never the sole indicator of an input, button or selected state.

Requirements:

- Visible focus on every interactive element (2px green ring, 2px offset); never remove outlines.
- Full keyboard operation; logical tab order; skip-to-content link; dialogs trap and restore focus.
- Semantic landmarks (`nav`, `main`), one `h1` per screen, tables with proper `th` scope.
- Icon-only buttons have accessible names; an info hint is a real `button` named by its question, "What does <term> mean?" (a KPI's: "How is this calculated?"), its words announced with it (its tooltip as the button's description, or a popover named by the term), and Escape closes them.
- Live regions for toasts and new inbox messages (polite); errors announced.
- Respect `prefers-reduced-motion`; support 200% zoom and text scaling without clipped content; set `lang` per record where known (`lang="hi"` etc.) so screen readers and font fallbacks pick the right script.
- Never convey meaning by colour alone (status, unread, direction of money).

## 9. Indian locale details

- **Currency:** `₹` with lakh/crore grouping: `₹12,50,000` (use `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`; never hand-roll). Short forms `₹12.5 L`, `₹1.2 Cr` only in KPIs and charts, with the full value on hover/info hint.
- **Dates:** `16 Oct` in the current year, `16 Oct 2027` otherwise; ranges `16 - 21 Oct`; never US month-first. Times in 12-hour with `am/pm` (`4:30 pm`) in the **organization's time zone** (default `Asia/Kolkata`), stored as UTC; show a zone label only when it differs from the viewer's. Weeks start Monday by default, configurable.
- **Numbers:** en-IN grouping everywhere (`1,23,456`), mono and tabular.
- **Phones:** `+91 98765 43210` format, stored E.164; WhatsApp deep links use the number without `+`.
- **GST:** show GSTIN in mono (15 chars, no wrapping mid-id), tax lines as separate rows (CGST/SGST or IGST) with rate and amount, invoice totals in forest, financial year as `FY 2026-27`.
- **Names and text:** support Indic scripts and mixed-script strings in names, places, notes and messages (section 3 fallbacks); search must be diacritic and script tolerant; sort with `Intl.Collator("en-IN")`; never assume first/last name structure (single field "Full name").
- **Language:** UI copy is English first with plain wording; structure strings for later translation (no concatenated sentences, no baked-in plurals).
- **Addresses:** state-aware (place of supply drives GST); PIN code is a 6-digit mono field.
