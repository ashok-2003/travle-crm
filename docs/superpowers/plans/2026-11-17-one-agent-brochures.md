# One WhatsApp agent, brochures: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each brochure carries an owner-written name and description; the one agent sees them in its trip data, sends
one by its id (`send_brochure(brochure_id)`) captioned with its name, sends it again when asked, and no longer needs
the chat to have named the trip.

**Architecture:** A package-owned table keyed by the brochure's attachment holds its name and description, edited
beside each brochure in the package editor. Natural's trip sheets carry each brochure (natural reads none of it, so
natural is unchanged). The one agent labels brochures `B1, B2…` from the sheets with one pure function, used both for
the system block and inside the stage, so a label always means the same file within a turn.

**Tech Stack:** as the core plan's.

**Spec:** `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md` section 6 (and 10: the "chat must have named
the trip" rule goes), with the prompt's sections 7 and 8 (`send_brochure`). Builds on the core plan
`docs/superpowers/plans/2026-11-17-one-agent-core.md`: its Global Constraints and rulings bind this plan.

## Global Constraints

- Everything in the core plan's Global Constraints (versions, natural unchanged, the files never to edit, commands
  under Node 24, Conventional Commits, staged by name, no `Co-Authored-By`, never `git stash`).
- Builders follow `.superpowers/sdd/one-agent/builder-rules.md`: per-package tests, `typecheck` and `lint`, never
  `pnpm check` (the lead runs it per wave).
- **Shared files merge in plan order: brochures, media, buttons, summary.** A task that edits a file another plan edits
  names the earlier task in its "Waits on", starts from `origin/feat/one-agent` after that task merged, and merges
  `origin/feat/one-agent` again before review.
