// The pictures a traveller sends from the trip page (release 6): a payment screenshot, a photo of an ID page, photos of the
// trip. They go straight to storage; this decides which record each belongs to and refuses the rest. The link scopes them to
// its own booking: a screenshot is attached to the booking (record type payment_claim), an ID photo to a traveller of it
// (booking_traveller, sensitive), feedback photos to the booking (booking_feedback), and only while that step is open.
import { MAX_FEEDBACK_PHOTOS, type PublicUploadInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export interface UploadTarget {
  recordType: "payment_claim" | "booking_traveller" | "booking_feedback";
  recordId: string;
  sensitive: boolean;
}

/** The most pictures a booking keeps for each purpose, pending ones included: nobody fills the agency's storage from a link. */
const MOST_SCREENSHOTS = 12;
const MOST_ID_PHOTOS = 3;

export async function publicUploadTarget(tx: OrgTx, quoteId: string, input: PublicUploadInput): Promise<UploadTarget> {
  const booking = await tx.booking.findFirst({
    where: { quoteId },
    select: { id: true, status: true, level: true, feedbackRequestedAt: true },
  });
  if (booking === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such booking");
  const count = (recordType: string, recordId: string) => tx.attachment.count({ where: { recordType, recordId } });
  if (input.kind === "claim") {
    if (booking.status !== "requested" && booking.status !== "confirmed") {
      throw new DomainError("CONFLICT", "BOOKING_NOT_OPEN", "Payments can't be claimed on this booking");
    }
    if ((await count("payment_claim", booking.id)) >= MOST_SCREENSHOTS) {
      throw new DomainError("LIMIT_REACHED", "TOO_MANY_FILES", "Too many pictures were sent");
    }
    return { recordType: "payment_claim", recordId: booking.id, sensitive: false };
  }
  if (input.kind === "id_photo") {
    if (booking.status !== "confirmed" || booking.level !== "international" || input.travellerId === undefined) {
      throw new DomainError("CONFLICT", "BOOKING_NOT_OPEN", "An ID photo isn't asked for");
    }
    const traveller = await tx.bookingTraveller.findFirst({
      where: { id: input.travellerId, bookingId: booking.id },
      select: { id: true },
    });
    if (traveller === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such traveller");
    if ((await count("booking_traveller", traveller.id)) >= MOST_ID_PHOTOS) {
      throw new DomainError("LIMIT_REACHED", "TOO_MANY_FILES", "Too many pictures were sent");
    }
    return { recordType: "booking_traveller", recordId: traveller.id, sensitive: true };
  }
  if (booking.feedbackRequestedAt === null || (booking.status !== "confirmed" && booking.status !== "completed")) {
    throw new DomainError("CONFLICT", "FEEDBACK_NOT_ASKED", "Feedback isn't open for this booking");
  }
  if ((await tx.bookingFeedback.count({ where: { bookingId: booking.id } })) > 0) {
    throw new DomainError("CONFLICT", "FEEDBACK_ALREADY_SENT", "Your feedback was already sent");
  }
  if ((await count("booking_feedback", booking.id)) >= MAX_FEEDBACK_PHOTOS) {
    throw new DomainError("LIMIT_REACHED", "TOO_MANY_FILES", "Too many pictures were sent");
  }
  return { recordType: "booking_feedback", recordId: booking.id, sensitive: false };
}

/** The record a pending picture was attached to, if it is one this booking's link may confirm; NOT_FOUND otherwise. */
export async function publicUploadRecord(
  tx: OrgTx,
  quoteId: string,
  attachmentId: string,
): Promise<{ recordType: string; recordId: string }> {
  const booking = await tx.booking.findFirst({ where: { quoteId }, select: { id: true } });
  const file = await tx.attachment.findFirst({
    where: { id: attachmentId, recordType: { in: ["payment_claim", "booking_traveller", "booking_feedback"] } },
    select: { recordType: true, recordId: true },
  });
  if (booking === null || file === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  if (file.recordType === "booking_traveller") {
    const traveller = await tx.bookingTraveller.findFirst({
      where: { id: file.recordId, bookingId: booking.id },
      select: { id: true },
    });
    if (traveller === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  } else if (file.recordId !== booking.id) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  }
  return file;
}
