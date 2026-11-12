"use client";

// Setup's last row: the switch that turns the agent on, which stays off until every required step is done.
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useSetAgentOn } from "./use-setup-steps";

export function TurnOnStep({ ready, on, pausedBySupport }: { ready: boolean; on: boolean; pausedBySupport: boolean }) {
  const t = useTranslations("aiAgent.setup.turnOn");
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
      {blocked && <FieldDescription id={reasonId}>{t("finishFirst")}</FieldDescription>}
      {pausedBySupport && <FieldDescription>{t("paused", { product: brand.productName })}</FieldDescription>}
      <RefusalAlert error={setOn.error} />
    </div>
  );
}
