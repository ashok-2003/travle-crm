// What the audit log keeps of the assignment settings (release 4, spec 7): the mode, the limit, the hours, the pool's
// user ids and each rule's fields, ids only, so who joined the pool and what a rule said are not lost. An entry side is
// held to 8 KB of JSON, so a pool too large to fit is kept as its size.
import type { AssignmentSettings } from "@travel-crm/contracts/crm";
import type { AuditSnapshot } from "../../audit/index.js";

const LARGEST_POOL_LISTED = 40;

export function assignmentSnapshot(
  settings: Omit<AssignmentSettings, "pool" | "rules"> & {
    rules: readonly Pick<
      AssignmentSettings["rules"][number],
      "source" | "destinationId" | "tripType" | "assigneeUserId"
    >[];
    pool: readonly string[];
  },
): AuditSnapshot {
  return {
    mode: settings.mode,
    slowReplyMinutes: settings.slowReplyMinutes,
    workdays: settings.workdays,
    opensMinute: settings.opensMinute,
    closesMinute: settings.closesMinute,
    rules: settings.rules.map((rule) => ({
      source: rule.source,
      destinationId: rule.destinationId,
      tripType: rule.tripType,
      assigneeUserId: rule.assigneeUserId,
    })),
    ...(settings.pool.length <= LARGEST_POOL_LISTED
      ? { pool: [...settings.pool].sort() }
      : { poolSize: settings.pool.length }),
  };
}
