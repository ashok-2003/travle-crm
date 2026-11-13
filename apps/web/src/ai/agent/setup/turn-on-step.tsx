"use client";

// Setup's last row: the switch that turns the agent on, which stays off until every required step is done and says which
// are not, each with a link to where it is done.
import { brand } from "@travel-crm/brand";
import type { AgentSetup } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useSetAgentOn } from "./use-setup-steps";

/** Where each step is done: WhatsApp and Packages have pages of their own, the rest are rows of this page. */
const stepPlace: Record<Exclude<AgentSetup["steps"][number]["key"], "ads">, string> = {
  whatsapp: routes.whatsapp,
  packages: routes.packages,
  payment: "#step-payment",
  answers: "#step-answers",
  basics: "#step-basics",
};

export function TurnOnStep({
  steps,
  ready,
  on,
  pausedBySupport,
}: {
  steps: AgentSetup["steps"];
  ready: boolean;
  on: boolean;
  pausedBySupport: boolean;
}) {
  const t = useTranslations("aiAgent.setup.turnOn");
  const stepWords = useTranslations("aiAgent.setup.steps");
  const id = useId();
  const hintId = `${id}-write`;
  const reasonId = `${id}-reason`;
  const access = useWriteAccess("change");
  const setOn = useSetAgentOn();
  // Turning it off is always open; turning it on needs the steps.
  const blocked = !ready && !on;
  // Required steps only: ads are optional, so they never block and never show here.
  const missing = steps.flatMap((step) => (step.optional || step.done || step.key === "ads" ? [] : [step.key]));
  const headingId = `${id}-missing`;
  return (
    <div className="flex flex-col gap-2">
      <Field orientation="horizontal" className="min-h-11">
        <Switch
          id={id}
          checked={on}
          disabled={setOn.isPending || !access.allowed || blocked}
          aria-describedby={
            [access.hint === null ? null : hintId, !ready && missing.length > 0 ? reasonId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onCheckedChange={(next) => {
            setOn.mutate({ on: next });
          }}
        />
        <FieldLabel htmlFor={id} className="font-normal">
          {t("title")}
        </FieldLabel>
      </Field>
      <WriteHint id={hintId} hint={access.hint} visible />
      {!ready && missing.length > 0 && (
        <div id={reasonId} role="group" aria-labelledby={headingId}>
          <p id={headingId} className="font-semibold">
            {t(on ? "onButNotReady" : "finishFirst")}
          </p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {missing.map((key) => (
              <li key={key}>
                <TextLink inline href={stepPlace[key]}>
                  {stepWords(`${key}.todo`)}
                </TextLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pausedBySupport && <FieldDescription>{t("paused", { product: brand.productName })}</FieldDescription>}
      <RefusalAlert error={setOn.error} />
    </div>
  );
}
