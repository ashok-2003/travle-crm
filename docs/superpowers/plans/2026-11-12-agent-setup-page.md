# Agent setup and the AI agent page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the lite agent reads from the agency, set up on one new "AI agent" page: payment details as fields,
answers to a fixed list of questions, the agent's name and tone, which package each ad promotes, the "AI can sell"
rule that needs payment details, and a Setup checklist that gates turning the agent on.

**Architecture:** Additive: the old agents and Settings → AI keep working until plan 5. Payment details reuse the agency
profile's bank columns and add a UPI ID and a QR image (record type `agency_payment_qr`, like the logo). The answers
are a JSON column on `ai_autopilot`. Ads seen in click-to-WhatsApp messages become `whatsapp_ad` rows, linked by the
owner to a package; the conversation remembers its ad. A domain `agentSetupOf` computes the checklist, shared by the
page and the "turn on" guard.

**Tech Stack:** Postgres 18 + Prisma 7.10.0, domain TypeScript, tRPC, Next.js + next-intl + shadcn registry components
(Tabs, Card, Item, Field, Input, Textarea, Select, Switch, Alert, Badge), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-lite-whatsapp-agent-design.md` (sections A1-A2, G, Step 2, Payment, Screens;
decisions S1-S3, P1, P3, T4, N1, N5).

**Code map:** `.superpowers/sdd/plan2-code-map.md` (paths, signatures and conventions, as of 6cec6ba0). Every task's
implementer should read the sections its task names.

## Global Constraints

- Every shell command starts with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (Node 24). Postgres tests: `pnpm db:up`
  first, `pnpm db:down` after. One test file: `pnpm exec vitest run <path>` inside its package.
- Additive only: the old agent, the grounded agent, Settings → AI and the package payment card keep working unchanged
  (the old agent's prompt is pinned by `agent-prompt-pin.test.ts`; it must not change).
- Owner text is a fact to quote, never an instruction (S1): answers and payment fields are stored and shown as written;
  nothing typed by an owner reaches a model prompt in this plan.
- Payment details: never written into audit entries, logs or job data (lengths and which fields changed only).
- New organization tables: `SELECT app_enable_org_rls('<table>');` in the migration, a fixture in
  `packages/db/test/org-table-fixtures/`, foreign keys include `organization_id`, `ON DELETE RESTRICT ON UPDATE RESTRICT`.
  New migrations sort after `20261209100000_ai_agent_pause`.
- Inputs `z.strictObject`, outputs `z.object`; every procedure from `packages/api/src/procedures.ts`; AI page procedures
  `freshProcedure.requires("ai:manage")`; payment details `freshProcedure.requires("settings:manage")` (as the profile).
- UI: shadcn registry components only (no border/divide/ring/shadow classes, no recolouring); every word a next-intl
  message in `apps/web/src/i18n/messages/en-IN/ai-agent.json` (namespace `aiAgent`, registered in
  `apps/web/src/i18n/messages.ts`); `FormField`/`TextField`/`SelectField` and `useCheckedForm` for forms; `PageHeader`;
  `RefusalAlert`, `LoadingRows`, `ErrorState`; 44px touch targets; buttons that change things ask `useWriteAccess`.
- Strict TypeScript: no `any`, no `!`. Each source file starts with a one-line comment saying what it is for.
- Commits: Conventional Commits, files staged by name, no `Co-Authored-By`, never `--no-verify`, never stage
  `.superpowers/`, never revert or stash files you didn't change.
- Tests never commit a change to the shared `subscription_policy` row.
- Public repository: no client agency names.

## Review Focus

1. Payment details half-filled (a UPI ID with no QR, a bank name with no account number): "ready" means a UPI ID, or a
   QR, or a full bank set (bank name, account number, IFSC); anything less is not ready (Task 1 tests).
2. An owner clears the payment details while packages are sellable: those packages gain the `payment_details` gap, so
   `sellablePackages` drops them and the agent stops offering them (Task 2 test).
3. A click-to-WhatsApp payload with no referral, a referral with only a headline, or the same ad seen in two chats:
   one `whatsapp_ad` row per ad key, the first message never fails (Task 4 tests).
4. Turning the agent on with a step missing: refused with `AGENT_SETUP_INCOMPLETE`, whatever the screen shows (Task 5).
5. A member without `settings:manage` opens Setup: sees whether payment details are done, never the account number or
   the editor (Task 7 test).

---

### Task 1: Agency payment details

**Files:**
- Create: `packages/db/prisma/migrations/20261210100000_agency_payment_details/migration.sql`,
  `packages/contracts/src/profile/payment-details.ts` (export from the profile contracts index),
  `packages/domain/src/profile/payment-details.ts` (export from the profile index),
  `packages/api/src/routers/payment-details.ts` (mounted as `organization.paymentDetails` beside `organization.profile`)
- Modify: `packages/db/prisma/schema/profile.prisma` (`OrganizationProfile.upiId`), `packages/contracts/src/files/attachments.ts`
  (record type), `packages/domain/src/files/record-types.ts` (`allowedContentTypes`), the api router that mounts the profile
- Test: `packages/domain/test/profile/payment-details.test.ts`, the api router test beside the logo router's tests

**Interfaces:**
- Produces (contracts):
  ```ts
  export const AGENCY_PAYMENT_QR_RECORD_TYPE = "agency_payment_qr"; // content types and 2 MB as the package payment QR
  export const paymentDetails = z.object({
    upiId: z.string().nullable(), bankName: z.string().nullable(), accountName: z.string().nullable(),
    accountNumber: z.string().nullable(), ifsc: z.string().nullable(),
    qr: z.object({ id: recordId, fileName: z.string(), url: z.string() }).nullable(),
    ready: z.boolean(),
  });
  export const savePaymentDetailsInput = z.strictObject({
    upiId: upiIdField.nullable(), bankName: shortText.nullable(), accountName: shortText.nullable(),
    accountNumber: accountNumberField.nullable(), ifsc: ifscField.nullable(),
  });
  ```
  `upiIdField`: trimmed, 3-100 characters, matching `/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/`;
  `ifscField`: `/^[A-Z]{4}0[A-Z0-9]{6}$/` after upper-casing; `accountNumberField`: 6-20 digits. Reuse the profile's
  existing bank field schemas where they exist instead of new ones.
- Produces (domain):
  ```ts
  export interface AgencyPaymentDetails { upiId: string | null; bankName: string | null; accountName: string | null;
    accountNumber: string | null; ifsc: string | null; qrAttachmentId: string | null }
  export async function agencyPaymentDetailsOf(tx: OrgTx, organizationId: string): Promise<AgencyPaymentDetails>;
  export function paymentDetailsReady(details: AgencyPaymentDetails): boolean;
  /** The lines the agent sends after "Advance to book: ₹…": only filled fields, in this order. */
  export function paymentLinesOf(details: AgencyPaymentDetails): string[];
  export async function savePaymentDetails(tx: OrgTx, access: MemberAccess, input: SavePaymentDetailsInput): Promise<void>;
  ```
  `paymentLinesOf` gives, for filled fields only: `UPI: <upiId>`, `Bank: <bankName>`, `Account name: <accountName>`,
  `Account number: <accountNumber>`, `IFSC: <ifsc>`.
- Produces (router `organization.paymentDetails`): `get` (query → `paymentDetails`), `save` (mutation
  `savePaymentDetailsInput` → `paymentDetails`), `requestQrUpload`, `confirmQr`, `removeQr` (shaped as the logo router's
  `requestUpload`/`confirmUpload`/`remove`, recordId = the organization's id; a confirmed QR replaces the older one).

- [ ] **Step 1: Write the failing tests**: ready for UPI only, QR only, full bank set; not ready for none, bank name
  only, account number without IFSC; `paymentLinesOf` order and skipping; save writes the profile columns and audits
  `profile.payment-details-changed` with `{ changed: [field names] }` only; the QR upload refuses other content types;
  the router refuses a member without `settings:manage`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** (migration: `ALTER TABLE "organization_profile" ADD COLUMN "upi_id" TEXT` with a length
  CHECK; the bank columns already exist).
- [ ] **Step 4: Run the tests, `pnpm migrations:check`, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(profile): the agency's payment details as fields, with a UPI ID and a QR`.

