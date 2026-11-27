# Paid plans: the quote's plans, a premium touch, and the owner's invoice

## Intent

The first agencies are moving onto paid plans from the quote the owner sent (Starter and Growth). The owner wants three
things, approved in chat on 2026-11-27:

1. **The plans as quoted, managed in the console:** Starter ₹4,000 a month or ₹10,000 for 3 months paid upfront (3 team
   members, 1 WhatsApp number, 10,000 AI credits a month); Growth ₹8,000 a month or ₹20,000 for 3 months (6, 2, 20,000).
   No GST is charged (the firm is not GST-registered). The owner switches an agency to its plan and records its payment.
2. **A subtle premium feel for paying agencies** ("so it makes them feel premium"): a verified tick by the agency's name
   in the sidebar with its plan and paid-till date; a Plan & billing page; a quiet renewal reminder.
3. **The invoice as the owner designed it** (a mock-up of the console invoice, 2026-11-27): the firm's own logo and name in
   the header, an uploaded signature with the signatory's name and title, Qty × Rate lines, the payment details as labelled
   rows, state codes, and the firm in the footer.

## Part A — Plans as quoted

- **A 3-month price.** A plan may be priced per month, per 3 months (paid upfront) and per year; a subscription's billing
  cycle may be `quarterly`. The console's plan form and Change plan dialog offer it when the plan is priced that way; the
  price breakdown and the payment dates count 3 months for it.
- **AI credits per plan.** A plan has an AI-credits-a-month figure (required, ≥ 1). The monthly limit every AI feature
  reserves against (today the constant `MONTHLY_AI_LIMIT` = 10,000 in `packages/domain/src/ai/usage.ts`) becomes the
  organization's plan's figure; an organization without a subscription keeps 10,000. Existing plans get 10,000 in the
  migration, so nothing changes for agencies already on them.
- **GST on the platform's own price, off for now.** The subscription policy gains the GST rate the platform charges on
  its subscriptions (0 or 18 %), 0 by default; the console's price breakdown shows GST only when it is above 0 (today the
  constant `SUBSCRIPTION_GST_BASIS_POINTS` = 1800 always adds it). Super admins change it in the console's subscription
  policy section when the firm registers.
- **The plans themselves are data:** after this ships, the owner creates Starter and Growth in the console with the
  quote's figures (storage and modules as the current plan's). No migration seeds a plan.

## Part B — The premium touch (the agency app)

- **Verified tick.** Beside the agency's name in the sidebar's organization mark (`apps/web/src/shell/org-mark.tsx`; on a
  phone, where the mark shows), a small check-badge icon in the brand's green, shown only while the subscription is
  **active and paid** (status active with a paid-through date, never a trial, a past-due or read-only agency, or the
  demo). Its accessible name says what it means ("Verified · Growth plan").
- **Its card.** Tapping or hovering the tick opens a small popover: the plan's name, "Paid till 26 Feb 2027" and, for the
  Owner, a link to Plan & billing. Every staff member sees the tick and the card; prices are never shown to anyone but the
  Owner.
- **Plan & billing** (Settings, the Owner only): the plan's name and paid-till date; what the plan includes with this
  month's use — team members (used of limit), WhatsApp numbers, AI credits this month, storage; and the payments
  recorded for the agency (date, amount, reference; voided ones left out). How to renew: the support contacts the app
  already shows (`support-contacts.tsx`). Nothing here changes anything.
- **Renewal reminder.** From 7 days before the paid-till date, the Owner (only) sees a quiet, dismissible line in the
  app's banner area: "Your Growth plan is paid till 26 Feb. Contact us to renew." The existing past-due banners are
  unchanged.

## Part C — The invoice as designed

Billing details gain:
- **Logo** and **signature**, each a PNG or JPEG of at most 1 MB, uploaded from the console to object storage under the
  platform's own prefix (never an organization's files), and removable;
- **signatory name** and **signatory title** (e.g. "Proprietor").

The PDF (new invoices only; issued invoices stay frozen):
- **Header:** the firm's logo (when set) and legal name at the top left, in place of the product's name; title, number and
  dates at the top right, as today.
