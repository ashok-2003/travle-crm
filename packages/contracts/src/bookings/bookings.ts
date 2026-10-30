// Bookings (release 6): an accepted quote as a booking the agency confirms, collects money on and gives the traveller a
// trip page for. The shapes the staff screens read: the list, and one booking with its stays, travellers, payment
// claims, reminders, feedback and refund. Amounts are integer paise. Money itself stays on the quote.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { installment, payment } from "../quotes/quotes.js";

export const bookingStatuses = ["requested", "confirmed", "cancelled", "completed"] as const;
export const bookingStatus = z.enum(bookingStatuses);
export type BookingStatus = z.infer<typeof bookingStatus>;

/** How much each traveller fills in: name and birthday; plus emergency contact and medical notes; plus passport. */
export const travellerLevels = ["basic", "detailed", "international"] as const;
export const travellerLevel = z.enum(travellerLevels);
export type TravellerLevel = z.infer<typeof travellerLevel>;

export const claimStatuses = ["pending", "confirmed", "rejected"] as const;
export const claimStatus = z.enum(claimStatuses);
export const rejectReasons = ["not_found", "wrong_amount", "other"] as const;
export const rejectReason = z.enum(rejectReasons);
export type RejectReason = z.infer<typeof rejectReason>;

export const reminderKinds = ["balance", "details", "reporting"] as const;
export const reminderKind = z.enum(reminderKinds);
export const reminderStatuses = ["scheduled", "sent", "by_hand", "skipped"] as const;
export const reminderStatus = z.enum(reminderStatuses);

/** The steps of a booking the lead's timeline tells. */
export const bookingEvents = [
  "created",
  "confirmed",
  "payment-claimed",
  "payment-confirmed",
  "payment-rejected",
  "voucher-issued",
  "trip-pdf-prepared",
  "details-complete",
  "reminder-sent",
  "reminder-by-hand",
  "feedback-requested",
  "feedback-received",
  "cancelled",
  "refunded",
] as const;
export const bookingEvent = z.enum(bookingEvents);
export type BookingEvent = z.infer<typeof bookingEvent>;

const text = (max: number) => z.string().trim().max(max);
const paise = z.int().min(0);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 06:30");

export const bookingIdInput = z.strictObject({ bookingId: recordId });
export type BookingIdInput = z.infer<typeof bookingIdInput>;
export const leadBookingsInput = z.strictObject({ leadId: recordId });

export const BOOKINGS_PAGE_SIZE = 25;
export const listBookingsInput = z.strictObject({
  status: bookingStatus.optional(),
  /** Only bookings with a payment claim waiting to be checked. */
  claimsPending: z.boolean().optional(),
  /** The last booking's id of the previous page. */
  cursor: recordId.optional(),
});
export type ListBookingsInput = z.infer<typeof listBookingsInput>;

export const bookingSummary = z.object({
  id: recordId,
  number: z.string(),
  status: bookingStatus,
  leadId: recordId,
  quoteId: recordId,
  customerName: z.string(),
  title: z.string(),
  startDate: calendarDate.nullable(),
  endDate: calendarDate.nullable(),
  totalPaise: paise,
  paidPaise: paise,
  balancePaise: paise,
  travellersTotal: z.int(),
  travellersComplete: z.int(),
  pendingClaims: z.int(),
  /** What is owed back after a cancellation, until it is marked refunded. */
  refundDuePaise: paise,
});
export type BookingSummary = z.infer<typeof bookingSummary>;

export const bookingPage = z.object({ items: z.array(bookingSummary), nextCursor: recordId.nullable() });
export type BookingPage = z.infer<typeof bookingPage>;

/** A booking in brief, beside its lead. */
export const leadBooking = z.object({ id: recordId, number: z.string(), status: bookingStatus, title: z.string() });
export type LeadBooking = z.infer<typeof leadBooking>;

export const essentialsFields = {
  /** The time to report at the place, on the agency's clock. */
  reportingTime: time.nullable(),
  reportingPlace: text(300),
  driverName: text(120),
  driverPhone: text(40),
  emergencyName: text(120),
  emergencyPhone: text(40),
};
export const essentials = z.object(essentialsFields);
export type Essentials = z.infer<typeof essentials>;
export const saveEssentialsInput = z.strictObject({ bookingId: recordId, ...essentialsFields });
export type SaveEssentialsInput = z.infer<typeof saveEssentialsInput>;

