// The trip page at /p/<token> (release 6): the quote's link once the agency has confirmed the booking, in the app's look
// (public-html.ts). In the order a phone reads it: the trip and its status, where the money stands and the next payment
// (trip-money.ts), the plan with its days, the hotels, the vouchers and tickets, the payments with "I've paid", each
// traveller's details, who to meet and where, the packing list, the cancellation terms (folded) and the trip PDF, then the
// feedback form once asked for, and the ways to reach the agency: Talk to and WhatsApp us (its main WhatsApp number). On a
// phone, a bar at the foot pays what is due. It never shows an ID number or photo back ("Details received"), and never a
// margin or a cost. A cancelled booking shows a plain notice, the terms and the ways to reach the agency.
import type { PublicTrip } from "@travel-crm/domain/bookings";
import { randomBytes } from "node:crypto";
import { feedbackForm, travellerForm } from "./trip-forms.js";
import { nextPayment, payBar, payments, standing, statusPill } from "./trip-money.js";
import { uploadScript } from "./trip-upload-script.js";
import {
  card,
  dayBoxes,
  dayOf,
  document,
  escapeHtml,
  pageHeader,
  paragraphs,
  pill,
  safeLink,
  securityHeaders,
  shortDayOf,
  whatsappUs,
} from "./public-html.js";
import type { ShareLinkView } from "./share-link-route.js";

export interface TripPageContext {
  agencyName: string;
  /** The agent to talk to: the agency's contact name and number (the business details). */
  contact: { name: string | null; phone: string | null };
  /** The agency's main WhatsApp number for "WhatsApp us", E.164; null when it has none past being set up. */
  whatsapp: string | null;
  view: ShareLinkView;
  /** The bucket's origin, which the page's script may send pictures to. */
  storageOrigin: string | null;
}

/** The trip page's own parts: payment rows, lists split by hairlines, travellers' rows and the feedback's stars. */
const tripStyles = `
.paid-of{margin:0}
.dues{list-style:none;padding:0;margin:0}
.due{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.375rem 1rem;padding:.875rem 0;border-top:1px solid var(--hairline)}
.due:first-child{border-top:0;padding-top:0}
.due>.amount{justify-self:end}
.due>.pill{justify-self:start}
.due>.hint{text-align:right;font-size:.875rem}
.due>details{grid-column:1/-1}
.received{margin-top:.75rem;border-top:1px solid var(--hairline)}
.items>li{padding:.875rem 0;border-top:1px solid var(--hairline)}
.items>li:first-child{border-top:0;padding-top:0}
.items>li:last-child{padding-bottom:0}
.items p{margin:.25rem 0 0}
.items>li>a{display:inline-flex;align-items:center;min-height:44px}
.items>li.locked{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;justify-content:space-between}
.items>li:has(>details.traveller){padding:0}
details.traveller>summary{flex-wrap:wrap;padding:.375rem 0;font-weight:500}
details.traveller>summary .who{font-weight:600}
details.traveller[open]>summary{margin-bottom:-.5rem}
details.traveller form{padding-bottom:1.25rem}
.meet p{margin:0 0 .5rem}
.stars{display:flex;gap:.5rem;flex-wrap:wrap}
.stars label{position:relative;margin:0;cursor:pointer}
.stars input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.stars span{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 .75rem;border:1px solid var(--input);border-radius:999px;font-weight:500}
.stars input:checked+span{background:var(--ink);border-color:var(--ink);color:var(--canvas)}
.stars input:focus-visible+span{outline:2px solid var(--action);outline-offset:2px}
`;

const REFUSALS: Record<string, string> = {
  DETAILS_LOCKED: "Details can no longer be changed here. Please ask your agent.",
  CLAIM_EXCEEDS_BALANCE: "That is more than is left to pay on this booking.",
  CLAIM_NEEDS_PROOF: "Add your UPI reference or a screenshot, so your agent can find the payment.",
  TOO_MANY_CLAIMS: "Your earlier payments are still being checked. Please wait for them.",
  FEEDBACK_ALREADY_SENT: "Your feedback was already sent. Thank you!",
  FEEDBACK_NOT_ASKED: "Feedback isn't open for this trip yet.",
};

function noticeOf(context: TripPageContext): string {
  const { notice, why } = context.view;
  if (notice === "claimed") {
    return `<section class="notice"><h2>Thank you, we'll check your payment</h2><p>${escapeHtml(context.agencyName)} will mark it received once it shows in their account.</p></section>`;
  }
  if (notice === "saved") return `<section class="notice"><h2>Thank you, your details are saved</h2></section>`;
  if (notice === "feedback") return `<section class="notice"><h2>Thank you for your feedback</h2></section>`;
  if (notice === "refused") {
    const words =
      (why === null ? undefined : REFUSALS[why]) ??
      `We couldn't save that. Check the details and try again, or ask ${context.agencyName}.`;
    return `<section class="notice bad"><h2>That didn't go through</h2><p>${escapeHtml(words)}</p></section>`;
  }
  return "";
}

