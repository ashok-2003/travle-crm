// An error as a log line may show it: names, codes and stack frames, never its message, which can quote what the code
// was working on (an email address, a reset link). describeError (the jobs module) does the same as one string.
import { describeError } from "../jobs/describe-error.js";
import type { LogFields } from "./logger.js";

/** Names and codes come from code, not data; anything that doesn't look like one could hold anything. */
const IDENTIFIER = /^[\w.:-]{1,64}$/;
const MAX_FRAMES = 12;

/**
 * A stack's frames, in a type of their own so the censor can tell them from a string a caller wrote: it leaves these
 * whole (a package path such as `pg-boss@12.37.1_pg@8.20.0` would read as an email address) and masks every other string.
 * They serialise as the plain text.
 */
export class StackFrames {
  constructor(readonly text: string) {}

  toJSON(): string {
    return this.text;
  }

  toString(): string {
    return this.text;
  }
}

export interface ErrorFields extends LogFields {
  errorName: string;
  /** Node's, Postgres's or Prisma's code (ECONNREFUSED, 57P01, P2002), or a DomainError's reason. */
  errorCode?: string;
  /** The causes' names and codes, `Name CODE, caused by Name CODE`. */
  errorCause?: string;
  /** Only the `at ...` frames: the stack's first lines repeat the message. */
  errorStack?: StackFrames;
}

function read(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

/** A line of a V8 stack: "at", then a call and its place in brackets, or a place alone with its line and column. */
const FRAME = /^\s+at\s.*(\)|:\d+(:\d+)?)$/;

/**
 * The frames of an error's stack. The message is cut out of the stack wherever it sits (it heads the stack, and a
 * message of several lines could hold lines that look like frames, even after the error was renamed), then only lines
 * of the shape of a frame are kept.
 */
function framesOf(error: Error): StackFrames | undefined {
  const { stack } = error;
  if (stack === undefined) return undefined;
  const bare = error.message === "" ? stack : stack.split(error.message).join("");
  const lines = bare.split("\n").filter((line) => FRAME.test(line));
  return lines.length === 0 ? undefined : new StackFrames(lines.slice(0, MAX_FRAMES).join("\n"));
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
