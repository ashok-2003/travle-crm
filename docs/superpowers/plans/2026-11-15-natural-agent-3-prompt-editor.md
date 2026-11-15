# Natural agent, plan 3: the console prompt editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin edits the natural agent's system prompt in the console, saves a draft, tries the draft in Try
it, publishes it so every natural turn uses it, and rolls back to any earlier version in one action; each turn's trace
names the version it used, and no prompt edit can switch a guard off.

**Architecture:** Two platform tables with no `organization_id` (`agent_prompt_version`, `agent_prompt_live`), written
only by the platform module in platform transactions and reached through one entry point,
`@travel-crm/db/agent-prompts`, as the other unscoped tables are. The runtime role may only read them, and only the AI
module's `natural/prompt-source.ts` does, inside `db.withoutOrg`, because the worker and the api must use the published
prompt and may not import the platform module. Plan 1's seam (`naturalPromptOf`, `draftNaturalPrompt`) gets its real
bodies; nothing else in the agent changes. The guards stay in code.

**Tech Stack:** Prisma 7.10 and Postgres 18, dependency-cruiser and ESLint guards, tRPC (console router), Next.js
console screens with shadcn and next-intl, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-natural-whatsapp-agent-design.md` (section 6, section 8's prompt library
line, Appendix A) and the owner's ruling of 2026-11-15, quoted below. Plan 1
(`2026-11-15-natural-agent-1-try-it.md`) and its rulings bind this plan.

## Global Constraints

- Plan 1's Global Constraints, all of them.
- The repository's platform rules (CLAUDE.md "Data rules" and "Platform and subscriptions"): only the platform module
  uses `@travel-crm/db/platform`; only the console's code imports `@travel-crm/domain/platform`; nothing the api
  server or the worker runs reaches either. A table without `organization_id` has no row-level security, is hidden
  from `OrgTx`, and is reached only through its own entry point (dependency-cruiser and the ESLint raw-SQL guard hold
  the line).
- The migration only adds, so it is applied by hand before the release deploys.
- Super admins change prompts; support sees nothing of them (the console's prompt pages are super-admin only today,
  and stay so). Every publish and rollback goes to the platform log (`recordPlatformAudit`).
- A published version's text never changes and is never deleted: a trace that names it can always be read against it.
- Console screens: registry components only, owner's UI rules 1–7, every word in a message file, times in
  `PLATFORM_TIME_ZONE`, title `"<screen>"`.

## Review Focus

1. **Two super admins editing at once**: the second save must not silently overwrite the first's draft. Test in Task 2.
2. **A placeholder typed wrong** (`{agency}` or `{ agent_name }`): it would reach customers as literal braces; saving
   must refuse it, naming it. Test in Task 2.
3. **A prompt pasted with a payment detail or an amount** ("UPI: x@y", "₹7,999"): the guards still refuse it in the
   reply, but a prompt that tells the model to type them causes retries on every turn; the editor must warn before
   publishing. Test in Task 5.
4. **The database read failing in a turn** (the prompt row unreadable): the turn must use the built-in prompt and say
   so in its trace, never fail the customer's reply. Test in Task 3.
5. **Rolling back while turns run**: a turn that started on v4 finishes on v4 and records v4; the next turn uses the
   version rolled back to. Test in Task 3.

## Rulings

Owner, 2026-11-15: "A super admin edits the agent's system prompt in the console and saves a draft. Try it can run the
draft. Publishing makes it live, and every turn records the prompt version it used. One click rolls back to an earlier
version. The guards stay in code, so no prompt edit can switch them off. The prompt text is platform data with no
organization: the table has no organization_id and is reached only from the platform module, following the repo's
platform rules." Each ruling is `what — why — cost if wrong`.

1. **The one read outside the platform module.** `natural/prompt-source.ts` reads the live pointer and its version
   (and, for Try it, the current draft) read-only, inside `db.withoutOrg`, through `@travel-crm/db/agent-prompts`; the
   runtime role holds `SELECT` only. Every write, list and history read is the platform module's. — The worker and the
   api must use the published prompt and may not import the platform module; the same pattern serves the sheets key
   check and the webhooks. — None found; a cache would be the alternative, at the cost of a stale rollback.
2. **Versions and the live pointer.** `agent_prompt_version` rows are drafts (number null, editable) or published
   (numbered `v1`, `v2`…, frozen by trigger, never deleted); one draft at a time. `agent_prompt_live` holds one row per
   agent pointing at the published version in use, or null for the built-in prompt in code (`built-in-1`). Publishing
   numbers the draft and points at it; rolling back points at an earlier published version or the built-in. — A
   pointer makes "one click" a one-row change and keeps every version's number stable. — None.
3. **Labels in traces:** `v<number>` for a published version, `built-in-1` for the code's, `draft-<first 8 of id>` for
   a draft run in Try it.
4. **Saving is guarded by the draft's `updatedAt`** that the editor loaded; a mismatch refuses with
   `PROMPT_DRAFT_CHANGED`, and the screen reloads the newer draft. Saves are not in the platform log (the draft row
   keeps who and when); publish and rollback are.
5. **Placeholders:** only `{agent_name}`, `{agency_name}` and `{tone}`; any other `{word}` refuses the save with
   `PROMPT_PLACEHOLDER_UNKNOWN`. The list moves from Plan 1's `prompt.ts` to contracts, where the console and the domain
   both read it. Text is 1 to 40,000 characters.
6. **Try it runs the draft only for platform staff impersonating a member** (`ctx.member.impersonatedBy` set; the api
   refuses others with `PROMPT_DRAFT_STAFF_ONLY`; the choice shows only when `me.get` says impersonating). — The
   console has no agency data of its own, and Try it lives on the agency's side; a super admin reaches it by
   impersonating from the organization's page. Support impersonating may run a draft too; its text stays super-admin
   only. — If the owner wants drafts tried without impersonating, a console chat built on Plan 1's dry turn is the
   next step.
7. **"One click" rollback** is the history row's button followed by a confirmation (owner's UI rule 7): the change
   reaches every natural agency at once, as the pause's does. — A second click.
8. **A failed prompt read falls back to the built-in prompt**, with the trace's version `built-in-1 (fallback)` and a
   warning log line (codes only). — The customer's answer matters more than the newest wording. — A turn on older
   wording.
9. **Publishing warns, never refuses, on amounts and payment details in the text** (`amountsAndDatesIn`,
   `paymentDetailsIn`): the guards stay the safety; the warning names what it found. — The owner may write an example
   with an amount on purpose (Appendix A does). — None.
10. **The prompt library page** becomes the editor's page: `/console/ai-prompts` shows the new agent's prompt editor
    and history first, then lite's library as it is today (spec 8's "the new prompt goes into the console's prompt
    library").

## File ownership (Plans 2 and 3 run in parallel)

Plan 3 owns: `packages/db/prisma/schema/agent-prompts.prisma`, migration `20261215200000_agent_prompts`,
`packages/db/src/agent-prompts.ts`, `packages/db/src/for-org.ts`, `packages/db/package.json`, `packages/db/README.md`,
`packages/db/test/{agent-prompt-tables,unscoped-tables}.test.ts`, `.dependency-cruiser.cjs`,
`packages/eslint-config/index.js`, `packages/domain/eslint.config.js`,
`packages/contracts/src/ai/{natural-prompt,natural-try-it}.ts`, `packages/contracts/src/platform/agent-prompts.ts`,
`packages/domain/src/ai/natural/{prompt,prompt-source}.ts`, `packages/domain/src/platform/agent-prompts.ts`,
`packages/api/src/platform/routers/agent-prompts.ts`, `packages/api/src/platform/platform-router.ts`, `packages/api/src/routers/ai.ts` (the
`testNatural` procedure only), `apps/web/src/ai/{test-choices,test-section}.tsx`,
`apps/web/src/console/ai/{prompt-library-screen,prompt-editor,prompt-history,use-agent-prompt}.tsx|ts`,
`apps/web/src/i18n/messages/en-IN/console-ai-prompt.json`, `apps/web/src/i18n/messages.ts`, `CLAUDE.md`.
Shared with Plan 2, append-only: `packages/contracts/src/platform/index.ts`, `packages/domain/src/platform/index.ts`,
`apps/web/src/console/log/log-actions.ts` and `apps/web/src/i18n/messages/en-IN/console-platform.json` (the second
plan to merge resolves the one-line conflicts), `apps/web/src/i18n/messages/en-IN/{errors,ai}.json`.
Needs from others: the deploy checklist (Plan 2's file) gets the line "Apply `20261215200000_agent_prompts` by hand
before the release deploys"; the lead adds it at merge.

---

### Task 1: The prompt tables and their one entry point

**Files:**
- Create: `packages/db/prisma/schema/agent-prompts.prisma`,
  `packages/db/prisma/migrations/20261215200000_agent_prompts/migration.sql`, `packages/db/src/agent-prompts.ts`
- Modify: `packages/db/src/for-org.ts` (`UnscopedModel` and `unscopedModels` gain `agentPromptVersion`,
  `agentPromptLive`), `packages/db/package.json` (`"./agent-prompts"`), `packages/db/README.md` (the entry points
  table), `.dependency-cruiser.cjs` (the entry list and a rule), `packages/eslint-config/index.js` (an `agentPrompts`
  selector), `packages/domain/eslint.config.js` (allowed in the two files), `CLAUDE.md` (data rules: the two tables)
- Test: `packages/db/test/agent-prompt-tables.test.ts`, `packages/db/test/unscoped-tables.test.ts`

**Interfaces:**
- Produces:

```ts
// @travel-crm/db/agent-prompts, as `emailLogs(tx)` is written: in a db.withoutOrg() or a platform transaction,
// any other throws UnscopedModelError
export function agentPromptVersions(tx: OrgTx) { return unscopedModel(tx, "agentPromptVersion"); }
export function agentPromptLive(tx: OrgTx) { return unscopedModel(tx, "agentPromptLive"); }
```

```prisma
model AgentPromptVersion {           // @@map("agent_prompt_version")
  id          String    @id @default(uuid(7)) @db.Uuid
  agent       String    // natural (CHECK agent_prompt_version_agent_value)
  number      Int?      // null while a draft; @@unique([agent, number])
  text        String    // 1–40,000 characters (CHECK agent_prompt_version_text_length)
  note        String    @default("")   // ≤ 200 characters
  basedOn     String?   @map("based_on") @db.Uuid   // the version it started from; null for the built-in
  createdBy   String    @map("created_by") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedBy   String    @map("updated_by") @db.Uuid
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  publishedBy String?   @map("published_by") @db.Uuid
  publishedAt DateTime? @map("published_at") @db.Timestamptz(6)
}
model AgentPromptLive {              // @@map("agent_prompt_live")
  agent     String  @id               // natural (CHECK)
  versionId String? @map("version_id") @db.Uuid   // a published version, or null for the built-in prompt
  setBy     String  @map("set_by") @db.Uuid
  setAt     DateTime @map("set_at") @db.Timestamptz(6)
}
```

The SQL also adds: `CHECK ((number IS NULL) = (published_at IS NULL) AND (published_at IS NULL) = (published_by IS
NULL))`; a unique index on `agent` where `number IS NULL` (one draft); a foreign key from `agent_prompt_live.version_id`
to a version; a trigger `agent_prompt_version_frozen` that raises on any `UPDATE` of a published row and on any
`DELETE` of one; a trigger on `agent_prompt_live` that refuses pointing at a draft. Grants: `app_runtime` `SELECT` on
both; `app_platform` `SELECT, INSERT, UPDATE` on both and `DELETE` on `agent_prompt_version` (drafts only, by trigger).
The header comment says the tables have no `organization_id`, why, and that the migration is applied by hand.

- [ ] **Step 1: Write the failing tests** (`agent-prompt-tables.test.ts`, as `sheets-key-check-table.test.ts` does):

```ts
it("lets the runtime role read and nothing more", async () => {
  expect(await privilege("app_runtime", "agent_prompt_version", "SELECT")).toBe(true);
  for (const write of ["INSERT", "UPDATE", "DELETE"]) expect(await privilege("app_runtime", "agent_prompt_version", write)).toBe(false);
  expect(await privilege("app_runtime", "agent_prompt_live", "UPDATE")).toBe(false);
});
it("keeps one draft per agent", …);              // a second numberless row → agent_prompt_version_one_draft
it("freezes a published version: no edit, no delete", …);  // raises agent_prompt_version_frozen
it("refuses a live pointer at a draft", …);
it("refuses text over 40,000 characters and an agent other than natural", …);
```

`unscoped-tables.test.ts`: `it("hides the prompt tables from OrgTx and refuses them at run time")` with
`// @ts-expect-error` lines as the other tables have, and `it("reaches them through their entry point in withoutOrg
and a platform transaction")`.

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/agent-prompt-tables.test.ts test/unscoped-tables.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement**; `pnpm --filter @travel-crm/db generate`. The dependency-cruiser rule
  `agent-prompts-only-in-platform-and-prompt-source` allows `^packages/domain/(src|test)/platform/agent-prompts` and
  `^packages/domain/(src|test)/ai/natural/prompt-source` (and `packages/db`) to import `packages/db/src/agent-prompts.ts`.
