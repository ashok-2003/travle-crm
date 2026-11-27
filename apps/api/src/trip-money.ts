// The money on the trip page (release 6; in the app's look since 2026-11-27): the booking's state as a pill, what is paid
// of the total with a bar, the next payment with the ways to pay it, and each payment due with its state and "I've paid".
// Whole rupees throughout; the UPI link's amount is the domain's, to the paisa.
import type { PublicTrip } from "@travel-crm/domain/bookings";
import {
  amount,
  bottomBar,
  card,
  dayIn,
  dayOf,
  escapeHtml,
  paragraphs,
  payByUpi,
  pill,
  progress,
  wholeRupees,
} from "./public-html.js";
import { claimForm } from "./trip-forms.js";

type Due = PublicTrip["installments"][number];

/** Not paid, and due before the agency's today (a payment due today is not yet overdue). */
const isOverdue = (trip: PublicTrip, due: Due) => !due.paid && due.dueOn < trip.today;

/** Something is left to pay on a booking that goes ahead. */
const owing = (trip: PublicTrip) => trip.status === "confirmed" && trip.balancePaise > 0;

/** Where the booking stands: Confirmed, Part paid, Paid in full or Cancelled; Trip completed once it is over. */
export function statusPill(trip: PublicTrip): string {
  if (trip.status === "cancelled") return pill("bad", "Cancelled");
  if (trip.status === "completed") return pill("good", "Trip completed");
  if (trip.status === "requested") return pill("attention", "Waiting for confirmation");
  if (trip.totalPaise > 0 && trip.balancePaise === 0) return pill("good", "Paid in full");
  return trip.paidPaise > 0 ? pill("attention", "Part paid") : pill("good", "Confirmed");
}

/** What is paid of the total, with a bar, and the payments being checked; a cancelled booking says so instead. */
export function standing(trip: PublicTrip): string {
  if (trip.status === "cancelled") {
    return trip.cancellation === null
      ? ""
      : card(
          "Your booking",
          `<p>This booking was cancelled on ${dayOf(trip.cancellation.cancelledOn)}. The cancellation charge is ${amount(trip.cancellation.chargePaise)}.</p>`,
        );
  }
  const pending = trip.claims.filter((claim) => claim.status === "pending").length;
  const verifying =
    pending === 0
      ? ""
      : `<p class="row">${pill("attention", "Payment being verified")}</p><p class="hint">${pending === 1 ? "Your payment" : "Your payments"} will be marked received once your agent has checked.</p>`;
  const paid =
    trip.totalPaise === 0
      ? ""
      : `<p class="paid-of"><span class="amount money">${wholeRupees(trip.paidPaise)}</span> of ${amount(trip.totalPaise)} paid</p>${progress(trip.paidPaise, trip.totalPaise)}`;
  return card("Your booking", `${paid}${verifying}`);
}

/** The next payment: how much and by when, Pay by UPI (the QR once the UPI id is verified), and the bank's details. */
export function nextPayment(trip: PublicTrip, agencyName: string): string {
  if (!owing(trip)) return "";
  const next = trip.installments.find((due) => !due.paid);
  const when =
    next === undefined
      ? ""
      : `<p>${escapeHtml(next.label)}, by ${dayIn(next.dueOn, trip.today)}${isOverdue(trip, next) ? ` ${pill("bad", "Overdue")}` : ""}</p>`;
  const upi =
    trip.payLink === null
      ? ""
      : payByUpi({
          payLink: trip.payLink,
          upiId: trip.upiId,
          upiVerified: trip.upiVerified,
          payPaise: trip.payPaise,
          agencyName,
        });
  const bank = trip.bankDetails === "" ? "" : `<h3>Bank transfer</h3><p>${paragraphs(trip.bankDetails)}</p>`;
  return card("Next payment", `<p class="total">${wholeRupees(trip.payPaise)}</p>${when}${upi}${bank}`);
}

/** A phone's bar pays the next payment by UPI while one is due. */
export const payBar = (trip: PublicTrip) =>
  owing(trip) && trip.payLink !== null
    ? bottomBar({ href: trip.payLink, words: `Pay ${wholeRupees(trip.payPaise)}` })
    : "";

const claimWords = {
  pending: pill("attention", "Payment being verified"),
  confirmed: pill("good", "Received"),
  rejected: pill("bad", "We couldn't match this payment"),
};

/** Each payment due with its state and "I've paid", what was received, and the payments the traveller told us about. */
export function payments(trip: PublicTrip, talk: string): string {
  if (trip.status === "cancelled") return "";
  const dues = trip.installments
    .map((due) => {
      const day = dayIn(due.dueOn, trip.today);
      const state = due.paid
        ? pill("good", "Paid")
        : isOverdue(trip, due)
          ? `${pill("bad", "Overdue")}<span class="hint">Due ${day}</span>`
          : pill("attention", `Due ${day}`);
      const form =
        due.paid || trip.status !== "confirmed"
          ? ""
          : claimForm({
              key: due.id.slice(0, 8),
              label: "I've paid",
              about: due.label,
              installmentId: due.id,
              amountPaise: due.amountPaise,
            });
      return `<li class="due"><strong>${escapeHtml(due.label)}</strong>${amount(due.amountPaise)}${state}${form}</li>`;
    })
    .join("");
  const received = trip.payments
    .map(
      (payment) =>
        `<tr><td>Received ${dayOf(payment.receivedOn)}</td><td class="n money">${wholeRupees(payment.amountPaise)}</td></tr>`,
    )
    .join("");
  const claims = trip.claims
    .map(
      (claim) =>
        `<tr><td>${claimWords[claim.status]}<small>${dayOf(claim.createdAt.slice(0, 10))}</small></td><td class="n">${wholeRupees(claim.amountPaise)}</td></tr>`,
    )
    .join("");
  const anyRejected = trip.claims.some((claim) => claim.status === "rejected");
  const freeForm =
    trip.installments.length === 0 && owing(trip)
      ? claimForm({ key: "any", label: "I've paid", installmentId: null, amountPaise: trip.payPaise })
      : "";
  return card(
    "Payments",
    `${dues === "" ? "" : `<ul class="dues">${dues}</ul>`}${received === "" ? "" : `<table class="received"><tbody>${received}</tbody></table>`}${freeForm}${claims === "" ? "" : `<h3>Payments you told us about</h3><table><tbody>${claims}</tbody></table>`}${anyRejected ? `<p>We couldn't match one payment. Please contact us.</p><div class="row">${talk}</div>` : ""}`,
  );
}
