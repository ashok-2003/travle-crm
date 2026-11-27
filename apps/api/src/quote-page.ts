// The page a customer sees at /p/<token> for a shared quote (step 3, P0): the agency's name, the trip, its day-by-day
// plan, the price with GST, what is due and when, a button that opens their UPI app to pay the agency, Accept with their
// name, and WhatsApp us (the agency's main WhatsApp number). Plain HTML in the app's look (public-html.ts) and no
// script; the only form posts back to the same link. On a phone, a bar at the foot holds Accept quote, then Pay.
import { pointsOf } from "@travel-crm/contracts/quotes";
import type { PublicTrip } from "@travel-crm/domain/bookings";
import { formatDayWithYear, parseCalendarDate } from "@travel-crm/domain/kernel";
import { ACCEPT_SMALL_PRINT, gstLabel, wholeRupeePrice, type PublicQuote } from "@travel-crm/domain/quotes";
import { randomBytes } from "node:crypto";
import {
  bottomBar,
  card,
  dayBoxes,
  dayOf,
  document,
  escapeHtml,
  pageHeader,
  paragraphs,
  payByUpi,
  pill,
  securityHeaders,
  wholeRupees,
  whatsappUs,
} from "./public-html.js";
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
  /** The agency's main WhatsApp number for "WhatsApp us", E.164; null when it has none past being set up. */
  whatsapp: string | null;
}

const list = (className: string, text: string) =>
  `<ul class="${className}">${pointsOf(text)
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join("")}</ul>`;

/** The quote's own parts: inclusions ticked in green, exclusions crossed in plain muted ink, the small print. */
const quoteStyles = `
ul.ticks,ul.crosses{list-style:none;padding:0;margin:0}
ul.ticks li,ul.crosses li{display:flex;gap:.6rem;margin:0 0 .5rem}
ul.ticks li::before{content:"\\2713";color:var(--good-ink);background:var(--good-fill);font-weight:700;border-radius:999px;flex:none;width:1.4rem;height:1.4rem;line-height:1.4rem;text-align:center}
ul.crosses li::before{content:"\\2715";color:var(--muted);font-weight:700;flex:none;width:1.4rem;height:1.4rem;line-height:1.4rem;text-align:center}
ul.points{margin:0;padding-left:1.2rem}ul.points li{margin-bottom:.375rem}
.lines{margin-bottom:.25rem}
.paid,.dues{margin-top:1rem;border-top:1px solid var(--hairline)}
.fine{font-size:.875rem;color:var(--muted);margin:1.25rem 0 0}
`;

/** The quote's state as a pill: waiting on the customer, accepted or declined. */
function statusPill(quote: PublicQuote): string {
  if (quote.status === "accepted") return pill("good", "Accepted");
  if (quote.status === "declined") return pill("bad", "Declined");
  if (quote.status === "sent") return pill("attention", "Awaiting your reply");
  return "";
}

