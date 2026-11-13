# Around the lite agent's turn (plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What surrounds the lite turn of plan 3a: its two follow-ups inside the window and the waking hours, a trace of
every turn (an index row plus a gzip file, kept 14 days, erased with the customer and the organization), the violet
"what the AI changed" on the lead page, the inbox panel and the Leads list with "Looks right", and Lost / Not a lead
suggestions the owner answers from the lead or the AI agent page's "Needs you".

**Architecture:** Follow-ups reuse the minute's nudge job (`runAiNudges` → `nudgeAgency` → `runAgentTurn` kind
`nudge`), with a counter on `ai_chat` and a pure timing function. Traces are written through plan 3a's `TraceSink`: a
row in `ai_turn_trace` first, then `organizations/<id>/ai-traces/<yyyy-mm-dd>/<id>.json.gz` in object storage; the
console's hourly sweep deletes both after 14 days, or at once for an erased customer. The violet UI reads
`lead_ai_field` and plan 3a's timeline marks; suggestions are rows in `lead_ai_suggestion` the lite act writes.

**Tech Stack:** Postgres 18 + Prisma 7.10.0, domain TypeScript, `node:zlib` (gzip), the `ObjectStorage` port,
tRPC, Next.js + next-intl + shadcn registry components (Popover, Alert, Item, Button, Badge), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-lite-whatsapp-agent-design.md` (A13 and D9, D10, N3; B14, B18; C3, C4;
"Transparency for super admins" V1-V3; "What the AI changed, at a glance" A1, A2; Screens: Overview). Binding
refinements: `.superpowers/sdd/plan3-carry-forward.md`. Code map: `.superpowers/sdd/plan3-code-map.md`. Builds on plan
3a: `docs/superpowers/plans/2026-11-12-lite-agent-turn.md`, whose names (`Move`, `Decision`, `LiteFacts`, `LiteTrace`,
`TraceSink`, `actOnMove`, `runLiteTurn`, `writeMoveOf`, `decide`, `liteAgentOn`) this plan uses as 3a defines them.

## Global Constraints

- Everything in plan 3a's Global Constraints holds here (implementer rules, code map, additive, gates, no customer
  words in logs, audits or notifications, `countedCall`, migrations after 3a's, sentences for new reasons and actions).
- This plan changes plan 3a's files only where a task's Files list says; a change to a fixed prompt piece's text bumps
  its version in `lite/prompts/library.ts` and the library test's pin.
- Follow-ups: at most 2 per silence (about 4 h after our reply, about 20 h after their last message), 9 am to 9 pm in
  the agency's time zone, inside WhatsApp's 24-hour window less the existing 1-hour margin, none after ok/thanks, not
  interested or later; a follow-up due while paused is let go (plan 1 stays).
- A trace holds customer words, the one exception to "no personal data": super admins only (plan 4 shows it), kept 14
  days, erased with the customer and with the organization. No R2 lifecycle rule is assumed: the sweep is the
  retention. A trace that can't be written never changes or delays the turn's outcome.
- UI: the owner's UI rules in `CLAUDE.md` (registry components only, no border/divide/ring/shadow classes outside
  `components/ui`, no recolouring, every word a next-intl message, 44px targets, `useWriteAccess` on buttons that
  change things, `RefusalAlert`, `LoadingRows`). Violet (`people` tokens) marks what the AI wrote; it is information,
  never a button.

## Review Focus

1. A customer writes at 11:50 pm: no follow-up before 9 am, and the second lands inside the 24-hour window or not at
   all (Task 1 timing table).
2. An "ok thanks" or "not interested" after the first follow-up: the second never goes (Task 1 test).
3. The storage write of a trace fails: the customer still got the reply, the turn's outcome is unchanged, and the sweep
   later removes the row whose file is missing without error (Task 2 and Task 3 tests).
4. A customer is erased while their chat has traces: their files and rows go at the next sweep, another customer's in
   the same agency stay (Task 3 test).
5. The owner taps "Yes" on a Lost suggestion for a lead someone already moved to Booking requested: the lead stays
   where it is and the suggestion closes (Task 6 test).

---

### Task 1: Follow-ups: two at most, in waking hours, inside the window

Code map: sections 1 (`nudgeAgency`, `runAiNudges`, `planFollowUp`), 0 (item 4: no quiet hours exist).

**Files:**
- Create: `packages/db/prisma/migrations/20261212100000_lite_follow_ups/migration.sql`,
  `packages/domain/src/ai/lite/follow-ups.ts`
- Modify: `packages/db/prisma/schema/ai.prisma` (`AiChat.followUpsSent`), `packages/domain/src/ai/lite/types.ts` (the
  `follow_up` move), `.../lite/decide/decide.ts` (a nudge turn), `.../lite/write.ts` (`writeMoveOf`),
  `.../lite/prompts/write-text.ts` and `.../prompts/library.ts` (`write.moves` version 2), `.../lite/act.ts` (planning),
  `.../lite/turn.ts` (the nudge path), `packages/domain/src/ai/agent-worker.ts` (`nudgeAgency`),
  `packages/domain/src/ai/follow-up-work.ts` (`workDueFollowUps`)
- Test: `packages/domain/test/ai/lite/follow-ups.test.ts` (pure), `packages/domain/test/ai/lite/follow-up-turn.test.ts`

**Interfaces:**
- Consumes: 3a's `Move`, `decide`, `writeMoveOf`, `actOnMove`, `runLiteTurn`, `liteAgentOn`; kernel `instantAt`,
  `timeOfDayIn`, `calendarDateIn`, `addDays`; inbox `WINDOW_MS`.
- Produces:
  ```ts
  export const FOLLOW_UP_AFTER_REPLY_HOURS = 4;
  export const FOLLOW_UP_AFTER_INBOUND_HOURS = 20;
  export const WAKING_HOURS = { from: "09:00", until: "21:00" } as const; // agency time
  /** When follow-up `number` should go, or null when no time fits. */
  export function followUpAt(input: { number: 1 | 2; lastInboundAt: Date; repliedAt: Date; previousAt: Date | null;
    now: Date; timeZone: string }): Date | null;
  // Move gains: | { kind: "follow_up"; number: 1 | 2; ask: ChecklistItem | null }
  ```
`followUpAt`, in this order: the target is `repliedAt + 4 h` for the first, `lastInboundAt + 20 h` for the second; the
window's end is `lastInboundAt + WINDOW_MS - 1 h`; a target before 09:00 local moves to 09:00 that day, one at or after
21:00 to 09:00 the next day; past the window's end it is pulled back to the window's end when that is inside waking
hours, else into the last waking hour of the last day before it that has one, on the chat's own minute from 20:00 to
20:58 (a hash of the chat id: never all at 20:59, which the minute job could not send before 21:00); it is null when
the result is before `now + 15 min`, or, for the second, before `previousAt + 1 h`.

Planning (in `actOnMove`, replacing 3a's `followUpAt: null`): a reply turn that sent a message and is not a hand_over,
`silent`, nor `stopFollowUps` sets `followUpsSent: 0`, `followUpAt: followUpAt({ number: 1, ... })`; any other reply
turn sets `followUpAt: null`. A nudge turn that sent follow-up `n` sets `followUpsSent: n`, `lastNudgeAt: now`, and
`followUpAt` = the second's time when `n === 1`, else null. `followUpReason` stays null.
The nudge turn (`runLiteTurn`, kind `nudge`): no Understand; `situationOf` with no lookups; `decide` returns
`follow_up { number: followUpsSent + 1, ask: facts.asked?.item ?? nextItem(...) }` and leaves the loop guard as it is;
the model writes it; a write that fails or is refused sends nothing (outcome as the write's, nothing flagged).
`write.moves` v2 adds: number 1 "Pick the chat up again in one short, friendly line, then ask for {item}." (with no item:
"Pick the chat up again in one short, friendly line and ask whether they have any questions."); number 2 "Write one
short, friendly last line: they can message here any time. Ask nothing."
`nudgeAgency`: `followUpHours === 0` stops none of a lite agency's follow-ups (the lite agent's are fixed); it also
selects `followUpsSent`; a row whose last nudge is after the last inbound is kept only for a lite agency with
`followUpsSent === 1`; the token is `nudge:<chatId>:<lastInboundMs>` for the first and the same plus `:2` for the
second. `workDueFollowUps` returns 0 for a lite agency before claiming anything (an owner's follow-up task is a
person's call).
Migration: `ALTER TABLE "ai_chat" ADD COLUMN "follow_ups_sent" SMALLINT NOT NULL DEFAULT 0, ADD CONSTRAINT
ai_chat_follow_ups_sent_range CHECK (follow_ups_sent BETWEEN 0 AND 2);`

- [ ] **Step 1: Write the failing tests**
  - `followUpAt` table (Asia/Kolkata, local times; the reply a minute after the message):
    | Customer wrote | First | Second |
    |---|---|---|
    | 10:00 | 14:01 | 09:00 next day |
    | 23:50 | 09:00 next day | 19:50 next day |
    | 02:00 | 09:00 | the chat's minute, 20:00 to 20:58, the same day |
    | 20:30 | 09:00 next day | 16:30 next day |
    | 07:30 | 11:31 | the chat's minute, 20:00 to 20:58, the same day |
    and "no second when it can't be an hour after the first": wrote 02:00, first went 20:30 → second null.
  - (db, the 3a fixture) "a reply plans the first follow-up": `ai_chat.followUpAt` = reply + 4 h, `followUpsSent` 0.
  - "the first goes and plans the second": `runAiNudges` at that time → one outbound `ai:nudge:<chatId>:<ms>`,
    `followUpsSent` 1, `followUpAt` = last inbound + 20 h; the request's Move block holds "Pick the chat up again".
  - "the second goes, and no third": next run sends `ai:nudge:<chatId>:<ms>:2`, `followUpsSent` 2, `followUpAt` null;
    a run after that sends nothing.
  - "ok thanks, not interested and later stop them" (Review Focus 2): after each, `followUpAt` null and a run sends nothing.
  - "the customer's next message starts the count again": `followUpsSent` 0 and a new first time.
  - "a follow-up due while the agent is paused is let go" for a lite chat.
  - "a lead follow-up task of a lite agency is left for the team": `workDueFollowUps` returns 0, no `aiFollowUpTouch` row.
  - "the first agent's one nudge per silence is unchanged" (an agency not on lite: one nudge, no second).
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `test/ai/agent-pause.test.ts`, the lite and grounded suites, `pnpm migrations:check`, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): the lite agent's two follow-ups, in waking hours and inside the window`

