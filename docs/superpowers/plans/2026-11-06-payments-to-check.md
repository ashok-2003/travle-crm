# Payments to check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One list where the team checks every payment waiting for a person — a traveller's "I've paid" claim, a payment screenshot sent in a chat with an open AI booking, and a screenshot sent in a chat with none — confirms or refuses each, and the customer hears the agency's own message, sent by code; the AI never says money arrived.

**Architecture:** A read model unions three sources (pending `PaymentClaim`, `AiBooking` in `proof_received`, and a new `payment_proof` row for a screenshot with no open booking). Confirm reuses `confirmClaim` for claims and, for AI bookings, links the booking (`linkAiBooking`) then records the payment on its quote (`recordPayment`, which wins the lead). Code then sends the agency's confirmation or not-found message through `sendToLead`'s rule: free text inside WhatsApp's 24-hour window, else the agency's approved template, else a task for the team.

**Tech Stack:** Prisma 7.10 + Postgres (RLS), tRPC, Zod contracts, Next.js web (shadcn registry), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-grounded-sales-agent-design.md`, section 4 ("Payments to check") and decision 9. Plan 3 of 4; plan 4 (the agent) fills the AI booking's quote and expected advance that this plan reads.

## Global Constraints

- The repository's CLAUDE.md holds in full (forOrg, RLS and a fixture for every new org table, strict Zod inputs and z.object outputs, audit for staff changes, errors.json/audit.json sentences, registry components only, every word a message, freshProcedure for money).
- Only a person confirms money. The agent never sends a confirmation or a not-found message; code sends them after a person decides.
- Confirming and refusing need `quotes:record_payments` and `bookings:view` (as `bookings.confirmClaim` does), on a fresh session.
- A message to the customer: inside the 24-hour window as free text (`queueSystemText`); outside it, the agency's approved template for that message (with its parameters) when set; otherwise a task for the lead's owner to tell the customer. Never both a message and a task.
- The confirmation and not-found texts are the agency's, written once in settings, with blanks `{name}`, `{amount}`, `{trip}`, `{date}` filled by code (`fillBlanks`); sensible defaults exist.
- Money is integer paise; the amount confirmed is the person's entry, prefilled with the expected amount.
- Repeats are safe: confirming twice records one payment (requestIds derived from the record), sends one message (client tokens derived from the record).
- Every shell command starts with `cd /Users/ak/personal/travel-crm-agent && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`; CPU low (vitest `--maxWorkers=2`, Playwright `--workers=1`, lint changed files per package, never repo-root eslint, Docker only for the run then down); never `git stash`; Conventional Commits staged by name, no `Co-Authored-By`.

## Review Focus

1. Confirming an AI booking whose lead has no quote still records the payment and wins the lead (Task 3).
2. A message that can't go (window closed and no template) becomes exactly one task, and nothing is sent (Task 4).
3. Two members confirming the same proof at once record one payment and send one message (Tasks 3 and 4).
4. A screenshot in a chat with no open booking appears once as a proof to match, and a later booking in that chat doesn't duplicate it (Task 2).
5. An agency without the bookings module or a member without `quotes:record_payments` sees no list and can't confirm (Task 6).

---

### Task 0: Carry-over fixes from plan 2

**Files:** `packages/domain/src/ai/rates/price.ts` (`amountsIn`), `packages/domain/src/ai/drafts/payment-details.ts` (`ACCOUNT`), their tests.

- [ ] **Step 1:** Failing tests: `"Double ₹6,999, Triple ₹5,999 reads both amounts"` (a trailing comma is not part of an amount); `"AC 4500 5500 6500 per night is not an account number"` (the spaced form after a bare "ac" needs a first group of at least 4 digits and a total of 9–18 digits that isn't a list of prices — simplest rule: for the bare "ac" prefix accept only an unspaced 9–18 digit run). Run → FAIL.
- [ ] **Step 2:** Fix both; the rate-sheet and package-draft tests stay green.
- [ ] **Step 3:** Commit `fix(ai): read comma-separated prices, and leave AC room rates alone`.

### Task 1: Schema

**Files:** Create `packages/db/prisma/migrations/20261207100000_payments_to_check/migration.sql`; modify `packages/db/prisma/schema/ai.prisma` (`AiBooking`), `packages/db/prisma/schema/bookings.prisma` (`BookingSettings`), create `packages/db/prisma/schema/payment-proofs.prisma` (`PaymentProof`); fixture in `packages/db/test/org-table-fixtures/`.

**Interfaces:**
- `ai_booking.quote_id uuid` (null; FK `(organization_id, quote_id)` → `quote`, RESTRICT) and `ai_booking.expected_paise bigint` (null, CHECK 0..10000000000) — filled by plan 4; read here when present.
- `payment_proof (organization_id, id, conversation_id, message_id, lead_id null, status text ('pending'|'dismissed'|'matched') default 'pending', decided_by null, decided_at null, created_at)`, unique `(organization_id, message_id)`, FKs with organization_id RESTRICT, RLS, fixture; rows are updated, never deleted.
- `booking_settings`: `payment_confirmed_text text` (default `'Thank you {name}! We have received {amount} for {trip} on {date}. Your booking is confirmed.'`), `payment_not_found_text text` (default `'Hi {name}, we could not find your payment of {amount} yet. Could you send the transaction reference or a clearer screenshot?'`), `payment_confirmed_template_id uuid null`, `payment_confirmed_params text[] default '{}'`, `payment_not_found_template_id uuid null`, `payment_not_found_params text[] default '{}'` (template FKs as the existing balance/details template columns do).

- [ ] **Step 1:** Fixture for `payment_proof`; run db tests → FAIL. **Step 2:** schema + migration. **Step 3:** db tests and `pnpm migrations:check` → PASS. **Step 4:** Commit `feat(db): payment proofs, an AI booking's quote and advance, and payment messages`.

