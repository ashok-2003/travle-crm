"use client";

// The subscription's overrides (spec 7.2, subscriptions.setOverrides): seats bought above the plan's, an agreed price
// before GST in place of the plan's (blank for the plan's own), and business modules switched on early. Starts from
// the overrides as they are.
import { planModules, type PlanModule, type SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { TextField } from "@/account/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { MoneyField, rupeesFieldText } from "../fields/money-field";
import { toOverridesInput, type OverridesValues } from "./change-inputs";
import { ChangeDialog, FormFooter, useAfterChange, useCheckedForm } from "./change-form";

export function OverridesDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.overrides");
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")}>
      {(close) => <OverridesForm subscription={subscription} onDone={close} />}
    </ChangeDialog>
  );
}

function OverridesForm({ subscription, onDone }: { subscription: SubscriptionDetails; onDone: () => void }) {
  const t = useTranslations("consoleOrganizations.subscription.overrides");
  const tModules = useTranslations("consoleOrganizations.subscription.modules");
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(subscription.organizationId);
  const save = useMutation(
    trpc.subscriptions.setOverrides.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  const check = (values: OverridesValues) => toOverridesInput(subscription.organizationId, values);
  const form = useCheckedForm(
    {
      extraSeats: String(subscription.extraSeats),
      customPrice: subscription.customPricePaise === null ? "" : rupeesFieldText(subscription.customPricePaise),
      extraModules: subscription.extraModules,
    },
    check,
  );
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) save.mutate(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField
          control={form.control}
          name="extraSeats"
          label={t("extraSeats")}
          hint={t("extraSeatsHint")}
          inputMode="numeric"
          className="[&_input]:numbers"
        />
        <MoneyField
          control={form.control}
          name="customPrice"
          label={t(`customPrice.${subscription.billingCycle}`)}
          hint={t("customPriceHint")}
        />
        <Controller
          control={form.control}
          name="extraModules"
          render={({ field }) => (
            <FieldSet>
              <FieldLegend variant="label">{t("modules")}</FieldLegend>
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
                        {tModules(module)}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </div>
            </FieldSet>
          )}
        />
      </FieldGroup>
      <FormFooter pending={save.isPending} error={save.error} label={t("submit")} pendingLabel={t("submitting")} />
    </form>
  );
}
