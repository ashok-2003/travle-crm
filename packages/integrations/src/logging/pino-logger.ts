// The Logger port's real adapter, on pino: one JSON object per line, with `level`, `time` (ISO), `process`, `msg` and
// the fields, to stdout, where Render's log explorer filters by level.
import { destination as pinoDestination, pino, stdTimeFunctions, type Logger as PinoLogger } from "pino";
import { censorFields, censorMessage } from "./censor.js";
import type { LogFields, Logger, LogLevel } from "./logger.js";

export interface PinoLoggerSettings {
  /** Which process writes: api, worker or console. */
  process: string;
  level: LogLevel;
  /** Where lines go: standard output unless a test gives another. */
  destination?: { write(line: string): unknown };
}

function wrap(instance: PinoLogger): Logger {
  const write = (level: LogLevel) => (fields: LogFields, message: string) => {
    instance[level](censorFields(fields), censorMessage(message));
  };
  return {
    child: (bindings) => wrap(instance.child(censorFields(bindings))),
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

export function createPinoLogger({ process, level, destination }: PinoLoggerSettings): Logger {
  const instance = pino(
    {
      level,
      base: { process },
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    // Synchronous, so a line written just before an exit is not lost.
    destination ?? pinoDestination({ dest: 1, sync: true }),
  );
  return wrap(instance);
}
