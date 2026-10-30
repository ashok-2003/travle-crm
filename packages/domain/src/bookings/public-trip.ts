// A booking as its traveller sees it at /p/<token> (spec 2.3): the trip page. The same link as the quote: it shows the quote
// until the agency confirms the booking, then the trip, then the feedback form once asked for. Status and the next payment,
// the plan with dates, hotels, vouchers and tickets, payments with "I've paid", each traveller's details, the driver and
// where to report, the packing list, the cancellation terms and the trip PDF. Never an ID number or photo (only "details
// received"), never a margin or a cost.
import type { Essentials, Policy, TravellerLevel } from "@travel-crm/contracts/bookings";
import { quoteDay } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { addDays, calendarDateIn, parseCalendarDate } from "../kernel/index.js";
import { coveredInstallments, quoteSettingsOf, upiPayLink } from "../quotes/index.js";
import { snapshotOf } from "./policy.js";
import { dayOf, findBookingForSystem, paidOnQuote } from "./rows.js";
import { bookingSettingsOf, currentPolicy } from "./settings.js";
import { detailsCutoffOf } from "./travellers.js";

export const BOOKING_VOUCHER_RECORD_TYPE = "booking_voucher";

export interface PublicTrip {
  bookingId: string;
  number: string;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  title: string;
  customerName: string;
  startDate: string | null;
  endDate: string | null;
  adults: number;
  children: number;
  days: { title: string; description: string; date: string | null }[];
  stays: {
    name: string;
    address: string;
    mapUrl: string;
    checkIn: string;
    checkOut: string;
    notes: string;
    voucherDocumentId: string | null;
  }[];
  /** Tickets and other files the agency uploaded for the trip. */
  files: { id: string; fileName: string }[];
  tripPdfDocumentId: string | null;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  installments: { id: string; label: string; amountPaise: number; dueOn: string; paid: boolean }[];
  payments: { amountPaise: number; receivedOn: string }[];
  upiId: string;
  payLink: string | null;
  payPaise: number;
  bankDetails: string;
  claims: {
    id: string;
    amountPaise: number;
    status: "pending" | "confirmed" | "rejected";
    rejectReason: string | null;
    createdAt: string;
  }[];
  travellers: {
    id: string;
    position: number;
    name: string;
    dateOfBirth: string | null;
    gender: string | null;
    phone: string;
    emergencyName: string;
    emergencyPhone: string;
    medicalNotes: string;
    complete: boolean;
    hasIdentity: boolean;
  }[];
  level: TravellerLevel;
  detailsLocked: boolean;
  detailsCutoffOn: string | null;
  essentials: Essentials;
  packingList: string;
  policy: Policy;
  cancellation: { cancelledOn: string; chargePaise: number } | null;
  feedback: { asked: boolean; sent: boolean; googleReviewUrl: string };
}

