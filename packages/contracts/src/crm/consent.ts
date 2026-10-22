// A person's marketing consent as the person card shows it (website form spec 3.9, 7.3): the latest ledger row decides.
import { z } from "zod";

export const personConsentState = z.object({
  /** Null when the person never agreed nor withdrew: the card shows nothing. */
  state: z.enum(["granted", "withdrawn"]).nullable(),
  at: z.iso.datetime().nullable(),
  /** The latest row came from the website form, so the card says so and nobody mistakes it for something said by phone. */
  fromForm: z.boolean(),
});
export type PersonConsentState = z.infer<typeof personConsentState>;
