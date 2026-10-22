// The website form's rate limits in the order of spec 6.1/6.3, over the Postgres limiter. With no readable address the
// per-address limits are skipped, never pooled into one shared bucket (W35); the agency's limit then drops to 20 an hour.
import { formLimits } from "@travel-crm/domain/website-forms";
import type { RateLimiter, RateLimitRule } from "@travel-crm/domain/rate-limits";
import type { Logger } from "@travel-crm/integrations/logging";

export type FormLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number; agencyRefused: boolean };

let warnedAboutMissingAddress = false;

/** Lets a test see the once-per-process warning again. */
export function resetFormAddressWarning(): void {
  warnedAboutMissingAddress = false;
}

/** One line a process when a form call has no address: the owner is nudged to set the hops or turn Turnstile on. */
function warnOnce(logger: Logger): void {
  if (warnedAboutMissingAddress) return;
  warnedAboutMissingAddress = true;
  logger.warn(
    {},
    "Website form: a request has no readable visitor address, so only the per-agency limit applies. Set " +
      "PUBLIC_FORM_PROXY_HOPS (see /api/public/client-address) or turn Turnstile on.",
  );
}

/**
 * Counts one attempt against each limit that applies and stops at the first refusal. A view counts the address alone; a
 * submission counts agency+address, address, then the agency (so one address can't use up an agency's hour for itself
 * alone before its own limits refuse it).
 */
export async function hitFormLimits(input: {
  limiter: Pick<RateLimiter, "hit">;
  logger: Logger;
  organizationId: string;
  address: string | null;
  kind: "view" | "submit";
}): Promise<FormLimitResult> {
  const { limiter, organizationId, address } = input;
  const steps: { name: string; rule: RateLimitRule; agency: boolean }[] = [];
  if (address === null) warnOnce(input.logger);
  if (input.kind === "view") {
    if (address !== null) steps.push({ name: `form-view:${address}`, rule: formLimits.view, agency: false });
  } else {
    if (address !== null) {
      steps.push(
        {
          name: `form-submit-agency-visitor:${organizationId}:${address}`,
          rule: formLimits.submitAgencyVisitor,
          agency: false,
        },
        { name: `form-submit-visitor:${address}`, rule: formLimits.submitVisitor, agency: false },
      );
    }
    steps.push({
      // The two rules count apart: the same bucket would mix a 60 limit with a 20 one.
      name: `${address === null ? "form-submit-agency-no-address" : "form-submit-agency"}:${organizationId}`,
      rule: address === null ? formLimits.submitAgencyNoAddress : formLimits.submitAgency,
      agency: true,
    });
  }
  for (const step of steps) {
    const result = await limiter.hit(step.name, step.rule);
    if (!result.allowed)
      return { allowed: false, retryAfterSeconds: result.retryAfterSeconds, agencyRefused: step.agency };
  }
  return { allowed: true };
}
