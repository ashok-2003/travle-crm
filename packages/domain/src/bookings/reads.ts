// Reading bookings for staff (release 6): the list with each booking's money and progress, one booking in full, and a
// lead's bookings in brief. A member sees the bookings of the leads their bookings:view scope reaches (own or all). Money is
// the quote's, read through quote_id; a cancelled booking owes its charge, not the trip's total.
import {
  bookingDetail,
  BOOKINGS_PAGE_SIZE,
  bookingPage,
  type BookingDetail,
  type BookingPage,
  type LeadBooking,
  type ListBookingsInput,
  type TravellerLevel,
} from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { getLead } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { calendarDateIn } from "../kernel/index.js";
import { installmentsOf, paymentStateOf } from "../quotes/index.js";
import { detailsCutoffOf, travellerProgress } from "./travellers.js";
import { snapshotOf } from "./policy.js";
import { dayOf, findBookingInScope, paidOnQuote } from "./rows.js";
import { currentPolicy } from "./settings.js";
import { departureRefOf, owedOf, summariesOf, summaryColumns } from "./summaries.js";
import { tripFingerprint, voucherFingerprint } from "./trip-essentials.js";
import { tripUpdatesAgreed } from "./reminders.js";

function scopeOf(access: MemberAccess) {
  const scope = access.permissions.scopeOf("bookings:view");
  return scope === "own" ? { lead: { ownerUserId: access.userId } } : {};
}

export async function listBookings(tx: OrgTx, access: MemberAccess, input: ListBookingsInput): Promise<BookingPage> {
  const rows = await tx.booking.findMany({
    where: {
      ...scopeOf(access),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.claimsPending === true ? { claims: { some: { status: "pending" } } } : {}),
      ...(input.cursor === undefined ? {} : { id: { lt: input.cursor } }),
    },
    orderBy: { id: "desc" },
    take: BOOKINGS_PAGE_SIZE + 1,
    select: summaryColumns,
  });
  const page = rows.slice(0, BOOKINGS_PAGE_SIZE);
  const today = calendarDateIn(new Date(), await organizationTimeZone(tx, access.organizationId));
  const items = await summariesOf(tx, page, today);
  return bookingPage.parse({ items, nextCursor: rows.length > BOOKINGS_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null });
}

