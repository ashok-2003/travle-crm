# The console's AI prompts and turn traces (plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super admins see, in the platform console, the lite agent's prompt library (every fixed piece with its
version and text, and what each of the two model calls is given) and every lite turn of the last 14 days, per agency
and per chat, each opening to its whole trace with the chat's messages as they are kept now. Every opening of a turn is
written in the platform log.

**Architecture:** Read only. The ai module gains the reads of `ai_turn_trace` (kept rows only: `expires_at` after now
and the chat not erased), of a chat's messages by id, and one ordered list of each call's block heads that its request
builders and the library share. The platform module wraps them for the console (`asOrganization` inside a platform
transaction), prices tokens with `services.aiPrices`, records the opening, then reads the gzip file with
`readTraceFile`. A super-admin router `aiTransparency` serves three queries; the web adds a `consoleAi` namespace, an
"AI prompts" page, an organization's "AI turns" list and one turn's page.

**Tech Stack:** domain TypeScript, Prisma 7.10.0 (reads only), the `ObjectStorage` port, tRPC (console router), Zod 4
contracts, Next.js + next-intl + shadcn registry components (Table, Item, Card, Tabs, Alert, Badge, Button), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-lite-whatsapp-agent-design.md` ("Transparency for super admins" V1-V3,
"Prompt format", "Screens", "Build order" item 4). Builds on plans 3a (`2026-11-12-lite-agent-turn.md`) and 3b
(`2026-11-12-lite-agent-around.md`, Tasks 2-3 on branch `feat/lite-traces`), whose names (`LiteTrace`, `PromptPiece`,
`PromptPieceName`, `promptLibrary`, `promptVersions`, `ContextMessage`, `TRACE_DAYS`, `traceKey`, `readTraceFile`,
`TraceFile`, `createTraceSink`, `startTrace`, `withdrawAiParts`, `sweepAiTraces`) this plan uses as they define them.

## Global Constraints

- Every implementer follows `.superpowers/sdd/2026-11-12-agent-setup-page/implementer-rules.md`, reading
  `.superpowers/sdd/plan3-code-map.md` (sections 10, 12, 13) where those rules say plan 2's code map, on a branch that
  holds plans 3a and 3b. Domain tests: `cd packages/domain && pnpm exec vitest run <file>` (`pnpm db:up` first,
  `pnpm db:down` after); console api tests: `cd apps/api && pnpm exec vitest run <file>`.
- Super admins only (V2): every procedure is `superAdminProcedure`; support gets 403 `SUPER_ADMIN_ONLY`. A screen shows
  support `consoleAi.superAdminsOnly` and asks the api nothing (the failed-emails screens are the pattern).
- Read only: no migration, nothing written to `ai_turn_trace` or object storage, no new store of personal data. The one
  write is the platform log's `ai-trace.opened`.
- Kept means `expires_at > now` **and** the chat's `whatsapp_conversation.state` is not `erased`. The list, the
  opening and the message reads all apply it: an erasure sets `expires_at = now`, but the sweep deletes the row and file
  up to an hour later, and the file's lead card, summary and answers still hold the customer's words.
- The file holds message ids (3b). Their texts are read when a turn is opened, inside `asOrganization`, from
  `whatsapp_message`, only from the trace's own chat.
- Platform log: one `ai-trace.opened` per opening (`targetType: "ai_turn_trace"`, `targetId` the trace id,
  `targetOrganizationId`, no before/after), a literal action, written in the platform transaction that found the row,
  before the file is read. A refused opening (support, not found) writes nothing.
- No customer words in logs, error messages or the platform log. New reason `AI_TRACE_NOT_FOUND` gets its sentence in
  `errors.json`; the new log action and target their sentences in `console-platform.json`; run the guards the
  implementer rules name.
- Times through `useInstantText()` (PLATFORM_TIME_ZONE); a piece's day through `formatCalendarDay`; each page's title is
  its screen's message (`generateMetadata`), the layout adds the rest.
- UI: the owner's UI rules in `CLAUDE.md`. Recorded codes (outcome, reason, move, stage, model, piece names, intents,
  action codes, check names) show as recorded in `numbers wrap-anywhere` spans, as failure codes do; every other word is
  a `consoleAi` message. Long text is a `TraceText` (Task 3), never a scrolling box.
- Cost: `tokenCostPaise(services.aiPrices, tokens)` in integer paise for every model (the console has one price pair);
  no prices set → `costPaise: null` and `priced: false`, and the screens say so and show tokens only.

## Review Focus

1. A turn whose file is missing (a lost `put`, or swept between the list and the opening): its page shows the index row
   and "This turn's file is missing or can't be read…" plainly, no error state, and the opening is still logged (Task 2
   "a missing file gives the row and no file"; Task 5 "a missing file is said plainly").
2. Support staff: every `aiTransparency` call is refused 403 `SUPER_ADMIN_ONLY` and logs nothing; the screens never
   ask (Task 2 api test; Tasks 3-5 web tests).
3. An erased customer, before the hourly sweep: their turns are neither listed nor opened, also when only the chat's
   `state` says erased, while another customer's in the same agency still open (Task 2 "an erased customer's turns are
   gone at once").
4. A trace past 14 days whose row the sweep hasn't removed (it runs hourly; a file that won't delete keeps its row): not
   listed, NOT_FOUND to open, nothing logged (Task 2 "a trace past 14 days is neither listed nor opened").
5. A very large trace (4 long lookups, 3 Write tries, a 30,000-character one-line answer): one part shows at a time,
   JSON is indented, long text wraps with no sideways page scroll (Task 5 "a very large trace stays readable").

---

### Task 1: What each model call is given, for the library

**Files:**
- Create: `packages/domain/src/ai/lite/context/block-heads.ts`, `packages/domain/src/ai/lite/prompts/calls.ts`,
  `packages/domain/src/platform/ai-prompts.ts` (export from the platform index),
  `packages/contracts/src/platform/ai-transparency.ts` (export from `packages/contracts/src/platform/index.ts`),
  `packages/api/src/platform/routers/ai-transparency.ts`
- Modify: `packages/domain/src/ai/lite/prompts/understand-prompt.ts`, `.../lite/prompts/write-prompt.ts`,
  `.../lite/context/turn-blocks.ts` (`packageIndexBlock`), `packages/domain/src/ai/index.ts` (exports `promptLibrary`,
  `promptVersions`, `modelCalls`, types `PromptPiece`, `ModelCallOutline`, `BlockHead`),
  `packages/api/src/platform/platform-router.ts` (`aiTransparency: aiTransparencyRouter`)
- Test: `packages/domain/test/ai/lite/model-calls.test.ts`, `apps/api/test/console-ai-transparency.test.ts`

**Interfaces:**
- Consumes: 3a's `promptLibrary()`, `PromptPieceName`, `BUDGETS`, `lookupTools`, `understandRequest`, `writeRequest`.
- Produces (domain):
  ```ts
  // lite/context/block-heads.ts: each call's user-message blocks, in prompt order
  export interface BlockHead { title: string; purpose: string; budget: number }
  export const understandBlockHeads: { agency; packageIndex; places; today; leadCard; summary; timeline; messages } // satisfies Record<string, BlockHead>
  export const writeBlockHeads: { you; move; facts; lookedUp; summary; messages; language; correction }
  // lite/prompts/calls.ts
  export const UNDERSTAND_SYSTEM = ["understand.instructions", "understand.intents", "understand.form"] as const satisfies readonly PromptPieceName[];
  export const WRITE_SYSTEM = ["write.instructions", "write.voice", "write.moves"] as const satisfies readonly PromptPieceName[];
  export const UNDERSTAND_ANSWER = "understand_form"; export const WRITE_ANSWER = "write_move";
  export interface ModelCallOutline { name: "understand" | "write"; system: PromptPieceName[]; blocks: BlockHead[];
    answer: typeof UNDERSTAND_ANSWER | typeof WRITE_ANSWER; lookups: LookupTool[] }
  export function modelCalls(): ModelCallOutline[]; // [understand, write]
  // platform/ai-prompts.ts
  export function getAiPromptLibrary(): AiPromptLibrary; // { pieces: promptLibrary(), calls: modelCalls() }
  ```
- Produces (contracts, `ai-transparency.ts`):
  ```ts
  export const aiPromptPiece = z.object({ name: z.string(), version: z.int().min(1), changedOn: z.iso.date(), text: z.string() });
  export const aiModelCall = z.object({ name: z.enum(["understand", "write"]), system: z.array(z.string()),
    blocks: z.array(z.object({ title: z.string(), purpose: z.string(), budget: z.int() })), answer: z.string(), lookups: z.array(z.string()) });
  export const aiPromptLibrary = z.object({ pieces: z.array(aiPromptPiece), calls: z.array(aiModelCall) });
  ```
- Produces (router): `aiTransparency.prompts: superAdminProcedure.output(aiPromptLibrary).query(() => getAiPromptLibrary())`.

The heads' titles and purposes move verbatim out of `understandRequest`, `writeRequest` and `packageIndexBlock` (budgets
from `BUDGETS`; Write's correction budget, 200, moves with it), and the builders spread the head (`{
...understandBlockHeads.leadCard, lines }`). `understandSystem()` / `writeSystem()` join the pieces `UNDERSTAND_SYSTEM`
/ `WRITE_SYSTEM` name; the requests' schema names use `UNDERSTAND_ANSWER` / `WRITE_ANSWER`. Understand's `lookups` is
`[...lookupTools]`, Write's `[]`. `fixed.texts` is in no call's `system`: code sends those texts itself. The rendered
prompts stay byte for byte as they are.

- [ ] **Step 1: Write the failing tests**
  - "each call lists its request's blocks in order": `understandRequest` with every block filled (the input
    `prompt-surface.test.ts` builds, plus a timeline line and a summary) → `Object.keys(blocks)` equals the outline's
    titles without "Places we run"; with 31 packages → without "Package index"; every rendered block starts
    `` `## ${title}\n${purpose}\n` ``. `writeRequest` with a `correction` and a looked-up line → all eight titles, in order.
  - "every system piece is in the library, and fixed.texts in no call".
  - "Understand offers the five lookups and Write none": `modelCalls()[0].lookups` equals `lookupTools`; `[1]` is `[]`.
  - (api) "support is refused the prompts": `consoleQuery(..., "aiTransparency.prompts", support.jar)` →
    `{ status: 403, reason: "SUPER_ADMIN_ONLY" }`.
  - (api) "a super admin reads every piece and both calls": piece names equal `promptLibrary()`'s; `calls` names
    `["understand", "write"]`; `calls[0].blocks[0]` is `{ title: "Agency", purpose: "Who the customer is writing to.",
    budget: 200 }`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `prompt-surface.test.ts` and `prompt-library.test.ts` unchanged and green, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): outline the lite agent's two model calls for the console's prompt library`

### Task 2: Turn traces for the console: listed, opened, and each opening logged

**Files:**
- Create: `packages/domain/src/ai/traces/trace-reads.ts`, `packages/domain/src/platform/ai-traces.ts`,
  `packages/domain/src/platform/ai-trace-detail.ts`
- Modify: `packages/domain/src/ai/lite/context/messages.ts` (`storedMessageFields`, `contextMessageOf`),
  `packages/domain/src/ai/lite/prepare.ts` (`chatLines` uses both), `packages/domain/src/ai/index.ts`,
  `packages/domain/src/platform/services.ts` (`tokenCostPaise`, beside `AiPrices`),
  `packages/domain/src/platform/usage-analytics.ts` (`aiCost` uses it), `packages/domain/src/platform/index.ts`,
  `packages/contracts/src/platform/ai-transparency.ts`, `packages/api/src/platform/routers/ai-transparency.ts`,
  `apps/api/test/support/console.ts` (`TestConsoleOptions.aiPrices`), `apps/web/src/console/log/log-actions.ts`
  (`"ai-trace.opened"` in `KNOWN_ACTIONS`, `"ai_turn_trace"` in the named targets),
  `apps/web/src/i18n/messages/en-IN/console-platform.json`, `apps/web/src/i18n/messages/en-IN/errors.json`
- Test: `packages/domain/test/platform/ai-traces.test.ts`, `apps/api/test/console-ai-transparency.test.ts` (extend);
  `apps/web/test/console/log/log-actions.test.ts` (unchanged, must pass)

**Interfaces:**
- Consumes: 3b's `readTraceFile`, `TraceFile`; `findOrganizationRecord` (identity), `asOrganization`,
  `recordPlatformAudit`, `PlatformActor`; Task 1's contracts file and router.
- Produces (domain, ai module):
  ```ts
  export const storedMessageFields = { id: true, direction: true, kind: true, body: true, caption: true, clientToken: true, occurredAt: true } as const;
  /** Who wrote it (the customer, this AI by its "ai:" token, or the team) and its words, as the prompts read them. */
  export function contextMessageOf(row: { id: string; direction: string; kind: string; body: string | null;
    caption: string | null; clientToken: string | null; occurredAt: Date }): ContextMessage;
  export interface KeptTrace { id: string; conversationId: string; startedAt: Date; kind: "reply" | "nudge"; outcome: string; // the column's CHECK
    reason: string | null; move: string | null; saleStage: string | null; model: string | null; inputTokens: number;
    outputTokens: number; durationMs: number; fileKey: string }
  /** Kept traces newest first ([startedAt desc, id desc]); one chat's when conversationId is given. */
  export async function keptTraces(tx: OrgTx, input: { conversationId?: string; cursor?: string; limit: number }, now: Date):
    Promise<{ traces: KeptTrace[]; nextCursor: string | null }>;
  export async function keptTrace(tx: OrgTx, traceId: string, now: Date): Promise<KeptTrace | null>;
  /** The chat's messages with these ids, in the order given; an id the chat doesn't hold is left out. */
  export async function traceMessages(tx: OrgTx, conversationId: string, ids: readonly string[]): Promise<ContextMessage[]>;
  ```
- Produces (domain, platform module):
  ```ts
  export function tokenCostPaise(prices: AiPrices, tokens: { input: number; output: number }): number; // Math.round((input × in + output × out) / 1_000_000)
  export async function listAiTraces(services: PlatformServices, input: AiTraceListInput, now?: Date): Promise<AiTracePage>;
  export async function openAiTrace(services: PlatformServices, staff: PlatformActor, input: AiTraceInput, now?: Date): Promise<AiTraceDetail>;
  export function traceFileView(file: TraceFile, messages: ContextMessage[]): AiTraceFile; // pure, ai-trace-detail.ts
  ```
- Produces (contracts):
  ```ts
  export const aiTraceListInput = z.strictObject({ organizationId: recordId, conversationId: recordId.optional(),
    cursor: recordId.optional(), limit: z.int().min(1).max(100).default(50) });
  export const aiTraceInput = z.strictObject({ organizationId: recordId, traceId: recordId });
  export const aiTraceRow = z.object({ id: recordId, conversationId: recordId, startedAt: z.iso.datetime(),
    kind: z.enum(["reply", "nudge"]), outcome: z.string(), reason: z.string().nullable(), move: z.string().nullable(),
    saleStage: z.string().nullable(), model: z.string().nullable(), inputTokens: z.int().min(0), outputTokens: z.int().min(0),
    durationMs: z.int().min(0), costPaise: z.int().min(0).nullable() });
  export const aiTracePage = z.object({ traces: z.array(aiTraceRow), nextCursor: recordId.nullable(), priced: z.boolean() });
  export const aiTraceMessage = z.object({ id: recordId, from: z.enum(["customer", "you", "team"]), at: z.iso.datetime(), kind: z.string(), text: z.string() });
  const aiTraceBlock = z.object({ title: z.string(), text: z.string() });
  export const aiTraceFile = z.object({
    intents: z.array(z.string()),
    promptVersions: z.array(z.object({ name: z.string(), used: z.int(), current: z.int().nullable() })),
    understand: z.object({ blocks: z.array(aiTraceBlock), answer: z.string().nullable() }).nullable(),
    messages: z.array(aiTraceMessage), messagesGone: z.int().min(0),
    lookups: z.array(z.object({ tool: z.string(), request: z.string(), result: z.string() })),
    decision: z.object({ why: z.string().nullable(), note: z.string().nullable(), task: z.string().nullable(),
      suggest: z.object({ kind: z.string(), reason: z.string() }).nullable() }),
    checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().nullable() })),
    write: z.object({ blocks: z.array(aiTraceBlock), answers: z.array(z.string()) }).nullable(),
    sent: z.object({ text: z.string().nullable(), messages: z.array(aiTraceMessage) }),
    actions: z.array(z.string()) });
  export const aiTraceDetail = z.object({ trace: aiTraceRow, priced: z.boolean(), file: aiTraceFile.nullable() });
  ```
- Produces (router): `aiTransparency.traces` (query, `aiTraceListInput` → `aiTracePage`) and `aiTransparency.trace`
  (query, `aiTraceInput` → `aiTraceDetail`, passing `ctx.staff`), both `superAdminProcedure`. The second is a query
  that records: the screen fetches it once per visit (Task 5).

Rules. Kept = `where: { expiresAt: { gt: now }, conversation: { state: { not: "erased" } } }` in `keptTraces`,
`keptTrace`; pages by Prisma's `cursor: { id }`, `skip: 1`, `take: limit + 1`. `traceMessages` selects
`storedMessageFields` with `where: { conversationId, id: { in: ids } }`, asking only for ids shaped like a UUID (any
other is simply not found: the column is `uuid`, and a bad id must not fail the opening). `listAiTraces`: one platform transaction,
`findOrganizationRecord` (ORGANIZATION_NOT_FOUND), then `asOrganization` → `keptTraces`; each row's `costPaise` from
`services.aiPrices` or null. `openAiTrace`, in order: `staff.userId === null` → `RangeError`; platform transaction:
`findOrganizationRecord`, `asOrganization` → `keptTrace`, null → `DomainError("NOT_FOUND", "AI_TRACE_NOT_FOUND", "No
such trace")`, then `recordPlatformAudit(tx, staff, { action: "ai-trace.opened", targetType: "ai_turn_trace", targetId:
traceId, targetOrganizationId: organizationId })`; after the commit `readTraceFile(services.storage, row.fileKey)`; null
→ `file: null`; else a second platform transaction reads `traceMessages` for the unique ids of `messageIds` and
`sent.messageIds`, and `traceFileView` builds the rest: blocks as `{ title, text }` in the file's order; `answer` =
`understand.raw`; `messages` in `messageIds` order; `messagesGone` = unique ids not found; each lookup `{ tool:
request.tool, request: JSON.stringify(request, null, 2), result: JSON.stringify(result, null, 2) }`; `promptVersions`
in the library's order, then any unknown name, `current` = today's `promptVersions()` or null; `suggest` as `{ kind,
reason }`; `write.answers` = `write.raw`; `sent.messages` = the found `sent.messageIds`. A version-1 file is taken as
written: `readTraceFile` already refuses any other version.
Copy: `errors.json` `AI_TRACE_NOT_FOUND` "This turn isn't kept any more: a trace is kept 14 days, and goes at once when
its customer is erased."; `consolePlatform.log.actions["ai-trace"].opened` "Opened an AI turn's trace";
`consolePlatform.log.targets.ai_turn_trace` "AI turn".

- [ ] **Step 1: Write the failing tests** (domain; an agency with two chats and their messages; turns built with
  `startTrace` plus fields, as `trace-sink.test.ts` does, and kept through `createTraceSink({ db, storage: test.storage,
  logger })`; `NOW` fixed; admin `{ userId: randomUUID() }`)
  - "lists the kept turns newest first, one chat's when asked, priced": 3 turns on chat A at NOW − 1, 2, 3 h and 1 on
    chat B → 4 rows newest first; with chat A's id → its 3; with `aiPrices { inputPaisePerMillion: 2_500,
    outputPaisePerMillion: 10_000 }` a turn of 1,000,000 in / 500,000 out costs 7,500 and `priced` is true; without,
    `costPaise` null and `priced` false.
  - "pages with a cursor": limit 2 → 2 rows and a `nextCursor`; the next page → the other 2 and `nextCursor` null.
  - "a trace past 14 days is neither listed nor opened" (Review Focus 4): a row started 15 days before NOW, its file
    present, unswept → not listed; opening it → `NOT_FOUND` `AI_TRACE_NOT_FOUND`; no `ai-trace.opened` entry.
  - "an erased customer's turns are gone at once" (Review Focus 3): `withdrawAiParts` and `withdrawWhatsApp` for chat
    A's person at NOW, no sweep → the list holds only chat B's turn, opening an A turn is NOT_FOUND, and B's opens; and a
    chat set to `state: "erased"` with its trace's `expires_at` untouched is refused the same way.
  - "opening reads the file and the chat's messages as kept now, and logs it": the detail's understand block titles
    equal the trace's, `messages` are the stored bodies in `messageIds` order with `from` customer / you / team,
    `sent.messages` resolved, a lookup's `result` is indented JSON; one platform log entry `{ action: "ai-trace.opened",
    actorUserId: admin.userId, targetType: "ai_turn_trace", targetId: trace.id, targetOrganizationId }` with no
    before/after.
  - "a message of another chat is never shown": a file naming chat B's message id and an id `"m1"` → neither in
    `messages`, both counted in `messagesGone`.
  - "a missing file gives the row and no file" (Review Focus 1): the file deleted from storage → `{ trace: row, file:
    null }`, and the opening is logged.
  - "a turn on an older prompt names both versions": `promptVersions` `{ "understand.instructions": <current>,
    "old.piece": 3 }` → `{ name: "understand.instructions", used, current: used }` and `{ name: "old.piece", used: 3,
    current: null }` last.
  - "another organization's trace is NOT_FOUND, and so is an unknown organization (ORGANIZATION_NOT_FOUND)".
  - (api) "support is refused the turns and a turn, and nothing is logged" (Review Focus 2): `aiTransparency.traces`
    and `aiTransparency.trace` with `support.jar` → `{ status: 403, reason: "SUPER_ADMIN_ONLY" }`; the organization's
    platform log has no `ai-trace.opened`.
  - (api) "a super admin lists a turn and opens it, priced": a `createTestConsole(server, { storage, aiPrices })`
    sharing the sink's storage → one row with its `costPaise`; the opening's `file.understand` is not null.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, the lite suites (`prepare` changed), `usage-analytics` tests, `log-actions.test.ts`, the
  errors guard, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(platform): super admins list and open the lite agent's turn traces, each opening logged`