### Task 2: "AI can sell" needs payment details

**Files:**
- Modify: `packages/contracts/src/quotes/packages.ts` (`sellGaps` gains `"payment_details"`),
  `packages/domain/src/quotes/package-edit.ts` (`packageSellGaps`), `apps/web/src/i18n/messages/en-IN/packages.json`
  (`sell.gaps.payment_details`)
- Test: `packages/domain/test/quotes/package-selling.test.ts`, `apps/web/test/packages/sell-card.test.tsx`

**Interfaces:**
- Consumes: Task 1's `agencyPaymentDetailsOf`, `paymentDetailsReady` (through the profile index).

Behaviour: a group package gets the gap `payment_details` while the agency's payment details aren't ready (the advance
gap already exists). Label: "Add your payment details (UPI, QR or bank) on the AI agent page."

- [ ] **Step 1: Failing tests**: turning on a group package with an advance but no payment details is refused with
  `PACKAGE_NOT_READY_TO_SELL` and the gap listed; with a UPI ID it turns on; clearing the details afterwards makes
  `sellablePackages` leave it out; the sell card shows the gap's label.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**  **Step 4: Run them and `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(quotes): a package can't be sold by the AI without payment details`.

### Task 3: The agency's answers, and the agent's name and tone

**Files:**
- Create: `packages/db/prisma/migrations/20261210200000_agent_answers/migration.sql`,
  `packages/contracts/src/ai/agent-setup.ts` (export from the ai contracts index),
  `packages/domain/src/ai/agency-answers.ts` (export from the ai index)
- Modify: `packages/db/prisma/schema/ai.prisma` (`AiAutopilot.answers Json @default("{}")`), `packages/api/src/routers/ai.ts`
- Test: `packages/domain/test/ai/agency-answers.test.ts`

**Interfaces:**
- Produces (contracts):
  ```ts
  export const agencyQuestionTopics = ["cancellation", "refunds", "id_documents", "safety", "children", "payment_methods"] as const;
  export const agencyAnswers = z.partialRecord(z.enum(agencyQuestionTopics), z.string());
  export const saveAgencyAnswersInput = z.strictObject({ answers: z.partialRecord(z.enum(agencyQuestionTopics), z.string().trim().max(500)) });
  export const agentTones = ["friendly", "professional"] as const; // the two the page offers (the stored enum keeps "enthusiastic" for the old agent)
  export const saveAgentBasicsInput = z.strictObject({ agentName: z.string().trim().max(80), tone: z.enum(agentTones) });
  export const agentBasics = z.object({ agentName: z.string(), tone: z.enum(["friendly", "professional", "enthusiastic"]) });
  ```
- Produces (domain): `agencyAnswersOf(tx): Promise<Partial<Record<AgencyQuestionTopic, string>>>` (an empty answer is
  absent), `saveAgencyAnswers(tx, access, input)`, `agentBasicsOf(tx)`, `saveAgentBasics(tx, access, input)`; audits
  `ai-agent.answers-changed` (`{ answered: [topics] }`) and `ai-agent.basics-changed` (`{ tone, agentNameLength }`).
- Produces (router): `ai.agencyAnswers` (query), `ai.saveAgencyAnswers`, `ai.agentBasics` (query), `ai.saveAgentBasics`.

The questions as the owner sees them (Task 7 shows them; put them in `ai-agent.json` under `answers.questions`):
cancellation "What is your cancellation policy?"; refunds "How and when do you refund?"; id_documents "Which ID
documents must travellers carry?"; safety "How do you keep travellers safe?"; children "Can children come, and from what
age?"; payment_methods "Which ways can customers pay?".

- [ ] **Step 1: Failing tests**: save and read back; a blank answer removes it; over 500 characters is refused; saving
  basics leaves every other autopilot column as it was; the audit holds no answer text.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**  **Step 4: Run them, `pnpm migrations:check`, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): the agency's answers to fixed questions, and the agent's name and tone`.

