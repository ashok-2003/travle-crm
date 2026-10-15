// Starting a process on the services (the api and the worker alike): read the environment, build the services, check
// the bucket and start pg-boss, then the process's own start, or exit 1 with one message.
import { loadEnvironment, type Environment } from "./environment.js";
import { processLog, type ProcessLog, type ProcessName } from "./process-log.js";
import { createServices, type Services } from "./services.js";

/** What a process starts on: its environment, its services and its log. */
export interface ProcessBase {
  environment: Environment;
  services: Services;
  log: ProcessLog;
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
  { variables = process.env, create = createServices }: StartProcessOptions = {},
): Promise<StartedProcess<T>> {
  let services: Services | undefined;
  try {
    const environment = loadEnvironment(variables);
    const log = processLog(processName);
    services = create(environment, log);
    await services.start();
    const running = await start({ environment, services, log });
    return { environment, services, log, running };
  } catch (error) {
    console.error(`${processName} start-up failed`, error);
    await services?.close().catch((closeError: unknown) => {
      console.error("closing the pools after the failed start-up failed too", closeError);
    });
    process.exit(1);
  }
}
