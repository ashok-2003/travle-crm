// The page a customer sees at /p/<token> for a shared quote (step 3, P0): the agency's name, the trip, its day-by-day
// plan, the price with GST, what is due and when, a button that opens their UPI app to pay the agency, and Accept with
// their name. Plain HTML with the device's fonts and no script; the only form posts back to the same link.
import { brand } from "@travel-crm/brand";
import { formatMoney, money } from "@travel-crm/domain/kernel";
import type { PublicQuote } from "@travel-crm/domain/quotes";

const SYSTEM_FONTS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Text and attribute values need these escaped. */
const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rupees = (paise: number) => escapeHtml(formatMoney(money(paise)));
const paragraphs = (text: string) => escapeHtml(text).replaceAll("\n", "<br>");

const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayOf = (day: string) => escapeHtml(dayWords.format(new Date(`${day}T00:00:00Z`)));

export function quotePage(quote: PublicQuote, agencyName: string, notice: "accepted" | null): Response {
  const { colours } = brand;
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
        `<tr><td>${escapeHtml(item.description)}${item.detail === "" ? "" : `<small>${escapeHtml(item.detail)}</small>`}${item.quantity > 1 ? `<small>× ${String(item.quantity)}</small>` : ""}</td><td class="n">${rupees(item.amountPaise)}</td></tr>`,
    )
    .join("");
  const dues = quote.installments
    .map(
      (due) =>
        `<tr><td>${escapeHtml(due.label)}<small>By ${dayOf(due.dueOn)}</small></td><td class="n">${rupees(due.amountPaise)}${due.paid ? "<small>Paid</small>" : ""}</td></tr>`,
    )
    .join("");
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
      : `<section><h2>Accept this quote</h2><form method="post"><label for="name">Your name</label><input id="name" name="name" required maxlength="120" autocomplete="name"><label class="tick"><input type="checkbox" name="agree" value="yes" required> I agree to the terms and cancellation policy</label><button type="submit" class="button">Accept quote</button></form></section>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(quote.title)} · ${escapeHtml(agencyName)}</title>
<style>
body{margin:0;background:${colours.canvas};color:${colours.ink};font-family:${SYSTEM_FONTS};line-height:1.5}
main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem 3rem}
header p{margin:0;color:${colours.muted}}
h1{font-weight:600;font-size:1.6rem;margin:.25rem 0}
h2{font-size:1.1rem;margin:0 0 .5rem}
section{background:${colours.surface};border-radius:12px;padding:1rem;margin-top:1rem}
ol{padding-left:1.2rem;margin:0}li{margin-bottom:.75rem}li p{margin:.25rem 0 0;color:${colours.muted}}
table{width:100%;border-collapse:collapse}td{padding:.5rem 0;vertical-align:top}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
small{display:block;color:${colours.muted}}
tfoot td{font-weight:600}
.button{display:inline-block;background:${colours.action};color:${colours.onAction};border:0;border-radius:999px;padding:.8rem 1.4rem;font-size:1rem;font-weight:600;text-decoration:none;min-height:44px;cursor:pointer}
label{display:block;margin:.5rem 0 .25rem}input[type=text],input:not([type]){width:100%;box-sizing:border-box;padding:.7rem;font-size:1rem;border-radius:8px;border:1px solid ${colours.inputBorder}}
.tick{display:flex;gap:.5rem;align-items:flex-start;margin:1rem 0}
.notice{background:${colours.action};color:${colours.onAction}}
</style>
</head>
<body><main>
<header><p>${escapeHtml(agencyName)} · Quote for ${escapeHtml(quote.customerName)}</p><h1>${escapeHtml(quote.title)}</h1>
<p>${[quote.startDate === null ? "" : `From ${dayOf(quote.startDate)}`, escapeHtml(travellers)].filter(Boolean).join(" · ")}</p></header>
${notice === "accepted" ? `<section class="notice"><h2>Thank you, your acceptance is recorded</h2></section>` : ""}
${section("Your trip, day by day", days === "" ? "" : `<ol>${days}</ol>`)}
${section("Price", `<table><tbody>${items}<tr><td>Subtotal</td><td class="n">${rupees(quote.subtotalPaise)}</td></tr>${quote.taxPaise > 0 ? `<tr><td>GST ${String(quote.taxRateBasisPoints / 100)}%</td><td class="n">${rupees(quote.taxPaise)}</td></tr>` : ""}</tbody><tfoot><tr><td>Total</td><td class="n">${rupees(quote.totalPaise)}</td></tr>${quote.paidPaise > 0 ? `<tr><td>Paid</td><td class="n">${rupees(quote.paidPaise)}</td></tr><tr><td>Balance</td><td class="n">${rupees(quote.balancePaise)}</td></tr>` : ""}</tfoot></table>`)}
${section("Payments due", dues === "" ? "" : `<table><tbody>${dues}</tbody></table>`)}
${pay}
${section("Inclusions", quote.inclusions === "" ? "" : `<p>${paragraphs(quote.inclusions)}</p>`)}
${section("Exclusions", quote.exclusions === "" ? "" : `<p>${paragraphs(quote.exclusions)}</p>`)}
${section("Notes", quote.notes === "" ? "" : `<p>${paragraphs(quote.notes)}</p>`)}
${section("Terms", quote.terms === "" ? "" : `<p>${paragraphs(quote.terms)}</p>`)}
${accept}
</main></body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}
