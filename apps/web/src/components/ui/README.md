# shadcn/ui components

These files come from the shadcn/ui registry (`components.json`: style `radix-nova`, Radix primitives, Lucide
icons), added with `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`. They are ours to change, but kept close to the
registry so updates stay easy, so they skip the repo's purpose-comment rule. They take their colours from the
brand's tokens through the CSS variables in `src/app/globals.css`; none of them may hold a colour literal
(`test/no-colour-literals.test.ts`).

Changes made after adding them, for DESIGN.md. `test/components/touch-targets.test.tsx` fails if an interactive
component drops under 44px (jsdom has no layout, so it reads the size utilities, `after:-inset-*` hit areas
included), and `test/design-shapes.test.ts` ties radii, type scale, z scale and overlay shadow to DESIGN.md.

- Touch targets, 44px: every `button` size (`default` 44, `lg` 48, `icon` 44, `icon-lg` 48; `sm` is 36 with a 44px hit
  area from `after:-inset-y-1`, for dense desktop toolbars); the `xs`, `icon-xs` and `icon-sm` sizes are gone.
  `select` trigger and options, `dropdown-menu` items, `tabs` triggers, `table` rows and header cells, `input-otp`
  slots, the dialog and sheet close buttons are 44px. `checkbox` and `radio-group` items are 20px with a 44px hit
  area, `switch` 44x24 with a 44px tall one. The small `sm` sizes of `select` and `switch` are gone. `input-group` is
  44px high; its `icon-sm` button is 36px with a 44px hit area (`after:-inset-1`), and its `xs` and `icon-xs` buttons
  are gone. `sidebar` menu buttons are at least 44px (`lg` 48), growing when a name wraps; their `sm` size is gone. An
  `item` is at least 44px, for one that is a link; its `xs` size is gone.
- Shapes: cards 10px (`rounded-lg`) with a hairline border instead of a ring; dialogs 14px; inputs, input groups,
  textareas, selects and OTP slots 6px; checkboxes 4px; titles (card, dialog, sheet, alert dialog) Figtree 600 at the
  section size. Dialogs and alert dialogs carry the overlay shadow. Table headers are shadcn's own, with no fill.
- Layers: `z-(--z-overlay)` for scrims, `z-(--z-dialog)` for dialogs, sheets, menus, selects and popovers (menus share
  the dialog layer so they open above a dialog), `z-(--z-sticky)` for sticky bits and the sidebar, `z-(--z-tooltip)`
  for tooltips. Never `z-50`.
- Names wrap: no `line-clamp`, `truncate` or `whitespace-nowrap` in `select`, `table`, `sidebar` or `item`.
- Focus: the one global 2px outline in `globals.css`; components don't add `focus-visible:ring-*`. An input group's
  outline goes round the whole group, not the input inside it (`globals.css`).
- `button.tsx`: pill shape (`rounded-full`), primary hover is `action-pressed`; outline has the input border; ghost is
  blue text; destructive is an ink outline with red text. A `quiet` variant of our own (feedback round 1): ink words
  that take the ghost's blue tint on hover, for a choice whose own content carries colour (the stage bar's steps, where
  link blue would hide the stages' colours); One Action Colour still holds, as the blue comes on hover.
- `input.tsx`: 44px high, 16px text at every width (no iOS zoom), 6px radius, canvas fill. `textarea.tsx` (which
  `input-group` brings) likewise (6px, canvas fill, 16px text at every width), at least 64px high.
