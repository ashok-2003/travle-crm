// The worker's wake-up signal (docs/runbook.md, "Waking the worker at night"). Where the night's plan stops the worker
// (scripts/server/work-hours.sh), the api tells the host that work came in by writing the time to WORK_SIGNAL_FILE, a
// file the host shares with the api's container: the host's travel-crm-work-wake.path starts the worker, and it stops
// again after a few quiet minutes. At most one write in WRITE_GAP_MS, since the host only asks whether work came within
// its last quiet minutes. A failed write is logged once and never fails the request.
import { writeFile } from "node:fs/promises";
import type { MiddlewareHandler } from "hono";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

export const WRITE_GAP_MS = 30_000;

export function createWorkSignal(options: { file: string; logger: Logger; now?: () => number }): () => void {
  const now = options.now ?? Date.now;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let warned = false;
  return () => {
    const at = now();
    if (at - lastWrite < WRITE_GAP_MS) return;
    lastWrite = at;
    writeFile(options.file, `${String(Math.floor(at / 1000))}\n`).catch((error: unknown) => {
      if (warned) return;
      warned = true;
      options.logger.warn(errorFields(error), "The worker's wake-up signal could not be written");
    });
  };
}

/** Signals after a public POST the route took (a form sent, a quote accepted): what it did may be the worker's to finish. */
export function signalTakenPosts(signalWork: () => void): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.req.method === "POST" && c.res.status < 400) signalWork();
  };
}
