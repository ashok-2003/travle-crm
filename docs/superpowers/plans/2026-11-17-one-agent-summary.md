# One WhatsApp agent, the chat summary: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate component keeps a running summary of each chat and the last message it covered; when more than 30
messages follow that point, the one agent's prepare step writes it afresh; the agent then reads the summary and only
the messages after the point, with no raw tail.

**Architecture:** `packages/domain/src/ai/chat-summary/` owns the summary: its prompt (Langfuse
`whatsapp-agent/chat-summary`, else Appendix A's text), the lines after the point, one counted model call, and the
write that moves the point forward only. The one turn and its follow-up call it after prepare and before the model, and
hand `buildOneContext` the summary and the lines after the point; the core's history already puts a summary first.

**Tech Stack:** as the core plan's.

**Spec:** `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md` sections 5.2 and 9, and Appendix A (the
prompt's starting text); the prompt file's "The Chat Summary and Earlier Messages". Builds on
`docs/superpowers/plans/2026-11-17-one-agent-core.md` and follows the media and buttons plans on the files they share.

## Global Constraints

- Everything in the core plan's Global Constraints, and `builder-rules.md` (per-package checks, never `pnpm check`).
- **Shared files merge in plan order: brochures, media, buttons, summary.**
- Migration `20261218600000_chat_summary` (after buttons' `20261218500000`). It only adds columns.
- **The trigger:** more than 30 messages after the point (`> 30`), counting every message the customer could see
  (reactions and superseded sends left out), both directions. The refresh reads the previous summary and every message
  after the point up to the newest, at most the newest 400 of them, and moves the point to the newest it read.
- The summary call: feature `sales_agent`, `maxTokens` 1,500, reasoning effort `minimal`, `timeoutMs` 60,000, `user`
  the organization's id, through natural's `countedModel` (the month's limit). Its text is kept to 4,000 characters.
- Nothing is hidden from the summary: the earlier system's lines go in whole, under their own name.
- **No raw tail (owner, O2):** the agent reads the summary, then only the messages after the point; the turn's new
  messages are always in its turn block, even when the summary covered them.
- The summary prompt's placeholder is `{{agency_name}}`, filled as the agent's are.

## Review Focus

1. **The summary's model is down or the month is full.** Expected: the turn goes on with the summary it had and the
   lines prepare read; the point doesn't move; the next turn tries again; a trace flag says so. Test in Task 3.
2. **Two turns refresh one chat at once** (a reply and a follow-up). Expected: the point only moves forward; the later
   point wins; neither turn fails. Test in Task 2.
3. **A first refresh on a chat hundreds of messages long.** Expected: at most the newest 400 after the point are read,
   the text is kept to 4,000 characters, the turn goes on. Test in Task 2.
4. **The new messages the summary just covered.** Expected: still shown to the agent as the messages it answers.
   Test in Task 3.
5. **A lite chat** (a lite summary, no point). Expected: the lite text is the previous summary on the first refresh.
   Test in Task 2.

## Rulings

- **SM1. New columns, lite's left alone:** `ai_chat.chat_summary` (text, default '', at most 4,000), `chat_summary_
  through_id` (uuid), `chat_summary_through_at` (timestamptz), `chat_summary_at` (timestamptz). Lite's `summary` (at
  most 1,000 characters, its figures stripped) still serves lite until the deletion PR drops it. — The lite column's
  check and stripping don't fit spec 9's notes. — One more column until the deletion PR.
- **SM2. A failed refresh never blocks a turn** (Review Focus 1): the old summary and prepare's lines after the old
  point (or all prepare read, when the point is older than them). — Spec 9 says nothing; silence is the costlier
  mistake (anti-goal 1). — A turn that reads a little more than 30 lines.
- **SM3. The model's input**, one user message after the rendered prompt as the system message:

  ```text
  Previous notes:
  <the summary, or the lite summary, or "none">

  Messages since, oldest first:
  Customer, Sat 14 Nov 3:04 pm: <words>
  Team (Amit), …: <words>
  AI, …: <words>
  Earlier system, …: <words>

  The lead card now:
  <natural's lead block>
  ```

  A media line is its kind and caption with any words the AI heard or saw (`[voice note] heard: "…"`).
- **SM4. Try it never summarises** (its chats are 40 lines at most, and never stored). The follow-up turn does.
- **SM5. The write moves forward only:** `updateMany` where the chat's `chat_summary_through_at` is null or earlier
  than the new point, creating the `ai_chat` row when a chat has none.

## Files and waits

| Task | Owns | Waits on |
| ---- | ---- | -------- |
| 1    | migration; `packages/db/prisma/schema/ai.prisma` (`AiChat`, after `summary`) | core T4 (`ai.prisma`) |
| 2    | `packages/domain/src/ai/chat-summary/{prompt-text,prompt,lines,refresh,index}.ts`; `natural/context/turn-block.ts` (exports `leadBlock`) | Task 1; core T7 (`langfusePromptAt`); media T4 (`storedLineOf`, saved words on lines) |
| 3    | `packages/domain/src/ai/one/memory.ts`; `one/turn.ts` (the memory step and the context's lines and summary); `one/nudge.ts` | Task 2; core T11; media T5 and buttons T4 (`one/turn.ts`) |

---

### Task 1: Where the summary and its point are kept

**Files:**
- Create: `packages/db/prisma/migrations/20261218600000_chat_summary/migration.sql`
- Modify: `packages/db/prisma/schema/ai.prisma` (`AiChat`: `chatSummary`, `chatSummaryThroughId`,
  `chatSummaryThroughAt`, `chatSummaryAt`, each with a `///` comment)
- Test: `packages/db/test/chat-summary-columns.test.ts`

The migration adds the four columns and `CONSTRAINT ai_chat_chat_summary_length CHECK (char_length(chat_summary) <=
4000)`; a header comment says it only adds. An erasure deletes `ai_chat` rows already (`withdrawAiParts`), so the
summary goes with them.

- [ ] **Step 1: Write the failing test:** `it("keeps a summary of up to 4,000 characters and its point, and refuses a
  longer one")` (rows as the migrator, as `natural-agent-columns.test.ts` writes them).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/chat-summary-columns.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** (the migration by hand, the schema to match, `pnpm --filter @travel-crm/db generate`).
- [ ] **Step 4: Run** the same and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(db): a chat's summary and the last message it covered`.

### Task 2: The summary component

**Files:**
- Create: `packages/domain/src/ai/chat-summary/prompt-text.ts` (Appendix A's text, verbatim), `prompt.ts`, `lines.ts`,
  `refresh.ts`, `index.ts`
- Modify: `packages/domain/src/ai/natural/context/turn-block.ts` (export `leadBlock`)
- Test: `packages/domain/test/ai/chat-summary/{prompt,refresh}.test.ts` (real database, memory model and prompts)

**Interfaces:**
- Consumes: Task 1; core T7's `langfusePromptAt`; media T4's `storedLineOf` and `storedLineFields`; natural's
  `countedModel`, `leadBlock`, `NaturalLeadView`.
- Produces:

```ts
// prompt.ts
export const SUMMARY_PROMPT_NAME = "whatsapp-agent/chat-summary";
export const BUILT_IN_SUMMARY_PROMPT: NaturalPrompt;                 // { version: "built-in-summary-1", text: Appendix A }
export async function summaryPromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt>;   // production, else built-in
// lines.ts
export const SUMMARY_AFTER = 30; export const SUMMARY_MOST_LINES = 400;
export async function linesAfter(tx: OrgTx, conversationId: string, after: Date | null,
  most?: number): Promise<NaturalChatLine[]>;                         // oldest first, the newest `most`, earlier lines whole
export async function countAfter(tx: OrgTx, conversationId: string, after: Date | null): Promise<number>;
// refresh.ts
export interface ChatSummary { text: string; throughId: string | null; throughAt: Date | null }
export type SummaryStep =
  | { kind: "kept"; summary: ChatSummary }                            // 30 or fewer after the point
  | { kind: "refreshed"; summary: ChatSummary }
  | { kind: "failed"; summary: ChatSummary; reason: string };        // the old one, the point unmoved
export async function refreshChatSummary(deps: { db: Database; call: LoopIO["call"]; prompts?: AiPrompts },
  input: { organizationId: string; conversationId: string; agencyName: string; lead: NaturalLeadView;
    clock: { today: CalendarDate; timeZone: string }; now: Date }): Promise<SummaryStep>;
```

The previous summary is `chat_summary`, or, with no point yet, lite's `summary` (spec 9's last line), or none. The model
answer is trimmed and cut at 4,000 characters; an empty answer is a failure. The write is ruling SM5's.

- [ ] **Step 1: Write the failing tests:** prompt `it("holds Appendix A's text exactly and fills the agency's name")`
  (reads the spec file's block), `it("reads Langfuse's production prompt, else the built-in text")`; refresh
  `it("keeps the summary when 30 or fewer messages follow the point")`, `it("writes it afresh past 30 and moves the
  point to the newest message")`, `it("starts from the lite summary when there is no point")` (Review Focus 5),
  `it("gives the model every line whole, the earlier system's figures and dates included, with the lead card")`,
  `it("reads at most the newest 400 and keeps 4,000 characters")` (Review Focus 3), `it("never moves the point back
  when two refreshes race")` (Review Focus 2), `it("keeps the old summary and point when the model fails or the month
  is full")`, `it("counts the call against the month")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/chat-summary`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a chat summary written afresh past 30 new messages`.

### Task 3: The one agent reads the summary and only what follows it

**Files:**
- Create: `packages/domain/src/ai/one/memory.ts`
- Modify: `packages/domain/src/ai/one/turn.ts`, `one/nudge.ts` (each: the memory step after the gates, then
  `buildOneContext({ …, lines: memory.lines, summary: memory.summary })`)
- Test: `packages/domain/test/ai/one/memory.test.ts`, `packages/domain/test/ai/one/turn.test.ts`,
  `packages/domain/test/ai/one/nudge.test.ts`

**Interfaces:**
- Consumes: Task 2's `refreshChatSummary`; core T8's `OneContextInput.summary`; core T11's turns.
- Produces:

```ts
/** What the agent reads of the chat: the summary, and the lines after its point with the new lines always kept. */
export async function chatMemoryOf(deps: OneTurnDependencies, prepared: NaturalPrepared, input: LiteTurnInput,
  now: Date, trace: NaturalTraceBuilder): Promise<{ summary: string | null; lines: NaturalChatLine[] }>;
// lines: prepared.lines after the point, plus newLinesOf(prepared.lines, lastTurnAt) when the summary covered them;
// all prepared.lines when the point is older than they are; flags "summary:refreshed" or "summary:failed:<reason>".
```

The lead block's lite summary is left out once a chat summary exists (`lead.summary: null` in the context's input), so
the agent never reads two summaries.

- [ ] **Step 1: Write the failing tests:** memory `it("gives the summary and only the lines after its point")`,
  `it("keeps the new messages after a refresh that covered them")` (Review Focus 4), `it("reads what prepare read when
  the refresh failed")` (Review Focus 1), `it("reads the whole read chat when there is no summary yet")`; turn
  `it("summarises a 31-message chat before the model, which reads no line before the point")`; nudge `it("follows up
  on the summary and the lines after it")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/memory.test.ts test/ai/one/turn.test.ts
  test/ai/one/nudge.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one test/ai/chat-summary`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent reads the chat summary and the messages after it`.