- [ ] **Step 4: Run** the same, `pnpm migrations:check` and `pnpm depcruise`; expect PASS.
- [ ] **Step 5: Commit** `feat(db): prompt versions for the agent, platform data without an organization`.

### Task 2: Drafts, publishing and rollback in the platform module

**Files:**
- Create: `packages/contracts/src/ai/natural-prompt.ts`, `packages/contracts/src/platform/agent-prompts.ts`,
  `packages/domain/src/platform/agent-prompts.ts`, `packages/api/src/platform/routers/agent-prompts.ts`
- Modify: `packages/domain/src/ai/natural/prompt.ts` (reads the placeholders from contracts),
  `packages/api/src/platform/platform-router.ts`, `packages/contracts/src/platform/index.ts`, `packages/domain/src/platform/index.ts`,
  `apps/web/src/console/log/log-actions.ts`, `apps/web/src/i18n/messages/en-IN/{console-platform,errors}.json`
- Test: `packages/contracts/test/ai/natural-prompt.test.ts`, `packages/domain/test/platform/agent-prompts.test.ts`,
  `packages/api/test/console-agent-prompts.test.ts`

**Interfaces:**
- Produces:

```ts
// contracts/src/ai/natural-prompt.ts
export const naturalPromptPlaceholders = ["agent_name", "agency_name", "tone"] as const;
export const NATURAL_PROMPT_MAX = 40_000;
export function unknownPlaceholdersIn(text: string): string[];  // every {…} not in the list, as written: ["{agency}", "{ agent_name }"]
export function promptWarnings(text: string): { amounts: string[]; paymentDetails: string[] }; // ruling 9
// contracts/src/platform/agent-prompts.ts
export const agentPromptVersionView = z.object({ id: recordId.nullable(), label: z.string(), note: z.string(),
  publishedAt: z.iso.datetime().nullable(), publishedBy: z.string().nullable(), live: z.boolean() });
export const agentPromptOverview = z.object({
  live: z.object({ id: recordId.nullable(), label: z.string(), text: z.string() }),
  draft: z.object({ id: recordId, text: z.string(), note: z.string(), basedOn: z.string(), updatedAt: z.iso.datetime(),
    updatedBy: z.string() }).nullable(),
  history: z.array(agentPromptVersionView) });           // newest first, the built-in last
export const saveAgentPromptDraftInput = z.strictObject({ text: z.string().min(1).max(NATURAL_PROMPT_MAX),
  note: z.string().trim().max(200), basedOn: recordId.nullable(), draftUpdatedAt: z.iso.datetime().nullable() });
export const discardAgentPromptDraftInput = z.strictObject({ draftId: recordId, draftUpdatedAt: z.iso.datetime() });
export const publishAgentPromptInput = discardAgentPromptDraftInput;
export const useAgentPromptVersionInput = z.strictObject({ versionId: recordId.nullable() }); // null: the built-in
export const agentPromptVersionText = z.object({ label: z.string(), text: z.string() });
// domain/platform/agent-prompts.ts
export async function agentPromptOverview(services: PlatformServices): Promise<AgentPromptOverview>;
export async function agentPromptVersionText(services: PlatformServices, versionId: string | null): Promise<AgentPromptVersionText>;
export async function saveAgentPromptDraft(services: PlatformServices, staff: PlatformActor, input: SaveAgentPromptDraftInput): Promise<AgentPromptOverview>;
export async function discardAgentPromptDraft(services: PlatformServices, staff: PlatformActor, input: DiscardAgentPromptDraftInput): Promise<AgentPromptOverview>;
export async function publishAgentPromptDraft(services: PlatformServices, staff: PlatformActor, input: PublishAgentPromptInput): Promise<AgentPromptOverview>;
export async function useAgentPromptVersion(services: PlatformServices, staff: PlatformActor, input: UseAgentPromptVersionInput): Promise<AgentPromptOverview>;
// router agentPrompts: overview, versionText (queries) and saveDraft, discardDraft, publish, useVersion (mutations),
// every one a superAdminProcedure
```

