// Inputs and outputs of the platform log (spec 5, 7): what platform staff did in the console, for the console.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** The fields that changed on one side, or null when there is no state on that side. */
const snapshot = z.record(z.string(), z.unknown()).nullable();

export const platformLogEntry = z.object({
  id: recordId,
  occurredAt: z.iso.datetime(),
  /** The platform admin who acted, or null for the platform's own jobs. */
  actorUserId: recordId.nullable(),
  /** "<entity>.<what happened>", e.g. "organization.onboarded". */
  action: z.string(),
  /** The kind of thing acted on, e.g. "organization" or "plan", and its id. */
  targetType: z.string(),
  targetId: z.string(),
  /** The organization the entry concerns, when there is one; it may have been purged since. */
  targetOrganizationId: recordId.nullable(),
  before: snapshot,
  after: snapshot,
});
export type PlatformLogEntry = z.infer<typeof platformLogEntry>;

/** One page of the log, newest first; optionally one organization's entries only. */
export const listPlatformLogInput = z.strictObject({
  targetOrganizationId: recordId.optional(),
  /** The id of the last entry of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type ListPlatformLogInput = z.infer<typeof listPlatformLogInput>;

export const platformLogPage = z.object({
  entries: z.array(platformLogEntry),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type PlatformLogPage = z.infer<typeof platformLogPage>;