### Task 3: The AI prompts page

**Files:**
- Create: `apps/web/src/app/console/ai-prompts/page.tsx`, `apps/web/src/console/ai/prompt-library-screen.tsx`,
  `apps/web/src/console/ai/model-call-card.tsx`, `apps/web/src/console/ai/trace-text.tsx`,
  `apps/web/src/i18n/messages/en-IN/console-ai.json`
- Modify: `apps/web/src/i18n/messages.ts` (`consoleAi`), `apps/web/src/console/routes.ts`,
  `apps/web/src/console/shell/console-navigation.ts` (key `aiPrompts`, `BookOpenTextIcon`, `superAdminOnly: true`,
  right after `emails`), `apps/web/src/i18n/messages/en-IN/console.json` (`navigation.aiPrompts` "AI prompts")
- Test: `apps/web/test/console/ai/prompt-library.test.tsx`, `apps/web/test/console/ai/trace-text.test.ts`,
  `apps/web/test/console/console-navigation.test.ts`, `apps/web/test/console/page-titles.test.ts`

**Interfaces:**
- Consumes: Task 1's `aiTransparency.prompts` and `AiPromptLibrary`.
- Produces (routes and the text block, used by Tasks 4 and 5):
  ```ts
  aiPrompts: "/console/ai-prompts",
  aiTraces: (organizationId: string, conversationId?: string) => string, // /console/organizations/<id>/ai-traces[?chat=<conversationId>]
  aiTrace: (organizationId: string, traceId: string) => string,         // /console/organizations/<id>/ai-traces/<traceId>
  /** JSON text indented two spaces; anything else as it is. */
  export function readableJson(text: string): string;
  /** Long recorded text, wrapped: a <pre> with whitespace-pre-wrap wrap-anywhere and dir="auto", never a sideways scroll. */
  export function TraceText(props: { text: string; label: string }): ReactElement; // label: the pre's aria-label
  ```

