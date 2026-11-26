# Quotes revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quotes read at a glance: a searchable list with honest statuses, one row of clear actions, a quote page whose
trip, money and plan stand out, and a customer page and PDF in the same layout.

**Architecture:** PR 1 (branch feat/quotes-revamp) is the staff side: Task 1 (list, statuses, New quote, lead card) in one
worktree, Tasks 2 then 3 (a quote's actions, then its body) in another. PR 2 (branch feat/quotes-customer) is Task 4 (the
customer's page) then Task 5 (the PDF) in a third worktree. Tasks 2 and 3 both touch `quotes/quote-screen.tsx`, so they run
one after the other.

**Tech Stack:** Next.js 16.4 (never `next upgrade`), React 19, Tailwind v4, shadcn radix-nova registry, next-intl, tRPC +
TanStack Query, Prisma 7.10 (RLS, `forOrg`), Hono (the api's plain-HTML pages), React-PDF (only in packages/integrations),
Vitest, Playwright journeys.

**Spec:** `docs/superpowers/specs/2026-11-27-quotes-revamp-design.md`

## Global Constraints

- CLAUDE.md binds: registry components only; no `border`/`divide-`/`ring-`/`shadow` classes outside `components/ui`;
  brand tokens only; every word in the feature's messages file (`quotes.json`, and `ai.json` loses the write-up's keys);
  44px targets; Indian formats (`formatMoney`/`rupees` without paise where the spec says so, `formatCalendarDay`); strict
  TypeScript, no `any`, no `!`; one-line purpose comment atop each new file; least code; test first.
- API: inputs `z.strictObject`, outputs `z.object`; a field this release adds is read on the web through `mayBeMissing`;
  every query, search included, is a JSON POST (no searched text in a URL; the screen keeps it in `lib/tab-storage.ts`).
- Modules call down only (dependency-cruiser): read an AI booking's state for a quote through the module that may see both
  (compose in the api router or a module above quotes), never by importing upward.
- Colour meanings (owner): blue tint = the day-by-day plan; green = inclusions, a departure, paid in full, Mark accepted;
  amber = still to pay, Waiting for payment, Hold expired; red = nothing received, overdue, Mark declined, Delete. Status
  colours come from the brand's status tokens (`status-good`, `status-attention`, `status-bad`) and the action tint.
- The customer's page stays plain HTML from the api with no script, the device's fonts and the brand's colours; it posts
  only to its own link. The PDF is React-PDF inside `packages/integrations`.
- Commits: Conventional, lowercase subject, header ≤ 100 characters, `git commit -m ... -- <paths>`, no Co-Authored-By,
  never push, never `git stash`, never `git add -A`. Run tests in the FOREGROUND under Node 24
  (`source ~/.nvm/nvm.sh && nvm use >/dev/null && …`).

## Review Focus

1. A quote that is accepted or declined never reads "Waiting for payment", even with an AI booking behind it; an AI booking
   confirmed reads Accepted.
2. A member without `quotes:edit`: no Edit, Mark, Delete or "⋯" edit items; the Live link and the PDF still work.
3. Search: a phone typed as "+91 98765 43210", "9876543210" or "98765"; a Devanagari name; an empty search shows the list.
4. An older api without the new status field: the list and the quote page still render (Draft as before).
5. The customer's page on a 360px phone with no script: Accept with a name alone records the terms acceptance and the
   trip-updates permission exactly as the two tick boxes did (same stored fields, same audit), and a quote with several
   options still asks which one.

---

### Task 1: The Quotes list, its statuses, New quote, and the lead page's card

**Files:** the quotes list contract and domain query (packages/contracts/src/quotes, packages/domain/src/quotes), the router
composing the AI booking state, `apps/web/src/quotes/quotes-screen.tsx` (+ a small new-quote dialog file),
`apps/web/src/quotes/quote-status.tsx`, `apps/web/src/quotes/lead-quotes-card.tsx` and the lead page that orders its cards,
`apps/web/src/shell/navigation.ts` / `phone-navigation.tsx` (only if the phone's order differs), `quotes.json`, tests.

**Interfaces:** Produces `paymentWait: "waiting" | "hold_expired" | null` on a quote's list item and on its detail (null
unless the quote is behind an open, unpaid AI booking whose quote is not accepted or declined); `search?: string` on the
list's input (≤ 80 characters).

- [ ] Failing domain/api tests: a quote behind an open AI booking reads `paymentWait: "waiting"`; its hold lapsed reads
  `"hold_expired"`; once the booking is confirmed or the quote accepted/declined, null; a staff-made quote, null. Search
  finds by name (case-insensitive, Devanagari too), by phone digits in any of the Review Focus forms, and by trip title,
  within the member's scope.
- [ ] Failing web tests: the list is a Table with a search box ("Search quotes") and the chips; typing narrows the rows; the
  search text survives a reload in the tab and is not in the URL; a "Waiting for payment" and a "Hold expired" badge (amber);
  New quote opens a dialog to pick a lead, then the lead's New quote choices; the lead page shows the Quotes card before the
  WhatsApp card with New quote as the default (primary) button; an older api without `paymentWait` shows Draft.
- [ ] Implement; run the domain, api and web tests, typecheck, lint, dependency-cruiser.
- [ ] Commit `feat(web): a searchable quotes list that names quotes waiting for payment`.

### Task 2: A quote's actions in one row

**Files:** `apps/web/src/quotes/quote-screen.tsx` (split the actions into `quote-actions.tsx`), `apps/web/src/components/ui/button.tsx`
(a `success` variant: the status-good tint deepened as the destructive one is, ink words; documented in
`components/ui/README.md` and DESIGN.md), the write-up feature removed (`apps/web/src/ai/write-up/**`,
`packages/domain/src/ai/write-up/**`, its router procedure, its messages and tests, any credit or test that names it),
`quotes.json`, tests.

- [ ] Failing tests: the row holds, in order, Send on WhatsApp (icon button with the WhatsApp mark and that name), Live link
  (a blue link opening `/p/<token>` in a new tab, with Copy), Download the PDF (icon button), Edit, Mark accepted (success
  variant), Mark declined (destructive), Delete (destructive icon button with a trash, then the confirmation), and "More for
  this quote" (⋯) holding Duplicate as another option and Save as package; Edit on a draft goes to the form, Edit on a sent
  quote calls the new-version mutation and opens the new draft; no "Write for the customer" anywhere; viewer without
  `quotes:edit` sees only WhatsApp (if allowed), Live link and the PDF.
- [ ] Implement (the WhatsApp mark: reuse the app's existing WhatsApp glyph if one exists, else a small inline SVG component
  in `components/`, `aria-hidden`); run the tests, typecheck, lint; no test may still name the write-up.
- [ ] Commit `feat(web): a quote's actions in one row, with edit, a green accept and a red delete`.

### Task 3: The opened quote, read at a glance

**Files:** `apps/web/src/quotes/frozen-quote.tsx`, `quote-form.tsx` (section order only), `quote-money.tsx`,
`quote-screen.tsx` (the trip header and the note's place), the departure card on the quote page, `quotes.json`, tests; an
audit shot of a sent group-trip quote on phone and desktop in the quotes audit file.

- [ ] Failing tests: the trip's name is the page's heading; its date with weekday and people read in ink (no muted class);
  Price comes before Day by day; each day is its own box with "Day 1 · <title>" and its words, an arrow between days
  (decorative, hidden from screen readers); inclusions are a list with a tick per line in the green tint, exclusions a list
  with a cross per line, notes a list; Payments: nothing received → "Nothing received yet" and Paid in the bad tone; part
  paid → Still to pay in the attention tone; fully paid → "Paid in full" in the good tone; an installment past its date in
  the bad tone; the departure card in the green tint with its day, seats left of total, pickup point and time, and its link;
  the "sent, so prices are fixed" note is the last thing on the page; a draft's form has the same section order.
- [ ] Implement; take the audit shots (phone 390px and desktop 1440px) and fix what they show; run tests, typecheck, lint.
- [ ] Commit `feat(web): the opened quote leads with its trip, its money and its plan`.

### Task 4: The customer's link page

**Files:** `apps/api/src/quote-page.ts` (and its CSS/words), the accept handler it posts to, their tests in `apps/api/test/`.

- [ ] Failing tests: the page reads, top to bottom, the agency's name, "To: <customer's name>", the trip's name (h1), the
  date and people, the Accept section (a name field and one Accept button, no checkbox; several options: the radio choice
  first), then Price (total incl. GST, no paise, no CGST/SGST rows), the day boxes, inclusions, exclusions, notes, terms in
  full, and the small-print consent line; accepting with a name stores the terms acceptance and the trip-updates permission
  as the two ticks did (same fields and audit); accepted: the Accept section's place shows Pay now with "Pay by UPI" and the
  UPI id, and the payment claim; no `<script>`; the page fits 360px (no element wider than the viewport, checked by a CSS
  rule test or a journey).
- [ ] Implement; run the api tests and the public-quote journey; take a phone and desktop shot of the page and fix what
  they show.
- [ ] Commit `feat(api): the customer's quote page leads with the trip and one accept button`.

### Task 5: The quotation PDF

**Files:** the quotation document in `packages/integrations/src/pdf/` (and the domain's document input if the words it
gets must change: the dates as words, no paise), their tests.

- [ ] Failing tests: the document's text has the trip's full name (no "…" truncation), "4 Dec 2026 · 1 adult", "Total
  ₹8,999 (incl. 5% GST)", no "CGST"/"SGST" rows, no paise, what is due, the days as boxes, inclusions, exclusions, notes,
  terms; the tax invoice still shows its CGST/SGST table.
- [ ] Implement; render one quotation to a PNG/PDF in the scratchpad and look at it; run the integrations and domain
  document tests.
- [ ] Commit `feat(integrations): a simpler quotation pdf in the quote page's layout`.
