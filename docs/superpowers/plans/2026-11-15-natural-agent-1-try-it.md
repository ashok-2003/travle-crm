# Natural agent, plan 1: the new agent in Try it — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner chats with the new natural WhatsApp agent in Try it, on an agency's real data, with nothing sent:
the model writes every reply and calls tools natively, code guards only what the spec's guards list says, and "Why"
shows each model call, each tool call with its arguments and result, each guard verdict and the prompt version.

**Architecture:** Native tool calling goes into the `AiModel` port and the OpenRouter adapter (no framework, no AI SDK).
A new module `packages/domain/src/ai/natural/` builds the context (cached prefix, chat as real turns, turn block), runs
the loop (4 calls, 30 s, guards, one retry, failure path) against a small IO interface, and stages actions after
checking their preconditions against the data. Plan 1 runs that loop only as a dry turn: Try it's new
`ai.testNatural` procedure and the bench both call it; Plan 2 adds the live act. Lite is untouched in behaviour.

**Tech Stack:** TypeScript (strict), Zod 4 contracts, Prisma 7.10 under row-level security, tRPC, Next.js with
next-intl and shadcn (radix-nova), Vitest, OpenRouter's OpenAI-compatible chat completions.

**Spec:** `docs/superpowers/specs/2026-11-14-natural-whatsapp-agent-design.md` (binding, with Appendix A), as widened by
the owner's word of 2026-11-15 (quoted in the Rulings). Read both before any task.

## Global Constraints

- Every shell command starts `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (Node 24). Never read or source `.env`.
- No agent framework and no Vercel AI SDK; the domain never imports a vendor SDK or URL (ADR 0008, 0029).
- Strict TypeScript: no `any`, no `!`. Each source file starts with a one-line comment saying what it is for.
- Lite keeps its behaviour: a lite file changes only by an export, a widened parameter type, or a new parameter whose
  default is lite's behaviour (spec 8). Lite's tests stay green unchanged.
- The model decides what to say and which tools to call. No intent list, no move table, no reply template. The one
  fixed customer text is the fallback line (3.6). Payment details go as the agency's data lines, never as a sentence.
- Every live-agent request: feature `sales_agent`, `maxTokens: 8000`, `reasoning: { effort: "low" }`,
  `toolChoice: "auto"`, `parallelToolCalls: true`, and **no** `temperature`, `top_p` or `top_k` (a test fails if one
  is sent). Only Try it's own choice ("flash", 0.4) adds a model or temperature.
- Provider routing stays `{ zdr: true, require_parameters: true }` on OpenRouter.
- Caps: 4 calls a turn; 30 s from the turn's start to the end of the loop; 15 s per try at most; no call starts with
  less than 3 s left; another model only while 10 s remain; at most 2 WhatsApp messages; one reply, one brochure set
  and one booking per turn.
- Money is integer paise; shown as ₹ with lakh grouping through `formatRupees`. Dates on screen and in context carry
  the weekday through `formatShortDay` ("Sat 13 Dec").
- Inputs are `z.strictObject`; outputs `z.object`. Every word on screen is a next-intl message (`ai.json`).
- Web: registry components only, no `border`/`ring`/`shadow`/`divide-` classes outside `components/ui`, tokens only.
- Each model call reserves one call of the month's limit through lite's `countedCall` (`lite/counted-call.ts`).
- Commits: Conventional (`feat(ai): …`), header ≤ 100 characters, files staged by name, never `--no-verify`, no
  `Co-Authored-By`. Tests first: write the failing test, watch it fail, then make it pass.

## Review Focus

1. **Devanagari digits in a reply** ("₹९,४९९"): G1 must read them as digits, or an invented amount passes. Test in
   Task 9.
2. **A tool call the schema didn't allow** (an invented `T9`, broken JSON, an unknown tool name): it must come back as
   a refusal sentence the model can act on, never a thrown error or a silent drop. Test in Task 10.
3. **An agency with no sellable trip** (Try it doesn't need a finished setup): no tool that names a trip is offered,
   and the model is not handed an empty enum. Test in Task 6.
4. **Words together with `stay_quiet`**: the customer must get the words, not silence (no-silence principle). Test in
   Task 10.
5. **"Today" near midnight**: at 11:43 pm in Kolkata it is still the agency's day; a date "not past" and "this evening"
   are read in the agency's zone, never UTC. Test in Task 8.

## Rulings

Owner, 2026-11-15, overriding any narrower reading of the spec: "If it is just going to be controlled by the code and
giving template answers, what is the point of being an agent? Make it the right way. The agent should be open-ended but
still have context of what it is doing, and what it should answer: the answers should come from their (the agency's)
data." Each ruling is `what — why — cost if wrong`.

1. **`book` without booking words.** `book` runs when its terms equal the live offer's (made in the last turn that ran,
   with no outbound line since), or equal a total told for exactly these terms in the last 24 hours (`facts.told`); in
   both cases `customer_words` appear (normalised) in a new customer line after that offer or total, and `full_name`
   appears in a customer line or is the lead's or WhatsApp profile name. `hasAWishCue` is not used: the model judges
   the yes. — The owner asked for the model's judgement plus a verifiable precondition in place of keyword lists. — A
   hold and payment details sent to someone who wasn't booking; bounded by the 48-hour hold and by bench cases 9, 10
   and "theek hai" after a total, at pass^3.
2. **One fixed text.** The fallback line (3.6) is the only fixed customer text. The booking's message, "payment again",
   the screenshot thanks, the voice-note line and every forced hand-over line are the model's words, checked by the
   guards; after a hold or `resend_payment` code sends the agency's payment lines (`paymentLinesOf`) and the QR as
   data, with no heading or sentence around them. At the month's limit or the day cap (no call left) the fallback
   line goes with the hand-over. — Owner's word. — A badly worded payment message; G1, G3 and G5 bound what it can say.
3. **G3 verifies.** `claimIn` (exported from `lite/reply-check.ts`) finds a payment-received or booking-confirmed
   claim; it passes only when the data shows it true (a payment the team recorded on the chat's AI booking, or that
   booking confirmed). Second failure: the fallback line and a task holding the draft (no fixed thank-you line). —
   Guards verify against data. — A true "confirmed" sentence refused; none exist in Try it, where nothing is confirmed.
4. **G4 verifies.** A past-tense team credit (`teamClaimPhrases` through `claimIn`) passes only when a Team line of the
   last 30 days exists and every amount or percent in that sentence appears in Team text; a discount sentence (a
   percent or amount beside a discount word) passes only when the figure appears in owner or Team text. Second
   failure: the fallback line and `hand_over(discount)`. — As 3. — A real team discount re-said in other words refused
   once; the retry tells the model to quote the team's figure.
5. **G5 stays a refusal of any typed payment detail.** — The customer's details must be the agency's byte for byte,
   which only code's own message guarantees; a typed handle can't be verified safe (one typo pays a stranger). — None.
6. **Payment media and untranscribed voice notes** get one call with no tools: the turn block says what the app did
   ("their screenshot went to the team to check; this chat goes to the team after your reply"), the model writes the
   line, and code stages `hand_over(payment_check)` itself for the screenshot. — Spec 3.1 kept the action, owner's
   word removes the template. — None beyond ruling 2.
7. **Try it's agent choice** is a separate procedure, `ai.testNatural`, with its own contracts; `ai.test` and lite's
   Try it code stay as they are. Changing the agent empties the chat (one agent's state means nothing to the other).
8. **Trip labels.** Each turn labels the sellable trips `T1…Tn` in their saved order; tool schemas enumerate the
   labels; facts, offers and state keep package ids. — Short ids the model can't invent. — None.
9. **Token estimate** for budgets and the inline/indexed choice is characters ÷ 4, rounded up. — Cheap and stable; the
   trace's real `inputTokens` checks it. — Indexing a little early or late.
10. **No difficulty field and no structured children rule exist** on a package. Trip text shows what the owner wrote;
    `quote` checks no age rule; the model reads the agency's children answer (bench cases 13 and 20).
11. **Words with `stay_quiet`:** the words go out and `stay_quiet` is dropped, with the trace flag `quiet_with_words`.
    — Silence is the costlier mistake (principle 5). — A stray "Great!" after an "ok"; the bench counts it.
12. **Model pinning.** Calls after the first name the model that answered the first, so a turn never changes model
    mid-way. A failed pinned call, a `bad_request` (thought signature) or `finish_reason: length` starts the turn over
    once, unpinned, without the earlier assistant and tool messages and with nothing staged, when 10 s remain; `length`
    also lowers effort to `minimal`. Otherwise the turn ends `model_failed`.
13. **Follow-ups past the 24-hour window** are refused: "refused: past the WhatsApp window (it ends <time>); for a
    later check-back, create_task(kind: call_back, call_at: …)". — G7 places follow-ups only inside the window. — None.
14. **Guard feedback** goes as a user message that starts `[app check, not from the customer]`, after the refused
    draft as an assistant message. Tool refusals are the tool's result: `refused: <why>; <what to do instead>`.
15. **Port changes stay optional.** `AiResult`'s new fields are optional (existing fakes stay valid; the OpenRouter
    adapter always sets them). A 400 answers `bad_request` only for a request with `tools` (others keep
    `unavailable`). `withBackupModel` treats `bad_request` as final.
16. **Empty agent name** (Try it, setup unfinished) renders `{agent_name}` as "the {agency_name} team". Live turns
    always have a name (setup gate).
17. **A total counts as told** when the final words contain an amount equal to a `quote` or `offer_booking` total of
    this turn; that quote's terms go into `facts.told`.
18. **Fallback line language:** Devanagari in the customer's new lines → Hindi; else a Hinglish word from a short list
    in `fallback-line.ts` → Hinglish; else English. — The one fixed text needs a language without a model. — An
    English customer getting the Hinglish line.
19. **The bench runs the dry turn** in this plan (no act). Its wait is the turn's duration plus 4.5 s (3 s settle,
    1.5 s prepare and act, estimated until Plan 2's traces measure them).
20. **The bench's judge** is `AGENT_BENCH_JUDGE_MODEL` (an OpenRouter slug, bench settings only). Unset, quality is
    "not scored" and the gate reports FAIL.
21. **No sellable trip:** no tool that names a trip is offered (`quote`, `get_trip`, `find_trips`, `send_brochure`,
    `offer_booking`, `book`; `update_lead` without `trip_id`).
22. **Two messages:** a blank line splits the words; the first paragraph is message one and the rest, blank lines
    kept, message two.
23. **The prompt seam.** `naturalPromptOf(db)` returns the built-in prompt and `draftNaturalPrompt(db, id)` returns
    null in this plan; Plan 3 fills both bodies, so no other file changes for the editor.

## Parallel work after this plan

Plans 2 and 3 start from this plan's merge. Plan 2 adds callers of the loop and never changes `natural/loop.ts`
(its final end hands back the transcript and the calls used, so the act's refusal can take one more call). Plan 3
fills the bodies in `natural/prompt-source.ts` (making the draft's id optional), moves the placeholder list from
`natural/prompt.ts` to contracts, and adds a prompt choice to `natural-try-it.ts`, the router and the Try it screen. Shared index files (`ai/index.ts`, `natural/index.ts`, `contracts/src/ai/index.ts`) take
append-only export lines.

---

## File map

Integrations: `packages/integrations/src/ai/{ai-model,openrouter,memory-ai,fallback}.ts`.
Settings: `apps/api/src/{ai-services,environment,service-variables,console-agent-bench-start}.ts`,
`docs/deploy-checklist.md`.
Contracts (`packages/contracts/src/ai/`): `natural.ts` (facts, terms, reasons), `natural-tools.ts` (argument schemas,
definitions, parsing), `natural-trace.ts`, `natural-try-it.ts`, `natural-cases.ts`, `index.ts`.
Domain (`packages/domain/src/ai/natural/`):

| File | Responsibility |
|---|---|
| `types.ts` | Shared declarations: chat line, lead view, trip sheet, terms, figures, staged actions |
| `prompt-text.ts`, `prompt.ts`, `prompt-source.ts` | Appendix A, its rendering, the seam Plan 3 fills |
| `trips/trip-sheets.ts`, `trips/trip-text.ts` | Reading trips in full; the full text and the index line |
| `context/tokens.ts`, `context/agency-block.ts`, `context/chat-turns.ts`, `context/turn-block.ts`, `context/build.ts` | The context of 4.1–4.4 and its budgets |
| `tools/find-trips.ts`, `tools/read-tools.ts` | `find_trips`, `get_trip`, `quote` |
| `tools/terms.ts`, `tools/action-tools.ts`, `tools/booking-checks.ts`, `tools/follow-up-time.ts` | Action preconditions and staging |
| `guards/grounded.ts`, `guards/claims.ts`, `guards/check-words.ts`, `fallback-line.ts` | G1–G5 and the fallback line |
| `loop.ts`, `counted-model.ts`, `trace.ts` | The loop, counted calls, the trace builder |
| `dry-agency.ts`, `dry-turn.ts`, `dry-answer.ts`, `dry-run.ts` | The dry turn, its answer and Try it's entry |
| `index.ts` | The module's public API |

Lite (export or widening only): `lite/reply-check.ts` (export `claimIn`), `lite/lookups/find-packages.ts` (options),
`lite/lookups/package-reads.ts` (`priceOf`'s facts type), `lite/follow-ups.ts` (export `intoWakingHours`,
`windowEndOf`).
Bench: `packages/domain/src/ai/bench/{natural-seed,natural-script,natural-replay,natural-checks,natural-judge}.ts`;
`apps/api/src/{console-agent-bench,agent-bench-report}.ts`.
API: `packages/api/src/routers/ai.ts`. Web: `apps/web/src/ai/{test-section,test-choices,use-ai}.tsx|ts`, new
`test-natural-turn.tsx`, `test-natural-why.tsx`, `apps/web/src/i18n/messages/en-IN/ai.json`.

Tasks 1–13 give Try it; 14–15 add the bench. The lead may open the pull request after Task 13 and land the bench on
the same branch.

---

### Task 1: Native tool calling in the port and the OpenRouter adapter

**Files:**
- Modify: `packages/integrations/src/ai/ai-model.ts`, `openrouter.ts`, `memory-ai.ts`, `fallback.ts`, `index.ts`
- Test: `packages/integrations/test/ai/openrouter-tools.test.ts` (new), `packages/integrations/test/ai/fallback.test.ts`

**Interfaces:**
- Produces (exported from `@travel-crm/integrations/ai`):

```ts
export const aiFeatures = [...existing, "sales_agent"] as const;
export interface AiTool { name: string; description: string; parameters: Record<string, unknown> }
export interface AiToolCall { id: string; name: string; arguments: string } // arguments: the raw JSON text sent
export type AiFinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "other";
export type AiEffort = "minimal" | "low" | "medium";
// AiMessage: role adds "tool"; new optional fields toolCalls (assistant), toolCallId (tool),
// reasoningDetails?: unknown (assistant; opaque, sent back unchanged)
// AiRequest: tools?, toolChoice?: "auto" | "none", parallelToolCalls?, reasoning?: { effort: AiEffort },
// timeoutMs? (this request's per-try limit), deadlineAt? (epoch ms the whole call must end by)
// AiResult ok: toolCalls?, finishReason?, cachedTokens?, reasoningTokens?, ms?, reasoningDetails?
// AiResult failure reason adds "bad_request"
export interface MemoryAnswer { text?: string; toolCalls?: { name: string; arguments: object }[];
  finishReason?: AiFinishReason; reasoningDetails?: unknown; model?: string }
