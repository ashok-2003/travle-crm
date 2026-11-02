"use client";

// A rate in a season (release 7b): the item, its meal plan and occupancy when a hotel, what it is charged per, and the cost.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { rateUnits, saveRateInput, type SaveRateInput, type SupplierRate } from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRateChanges } from "./use-rates";

type Problem = "required" | "invalid" | "cost";
interface Values {
  item: string;
  mealPlan: string;
  occupancy: string;
  unit: string;
  cost: string;
  note: string;
}

/** A select cannot hold an empty value, so "no meal plan" is "none" in the form. */
const NONE = "none";
const stored = (value: string) => (value === NONE ? "" : value);
const mealPlanOptions = [NONE, "EP", "CP", "MAP", "AP"] as const;
const occupancyOptions = [NONE, "single", "double", "triple", "extra_bed", "child_with_bed", "child_no_bed"] as const;

function RateForm({
  formId,
  seasonId,
  rate,
  changes,
  dialog,
}: {
  formId: string;
  seasonId: string;
  rate: SupplierRate | null;
  changes: ReturnType<typeof useRateChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("suppliers.rates");
  const values: Values = {
    item: rate?.item ?? "",
    mealPlan: rate === null || rate.mealPlan === "" ? NONE : rate.mealPlan,
    occupancy: rate === null || rate.occupancy === "" ? NONE : rate.occupancy,
    unit: rate?.unit ?? "per_room_night",
    cost: rate === null ? "" : rupeesFieldText(rate.costPaise),
    note: rate?.note ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveRateInput, Problem>(
    values,
    (typed) => {
      const cost = paiseFromRupeesText(typed.cost);
      return checked(
        saveRateInput.safeParse({
          seasonId,
          ...(rate === null ? {} : { rateId: rate.id }),
          item: typed.item,
          mealPlan: stored(typed.mealPlan),
          occupancy: stored(typed.occupancy),
          unit: typed.unit,
          costPaise: cost ?? Number.NaN,
          note: typed.note,
        }),
        typed,
        (path) => {
          const key = String(path[0]);
          return key === "costPaise"
            ? "cost"
            : (Object.keys(values) as (keyof Values)[]).find((field) => field === key);
        },
        (field) => (field === "cost" ? "cost" : "invalid"),
      );
    },
    (problem) => t(`rate.problems.${problem}`),
  );
  const busy = changes.saveRate.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveRate.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="item" label={t("rate.item")} hint={t("rate.itemHint")} disabled={busy} />
      <SelectField
        control={form.control}
        name="mealPlan"
        label={t("rate.mealPlan")}
        disabled={busy}
        options={mealPlanOptions.map((plan) => ({ value: plan, label: t(`mealPlans.${plan}`) }))}
      />
      <SelectField
        control={form.control}
        name="occupancy"
        label={t("rate.occupancy")}
        disabled={busy}
        options={occupancyOptions.map((one) => ({ value: one, label: t(`occupancies.${one}`) }))}
      />
      <SelectField
        control={form.control}
        name="unit"
        label={t("rate.unit")}
        disabled={busy}
        options={rateUnits.map((unit) => ({ value: unit, label: t(`units.${unit}`) }))}
      />
      <MoneyField control={form.control} name="cost" label={t("rate.cost")} />
      <TextField control={form.control} name="note" label={t("rate.note")} disabled={busy} />
      <FormAlert sending={changes.saveRate} problem={formProblem} />
    </form>
  );
}

export function RateDialog({ seasonId, rate }: { seasonId: string; rate: SupplierRate | null }) {
  const t = useTranslations("suppliers.rates");
  const dialog = useFormDialog(t("rate.saved"));
  const changes = useRateChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveRate}
      trigger={
        rate === null
          ? { label: t("addRate"), variant: "outline" }
          : { label: t("editRate"), accessibleLabel: t("editRateNamed", { item: rate.item }), variant: "outline" }
      }
      title={rate === null ? t("rate.addTitle") : t("rate.editTitle")}
      description={t("rate.description")}
      submit={t("rate.save")}
      submitting={t("rate.saving")}
    >
      {(formId) => <RateForm formId={formId} seasonId={seasonId} rate={rate} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
