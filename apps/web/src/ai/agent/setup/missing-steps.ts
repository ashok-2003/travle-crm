// The required setup steps still undone, in the api's order: the Overview's banner names them, once.
import type { AgentSetup } from "@travel-crm/contracts/ai";

export type RequiredStep = Exclude<AgentSetup["steps"][number]["key"], "ads">;

/** Ads are optional, so they never block and never show here. */
export const missingSteps = (steps: AgentSetup["steps"]): RequiredStep[] =>
  steps.flatMap((step) => (step.optional || step.done || step.key === "ads" ? [] : [step.key]));
