# Natural agent, plan 2: going live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agencies a super admin moves to the new agent get it on their real WhatsApp chats: the worker runs the
natural turn and its follow-ups through lite's act, pause and follow-up plumbing, a failed model never leaves a
customer in silence, every turn's trace (with live hard checks) shows in the console, and an agency is switched only
after its own chats pass a private replay.

**Architecture:** Plan 1's loop, context, tools and guards are reused unchanged. This plan adds the live reads
(`natural/prepare.ts`), the live act (`natural/act*.ts`, composed from lite's act gates and money, send and lead
helpers, made reusable without changing lite), the live turn and its follow-up turn, the agent column
`ai_autopilot.agent` that routes each turn, natural traces in the existing store and console pages, retries in the
worker, a nightly endpoint check, and a console replay job that runs Plan 1's dry turn on an agency's recent chats.

**Tech Stack:** TypeScript (strict), Prisma 7.10 and Postgres 18 under row-level security, pg-boss jobs, tRPC, Next.js
with next-intl and shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-natural-whatsapp-agent-design.md`, sections 3.1, 3.5, 3.6, 4.3, 4.5, 5
(G7), 7 (concurrency, provider check), 8, 10. Plan 1 (`2026-11-15-natural-agent-1-try-it.md`) and its rulings bind
this plan.

## Global Constraints

- Plan 1's Global Constraints, all of them (model settings, caps, no fixed text but the fallback line, lite unchanged).
- Lite keeps its behaviour: a lite file changes only by an export, a widened type, an extracted function the old code
  now calls, or a new parameter whose default is lite's behaviour. `pnpm --filter @travel-crm/domain test -- test/ai/lite`
  stays green at every commit.
- Organization data only inside `db.forOrg` (or `asOrganization` in the console); never a `forOrg` inside another; a
  model call never inside a transaction.
- The migration only adds or widens, so it is applied by hand before the release deploys (deploy checklist).
- Every change staff make is audited in the same transaction (`recordAudit`); the console's changes also go to the
  platform log (`recordPlatformAudit`).
- Logs: the `Logger` port, ids and codes only, never a customer's words; job data holds ids only.
- Console: super admins change, support reads; times in `PLATFORM_TIME_ZONE`; every word a next-intl message.

## Review Focus

1. **A person replies while the model is thinking**: the act's gates must refuse, send nothing and keep nothing (lite's
   `assertStillAnswering`, now shared). Test in Task 5.
2. **The agent switched mid-chat** (natural → lite → natural): each agent starts its own facts, neither crashes on the
   other's `ai_chat.facts`, and no brochure goes twice. Test in Task 4.
3. **A retried job after the customer wrote again**: the newest-message check must end the old attempt quietly, and
   the fallback line must never follow a reply the newer turn already sent. Test in Task 8.
4. **The trace store failing** (R2 down): the turn's outcome stands and the customer's reply is unaffected (lite's
   sink already swallows; the natural record path must too). Test in Task 9.
5. **An erased customer's replay traces**: replay traces must expire and be erased like live ones, never outlive the
   customer. Test in Task 12.

## Rulings

1. **Who sets the agent.** `ai_autopilot.agent` is written only by `setAgent`, called from the platform module inside
   `asOrganization`, and the agency's own settings save never names it (a test reads it back after a save). — Spec 10.
   — None.
2. **Earlier assistants' lines** are AI lines (`ai:` token) that occurred before 2026-11-13T21:00:00Z: the one-agent
   release merged at 19:08 UTC that day, and its migration paused every agency until resumed, so no lite line came
   before. — Spec 4.3 needs a rule the data can apply. — A lite line from that evening masked; harmless.
3. **Automatic lines** are outbound lines with no `ai:` token and no `sentBy`.
4. **Sent brochures carry over.** On a chat's first natural turn the facts start fresh (spec 10) but `sentFileIds`
   is taken from lite's facts; a trip counts as sent when one of its file ids is in `sentFileIds`.
5. **Day cap and month limit:** no model call; the fallback line and a hand-over with the code-only reason `day_cap` or
   `month_limit` (not in the model's enum). — Plan 1 ruling 2. — None.
6. **No silence on model failure:** the job is sent again after 1 minute (attempt 1), then 5 (attempt 2); a third
   failure sends the fallback line with a `question` task holding the customer's new lines, and the AI stays on. Each
   attempt checks the newest message first. — Spec 3.6. — A customer waits up to 6 minutes for the fallback line.
7. **The act refusing a booking** (seats gone, a hold already there): if a call is left and 8 s remain, the loop runs
   once more on the final transcript plus `[app check, not from the customer] The seats couldn't be held: <reason>.
   Open: <dates>. Nothing was sent; reply again.`, with the earlier staged actions but `book` passed as `forced`; else
   the fallback line and a task. — Spec 3.2's last line. — None.
8. **Traces.** The trace file gains version 2, `{ version: 2, trace }` where `trace.agent` is `"lite"` or `"natural"`;
   version 1 files still read as lite. The index row gains `agent`, `cached_tokens` and `failed_checks`; `kind` widens
   to `reply | nudge | replay`; `prompt_versions` holds `{ "natural": "<version>" }` for a natural turn.
9. **Live hard checks** (Plan 1's `naturalHardChecks` minus the case's own expectations) run when the trace is
   recorded and are stored in it; the console lists the count. — Spec 10: "hard checks computed from live traces".
10. **The rollout gate's private replay** is a console job a super admin starts on the organization's page: the
    newest customer burst of each of the agency's last 20 chats with a customer line in the last 14 days, each run 3
    times as a dry natural turn (nothing sent), recorded as `replay` traces (14 days, erased with the customer); the
    platform log keeps counts only. Its AI calls count against the agency's month, as Try it's do. — Spec 10.
11. **The console process gets the AI settings** (key, base URL, model lists) for the replay and the endpoint check.
12. **The chat summary** for natural chats is written by the score job (spec 4.5): the natural act queues
    `ai.score` 30 minutes after each reply (job id `summary:<chat>:<newest inbound id>`), and the handler, for a
    natural chat quiet since, saves the insight's summary with amounts and dates removed, cut to 600 characters.
13. **Follow-ups:** the follow-up turn is one call whose only tool is `stay_quiet`, with a notice saying it is
    follow-up `<n>` of 2 since `<time>`; the worker's claim logic stays lite's. A 👍 reaction counts as an answer for
    natural follow-ups (`stillQuiet(…, { reactions: true })`); lite keeps its rule.
14. **Concurrency:** the worker's `AT_ONCE` goes from 3 to 6 for both agents (spec 7), measured from the traces.
15. **Tasks:** one assignee, the lead's owner, else the first member (by name) holding `leads:assign`; due in 2
    working hours (`addWorkingMinutes`); a `call_back` is due at `call_at` when given. A second open AI question on the
    lead joins the open AI question task (its text gains `\n— <question>`, cut at 500).
16. **The endpoint check** runs nightly at 02:30 in `PLATFORM_TIME_ZONE` in the console. For each model of the
    `sales_agent` list it reads OpenRouter's endpoint list and opens incident `ai.endpoints` (detail: the model's
    slug) when no zero-data-retention endpoint supports `tools`, `tool_choice`, `reasoning` and `max_tokens`.

## File ownership (Plans 2 and 3 run in parallel)

Plan 2 owns: `packages/db/prisma/schema/ai.prisma`, migration `20261215100000_natural_agent`,
`packages/domain/src/ai/{agent,agent-worker,agent-choice,insight}.ts`, `packages/domain/src/ai/natural/{prepare,chat-lines,act,act-money,act-send,act-lead,act-chat,hand-over-words,turn,nudge-turn,live-io,hard-checks-live}.ts`,
`natural/dry-turn.ts` (one widened type, Task 3),
the lite files named in Task 3, `packages/domain/src/ai/traces/*`, `packages/contracts/src/ai/{lite-trace,agent}.ts`,
`packages/contracts/src/platform/{ai-agent,ai-transparency,incidents}.ts`,
`packages/domain/src/platform/{agent-choice,agent-replay,ai-endpoints-check,ai-traces,ai-trace-detail}.ts`,
`packages/api/src/platform/routers/{ai-agent,ai-transparency}.ts`, `packages/integrations/src/ai/openrouter-endpoints.ts`,
`apps/api/src/{console-jobs,console-environment,worker-jobs}.ts`, `apps/web/src/console/organizations/organization/*`,
`apps/web/src/console/ai/*` except the prompt library screen, `docs/deploy-checklist.md`.
Shared with Plan 3, append-only: `packages/contracts/src/platform/index.ts`, `packages/domain/src/platform/index.ts`,
`apps/web/src/i18n/messages/en-IN/console-platform.json` (log-action sentences; the second plan to merge resolves the
one-line conflict). Plan 2 never touches `natural/prompt-source.ts`, `natural-try-it.ts`, the Try it screen or
`packages/db/src/for-org.ts`.

---

### Task 1: The agent column and the console's choice (data, domain, router)

**Files:**
- Create: `packages/db/prisma/migrations/20261215100000_natural_agent/migration.sql`,
  `packages/domain/src/ai/agent-choice.ts`, `packages/domain/src/platform/agent-choice.ts`,
  `packages/contracts/src/ai/agent.ts`
- Modify: `packages/db/prisma/schema/ai.prisma` (`AiAutopilot.agent`, `AiTurnTrace.agent`, `cachedTokens`,
  `failedChecks`), `packages/contracts/src/platform/ai-agent.ts`, `packages/api/src/platform/routers/ai-agent.ts`,
  `packages/domain/src/ai/index.ts`, `packages/domain/src/platform/index.ts`,
  `apps/web/src/i18n/messages/en-IN/{audit,console-platform}.json` (the two action sentences)
- Test: `packages/domain/test/ai/agent-choice.test.ts`, `packages/domain/test/platform/agent-choice.test.ts`,
  `packages/api/test/console-ai-agent.test.ts`, `packages/db/test/natural-agent-columns.test.ts`

**Interfaces:**
- Produces:

```ts
// contracts/src/ai/agent.ts
export const agentKinds = ["lite", "natural"] as const; export type AgentKind = (typeof agentKinds)[number];
// contracts/src/platform/ai-agent.ts
export const chooseAgentInput = z.strictObject({ organizationId: recordId, agent: z.enum(agentKinds) });
export const replaySummary = z.object({ at: z.iso.datetime(), chats: z.int(), passed: z.int(), failedChecks: z.record(z.string(), z.int()) });
export const organizationAgentChoice = z.object({ agent: z.enum(agentKinds), lastReplay: replaySummary.nullable(),
  replaying: z.boolean() });
// domain/ai/agent-choice.ts
export async function agentOf(tx: OrgTx): Promise<AgentKind>;          // "lite" when the agency has no ai_autopilot row
export async function setAgent(tx: OrgTx, actor: Actor, agent: AgentKind): Promise<{ changed: boolean }>;
// audited "ai-agent.agent-changed" { before: { agent }, after: { agent } }; creates the row when absent
// domain/platform/agent-choice.ts
export async function organizationAgentChoice(services: PlatformServices, organizationId: string): Promise<OrganizationAgentChoice>;
export async function chooseOrganizationAgent(services: PlatformServices, staff: PlatformActor, input: ChooseAgentInput): Promise<OrganizationAgentChoice>;
// platform log "ai-agent.agent-chosen" { before: { agent }, after: { agent } }, targetOrganizationId set
// router ai-agent.ts: agentChoice: staffProcedure (query); chooseAgent: superAdminProcedure (mutation)
```

Migration SQL: `ALTER TABLE ai_autopilot ADD COLUMN agent text NOT NULL DEFAULT 'lite'` with
`CONSTRAINT ai_autopilot_agent_value CHECK (agent IN ('lite', 'natural'))`; `ai_turn_trace` gains `agent text NOT NULL
DEFAULT 'lite'` (CHECK the same two), `cached_tokens integer NOT NULL DEFAULT 0` and `failed_checks smallint NOT NULL
DEFAULT 0` (both ≥ 0), and `ai_turn_trace_kind_value` is dropped and added again as `kind IN ('reply', 'nudge',
'replay')`. A header comment says it only adds or widens and is applied by hand before the release.

- [ ] **Step 1: Write the failing tests:** `it("reads lite for an agency that never chose")`,
  `it("records a change in the agency's audit log under the admin's name, and nothing when unchanged")`,
  `it("leaves the agent as it was when the agency saves its own settings")` (`saveAiSettings`, then `agentOf`),
  `it("writes the choice to the platform log and the agency's audit log")`, router tests `it("lets support read the
  choice and refuses support's change")`, `it("refuses an unknown agent")`, and in `natural-agent-columns.test.ts`
  `it("refuses an agent outside lite and natural, and a trace kind outside reply, nudge and replay")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/natural-agent-columns.test.ts`,
  `pnpm --filter @travel-crm/domain test -- test/ai/agent-choice.test.ts test/platform/agent-choice.test.ts` and
  `pnpm --filter @travel-crm/api test -- test/console-ai-agent.test.ts`; expect FAIL.
- [ ] **Step 3: Implement:** the migration by hand and the schema to match it (`pnpm migrations:check` in Step 4
  proves they agree), then `pnpm --filter @travel-crm/db generate`.
- [ ] **Step 4: Run** the same and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): super admins choose each agency's agent`.

### Task 2: The choice on the organization's console page

**Files:**
- Create: `apps/web/src/console/organizations/organization/organization-agent-choice.tsx`
- Modify: `apps/web/src/console/organizations/organization/organization-screen.tsx` (beside the pause),
  `apps/web/src/i18n/messages/en-IN/console-organizations.json`
- Test: `apps/web/test/console/organizations/organization-agent-choice.test.tsx`

**Interfaces:**
- Consumes: `aiAgent.agentChoice`, `aiAgent.chooseAgent`, `aiAgent.replayRecentChats` (Task 12; the button is added
  there) through `useConsoleTRPC()`.
- Produces: `OrganizationAgentChoice({ organizationId, organizationName })`.

A Card titled "Agent" under the pause: the current agent in words ("Current agent (lite)" / "New agent"), the last
replay's result when there is one, and for a super admin a "Change agent" button opening `ConfirmDialog` (rule 7) that
names the agency and the agent it moves to, and lists the gate before a move to the new agent: the bench gate passed
on this release, the replay passed, the owner tried it in Try it. Support sees the same card without the button.

- [ ] **Step 1: Write the failing tests:** `it("shows the agency's agent and the last replay")`,
  `it("lets a super admin change it after confirming, and lists the gate first")`, `it("shows support no button")`,
  `it("holds the dialog while the change is pending")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/console/organizations/organization-agent-choice.test.tsx`;
  expect FAIL.
- [ ] **Step 3: Implement** with `Card`, `ConfirmDialog`, `Details`, `RefusalAlert`; `isSuperAdmin(useStaff())`.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/web test -- test/no-hand-drawn-borders.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): the console shows and changes an agency's agent`.

### Task 3: Lite's pieces made reusable, with no change in what lite does

**Files:**
- Create: `packages/domain/src/ai/lite/turn-gates.ts`, `packages/domain/src/ai/lite/act-gates.ts`
- Modify: `lite/prepare.ts` (calls `turnGates`), `lite/act.ts` (imports the gates), `lite/act-money.ts` (extract
  `payAgainBooking`), `lite/lead-writes.ts` (extract `writeAiTripFields`), `lite/prepare-lead.ts` (export
  `typedByPerson`), `lite/follow-ups.ts` (`stillQuiet` options), `lite/counted-call.ts` (`CallEnvironment.db` widened
  to `Pick<Database, "forOrg">`), `natural/dry-turn.ts` (`deps.db` widened the same way)
- Test: the existing lite suite, plus `packages/domain/test/ai/lite/follow-ups.test.ts` (one case)

**Interfaces:**
- Produces:

```ts
// lite/turn-gates.ts: everything prepareLiteTurn checked before its reads, in the same order
export async function turnGates(tx: OrgTx, input: LiteTurnInput, now: Date):
  Promise<{ settings: AutopilotRow; chat: ChatRow & { phoneE164: string; profileName: string | null }; timeZone: string;
    today: CalendarDate; sellable: { id: string; kind: string }[] } | LiteOutcome>;
// lite/act-gates.ts (moved from act.ts unchanged)
export async function stoppedSince(tx: OrgTx, input: ActGateInput, chat: ChatRow, options?: { reactions?: boolean }): Promise<string | null>;
export async function assertNewest(tx: OrgTx, input: ActGateInput): Promise<void>;
export async function assertNotPaused(tx: OrgTx, input: ActGateInput): Promise<void>;
export async function assertStillAnswering(tx: OrgTx, input: ActGateInput): Promise<void>;
export type ActGateInput = Pick<LiteActInput, "organizationId" | "conversationId" | "token" | "kind" | "now" | "timeZone">;
// lite/act-money.ts
export async function payAgainBooking(tx: OrgTx, deps: LiteActDeps, input: ActGateInput & { today: CalendarDate },
  leadId: string | null): Promise<{ bookingId: string | null; expectedPaise: number; totalPaise: number; payment: AgencyPaymentDetails }>;
// lite/lead-writes.ts
export async function writeAiTripFields(tx: OrgTx, input: { organizationId: string; leadId: string;
  values: Partial<Record<TripField, unknown>>; today: CalendarDate }): Promise<AiFilledField[]>;
// lite/follow-ups.ts
export async function stillQuiet(tx: OrgTx, conversationId: string, options?: { reactions?: boolean }): Promise<boolean>;
```

- [ ] **Step 1: Write the failing test:** `it("counts a reaction as an answer only when asked to")` in
  `follow-ups.test.ts`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/lite/follow-ups.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** the extractions; lite's callers call the new functions where they had the bodies.
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai` (lite's turn, act, gates, sales,
  turn-cost and bench tests included); expect PASS with no lite test edited.
- [ ] **Step 5: Commit** `refactor(ai): share lite's gates, act checks and lead writes, unchanged`.

### Task 4: The live turn's reads

**Files:**
- Create: `packages/domain/src/ai/natural/chat-lines.ts`, `packages/domain/src/ai/natural/prepare.ts`
- Test: `packages/domain/test/ai/natural/prepare.test.ts` (database; a natural agency with a connected number)
- Create: `packages/domain/test/ai/natural/support/live-agency.ts` (Plan 1's `naturalAgency` plus a connected
  number, a customer, the AI on and `agent = 'natural'`)

**Interfaces:**
- Consumes: `turnGates`, `typedByPerson`, `mayBePayment`, `adPackageOf`, `openLeadOfChat`, `tripSheetsOf`,
  `agencyAnswersOf`, `agentBasicsOf`, `agencyPaymentDetailsOf`, `naturalFacts`.
- Produces:

```ts
export const EARLIER_AGENTS_UNTIL = new Date("2026-11-13T21:00:00Z"); // ruling 2
export const CHAT_READ = 60;                                           // newest lines read; the context keeps 40
export async function naturalChatLines(tx: OrgTx, conversationId: string):
  Promise<{ lines: NaturalChatLine[]; senders: ReadonlyMap<string, string> }>; // line id → the team member's user id
export function withTeamNames(lines: readonly NaturalChatLine[], senders: ReadonlyMap<string, string>,
  contacts: readonly MemberContact[]): NaturalChatLine[];                       // after the transaction
export interface NaturalPrepared {
  chat: ChatRow & { phoneE164: string; profileName: string | null }; timeZone: string; today: CalendarDate;
  sheets: TripSheet[]; answers: AgencyAnswers; voice: AgentVoice; facts: NaturalFacts; lead: NaturalLeadView;
  leadId: string | null; typed: TypedFields; lines: NaturalChatLine[]; adPackageId: string | null;
  cameFrom: NaturalContextInput["cameFrom"]; booking: { id: string; awaitingPayment: boolean; paymentConfirmed: boolean;
  confirmed: boolean } | null; paymentReady: boolean; lastInboundAt: Date; supplierStateCode: string | null;
  repliesToday: number; dayCap: number; monthFull: boolean }
export async function prepareNaturalTurn(deps: LiteDependencies, input: LiteTurnInput, now: Date): Promise<NaturalPrepared | LiteOutcome>;
```

`LiteDependencies.identity` widens its `Pick` to add `memberContacts` and `membersHolding` (read before any
transaction opens: identity's calls run their own). The chat lines (spec 4.3, rulings 2–3): `from` by direction, `ai:`
token (`you`, or `earlier` before `EARLIER_AGENTS_UNTIL`), `sentBy` (`team`, with the member's first name from
identity's `memberContacts`) or neither
(`automatic`); an AI file message becomes `action: "sent: <caption>"`; the payment lines message (`:pay`) and the QR
(`:qr`) become `action: "sent: payment details"`; a customer's voice note with no transcript is `untranscribed`; new
media gets `mayBePayment` from `mayBePayment`. Facts: a natural row's facts as stored (trip facts reset when the
lead changed, as lite's `factsForLead` does); any other row starts `naturalFacts` with lite's `sentFileIds` (ruling 4).
The day cap and the month's limit come back as data (`repliesToday`, `monthFull`) instead of ending the turn, so the
turn can hand over (ruling 5); every other gate ends it as lite's does.

- [ ] **Step 1: Write the failing tests:** `it("labels customer, our, team, earlier and automatic lines")`,
  `it("marks AI files, payment lines and the QR as sent actions")`, `it("names a team member by first name")`,
  `it("starts fresh facts on a chat lite answered, keeping the files it sent")` (Review Focus 2),
  `it("keeps a natural chat's facts, and resets its trip facts when the lead changed")`,
  `it("ends the turn as lite does when the agent is off, paused or a person is answering")`,
  `it("hands the day cap and the month's limit back as data")`, `it("reads a person's lead values as typed")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/prepare.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural turn's live reads`.

### Task 5: The live act

**Files:**
- Create: `packages/domain/src/ai/natural/act.ts`, `act-money.ts`, `act-send.ts`, `act-lead.ts`, `act-chat.ts`,
  `hand-over-words.ts`
- Test: `packages/domain/test/ai/natural/act.test.ts` (database, `liveAgency`)

**Interfaces:**
- Consumes: `act-gates.ts`, `payAgainBooking`, `takeAgentBooking`, `writeAiTripFields`, `sendAiText`, `sendAiFile`,
  `addAiLeadNote`, `createTask`, `advanceLeadStage`, `suggestStage`, `tellOwner`, `paymentLinesOf`, `lockChat`.
- Produces:

```ts
export interface NaturalActInput extends ActGateInput { today: CalendarDate; messages: string[]; staged: StagedSet;
  quoted: QuoteFigures[]; facts: NaturalFacts; sheets: readonly TripSheet[]; typed: TypedFields;
  handOver: { reason: string; summary: string } | null;   // the model's, or code's (day_cap, month_limit, payment_check)
  task: { kind: NaturalTaskKind; text: string } | null;    // the fallback's task
  traceId: string; model: string | null; agencyName: string }
export interface NaturalActDeps extends LiteActDeps { taskOwner: string | null; workingHours: WorkingHours }
export type NaturalActResult = "already" | { stopped: string } | { refused: string; message: string }
  | { leadId: string | null; sentIds: string[]; bookingId: string | null; handedOver: boolean; actions: string[]; facts: NaturalFacts };
export async function actOnNaturalTurn(tx: OrgTx, deps: NaturalActDeps, input: NaturalActInput): Promise<NaturalActResult>;
```

The order (spec 3.2 and lite's act): lock the chat; `ai:<token>` already sent → `"already"`; `stoppedSince`;
`assertNewest`; `assertNotPaused`; the open lead; money (`book` through `takeAgentBooking` with
`toldTotalPaise = figures.totalPaise` and `expectedPaise` the advance, or the total when `payInFull`;
`resend_payment` through `payAgainBooking`); the sends: message one `ai:<token>`, message two `ai:<token>:m2`,
brochure files `ai:<token>:f1`…`:f3` captioned with the trip's title, then after a hold or `resend_payment` the payment
lines as one text `ai:<token>:pay` and the QR `ai:<token>:qr`; the lead (fields, notes, tasks per ruling 15,
`suggest_close`, the stage forward only: a reply `contacted`, an offer or a told total `quote_sent`); the hand-over and
`tellOwner` (`handoffReason` and the notice's body are `<the reason's sentence>: <the model's summary>`, cut to the
column's limit; the sentences, one per natural reason and per `day_cap`/`month_limit`, live in
`natural/hand-over-words.ts`, English as lite's `act-words.ts`); `assertStillAnswering`; the chat (`ai_chat.facts` as the next natural facts, the day's count,
`lastReplyAt`, `followUpAt`/`followUpReason` from `plan_follow_up`, `followUpsSent` reset after a reply, the hand-over);
`assertNotPaused` again. A `DomainError` from a booking comes back as `{ refused, message }` after the rollback.

- [ ] **Step 1: Write the failing tests:**

```ts
it("sends the words as one or two messages with ai: tokens, and nothing twice for a repeated token", …);
it("holds the seats, then sends the agency's payment lines and QR after the words", async () => {
  expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:pay`, `ai:${token}:qr`]);
  expect(textOf(sent[1])).toBe("UPI: casetrips@okhdfc");
});
it("sends a brochure's files captioned with the trip's title", …);
it("saves update_lead's fields AI-marked, and a person's value stays with the other as a note", …);
it("assigns a task to the lead's owner, due in 2 working hours, and joins a second question to the open one", …);
it("moves the stage forward only", …);
it("hands over, tells the owner, and keeps the reason", …);
it("plans the follow-up the model chose, in waking hours", …);
it("sends nothing and keeps nothing when a person replied while the model worked", …); // Review Focus 1
it("rolls everything back and answers refused when the seats went", …);
it("rolls everything back when the agent was paused during the act", …);
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/act.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** (each file under ~200 lines; `act.ts` only orders the steps).
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural turn's act, in lite's one transaction`.

### Task 6: The live turn, and routing by agent

**Files:**
- Create: `packages/domain/src/ai/natural/live-io.ts`, `packages/domain/src/ai/natural/turn.ts`
- Modify: `packages/domain/src/ai/agent.ts`
- Test: `packages/domain/test/ai/natural/turn.test.ts` (database, memory model), `packages/domain/test/ai/agent-routing.test.ts`

**Interfaces:**
- Consumes: `prepareNaturalTurn` (Task 4), `actOnNaturalTurn` (Task 5), Plan 1's `buildNaturalContext`,
  `runNaturalLoop`, `countedModel`, `stageAction`, `checkWords`, `groundedAmounts`, `startNaturalTrace`,
  `naturalPromptOf`, `fallbackLine`, `openLeadForChat`, `agentOf` (Task 1).
- Produces:

```ts
export function liveLoopIO(deps: LiteDependencies, prepared: NaturalPrepared, input: LiteTurnInput, now: Date): LoopIO;
// newerLine: an inbound message newer than input.token; read/quoteOf in db.forOrg; stage with the live ActionContext
export async function runNaturalTurn(deps: LiteDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome>;
// outcomes: replied | quiet | handed_off | fallback | superseded | model_failed | answered | paused | stopped | blocked,
// plus prepare's gates
// agent.ts: runAgentTurn reads agentOf(tx) fresh in the pause's transaction and calls runNaturalTurn or runLiteTurn
```

The turn: prepare; at the day cap or a full month, act the fallback line with the code hand-over (ruling 5); new
payment media or an untranscribed voice note (Plan 1 ruling 6) builds the context without tools and with the notice,
and stages `hand_over(payment_check)` for the media; a returning customer with no open lead gets one opened first
(`openLeadForChat`, its own transaction) when a staged action needs a lead; the loop; `model_failed` returns at once
(the worker retries, Task 8); the act; a refused booking takes ruling 7's one more call; the trace is recorded
(Task 9) whatever the end. `runAgentTurn` keeps its checks (configured, allowed, paused) and names the agent in its log
line.

- [ ] **Step 1: Write the failing tests:**

```ts
it("answers a customer through the natural turn when the agency's agent is natural, and lite otherwise", …);
it("reads the agent at every turn, so a change applies to the next message", …);
it("sends what the model wrote, after its tools, with every request free of a temperature", …);
it("supersedes quietly when the customer writes again during the loop", …);
it("hands over with the fallback line at the day cap, without a model call", …);
it("thanks for a payment screenshot in the model's words and hands over for payment_check", …);
it("takes one more call when the act can't hold the seats, and offers the open date", …);
it("ends model_failed with nothing sent when the model can't answer", …);
it("opens a lead for a returning customer before it offers", …);
it("lets lite, switched back, start fresh facts on a chat the natural agent answered", …); // Review Focus 2
```

- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/turn.test.ts test/ai/agent-routing.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/lite/one-agent.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the worker answers with the natural agent where it is chosen`.

### Task 7: The natural follow-up turn

**Files:**
- Create: `packages/domain/src/ai/natural/nudge-turn.ts`
- Modify: `packages/domain/src/ai/natural/turn.ts` (a `nudge` input goes to it)
- Test: `packages/domain/test/ai/natural/nudge-turn.test.ts`

**Interfaces:**
- Consumes: lite's `prepareNudge` gates, `stillQuiet(…, { reactions: true })`, `inWakingHours`, the loop with tools
  `[stay_quiet]` only.
- Produces: `runNaturalNudge(deps: LiteDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome>`.

- [ ] **Step 1: Write the failing tests:** `it("follows up once in the model's words, in waking hours")`,
  `it("stays quiet when the model calls stay_quiet, and sends nothing")`,
  `it("offers the model no tool but stay_quiet")`, `it("treats a 👍 reaction as an answer and sends nothing")`,
  `it("checks the words with the same guards")`, `it("sends no third follow-up")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/nudge-turn.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/lite/follow-up-turn.test.ts`;
  expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the natural agent's follow-ups`.

### Task 8: No silence: retries in the worker

**Files:**
- Modify: `packages/domain/src/ai/agent-worker.ts`, `packages/contracts/src/ai/autopilot.ts` (`aiReplyJob.attempt`),
  `packages/domain/src/ai/natural/turn.ts` (`runNaturalFallback`)
- Test: `packages/domain/test/ai/agent-worker-retries.test.ts`

**Interfaces:**
- Produces: `aiReplyJob` gains `attempt: z.int().min(0).max(2).default(0)`;
  `RETRY_AFTER_MS = [60_000, 300_000] as const`; `AT_ONCE = 6`;
  `runNaturalFallback(deps, input, now): Promise<LiteOutcome>` (acts the fallback line and a `question` task holding
  the customer's new lines; no model call).

- [ ] **Step 1: Write the failing tests:** `it("sends the job again after a minute, then five, when the model fails")`
  (memory queue: `startAfter` and `attempt`), `it("sends the fallback line and a task after the third failure, and the
  AI stays on")`, `it("ends an old attempt quietly when the customer wrote since")` (Review Focus 3),
  `it("runs six chats at once")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/agent-worker-retries.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** The job id of a retry is `<messageId>:<attempt>` so pg-boss keeps each.
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a failed model retries, then the fallback line, never silence`.

### Task 9: Natural traces in the store, with live hard checks

**Files:**
- Create: `packages/domain/src/ai/natural/hard-checks-live.ts`
- Modify: `packages/contracts/src/ai/lite-trace.ts` (`storedTraceFile` versions 1 and 2, `storedNaturalTrace`),
  `packages/domain/src/ai/traces/{trace-sink,trace-file,trace-reads}.ts`, `packages/domain/src/ai/lite/types.ts`
  (`TraceSink.record` takes `TurnTrace`), `packages/domain/src/ai/natural/turn.ts` (records)
- Test: `packages/domain/test/ai/traces/natural-traces.test.ts`, `packages/contracts/test/ai/trace-file.test.ts`

**Interfaces:**
- Produces:

```ts
export const storedNaturalTrace = naturalTrace.extend({ id: z.string(), startedAt: z.coerce.date(),
  conversationId: z.string(), leadId: z.string().nullable(), kind: z.enum(["reply", "nudge", "replay"]),
  messageIds: z.array(z.string()), sentIds: z.array(z.string()),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().nullable() })) });
export const storedTraceFile = z.union([z.object({ version: z.literal(1), trace: storedLiteTrace }),
  z.object({ version: z.literal(2), trace: z.discriminatedUnion("agent", [storedLiteTrace.extend({ agent: z.literal("lite") }), storedNaturalTrace]) })]);
export type TurnTrace = LiteTrace | NaturalStoredTrace;
export function liveHardChecks(trace: NaturalTrace, context: { guards: GuardContext; flags: Parameters<typeof traceFlags>[1];
  customerText: string; staged: StagedSet; followUpAt: Date | null; timeZone: string }): HardCheck[];
```

The index row for a natural trace: `agent: "natural"`, `move: null`, `saleStage: null`, `model` the first call's,
tokens summed over calls, `cachedTokens` summed, `failedChecks` the count, `promptVersions: { natural: version }`.
New traces are written as version 2; the reader accepts both.

- [ ] **Step 1: Write the failing tests:** `it("keeps a natural turn's trace with its calls, tools, guards and prompt
  version")`, `it("still opens a version 1 lite file")`, `it("counts failed live hard checks on the row")`,
  `it("keeps the reply when the trace can't be stored")` (Review Focus 4: storage `put` throws; the turn's outcome is
  `replied` and the message was sent), `it("finds an amount outside the agency's prices, a claim of payment, a self
  word, a script mismatch and a follow-up at night in a live trace")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/traces` and
  `pnpm --filter @travel-crm/contracts test -- test/ai/trace-file.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/platform/ai-traces.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): natural turns keep traces with live hard checks`.

### Task 10: Natural traces in the console's AI turns pages

**Files:**
- Modify: `packages/contracts/src/platform/ai-transparency.ts` (`aiTraceRow.agent`, `failedChecks`; the detail a
  union by agent), `packages/domain/src/platform/{ai-traces,ai-trace-detail}.ts`,
  `apps/web/src/console/ai/{ai-traces-screen,ai-trace-table,ai-trace-items,ai-trace-screen,ai-trace-parts}.tsx`,
  `apps/web/src/i18n/messages/en-IN/console-ai.json`
- Create: `apps/web/src/console/ai/natural-trace-calls.tsx`
- Test: `packages/domain/test/platform/ai-traces.test.ts`, `apps/web/test/console/ai/ai-trace-screen.test.tsx`,
  `apps/web/test/console/ai/ai-traces-screen.test.tsx`

**Interfaces:**
- Produces: `aiTraceRow` gains `agent: z.enum(agentKinds)` and `failedChecks: z.int()`; `aiTraceListInput` gains
  `agent?` and `kind?` filters; `aiTraceDetail` becomes `z.discriminatedUnion("agent", [liteDetail, naturalDetail])`;
  `NaturalTraceCalls({ trace })`.

The list shows the agent, the kind (a replay marked), the outcome and a failed-checks count with `StatusDot`. A
natural trace's page shows the prompt version, the outcome and fallback, then each call (model, time, tokens in /
cached / out / reasoning, words, each tool `name(arguments) → result` with refusals marked), the guards' verdicts, the
staged actions, the flags, the live hard checks, and the messages sent (as lite's page shows them).

- [ ] **Step 1: Write the failing tests:** `it("lists both agents' turns with the agent, kind and failed checks")`,
  `it("filters to replays")`, `it("opens a natural turn on its calls, tools, guards and checks")`,
  `it("still opens a lite turn as before")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/platform/ai-traces.test.ts` and
  `pnpm --filter @travel-crm/web test -- test/console/ai`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(web): the console shows the natural agent's turns`.

### Task 11: The chat summary from the score job

**Files:**
- Modify: `packages/domain/src/ai/insight.ts`, `packages/domain/src/ai/natural/act-chat.ts` (queues the job)
- Test: `packages/domain/test/ai/natural/summary.test.ts`

**Interfaces:**
- Produces: `SUMMARY_QUIET_MS = 30 * 60_000`; `NATURAL_SUMMARY_MAX = 600`; the score handler, for a chat whose agency's
  agent is natural and whose newest customer line is 30 minutes old or more, saves `saveChatSummary(tx, chatId,
  cut(withoutAmountsAndDates(insight.summary), 600))`.

- [ ] **Step 1: Write the failing tests:** `it("writes a natural chat's summary 30 minutes after the last reply, with no
  prices or dates")`, `it("leaves lite chats' summaries to lite")`, `it("writes nothing while the chat is still
  active")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural/summary.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** (ruling 12).
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/domain test -- test/ai/ai-step-one.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the score job keeps natural chats' summaries`.

### Task 12: The private replay before a switch

**Files:**
- Create: `packages/domain/src/platform/agent-replay.ts`
- Modify: `packages/contracts/src/platform/ai-agent.ts` (`replayRecentChatsInput`), `packages/api/src/platform/routers/ai-agent.ts`
  (`replayRecentChats: superAdminProcedure`), `apps/api/src/console-jobs.ts` (the job), `apps/api/src/console-environment.ts`
  (AI settings, ruling 11), `apps/web/src/console/organizations/organization/organization-agent-choice.tsx` (the
  button), `apps/web/src/i18n/messages/en-IN/{console-organizations,console-platform}.json`
- Test: `packages/domain/test/platform/agent-replay.test.ts`, `apps/web/test/console/organizations/organization-agent-choice.test.tsx`

**Interfaces:**
- Consumes: `naturalDryTurn` (Plan 1, `deps.db` widened in Task 3), `naturalChatLines` (Task 4), `liveHardChecks`
  (Task 9), `createTraceSink`, `asOrganization`.
- Produces:

```ts
export const AGENT_REPLAY_QUEUE = "platform.agent-replay";
export const REPLAY_CHATS = 20; export const REPLAY_RUNS = 3; export const REPLAY_DAYS = 14;
export async function startAgentReplay(services: PlatformServices, staff: PlatformActor, organizationId: string): Promise<void>; // queues; CONFLICT while one runs
export function agentReplayHandler(services: PlatformServices & { ai: AiModel; traces: TraceSink }): JobHandler;
// platform log "ai-agent.replayed" { after: { chats, passed, failedChecks } }: counts only
```

The job runs every organization step through `asOrganization` in its own platform transaction, one at a time
(`forOrg = (id, fn) => services.platformDb.transaction((tx) => asOrganization(tx, id, fn))`). For each chat it cuts the
lines just before the newest customer burst's first reply (or at the end when unanswered), runs the dry turn 3 times
with the published prompt, records each run as a `replay` trace with its live hard checks, and counts a chat as passed
when all 3 runs pass every check.

- [ ] **Step 1: Write the failing tests:** `it("replays the newest burst of each recent chat 3 times and sends
  nothing")`, `it("records replay traces that expire and are erased with the customer")` (Review Focus 5),
  `it("writes counts only to the platform log")`, `it("refuses a second replay while one runs")`,
  `it("shows the button to super admins and the result when it ends")` (web).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/platform/agent-replay.test.ts` and the web test;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a private replay of an agency's chats before it moves`.

### Task 13: The nightly endpoint check

**Files:**
- Create: `packages/integrations/src/ai/openrouter-endpoints.ts`, `packages/domain/src/platform/ai-endpoints-check.ts`
- Modify: `packages/integrations/src/ai/index.ts`, `packages/contracts/src/platform/incidents.ts` (`ai.endpoints`),
  `apps/api/src/console-jobs.ts` (schedule), `apps/web/src/i18n/messages/en-IN/console-platform.json` (the incident's
  sentence), `docs/deploy-checklist.md`
- Test: `packages/integrations/test/ai/openrouter-endpoints.test.ts`, `packages/domain/test/platform/ai-endpoints-check.test.ts`

**Interfaces:**
- Produces:

```ts
export interface EndpointGap { model: string; missing: ("zdr" | "tools" | "tool_choice" | "reasoning" | "max_tokens")[] }
export async function zeroRetentionGaps(options: { models: readonly string[]; apiKey?: string; fetch?: typeof fetch;
  baseUrl?: string }): Promise<EndpointGap[] | { unreadable: true }>;
export const AI_ENDPOINTS_QUEUE = "platform.check-ai-endpoints"; // cron "30 2 * * *", PLATFORM_TIME_ZONE
export async function checkAiEndpoints(services: PlatformServices, check: () => ReturnType<typeof zeroRetentionGaps>, now: Date): Promise<number>;
```

Before writing the parser, read OpenRouter's documentation of its endpoint listing and zero-data-retention fields, and
put the exact URL and a trimmed real response (no key) in the test's fixture with the date read. An unreadable answer
opens no incident and logs a warning.

- [ ] **Step 1: Write the failing tests:** `it("finds a model whose ZDR endpoints lack tools or reasoning")`,
  `it("finds none when one ZDR endpoint supports all four")`, `it("opens one ai.endpoints incident per gap")`,
  `it("opens none when the list can't be read")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/integrations test -- test/ai/openrouter-endpoints.test.ts` and
  `pnpm --filter @travel-crm/domain test -- test/platform/ai-endpoints-check.test.ts`; expect FAIL.
- [ ] **Step 3: Implement**, and add to the deploy checklist: the console's AI settings (ruling 11), the migration
  `20261215100000_natural_agent` applied by hand before the release, and the endpoint check.
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a nightly check that the agent's models keep private routes with tools`.

### Release and the first agency

- [ ] `pnpm check` green, in the foreground, Docker up only for it.
- [ ] Apply `20261215100000_natural_agent` by hand on production before the release deploys (deploy checklist).
- [ ] The first agency, in this order (spec 10): `pnpm agent:bench -- --agent natural` reports `GATE: PASS` on the
  release; the console replay of that agency passes (every chat 3 of 3); the owner tries it in Try it and says yes;
  a super admin changes the agent; for a week, someone reads its traces daily, filtering failed checks. Switching back
  is the same console change.
