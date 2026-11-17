# AI agent pause switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super admins pause the WhatsApp AI agent from the console for every agency at once or for one agency; while
paused, no agent turn, follow-up or follow-up task writes to a customer, and no agency can undo it.

**Architecture:** Two platform-owned column pairs, `ai_agent_paused_at`/`_by` on `subscription_policy` (every agency)
and on `subscription` (one agency): the runtime role reads them, only the platform role writes them (as with the
subscription's manual suspension). `agentPauseOf(tx, organizationId)` (subscriptions module) is read fresh, never from
the api's five-minute access cache, at every point where the agent could write. The console gets a platform router
`aiAgent` and two small blocks; the agency's AI screen says when support has paused it.

**Tech Stack:** Postgres 18 + Prisma 7.10.0 migration, domain TypeScript, tRPC (console router), Next.js + next-intl +
shadcn registry components, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-lite-whatsapp-agent-design.md` (section H, N8: "A pause switch in the
console: every agency at once, or one agency. Built first.")

## Global Constraints

- Every shell command starts with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (Node 24).
- Strict TypeScript: no `any`, no `!` non-null assertions. Inputs `z.strictObject`, outputs `z.object`.
- Only the platform role writes the pause columns; the runtime role reads them. The table-level REVOKE stays and no new
  column grant is added.
- A change to one agency is recorded in that agency's audit log under the platform admin's name (the
  `actorIn(organizationId, by)` pattern of `packages/domain/src/subscriptions/access-by-hand.ts`) and in the platform
  log (`recordPlatformAudit`); the every-agency switch goes in the platform log only.
- Pausing and resuming: `superAdminProcedure`. Reading the state: `staffProcedure`.
- Every word on screen is a next-intl message. A new audit action needs its sentence in `audit.json`
  (`actions.<entity>.<what>`) and in `console-platform.json` (as `suspension-lifted` has).
- shadcn registry components only, no extra border/ring/shadow classes; confirmations use `ConfirmDialog` with
  `returnFocusTo`; console times use `formatDayTime(..., { timeZone: PLATFORM_TIME_ZONE })`.
- Commits: Conventional Commits, stage files by name (never `git add -A`/`.`), no `Co-Authored-By` trailer, never
  `--no-verify`.
- Tests that need Postgres need Docker: `pnpm db:up` for the run, `pnpm db:down` right after.
- The repository is public: no client agency names in code, tests, commits or docs.

## Review Focus

1. A pause that lands after a customer's turn was queued: the queued job sends nothing (Task 2 test "a turn already
   queued before the pause sends nothing").
2. A follow-up that comes due during the pause is not used up; after resume it is worked only if still inside its
   window (Task 2 test "a follow-up due while paused stays due, and is worked after resume").
3. An organization without a subscription row: `agentPauseOf` returns the every-agency pause or null and never throws
   (Task 2 test "agentPauseOf ...").
4. Pausing what is already paused, or resuming what runs: nothing changes and no audit or platform-log entry is written
   (Task 3 test "pausing again changes nothing and logs nothing").
5. Support-level staff call pause or resume: FORBIDDEN (Task 3 router test).

---

### Task 1: Storage

**Files:**
- Create: `packages/db/prisma/migrations/20261112100000_ai_agent_pause/migration.sql`
- Modify: `packages/db/prisma/schema/subscriptions.prisma` (models `Subscription`, `SubscriptionPolicy`)
- Test: `packages/db/test/subscription-grants.test.ts`, `packages/db/test/subscription-tables.test.ts`

**Interfaces:**
- Produces: Prisma fields `aiAgentPausedAt: Date | null` and `aiAgentPausedBy: string | null` on both `subscription`
  and `subscriptionPolicy`.

- [ ] **Step 1: Write the failing tests**

In `subscription-grants.test.ts`, test "the runtime reads both agent pauses but can't set them": inside
`db.forOrg(organizationId, ...)`, `tx.subscription.findUnique(...)` and `tx.subscriptionPolicy.findUnique(...)` return
`aiAgentPausedAt: null`; an update setting `{ aiAgentPausedAt: new Date(), aiAgentPausedBy: <a uuid> }` on each
rejects with `/permission denied/`.

In `subscription-tables.test.ts`, test "an agent pause names who set it": a platform-client update setting
`aiAgentPausedAt` without `aiAgentPausedBy` rejects with `/subscription_policy_agent_pause/` on the policy and
`/subscription_agent_pause/` on a subscription; setting both succeeds; clearing both succeeds.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm db:up && pnpm --filter @travel-crm/db test -- subscription-grants subscription-tables`
Expected: FAIL (unknown field `aiAgentPausedAt`).

- [ ] **Step 3: Write the migration and the schema fields**

```sql
-- The WhatsApp AI agent's pause (lite agent spec, N8): platform staff pause it for every agency (the policy's row) or
-- for one (its subscription). The runtime reads them; the table-level REVOKE keeps writing to the platform role.
ALTER TABLE "subscription_policy"
  ADD COLUMN "ai_agent_paused_at" TIMESTAMPTZ(6),
  ADD COLUMN "ai_agent_paused_by" UUID,
  ADD CONSTRAINT subscription_policy_agent_pause CHECK ((ai_agent_paused_at IS NULL) = (ai_agent_paused_by IS NULL));
ALTER TABLE "subscription"
  ADD COLUMN "ai_agent_paused_at" TIMESTAMPTZ(6),
  ADD COLUMN "ai_agent_paused_by" UUID,
  ADD CONSTRAINT subscription_agent_pause CHECK ((ai_agent_paused_at IS NULL) = (ai_agent_paused_by IS NULL));
```

Prisma: `aiAgentPausedAt DateTime? @map("ai_agent_paused_at") @db.Timestamptz(6)` and
`aiAgentPausedBy String? @map("ai_agent_paused_by") @db.Uuid` on both models, each with a `///` comment (who may write
it, what it stops).

- [ ] **Step 4: Run the tests and the migration check**

Run: `pnpm --filter @travel-crm/db exec prisma generate && pnpm --filter @travel-crm/db test -- subscription-grants subscription-tables && pnpm migrations:check`
Expected: PASS; no drift. Then `pnpm db:down`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/migrations/20261112100000_ai_agent_pause/migration.sql packages/db/prisma/schema/subscriptions.prisma packages/db/test/subscription-grants.test.ts packages/db/test/subscription-tables.test.ts
git commit -m "feat(db): platform-owned pause columns for the WhatsApp agent"
```

### Task 2: The agent stays silent while paused

**Files:**
- Create: `packages/domain/src/subscriptions/agent-pause.ts`
- Modify: `packages/domain/src/subscriptions/index.ts`, `packages/domain/src/ai/agent.ts` (`runAgentTurn`),
  `packages/domain/src/ai/agent-worker.ts` (`aiCustomerWroteListener`, `aiChatResumedListener`, `nudgeAgency`),
  `packages/domain/src/ai/follow-up-work.ts` (`workDueFollowUps`), `packages/api/src/routers/ai.ts` (`chatAi`)
- Test: `packages/domain/test/ai/agent-pause.test.ts` (new; build its setup the way `packages/domain/test/ai/autopilot.test.ts` does, and set the pause columns with the platform client)

**Interfaces:**
- Consumes: Task 1's fields.
- Produces:
  ```ts
  /** Why the agent may not write now: paused for every agency, or for this one; null when it runs. */
  export type AgentPause = { scope: "everyone" | "agency"; since: Date } | null;
  export async function agentPauseOf(tx: OrgTx, organizationId: string): Promise<AgentPause>;
  ```
  "everyone" wins when both are set. No subscription row: only the every-agency pause counts.

- [ ] **Step 1: Write the failing tests**

- "agentPauseOf: running, paused for the agency, paused for everyone, both (everyone wins), no subscription row".
- "a customer's message to a paused agency queues no turn and marks nothing": the fake queue received no job and the
  chat's `aiChat.turnState` stays null.
- "a turn already queued before the pause sends nothing": `runAgentTurn(...)` returns `"paused"`, and no outbound
  `whatsappMessage` is created.
- "a chat given back to the AI while paused queues nothing" (`aiChatResumedListener`).
- "a follow-up due while paused stays due, and is worked after resume": with the pause set, `runAiNudges` leaves
  `aiChat.followUpAt` unchanged; cleared, the next run works it.
- "a lead follow-up task due while paused is not claimed": no `aiFollowUpTouch` row is written.
- "pausing every agency stops an agency that isn't paused itself".

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm db:up && pnpm --filter @travel-crm/domain test -- test/ai/agent-pause`
Expected: FAIL (`agentPauseOf` not exported).

- [ ] **Step 3: Implement**

- `agentPauseOf` reads `subscriptionPolicy.aiAgentPausedAt` then `subscription.aiAgentPausedAt` in the given tx.
- `runAgentTurn`: right after the `not_allowed` check and before the grounded dispatch, return `"paused"` when
  `agentPauseOf` is not null (one `db.forOrg` read), so both agents stop.
- The two listeners: inside their existing `forOrg`, a pause returns as "not wanted" before any `aiChat` write and
  before `queue.send`.
- `nudgeAgency` and `workDueFollowUps`: inside their `forOrg`, a pause returns `[]` before anything is claimed.
- `chatAi`: `answering` is false while paused (the pause joins the flag passed to `chatAiOf`).

- [ ] **Step 4: Run the tests and the AI suite**

Run: `pnpm --filter @travel-crm/domain test -- test/ai && pnpm --filter @travel-crm/api test -- ai-procedures && pnpm typecheck`
Expected: PASS. Then `pnpm db:down`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/subscriptions/agent-pause.ts packages/domain/src/subscriptions/index.ts packages/domain/src/ai/agent.ts packages/domain/src/ai/agent-worker.ts packages/domain/src/ai/follow-up-work.ts packages/api/src/routers/ai.ts packages/domain/test/ai/agent-pause.test.ts
git commit -m "feat(domain): the WhatsApp agent stays silent while paused"
```

### Task 3: Pausing from the console's api

**Files:**
- Create: `packages/contracts/src/platform/ai-agent.ts` (export from `packages/contracts/src/platform/index.ts`),
  `packages/domain/src/platform/ai-agent-pause.ts` (export from `packages/domain/src/platform/index.ts`),
  `packages/api/src/platform/routers/ai-agent.ts`
- Modify: `packages/domain/src/subscriptions/agent-pause.ts` (the agency write), `packages/api/src/platform/platform-router.ts`
  (register `aiAgent`), `apps/web/src/i18n/messages/en-IN/audit.json`, `apps/web/src/i18n/messages/en-IN/console-platform.json`
- Test: `packages/domain/test/platform/ai-agent-pause.test.ts`; router levels in `apps/api/test/console-agent-pause.test.ts`
  (built like `apps/api/test/console-suspensions.test.ts`)

**Interfaces:**
- Consumes: Task 2's `agentPauseOf`.
- Produces (contracts):
  ```ts
  export const agentPauseInfo = z.object({ since: z.iso.datetime() });
  export const agentPauseState = z.object({ everyone: agentPauseInfo.nullable() });
  export const organizationAgentPause = z.object({ agency: agentPauseInfo.nullable(), everyone: agentPauseInfo.nullable() });
  export const pauseEveryoneInput = z.strictObject({ paused: z.boolean() });
  export const pauseOrganizationInput = z.strictObject({ organizationId: recordId, paused: z.boolean() });
  export const organizationAgentPauseInput = z.strictObject({ organizationId: recordId });
  ```
  (with the inferred types `AgentPauseState`, `OrganizationAgentPause`, `PauseEveryoneInput`, `PauseOrganizationInput`)
- Produces (domain, platform):
  ```ts
  export function agentPauseState(services: PlatformServices): Promise<AgentPauseState>;
  export function organizationAgentPause(services: PlatformServices, organizationId: string): Promise<OrganizationAgentPause>;
  export function pauseEveryone(services: PlatformServices, staff: PlatformActor, input: PauseEveryoneInput): Promise<AgentPauseState>;
  export function pauseOrganization(services: PlatformServices, staff: PlatformActor, input: PauseOrganizationInput): Promise<OrganizationAgentPause>;
  ```
- Produces (router `aiAgent`): `pauseState` and `organizationPause` (staffProcedure, queries), `pauseEveryone` and
  `pauseOrganization` (superAdminProcedure, mutations), each with the schemas above.

- [ ] **Step 1: Write the failing tests**

Domain:
- "pausing every agency sets the policy's pause and logs it once; pausing again changes nothing and logs nothing":
  platform log action `ai-agent.paused-everyone`, then a second call adds no entry.
- "resuming every agency clears it and logs `ai-agent.resumed-everyone`".
- "pausing one agency sets its subscription's pause, writes `ai-agent.paused` in its audit log under the admin's name
  and in the platform log; resuming writes `ai-agent.resumed`".
- "an organization without a subscription can't be paused alone": `DomainError` with code `NOT_FOUND`.

Router: "support staff can read the pause but not change it": `pauseState` answers for support; `pauseEveryone` and
`pauseOrganization` throw FORBIDDEN for support and succeed for a super admin.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm db:up && pnpm --filter @travel-crm/domain test -- test/platform/ai-agent-pause && pnpm --filter @travel-crm/api-server test -- console-agent-pause`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

- The agency write lives in the subscriptions module (`setAgencyAgentPause(tx, by: ConsoleActor, organizationId, paused, now)`),
  which records the org audit entry (`entityType: "subscription"`, before/after `{ paused }`); the platform function
  wraps it in one platform transaction with `recordPlatformAudit` (`targetType: "organization"`).
- The every-agency write updates the policy row and records `recordPlatformAudit` with `targetType: "platform"`.
- Nothing is written when the state already matches the request.
- Audit sentences: `ai-agent.paused` "Paused the AI agent on WhatsApp", `ai-agent.resumed` "Resumed the AI agent on
  WhatsApp", `ai-agent.paused-everyone` "Paused the AI agent on WhatsApp for every agency",
  `ai-agent.resumed-everyone` "Resumed the AI agent on WhatsApp for every agency".

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @travel-crm/domain test -- test/platform/ai-agent-pause && pnpm --filter @travel-crm/api-server test -- console-agent-pause && pnpm typecheck`
Expected: PASS. Then `pnpm db:down`.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/platform/ai-agent.ts packages/contracts/src/platform/index.ts packages/domain/src/platform/ai-agent-pause.ts packages/domain/src/platform/index.ts packages/domain/src/subscriptions/agent-pause.ts packages/api/src/platform/routers/ai-agent.ts packages/api/src/platform/platform-router.ts apps/web/src/i18n/messages/en-IN/audit.json apps/web/src/i18n/messages/en-IN/console-platform.json packages/domain/test/platform/ai-agent-pause.test.ts apps/api/test/console-agent-pause.test.ts
git commit -m "feat(platform): super admins pause the WhatsApp agent for everyone or one agency"
```

### Task 4: The console's switch

**Files:**
- Create: `apps/web/src/console/whatsapp/agent-pause-block.tsx` (every agency; at the top of `whatsapp-screen.tsx`),
  `apps/web/src/console/organizations/organization/organization-agent-pause.tsx` (one agency; in
  `organization-screen.tsx`, right after the WhatsApp section)
- Modify: `apps/web/src/console/whatsapp/whatsapp-screen.tsx`, `apps/web/src/console/organizations/organization/organization-screen.tsx`,
  `apps/web/src/i18n/messages/en-IN/console-whatsapp.json` (an `agentPause` group)
- Test: `apps/web/test/console/whatsapp/agent-pause-block.test.tsx`, `apps/web/test/console/organizations/organization-agent-pause.test.tsx`
  (mock tRPC the way `apps/web/test/console/organizations/organization-screen.test.tsx` does)

**Interfaces:**
- Consumes: Task 3's router `aiAgent` (`pauseState`, `organizationPause`, `pauseEveryone`, `pauseOrganization`).

Exact copy:
- Every agency: title "AI agent on WhatsApp"; running "Answering for every agency that has it on."; paused "Paused for
  every agency since {time}. No AI replies or follow-ups go out."; buttons "Pause for every agency" / "Resume for every
  agency"; pause dialog "Pause the AI agent for every agency?" / "No agency's AI will answer or follow up on WhatsApp
  until you resume it. Their settings are kept, and staff can still reply." / confirm "Pause for every agency"; resume
  dialog "Resume the AI agent for every agency?" / "Agencies that have it on start answering again with their next
  customer message." / confirm "Resume".
- One agency: title "AI agent"; "Running"; "Paused for this agency since {time}"; "Paused for every agency since
  {time}" (shown with the agency's own state when both apply); buttons "Pause for this agency" / "Resume for this
  agency"; pause dialog "Pause the AI agent for {name}?" / "{name}'s AI won't answer or follow up on WhatsApp until you
  resume it. Its settings are kept." / confirm "Pause"; resume dialog "Resume the AI agent for {name}?" / "It starts
  answering again with the next customer message, if the agency has it on." / confirm "Resume".
- Support staff see the state, never the buttons (`isSuperAdmin(useStaff())`).

- [ ] **Step 1: Write the failing tests**

- Each state's sentence renders (running, paused for everyone, paused for the agency, both).
- A super admin sees the button; support doesn't.
- Confirming calls the mutation with `{ paused: true }` (and `{ organizationId, paused: true }`); while it is pending
  Cancel is disabled.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @travel-crm/web test -- agent-pause`
Expected: FAIL (components missing).

- [ ] **Step 3: Implement the two components and place them** (shadcn `Item`/`Card` and `StatusBadge`, `ConfirmDialog`
  with `returnFocusTo`, refresh with `queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() })`).

- [ ] **Step 4: Run the tests, lint and typecheck**

Run: `pnpm --filter @travel-crm/web test -- agent-pause no-hand-drawn-borders && pnpm --filter @travel-crm/web lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/console/whatsapp/agent-pause-block.tsx apps/web/src/console/organizations/organization/organization-agent-pause.tsx apps/web/src/console/whatsapp/whatsapp-screen.tsx apps/web/src/console/organizations/organization/organization-screen.tsx apps/web/src/i18n/messages/en-IN/console-whatsapp.json apps/web/test/console/whatsapp/agent-pause-block.test.tsx apps/web/test/console/organizations/organization-agent-pause.test.tsx
git commit -m "feat(web): the console's switch to pause the AI agent"
```

### Task 5: The agency sees the pause

**Files:**
- Modify: `packages/contracts/src/ai/autopilot.ts` (`autopilotSettings` gains `pausedBySupport: z.boolean()`),
  `packages/domain/src/ai/autopilot.ts` (`autopilotSettingsOf(tx, organizationId)` fills it from `agentPauseOf`; update
  its callers), `apps/web/src/ai/autopilot-section.tsx`, the AI settings messages file that `autopilot-section.tsx`
  already reads
- Test: `packages/domain/test/ai/autopilot.test.ts` (extend), the autopilot section's web test (extend; create
  `apps/web/test/ai/autopilot-section.test.tsx` if none exists)

**Interfaces:**
- Consumes: Task 2's `agentPauseOf`.

Exact copy (the registry `Alert`, above the autopilot switch): "{product} support has paused your AI agent on WhatsApp.
Your settings are kept, and it starts answering again when support resumes it." (`{product}` from `@travel-crm/brand`).

- [ ] **Step 1: Write the failing tests**: `pausedBySupport` is true for an agency pause and for an every-agency pause,
  false otherwise; the notice renders only when it is true.
- [ ] **Step 2: Run them to see them fail**: `pnpm db:up && pnpm --filter @travel-crm/domain test -- test/ai/autopilot && pnpm --filter @travel-crm/web test -- autopilot-section` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, then `pnpm typecheck`** → PASS; `pnpm db:down`.
- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ai/autopilot.ts packages/domain/src/ai/autopilot.ts apps/web/src/ai/autopilot-section.tsx <the messages file> <the tests>
git commit -m "feat(web): an agency sees when support has paused its AI agent"
```
