# Several WhatsApp numbers per agency: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agency runs as many WhatsApp numbers as its plan allows. Every message leaves from the number the spec's
section 5 names. The console runs each number, and the inbox, the AI agent and lead assignment know which number a
chat is on.

**Architecture:**
- The worker already sends each row from its chat's number, so the work is choosing the chat.
- One function, `sendFrom` in `inbox/send-from.ts`, replaces `liveConnection()` on every send path; then
  `liveConnection()` is deleted.
- Three columns on `whatsapp_connection` (label, main, AI switch) and one on `assignment_rule`.
- The console's procedures take a number, and the per-agency jobs walk organizations, not number routes.

**Tech Stack:** TypeScript (strict), Prisma 7.10 on Postgres 18 under row-level security, pg-boss, tRPC, Next.js with
next-intl and shadcn, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-multi-number-whatsapp-design.md`. The spec wins over this plan.

## Global Constraints

- **Base:** `origin/main` with `docs/multi-number-whatsapp` merged. Before the pull request, `git fetch origin` and merge
  `origin/main` again.
- **Commands** run under Node 24: start each with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`. A fresh worktree
  needs the setup in `docs/agent-playbook.md` section 3.
- **Docker:**
  - Each worktree sets its own `COMPOSE_PROJECT_NAME` and checks `scripts/dev/compose.sh --print-name` first.
  - Services run only for a test run and are stopped after.
  - At most two Docker-heavy runs at once on this Mac.
  - Never `git stash`.
- **Checks:** a task runs its own package checks (`pnpm --filter <package> test -- <files>`, `typecheck`, `lint`). The
  full gate (`pnpm check`, `pnpm migrations:check`, the journeys) runs once, in Task 14.
- **The number rule:** a send chooses its chat only through `sendFrom`, directly or through `sendableChat`,
  `queueSystemText` or `chatForLead`. No new call of `liveConnection()`, `requireConnection()` or
  `whatsappConnection.findFirst` outside `inbox/connection-row.ts`.
- **Send-path tests** have two live numbers, and the number the path must use is never the one a stray `findFirst`
  would return. That is the second number made (not the main one) for the in-chat and last-written cases, and the main
  number when the customer's newest chat is on a disconnected number. Each test asserts the chat the row is in, and,
  through `sentFrom` (Task 1), the number the in-memory MSG91 sent from.
- **One migration,** `20261218800000_multi_number_whatsapp` (after `20261218700000_whatsapp_request_id`), written by
  hand from spec section 13, with the schema to match and `pnpm --filter @travel-crm/db generate`.
- **Names:** labels in tests are "Sales 1" and "Sales 2". No agency or person names anywhere: the repository is public.
- **Logs** hold ids, codes, counts and timings only.
- **Screens** follow the owner's UI rules in `CLAUDE.md`, and keep every word in the feature's message file. A new
  refusal's sentence goes in `errors.json`, a new audit action's in `audit.json`. Labels and number choices show only
  when the agency has 2+ numbers.
- **Contracts:** inputs are `z.strictObject`, outputs `z.object`. In the console, super admins change and staff of
  either level look.
- **Commits:** Conventional Commits with the header at 100 characters at most, files staged by name, never
  `--no-verify`, no `Co-Authored-By` trailer.
- **Files:** a task owns the files in its row of the table below. A change another task's file needs goes under "Needs
  from others" in the report.

## Review Focus

1. **A send from the wrong number.** With two live numbers, every path in spec section 6 must write its row in the chat
   section 5 names, and the in-memory MSG91 must send it from that chat's number. Look for any read of a connection
   that is neither the chat's own nor `sendFrom`'s. Tests:
   - Task 2: paths 1–9 and 11, and the worker;
   - Task 3: paths 12–18;
   - Task 4: path 10;
   - Task 13: path 19;
   - Task 6: path 20.
2. **A number without the automation template.** Expected: the send is skipped as `TEMPLATE_NOT_ON_NUMBER` (a booking
   reminder becomes a task) and never sent from another number. Task 3.
3. **A disconnected number's chat.** Expected: it stays readable; staff, the AI and automation send nothing in it; Start
   a chat goes to the main number. Tasks 2, 3, 6 and 9.
4. **The AI on a number switched off.** Expected: no turn queued, no "AI has it" mark, a running turn sends nothing, and
   keyword trip kits go there. Task 9.
5. **The console on the wrong number or past the plan.** Expected: another agency's number is "not found", and a third
   number on a two-number plan is refused, also when two records race. Task 7.
6. **Per-agency jobs running twice.** Expected: one pass per agency. Tasks 9, 10 and 12.

## Rulings (the planner's: what, why, cost if wrong)

- **MN1. `liveConnection()` stays until Task 14,** marked as going, so the branch builds while the tracks move its
  callers. Task 14 deletes it and its export. — A partly moved branch must build. — None.
- **MN2. `sendFrom` checks the number only.** Callers keep their own chat checks (open, hidden, window, consent) and
  their result codes. A disconnected number is `not_connected` to `queueSystemText`'s callers, and
  `WHATSAPP_NUMBER_DISCONNECTED` to a person. — The smallest change to callers. — None.
- **MN3. `whatsappTemplates.sendable` takes `{ conversationId?, connectionId? }`:** a chat's number (if the member sees
  the chat), else a number, else the main one. `list` takes `{ connectionId? }`. Both inputs are optional, so today's
  calls compile. — The send dialog always has the chat. — None.