Platform log: `ai-prompt.published` (`after: { version: "v5" }`, `before: { version: <the live label> }`) and
`ai-prompt.rolled-back` (`before`/`after` labels), target type `ai-prompt`, target id `natural`. Publishing and rollback
take the live row `FOR UPDATE` first. Refusal reasons, each with a sentence in `errors.json`:
`PROMPT_PLACEHOLDER_UNKNOWN`, `PROMPT_DRAFT_CHANGED`, `PROMPT_VERSION_NOT_FOUND`, `PROMPT_DRAFT_STAFF_ONLY` (Task 4),
`PROMPT_DRAFT_NOT_FOUND` (Task 4).

- [ ] **Step 1: Write the failing tests:**

```ts
it("starts with the built-in prompt live and no draft", async () => {
  expect(await agentPromptOverview(services)).toMatchObject({ live: { id: null, label: "built-in-1" }, draft: null,
    history: [{ id: null, label: "built-in-1", live: true }] });
});
it("saves a draft based on the live version, and saves over it", …);
it("refuses a save that started from an older draft", async () => {                // Review Focus 1
  await expect(saveAgentPromptDraft(services, admin, { ...input, draftUpdatedAt: stale }))
    .rejects.toMatchObject({ reason: "PROMPT_DRAFT_CHANGED" });
});
it("refuses unknown placeholders, naming them", async () =>                          // Review Focus 2
  expect(unknownPlaceholdersIn("Hi {agency} and { agent_name }, {tone}")).toEqual(["{agency}", "{ agent_name }"]));
it("publishes the draft as the next number, makes it live and logs it", async () => {
  expect(await publishAgentPromptDraft(services, admin, draftRef)).toMatchObject({ live: { label: "v1" }, draft: null });
  expect(await platformLog()).toContainEqual(expect.objectContaining({ action: "ai-prompt.published", after: { version: "v1" } }));
});
it("rolls back to an earlier version or the built-in, and logs it", …);
it("never changes a published version's text", …);
it("refuses a version that isn't published", …);
it("lets only super admins in", …);                                                  // router: support FORBIDDEN
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/contracts test -- test/ai/natural-prompt.test.ts`,
  `pnpm --filter @travel-crm/domain test -- test/platform/agent-prompts.test.ts` and
  `pnpm --filter @travel-crm/api test -- test/console-agent-prompts.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** Names in `publishedBy`/`updatedBy` come from identity's staff names, read after the
  transaction.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/web test -- test/console/log`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): super admins draft, publish and roll back the agent's prompt`.

