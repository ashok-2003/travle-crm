// What a traveller does on the trip page (/p/<token>), without signing in: says "I've paid", fills a traveller's details,
// and leaves feedback. Strict, and checked again by the domain; never the values of an ID number back.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { MAX_QUOTE_PAISE } from "../quotes/quotes.js";
import { gender, identityFields, travellerFields } from "./bookings.js";

const text = (max: number) => z.string().trim().max(max);

/** The biggest screenshot or photo a traveller sends: 5 MB, an image. */
export const MAX_TRAVELLER_IMAGE_BYTES = 5 * 1024 * 1024;
export const travellerImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FEEDBACK_PHOTOS = 5;

export const publicClaimInput = z.strictObject({
  installmentId: recordId.nullable(),
  amountPaise: z.int().min(1).max(MAX_QUOTE_PAISE),
  reference: text(60),
  screenshotAttachmentId: recordId.nullable(),
});
export type PublicClaimInput = z.infer<typeof publicClaimInput>;

export const publicTravellerInput = z.strictObject({
  travellerId: recordId,
  ...travellerFields,
  /** Only asked on a booking that is on a group departure; left out, what is stored stays. */
  roomRequest: travellerFields.roomRequest.optional(),
  roomNote: travellerFields.roomNote.optional(),
  gender: gender.nullable(),
  dateOfBirth: calendarDate.nullable(),
  identity: z.strictObject(identityFields).nullable(),
  idPhotoAttachmentId: recordId.nullable(),
});
export type PublicTravellerInput = z.infer<typeof publicTravellerInput>;

export const publicFeedbackInput = z.strictObject({
  overall: z.int().min(1).max(5),
  hotel: z.int().min(1).max(5).nullable(),
  transport: z.int().min(1).max(5).nullable(),
  guide: z.int().min(1).max(5).nullable(),
  comment: text(2000),
  mayShare: z.boolean(),
  photoAttachmentIds: z.array(recordId).max(MAX_FEEDBACK_PHOTOS),
});
export type PublicFeedbackInput = z.infer<typeof publicFeedbackInput>;

/** What the page asks for before sending a file straight to storage. */
export const publicUploadKinds = ["claim", "id_photo", "feedback_photo"] as const;
export const publicUploadInput = z.strictObject({
  kind: z.enum(publicUploadKinds),
  /** The traveller an ID photo belongs to. */
  travellerId: recordId.optional(),
  fileName: text(120).min(1),
  contentType: z.enum(travellerImageTypes),
  sizeBytes: z.int().min(1).max(MAX_TRAVELLER_IMAGE_BYTES),
});
export type PublicUploadInput = z.infer<typeof publicUploadInput>;
export const publicConfirmInput = z.strictObject({ attachmentId: recordId });