// MemoryAiModel.answer(...answers: (string | MemoryAnswer | failure)[]); scripted tool calls get ids "call_1", "call_2"…
```

- [ ] **Step 1: Write the failing tests** in `openrouter-tools.test.ts`, with a fake `fetch` that records bodies:

```ts
it("sends tools as functions, tool_choice auto and parallel tool calls", async () => {
  // request with tools: [quoteTool], toolChoice: "auto", parallelToolCalls: true
  expect(body.tools).toEqual([{ type: "function", function: { name: "quote", description: "…", parameters: schema } }]);
  expect(body.tool_choice).toBe("auto");
  expect(body.parallel_tool_calls).toBe(true);
});
it("sends reasoning effort, and no sampling setting it wasn't given", async () => {
  expect(body.reasoning).toEqual({ effort: "low" });
  for (const key of ["temperature", "top_p", "top_k"]) expect(key in body).toBe(false);
});
it("takes an answer with tool calls and no words as an answer, asking no other model", async () => {
  // response: content null, tool_calls [{ id: "c1", type: "function", function: { name: "quote", arguments: "{\"trip_id\":\"T1\"}" } }],
  // reasoning_details [{ type: "reasoning.encrypted", data: "x" }], finish_reason "tool_calls"
  expect(result).toMatchObject({ ok: true, text: "", finishReason: "tool_calls",
    toolCalls: [{ id: "c1", name: "quote", arguments: "{\"trip_id\":\"T1\"}" }],
    reasoningDetails: [{ type: "reasoning.encrypted", data: "x" }] });
  expect(fetched).toHaveLength(1);
});
it("sends an assistant's tool calls and reasoning back unchanged, and each tool result by its call's id", async () => {
  expect(body.messages[1]).toEqual({ role: "assistant", content: "", tool_calls: [...], reasoning_details: [...] });
  expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "refused: …" });
});
it("reads cached and reasoning tokens and times the try", async () => {
  // usage.prompt_tokens_details.cached_tokens 6000, usage.completion_tokens_details.reasoning_tokens 300
  expect(result).toMatchObject({ cachedTokens: 6000, reasoningTokens: 300 });
  expect(result.ms).toBeGreaterThanOrEqual(0);
});
it("answers a 400 on a request with tools as bad_request, without the next model", …); // 1 fetch
it("still answers a 400 on a request without tools as unavailable", …);
it("returns finish_reason length as an answer marked length", …);
it("tries the next model only while 10 seconds remain before the deadline", …);
// first model 503: deadlineAt = now + 9_000 → { ok: false, reason: "unavailable" }, 1 fetch; now + 20_000 → 2 fetches
it("gives a try up at the request's own timeout, never past the deadline", …);
// timeoutMs 50, fetch resolves only on abort → the try is abandoned within 50 ms + slack
it("the memory model scripts tool calls with ids and keeps every request", …);
```

In `fallback.test.ts`: `it("a bad_request is final: the backup isn't asked")`.

- [ ] **Step 2: Run them and see them fail**

Run: `source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations test -- test/ai/openrouter-tools.test.ts test/ai/fallback.test.ts`
Expected: FAIL (no `tools` in the body; `bad_request` unknown).

- [ ] **Step 3: Implement.** In `wireMessage`, an assistant message with `toolCalls` becomes `tool_calls`
  (`{ id, type: "function", function: { name, arguments } }`) plus `reasoning_details` when set; a tool message becomes
  `{ role: "tool", tool_call_id, content }`. The body adds `tools`, `tool_choice`, `parallel_tool_calls` and
  `reasoning` only when set. Per try: `timeout = min(request.timeoutMs ?? options.timeoutMs ?? 30_000, deadlineAt - now)`;
  before any model after the first, stop when `deadlineAt - now < 10_000`. An answer is empty only when it has neither
  words nor tool calls. Read `usage.prompt_tokens_details.cached_tokens`,
  `usage.completion_tokens_details.reasoning_tokens`, `message.reasoning_details` and `finish_reason` (anything but the
  four named reasons maps to `"other"`). `withBackupModel` returns `bad_request` as it returns `refused`.

- [ ] **Step 4: Run the package's tests**

Run: `source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/integrations test`
Expected: PASS, the earlier adapter tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/ai/ai-model.ts packages/integrations/src/ai/openrouter.ts packages/integrations/src/ai/memory-ai.ts packages/integrations/src/ai/fallback.ts packages/integrations/src/ai/index.ts packages/integrations/test/ai/openrouter-tools.test.ts packages/integrations/test/ai/fallback.test.ts
git commit -m "feat(integrations): native tool calling, reasoning and deadlines in the AI port"
```

### Task 2: The `sales_agent` model list

**Files:**
- Modify: `apps/api/src/ai-services.ts`, `apps/api/src/service-variables.ts`, `apps/api/src/environment.ts`,
  `apps/api/src/console-agent-bench-start.ts`, `docs/deploy-checklist.md`
- Test: `apps/api/test/ai-services.test.ts` (new), `apps/api/test/environment.test.ts`

**Interfaces:**
- Consumes: `aiFeatures` with `sales_agent` (Task 1).
- Produces: `AI_AGENT_MODELS` (optional comma list, parsed like `AI_CHAT_MODELS`). `sales_agent` gets
  `AI_AGENT_MODELS ?? AI_CHAT_MODELS` on `AI_API_KEY`; its backup `AI_BACKUP_CHAT_MODELS ?? AI_AGENT_MODELS ?? chat`;
  on `OPENROUTER_API_KEY`, `AI_AGENT_MODELS ?? AI_SUGGEST_MODELS`. Lite's `autopilot` list is unchanged.