### Task 4: Ads that bring chats, linked to a package

**Files:**
- Create: `packages/db/prisma/migrations/20261210300000_whatsapp_ads/migration.sql`, `packages/domain/src/inbox/ads.ts`
  (export from the inbox index), `packages/db/test/org-table-fixtures/` entry for `whatsapp_ad`
- Modify: `packages/integrations/src/whatsapp/parsed-event.ts`, `packages/integrations/src/whatsapp/parse-msg91-event.ts`,
  `packages/db/prisma/schema/whatsapp.prisma` (model `WhatsappAd`; `WhatsappConversation.adId`), `packages/domain/src/inbox/inbound.ts`,
  `packages/domain/src/inbox/process-event.ts`, `packages/api/src/routers/ai.ts`
- Test: `packages/integrations/test/whatsapp/parse-msg91-event.test.ts`, `packages/domain/test/inbox/ads.test.ts`

**Interfaces:**
- Produces (integrations): `ParsedMessage` gains `referral: { sourceId: string | null; headline: string | null;
  sourceUrl: string | null } | null` and `unknownType?: string`. The parser looks for a Meta-shaped `referral` object
  (`source_id`/`sourceId`, `headline`, `source_url`/`sourceUrl`) on the message bag, on `bag.message`, `bag.context` and
  `bag.content`, and keeps it only when it has a source id or a headline. `unknownType` is the content type (when it
  matches `/^[a-z0-9_.-]{1,40}$/`, else "other") of a message whose kind is unsupported.