- `popover.tsx`: the registry's shadow, with a hairline border instead of its ring.
- `calendar.tsx` (`react-day-picker`, pinned): Indian unless told otherwise (`en-IN`: weeks start on Monday, a day is
  named "Friday, 16 October 2026"); days and month buttons 44px (`--cell-size`, the registry's own knob), and 40px
  on screens under 360px wide, so the calendar (seven days and its padding) fits a 320px phone; its screen-reader
  words are the `calendar` messages. The focused day shows the global outline (the registry's ring is gone), and the
  range styles lost their numeric z-index: a range would need its layering back first. The app picks single days only.
- `progress.tsx`: its bar moves only behind `motion-safe:`.
- `badge.tsx`: 4px radius.
- `tabs.tsx`: an unselected trigger is the muted ink (4.84:1 on the surface list) instead of ink at 60%, which fails
  contrast. The list is 52px around its 44px triggers; don't shrink it.
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`: the overlay is the `scrim` token, without blur. The dialog's and the
  sheet's Close words are the `common.close` message.
- `spinner.tsx`: decoration (`aria-hidden`), without `role="status"` or a label: it sits in busy buttons, whose own
  label says what is happening, and a status inside a button would join its name.
- `sidebar.tsx`: 232px wide; its `--sidebar-*` colours are the brand's in `globals.css` (surface, the blue tint for the
  current page). It asks `lib/use-wide-screen.ts` whether the screen is a phone instead of shadcn's `use-mobile` hook,
  and has five small lint fixes. It has no Ctrl/Cmd+B shortcut: the app's sidebar never folds away, so the keys stay
  the browser's. `SidebarTrigger` is the 44px `icon` button (the registry's `icon-sm` is gone from `button`). Parts the
  app doesn't render are not yet DESIGN.md's: `SidebarMenuSubButton` (28px high), `SidebarMenuAction` and
  `SidebarGroupAction` (20px, a 36px hit area on phones only), `SidebarRail` (16px wide), and the words of the trigger,
  the rail and the phone sheet ("Toggle Sidebar", the sheet's title), which are not messages. Make them 44px and
  messages before using one. `tooltip.tsx` came with it.
- `sonner.tsx`: one light theme (no `next-themes`), bottom right, a close button with a 44px hit area. On phones its
  `mobileOffset` is `var(--toast-bottom-gap)`, which `globals.css` sets to 4rem (the 56px bottom bar and 8px more) only
  while the page has the phone navigation, so toasts clear the bar there and sit at the bottom elsewhere.
- `field.tsx`, `input-otp.tsx`, `progress.tsx`: small fixes the repo's strict lint rules ask for.
- `toggle.tsx` and `toggle-group.tsx` (release 1's quick filters, R42): pills (`rounded-full`), the filter chips of
  DESIGN.md section 6; `default` 44px and `lg` 48px, the `sm` size gone; the selected chip in the action tint with its
  dark blue (`accent`), the `outline` variant a hairline border; no focus ring (the global outline instead), and the
  items' numeric `z-10` gone; `??` for the group's variant and size, as the lint rules ask. The CLI also wanted to overwrite `button`, `input`, `textarea`, `dialog` and
  `input-group` with the registry's own: ours were put back as they were.
- `command.tsx` (`cmdk`, pinned; the destination and lead pickers, R45, as a Command in a Popover): its search is the
  app's 44px input group with 16px text, the input marked as the group's control so the global outline goes round the
  group; items at least 44px; its icons decoration. `CommandDialog` isn't used and isn't yet DESIGN.md's: its title and
  description ("Command Palette") are not messages. Make them messages before using it.

- Class merging: every component imports `cn` from `@/lib/utils`, which knows the theme's own type sizes
  (`text-caption`, `text-label`...), never from the `cn` package the CLI writes in; without them a size reads as a
  colour and the colour beside it is dropped. Change the import after each `shadcn add`
  (`test/lib/class-names.test.ts` fails until it is).

shadcn's own `tailwind.css` is not a dependency: the state variants the components use (`data-open:`,
`data-checked:`...) are copied into `globals.css`. Add to that list when a new component needs another.

Adding a component from another shadcn-compatible registry: list the registry under `registries` in
`components.json`, then `pnpm dlx shadcn@4.21.4 add @<registry>/<name>`. Check the result against DESIGN.md, replace
any colour literal with a token, and pin any dependency the CLI added to an exact version.