- [ ] **Step 1: Write the failing tests:** `it("gives sales_agent AI_AGENT_MODELS, and the chat models when it is unset")`
  and `it("gives the backup's sales_agent its own chat models when it names them")`, reading the models through a fake
  `fetch` (the request's `model` field); in `environment.test.ts`, `it("reads AI_AGENT_MODELS as a list and treats an
  empty one as unset")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/api-server test -- test/ai-services.test.ts test/environment.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement**, and add the row to the deploy checklist's settings table: "`AI_AGENT_MODELS`: the new
  agent's models, comma-separated (the chat models when blank)", api and worker columns, as `AI_CHAT_MODELS`'s row.
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `feat(api): an own model list for the natural sales agent` (files by name).

### Task 3: Contracts: facts, tool arguments and definitions, the trace

**Files:**
- Create: `packages/contracts/src/ai/natural.ts`, `natural-tools.ts`, `natural-trace.ts`
- Modify: `packages/contracts/src/ai/index.ts`
- Test: `packages/contracts/test/ai/natural.test.ts`, `packages/contracts/test/ai/natural-tools.test.ts`

**Interfaces:**
- Produces:

```ts
// natural.ts
export const naturalHandOverReasons = ["discount", "custom_trip", "complaint", "payment_check", "wants_person",
  "abuse", "big_group", "existing_booking"] as const;
export const naturalTaskKinds = ["question", "call_back"] as const;
export const followUpWhens = ["in_a_few_hours", "this_evening", "tomorrow_morning", "tomorrow_evening", "on_date", "none"] as const;
export const bookingTerms = z.object({ packageId: recordId, startsOn: calendarDate, adults: z.int().min(1).max(50),
  childrenAges: z.array(z.int().min(0).max(17)).max(20), room: roomType.nullable(), payInFull: z.boolean() });
export const liveOffer = bookingTerms.extend({ departureId: recordId, totalPaise: z.int().min(0),
  advancePaise: z.int().min(0), at: z.iso.datetime() });
export const toldTotal = bookingTerms.omit({ payInFull: true }).extend({ totalPaise: z.int().min(0), at: z.iso.datetime() });
export const naturalFacts = z.object({
  agent: z.literal("natural"),
  leadId: recordId.nullable().default(null),
  sentTripIds: z.array(recordId).max(50).default([]),
  sentFileIds: z.array(recordId).max(150).default([]),
  offer: liveOffer.nullable().default(null),
  told: z.array(toldTotal).max(20).default([]),   // newest last; older than 30 days dropped when written
  bookingId: recordId.nullable().default(null),
  lastTurnAt: z.iso.datetime().nullable().default(null),
});
// natural-tools.ts: one strict schema per tool, snake_case as the model sees it (spec 3.3), e.g.
export const quoteArguments = z.strictObject({ trip_id: z.string(), date: calendarDate, adults: z.int().min(1).max(50),
  children_ages: z.array(z.int().min(0).max(17)).max(20).default([]), room: roomType.optional() });
export const naturalToolNames = ["find_trips", "get_trip", "quote", "update_lead", "send_brochure", "offer_booking",
  "book", "resend_payment", "plan_follow_up", "create_task", "add_note", "hand_over", "suggest_close", "stay_quiet"] as const;
export type NaturalToolName = (typeof naturalToolNames)[number];
export const naturalReadTools: readonly NaturalToolName[] = ["find_trips", "get_trip", "quote"];
export interface NaturalToolDefinition { name: NaturalToolName; description: string; parameters: Record<string, unknown> }
export function naturalToolDefinitions(input: { tripLabels: readonly string[]; indexed: boolean }): NaturalToolDefinition[];
export function parseToolArguments(name: string, raw: string):
  | { ok: true; name: NaturalToolName; args: Record<string, unknown> } | { ok: false; problem: string };
// natural-trace.ts
export const naturalTrace = z.object({ agent: z.literal("natural"), promptVersion: z.string(), outcome: z.string(),
  fallback: z.string().nullable(), restarted: z.string().nullable(), durationMs: z.number(),
  calls: z.array(z.object({ model: z.string(), ms: z.number(), inputTokens: z.number(), cachedTokens: z.number(),
    outputTokens: z.number(), reasoningTokens: z.number(), finishReason: z.string(), words: z.string().nullable(),
    tools: z.array(z.object({ name: z.string(), arguments: z.string(), result: z.string(), refused: z.boolean() })) })),
  guards: z.array(z.object({ guard: z.enum(["G1", "G2", "G3", "G4", "G5", "G6"]), passed: z.boolean(), detail: z.string().nullable() })),
  staged: z.array(z.object({ tool: z.string(), summary: z.string() })),
  flags: z.array(z.string()) });
export type NaturalTrace = z.infer<typeof naturalTrace>;
// and the inferred types every later task uses:
export type NaturalFacts, BookingTerms, LiveOffer, ToldTotal, NaturalHandOverReason, NaturalTaskKind, FollowUpWhen;
```

The argument schemas and limits: `find_trips {query 1–80}`; `get_trip {trip_id}`; `quote` as above;
`update_lead {trip_id?, date?, month? (calendarMonth), adults?, children_ages?, pickup_city? ≤60, room?, name? ≤80}`
with at least one key; `send_brochure {trip_id}`; `offer_booking` = quote's + `pay_in_full?`; `book` = offer's +
`full_name 2–80, customer_words 1–300`; `resend_payment {}`; `plan_follow_up {when, date? (on_date only), about 1–200}`;
`create_task {kind, text 1–500, call_at? "yyyy-mm-ddThh:mm" in the agency's zone}`; `add_note {text 1–300}`;
`hand_over {reason, summary 1–300}`; `suggest_close {kind: lost | not_a_lead, reason 1–200}`;
`stay_quiet {reason 1–200}`. Each description is the "What it does" cell of spec 3.3, in one or two sentences.

- [ ] **Step 1: Write the failing tests:**

```ts
it("offers 14 tools with indexed trips and 12 with inline ones", () => {
  expect(naturalToolDefinitions({ tripLabels: ["T1", "T2"], indexed: true })).toHaveLength(14);
  expect(naturalToolDefinitions({ tripLabels: ["T1", "T2"], indexed: false }).map((t) => t.name))
    .not.toEqual(expect.arrayContaining(["find_trips"]));
});
it("enumerates the turn's trip labels in every trip_id", () => {
  const quote = naturalToolDefinitions({ tripLabels: ["T1", "T2"], indexed: false }).find((t) => t.name === "quote");
  expect(quote?.parameters).toMatchObject({ properties: { trip_id: { enum: ["T1", "T2"] } } });
});
it("offers no tool that names a trip when there is none", () => {
  const names = naturalToolDefinitions({ tripLabels: [], indexed: false }).map((t) => t.name);
  expect(names).toEqual(["update_lead", "resend_payment", "plan_follow_up", "create_task", "add_note",
    "hand_over", "suggest_close", "stay_quiet"]);
  // and update_lead's schema has no trip_id
});
it("parses arguments, and says what's wrong in a sentence", () => {
  expect(parseToolArguments("quote", "{\"trip_id\":\"T1\",\"date\":\"2026-12-12\",\"adults\":0}"))
    .toEqual({ ok: false, problem: expect.stringContaining("adults") });
  expect(parseToolArguments("quote", "not json")).toEqual({ ok: false, problem: "the arguments weren't JSON" });
  expect(parseToolArguments("fly", "{}")).toEqual({ ok: false, problem: "there is no tool called fly" });
});
it("keeps facts apart from lite's", () => {
  expect(naturalFacts.safeParse({ agent: "lite" }).success).toBe(false);
  expect(naturalFacts.parse({ agent: "natural" })).toMatchObject({ offer: null, told: [], lastTurnAt: null });
});
it("sends no examples keyword to the model", () => {
  expect(JSON.stringify(naturalToolDefinitions({ tripLabels: ["T1"], indexed: true }))).not.toContain("examples");
});
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/contracts test -- test/ai/natural.test.ts test/ai/natural-tools.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.** Build each definition's `parameters` with `z.toJSONSchema` of the tool's schema with
  `trip_id` replaced by `z.enum(tripLabels)`, through `withoutExamples` (`lite.ts`).
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(contracts): the natural agent's facts, tools and trace`.

### Task 4: The system prompt and its seam

**Files:**
- Create: `packages/domain/src/ai/natural/prompt-text.ts`, `prompt.ts`, `prompt-source.ts`, `types.ts`, `index.ts`
- Modify: `packages/domain/src/ai/index.ts` (export `* from "./natural/index.js"`)
- Test: `packages/domain/test/ai/natural/prompt.test.ts`

**Interfaces:**
- Produces:

```ts
export interface NaturalPrompt { version: string; text: string }
export const BUILT_IN_NATURAL_PROMPT: NaturalPrompt; // { version: "built-in-1", text: NATURAL_PROMPT_TEXT }
export const NATURAL_PROMPT_PLACEHOLDERS = ["agent_name", "agency_name", "tone"] as const;
export interface AgentVoice { agentName: string; agencyName: string; tone: "friendly" | "professional" }
export function renderNaturalPrompt(prompt: NaturalPrompt, voice: AgentVoice): string;
export async function naturalPromptOf(db: Database): Promise<NaturalPrompt>;            // this plan: the built-in
export async function draftNaturalPrompt(db: Database, versionId: string): Promise<NaturalPrompt | null>; // this plan: null
```

`types.ts` declares, for every later task: `NaturalChatLine` (`id`, `from: "customer" | "you" | "team" | "earlier" |
"automatic"`, `at: Date`, `kind`, `text`, `fileName?`, `teamName?`, `action?` (a past action's bracketed words),
`untranscribed?`, `mayBePayment?`), `NaturalLeadView` (name and where it came from, package id, day or month, adults,
children's ages, pickup city, room, stage, summary, the last 3 team notes `{ at, by, text }`, open task texts),
`QuoteFigures` (`terms: BookingTerms` plus `departureId`, `perPersonPaise`, `totalPaise`, `advancePaise`,
`advancePerPersonPaise`, `freeSeats`), and the `StagedAction` union. `BookingTerms`, `LiveOffer`, `ToldTotal` and
`NaturalFacts` are the contracts' types from Task 3, never declared again:

```ts
export type StagedAction =
  | { tool: "update_lead"; fields: Partial<{ packageId: string; day: CalendarDate; month: string; adults: number;
      childrenAges: number[]; pickupCity: string; room: RoomType; name: string }>; notes: string[] }
  | { tool: "send_brochure"; packageId: string; fileIds: string[] }
  | { tool: "offer_booking"; offer: LiveOffer }
  | { tool: "book"; terms: BookingTerms; figures: QuoteFigures; fullName: string; customerWords: string; via: "offer" | "told" }
  | { tool: "resend_payment" }
  | { tool: "plan_follow_up"; at: Date | null; about: string }
  | { tool: "create_task"; kind: NaturalTaskKind; text: string; callAt: Date | null }
  | { tool: "add_note"; text: string }
  | { tool: "hand_over"; reason: NaturalHandOverReason; summary: string }
  | { tool: "suggest_close"; kind: "lost" | "not_a_lead"; reason: string }
  | { tool: "stay_quiet"; reason: string };
export type StagedSet = ReadonlyMap<StagedAction["tool"], StagedAction>; // a later call of one tool replaces the earlier
```

- [ ] **Step 1: Write the failing tests:**

```ts
it("holds Appendix A as written", () => {
  expect(NATURAL_PROMPT_TEXT.startsWith("# {agent_name}, {agency_name} on WhatsApp")).toBe(true);
  expect(NATURAL_PROMPT_TEXT).toContain("## Four things you never do");
  expect(NATURAL_PROMPT_TEXT.trimEnd().endsWith("</example>")).toBe(true);
});
it("renders the agent's name, the agency's name and the tone, and leaves no placeholder", () => {
  const text = renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, { agentName: "Riya", agencyName: "Sharma Holidays", tone: "friendly" });
  expect(text.split("\n")[0]).toBe("# Riya, Sharma Holidays on WhatsApp");
  expect(text).toContain("The agency chose the friendly tone.");
  expect(text).not.toMatch(/\{(agent_name|agency_name|tone)\}/);
});
it("renders an empty agent name as the agency's team", () => {
  expect(renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, { agentName: "", agencyName: "Sharma Holidays", tone: "professional" })
    .split("\n")[0]).toBe("# the Sharma Holidays team, Sharma Holidays on WhatsApp");
});
it("is about 3,500 tokens", () => expect(estimateTokens(NATURAL_PROMPT_TEXT)).toBeLessThanOrEqual(4_000));
it("names no bench fixture's trip or price", () => {
  for (const word of ["Kedarkantha", "Brahmatal", "9,499", "10,499", "Majnu ka Tilla"]) expect(NATURAL_PROMPT_TEXT).not.toContain(word);
});
it("uses the built-in prompt until the editor publishes one", async () =>  // the test database (createTestInbox)
  expect(await naturalPromptOf(test.db)).toEqual(BUILT_IN_NATURAL_PROMPT));
```

(`estimateTokens` comes from Task 6; until then the test imports it from `context/tokens.ts`, which this task creates
with its one function: `Math.ceil(text.length / 4)`.)

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/prompt.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** `prompt-text.ts` holds the text inside Appendix A's four-backtick `markdown` fence, byte
  for byte, as one template literal (escape backticks if any appear). `renderNaturalPrompt` replaces the three
  placeholders everywhere.
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's system prompt`.

### Task 5: Trips in full and index lines, from the data

**Files:**
- Create: `packages/domain/src/ai/natural/trips/trip-sheets.ts`, `trips/trip-text.ts`
- Modify: `packages/domain/src/ai/lite/lookups/package-reads.ts` (`priceOf`'s facts parameter becomes
  `Pick<LiteFacts, "adults" | "children" | "roomType" | "departureId">`), `lite/lookups/find-packages.ts` (third
  parameter `options: { more?: (entry: PackageIndexEntry) => string; most?: number } = {}`, default lite's behaviour:
  no extra words, 3 results)
- Test: `packages/domain/test/ai/natural/trip-text.test.ts`, `packages/domain/test/ai/natural/trip-sheets.test.ts`
  (database), `packages/domain/test/ai/lite/find-packages.test.ts` (one case for the options)
- Create: `packages/domain/test/ai/natural/support/natural-agency.ts` (a seeded test agency, see Interfaces)

**Interfaces:**
- Produces:

```ts
export interface TripSheet {
  label: string; packageId: string; title: string; place: string | null; nights: number | null; startCity: string;
  summary: string; highlights: string[]; days: { title: string; text: string }[]; pickups: string[];
  inclusions: string; exclusions: string; notes: string; cancellation: string;
  rooms: RoomType[];                      // priced types only (F14)
  seasons: { name: string; from: CalendarDate; until: CalendarDate; perPersonPaise: Partial<Record<RoomType, number>> }[]; // not yet ended
  pricesIncludeGst: boolean; taxRateBasisPoints: number;
  fromPaise: number | null; advancePerPersonPaise: number | null;
  departures: { id: string; startsOn: CalendarDate; freeSeats: number }[];   // next 8 open
  fileIds: string[];                      // brochures first, then photos
}
export async function tripSheetsOf(tx: OrgTx, sellable: readonly { id: string; kind: string }[], today: CalendarDate, now: Date): Promise<TripSheet[]>;
export function tripInFull(sheet: TripSheet, today: CalendarDate): string;
export function tripIndexLine(sheet: TripSheet, today: CalendarDate): string;
export function seatWords(freeSeats: number): string; // "open" | "N left" (N ≤ 5) | "full"
// test support
export async function naturalAgency(test: TestInbox, options?: { trips?: number; paymentDetails?: boolean }):
  Promise<{ organizationId: string; packageIds: string[]; model: MemoryAiModel }>;
```

`naturalAgency` seeds, through the same helpers as lite's `liteAgency`: the AI on, agent "Riya", tone friendly, the
six answers, payment details with UPI `casetrips@okhdfc` and a QR, and `trips` group packages (default 2) shaped as the
bench's agency T (Task 14): T1 Kedarkantha Trek (₹9,499 triple, advance ₹3,000 per person, Sat 5, 12, 19, 26 Dec
2026, a brochure) and T2 Brahmatal Trek (₹10,499 triple, Sat 12 and 26 Dec).

`tripSheetsOf` reads group packages only (lite's index rule), labels them `T1…` in `sellable`'s order, reads the
departures and seasons once for all (`openDepartureDetailsByPackage`, `seasonsByPackage`) and the files once
(`packageFilesIn`). Owner text is cleaned of payment details (`withoutPaymentDetails`) and emails or handles (lite's
pattern) but keeps every number; `name`, `items` and `paymentDetails` are never read.

- [ ] **Step 1: Write the failing tests** (`trip-text.test.ts` uses a literal `TripSheet`):

```ts
it("writes a trip in full with its numbers, rooms by season, advance and the next departures", () => {
  const text = tripInFull(kedarkantha, today);
  expect(text.split("\n")[0]).toBe("T1 Kedarkantha Trek · Sankri, Uttarakhand · 5 nights · from Dehradun");
  for (const part of ["triple ₹9,499 per person", "GST included", "advance ₹3,000 per person",
    "Sat 12 Dec: open", "Sat 19 Dec: 4 left", "Sat 26 Dec: full"]) expect(text).toContain(part);
});
it("keeps numbers in the owner's text", () => {
  expect(tripInFull(withNotes("Pickup 6:30 am, summit at 3,800 m, 4 nights in tents"), today))
    .toContain("Pickup 6:30 am, summit at 3,800 m, 4 nights in tents");
});
it("says plus GST when prices exclude it", () => expect(tripInFull(excludingGst, today)).toContain("plus 5% GST"));
it("shows seats as open, N left at 5 or fewer, or full", () => {
  expect([seatWords(500), seatWords(5), seatWords(1), seatWords(0)]).toEqual(["open", "5 left", "1 left", "full"]);
});
it("writes one index line with the from-price, the next 3 dates and the main stops", () => {
  expect(tripIndexLine(kedarkantha, today)).toBe(
    "T1 Kedarkantha Trek · Sankri, Uttarakhand · 5 nights · from Dehradun · from ₹9,499 · Sat 12 Dec, Sat 19 Dec, Sat 26 Dec · stops: Sankri, Juda ka Talab, Kedarkantha summit");
});
```

`trip-sheets.test.ts` (database, `naturalAgency`): `it("drops payment details and emails from owner text but no
number")`, `it("lists only priced rooms")`, `it("reads no package's internal name, items or payment details")` (the
sheet has no such key and the text holds none of the seeded values), `it("labels trips T1, T2 in the saved order")`.
`find-packages.test.ts`: `it("finds by an itinerary stop and returns up to 5 when asked")`.

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/trip-text.test.ts test/ai/natural/trip-sheets.test.ts test/ai/lite/find-packages.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.** Main stops are the day titles' first places, at most 4. Room price lines read
  "<season name> (<from>–<until>): double ₹X, triple ₹Y per person".
- [ ] **Step 4: Run** the same plus `pnpm --filter @travel-crm/domain test -- test/ai/lite`; expect PASS (lite unchanged).
- [ ] **Step 5: Commit** `feat(ai): the natural agent's trip sheets, in full and as index lines`.

### Task 6: The context: agency block, chat as turns, turn block, budgets

**Files:**
- Create: `packages/domain/src/ai/natural/context/agency-block.ts`, `chat-turns.ts`, `turn-block.ts`, `build.ts`
  (and complete `context/tokens.ts`)
- Test: `packages/domain/test/ai/natural/context.test.ts` (pure, no database)

**Interfaces:**
- Consumes: `TripSheet`, `tripInFull`, `tripIndexLine` (Task 5); `renderNaturalPrompt` (Task 4);
  `naturalToolDefinitions` (Task 3); lite's `fenced`, `clockWords`, `formatShortDay`, `withoutAmountsAndDates`.
- Produces:

```ts
export const NATURAL_BUDGETS = { prompt: 4_000, agency: 600, trips: 8_000, chat: 3_000, turn: 3_500 } as const; // tokens
export const CHAT_LINES = 40; export const CHAT_DAYS = 14; export const CHAT_MIN_LINES = 6; export const LINE_CUT = 1_000;
export function newLinesOf(lines: readonly NaturalChatLine[], lastTurnAt: Date | null): NaturalChatLine[];
export interface NaturalContextInput {
  prompt: NaturalPrompt; voice: AgentVoice; timeZone: string; today: CalendarDate; now: Date;
  answers: AgencyAnswers; sheets: readonly TripSheet[]; lead: NaturalLeadView; facts: NaturalFacts;
  lines: readonly NaturalChatLine[];           // the whole chat read, oldest first
  cameFrom: { source: string; packageId: string | null } | null;
  notice: string | null;                       // what the app did before the model (ruling 6), else null
  withTools: boolean;                          // false for ruling 6's turns
}
export interface NaturalContext {
  messages: AiMessage[]; tools: AiTool[]; labels: ReadonlyMap<string, string>; // label → package id
  indexed: boolean; newLines: NaturalChatLine[];
  sizes: Record<keyof typeof NATURAL_BUDGETS, number>;
}
export function buildNaturalContext(input: NaturalContextInput): NaturalContext;
```

The rules this task fixes (spec 4.1–4.4): one system string, rendered prompt then the agency block (name, agent name,
tone, time zone, each answer fenced as `<owner_text topic="safety">…</owner_text>`, then every trip in full when all
fit 8,000 tokens, else one index line each). The chat: the last 40 messages, under 3,000 tokens, none older than 14
days unless fewer than 6 remain, a line cut past 1,000 characters; customer lines are user messages
`[Mon 10 Nov, 7:02 pm] <text>`; ours, Team's (`(Team, Amit) …`), earlier assistants' (`[earlier assistant] …`, amounts
and dates removed) and automatic ones (`[automatic] …`) are assistant messages; a past action is its own line
`[sent: Snow Lake Trek brochure]`; lines of one role in a row join into one message, one per line; media show as
`[photo]`, `[file: name.pdf]`, `[voice note] <transcript>`, `[payment screenshot]`. New lines (customer lines after our
last message and after the last turn; automatic lines don't end a burst; media from before `lastTurnAt` is old) are
left out of the chat and go into the final user message: `<now>` and `<lead>` as spec 4.4, then (indexed only) up to 3
trips in full (the lead's, the ad's, those `findPackages` matches in the new lines), then the notice, then
`New messages:` and each new line.

- [ ] **Step 1: Write the failing tests:**

```ts
it("puts every trip in full and offers no lookup when they fit 8,000 tokens", () => {
  const context = buildNaturalContext(input({ sheets: eightTrips }));
  expect(context.indexed).toBe(false);
  expect(context.tools.map((t) => t.name)).not.toContain("find_trips");
});
it("above 8,000 tokens, one index line per trip, the lookups, and up to 3 trips in full in the turn block", () => {
  const context = buildNaturalContext(input({ sheets: fortyTrips, lead: leadOn(fortyTrips[7]), lines: saying("brahmatal ka rate?") }));
  expect(context.indexed).toBe(true);
  expect(context.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["find_trips", "get_trip"]));
  expect(lastUser(context)).toContain(tripInFull(fortyTrips[7], today));
  expect(lastUser(context)).toContain("Brahmatal");
});
it("keeps the system string byte-identical across turns while the data is the same", () => {
  expect(system(buildNaturalContext(input({ lines: turnOne })))).toBe(system(buildNaturalContext(input({ lines: turnTwo }))));
});
it("keeps every block within its budget for 40 trips and a 60-line chat", () => {
  const { sizes } = buildNaturalContext(input({ sheets: fortyTrips, lines: sixtyLines }));
  for (const [block, size] of Object.entries(sizes)) expect(size).toBeLessThanOrEqual(NATURAL_BUDGETS[block]);
});
it("writes customer lines as user turns with a short time, and a 1 am message shows it", () => {
  expect(userTurns(context)).toContain("[Tue 10 Nov, 1:04 am] are you there");
});
it("labels the team, earlier assistants and automatic lines, and masks the earlier assistants' figures", () => {
  expect(assistantText).toContain("(Team, Amit) Weekend batch works.");
  expect(assistantText).toContain("[earlier assistant] Final B2B rate is for you");
  expect(assistantText).not.toContain("6,000");
  expect(assistantText).toContain("[automatic] Thanks for your enquiry");
});
it("leaves out lines older than 14 days unless fewer than 6 remain", …);
it("doesn't end the customer's burst at an automatic line, and treats media from before the last turn as old", () => {
  expect(newLinesOf([file(day(-4)), auto(day(-4)), hey(now)], day(-3)).map((l) => l.text)).toEqual(["Hey"]);
});
it("writes the turn block as spec 4.4", () => {
  expect(lastUser(context)).toMatch(/^<now>Sat 14 Nov 2026, 11:43 pm, the customer's time \(Asia\/Kolkata\)\. Follow-ups go out 9 am to 9 pm\./);
  expect(lastUser(context)).toContain("<lead>Riya Sharma (WhatsApp profile name) · trip T1 · December, no day yet · 2 adults · stage Contacted");
});
it("offers no trip tool and names no label when the agency has no sellable trip", …); // Review Focus 3
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/context.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** the four files; `build.ts` composes them and measures `sizes` with `estimateTokens`.
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's context, cached prefix first`.

### Task 7: Read tools: find_trips, get_trip, quote

**Files:**
- Create: `packages/domain/src/ai/natural/tools/find-trips.ts`, `tools/read-tools.ts`
- Test: `packages/domain/test/ai/natural/read-tools.test.ts` (database, `naturalAgency`)

**Interfaces:**
- Consumes: `TripSheet` (Task 5), lite's `findPackages` with options (Task 5), lite's `priceOf` (widened), `datesAndSeats`.
- Produces:

```ts
export interface ReadContext { tx: OrgTx; sheets: readonly TripSheet[]; labels: ReadonlyMap<string, string>; today: CalendarDate; now: Date }
export function findTrips(sheets: readonly TripSheet[], query: string, today: CalendarDate): { exact: TripSheet[]; closest: TripSheet[] };
export async function runReadTool(context: ReadContext, name: "find_trips" | "get_trip" | "quote", args: Record<string, unknown>):
  Promise<{ result: string; figures: QuoteFigures | null }>;
```

`find_trips` matches the query's words against title, place, day titles and pickup points (whole words, near spelling
as "closest, not a match"), keeps trips with a departure in a month the query names, and answers up to 5 index lines.
`quote` finds the open departure on `date`; answers per person, total, advance (per person and in all), the room used
and the seat state. Its refusals name the way on: "refused: no departure on Fri 11 Dec; open: Sat 12 Dec, Sat 19 Dec,
Sat 26 Dec", "refused: 3 left on Sat 19 Dec and the party is 4; open with seats: Sat 12 Dec", "refused: quad isn't
priced; priced: double, triple", "refused: T9 isn't one of the trips".

- [ ] **Step 1: Write the failing tests:** `it("finds a trip by an itinerary stop")`,
  `it("says a near spelling is the closest, not a match")` (result contains "closest, not a match"),
  `it("keeps only trips leaving in the month asked")`, `it("answers at most 5 lines")`,
  `it("returns a trip in full by its label")`, `it("quotes per person, total and advance from the price table")`
  (2 adults on the triple at ₹9,499: result contains "total ₹18,998" and figures `{ totalPaise: 1_899_800 }`),
  `it("adds GST to a total when the prices exclude it")`, and one test per refusal sentence above.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/read-tools.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's read tools`.

### Task 8: Action tools: preconditions and staging (G2, G6, G7)

**Files:**
- Create: `packages/domain/src/ai/natural/tools/terms.ts`, `tools/booking-checks.ts`, `tools/follow-up-time.ts`,
  `tools/action-tools.ts`
- Modify: `packages/domain/src/ai/lite/follow-ups.ts` (export `intoWakingHours`, `windowEndOf`)
- Test: `packages/domain/test/ai/natural/action-tools.test.ts` (pure, with a fake `quoteOf`),
  `packages/domain/test/ai/natural/follow-up-time.test.ts`

**Interfaces:**
- Consumes: `StagedAction`, `BookingTerms`, `QuoteFigures` (Task 4); `findPackages`; lite's `typed-lock.ts`
  (`TypedFields`, `lockedFields`), `inWakingHours`, `normalised` (`read-words.ts`); `WINDOW_MS` (inbox).
- Produces:

```ts
export function termsOf(args: Record<string, unknown>, labels: ReadonlyMap<string, string>): BookingTerms | { refused: string };
export function sameTerms(a: BookingTerms, b: BookingTerms): boolean; // ages compared sorted; payInFull compared
export interface ActionContext {
  sheets: readonly TripSheet[]; labels: ReadonlyMap<string, string>; today: CalendarDate; now: Date; timeZone: string;
  conversationId: string; facts: NaturalFacts; lead: NaturalLeadView; typed: TypedFields;
  lines: readonly NaturalChatLine[]; newLines: readonly NaturalChatLine[]; lastInboundAt: Date;
  adPackageId: string | null; quotedThisTurn: readonly QuoteFigures[];
  paymentReady: boolean; booking: { id: string | null; awaitingPayment: boolean } | null;
  profileName: string | null;
  quoteOf: (terms: BookingTerms) => Promise<QuoteFigures | { refused: string }>;
}
export type StageOutcome = { staged: StagedAction; result: string } | { refused: string };
export async function stageAction(context: ActionContext, name: NaturalToolName, args: Record<string, unknown>, words: string): Promise<StageOutcome>;
export function placeFollowUp(input: { when: FollowUpWhen; date: CalendarDate | null; now: Date; lastInboundAt: Date;
  timeZone: string; conversationId: string }): Date | null | { refused: string }; // null for "none"
```

Times for `plan_follow_up`: `in_a_few_hours` now + 3 h; `this_evening` 18:00 today (refused once past: "use
tomorrow_morning"); `tomorrow_morning` 10:00 and `tomorrow_evening` 18:00 the next day; `on_date` 10:00 that day; then
into waking hours (9 am to 9 pm) and inside the window, else ruling 13's refusal. `book` (`booking-checks.ts`) runs in
order: the offer's checks (sellable, open, seats, ≤ 10 people, room priced, payment details set, no booking ahead or
awaiting payment); then ruling 1; then `quoteOf` again with the total equal to the offer's or the told total.

- [ ] **Step 1: Write the failing tests** (`action-tools.test.ts`; refusals are asserted as whole sentences):

```ts
it("refuses a date already past in the agency's day, at 11:43 pm in Kolkata", …); // Review Focus 5
it("keeps a person's value: a different one becomes a note", async () => {
  const outcome = await stageAction(ctx({ typed: { adults: 3 } }), "update_lead", { adults: 2 }, "");
  expect(outcome).toMatchObject({ staged: { tool: "update_lead", fields: {}, notes: ["Customer now says 2 adults; the lead says 3."] } });
});
it("refuses a brochure for a trip the chat hasn't named (G6)", async () =>
  expect(await stageAction(ctx(), "send_brochure", { trip_id: "T2" }, "")).toEqual({
    refused: "refused: the chat hasn't named T2 Brahmatal Trek: name it, or ask which trip" }));
it("sends the brochure of the lead's trip, the ad's, one quoted this turn, or one named in the new lines or these words", …);
it("refuses a brochure sent before in this chat, and one with no files; sends at most 3 files", …);
it("refuses an offer for more than 10 people, naming the hand-over", async () =>
  expect(await stageAction(ctx(), "offer_booking", terms({ adults: 11 }), "")).toEqual({
    refused: "refused: 11 people is more than 10; hand_over(big_group) with the group's details" }));
it("refuses an offer without payment details, or with a booking ahead or awaiting payment", …);
it("stages an offer with its total and advance, and returns them", async () => {
  const outcome = await stageAction(ctx(), "offer_booking", terms({ adults: 2, room: "double" }), "");
  expect(outcome).toMatchObject({ staged: { tool: "offer_booking", offer: { totalPaise: 2_599_800 } } });
  expect("result" in outcome && outcome.result).toContain("total ₹25,998");
});
it("refuses book with no live offer and no total told: make the offer first", …);
it("refuses book on terms that differ from the live offer", …);
it("refuses book when the customer's words aren't in a new line after the offer", …);
it("refuses book with a full name found nowhere in the chat, the lead or the profile", …);
it("refuses book when seats no longer cover the party, naming open dates", …);
it("books on the live offer's terms with the customer's own words", …);
it("books at once on a total told for exactly these terms in the last 24 hours, with no booking word", …); // ruling 1
it("doesn't take the told shortcut after 24 hours, or for other terms", …);
it("refuses resend_payment without an AI booking awaiting payment", …);
it("stages hand_over, suggest_close and stay_quiet always", …);
it("a later call of the same tool replaces the earlier one", …); // via the StagedSet helper `withStaged`
```

`follow-up-time.test.ts`: `it("places this evening at 6 pm in the agency's zone")`,
`it("moves a time past 9 pm to 9 am, inside the window")`,
`it("refuses a date past the window, naming the call_back task")`, `it("answers null for none")`.

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/action-tools.test.ts test/ai/natural/follow-up-time.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.** `withStaged(set, action): StagedSet` lives in `action-tools.ts`. G6's naming check uses
  `findPackages` over the new lines and `words` by title or place.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/lite/follow-ups.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's actions, staged after their checks`.

### Task 9: Guards on the words, and the fallback line

**Files:**
- Create: `packages/domain/src/ai/natural/guards/grounded.ts`, `guards/claims.ts`, `guards/check-words.ts`,
  `natural/fallback-line.ts`
- Modify: `packages/domain/src/ai/lite/reply-check.ts` (export `claimIn`, nothing else)
- Test: `packages/domain/test/ai/natural/guards.test.ts`, `packages/domain/test/ai/natural/fallback-line.test.ts`

**Interfaces:**
- Consumes: `amountsAndDatesIn`, `paymentDetailsIn`, `paymentClaimPhrases`, `teamClaimPhrases` (contracts);
  `paiseFromSpoken` (`ai/fill/money.ts`); `claimIn`; `TripSheet`; `QuoteFigures`; `LiveOffer`.
- Produces:

```ts
export interface GroundedSet { has(paise: number, shorthand: boolean): boolean } // shorthand: within 1%
export function groundedAmounts(input: { sheets: readonly TripSheet[]; today: CalendarDate; answers: AgencyAnswers;
  teamLines: readonly string[]; told: readonly ToldTotal[]; quoted: readonly QuoteFigures[]; now: Date }): GroundedSet;
export type GuardName = "G1" | "G2" | "G3" | "G4" | "G5";
export type GuardFallback = "fallback_task" | "withdraw_offer" | "hand_over_discount";
export type WordsVerdict =
  | { ok: true; verdicts: NaturalTrace["guards"] }
  | { ok: false; guard: GuardName; retry: string; fallback: GuardFallback; verdicts: NaturalTrace["guards"] };
export interface GuardContext { grounded: GroundedSet; customerText: string; offer: LiveOffer | null;
  paymentConfirmed: boolean; bookingConfirmed: boolean; teamText: string; ownerText: string; today: CalendarDate }
export function checkWords(words: string, context: GuardContext): WordsVerdict;
/** Not checks (spec 5): codes for the trace, e.g. "date_not_in_data:2026-12-13", "seats_differ:T1". */
export function traceFlags(words: string, context: { sheets: readonly TripSheet[]; ownerText: string;
  customerText: string; today: CalendarDate }): string[];
export function fallbackLine(customerText: string): string;
```

G1's grounded set (spec 5): every season's per-person price of seasons not yet ended, per room, and the GST-inclusive
figure when prices exclude GST; the from-prices and advances per person; each of these × 2 to 10; every figure `quote`
or `offer_booking` returned this turn; `told` totals of the last 30 days; amounts in the agency's answers and in trip
text; amounts in Team lines of the last 30 days. Customer amounts and earlier assistants' lines are not grounded;
percentages and counts are not money. Devanagari digits are read as digits before extraction. G2 runs only with an
offer staged: the words must hold the offer's day and month and its advance (in all, or per person). The fallback
line, word for word: Hinglish "Ye team se check karke yahin batate hain.", English "Let me check this with the team;
they'll reply here.", Hindi "यह टीम से पूछकर यहीं बताते हैं।".

- [ ] **Step 1: Write the failing tests:**

```ts
it("lets a typed price that matches the price table go out", () => expect(check("₹9,499 per person, triple sharing.")).toMatchObject({ ok: true }));
it("refuses an amount found nowhere, with the spec's retry", () =>
  expect(check("Special price ₹7,999 for you.")).toMatchObject({ ok: false, guard: "G1", fallback: "fallback_task",
    retry: "₹7,999 isn't in the agency's prices. Use a price from the trips, call quote, or leave the amount out." }));
it("passes a table price times 2 to 10", () => expect(check("₹9,499 × 3 = ₹28,497")).toMatchObject({ ok: true }));
it("passes shorthand within 1% and refuses it past", () => {
  expect(check("around 9.5k per person")).toMatchObject({ ok: true });
  expect(check("around 12k per person")).toMatchObject({ ok: false, guard: "G1" });
});
it("passes the GST-inclusive figure when prices exclude GST", …);           // ₹10,000 + 5% → ₹10,500
it("passes a figure quote returned this turn, and a total told 29 days ago, not 31", …);
it("refuses the customer's own figure and says to refer to it without the amount", () =>
  expect(check("₹6,000 wala rate?", { customerText: "team said 6000" })).toMatchObject({ ok: false, guard: "G1",
    retry: "₹6,000 is the customer's own figure: refer to it without the amount." }));
it("passes amounts from Team lines of the last 30 days", …);
it("reads Devanagari digits as an amount", () => expect(check("कुल ₹९,९९९ होगा")).toMatchObject({ ok: false, guard: "G1" })); // Review Focus 1
it("doesn't read percentages or counts as money", () => expect(check("4 nights, 10 people max")).toMatchObject({ ok: true }));
it("retries an offer whose words lack its date or advance (G2)", …);
it("refuses 'we received your ₹4,000' while no payment is confirmed (G3)", …);
it("passes 'Screenshot mil gaya' and 'once the payment is received'", …);
it("passes 'booking confirm ho gayi' when the data shows the booking confirmed", …);
it("refuses 'team ne bola 10% off' with no Team line saying it, and passes it when one does (G4)", …);
it("passes 'team se check karke batate hain'", …);
it("refuses a discount figure in no owner or Team text, with fallback hand_over_discount", …);
it("refuses a UPI handle, an IFSC or a payment link (G5)", …);
it("flags a date found in no departure, owner text or customer line, and a seat count the data doesn't hold", () =>
  expect(traceFlags("13 Dec ko 3 seats bachi hain", flagContext)).toEqual(["date_not_in_data:2026-12-13", "seats_differ:T1"]));
```

`fallback-line.test.ts`: `it("answers in Hindi for Devanagari, Hinglish for 'kitna hai', and English otherwise")`.

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/guards.test.ts test/ai/natural/fallback-line.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.** Order of checks: G3, G4, G5, G1, G2 (claims first, as lite's check does). Each verdict
  is recorded, passed or not.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/lite/reply-check.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's guards, each checked against the data`.

### Task 10: The loop

**Files:**
- Create: `packages/domain/src/ai/natural/loop.ts`, `counted-model.ts`, `trace.ts`
- Test: `packages/domain/test/ai/natural/loop.test.ts` (memory model, fake IO and clock; no database)

**Interfaces:**
- Consumes: `NaturalContext` (Task 6), `parseToolArguments`, `naturalReadTools` (Task 3), `StageOutcome`,
  `withStaged` (Task 8), `WordsVerdict` (Task 9), `fallbackLine`.
- Produces:

```ts
export const NATURAL_LIMITS = { calls: 4, turnMs: 30_000, tryMs: 15_000, lastCallMs: 3_000, nextModelMs: 10_000,
  maxTokens: 8_000, messages: 2 } as const;
export interface LoopIO {
  call(request: AiRequest): Promise<AiResult | { ok: false; reason: "limit" }>;
  read(name: "find_trips" | "get_trip" | "quote", args: Record<string, unknown>): Promise<{ result: string; figures: QuoteFigures | null }>;
  stage(name: NaturalToolName, args: Record<string, unknown>, words: string, quoted: readonly QuoteFigures[]): Promise<StageOutcome>;
  check(words: string, staged: StagedSet, quoted: readonly QuoteFigures[]): WordsVerdict;
  newerLine(): Promise<boolean>;
  clock(): number;
}
export interface LoopSettings { startedMs: number; organizationId: string; model?: string; temperature?: number;
  forced: readonly StagedAction[];   // staged by code before the model (ruling 6)
  callsUsed?: number;                // default 0; Plan 2's one more call after an act refusal passes the calls spent
  flagContext: Parameters<typeof traceFlags>[1] }
export type LoopEnd =
  | { end: "final"; messages: string[]; staged: StagedSet; quoted: QuoteFigures[];
      transcript: AiMessage[]; callsUsed: number; model: string }   // the transcript ends with the final assistant message
  | { end: "fallback"; reason: "cap" | "deadline" | `guard:${GuardName}` | "model"; messages: [string];
      staged: StagedSet; task: string; draft: string | null }
  | { end: "superseded" }
  | { end: "model_failed"; reason: AiFailure | "limit" };
export async function runNaturalLoop(context: NaturalContext, io: LoopIO, settings: LoopSettings, trace: NaturalTraceBuilder): Promise<LoopEnd>;
export function countedModel(ai: AiModel, environment: CallEnvironment): LoopIO["call"]; // lite's countedCall per call
export function splitMessages(words: string): string[];  // ruling 22
export interface NaturalTraceBuilder {
  call(entry: Omit<NaturalTrace["calls"][number], "tools">): void;      // opens the call that tool() adds to
  tool(entry: NaturalTrace["calls"][number]["tools"][number]): void;
  guards(verdicts: NaturalTrace["guards"]): void;
  staged(set: StagedSet): void;                                         // replaces, one summary per action
  flag(code: string): void;
  restart(reason: "bad_request" | "length" | "model"): void;
  finish(outcome: string, fallback: string | null, endedMs: number): NaturalTrace;
}
export function startNaturalTrace(promptVersion: string, startedMs: number): NaturalTraceBuilder;
```

The loop follows spec 3.2 exactly, with rulings 11, 12, 14 and 22: the response ends the turn when it called no read
tool, had no action refused, and has words or staged `send_brochure`, `stay_quiet` or `hand_over`. Words beside a read
call are dropped (actions in that response stay staged). A response with no words that sends nothing gets one more
call after the user note `[app check, not from the customer] Your reply had no words. Write the reply, or call
stay_quiet.` A guard failure appends the draft and `[app check, not from the customer] Not sent: <retry>` once; the
second failure applies the guard's fallback (`withdraw_offer` drops the staged offer and sends the words;
`fallback_task` and `hand_over_discount` end `fallback` with the draft in the task). The cap or the deadline ends
`fallback` with a task linking the trace.

- [ ] **Step 1: Write the failing tests:**

```ts
it("ends in one call when the words come with no read tool", async () => {
  model.answer({ text: "₹9,499 per person on triple sharing. Which date?" });
  expect(await loop()).toMatchObject({ end: "final", messages: ["₹9,499 per person on triple sharing. Which date?"] });
  expect(model.requests).toHaveLength(1);
});
it("asks every call as the live agent does, with no temperature", async () => {
  expect(model.requests[0]).toMatchObject({ feature: "sales_agent", maxTokens: 8000, reasoning: { effort: "low" },
    toolChoice: "auto", parallelToolCalls: true });
  expect("temperature" in model.requests[0]).toBe(false);
});
it("runs a read tool, drops the words beside it, and calls again with its result", …);
it("sends the reasoning details back unchanged, and pins the first call's model", async () => {
  expect(model.requests[1].messages.at(-2)).toMatchObject({ role: "assistant", reasoningDetails: [{ data: "sig" }] });
  expect(model.requests[1].model).toBe("google/gemini-3.5-flash-lite");
});
it("returns a refused action to the model as the tool's result", …);
it("turns a broken tool call into a refusal the model can act on", async () => { // Review Focus 2
  model.answer({ toolCalls: [{ name: "quote", arguments: { trip_id: "T9" } }] }, { text: "Which trip?" });
  expect(toolResults(model.requests[1])).toEqual(["refused: T9 isn't one of the trips"]);
});
it("sends the words when stay_quiet comes with them, and flags it", …);       // Review Focus 4, ruling 11
it("retries a guard failure once, then applies the guard's fallback", …);
it("withdraws an offer whose words twice miss its date and advance, and sends the words", …);
it("stops at 4 calls with the fallback line and a task", …);
it("starts no call with less than 3 s left, and gives each try at most min(15 s, time left)", …);
it("ends superseded when a newer customer line has come", …);
it("starts over once, unpinned and with nothing staged, on bad_request; a second ends model_failed", …);
it("starts over once at effort minimal on finish_reason length", …);
it("ends model_failed when the model can't answer, and on the month's limit", …);
it("gives a response with no words and nothing sent one more call", …);
it("splits the words at the first blank line into at most two messages", () =>
  expect(splitMessages("A\n\nB\n\nC")).toEqual(["A", "B\n\nC"]));
it("ends with a staged hand_over, stay_quiet or send_brochure and no words", …);
it("records each call's model, time, tokens, tools and the guards' verdicts in the trace", …);
it("records traceFlags of the final words as flags", …);
it("hands back the transcript and the calls used, so one more call can follow", async () => {
  expect(await loop()).toMatchObject({ end: "final", callsUsed: 1, transcript: expect.arrayContaining([
    expect.objectContaining({ role: "assistant" })]) });
});
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/loop.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** Requests: `{ feature: "sales_agent", messages, tools, toolChoice: "auto",
  parallelToolCalls: true, maxTokens: 8000, reasoning: { effort }, timeoutMs: min(15_000, deadline − now),
  deadlineAt, user: organizationId }`, plus `model` once pinned (or Try it's), plus `temperature` only when set. The
  deadline is `startedMs + 30_000`; `callsUsed` starts the count. A final end runs `traceFlags` on its words.
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's loop, with its caps and failure path`.

### Task 11: The dry turn

**Files:**
- Create: `packages/domain/src/ai/natural/dry-agency.ts`, `dry-turn.ts`, `dry-answer.ts`, `dry-run.ts`,
  `packages/contracts/src/ai/natural-try-it.ts`
- Modify: `packages/domain/src/ai/natural/index.ts`, `packages/contracts/src/ai/index.ts`
- Test: `packages/domain/test/ai/natural/dry-turn.test.ts` (database, `naturalAgency`),
  `packages/contracts/test/ai/natural-try-it.test.ts`

**Interfaces:**
- Consumes: everything above; lite's `countedCall`, `packageFilesIn`, `agencyPaymentDetailsOf`, `paymentLinesOf`,
  `paymentDetailsReady`, `departureSettingsOf`, `agencyAnswersOf`, `agentBasicsOf`, `sellablePackages`.
- Produces:

```ts
// contracts: natural-try-it.ts
export const dryLead = z.object({ packageId: recordId.nullable(), day: calendarDate.nullable(), month: calendarMonth.nullable(),
  adults: z.int().min(1).nullable(), childrenAges: z.array(z.int().min(0).max(17)), pickupCity: z.string().max(60).nullable(),
  room: roomType.nullable(), name: z.string().max(80).nullable(), stage: z.enum(["new", "contacted", "quote_sent", "booking_requested"]),
  notes: z.array(z.string().max(300)).max(3), tasks: z.array(z.object({ kind: z.enum(naturalTaskKinds), text: z.string().max(500) })).max(5),
  booking: z.object({ packageId: recordId, startsOn: calendarDate, advancePaise: z.int().min(0) }).nullable() });
export const naturalTestState = z.object({ facts: naturalFacts, lead: dryLead });
export const naturalTestInput = z.strictObject({ messages: <as testAiInput's>, state: <strict copies of naturalTestState>.nullable(),
  model: z.enum(testAiModels), temperature: z.enum(testAiTemperatures) }).refine(<as testAiInput's temperature rule>);
// naturalDryAction: a discriminated union on `tool`, one z.object per tool (trip: the title; date: calendarDate;
// counts and paise: z.int().min(0)):
//   update_lead { fields: ("trip" | "dates" | "adults" | "children" | "pickup" | "room" | "name")[] }
//   send_brochure { trip, files }            offer_booking { trip, date, people, totalPaise, advancePaise }
//   book { trip, date, seats, advancePaise } resend_payment {}
//   plan_follow_up { at: iso datetime | null, about }   create_task { kind: naturalTaskKinds, text }
//   add_note { text }   hand_over { reason: naturalHandOverReasons, summary }
//   suggest_close { kind: "lost" | "not_a_lead", reason }   stay_quiet { reason }
export const naturalTestAnswer = z.object({
  messages: z.array(z.string()).max(2),          // what the customer would get
  payment: z.array(z.string()).nullable(),       // the agency's payment lines code would send after them, with the QR
  actions: z.array(naturalDryAction),
  outcome: z.enum(["replied", "quiet", "handed_off", "fallback"]),
  state: naturalTestState,
  history: z.array(testAiLine),                  // agent lines to add to the chat: the messages, then "[sent: …]" marks
  trace: naturalTrace });
// domain
export interface NaturalDryTurn { lines: readonly NaturalChatLine[]; state: NaturalTestState | null; now: Date;
  prompt: NaturalPrompt; choice: { model?: string; temperature?: number } }
export async function naturalDryTurn(deps: { db: Database; ai: AiModel; agencyName: (organizationId: string) => Promise<string>;
  clock?: () => number }, organizationId: string, turn: NaturalDryTurn): Promise<NaturalTestAnswer>;
export async function naturalDryRun(deps: …same, access: MemberAccess, chat: { messages: readonly TestAiLine[];
  state: NaturalTestState | null; prompt: NaturalPrompt; model?: string; temperature?: number }, now: Date): Promise<NaturalTestAnswer>;
```

The dry turn: read the agency (`dry-agency.ts`: zone, today, sheets, answers, voice, payment lines or null, hold
hours); turn the state into the lead view and facts (a null state is a new chat: `naturalFacts.parse({ agent:
"natural" })` and an empty lead at stage `new`); before the model, apply ruling 6 to new media lines (Try it never
posts media; the bench does); build the context; run the loop with an IO whose `read` and `quoteOf` run in
`db.forOrg`, whose `stage` is `stageAction`, whose `newerLine` answers false; then describe, never do: `dry-answer.ts`
maps the end to `messages`, `payment` (after `book` or `resend_payment`, `paymentLinesOf` of the agency's details),
`actions`, `outcome`, the next state (fields saved, `sentTripIds`, the offer with `at = now`, `told` per ruling 17,
the dry booking, notes, tasks, stage forward only: a reply makes `contacted`, an offer or a total told `quote_sent`, a
hold `booking_requested`; `lastTurnAt = now`) and `history` (each message, then `[sent: <title> brochure]`,
`[offered: Sat 19 Dec, 2 adults, double, total ₹22,600, advance ₹5,600]`, `[held: 2 seats on Sat 19 Dec; payment
details sent]`). A model failure answers the fallback line and a `create_task` action (outcome `fallback`); the
month's limit throws `LIMIT_REACHED`/`AI_LIMIT_REACHED` as lite's Try it does. `naturalDryRun` turns posted lines into
chat lines (customer → `customer`, agent → `you`, all at `now`, ids `dry-run-<n>`).

- [ ] **Step 1: Write the failing tests:**

```ts
it("answers a greeting on the agency's own data, sending nothing and keeping nothing but usage", async () => {
  model.answer({ text: "Hi! Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai aur kitne log?" });
  const answer = await dry(["Hi"]);
  expect(answer).toMatchObject({ outcome: "replied", messages: [expect.stringContaining("₹9,499")], payment: null });
  expect(await sentMessages(organizationId)).toHaveLength(0);
  expect(await usedThisMonthOf(organizationId)).toBe(1);
});
it("carries what update_lead saved into the next turn's lead block", …);
it("would hold the seats after an offer and a yes, and shows the agency's payment lines", async () => {
  // turn 1: offer_booking(T1, 2026-12-19, 2, triple) + words with "19 Dec" and "₹6,000"; turn 2: "haan, Rohan Mehta" → book
  expect(second).toMatchObject({ actions: [expect.objectContaining({ tool: "book", seats: 2 })],
    payment: ["UPI: casetrips@okhdfc"], state: { lead: { stage: "booking_requested" } } });
});
it("hands over in words of the model's own, with the reason in the actions", …);
it("answers the fallback line and a task when the model can't answer", …);
it("throws AI_LIMIT_REACHED when the month's calls are used up", …);
it("records the prompt's version in the trace", …);
it("adds [sent: …] and [offered: …] marks to the history", …);
it("refuses unknown keys in a posted state", () => expect(naturalTestInput.safeParse(withExtraKey).success).toBe(false));
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/dry-turn.test.ts` and
  `pnpm --filter @travel-crm/contracts test -- test/ai/natural-try-it.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's dry turn for Try it`.

### Task 12: `ai.testNatural`

**Files:**
- Modify: `packages/api/src/routers/ai.ts`
- Test: `packages/api/test/ai-try-it-natural-router.test.ts`

**Interfaces:**
- Consumes: `naturalTestInput`, `naturalTestAnswer` (Task 11); `naturalDryRun`, `naturalPromptOf` (Tasks 4, 11).
- Produces: `ai.testNatural: freshProcedure.requires("ai:manage").input(naturalTestInput).output(naturalTestAnswer)`
  `.mutation(…)`: `AI_NOT_READY` when `ctx.ai` isn't configured; `model: "flash"` → `TEST_CHAT_FLASH_MODEL`;
  `temperature: "0.4"` → `0.4`; `prompt: await naturalPromptOf(ctx.db)`.

- [ ] **Step 1: Write the failing tests:** `it("refuses a member without ai:manage")` (FORBIDDEN),
  `it("refuses a chat that ends with the agent's line")` (BAD_REQUEST),
  `it("refuses unknown keys in the state")`, `it("asks as the new agent: sales_agent, tools offered, no temperature")`
  (reads the memory model's first request), `it("passes Try it's Flash and 0.4 on to the request")`,
  `it("hands the state back for the next turn")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/api test -- test/ai-try-it-natural-router.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** beside `test`, with the same comment style.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/api test -- test/ai-try-it-router.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(api): Try it can run the natural agent`.

### Task 13: Try it's agent choice and the new agent's "Why"

**Files:**
- Modify: `apps/web/src/ai/test-section.tsx`, `apps/web/src/ai/test-choices.tsx`, `apps/web/src/ai/use-ai.ts`,
  `apps/web/src/i18n/messages/en-IN/ai.json`
- Create: `apps/web/src/ai/test-natural-turn.tsx`, `apps/web/src/ai/test-natural-why.tsx`
- Test: `apps/web/test/ai/test-section-natural.test.tsx`; `apps/web/test/ai/test-section.test.tsx` keeps passing

**Interfaces:**
- Consumes: `trpc.ai.testNatural` (Task 12), `NaturalTestAnswer`.
- Produces: `TestChoice` gains `agent: "current" | "natural"` (default `"current"`); `useTestNatural()`; components
  `TestNaturalTurn({ answer })` and `TestNaturalWhy({ answer })`.

The screen: an "Agent" select first in the choices row ("Current agent", "New agent"); changing it empties the chat
(ruling 7). A natural turn shows up to two bubbles, then the payment lines as a bubble of their own ("Then code sends:"
above them, as a caption) when present, then a status line (handed over: "It would hand the chat to your team:
<reason's words>"; quiet: "It would stay quiet: <reason>"; fallback: "It couldn't answer, so it would send the
fallback line and add a task"), then "Why" (Collapsible, closed). "Why" shows `Details` rows (prompt version, outcome,
calls, time in seconds, tokens in/cached/out/reasoning), then each call as an ordered list item: its model, time and
tokens, its words when it had some, each tool as `name(arguments)` and `→ result` (a refused one marked with
`StatusDot` attention and "refused"), then the guards' verdicts, the flags, and what it would do (one sentence per
action from `ai.json`: e.g. "It would hold {seats} seats on {date} and send the payment details and QR."). The chat's
lines for the next turn are the customer's lines plus each answer's `history`.

- [ ] **Step 1: Write the failing tests** (`stubApi` the procedure as the lite test does):

```ts
it("sends the new agent's turns to ai.testNatural with the state it handed back", …);
it("empties the chat when the agent changes", …);
it("shows two messages and the payment lines code would send after them", …);
it("says it would hand the chat over, with the reason in words", …);
it("opens Why on each call's tools, arguments, results and the guards' verdicts", async () => {
  await userEvent.click(screen.getByRole("button", { name: words.why.open }));
  expect(screen.getByText('quote({"trip_id":"T1","date":"2026-12-12","adults":2})')).toBeVisible();
  expect(screen.getByText(/refused: no departure on Fri 11 Dec/)).toBeVisible();
  expect(screen.getByText("built-in-1")).toBeVisible();
});
it("posts each answer's history lines as the agent's lines in the next turn", …);
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/ai/test-section-natural.test.tsx test/ai/test-section.test.tsx`;
  expect FAIL.
- [ ] **Step 3: Implement** with registry pieces (`Select` through `FormField`, `Collapsible`, `Card`, `Details`,
  `StatusDot`); no new primitive, no border classes; dates in actions through `formatCalendarDay`, money through the
  web's money formatter.
- [ ] **Step 4: Run** the same, then `pnpm --filter @travel-crm/web test` (the guards: hand-drawn borders, colour
  literals, messages); expect PASS.
- [ ] **Step 5: Look at it.** Run the api and web locally against the dev database (`pnpm dev`), open Settings → AI →
  Try it on a phone width (390 px) and a desktop width, choose "New agent", send three lines, open Why. Fix anything
  clipped or overflowing before committing.
- [ ] **Step 6: Commit** `feat(web): Try it can talk to the new agent and show why`.

### Task 14: The bench: fixtures, cases and hard checks, in CI

**Files:**
- Create: `packages/domain/src/ai/bench/natural-seed.ts`, `natural-script.ts`, `natural-replay.ts`,
  `natural-checks.ts`; `packages/contracts/src/ai/natural-cases.ts`;
  `packages/domain/test/ai/natural/bench/cases/*.json`; `packages/domain/test/ai/natural/bench/natural-bench.test.ts`
- Modify: `packages/domain/src/ai/index.ts` (bench exports), `packages/contracts/src/ai/index.ts`

**Interfaces:**
- Consumes: `naturalDryTurn` (Task 11), `checkWords`, `groundedAmounts` (Task 9), `createMemoryAiModel` (Task 1).
- Produces:

```ts
// contracts
export const naturalBenchAgencies = ["T", "M", "one", "forty"] as const;
export const naturalCase = z.strictObject({
  name: z.string().min(1).max(120), number: z.string().max(8),          // "4", "S2" for single-turn checks
  agency: z.enum(naturalBenchAgencies),
  start: z.strictObject({ lines: z.array(benchLine).default([]), state: naturalTestState.partial().optional() }).default({ lines: [] }),
  turns: z.array(z.strictObject({ at: z.iso.datetime(), customer: z.array(benchLine).min(1),
    scripted: z.array(scriptedResponse).default([]), good: z.string().max(600).optional(),
    expect: turnExpect })).min(1) });
// benchLine: { text, kind: text | image | document | audio, fileName?, transcript?, mayBePayment? }
// scriptedResponse: { text?: string; tools?: { name: NaturalToolName; arguments: object }[] } | { fail: AiFailure }
// turnExpect: { reply: boolean; quiet?: boolean; includes?: string[]; excludes?: string[]; tools?: NaturalToolName[];
//   notTools?: NaturalToolName[]; handOver?: NaturalHandOverReason | "none"; task?: NaturalTaskKind | "none";
//   allowEmoji?: boolean; script?: "latin" | "devanagari" }
// domain
export const NATURAL_BENCH_NOW = new Date("2026-11-16T06:30:00Z"); // Mon 16 Nov, 12 pm in Kolkata
export async function seedNaturalBenchAgency(tx: OrgTx, organizationId: string, storage: ObjectStorage, which: NaturalBenchAgency): Promise<void>;
export function naturalBenchModel(one: NaturalCase): MemoryAiModel;
export interface NaturalTurnRecord { at: Date; customer: string[]; answer: NaturalTestAnswer; expect: TurnExpect;
  good?: string; guardContext: GuardContext; flagContext: Parameters<typeof traceFlags>[1] } // as the turn's guards had them
export async function runNaturalCase(deps: { db: Database; ai: AiModel }, organizationId: string, one: NaturalCase): Promise<NaturalTurnRecord[]>;
export interface HardCheck { name: string; passed: boolean; detail: string | null }   // detail never holds a case's words
export function naturalHardChecks(one: NaturalCase, turns: readonly NaturalTurnRecord[]): HardCheck[];
export const SELF_WORDS = ["AI", "bot", "robot", "human", "insaan", "machine", "automated"]; // never said about itself
export const PROMPT_EXAMPLE_AMOUNTS = [875_000, 2_625_000, 200_000, 1_015_000, 645_000, 1_130_000, 2_260_000, 280_000, 560_000, 1_590_000]; // paise
```

Fixtures (spec 9.1), all invented, payment details and a QR on each:
- **T**: Kedarkantha Trek (Sankri; from Dehradun; 5 nights; triple tent sharing ₹9,499 per person, GST included;
  advance ₹3,000 per person; departures Sat 5, 12, 19, 26 Dec 2026; brochure); Brahmatal Trek (from Kathgodam;
  ₹10,499 triple; departures Sat 12 and 26 Dec 2026). Answers: safety (certified trek leader, oxygen, separate tents
  for women), children ("10 and above, with a parent"), cancellation, refunds, ID documents, payment methods.
- **M**: 30 trips from Delhi, none to Meghalaya; Manali–Solang priced by room (double ₹12,999, triple ₹11,499,
  quad ₹10,999 per person; pickup "Majnu ka Tilla, 6:30 pm"; departures Fri 4, 11, 18, 25 Dec; brochure); one trip
  under ₹8,000 for case 17; children answer "under 5 free".
- **one**: a single trip. **forty**: 40 trips, among them December snow treks under and over ₹10,000 (case 15).

Cases: one JSON file per spec 9.1 row (23) and one per single-turn check (6: "2 din se koi reply nahi", a group of 14,
an untranscribed voice note, a photo that isn't a payment, "sending this to my wife", "Hi, I saw your ad"), each with
the scripted responses a good agent gives, plus at least three negative variants whose scripted replies break a hard
check (an invented ₹24,999, a `book` with no offer, "your payment is received"), which the test expects to fail.
Hard checks (spec 9.2): no amount outside G1's set; no `book` without an accepted offer or the told shortcut; no
payment-received or confirmed claim, team commitment or typed payment detail; no brochure for an unnamed trip; no
follow-up outside 9 am to 9 pm; a reply where `reply` and silence where `quiet`; `hand_over` and `create_task` only as
the turn allows; none of `SELF_WORDS` about itself; the reply's script matches the customer's; no emoji unless
`allowEmoji`; no amount of `PROMPT_EXAMPLE_AMOUNTS` the fixture lacks.

- [ ] **Step 1: Write the failing test** `natural-bench.test.ts`: one `it` per case file, named by the case
  (`it(\`case ${one.number}: ${one.name}\`)`), expecting every hard check to pass (and every check of a negative
  variant named in its file to fail); plus `it("holds the 23 cases and 6 single-turn checks, each named once")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/bench`; expect FAIL.
- [ ] **Step 3: Implement** the seed, the scripted model (each turn's scripted responses in order; `{ fail }`
  becomes that failure), the replay (customer lines at each turn's `at`, agent lines from each answer's `history`,
  the state carried) and the checks.
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `test(ai): the natural agent's bench cases and hard checks`.

### Task 15: The bench with a real model: pass^3, the judge, the gate

**Files:**
- Create: `packages/domain/src/ai/bench/natural-judge.ts`
- Modify: `apps/api/src/console-agent-bench.ts`, `apps/api/src/agent-bench-report.ts`,
  `apps/api/src/console-agent-bench-start.ts` (read `AGENT_BENCH_JUDGE_MODEL` and `AI_AGENT_MODELS`),
  `scripts/dev/agent-bench.sh` (usage line)
- Test: `apps/api/test/console-agent-bench.test.ts`, `packages/domain/test/ai/natural/bench/judge.test.ts`

**Interfaces:**
- Consumes: `runNaturalCase`, `naturalHardChecks` (Task 14); lite's `liteDryRun` for `--agent current`.
- Produces:

```ts
export async function judgeReply(ai: AiModel, model: string, input: { caseName: string; customer: string[];
  reply: string[]; good: string }): Promise<number | null>;   // 1–5; null when the judge's answer isn't one
// command: pnpm agent:bench -- --agent natural|current [--runs 3] [--cases <folder>] [--report <file>] [--blind <folder>] [--fake]
export interface NaturalCaseRuns { one: NaturalCase; runs: { turns: NaturalTurnRecord[]; checks: HardCheck[];
  quality: (number | null)[]; waitMs: number[] }[] }
export interface NaturalGate { passed: boolean; everyCasePasses: boolean; qualityAverage: number | null;
  lowestQuality: number | null; p95WaitMs: number }
export function naturalGate(results: readonly NaturalCaseRuns[]): NaturalGate; // spec 9.4
```

Each case runs `--runs` times (default 3) at production settings and passes only when every run passes every hard
check (pass^3). The report (written outside the repository, as today) lists per case its runs, pass^3, the judge's
score per turn with a `good` text, and overall: wait p50 and p95 (ruling 19), calls per turn, hand-over, task and
`stay_quiet` rates, guard retries per 100 replies, tokens in, cached and out, and the line `GATE: PASS` or
`GATE: FAIL (<what missed>)`. The gate: every case passes, quality averages 4 or more with none below 3, p95 wait ≤
15 s; an unset judge fails it (ruling 20). `--agent current` plays the same customer lines through `liteDryRun` and
records transcripts and the hard checks that read words. `--blind <folder>` writes 20 transcripts, 10 per agent,
shuffled, as `blind.md`, with `blind-key.json` beside it. The 12 audit incidents and 30 to 50 real past chats live in
`~/.config/travel-crm/agent-cases/natural/` in the same case format and run with `--cases`; they never enter the
repository.

- [ ] **Step 1: Write the failing tests:** `it("passes a case only when all 3 runs pass")`,
  `it("fails the gate when p95 wait passes 15 s, or quality averages under 4, or a case scores under 3")`,
  `it("fails the gate when no judge is set")`, `it("reads the judge's score, and null for anything but 1 to 5")`,
  `it("writes 20 shuffled transcripts and their key for the blind read")` (with `--fake`).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/api-server test -- test/console-agent-bench.test.ts` and
  `pnpm --filter @travel-crm/domain test -- test/ai/natural/bench/judge.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `pnpm agent:bench -- --agent natural --fake`; expect PASS and a report whose last
  line is `GATE: FAIL (no judge)` (a fake run has no judge).
- [ ] **Step 5: Commit** `feat(ai): the natural bench's pass^3 runner, judge and gate`.

### Final check of the plan's branch

- [ ] Run `source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check` once, in the foreground (Docker up only for it,
  then stopped). Expected: green.
- [ ] Walk Try it once more on a phone and a desktop width against the dev database: "New agent", five lines that
  reach a quote, an offer and a yes; Why open on each. Nothing is sent from the dev number.
