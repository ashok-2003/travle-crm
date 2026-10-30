// The trip page at /p/<token> (release 6): the quote's link once the agency has confirmed the booking. In the order a phone
// reads it: where the booking stands and the next payment, the plan with its days, the hotels, the vouchers and tickets, the
// payments with "I've paid", each traveller's details, who to meet and where, the packing list, the cancellation terms and
// the trip PDF, then the feedback form once asked for. It never shows an ID number or photo back ("Details received"), and
// never a margin or a cost. A cancelled booking shows a plain notice and the terms.
import type { PublicTrip } from "@travel-crm/domain/bookings";
import { randomBytes } from "node:crypto";
import { claimForm, feedbackForm, travellerForm } from "./trip-forms.js";
import { uploadScript } from "./trip-upload-script.js";
import {
  document,
  dayOf,
  escapeHtml,
  paragraphs,
  rupees,
  safeLink,
  securityHeaders,
  shortDayOf,
} from "./public-html.js";
import type { ShareLinkView } from "./share-link-route.js";

export interface TripPageContext {
  agencyName: string;
  /** The agent to talk to: the agency's contact name and number (the business details). */
  contact: { name: string | null; phone: string | null };
  view: ShareLinkView;
  /** The bucket's origin, which the page's script may send pictures to. */
  storageOrigin: string | null;
}

const section = (heading: string, body: string) => (body === "" ? "" : `<section><h2>${heading}</h2>${body}</section>`);

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
    return `<section class="notice"><h2>That didn't go through</h2><p>${escapeHtml(words)}</p></section>`;
  }
  return "";
}

function talkTo(context: TripPageContext): string {
  const who = context.contact.name ?? context.agencyName;
  if (context.contact.phone === null) return escapeHtml(who);
  const digits = context.contact.phone.replace(/[^\d]/g, "");
  return `<a class="button quiet" href="tel:+${digits}">Talk to ${escapeHtml(who)}</a>`;
}

function statusWords(trip: PublicTrip): string {
  switch (trip.status) {
    case "confirmed":
      return trip.balancePaise === 0 ? "Confirmed and fully paid" : "Confirmed";
    case "completed":
      return "Trip completed";
    case "cancelled":
      return "Cancelled";
    case "requested":
      return "Waiting for confirmation";
  }
}

/** Where the booking stands, and the next payment with the ways to pay it. */
function standing(trip: PublicTrip, context: TripPageContext): string {
  const pending = trip.claims.filter((claim) => claim.status === "pending");
  const next = trip.installments.find((due) => !due.paid);
  const owing = trip.status === "confirmed" && trip.balancePaise > 0;
  const pay = !owing
    ? ""
    : `<p class="status">Next payment ${rupees(trip.payPaise)}${next === undefined ? "" : ` by ${dayOf(next.dueOn)}`}</p>
${trip.payLink === null ? "" : `<div class="row"><a class="button" href="${escapeHtml(trip.payLink)}">Pay by UPI</a></div><p class="hint">Or pay to UPI id <strong>${escapeHtml(trip.upiId)}</strong>. The money goes straight to ${escapeHtml(context.agencyName)}.</p>`}
${trip.bankDetails === "" ? "" : `<h3>Bank transfer</h3><p>${paragraphs(trip.bankDetails)}</p>`}`;
  const verifying =
    pending.length === 0
      ? ""
      : `<p class="status">Payment being verified</p><p class="hint">${pending.length === 1 ? "Your payment" : "Your payments"} will be marked received once your agent has checked.</p>`;
  return section(
    "Your booking",
    `<p class="status">${escapeHtml(statusWords(trip))}</p>${trip.balancePaise > 0 && trip.status !== "cancelled" ? `<p>${rupees(trip.paidPaise)} paid of ${rupees(trip.totalPaise)}</p>` : ""}${pay}${verifying}`,
  );
}

