# Customer pages polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The customer's quote link and trip page at `/p/<token>` look like the app: its fonts, cards, colours and
buttons, with money in whole rupees and the trip page's payments, plan and travellers easy to read on a phone.

**Architecture:** Task 1 rebuilds the shared stylesheet and header in `apps/api/src/public-html.ts` (fonts served from
the web app's `public/fonts`, same origin through the `/p` rewrite) and moves the quote page onto it. Task 2 restyles the
trip page (`trip-page.ts`, `trip-forms.ts`) with Task 1's parts. Plain HTML stays; no new script.

**Tech Stack:** Hono plain-HTML pages in apps/api, `@travel-crm/brand` colours and fonts, `@fontsource-variable/*`
woff2 files, Vitest (apps/api), Playwright journeys and the audit camera (apps/web).

**Spec:** `docs/superpowers/specs/2026-11-27-customer-pages-polish-design.md`

## Global Constraints

- Colours only from `@travel-crm/brand` (`brand.colours`); no literal hex in the page code.
- Fonts: Figtree (text), EB Garamond (the trip's title), IBM Plex Mono (amounts only); `font-display: swap`; system
  fallback; nothing loaded from another origin; the CSP stays as strict as today (add `font-src 'self'` only if needed).
- Money the customer reads is whole rupees (`wholeRupees`), never paise; the UPI link's amount is the domain's, unchanged.
- The UPI QR shows only when the agency's UPI id is verified (as `quote-page.ts` does now).
- 44px targets; a 360px phone never scrolls sideways; the bottom bar never covers the last content (pad the page).
- What the pages show and save is unchanged: no field, rule or wording of consent changes; never an ID number back.
- Least code: shared parts in `public-html.ts`, used by both pages; files stay under ~300 lines (split if they grow).
- Commits: Conventional, lowercase subject, header ≤ 100 characters, staged by name, `git commit -m … -- <paths>`, no
  Co-Authored-By, never `git add -A`, never `git stash`. Node 24: `source ~/.nvm/nvm.sh && nvm use >/dev/null && …`.
  Tests in the FOREGROUND.

## Review Focus

1. A 360px phone: the trip page with two travellers, three dues (one overdue) and a long trip name: no sideways scroll,
   the bottom bar covers nothing.
2. An agency with no verified UPI id: no QR anywhere, Pay by UPI and the UPI id still shown.
3. A cancelled booking and a fully paid one: the right pill, no Pay bar.
4. A quote with several options (choose one first): the Accept form and the phone's bar still work.
5. Fonts missing (the api reached directly): the page still reads well in the system font.

---

### Task 1: One look, and the quote page on it

**Files:** `apps/api/src/public-html.ts` (stylesheet, header, pill, button, progress, bottom bar, details parts),
`apps/api/src/quote-page.ts`, the web app's generate step (`apps/web/scripts/generate.ts`) to copy the woff2 files into
`apps/web/public/fonts/` (git-ignored if generated, as `public/icons` is), tests in `apps/api/test/quote-page.test.ts`
and a `public-html` test.

- [ ] Failing tests: the page's CSS declares the three `@font-face` rules pointing at `/fonts/...woff2`; the header shows
  the agency, the trip's title (title font class) and a status pill; the phone bar reads "Accept quote" and links to
  `#accept` on an open quote, and "Pay ₹X" with the UPI link once accepted with something due; no hex literal outside
  brand; the CSP still has no remote origin.
- [ ] Implement; keep every existing quote-page test green.
- [ ] Audit shots: run `apps/web/test/e2e/audit/21-quotes-and-ai.audit.ts` (the customer link shot) with `AUDIT_OUT`
  in the scratchpad, look at phone and desktop, fix what they show.
- [ ] Commit `feat(api): the customer's pages share the app's fonts, cards and buttons, starting with the quote page`.

### Task 2: The trip page

**Files:** `apps/api/src/trip-page.ts`, `apps/api/src/trip-forms.ts`, their tests in `apps/api/test/`, and the journeys
that read the trip page (`apps/web/test/e2e/bookings-journey.spec.ts`, `payments-to-check-journey.spec.ts`,
`support/bookings.ts`) if their selectors change.

- [ ] Failing tests: the status pill (Confirmed, Part paid, Paid in full, Cancelled); "₹10,000 of ₹29,398 paid" and a
  progress bar; the Next payment card with the QR only when verified; each due's pill (Paid, Due <day>, Overdue) and an
  "I've paid" button; the days as day boxes; travellers as `<details>` rows with their pills and "0 of 2 done", the first
  needed one open; the terms in a `<details>`; the phone bar "Pay ₹X" only while something is due; no paise anywhere on
  the page.
- [ ] Implement with Task 1's parts.
- [ ] Run the bookings and payments-to-check journeys (phone and desktop) and an audit shot of the trip page (add one to
  the bookings audit if none exists); look at them and fix what they show.
- [ ] Commit `feat(api): the trip page reads like the app: money, payments, plan and travellers at a glance`.
