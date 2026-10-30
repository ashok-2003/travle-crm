// The page a customer sees at /p/<token> for a shared quote (step 3, P0): the agency's name, the trip, its day-by-day
// plan, the price with GST, what is due and when, a button that opens their UPI app to pay the agency, and Accept with
// their name. Plain HTML with the device's fonts and no script; the only form posts back to the same link.
import { brand } from "@travel-crm/brand";
import type { PublicTrip } from "@travel-crm/domain/bookings";
import type { PublicQuote } from "@travel-crm/domain/quotes";
import { randomBytes } from "node:crypto";
import { dayOf, escapeHtml, paragraphs, rupees, securityHeaders, styles, SYSTEM_FONTS } from "./public-html.js";
import type { ShareLinkView } from "./share-link-route.js";
import { claimForm } from "./trip-forms.js";
import { uploadScript } from "./trip-upload-script.js";

/** Why an acceptance wasn't recorded, from the quote as it stands now. */
function refusalWords(quote: PublicQuote, agencyName: string): string {
  if (quote.status === "declined") return `${agencyName} marked this quote as declined. Ask them to send a new one.`;
  if (quote.status === "replaced")
    return `${agencyName} replaced this quote with a new version. Ask them for the new link.`;
  return `This quote can't be accepted right now. Ask ${agencyName} to check it.`;
}

/** What a booking made from the quote adds to its page: "I've paid" while the agency has yet to confirm it. */
export interface QuotePageExtras {
  trip: PublicTrip | null;
  storageOrigin: string | null;
}

export function quotePage(
  quote: PublicQuote,
  agencyName: string,
  view: ShareLinkView,
  extras: QuotePageExtras = { trip: null, storageOrigin: null },
): Response {
  const { notice } = view;
  if (quote.status === "replaced") return replacedPage(quote, agencyName);
  const accepted = quote.status === "accepted";
  const travellers = [
    quote.adults > 0 ? `${String(quote.adults)} adult${quote.adults === 1 ? "" : "s"}` : "",
    quote.children > 0 ? `${String(quote.children)} child${quote.children === 1 ? "" : "ren"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const days = quote.days
    .map(
      (day, index) =>
        `<li><strong>Day ${String(index + 1)}: ${escapeHtml(day.title)}</strong>${day.description === "" ? "" : `<p>${paragraphs(day.description)}</p>`}</li>`,
    )
    .join("");
  const items = quote.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.description)}${item.detail === "" ? "" : `<small>${escapeHtml(item.detail)}</small>`}<small>${String(item.quantity)} × ${rupees(item.unitPricePaise)}</small></td><td class="n">${rupees(item.amountPaise)}</td></tr>`,
    )
    .join("");
  const dues = quote.installments
    .map(
      (due) =>
        `<tr><td>${escapeHtml(due.label)}<small>By ${dayOf(due.dueOn)}</small></td><td class="n">${rupees(due.amountPaise)}${due.paid ? "<small>Paid</small>" : ""}</td></tr>`,
    )
    .join("");
  // The options sent for the same enquiry, when there is more than one to choose from.
  const open = quote.options.filter((option) => option.status === "sent" || option.current);
  const choices = !accepted && open.length > 1;
  const optionList =
    quote.options.length > 1
      ? `<section><h2>Your options</h2><table><tbody>${quote.options.map((option) => `<tr><td>${escapeHtml(option.title)}${option.current ? "<small>Shown below</small>" : ""}${option.status === "accepted" ? "<small>Accepted</small>" : ""}</td><td class="n">${rupees(option.totalPaise)}</td></tr>`).join("")}</tbody></table></section>`
      : "";
  const section = (heading: string, body: string) =>
    body === "" ? "" : `<section><h2>${heading}</h2>${body}</section>`;
  const pay =
    quote.payLink === null || quote.balancePaise === 0
      ? ""
      : `<section class="pay"><h2>Pay ${rupees(quote.payPaise)}</h2><a class="button" href="${escapeHtml(quote.payLink)}">Pay by UPI</a><p>Or pay to UPI id <strong>${escapeHtml(quote.upiId)}</strong>. The money goes straight to ${escapeHtml(agencyName)}.</p></section>`;
  const accept = accepted
    ? `<section class="done"><h2>Accepted${quote.acceptedName === null ? "" : ` by ${escapeHtml(quote.acceptedName)}`}</h2><p>Thank you. ${escapeHtml(agencyName)} will be in touch about your booking.</p></section>`
    : quote.status === "declined"
      ? ""
      : `<section><h2>${choices ? "Choose and accept" : "Accept this quote"}</h2><form method="post">${choices ? `<fieldset class="options"><legend>Which option?</legend>${open.map((option) => `<label class="tick"><input type="radio" name="option" value="${escapeHtml(option.quoteId)}"${option.current ? " checked" : ""} required> ${escapeHtml(option.title)} · ${rupees(option.totalPaise)}</label>`).join("")}</fieldset>` : ""}<label for="name">Your name</label><input id="name" name="name" required maxlength="120" autocomplete="name"><label class="tick"><input type="checkbox" name="agree" value="yes" required> I agree to the terms and cancellation policy</label><label class="tick"><input type="checkbox" name="tripUpdates" value="yes"> Send me trip updates on WhatsApp</label><button type="submit" class="button">Accept quote</button></form></section>`;
  // A booking the agency has yet to confirm: the traveller may already say they paid.
  const claiming = extras.trip !== null && extras.trip.status === "requested" && accepted;
  const pendingClaims = extras.trip?.claims.filter((claim) => claim.status === "pending") ?? [];
  const claim = !claiming
    ? ""
    : `<section><h2>Already paid?</h2>${pendingClaims.length > 0 ? "<p><strong>Payment being verified</strong></p>" : ""}${claimForm({ key: "quote", label: "I've paid", installmentId: null, amountPaise: quote.payPaise > 0 ? quote.payPaise : quote.balancePaise })}</section>`;
  const nonce = randomBytes(16).toString("base64url");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(quote.title)} · ${escapeHtml(agencyName)}</title>
