// Output of me.get: who is signed in, their organization and permissions, and anything they must do first.
import { z } from "zod";
import { permissionGrant } from "./roles.js";
import { recordId, shownEmailAddress } from "./fields.js";

/** What a member must do before the organization app lets them in. The same values are the FORBIDDEN reasons. */
export const pendingStep = z.enum(["CHANGE_PASSWORD", "SET_UP_TWO_FACTOR"]);
export type PendingStep = z.infer<typeof pendingStep>;

export const meOutput = z.object({
  user: z.object({
    id: recordId,
    name: z.string(),
    email: shownEmailAddress.nullable(),
    username: z.string().nullable(),
    twoFactorEnabled: z.boolean(),
  }),
  /** The platform admin's user id while support is impersonating this person. The web app shows a banner. */
  impersonatedBy: recordId.nullable(),
  /** Platform staff: user role "admin" and no organization. */
  isPlatformAdmin: z.boolean(),
  organization: z
    .object({
      id: recordId,
      name: z.string(),
      code: z.string(),
      requireTwoFactor: z.boolean(),
      /** An IANA zone such as "Asia/Kolkata": the web app shows dates and times in it (spec 9.6). */
      timeZone: z.string(),
    })
    .nullable(),
  member: z
    .object({
      memberId: recordId,
      role: z.object({ key: z.string(), name: z.string(), isOwner: z.boolean() }),
      permissions: z.array(permissionGrant),
    })
    .nullable(),
  pendingStep: pendingStep.nullable(),
});
export type MeOutput = z.infer<typeof meOutput>;
