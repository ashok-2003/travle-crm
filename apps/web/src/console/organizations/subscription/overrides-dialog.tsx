"use client";

// The subscription's overrides (spec 7.2, subscriptions.setOverrides): seats bought above the plan's, an agreed price
// before GST in place of the plan's (blank for the plan's own), and business modules switched on early. Starts from
// the overrides as they are.
import {
  planModules,
  type PlanModule,
  type SetOverridesInput,
  type SubscriptionDetails,
} from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { TextField } from "@/account/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { FormDialog, FormFooter, type Sending } from "@/components/forms/form-dialog";
import { useChangeDialog } from "../change-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { toOverridesInput } from "./change-inputs";

export function OverridesDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.overrides");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"));
  const save = useMutation(trpc.subscriptions.setOverrides.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog dialog={dialog} sending={save} label={t("action")} title={t("title")} description={t("description")}>
      <OverridesForm subscription={subscription} save={save} />
    </FormDialog>
  );
}

function OverridesForm({
  subscription,
  save,
}: {
  subscription: SubscriptionDetails;
  save: Sending<SetOverridesInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit, formProblem } = useCheckedForm(
    {
      extraSeats: String(subscription.extraSeats),
      customPrice: subscription.customPricePaise === null ? "" : rupeesFieldText(subscription.customPricePaise),
      extraModules: subscription.extraModules,
    },
    (values) => toOverridesInput(subscription.organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form noValidate onSubmit={onSubmit(save.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField
          control={form.control}
          name="extraSeats"
          label={t("overrides.extraSeats")}
          hint={t("overrides.extraSeatsHint")}
          inputMode="numeric"
          className="[&_input]:numbers"
        />
        <MoneyField
          control={form.control}
          name="customPrice"
          label={t(`overrides.customPrice.${subscription.billingCycle}`)}
          hint={t("overrides.customPriceHint")}
        />
        <Controller
          control={form.control}
          name="extraModules"
          render={({ field }) => (
            <FieldSet>
              <FieldLegend variant="label">{t("overrides.modules")}</FieldLegend>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {planModules.map((module) => {
                  const chosen: PlanModule[] = field.value;
                  return (
                    <Field key={module} orientation="horizontal" className="min-h-11 items-center">
                      <Checkbox
                        id={`module-${module}`}
                        checked={chosen.includes(module)}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked === true ? [...chosen, module] : chosen.filter((other) => other !== module),
                          );
                        }}
                      />
                      <FieldLabel htmlFor={`module-${module}`} className="font-normal">
                        {t(`modules.${module}`)}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </div>
            </FieldSet>
          )}
        />
      </FieldGroup>
      <FormFooter
        sending={save}
        problem={formProblem}
        label={t("overrides.submit")}
        pendingLabel={t("overrides.submitting")}
      />
    </form>
  );
}
