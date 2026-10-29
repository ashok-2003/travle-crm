// Who on the team hears what (the owner, 2026-10-29): the members who also get their notifications by email, and the
// members who get a copy of every team alert. Chosen by whoever manages settings.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

const members = z.array(recordId).max(200);

export const saveTeamRoutingInput = z.strictObject({ emailUserIds: members, copyUserIds: members });
export type SaveTeamRoutingInput = z.infer<typeof saveTeamRoutingInput>;

export const teamRouting = z.object({
  emailUserIds: z.array(recordId),
  copyUserIds: z.array(recordId),
  /** The members to choose from: every active member, with whether they have an email to send to. */
  members: z.array(z.object({ userId: recordId, name: z.string(), hasEmail: z.boolean() })),
});
export type TeamRouting = z.infer<typeof teamRouting>;