`PromptLibraryScreen`: `PageHeader` (title, intro); for support only the sentence. Section "What each call is given":
a `ModelCallCard` per call (a registry `Card`: the call's name and intro, the `system` line naming the pieces, a
registry `Table` of its blocks with title, purpose and budget, the `answer` line, and the lookups line or `noLookups`).
Section "The fixed pieces": one `Card` per piece, titled by its name in a `numbers` span, the version line
(`formatCalendarDay(changedOn)`), the `fixedTexts` line under `fixed.texts`, and its text as a `TraceText`.
`LoadingRows` while loading, `ErrorState` with Try again on failure.
Copy (`consoleAi`): `superAdminsOnly` "Only a super admin can see the AI agent's prompts and turns: a turn holds a
customer's words."; `prompts.title` "AI prompts"; `.intro` "The fixed words the lite WhatsApp agent's two model calls
are given, as they are now. A turn's trace names the versions it used."; `.loading` "Loading the prompts";
`.loadFailed` "The prompts didn't load."; `.callsHeading` "What each call is given"; `.piecesHeading` "The fixed
pieces"; `.call.understand` "Understand", `.call.write` "Write"; `.callIntro.understand` "Reads the chat and fills in the
form. It never writes to the customer.", `.callIntro.write` "Writes the words of the one move code picked.";
`.system` "System message, the same every turn: {pieces}"; `.blocks` "Then this turn's blocks, in this order. A block
with nothing in it is left out."; `.columns.block` "Block", `.columns.purpose` "What it tells the model",
`.columns.budget` "Characters at most"; `.answer` "Answers in JSON, to the schema “{name}”."; `.lookups` "Asks for up to
4 lookups, which code runs before Write: {tools}."; `.noLookups` "Asks for no lookups."; `.version` "Version {version},
changed {day}"; `.fixedTexts` "Code sends these texts itself. No model writes them."

