// What the jobs module reports to the worker (startWorker's onError), as a log line. Its message is the module's own,
// written from ids: a job whose event wasn't found, an organization the relay couldn't relay. Why it happened is its
// cause, given by name, code and frames. Anything else is given by name and code alone, never a message.
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

/** What the jobs module's messages are made of: names, ids, spaces and a little punctuation. Anything else is not ids only. */
const IDS_ONLY = /^[\w .:,'()-]{1,200}$/;
const FALLBACK = "A worker problem";

export function logWorkerProblem(logger: Logger): (problem: unknown) => void {
  return (problem) => {
    if (!(problem instanceof Error)) {
      logger.error(errorFields(problem), FALLBACK);
      return;
    }
    // The invariant is the jobs module's (ids only in its messages); enforced here too, so a message that isn't is never written.
    const message = IDS_ONLY.test(problem.message) ? problem.message : FALLBACK;
    if (problem.cause === undefined) logger.warn({}, message);
    else logger.error(errorFields(problem.cause), message);
  };
}