- **MN4. `whatsappTemplates.create` takes `{ connectionId?, draft }`,** shaped like `edit`'s `{ templateId, draft }`.
  Task 4 changes the one web call. — `templateDraftInput` is refined and can't be extended. — None.
- **MN5. `inbox.status` keeps `connectionStatus` and `number`,** as the main number's, until Task 6 moves the three
  screens off them and removes them. — Server and web merge at different times. — None.
- **MN6. The inbox writes the number's AI switch** (`inbox/number-ai.ts`, since inbox owns `whatsapp_connection`),
  behind `ai.setNumberAnswers` with `ai:manage`. — Module ownership. — None.
- **MN7. A console action on a number reads it with `connectionById` inside `asOrganization`.** Row-level security turns
  another agency's id into `null`, which is `NOT_FOUND`. — No new check to forget. — None.

## Files and waits

| Task | Builder | Owns | Waits on |
| ---- | ------- | ---- | -------- |
| 1 | A | migration; `whatsapp.prisma`; `assignment.prisma`; `inbox/{connection-row,send-from,routes,index}.ts`; `domain/test/inbox/support.ts` | none |
| 2 | A | `inbox/{outbox,system-send,template-send}.ts`; `errors.json` | 1 |
| 3 | A | `sales/send.ts`; `inbox/template-send.ts` (`startChatForLead`); `inbox/views.ts` (`leadChatOf`); `bookings.json` | 2 |
| 5 | A | `inbox/views.ts`; `contracts/src/inbox/{chat,inputs}.ts` | 3 |
| 7 | B | `inbox/connection.ts`; `inbox/index.ts`; `platform/whatsapp.ts`; `api/src/platform/routers/whatsapp.ts`; `contracts/src/inbox/console.ts`; `audit.json` | 1 |
| 8 | B | `apps/web/src/console/whatsapp/*`; `console-whatsapp.json`; `apps/web/test/e2e/support/whatsapp.ts` | 7 |
| 9 | B | `inbox/{number-ai,automation,trip-kit-send,index}.ts`; `ai/{may-write,agent-reach,agent-worker,chat-state,insight,agent-setup}.ts`; `ai/lite/act-gates.ts`; `contracts/src/ai/{autopilot,agent-setup}.ts`; `api/src/routers/ai.ts`; `apps/web/src/ai/{agent/*,chat-ai-card}.tsx`; `ai-agent.json`, `ai.json`, `audit.json` | 8 |
| 6 | B | `apps/web/src/inbox/*` (not `trip-kits/`, `voice/`, `media/`); `inbox.json`; then `contracts/src/inbox/chat.ts` and `views.ts`'s `inboxStatusOf` (MN5) | 9; merges A2 and C1 |
| 4 | C | `inbox/{templates,broadcast,broadcast-audience,broadcast-send}.ts`; `api/src/routers/whatsapp-templates.ts`; `contracts/src/inbox/{templates,broadcasts}.ts`; `apps/web/src/inbox/template-form.tsx` (one call) | 1 |
| 10 | C | `crm/assignment/{choose-owner,settings,assignment-audit}.ts`; `crm/{save-enquiry,whatsapp-contact}.ts`; `contracts/src/crm/assignment.ts`; `inbox/{inbound,adopt,chat-actions}.ts`; `ai/lite/open-lead.ts` | 4 |
| 11 | C | `apps/web/src/crm-settings/assignment/*`; `settings.json` | 10 |
| 12 | C | `inbox/scheduled.ts`; `sales/worker.ts` | 11 |
| 13 | C | `contracts/src/package-pages/pages.ts`; `api/src/public-package.ts`; `apps/web/src/package-pages/package-view.tsx` | 12 |
| 14 | lead | `inbox/{connection-row,index}.ts`; `docs/adr/0035-whatsapp-through-msg91.md`; the new journey | all |

Paths in the table without a package are under `packages/domain/src/`, and the `.json` files under
`apps/web/src/i18n/messages/en-IN/`.

**Waves:**
- **0:** Task 1, merged before anything else.
- **1:** three builders in their own worktrees:
  - A: 2 → 3 → 5;
  - B: 7 → 8 → 9 → 6;
  - C: 4 → 10 → 11 → 12 → 13.
- **2:** Task 14.

