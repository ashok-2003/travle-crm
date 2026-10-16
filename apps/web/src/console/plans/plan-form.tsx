"use client";

// The plan form, for a new plan or a change to one: its key (new plans only: it never changes), name, prices before
// GST for each cycle and for an extra seat, the seats, WhatsApp numbers and storage it includes, and its modules.
// Checked by the api's own schema before it is sent; a refusal from the api shows above the button, which is the
// dialog's (PlanDialog), sending this form by its id.
import type { CreatePlanInput, PlanSummary, UpdatePlanInput } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { ModulesField } from "./modules-field";
import { planValues, toCreatePlanInput, toUpdatePlanInput, type PlanProblem, type PlanValues } from "./plan-values";

export function PlanForm({
  id,
  plan,
  send,
  sending,
}: {
  id: string;
  plan?: PlanSummary | undefined;
  send: (input: CreatePlanInput | UpdatePlanInput) => void;
  /** The save, whose refusal is shown above the dialog's button. */
  sending: { error: unknown };
}) {
  const t = useTranslations("consolePlatform.planForm");
  const { form, onSubmit, formProblem } = useCheckedForm<PlanValues, CreatePlanInput | UpdatePlanInput, PlanProblem>(
    planValues(plan),
    (values) => (plan ? toUpdatePlanInput(plan, values) : toCreatePlanInput(values)),
    (problem) => t(`problems.${problem}`),
  );
  const { control } = form;
  return (
    <form id={id} noValidate onSubmit={onSubmit(send)} className="flex flex-col gap-6">
      <FieldGroup>
        {!plan && (
          <TextField
            control={control}
            name="key"
            label={t("key")}
            hint={t("keyHint")}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="[&_input]:numbers"
          />
        )}
        <TextField control={control} name="name" label={t("name")} autoComplete="off" spellCheck={false} />
        <FieldSet>
          <FieldLegend variant="label">{t("pricesLegend")}</FieldLegend>
          <FieldDescription>{t("pricesHint")}</FieldDescription>
          <div className="grid gap-5 sm:grid-cols-2">
            <MoneyField control={control} name="monthlyPrice" label={t("monthlyPrice")} />
            <MoneyField control={control} name="yearlyPrice" label={t("yearlyPrice")} />
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t("extraSeatLegend")}</FieldLegend>
          <FieldDescription>{t("extraSeatHint")}</FieldDescription>
          <div className="grid gap-5 sm:grid-cols-2">
            <MoneyField control={control} name="extraSeatMonthlyPrice" label={t("extraSeatMonthlyPrice")} />
            <MoneyField control={control} name="extraSeatYearlyPrice" label={t("extraSeatYearlyPrice")} />
          </div>
        </FieldSet>
        <div className="grid gap-5 sm:grid-cols-3">
          {(["seats", "whatsappNumbers", "storageGigabytes"] as const).map((name) => (
            <TextField
              key={name}
              control={control}
              name={name}
              label={t(name)}
              inputMode="decimal"
              autoComplete="off"
              className="[&_input]:numbers"
            />
          ))}
        </div>
        <ModulesField control={control} />
      </FieldGroup>
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}