/** Talk to the agency's contact: a call when it gave a number, else who to ask. */
function talkTo(context: TripPageContext): string {
  const who = context.contact.name ?? context.agencyName;
  return context.contact.phone === null
    ? escapeHtml(who)
    : `<a class="button secondary" href="tel:+${context.contact.phone.replace(/[^\d]/g, "")}">Talk to ${escapeHtml(who)}</a>`;
}

/** The page's last section, the ways to reach the agency: a call and WhatsApp us; none when it has neither to link. */
function questions(context: TripPageContext): string {
  if (context.contact.phone === null && context.whatsapp === null) return "";
  const call = context.contact.phone === null ? "" : talkTo(context);
  return card("Questions?", `<div class="row">${call}${whatsappUs(context.whatsapp)}</div>`);
}

function plan(trip: PublicTrip): string {
  const days = trip.days.map(
    (day, index) =>
      `<li><strong>Day ${String(index + 1)}${day.date === null ? "" : ` · ${shortDayOf(day.date)}`}: ${escapeHtml(day.title)}</strong>${day.description === "" ? "" : `<p>${paragraphs(day.description)}</p>`}</li>`,
  );
  return card("Your trip, day by day", dayBoxes(days));
}

function hotels(trip: PublicTrip, base: string): string {
  const stays = trip.stays
    .map((stay) => {
      const map = safeLink(stay.mapUrl);
      const links = `${map === null ? "" : `<a class="button secondary" href="${map}" rel="noopener noreferrer" target="_blank">Open map</a>`}${stay.voucherDocumentId === null ? "" : `<a class="button secondary" href="${base}/doc/${escapeHtml(stay.voucherDocumentId)}">Hotel voucher</a>`}`;
      return `<li><strong>${escapeHtml(stay.name)}</strong>
<p class="hint">${shortDayOf(stay.checkIn)} to ${shortDayOf(stay.checkOut)}${stay.address === "" ? "" : ` · ${escapeHtml(stay.address)}`}</p>
${stay.notes === "" ? "" : `<p>${paragraphs(stay.notes)}</p>`}${links === "" ? "" : `<div class="row">${links}</div>`}</li>`;
    })
    .join("");
  return card("Where you stay", stays === "" ? "" : `<ul class="plain items">${stays}</ul>`);
}

function documents(trip: PublicTrip, base: string): string {
  const files = trip.files
    .map((file) => `<li><a href="${base}/file/${escapeHtml(file.id)}">${escapeHtml(file.fileName)}</a></li>`)
    .join("");
  const itinerary =
    trip.tripPdfDocumentId === null
      ? ""
      : `<div class="row"><a class="button secondary" href="${base}/doc/${escapeHtml(trip.tripPdfDocumentId)}">Download trip PDF</a></div><p class="hint">Keep it on your phone: it opens without a connection.</p>`;
  return card("Tickets and documents", `${files === "" ? "" : `<ul class="plain items">${files}</ul>`}${itinerary}`);
}

/** Each traveller a row with their state, opening to their form; the first still needed opens by itself. */
function travellers(trip: PublicTrip): string {
  if (trip.travellers.length === 0 || trip.status === "cancelled") return "";
  const done = trip.travellers.filter((traveller) => traveller.complete).length;
  const firstNeeded = trip.travellers.findIndex((traveller) => !traveller.complete);
  const rows = trip.travellers
    .map((traveller, index) => {
      const heading = escapeHtml(traveller.name === "" ? `Traveller ${String(index + 1)}` : traveller.name);
      const state = traveller.complete ? pill("good", "Details received") : pill("attention", "Details needed");
      if (trip.detailsLocked) return `<li class="locked"><span class="who">${heading}</span>${state}</li>`;
      return `<li><details class="fold traveller"${index === firstNeeded ? " open" : ""}><summary><span class="who">${heading}</span>${state}</summary>${travellerForm(trip, index)}</details></li>`;
    })
    .join("");
  const lock = trip.detailsLocked
    ? "Details are locked now. Ask your agent for any change."
    : trip.detailsCutoffOn === null
      ? "Anyone with this link can fill in any traveller."
      : `Fill them in by ${dayOf(trip.detailsCutoffOn)}. Anyone with this link can fill in any traveller.`;
  return card(
    "Travellers' details",
    `<p><strong>${String(done)} of ${String(trip.travellers.length)} done</strong></p><p class="hint">${lock}</p><ul class="plain items">${rows}</ul>`,
  );
}