- **From / Billed to:** the address lines, then the state as "Uttar Pradesh (State code: 09)".
- **Lines:** columns #, Description, Qty, Rate, Amount. A line is a description, a quantity (whole number, 1–999) and a
  rate; its amount is quantity × rate. GST, totals and words work on the sum as today.
- **How to pay:** labelled rows — Account name, Account number, IFSC, Bank, UPI ID — each only when set.
- **Signature block:** "For <firm>", the signature image (when set), a line, the signatory's name and title.
- **Footer:** the firm's name and its address on the left, the page count on the right.

The console's New invoice form follows: each line gets Qty and Rate fields, with the amount shown.

## Non-goals

Online payment or payment links; emails or WhatsApp messages about plans or renewals; changing seat or WhatsApp-number
enforcement; anything shown to an agency's staff about prices other than the Owner's own payments; the GST-compliance
details parked until the firm registers for GST (SAC code, place of supply, GSTIN checks).

## Anti-goals

- Anything loud: no banners or badges that sell, no upgrade prompts, no confetti.
- The firm's bank details, the signatory's name, the logo or the signature in the repository: they live only in the
  database and object storage, entered by the owner; tests use made-up values and generated images.
- A change to an issued invoice.

## Constraints

- The repository's rules (CLAUDE.md): the owner's UI rules (registry components only, no hand-drawn borders, every word
  a message, `InfoHint`, `ResponsiveDialog`/`FormDialog`), the console rules, the data rules (the AI usage reservation
  stays one race-free statement; the plan is read under row-level security as today), migrations that only add (existing
  rows get defaults).
- Files go from the browser straight to storage by a presigned upload (as `uploadFile()` does), checked for type and size
  by the server before they are used; the PDF port draws PNG and JPEG only (`imageOf`, `jpegForDrawing`).
- The sidebar is shared with the web-revamp work: change only the organization mark and the banner area.

## Decisions (the lead's calls, after the builder check)

1. **Extra seats on 3 months:** a third optional price, `extraSeatQuarterlyPricePaise`, like the monthly and yearly ones
   (null: the plan sells no extra seats that way). The quote sells none, so the owner leaves it empty.
2. **GST is read live** from the subscription policy (a new column, 0 by default) wherever the price breakdown is shown;
   payments keep the amounts staff typed, so nothing recorded changes. Moving every existing breakdown from 18 % to 0 % is
   the intended change (the firm charges no GST).
3. **AI credits:** the migration gives every existing plan (the demo's and any placeholder included) 10,000. The limit is
   read from the organization's subscription's plan in the same transaction, just before the one reserving statement,
   which takes it as a parameter; an organization with no subscription keeps 10,000. A plan change takes effect at once:
   a lower limit than this month's use refuses further calls until next month.
4. **3-month dates:** a 3-month cycle counts like the monthly one, three calendar months at a time (the same month-end
   rule); the lifecycle job reads the paid-through date as today; changing cycle mid-period works as Change plan does
   today.
5. **"Active and paid"** (the tick): the subscription overview the app already reads (`subscription.get`: status, plan
   name, paid-through) is enough: status `active`, a paid-through date on or after today, and not the demo's plan. A
   grace period or a past-due agency shows no tick. No new data reaches non-Owners.
6. **Plan & billing** reads through a new agency procedure under a new permission `billing:view` (the Owner gets it, as
   every new permission), returning the plan's limits and this month's use and the organization's own non-voided
   payments, which are organization rows under row-level security already.
7. **Invoice lines:** issued invoices stay as they are; in the console's list and detail an older line without a quantity
   reads as quantity 1 at its amount. Logo, signature, signatory name and title are all optional.
8. **Logo and signature files:** uploaded by a console procedure's presigned link to `platform/billing/<logo|signature>-<id>.<png|jpg>`,
   checked (type by its bytes, ≤ 1 MB) before it is saved on the billing details; the PDF fits the logo in a 48 pt-high
   box and the signature in 140 × 60 pt, keeping its proportions.

## Left to the builder

Table and column shapes; where the Plan & billing page sits in Settings' list; the popover's exact layout; how the
dismissal of the reminder is remembered (per device is enough); the 3-month cycle's name in messages ("3 months").