### Task 2: A trace of every turn: an index row and a gzip file

Code map: section 10 (storage, keys, compression, the index row).

**Files:**
- Create: `packages/db/prisma/migrations/20261212200000_ai_turn_traces/migration.sql`,
  `packages/domain/src/ai/traces/trace-sink.ts`, `packages/domain/src/ai/traces/trace-file.ts`
- Modify: `packages/db/prisma/schema/ai.prisma` (`AiTurnTrace`), `packages/db/test/org-table-fixtures/ai.ts`
  (`ai_turn_trace`, `appendOnly: true`), `packages/domain/src/ai/index.ts`, `apps/api/src/worker-jobs.ts`
  (`WorkerJobDependencies.storage: ObjectStorage`; `autopilotJobs` passes `traces`)
- Test: `packages/domain/test/ai/traces/trace-sink.test.ts`, `packages/domain/test/ai/lite/turn.test.ts` (extend)

**Interfaces:**
- Consumes: 3a's `LiteTrace`, `TraceSink`; `ObjectStorage`, `createMemoryStorage`.
- Produces:
  ```ts
  export const TRACE_DAYS = 14;
  export function traceKey(organizationId: string, startedAt: Date, traceId: string): string; // organizations/<org>/ai-traces/<UTC yyyy-mm-dd>/<id>.json.gz
  export function createTraceSink(deps: { db: Database; storage: ObjectStorage; logger: Logger }): TraceSink;
  export interface TraceFile { version: 1; trace: Omit<LiteTrace, "organizationId"> }
  export function traceFileOf(trace: LiteTrace): Uint8Array;                  // gzipSync(JSON)
  export async function readTraceFile(storage: ObjectStorage, key: string): Promise<TraceFile | null>; // plan 4's viewer reads it
  ```
