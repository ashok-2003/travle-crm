// What a save carries when its form was filled by the AI: which fill and which of its fields were applied. The save is the
// form's own mutation (its own permission, plan and audit); this only lets the api record "drafted by AI, approved by X".
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const aiFillUse = z.strictObject({
  fillId: recordId,
  /** The paths the person applied (ticked, then Applied), e.g. "trip.destination". */
  paths: z.array(z.string().min(1).max(40)).max(40),
});
export type AiFillUse = z.infer<typeof aiFillUse>;