/** The live booking behind a quote's link, as its traveller sees it; null when the quote has none. */
export async function publicTripOf(tx: OrgTx, quoteId: string, now: Date): Promise<PublicTrip | null> {
  const found = await tx.booking.findFirst({ where: { quoteId }, select: { id: true } });
  if (found === null) return null;
  const booking = await findBookingForSystem(tx, found.id);
  const [settings, quoteSettings, paidPaise, dues, payments, stays, travellers, identities, claims, feedback, files] =
    await Promise.all([
      bookingSettingsOf(tx),
      quoteSettingsOf(tx),
      paidOnQuote(tx, booking.quoteId),
      tx.quoteInstallment.findMany({
        where: { quoteId: booking.quoteId },
        orderBy: { dueOn: "asc" },
        select: { id: true, label: true, amountPaise: true, dueOn: true },
      }),
      tx.quotePayment.findMany({
        where: { quoteId: booking.quoteId, voidedAt: null },
        orderBy: { receivedOn: "asc" },
        select: { amountPaise: true, receivedOn: true },
      }),
      tx.bookingStay.findMany({ where: { bookingId: booking.id }, orderBy: { position: "asc" } }),
      tx.bookingTraveller.findMany({ where: { bookingId: booking.id }, orderBy: { position: "asc" } }),
      tx.bookingTravellerIdentity.findMany({
        where: { traveller: { bookingId: booking.id } },
        select: { travellerId: true },
      }),
      tx.paymentClaim.findMany({ where: { bookingId: booking.id }, orderBy: { id: "desc" }, take: 5 }),
      tx.bookingFeedback.count({ where: { bookingId: booking.id } }),
      tx.attachment.findMany({
        where: { recordType: BOOKING_VOUCHER_RECORD_TYPE, recordId: booking.id, status: "ready" },
        orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
        select: { id: true, fileName: true },
      }),
    ]);
  const timeZone = await organizationTimeZone(tx, booking.organizationId);
  const cutoff = await detailsCutoffOf(tx, booking);
  const total = booking.status === "cancelled" ? Number(booking.chargePaise ?? 0n) : Number(booking.quote.totalPaise);
  const balancePaise = Math.max(0, total - paidPaise);
  const installments = coveredInstallments(
    dues.map((due) => ({
      id: due.id,
      label: due.label,
      amountPaise: Number(due.amountPaise),
      dueOn: dayOf(due.dueOn),
    })),
    paidPaise,
  );
  // What to pay now: the next payment due not yet covered, as much of it as is left; else the balance.
  let left = paidPaise;
  let payPaise = balancePaise;
  for (const due of installments) {
    if (left >= due.amountPaise) {
      left -= due.amountPaise;
      continue;
    }
    payPaise = Math.min(balancePaise, due.amountPaise - left);
    break;
  }
  const plan = quoteDay.array().catch([]).parse(booking.quote.days);
  const start = booking.startDate === null ? null : parseCalendarDate(dayOf(booking.startDate));
  const policy = snapshotOf(booking.policySnapshot) ?? (await currentPolicy(tx));
  return {
    bookingId: booking.id,
    number: booking.number,
    status: booking.status as PublicTrip["status"],
    title: booking.quote.title,
    customerName: booking.lead.person.name,
    startDate: start,
    endDate: booking.endDate === null ? null : dayOf(booking.endDate),
    adults: booking.quote.adults,
    children: booking.quote.children,
    days: plan.map((day, index) => ({ ...day, date: start === null ? null : addDays(start, index) })),
    stays: stays.map((stay) => ({
      name: stay.name,
      address: stay.address,
      mapUrl: stay.mapUrl,
      checkIn: dayOf(stay.checkIn),
      checkOut: dayOf(stay.checkOut),
      notes: stay.notes,
      voucherDocumentId: stay.voucherDocumentId,
    })),
    files,
    tripPdfDocumentId: booking.tripPdfDocumentId,
    totalPaise: total,
    paidPaise,
    balancePaise,
    installments,
    payments: payments.map((payment) => ({
      amountPaise: Number(payment.amountPaise),
      receivedOn: dayOf(payment.receivedOn),
    })),
    upiId: quoteSettings.upiId,
    payLink:
      booking.status === "cancelled"
        ? null
        : upiPayLink(quoteSettings, { amountPaise: payPaise, note: booking.quote.title }),
    payPaise,
    bankDetails: settings.bankDetails,
    claims: claims.map((claim) => ({
      id: claim.id,
      amountPaise: Number(claim.amountPaise),
      status: claim.status as "pending" | "confirmed" | "rejected",
      rejectReason: claim.rejectReason,
      createdAt: claim.createdAt.toISOString(),
    })),
    travellers: travellers.map((row) => ({
      id: row.id,
      position: row.position,
      name: row.name,
      dateOfBirth: row.dateOfBirth === null ? null : dayOf(row.dateOfBirth),
      gender: row.gender,
      phone: row.phone,
      emergencyName: row.emergencyName,
      emergencyPhone: row.emergencyPhone,
      medicalNotes: row.medicalNotes,
      complete: row.completeAt !== null,
      hasIdentity: identities.some((identity) => identity.travellerId === row.id),
    })),
    level: booking.level as TravellerLevel,
    detailsLocked: booking.status === "completed" || (cutoff !== null && calendarDateIn(now, timeZone) > cutoff),
    detailsCutoffOn: cutoff,
    essentials: {
      reportingTime: booking.reportingTime,
      reportingPlace: booking.reportingPlace,
      driverName: booking.driverName,
      driverPhone: booking.driverPhone,
      emergencyName: booking.emergencyName,
      emergencyPhone: booking.emergencyPhone,
    },
    packingList: settings.packingList,
    policy,
    cancellation:
      booking.cancelledAt === null
        ? null
        : { cancelledOn: dayOf(booking.cancelledAt), chargePaise: Number(booking.chargePaise ?? 0n) },
    feedback: {
      asked: booking.feedbackRequestedAt !== null,
      sent: feedback > 0,
      googleReviewUrl: settings.googleReviewUrl,
    },
  };
}

/** A document of the booking the traveller may download: its itinerary or one of its vouchers; false for any other. */
export async function isTripDocument(tx: OrgTx, quoteId: string, documentId: string): Promise<boolean> {
  const booking = await tx.booking.findFirst({
    where: {
      quoteId,
      status: { not: "requested" },
      OR: [{ tripPdfDocumentId: documentId }, { stays: { some: { voucherDocumentId: documentId } } }],
    },
    select: { id: true },
  });
  return booking !== null;
}

/** A file of the booking the traveller may download: a ticket the agency uploaded for the trip. */
export async function isTripFile(tx: OrgTx, quoteId: string, attachmentId: string): Promise<boolean> {
  const booking = await tx.booking.findFirst({
    where: { quoteId, status: { not: "requested" } },
    select: { id: true },
  });
  if (booking === null) return false;
  const file = await tx.attachment.findFirst({
    where: { id: attachmentId, recordType: BOOKING_VOUCHER_RECORD_TYPE, recordId: booking.id, status: "ready" },
    select: { id: true },
  });
  return file !== null;
}
