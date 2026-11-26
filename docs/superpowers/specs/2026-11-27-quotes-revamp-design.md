# Quotes revamp: a quote that reads at a glance, for the team and the customer

Owner-led, 2026-11-26/27 (web revamp). Decisions are the owner's unless marked "(my call)"; the owner approved the defaults
("yes your decisions are good").

## Why

Most quotes are made by the AI from a package (a customer taps Book in WhatsApp: the AI makes the quote, holds the seats
and asks for the advance). They never get a link sent, so they sit as "Draft", which misleads. The quote page shows thirteen
buttons in a row, the trip's name is small, the date and people are grey, prices sit below the plan, and money owed has no
colour. The customer's link page and the PDF are older than the app's design and carry details nobody needs.

## Decided

### Staff side (PR 1)

1. **Quotes list:** the registry Table with a search (customer's name, phone, trip; searched text never in the URL, as the
   Leads list keeps it) and the status chips; a **New quote** button that asks for the lead (search an existing lead, with
   a link to make a new lead), then opens the lead's existing New quote (blank or from a package).
2. **Statuses:** a quote behind an AI booking that is not paid reads **"Waiting for payment"** (amber), and once its seat
   hold has lapsed, **"Hold expired"** (amber), instead of "Draft". Sent, Accepted, Declined, Replaced and Draft as today.
3. **Lead page:** the Quotes card sits above the WhatsApp card; **New quote** is the primary (blue) button.
4. **Sidebar:** Quotes above Packages (already so on desktop; the phone's More menu follows the same order).
5. **A quote's actions, one row:**
   - **WhatsApp** (an icon button with the WhatsApp mark, named "Send on WhatsApp");
   - **Live link** in blue, opening the customer's page in a new tab, with Copy beside it;
   - **PDF**: a square icon button with the download mark, named "Download the PDF";
   - **Edit** replaces "Make a new version" and "Add another option": on a draft it edits in place; on a sent quote it
     makes the new version (a draft that replaces it when sent; the customer's old link then says replaced) and opens it.
     The new version waits as a draft until a person sends it.
   - **Mark accepted** green, **Mark declined** red, **Delete** a strong red trash button (confirmation as today);
   - a **"⋯" menu**: Duplicate as another option, Save as package.
   - **"Write for the customer" is removed** (the button and the feature's code; the owner: no significance now).
   - A green button style is new to the app: only Mark accepted uses it (owner).
6. **The opened quote (sent, accepted, or the AI's):**
   - the **trip's name big**, then its date and people in ink (not muted): "Fri 4 Dec 2026 · 1 adult";
   - **Price above the day-by-day plan**;
   - **Day by day**: each day a box in the light blue tint ("Day 1 · Delhi to Manali", its words under it), with a down
     arrow between days (owner's sketch);
   - **Inclusions** in green, one point a line with a tick; **Exclusions** under it, one point a line with a cross;
     **Notes** as points;
   - **Payments in the colours people already read:** nothing received: red ("Nothing received yet", Paid ₹0 red); part
     paid: Still to pay amber; paid in full: green ("Paid in full"); a payment due date passed: red;
   - **Departure** (a group trip's quote): the light green tint, its day with the weekday, seats left of total, the pickup
     point and time, and a link to the departure;
   - the **"This quote was sent, so its prices are fixed"** note moves to the bottom, small.
   - Colour only where it carries meaning; everything else stays plain.
   - A draft's form keeps its inputs but in the same order (trip, price, day by day, inclusions, exclusions, notes).

### Customer side (PR 2)

7. **The customer's link page** (/p/<token>, plain HTML from the api, no script — kept so):
   - the agency's name at the top; "To: <customer's name>"; the trip's name big; the date and people;
   - **Accept** right after: the customer's name and one Accept button, no tick boxes (several options: choose one first,
     as today); once accepted, the same place shows what to pay now with "Pay by UPI" and the UPI id, and the payment
     claim as today;
   - then the price (total including GST, no paise, no CGST/SGST table), the day boxes, inclusions (green ticks),
     exclusions (crosses), notes, and the terms in full;
   - at the bottom, small but readable: "By accepting this quote I agree to the terms and cancellation policy, and to get
     trip updates on WhatsApp." Accepting records the trip-updates permission the old tick box recorded. It covers trip
     updates about this booking only, never offers.
8. **The quotation PDF** follows the same layout: the agency and the quote's number and date, "To", the trip's name
   (wrapping, never cut off), "4 Dec 2026 · 1 adult" (never "2026-12-04, 1 adults, 0 children"), the price lines and
   "Total ₹8,999 (incl. 5% GST)" without paise or the CGST/SGST table (the tax invoice keeps it), what is due, the day
   boxes, inclusions, exclusions, notes, terms.

## Not in this change

The WhatsApp chat's side panel showing the quote or booking (owner: later, with more there); a payment gateway (payment
checks stay a person's: money goes straight to the agency's UPI).

## Approaches considered

- Statuses: (chosen) derive "Waiting for payment"/"Hold expired" from the quote's AI booking and hold, keeping the quote's
  stored status; rejected: a new stored status (a migration and every status switch to change, for a label).
- Edit on a sent quote: (chosen) reuse "make a new version" behind Edit; rejected: editing a sent quote in place (the
  customer's link would change under them).
- Customer page: (chosen) restyle the api's plain HTML; rejected: moving it into the Next app (a heavier page on a slow
  phone, a new public route, no gain for the customer).