const stayFields = {
  name: text(120).min(1),
  address: text(400),
  mapUrl: text(500).refine(
    (value) => value === "" || /^https?:\/\/\S+$/.test(value),
    "Use a link starting with https://",
  ),
  checkIn: calendarDate,
  checkOut: calendarDate,
  notes: text(500),
};
export const saveStayInput = z
  .strictObject({ bookingId: recordId, stayId: recordId.optional(), ...stayFields })
  .refine((stay) => stay.checkOut >= stay.checkIn, {
    message: "Check-out can't be before check-in",
    path: ["checkOut"],
  });
export type SaveStayInput = z.infer<typeof saveStayInput>;
export const stayIdInput = z.strictObject({ stayId: recordId });

export const stay = z.object({
  id: recordId,
  ...z.object(stayFields).shape,
  /** The latest voucher issued for it; upToDate is false once the stay changed since. */
  voucher: z.object({ documentId: recordId, number: z.string(), upToDate: z.boolean() }).nullable(),
});
export type Stay = z.infer<typeof stay>;

export const genders = ["female", "male", "other"] as const;
export const gender = z.enum(genders);

export const identityKinds = ["passport", "other_id"] as const;
export const identityFields = {
  kind: z.enum(identityKinds),
  number: text(40).min(1),
  issuedOn: calendarDate.nullable(),
  expiresOn: calendarDate.nullable(),
  nationality: text(60),
};
export const travellerIdentity = z.object(identityFields);
export type TravellerIdentity = z.infer<typeof travellerIdentity>;

export const travellerFields = {
  name: text(120),
  dateOfBirth: calendarDate.nullable(),
  gender: gender.nullable(),
  phone: text(40),
  emergencyName: text(120),
  emergencyPhone: text(40),
  medicalNotes: text(1000),
};

/** Staff fill a traveller's row as the traveller would; the ID number only with documents:view_sensitive. */
export const saveTravellerInput = z.strictObject({
  travellerId: recordId,
  ...travellerFields,
  identity: z.strictObject(identityFields).nullable(),
});
export type SaveTravellerInput = z.infer<typeof saveTravellerInput>;
export const travellerIdInput = z.strictObject({ travellerId: recordId });

export const traveller = z.object({
  id: recordId,
  position: z.int(),
  ...z.object(travellerFields).shape,
  complete: z.boolean(),
  /** An ID number is on file (never shown here). */
  hasIdentity: z.boolean(),
});
export type Traveller = z.infer<typeof traveller>;

export const setTravellerCountInput = z.strictObject({ bookingId: recordId, count: z.int().min(1).max(500) });
export const setLevelInput = z.strictObject({ bookingId: recordId, level: travellerLevel });

export const claim = z.object({
  id: recordId,
  installmentId: recordId.nullable(),
  amountPaise: paise,
  reference: z.string(),
  /** The screenshot's attachment, shown to staff who check the payment. */
  screenshotAttachmentId: recordId.nullable(),
  status: claimStatus,
  rejectReason: rejectReason.nullable(),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});
export type Claim = z.infer<typeof claim>;

/** Made once when the dialog opens, so a double tap records the payment once (it becomes the payment's request id). */
export const confirmClaimInput = z.strictObject({
  claimId: recordId,
  /** The amount actually received, when it differs from the one claimed. */
  amountPaise: z.int().min(1).optional(),
});
export type ConfirmClaimInput = z.infer<typeof confirmClaimInput>;
export const rejectClaimInput = z.strictObject({ claimId: recordId, reason: rejectReason });
export type RejectClaimInput = z.infer<typeof rejectClaimInput>;

export const reminder = z.object({
  id: recordId,
  kind: reminderKind,
  installmentId: recordId.nullable(),
  sendAt: z.iso.datetime(),
  status: reminderStatus,
  note: z.string().nullable(),
  sentAt: z.iso.datetime().nullable(),
});
export type Reminder = z.infer<typeof reminder>;