export function quotePage(
  quote: PublicQuote,
  agencyName: string,
  view: ShareLinkView,
  extras: QuotePageExtras = { trip: null, storageOrigin: null, whatsapp: null },
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
  const days = quote.days.map(
    (day, index) =>
      `<li><strong>Day ${String(index + 1)}: ${escapeHtml(day.title)}</strong>${day.description === "" ? "" : `<p>${paragraphs(day.description)}</p>`}</li>`,
  );
  // Whole rupees, each line rounded, then one GST row that makes the rows add up to the total.
  const price = wholeRupeePrice(
    quote.items.map((item) => item.amountPaise),
    quote.totalPaise,
    quote.taxPaise,
  );
  const lines =
    quote.items
      .map(
        (item, index) =>
          `<tr><td>${escapeHtml(item.description)} × ${String(item.quantity)}${item.detail === "" ? "" : `<small>${escapeHtml(item.detail)}</small>`}</td><td class="n">${wholeRupees(price.linesPaise[index] ?? 0)}</td></tr>`,
      )
      .join("") +
    (price.gstPaise === null
      ? ""
      : `<tr><td>${gstLabel(quote.taxRateBasisPoints)}</td><td class="n">${wholeRupees(price.gstPaise)}</td></tr>`);
  const dues = quote.installments
    .map(
      (due) =>
        `<tr><td>${escapeHtml(due.label)}<small>By ${dayOf(due.dueOn)}</small></td><td class="n">${wholeRupees(due.amountPaise)}${due.paid ? `<br>${pill("good", "Paid")}` : ""}</td></tr>`,
    )
    .join("");
  // The options sent for the same enquiry, when there is more than one to choose from.
  const open = quote.options.filter((option) => option.status === "sent" || option.current);
  const choices = !accepted && open.length > 1;
  const owing = quote.payLink !== null && quote.balancePaise > 0;
  const pay =
    quote.payLink === null || !owing
      ? ""
      : `<h3>Pay ${wholeRupees(quote.payPaise)} now</h3>${payByUpi({ payLink: quote.payLink, upiId: quote.upiId, upiVerified: quote.upiVerified, payPaise: quote.payPaise, agencyName })}`;
  // A booking the agency has yet to confirm: the traveller may already say they paid.
  const claiming = extras.trip !== null && extras.trip.status === "requested" && accepted;
  const pendingClaims = extras.trip?.claims.filter((claim) => claim.status === "pending") ?? [];
  const claim = !claiming
    ? ""
    : `${pendingClaims.length > 0 ? `<p>${pill("attention", "Payment being verified")}</p>` : ""}${claimForm({ key: "quote", label: "Already paid? I've paid", installmentId: null, amountPaise: quote.payPaise > 0 ? quote.payPaise : quote.balancePaise })}`;
  const accept = accepted
    ? `<section id="accept" class="done"><h2>Accepted${quote.acceptedName === null ? "" : ` by ${escapeHtml(quote.acceptedName)}`}</h2><p>Thank you. ${escapeHtml(agencyName)} will be in touch about your booking.</p>${pay}${claim}</section>`
    : quote.status === "declined"
      ? ""
      : `<section id="accept"><h2>${choices ? "Choose and accept" : "Accept this quote"}</h2><form method="post">${choices ? `<fieldset class="options"><legend>Which option?</legend>${open.map((option) => `<label class="tick"><input type="radio" name="option" value="${escapeHtml(option.quoteId)}"${option.current ? " checked" : ""} required> ${escapeHtml(option.title)} · ${wholeRupees(option.totalPaise)}</label>`).join("")}</fieldset>` : ""}<label for="name">Your name</label><input id="name" name="name" required maxlength="120" autocomplete="name"><p class="row"><button type="submit" class="button">Accept quote</button></p></form></section>`;
  // The consent words are one constant, kept in the ledger exactly as shown; the policy's words link to the terms.
  const policy = "terms and cancellation policy";
  const [beforePolicy = "", afterPolicy = ""] = ACCEPT_SMALL_PRINT.split(policy);
  const smallPrint = `<p class="fine">${escapeHtml(beforePolicy)}${quote.terms === "" ? policy : `<a href="#terms">${policy}</a>`}${escapeHtml(afterPolicy)}</p>`;
  const when = [
    quote.startDate === null
      ? ""
      : escapeHtml(formatDayWithYear(parseCalendarDate(quote.startDate), { weekday: true })),
    escapeHtml(travellers),
  ]
    .filter(Boolean)
    .join(" · ");
  const header = pageHeader({
    agencyName,
    forHtml: `To: ${escapeHtml(quote.customerName)}`,
    title: quote.title,
    whenHtml: when,
    statusHtml: statusPill(quote),
  });
  const body = `${header}
${notice === "accepted" ? `<section class="notice"><h2>Thank you, your acceptance is recorded</h2></section>` : ""}
${notice === "claimed" ? `<section class="notice"><h2>Thank you, we'll check your payment</h2><p>${escapeHtml(agencyName)} will mark it received once it shows in their account.</p></section>` : ""}
${notice === "refused" && view.why?.startsWith("CLAIM") === true ? `<section class="notice bad"><h2>That didn't go through</h2><p>Check the amount and add your UPI reference or a screenshot, then try again.</p></section>` : notice === "refused" ? `<section class="notice bad"><h2>We couldn't record your acceptance</h2><p>${escapeHtml(refusalWords(quote, agencyName))}</p></section>` : ""}
${accept}
${choices ? `<p class="hint">Details below are for ${escapeHtml(quote.title)}.</p>` : ""}
${card("Price", `${lines === "" ? "" : `<table class="lines"><tbody>${lines}</tbody></table>`}<p class="total">${wholeRupees(quote.totalPaise)}</p><small>${quote.taxPaise > 0 ? "Total, including GST" : "Total"}</small>${quote.paidPaise > 0 ? `<table class="paid"><tbody><tr><td>Paid</td><td class="n">${wholeRupees(quote.paidPaise)}</td></tr><tr><td>Balance</td><td class="n">${wholeRupees(quote.balancePaise)}</td></tr></tbody></table>` : ""}${dues === "" ? "" : `<table class="dues"><tbody>${dues}</tbody></table>`}`)}
${card("Your trip, day by day", dayBoxes(days))}
${card("Included", pointsOf(quote.inclusions).length === 0 ? "" : list("ticks", quote.inclusions))}
${card("Not included", pointsOf(quote.exclusions).length === 0 ? "" : list("crosses", quote.exclusions))}
${card("Notes", pointsOf(quote.notes).length === 0 ? "" : list("points", quote.notes))}
${card("Terms", quote.terms === "" ? "" : `<p>${paragraphs(quote.terms)}</p>`, ' id="terms"')}
${card("Questions?", extras.whatsapp === null ? "" : `<div class="row">${whatsappUs(extras.whatsapp)}</div>`)}
${accepted || quote.status === "declined" ? "" : smallPrint}`;
  // The phone's one main action: accept while the quote is open, then pay what is due, unless a payment the customer
  // told us about is still being verified (Pay there would invite a second one).
  const bar =
    quote.status === "sent"
      ? bottomBar({ href: "#accept", words: "Accept quote" })
      : accepted && owing && quote.payLink !== null && pendingClaims.length === 0
        ? bottomBar({ href: quote.payLink, words: `Pay ${wholeRupees(quote.payPaise)}` })
        : "";
  const nonce = randomBytes(16).toString("base64url");
  const html = document({
    title: quote.title,
    agencyName,
    body,
    styles: quoteStyles,
    bar,
    ...(claiming ? { script: { nonce, code: uploadScript } } : {}),
  });
  return new Response(html, {
    status: 200,
    headers: securityHeaders({ forms: true, ...(claiming ? { nonce, storageOrigin: extras.storageOrigin } : {}) }),
  });
}

/** A replaced quote's link says so and shows nothing of the old prices. */
function replacedPage(quote: PublicQuote, agencyName: string): Response {
  const html = document({
    title: quote.title,
    agencyName,
    body: `<header><p class="agency">${escapeHtml(agencyName)}</p><h1>This quote was replaced</h1></header><p>${escapeHtml(agencyName)} made a new version of "${escapeHtml(quote.title)}". Ask them for its link.</p>`,
  });
  return new Response(html, { status: 200, headers: securityHeaders({ forms: false }) });
}
