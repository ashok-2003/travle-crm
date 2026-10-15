# shadcn/ui components

These files come from the shadcn/ui registry (`components.json`: style `radix-nova`, Radix primitives, Lucide
icons), added with `pnpm dlx shadcn@4.21.4 add <name>` from `apps/web`. They are ours to change, but kept close to the
registry so updates stay easy, so they skip the repo's purpose-comment rule. They take their colours from the
brand's tokens through the CSS variables in `src/app/globals.css`; none of them may hold a colour literal
(`test/no-colour-literals.test.ts`).

Changes made after adding them, for DESIGN.md:

- `button.tsx`: pill shape (`rounded-full`), 44px default height (`h-11`), 36px `sm`, 44px `icon`; primary hover is
  `action-pressed`; outline has the input border; ghost is blue text; destructive is an ink outline with red text.
- `input.tsx`: 44px high, 16px text at every width (no iOS zoom), 6px radius, canvas fill.
- `badge.tsx`: 4px radius.
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`: the overlay is the `scrim` token, without blur.
- `sonner.tsx`: one light theme (no `next-themes`), bottom right, a close button.
- `field.tsx`, `input-otp.tsx`: three small fixes the repo's strict lint rules ask for.

Adding a component from another shadcn-compatible registry: list the registry under `registries` in
`components.json`, then `pnpm dlx shadcn@4.21.4 add @<registry>/<name>`. Check the result against DESIGN.md, replace
any colour literal with a token, and pin any dependency the CLI added to an exact version.
