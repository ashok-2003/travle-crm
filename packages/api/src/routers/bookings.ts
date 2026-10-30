// bookings.*: an accepted quote as a booking (release 6). Seen within bookings:view's scope (the lead's owner), changed with
// bookings:edit; the money that follows (confirming a traveller's "I've paid", marking a refund) needs quotes:record_payments,
// and what takes a number or moves money reads the session afresh. The traveller's side is the trip page at /p/<token>
// (apps/api), not here.
import {
  downloadLink,
  attachmentSummary,
  presignedUpload,
  requestUploadInput,
  attachmentRefInput,
} from "@travel-crm/contracts/files";
import {
  bookingDetail,
  bookingIdInput,
  bookingPage,
  bookingSettingsView,
  cancelBookingInput,
  cancelPreview,
  confirmBookingInput,
  confirmClaimInput,
  issuedDocumentRef,
  leadBooking,
  leadBookingsInput,
  listBookingsInput,
  markRefundedInput,
  rejectClaimInput,
  saveBookingSettingsInput,
  saveEssentialsInput,
  saveScheduleInput,
  saveStayInput,
  saveTravellerInput,
  scheduleRow,
  setLevelInput,
  setTravellerCountInput,
  stayIdInput,
  travellerIdentity,
  travellerIdInput,
} from "@travel-crm/contracts/bookings";
import { quoteLink } from "@travel-crm/contracts/quotes";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import {
  BOOKING_VOUCHER_RECORD_TYPE,
  bookingSettingsOf,
  cancelBooking,
  confirmBooking,
  confirmClaim,
  findBookingInScope,
  getBooking,
  issueVoucher,
  listBookings,
  listLeadBookings,
  markRefunded,
  offeredSchedule,
  prepareTripPdf,
  previewCancellation,
  recordTripUpdatesConsentByStaff,
  rejectClaim,
  requestFeedback,
  saveBookingSettings,
  saveEssentials,
  saveSchedule,
  saveStay,
  saveTravellerByStaff,
  setLevel,
  setRemindersPaused,
  setTravellerCount,
  travellerIdentityOf,
  removeStay,
} from "@travel-crm/domain/bookings";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { QUOTE_RECORD_TYPE } from "@travel-crm/domain/quotes";
import { createShareLink } from "@travel-crm/domain/share-links";
import { z } from "zod";
import type { Context } from "../context.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { documentContext } from "./quotes.js";

const viewer = orgProcedure.requires("bookings:view");
const editor = orgProcedure.requires("bookings:view", "bookings:edit");
// What takes a document number or changes a booking's money is read from the database, never the five-minute session cache.
const freshEditor = freshProcedure.requires("bookings:view", "bookings:edit");
const paymentChecker = freshProcedure.requires("bookings:view", "quotes:record_payments");

type BookingContext = Pick<Context, "db" | "files" | "identity" | "profiles" | "appUrl"> & { member: MemberAccess };

/** The agency's name and the lead owner's, for the blanks of a message sent for a booking. */
async function namesOf(ctx: BookingContext, organizationId: string, ownerUserId: string | null) {
  const [organization, owners] = await Promise.all([
    ctx.identity.organizationProfile(organizationId),
    ownerUserId === null ? Promise.resolve([]) : ctx.identity.memberContacts(organizationId, [ownerUserId]),
  ]);
  return { agencyName: organization?.name ?? "our team", agentName: owners[0]?.name ?? null };
}

/** The files a booking keeps, by the record type they are attached under; only tickets are added and removed by staff. */
const bookingFileTypes = [
  BOOKING_VOUCHER_RECORD_TYPE,
  "payment_claim",
  "booking_feedback",
  "booking_traveller",
] as const;
const bookingFileRecord = z.strictObject({ recordType: z.enum(bookingFileTypes), recordId: z.uuid() });

/**
 * The booking behind a file's record, if the member may reach it; a traveller's ID photo only for documents:view_sensitive.
 * Another record type, or a booking out of scope, is "not found".
 */
