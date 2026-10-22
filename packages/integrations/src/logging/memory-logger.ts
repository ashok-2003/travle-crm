// The Logger port's in-memory adapter: lines kept in an array, censored as the real adapter censors them, for tests.
import { censorFields, censorMessage } from "./censor.js";
import type { ClosableLogger, LogFields, LogLevel } from "./logger.js";

export interface LogEntry extends LogFields {
  level: LogLevel;
  msg: string;
}

export interface MemoryLogger extends ClosableLogger {
  /** Every line written by this logger or any child, in order. */
  entries: LogEntry[];
}

export interface MemoryLoggerOptions {
  /**
   * Whether the lines are censored as the real adapter censors them (the default). A contract test turns it off, so the
   * lines are exactly what a call site passed: a call site that passes personal data then fails its test, instead of
   * being saved by the same censor the test would check.
   */
  censor?: boolean;
}

function memoryLoggerOver(entries: LogEntry[], bindings: LogFields, censor: boolean): MemoryLogger {
  const write = (level: LogLevel) => (fields: LogFields, message: string) => {
    const merged = { ...bindings, ...fields };
    entries.push(
      censor ? { ...censorFields(merged), level, msg: censorMessage(message) } : { ...merged, level, msg: message },
    );
  };
  return {
    entries,
    close: () => Promise.resolve(),
    child: (more) => memoryLoggerOver(entries, { ...bindings, ...more }, censor),
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

export function createMemoryLogger({ censor = true }: MemoryLoggerOptions = {}): MemoryLogger {
  return memoryLoggerOver([], {}, censor);
}
