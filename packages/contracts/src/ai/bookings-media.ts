// The autopilot's media and bookings (the owner, 2026-10-29): the photos, videos and PDFs the agency gives its AI to send
// in chats, each with when to send it; and the bookings it takes when a customer says yes, with the customer's payment
// proof, which a person confirms or cancels.
import { z } from "zod";
import { aiMediaFileTypes, presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";

const text = (max: number) => z.string().trim().max(max);

/** What the AI may send from the agency's media: what WhatsApp takes as a photo, a video or a document. */
export const aiMediaContentTypes = aiMediaFileTypes;
/** WhatsApp's own limits: 5 MB a photo, 16 MB a video, more for a document; one cap keeps it simple. */
export const MAX_AI_MEDIA_BYTES = 16 * 1024 * 1024;
/** The most media the AI sends with one reply. */
export const MAX_AI_MEDIA_PER_REPLY = 3;

export const aiMediaItem = z.object({
  id: recordId,
  title: z.string(),
  whenToSend: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  ready: z.boolean(),
  enabled: z.boolean(),
  /** How many chats it was sent in. */
  sent: z.int(),
  updatedAt: z.iso.datetime(),
});
export type AiMediaItem = z.infer<typeof aiMediaItem>;
export const aiMediaList = z.array(aiMediaItem);
export const requestAiMediaInput = z.strictObject({
  title: text(120).min(1),
  whenToSend: text(400),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(aiMediaContentTypes),
  sizeBytes: z.int().min(1).max(MAX_AI_MEDIA_BYTES),
});
export type RequestAiMediaInput = z.infer<typeof requestAiMediaInput>;
export const aiMediaSlot = z.object({ mediaId: recordId, attachmentId: recordId, upload: presignedUpload });
export const aiMediaIdInput = z.strictObject({ mediaId: recordId });
export const confirmAiMediaInput = z.strictObject({ mediaId: recordId, attachmentId: recordId });
export const updateAiMediaInput = z.strictObject({
  mediaId: recordId,
  title: text(120).min(1),
  whenToSend: text(400),
  enabled: z.boolean(),
});
export type UpdateAiMediaInput = z.infer<typeof updateAiMediaInput>;
/** A 5-minute link to look at one of the media. */
export const aiMediaLink = z.object({ url: z.string() });

export const aiBookingStatuses = ["awaiting_payment", "proof_received", "confirmed", "cancelled"] as const;
export const aiBookingStatus = z.enum(aiBookingStatuses);
export const aiBooking = z.object({
  id: recordId,
  leadId: recordId,
  conversationId: recordId,
  summary: z.string(),
  details: z.object({
    package: z.string(),
    dates: z.string(),
    travellers: z.string(),
    pickup: z.string(),
    amount: z.string(),
  }),
  status: aiBookingStatus,
  /** The customer's photos and PDFs sent as payment proof: their chat messages. */
  proofs: z.array(
    z.object({ messageId: recordId, kind: z.string(), fileName: z.string().nullable(), at: z.iso.datetime() }),
  ),
  createdAt: z.iso.datetime(),
});
export type AiBooking = z.infer<typeof aiBooking>;
export const aiBookingList = z.array(aiBooking);
export const aiBookingsInput = z.strictObject({ leadId: recordId });
export const setAiBookingStatusInput = z.strictObject({
  bookingId: recordId,
  status: z.enum(["confirmed", "cancelled", "awaiting_payment"]),
});
