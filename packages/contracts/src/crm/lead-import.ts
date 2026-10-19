// A lead import's fields and inputs (spec B8, B11, B12): the 23 fields a column may hold, the stages a file's rows may
// default to, and what the importer sends when matching columns and deciding on blocked and already imported rows.
// Lead import adds its own shapes here later.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { MAX_LISTED_VALUES } from "../imports/listed-values.js";
import { budgetBasis, leadStage, openLeadStages } from "./fields.js";

/** What a column of a lead file may hold. Name and one of phone, email or Instagram are needed. */
export const leadImportFields = [
  "name",
  "phone",
  "email",
  "instagram",
  "destination",
  "travel_from",
  "travel_to",
  "travel_month",
  "adults",
  "children_ages",
  "children_count",
  "budget",
  "budget_basis",
  "departure_city",
  "trip_type",
  "hotel_category",
  "food",
  "room_type",
  "stage",
  "owner",
  "enquiry_date",
  "their_source",
  "note",
] as const;
export const leadImportField = z.enum(leadImportFields);
export type LeadImportField = z.infer<typeof leadImportField>;

/** The stages a file's rows may default to: an open stage, Won or Lost. An import never adds into Not a lead (B17). */
export const leadImportStages = [...openLeadStages, "won", "lost"] as const;
export const leadImportStage = z.enum(leadImportStages);
export type LeadImportStage = z.infer<typeof leadImportStage>;

/** The most characters a listed value has: longer ones aren't listed, so they can't be matched one by one. */
export const MAX_MATCHED_VALUE_LENGTH = 200;
const matchedValue = z.string().min(1).max(MAX_MATCHED_VALUE_LENGTH);

export const matchLeadColumnsInput = z.strictObject({
  importId: recordId,
  columns: z.array(z.strictObject({ position: z.int().min(0).max(49), field: leadImportField.nullable() })).max(50),
  /**
   * The values the importer changed: an Owner value to a lead worker, a Stage value to a stage; null for the default.
   * A column lists at most 50 values (MAX_LISTED_VALUES), so 100 at most: an Owner and a Stage column's (D6).
   */
  values: z
    .array(
      z.discriminatedUnion("field", [
        z.strictObject({ field: z.literal("owner"), value: matchedValue, target: recordId.nullable() }),
        z.strictObject({ field: z.literal("stage"), value: matchedValue, target: leadStage.nullable() }),
      ]),
    )
    .max(MAX_LISTED_VALUES * 2),
  defaults: z.strictObject({
    stage: leadImportStage,
    ownerUserId: recordId.nullable(),
    budgetBasis: budgetBasis.nullable(),
  }),
});
export type MatchLeadColumnsInput = z.infer<typeof matchLeadColumnsInput>;

/**
 * Whether the add takes the blocked contacts' rows and the rows already imported (B16, B33), and a sheet's rows for
 * people who already have a lead (in_crm, the Sheets sync): off when not sent, as a file's preview never asks.
 */
export const decideLeadImportInput = z.strictObject({
  importId: recordId,
  addBlocked: z.boolean(),
  addAlreadyImported: z.boolean(),
  addInCrm: z.boolean().default(false),
});
export type DecideLeadImportInput = z.input<typeof decideLeadImportInput>;
