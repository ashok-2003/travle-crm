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
  44px tall one. The small `sm` sizes of `select` and `switch` are gone.
- Shapes: cards 10px (`rounded-lg`) with a hairline border instead of a ring; dialogs 14px; inputs, selects and OTP
  slots 6px; checkboxes 4px; titles (card, dialog, sheet, alert dialog) Figtree 600 at the section size. Dialogs and
  alert dialogs carry the overlay shadow. Table headers are surface-toned.
- Layers: `z-(--z-overlay)` for scrims, `z-(--z-dialog)` for dialogs, sheets, menus and selects (menus share the dialog
  layer so they open above a dialog), `z-(--z-sticky)` for sticky bits. Never `z-50`.
- Names wrap: no `line-clamp`, `truncate` or `whitespace-nowrap` in `select` or `table`.
- Focus: the one global 2px outline in `globals.css`; components don't add `focus-visible:ring-*`.
- `button.tsx`: pill shape (`rounded-full`), primary hover is `action-pressed`; outline has the input border; ghost is
  blue text; destructive is an ink outline with red text.
- `input.tsx`: 44px high, 16px text at every width (no iOS zoom), 6px radius, canvas fill.
- `badge.tsx`: 4px radius.
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`: the overlay is the `scrim` token, without blur.
- `sonner.tsx`: one light theme (no `next-themes`), bottom right, a close button with a 44px hit area.
- `field.tsx`, `input-otp.tsx`: three small fixes the repo's strict lint rules ask for.

shadcn's own `tailwind.css` is not a dependency: the state variants the components use (`data-open:`,
`data-checked:`...) are copied into `globals.css`. Add to that list when a new component needs another.

Adding a component from another shadcn-compatible registry: list the registry under `registries` in
`components.json`, then `pnpm dlx shadcn@4.21.4 add @<registry>/<name>`. Check the result against DESIGN.md, replace
any colour literal with a token, and pin any dependency the CLI added to an exact version.
