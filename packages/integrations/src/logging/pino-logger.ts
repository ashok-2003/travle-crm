// The Logger port's real adapter, on pino: one JSON object per line, with `level`, `time` (ISO), `process`, `msg` and
// the fields, to stdout, where Render's log explorer filters by level. With an Axiom dataset configured, every line is
// also shipped there by a transport in a worker thread (axiom-transport.ts).
import { fileURLToPath } from "node:url";
import {
  destination as pinoDestination,
  multistream,
  pino,
  stdTimeFunctions,
  transport,
  type Logger as PinoLogger,
} from "pino";
import type { AxiomTransportOptions } from "./axiom-transport.js";
import { censorFields, censorMessage } from "./censor.js";
import type { ClosableLogger, LogFields, LogLevel } from "./logger.js";

export interface PinoLoggerSettings {
  /** Which process writes: api, worker or console. */
  process: string;
  level: LogLevel;
  /** Where lines go: standard output unless a test gives another. */
  destination?: { write(line: string): unknown };
  /** Also ship every line to this Axiom dataset (AXIOM_TOKEN, AXIOM_DATASET, and AXIOM_URL for another region). */
  axiom?: Omit<AxiomTransportOptions, "url"> & { url?: string };
}

/** The transport's module beside this one: the TypeScript source in development and tests, the bundle's entry in the image. */
const axiomTransportFile = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "./axiom-transport.ts" : "./axiom-transport.mjs", import.meta.url),
);

/** Closing waits for the transport to post what is queued, but never longer than this: a shutdown must end. */
const CLOSE_LIMIT_MS = 10_000;

function wrap(instance: PinoLogger, close: () => Promise<void>): ClosableLogger {
  const write = (level: LogLevel) => (fields: LogFields, message: string) => {
    instance[level](censorFields(fields), censorMessage(message));
  };
  return {
    close,
    child: (bindings) => wrap(instance.child(censorFields(bindings)), close),
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

export function createPinoLogger({ process, level, destination, axiom }: PinoLoggerSettings): ClosableLogger {
  // Synchronous, so a line written just before an exit is not lost.
  const local = destination ?? pinoDestination({ dest: 1, sync: true });
  const shipping =
    axiom === undefined
      ? undefined
      : transport({ target: axiomTransportFile, options: { url: "https://api.axiom.co", ...axiom } });
  const instance = pino(
    {
      level,
      base: { process },
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    shipping === undefined
      ? local
      : multistream([
          { level, stream: local },
          { level, stream: shipping },
        ]),
  );
  const close = async (): Promise<void> => {
    if (shipping === undefined) return;
    const closed = new Promise<void>((resolve) => shipping.once("close", resolve));
    shipping.end();
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CLOSE_LIMIT_MS);
    });
    await Promise.race([closed, limit]);
    clearTimeout(timer);
  };
  return wrap(instance, close);
}