- Produces (db): table `whatsapp_ad` (`organization_id`, `id`, `ad_key` text: the source id, else `headline:` plus the
  headline lower-cased; `headline` text null; `source_url` text null; `package_id` uuid null → `quote_template`
  (with `organization_id`); `first_seen_at`, `last_seen_at`; unique `(organization_id, ad_key)`); column
  `whatsapp_conversation.ad_id` (null → `whatsapp_ad`, with `organization_id`).
- Produces (domain):
  ```ts
  export async function noteAdOf(tx: OrgTx, conversationId: string, referral: NonNullable<ParsedMessage["referral"]>, now: Date): Promise<void>;
  export async function adsOf(tx: OrgTx): Promise<{ id: string; headline: string | null; sourceUrl: string | null; packageId: string | null; chats: number; lastSeenAt: Date }[]>;
  export async function linkAd(tx: OrgTx, access: MemberAccess, input: { adId: string; packageId: string | null }): Promise<void>;
  /** The package the chat's ad promotes, or null: what plan 3's agent opens with. */
  export async function adPackageOf(tx: OrgTx, conversationId: string): Promise<string | null>;
  ```
  `noteAdOf` upserts the ad by key (bumping `last_seen_at`) and sets the conversation's `ad_id` only when it has none.
  `linkAd` accepts only a package of this agency (any kind) or null, and audits `whatsapp-ad.linked`.
- Produces (router): `ai.ads` (query, newest first), `ai.linkAd` (mutation `{ adId, packageId: recordId.nullable() }`).
- `processWhatsAppBody` logs `logger.warn({ event: "whatsapp.unknown-type", organizationId, contentType }, "A WhatsApp
  message of a type we don't read")` when `unknownType` is set (ids and the type only).

- [ ] **Step 1: Failing tests**: the parser reads a referral in each of the four places, ignores an empty one, sets
  `unknownType` for an unsupported kind and not for text; an inbound message with a referral creates the ad and links
  the conversation; a second chat from the same ad reuses the row (`chats` 2); a referral with only a headline keys on
  it; a message without a referral changes nothing; `linkAd` refuses another agency's package; `adPackageOf` answers
  the linked package.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, the inbox and integrations suites' focused files, `pnpm migrations:check`, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(inbox): ads that bring chats are noted and linked to a package`.

