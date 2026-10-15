// Ids: every record's id is a UUID (v7 from the database; v4 and v8 elsewhere), checked the same way everywhere.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is a UUID of any version, in either case. */
export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
