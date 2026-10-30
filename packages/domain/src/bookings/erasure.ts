// What bookings keep about a person, emptied or deleted when the customer is erased (R38): the travellers' names, birthdays,
// phones, emergency contacts, medical notes and ID numbers; the references and screenshots of their payment claims; the
// reference of a refund; feedback comments and photos; the words of a cancellation; and every file of their bookings
// (voucher tickets, ID photos). The booking, its amounts and its dates stay (the agency's books), and so do the issued
// vouchers and itineraries, which follow the issued-document rules. Run on the platform's transaction.
import { withDeleted, type OrgTx } from "@travel-crm/db";
import { deleteRecordFiles } from "../files/index.js";

export interface BookingsErased {
  /** The erased customer's bookings, so their tasks and notifications are found by id. */
  bookingIds: string[];
  travellers: number;
  identities: number;
  claims: number;
  feedback: number;
  files: number;
}

/** Deleted rows too: a booking removed with its reverted quote, or a traveller removed with the headcount, held words as well. */
export function eraseBookingParts(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[]; now: Date },
): Promise<BookingsErased> {
  return withDeleted(() => erase(tx, input));
}

async function erase(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[]; now: Date },
): Promise<BookingsErased> {
  const { organizationId, now } = input;
  const bookings = await tx.booking.findMany({
    where: { organizationId, leadId: { in: [...input.leadIds] } },
    select: { id: true },
  });
  const bookingIds = bookings.map((booking) => booking.id);
  const travellers = await tx.bookingTraveller.findMany({
    where: { organizationId, bookingId: { in: bookingIds } },
    select: { id: true },
  });
  const travellerIds = travellers.map((traveller) => traveller.id);
  // A plain DELETE: the runtime role has no right to it, the platform role does.
  const identities = await tx.bookingTravellerIdentity.deleteMany({
    where: { organizationId, travellerId: { in: travellerIds } },
  });
  await tx.bookingTraveller.updateMany({
    where: { organizationId, id: { in: travellerIds } },
    data: {
      name: "",
      dateOfBirth: null,
      gender: null,
      phone: "",
      emergencyName: "",
      emergencyPhone: "",
      medicalNotes: "",
      completeAt: null,
    },
  });
  const claims = await tx.paymentClaim.updateMany({
    where: { organizationId, bookingId: { in: bookingIds } },
    data: { reference: "", screenshotFileId: null },
  });
  await tx.bookingRefund.updateMany({
    where: { organizationId, bookingId: { in: bookingIds } },
    data: { reference: "" },
  });
  const feedback = await tx.bookingFeedback.updateMany({
    where: { organizationId, bookingId: { in: bookingIds } },
    data: { comment: "" },
  });
  await tx.booking.updateMany({ where: { organizationId, id: { in: bookingIds } }, data: { cancelReason: null } });
  let files = 0;
  for (const bookingId of bookingIds) {
    for (const recordType of ["payment_claim", "booking_feedback", "booking_voucher"]) {
      files += await deleteRecordFiles(tx, { organizationId, recordType, recordId: bookingId }, now);
    }
  }
  for (const travellerId of travellerIds) {
    files += await deleteRecordFiles(
      tx,
      { organizationId, recordType: "booking_traveller", recordId: travellerId },
      now,
    );
  }
  return {
    bookingIds,
    travellers: travellerIds.length,
    identities: identities.count,
    claims: claims.count,
    feedback: feedback.count,
    files,
  };
}
