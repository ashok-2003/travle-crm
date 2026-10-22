// The Logger port's in-memory adapter: lines kept in an array, censored as the real adapter censors them, for tests.
import { censorFields, censorMessage } from "./censor.js";
import type { LogFields, Logger, LogLevel } from "./logger.js";

export interface LogEntry extends LogFields {
  level: LogLevel;
  msg: string;
}

export interface MemoryLogger extends Logger {
  /** Every line written by this logger or any child, in order. */
  entries: LogEntry[];
}

function memoryLoggerOver(entries: LogEntry[], bindings: LogFields): MemoryLogger {
  const write = (level: LogLevel) => (fields: LogFields, message: string) => {
    entries.push({ ...censorFields({ ...bindings, ...fields }), level, msg: censorMessage(message) });
  };
  return {
    entries,
    child: (more) => memoryLoggerOver(entries, { ...bindings, ...more }),
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

export function createMemoryLogger(): MemoryLogger {
  return memoryLoggerOver([], {});
}
