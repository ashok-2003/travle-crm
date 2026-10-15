"use client";

// The plan form, for a new plan or a change to one: its key (new plans only: it never changes), name, prices before
// GST for each cycle and for an extra seat, the seats, WhatsApp numbers and storage it includes, and its modules.
// Checked by the api's own schema before it is sent; a refusal from the api shows above the button.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { useErrorMessage } from "@/lib/error-message";
import { ModulesField } from "./modules-field";
import { PlanTextField } from "./plan-text-field";
import { planValues, toCreatePlanInput, toUpdatePlanInput, type PlanValues } from "./plan-values";
import { useCreatePlan, useUpdatePlan } from "./use-plans";

export function PlanForm({ plan, onSaved }: { plan?: PlanSummary | undefined; onSaved: () => void }) {
  const t = useTranslations("consolePlatform.planForm");
  const { apiError } = useErrorMessage();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const saving = plan ? update : create;
  const toInput = (values: PlanValues) => (plan ? toUpdatePlanInput(plan, values) : toCreatePlanInput(values));
  const resolver: Resolver<PlanValues> = (values) => {
    const result = toInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<PlanValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as keyof PlanValues] = { type: "validate", message: t(`problems.${problem}`) };
    }
    return { values: {}, errors };
  };
  const form = useForm<PlanValues>({ resolver, defaultValues: planValues(plan) });
  const { control } = form;

  const submit = form.handleSubmit((values) => {
    const done = { onSuccess: onSaved };
    if (plan) {
      const result = toUpdatePlanInput(plan, values);
      if (result.ok) update.mutate(result.input, done);
    } else {
      const result = toCreatePlanInput(values);
      if (result.ok) create.mutate(result.input, done);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {/* The fields scroll inside the dialog, its button always in view: the form is taller than many screens. The
          sheet on phones scrolls as a whole. The padding keeps the focus ring inside the scrolling box. */}
      <div className="-m-1 p-1 md:max-h-[55dvh] md:overflow-x-hidden md:overflow-y-auto">
        <FieldGroup>
          {!plan && <PlanTextField control={control} name="key" label={t("key")} hint={t("keyHint")} kind="code" />}
          <PlanTextField control={control} name="name" label={t("name")} />
          <FieldSet>
            <FieldLegend variant="label">{t("pricesLegend")}</FieldLegend>
            <FieldDescription>{t("pricesHint")}</FieldDescription>
            <div className="grid gap-5 sm:grid-cols-2">
              <PlanTextField control={control} name="monthlyPrice" label={t("monthlyPrice")} kind="rupees" />
              <PlanTextField control={control} name="yearlyPrice" label={t("yearlyPrice")} kind="rupees" />
            </div>
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">{t("extraSeatLegend")}</FieldLegend>
            <FieldDescription>{t("extraSeatHint")}</FieldDescription>
            <div className="grid gap-5 sm:grid-cols-2">
              <PlanTextField
                control={control}
                name="extraSeatMonthlyPrice"
                label={t("extraSeatMonthlyPrice")}
                kind="rupees"
              />
              <PlanTextField
                control={control}
                name="extraSeatYearlyPrice"
                label={t("extraSeatYearlyPrice")}
                kind="rupees"
              />
            </div>
          </FieldSet>
          <div className="grid gap-5 sm:grid-cols-3">
            <PlanTextField control={control} name="seats" label={t("seats")} kind="number" />
            <PlanTextField control={control} name="whatsappNumbers" label={t("whatsappNumbers")} kind="number" />
            <PlanTextField control={control} name="storageGigabytes" label={t("storageGigabytes")} kind="number" />
          </div>
          <ModulesField control={control} />
        </FieldGroup>
      </div>
      {saving.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(saving.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={saving.isPending} className="self-end">
        {t(saving.isPending ? (plan ? "saving" : "creating") : plan ? "save" : "create")}
      </Button>
    </form>
  );
}
