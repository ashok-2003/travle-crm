# How travel-crm's UI was built: the rules, the guards and the visual-audit loop

This is the method behind the screens in `~/personal/travel-crm` (main, `25544d4`). Read the repo's `CLAUDE.md`
section "The owner's UI rules" and `DESIGN.md` first: they are the binding version of what follows.

## 1. Decide the look once, in code

- **`DESIGN.md` at the repo root** is the single design reference. It covers:
  - fonts: EB Garamond for titles, Figtree for the UI, IBM Plex Mono for numbers;
  - the warm white background `#fffdf9`;
  - colour by meaning: blue is action, forest is money, red/amber/green are status only, with a dot and a label;
  - 44px touch targets, motion only behind `motion-safe`;
  - Indian formats: displayed dates read "16 Oct", dd/mm/yyyy appears only inside date inputs, and money is ₹ with
    lakh grouping, in mono.
- **The tokens live in one place** (`packages/brand` plus the Tailwind theme). Tests fail when `DESIGN.md` and the
  tokens disagree (`design-tokens.test.ts`, `brand-css.test.ts`).
- **shadcn/ui registry components only** (radix-nova), added with the pinned CLI: `pnpm dlx shadcn@4.21.4 add <name>`
  in `apps/web`.
  - Never hand-write a primitive the registry has (dialog, sheet, table, popover, calendar, item, card, input-group,
    sidebar, collapsible, empty and so on).
  - Our own components are thin compositions of registry ones.
  - Any edit to a `components/ui` file is recorded with its reason in `components/ui/README.md`.
- **The owner's seven rules** (CLAUDE.md):
  1. registry only;
  2. no extra border, ring, shadow or divider on top of shadcn, and no recolouring (use the variant), so content is
     grouped with Card, Item/ItemGroup/ItemSeparator, Table and Separator;
  3. simpler is better: fewer lines through better arrangement, no duplicate helpers;
  4. DESIGN.md;
  5. every date input is `DateField` (Calendar in a Popover);
  6. tables use the registry Table, and TanStack Table only where the browser sorts or filters;
  7. a dialog that sends a request holds while it is pending: Cancel off, no closing, and success handled in the
     mutation's own options.

## 2. Shared pieces, so every screen looks and behaves alike

These are in `apps/web/src/components/`, and the full list is in CLAUDE.md:

- **Frame:** `PageHeader` (title, intro, action).
- **Dialogs:**
  - `ResponsiveDialog` is a sheet on phones and a dialog on desktop. Its `footer` slot stays outside the scrolling
    body, stacked full width on phones, and its `busy` flag holds it while a request is out.
  - `ConfirmDialog` (destructive), `FormDialog`.
- **Forms:** `FormField`, `TextField`, `MoneyField`, `SelectField`, `PhoneField`, `DateField`, plus
  `useCheckedForm`, which validates with the api's own zod schema.
- **States:** `LoadingRows` (skeletons shown after 200ms), `EmptyState`, `ErrorState({ error })` (shows a refusal's
  own sentence), `RefusalAlert`, `WriteHint` (why a button is off).
- **Lists:** `Details` (label and value rows), `useCursorPages` with `ShowMoreButton`.
- **Links:** `TextLink` (wraps, 44px) with an `inline` form, `BackLink`.
- **Words:** `formatDay`, `formatDayTime`, `formatPhoneNumber`; every api refusal code maps to a sentence in
  `errors.json`.

Every screen has the same four states: a skeleton, empty, an error with Try again, and a refusal with its reason.
Screens are mobile-first: a bottom bar on phones, the registry Sidebar fixed on desktop.

## 3. Guards that fail the build (run in `pnpm check` and CI)

- `no-hand-drawn-borders.test.ts`: any `border`, `divide-`, `ring-` or `shadow` class outside `components/ui` fails.
- `no-colour-literals`, `design-shapes` (radii and z-index scale), `touch-targets`, `no-inner-html`.
- `error-reasons.test.ts`: every refusal the api throws has a sentence, and every sentence has a thrower.
- **Accessibility:** every Playwright journey runs axe after each test (`support/accessible-after-each.ts`), on a phone
  and a desktop project. That check caught a blue link on a tinted banner at 4.33:1.
- **Lighthouse budgets** on the public pages: performance ≥ 0.8, accessibility 1, best practices ≥ 0.95, layout
  shift ≤ 0.01.

