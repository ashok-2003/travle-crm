// What a platform log entry changed, field by field, as stored: the fields that differ between its before and after
// snapshots (a plan's change keeps the whole plan on both sides), and every field of a side the other lacks.
/** The stored fields the console names in words (consolePlatform.log.fields); another shows as stored. */
export const NAMED_FIELDS = [
  "paidOn",
  "amountPaise",
  "paysThrough",
  "paidThrough",
  "paymentId",
  "status",
  "planId",
  "billingCycle",
  "extraSeats",
  "customPricePaise",
  "extraModules",
  "trialEndsOn",
  "suspendedByHand",
  "key",
  "name",
  "nameChanged",
  "monthlyPricePaise",
  "yearlyPricePaise",
  "extraSeatMonthlyPricePaise",
  "extraSeatYearlyPricePaise",
  "seatLimit",
  "whatsappNumberLimit",
  "storageLimitBytes",
  "modules",
  "archived",
  "level",
  "code",
  "timeZone",
  "contactEmail",
  "trialDays",
  "pastDueDays",
  "readOnlyDays",
  "rows",
  "people",
  "files",
  "reason",
] as const;

type NamedField = (typeof NAMED_FIELDS)[number];

export const isNamedField = (field: string): field is NamedField => (NAMED_FIELDS as readonly string[]).includes(field);

type Snapshot = Record<string, unknown> | null;

export interface Change {
  field: string;
  /** Undefined when the entry has no such field on that side. */
  before: unknown;
  after: unknown;
}

const has = (snapshot: Snapshot, field: string): snapshot is Record<string, unknown> =>
  snapshot !== null && Object.hasOwn(snapshot, field);

export function changesOf(before: Snapshot, after: Snapshot): Change[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return fields.flatMap((field) => {
    const was = has(before, field) ? before[field] : undefined;
    const is = has(after, field) ? after[field] : undefined;
    return JSON.stringify(was) === JSON.stringify(is) ? [] : [{ field, before: was, after: is }];
  });
}

/** The changes as the two snapshots AuditChange shows, each field under `name(field)` and its value `show`n. */
export function snapshotsOf(
  changes: Change[],
  name: (field: string) => string,
  show: (field: string, value: unknown) => unknown,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const change of changes) {
    if (change.before !== undefined) before[name(change.field)] = show(change.field, change.before);
    if (change.after !== undefined) after[name(change.field)] = show(change.field, change.after);
  }
  return { before, after };
}
