// The plans the public page prices, from the api's GET /api/public/plans (plans are data the console edits, never
// prices in code). The visitor's browser asks, on the page's own address, so the page itself stays static and needs no
// setting; an answer it can't read counts as a failure, so it is asked again like a sleeping api.
import { publicPlans, type PublicPlan } from "@travel-crm/contracts/subscriptions";

export const PLANS_PATH = "/api/public/plans";

export async function fetchPlansOnSale(fetchImplementation: typeof fetch = fetch): Promise<PublicPlan[]> {
  const response = await fetchImplementation(PLANS_PATH, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`The plans weren't given (${String(response.status)})`);
  return publicPlans.parse(await response.json());
}