Table `ai_turn_trace` (organization table: RLS, fixture, keys with `organization_id`, RESTRICT): `organization_id`,
`id` uuid (the trace's id), `conversation_id` uuid (→ `whatsapp_conversation` with `organization_id`), `lead_id` uuid
null (no key: a lead may be erased first), `started_at`, `kind` (CHECK reply or nudge), `outcome` (≤40), `reason`
(≤60, null), `move` (≤40, null), `sale_stage` (null), `model` (null), `input_tokens`, `output_tokens`, `duration_ms`
(integers ≥ 0), `prompt_versions` jsonb, `file_key` text, `expires_at`; unique `(organization_id, id)`; indexes
`(organization_id, conversation_id, started_at desc)` and `(expires_at)`; `REVOKE UPDATE, DELETE ON ai_turn_trace FROM
app_runtime` (only the platform role changes or deletes it). No cost column: the console prices tokens with its own
`AiPrices` (plan 4).
`record(trace)`: inside `db.forOrg`, insert the row (`expires_at = started_at + 14 days`) first, then
`storage.put({ key, contentType: "application/gzip", body: traceFileOf(trace) })`, so no file ever exists without a
row the sweep can find. Any failure is caught and logged `warn` `{ event: "ai.trace-failed", traceId, error: error.name }`.
The worker builds `createTraceSink({ db, storage, logger })` once and passes it in `autopilotJobs`.

- [ ] **Step 1: Write the failing tests**
  - "a trace is a row and a gzip file": after `record`, one `ai_turn_trace` row with the outcome, move, tokens and
    `expires_at = started_at + 14 days`; `readTraceFile(storage, row.fileKey)` gives back the trace; the key starts
    with `organizations/<orgId>/ai-traces/2026-10-23/`.
  - "the file holds message ids, not the messages": the read-back trace has the context's `messageIds`, and neither
    `understand.blocks` nor `write.blocks` has a `Messages` key.
  - "a failed storage write keeps the turn" (Review Focus 3): a storage whose `put` rejects → `record` resolves, the
    row exists, one `ai.trace-failed` log line with no customer words.
  - "the runtime role can't change or delete a trace": `update` and `delete` as the runtime reject with
    `/permission denied/`.
  - (lite turn test, extend) "a worker-built turn writes its trace": `runAgentTurn` with `traces:
    createTraceSink(...)` leaves one row for the turn.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, the db org-table suite, `pnpm migrations:check`, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): every lite turn leaves a trace: an index row and a gzip file`

### Task 3: Traces go after 14 days, with the customer and with the organization

Code map: sections 10, 4 (erasure: `withdrawAiParts`); `platform/bulk-files-sweep.ts` is the pattern.

**Files:**
- Create: `packages/domain/src/platform/ai-traces-sweep.ts` (export from the platform index)
- Modify: `packages/domain/src/ai/traces/trace-sink.ts` (`tracesDue`, `forgetTraces`), `packages/domain/src/ai/erasure.ts`
  (marks the person's traces due; returns `traces`), `packages/domain/src/platform/erase-customer.ts` (the count in the
  platform log as `aiTraces`), `apps/api/src/console-jobs.ts` (the schedule)
- Test: `packages/domain/test/platform/ai-traces-sweep.test.ts`, `packages/domain/test/platform/erase-customer.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  export async function tracesDue(tx: OrgTx, now: Date, limit: number): Promise<{ id: string; organizationId: string; fileKey: string }[]>;
  export async function forgetTraces(tx: OrgTx, ids: readonly string[]): Promise<number>;
  export const SWEEP_AI_TRACES_QUEUE = "platform.sweep-ai-traces";
  export async function sweepAiTraces(services: PlatformServices, now: Date): Promise<number>;
  export function aiTracesSweepSchedule(services: PlatformServices): ScheduledJob; // cron "47 * * * *", Asia/Kolkata
  ```
`sweepAiTraces`: pages of 200 rows with `expires_at <= now` (platform transaction), each file deleted with
`storage.delete` (a missing key is no error), then the page's rows deleted in one platform transaction; a file whose
delete throws keeps its row for the next run, and the run ends with `AiTracesSweepFailedError` (counts only, the first
error as its cause, like `BulkFilesSweepFailedError`). Erasure: `withdrawAiParts` sets `expires_at = now` on every
trace of the person's chats (found as its other steps find them), so the next sweep, within the hour, deletes them; the
organization's purge needs nothing new (the catalog purge deletes the rows, and `organizations/<id>/` holds the files).

- [ ] **Step 1: Write the failing tests**
  - "a trace past 14 days goes with its file; a newer one stays".
  - "an erased customer's traces go at the next sweep and another customer's stay" (Review Focus 4): two chats in one
    agency, the erasure, then `sweepAiTraces` → the first chat's rows and files gone, the second's kept; the platform
    log counts `aiTraces`.
  - "a missing file doesn't stop the row's deletion"; "a delete that throws keeps its row and fails the run with the count".
  - "a trace lives under the organization's folder": `traceKey(...)` starts with `organizationFolder(orgId)`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**  **Step 4: Run them, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(platform): the console sweeps AI traces after 14 days and with an erased customer`