- [ ] **Step 1: Write the failing tests**
  - (`trace-text`) "readableJson indents JSON and leaves other text": `'{"a":[1]}'` → `'{\n  "a": [\n    1\n  ]\n}'`;
    `"not json"` → itself.
  - "a super admin sees each call's pieces, blocks and lookups, then every piece's text": stub
    `platform.aiTransparency.prompts`; headings "Understand" and "Write"; the Understand table has a row "Lead card" with
    "500"; the lookups line names "find_packages"; the piece "understand.instructions" shows "Version 1, changed 12 Nov"
    and its text.
  - "support is told it's a super admin's, and nothing is asked": `inputsTo("aiTransparency.prompts")` is empty.
  - (navigation) super admins' keys gain `aiPrompts` after `emails`; support's are unchanged; its href is `/console/ai-prompts`.
  - (titles) the AI prompts page is titled `messages.consoleAi.prompts.title`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, the i18n guards, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): the console's AI prompts page, for super admins`

### Task 4: An organization's AI turns

**Files:**
- Create: `apps/web/src/app/console/organizations/[organizationId]/ai-traces/page.tsx`,
  `apps/web/src/console/ai/ai-traces-screen.tsx`, `apps/web/src/console/ai/ai-trace-table.tsx` (wide),
  `apps/web/src/console/ai/ai-trace-items.tsx` (phones), `apps/web/src/console/ai/use-ai-traces.ts`,
  `apps/web/src/console/ai/trace-words.ts`