export const feedback = z.object({
  overall: z.int(),
  hotel: z.int().nullable(),
  transport: z.int().nullable(),
  guide: z.int().nullable(),
  comment: z.string(),
  mayShare: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Feedback = z.infer<typeof feedback>;

export const refund = z.object({
  amountPaise: paise,
  status: z.enum(["due", "refunded"]),
  refundedOn: calendarDate.nullable(),
  method: z.string().nullable(),
  reference: z.string(),
});
export type Refund = z.infer<typeof refund>;

export const policyRule = z.strictObject({
  /** From this many days before departure, until the next step. */
  daysBeforeMin: z.int().min(0).max(3650),
  chargeBasisPoints: z.int().min(0).max(10_000),
});
export type PolicyRule = z.infer<typeof policyRule>;
export const policy = z.object({ rules: z.array(policyRule), notes: z.string() });
export type Policy = z.infer<typeof policy>;

export const bookingDetail = z.object({
  ...bookingSummary.shape,
  level: travellerLevel,
  leadOwnerUserId: recordId.nullable(),
  /** The customer's phone (E.164), to send the trip link on WhatsApp. */
  customerPhone: z.string().nullable(),
  essentials,
  installments: z.array(installment),
  payments: z.array(payment),
  stays: z.array(stay),
  travellers: z.array(traveller),
  claims: z.array(claim),
  reminders: z.array(reminder),
  refund: refund.nullable(),
  feedback: feedback.nullable(),
  policy,
  cancellation: z.object({ cancelledAt: z.iso.datetime(), reason: z.string(), chargePaise: paise }).nullable(),
  remindersPaused: z.boolean(),
  /** False for a booking carried over from before bookings existed: its payment reminders are the sales automation's. */
  sendsReminders: z.boolean(),
  feedbackRequestedAt: z.iso.datetime().nullable(),
  /** The traveller agreed to trip updates on WhatsApp. */
  tripUpdatesAgreed: z.boolean(),
  tripPdf: z.object({ documentId: recordId, number: z.string(), upToDate: z.boolean() }).nullable(),
  detailsCutoffOn: calendarDate.nullable(),
  /** The customer's chat messages the AI took as proof of payment, opened from the inbox's media. */
  proofMessageIds: z.array(recordId),
  /** The quote was made from a chat the AI took, not sent: a real quote accepted later takes its place. */
  quotePlaceholder: z.boolean(),
});
export type BookingDetail = z.infer<typeof bookingDetail>;

export const scheduleRow = z.strictObject({
  /** Present for a payment due that exists already; absent for a new one. */
  id: recordId.optional(),
  label: text(80).min(1),
  amountPaise: z.int().min(1),
  dueOn: calendarDate,
});
export type ScheduleRow = z.infer<typeof scheduleRow>;
/** The agency's default schedule for a booking: the advance now, the balance some days before departure. */
export const schedule = z.array(scheduleRow).max(12);

export const confirmBookingInput = z.strictObject({ bookingId: recordId, installments: schedule.optional() });
export type ConfirmBookingInput = z.infer<typeof confirmBookingInput>;
export const saveScheduleInput = z.strictObject({ bookingId: recordId, installments: schedule.min(1) });
export type SaveScheduleInput = z.infer<typeof saveScheduleInput>;
export const defaultScheduleOutput = z.object({ installments: z.array(scheduleRow.omit({ id: true })) });

export const cancelPreview = z.object({
  /** Whole days from the cancellation day to departure; null when the trip has no date. */
  daysBefore: z.int().nullable(),
  chargeBasisPoints: z.int(),
  totalPaise: paise,
  paidPaise: paise,
  chargePaise: paise,
  refundPaise: paise,
});
export type CancelPreview = z.infer<typeof cancelPreview>;

export const cancelBookingInput = z
  .strictObject({
    bookingId: recordId,
    reason: text(500).min(1),
    /** Replaces the charge the policy worked out; needs a reason. */
    chargePaise: z.int().min(0).optional(),
    chargeOverrideReason: text(300).optional(),
  })
  .refine((input) => input.chargePaise === undefined || (input.chargeOverrideReason ?? "") !== "", {
    message: "Say why the charge is changed",
    path: ["chargeOverrideReason"],
  });
export type CancelBookingInput = z.infer<typeof cancelBookingInput>;

export const markRefundedInput = z.strictObject({
  bookingId: recordId,
  refundedOn: calendarDate,
  method: z.enum(["upi", "bank", "cash", "card", "other"]),
  reference: text(60),
});
export type MarkRefundedInput = z.infer<typeof markRefundedInput>;

export const issuedDocumentRef = z.object({ documentId: recordId, number: z.string() });
