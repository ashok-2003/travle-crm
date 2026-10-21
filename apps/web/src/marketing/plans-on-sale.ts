// The plans the public page prices, from the api's GET /api/public/plans (plans are data the console edits, never
// prices in code). The visitor's browser asks, on the page's own address, so the page itself stays static and needs no
// setting. Only a sleeping api's failure (no answer, or the proxy's 502, 503 or 504) is asked again.
import { publicPlans, type PublicPlan } from "@travel-crm/contracts/subscriptions";

export const PLANS_PATH = "/api/public/plans";

/** The plans weren't given: `status` is the answer's, 0 when there was none (a sleeping api, no connection). */
export class PlansNotGiven extends Error {
  constructor(readonly status: number) {
    super(`The plans weren't given (${String(status)})`);
    this.name = "PlansNotGiven";
  }
}

export async function fetchPlansOnSale(fetchImplementation: typeof fetch = fetch): Promise<PublicPlan[]> {
  let response: Response;
  try {
    response = await fetchImplementation(PLANS_PATH, { headers: { accept: "application/json" } });
  } catch {
    throw new PlansNotGiven(0);
  }
  if (!response.ok) throw new PlansNotGiven(response.status);
  const plans = publicPlans.safeParse(await response.json().catch(() => null));
  if (!plans.success) throw new PlansNotGiven(response.status);
  return plans.data;
}