/** The lead's bookings in brief, newest first, for a lead the member may see. */
export async function listLeadBookings(tx: OrgTx, access: MemberAccess, leadId: string): Promise<LeadBooking[]> {
  const lead = await getLead(tx, access, leadId);
  const rows = await tx.booking.findMany({
    where: { leadId: lead.id },
    orderBy: { id: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      quote: { select: { title: true } },
      departure: { select: { id: true, title: true, startDate: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status as LeadBooking["status"],
    title: row.quote.title,
    departure: departureRefOf(row.departure),
  }));
}

export async function getBooking(tx: OrgTx, access: MemberAccess, bookingId: string): Promise<BookingDetail> {
  const booking = await findBookingInScope(tx, access, bookingId);
  const [
    paidPaise,
    progress,
    payments,
    dues,
    stays,
    travellers,
    identities,
    claims,
    reminders,
    refund,
    feedback,
    tripPdf,
  ] = await Promise.all([
    paidOnQuote(tx, booking.quoteId),
    travellerProgress(tx, booking.id),
    tx.quotePayment.findMany({
      where: { quoteId: booking.quoteId, voidedAt: null },
      orderBy: { receivedOn: "asc" },
      select: {
        id: true,
        amountPaise: true,
        receivedOn: true,
        method: true,
        reference: true,
        recordedBy: true,
        receiptDocumentId: true,
      },
    }),
    tx.quoteInstallment.findMany({
      where: { quoteId: booking.quoteId },
      orderBy: { dueOn: "asc" },
      select: { id: true, label: true, amountPaise: true, dueOn: true },
    }),
    tx.bookingStay.findMany({ where: { bookingId }, orderBy: { position: "asc" } }),
    tx.bookingTraveller.findMany({ where: { bookingId }, orderBy: { position: "asc" } }),
    tx.bookingTravellerIdentity.findMany({ where: { traveller: { bookingId } }, select: { travellerId: true } }),
    tx.paymentClaim.findMany({ where: { bookingId }, orderBy: { id: "desc" } }),
    tx.bookingReminder.findMany({ where: { bookingId }, orderBy: [{ sendAt: "asc" }, { id: "asc" }] }),
    tx.bookingRefund.findFirst({ where: { bookingId } }),
    tx.bookingFeedback.findFirst({ where: { bookingId } }),
    booking.tripPdfDocumentId === null
      ? Promise.resolve(null)
      : tx.issuedDocument.findUnique({ where: { id: booking.tripPdfDocumentId }, select: { id: true, number: true } }),
  ]);
  const names = travellers.flatMap((row) => (row.name === "" ? [] : [row.name]));
  const voucherNumbers = await tx.issuedDocument.findMany({
    where: { id: { in: stays.flatMap((stay) => stay.voucherDocumentId ?? []) } },
    select: { id: true, number: true },
  });
  const policy = snapshotOf(booking.policySnapshot) ?? (await currentPolicy(tx));
  const owed = owedOf(booking);
  const stamp = await tripFingerprint(tx, booking);
  const attachmentOf = new Map(
    (
      await tx.attachment.findMany({
        where: { recordType: "payment_claim", recordId: bookingId, status: "ready" },
        select: { id: true },
      })
    ).map((file) => [file.id, file.id]),
  );
  const today = calendarDateIn(new Date(), await organizationTimeZone(tx, access.organizationId));
  // A cancelled booking asks nothing more: no due reads overdue, the page shows its charge and refund instead.
  const installments = installmentsOf(dues, paidPaise, today).map((due) =>
    booking.status === "cancelled" && due.state === "overdue" ? { ...due, state: "due" as const } : due,
  );
  return bookingDetail.parse({
    id: booking.id,
    number: booking.number,
    status: booking.status,
    leadId: booking.leadId,
    quoteId: booking.quoteId,
    customerName: booking.lead.person.name,
    title: booking.quote.title,
    startDate: booking.startDate === null ? null : dayOf(booking.startDate),
    endDate: booking.endDate === null ? null : dayOf(booking.endDate),
    departure: departureRefOf(booking.departure),
    totalPaise: owed,
    paidPaise,
    balancePaise: Math.max(0, owed - paidPaise),
    paymentState: paymentStateOf({
      paidPaise,
      balancePaise: Math.max(0, owed - paidPaise),
      anyOverdue: booking.status !== "cancelled" && installments.some((due) => due.state === "overdue"),
    }),
    travellersTotal: progress.total,
    travellersComplete: progress.complete,
    pendingClaims: claims.filter((claim) => claim.status === "pending").length,
    refundDuePaise: refund?.status === "due" ? Number(refund.amountPaise) : 0,
    level: booking.level as TravellerLevel,
    leadOwnerUserId: booking.lead.ownerUserId,
    customerPhone: booking.lead.person.phoneE164,
    essentials: {
      reportingTime: booking.reportingTime,
      reportingPlace: booking.reportingPlace,
      driverName: booking.driverName,
      driverPhone: booking.driverPhone,
      emergencyName: booking.emergencyName,
      emergencyPhone: booking.emergencyPhone,
    },
    installments,
    invoiceDocumentId: booking.quote.invoiceDocumentId,
    payments: payments.map((payment) => ({
      id: payment.id,
      amountPaise: Number(payment.amountPaise),
      receivedOn: dayOf(payment.receivedOn),
      method: payment.method,
      reference: payment.reference,
      recordedBy: payment.recordedBy,
      receiptDocumentId: payment.receiptDocumentId,
    })),
    stays: stays.map((stay) => {
      const voucher = voucherNumbers.find((candidate) => candidate.id === stay.voucherDocumentId);
      return {
        id: stay.id,
        name: stay.name,
        address: stay.address,
        mapUrl: stay.mapUrl,
        checkIn: dayOf(stay.checkIn),
        checkOut: dayOf(stay.checkOut),
        notes: stay.notes,
        voucher:
          voucher === undefined
            ? null
            : {
                documentId: voucher.id,
                number: voucher.number,
                upToDate: stay.voucherFingerprint === voucherFingerprint(booking, stay, names),
              },
      };
    }),
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
      roomRequest: row.roomRequest,
      roomNote: row.roomNote,
      complete: row.completeAt !== null,
      hasIdentity: identities.some((identity) => identity.travellerId === row.id),
      prefilled: row.prefilledFields,
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      installmentId: claim.installmentId,
      amountPaise: Number(claim.amountPaise),
      reference: claim.reference,
      screenshotAttachmentId:
        claim.screenshotFileId !== null && attachmentOf.has(claim.screenshotFileId) ? claim.screenshotFileId : null,
      status: claim.status,
      rejectReason: claim.rejectReason,
      createdAt: claim.createdAt.toISOString(),
      decidedAt: claim.decidedAt?.toISOString() ?? null,
    })),
    reminders: reminders.map((row) => ({
      id: row.id,
      kind: row.kind,
      installmentId: row.installmentId,
      sendAt: row.sendAt.toISOString(),
      status: row.status,
      note: row.note,
      sentAt: row.sentAt?.toISOString() ?? null,
    })),
    refund:
      refund === null
        ? null
        : {
            amountPaise: Number(refund.amountPaise),
            status: refund.status,
            refundedOn: refund.refundedOn === null ? null : dayOf(refund.refundedOn),
            method: refund.method,
            reference: refund.reference,
          },
    feedback:
      feedback === null
        ? null
        : {
            overall: feedback.overall,
            hotel: feedback.hotel,
            transport: feedback.transport,
            guide: feedback.guide,
            comment: feedback.comment,
            mayShare: feedback.mayShare,
            createdAt: feedback.createdAt.toISOString(),
          },
    policy,
    cancellation:
      booking.cancelledAt === null
        ? null
        : {
            cancelledAt: booking.cancelledAt.toISOString(),
            reason: booking.cancelReason ?? "",
            chargePaise: Number(booking.chargePaise ?? 0n),
          },
    remindersPaused: booking.remindersPausedAt !== null,
    sendsReminders: booking.sendsReminders,
    feedbackRequestedAt: booking.feedbackRequestedAt?.toISOString() ?? null,
    tripUpdatesAgreed: await tripUpdatesAgreed(tx, booking.lead.personId),
    tripPdf:
      tripPdf === null
        ? null
        : { documentId: tripPdf.id, number: tripPdf.number, upToDate: booking.tripPdfFingerprint === stamp },
    detailsCutoffOn: await detailsCutoffOf(tx, booking),
    proofMessageIds: booking.proofMessageIds,
    quotePlaceholder: booking.quotePlaceholder,
  });
}
