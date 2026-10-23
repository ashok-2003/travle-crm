// Leads that couldn't be added, with a reason each (spec 3.3). The ledger holds no answer and no contact: a problem row
// keeps only a short example name, emptied when fixed and on erasure.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** The codes a ledger row's reasons hold (CHECK meta_lead_reasons_value). */
export const metaProblemReasons = [
  "no_name",
  "no_contact",
  "phone_invalid",
  "notes_too_long",
  "blocked",
  "erased",
  "could_not_add",
  "lead_not_found",
  "lead_not_allowed",
] as const;
export const metaProblemReason = z.enum(metaProblemReasons);
export type MetaProblemReason = z.infer<typeof metaProblemReason>;

export const metaLeadStatuses = ["pending", "added", "merged", "duplicate", "not_added", "erased"] as const;
export const metaLeadStatus = z.enum(metaLeadStatuses);
export type MetaLeadStatus = z.infer<typeof metaLeadStatus>;

export const metaLeadPlatforms = ["facebook", "instagram", "other"] as const;
export const metaLeadPlatform = z.enum(metaLeadPlatforms);
export type MetaLeadPlatform = z.infer<typeof metaLeadPlatform>;

export const metaProblemView = z.object({
  id: recordId,
  formName: z.string().nullable(),
  reasons: z.array(metaProblemReason),
  exampleName: z.string().nullable(),
  platform: metaLeadPlatform.nullable(),
  firstSeenAt: z.iso.datetime(),
});
export type MetaProblemView = z.infer<typeof metaProblemView>;

export const metaProblemList = z.object({
  items: z.array(metaProblemView),
  /** The last item's id when there are more. */
  next: recordId.nullable(),
});
export type MetaProblemList = z.infer<typeof metaProblemList>;
