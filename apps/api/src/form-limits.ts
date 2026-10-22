// The website form's rate limits in the order of spec 6.1/6.3, over the Postgres limiter. The cheapest come first: the
// address's own buckets. The agency's are keyed by the whole form key, not the organization id, so a link the Owner
// replaced no longer counts against the new one. With no readable address the per-address limits are skipped, never
// pooled into one shared bucket (W35), and the agency's 60 an hour lowers to 20 for such requests, inside the same 60.
import { formLimits } from "@travel-crm/domain/website-forms";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
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
 * Counts one attempt against each limit that applies and stops at the first refusal. A submission counts the address,
 * then the agency with that address, then (with no address) the agency's lower share, then the agency's 60 in all: so a
 * flood without addresses stops at 20 and leaves the other 40 for visitors who have one. A view counts the address, then
 * the agency's 600.
 */
export async function hitFormLimits(input: {
  limiter: Pick<RateLimiter, "hit">;
  logger: Logger;
  /** The whole form key (as the visitor's page sent it). */
  key: string;
  address: string | null;
  kind: "view" | "submit";
}): Promise<FormLimitResult> {
  const { limiter, key, address } = input;
  if (address === null) warnOnce(input.logger);
  const steps =
    input.kind === "view"
      ? [
          ...(address === null ? [] : [{ name: `form-view:${address}`, rule: formLimits.view, agency: false }]),
          { name: `form-view-agency:${key}`, rule: formLimits.viewAgency, agency: true },
        ]
      : [
          ...(address === null
            ? [{ name: `form-submit-agency-no-address:${key}`, rule: formLimits.submitAgencyNoAddress, agency: true }]
            : [
                { name: `form-submit-visitor:${address}`, rule: formLimits.submitVisitor, agency: false },
                {
                  name: `form-submit-agency-visitor:${key}:${address}`,
                  rule: formLimits.submitAgencyVisitor,
                  agency: false,
                },
              ]),
          { name: `form-submit-agency:${key}`, rule: formLimits.submitAgency, agency: true },
        ];
  for (const step of steps) {
    const result = await limiter.hit(step.name, step.rule);
    if (!result.allowed) {
      return { allowed: false, retryAfterSeconds: result.retryAfterSeconds, agencyRefused: step.agency };
    }
  }
  return { allowed: true };
}
