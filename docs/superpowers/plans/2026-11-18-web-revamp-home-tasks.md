# Web revamp part 1 (Home, My tasks, Follow-ups, contact buttons) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Home, Today (renamed My tasks) and Follow-ups so each answers one question with nothing shown twice,
with app-like Call and WhatsApp buttons and button colours that follow what each button does.

**Architecture:** Wave 1 builds the shared pieces and every server change in three parallel tracks (A: buttons and
colours; B1: periods, stage counts, the Leads "came in" filter, chats answered; B2: "AI needs you" for each member,
My tasks' counts, the follow-up hooks). Wave 2 builds the screens on them in two parallel tracks (C: My tasks and
Follow-ups; D: Home). Each track is a git worktree and branch off `feat/web-revamp`, owning the files listed for it;
the controller merges each wave before the next starts. Server changes add web hooks beside them, so the screen tracks
only consume.

**Tech Stack:** Next.js (apps/web), tRPC, Zod contracts, Prisma raw SQL under RLS, shadcn/ui radix-nova registry,
Recharts through the registry Chart, Cult UI animated number (`motion`), next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-web-revamp-home-tasks-design.md` (the spec wins where this plan is silent
or disagrees; record a ruling).

## Global Constraints

- Read first: `CLAUDE.md`, `DESIGN.md`, `docs/agent-playbook.md`, `docs/ui-build-loop.md`, the spec.
- Every shell command starts with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
- Test first; strict TypeScript (no `any`, no `!`); each source file starts with a one-line comment saying what it is for.
- Registry components only (`pnpm dlx shadcn@4.21.4 add <name>` in `apps/web`); no `border`/`divide-`/`ring-`/`shadow`
  classes outside `components/ui`; no colour literals (tokens from `@travel-crm/brand`); 44px touch targets; every word
  a next-intl message; `cn` from `lib/utils.ts`.
- Organization data only inside `db.forOrg()`; inputs are `z.strictObject`, outputs `z.object`; scope via `scopeFilter`.
- Periods: `today`, `week` (from Monday), `month` (from the 1st), `all`, in the agency's time zone.
- Stage cards: New, Contacted, Quote sent, Booking requested, Won, Lost (Not a lead left out of the cards and Total).
- My tasks' address stays `/today`; its name everywhere on screen is "My tasks".
- Follow-ups never appear on My tasks; plain tasks never on Follow-ups.
- Commits: Conventional Commits, header ≤ 100 chars, stage files by name, never `--no-verify`, never `git stash`, no
  `Co-Authored-By`. Each builder runs only its own package tests in the foreground; no full gate (`pnpm check`) on this
  Mac before the owner's local review.
- Journeys (`apps/web/test/e2e`) are updated after the owner's local review, before the pull request (not in this plan);
  a builder may leave a journey it breaks failing, listing it in its report.

## Review Focus

1. **A member with no WhatsApp connection, or without `inbox:view`:** WhatsApp falls back to `wa.me`; nothing throws.
   Test in Task 1.
2. **A salesperson (own scope) asking for everyone's "needs you" or another's counts:** the api returns only their own
   leads' items, and `mine: false` without `ai:manage` is refused. Tests in Tasks 4 and 6.
3. **The week boundary in the agency's zone** (Sunday 23:30 IST is still last week; Monday 00:05 IST is this week):
   Test in Task 3.
4. **A follow-up whose lead has no WhatsApp chat, or whose customer opted out:** the next-move line still says what to
   do ("Call, or send a template."), never blank or "undefined". Test in Task 7.
5. **Every section empty / every card empty:** My tasks says "Nothing to do right now."; Home hides hot leads and
   departures, and no card shows a 0 it doesn't know yet (skeleton while loading). Tests in Tasks 8 and 11.

## Tracks and file ownership

| Track | Wave | Branch / worktree | Owns |
|---|---|---|---|
| A | 1 | `revamp/a-buttons`, `../travel-crm-rv-a` | `apps/web/src/components/contact-icons.tsx`, `leads/contact-buttons.tsx`, `tasks/task-actions.tsx`, `ai/stage-suggestion.tsx`, `packages/brand/src/brand.ts`, `DESIGN.md`, the swept screens' button lines, their tests |
| B1 | 1 | `revamp/b1-periods`, `../travel-crm-rv-b1` | `packages/contracts/src/kernel/period.ts`, `packages/domain/src/kernel/period.ts`, `packages/contracts/src/crm/leads.ts`, `packages/domain/src/crm/lead-list*.ts`, `packages/api/src/routers/leads.ts`, `ai/overview.ts` + `ai.chatsAnswered` in `routers/ai.ts`, `apps/web/src/leads/list/{list-filters.ts,filters-form.tsx,filters-dialog.tsx}`, `leads/use-stage-breakdown.ts`, `ai/use-chats-answered.ts`, their tests |
| B2 | 1 | `revamp/b2-needs-me`, `../travel-crm-rv-b2` | `packages/contracts/src/ai/*` (needs-me inputs), `packages/domain/src/ai/{agent-setup.ts,lite/suggestions.ts}`, `ai.handedOver`/`ai.stageSuggestions` in `routers/ai.ts`, `packages/domain/src/tasks/task-queries.ts`, `packages/domain/src/today/*`, `packages/contracts/src/today/today.ts`, `apps/web/src/ai/agent/use-agent.ts`, `ai/use-needs-me.ts`, `today/use-today.ts`, `follow-ups/{next-move.ts,use-follow-ups-due.ts}`, their tests |
| C | 2 | `revamp/c-tasks`, `../travel-crm-rv-c` | `apps/web/src/today/**` (but `use-today.ts`), `follow-ups/**` (but B2's two files), `shell/navigation.ts` label, `i18n/messages/en-IN/{today,tasks}.json`, `shell.json`'s nav entry, their tests |
| D | 2 | `revamp/d-home`, `../travel-crm-rv-d` | `app/(app)/dashboard/page.tsx`, `apps/web/src/home/**`, `sales/hot-leads-card.tsx`, `today/today-nudge.tsx` (delete), `components/ui/animated-number.tsx`, `i18n/messages/en-IN/home.json`, `shell.json`'s home entries, `apps/web/test/home*.test.tsx`, their tests |

`packages/api/src/routers/ai.ts` is touched by B1 (one new procedure) and B2 (two procedures): each adds only its own
procedure blocks; the merge resolves imports. A change a track needs in another's file goes under "Needs from others"
in its report.

---

### Task 1: Contact icons and the WhatsApp button that opens our inbox (Track A)

**Files:**
- Create: `apps/web/src/components/contact-icons.tsx`
- Modify: `apps/web/src/leads/contact-buttons.tsx`, every caller (`today/today-item.tsx`, `follow-ups/follow-up-item.tsx`,
  `leads/lead/lead-header.tsx`), `packages/brand/src/brand.ts`, the brand CSS it feeds, `DESIGN.md`
- Test: `apps/web/test/leads/contact-buttons.test.tsx`, `packages/brand/test/*` and `apps/web/test/design-tokens.test.ts`
  as they already check the palette

**Interfaces:**
- Produces: `CallGlyph(props: SVGProps<SVGSVGElement>)`, `WhatsAppLogo(props: SVGProps<SVGSVGElement>)`;
  `CallButton({ phone, name, leadId, variant?, compact? })`; `WhatsAppButton({ phone, name, leadId, variant?, compact? })`
  (`leadId` now required); brand colour `whatsappLogo` (`#25D366`, WhatsApp's own green) with its Tailwind class.

- [ ] **Step 1: Write the failing tests** in `contact-buttons.test.tsx`:
  - `"WhatsApp opens the customer's chat in our inbox when WhatsApp is connected"`: `inbox.status` connected, member
    holds `inbox:view`, `inbox.leadChat` returns `{ conversationId: "c1" }` → clicking pushes `inboxRoute("c1")`.
  - `"WhatsApp with no chat yet opens the lead's WhatsApp section to start one"`: `leadChat` returns none → pushes
    the lead page's chat section (`leadRoute(leadId)` + the anchor the lead page's WhatsApp card carries).
  - `"WhatsApp falls back to wa.me without a connection or without the inbox"`: not connected → `href` is
    `https://wa.me/919876543210`, `target="_blank"`; same when the member lacks `inbox:view`.
  - `"compact buttons are icon-only with a name and a tooltip"`: `compact` → no visible word, accessible name
    "Call Priya Nair" / "WhatsApp Priya Nair", the logo `svg` present.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web exec vitest run test/leads/contact-buttons.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Icons: a solid filled handset in the iOS / Android style from a free icon set (licence in
  the file's comment; not Apple's or Google's app icon) and the WhatsApp logo path (Simple Icons, CC0), both inline,
  `aria-hidden`. WhatsApp: read `inbox.status` (cached) and `useHolds("inbox:view")`; when both allow, a button whose
  click `fetchQuery`s `inbox.leadChat({ leadId })` (no query per row on render) and `router.push`es; otherwise the
  `wa.me` link as today. Compact: registry Button `size` for icons at 44px, registry Tooltip, accessible name. The
  logo in `text-whatsapp-logo` (the new token), the handset in ink. Add the token to `brand.colours`, its CSS variable
  and DESIGN.md's palette, plus one line in DESIGN.md's colour rules: "The WhatsApp logo alone may wear WhatsApp's
  green: it is a brand mark, not a status." Also add the stage-card exception line beside the KPI rule (spec §5.2).
  Lists pass `compact`; the lead header keeps words.
- [ ] **Step 4: Run** the test file, `test/design-tokens.test.ts`, `test/brand-css.test.ts`,
  `test/no-colour-literals.test.ts` and `pnpm --filter @travel-crm/brand test` → PASS.
- [ ] **Step 5: Commit** `feat(web): app-like call and WhatsApp buttons that open the inbox`.

### Task 2: Button colours by what they do (Track A)

**Files:**
- Modify: `apps/web/src/tasks/task-actions.tsx`, `apps/web/src/ai/stage-suggestion.tsx`, each swept screen
- Test: `apps/web/test/tasks/task-actions.test.tsx`, `apps/web/test/ai/stage-suggestion.test.tsx`

**Interfaces:**
- Produces: `TaskActions` gains `onDone?: () => void`, called after Done succeeds (Track C opens the next-follow-up
  dialog with it).

- [ ] **Step 1: Write the failing tests:** `"Done and Snooze are plain outline buttons"` (the buttons carry the outline
  variant's `data-variant`, not ghost); `"Done calls onDone after the task closes"`; `"accepting a Lost or Not a lead
  suggestion is a destructive button"` (`data-variant="destructive"`), Keep is outline.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement** the variants and `onDone`. Then sweep: `grep` the agency screens (`apps/web/src`, not
  `console/`) for buttons that end or remove (Lost, Not a lead, Delete, Remove, Cancel a booking or departure,
  Disconnect, Withdraw) with the default (blue fill) or ghost variant, and make them `destructive` (a dialog's final
  confirm keeps the red fill `ConfirmDialog` gives it). List every change in the report (file:line, before, after).
- [ ] **Step 4: Run** the two files and the tests of every swept file → PASS.
- [ ] **Step 5: Commit** `fix(web): button colours follow what each button does`.

### Task 3: Periods and the Leads list's "came in" filter (Track B1)

**Files:**
- Create: `packages/contracts/src/kernel/period.ts`, `packages/domain/src/kernel/period.ts`
- Modify: `packages/contracts/src/kernel/index.ts`, `packages/domain/src/kernel/index.ts`,
  `packages/contracts/src/crm/leads.ts` (`listLeadsInput`), `packages/domain/src/crm/lead-list.ts` (`filterFor`,
  `listLeads`, `countLeads`), `packages/domain/src/crm/lead-list-query.ts` (`createdFrom`),
  `apps/web/src/leads/list/{list-filters.ts,filters-form.tsx,filters-dialog.tsx}` and the "came in" words
- Test: `packages/domain/test/kernel/period.test.ts`, `packages/domain/test/crm/lead-list.test.ts`,
  `apps/web/test/leads/list-filters.test.ts`, `apps/web/test/leads/leads-screen.test.tsx`

**Interfaces:**
- Produces: `periods = ["today", "week", "month", "all"] as const`, `period = z.enum(periods)`, `type Period`;
  `createdWithin = period.exclude(["all"])`; `listLeadsInput.created?: "today" | "week" | "month"` (so
  `leadCountsInput` has it too); `periodStart(period: Period, now: Date, timeZone: string): Date | null` (null for
  `all`); `filterFor(access, input, createdFrom?: Date)`; address param `created`.

- [ ] **Step 1: Write the failing tests:**
  - `period.test.ts`: in `Asia/Kolkata`, now = Mon 2026-11-16 00:05 IST → `week` starts 2026-11-16 00:00 IST; now = Sun
    2026-11-15 23:30 IST → `week` starts 2026-11-09 00:00 IST; `month` at 2026-11-18 → 2026-11-01 00:00 IST; `today` →
    that day's 00:00 IST; `all` → `null`.
  - `lead-list.test.ts`: `"created=week lists and counts only leads that came in since Monday"` (a lead created last
    Sunday is out, one created Monday is in, for both `listLeads` and `countLeads`).
  - `list-filters.test.ts`: `?created=week` reads back as `created: "week"`; an unknown value is left out;
    `listFiltersHref({ created: "month", stage: "won" })` → `/leads?stage=won&created=month`; `isFiltered` is true with
    `created` set.
  - `leads-screen.test.tsx`: the Filters dialog offers "Came in: Any time, Today, This week, This month" and choosing
    one writes `created` to the address.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain exec vitest run test/kernel/period.test.ts test/crm/lead-list.test.ts`
  and the two web files → FAIL.
- [ ] **Step 3: Implement.** `periodStart` from the kernel's `calendarDateIn`, `startOfDayIn` and `addDays` (Monday as
  the week's first day). `filterConditions` adds `AND lead.created_at >= ${createdFrom}::timestamptz` when set;
  `listLeads`/`countLeads` read the agency's zone (`organizationTimeZone`) only when `created` is set.
- [ ] **Step 4: Run** the same tests → PASS; then `pnpm --filter @travel-crm/domain exec vitest run test/crm` and
  `pnpm --filter @travel-crm/contracts test` → PASS.
- [ ] **Step 5: Commit** `feat(crm): a "came in" period filter on the leads list`.

### Task 4: Leads by stage for a period (Track B1)

**Files:**
- Modify: `packages/contracts/src/crm/leads.ts`, `packages/domain/src/crm/lead-list.ts` (or a new
  `lead-stage-breakdown.ts` beside it), `packages/domain/src/crm/lead-list-query.ts`, `packages/domain/src/crm/index.ts`,
  `packages/api/src/routers/leads.ts`
- Create: `apps/web/src/leads/use-stage-breakdown.ts`
- Test: `packages/domain/test/crm/lead-stage-breakdown.test.ts`, `packages/api/test/crm-procedures.test.ts`

**Interfaces:**
- Consumes: Task 3's `period`, `periodStart`, `filterFor`.
- Produces: `stageBreakdownInput = z.strictObject({ period })`; `stageBreakdown = z.object({ total: z.int(), stages:
  z.object({ new, contacted, quote_sent, booking_requested, won, lost, not_a_lead: z.int() }) })` (`total` leaves out
  `not_a_lead`); `stageBreakdownOf(tx, access, period: Period, now: Date): Promise<StageBreakdown>`; procedure
  `leads.stageBreakdown` (`requires("leads:view")`, a query); `useStageBreakdown(period: Period)` returning the query.

- [ ] **Step 1: Write the failing tests:** `"counts every stage of the leads that came in during the period"` (seed
  leads in each stage, one before the period → excluded, a Not a lead → in `stages.not_a_lead`, not in `total`);
  `"a salesperson's breakdown counts only their own leads"` (own scope, another's lead not counted); the router test:
  `stageBreakdown` refuses a member without `leads:view` and parses its output.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `filterFor(access, { view: "everyone" }, periodStart(...))` (scope narrows a
  salesperson to their own) and a `leadStageCountsQuery(filter)` grouping live leads by stage over every stage.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(crm): leads by stage for a period`.

### Task 5: Chats the AI answered in a period (Track B1)

**Files:**
- Modify: `packages/contracts/src/ai/autopilot.ts`, `packages/domain/src/ai/overview.ts`, `packages/domain/src/ai/index.ts`,
  `packages/api/src/routers/ai.ts` (its own procedure block only)
- Create: `apps/web/src/ai/use-chats-answered.ts`
- Test: `packages/domain/test/ai/overview.test.ts`

**Interfaces:**
- Consumes: Task 3's `period`, `periodStart`.
- Produces: `chatsAnsweredInput = z.strictObject({ period })`, `chatsAnswered = z.object({ chats: z.int() })`;
  `chatsAnsweredSince(tx: OrgTx, since: Date | null): Promise<number>` (distinct conversations with an AI message out,
  counted in SQL, no row cap); procedure `ai.chatsAnswered` (`requires("ai:manage")`, as `ai.overview`);
  `useChatsAnswered(period: Period)` (enabled only for holders of `ai:manage`).

- [ ] **Step 1: Write the failing test** `"counts each chat the AI wrote in once, since the period's start"` (two AI
  messages in one chat and one in another since → 2; one before → not counted; `null` counts all time).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain exec vitest run test/ai/overview.test.ts` → FAIL.
- [ ] **Step 3: Implement**; `aiOverviewOf` may reuse it for its 24 hours.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ai): chats the AI answered in a period`.

### Task 6: "AI needs you" for each member (Track B2)

**Files:**
- Modify: `packages/contracts/src/ai/*` (the two inputs), `packages/domain/src/ai/agent-setup.ts`
  (`handedOverChatsOf`), `packages/domain/src/ai/lite/suggestions.ts` (`stageSuggestionsOf`), `packages/api/src/routers/ai.ts`
  (those two blocks), `apps/web/src/ai/agent/use-agent.ts` (pass `{ mine: false }`)
- Create: `apps/web/src/ai/use-needs-me.ts`
- Test: `packages/domain/test/ai/needs-me.test.ts`, `packages/api/test/ai-agent-setup-router.test.ts`

**Interfaces:**
- Produces: `needsMeInput = z.strictObject({ mine: z.boolean() })` for both procedures;
  `handedOverChatsOf(tx, access, { mine })`, `stageSuggestionsOf(tx, access, { mine })`; `ai.handedOver` now
  `requires("inbox:view")` and refuses `mine: false` without `ai:manage` (`FORBIDDEN`, `MISSING_PERMISSION`);
  `useNeedsMe(): { handedOver: HandedOverChat[]; suggestions: StageSuggestion[]; count: number; isPending: boolean;
  isError: boolean; error: unknown; refetch: () => void }` (each query enabled by its permission; a query not allowed
  counts as empty).

- [ ] **Step 1: Write the failing tests:** `"mine shows a salesperson the chats and suggestions on leads they own"`
  (another's lead's items absent); `"mine also shows a manager the ones on leads nobody owns"` (a holder of
  `ai:manage`: own + unowned, not a colleague's); router: a salesperson's `handedOver({ mine: false })` is refused,
  `{ mine: true }` answers.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `mine`: the conversation's person has a live lead owned by the member, or (with
  `ai:manage`) no live lead with an owner; suggestions: `lead.ownerUserId` the member's, or `null` with `ai:manage`.
  `mine: false` keeps today's results for the AI agent page.
- [ ] **Step 4: Run** → PASS; also `apps/web/test/ai/agent` → PASS.
- [ ] **Step 5: Commit** `feat(ai): each member sees what the AI needs from them`.

### Task 7: My tasks' counts, the morning push and the follow-up hooks (Track B2)

**Files:**
- Modify: `packages/domain/src/tasks/task-queries.ts` (`kind`), `packages/domain/src/today/today.ts`,
  `packages/domain/src/today/morning-push.ts`, `packages/contracts/src/today/today.ts`, `apps/web/src/today/use-today.ts`
- Create: `apps/web/src/follow-ups/next-move.ts`, `apps/web/src/follow-ups/use-follow-ups-due.ts`
- Test: `packages/domain/test/today/today.test.ts`, `packages/domain/test/today/morning-push.test.ts`,
  `apps/web/test/follow-ups/next-move.test.ts`

**Interfaces:**
- Produces: `OpenTasksFilter.kind?: TaskKind`; Today's `overdue` and `due-today` (sections and counts) hold `kind:
  "task"` only; `counts.followUpsDue` (open follow-ups assigned to the member due before the day's end);
  `myTasksTotal(counts): number` = `overdue + dueToday + newLeads + paymentsToCheck − checkTasks` (replaces
  `todayTotal`); morning push title `"5 tasks and 6 follow-ups today"` (either part left out at 0; `", 2 overdue"`
  kept), body `"Open My tasks to see them."`; `useMyTasksPreview(limit = 5): { items: TodayItem[] | undefined; isError:
  boolean; error: unknown; refetch: () => void }` (first `limit` of overdue, due-today, new-leads, in that order);
  `replied(row: FollowUpRow): boolean`; `nextMove(row: FollowUpRow): NextMove | null` with
  `type NextMove = "answer-whatsapp" | "replied-window-closed" | "call" | "call-or-template"`;
  `useFollowUpsDue(): { due: number; replied: number } | undefined` (the member's own Due follow-ups).

- [ ] **Step 1: Write the failing tests:**
  - `today.test.ts`: `"overdue and due today leave out follow-ups"`; `"counts follow-ups due today apart"`.
  - `morning-push.test.ts`: `"names tasks and follow-ups"` → `"5 tasks and 6 follow-ups today, 2 overdue"`;
    `"leaves out a part that is zero"` → `"6 follow-ups today"`; nothing at all → no push.
  - `next-move.test.ts`: customer wrote last, window open → `answer-whatsapp`; customer last, window closed →
    `replied-window-closed`; AI outcome `sent`, last from AI → `call`; outcomes `window_closed`, `no_chat`,
    `opted_out`, `failed`, or no chat → `call-or-template`; nothing yet → `null`; `replied` true only when
    `whatsapp.lastFrom === "customer"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `useFollowUpsDue` reads `tasks.followUps({ view: "due", mine: true })`.
- [ ] **Step 4: Run** the three files and `pnpm --filter @travel-crm/domain exec vitest run test/today test/tasks`
  → PASS.
- [ ] **Step 5: Commit** `feat(today): my tasks without follow-ups, and follow-ups in the morning push`.

---

### Task 8: My tasks (Track C)

**Files:**
- Modify: `apps/web/src/today/today-screen.tsx`, `today-section.tsx`, `today-item.tsx`, `today/page-title`'s source,
  `shell/navigation.ts` (label), `i18n/messages/en-IN/{today,shell}.json`
- Create: `apps/web/src/today/ai-needs-you-section.tsx`, `apps/web/src/follow-ups/follow-ups-line.tsx`
- Test: `apps/web/test/today/today-screen.test.tsx`, `today-item.test.tsx`, `page-title.test.ts`

**Interfaces:**
- Consumes: Task 1's compact buttons, Task 2's button variants, Task 6's `useNeedsMe`, Task 7's `myTasksTotal`,
  `useFollowUpsDue`, the payments-to-check line (`today/payments-to-check-section.tsx`).
- Produces: `FollowUpsLine()` ("6 follow-ups due · 2 replied → Follow-ups", nothing when none are due), used by Home.

- [ ] **Step 1: Write the failing tests** (`today-screen.test.tsx`): the title is "My tasks" and the header reads
  "Wed 18 Nov · 9 to do · 4 overdue"; sections in the order Overdue, Due today, New leads to contact, AI needs you,
  each hidden when empty, each with its count and at most 5 rows; Overdue's View all shows the rest in place; New
  leads' View all links to `/leads?stage=new`; AI needs you's View all links to the AI agent page only for `ai:manage`;
  no hot leads, departures, payments due, trip details or quote opened; the follow-ups line shows with due > 0; all
  empty → "Nothing to do right now."; a handed-over chat row has Open chat, a suggestion row has a destructive
  "Mark lost" and Keep. `today-item.test.tsx`: rows use the compact Call and WhatsApp. `page-title.test.ts`: "My tasks".
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web exec vitest run test/today` → FAIL.
- [ ] **Step 3: Implement** with `ItemGroup`/`Item` sections (no new primitives), the Away switch kept at the top, the
  stale "later" line removed.
- [ ] **Step 4: Run** → PASS, plus `test/shell`.
- [ ] **Step 5: Commit** `feat(web): My tasks: overdue, due today, new leads and what the AI needs`.

### Task 9: Follow-ups (Track C)

**Files:**
- Modify: `apps/web/src/follow-ups/follow-ups-screen.tsx`, `follow-up-item.tsx`, `i18n/messages/en-IN/tasks.json`
- Create: `apps/web/src/follow-ups/next-follow-up-dialog.tsx`
- Test: `apps/web/test/follow-ups/follow-ups-screen.test.tsx`, `next-follow-up-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 7's `nextMove`, `replied`; Task 2's `TaskActions onDone`; `leads.addWork` (`addLeadWorkInput`:
  `{ leadId, kind: "follow-up", title, due }`).

- [ ] **Step 1: Write the failing tests:** tabs Due and Later only (no All); Due holds Overdue and Due today; Later
  groups Tomorrow, This week, Later; the header reads "6 due · 2 replied"; within a section replied rows come first,
  then by due time; each row shows one next-move sentence (the five cases of Task 7, words from `tasks.json`) and no
  "Window open", "AI wrote" or "Added by AI" lines; Done opens "When's the next follow-up?" with Tomorrow, In 3 days,
  Next week, No more follow-ups; choosing Tomorrow calls `leads.addWork` with the same lead, kind `follow-up`, the
  same title and tomorrow at the same time of day; No more follow-ups closes with no call; the dialog holds while
  pending (rule 7).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web exec vitest run test/follow-ups` → FAIL.
- [ ] **Step 3: Implement** with `ResponsiveDialog`/`ConfirmDialog` for the next follow-up, the compact buttons, and
  Mine / Everyone kept for members who see every lead.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): follow-ups say the next move, and Done asks for the next one`.

### Task 10: Home's header and leads card (Track D)

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`, `i18n/messages/en-IN/home.json`
- Create: `apps/web/src/home/period-filter.tsx`, `apps/web/src/home/leads-card.tsx`
- Test: `apps/web/test/home.test.tsx` (rewrite), `apps/web/test/home/leads-card.test.tsx`

**Interfaces:**
- Consumes: Task 4's `useStageBreakdown`, Task 3's `listFiltersHref` with `created`, `stageTones` (`leads/stage-badge.tsx`),
  the registry Chart and ToggleGroup, `InfoHint`.
- Produces: `PeriodFilter({ value: Period; onChange(period: Period): void })`; Home keeps the period in state (default
  `month`).

- [ ] **Step 1: Write the failing tests:** the header's action is the period filter (Today, This week, This month,
  All time) and there is no New lead or Pipeline button; the leads card shows Total leads and six stage cards (no Not
  a lead), each in its `stageTones` tint, each linking to `/leads?view=everyone&stage=<stage>&created=<period>` for a
  manager (no `view` for a salesperson; no `created` for All time); the donut has one segment per stage with leads;
  Total is not a link; "Open reports" links to Reports; the title's info hint explains the counting; a skeleton while
  loading, never a 0.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web exec vitest run test/home.test.tsx test/home` → FAIL.
- [ ] **Step 3: Implement**; the donut's colours are the stages' dot tokens through the Chart's config.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): Home's leads by stage, for a period`.

### Task 11: Home's tasks, hot leads, departures, AI insights and attention (Track D)

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`, `apps/web/src/sales/hot-leads-card.tsx`, `home.json`
- Create: `apps/web/src/home/{tasks-card,departures-card,ai-insights-card,attention-card}.tsx`,
  `apps/web/src/components/ui/animated-number.tsx` (Cult UI, via the shadcn CLI; noted in `components/ui/README.md`)
- Delete: `apps/web/src/home/at-a-glance.tsx`, `home/month-card.tsx`, `today/today-nudge.tsx` and their tests
- Test: `apps/web/test/home.test.tsx`, `apps/web/test/home/*.test.tsx`

**Interfaces:**
- Consumes: Task 7's `useMyTasksPreview`, Task 8's `FollowUpsLine`, Task 6's `useNeedsMe`, Task 5's
  `useChatsAnswered`, `trpc.ai.settings` (`usedThisMonth`, `monthlyLimit`), the Today `departures` section
  (`useTodaySection("departures")`), `useHotLeads`.

- [ ] **Step 1: Write the failing tests:** order on the page: setup card (settings managers until done), leads card,
  Your tasks today, Hot leads to call, Departures leaving soon, AI insights, Needs your attention; Your tasks today
  shows at most 5 rows from overdue, due today and new leads, no AI items, the follow-ups line, View all → `/today`;
  hot leads at most 5 with Call, View all → `/leads`, hidden when none; departures hidden when none, View all →
  `/departures`; AI insights only for `ai:manage`: a pie of used against the monthly limit and the chats answered for
  the period; Needs your attention lists `useNeedsMe` items, View all → AI agent page for `ai:manage`, else `/today`;
  no tiles, nudge, month card or money tile remain.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; the animated number counts from 0 to the value and stays still under
  `prefers-reduced-motion`.
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/web exec vitest run test/home.test.tsx test/home test/sales` → PASS.
- [ ] **Step 5: Commit** `feat(web): Home's day: tasks, hot leads, departures, AI insights and attention`.

### Task 12: See it running (controller)

- [ ] **Step 1:** Merge wave 2 into `feat/web-revamp`; `pnpm --filter @travel-crm/web exec tsc --noEmit` and
  `pnpm --filter @travel-crm/web lint` → clean.
- [ ] **Step 2:** Run the app from the revamp worktree with its own `COMPOSE_PROJECT_NAME` (checked with
  `scripts/dev/compose.sh --print-name`), build the demo agency, and shoot Home, My tasks and Follow-ups as the Owner
  and as a Sales member, phone 390×844 and desktop 1440×900 (`pnpm e2e:audit` or the browser).
- [ ] **Step 3:** Review the shots against DESIGN.md and the spec; fix any "must" through the owning track; send the
  owner the shots and the local address to iterate.
