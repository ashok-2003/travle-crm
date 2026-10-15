// pg-boss's failed jobs, read from its job table a page at a time, for the platform console's failed-jobs list
// (spec 9.1). pg-boss has no paged listing of its own.
import type { PgBoss } from "pg-boss";
import { describeError } from "./describe-error.js";
import type { FailedJob, FailedJobsOptions } from "./job-administration.js";
import { assertJobId, assertQueueName, type JobData } from "./job-queue.js";

const MAX_FAILED_JOBS = 500;

interface FailedJobRow {
  id: string;
  name: string;
  data: unknown;
  retry_count: number;
  failed_at: Date | null;
  output: unknown;
}

/**
 * Job data is a flat object of strings, numbers, booleans and nulls (the port's JobData); anything else is refused.
 * A job sent without data has none (null), which is an empty object here.
 */
export function toJobData(value: unknown): JobData {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("Job data is not a plain object");
  for (const [key, field] of Object.entries(value)) {
    if (field !== null && !["string", "number", "boolean"].includes(typeof field)) {
      throw new TypeError(`Job data field ${key} is not a string, number, boolean or null`);
    }
  }
  return value as JobData;
}

function errorMessageOf(output: unknown): string {
  if (typeof output === "object" && output !== null && "message" in output && typeof output.message === "string") {
    return output.message;
  }
  return "unknown error";
}

// The time is cut to the millisecond, as a JavaScript Date holds it, so the cursor a page ends at (the last job's
// failedAt and id) compares exactly with the rows. Newest first; a job without a time last; ties by id.
const FAILED_JOBS_SQL = (schema: string) => `
  WITH failed AS (
    SELECT id, name, data, retry_count, date_trunc('milliseconds', completed_on) AS failed_at, output
    FROM ${schema}.job
    WHERE state = 'failed' AND ($2::text IS NULL OR name = $2::text)
  )
  SELECT * FROM failed
  WHERE $3::uuid IS NULL
     OR ($4::timestamptz IS NULL AND failed_at IS NULL AND id < $3::uuid)
     OR ($4::timestamptz IS NOT NULL
         AND (failed_at IS NULL OR failed_at < $4::timestamptz OR (failed_at = $4::timestamptz AND id < $3::uuid)))
  ORDER BY failed_at DESC NULLS LAST, id DESC
  LIMIT $1`;

/** A page of failed jobs. A row that can't be read is reported and left out, so it can't hide the others. */
export async function failedJobsPage(
  boss: PgBoss,
  schema: string,
  options: FailedJobsOptions,
  report: (line: string) => void,
): Promise<FailedJob[]> {
  const { limit = 50, after, queue } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FAILED_JOBS) {
    throw new RangeError(`limit must be a whole number from 1 to ${String(MAX_FAILED_JOBS)}`);
  }
  if (queue !== undefined) assertQueueName(queue);
  if (after !== undefined) assertJobId(after.id);
  const { rows } = await boss
    .getDb()
    .executeSql(FAILED_JOBS_SQL(schema), [limit, queue ?? null, after?.id ?? null, after?.failedAt ?? null]);
  const failed: FailedJob[] = [];
  for (const row of rows as FailedJobRow[]) {
    try {
      failed.push({
        id: row.id,
        queue: row.name,
        data: toJobData(row.data),
        attempts: row.retry_count + 1,
        failedAt: row.failed_at,
        error: errorMessageOf(row.output),
      });
    } catch (error) {
      report(`failed job ${row.id} on queue ${row.name} can't be listed: ${describeError(error)}`);
    }
  }
  return failed;
}