function plan(trip: PublicTrip): string {
  const days = trip.days
    .map(
      (day, index) =>
        `<li><strong>Day ${String(index + 1)}${day.date === null ? "" : ` · ${shortDayOf(day.date)}`}: ${escapeHtml(day.title)}</strong>${day.description === "" ? "" : `<p>${paragraphs(day.description)}</p>`}</li>`,
    )
    .join("");
  return section("Your trip, day by day", days === "" ? "" : `<ol>${days}</ol>`);
}

function hotels(trip: PublicTrip, base: string): string {
  const stays = trip.stays
    .map((stay) => {
      const map = safeLink(stay.mapUrl);
      return `<li><strong>${escapeHtml(stay.name)}</strong>
<p>${shortDayOf(stay.checkIn)} to ${shortDayOf(stay.checkOut)}${stay.address === "" ? "" : ` · ${escapeHtml(stay.address)}`}</p>
${stay.notes === "" ? "" : `<p>${paragraphs(stay.notes)}</p>`}
<div class="row">${map === null ? "" : `<a class="button quiet" href="${map}" rel="noopener noreferrer" target="_blank">Open map</a>`}${stay.voucherDocumentId === null ? "" : `<a class="button quiet" href="${base}/doc/${escapeHtml(stay.voucherDocumentId)}">Hotel voucher</a>`}</div></li>`;
    })
    .join("");
  return section("Where you stay", stays === "" ? "" : `<ul class="plain">${stays}</ul>`);
}

function documents(trip: PublicTrip, base: string): string {
  const files = trip.files
    .map((file) => `<li><a href="${base}/file/${escapeHtml(file.id)}">${escapeHtml(file.fileName)}</a></li>`)
    .join("");
  const itinerary =
    trip.tripPdfDocumentId === null
      ? ""
      : `<div class="row"><a class="button" href="${base}/doc/${escapeHtml(trip.tripPdfDocumentId)}">Download trip PDF</a></div><p class="hint">Keep it on your phone: it opens without a connection.</p>`;
  return section("Tickets and documents", `${files === "" ? "" : `<ul class="plain">${files}</ul>`}${itinerary}`);
}

function payments(trip: PublicTrip, talk: string): string {
  if (trip.status === "cancelled") return "";
  const dues = trip.installments
    .map((due) => {
      const form =
        due.paid || trip.status !== "confirmed"
          ? ""
          : claimForm({
              key: due.id.slice(0, 8),
              label: `I've paid ${due.label}`,
              installmentId: due.id,
              amountPaise: due.amountPaise,
            });
      return `<tr><td>${escapeHtml(due.label)}<small>By ${dayOf(due.dueOn)}</small></td><td class="n">${rupees(due.amountPaise)}${due.paid ? "<small>Paid</small>" : ""}</td></tr>${form === "" ? "" : `<tr><td colspan="2">${form}</td></tr>`}`;
    })
    .join("");
  const received = trip.payments
    .map(
      (payment) =>
        `<tr><td>Received ${dayOf(payment.receivedOn)}</td><td class="n">${rupees(payment.amountPaise)}</td></tr>`,
    )
    .join("");
  const claims = trip.claims
    .map((claim) => {
      const words =
        claim.status === "pending"
          ? "Payment being verified"
          : claim.status === "confirmed"
            ? "Received"
            : "We couldn't match this payment";
      return `<tr><td>${words}<small>${dayOf(claim.createdAt.slice(0, 10))}</small></td><td class="n">${rupees(claim.amountPaise)}</td></tr>`;
    })
    .join("");
  const anyRejected = trip.claims.some((claim) => claim.status === "rejected");
  const freeForm =
    trip.installments.length === 0 && trip.balancePaise > 0 && trip.status === "confirmed"
      ? claimForm({ key: "any", label: "I've paid", installmentId: null, amountPaise: trip.payPaise })
      : "";
  return section(
    "Payments",
    `<table><tbody>${dues}${received}</tbody></table>${freeForm}${claims === "" ? "" : `<h3>Payments you told us about</h3><table><tbody>${claims}</tbody></table>`}${anyRejected ? `<p>We couldn't match one payment. Please contact us.</p><div class="row">${talk}</div>` : ""}`,
  );
}

