// The Logger port (ADR 0032): what domain and api code call to write a line. Lines hold ids, codes, counts and timings,
// never personal data; the adapters censor what slips through, but the caller's job is to not pass it.

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** The fields of one line: ids, codes, counts, timings. */
export type LogFields = Record<string, unknown>;

export interface Logger {
  /** A logger whose every line carries `bindings` too (a request id, an organization id). */
  child(bindings: LogFields): Logger;
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}