### Task 3: Every turn uses the live version and names it

**Files:**
- Modify: `packages/domain/src/ai/natural/prompt-source.ts` (the bodies, and `draftNaturalPrompt`'s id becomes
  optional), `packages/domain/src/ai/natural/index.ts` (nothing new to export)
- Test: `packages/domain/test/ai/natural/prompt-source.test.ts` (database), `packages/domain/test/ai/natural/prompt.test.ts`

**Interfaces:**
- Consumes: `agentPromptVersions`, `agentPromptLive` (Task 1), `BUILT_IN_NATURAL_PROMPT`.
- Produces (the signatures Plan 1 set, with the draft's id optional):

```ts
export async function naturalPromptOf(db: Database): Promise<NaturalPrompt>;
// the live pointer's published version as { version: "v<number>", text }; no row or null: the built-in;
// a failed read: { ...BUILT_IN_NATURAL_PROMPT, version: "built-in-1 (fallback)" } and a warning log line (ruling 8)
export async function draftNaturalPrompt(db: Database, versionId?: string): Promise<NaturalPrompt | null>;
// the current draft (that one, when an id is given) as { version: "draft-<first 8 of id>", text }; else null
```

- [ ] **Step 1: Write the failing tests:** `it("uses the built-in prompt until one is published")`,
  `it("uses the published version and names it v<n>")`, `it("uses the version rolled back to on the next read")`
  (Review Focus 5: a turn holding the first read keeps it; the next `naturalPromptOf` returns the other),
  `it("falls back to the built-in prompt, naming the fallback, when the read fails")` (Review Focus 4: a `db` whose
  `withoutOrg` throws), `it("reads the current draft for Try it, and null when there is none")`,
  `it("reads nothing but the published and draft rows")` (a published-then-replaced draft is not returned).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/prompt-source.test.ts`; expect FAIL.
- [ ] **Step 3: Implement**, reading inside `db.withoutOrg` only.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent answers with the published prompt`.

### Task 4: Try it runs the draft

**Files:**
- Modify: `packages/contracts/src/ai/natural-try-it.ts` (`prompt`), `packages/api/src/routers/ai.ts` (`testNatural`),
  `apps/web/src/ai/test-choices.tsx`, `apps/web/src/ai/test-section.tsx`, `apps/web/src/i18n/messages/en-IN/ai.json`
- Test: `packages/api/test/ai-try-it-natural-router.test.ts`, `apps/web/test/ai/test-section-natural.test.tsx`

**Interfaces:**
- Produces: `naturalTestInput` gains `prompt: z.enum(["published", "draft"]).default("published")`; `TestChoice`
  gains `prompt: "published" | "draft"`, shown only for the new agent while `me.get` reports `impersonatedBy`.
  `testNatural` with `prompt: "draft"`: `PROMPT_DRAFT_STAFF_ONLY` (FORBIDDEN) unless `ctx.member.impersonatedBy` is
  set; `PROMPT_DRAFT_NOT_FOUND` (CONFLICT) when there is no draft; else the dry run uses `draftNaturalPrompt(ctx.db)`.

- [ ] **Step 1: Write the failing tests:** `it("runs the draft for platform staff impersonating a member, and names it
  in the trace")` (`trace.promptVersion` starts `draft-`), `it("refuses the draft to the agency's own people")`,
  `it("says there is no draft to try")`, and in the web test `it("offers the draft only while impersonating")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/api test -- test/ai-try-it-natural-router.test.ts` and
  `pnpm --filter @travel-crm/web test -- test/ai/test-section-natural.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): Try it can run the prompt's draft for platform staff`.

### Task 5: The editor and its history in the console

**Files:**
- Create: `apps/web/src/console/ai/prompt-editor.tsx`, `apps/web/src/console/ai/prompt-history.tsx`,
  `apps/web/src/console/ai/use-agent-prompt.ts`, `apps/web/src/i18n/messages/en-IN/console-ai-prompt.json`
- Modify: `apps/web/src/console/ai/prompt-library-screen.tsx` (the editor and history first, lite's library after),
  `apps/web/src/i18n/messages.ts`
- Test: `apps/web/test/console/ai/prompt-editor.test.tsx`, `apps/web/test/console/ai/prompt-library-screen.test.tsx`

**Interfaces:**
- Consumes: the `agentPrompts` router (Task 2), `unknownPlaceholdersIn`, `promptWarnings`, `NATURAL_PROMPT_MAX`.
- Produces: `PromptEditor({ overview })`, `PromptHistory({ overview })`, `useAgentPrompt()` (the overview query and the
  five mutations, each invalidating the overview).

The editor (a Card): the live version's label with when and by whom it was published; the registry `Textarea` holding
the draft's text, or the live text when there is no draft; under it the count "12,345 of 40,000", the placeholders
the text may use, an `InfoHint` "Why can't the prompt switch off a check?" (the guards stay in code), and any unknown
placeholder named in the field's error before saving; a note field (200 characters); the buttons "Save draft",
"Discard draft" (`ConfirmDialog`) and "Publish" (`ConfirmDialog` naming the version it becomes, `v<n>`, and listing
`promptWarnings`' findings when there are any: ruling 9); and a line saying how to try the draft (impersonate a member
of an agency from its page, then Settings → AI → Try it, "New agent", "Draft"). A `PROMPT_DRAFT_CHANGED` refusal shows
its sentence and reloads the newer draft. The history (registry `Table`, TanStack not needed): label, note, published
(`formatDayTime` in `PLATFORM_TIME_ZONE`) and by whom, a "Live" `StatusBadge`, "View" (a `ResponsiveDialog` with the
text, read through `versionText`) and "Use this version" (`ConfirmDialog`, ruling 7) on every row but the live one.

- [ ] **Step 1: Write the failing tests:**

```ts
it("starts a draft from the live text and saves it with a note", …);
it("names an unknown placeholder and keeps Save from sending it", …);
it("warns of an amount or a payment detail before publishing, and still publishes", …);   // Review Focus 3
it("publishes after confirming, naming the next version", …);
it("rolls back from the history after confirming", …);
it("shows the newer draft when someone saved since", …);
it("holds each dialog while its request is pending", …);
it("still shows lite's prompt library below", …);
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/console/ai/prompt-editor.test.tsx test/console/ai/prompt-library-screen.test.tsx`;
  expect FAIL.
- [ ] **Step 3: Implement** with registry pieces only (`Card`, `Textarea` through `FormField`, `Table`,
  `ConfirmDialog`, `ResponsiveDialog`, `StatusBadge`, `InfoHint`, `RefusalAlert`, `LoadingRows`, `ErrorState`); no
  border classes; `useCheckedForm` with `saveAgentPromptDraftInput`.
- [ ] **Step 4: Run** the same, then `pnpm --filter @travel-crm/web test`; expect PASS.
- [ ] **Step 5: Look at it** on a phone width and a desktop width in the console (`pnpm dev`, sign in as the local
  super admin): a 40,000-character text scrolls inside the field, the buttons stay reachable, the history fits.
- [ ] **Step 6: Commit** `feat(web): the console's prompt editor, with history and rollback`.

### Release

- [ ] `pnpm check` green, in the foreground, Docker up only for it.
- [ ] The lead adds the deploy checklist's line (File ownership, "Needs from others"); the migration is applied by
  hand on production before the release deploys.
- [ ] After the deploy: open `/console/ai-prompts`, save a one-word draft change, try it in Try it while impersonating
  a member of the demo agency, publish it, see the next trace name `v1`, roll back to `built-in-1`, see the next trace
  name it.
