// An error as a log line may show it: names, codes and stack frames, never its message, which can quote what the code
// was working on (an email address, a reset link). describeError (the jobs module) does the same as one string.
import { describeError } from "../jobs/describe-error.js";

/** Names and codes come from code, not data; anything that doesn't look like one could hold anything. */
const IDENTIFIER = /^[\w.:-]{1,64}$/;
const MAX_FRAMES = 12;

export interface ErrorFields {
  errorName: string;
  /** Node's, Postgres's or Prisma's code (ECONNREFUSED, 57P01, P2002), or a DomainError's reason. */
  errorCode?: string;
  /** The causes' names and codes, `Name CODE, caused by Name CODE`. */
  errorCause?: string;
  /** Only the `at ...` frames: the stack's first lines repeat the message. */
  errorStack?: string;
}

function read(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

/** The frames of an error's stack, after the `Name: message` head (whose message may span lines). */
function framesOf(error: Error): string | undefined {
  const { stack } = error;
  if (stack === undefined) return undefined;
  const head = error.message === "" ? error.name : `${error.name}: ${error.message}`;
  const frames = stack.startsWith(head) ? stack.slice(head.length) : stack;
  const lines = frames.split("\n").filter((line) => /^\s+at /.test(line));
  return lines.length === 0 ? undefined : lines.slice(0, MAX_FRAMES).join("\n");
}

export function errorFields(error: unknown): ErrorFields {
  if (typeof error !== "object" || error === null) return { errorName: error === null ? "null" : typeof error };
  const name = read(error, "name");
  const code = read(error, "code");
  const fields: ErrorFields = { errorName: typeof name === "string" && IDENTIFIER.test(name) ? name : "Error" };
  const shownCode = typeof code === "number" || typeof code === "string" ? String(code) : "";
  if (IDENTIFIER.test(shownCode)) fields.errorCode = shownCode;
  const cause = read(error, "cause");
  if (cause !== undefined) fields.errorCause = describeError(cause);
  const stack = error instanceof Error ? framesOf(error) : undefined;
  if (stack !== undefined) fields.errorStack = stack;
  return fields;
}
