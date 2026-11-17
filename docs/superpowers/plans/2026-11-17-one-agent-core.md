# One WhatsApp agent, the core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third agent, `one`, answers an agency's WhatsApp on LangGraph JS with natural's tools (no word guards, no
`customer_words`, nothing of the earlier system hidden), chosen per agency in the console and tried first in Try it.

**Architecture:** A new port in `packages/integrations/src/tool-agent/` runs a tool agent: a LangChain chat model that
wraps our `AiModel` call (so OpenRouter's fallback list, thought signatures, Langfuse generations and the month's count
all stay ours) driven by a two-node LangGraph `StateGraph`. The domain's `packages/domain/src/ai/one/` builds the
context, hands the port natural's read and action tools as plain functions that stage, and turns the port's end into
natural's `LoopEnd`, so natural's act, send, dry answer and follow-up plumbing are reused as they are. Natural's files
change only by exports, options and widened types.

**Tech Stack:** TypeScript (strict), `@langchain/langgraph` 1.6.0, `@langchain/core` 1.3.3, zod 4.6.7, Prisma 7.10 on
Postgres 18 under row-level security, pg-boss, tRPC, Next.js with next-intl and shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md` (sections 3, 4, 5, 10, 11, 12.3) and its
prompt `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-prompt.md`. The lead's rulings R1–R12 in
`.superpowers/sdd/one-agent/rulings.md` bind this plan; the spec wins over it.

**Out of scope (later pull requests, in this order):** brochures (spec 6), voice notes and images (spec 8), booking
buttons (spec 7), the chat summary (spec 9), then deleting lite and natural (spec 12.6). Each has a seam named below.

## Global Constraints

- **Base:** `origin/main` after PR 0 (`feat/agent-defaults`: natural as default, `AT_ONCE = 5`) has merged, with
  `origin/docs/one-whatsapp-agent` merged in if it isn't on `main` yet (Task 7's test reads the prompt file). Before
  the PR: `git fetch origin` and merge `origin/main` again (R11).
- Commands run under Node 24: start each with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`. Each worktree sets its
  own `COMPOSE_PROJECT_NAME` and checks `scripts/dev/compose.sh --print-name` first; at most two Docker-heavy test runs
  at once on this Mac (R10). Never `git stash`.
- **Pinned:** `@langchain/langgraph` `1.6.0` (published 2026-10-30) and `@langchain/core` `1.3.3` (2026-11-02), both in
  the `catalog:` of `pnpm-workspace.yaml`, used only by `packages/integrations` (R2, ADR 0008). Never "latest".
- No vendor import outside `packages/integrations`: dependency-cruiser's `vendor-sdks-only-in-integrations` gains
  `@langchain/[^/]+`. The domain imports `@travel-crm/integrations/tool-agent` with `import type` only.
- **Natural and lite keep their behaviour** (R4): a natural file changes only by an export, a widened type, an extracted
  function the old code now calls, or a new parameter whose default is natural's behaviour.
  `pnpm --filter @travel-crm/domain test -- test/ai/natural test/ai/lite` stays green at every commit.
- **Never edit** (R12, `origin/ayush` changes them): `natural/context/agency-block.ts`, `natural/dry-agency.ts`,
  `natural/prompt.ts`, `apps/api/src/ai-services.ts`, `apps/api/src/services.ts`. Import from them freely.
- **Model settings for `one`:** feature `sales_agent` (so `AI_AGENT_MODELS`), `maxTokens` 8,000, reasoning effort
  `low`, `timeoutMs` 60,000 per try (`NATURAL_LIMITS.tryMs`), no `deadlineAt`, `user` the organization's id,
  LangGraph's default `recursionLimit` (25). Every call goes through natural's `countedModel` (the month's limit).
- Tools run one at a time, in the model's order, each in its own `db.forOrg` transaction; nothing runs inside the act's.
- **No word checks for `one` (R5):** no `checkWords`, no `traceFlags` of the words, no `customer_words`, no
  `withoutAmountsAndDates` on any line. Business checks inside the tools stay (spec 10).
- Kept structure rules (anti-goals 1 and 2): customer-facing actions (`CUSTOMER_FACING`) never go beside the fallback
  line; a hold or `resend_payment` never goes without words; a turn never ends silent unless something staged may.
- **Prompt (R6):** Langfuse text prompt `whatsapp-agent/real-agent`, label `production` for live turns, `latest` (read
  fresh) for Try it, else the built-in v2 text, verbatim. Placeholders `{{agency_name}}`, `{{agent_name}}`, `{{tone}}`.
- Hand-over reasons for `one`: natural's eight plus `b2b` (R8). Natural's own tool never offers `b2b`.
- `one` reads and writes `naturalFacts` as they are (`agent: "natural"` in the JSON), so a switch keeps the offer, the
  totals told and the brochures sent.
- Logs hold ids, codes, counts and timings only. Commits: Conventional Commits, files staged by name, no
  `--no-verify`, no `Co-Authored-By` trailer.

## Review Focus

1. **Thought signatures lost in the LangChain round trip.** Gemini answers a tool round without its
   `reasoning_details` with a 400, so every turn with a lookup would fail, retry and end on the fallback line. Expected:
   each assistant message keeps `reasoningDetails` through every conversion, including a second run on a transcript.
   Tests in Task 1 and Task 11; the live check (Task 2, skipped without `OPENROUTER_API_KEY`) is the owner's step 0.
2. **The customer writes again during a long turn** (there is no wall-clock cap now). Expected: the turn checks for a
   newer line before every model call, ends `superseded` and sends nothing. Tests in Task 2, Task 10 and Task 11.
3. **A server with `LANGSMITH_TRACING` or `LANGCHAIN_TRACING_V2` set.** Expected: no chat leaves for LangSmith; the
   adapter makes no network call of its own. Test in Task 2.
4. **The reply written beside an action call.** Gemini often writes its words in the same answer as `send_brochure` or
   `book`, then answers the tool result with nothing. Expected: those words are the reply, so no brochure or QR goes
   alone and no reply is lost. Test in Task 10.
5. **Prompt v2 promises an offer card the core doesn't send yet.** Expected: `offer_booking`'s result tells the model
   no card goes yet and its words carry the date, the total and the advance. Test in Task 5.

## Rulings (the planner's; each: what, why, cost if wrong)

- **P1. No file moves in this PR.** `one/` imports natural's leaf modules where they are; the few private helpers it
  needs are exported or extracted (Tasks 5, 6). The deletion PR moves what survives into `one/`. — Moving now churns
  every natural import and conflicts with `origin/ayush` and natural fixes in flight, for no behaviour gain. — One
  rename PR later.
- **P2. A small `StateGraph`, not `createReactAgent` or `ToolNode`.** Nodes `agent` and `tools`, `START → agent`,
  `agent → tools` when the answer has tool calls else `END`, `tools → agent`. — `createReactAgent` is deprecated in
  LangGraph 1.x (moved to `langchain`), and `ToolNode` runs calls in parallel, which would stage out of order and open
  transactions at once. — A swap to the prebuilt agent later is local to `langgraph-agent.ts`.
- **P3. Tool schemas are zod (R2); the adapter checks the arguments** and answers the model a `refused: …` sentence
  without calling the tool; the domain's own `parseToolArguments` and business checks still run inside. — Spec 10:
  "the tools' argument schemas, which the framework checks itself". — None.
- **P4. `one`'s `book` drops `full_name` as well as `customer_words`.** The booking takes the lead's or WhatsApp's name
  (`fullName: null`, as a lapsed hold taken again already does). — Spec 7.1.6 (accepted, O4) and prompt v2's `book`
  example name no name; asking for one the tool requires would contradict the prompt. — The name on the booking is
  the lead's until a person edits it.
- **P5. `offer_booking`'s result for `one` says no offer card goes yet**, so the words state the date, the total and
  the advance and ask for a yes. The buttons PR changes this one string. — Prompt v2 says the app sends a card. — None.
- **P6. History in the core: the newest 60 lines prepare already reads, all of them, whole** (no 40-line, 14-day or
  token window), one message cut at 4,000 characters, the earlier system's lines with their figures under a heading.
  A `summary` argument (always `null` here) is where the summary PR slots in. — Spec 5.2 without spec 9. — Long chats
  forget past 60 lines until the summary PR, as natural does today.
- **P7. No restarts.** The model is pinned to the first answer's (Try it's own when chosen); a cut-off answer is asked
  once more at effort `minimal`; any other failure ends the run `model_failed` and the worker's 1- and 5-minute retries
  take over (R7). — Simpler than natural's restart rules, and R7 keeps the retries. — A rare extra minute's wait.
