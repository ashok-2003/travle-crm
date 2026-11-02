// One person the AI read out of a voice note, a list or an ID photo, to fill a booking's traveller row (release ai3). The
// row it fits is chosen by code (a named person, else the next empty row) and staff can pick another; the values are the
// traveller form's own, every one optional. An age alone never becomes a date of birth: `ageOnly` says it was only an age.
// An ID number appears only for a passport whose machine-readable lines passed their check digits, and only for a member who
// holds documents:view_sensitive. The proposal is kept nowhere: the fill's row holds the path and no hash of it.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { identityFields, travellerFields } from "../bookings/bookings.js";

export const MAX_FILL_TRAVELLERS = 20;

export const fillTraveller = z.strictObject({
  /** The name as it was said or printed: shown beside the row it was matched to. */
  saidName: z.string().max(120),
  /** The booking's row this person fills; null when no row fits (a question was asked and the person is not saved). */
  travellerId: recordId.nullable(),
  ...z.object(travellerFields).partial().shape,
  /** Only an age was said: the date of birth stays empty and still needs asking. */
  ageOnly: z.int().min(0).max(120).optional(),
  /** A passport read and checked; never from another kind of ID. */
  identity: z.strictObject(identityFields).optional(),
  /** An ID was shown but its number could not be read with certainty: staff type it. */
  idNumberUnreadable: z.boolean().optional(),
});
export type FillTraveller = z.infer<typeof fillTraveller>;
