// Every Graph call of the module goes through here (M2, M8, 8.1): it spends the organization's hourly budget first, and
// whatever the port throws comes back as a typed failure carrying Meta's codes and nothing else, never a message that
// could hold a URL or a token.
import { MetaGraphError, type MetaGraphErrorReason } from "@travel-crm/integrations/meta-graph";
import type { MetaDependencies } from "./dependencies.js";
import {
  catchupGraphCallsPerHour,
  graphCallsPerHour,
  interactiveGraphCallsPerHour,
  platformGraphCallsPerHour,
} from "./limits.js";

/**
 * Which share of the budget a call spends: the webhook path borrows from the whole hour first, the catch-up may use half,
 * and a person's own click (connecting, reading a form) has a cap of its own, so a burst of leads never refuses it and a loop of clicks never starves them.
 */
export type GraphLane = "webhook" | "catchup" | "interactive";

export interface GraphFailure {
  reason: MetaGraphErrorReason | "budget";
  code: number | null;
  subcode: number | null;
}

export type GraphResult<T> = { ok: true; value: T } | { ok: false; failure: GraphFailure };

const hour = 3600;

/** Whether the lane may make a call now; the hit is counted either way. */
async function withinBudget(dependencies: MetaDependencies, organizationId: string, lane: GraphLane): Promise<boolean> {
  const { limiter } = dependencies;
  const budget = dependencies.graphBudget ?? { perHour: graphCallsPerHour, catchupPerHour: catchupGraphCallsPerHour };
  if (lane === "interactive") {
    const own = await limiter.hit(`meta-graph:${organizationId}:interactive`, {
      limit: budget.interactivePerHour ?? interactiveGraphCallsPerHour,
      windowSeconds: hour,
    });
    if (!own.allowed) return false;
    return (await limiter.hit("meta-graph:platform", { limit: platformGraphCallsPerHour, windowSeconds: hour }))
      .allowed;
  }
  if (lane === "catchup") {
    const share = await limiter.hit(`meta-graph:${organizationId}:catchup`, {
      limit: budget.catchupPerHour,
      windowSeconds: hour,
    });
    if (!share.allowed) return false;
  }
  const whole = await limiter.hit(`meta-graph:${organizationId}`, { limit: budget.perHour, windowSeconds: hour });
  if (!whole.allowed) return false;
  const platform = await limiter.hit("meta-graph:platform", { limit: platformGraphCallsPerHour, windowSeconds: hour });
  if (!platform.allowed) {
    dependencies.logger.warn({ ceiling: platformGraphCallsPerHour }, "The Meta Graph platform ceiling was reached");
    return false;
  }
  return true;
}

/** Runs one call of the port for an organization; a failure of any kind is a value, never a thrown message. */
export async function callGraph<T>(
  dependencies: MetaDependencies,
  organizationId: string,
  lane: GraphLane,
  call: () => Promise<T>,
): Promise<GraphResult<T>> {
  if (!(await withinBudget(dependencies, organizationId, lane))) {
    return { ok: false, failure: { reason: "budget", code: null, subcode: null } };
  }
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    if (error instanceof MetaGraphError) {
      return { ok: false, failure: { reason: error.reason, code: error.code, subcode: error.subcode } };
    }
    // Anything else (a socket, a bug in an adapter) may carry a URL with a token in its message: it is not read.
    return { ok: false, failure: { reason: "unavailable", code: null, subcode: null } };
  }
}

/** The token no longer works (M3, error 190): the Owner must connect again. */
export function needsReconnect(failure: GraphFailure): boolean {
  return failure.reason === "token_invalid";
}

/** Meta refused the call for lack of a permission: for a Page's own calls that is M3 too, for one lead it is that lead's (M8). */
export function lacksPermission(failure: GraphFailure): boolean {
  return failure.reason === "permission";
}

/** The failures that should be tried again later (M8): the network, Meta's own trouble, a rate limit, our budget. */
export function isTransient(failure: GraphFailure): boolean {
  return failure.reason === "unavailable" || failure.reason === "rate_limited" || failure.reason === "budget";
}
