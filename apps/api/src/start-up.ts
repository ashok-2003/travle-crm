// Starting a process on the services (the api, the worker and the console alike): read the environment, build the
// services, check the bucket and start pg-boss, then the process's own start, or exit 1 with one message. And its last
// resort once started: an error nothing handled ends it through its own drain.
import { describeError } from "@travel-crm/integrations/jobs";
import { createPinoLogger, type Logger } from "@travel-crm/integrations/logging";
import { loadEnvironment, type Environment } from "./environment.js";
import { processLog, type ProcessLog, type ProcessName } from "./process-log.js";
import { createServices, type Services } from "./services.js";

/** What a process starts on: its environment, its services and its log. */
export interface ProcessBase {
  environment: Environment;
  services: Services;
  log: ProcessLog;
  /** The process's structured log (ADR 0032): JSON lines at the environment's LOG_LEVEL. */
  logger: Logger;
}

export interface StartedProcess<T> extends ProcessBase {
  /** What the process's own start returned, e.g. the worker. */
  running: T;
}

export interface StartProcessOptions {
  /** The environment variables; process.env unless a test gives others. */
  variables?: Record<string, string | undefined>;
  /** How the services are built; createServices unless a test gives others. */
  create?: (environment: Environment, log: ProcessLog) => Services;
  /** The structured log; a pino logger on standard output unless a test gives another. */
  createLogger?: (processName: ProcessName, environment: Environment) => Logger;
}

function pinoLoggerFor(processName: ProcessName, environment: Environment): Logger {
  return createPinoLogger({ process: processName, level: environment.LOG_LEVEL });
}

/**
 * Starts the process, or exits 1: an invalid environment, a bucket it can't use, a database pg-boss can't reach,
 * adapters that can't be built (a VAPID private key that isn't the public key's) and a failing start of the process's
 * own (a repeated queue name, a schedule pg-boss refuses) all end here, with one "<process> start-up failed" message
 * and the pools closed.
 *
 * The message holds the error in full: the one exception to the ids-only log. What has run by then is set-up: the
 * environment check, the services' checks (the database role, the bucket) and pg-boss's start, and for the worker its
 * schedules and queues, whose jobs pg-boss may already have begun. No request has been served and the relay hasn't
 * started. The error comes from that set-up (a variable, a connection, pg-boss refusing a schedule or a queue), not
 * from a request or a job, so it quotes no one's data.
 */
export async function startProcess<T>(
  processName: ProcessName,
  start: (base: ProcessBase) => Promise<T> | T,
  { variables = process.env, create = createServices, createLogger = pinoLoggerFor }: StartProcessOptions = {},
): Promise<StartedProcess<T>> {
  let services: Services | undefined;
  try {
    const environment = loadEnvironment(variables);
    const log = processLog(processName);
    const logger = createLogger(processName, environment);
    services = create(environment, log);
    await services.start();
    const running = await start({ environment, services, log, logger });
    return { environment, services, log, logger, running };
  } catch (error) {
    console.error(`${processName} start-up failed`, error);
    await services?.close().catch((closeError: unknown) => {
      console.error("closing the pools after the failed start-up failed too", closeError);
    });
    process.exit(1);
  }
}

/**
 * How long the drain after an error nothing handled may take: past pg-boss's 30 seconds for running jobs, with room to
 * close the pools. After an uncaught exception Node calls the process's state undefined, so a drain that hangs (a
 * stuck pool, a keep-alive the server won't close) must not leave it up and serving nothing.
 */
const DRAIN_LIMIT_MS = 45_000;

export interface LastResortOptions {
  /** What it listens on: the process itself, unless a test gives an emitter of its own. */
  events?: Pick<NodeJS.EventEmitter, "on">;
  /** How it ends the process when the drain takes too long: process.exit, unless a test gives another. */
  exit?: (exitCode: 1) => void;
}

/**
 * A promise rejected with nothing to handle it, or an exception nothing caught, ends the process as SIGTERM does, but
 * exiting 1: one line in the process's log by names and codes (Node's default prints the error in full, with its
 * message, which can quote what the code was working on: an email address, a reset link), then `drain`, the process's
 * own shutdown, which has 45 seconds before the process exits anyway. Another one while it drains is logged and
 * drains nothing more.
 */
export function stopOnUnhandledErrors(
  log: ProcessLog,
  drain: (exitCode: 1) => void,
  { events = process, exit = (exitCode) => process.exit(exitCode) }: LastResortOptions = {},
): void {
  let draining = false;
  const stop = (what: string) => (error: unknown) => {
    log(`${what}: ${describeError(error)}`);
    if (draining) return;
    draining = true;
    // Unref'd: a drain that finishes exits at once, never waiting on this.
    setTimeout(() => {
      log("the drain took over 45 seconds: exiting");
      exit(1);
    }, DRAIN_LIMIT_MS).unref();
    drain(1);
  };
  events.on("unhandledRejection", stop("unhandled rejection"));
  events.on("uncaughtException", stop("uncaught exception"));
}