function travellers(trip: PublicTrip): string {
  if (trip.travellers.length === 0 || trip.status === "cancelled") return "";
  const done = trip.travellers.filter((traveller) => traveller.complete).length;
  const rows = trip.travellers
    .map((traveller, index) => {
      const heading = traveller.name === "" ? `Traveller ${String(index + 1)}` : traveller.name;
      const status = traveller.complete ? "Details received ✓" : "Details needed";
      if (trip.detailsLocked) return `<li><strong>${escapeHtml(heading)}</strong><p>${status}</p></li>`;
      return `<li><details${traveller.complete ? "" : " open"}><summary>${escapeHtml(heading)} · ${status}</summary>${travellerForm(trip, index)}</details></li>`;
    })
    .join("");
  const lock = trip.detailsLocked
    ? "Details are locked now. Ask your agent for any change."
    : trip.detailsCutoffOn === null
      ? "Anyone with this link can fill in any traveller."
      : `Fill them in by ${dayOf(trip.detailsCutoffOn)}. Anyone with this link can fill in any traveller.`;
  return section(
    "Travellers' details",
    `<p class="status">${String(done)} of ${String(trip.travellers.length)} complete</p><p class="hint">${lock}</p><ul class="plain">${rows}</ul>`,
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
  return section("Who to meet and where", lines);
}

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
  const cancelled =
    trip.cancellation === null
      ? ""
      : `<p class="status">This booking was cancelled on ${dayOf(trip.cancellation.cancelledOn)}. The cancellation charge is ${rupees(trip.cancellation.chargePaise)}.</p>`;
  return section(
    "Cancellation terms",
    `${cancelled}<ul class="plain">${lines}</ul>${notes === "" ? "" : `<p>${paragraphs(notes)}</p>`}<p class="hint">To cancel, ask your agent.</p>`,
  );
}

function feedback(trip: PublicTrip): string {
  if (!trip.feedback.asked || trip.status === "cancelled") return "";
  const review = safeLink(trip.feedback.googleReviewUrl);
  if (trip.feedback.sent) {
    return section(
      "Your feedback",
      `<p>Thank you for telling us about your trip.</p>${review === null ? "" : `<div class="row"><a class="button" href="${review}" rel="noopener noreferrer" target="_blank">Review us on Google</a></div>`}`,
    );
  }
  return section("How was your trip?", feedbackForm());
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
  const body = `<header><p>${escapeHtml(context.agencyName)} · Booking ${escapeHtml(trip.number)} for ${escapeHtml(trip.customerName)}</p><h1>${escapeHtml(trip.title)}</h1><p>${travelling}</p></header>
${noticeOf(context)}
${standing(trip, context)}
${cancelled ? "" : plan(trip) + hotels(trip, base) + documents(trip, base)}
${payments(trip, talkTo(context))}
${travellers(trip)}
${cancelled ? "" : meeting(trip)}
${cancelled ? "" : section("Pack for the trip", trip.packingList === "" ? "" : `<p>${paragraphs(trip.packingList)}</p>`)}
${terms(trip)}
${cancelled ? `<section><h2>Questions?</h2><div class="row">${talkTo(context)}</div></section>` : feedback(trip)}`;
  const nonce = randomBytes(16).toString("base64url");
  const withScript = !cancelled;
  const html = document({
    title: trip.title,
    agencyName: context.agencyName,
    body,
    ...(withScript ? { script: { nonce, code: uploadScript } } : {}),
  });
  return new Response(html, {
    status: 200,
    headers: securityHeaders({ forms: true, ...(withScript ? { nonce, storageOrigin: context.storageOrigin } : {}) }),
  });
}
