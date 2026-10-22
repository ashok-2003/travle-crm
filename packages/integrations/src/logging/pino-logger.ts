// The Logger port's real adapter, on pino: one JSON object per line, with `level`, `time` (ISO), `process`, `msg` and
// the fields, to stdout, where Render's log explorer filters by level. With an Axiom dataset configured, every line is
// also shipped there by a transport in a worker thread (axiom-transport.ts). Logging never throws and never loops: a
// shipper that dies (the thread can't load, crashes, or is written to after it ended) is dropped with one line on stderr,
// and a failure inside a log call is swallowed, because the handler for an unhandled error logs too.
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
  axiom?: Omit<AxiomTransportOptions, "url"> & {
    url?: string;
    /** The transport's module; tests point it at a file that isn't there. */
    transportFile?: string;
  };
}

/** The transport's module beside this one: the TypeScript source in development and tests, the bundle's entry in the image. */
const axiomTransportFile = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "./axiom-transport.ts" : "./axiom-transport.mjs", import.meta.url),
);

/** Closing waits this long for the transport to post what it holds, then lets go: a shutdown must end. */
const CLOSE_LIMIT_MS = 8000;

function wrap(instance: PinoLogger, close: () => Promise<void>): ClosableLogger {
  const write = (level: LogLevel) => (fields: LogFields, message: string) => {
    try {
      instance[level](censorFields(fields), censorMessage(message));
    } catch {
      // A log call must not fail its caller, least of all the handler of an unhandled error.
    }
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

export function createPinoLogger({
  process: processName,
  level,
  destination,
  axiom,
}: PinoLoggerSettings): ClosableLogger {
  // Synchronous, so a line written just before an exit is not lost.
  const local = destination ?? pinoDestination({ dest: 1, sync: true });
  let shipping: ReturnType<typeof transport> | undefined;
  let shippingOpen = false;
  const stopShipping = (why: string) => {
    if (!shippingOpen) return;
    shippingOpen = false;
    // Straight to stderr, not through the logger: this runs where the logger's own stream failed.
    process.stderr.write(`axiom: shipping stopped (${why}); lines still go to standard output\n`);
  };
  if (axiom !== undefined) {
    const { transportFile = axiomTransportFile, ...options } = axiom;
    try {
      shipping = transport({ target: transportFile, options: { url: "https://api.axiom.co", ...options } });
      shippingOpen = true;
      shipping.on("error", (error: unknown) => {
        stopShipping(error instanceof Error ? error.name : "error");
      });
    } catch (error) {
      stopShipping(error instanceof Error ? error.name : "error");
    }
  }
  const thread = shipping;
  // The shipper behind a guard: once it is dead or closed, lines are dropped before they reach a stream that would throw.
  const shipper = {
    write: (line: string) => {
      if (!shippingOpen || thread === undefined) return;
      try {
        thread.write(line);
      } catch (error) {
        stopShipping(error instanceof Error ? error.name : "error");
      }
    },
  };
  const instance = pino(
    {
      level,
      base: { process: processName },
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    thread === undefined
      ? local
      : multistream([
          { level, stream: local },
          { level, stream: shipper },
        ]),
  );
  const close = async (): Promise<void> => {
    if (thread === undefined || !shippingOpen) return;
    shippingOpen = false;
    const closed = new Promise<void>((resolve) => thread.once("close", resolve));
    try {
      thread.end();
    } catch {
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CLOSE_LIMIT_MS);
    });
    await Promise.race([closed, limit]);
    clearTimeout(timer);
  };
  return wrap(instance, close);
}
