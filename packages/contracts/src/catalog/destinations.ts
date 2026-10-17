// Destinations as the api carries them (spec 3.6): the agency's own list, searched from the lead form, renamed and
// merged in Settings.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** A destination's name as typed: trimmed, inner spaces collapsed, 1-80 characters. */
export const destinationName = z
  .string()
  .max(200)
  .transform((name) => name.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Name the destination").max(80));

export const destination = z.object({ id: recordId, name: z.string() });
export type Destination = z.infer<typeof destination>;

export const searchDestinationsInput = z.strictObject({
  /** Part of the name, forgiving of typos; none lists them all, alphabetically. */
  query: z.string().trim().max(80).optional(),
  limit: z.int().min(1).max(100).default(20),
});
export type SearchDestinationsInput = z.infer<typeof searchDestinationsInput>;

export const renameDestinationInput = z.strictObject({ destinationId: recordId, name: destinationName });
export type RenameDestinationInput = z.infer<typeof renameDestinationInput>;

/** Merges one destination into another: its leads and enquiries move to the kept one. */
export const mergeDestinationsInput = z
  .strictObject({ destinationId: recordId, intoDestinationId: recordId })
  .refine((input) => input.destinationId !== input.intoDestinationId, {
    message: "Choose another destination to keep",
    path: ["intoDestinationId"],
  });
export type MergeDestinationsInput = z.infer<typeof mergeDestinationsInput>;

export const mergedDestinations = z.object({ leadsMoved: z.int().min(0) });
export type MergedDestinations = z.infer<typeof mergedDestinations>;

/** The payload of destination.added and destination.renamed: ids only. */
export const destinationEvent = z.strictObject({ destinationId: recordId });
export type DestinationEvent = z.infer<typeof destinationEvent>;

/** The payload of destination.merged: the one merged away and the one kept. */
export const destinationMergedEvent = z.strictObject({ destinationId: recordId, intoDestinationId: recordId });
export type DestinationMergedEvent = z.infer<typeof destinationMergedEvent>;
