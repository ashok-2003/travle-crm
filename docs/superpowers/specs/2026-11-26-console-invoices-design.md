# Invoices from the platform console

## Intent

When an agency accepts our quote, we send it an invoice; it pays by bank transfer or UPI; a super admin records the payment
on its organization (that flow exists: "Record a payment", which keeps it active). What is missing is the invoice itself.
The owner (2026-11-26): "I can enter the amount myself in the invoice and it can be created; just need to enter the name of
the company I'm sending the invoice to", with GST as a dropdown, "so that it's fully controllable".

The seller is our firm: a partnership firm, not GST-registered yet ("GST can be optional for us now"). The product brand
is the brand package's (Veeper AI); the legal seller is the firm, whose name, address and payment details are entered in
the console, never typed into the code (the repository is public).

## Goals

1. **Billing details, entered once** (super admins): the firm's legal name, address, state, PAN and GSTIN (both optional),
   phone and email, and the "how to pay" details: bank account name, account number, IFSC, bank and branch, UPI ID; a
   default terms text; the invoice number prefixes.
2. **Create an invoice by hand** (super admins), in the console:
   - **Type:** Pre-invoice (proforma) or Invoice.
   - **Billed to:** company name (required); address, state and GSTIN (optional). Free text: the company need not be an
     organization in the system yet (a pre-invoice goes out before onboarding). Choosing an existing organization only fills
     the name in.
   - **Dates:** invoice date (today by default) and due date (optional).
   - **Lines:** one or more, each a description and an amount (e.g. "Starter plan, 3 months, paid upfront", ₹10,000).
   - **GST:** a dropdown: None, 5 %, 12 %, 18 %, 28 % (None by default), on the whole invoice. With GST, the invoice shows
     CGST and SGST when the billed-to state is the firm's state, IGST otherwise (the kernel's `indiaGst` splits it); a GST
     rate needs the billed-to state.
   - **Notes and terms:** prefilled from the default terms, editable for this invoice.
   - Totals, and the total in words ("Rupees Ten Thousand Only").
3. **Numbering:** each type numbers on its own, in order within the Indian financial year (April to March), from its
   prefix: e.g. `PI/2026-27/001` and `INV/2026-27/001`. Numbers never repeat and never skip because of a failed save.
4. **The PDF:** a clean A4 page with the brand, the firm's details, billed-to, number, dates, lines, GST, total, total in
   words, the payment box (bank and UPI) and "For <firm>, Authorised signatory". Downloaded from the console and sent by the
   owner (WhatsApp, email); the console sends nothing.
5. **The list:** every invoice, newest first, with number, type, billed-to, total, date and status (issued or cancelled),
   to open, download again or cancel.
6. **Frozen once issued:** an issued invoice never changes. A mistake is fixed by cancelling it (with a reason; it stays
   in the list marked cancelled, its number used) and creating a new one. "Copy" starts a new invoice from an old one, so a
   pre-invoice becomes an invoice in one step.
7. Each create, cancel and billing-details change goes in the platform log (`recordPlatformAudit`), by who and when.

## Non-goals

- No link between an invoice and a payment, a plan or a subscription: payments are recorded as today, by hand.
- No sending by the console (no email, no WhatsApp), no payment links, no online payment.
- No agency-side view of invoices.
- No change to plans, billing cycles or the 18 % GST the subscription price breakdown shows (separate work).
- No e-invoicing (IRN/QR): the firm is not GST-registered.

## Anti-goals

- Bank details, the firm's address or any client's name in the repository (seed data, tests, docs): they live only in the
  database, entered in the console. Tests use made-up values.
- An invoice whose amounts change after it was downloaded.

## Constraints

- The platform console's rules (CLAUDE.md, ADR 0025): console routes and code in `src/console/**`, `useConsoleTRPC()`,
  `superAdminProcedure` for money and billing details, times in `PLATFORM_TIME_ZONE`, every word a next-intl message, the
  owner's UI rules (shadcn registry components, `FormDialog`/`ResponsiveDialog`, `MoneyField`, `DateField`,
  `GstStateField`, `SelectField`).
- These are platform tables (no `organization_id`), reached only through the platform module and
  `@travel-crm/db/platform`, as plans are.
- Money in integer paise; dates as calendar dates; the PDF through the integrations PDF port (React-PDF), as the agency's
  documents are; files never streamed through the api (stored and downloaded by a presigned link, as other files are).
- Migrations only add (a timestamp after the latest on main).

## Decisions (the lead's calls, after the builder check)

1. **The PDF is frozen bytes, kept forever.** It is rendered once, when the invoice is created, and stored in object
   storage under a platform prefix of its own (not an organization's files); downloads are presigned links to those bytes.
   No sweep or erasure ever deletes an invoice (a legal record, kept at least eight years). A later change to the brand,
   the layout or the billing details never alters an issued invoice.
2. **Each invoice keeps a snapshot** of the seller's details and the payment box as they were when it was created, on its
   own row; changing the billing details afterwards changes only new invoices.
3. **States are GST state codes** (`GstStateField`). The firm's state is required in the billing details (it is where the
   firm is, registered or not); the billed-to state is required only when a GST rate is chosen.
4. **GST needs a GSTIN.** A firm that isn't GST-registered may not charge GST, so the GST dropdown stays on None, disabled
   with the reason ("Add your GSTIN in Billing details to charge GST"), until a GSTIN is saved (the switch-prerequisites
   habit). The PDF's title follows: "Proforma Invoice" for a pre-invoice; "Tax Invoice" for an invoice with GST; "Invoice"
   for one without. Without a GSTIN the PDF shows no GSTIN line.
5. **Numbers:** the financial year comes from the invoice date. Each number is taken inside the create transaction from a
   counter row per type and financial year, locked for that transaction, so numbers never repeat and a failed save uses
   none. The two types never share a number; a copy gets a new one.
6. **Money:** line amounts are before GST; GST is computed once on the sum of the lines (CGST and SGST each half, or
   IGST, as `indiaGst` rounds them); the total is in paise with no round-off line. A line is a description and an amount:
   no quantities or discounts.
7. **Access and history:** super admins only, for billing details and invoices alike (money). "Copy" copies everything,
   notes included, with today's date and a new number. Cancelling is allowed at any time (invoices are not linked to
   payments) and needs a reason.

## Left to the builder

The table shapes, how the number sequence is kept race-free, the PDF's layout within the brand's colours and fonts, where
the console's navigation shows Invoices and Billing details, and whether the PDF is rendered at create time or on first
download.