### Task 2: Proofs with no open booking are kept

**Files:** Modify `packages/domain/src/ai/booking.ts` (`aiPaymentProofListener`); create `packages/domain/src/bookings/payment-proofs.ts`; test `packages/domain/test/bookings/payment-proofs.test.ts`.

**Interfaces:** the listener, for an image or document from the customer: with an open AiBooking, as today; without one, `recordUnmatchedProof(tx, { conversationId, messageId, leadId })` creates a `payment_proof` (idempotent on message id) and notifies the lead's owner and managers once (kind `payment.proof-to-match`, added to `TEAM_ALERT_KINDS`, its notification preference entry and messages). Only while the agency has the bookings module. `dismissProof(tx, access, { proofId })` → status dismissed, audited (`payment-proof.dismissed`). A later AiBooking in that chat does not touch existing proofs.

- [ ] **Step 1: Failing tests:** `"a screenshot with no open booking becomes one proof to match, and a second delivery adds nothing"`; `"with an open booking it is that booking's proof, as before"`; `"a text message is no proof"`; `"dismissing is audited and leaves the list"`.
- [ ] **Step 2–4:** RED; implement (sentences in audit.json, notifications kinds); GREEN.
- [ ] **Step 5:** Commit `feat(bookings): keep a payment screenshot that no booking waits for`.

### Task 3: Confirm or refuse an AI booking's payment

**Files:** Create `packages/domain/src/bookings/ai-payments.ts`; test `packages/domain/test/bookings/ai-payments.test.ts`.

