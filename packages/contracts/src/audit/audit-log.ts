// The audit log as its viewer shows it (audit.list): each entry with who acted, named by the api. The ids of the
// person and of an impersonating platform admin stay on the server: the viewer shows a name, or what the actor was.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { auditEntry } from "./audit.js";

/** A member's name, or null when they are no longer one of the organization's active members. */
const memberName = z.string().nullable();

/** Who made a change. */
export const auditActor = z.discriminatedUnion("kind", [
  /** A member, in the app. */
  z.object({ kind: z.literal("member"), name: memberName }),
  /** Support signed in as a member: the member's name. */
  z.object({ kind: z.literal("support-as-member"), name: memberName }),
  /** Support starting or stopping an impersonation, in its own name. */
  z.object({ kind: z.literal("support") }),
  /** A platform admin in the console: onboarding, corrections, the subscription. */
  z.object({ kind: z.literal("platform") }),
  /** The system: a job no person started. */
  z.object({ kind: z.literal("system") }),
]);
export type AuditActor = z.infer<typeof auditActor>;

export const auditLogEntry = auditEntry.omit({ actorUserId: true, impersonatedBy: true }).extend({ actor: auditActor });
export type AuditLogEntry = z.infer<typeof auditLogEntry>;

/** One page of the log, newest first. */
export const auditLogPage = z.object({
  entries: z.array(auditLogEntry),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type AuditLogPage = z.infer<typeof auditLogPage>;