- Modify: `apps/web/src/console/organizations/organization/organization-lite-agent.tsx` (super admins: a `TextLink` to
  `aiTraces(organizationId)`), `apps/web/src/i18n/messages/en-IN/console-ai.json` (`traces`)
- Test: `apps/web/test/console/ai/ai-traces-screen.test.tsx`,
  `apps/web/test/console/organizations/organization-lite-agent.test.tsx` (extend), `apps/web/test/console/page-titles.test.ts`

**Interfaces:**
- Consumes: Task 2's `aiTransparency.traces`, `AiTracePage`, `AiTraceRow`; Task 3's routes.
- Produces:
  ```ts
  export const AI_TRACES_PER_PAGE = 50;
  export function useAiTraces(organizationId: string, conversationId: string | null); // useCursorPages over aiTransparency.traces
  /** The words a turn's figures read as, shared by the list and the turn's page. */
  export function useTraceWords(): { kind(kind: "reply" | "nudge"): string; tokens(input: number, output: number): string;
    duration(ms: number): string; cost(paise: number): string; chat(conversationId: string): string };
  ```
`tokens` uses `formatCount`; `duration` one decimal of seconds; `cost` is `rupeesOf` (from
`apps/web/src/console/growth/usage-screen.tsx`, not a second copy); `chat` is "Chat {code}"
with the id's last 6 characters (no name or number of the customer anywhere in the list). The page reads `searchParams.chat`
and passes it only when it has the shape of a UUID, else lists every chat. The screen: `BackLink` to the organization,
`PageHeader` (title; `intro` or, for one chat, `chatIntro` with a `TextLink` "All chats"), an `Alert` with
`noPricesTitle`/`noPricesDescription` when `pages[0].priced` is false, then the rows, `ShowMoreButton`, `LoadingRows`,
`ErrorState`, `EmptyState`. Wide (`useWideScreen`): a registry `Table` with Time (a `TextLink` to `aiTrace`), Chat (a
`TextLink` to `aiTraces(organizationId, conversationId)`), Turn, Outcome (outcome, reason under it muted), Move (move,
stage under it), Model, Tokens, Cost (only when priced), Took. Phones: an `ItemGroup`, each `Item` titled by the time
link and the outcome, described by move, stage, tokens and cost. Codes as recorded; a null code shows `none`.
Copy (`consoleAi.traces`): `title` "AI turns"; `intro` "Every turn the lite WhatsApp agent took in this agency's chats
in the last 14 days, newest first. A turn's trace is deleted after 14 days, and at once when its customer is erased.";
`chatIntro` "One chat's turns in the last 14 days, newest first."; `allChats` "All chats"; `back` "Back to the
organization"; `link` "See the AI's turns"; `loading` "Loading the AI's turns"; `loadFailed` "The AI's turns didn't
load."; `empty` "No turns in the last 14 days. Only an agency on the lite agent has them."; `showMore` "Show more turns";
`noPricesTitle` "Costs aren't shown"; `noPricesDescription` "Set AI_PRICE_INPUT_PAISE_PER_MILLION and
AI_PRICE_OUTPUT_PAISE_PER_MILLION on the console to see what each turn cost. Until then, tokens only."; `chat` "Chat
{code}"; `columns` `startedAt` "Time", `chat` "Chat", `kind` "Turn", `outcome` "Outcome", `move` "Move", `model` "Model",
`tokens` "Tokens", `cost` "Cost", `duration` "Took"; `kinds.reply` "Reply", `kinds.nudge` "Follow-up"; `tokens` "{input}
in · {output} out"; `duration` "{seconds} s"; `none` "None".

