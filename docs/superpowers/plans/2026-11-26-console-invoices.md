# Invoices from the platform console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** super admins enter the firm's billing details once and create numbered, frozen invoices (pre-invoice or
invoice) by hand in the console, downloaded as a PDF.

**Architecture:** three platform tables (no `organization_id`, platform role only), a platform domain module that numbers,
computes, renders (through a renderer passed in its services) and stores each invoice once, a super-admin router, and
console screens. The PDF is a new template in the integrations PDF port.

**Tech Stack:** Prisma 7.10 + Postgres migrations, Zod 4 contracts, tRPC platform router, React-PDF, Next.js console with
shadcn registry components, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-console-invoices-design.md` (read it; its Decisions section binds).

## Global Constraints

- Repo rules in `CLAUDE.md` (strict TypeScript, one-line comment atop each new file, Conventional Commits ≤ 100 chars,
  stage by name, never `--no-verify`, never `Co-Authored-By`), the console rules (ADR 0025) and the owner's UI rules.
- No firm address, bank details or client names anywhere in the repository: tests use made-up values ("Test Firm",
  "Acme Holidays", account "000011112222", IFSC "TEST0000001", UPI "test@upi").
- Money in integer paise (`bigint` columns for totals); calendar dates as `yyyy-mm-dd`; financial year as `"2026-27"`.
- GST rates offered: 0, 500, 1200, 1800, 2800 basis points. A rate above 0 needs a saved GSTIN and a billed-to state.
- Titles: kind `proforma` → "Proforma Invoice"; kind `invoice` with GST → "Tax Invoice"; without → "Invoice".
- Numbers: `<prefix>/<financial year>/<3-digit sequence>`, default prefixes `PI` and `INV`; the year from the invoice
  date (April–March).
- The shared PDF input type already exists: `PlatformInvoiceData` and `RenderPlatformInvoice` in
  `packages/integrations/src/pdf/platform-invoice-input.ts` (exported from `@travel-crm/integrations/pdf`).
- Migration `20261228100000_platform_invoices` (only adds).

## Review Focus

1. Two invoices created at the same moment (double-click, two admins) get two different consecutive numbers, never the
   same one — Task 1's numbering test runs two creates concurrently.
2. A failed create (render or storage throws) leaves no row and uses no number — Task 1 test.
3. An invoice dated 31 March and one dated 1 April fall in different financial years and restart at 001 — Task 1 test.
4. Changing billing details after an invoice exists leaves that invoice's stored seller snapshot and PDF untouched —
   Task 1 test.
5. A GST rate chosen with no GSTIN saved, or with no billed-to state, is refused by the api (not only hidden in the UI) —
   Task 1 test; the UI disables it with the reason — Task 3 test.

---

### Task 1: Tables, contracts, domain and router

**Files:**
- Create: `packages/db/prisma/schema/platform-invoices.prisma`, `packages/db/prisma/migrations/20261228100000_platform_invoices/migration.sql`
- Create: `packages/contracts/src/platform/invoices.ts` (export from `packages/contracts/src/platform/index.ts`)
- Create: `packages/domain/src/kernel/rupees-in-words.ts` (export from the kernel index)
- Create: `packages/domain/src/platform/billing-details.ts`, `packages/domain/src/platform/invoice-numbers.ts`,
  `packages/domain/src/platform/invoice-amounts.ts`, `packages/domain/src/platform/invoices.ts` (export from the platform index)
- Modify: `packages/domain/src/platform/services.ts` (add `renderInvoice?: RenderPlatformInvoice`)
- Create: `packages/api/src/platform/routers/invoices.ts`; Modify: `packages/api/src/platform/platform-router.ts`
- Modify: `apps/api/src/console*.ts` where `PlatformServices` is built: pass `renderInvoice` (Task 2's real renderer;
  until it lands, import `renderPlatformInvoice` from `@travel-crm/integrations/pdf` — coordinate by name only)
- Tests: `packages/domain/test/kernel/rupees-in-words.test.ts`, `packages/domain/test/platform/invoices.test.ts`,
  `packages/api/test/platform/invoices-router.test.ts` (follow the neighbouring platform tests' setup)

**Interfaces — Produces:**
- Tables: `platform_billing_details` (one row: CHECK on a fixed `id`, or a boolean singleton key), `platform_invoice`,
  `platform_invoice_counter (kind, financial_year, value)`. `REVOKE ALL ... FROM app_runtime` on all three;
  `app_platform` gets no `DELETE`/`TRUNCATE` on `platform_invoice` and the counter. Invoice columns: kind
  (`proforma|invoice`), number (unique), financial_year, sequence, issued_on, due_on?, bill_to_name, bill_to_address?,
  bill_to_state_code?, bill_to_gstin?, lines (jsonb `[{description, amountPaise}]`), gst_rate_basis_points,
  subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, notes?, seller (jsonb snapshot of the billing
  details used), pdf_key, status (`issued|cancelled`), cancelled_at?, cancelled_by?, cancel_reason?, created_at,
  created_by. CHECKs for the kind, status, rate set, non-negative amounts, and cancel fields set together.
- Contracts (`@travel-crm/contracts/platform`): `billingDetails` (output) and `setBillingDetailsInput` (strictObject:
  legalName, address, stateCode, pan?, gstin?, phone?, email?, bankAccountName?, bankAccountNumber?, bankIfsc?,
  bankNameBranch?, upiId?, defaultTerms?, proformaPrefix, invoicePrefix — prefixes `^[A-Z0-9-]{1,8}$`);
  `createInvoiceInput` (kind, issuedOn, dueOn?, billTo {name, address?, stateCode?, gstin?}, lines (1–20 of
  {description 1–200 chars, amountPaise ≥ 1}), gstRateBasisPoints (one of the five), notes?);
  `invoiceSummary` (id, kind, number, issuedOn, billToName, totalPaise, status, createdAt);
  `invoiceDetail` (summary + every stored field); `cancelInvoiceInput` {invoiceId, reason};
  `listInvoicesInput` (cursor page); `invoiceIdInput`.
- Kernel: `rupeesInWords(paise: number): string` — Indian system ("Rupees One Lakh Twenty Thousand and Fifty Paise Only";
  whole rupees end "… Only").
- Domain: `getBillingDetails(services) → BillingDetails | null`, `setBillingDetails(services, staff, input)`,
  `invoiceAmounts(lines, rateBasisPoints, sellerStateCode, billToStateCode) → { subtotalPaise, cgstPaise, sgstPaise,
  igstPaise, totalPaise }` (uses the kernel's `indiaGst`), `financialYearOf(day: string) → "2026-27"`,
  `createInvoice(services, staff, input) → InvoiceDetail`, `listInvoices`, `getInvoice`,
  `cancelInvoice(services, staff, input)`, `invoiceDownloadLink(services, invoiceId) → { url }` (presigned,
  short-lived), all audited with `recordPlatformAudit` (`platform.billing-details.changed`, `platform.invoice.created`,
  `platform.invoice.cancelled`).
- Router `invoices` (all `superAdminProcedure`): `billingDetails`, `setBillingDetails`, `list`, `get`, `create`,
  `cancel`, `downloadLink`.

**createInvoice order (the decisions that the tests pin):** in one platform transaction — read billing details (none →
`DomainError("CONFLICT","BILLING_DETAILS_MISSING")`), refuse a rate > 0 without a GSTIN (`GST_NEEDS_GSTIN`) or without a
billed-to state (`GST_NEEDS_STATE`), take the next number by `INSERT … ON CONFLICT (kind, financial_year) DO UPDATE SET
value = value + 1 RETURNING value` (the row lock serialises concurrent creates), compute the amounts, render the PDF with
`services.renderInvoice` (missing → `DomainError("CONFLICT","PDF_RENDERER_MISSING")`), `put` it at
`platform/invoices/<financial year>/<invoice id>.pdf`, insert the row, audit. Any throw rolls everything back (the stored
object of a rolled-back create may stay; it is never linked).

- [ ] **Step 1: Write failing tests** — `rupees-in-words.test.ts`: 0, 1, 99, 100, 1000, 100000, 1250000, 10000000,
  and 1050 paise ("Rupees Ten and Fifty Paise Only"). `invoices.test.ts` (real database, memory storage, a fake
  `renderInvoice` that records its `PlatformInvoiceData` and returns `new Uint8Array([1])`):
  numbers `PI/2026-27/001`, then `002`; an `invoice` kind starts its own `INV/2026-27/001`; two concurrent creates get
  `001` and `002`; 31 Mar 2027 → `2026-27`, 1 Apr 2027 → `2027-28/001`; a renderer that throws leaves no row and the
  next create is still `001`; GST 18 % same state → CGST = SGST = 9 %, other state → IGST 18 %, no GST → all zero;
  `GST_NEEDS_GSTIN`, `GST_NEEDS_STATE`, `BILLING_DETAILS_MISSING`; the renderer receives the title per the Global
  Constraints, `totalInWords`, seller lines without an unset GSTIN, and `payment: null` when no bank/UPI is set;
  changing billing details afterwards leaves the first invoice's `seller` snapshot equal to the old details; cancel sets
  status and reason, a second cancel is refused, and the number is not reused. Router test: a support (non-super-admin)
  staff member is refused every procedure.
- [ ] **Step 2: Run them and see them fail** — `pnpm --filter @travel-crm/domain exec vitest run test/platform/invoices.test.ts test/kernel/rupees-in-words.test.ts`
- [ ] **Step 3: Write the migration and models; run `pnpm --filter @travel-crm/db exec prisma generate` and `pnpm migrations:check`**
- [ ] **Step 4: Implement contracts, kernel helper, domain and router as above**
- [ ] **Step 5: Run the tests, `pnpm typecheck`, `pnpm lint`** — all pass
- [ ] **Step 6: Commit** (`feat(db): …`, `feat(platform): …` as fits)

### Task 2: The invoice PDF template

**Files:**
- Create: `packages/integrations/src/pdf/templates/platform-invoice.ts`
- Create: `packages/integrations/src/pdf/render-platform-invoice.ts`; export `renderPlatformInvoice` from `packages/integrations/src/pdf/index.ts`
- Test: `packages/integrations/test/pdf/platform-invoice.test.ts`

**Interfaces:** Consumes `PlatformInvoiceData` (exists). Produces `renderPlatformInvoice: RenderPlatformInvoice`.

Layout: follow `templates/sample-document.ts` (React-PDF via `createElement`, `pdfTheme`, `pageHeader`/`pageFooter`, the
brand's fonts registered as `render-pdf.ts` does): the product brand at the top left, title and number/dates at the top
right; "From" (seller) and "Billed to" blocks side by side; a table of rows with right-aligned amounts; totals with the
total emphasised; "Amount in words"; a "How to pay" box when `payment` is set; notes; "For <firm> / Authorised signatory"
at the bottom right. Text goes through the printable-text check as the sample's does.

- [ ] **Step 1: Failing test** — renders a full `PlatformInvoiceData` and a minimal one (no due date, no payment, no
  notes) to bytes starting with `%PDF`; the same input and `issuedAt` render identical bytes; the PDF's text contains the
  title, the number, every row's description and amount, the total in words and (full case) a payment line; unprintable
  characters are refused as the sample's test checks.
- [ ] **Step 2: Run, see it fail** — `pnpm --filter @travel-crm/integrations exec vitest run test/pdf/platform-invoice.test.ts`
- [ ] **Step 3: Implement the template and `renderPlatformInvoice`**
- [ ] **Step 4: Run the test, typecheck, lint** — pass
- [ ] **Step 5: Commit** (`feat(integrations): …`)

### Task 3: Console screens

**Files:**
- Modify: `apps/web/src/console/routes.ts` (`invoices: "/console/invoices"`, `billingDetails: "/console/invoices/billing-details"`),
  `apps/web/src/console/shell/console-navigation.ts` (an "Invoices" entry for super admins)
- Create: `apps/web/src/app/console/invoices/page.tsx`, `apps/web/src/app/console/invoices/billing-details/page.tsx`
- Create: `apps/web/src/console/invoices/` — `invoices-screen.tsx` (PageHeader, list as registry Table with
  number, type, billed to, total, date, status; ShowMoreButton), `invoice-dialog.tsx` (FormDialog: type, billed-to name
  with an optional "fill from an organization" SearchCombobox, address, GstStateField, GSTIN, dates via DateField, lines
  with add/remove and MoneyField, GST SelectField, notes prefilled from default terms, a live totals preview),
  `invoice-actions.tsx` (Download, Copy, Cancel with ConfirmDialog and reason), `billing-details-screen.tsx` (FormDialog
  or form card for every billing detail), `use-invoices.ts`
- Modify: `apps/web/src/i18n/messages/en-IN/` — a `console-invoices.json` (or the console's messages file the others use),
  and `errors.json` sentences for `BILLING_DETAILS_MISSING`, `GST_NEEDS_GSTIN`, `GST_NEEDS_STATE`, `PDF_RENDERER_MISSING`
- Tests: `apps/web/test/console/invoices/*.test.tsx` following the console's other screen tests

**Interfaces:** Consumes Task 1's router (`useConsoleTRPC().invoices.*`) and contracts.

Behaviour to pin: with no billing details the screen says so and links to Billing details, and New invoice is disabled
with that reason; the GST select is disabled with "Add your GSTIN in Billing details to charge GST" when no GSTIN is
saved; choosing a rate requires the billed-to state; the totals preview matches the server's rule (CGST/SGST vs IGST);
Download opens the presigned link; Copy opens the dialog filled from that invoice with today's date; Cancel needs a
reason and shows the row as cancelled; amounts show with ₹ and Indian grouping, dates as "26 Nov".

- [ ] **Step 1: Failing tests** for each behaviour above (render with a fake console api as neighbouring tests do)
- [ ] **Step 2: Run, see them fail** — `pnpm --filter @travel-crm/web exec vitest run test/console/invoices`
- [ ] **Step 3: Implement** with registry components only (no border/shadow classes; `pnpm dlx shadcn@4.21.4 add` for any missing primitive)
- [ ] **Step 4: Run the tests, the web test suite's guards (`test/no-hand-drawn-borders.test.ts`, messages tests), typecheck, lint** — pass
- [ ] **Step 5: Commit** (`feat(web): …`)

## Order

Tasks 1 and 2 run in parallel (different packages; they meet only at the existing shared type and the name
`renderPlatformInvoice`). Task 3 starts once Task 1 is merged into the branch.