### Task 5: The setup checklist, turning the agent on, and hand-overs

**Files:**
- Create: `packages/domain/src/ai/agent-setup.ts` (export from the ai index)
- Modify: `packages/contracts/src/ai/agent-setup.ts`, `packages/api/src/routers/ai.ts`
- Test: `packages/domain/test/ai/agent-setup.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 (`agencyPaymentDetailsOf`, `paymentDetailsReady`, `agencyAnswersOf`, `agentBasicsOf`, `adsOf`),
  `sellablePackages` (quotes), `inboxStatusOf` (inbox), `agentPauseOf` (subscriptions), `autopilotOf`.
- Produces (contracts):
  ```ts
  export const agentSetupSteps = ["whatsapp", "packages", "payment", "answers", "basics", "ads"] as const;
  export const agentSetup = z.object({
    steps: z.array(z.object({ key: z.enum(agentSetupSteps), done: z.boolean(), optional: z.boolean(),
      count: z.int().nullable(), total: z.int().nullable() })),
    ready: z.boolean(), on: z.boolean(), pausedBySupport: z.boolean(),
  });
  export const setAgentOnInput = z.strictObject({ on: z.boolean() });
  export const handedOverChat = z.object({ conversationId: recordId, name: z.string(), reason: z.string().nullable(), since: z.iso.datetime() });
  ```
  Steps: `whatsapp` done when the inbox is connected; `packages` done when at least one package is sellable (`count`
  sellable); `payment` done when ready; `answers` done when all six are answered (`count` answered, `total` 6);
  `basics` done when the agent has a name; `ads` optional, done when every ad seen has a package (`count` linked,
  `total` seen). `ready` = every step that isn't optional is done. `on` = the autopilot switch.
- Produces (domain): `agentSetupOf(tx, organizationId, today): Promise<AgentSetup>`; `setAgentOn(tx, access, on, today)`
  that refuses turning on unless `ready` (`DomainError("VALIDATION", "AGENT_SETUP_INCOMPLETE", …)`), sets only the
  autopilot column, audits `ai-agent.turned-on` / `ai-agent.turned-off`; `handedOverChatsOf(tx, access)`: open chats
  with a hand-over, newest first, at most 20, only those the member's inbox may show (reuse the inbox's conversation
  scope), the name from the person or the WhatsApp profile.
- Produces (router): `ai.agentSetup` (query), `ai.setAgentOn` (mutation), `ai.handedOver` (query; also requires
  `inbox:view`).

- [ ] **Step 1: Failing tests**: each step's done rule; `ready` ignores the optional step; turning on refused while a
  step is missing, allowed when ready, turning off always allowed; turning on leaves every other autopilot column;
  hand-overs list only open handed-over chats, newest first.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**  **Step 4: Run them and `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(ai): the agent's setup checklist decides when it can be turned on`.

### Task 6: The AI agent page and its Overview tab

**Files:**
- Create: `apps/web/src/app/(app)/ai-agent/page.tsx`, `apps/web/src/ai/agent/agent-screen.tsx` (PageHeader + Tabs:
  Overview, Setup, Try it; the tab in the page's search params `?tab=setup`), `apps/web/src/ai/agent/agent-overview.tsx`,
  `apps/web/src/ai/agent/use-agent.ts`, `apps/web/src/i18n/messages/en-IN/ai-agent.json`
- Modify: `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/routes.ts` (`aiAgent: "/ai-agent"`),
  `apps/web/src/shell/navigation.ts` (item `aiAgent`, group "work", after the inbox, `requires: "ai:manage"`,
  `module: "ai"`, icon `BotIcon`), `apps/web/src/i18n/messages/en-IN/shell.json` (`navigation.aiAgent` "AI agent"),
  `apps/web/src/ai/ai-settings-screen.tsx` (an Alert at the top: "The AI agent now has its own page." with a link
  "Open the AI agent")
- Test: `apps/web/test/ai/agent/agent-overview.test.tsx`, the shell navigation tests that list items

Overview copy: title "AI agent"; intro "Your WhatsApp sales assistant: what it's doing, what needs you, and how it's set
up."; states "On: answering WhatsApp chats", "Off", "Paused by {product} support", "Not set up yet" (with a link to
Setup); section "Needs you": "Chats handed over to you" (each: name, reason, since, opens the chat in the inbox),
"Payments to check" (the existing count, only for members who may see it, links to `routes.payments`), empty "Nothing
needs you right now."; section "Last 24 hours": chats answered, messages sent, handed over (from `ai.overview`).

