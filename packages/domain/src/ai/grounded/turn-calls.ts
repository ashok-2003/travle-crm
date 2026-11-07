// One model call of the turn, counted against the month's limit: reserved in a short transaction of its own right before
// the call (never a model call inside a transaction), its tokens kept when it gave something, the reservation given back
// when it did not. A refused check is not given back: the call was used.
import type { Database } from "@travel-crm/db";
import { recordTokens, releaseAiCall, reserveAiCall } from "../usage.js";

export interface CallEnvironment {
  db: Database;
  organizationId: string;
  now: Date;
  timeZone: string;
}

interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function countedCall<R extends { ok: true; usage: Usage } | { ok: false; reason: string }>(
  environment: CallEnvironment,
  call: () => Promise<R>,
): Promise<R | { ok: false; reason: "limit" }> {
  const { db, organizationId, now, timeZone } = environment;
  if (!(await db.forOrg(organizationId, (tx) => reserveAiCall(tx, now, timeZone)))) {
    return { ok: false, reason: "limit" };
  }
  let result: R;
  try {
    result = await call();
  } catch (error) {
    await db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, timeZone));
    throw error;
  }
  await db.forOrg(organizationId, (tx) =>
    result.ok
      ? recordTokens(tx, now, timeZone, { input: result.usage.inputTokens, output: result.usage.outputTokens })
      : releaseAiCall(tx, now, timeZone),
  );
  return result;
}
