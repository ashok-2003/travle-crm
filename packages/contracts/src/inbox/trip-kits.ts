// Trip details (sales inbox): a trip's words, files and keywords, set up once in Settings, WhatsApp, and sent to any chat
// from its Send details, or by themselves when a customer's message holds a keyword (once a chat).
import { z } from "zod";
import { attachmentFileName, presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";
import { clientToken, MAX_WHATSAPP_SEND_BYTES, whatsappSendContentTypes } from "./inputs.js";

/** The most files a trip may carry: each is a message of its own, so a few. */
export const MAX_TRIP_KIT_FILES = 10;

const keyword = z.string().trim().toLowerCase().min(2).max(40);

export const tripKitFields = {
  name: z.string().trim().min(1).max(80),
  message: z.string().trim().max(4096),
  keywords: z.array(keyword).max(20),
  autoSend: z.boolean(),
};

export const createTripKitInput = z.strictObject(tripKitFields);
export type CreateTripKitInput = z.infer<typeof createTripKitInput>;
export const updateTripKitInput = z.strictObject({ tripKitId: recordId, ...tripKitFields });
export type UpdateTripKitInput = z.infer<typeof updateTripKitInput>;
export const tripKitIdInput = z.strictObject({ tripKitId: recordId });
export const tripKitCreated = z.object({ id: recordId });
export type TripKitIdInput = z.infer<typeof tripKitIdInput>;

export const tripKitFile = z.object({
  id: recordId,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.int(),
  ready: z.boolean(),
});
export type TripKitFile = z.infer<typeof tripKitFile>;

export const tripKit = z.object({
  id: recordId,
  name: z.string(),
  message: z.string(),
  keywords: z.array(z.string()),
  autoSend: z.boolean(),
  files: z.array(tripKitFile),
});
export type TripKit = z.infer<typeof tripKit>;
export const tripKitList = z.array(tripKit);

/** Step one of adding a file to a trip: where the browser puts it. */
export const requestTripKitUploadInput = z.strictObject({
  tripKitId: recordId,
  fileName: attachmentFileName,
  contentType: z.enum(whatsappSendContentTypes),
  sizeBytes: z.int().min(1).max(MAX_WHATSAPP_SEND_BYTES),
});
export type RequestTripKitUploadInput = z.infer<typeof requestTripKitUploadInput>;
export const tripKitUploadSlot = z.object({ attachmentId: recordId, upload: presignedUpload });
export const tripKitFileInput = z.strictObject({ tripKitId: recordId, attachmentId: recordId });
export type TripKitFileInput = z.infer<typeof tripKitFileInput>;

/** Send a trip's details to a chat now: its words, then each file, each a message of its own. */
export const sendTripKitInput = z.strictObject({ conversationId: recordId, tripKitId: recordId, clientToken });
export type SendTripKitInput = z.infer<typeof sendTripKitInput>;
export const tripKitSent = z.object({
  /** How many messages were queued: the words and each file. */
  queued: z.int(),
  /** Why nothing could go, when nothing did (the window closed, the number paused, consent withdrawn). */
  refused: z.string().nullable(),
});
export type TripKitSent = z.infer<typeof tripKitSent>;
