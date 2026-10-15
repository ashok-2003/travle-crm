// Starting a process on the services (the api and the worker alike): build them, check the bucket and start pg-boss,
// or exit 1 with one message.
import type { Environment } from "./environment.js";
import { createServices, type Services } from "./services.js";

/**
 * Builds and starts what the process runs on, or exits 1: a bucket it can't use, a database pg-boss can't reach, or
 * adapters that can't be built (a VAPID private key that isn't the public key's) all end here, with one message.
 */
export async function startedServices(environment: Environment, processName: "api" | "worker"): Promise<Services> {
  let services: Services | undefined;
  try {
    services = createServices(environment);
    await services.start();
    return services;
  } catch (error) {
    console.error(`${processName} start-up failed`, error);
    await services?.close().catch((closeError: unknown) => {
      console.error("closing the pools after the failed start-up failed too", closeError);
    });
    process.exit(1);
  }
}