- **P8. Words beside actions.** The reply is the final answer's words; when it has none, the words of the latest
  answer in this run whose calls were all actions (no read among them) are the reply. — Review Focus 4. — None.
- **P9. The in-memory adapter is a plain loop** that shares the adapters' tool-call runner and is held to the LangGraph
  adapter by one contract test run against both. Domain tests use it; Task 11 runs one live turn on LangGraph itself.
- **P10. Try it on `one` has no prompt choice:** it reads `latest` (R6). It reuses natural's answer contract and state.
- **P11. Migration `20261218200000_one_agent`**, after PR 0's `20261218100000_natural_default_agent`; it only widens
  two checks.
- **P12. Console labels:** "New agent" becomes "Natural agent"; the new one is "One agent (LangGraph)". — Three agents
  make "New" ambiguous. — Copy only.
- **P13. Kept in the core, changed by later PRs:** G6 in `send_brochure` (R5 lists only G1–G5; the brochures PR drops
  it), and `beforeTheModel` (a payment screenshot hands over; an unplayable voice note asks them to type; the media PR
  changes both).
- **P14. Turn rows:** every `one` turn that prepared writes one `ai_turn_trace` row (`agent = 'one'`, `failed_checks`
  = refused tool calls) and a version-2 file holding natural's trace shape. The console's detail page reads only lite's
  version-1 files, so a `one` row's detail is its Langfuse trace for now. — Spec 11 wants the rates by row; natural
  never wrote rows. — A later console PR reads version 2.

## File ownership

| Task | Owns (creates or modifies)                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/integrations/package.json`, `.dependency-cruiser.cjs`, `packages/integrations/src/tool-agent/{tool-agent,messages,chat-model,index}.ts` |
| 2    | `packages/integrations/src/tool-agent/{tool-calls,langgraph-agent,memory-agent}.ts` (and `index.ts` exports)    |
| 3    | `packages/contracts/src/ai/{one-tools,one-try-it,natural-tools,natural-trace,natural-try-it,index}.ts`, `apps/web/src/i18n/messages/en-IN/ai.json` (`b2b` only) |
| 4    | migration, `ai.prisma` comments, `packages/contracts/src/ai/agent.ts`, `domain/src/ai/agent-choice.ts`, console choice component and `console-organizations.json` |
| 5    | `natural/{types,trace,turn-note,hand-over-words}.ts`, `natural/tools/{action-tools,booking-checks}.ts`, `natural/loop/{types,words,ends,reply,tool-calls}.ts` |
| 6    | `natural/{chat-lines,prepare,live-io,turn,turn-refused,nudge-turn,dry-turn}.ts`, `natural/context/chat-turns.ts` |
| 7    | `natural/prompt-source.ts`, `one/{prompt,prompt-text}.ts`                                                        |
| 8    | `one/{history,context}.ts`                                                                                       |
| 9    | `one/tools.ts`                                                                                                   |
| 10   | `one/{loop,ends}.ts`                                                                                             |
| 11   | `one/{live-io,turn,turn-refused,nudge,turn-note}.ts`                                                             |
| 12   | `domain/src/ai/traces/trace-sink.ts`, `one/turn-row.ts`, the row call in `one/turn.ts` and `one/nudge.ts`        |
| 13   | `domain/src/ai/{agent,agent-worker}.ts`, `apps/api/src/worker-jobs.ts`                                           |
| 14   | `one/{dry-turn,try-it,index}.ts`, `domain/src/ai/index.ts`, `packages/api/src/{context,routers/ai}.ts`, `apps/api/src/app.ts`, web Try it files and `ai.json` (`agents.one`) |

Waves: **1** = Tasks 1, 3, 4, 6, 7 · **2** = 2 (after 1), 5 (after 3) · **3** = 8 (after 6), 9 (after 1, 3, 5) ·
**4** = 10 (after 2, 8, 9) · **5** = 11 (after 6, 7, 10) and 14 (after 7, 10) · **6** = 12 (after 4, 11) ·
**7** = 13 (after 4, 12).

---

### Task 1: The tool-agent port, and a LangChain chat model over our AI port

The riskiest task: the thought signatures must survive LangChain's message types, and nothing here can call Gemini.

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog: `"@langchain/core": 1.3.3`, `"@langchain/langgraph": 1.6.0`),
  `packages/integrations/package.json` (dependencies `@langchain/core`, `@langchain/langgraph` and `zod`, each
  `catalog:`), `pnpm-lock.yaml` (by `pnpm install`), `.dependency-cruiser.cjs` (`@langchain/[^/]+` in
  `vendor-sdks-only-in-integrations`, and its comment)
- Create: `packages/integrations/src/tool-agent/tool-agent.ts` (the port), `messages.ts` (conversion),
  `chat-model.ts` (`PortChatModel`), `index.ts`
- Test: `packages/integrations/test/tool-agent/chat-model.test.ts`

**Interfaces:**
- Produces:

```ts
// tool-agent/tool-agent.ts: the port. Domain code imports these types only.
export interface AgentTool {
  name: string;
  description: string;
  /** Describes the arguments to the model (JSON Schema, io "input") and checks them before `run` (ruling P3). */
  schema: z.ZodType<Record<string, unknown>>;
  /** Runs on the checked arguments; `words` are the words of the answer that made the call. */
  run(args: Record<string, unknown>, call: { words: string }): Promise<string>;
}
export interface AgentToolEntry { name: string; arguments: string; result: string }
/** One model call as the caller counts it: "limit" when the month has none left. */
export type AgentModelCall = (request: AiRequest) => Promise<AiResult | { ok: false; reason: "limit" }>;
export interface ToolAgentInput {
  /** The system message first. */
  messages: readonly AiMessage[];
  tools: readonly AgentTool[];
  /** Every call's request but its messages and tools: feature, maxTokens, reasoning, timeoutMs, user, model, temperature. */
  request: Omit<AiRequest, "messages" | "tools" | "toolChoice">;
  call: AgentModelCall;
  /** Asked before each model call; true ends the run `superseded`. */
  superseded?: () => Promise<boolean>;
  /** Told of every tool call, a refused one included, in order. */
  onTool?: (entry: AgentToolEntry) => void;
  recursionLimit?: number;
}
export type ToolAgentEnd =
  | { end: "answered"; text: string; model: string; transcript: AiMessage[]; calls: number }
  | { end: "steps"; calls: number }
  | { end: "model_failed"; reason: AiFailure | "limit"; calls: number }
  | { end: "superseded"; calls: number };
export interface ToolAgent { run(input: ToolAgentInput): Promise<ToolAgentEnd> }

// tool-agent/messages.ts
export function toLangChain(message: AiMessage): BaseMessage;
export function fromLangChain(message: BaseMessage): AiMessage;
/** The tool as the model reads it: z.toJSONSchema(schema, { io: "input" }) without `$schema` or any `examples`. */
export function aiToolOf(tool: Pick<AgentTool, "name" | "description" | "schema">): AiTool;

