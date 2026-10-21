// How new leads find their owner (release C, spec 3.2): the agency's mode, the rules tried first, the pool that takes
// turns, and how long a new lead may wait for a reply before managers are told. Leads added by hand keep whoever adds
// them; leads that arrive by themselves are assigned by these.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { leadSource, tripType } from "./fields.js";

/** Everything to the agency's Owner; the pool in turn; or the pool member with the fewest open leads. */
export const assignmentModes = ["owner", "turns", "fewest_open"] as const;
export const assignmentMode = z.enum(assignmentModes);
export type AssignmentMode = z.infer<typeof assignmentMode>;

export const MAX_ASSIGNMENT_RULES = 50;

/** A rule: a lead matching every condition given goes to the person. At least one condition. */
export const assignmentRuleInput = z
  .strictObject({
    source: leadSource.nullable(),
    destinationId: recordId.nullable(),
    tripType: tripType.nullable(),
    assigneeUserId: recordId,
  })
  .refine((rule) => rule.source !== null || rule.destinationId !== null || rule.tripType !== null, {
    message: "Give the rule at least one condition",
  });
export type AssignmentRuleInput = z.infer<typeof assignmentRuleInput>;

export const saveAssignmentInput = z.strictObject({
  mode: assignmentMode,
  /** Minutes a new lead may wait for a first reply before managers are told; null for never. */
  slowReplyMinutes: z.int().min(1).max(1440).nullable(),
  /** Tried in this order. */
  rules: z.array(assignmentRuleInput).max(MAX_ASSIGNMENT_RULES),
  /** Who takes turns (or the fewest open leads): lead workers. */
  pool: z.array(recordId).max(500),
});
export type SaveAssignmentInput = z.infer<typeof saveAssignmentInput>;

export const assignmentSettings = z.object({
  mode: assignmentMode,
  slowReplyMinutes: z.int().nullable(),
  rules: z.array(
    z.object({
      id: recordId,
      source: leadSource.nullable(),
      destinationId: recordId.nullable(),
      /** The destination's name, for the screen. */
      destinationName: z.string().nullable(),
      tripType: tripType.nullable(),
      assigneeUserId: recordId,
    }),
  ),
  pool: z.array(z.object({ userId: recordId, awayUntil: z.iso.datetime().nullable() })),
});
export type AssignmentSettings = z.infer<typeof assignmentSettings>;

/** A new lead's first-reply check, queued for when its wait runs out: ids only (job data is never personal). */
export const firstReplyCheckJob = z.strictObject({
  organizationId: recordId,
  leadId: recordId,
  sourceEventId: recordId,
});
export type FirstReplyCheckJob = z.infer<typeof firstReplyCheckJob>;

/** The signed-in person's place in the pool: whether they take new leads in turn, and until when they are away. */
export const poolPlace = z.object({ inPool: z.boolean(), awayUntil: z.iso.datetime().nullable() });
export type PoolPlace = z.infer<typeof poolPlace>;

/** The signed-in person marks themselves away (skipped by the turns) until a time, or back (null). */
export const setAwayInput = z.strictObject({ awayUntil: z.iso.datetime().nullable() });
export type SetAwayInput = z.infer<typeof setAwayInput>;