- [ ] **Step 1: Failing tests**: each state renders; hand-overs list and link; the payments count hidden without its
  permission; the nav item shows for `ai:manage` with the AI module and not otherwise.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, `registry-words`, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): the AI agent page and its overview`.

### Task 7: The Setup tab

**Files:**
- Create: `apps/web/src/ai/agent/agent-setup.tsx` (the checklist), and one file per step editor under
  `apps/web/src/ai/agent/setup/`: `payment-step.tsx`, `answers-step.tsx`, `basics-step.tsx`, `ads-step.tsx`,
  `turn-on-step.tsx`
- Modify: `apps/web/src/ai/agent/agent-screen.tsx`, `ai-agent.json`
- Test: `apps/web/test/ai/agent/agent-setup.test.tsx`, `apps/web/test/ai/agent/setup-steps.test.tsx`

Behaviour: the checklist is an `ItemGroup` in the order of `agentSetupSteps`, then "Turn it on". Each item shows a
`StatusDot`/`StatusBadge` (Done, To do, Optional), a one-line state ("2 packages the AI can sell", "4 of 6 answered",
"1 of 3 ads linked") and opens its editor below it (one open at a time):
- WhatsApp: links to `routes.whatsapp` ("Connect your WhatsApp number").
- Packages: links to `routes.packages` ("Mark at least one package 'AI can sell'; each needs an advance").
- Payment: UPI ID, bank name, account name, account number, IFSC (`organization.paymentDetails.save`) and the QR
  picker (request, upload with `uploadFile`, confirm; replace, remove). Members without `settings:manage` see only
  "Done" or "To do" and "Ask an Owner or Admin to add them".
- Answers: the six questions with a Textarea each (max 500), one Save.
- Agent name and tone: "Agent name" (placeholder "<agency> team") and a ChoiceField Friendly / Professional.
- Ads: each ad seen (headline or "An ad without a headline", chats, last seen) with a SelectField of the agency's
  packages and "No package"; empty "No chats have come from an ad yet."
- Turn it on: a Switch, disabled with "Finish the steps above first" until `ready`; shows "Paused by {product} support"
  when paused (and stays as the owner set it).

- [ ] **Step 1: Failing tests**: the steps' states from an `agentSetup` fixture; each editor saves with the right input;
  the payment editor hidden without `settings:manage`; the switch disabled until ready; a refusal shows `RefusalAlert`.
- [ ] **Step 2: Run them to see them fail.**  **Step 3: Implement.**
- [ ] **Step 4: Run them, `no-hand-drawn-borders`, `touch-targets`, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): the AI agent's setup checklist`.

### Task 8: The Try it tab

**Files:**
- Modify: `apps/web/src/ai/agent/agent-screen.tsx` (the Try it tab renders the existing `TestSection` from
  `apps/web/src/ai/test-section.tsx`, unchanged)
- Test: `apps/web/test/ai/agent/agent-screen.test.tsx`

- [ ] **Step 1: Failing test**: the three tabs exist, `?tab=try` opens Try it and shows the test box; an unknown tab
  falls back to Overview.
- [ ] **Step 2: Run it to see it fail.**  **Step 3: Implement.**  **Step 4: Run it, lint, `pnpm typecheck`.**
- [ ] **Step 5: Commit** `feat(web): try the agent from its page`.