async function authoriseFileRecord(
  ctx: BookingContext,
  record: { recordType: string; recordId: string },
  change: boolean,
): Promise<void> {
  const { member } = ctx;
  await ctx.db.forOrg(member.organizationId, async (tx) => {
    if (record.recordType === "booking_traveller") {
      if (change || !member.permissions.has("documents:view_sensitive")) {
        throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
      }
      const traveller = await tx.bookingTraveller.findUnique({
        where: { id: record.recordId },
        select: { bookingId: true },
      });
      if (traveller === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such record");
      await findBookingInScope(tx, member, traveller.bookingId);
      return;
    }
    if (change && record.recordType !== BOOKING_VOUCHER_RECORD_TYPE) {
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such record");
    }
    if (change && !member.permissions.has("bookings:edit")) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires bookings:edit");
    }
    await findBookingInScope(tx, member, record.recordId);
  });
}

const filesRecordInput = bookingFileRecord;

const filesRouter = router({
  list: viewer
    .input(filesRecordInput)
    .output(z.array(attachmentSummary))
    .query(async ({ ctx, input }) => {
      await authoriseFileRecord(ctx, input, false);
      return ctx.files.list(ctx.member, input);
    }),

  requestUpload: freshEditor
    .input(requestUploadInput)
    .output(z.object({ attachment: attachmentSummary, upload: presignedUpload }))
    .mutation(async ({ ctx, input }) => {
      await authoriseFileRecord(ctx, input, true);
      const { attachment, upload } = await ctx.files.requestUpload(ctx.member, { ...input, sensitive: false });
      return { attachment, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
    }),

  confirmUpload: freshEditor
    .input(attachmentRefInput)
    .output(attachmentSummary)
    .mutation(async ({ ctx, input }) => {
      await authoriseFileRecord(ctx, input, true);
      return ctx.files.confirmUpload(ctx.member, input);
    }),

  downloadLink: freshProcedure
    .requires("bookings:view")
    .meta({ lifecycle: "export" })
    .input(attachmentRefInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      await authoriseFileRecord(ctx, input, false);
      const link = await ctx.files.downloadLink(ctx.member, input);
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),

  remove: freshEditor.input(attachmentRefInput).mutation(async ({ ctx, input }) => {
    await authoriseFileRecord(ctx, input, true);
    await ctx.files.remove(ctx.member, input);
  }),
});

export const bookingsRouter = router({
  list: viewer
    .input(listBookingsInput)
    .output(bookingPage)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listBookings(tx, ctx.member, input))),

  /** A lead's bookings in brief, for its page. */
  forLead: viewer
    .input(leadBookingsInput)
    .output(z.array(leadBooking))
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listLeadBookings(tx, ctx.member, input.leadId)),
    ),

  get: viewer
    .input(bookingIdInput)
    .output(bookingDetail)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => getBooking(tx, ctx.member, input.bookingId)),
    ),

  /** What cancelling today would cost: the days left, the step, the charge and the refund. */
  cancelPreview: viewer
    .input(bookingIdInput)
    .output(cancelPreview)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        previewCancellation(tx, ctx.member, input.bookingId, new Date()),
      ),
    ),

  /** The agency's default payments due, which Confirm offers when the quote has none. */
  defaultSchedule: editor
    .input(bookingIdInput)
    .output(z.object({ installments: z.array(scheduleRow.omit({ id: true })) }))
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const booking = await findBookingInScope(tx, ctx.member, input.bookingId);
        return { installments: await offeredSchedule(tx, booking, new Date()) };
      }),
    ),

  confirm: editor
    .input(confirmBookingInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => confirmBooking(tx, ctx.member, input, new Date())),
    ),

  saveSchedule: freshEditor
    .input(saveScheduleInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveSchedule(tx, ctx.member, input, new Date())),
    ),

  saveEssentials: editor
    .input(saveEssentialsInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveEssentials(tx, ctx.member, input, new Date())),
    ),

  saveStay: editor
    .input(saveStayInput)
    .output(z.object({ stayId: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => saveStay(tx, ctx.member, input))),

  removeStay: editor
    .input(stayIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removeStay(tx, ctx.member, input.stayId)),
    ),

  setLevel: editor
    .input(setLevelInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setLevel(tx, ctx.member, input, new Date())),
    ),

  setTravellerCount: editor
    .input(setTravellerCountInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setTravellerCount(tx, ctx.member, input)),
    ),

  saveTraveller: editor
    .input(saveTravellerInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveTravellerByStaff(tx, ctx.member, input, new Date())),
    ),

  /** A traveller's ID numbers, for a member who may read them; every reading is audited. */
  identity: freshProcedure
    .requires("bookings:view", "documents:view_sensitive")
    .input(travellerIdInput)
    .output(travellerIdentity.nullable())
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => travellerIdentityOf(tx, ctx.member, input.travellerId)),
    ),

  issueVoucher: freshEditor
    .input(stayIdInput)
    .output(issuedDocumentRef)
    .mutation(async ({ ctx, input }) => {
      const context = await documentContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        issueVoucher(tx, ctx.member, input.stayId, context.branding, new Date()),
      );
    }),

  prepareTripPdf: freshEditor
    .input(bookingIdInput)
    .output(issuedDocumentRef)
    .mutation(async ({ ctx, input }) => {
      const context = await documentContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        prepareTripPdf(tx, ctx.member, input.bookingId, context.branding, new Date()),
      );
    }),

  /** A five-minute link to the booking's itinerary or one of its vouchers; DOCUMENT_NOT_READY while the worker renders it. */
  documentLink: freshProcedure
    .requires("bookings:view")
    .meta({ lifecycle: "export" })
    .input(z.strictObject({ bookingId: z.uuid(), documentId: z.uuid() }))
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const booking = await findBookingInScope(tx, ctx.member, input.bookingId);
        const stays = await tx.bookingStay.findMany({
          where: { bookingId: booking.id },
          select: { voucherDocumentId: true },
        });
        const mine =
          booking.tripPdfDocumentId === input.documentId ||
          stays.some((stay) => stay.voucherDocumentId === input.documentId);
        if (!mine) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such document");
        return getIssuedDocument(tx, { documentId: input.documentId });
      });
      assertPdfCanBeMade(document);
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await ctx.files.systemDownloadLink(ctx.member.organizationId, {
        attachmentId: document.pdfAttachmentId,
      });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),

  /** The link the traveller opens for the trip (the quote's link, which becomes the trip page once confirmed). */
  tripLink: editor
    .input(bookingIdInput)
    .output(quoteLink)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const booking = await findBookingInScope(tx, ctx.member, input.bookingId);
        const link = await createShareLink(tx, ctx.member, {
          recordType: QUOTE_RECORD_TYPE,
          recordId: booking.quoteId,
          label: `Trip ${booking.number}`,
          expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
        });
        return { path: link.path };
      }),
    ),

  pauseReminders: editor
    .input(z.strictObject({ bookingId: z.uuid(), paused: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setRemindersPaused(tx, ctx.member, input, new Date())),
    ),

  recordTripUpdates: editor
    .input(bookingIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        recordTripUpdatesConsentByStaff(tx, ctx.member, input, new Date()),
      ),
    ),

  requestFeedback: editor
    .input(bookingIdInput)
    .output(z.object({ sent: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        requestFeedback(
          tx,
          ctx.member,
          input,
          { appUrl: ctx.appUrl, names: (organizationId, ownerUserId) => namesOf(ctx, organizationId, ownerUserId) },
          new Date(),
        ),
      ),
    ),

  cancel: freshEditor
    .input(cancelBookingInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => cancelBooking(tx, ctx.member, input, new Date())),
    ),

  markRefunded: paymentChecker
    .input(markRefundedInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => markRefunded(tx, ctx.member, input, new Date())),
    ),

  confirmClaim: paymentChecker
    .input(confirmClaimInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => confirmClaim(tx, ctx.member, input, new Date())),
    ),

  rejectClaim: paymentChecker
    .input(rejectClaimInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => rejectClaim(tx, ctx.member, input, new Date())),
    ),

  settings: freshProcedure
    .requires("settings:manage")
    .output(bookingSettingsView)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => bookingSettingsOf(tx))),

  saveSettings: freshProcedure
    .requires("settings:manage")
    .input(saveBookingSettingsInput)
    .output(bookingSettingsView)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveBookingSettings(tx, ctx.member, input)),
    ),

  /** Tickets and other files for the trip; the screenshots, feedback photos and ID photos are read here too. */
  files: filesRouter,
});
