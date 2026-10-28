// Public API of @travel-crm/contracts/usage: what the web app reports of a member's use (a page opened, and for how
// long), and the welcome a member sees once (the invite program's, or every new organization's).
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** A page's route as the app reports it: ids replaced by ":id", no query, never a search or a name. */
export const pageRoute = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9/_:.-]*$/, "A route, its ids replaced");

/** A page opened (no visitId) or still open (its visitId and the seconds on it so far). */
export const trackVisitInput = z.strictObject({
  visitId: recordId.optional(),
  path: pageRoute,
  seconds: z.int().min(0).max(86_400),
});
export const trackedVisit = z.object({ visitId: recordId.nullable() });

export const welcome = z.object({
  /** Whether this member still has the welcome to see. */
  show: z.boolean(),
  /** The organization came through the invite program. */
  vip: z.boolean(),
  trialDays: z.int().nullable(),
});
export type Welcome = z.infer<typeof welcome>;

/** What opening an invite's link answers (the invite program): how to sign the owner in, or that they joined already. */
export const vipInviteOpened = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("signIn"),
    orgCode: z.string(),
    username: z.string(),
    /** A one-time password the web app signs in with at once; the owner never sees or types it. */
    password: z.string(),
    companyName: z.string(),
    ownerName: z.string(),
    trialDays: z.int(),
  }),
  z.object({ state: z.literal("joined"), orgCode: z.string(), companyName: z.string() }),
  z.object({ state: z.literal("closed") }),
]);
export type VipInviteOpened = z.infer<typeof vipInviteOpened>;
