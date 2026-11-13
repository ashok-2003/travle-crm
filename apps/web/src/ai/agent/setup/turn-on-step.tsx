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
const stepPlace: Record<AgentSetup["steps"][number]["key"], string> = {
  whatsapp: routes.whatsapp,
  packages: routes.packages,
  payment: "#step-payment",
  answers: "#step-answers",
  basics: "#step-basics",
  ads: "#step-ads",
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
  return (
    <div className="flex flex-col gap-2">
      <Field orientation="horizontal" className="min-h-11">
        <Switch
          id={id}
          checked={on}
          disabled={setOn.isPending || !access.allowed || blocked}
          aria-describedby={
            [access.hint === null ? null : hintId, blocked ? reasonId : null].filter(Boolean).join(" ") || undefined
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
      {blocked && (
        <div id={reasonId}>
          <p className="font-semibold">{t("finishFirst")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {steps
              .filter((step) => !step.optional && !step.done)
              .map((step) => (
                <li key={step.key}>
                  <TextLink inline href={stepPlace[step.key]}>
                    {stepWords(`${step.key}.todo`)}
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
