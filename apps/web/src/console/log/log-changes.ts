// What a platform log entry changed, field by field, as stored: the fields that differ between its before and after
// snapshots (a plan's change keeps the whole plan on both sides), and every field of a side the other lacks. Values
// show as stored: text as it is, anything else as JSON.
type Snapshot = Record<string, unknown> | null;

export interface Change {
  field: string;
  /** Null when the entry has no such field on that side. */
  before: string | null;
  after: string | null;
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

export function changesOf(before: Snapshot, after: Snapshot): Change[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return fields.flatMap((field) => {
    const was = before !== null && Object.hasOwn(before, field) ? textOf(before[field]) : null;
    const is = after !== null && Object.hasOwn(after, field) ? textOf(after[field]) : null;
    return was === is ? [] : [{ field, before: was, after: is }];
  });
}
