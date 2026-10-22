// What the jobs module reports to the worker (startWorker's onError), as a log line. Its message is the module's own,
// written from ids: a job whose event wasn't found, an organization the relay couldn't relay. Why it happened is its
// cause, given by name, code and frames. Anything else is given by name and code alone, never a message.
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

export function logWorkerProblem(logger: Logger): (problem: unknown) => void {
  return (problem) => {
    if (!(problem instanceof Error)) {
      logger.error(errorFields(problem), "A worker problem");
    } else if (problem.cause === undefined) {
      logger.warn({}, problem.message);
    } else {
      logger.error(errorFields(problem.cause), problem.message);
    }
  };
}