- [ ] **Step 1: Write the failing tests**
  - "lists each turn with its outcome, move, tokens and cost": wide, two priced rows → the first row reads its time in
    the platform's zone, "replied", "give_price", "quoted", "1,200 in · 80 out", "₹0.06", "2.4 s"; the time links to
    `/console/organizations/<org>/ai-traces/<traceId>`, "Chat <last 6>" to `…/ai-traces?chat=<conversationId>`.
  - "without prices it says so and shows tokens only": `priced: false` → the alert "Costs aren't shown", no Cost column.
  - "one chat's turns": `conversationId` given → `inputsTo("aiTransparency.traces")[0]` is `{ organizationId,
    conversationId, limit: 50 }`; the chat intro and an "All chats" link to the unfiltered address.
  - "a phone lists items"; "no turns says so"; "Show more asks with the cursor".
  - "support is told it's a super admin's, and nothing is asked".
  - (organization page) "a super admin sees the link to the AI's turns, support doesn't".
  - (titles) the AI turns page is titled `messages.consoleAi.traces.title`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, the i18n guards, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): an organization's AI turns in the console, per agency and per chat`

### Task 5: One AI turn, whole

**Files:**
- Create: `apps/web/src/app/console/organizations/[organizationId]/ai-traces/[traceId]/page.tsx`,
  `apps/web/src/console/ai/ai-trace-screen.tsx` (states, the row's details, the tabs),
  `apps/web/src/console/ai/ai-trace-parts.tsx` (the tabs' contents), `apps/web/src/console/ai/trace-messages.tsx`
- Modify: `apps/web/src/console/ai/use-ai-traces.ts` (`useAiTrace`), `apps/web/src/i18n/messages/en-IN/console-ai.json` (`trace`)
- Test: `apps/web/test/console/ai/ai-trace-screen.test.tsx`, `apps/web/test/console/page-titles.test.ts`

**Interfaces:**
- Consumes: Task 2's `aiTransparency.trace`, `AiTraceDetail`; Task 4's `useTraceWords`; Task 3's routes,
  `TraceText` and `readableJson`.
- Produces:
  ```ts
  /** Fetched once per visit, since each fetch is an opening in the platform log. */
  export function useAiTrace(organizationId: string, traceId: string); // useQuery(trace.queryOptions(input, { staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false }))
  ```
The screen: `BackLink` to `aiTraces(organizationId)`; `PageHeader` (title; intro the start time and the turn's kind;
`logged` under it); `Details` of the row: started, turn, outcome, reason, model, tokens, cost (when priced), took, and
from the file the prompt versions (`promptVersion`, or `promptChanged` when `current` differs, with a `TextLink`
`promptsLink` to `aiPrompts` as the row's hint), plus a `TextLink` `thisChat` to `aiTraces(organizationId,
conversationId)`. `file === null` → an `Alert` with `fileMissing`, no tabs. Else registry `Tabs`: Understand (each
block a `Card` with its title and `TraceText`; a Messages `Card` of `TraceMessages`, then `messagesGone` when not 0;
"The form it returned" as `TraceText(readableJson(answer))` or `noAnswer`; `noUnderstand` when null), Lookups (a `Card`
per lookup titled by its tool: `asked` and `got`, each a `TraceText`; `noLookups`), Decision (`Details`: move, stage,
why, intents, note, task, suggestion), Write (block cards, `writeMessages`, then each answer as `try` with
`TraceText(readableJson(...))`; `noWrite`), Checks and sent (a registry `Table` of checks with a `StatusBadge` good
`passed` / bad `failed`, or `noChecks`; `sentText` as `TraceText` or `nothingSent`; `TraceMessages` of the sent ones;
the action codes or `noActions`). `TraceMessages`: an `ItemGroup`, each `Item` titled "{from} · {time}" (`(kind)` after
a non-text kind) and its text (`dir="auto"`, `whitespace-pre-wrap`) or `noWords`. 404 and 400 → `EmptyState` with
`notFound` and a button back to the turns; other failures → `ErrorState` with Try again.
Copy (`consoleAi.trace`): `title` "AI turn"; `back` "Back to the AI's turns"; `logged` "Opening a turn is written in
the platform log, because it holds a customer's words."; `loading` "Loading the turn"; `loadFailed` "The turn didn't
load."; `notFound` "This turn isn't kept any more: a trace is kept 14 days, and goes at once when its customer is
erased."; `fileMissing` "This turn's file is missing or can't be read, so only its index row is shown."; `thisChat`
"Every turn in this chat"; `details` `startedAt` "Started", `kind` "Turn", `outcome` "Outcome", `reason` "Reason",
`model` "Model", `tokens` "Tokens", `cost` "Cost", `duration` "Took", `prompts` "Prompt versions"; `promptVersion`
"{name} v{used}"; `promptChanged` "{name} v{used}, now v{current}"; `promptsLink` "See the prompts as they are now";
`tabs` `understand` "Understand", `lookups` "Lookups ({count})", `decision` "Decision", `write` "Write", `sent` "Checks
and sent"; `noUnderstand` "This turn didn't call Understand."; `messages` "Messages"; `messagesIntro` "The messages
Understand read, as the chat keeps them now."; `messagesGone` "{count, plural, one {# message is} other {# messages
are}} no longer kept."; `from` `customer` "Customer", `you` "The AI", `team` "Team"; `noWords` "No words"; `answer` "The
form it returned"; `noAnswer` "No answer came back."; `noLookups` "No lookups this turn."; `asked` "Asked"; `got` "Got";
`decision` `move` "Move", `stage` "Sale stage", `why` "Why", `intents` "Intents", `note` "Note on the lead", `task`
"Task for the owner", `suggest` "Suggested", `suggestion` "{kind}: {reason}"; `noWrite` "This turn didn't call Write.";
`writeMessages` "Messages: the chat's newest 6 at the time; on a reply turn, the last 6 under Understand."; `answers`
"What it wrote"; `try` "Try {number}"; `checks` "Checks"; `check` `name` "Check", `result` "Result", `detail` "Detail";
`passed` "Passed"; `failed` "Failed"; `noChecks` "No checks ran."; `sentText` "What was sent"; `nothingSent` "Nothing was
sent."; `sentMessages` "Messages sent"; `actions` "What it did in the app"; `noActions` "Nothing."

- [ ] **Step 1: Write the failing tests**
  - "shows the turn's row, the Understand blocks, the chat's messages and the form it returned": the details read
    "replied" and "1,200 in · 80 out"; cards "Agency" and "Lead card"; a message item "Customer · <time>" with "how much
    for kedarnath"; the answer's text equals `readableJson(answer)`.
  - "each tab shows its part": Lookups shows "find_packages" with its asked and got; Decision its why, note and
    "not_a_lead: Looks fake"; Write its two tries; Checks and sent a Failed and a Passed badge, the sent text and
    "stage:quote_sent".
  - "a missing file is said plainly" (Review Focus 1): `file: null` → the `fileMissing` alert, the outcome still in the
    details, no tab list.
  - "a trace no longer kept says so with the way back": 404, and 400, → `notFound` and a link to the turns.
  - "a prompt changed since names both versions": `{ used: 1, current: 2 }` → "write.moves v1, now v2" and the link to
    `/console/ai-prompts`.
  - "a very large trace stays readable" (Review Focus 5): an answer of one 30,000-character JSON line → its `pre` text
    equals the indented form and the `pre` has `whitespace-pre-wrap` and `wrap-anywhere`; the Write tab's tries are not
    in the document until that tab is chosen.
  - "it is fetched once per visit": after the render and `focusManager.setFocused(false)` then `true`,
    `inputsTo("aiTransparency.trace")` has length 1.
  - "support is told it's a super admin's, and nothing is asked".
  - (titles) the AI turn page is titled `messages.consoleAi.trace.title`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, the i18n guards, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): one AI turn in the console, whole, with the chat's words read when opened`
