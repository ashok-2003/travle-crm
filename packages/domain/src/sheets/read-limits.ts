// How often an agency may make us read Google by hand (SD4, SC2): the connect steps and Check again each read the sheet in
// the api's request, on the shared service account's quota (60 reads a minute for it). A person connecting reads a few times
// a minute at most; an agency past that is told to wait, so one cannot push every agency into Google's 429.
import type { RateLimiter } from "../rate-limits/index.js";
import { DomainError } from "../kernel/index.js";

/** Reads of Google an organization's people may start in a minute, across begin, verify, choosing a tab and Check again. */
export const sheetReadsPerMinute = 15;

export async function limitSheetReads(
  limiter: Pick<RateLimiter, "hit"> | undefined,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  if (limiter === undefined) return;
  const result = await limiter.hit(
    `sheet-reads:${organizationId}`,
    { limit: sheetReadsPerMinute, windowSeconds: 60 },
    now,
  );
  if (!result.allowed) {
    throw new DomainError("CONFLICT", "SHEETS_TOO_FAST", "Too many sheet checks in a minute: wait a little");
  }
}
