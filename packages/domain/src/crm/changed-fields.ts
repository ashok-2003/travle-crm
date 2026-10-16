// What an edit changed, for its audit entry (spec 9.5: snapshots are curated, never the whole row): only the fields
// whose values differ, before and after. An edit that changes nothing has nothing to record.
import type { AuditSnapshot } from "../audit/index.js";
import type { JsonValue } from "../jobs/index.js";

type Snapshot = Readonly<Record<string, JsonValue>>;

/** The changed fields of two snapshots of the same record, or null when none changed. */
export function changedFields(
  before: Snapshot,
  after: Snapshot,
): { before: AuditSnapshot; after: AuditSnapshot } | null {
  const changed = Object.keys(after).filter(
    (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key]),
  );
  if (changed.length === 0) return null;
  const pick = (side: Snapshot) => Object.fromEntries(changed.map((key) => [key, side[key] ?? null]));
  return { before: pick(before), after: pick(after) };
}
