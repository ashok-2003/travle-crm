// The console's hourly sweep of the AI's turn traces: a trace is kept 14 days, or less when its customer is erased
// (erasure marks it due). Each page's files are deleted from storage first (a missing file is no error), then the page's
// rows in one platform transaction; a file that will not delete keeps its row for the next run, and the run fails at its
// end counting them.
import { ownMessages } from "@travel-crm/integrations/jobs";
import { forgetTraces, tracesDue } from "../ai/index.js";
import type { ScheduledJob } from "../jobs/index.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_AI_TRACES_QUEUE = "platform.sweep-ai-traces";

const PAGE = 200;

/** Some traces' files couldn't be deleted in a run: their rows stay for the next. Counts only, the first error as its cause. */
export class AiTracesSweepFailedError extends AggregateError {
  static {
    ownMessages(this);
  }

  override readonly name = "AiTracesSweepFailedError";

  constructor(errors: readonly unknown[], swept: number) {
    super(errors, `${String(errors.length)} traces couldn't be swept and ${String(swept)} were`, {
      cause: errors[0],
    });
  }
}

/** Deletes the traces past their time, rows and files; returns how many it swept. */
export async function sweepAiTraces(services: PlatformServices, now: Date): Promise<number> {
  let swept = 0;
  const failed: unknown[] = [];
  const visited: string[] = [];
  for (;;) {
    const page = await services.platformDb.transaction((tx) => tracesDue(tx, now, PAGE, visited));
    if (page.length === 0) break;
    const gone: string[] = [];
    for (const trace of page) {
      try {
        await services.storage.delete(trace.fileKey);
        gone.push(trace.id);
      } catch (error) {
        visited.push(trace.id);
        failed.push(error);
      }
    }
    swept += await services.platformDb.transaction((tx) => forgetTraces(tx, gone));
  }
  if (failed.length > 0) throw new AiTracesSweepFailedError(failed, swept);
  return swept;
}

/** Hourly, at 47 minutes past, away from the other sweeps. */
export function aiTracesSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_AI_TRACES_QUEUE,
    cron: "47 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepAiTraces(services, new Date());
    },
  };
}
