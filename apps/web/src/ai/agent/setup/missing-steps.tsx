"use client";

// The required setup steps still undone, one link a line to where each is done: under the Setup tab's switch, and in the
// Overview's state while the agent is on but not answering.
import type { AgentSetup } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { routes } from "@/lib/routes";

type RequiredStep = Exclude<AgentSetup["steps"][number]["key"], "ads" | "instructions">;

/** Where each step is done: the AI, WhatsApp and Packages have pages of their own, the rest are rows of the Setup tab. */
const stepPlace: Record<RequiredStep, string> = {
  ai: routes.aiSettings,
  whatsapp: routes.whatsapp,
  packages: routes.packages,
  payment: "#step-payment",
  answers: "#step-answers",
  basics: "#step-basics",
};

/** The required steps not done, in the api's order: ads and instructions are optional, so they never show here. */
export const missingSteps = (steps: AgentSetup["steps"]): RequiredStep[] =>
  steps.flatMap((step) =>
    step.optional || step.done || step.key === "ads" || step.key === "instructions" ? [] : [step.key],
  );

export function MissingSteps({
  id,
  heading,
  keys,
  setupHref = "",
}: {
  id: string;
  heading: string;
  keys: readonly RequiredStep[];
  /** The Setup tab's address, put before a row's "#step-…" when the list shows outside that tab. */
  setupHref?: string;
}) {
  const t = useTranslations("aiAgent.setup.steps");
  const headingId = `${id}-heading`;
  return (
    <div id={id} role="group" aria-labelledby={headingId}>
      <p id={headingId} className="font-semibold">
        {heading}
      </p>
      {/* One link a line, each a 44px touch target. */}
      <ul className="flex flex-col">
        {keys.map((key) => {
          const place = stepPlace[key];
          return (
            <li key={key}>
              <TextLink href={place.startsWith("#") ? `${setupHref}${place}` : place}>{t(`${key}.todo`)}</TextLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