<style>${styles()}</style>
</head>
<body><main>
<header><p>${escapeHtml(agencyName)} · Quote for ${escapeHtml(quote.customerName)}</p><h1>${escapeHtml(quote.title)}</h1>
<p>${[quote.startDate === null ? "" : `From ${dayOf(quote.startDate)}`, escapeHtml(travellers)].filter(Boolean).join(" · ")}</p></header>
${notice === "accepted" ? `<section class="notice"><h2>Thank you, your acceptance is recorded</h2></section>` : ""}
${notice === "claimed" ? `<section class="notice"><h2>Thank you, we'll check your payment</h2><p>${escapeHtml(agencyName)} will mark it received once it shows in their account.</p></section>` : ""}
${notice === "refused" && view.why?.startsWith("CLAIM") === true ? `<section class="notice"><h2>That didn't go through</h2><p>Check the amount and add your UPI reference or a screenshot, then try again.</p></section>` : notice === "refused" ? `<section class="notice"><h2>We couldn't record your acceptance</h2><p>${escapeHtml(refusalWords(quote, agencyName))}</p></section>` : ""}
${optionList}
${section("Your trip, day by day", days === "" ? "" : `<ol>${days}</ol>`)}
${section("Price", `<table><tbody>${items}<tr><td>Subtotal</td><td class="n">${rupees(quote.subtotalPaise)}</td></tr>${quote.taxPaise > 0 ? `<tr><td>GST ${String(quote.taxRateBasisPoints / 100)}%</td><td class="n">${rupees(quote.taxPaise)}</td></tr>` : ""}</tbody><tfoot><tr><td>Total</td><td class="n">${rupees(quote.totalPaise)}</td></tr>${quote.paidPaise > 0 ? `<tr><td>Paid</td><td class="n">${rupees(quote.paidPaise)}</td></tr><tr><td>Balance</td><td class="n">${rupees(quote.balancePaise)}</td></tr>` : ""}</tfoot></table>`)}
${section("Payments due", dues === "" ? "" : `<table><tbody>${dues}</tbody></table>`)}
${pay}
${section("Inclusions", quote.inclusions === "" ? "" : `<p>${paragraphs(quote.inclusions)}</p>`)}
${section("Exclusions", quote.exclusions === "" ? "" : `<p>${paragraphs(quote.exclusions)}</p>`)}
${section("Notes", quote.notes === "" ? "" : `<p>${paragraphs(quote.notes)}</p>`)}
${section("Terms", quote.terms === "" ? "" : `<p>${paragraphs(quote.terms)}</p>`)}
${accept}
${claim}
</main>${claiming ? `<script nonce="${nonce}">${uploadScript}</script>` : ""}</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: securityHeaders({ forms: true, ...(claiming ? { nonce, storageOrigin: extras.storageOrigin } : {}) }),
  });
}

/** A replaced quote's link says so and shows nothing of the old prices. */
function replacedPage(quote: PublicQuote, agencyName: string): Response {
  const { colours } = brand;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(quote.title)} · ${escapeHtml(agencyName)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colours.canvas};color:${colours.ink};font-family:${SYSTEM_FONTS}}
main{max-width:28rem;padding:2rem 1.5rem}
h1{font-weight:500;font-size:1.6rem;margin:0 0 .5rem}
p{color:${colours.muted};line-height:1.5;margin:0}
</style>
</head>
<body><main><h1>This quote was replaced</h1><p>${escapeHtml(agencyName)} made a new version of "${escapeHtml(quote.title)}". Ask them for its link.</p></main></body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
