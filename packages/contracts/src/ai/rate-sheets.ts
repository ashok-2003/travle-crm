// AI part 4b (release ai3b): a supplier's rate sheet (a PDF, an Excel file or photos) read by the AI into rate rows that staff
// check one by one and save through 7b's own rate writes. The AI copies what is printed; the price in paise, the dates and the
// enums are made by code, and a value that could not be made is null, which the screen asks about. Nothing here saves a rate.
import { z } from "zod";
import {
  aiRateSheetInputTypes,
  MAX_AI_IMAGE_BYTES,
  MAX_AI_RATE_SHEET_BYTES,
  presignedUpload,
} from "../files/attachments.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { rateFields, rateMealPlan, rateOccupancy, rateUnit } from "../suppliers/rates.js";

/** One read is one AI call, and is capped: text, rows and seasons (a bigger sheet is read by tab or pages, each another call). */
export const RATE_SHEET_CHARACTERS = 12_000;
export const RATE_SHEET_ROWS_MAX = 60;
export const RATE_SHEET_SEASONS_MAX = 8;
export const RATE_SHEET_PHOTOS_MAX = 4;

/** Step one of a rate sheet's upload: where the browser puts the file. */
export const requestRateSheetInput = z.strictObject({
  contentType: z.enum(aiRateSheetInputTypes),
  sizeBytes: z.int().min(1).max(Math.max(MAX_AI_RATE_SHEET_BYTES, MAX_AI_IMAGE_BYTES)),
});
export type RequestRateSheetInput = z.infer<typeof requestRateSheetInput>;
export const rateSheetSlot = z.object({ recordId, attachmentId: recordId, upload: presignedUpload });

export const readRateSheetInput = z.strictObject({
  supplierId: recordId,
  /** One PDF or Excel file, or up to four photos of the sheet. */
  attachmentIds: z.array(recordId).min(1).max(RATE_SHEET_PHOTOS_MAX),
  /** Which part of a big sheet to read (its tab or pages), counting from 0; left out, a sheet in one part is read at once. */
  part: z.int().min(0).max(99).optional(),
});
export type ReadRateSheetInput = z.infer<typeof readRateSheetInput>;

export const rateSheetSeason = z.object({
  /** How the rows name their season. */
  ref: z.int(),
  label: z.string(),
  /** Null when the sheet's dates could not be made into days (no year printed, say): the person chooses them. */
  startsOn: calendarDate.nullable(),
  endsOn: calendarDate.nullable(),
  /** The dates as printed, for the person to compare. */
  printed: z.string(),
  /** A season of the supplier with exactly these dates, which the rows use instead of making another. */
  existingSeasonId: recordId.nullable(),
  /** The season has ended already. */
  inPast: z.boolean(),
});
export type RateSheetSeason = z.infer<typeof rateSheetSeason>;

export const rateSheetRow = z.object({
  /** "r1": what the save names the row by. */
  ref: z.string(),
  seasonRef: z.int().nullable(),
  item: z.string(),
  mealPlan: rateMealPlan,
  occupancy: rateOccupancy,
  /** Null when the heading did not say what it is charged per: the screen shows "Choose". */
  unit: rateUnit.nullable(),
  /** The price as printed, and in paise when code could make it one. */
  printedPrice: z.string(),
  costPaise: z.int().nullable(),
  note: z.string(),
  /** Where it is: "Rates, row 14", "Page 2", "Photo 1". */
  source: z.string(),
  /** The words of that line (not for photos, which have none). */
  excerpt: z.string(),
  /** The printed number could not be found in the line, or the sheet is a photo: the person looks at this one. */
  checkThis: z.boolean(),
  /** The supplier already has a rate for this item, meal plan, occupancy and unit in this season: its id and cost. */
  existing: z.object({ rateId: recordId, costPaise: z.int() }).nullable(),
});
export type RateSheetRow = z.infer<typeof rateSheetRow>;

export const rateSheetSourceInput = z.strictObject({ recordId, attachmentId: recordId });
export const rateSheetSourceLink = z.object({ url: z.string(), expiresAt: z.string() });

export const rateSheetProposal = z.object({
  /** The fill the save is audited with; null when nothing was read (no call was used). */
  fillId: recordId.nullable(),
  seasons: z.array(rateSheetSeason),
  rates: z.array(rateSheetRow),
  /** What the AI could not tell, in its words. */
  questions: z.array(z.string()),
  /** The parts of a big sheet (tabs or pages), in order; one or none for a sheet read at once. */
  parts: z.array(z.string()),
  /** The part this answer is from, or null when the sheet is big and a part is still to be chosen (no call was used). */
  part: z.int().nullable(),
  /** The part held more rows than one read takes: the rest are not shown. */
  cut: z.boolean(),
  /** The files that were read, which the person may open beside the rows (kept 30 days). */
  sources: z.array(z.object({ recordId, attachmentId: recordId, contentType: z.string() })),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type RateSheetProposal = z.infer<typeof rateSheetProposal>;

/** What staff saved, edited: the rows they ticked, each with its own "checked". */
export const saveRateBatchInput = z.strictObject({
  supplierId: recordId,
  fillId: recordId,
  /** The seasons the rows are in: an existing one by id, or a new one by name and dates. */
  seasons: z
    .array(
      z.strictObject({
        key: z.int().min(0).max(RATE_SHEET_SEASONS_MAX),
        seasonId: recordId.optional(),
        label: z.string().trim().max(80),
        startsOn: calendarDate.optional(),
        endsOn: calendarDate.optional(),
      }),
    )
    .max(RATE_SHEET_SEASONS_MAX),
  rates: z
    .array(
      z.strictObject({
        ref: z.string().min(1).max(12),
        seasonKey: z.int().min(0).max(RATE_SHEET_SEASONS_MAX),
        /** Set to change a rate the supplier has; left out to add one. */
        rateId: recordId.optional(),
        ...rateFields,
        /** The person looked at this price. The screen will not send a row without it. */
        checked: z.literal(true),
      }),
    )
    .min(1)
    .max(RATE_SHEET_ROWS_MAX),
});
export type SaveRateBatchInput = z.infer<typeof saveRateBatchInput>;
export const saveRateBatchResult = z.object({ seasons: z.int(), rates: z.int() });