### Task 4: What the AI changed, in violet, on the lead page and in the inbox panel

Code map: section 4 (web: trip-card.tsx, ai-mark.tsx, timeline-entry.tsx), 5 (insight card). The inbox panel renders
the lead page's own `TripCard` and `Timeline`, so both places change at once.

**Files:**
- Create: `apps/web/src/ai/ai-chip.tsx` (`AiChip`), `apps/web/src/ai/ai-value.tsx` (`AiValue`)
- Modify: `packages/contracts/src/ai/fill.ts` (`leadAiFields` items gain `filledAt: z.iso.datetime()`;
  `decideLeadAiFieldsInput` gains `fields: z.array(suggestedLeadField).min(1).optional()`),
  `packages/domain/src/ai/fill/lead-fields.ts` (`suggestedFieldsOf` returns `filledAt` = the row's `updatedAt`;
  `decideSuggestions(tx, access, leadId, decision, fields?)` decides those fields, or all without them),
  `packages/api/src/routers/ai.ts` (`decideLeadFields` passes `fields`), `packages/contracts/src/ai/ai.ts`
  (`leadInsight.chatSummary: z.string().nullable()`), `packages/domain/src/ai/insight.ts` (`leadInsightOf` reads
  `ai_chat.summary` of the chat the lead's person wrote in last), `packages/contracts/src/ai/autopilot.ts`
  (`chatAi.summary: z.string()`), `packages/domain/src/ai/chat-state.ts`, `apps/web/src/leads/lead/trip-card.tsx`
  (every AI row is an `AiValue`; `SuggestedPanel` goes), `apps/web/src/leads/lead/timeline-entry.tsx`,
  `apps/web/src/ai/insight-card.tsx`, `apps/web/src/ai/chat-ai-card.tsx`, `apps/web/src/i18n/messages/en-IN/leads.json`,
  `apps/web/src/i18n/messages/en-IN/ai.json` (unused `leads.lead.trip.suggested.*` keys removed)
- Test: `packages/domain/test/ai/lead-fields.test.ts` (extend), `apps/web/test/leads/lead/trip-card.test.tsx`,
  `apps/web/test/leads/lead/timeline-entry.test.tsx`, `apps/web/test/ai/insight-card.test.tsx`,
  `apps/web/test/ai/chat-ai-card.test.tsx` (create the ones that don't exist)

**Interfaces:**
- Consumes: 3a's `ai-field-set` entries and `byAi` on `stage-changed`; `lead_ai_field` rows the lite turn writes.
- Produces (web):
  ```ts
  /** A small violet "AI" chip (SparklesIcon and the word): marks a timeline entry or a card as the AI's. */
  export function AiChip(): ReactElement;
  /** A lead value the AI wrote: the value in the people tint, and a button opening where it came from. One trip row may
   *  hold two fields (Travellers: adults and children_ages): the newest row's day and words are shown, and a decision covers both. */
  export function AiValue(props: { leadId: string; fields: SuggestedLeadField[]; filledAt: string; excerpt: string; children: ReactNode }): ReactElement;
  ```
`AiValue`: the value keeps today's violet span (`rounded-badge bg-people-tint px-1 text-people-tint-ink`), then a
registry `Button` `variant="ghost" size="icon"` (44px hit area, SparklesIcon, label "Where this came from") opening a
registry `Popover` with "Filled by the AI from the chat, {day}: “{words}”" (`formatDay(filledAt)`; "Filled by the AI
from the chat, {day}." with no words) and, for a member holding `leads:edit`, "Looks right" (`variant="outline"`;
`decideLeadFields({ leadId, decision: "confirm", fields })`) and "Not right" (`variant="ghost"`; `decision: "dismiss"`),
both behind `useWriteAccess("change")`, disabled while pending, with `RefusalAlert`. A person's edit or "Looks right"
makes the value plain at the next read (the row is no longer suggested or its hash no longer matches). The AI's timeline
entries (`note` with `byAi`, `stage-changed` with `byAi`, `ai-field-set`) show `AiChip` before the title; a stage badge
keeps its stage colour. The insight card shows `AiChip` in its header and, under "What the AI noted", `chatSummary`
when set; the inbox chat card shows the summary under the same heading.
Copy: `leads.lead.trip.ai.where` "Where this came from", `.filled` "Filled by the AI from the chat, {day}: “{words}”",
`.filledNoWords` "Filled by the AI from the chat, {day}.", `.right` "Looks right", `.wrong` "Not right"; `ai.chip` "AI";
`ai.insight.noted` and `ai.chat.noted` "What the AI noted".

- [ ] **Step 1: Write the failing tests**
  - (domain) "filledAt is the row's last write"; "deciding one field leaves the others suggested": confirm `adults`
    alone → its row confirmed, `when` still suggested; "dismissing one field clears only it".
  - (trip card) "an AI value is violet with its origin a tap away": the adults row carries `data-ai-filled`, its button
    named "Where this came from" opens "Filled by the AI from the chat, 12 Nov: “we are 3 people”"; "Looks right" calls
    the mutation with `{ leadId, decision: "confirm", fields: ["adults"] }` (with an AI child's ages too, `["adults",
    "children_ages"]`); a member without `leads:edit` sees the sentence
    and no buttons; a row a person filled has no button and no tint.
  - (timeline) "the AI's stage move carries the chip and the AI's name"; "a member's stage move has no chip";
    "an AI change reads 'Travel date changed from Sat 14 Nov to Sat 21 Nov' with the chip".
  - (insight card, chat card) the chip and "What the AI noted" with the summary; nothing when the summary is empty.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, the i18n guards, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): what the AI changed on a lead, in violet, with "Looks right"`

### Task 5: The Leads list's violet mark

**Files:**
- Create: `apps/web/src/ai/ai-filled-mark.tsx` (`AiFilledMark`)
- Modify: `packages/contracts/src/crm/leads.ts` (`leadListItem.aiFilled: z.boolean()`), `packages/domain/src/crm/trip-gaps.ts`
  (`tripFieldValuesOf`), `packages/domain/src/crm/index.ts`, `packages/domain/src/ai/fill/lead-fields.ts`
  (`aiFilledLeadIds`), `packages/domain/src/ai/index.ts`, `packages/api/src/routers/leads.ts` (`list` adds `aiFilled`;
  crm's own item type becomes `Omit<LeadListItem, "aiFilled">`), `apps/web/src/leads/list/lead-rows.tsx`,
  `apps/web/src/leads/list/leads-table.tsx`, `apps/web/src/i18n/messages/en-IN/leads.json`
- Test: `packages/domain/test/ai/lead-fields.test.ts` (extend), the leads list router test, `apps/web/test/leads/list/lead-rows.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export async function tripFieldValuesOf(tx: OrgTx, leadIds: readonly string[]): Promise<Map<string, Record<GapField, unknown>>>; // one query
  export async function aiFilledLeadIds(tx: OrgTx, leadIds: readonly string[]): Promise<Set<string>>; // a suggested row whose value still hashes to it; two queries a page
  export function AiFilledMark(): ReactElement; // SparklesIcon in text-people-tint-ink, aria-label from leads.list.aiFilled
  ```
Copy: `leads.list.aiFilled` "The AI filled in some of this lead's details". The mark sits right after the name, before
the Returning badge, in both the rows and the table.

- [ ] **Step 1: Failing tests**: "a lead with an AI value still the AI's is marked, one a person changed is not";
  "the list's items carry aiFilled" (router); "the mark shows with its name only for aiFilled leads" (web, rows and table).
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**  **Step 4: Run them, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): the Leads list marks leads the AI filled in`

### Task 6: Lost and Not a lead, suggested by the AI, decided by a person

Code map: section 4 ("Lost / not a lead today"; `moveLeadStage`, `lostReasons`).

**Files:**
- Create: `packages/db/prisma/migrations/20261212300000_lead_ai_suggestions/migration.sql`,
  `packages/contracts/src/ai/stage-suggestions.ts` (export from the ai contracts index),
  `packages/domain/src/ai/lite/suggestions.ts`, `apps/web/src/ai/stage-suggestion.tsx` (`StageSuggestionAlert`,
  `SuggestionButtons`)
- Modify: `packages/db/prisma/schema/ai.prisma` (`LeadAiSuggestion`), `packages/db/test/org-table-fixtures/ai.ts`,
  `packages/domain/src/ai/lite/act.ts` (writes them), `packages/domain/src/ai/erasure.ts`, `packages/domain/src/ai/index.ts`,
  `packages/api/src/routers/ai.ts`, `apps/web/src/leads/lead/lead-screen.tsx` (the alert above the first card),
  `apps/web/src/i18n/messages/en-IN/ai.json`, `audit.json`
- Test: `packages/domain/test/ai/lite/suggestions.test.ts`, `apps/web/test/ai/stage-suggestion.test.tsx`

**Interfaces:**
- Consumes: 3a's `Decision.suggest`, `CheckedForm` (`score.looks_fake`, `fake_why`).
- Produces (contracts):
  ```ts
  export const stageSuggestion = z.object({ id: recordId, leadId: recordId, name: z.string(), kind: z.enum(["lost", "not_a_lead"]),
    lostReason: lostReason.nullable(), reason: z.string(), createdAt: z.iso.datetime() });
  export const stageSuggestionList = z.object({ suggestions: z.array(stageSuggestion) });
  export const leadStageSuggestionInput = z.strictObject({ leadId: recordId });
  export const leadStageSuggestion = z.object({ suggestion: stageSuggestion.nullable() });
  export const decideStageSuggestionInput = z.strictObject({ suggestionId: recordId, accept: z.boolean() });
  ```
- Produces (domain):
  ```ts
  export async function suggestStage(tx: OrgTx, input: { leadId: string; conversationId: string; kind: "lost" | "not_a_lead";
    lostReason: LostReason | null; reason: string; now: Date }): Promise<boolean>;
  export async function stageSuggestionsOf(tx: OrgTx, access: MemberAccess): Promise<StageSuggestion[]>; // open, lead open, in the member's leads scope, newest first, 20 at most
  export async function stageSuggestionOfLead(tx: OrgTx, access: MemberAccess, leadId: string): Promise<StageSuggestion | null>;
  export async function decideStageSuggestion(tx: OrgTx, access: MemberAccess, input: DecideStageSuggestionInput, now: Date): Promise<void>;
  ```
- Produces (router `ai`): `stageSuggestions` (query, `.requires("leads:view")`), `leadStageSuggestion` (query,
  `leads:view`), `decideStageSuggestion` (mutation, `.requires("leads:edit")`).

Table `lead_ai_suggestion` (organization table: RLS, fixture, keys with `organization_id`, RESTRICT): `organization_id`,
`id`, `lead_id` (→ lead), `conversation_id` (→ `whatsapp_conversation`, null), `kind` (CHECK lost, not_a_lead),
`lost_reason` (null; CHECK the `lostReasons`), `reason` (≤200), `state` (CHECK open, accepted, declined; default
open), `created_at`, `decided_by` (null), `decided_at` (null); unique `(organization_id, lead_id) WHERE state = 'open'`;
index `(organization_id, state, created_at desc)`.
Rules: the act writes `decision.suggest`, and when it is null and the form's `score.looks_fake` is true, `{ kind:
"not_a_lead", lostReason: null, reason: "Looks fake: " + fake_why }` (cut at 200). `suggestStage` adds nothing when
the lead isn't in an open stage, has an open suggestion, or had one of the same kind declined; it audits
`ai.stage-suggested` with `{ kind }`. `decideStageSuggestion`: an unknown or decided suggestion, or a lead outside the
member's scope, is `NOT_FOUND`; accepting a lead still open runs `moveLeadStage(tx, access, { leadId, stage: kind,
lostReason }, now)` and sets `accepted`; a lead no longer open is left as it is and the suggestion becomes `declined`;
declining sets `declined`; each records `decided_by`, `decided_at` and audits `ai.stage-suggestion-accepted` or
`ai.stage-suggestion-declined`. Erasure deletes the person's leads' suggestions.
Copy: alert title "The AI suggests marking this lead {stage}" (stage "Lost" / "Not a lead"), description the reason;
buttons "Yes, mark it {stage}" and "No"; members without `leads:edit` see the alert without buttons; after a choice
`useRefreshWork()`. Audit sentences: `ai.stage-suggested` "The AI suggested marking a lead Lost or Not a lead",
`ai.stage-suggestion-accepted` "Marked a lead as the AI suggested", `ai.stage-suggestion-declined` "Turned down the
AI's suggestion for a lead".

- [ ] **Step 1: Write the failing tests**
  - "not interested suggests Lost once": a `close` decision with its suggest → one open row `{ kind: "lost",
    lostReason: "other", reason: "Said they're not interested." }`; the next turn adds none.
  - "looks fake suggests Not a lead with its reason"; "a declined kind is not suggested again".
  - "yes moves the lead and closes the suggestion": stage Lost, `lostReason` other, state accepted, audit entry.
  - "yes on a lead already moved on changes nothing" (Review Focus 5): lead in Booking requested → stays, state declined.
  - "a member outside the lead's scope gets NOT_FOUND"; "an erased customer's suggestions go".
  - (web) the alert's sentence and reason; "Yes, mark it Lost" calls the mutation with `{ suggestionId, accept: true }`
    and is disabled while pending; no buttons without `leads:edit`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, the db org-table suite, the audit guard, `pnpm migrations:check`, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): the agent suggests Lost or Not a lead, and a person decides`

### Task 7: The Overview: suggestions in "Needs you", and a proper "Flagged for a person"

Code map: section 6 (hand-overs); plan 2 Task 6 (the Overview).

**Files:**
- Modify: `packages/contracts/src/ai/autopilot.ts` (`aiOverview.bookingsRequested: z.int()`), `packages/domain/src/ai/overview.ts`,
  `apps/web/src/ai/agent/agent-overview.tsx`, `apps/web/src/ai/agent/use-agent.ts` (`useStageSuggestions`),
  `apps/web/src/i18n/messages/en-IN/ai-agent.json`
- Test: `packages/domain/test/ai/overview.test.ts` (create or extend the one that covers `aiOverviewOf`),
  `apps/web/test/ai/agent/agent-overview.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 6's `stageSuggestions` and `decideStageSuggestion` (through `SuggestionButtons`).
- `aiOverviewOf`: `flagged` = the number of distinct chats that, in the last 24 hours, the AI handed over
  (`handedOffAt`), sent nothing in and told the team (`attentionAt`), or whose lead it suggested Lost or Not a lead
  (`lead_ai_suggestion.created_at`), each chat once; `bookingsRequested` = `ai_booking` rows created in the last 24 hours.
- "Needs you" gains, after the hand-overs, "Suggested: Lost or Not a lead" (only for members holding `leads:view`):
  each an `Item` with the name (a `TextLink` to the lead), "{stage}: {reason}", "Since {when}" and `SuggestionButtons`.
  "Nothing needs you right now." only when hand-overs, payments and suggestions are all empty. "Last 24 hours" shows
  chats answered, messages sent, bookings requested and flagged for a person, in the existing strip.
Copy: `needsYou.suggestions` "Suggested: Lost or Not a lead", `needsYou.suggested` "{stage}: {reason}";
`last24.bookings` "Bookings requested", `last24.bookingsHint` "Bookings the AI took in the last 24 hours.";
`last24.flaggedHint` "Chats in the last 24 hours that the AI handed to a person, couldn't answer safely, or suggested
marking Lost or Not a lead."

- [ ] **Step 1: Failing tests**: "flagged counts a chat once": one chat handed over and suggested, another only
  suggested, a third flagged two days ago → 2; "bookings requested counts the last day's"; (web) the suggestions list
  with its buttons calling the decision; "Nothing needs you" only when all three are empty; the strip's four figures.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): the AI agent's overview lists its Lost suggestions and counts what it flagged`