function meeting(trip: PublicTrip): string {
  const { essentials } = trip;
  const lines = [
    essentials.reportingTime === null && essentials.reportingPlace === ""
      ? ""
      : `<p><strong>Report</strong>${essentials.reportingTime === null ? "" : ` at ${escapeHtml(essentials.reportingTime)}`}${essentials.reportingPlace === "" ? "" : `, ${escapeHtml(essentials.reportingPlace)}`}</p>`,
    essentials.driverName === "" && essentials.driverPhone === ""
      ? ""
      : `<p><strong>Driver or guide</strong> ${escapeHtml(essentials.driverName)} ${essentials.driverPhone === "" ? "" : `<a href="tel:${escapeHtml(essentials.driverPhone.replace(/[^\d+]/g, ""))}">${escapeHtml(essentials.driverPhone)}</a>`}</p>`,
    essentials.emergencyName === "" && essentials.emergencyPhone === ""
      ? ""
      : `<p><strong>Emergency contact</strong> ${escapeHtml(essentials.emergencyName)} ${essentials.emergencyPhone === "" ? "" : `<a href="tel:${escapeHtml(essentials.emergencyPhone.replace(/[^\d+]/g, ""))}">${escapeHtml(essentials.emergencyPhone)}</a>`}</p>`,
  ].join("");
  return card("Who to meet and where", lines, ' class="meet"');
}

/** The cancellation terms, folded; open on a cancelled booking, where they are what the page is about. */
function terms(trip: PublicTrip): string {
  const { rules, notes } = trip.policy;
  const sorted = [...rules].sort((a, b) => b.daysBeforeMin - a.daysBeforeMin);
  const lines = sorted
    .map((rule, index) => {
      const nearer = sorted[index - 1];
      const range =
        nearer === undefined
          ? `${String(rule.daysBeforeMin)} days or more before departure`
          : rule.daysBeforeMin === 0
            ? `Less than ${String(nearer.daysBeforeMin)} days before departure`
            : `${String(rule.daysBeforeMin)} to ${String(nearer.daysBeforeMin - 1)} days before departure`;
      const share =
        rule.chargeBasisPoints % 100 === 0
          ? String(rule.chargeBasisPoints / 100)
          : (rule.chargeBasisPoints / 100).toFixed(2);
      return `<li>${escapeHtml(range)}: ${share}% of the trip total is charged</li>`;
    })
    .join("");
  return `<section class="fold"><details${trip.status === "cancelled" ? " open" : ""}><summary><h2>Cancellation terms</h2></summary><ul class="plain items">${lines}</ul>${notes === "" ? "" : `<p>${paragraphs(notes)}</p>`}<p class="hint">To cancel, ask your agent.</p></details></section>`;
}

function feedback(trip: PublicTrip): string {
  if (!trip.feedback.asked || trip.status === "cancelled") return "";
  const review = safeLink(trip.feedback.googleReviewUrl);
  if (trip.feedback.sent) {
    return card(
      "Your feedback",
      `<p>Thank you for telling us about your trip.</p>${review === null ? "" : `<div class="row"><a class="button" href="${review}" rel="noopener noreferrer" target="_blank">Review us on Google</a></div>`}`,
    );
  }
  return card("How was your trip?", feedbackForm());
}

/** The trip page, or, for a cancelled booking, the notice and the terms. */
export function tripPage(trip: PublicTrip, context: TripPageContext): Response {
  const base = context.view.base;
  const travelling = [
    trip.startDate === null ? "" : `From ${dayOf(trip.startDate)}`,
    `${String(trip.adults)} adult${trip.adults === 1 ? "" : "s"}${trip.children > 0 ? `, ${String(trip.children)} child${trip.children === 1 ? "" : "ren"}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const cancelled = trip.status === "cancelled";
  const header = pageHeader({
    agencyName: context.agencyName,
    for: `Booking ${escapeHtml(trip.number)} for ${escapeHtml(trip.customerName)}`,
    title: trip.title,
    when: travelling,
    status: statusPill(trip),
  });
  const body = `${header}
${noticeOf(context)}
${standing(trip)}
${nextPayment(trip, context.agencyName)}
${cancelled ? "" : plan(trip) + hotels(trip, base) + documents(trip, base)}
${payments(trip, talkTo(context))}
${travellers(trip)}
${cancelled ? "" : meeting(trip)}
${cancelled ? "" : card("Pack for the trip", trip.packingList === "" ? "" : `<p>${paragraphs(trip.packingList)}</p>`)}
${terms(trip)}
${cancelled ? "" : feedback(trip)}
${questions(context)}`;
  const nonce = randomBytes(16).toString("base64url");
  const withScript = !cancelled;
  const html = document({
    title: trip.title,
    agencyName: context.agencyName,
    body,
    styles: tripStyles,
    bar: payBar(trip),
    ...(withScript ? { script: { nonce, code: uploadScript } } : {}),
  });
  return new Response(html, {
    status: 200,
    headers: securityHeaders({ forms: true, ...(withScript ? { nonce, storageOrigin: context.storageOrigin } : {}) }),
  });
}