**Interfaces:**
- `expectedAdvanceOf(booking: { expectedPaise: bigint | null; details: unknown }): number | null` — `expectedPaise` when set, else the paise of `details.amount` text (`paiseFromRupeesText`), else null.
- `confirmAiPayment(tx, access, { bookingId, amountPaise, reference }, now): Promise<{ leadId: string; quoteId: string }>` — the booking must be this agency's and open (`awaiting_payment` or `proof_received`); links it (`linkAiBooking`, which finds or makes the agreed quote and the booking) unless already linked; records the payment on that booking's quote with `recordPayment` (method "upi", `receivedOn` today in the agency's zone, `requestId` derived from the booking id so a repeat is one payment); marks the AI booking confirmed (as `setBookingStatus` does: lead won, audit `ai.booking-decided`); returns ids. A repeat after success returns the same result without a second payment.
- `refuseAiPayment(tx, access, { bookingId, reason: "not_found" | "wrong_amount" | "other" }, now)` — back to `awaiting_payment`, proofs kept, audited (`ai.payment-refused`).

- [ ] **Step 1: Failing tests:** `"confirming a proof with no quote yet makes the quote and booking, records the payment and wins the lead"`; `"confirming twice records one payment"`; `"the expected advance is the plan 4 amount when set, else the booking's own amount"`; `"refusing sends the booking back to waiting, with its proofs"`; `"another agency's booking is not found"`.
- [ ] **Step 2–4:** RED; implement (errors/audit sentences); GREEN.
- [ ] **Step 5:** Commit `feat(bookings): confirm an AI booking's payment on its quote`.

### Task 4: Tell the customer

**Files:** Create `packages/domain/src/bookings/payment-messages.ts`; modify `packages/contracts/src/inbox/blanks.ts` (`blankNames` gains `trip`, `date`); modify `packages/domain/src/bookings/settings.ts` and its contracts (the six new settings); test `packages/domain/test/bookings/payment-messages.test.ts`.

**Interfaces:** `tellPaymentOutcome(tx, { organizationId, leadId, conversationId, outcome: "confirmed" | "not_found", amountPaise, trip, date: CalendarDate | null, recordKey }, now): Promise<"sent" | "template" | "task">` — fills the agency's text with `fillBlanks` (name from the person, `formatMoney` amount, trip, `formatDay` date); sends with the `sendToLead` rule (inside the window as free text; outside, the matching template with its params; else one task for the lead's owner "Tell <name> their payment was confirmed" / "… wasn't found", linked to the lead); client tokens and the task are derived from `recordKey` so a repeat does nothing; never sends from the AI's name (origin "staff_crm" with `sentBy` the deciding member, or "automation" — follow `sendToLead`). `bookingSettingsOf`/`saveBookingSettings` read and save the six fields (texts checked with `libraryMessageBody`-style unknown-blank refusal).

- [ ] **Step 1: Failing tests:** `"inside the window the agency's words go, with its blanks filled"`; `"outside the window the approved template goes"`; `"outside the window with no template the owner gets one task and nothing is sent"`; `"telling twice sends once"`; `"a text with an unknown blank is refused in settings"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(bookings): the agency's own words when a payment is confirmed or not found`.

### Task 5: The list

**Files:** Create `packages/domain/src/bookings/payments-to-check.ts`, `packages/contracts/src/bookings/payments-to-check.ts`; test `packages/domain/test/bookings/payments-to-check.test.ts`.

**Interfaces:** `paymentToCheck = z.object({ kind: z.enum(["claim", "ai_booking", "proof"]), id, createdAt, person: { name, leadId: recordId.nullable() }, trip: z.string().nullable(), date: calendarDate.nullable(), expectedPaise: z.int().nullable(), claimedPaise: z.int().nullable(), reference: z.string().nullable(), screenshot: z.object({ kind: z.enum(["claim_file", "chat_message"]), id: recordId }).nullable(), conversationId: recordId.nullable() })`; `paymentsToCheck(tx, access, { cursor? }): Promise<{ items, nextCursor }>` — pending claims, AI bookings in `proof_received`, pending proofs; oldest first; within the member's lead scope (`scopeFilter`); 25 per page (`useCursorPages` shape); `countPaymentsToCheck(tx, access)`.

- [ ] **Step 1: Failing tests:** `"lists a claim, an AI booking's proof and a proof to match, oldest first"`; `"leaves out decided ones"`; `"a member who sees only their own leads sees only theirs"`; `"counts what waits"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(bookings): every payment waiting for a person, in one list`.

### Task 6: The api