// tool-agent/chat-model.ts
export class AgentModelFailure extends Error { readonly reason: AiFailure | "limit" }
export class PortChatModel extends BaseChatModel {
  constructor(fields: { call: AgentModelCall; request: ToolAgentInput["request"] });
  _llmType(): string;                                  // "travel-crm-ai-port"
  bindTools(tools: BindToolsInput[]): PortChatModel;   // OpenAI-format definitions; shares the pin and the count
  _generate(messages: BaseMessage[]): Promise<ChatResult>;
  get calls(): number;                                 // port calls made, a cut-off answer's retry included
}
```

Conversion: `system` ↔ `SystemMessage`; `user` ↔ `HumanMessage` (attachments in `additional_kwargs.attachments`, for the
media PR); `assistant` ↔ `AIMessage` with `tool_calls` parsed for LangGraph's routing (`{}` when the text isn't JSON) and
the raw calls in `additional_kwargs.tool_calls` (OpenAI's shape, `arguments` the model's own text) and
`additional_kwargs.reasoning_details`; `tool` ↔ `ToolMessage` (`tool_call_id`). `fromLangChain(toLangChain(m))` deep-equals
`m` for every role. `_generate` sends `{ ...request, messages, tools, toolChoice: "auto" }` (no tools and no tool
choice when none are bound), names the pinned model once an answer came (unless `request.model` is set), throws
`AgentModelFailure` on a failure or "limit", and returns an `AIMessage` with `usage_metadata` and
`response_metadata: { model, finishReason }`. A cut-off answer (`finishReason: "length"`, no tool calls) is asked once
more at `reasoning: { effort: "minimal" }`; cut off again, it throws `AgentModelFailure("unavailable")`.

- [ ] **Step 1: Add the dependencies:** catalog entries, `pnpm install`, then `npm view @langchain/langgraph@1.6.0
  peerDependencies` matches what the lockfile resolved (`@langchain/core` 1.3.3, zod 4.6.7). Run
  `pnpm audit --audit-level=high`; a new high finding stops the task and goes to the lead.
- [ ] **Step 2: Write the failing tests** in `chat-model.test.ts` (memory model from `createMemoryAiModel`):

```ts
it("keeps every message whole through LangChain and back, reasoning details and raw arguments included", () => {
  for (const message of [system, userWithAttachment, assistantWithCalls, toolResult]) {
    expect(fromLangChain(toLangChain(message))).toEqual(message);
  }
  expect(fromLangChain(toLangChain(assistantWithCalls)).toolCalls?.[0]?.arguments).toBe('{"trip_id":"T1",}'); // broken JSON kept
});
it("sends the bound tools as JSON Schema, strict and without examples, with toolChoice auto");   // additionalProperties false, enum ["T1","T2"]
it("sends no tools and no tool choice when none are bound");
it("names the first answer's model on every later call, unless the request names one");
it("sends the first answer's reasoning details back on its assistant message in the next call", async () => {
  ai.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }], reasoningDetails: [{ signature: "s1" }] }, "Done");
  // invoke, append the tool message, invoke again
  expect(ai.requests[1]?.messages.find((m) => m.role === "assistant")?.reasoningDetails).toEqual([{ signature: "s1" }]);
});
it("throws the failure's reason, and limit", async () => {
  await expect(model.invoke(messages)).rejects.toMatchObject({ name: "AgentModelFailure", reason: "rate_limited" });
});
it("asks a cut-off answer once more at minimal effort, and fails a second cut-off as unavailable");
it("counts every port call, the retry included, across bound copies");
```

- [ ] **Step 3: Run** `pnpm --filter @travel-crm/integrations test -- test/tool-agent/chat-model.test.ts`; expect FAIL.
- [ ] **Step 4: Implement** the port types, `messages.ts`, `chat-model.ts`, and `index.ts` exporting them.
- [ ] **Step 5: Run** the same, then `pnpm --filter @travel-crm/integrations typecheck`,
  `pnpm --filter @travel-crm/integrations lint` and `pnpm depcruise`; expect PASS.
- [ ] **Step 6: Commit** `feat(integrations): a tool-agent port and a LangChain model over the AI port`.

### Task 2: The LangGraph tool agent, and the in-memory one

**Files:**
- Create: `packages/integrations/src/tool-agent/tool-calls.ts`, `langgraph-agent.ts`, `memory-agent.ts`
- Modify: `packages/integrations/src/tool-agent/index.ts` (export both factories)
- Test: `packages/integrations/test/tool-agent/contract.test.ts` (both adapters), `langgraph-agent.test.ts`,
  `openrouter-live.test.ts`

**Interfaces:**
- Consumes: Task 1's port, `PortChatModel`, `AgentModelFailure`, `toLangChain`, `fromLangChain`, `aiToolOf`.
- Produces:

```ts
// tool-calls.ts: the one runner both adapters use.
/** Runs the answer's calls one after another, in its order; each result a string for a tool message. */
export async function runToolCalls(tools: readonly AgentTool[], calls: readonly AiToolCall[], words: string,
  onTool?: (entry: AgentToolEntry) => void): Promise<{ toolCallId: string; content: string }[]>;