**Merge points** (a track merges into the integration branch only here, so it always builds):
- A1 = Tasks 2 and 3; A2 = Task 5.
- B1 = Tasks 7 and 8 (the console's inputs change shape); B2 = Task 9; B3 = Task 6, after A2 and C1 are in.
- C1 = Task 4; C2 = Tasks 10 and 11 (the rule's input gains a field); C3 = Tasks 12 and 13.

---

### Task 1: The schema, the number lookups and the one sending rule

**Files:**
- Create: `packages/db/prisma/migrations/20261218800000_multi_number_whatsapp/migration.sql`,
  `packages/domain/src/inbox/send-from.ts`
- Modify: `whatsapp.prisma` (`WhatsappConnection`: `label`, `isMain @map("is_main")`, `aiAnswers @map("ai_answers")`,
  the two new indexes in place of `whatsapp_connection_live`, the back-relation to rules, the model's comment);
  `assignment.prisma` (`AssignmentRule.whatsappConnectionId` and its relation); `inbox/connection-row.ts`;
  `inbox/routes.ts`; `inbox/index.ts`; `packages/domain/test/inbox/support.ts`
- Test: `packages/db/test/whatsapp-numbers-schema.test.ts`, `packages/domain/test/inbox/send-from.test.ts`,
  `packages/domain/test/inbox/routed-organizations.test.ts`

**Interfaces:**

```ts
// connection-row.ts: ConnectionRow gains label: string; isMain: boolean; aiAnswers: boolean; createdAt: Date.
/** The agency's numbers that aren't disconnected: the main one first, then the oldest. */
export function liveConnections(tx: OrgTx): Promise<ConnectionRow[]>;
/** Every number the agency has had, live ones first: the inbox's labels and filter. */
export function numbersOf(tx: OrgTx): Promise<ConnectionRow[]>;
/** The live number flagged main, else the oldest live one, connected before one setting up; null with none. */
export function mainConnection(tx: OrgTx): Promise<ConnectionRow | null>;
// liveConnection and requireConnection stay until Task 14 (MN1), their comments saying so.

// send-from.ts: spec section 5.
export interface SendingChat {
  id: string; connectionId: string; phoneE164: string; personId: string | null;
  lastInboundAt: Date | null; hidden: boolean; state: string;
}
export type SendTarget =
  | { chat: string }
  | { customer: { phoneE164: string; personId: string | null }; make: boolean };
export type SendFrom =
  | { ok: true; chat: SendingChat; connection: ConnectionRow }
  | { ok: false; code: "not_connected" | "paused" | "disconnected" | "none_yet" };
export function sendFrom(tx: OrgTx, target: SendTarget): Promise<SendFrom>;
/** Rule 2's chat, whether its number can send or not: the latest written to on a live number, else the main's; null. */
export function customerChatOf(tx: OrgTx, phoneE164: string): Promise<SendingChat | null>;
/** The chosen template if it is on the number, else the approved one of the same name and language there; null. */
export function templateOnNumber(tx: OrgTx, templateId: string, connectionId: string): Promise<string | null>;

// routes.ts
/** A page of the organizations with a route, each once, by id: what the per-agency jobs walk. */
export function routedOrganizationsPage(db: Database, input: { after?: string; limit: number }): Promise<string[]>;

// test/inbox/support.ts
/** A second number in the agency of `first`, routed; "Sales 2" and connected unless told. */
export function aSecondNumber(
  test: TestInbox, first: TestConnection, options?: { label?: string; status?: string; main?: boolean },
): Promise<TestConnection>;
/** Runs the worker's sender on a queued message; the number MSG91 was asked to send from, or null for none. */
export function sentFrom(test: TestInbox, organizationId: string, messageId: string, at?: Date): Promise<string | null>;
```

`sendFrom` makes a chat (and fills a missing `personId`) only for `{ customer, make: true }`, as `chatForLead` does
today.

- [ ] **Step 1: Write the failing tests.**
  - db: `it("keeps one main number and one live record of a number per agency")`, `it("lets an agency keep two live
    numbers")`, `it("refuses a label of no characters or more than 20")`, `it("refuses deleting a number an assignment
    rule names")`.
  - `send-from.test.ts`:
    - `it("sends in a chat from the chat's own number, never the main one")`
    - `it("refuses a chat whose number is paused, setting up or disconnected, naming which")`
    - `it("sends to a customer from the number they last wrote to, not the one we last wrote from")`
    - `it("starts a customer who wrote to no live number on the main number, making the chat only when asked")`
    - `it("passes over a disconnected number the customer last wrote to")`
    - `it("finds the main number: the flagged one, else the oldest live one, connected before setting up")`
    - `it("takes the same template by name and language on the sending number, and none when it lacks one")`
  - `routed-organizations.test.ts`: `it("lists an agency with two routed numbers once")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/whatsapp-numbers-schema.test.ts` and
  `pnpm --filter @travel-crm/domain test -- test/inbox/send-from.test.ts test/inbox/routed-organizations.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement** the migration by hand (spec section 13), the schema to match, then
  `pnpm --filter @travel-crm/db generate`.
- [ ] **Step 4: Run** the same, `pnpm --filter @travel-crm/domain test -- test/inbox`, `pnpm migrations:check` and both
  packages' `typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(inbox): several numbers per agency, and one rule for which number a send goes from`.

### Task 2: In a chat, the chat's own number (paths 1–9 and 11, and the worker)

**Files:**
- Modify: `inbox/outbox.ts` (`sendableChat` through `sendFrom({ chat })`); `inbox/system-send.ts` (`queueSystemText`
  the same); `inbox/template-send.ts` (`assertTemplateAllowed` reads the chat's number with `connectionById`, and counts
  the day's templates and the marketing messages on their way on that number alone); `errors.json`
  (`WHATSAPP_NUMBER_DISCONNECTED`: "This chat's WhatsApp number was disconnected. Start a chat from the main number to
  reach them.")
- Test: `packages/domain/test/inbox/numbers-in-chat.test.ts`

**Interfaces:**
- `sendableChat` keeps its signature, and its `connectionId` is the chat's own.
- It refuses `WHATSAPP_NUMBER_DISCONNECTED` for a disconnected number, `WHATSAPP_PAUSED` for a paused one, and
  `WHATSAPP_NOT_CONNECTED` for one being set up, a demo number, or WhatsApp not configured.
- `queueSystemText` keeps its codes (MN2).

- [ ] **Step 1: Write the failing tests** (each with two numbers, the chat on "Sales 2"):
  - `it("sends a staff reply and a file from the chat's number when the agency has two")` (paths 1, 2)
  - `it("sends a template in a chat from the chat's number, and refuses another number's template")` (3)
  - `it("tries a failed message again from the chat's number")` (4)
  - `it("sends a staff trip kit and a keyword trip kit from the chat's number")` (5, 8; the agency's AI off)
  - `it("sends a scheduled message from the chat's number")` (6)
  - `it("sends the away, welcome and keyword answers from the chat's number")` (7)
  - `it("sends the AI's reply, file and card from the chat's number")` (9, through `sendAiText`)
  - `it("sends a payment message in the booking's chat from that chat's number")` (11, `sendToChat`)
  - `it("refuses every send in a chat whose number was disconnected, and tells staff why")` (Review Focus 3)
  - `it("refuses sends only in the paused number's chats")`
  - `it("counts the day's template cap and the month's marketing cap on the chat's number alone")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/inbox/numbers-in-chat.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/inbox test/ai/one test/ai/natural` and
  `pnpm --filter @travel-crm/web test -- test/lib/error-reasons.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `fix(inbox): a message in a chat goes from the chat's own number, whichever numbers are live`.

### Task 3: Outside a chat, the number the customer last wrote to, else the main (paths 12–18)

**Files:**
- Modify:
  - `sales/send.ts`: `chatForLead` goes through `sendFrom({ customer })`. `sendToChat` takes the template on the chat's
    number with `templateOnNumber`, and when there's none returns `{ kind: "never", reason: "TEMPLATE_NOT_ON_NUMBER" }`.
  - `inbox/template-send.ts`: `startChatForLead` goes through `sendFrom({ customer, make: true })`.
  - `inbox/views.ts`: `leadChatOf` returns `customerChatOf`'s chat when the member may see it, else, as today, the
    person's most recent visible chat.
  - `bookings.json`: the reminders' note `TEMPLATE_NOT_ON_NUMBER`, "template not on that number".
- Test: `packages/domain/test/inbox/numbers-outside-chat.test.ts`, `packages/domain/test/sales/sales-rules.test.ts`,
  `packages/domain/test/bookings/booking-trip.test.ts`, `packages/domain/test/bookings/payment-messages.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `numbers-outside-chat.test.ts`:
    - `it("opens the lead's chat on the number the customer last wrote to")` (12)
    - `it("opens an old chat on a disconnected number when the customer has no other, so it stays readable")` (12)
    - `it("starts a chat with a lead who never wrote on the main number")` (13)
    - `it("starts a chat on the main number for a customer whose only number was disconnected")` (13; owner 9)
    - `it("sends to a lead from the number they last wrote to, as words in the window and as a template outside")`
    - `it("skips an automatic message whose template isn't on the sending number, and sends nothing from another")`
      (Review Focus 2)
    - `it("waits while the customer's number is paused, and never moves to the main number")`
  - `sales-rules.test.ts`: `it("sends the speed-to-lead message and a follow-up from the number the customer last wrote
    to")` (14), `it("sends a sales reminder from the number the customer last wrote to")` (15).
  - `booking-trip.test.ts`: `it("sends a booking reminder and the feedback ask from the number the customer last wrote
    to")` (16, 17).
  - `payment-messages.test.ts`: `it("tells the customer about their payment from the number they last wrote to")` (18).
- [ ] **Step 2: Run** the four test files; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/inbox test/sales test/bookings`; expect PASS.
- [ ] **Step 5: Commit** `feat(inbox): a send outside a chat goes from the number the customer last wrote to, else the
  main`.

### Task 4: Templates and broadcasts per number (path 10)

**Files:**
- Modify: `inbox/templates.ts`, `inbox/broadcast.ts`, `inbox/broadcast-audience.ts`, `inbox/broadcast-send.ts`,
  `packages/api/src/routers/whatsapp-templates.ts`, `packages/contracts/src/inbox/{templates,broadcasts}.ts`,
  `apps/web/src/inbox/template-form.tsx` (create's call sends `{ draft }`, MN4; nothing else)
- Test: `packages/domain/test/inbox/templates.test.ts`, `packages/domain/test/inbox/broadcast.test.ts`

**Interfaces:**

```ts
// contracts/inbox/templates.ts
export const templateListInput = z.strictObject({ connectionId: recordId.optional() });
export const sendableTemplatesInput = z.strictObject({ conversationId: recordId.optional(), connectionId: recordId.optional() });
export const createTemplateInput = z.strictObject({ connectionId: recordId.optional(), draft: templateDraftInput });
// templateSummary gains connectionId: recordId; templateList gains connectionId: recordId.nullable() (the number listed)
// contracts/inbox/broadcasts.ts: broadcastPreview.leftOut gains otherNumber: z.int()

// templates.ts
listTemplates(tx, { onlyApproved, now, timeZone?, connectionId?: string })    // none named: the main number
sendableTemplates(tx, access, input: SendableTemplatesInput, now)              // MN3; a chat out of sight: NOT_FOUND
createTemplate(deps, access, input: CreateTemplateInput, now)                  // on the named live number, else main
editTemplate(deps, access, templateId, draft, now)                             // on the template's own number
syncTemplates(deps, organizationId, now, connectionId?: string)                // that number, or every live one
syncAllTemplates(dependencies, now)                                            // each route's own number
```

Broadcasts:
- A broadcast goes from its template's number. `createBroadcast` locks that number's row and refuses
  `WHATSAPP_NOT_CONNECTED` unless it is connected or in trouble.
- The audience is the chats on that number. The allowance, the messages on their way and the day's count are that
  number's.
- `broadcast-send.ts` reads the recipient's chat through `sendFrom({ chat })`. A number that can't send holds the batch,
  as today.

- [ ] **Step 1: Write the failing tests:**
  - `templates.test.ts`:
    - `it("lists templates per number, the main number's when none is named")`
    - `it("lists a chat's number's templates for the send dialog, and refuses a chat the member can't see")`
    - `it("writes a template on the named number and sends an edited one to its own")`
    - `it("refreshes every live number's templates, and the half-hourly pass each route's own")`
  - `broadcast.test.ts`:
    - `it("sends a broadcast from its template's number to that number's chats only")` (path 10)
    - `it("counts the matching chats on other numbers as left out")`
    - `it("holds a broadcast while its number is paused, whatever the other number does")`
    - `it("counts the marketing allowance and the day's cap on the broadcast's number")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/inbox/templates.test.ts test/inbox/broadcast.test.ts`;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, `pnpm --filter @travel-crm/contracts test`, and the api's and web's `typecheck`; expect
  PASS.
- [ ] **Step 5: Commit** `feat(inbox): templates and broadcasts per WhatsApp number`.

### Task 5: The inbox says which number

**Files:**
- Modify: `inbox/views.ts` (`inboxStatusOf`, `listConversations`, `conversationHeaderOf`),
  `packages/contracts/src/inbox/{chat,inputs}.ts`
- Test: `packages/domain/test/inbox/numbers-views.test.ts`

**Interfaces:**

```ts
export const whatsappNumber = z.object({
  id: recordId, label: z.string(), displayNumber: z.string(),
  status: whatsappConnectionStatus, main: z.boolean(), aiAnswers: z.boolean(),
});
// inboxStatus gains numbers: z.array(whatsappNumber) (numbersOf: every number, live first).
//   connected: any live number past setting up. connectionStatus and number stay, as the main's, until Task 6 (MN5).
// conversationListItem gains connectionId: recordId.
// conversationHeader gains number: z.object({ id: recordId, label: z.string(), status: whatsappConnectionStatus })
//   and otherChats: z.array(z.object({ id: recordId, label: z.string() })): the same phone on other numbers, open,
//   not hidden, seen by the member, newest first.
// listConversationsInput gains connectionId: recordId.optional().
```

- [ ] **Step 1: Write the failing tests:**
  - `it("lists every number with its label, status, main mark and AI switch, live ones first")`
  - `it("says WhatsApp is connected while any number is, and shows each chat's number")`
  - `it("filters the chats by number")`
  - `it("names the chat's number in its header and links the customer's chat on another number")`
  - `it("links no chat the member may not see")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/inbox/numbers-views.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/inbox`, the contracts' tests, and the web's
  `typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(inbox): the inbox says which number each chat is on, and filters by it`.

### Task 6: The inbox's screens (path 20)

Builder B, after Task 9, with A2 and C1 merged.

**Files:**
- Create: `apps/web/src/inbox/use-numbers.ts` (the agency's numbers from `inbox.status`, and whether to show them)
- Modify:
  - `apps/web/src/inbox/`: `conversation-list.tsx` (the label), `inbox-filters.tsx` and `use-inbox.ts` (the Number
    filter, kept in the tab), `chat-header.tsx` (the label and "Also on Sales 2"), `reply-area.tsx` (by
    `header.number.status`: paused, or disconnected with Start a chat), `lead-chat.tsx` (exports `StartChat` for the
    reply box), `inbox-screen.tsx` (the banner names each paused or troubled number), `whatsapp-settings-screen.tsx`
    (the numbers list), `templates-section.tsx`, `template-form.tsx` and `use-templates.ts` (the number picker),
    `send-template-dialog.tsx` (`sendable({ conversationId })`), `broadcasts/new-broadcast-dialog.tsx` (the number,
    main first), `broadcasts/broadcast-preview.tsx` (`otherNumber`);
  - `inbox.json`;
  - last, `packages/contracts/src/inbox/chat.ts` and `views.ts`'s `inboxStatusOf`: `connectionStatus` and `number` go
    (MN5).
- Test: `apps/web/test/inbox/numbers.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `it("shows each chat's number only when the agency has two numbers")`
  - `it("filters the chats by number, kept in the tab")`
  - `it("links the customer's chat on the other number from the header")`
  - `it("says a disconnected number's chat can't be answered, and offers a chat from the main number")`
  - `it("keeps replies open in one number's chats while the other number is paused")`
  - `it("lists the chat's own number's templates in the send dialog")`
  - `it("picks a broadcast's number, the main one first, and lists its templates")` (path 20)
  - `it("lists the numbers in WhatsApp settings and writes a template on the picked number")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/inbox/numbers.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/web test -- test/inbox`, the web's `typecheck` and `lint`, and the
  domain's `test/inbox`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): the inbox shows each chat's number, filters by it and links a customer's other chat`.

### Task 7: The console runs each number, within the plan

**Files:**
- Modify: `inbox/connection.ts`, `inbox/index.ts`, `platform/whatsapp.ts`, `packages/api/src/platform/routers/whatsapp.ts`,
  `packages/contracts/src/inbox/console.ts`, `audit.json` (`whatsapp.made-main`, `whatsapp.renamed`)
- Test: `packages/domain/test/platform/whatsapp-numbers.test.ts`

**Interfaces:**

```ts
// contracts/inbox/console.ts
export const numberLabel = z.string().trim().min(1).max(20);
// connectWhatsappInput gains label: numberLabel; setWhatsappCapsInput gains connectionId: recordId
export const whatsappNumberInput = z.strictObject({ organizationId: recordId, connectionId: recordId });
export const renameWhatsappInput = z.strictObject({ organizationId: recordId, connectionId: recordId, label: numberLabel });
// consoleConnection gains label: z.string(), main: z.boolean() (mainConnection's)
export const consoleNumber = consoleConnection.extend({
  usage: z.array(whatsappUsageRow),
  cannotConnectReason: z.enum(["NO_INBOX_MODULE", "NO_NUMBER_LIMIT", "NOT_SEEN"]).nullable(),
});
// consoleOrganizationWhatsapp becomes z.object({ configured, numbers: z.array(consoleNumber),
//   limit: z.object({ used: z.int(), allowed: z.int() }), cannotAddReason: z.enum(["NO_INBOX_MODULE", "LIMIT_REACHED"]).nullable() })

// inbox/connection.ts: each takes the number; MN7.
connectNumber(tx, actor, input, now): Promise<string>          // main when the agency has no live number
markConnected(tx, actor, connectionId, now); pauseNumber(…); resumeNumber(…); disconnectNumber(…); setCaps(tx, actor, input)
setMainNumber(tx, actor, connectionId): Promise<void>          // a live number; audited whatsapp.made-main
renameNumber(tx, actor, input: { connectionId: string; label: string }): Promise<void>   // audited whatsapp.renamed

// platform/whatsapp.ts
connectWhatsApp(services, staff, input)         // guard under lockSubscription: the inbox module, live numbers < the limit
markWhatsAppConnected(services, staff, input: WhatsappNumberInput)   // the same guard, counting this number
pauseWhatsApp, resumeWhatsApp, disconnectWhatsApp, setWhatsAppMain (services, staff, input: WhatsappNumberInput)
renameWhatsApp(services, staff, input: RenameWhatsappInput); checkWhatsAppWithProvider(services, input: WhatsappNumberInput)
getOrganizationWhatsApp(services, organizationId, now): Promise<ConsoleOrganizationWhatsapp>
// router: super admins connect, markConnected, pause, resume, disconnect, setCaps, checkWithProvider, setMain, rename;
// staff of either level get and list.
```

"Live" means setting up, connected, problem or paused, and `limit.used` counts those. The refusal is the existing
`WHATSAPP_NUMBER_LIMIT`.

- [ ] **Step 1: Write the failing tests:**
  - `it("records a second number on a two-number plan, and refuses a third")`
  - `it("refuses the last place to one of two records made at once")` (Review Focus 5)
  - `it("makes the first number recorded the main one, and keeps it main when a second comes")`
  - `it("counts a trial's numbers against its plan, and refuses Mark connected past it after a downgrade")`
  - `it("pauses, resumes, disconnects and checks one number, leaving the other as it was")`
  - `it("moves the main mark, and shows the oldest live number as main once the main is disconnected")`
  - `it("renames a number")`
  - `it("refuses another agency's number as not found, and a number the agency already has live")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/platform/whatsapp-numbers.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, `pnpm --filter @travel-crm/domain test -- test/inbox test/platform`, the api's tests and
  `pnpm --filter @travel-crm/web test -- test/audit`; expect PASS. The web's `typecheck` passes only with Task 8.
- [ ] **Step 5: Commit** `feat(platform): the console connects and runs each of an agency's WhatsApp numbers within its
  plan`.

### Task 8: The console's screens

Merges with Task 7.

**Files:**
- Create: `apps/web/src/console/whatsapp/number-block.tsx` (one number's details and actions; Disconnect asked once
  more, naming the number that becomes main), `apps/web/src/console/whatsapp/rename-number-dialog.tsx` (`FormDialog`)
- Modify: `apps/web/src/console/whatsapp/organization-whatsapp.tsx` (the list, "1 of 2 numbers", Connect a number),
  `connect-dialog.tsx` (Label), `whatsapp-screen.tsx` (the Label and Main columns), `console-whatsapp.json`,
  `apps/web/test/e2e/support/whatsapp.ts` (`recordNumber` fills Label)
- Test: `apps/web/test/console/whatsapp/organization-numbers.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `it("lists each number with its label, status and main mark, and its own actions")`
  - `it("acts on the number whose button was pressed")`
  - `it("offers Connect a number while the plan has room, and says 2 of 2 when it has none")`
  - `it("asks before disconnecting the main number, naming the number that becomes main")`
  - `it("renames a number and makes another main")`
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/console/whatsapp`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and the web's `typecheck` and `lint`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): the console shows and runs each of an agency's WhatsApp numbers`.

### Task 9: The AI's switch on each number

**Files:**
- Create: `inbox/number-ai.ts`, `apps/web/src/ai/agent/number-switches.tsx`
- Modify:
  - `inbox/index.ts`; `inbox/automation.ts` (`aiAgentOn` takes the chat); `inbox/trip-kit-send.ts` (passes it);
  - `ai/may-write.ts`, `ai/agent-reach.ts`, `ai/agent-worker.ts` (`turnFor`, and `runAiNudges` through
    `routedOrganizationsPage`), `ai/chat-state.ts`, `ai/insight.ts`, `ai/agent-setup.ts`, `ai/lite/act-gates.ts`;
  - `packages/contracts/src/ai/{autopilot,agent-setup}.ts`, `packages/api/src/routers/ai.ts`;
  - `apps/web/src/ai/agent/agent-screen.tsx` (mounts the switches), `apps/web/src/ai/chat-ai-card.tsx`;
  - `ai-agent.json`, `ai.json`, `audit.json` (`whatsapp.number-ai-on`, `whatsapp.number-ai-off`).
- Test: `packages/domain/test/ai/number-switch.test.ts`, `apps/web/test/ai/agent/number-switches.test.tsx`,
  `apps/web/test/ai/chat-ai-card.test.tsx`

**Interfaces:**

```ts
// inbox/number-ai.ts
/** The chat's number lets the AI answer: its switch is on and it isn't disconnected (spec section 8). */
export function numberAnswers(tx: OrgTx, conversationId: string): Promise<boolean>;
/** One number's AI on or off: audited, another agency's number NOT_FOUND. */
export function setNumberAnswers(tx: OrgTx, access: MemberAccess, input: SetNumberAnswersInput): Promise<void>;
// inbox/automation.ts
export function aiAgentOn(tx: OrgTx, organizationId: string, conversationId: string): Promise<boolean>;
// ai/may-write.ts: every caller now passes the number's switch
export const agentAnswers = (mode: string | undefined, autopilot: boolean, numberOn: boolean) =>
  autopilot && numberOn && mode !== "off";
// ai/agent-reach.ts
export const chatOpenToAgent: (chat: ChatSwitches, numberOn: boolean) => boolean;
export function answersInChat(reach: AgentReach, chat: ChatSwitches, numberOn: boolean): boolean;
// contracts
export const setNumberAnswersInput = z.strictObject({ connectionId: recordId, on: z.boolean() });
// agentSetup gains numbers: z.array(z.object({ id: recordId, label: z.string(), aiAnswers: z.boolean() })) (live ones);
// its "whatsapp" step's count is the connected numbers. chatAi gains numberOff: z.boolean().
// router: ai.setNumberAnswers = freshProcedure.requires("ai:manage").input(setNumberAnswersInput).output(agentSetup)
```

- [ ] **Step 1: Write the failing tests:**
  - `number-switch.test.ts`:
    - `it("answers on a number whose switch is on and not on one switched off, the agency's switch on")`
    - `it("answers on no number while the agency's switch is off, whatever the numbers say")`
    - `it("queues no turn and shows no AI mark for a chat on a number switched off")` (Review Focus 4)
    - `it("stops a turn whose number is switched off before it acts")`
    - `it("answers nothing in a disconnected number's chat")`
    - `it("sends a keyword trip kit on a number whose AI is off while the other's answers")`
    - `it("turns one number's AI on and off, audited, and refuses another agency's number")`
    - `it("lists the live numbers and their switches in the setup, and counts the connected ones")`
    - `it("walks each agency once for the AI's nudges, however many numbers it has")`
  - web: `it("shows a switch per number only when the agency has two")`, `it("turns one number's AI off")`, and in
    `chat-ai-card.test.tsx` `it("says the AI is off for this chat's number")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/number-switch.test.ts` and the two web files;
  expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai test/inbox`, the api's tests, and the web's
  `test/ai`, `test/audit`, `typecheck` and `lint`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): each WhatsApp number has its own AI switch, under the agency's`.

### Task 10: Assignment by the number a lead came in on

**Files:**
- Modify:
  - `crm/assignment/choose-owner.ts` (`LeadFacts.whatsappConnectionId`; a rule's number must equal it);
  - `crm/assignment/settings.ts` (reads and saves the condition; returns the agency's live numbers; a number not the
    agency's is `NOT_FOUND`);
  - `crm/assignment/assignment-audit.ts`;
  - `crm/save-enquiry.ts` (`assign.whatsappConnectionId`);
  - `crm/whatsapp-contact.ts` (`WhatsAppContact.connectionId`; `startLeadFromChat`'s input gains it);
  - `packages/contracts/src/crm/assignment.ts`;
  - `inbox/inbound.ts` (passes `connection.id`);
  - `inbox/adopt.ts` (every connected or troubled number's chats, each passing its number; `adoptAll` through
    `routedOrganizationsPage`);
  - `inbox/chat-actions.ts` and `ai/lite/open-lead.ts` (the chat's number).
- Test: `packages/domain/test/crm/assignment/{choose-owner,settings}.test.ts`, `packages/domain/test/inbox/inbound.test.ts`

**Interfaces:**

```ts
// contracts/crm/assignment.ts
// assignmentRuleInput gains whatsappConnectionId: recordId.nullable(), counted by the "at least one condition" refine.
// assignmentSettings.rules[] gains whatsappConnectionId: recordId.nullable(), whatsappLabel: z.string().nullable(),
//   whatsappGone: z.boolean() (its number is disconnected); assignmentSettings gains
//   whatsappNumbers: z.array(z.object({ id: recordId, label: z.string() })) (the live ones).
// choose-owner.ts: LeadFacts gains whatsappConnectionId: string | null (null for every lead not from WhatsApp).
// save-enquiry.ts: assign?: { workers: ReadonlySet<string>; whatsappConnectionId?: string }
```

- [ ] **Step 1: Write the failing tests:**
  - `choose-owner.test.ts`: `it("gives a lead that came in on a number to that number's rule")`, `it("passes a
    number's rule over for a lead from anywhere else")`.
  - `settings.test.ts`: `it("saves a rule whose one condition is a WhatsApp number, and refuses a number that isn't
    the agency's")`, `it("marks a rule whose number was disconnected")`.
  - `inbound.test.ts`:
    - `it("assigns a first message by the rule for the number it came in on")`
    - `it("adopts the chats of every connected number, each by its number's rule")`
    - `it("starts a new lead in a chat by that chat's number's rule")`
    - `it("adopts an agency's chats once a pass, however many numbers it has")`
- [ ] **Step 2: Run** the three test files; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/crm test/inbox test/ai/lite`; expect PASS. The
  web's `typecheck` passes only with Task 11.
- [ ] **Step 5: Commit** `feat(crm): an assignment rule can send the leads that came in on one WhatsApp number to one
  person`.

### Task 11: The assignment screen's number condition

Merges with Task 10.

**Files:**
- Modify: `apps/web/src/crm-settings/assignment/{rule-row,rules-card}.tsx`,
  `apps/web/src/crm-settings/assignment/assignment-values.ts`, `settings.json`
- Test: `apps/web/test/crm-settings/assignment-screen.test.tsx`

- [ ] **Step 1: Write the failing tests:** `it("offers the WhatsApp number condition when the agency has two numbers,
  and saves it")`, `it("shows no number condition with one number, and marks a rule whose number is gone")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/web test -- test/crm-settings/assignment-screen.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and the web's `typecheck` and `lint`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): the assignment rules offer the WhatsApp number a lead came in on`.

### Task 12: Each agency's jobs run once a pass

**Files:**
- Modify: `inbox/scheduled.ts` (`runDueWork`) and `sales/worker.ts` (`runSalesDueWork`), both through
  `routedOrganizationsPage`
- Test: `packages/domain/test/inbox/scheduled.test.ts`, `packages/domain/test/sales/due-work-once.test.ts`

- [ ] **Step 1: Write the failing tests:** `it("runs an agency's due work once a pass, however many numbers it has")`,
  and in the new file `it("runs an agency's sales due work once a pass with two numbers")` (Review Focus 6).
- [ ] **Step 2: Run** both files; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/inbox test/sales`; expect PASS.
- [ ] **Step 5: Commit** `fix(inbox): the per-agency jobs walk each agency once, not once per number`.

### Task 13: "WhatsApp us" on the public trip page (path 19)

**Files:**
- Modify:
  - `packages/contracts/src/package-pages/pages.ts`: `publicAgency.whatsapp: z.string().nullable()`, E.164.
  - `packages/api/src/public-package.ts`: `agencyOf` gives the main number's display number when it isn't still being
    set up, else the contact phone.
  - `apps/web/src/package-pages/package-view.tsx`: WhatsApp uses `agency.whatsapp` and Call uses `agency.phone`, each
    shown when it's there.
- Test: `apps/api/test/package-page-routes.test.ts`, `apps/web/test/package-pages/package-view.test.tsx`

- [ ] **Step 1: Write the failing tests:** api `it("points WhatsApp us at the main number, and at the contact phone
  with no number connected")`; web `it("dials the contact phone and opens WhatsApp on the main number")`.
- [ ] **Step 2: Run** both files; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and the api's and web's `typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(package-pages): WhatsApp us on a trip page goes to the agency's main number`.

### Task 14: No "agency's number" left, one journey, the gate

The lead, after every merge point.

**Files:**
- Modify: `inbox/connection-row.ts` and `inbox/index.ts` (delete `liveConnection` and `requireConnection`),
  `docs/adr/0035-whatsapp-through-msg91.md` (a dated line: an agency may have several numbers, spec 2026-11-22)
- Create: `apps/web/test/e2e/whatsapp-two-numbers.spec.ts`

- [ ] **Step 1: Write the journey:** `test("a reply in the second number's chat goes from the second number, and the
  chat links the first")`. A super admin records and connects two numbers on a two-number plan; a customer writes to
  both; staff reply in the second number's chat; the fake MSG91's `/_sent` shows it sent from the second number; the
  header links the first chat.
- [ ] **Step 2: Delete** `liveConnection` and `requireConnection`. Run `pnpm --filter @travel-crm/domain typecheck`;
  expect PASS (Review Focus 1: nothing still asks for the agency's number).
- [ ] **Step 3: Run** the full gate once: `pnpm check`, `pnpm migrations:check`, and the journeys; fix what fails
  (re-run a known flaky journey alone before chasing it).
- [ ] **Step 4: Commit** `refactor(inbox): remove the one-number lookup, and add the two-numbers journey`.

## Before an agency gets a second number

- [ ] Platform staff rename its first number from "WhatsApp" to its real label.
- [ ] Its automation templates (sales and bookings) are set up and approved on the new number in MSG91, then
  refreshed in WhatsApp settings (Review Focus 2).
- [ ] The agency chooses whether the AI answers on the new number (the AI agent page).
