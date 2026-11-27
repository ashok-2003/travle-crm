# Paid plans, the premium touch and the owner's invoice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the quote's plans can be set up and sold in the console (3-month price, AI credits per plan, no GST), paying
agencies see a subtle verified tick and a Plan & billing page, and the console invoice matches the owner's design.

**Architecture:** Task 1 extends plans, subscription policy and the AI usage limit (db, contracts, domain, console
screens). Task 2 extends billing details and the invoice PDF and form. Task 3 adds an agency `billing:view` read and the
agency app's tick, card, page and reminder. Tasks 1 and 2 run in parallel; Task 3 follows Task 1.

**Tech Stack:** Prisma 7.10 migrations, Zod 4, tRPC (agency and platform routers), React-PDF, Next.js + shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-paid-plans-design.md` (its Decisions section binds).

## Global Constraints

- CLAUDE.md rules: strict TypeScript, one-line comment atop each new file, Conventional Commits ≤ 100 chars, stage by
  name, never `--no-verify`, never `Co-Authored-By`; the owner's UI rules; every word a next-intl message.
- No real firm, bank, person or client details, logos or signatures in the repository: tests use made-up values and
  generated images (a tiny PNG built in the test).
- Migrations only add; existing rows get defaults. Names: Task 1 `20261230100000_plans_as_quoted`, Task 2
  `20261230110000_billing_details_images`.
- 3-month cycle key `quarterly`; message "3 months". Default AI credits for existing plans and for an organization with
  no subscription: 10,000. Subscription GST default 0 basis points; allowed 0 or 1800.
- Invoice line quantity: integer 1–999; amount = quantity × rate; the existing per-line cap (₹10 crore) applies to the
  amount. Images: PNG or JPEG, ≤ 1 MB, checked by their bytes (`imageOf`).

## Review Focus

1. Growth's agency really gets 20,000 credits and a Starter agency 10,000, under concurrent calls (the reservation stays
   one statement with the limit as a parameter) — Task 1 test with two plans and a limit reached.
2. Turning subscription GST from 0 to 18 % changes only the shown breakdown, never a recorded payment — Task 1 test.
3. An agency past due, read-only, on trial or on the demo plan shows no tick; an active one paid through yesterday shows
   none either — Task 3 test of the rule function.
4. A staff member without `billing:view` (any non-Owner role) is refused Plan & billing by the api, not only hidden —
   Task 3 test.
5. A billing-details image that is a renamed PDF, or 2 MB, is refused before it is saved, and an old invoice's stored
   lines (no quantity) still list as quantity 1 — Task 2 tests.

---

### Task 1: Plans as quoted (console)

**Files (modify unless noted):** `packages/db/prisma/schema/subscriptions.prisma` + new migration;
`packages/contracts/src/subscriptions/{plans,subscriptions,views}.ts`;
`packages/domain/src/subscriptions/{pricing,policy,plans,plan-limits}.ts`; `packages/domain/src/ai/usage.ts`;
`apps/web/src/console/plans/*` (form, figures, table, policy section), `apps/web/src/console/organizations/subscription/*`
(change-plan dialog, record-payment dialog default dates, price breakdown); messages; tests beside each.

**Interfaces — Produces:**
- `Plan`: `quarterlyPricePaise Int?`, `extraSeatQuarterlyPricePaise Int?`, `aiCreditsPerMonth Int @default(10000)`
  (CHECK ≥ 1; `plan_priced` now counts the 3-month price too). `SubscriptionPolicy`: `subscriptionGstBasisPoints Int
  @default(0)` (CHECK in (0, 1800)).
- Contracts: `billingCycle = z.enum(["monthly", "quarterly", "yearly"])`; plan fields `quarterlyPricePaise`,
  `extraSeatQuarterlyPricePaise`, `aiCreditsPerMonth` (int 1–1,000,000); policy `subscriptionGstBasisPoints`
  (0 | 1800); `planSummary` includes them.
- Domain: `planPriceFor(plan, "quarterly")`; `subscriptionPriceOf(...)` takes the GST basis points (no more constant
  1800); `monthlyAiLimitOf(tx: OrgTx): Promise<number>` in `ai/usage.ts` (the organization's subscription's plan's
  `aiCreditsPerMonth`, else 10,000); `reserveAiCall` uses it, passing the limit into its single statement;
  `usedThisMonth` unchanged. Export `monthlyAiLimitOf` from the ai module's index (Task 3 uses it).
- Console: the plan form gets "Price for 3 months", "Extra seat for 3 months" and "AI credits a month"; the plans table
  shows the 3-month price and credits; Change plan offers 3 months when priced; Record a payment's paid-through default
  is +1, +3 or +12 months by cycle; the policy section edits "GST on subscriptions" (None / 18 %) — super admins; the
  price breakdown shows GST lines only above 0.

- [ ] **Step 1: Failing tests** — domain: a plan priced only for 3 months is sold quarterly and refused monthly;
  `subscriptionPriceOf` with GST 0 has no GST and total = subtotal, with 1800 splits CGST/SGST as today; a recorded
  payment's amount is unchanged after the policy's GST changes; `monthlyAiLimitOf` gives 20,000 on a 20,000 plan and
  10,000 with no subscription; `reserveAiCall` refuses the 10,001st call on a 10,000 plan and allows it on a 20,000 plan
  (use a small limit, e.g. a plan with 3 credits, and four calls, two of them concurrent). Web: the plan form's new
  fields and validation; the breakdown hides GST at 0; record-payment's default paid-through for each cycle.
- [ ] **Step 2: Run, see them fail** (`pnpm --filter @travel-crm/domain exec vitest run test/subscriptions test/ai/usage*`, `pnpm --filter @travel-crm/web exec vitest run test/console`)
- [ ] **Step 3: Migration + models; `pnpm migrations:check`**
- [ ] **Step 4: Implement contracts, domain, console**
- [ ] **Step 5: Run the tests above plus `pnpm --filter @travel-crm/db exec vitest run`, `pnpm --filter @travel-crm/api exec vitest run`, `pnpm typecheck`, `pnpm lint`**
- [ ] **Step 6: Commit**

### Task 2: The invoice as designed (console)

**Files:** `packages/db/prisma/schema/platform-invoices.prisma` + new migration;
`packages/contracts/src/platform/invoices.ts`; `packages/domain/src/platform/{billing-details,invoices}.ts` (+ a small
`billing-images.ts` for the upload link and the check); `packages/api/src/platform/routers/invoices.ts`;
`packages/integrations/src/pdf/{platform-invoice-input,templates/platform-invoice}.ts`;
`apps/web/src/console/invoices/*`; messages; tests.

**Interfaces — Produces:**
- Billing details: `logoKey?`, `signatureKey?`, `signatoryName?` (≤ 80), `signatoryTitle?` (≤ 40).
- Router: `invoices.billingImageUploadLink({ kind: "logo" | "signature", contentType: "image/png" | "image/jpeg" })` →
  `{ url, fields?, key }` (presigned, key `platform/billing/<kind>-<uuid>.<png|jpg>`); `setBillingDetails` accepts
  `logoKey`/`signatureKey` (or null to remove) and refuses a key not under `platform/billing/<kind>-`, an object
  missing, over 1 MB or not PNG/JPEG by its bytes (`imageOf`) — reason `BILLING_IMAGE_INVALID` with its sentence.
- Invoice line contract: `{ description, quantity (int 1–999), ratePaise (≥ 1) }`; stored lines gain `quantity`,
  `ratePaise`, `amountPaise` (= quantity × rate); reading an old stored line without `quantity` gives quantity 1 and
  rate = its amount.
- `PlatformInvoiceData` becomes: `seller { name, lines, stateLine }`, `billTo { name, lines, stateLine? }`,
  `rows { index, description, quantity, rate, amount }[]`, `payment { rows: { label, value }[] } | null`,
  `logo?: { data: Uint8Array; contentType }`, `signature?: { data; contentType }`, `signatory { firm, name?, title? }`,
  `footer` (the firm's name and address in one line), plus the existing title, number, dates, totals, totalInWords,
  notes. State lines read "Uttar Pradesh (State code: 09)" (state names from the contracts' GST state list).
- The template: header = logo (fits 48 pt high) + firm name, top left; table #, Description, Qty, Rate, Amount; payment
  as two-column labelled rows (Account name, Account number, IFSC, Bank, UPI ID — only those set); signature block "For
  <firm>", image (fits 140 × 60 pt), line, name, title; footer firm · address left, "Page x of y" right.
- Console: Billing details gets Logo and Signature (upload with preview, Remove), Signatory name and title; the invoice
  dialog's lines get Qty and Rate with the amount shown, and the live totals use the kernel's `invoiceAmounts` on
  quantity × rate.

- [ ] **Step 1: Failing tests** — domain: a line of 2 × ₹4,000 gives ₹8,000 and the totals follow; an old stored line
  lists as quantity 1; the renderer receives `stateLine`, labelled payment rows (only set ones), the logo/signature bytes
  when set and nothing when not; `setBillingDetails` refuses a 2 MB PNG, a PDF renamed .png and a key under another
  prefix; integrations: the PDF renders with and without logo/signature to `%PDF` bytes, deterministic, and its text
  holds "Qty", "Rate", "State code: 09", "Account number" and the signatory's name; web: Qty × Rate preview, the upload
  control's states.
- [ ] **Step 2: Run, see them fail**
- [ ] **Step 3: Migration + models; `pnpm migrations:check`**
- [ ] **Step 4: Implement**
- [ ] **Step 5: Run the changed packages' tests (domain `test/platform`, api `test/platform`, integrations `test/pdf`, db, web `test/console`), `pnpm typecheck`, `pnpm lint`; re-render a sample PDF with made-up data to `/private/tmp/claude-501/-Users-ak-personal-travel-crm/5a1faf98-4fa8-47bb-b71b-00371acc12b2/scratchpad/sample-invoice-v2.pdf`**
- [ ] **Step 6: Commit**

### Task 3: The premium touch (agency app)

**Files:** `packages/domain/src/identity/permissions.ts` (`billing:view`); `packages/domain/src/subscriptions/request-rules.ts`
(`billing` → `null`, core); a domain read `packages/domain/src/subscriptions/billing-view.ts`; contracts
`packages/contracts/src/subscriptions/views.ts` (`billingView`); `packages/api/src/routers/subscription.ts`
(`billing` query, `orgProcedure.requires("billing:view")`); web: `apps/web/src/shell/org-mark.tsx`, a
`apps/web/src/subscription/verified.ts` rule, `apps/web/src/subscription/verified-badge.tsx`, a Settings page
`apps/web/src/app/(app)/settings/plan/page.tsx` + `apps/web/src/settings/plan/*`, the reminder in the banner area
(`apps/web/src/shell/banners.tsx` / `subscription-notice.ts`), the Settings index link, `audit.json`/`errors.json` if
needed, messages; tests.

**Interfaces — Consumes:** `monthlyAiLimitOf(tx)` and `usedThisMonth(tx, now, timeZone)` (Task 1, ai module); the
existing `subscription.get` overview.

**Interfaces — Produces:**
- `billingView`: `{ planName, paidThrough, status, limits { seats, whatsappNumbers, storageBytes, aiCredits },
  used { seats, whatsappNumbers, storageBytes, aiCredits }, payments: { paidOn, amountPaise, paidThrough, reference }[] }`
  (non-voided, newest first, at most 24).
- `isVerified(overview, today, isDemoPlan): boolean` — status `active`, `paidThrough !== null && paidThrough >= today`,
  not the demo plan (the overview's plan key or name tells the demo; add `planKey` to the overview if needed).
- Web: the tick (lucide `BadgeCheck`, brand green token) beside the organization's name in the org mark, with a
  Popover: plan name, "Paid till 26 Feb 2027", and for holders of `billing:view` a link "Plan & billing"; accessible
  name "Verified · <plan> plan". Settings → "Plan & billing" (only with `billing:view`): plan and paid-till, an Item list
  of the four limits with "used of limit" (storage in GB, AI credits with Indian grouping), payments as a registry Table
  (date "26 Nov", amount ₹ Indian grouping, reference), and the support contacts to renew. Reminder: from 7 days before
  `paidThrough` through that day, for holders of `billing:view`, one line in the banner area "Your <plan> plan is paid
  till <day>. Contact us to renew." with a dismiss button remembered per device (try/catch around storage) until the
  paid-through date changes.

- [ ] **Step 1: Failing tests** — domain/api: `billing` refused without `billing:view`, returns limits including 20,000
  credits on a Growth-like plan, used counts, and only non-voided payments; web: `isVerified` true/false table (active
  paid through today → true; through yesterday, trial, past due, read-only, demo → false); the tick renders only when
  verified and its popover shows plan and paid-till; non-Owners see no "Plan & billing" link; the reminder shows at 7 days
  and not at 8, and stays dismissed; the page lists usage and payments.
- [ ] **Step 2: Run, see them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run domain `test/subscriptions`, api tests, web tests for the touched folders plus the guards
  (`no-hand-drawn-borders`, messages, class-names, permissions/kinds tests), `pnpm typecheck`, `pnpm lint`**
- [ ] **Step 5: Commit**

## Order

Tasks 1 and 2 in parallel (separate worktrees; they share no files). Task 3 after Task 1 is merged into the branch.
