# Customer pages polish: the quote link and the trip page look like the app

Owner-led, 2026-11-27 (web revamp). The owner opened a customer link on production and found it "so different and not
polished" next to the app's pages. Approved ("yes lgtm") as proposed; calls marked "(my call)" are mine.

## Why it looks different

The pages at `/p/<token>` are plain HTML written by the api (`apps/api/src/public-html.ts`, `quote-page.ts`,
`trip-page.ts`, `trip-forms.ts`): no script, fast on a cheap phone. They use the device's system font and plain grey
boxes, so none of the app's look reaches them. Once a quote is accepted, the same link becomes the trip page, which the
quotes revamp (PR #97) did not touch: paise everywhere, "I've paid Advance" reads like a heading, days are plain lines,
no QR, two long traveller forms with the browser's own date and select boxes.

## Decided

Keep the pages plain HTML (fast, no script beyond what they have), and give them the app's look:

1. **One look for both pages** (`public-html.ts`):
   - the brand's three typefaces (Figtree for text, EB Garamond for the trip's title, IBM Plex Mono only on amounts),
     served from our own address (my call: copied into the web app's `public/fonts` by its generate step, as the icons
     are; `/p` is the web app's address rewritten to the api, so `/fonts/...` is the same origin), with `font-display:
     swap` and the system font as the fallback;
   - white cards with the app's hairline border on the cream canvas, the app's radius and spacing; colours from
     `@travel-crm/brand` only;
   - status pills in the app's meanings: green good/paid, amber waiting/due, red overdue/nothing received;
   - buttons: the main blue, a secondary outline, a quiet one; 44px targets;
   - on a phone, a bar fixed to the bottom with the page's one main action (CSS only).
2. **The header:** the agency's logo when it has one (as the PDF shows it; my call: only if the page can show it without
   loading from a new origin or adding a script; otherwise the name alone), the agency's name, then the trip's name big in
   the title font, its date and people in ink, and a status pill.
3. **The quote page** keeps its content and order from PR #97; it takes the new look, and its bottom bar on a phone is
   "Accept quote" (a link to the Accept form) until accepted, then "Pay ₹X" when something is due.
4. **The trip page** (after the booking is confirmed), in the order it reads today, restyled:
   - the status pill: Confirmed, Part paid, Paid in full, Cancelled;
   - money: "₹10,000 of ₹29,398 paid" with a progress bar; a **Next payment** card with the amount, its day, Pay by UPI,
     the UPI QR (only once the agency's UPI id is verified, as on the quote page) and the UPI id in text;
   - money in whole rupees, by the quote page's rule (`wholeRupees`), never paise;
   - each payment due as a row with a pill (Paid, Due 25 Nov, Overdue) and "I've paid" as a secondary button;
   - the day by day as the blue day boxes the quote page uses; hotels, vouchers, meeting points and packing as cards;
   - travellers: "0 of 2 done", each traveller one row (`<details>`) with a pill (Details needed / Details received)
     that opens to its form; the first one still needed is open;
   - the cancellation terms folded (`<details>`);
   - the bottom bar on a phone: "Pay ₹5,000" (the same UPI link) while a payment is due.
5. Everything else on the trip page stays as it is: what it shows, never an ID number or photo back, the forms' fields
   and what they save, the feedback form, the ways to reach the agency.

## Not in this change

Moving the pages into the Next app (rejected: heavier on a customer's phone, more work, same visible result). New
content on either page. The PDF.

## Approaches considered

- (chosen) Restyle the api's plain HTML with the app's fonts, tokens and parts.
- Rebuild both pages in the Next app with its components: identical look for free, but a client-rendered public page,
  new routes and CSP work, slower on a weak signal.
