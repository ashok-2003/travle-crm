// The lite agent's suggestion to mark a lead Lost or Not a lead, and a person's yes or no.
import { z } from "zod";
import { lostReason } from "../crm/fields.js";
import { recordId } from "../identity/fields.js";

export const stageSuggestion = z.object({
  id: recordId,
  leadId: recordId,
  /** The person's name, for the "Needs you" list. */
  name: z.string(),
  kind: z.enum(["lost", "not_a_lead"]),
  lostReason: lostReason.nullable(),
  reason: z.string(),
  createdAt: z.iso.datetime(),
});
export type StageSuggestion = z.infer<typeof stageSuggestion>;
export const stageSuggestionList = z.object({ suggestions: z.array(stageSuggestion) });
export const leadStageSuggestionInput = z.strictObject({ leadId: recordId });
export const leadStageSuggestion = z.object({ suggestion: stageSuggestion.nullable() });
export const decideStageSuggestionInput = z.strictObject({ suggestionId: recordId, accept: z.boolean() });
export type DecideStageSuggestionInput = z.infer<typeof decideStageSuggestionInput>;