- Migration `20261218300000_package_brochure` (after the core's `20261218200000_one_agent`). The table follows
  `packages/db/README.md`'s recipe: `app_enable_org_rls`, a fixture in `packages/db/test/org-table-fixtures/quotes.ts`,
  every unique constraint and foreign key with `organization_id`, keys `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- Limits: a name 1–80 characters, a description 0–300, both trimmed, one line each (no line breaks kept).
- A brochure with no name reads as its trip's title; one with no description reads "no description yet". Uploaded file
  names are never shown to the model or used as a caption (owner).
- At most 3 files per brochure send (`MAX_AI_MEDIA_PER_REPLY`): the brochure first, then the trip's photos not sent
  before in this chat.
- `origin/ayush` touches `packages/contracts/src/quotes/packages.ts` (sell gaps, near the top), `apps/web/src/packages/
  package-screen.tsx`, and `packages.json`, `audit.json` and `errors.json` messages: add your lines in their own hunks
  (the brochure contracts near `packageFile`, new message keys in their own section).

## Review Focus

1. **A brochure removed between the turn's read and its act.** Expected: the act sends what is still there (the
   brochure skipped, the photos kept) and never fails the turn. Test in Task 4.
2. **Brochures with no name** (every brochure today, and every one a PDF import copies). Expected: the trip's title
   stands in, in the model's list and as the caption. Tests in Tasks 3 and 4.
3. **Asked again.** Expected: a brochure sent before goes again when staged, the photos already sent don't repeat, and
   the send stays within 3 files. Test in Task 4.
4. **Labels drift.** The `B` labels in the system block, the tool's enum and the stage must name the same files in one
   turn. Expected: one function makes them all. Test in Task 3.
5. **Owner text with markup or line breaks** in a name or description. Expected: one trimmed line, fenced where the
   model reads it. Tests in Tasks 1 and 3.

## Rulings

- **BR1. A table of its own, `package_brochure`**, one row per described brochure: `id` (UUID v7), `organization_id`,
  `package_id` (to `quote_template`), `attachment_id` (unique per organization), `name`, `description`, `updated_by`,
  `updated_at`. No row means "not described yet". No foreign key to `attachment` (the purge and file sweeps delete
  attachments on their own; a row whose file is gone is never read, since reads start from the ready attachments).
  Removing a brochure deletes its row. — Spec 6 (lead: "a package-owned table keyed by the attachment"). — None.
- **BR2. PDF imports fit by the fallback**, and `attachDraftBrochure` takes optional `{ name, description }` so
  `origin/ayush`'s import can pass the draft's title and a line about it once both land (their `import-pdf.ts` calls it
  without them today, which still compiles). — The owner's words are owner-written; a draft's are a start. — None.
- **BR3. Labels `B1…Bn`** in the sheets' order, then each trip's brochures in the order they arrived, from
  `brochureLabelsOf(sheets)`. The model never sees an attachment id. — As `T1` for trips. — None.
- **BR4. No "sent already" refusal for one** (owner, O1): the turn block lists the brochures sent in this chat, and the
  prompt says not to send one again unasked. Natural keeps its own rule. — String checks go (spec 10). — A brochure
  sent twice by mistake, visible in the trace.
- **BR5. Natural is unchanged:** its sheets gain fields it never reads; its `send_brochure(trip_id)`, captions, G6
  and "sent already" refusal stay.

## Files and waits

| Task | Owns | Waits on |
| ---- | ---- | -------- |
| 1    | migration; `packages/db/prisma/schema/sales.prisma` (`PackageBrochure`, `QuoteTemplate.brochures`); `packages/db/test/org-table-fixtures/quotes.ts`; `packages/domain/src/quotes/{package-brochures,package-files,group-package-create,index}.ts`; `packages/contracts/src/quotes/packages.ts` (brochure part); `packages/api/src/routers/packages.ts`; `apps/web/src/i18n/messages/en-IN/{audit,errors}.json` (new keys) | none (its migration's name sorts after the core's) |
| 2    | `apps/web/src/packages/{package-files-card,brochure-details-dialog,use-package-files}.ts(x)`; `apps/web/src/i18n/messages/en-IN/packages.json` (`files.*` keys) | Task 1 |
| 3    | `packages/domain/src/ai/natural/types.ts` (`TripSheet` only), `natural/trips/{trip-sheets,brochures}.ts` | Task 1; core T5 (`types.ts`) |
| 4    | `packages/contracts/src/ai/one-tools.ts`; `natural/tools/action-tools.ts`; `natural/types.ts` (`StagedAction` only); `natural/act-send.ts`; `one/context.ts` | Task 3; core T3, T5, T8, T9, T11 |

Media's Task 4 and buttons' Task 3 wait on this plan's Task 4 (they edit `one-tools.ts`, `action-tools.ts`,
`act-send.ts`, `types.ts` and `one/context.ts` after it).

---

### Task 1: A brochure's name and description: the table, the reads, the save

**Files:**
- Create: `packages/db/prisma/migrations/20261218300000_package_brochure/migration.sql`,
  `packages/domain/src/quotes/package-brochures.ts`
- Modify: `sales.prisma`, `org-table-fixtures/quotes.ts`, `quotes/package-files.ts` (the list returns each brochure's
  words; removing a brochure deletes its row), `quotes/group-package-create.ts` (`attachDraftBrochure`'s optional
  words), `quotes/index.ts`, `contracts/src/quotes/packages.ts`, `api/src/routers/packages.ts` (`describeFile`),
  `audit.json` (`actions.package.brochure-described`), `errors.json` (`BROCHURE_NOT_FOUND`)
- Test: `packages/domain/test/quotes/package-brochures.test.ts`, `packages/api/test/package-brochures-router.test.ts`

**Interfaces:**
- Produces:

```ts
// contracts/quotes/packages.ts
export const BROCHURE_NAME_MAX = 80; export const BROCHURE_DESCRIPTION_MAX = 300;
const oneLine = (most: number) => z.string().transform((s) => s.replace(/\s+/gu, " ").trim()).pipe(z.string().max(most));
export const describeBrochureInput = z.strictObject({ packageId: recordId, attachmentId: z.uuid(),
  name: oneLine(BROCHURE_NAME_MAX).pipe(z.string().min(1)), description: oneLine(BROCHURE_DESCRIPTION_MAX) });
// packageFile gains: name: z.string().nullable(), description: z.string().nullable()
// domain/quotes/package-brochures.ts
export interface BrochureWords { attachmentId: string; name: string | null; description: string | null }
/** Each package's ready brochures in the order they arrived, with the owner's words; none described reads null. */
export async function brochuresByPackage(tx: OrgTx, packageIds: readonly string[]): Promise<Map<string, BrochureWords[]>>;
/** Saves the words (upsert by attachment), audited "package.brochure-described" with before and after. */
export async function describeBrochure(deps: PackageFileDependencies, access: MemberAccess,
  input: DescribeBrochureInput): Promise<void>;                 // NOT_FOUND BROCHURE_NOT_FOUND unless a ready brochure of the package
// group-package-create.ts
export async function attachDraftBrochure(deps, access, packageId: string, knowledgeId: string,
  words?: { name: string; description: string }): Promise<void>;
// router: describeFile: editor.input(describeBrochureInput).mutation(...)  (the same editor procedure as confirmFile)
```

- [ ] **Step 1: Write the failing tests:** `it("reads a brochure's name and description, and null for one never
  described")`, `it("keeps the words in one trimmed line within their limits")` (a name with a line break and spaces
  saves as one line; 81 characters refused), `it("refuses words for a file that isn't a ready brochure of the
  package")`, `it("forgets the words when the brochure is removed")`, `it("audits the change with before and
  after")`, `it("names a brochure a PDF import copied, when given the words")`, and the router's `it("lets a package
  editor describe a brochure and refuses everyone else")`. The org-table suite fails until the fixture exists.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/quotes/package-brochures.test.ts` and
  `pnpm --filter @travel-crm/api test -- test/package-brochures-router.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** the migration by hand, the schema to match, `pnpm --filter @travel-crm/db generate`, then
  the domain, contracts and router.
- [ ] **Step 4: Run** the same, `pnpm --filter @travel-crm/db test` and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(quotes): each brochure keeps an owner-written name and description`.

### Task 2: Describing a brochure in the package editor

**Files:**
- Create: `apps/web/src/packages/brochure-details-dialog.tsx`
- Modify: `apps/web/src/packages/package-files-card.tsx`, `use-package-files.ts` (`describe` mutation, refreshing the
  list), `apps/web/src/i18n/messages/en-IN/packages.json`
- Test: `apps/web/test/packages/package-files-card.test.tsx`

Each brochure row shows its name (or "No name yet: the AI uses the trip's title") over its description (or "No
description yet"), the file name as the link to open it, and a "Describe" button (`variant="outline"`, 44px) that
opens `FormDialog` with `TextField` for the name and the registry `Textarea` in `FormField` for the description, both
with their counts, from `describeBrochureInput`'s checks (`useCheckedForm`). The card's intro adds one sentence: "The
AI picks a brochure by its name and description." A refused save shows its sentence (`RefusalAlert`); the button
follows `useWriteAccess("change")` with its `WriteHint`.

- [ ] **Step 1: Write the failing tests:** `it("shows each brochure's name and description, and says when there are
  none")`, `it("describes a brochure and shows the saved words")`, `it("keeps the dialog open and Cancel off while it
  saves")`, `it("disables Describe when the subscription refuses changes")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/packages/package-files-card.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement** with registry components only (no border, ring or shadow classes; owner's UI rules).
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/web typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): name and describe each brochure for the AI`.

### Task 3: Trip sheets carry their brochures

**Files:**
- Create: `packages/domain/src/ai/natural/trips/brochures.ts`
- Modify: `packages/domain/src/ai/natural/types.ts` (`TripSheet`), `natural/trips/trip-sheets.ts`
- Test: `packages/domain/test/ai/natural/brochures.test.ts`, `packages/domain/test/ai/natural/trip-sheets.test.ts`

**Interfaces:**
- Consumes: Task 1's `brochuresByPackage`.
- Produces:

```ts
// types.ts: TripSheet gains, natural reading neither (its fileIds and text stay as they are)
brochures: { attachmentId: string; name: string | null; description: string | null }[];
photoIds: string[];
// natural/trips/brochures.ts
export interface BrochureLabel {
  label: string; packageId: string; tripLabel: string; attachmentId: string;
  name: string;                    // the owner's, else the trip's title
  description: string | null;
}
export function brochureLabelsOf(sheets: readonly TripSheet[]): Map<string, BrochureLabel>;   // ruling BR3
/** "## Brochures" for the system message, one line each, fenced: "B1 · T1 Snow Lake Trek · <name>: <description>". */
export function brochuresBlock(sheets: readonly TripSheet[]): string | null;                  // null with none
/** "Brochures sent in this chat: B2 <name>; B5 <name>." from facts.sentFileIds, or null. */
export function sentBrochuresLine(sheets: readonly TripSheet[], sentFileIds: readonly string[]): string | null;
```

- [ ] **Step 1: Write the failing tests:** `it("carries each trip's brochures with their words, and its photos, and
  keeps fileIds as natural reads them")`, `it("labels brochures B1 on in the sheets' order, the same every time")`,
  `it("names an undescribed brochure by its trip's title and says it has no description yet")`, `it("fences the
  owner's words in one line")`, `it("lists the brochures sent in this chat")`, and natural's `context.test.ts` and
  `trip-text.test.ts` stay green unchanged (its prompt text didn't change).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/brochures.test.ts
  test/ai/natural/trip-sheets.test.ts`; expect FAIL.
- [ ] **Step 3: Implement**; `tripSheetsOf` reads `brochuresByPackage` beside `packageFilesByPackage` (one more read
  for all packages, not one per trip).
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): trip sheets carry each brochure's name and description`.

### Task 4: The one agent sends a brochure by its id

**Files:**
- Modify: `packages/contracts/src/ai/one-tools.ts`, `packages/domain/src/ai/natural/tools/action-tools.ts` (one's
  branch), `natural/types.ts` (`StagedAction` `send_brochure`), `natural/act-send.ts`, `packages/domain/src/ai/one/
  context.ts`
- Test: `packages/contracts/test/ai/one-tools.test.ts`, `packages/domain/test/ai/natural/action-tools.test.ts`,
  `packages/domain/test/ai/natural/act.test.ts`, `packages/domain/test/ai/one/context.test.ts`,
  `packages/domain/test/ai/one/turn.test.ts`

**Interfaces:**
- Consumes: Task 3 (`brochureLabelsOf`, `brochuresBlock`, `sentBrochuresLine`); core T3 (`oneToolSchemas`,
  `parseOneToolArguments`), T5 (`stageAction(…, { agent: "one" })`), T8 (`buildOneContext`), T11 (the live turn).
- Produces:

```ts
// one-tools.ts: one's send_brochure takes a brochure, natural's keeps trip_id
export const oneSendBrochureArguments = z.strictObject({ brochure_id: z.string() });
export function oneToolSchemas(input: { tripLabels: readonly string[]; brochureLabels?: readonly string[] }): OneToolSchema[];
// send_brochure offered only with brochure labels, its brochure_id an enum of them; description:
//   "Sends one brochure, captioned with its name, and up to two of its trip's photos not sent before in this chat."
export function parseOneToolArguments(name: string, raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[], more?: { brochureLabels?: readonly string[] }): /* the core's return type */;
// natural/types.ts: send_brochure gains, both absent for natural
caption?: string;           // the brochure's name (BrochureLabel.name)
resend?: readonly string[]; // file ids sent again even if this chat had them
```

One's stage (`stageAction` with `{ agent: "one" }`): labels from `brochureLabelsOf(context.sheets)`; no G6, no "sent
already" refusal; files `[attachmentId, ...photoIds not in facts.sentFileIds].slice(0, 3)`; staged
`{ tool: "send_brochure", packageId, fileIds, caption: name, resend: [attachmentId] }`; result
`goes with your reply: B2 «name», and <n> photos` plus `; it went in this chat before and goes again` when it did.
The act (`act-send.ts`) sends a staged file unless this chat had it and it isn't in `resend`, captions with
`caption ?? trip title`, and still drops a file the package no longer holds. `buildOneContext` adds `brochuresBlock`
after the trips block in the system message, passes `brochureLabels` to `oneToolSchemas`, and puts
`sentBrochuresLine` before the notice in the turn block.

- [ ] **Step 1: Write the failing tests:** contracts `it("sends a brochure by its label, and refuses one that isn't
  listed")`; action tools `it("stages one's brochure by its id, with no named trip needed")`, `it("stages a brochure
  sent before again, and no photo twice")`, `it("still refuses natural's brochure the chat didn't name")`; act
  `it("sends the brochure again with its name as the caption, within three files")`, `it("skips a brochure removed
  since the turn read it, and still answers")`; context `it("lists the brochures in the system message and the ones
  sent in the turn block")`; turn `it("sends B2 by its id on the LangGraph adapter")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/contracts test -- test/ai/one-tools.test.ts` and
  `pnpm --filter @travel-crm/domain test -- test/ai/natural/action-tools.test.ts test/ai/natural/act.test.ts
  test/ai/one/context.test.ts test/ai/one/turn.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/natural test/ai/one`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent sends a brochure by its name, and again when asked`.
