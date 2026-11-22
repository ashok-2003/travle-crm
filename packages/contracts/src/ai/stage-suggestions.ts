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
/** The newest 20 open suggestions, and how many are open in all (`total`), for the "Needs you" count. */
export const stageSuggestionList = z.object({ suggestions: z.array(stageSuggestion), total: z.int().min(0) });
export const leadStageSuggestionInput = z.strictObject({ leadId: recordId });
export const leadStageSuggestion = z.object({ suggestion: stageSuggestion.nullable() });
export const decideStageSuggestionInput = z.strictObject({ suggestionId: recordId, accept: z.boolean() });
export type DecideStageSuggestionInput = z.infer<typeof decideStageSuggestionInput>;

/** "AI needs you" for the signed-in member: `mine` narrows to the leads they own (and, for the AI's managers, nobody's). */
export const needsMeInput = z.strictObject({ mine: z.boolean() });
export type NeedsMeInput = z.infer<typeof needsMeInput>;
