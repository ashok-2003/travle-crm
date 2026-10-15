// Each process's one log (spec 9.1): a line per problem on stderr, `<process>: <line>`, ids and codes only.
// Lines are written by our code from ids and codes; errors appear as their names and codes, never their messages or
// the objects, which can quote what the code was working on (an email address, a reset link).
import { describeError } from "@travel-crm/integrations/jobs";

export type ProcessName = "api" | "worker" | "console";

/** Where a process's problems go, one line each. */
export type ProcessLog = (line: string) => void;

export function processLog(processName: ProcessName): ProcessLog {
  return (line) => {
    console.error(`${processName}: ${line}`);
  };
}

/**
 * What the jobs module reports to the worker (startWorker's onError), as a line. Its message is the module's own,
 * written from ids: a job whose event wasn't found, an organization the relay couldn't relay. Why it happened is its
 * cause, given by names and codes. Anything else is given by name and code alone.
 */
export function workerProblemLine(problem: unknown): string {
  if (!(problem instanceof Error)) return describeError(problem);
  return problem.cause === undefined ? problem.message : `${problem.message}: ${describeError(problem.cause)}`;
}
