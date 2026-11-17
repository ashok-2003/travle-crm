"use client";

// Setup's last row: the switch that turns the agent on, which stays off until every required step is done and says which
// are not, each with a link to where it is done.
import { brand } from "@travel-crm/brand";
import type { AgentSetup } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { MissingSteps, missingSteps } from "./missing-steps";
import { useSetAgentOn } from "./use-setup-steps";

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
  const id = useId();
  const hintId = `${id}-write`;
  const reasonId = `${id}-reason`;
  const access = useWriteAccess("change");
  const setOn = useSetAgentOn();
  // Turning it off is always open; turning it on needs the steps.
  const blocked = !ready && !on;
  const missing = missingSteps(steps);
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
        <MissingSteps id={reasonId} heading={t(on ? "onButNotReady" : "finishFirst")} keys={missing} />
      )}
      {pausedBySupport && <FieldDescription>{t("paused", { product: brand.productName })}</FieldDescription>}
      <RefusalAlert error={setOn.error} />
    </div>
  );
}