**Files:** Create `packages/api/src/routers/payments-to-check.ts` (mounted as `paymentsToCheck`), `packages/api/test/payments-to-check-router.test.ts`.

**Interfaces:** `list` (`orgProcedure.requires("bookings:view", "quotes:record_payments")`, cursor) and `count`; `confirm` (`freshProcedure.requires("bookings:view", "quotes:record_payments")`, input `{ kind: "claim" | "ai_booking", id, amountPaise, reference }`) → `confirmClaim` or `confirmAiPayment`, then `tellPaymentOutcome("confirmed")`; `refuse` (same builder, `{ kind: "claim" | "ai_booking", id, reason, tell: boolean }`) → `rejectClaim` or `refuseAiPayment`, then, when `tell`, `tellPaymentOutcome("not_found")`; `dismissProof` (same builder) → `dismissProof`. Results say how the customer was told (`"sent" | "template" | "task" | "none"`).

- [ ] **Step 1:** Failing router tests: `"a member without record_payments can't list or confirm"`; `"an agency without the bookings module can't list"`; `"confirm says how the customer was told"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(api): payments to check`.

### Task 7: The screens

**Files:** Create `apps/web/src/app/(app)/payments/page.tsx` and `apps/web/src/payments/` (`payments-screen.tsx`, `payment-row.tsx`, `confirm-payment-dialog.tsx`, `refuse-payment-dialog.tsx`, `use-payments.ts`); modify `apps/web/src/shell/navigation.ts` (an entry "Payments to check", `requires: "quotes:record_payments"`, `module: "bookings"`), `apps/web/src/lib/routes.ts`, the Today screen (a section with the count linking to the screen: `packages/contracts/src/today/today.ts`, `packages/domain/src/today/today.ts`, `apps/web/src/today/today-screen.tsx`, the day line and nudge sums, morning push), the booking settings screen (the two texts with an `InfoHint` listing the blanks, and the two template pickers as the other booking messages have), messages; tests in `apps/web/test/payments/`.

The screen: PageHeader; each row shows the person (TextLink to the lead), trip, date (`formatDay`/`formatCalendarDay`), expected and claimed amounts (`formatMoney`), the reference, a button opening the screenshot (claim file download link, or the chat message's media URL), and Confirm / Not received (or Open chat / Dismiss for a proof to match); Confirm opens a FormDialog with a MoneyField prefilled with the expected (or claimed) amount and the reference; Not received a ConfirmDialog with the reason and "Tell the customer" (on by default); after deciding, a toast says how the customer was told ("Sent on WhatsApp" / "Sent as a template" / "A task was added to tell them"). `useCursorPages` + `ShowMoreButton`, `LoadingRows`, `EmptyState`, `WriteHint`.

- [ ] **Step 1:** Failing component tests: `"lists each kind with its amounts and screenshot button"`; `"confirm is prefilled with the expected advance and sends the entered amount"`; `"not received tells the customer unless unticked"`; `"says how the customer was told"`.
- [ ] **Step 2–4:** RED; implement; GREEN, plus the house-rule tests.
- [ ] **Step 5:** Commit `feat(web): payments to check`.

### Task 8: Journey

**Files:** Create `apps/web/test/e2e/payments-to-check-journey.spec.ts`.

- [ ] **Step 1:** A customer's AI booking with a screenshot in the chat (seeded as the old agent leaves it) and a traveller's claim from the trip page appear on Payments to check and on Today's count; the owner confirms the AI booking at ₹4,000 (prefilled) → the lead is won, the quote shows ₹4,000 paid, and the customer's chat shows the agency's confirmation text; the owner marks the claim not received → the traveller's chat (or a task when the window is closed) gets the not-found text. `expectAccessible`, phone and desktop.
- [ ] **Step 2:** `pnpm --filter @travel-crm/web exec playwright test test/e2e/payments-to-check-journey.spec.ts --workers=1` → PASS; Docker down after.
- [ ] **Step 3:** Typecheck touched packages, lint changed files per package, the touched test folders → PASS.
- [ ] **Step 4:** Commit `test(web): payments checked from one list`.
