// What a log line says about an error (spec 9.1: one log, ids and codes only): names and codes, never a message. A
// message, or the object itself, can quote what the code was working on: an email address, a phone number, a link.

/** How far down the cause chain a description goes: the error, its cause, and that one's cause. */
const LEVELS = 3;

/** Names and codes come from code, not data; anything that doesn't look like one could hold anything, so it's left out. */
const IDENTIFIER = /^[\w.:-]{1,64}$/;

function field(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function describeOne(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  const name = field(value, "name");
  const code = field(value, "code");
  const shownName = typeof name === "string" && IDENTIFIER.test(name) ? name : "Error";
  const shownCode = typeof code === "number" || typeof code === "string" ? String(code) : "";
  return IDENTIFIER.test(shownCode) ? `${shownName} ${shownCode}` : shownName;
}

/**
 * An error as a log may show it: `Name CODE`, then `, caused by Name CODE` for each cause, three levels down. The code
 * is shown when there is one (Prisma's P2028, Node's ECONNREFUSED, a Postgres SQLSTATE). Works for anything thrown,
 * including the plain objects pg-boss emits.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let level = 0; level < LEVELS; level += 1) {
    parts.push(describeOne(current));
    if (typeof current !== "object" || current === null) break;
    current = field(current, "cause");
    if (current === undefined) break;
  }
  return parts.join(", caused by ");
}
