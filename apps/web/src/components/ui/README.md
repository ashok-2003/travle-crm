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
  slots, the dialog and sheet close buttons are 44px. `checkbox` is 20px with a 44px hit area, `switch` 44x24 with a
  44px tall one. The small `sm` sizes of `select` and `switch` are gone. `input-group` is 44px high; its `icon-sm`
  button is 36px with a 44px hit area (`after:-inset-1`), and its `xs` and `icon-xs` buttons are gone. `sidebar` menu
  buttons are at least 44px (`lg` 48), growing when a name wraps; their `sm` size is gone.
- Shapes: cards 10px (`rounded-lg`) with a hairline border instead of a ring; dialogs 14px; inputs, input groups,
  textareas, selects and OTP slots 6px; checkboxes 4px; titles (card, dialog, sheet, alert dialog) Figtree 600 at the section size. Dialogs and
  alert dialogs carry the overlay shadow. Table headers are surface-toned.
- Layers: `z-(--z-overlay)` for scrims, `z-(--z-dialog)` for dialogs, sheets, menus and selects (menus share the dialog
  layer so they open above a dialog), `z-(--z-sticky)` for sticky bits and the sidebar, `z-(--z-tooltip)` for
  tooltips. Never `z-50`.
- Names wrap: no `line-clamp`, `truncate` or `whitespace-nowrap` in `select`, `table` or `sidebar`.
- Focus: the one global 2px outline in `globals.css`; components don't add `focus-visible:ring-*`. An input group's
  outline goes round the whole group, not the input inside it (`globals.css`).
- `button.tsx`: pill shape (`rounded-full`), primary hover is `action-pressed`; outline has the input border; ghost is
  blue text; destructive is an ink outline with red text.
- `input.tsx`: 44px high, 16px text at every width (no iOS zoom), 6px radius, canvas fill. `textarea.tsx` (which
  `input-group` brings) is 16px at every width too.
- `badge.tsx`: 4px radius.
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`: the overlay is the `scrim` token, without blur. The dialog's and the
  sheet's Close words are the `common.close` message.
- `spinner.tsx`: decoration (`aria-hidden`), without `role="status"` or a label: it sits in busy buttons, whose own label
  says what is happening, and a status inside a button would join its name.
- `sidebar.tsx`: 232px wide; its `--sidebar-*` colours are the brand's in `globals.css` (surface, the blue tint for the
  current page). It asks `lib/use-wide-screen.ts` whether the screen is a phone instead of shadcn's `use-mobile` hook,
  and has five small lint fixes. Its own words (the trigger's and rail's "Toggle Sidebar", the phone sheet's title)
  are not messages yet: the app uses neither the trigger, the rail nor the phone sheet (phones keep the bottom bar),
  so make them messages before using one. `tooltip.tsx` came with it.
- `sonner.tsx`: one light theme (no `next-themes`), bottom right, a close button with a 44px hit area.
- `field.tsx`, `input-otp.tsx`: three small fixes the repo's strict lint rules ask for.

shadcn's own `tailwind.css` is not a dependency: the state variants the components use (`data-open:`,
`data-checked:`...) are copied into `globals.css`. Add to that list when a new component needs another.

Adding a component from another shadcn-compatible registry: list the registry under `registries` in
`components.json`, then `pnpm dlx shadcn@4.21.4 add @<registry>/<name>`. Check the result against DESIGN.md, replace
any colour literal with a token, and pin any dependency the CLI added to an exact version.