## 4. How it was built and reviewed

- **Plans first.** Each plan is split into tracks by file ownership. Builders run in parallel git worktrees, one
  track each, and each runs only its own checks in the foreground.
- **A task review for every track.** It checks the spec, code quality and the owner's UI rules, and lists every
  hand-drawn border with file:line. Then:
  - fix waves by file ownership, with scoped re-reviews;
  - three final whole-branch reviews in parallel: server and security, agency screens, console and release. They
    hunt the seams and the same thing built twice.

## 5. The visual-audit loop: the part that made it clean

1. **The camera,** committed to the repo:
   - `apps/web/playwright.audit.config.ts` matches `test/e2e/audit/*.audit.ts`, so the normal gate never runs it.
   - It has two projects: phone 390×844 at 2x, and desktop 1440×900.
   - It reuses the journeys' harness: the real api, worker and console, and Postgres through Testcontainers.
   - The audit files walk **every screen as the right person**:
     - signed out, and the account steps;
     - the Owner on every agency screen, plus a Sales member;
     - each subscription state (trial ending, past due, read-only, suspended, cancelled);
     - the console as super admin and as support, and while impersonating;
     - one empty, one error and one skeleton state on each side.
   - `shoot()` waits until the screen has settled: no skeleton, no toast (it moves the pointer to the corner first,
     because a toast pauses under the pointer), and fonts and images loaded. Then it saves
     `AUDIT_OUT/<project>/<nn>-<screen>.png` and writes an `index.md` (shot, screen, route, person).
   - Run it with `pnpm e2e:audit` (`AUDIT_OUT=… --project phone|desktop --grep <screen>`).
   - The shots go to `apps/web/test-results/audit` unless `AUDIT_OUT` says otherwise. Playwright empties a run's
     output folder as it starts, so each config has its own: the journeys `test-results/journeys`, the audit run
     `test-results/audit-run`. A journey run no longer wipes the shots a review is reading
     (`test/playwright-configs.test.ts` keeps the folders apart). Keep a round's shots in their own folder
     (`AUDIT_OUT=test-results/audit/round-2`) so the next round doesn't overwrite them.
2. **Round 1 review:**
   - Three reviewers, each on a range of shots, open every PNG in both projects. They use a vision model; Opus was
     used.
   - They judge against DESIGN.md and the owner's rules, and list one finding per row:
     `# | must/should/could | shots | what's wrong | file | the fix`.
   - "must" means broken or against the rules: clipped or overflowing text, a main button below the screen, raw codes
     shown to a person, an unstyled page, placeholder text. "should" means a clear flaw. Taste is skipped.
   - Result: 9 must, 36 should, 39 could.
3. **Fix the shared pieces first (P1), then the screens (P2).** Most findings had one root:
   - the dialog footer scrolled away: one fix in `ResponsiveDialog` closed three musts;
   - headers differed: one `PageHeader`;
   - long detail pages: compact `Details` roughly halved the organization page.

   Build those shared pieces first, merge them, then every owner adopts them on their own screens and fixes their
   per-screen rows. Each fixer re-runs the camera on their own screens and looks at the shots before reporting.

4. **Round 2:** re-shoot everything into `audit/round-2`. Check reviewers compare each round-1 must and should
   (fixed, not fixed or worse) and list anything new. Merge only when no "must" is left.
5. **Then the full gate:** format, typecheck, lint, unit tests, import rules, journeys on both projects with axe,
   migrations, the image and product smokes, and Lighthouse.

## 6. Gotchas worth knowing

- **Parallel builders duplicate helpers.** Build the shared pieces first, then let tracks adopt them.
- **Password lookups:** `getByLabel("Password")` also matches the "Show password" button, so use `{ exact: true }`.
- **Running one journey:** `pnpm --filter @travel-crm/web e2e -- <spec>` runs every journey. Use
  `./node_modules/.bin/playwright test test/e2e/<spec>` from `apps/web`.
- **Links:** a registry Button used as a link doesn't wrap, so give it a wrapping form and an inline form.
- **Banners:** link blue on a tinted banner fails contrast, so the link takes the banner's own text colour,
  underlined.
- **Toasts:** Sonner pauses a toast under the (emulated) pointer, so the camera moves the pointer away before it waits.
- **Docker:** builders in clones always use their own `COMPOSE_PROJECT_NAME`, so they never touch the owner's
  containers.
