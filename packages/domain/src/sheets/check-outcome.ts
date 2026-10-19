// What a check reports to the job that ran it, and what the job needs to run one.
import type { AccountHolds } from "./account-holds.js";
import type { SheetsJobDependencies } from "./job-dependencies.js";

export interface CheckOutcome {
  /** checked: read and closed. skipped: nothing to do now. yielded: stopped for an import's Add, to try again. failed: Google did not answer. */
  result: "checked" | "skipped" | "yielded" | "failed";
  /** When the next scheduled check is due, from now. */
  nextCheckInSeconds: number;
  /** False when the sheet no longer needs a schedule row (gone, paused, never connected). */
  keepSchedule: boolean;
}

export interface CheckDependencies extends SheetsJobDependencies {
  /** One per worker process, shared by the dispatcher and the checks. */
  holds: AccountHolds;
  checkIntervalSeconds: number;
}