// langgraph-agent.ts
export function createLangGraphToolAgent(): ToolAgent;
// memory-agent.ts
export function createMemoryToolAgent(): ToolAgent;   // a plain loop with LangGraph's step count
```

`runToolCalls` answers, without running the tool: `refused: there is no tool called <name>`, `refused: the arguments
weren't JSON` (empty text reads as `{}`), `refused: the arguments weren't a JSON object`, and `refused: <path>:
<message>; …` for each zod issue; a tool that throws answers `refused: that couldn't be done just now; say you'll check
and come back, and call create_task`. The LangGraph adapter (ruling P2) builds the graph per run with
`MessagesAnnotation`; the `agent` node awaits `superseded()` first, then `PortChatModel.bindTools(aiTools).invoke`;
the `tools` node calls `runToolCalls` on the last answer's raw calls (`additional_kwargs.tool_calls`) with its words.
It runs `graph.invoke({ messages }, { recursionLimit })` and maps: the final state to `answered` (the last answer's
text, its model, `fromLangChain` of every message); `GraphRecursionError` to `steps`; `AgentModelFailure` to
`model_failed`; its own superseded error to `superseded`. It passes no callbacks and reads no environment.

- [ ] **Step 1: Write the failing tests.** `contract.test.ts` runs each case on both adapters (`describe.each`):

```ts
it("answers after a read: the text, the model, the transcript with each reasoning detail, and the calls", async () => {
  expect(end).toMatchObject({ end: "answered", text: "₹9,499 per person", model: "memory-model", calls: 2 });
  expect(end.transcript.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant"]);
});
it("runs the calls one at a time in the model's order, each with the words of its answer");   // second run starts after the first resolves
it("answers a call its schema refuses with the issues, and never runs the tool");            // "refused: adults: Too small…"
it("answers an unknown tool, broken JSON and a throwing tool with a refusal, and goes on");
it("tells onTool of every call, a refused one included");
it("ends model_failed with the reason when a model call fails, and with limit");
it("ends superseded before a model call once the customer wrote again, with no further call");
it("ends steps when the model never stops calling tools", async () => {
  expect(await memory.run(always({ recursionLimit: 6 }))).toEqual(await langGraph.run(always({ recursionLimit: 6 })));
  expect((await langGraph.run(always({}))).end).toBe("steps");   // the default limit, 25
});
```

  `langgraph-agent.test.ts`: `it("sends nothing anywhere, even with LangSmith's tracing variables set")` (sets
  `LANGSMITH_TRACING` and `LANGCHAIN_TRACING_V2` to `"true"`, stubs `globalThis.fetch` to record calls, runs a two-round
  turn, expects no fetch; if LangChain still traces, the adapter must stop it, never the test). `openrouter-live.test.ts`
  (`describe.skipIf(process.env.OPENROUTER_API_KEY === undefined)`): `it("finishes a two-round tool turn on the first
  agent model")` with `createOpenRouterModel` and `AI_AGENT_MODELS`' first model; the owner's step 0 (spec 4.3).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/integrations test -- test/tool-agent`; expect FAIL.
- [ ] **Step 3: Implement** `tool-calls.ts`, then `langgraph-agent.ts`, then `memory-agent.ts` to the same contract.
- [ ] **Step 4: Run** the same; expect PASS (the live test skipped).
- [ ] **Step 5: Commit** `feat(integrations): the LangGraph tool agent and an in-memory one`.

### Task 3: The one agent's tool contracts

**Files:**
- Create: `packages/contracts/src/ai/one-tools.ts`, `packages/contracts/src/ai/one-try-it.ts`
- Modify: `packages/contracts/src/ai/natural-tools.ts` (export its tool table and `withLabels`, extract the parse onto
  a table), `natural-trace.ts` (`agent: z.enum(["natural", "one"])`), `natural-try-it.ts` (`naturalDryAction`'s
  `hand_over.reason` becomes `z.enum(oneHandOverReasons)`; export `postedState`), `index.ts` (export the two new files),
  `apps/web/src/i18n/messages/en-IN/ai.json` (`ai.test.natural.handOverReasons.b2b`: "it's a business or agent
  enquiry"; the widened enum needs it to typecheck)
- Test: `packages/contracts/test/ai/one-tools.test.ts`, `packages/contracts/test/ai/natural-tools.test.ts` (stays green)

**Interfaces:**
- Produces:

```ts
// one-tools.ts
export const oneHandOverReasons = [...naturalHandOverReasons, "b2b"] as const;
export type OneHandOverReason = (typeof oneHandOverReasons)[number];
export const oneBookArguments = offerBookingArguments;              // no full_name, no customer_words (ruling P4)
export const oneHandOverArguments = z.strictObject({ reason: z.enum(oneHandOverReasons), summary: z.string().min(1).max(300) });
export interface OneToolSchema { name: NaturalToolName; description: string; schema: z.ZodType<Record<string, unknown>> }
/** Natural's fourteen tools with book and hand_over replaced; trip tools left out with no labels (ruling 21). */
export function oneToolSchemas(input: { tripLabels: readonly string[] }): OneToolSchema[];
/** As parseToolArguments, on one's table. */
export function parseOneToolArguments(name: string, raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[]): { ok: true; name: NaturalToolName; args: Record<string, unknown> } | { ok: false; problem: string };
// one-try-it.ts: as naturalTestInput with no `prompt` (ruling P10)
export const oneTestInput: z.ZodType<…>;  // strictObject { messages, state: postedState.nullable(), model, temperature, chatId? } + the Flash-only temperature refine
export type OneTestInput = z.infer<typeof oneTestInput>;
```

`book`'s description for `one`: "Holds the seats on the live offer's terms, or a total told, once the customer said
yes. After your reply, the app sends the payment message and QR." `hand_over`'s stays natural's. Each schema is
`withLabels(fields)` with the table's parse-only checks (`refine`) applied on top.

- [ ] **Step 1: Write the failing tests:** `it("offers natural's fourteen tools, without the trip tools when the agency
  has no trips")`, `it("books on the terms alone: full_name and customer_words are refused as unknown keys")`,
  `it("hands over for b2b, which natural's own parse still refuses")` (`parseToolArguments("hand_over", { reason:
  "b2b", … })` → `ok: false`), `it("names the trips in the refusal of an unknown trip_id")`, `it("describes book with no
  customer words in its JSON Schema")` (`z.toJSONSchema` has no `customer_words`), `it("reads a trace of the one
  agent")`, `it("reads a dry hand-over for b2b")`, `it("refuses a prompt choice and any unknown key in one's test
  input, and a temperature without Flash")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/contracts test -- test/ai/one-tools.test.ts test/ai/natural-tools.test.ts`;
  expect FAIL in the first file only.
- [ ] **Step 3: Implement** as above; `parseToolArguments` keeps its signature and messages.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/web typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's tool contracts, with b2b hand-overs`.

### Task 4: The `one` value: migration, agent choice and the console's choice

**Files:**
- Create: `packages/db/prisma/migrations/20261218200000_one_agent/migration.sql`,
  `packages/db/test/one-agent-columns.test.ts`
- Modify: `packages/db/prisma/schema/ai.prisma` (the two `agent` comments say lite, natural or one),
  `packages/contracts/src/ai/agent.ts` (`agentKinds = ["lite", "natural", "one"]`),
  `packages/domain/src/ai/agent-choice.ts` (`agentOf` reads `one`), `apps/web/src/console/organizations/organization/
  organization-agent-choice.tsx`, `apps/web/src/i18n/messages/en-IN/console-organizations.json`
- Test: `packages/domain/test/ai/agent-choice.test.ts`, `packages/domain/test/platform/agent-choice.test.ts`,
  `apps/web/test/console/organizations/organization-agent-choice.test.tsx`

**Interfaces:**
- Produces: `AgentKind` includes `"one"`; `agentOf(tx)` returns `"lite"`, `"one"` or `"natural"` (PR 0's default).

```sql
-- The one agent (spec 12.3): an agency's agent and a turn trace may now be 'one'. This only widens two checks, so the
-- release before keeps working while it applies.
ALTER TABLE "ai_autopilot" DROP CONSTRAINT ai_autopilot_agent_value,
  ADD CONSTRAINT ai_autopilot_agent_value CHECK (agent IN ('lite', 'natural', 'one'));
ALTER TABLE "ai_turn_trace" DROP CONSTRAINT ai_turn_trace_agent_value,
  ADD CONSTRAINT ai_turn_trace_agent_value CHECK (agent IN ('lite', 'natural', 'one'));
```

Console: "Change agent" opens the `ConfirmDialog` with a `ChoiceGroup` of the two agents it isn't on (`one` chosen first
when offered); the title, description and gate list follow the choice, and the gate shows for `natural` and `one`.
Messages: `agents.natural` "Natural agent", `agents.one` "One agent (LangGraph)", `dialog.choose` "Move to",
`dialog.description.one` "{name}'s WhatsApp chats will be answered by the one agent from the next message." (ruling P12).

- [ ] **Step 1: Write the failing tests:** `it("refuses an agent outside lite, natural and one, for an agency and a
  trace")` and `it("takes one for an agency and a trace")` (the pattern of `natural-agent-columns.test.ts`, a foreign
  key error `23503` proving the check passed); `it("reads one, and audits a move to it")`; `it("writes a move to one to
  the platform log and the agency's audit log")`; web: `it("offers the two other agents and moves the agency to the one
  chosen")` (chooseAgent called with `{ agent: "one" }`).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/one-agent-columns.test.ts`,
  `pnpm --filter @travel-crm/domain test -- test/ai/agent-choice.test.ts test/platform/agent-choice.test.ts`,
  `pnpm --filter @travel-crm/web test -- test/console/organizations/organization-agent-choice.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement**, then `pnpm --filter @travel-crm/db generate`.
- [ ] **Step 4: Run** the same and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): agencies can be moved to the one agent`.

### Task 5: Natural's seams, part A: tools, checks, trace and ends

No natural behaviour changes; every existing natural test passes untouched.

**Files:**
- Modify: `packages/domain/src/ai/natural/types.ts`, `natural/tools/action-tools.ts`, `natural/tools/booking-checks.ts`,
  `natural/trace.ts`, `natural/turn-note.ts`, `natural/hand-over-words.ts`, `natural/loop/types.ts`,
  `natural/loop/words.ts`, `natural/loop/ends.ts`, `natural/loop/reply.ts`, `natural/loop/tool-calls.ts`
- Test: `packages/domain/test/ai/natural/action-tools.test.ts` (new cases), `packages/domain/test/ai/natural/seams.test.ts`

**Interfaces:**
- Consumes: Task 3's `parseOneToolArguments`, `oneBookArguments`, `oneHandOverArguments`, `OneHandOverReason`.
- Produces:

```ts
// types.ts: book's `fullName: string | null; customerWords: string | null`; hand_over's `reason: OneHandOverReason`.
// action-tools.ts
export async function stageAction(context: ActionContext, name: NaturalToolName, args: Record<string, unknown>,
  words: string, options?: { agent?: "natural" | "one" }): Promise<StageOutcome>;     // default natural
// one: parses with parseOneToolArguments; book → bookChecks(context, terms, null), staged with fullName and
// customerWords null; hand_over takes b2b; offer_booking's result (ruling P5):
//   `offered: ${termsWords}; ${money}. No offer card goes yet, so your words state ${inFull ? "the date and the total"
//    : "the date, the total and the advance"}, and ask if they want to book`
// booking-checks.ts: bookChecks(context, terms, said: { fullName: string; customerWords: string } | null) skips the
//   customer-words and name checks when `said` is null, every other check in its order.
// trace.ts
export function startNaturalTrace(prompt: Pick<NaturalPrompt, "version" | "source">, startedMs: number,
  agent?: "natural" | "one"): NaturalTraceBuilder;                                     // finish() names it
// summaryOf leaves out a null name and null words.
// turn-note.ts: naturalTurnStart(input, prompt, leadId, agent = "natural") names "whatsapp-agent.<agent>.<kind>", tags
//   and metadata.agent by it; logNaturalTurn(logger, input, done, calls, ms, agent = "natural").
// hand-over-words.ts: handOverSentences.b2b = "Asks about a business booking or agent rates".
// loop/types.ts: FallbackReason adds "steps"; loop/words.ts: WHY.steps =
//   "The AI took too many steps without a reply it could send".
// loop/ends.ts: export function notDone(action, tripOf, today): string | null.
// loop/reply.ts: export function mayEndSilent(run: Pick<TurnRun, "staged" | "modelStaged">): boolean;
//   export const NEEDS_WORDS, QUIET_ENDERS.
// loop/tool-calls.ts: export READ_FAILED, STAGE_FAILED and settled().
```

- [ ] **Step 1: Write the failing tests:** `it("stages one's book on a live offer with no name or words")`,
  `it("refuses one's book with no live offer or total told, and when the price changed")`, `it("still refuses
  natural's book without customer_words")`, `it("stages one's hand-over for b2b, and natural refuses it")`, `it("tells
  one's model no offer card goes yet, with no full name asked")`, `it("says b2b to the team")` (`handOverText`),
  `it("summarises a book with no name or words")`, `it("names a one turn's trace and log line")`, `it("says why a
  turn that ran out of steps fell back")` (`fallbackTask({ reason: "steps", … })`).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/action-tools.test.ts
  test/ai/natural/seams.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS, every old test unchanged.
- [ ] **Step 5: Commit** `refactor(ai): natural's tools, trace and ends open to a second agent`.

### Task 6: Natural's seams, part B: reads, IO, refusal, follow-up and the dry turn

**Files:**
- Modify: `natural/chat-lines.ts`, `natural/prepare.ts`, `natural/context/chat-turns.ts`, `natural/live-io.ts`,
  `natural/turn.ts`, `natural/turn-refused.ts`, `natural/nudge-turn.ts`, `natural/dry-turn.ts`
- Test: `packages/domain/test/ai/natural/seams-reads.test.ts`, existing natural tests

**Interfaces:**
- Produces:

```ts
// chat-lines.ts / prepare.ts: an earlier assistant's file caption keeps its figures when asked.
export async function naturalChatLines(tx: OrgTx, conversationId: string, options?: { earlierWhole?: boolean });
export async function prepareNaturalTurn(deps: LiteDependencies, input: LiteTurnInput, now: Date,
  options?: { earlierWhole?: boolean }): Promise<NaturalPrepared | LiteOutcome>;
// context/chat-turns.ts: wordsOf, exported under a public name, natural's callers passing no option.
export function lineWords(line: NaturalChatLine, most: number, options?: { earlierWhole?: boolean }): string;
// live-io.ts: extracted from liveLoopIO, which now calls it.
export async function newerLineIn(db: Database, input: LiteTurnInput, lastInboundAt: Date): Promise<boolean>;
export function liveActionContext(db: Database, prepared: NaturalPrepared, input: LiteTurnInput,
  turn: { labels: ReadonlyMap<string, string>; newLines: readonly NaturalChatLine[] }, now: Date):
  Omit<ActionContext, "quotedThisTurn">;
// turn.ts
export function atLimit(turn: LiveTurn, reason: CodeHandOverReason, customerText: string): Promise<TurnDone>;
export const gateDone: (outcome: LiteOutcome) => TurnDone;
// turn-refused.ts: natural's refusedFallback now = trace.staged(act.staged) + actAndSettle(turn, refusedAct(…)).
export async function refusalNote(turn: LiveTurn, staged: StagedSet, refused: { refused: string; message: string }): Promise<string>;
export function refusedAct(turn: LiveTurn, staged: StagedSet, refused: { refused: string; message: string }, customerText: string): TurnAct;
// nudge-turn.ts
export async function nudgeGate(deps: NudgeDependencies, input: LiteTurnInput, prepared: NaturalPrepared, now: Date): Promise<number | LiteOutcome>;
export const nudgeNotice: (number: number, quietSince: string) => string;   // was noticeOf
// dry-turn.ts
export const EMPTY_DRY_LEAD: DryLead;
export function dryLeadView(lead: DryLead): NaturalLeadView;
export function dryActionContext(input: { db: Database; organizationId: string; agency: DryAgency; state: NaturalTestState;
  labels: ReadonlyMap<string, string>; newLines: readonly NaturalChatLine[]; lines: readonly NaturalChatLine[];
  now: Date; readContext: (tx: OrgTx) => ReadContext }): Omit<ActionContext, "quotedThisTurn">;
```

- [ ] **Step 1: Write the failing tests:** `it("keeps an earlier assistant's caption figures only when asked")`
  (a file captioned "Spiti ₹21,000 · 12 Dec" reads `sent: Spiti` by default and whole with `earlierWhole`),
  `it("writes an earlier line whole only when asked")` (`lineWords`), `it("builds the refused booking's act: the
  fallback line, the agency's actions kept, the task naming the booking")` (`refusedAct`).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/seams-reads.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** by extraction; the old code calls the extracted functions.
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS, old tests unchanged.
- [ ] **Step 5: Commit** `refactor(ai): natural's reads, refusal and follow-up gates open to a second agent`.

### Task 7: The one agent's prompt

**Files:**
- Modify: `packages/domain/src/ai/natural/prompt-source.ts` (generalise the Langfuse read; natural's functions call it)
- Create: `packages/domain/src/ai/one/prompt-text.ts`, `packages/domain/src/ai/one/prompt.ts`
- Test: `packages/domain/test/ai/one/prompt.test.ts`

**Interfaces:**
- Produces:

```ts
// natural/prompt-source.ts
export async function langfusePromptAt(prompts: AiPrompts | undefined, name: string, label: string,
  request?: PromptRequest): Promise<NaturalPrompt | null>;   // naturalPromptAt(p, label, r) = langfusePromptAt(p, NATURAL_PROMPT_NAME, label, r)
// one/prompt-text.ts: the fenced block of 2026-11-17-one-whatsapp-agent-prompt.md, verbatim, backticks escaped.
export const ONE_PROMPT_TEXT: string;
// one/prompt.ts
export const ONE_PROMPT_NAME = "whatsapp-agent/real-agent";
export const onePromptLabels = { live: "production", tryIt: "latest" } as const;
export const BUILT_IN_ONE_PROMPT: NaturalPrompt;   // { version: "built-in-one-2", text: ONE_PROMPT_TEXT }
export async function onePromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt>;        // production, else built-in
export async function oneTryItPrompt(prompts: AiPrompts | undefined): Promise<NaturalPrompt>;     // latest (fresh), else production, else built-in; both read at once
```

Rendering is natural's `renderNaturalPrompt(prompt, voice)` (same three placeholders); nothing new.

- [ ] **Step 1: Write the failing tests:** `it("holds the prompt file's v2 text exactly")` (reads the spec file, takes
  the block between ```` ```text ```` and ```` ``` ````, compares), `it("fills the agency, the agent and the tone, and
  leaves no placeholder")`, `it("runs live turns on Langfuse's production label, else the built-in text")`,
  `it("tries the latest version in Try it, read past the cache, else production, else the built-in text")`
  (`createMemoryPrompts` records `fresh: true` for `latest`), `it("asks Langfuse for both labels at once")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/prompt.test.ts test/ai/natural/prompt.test.ts`;
  expect FAIL in the first file only.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's prompt from Langfuse whatsapp-agent/real-agent`.

### Task 8: The one agent's context and history

**Files:**
- Create: `packages/domain/src/ai/one/history.ts`, `packages/domain/src/ai/one/context.ts`
- Test: `packages/domain/test/ai/one/context.test.ts`

**Interfaces:**
- Consumes: natural's `agencyBlock`, `tripsBlock` (agency-block.ts), `turnBlock`, `newLinesOf`, `stampOf`,
  `ChatClock`, Task 6's `lineWords`, `renderNaturalPrompt`, Task 3's `oneToolSchemas`.
- Produces:

```ts
// one/history.ts (ruling P6)
export const ONE_LINE_CUT = 4_000;
export const EARLIER_HEADING = "Earlier system (an older system; its prices, dates and promises may be wrong):";
export const SUMMARY_MARK = "[chat summary, not from the customer]";
/** The chat before the new lines as user and assistant messages; a summary, when given, first. */
export function oneHistory(lines: readonly NaturalChatLine[], clock: ChatClock, summary: string | null): AiMessage[];
// one/context.ts
export interface OneContextInput extends Omit<NaturalContextInput, "withTools"> {
  tools: "all" | "none" | "stay_quiet";
  /** Spec 9's summary; always null until the summary PR. */
  summary: string | null;
}
export interface OneContext {
  messages: AiMessage[];                         // system, history, turn block
  labels: ReadonlyMap<string, string>;
  newLines: NaturalChatLine[];
  tools: OneToolSchema[];                        // what the turn offers
}
export function buildOneContext(input: OneContextInput): OneContext;
```

History format: a customer line is a user message `[<stamp>] <words>`; ours is assistant `<words>`; the team's is
assistant `(Team, Amit) <words>`; an automatic line `[automatic] <words>`; consecutive earlier lines become one assistant
message starting with `EARLIER_HEADING` and one line each after it. Lines of one role in a row join with a newline, as
natural's do. Words come from `lineWords(line, ONE_LINE_CUT, { earlierWhole: true })`. The system message is
`renderNaturalPrompt(prompt, voice)`, the agency block and the trips block joined by a blank line, byte for byte as
natural builds it (the provider caches it).

- [ ] **Step 1: Write the failing tests:** `it("shows every line read, none dropped by age or budget")` (60 lines over
  30 days all present), `it("writes the earlier system's lines whole, figures and dates kept, under the heading")`
  (`₹21,000` and `12 Dec` present), `it("names the team member, and marks an automatic line")`, `it("cuts only a
  message past 4,000 characters")`, `it("puts a summary first, marked as the app's, and none when there is none")`,
  `it("ends with the turn block: the lead, the notice, then the new messages")`, `it("offers all tools, none, or
  stay_quiet alone, and no trip tools without trips")`, `it("keeps the system message the same while the data is")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/context.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): what the one agent reads: the chat whole, the earlier system marked`.

### Task 9: The one agent's tools

**Files:**
- Create: `packages/domain/src/ai/one/tools.ts`
- Test: `packages/domain/test/ai/one/tools.test.ts` (no database: a fake IO)

**Interfaces:**
- Consumes: Task 1's `AgentTool` (type only), Task 3's `OneToolSchema`, Task 5's `stageAction` (`{ agent: "one" }`),
  `withStaged`, `READ_FAILED`, `STAGE_FAILED`, `settled`, `NaturalTraceBuilder`.
- Produces:

```ts
export interface OneRun {
  staged: StagedSet;
  /** The actions the model staged: only these end a turn without words. */
  modelStaged: Set<StagedAction["tool"]>;
  quoted: QuoteFigures[];
}
export interface OneToolIO {
  read: LoopIO["read"];                                              // natural's read tools, each in its own forOrg
  stage: (name: NaturalToolName, args: Record<string, unknown>, words: string,
    quoted: readonly QuoteFigures[]) => Promise<StageOutcome>;      // stageAction with { agent: "one" }
}
export function startOneRun(forced: readonly StagedAction[]): OneRun;
/** The turn's tools as the port takes them: reads answer at once, actions stage into `run`. */
export function oneAgentTools(tools: readonly OneToolSchema[], io: OneToolIO, run: OneRun,
  trace: NaturalTraceBuilder): AgentTool[];
```

A read adds its quote figures to `run.quoted`; a failed read answers `READ_FAILED` and flags
`tool_failed:<name>:<error name>`. An action staged replaces an earlier one of the same tool, joins `modelStaged`, adds
an offer's or a booking's figures to `run.quoted`, and updates `trace.staged`; a failed check answers `STAGE_FAILED` and
flags the same way; a refusal changes nothing. A read tool never stages and an action never reads (natural's split,
`naturalReadTools`).

- [ ] **Step 1: Write the failing tests:** `it("answers a read and keeps its quote")`, `it("stages an action, a later
  call replacing the earlier")`, `it("answers a refusal and stages nothing")`, `it("answers a failed read or check with
  the way on, and flags it by its name")`, `it("keeps an offer's and a booking's figures as this turn's")`, `it("starts
  with code's forced actions staged, none of them the model's")`, `it("passes the answer's words to the stage")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/tools.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's tools as plain functions that stage`.

### Task 10: The one loop on the tool agent

**Files:**
- Create: `packages/domain/src/ai/one/loop.ts`, `packages/domain/src/ai/one/ends.ts`
- Test: `packages/domain/test/ai/one/loop.test.ts` (`createMemoryToolAgent`, `createMemoryAiModel`, a fake IO and clock)

**Interfaces:**
- Consumes: Tasks 1–2 (port, memory adapter), 8 (`OneContext`), 9 (`oneAgentTools`, `OneRun`, `OneToolIO`), 5
  (`mayEndSilent`, `NEEDS_WORDS`, `notDone`, `fallbackTask` with `"steps"`, `startNaturalTrace(…, "one")`), natural's
  `LoopEnd`, `replyWords`, `splitMessages`, `appCheck`, `NO_WORDS`, `HAND_OVER_WORDS`, `without`, `CUSTOMER_FACING`,
  `fallbackLine`, `answeredCall`, `failedCall`, `NATURAL_LIMITS`.
- Produces:

```ts
export interface OneLoopIO extends OneToolIO {
  agent: ToolAgent;
  call: LoopIO["call"];                // countedModel
  newerLine: () => Promise<boolean>;
  clock: () => number;                 // epoch ms, for each call's time in the trace
}
export interface OneSettings {
  organizationId: string;
  model?: string;                      // Try it's choice
  temperature?: number;
  forced: readonly StagedAction[];
}
/** One turn of the one agent, ending as natural's loop does so the act and the dry answer take it as they are. */
export async function runOneLoop(context: OneContext, io: OneLoopIO, settings: OneSettings,
  trace: NaturalTraceBuilder): Promise<LoopEnd>;
```

The algorithm (`ends.ts` holds `oneFinal` and `oneFallback`):

```text
run = startOneRun(settings.forced); nudged = false
end = agent.run({ messages: context.messages, tools: oneAgentTools(...), request: base, call: traced(io.call),
                  superseded: io.newerLine, onTool: entry => trace.tool({ ...entry, refused: startsWith "refused:" }) })
loop:
  superseded   → { end: "superseded" }
  model_failed → { end: "model_failed", reason }
  steps        → oneFallback("steps")
  answered     → words = replyWords(end.text) || wordsBesideActions(end.transcript)      // ruling P8
                 if words == "" and not mayEndSilent(run):        // a hold, a resend or a hand-over owes words
                   if nudged → oneFallback("model")
                   nudged = true; end = agent.run({ ...same, messages: [...end.transcript,
                     appCheck(hand_over staged and not abuse ? HAND_OVER_WORDS : NO_WORDS)] }); continue
                 → oneFinal(words, end)
oneFinal: words beside stay_quiet drop it (flag "quiet_with_words"); { end: "final", messages: splitMessages(words),
          staged, quoted, transcript, callsUsed, model }
oneFallback(reason): staged minus CUSTOMER_FACING; each dropped action's notDone; { end: "fallback", reason,
          messages: [fallbackLine(new lines' text)], staged, task: fallbackTask(...), draft: null }
base request: { feature: "sales_agent", maxTokens: 8_000, reasoning: { effort: "low" }, timeoutMs: 60_000,
                user: organizationId, model?, temperature? }
wordsBesideActions: the newest assistant message after the last user message whose words aren't empty and whose
                tool calls are all actions (none of naturalReadTools)
```

`traced(io.call)` records `trace.call(answeredCall | failedCall)` with the clock's milliseconds; a "limit" records
nothing. `callsUsed` sums every run's `calls`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("replies after a read, with the staged actions, the quotes, the model and the transcript");
it("asks every call for sales_agent, 8,000 tokens, low effort, 60 s, the organization, and Try it's model");
it("asks once more when the reply has no words, then falls back", async () => {
  expect(ai.requests[1]?.messages.at(-1)?.content).toBe(`[app check, not from the customer] ${NO_WORDS}`);
  expect(end).toMatchObject({ end: "fallback", reason: "model" });
});
it("asks a hand-over with no words for its line, and lets one for abuse end silent");
it("sends the words written beside a brochure call when the last answer has none");   // Review Focus 4
it("never holds seats or resends payment without words");
it("sends words beside stay_quiet and drops it");
it("falls back after too many steps: the line in their language, the agency's actions kept, the task naming the rest");
it("passes a model failure and the month's limit through, and ends superseded when they wrote again"); // Review Focus 2
it("keeps code's forced actions, which never end a turn without words");
it("traces each call, each tool with its refusals, the staged actions, and the one agent's name");
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/loop.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's turn on the tool agent, ending as natural's does`.

### Task 11: The one live turn and its follow-up

**Files:**
- Create: `packages/domain/src/ai/one/live-io.ts`, `one/turn.ts`, `one/turn-refused.ts`, `one/nudge.ts`
- Test: `packages/domain/test/ai/one/turn.test.ts`, `packages/domain/test/ai/one/nudge.test.ts` (real database,
  `test/ai/natural/support/live-agency.ts`)

**Interfaces:**
- Consumes: Task 6 (`prepareNaturalTurn(…, { earlierWhole: true })`, `liveActionContext`, `newerLineIn`, `atLimit`,
  `gateDone`, `refusalNote`, `refusedAct`, `nudgeGate`, `nudgeNotice`), Task 5 (`naturalTurnStart`, `logNaturalTurn`
  with `"one"`), Task 7 (`onePromptOf`), Tasks 8–10, natural's `beforeTheModel`, `countedModel`, `quoteFor`,
  `runReadTool`, `actOnTurn`, `actOfEnd`, `actAndSettle`, `doneOf`, `endedOf`, `naturalTurnNote`, `MONEY_ACTIONS`.
- Produces:

```ts
export interface OneTurnDependencies extends LiteDependencies {
  prompts?: AiPrompts;
  toolAgent: ToolAgent;
}
// one/live-io.ts
export function oneLiveIO(deps: Pick<OneTurnDependencies, "db" | "ai" | "toolAgent">, prepared: NaturalPrepared,
  input: LiteTurnInput, context: OneContext, now: Date, clock: () => number): OneLoopIO;
// one/turn.ts: a reply; a nudge goes to runOneNudge.
export async function runOneTurn(deps: OneTurnDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome>;
// one/turn-refused.ts: the act refused the booking: one more run on the transcript and refusalNote, the money left out
// of the forced actions; refused again, or no answer, → actAndSettle(refusedAct(...)). No call cap, no time cap (R7).
export async function afterOneRefusal(turn: LiveTurn, loop: { context: OneContext; io: OneLoopIO;
  settings: OneSettings; trace: NaturalTraceBuilder }, end: Extract<LoopEnd, { end: "final" }>,
  refused: { refused: string; message: string }, customerText: string): Promise<TurnDone>;
// one/nudge.ts
export async function runOneNudge(deps: OneTurnDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome>;
```

`runOneTurn` follows natural's `runNaturalTurn` step for step: prompt and prepare at once; one Langfuse turn
(`naturalTurnStart(input, prompt, leadId, "one")`, so `whatsapp-agent.one.reply`, linked to the prompt it ran); the day's
cap or a full month → `atLimit`; `beforeTheModel` (tools `"none"` and the forced hand-over for a payment screenshot);
`buildOneContext({ …, summary: null })`; `runOneLoop`; then `superseded` → ended, `model_failed` → `atLimit("month_limit")`
for "limit" else ended `model_failed` (the worker retries), `fallback` → `actAndSettle(actOfEnd(end))`, `final` →
`actOnTurn`, a refusal → `afterOneRefusal`. `runOneNudge` follows `runNaturalNudge` with `tools: "stay_quiet"` and
`nudgeNotice`. Both note the turn (`naturalTurnNote`) and log one line (`logNaturalTurn(…, "one")`).

- [ ] **Step 1: Write the failing tests** (`turn.test.ts`):

```ts
it("answers on Langfuse's production prompt, one trace named whatsapp-agent.one.reply and linked to it");
it("runs a whole turn on the LangGraph adapter: an offer, then a typed yes holds the seats and sends the payment " +
   "message and QR after the words, under the lead's name");        // createLangGraphToolAgent, no full name asked
it("shows the model the earlier system's lines whole");               // a request's messages contain "₹21,000"
it("hands over at the day's cap and a full month with the fallback line, and calls no model");
it("answers a payment screenshot with one call and no tools, and hands it to the team");
it("tries once more when the act can't hold the seats, keeping the reasoning details, then falls back", async () => {
  const again = ai.requests.at(-1);
  expect(again?.messages.at(-1)?.content).toContain("The seats couldn't be held");
  expect(again?.messages.filter((m) => m.role === "assistant").every((m) => m.reasoningDetails !== undefined)).toBe(true);
}); // Review Focus 1
it("sends nothing when the customer wrote again during the turn");     // Review Focus 2
it("sends nothing when the model fails, for the worker to try again");
it("falls back with a task when the steps run out");
it("hands a b2b enquiry to the team with its sentence");
```

  `nudge.test.ts`: `it("follows up with stay_quiet as its only tool, at most twice, never at night")`, `it("sends
  nothing when the model fails or falls back")`, `it("traces it as whatsapp-agent.one.follow-up")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/turn.test.ts test/ai/one/nudge.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's live turn and follow-up`.

### Task 12: The turn row in ai_turn_trace

**Files:**
- Modify: `packages/domain/src/ai/traces/trace-sink.ts`, `packages/domain/src/ai/one/turn.ts`,
  `packages/domain/src/ai/one/nudge.ts` (one call each, after the note)
- Create: `packages/domain/src/ai/one/turn-row.ts`
- Test: `packages/domain/test/ai/traces/trace-sink.test.ts` (new cases), `packages/domain/test/ai/one/turn-row.test.ts`

**Interfaces:**
- Consumes: Task 4's migration (`agent = 'one'` allowed), Task 11's turns.
- Produces:

```ts
// traces/trace-sink.ts
export interface ToolTurnTrace {
  id: string; organizationId: string; conversationId: string; leadId: string | null;
  kind: "reply" | "nudge"; startedAt: Date; durationMs: number;
  outcome: string; reason: string | null; model: string | null;
  inputTokens: number; outputTokens: number; cachedTokens: number;
  failedChecks: number;                         // tool results that began "refused:"
  promptVersions: Record<string, number>;       // { "real-agent": <Langfuse version, 0 for the built-in text> }
  trace: NaturalTrace; messages: string[];
}
export interface ToolTurnSink { recordToolTurn(trace: ToolTurnTrace): Promise<void> }
export function createTraceSink(deps: …): TraceSink & ToolTurnSink;
// The row (agent 'one', move and sale stage null) first, then the file
// { version: 2, agent: "one", trace, messages } gzip JSON at traceKey(...); the same 5-second limit, and a failure
// is one warn line, never the turn's.
// one/turn-row.ts
export function toolTurnRowOf(input: LiteTurnInput, done: TurnDone, trace: NaturalTrace, prompt: NaturalPrompt,
  startedAt: Date): ToolTurnTrace;
```

`OneTurnDependencies` gains `toolTurns?: ToolTurnSink`; a turn its gates ended before anything was read writes no row.

- [ ] **Step 1: Write the failing tests:** `it("keeps a one turn's row and file, its agent one and its refusals
  counted")`, `it("loses a one turn's trace with a warning and never fails the turn")`, `it("writes one row for each
  turn that prepared, none for a gate's")`, `it("names the Langfuse version it ran, 0 for the built-in text")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/traces/trace-sink.test.ts test/ai/one/turn-row.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `test/ai/one`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): each one agent turn kept as a turn row`.

### Task 13: Dispatch and wiring

**Files:**
- Modify: `packages/domain/src/ai/agent.ts`, `packages/domain/src/ai/agent-worker.ts`, `apps/api/src/worker-jobs.ts`
- Test: `packages/domain/test/ai/agent-routing.test.ts`, `packages/domain/test/ai/agent-worker-retries.test.ts`,
  `apps/api/test/worker-traces.test.ts` (it checks `autopilotDependencies`)

**Interfaces:**
- Consumes: Task 4's `agentOf`, Tasks 11–12, Task 2's `createLangGraphToolAgent`.
- Produces: `AgentDependencies` gains `toolAgent?: ToolAgent` and `toolTurns?: ToolTurnSink`. `agentChecked` returns
  `"one"` too. `runAgentTurn`: `one` → `runOneTurn` (a nudge goes to `runOneNudge` inside it); with no `toolAgent`,
  outcome `"not_configured"`. `runAgentFallback`: `one` → `runNaturalFallback` (no model call; the same act). The worker
  retries `model_failed` after 1 and 5 minutes for `natural` and `one` (`retriesModelFailures(agent)`), never lite.
  `autopilotDependencies` builds one sink and passes it as `traces` and `toolTurns`, and `toolAgent:
  createLangGraphToolAgent()`. `AT_ONCE` stays PR 0's 5.

- [ ] **Step 1: Write the failing tests:** `it("routes an agency on one to the one turn, and its follow-ups")`,
  `it("answers not_configured for one on a server with no tool agent")`, `it("sends one's last try as the fallback line
  and a task, with no model call")`, `it("retries one's failed model after 1 and 5 minutes")`, `it("gives the agent's
  turns the LangGraph tool agent and the turn rows")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/agent-routing.test.ts
  test/ai/agent-worker-retries.test.ts` and `pnpm --filter @travel-crm/api-server test -- test/worker-traces.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `pnpm --filter @travel-crm/api-server build` and its `test/bundle.test.ts`
  (LangGraph is the integrations package's own, installed in the image as it is); expect PASS.
- [ ] **Step 5: Commit** `feat(ai): agencies on the one agent get its turns`.

### Task 14: Try it on the one agent

**Files:**
- Create: `packages/domain/src/ai/one/dry-turn.ts`, `one/try-it.ts`, `one/index.ts`
- Modify: `packages/domain/src/ai/index.ts` (`export * from "./one/index.js"`), `packages/api/src/context.ts`
  (`toolAgent?: ToolAgent`), `packages/api/src/routers/ai.ts` (`testOne`, after `testNatural`; imports added beside the
  natural ones), `apps/api/src/app.ts` (`toolAgent: createLangGraphToolAgent()` into the context),
  `apps/web/src/ai/{test-choices,test-section,use-ai}.ts(x)`, `apps/web/src/i18n/messages/en-IN/ai.json`
  (`ai.test.choices.agents.one`: "One agent (LangGraph)")
- Test: `packages/domain/test/ai/one/try-it.test.ts`, `packages/api/test/ai-try-it-one-router.test.ts`,
  `apps/web/test/ai/test-section-one.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`EMPTY_DRY_LEAD`, `dryLeadView`, `dryActionContext`), Task 7 (`oneTryItPrompt`), Tasks 8–10,
  Task 3 (`oneTestInput`), natural's `dryAgency`, `dryAnswerOf`, `naturalTryItNote`, `beforeTheModel`.
- Produces:

```ts
// one/dry-turn.ts: natural's dry turn with the one loop; reads and checks on the data, nothing done; no newer line.
export async function oneDryTurn(deps: NaturalDryDependencies & { toolAgent: ToolAgent }, organizationId: string,
  turn: NaturalDryTurn): Promise<NaturalTestAnswer>;
// one/try-it.ts: one traced turn "whatsapp-agent.one.try-it", tags ["whatsapp-agent", "one", "try-it"],
// metadata.agent "one", session `try-it:<chatId>`; the note is naturalTryItNote's.
export function oneTryItTurn(deps: NaturalDryDependencies & { toolAgent: ToolAgent; tracing?: AiTracing },
  access: MemberAccess, chat: NaturalTestChat & { chatId?: string }, now: Date): Promise<NaturalTestAnswer>;
// one/index.ts exports oneTryItTurn, oneTryItPrompt, ONE_PROMPT_NAME.
// routers/ai.ts
testOne: freshProcedure.requires("ai:manage").input(oneTestInput).output(naturalTestAnswer)
// AI_NOT_READY when !ctx.ai?.configured or ctx.toolAgent is undefined; prompt: await oneTryItPrompt(ctx.prompts).
```

Web: `testAgents = ["current", "natural", "one"]`; the prompt choice shows for `natural` alone; a `one` turn calls
`useTestOne()` (`trpc.ai.testOne`) with the natural state and the chat's id, and its answer is shown as a natural entry
with prompt `"live"` (`TestNaturalTurn` as it is). Choosing another agent empties the chat, as now.

- [ ] **Step 1: Write the failing tests:** domain `it("answers a test chat on the one agent with nothing sent, held or
  kept")`, `it("describes a b2b hand-over and a hold with no name")`, `it("traces it as the one agent's Try it, on the
  latest prompt")`; api `it("answers AI_NOT_READY without a model or a tool agent")`, `it("refuses a prompt choice")`,
  `it("answers what the customer would get")`; web `it("sends the one agent's turns to ai.testOne without a prompt
  choice, and shows its answer")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/try-it.test.ts`,
  `pnpm --filter @travel-crm/api test -- test/ai-try-it-one-router.test.ts`,
  `pnpm --filter @travel-crm/web test -- test/ai/test-section-one.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `pnpm check` (format, typecheck, lint, tests, imports); expect PASS.
- [ ] **Step 5: Commit** `feat(ai): Try it on the one agent`.

---

## Before the pull request

- [ ] `git fetch origin`, merge `origin/main`, run `pnpm check` and `pnpm migrations:check` (R10, R11).
- [ ] The PR body names: the versions pinned, the migration (only widens), the overlaps with `origin/ayush` (imports
  beside theirs in `packages/api/src/routers/ai.ts`, `packages/contracts/src/ai/index.ts` and
  `packages/domain/src/ai/index.ts`; none of their natural files edited), and the owner's step 0 (Task 2's live test
  with `OPENROUTER_API_KEY`).
