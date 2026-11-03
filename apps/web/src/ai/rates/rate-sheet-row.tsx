"use client";

// One row of a rate sheet's review (release ai3b): the fields the AI read as controls to edit, the words and place of the sheet's own
// line they came from, a button to open the page or photo, and its own "checked" tick. A row the supplier already has at that price
// is shown and left out; one at another price shows the old price. Saving needs every row to be saved ticked.
import { useMemo } from "react";
import { EyeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { MoneyField, rupees } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemFooter, ItemHeader } from "@/components/ui/item";
import { NONE, type DraftValues, type RowProblem } from "./rate-sheet-draft";
import { rateUnits } from "@travel-crm/contracts/suppliers";

const mealPlans = [NONE, "EP", "CP", "MAP", "AP"] as const;
const occupancies = [NONE, "single", "double", "triple", "extra_bed", "child_with_bed", "child_no_bed"] as const;

export function RateSheetRow({
  index,
  control,
  setValue,
  problem,
  seasonOptions,
  canOpenSource,
  onOpenSource,
}: {
  index: number;
  control: Control<DraftValues>;
  setValue: UseFormSetValue<DraftValues>;
  problem: RowProblem | undefined;
  seasonOptions: { value: string; label: string }[];
  /** The sheet can be opened beside the row (a PDF or photos). */
  canOpenSource: boolean;
  onOpenSource: (source: string) => void;
}) {
  const t = useTranslations("ai.rates.row");
  const rates = useTranslations("suppliers.rates");
  const row = useWatch({ control, name: `rows.${String(index)}` as `rows.${number}` });
  const options = useMemo(
    () => ({
      mealPlans: mealPlans.map((plan) => ({ value: plan, label: rates(`mealPlans.${plan}`) })),
      occupancies: occupancies.map((one) => ({ value: one, label: rates(`occupancies.${one}`) })),
      units: rateUnits.map((unit) => ({ value: unit, label: rates(`units.${unit}`) })),
    }),
    [rates],
  );
  const name = (field: string) => `rows.${String(index)}.${field}` as `rows.${number}.item`;
  const left = row.left;
  const tickId = `rate-row-${row.ref}-checked`;

  return (
    <Item variant="outline" role="listitem" className="flex-col items-stretch" data-left={left}>
      <ItemHeader>
        <div className="flex flex-wrap items-center gap-2">
          {row.already ? (
            <StatusBadge tone="neutral">{t("already")}</StatusBadge>
          ) : (
            <>
              {row.existing !== null && (
                <StatusBadge tone="attention">{t("changed", { old: rupees(row.existing.costPaise) })}</StatusBadge>
              )}
              {row.checkThis && <StatusBadge tone="attention">{t("checkThis")}</StatusBadge>}
              {problem !== undefined && <StatusBadge tone="bad">{t(`problems.${problem}`)}</StatusBadge>}
            </>
          )}
        </div>
        {!row.already && (
          <Button
            type="button"
            variant="ghost"
            aria-label={t(left ? "putBackNamed" : "leaveOutNamed", { item: row.item })}
            onClick={() => {
              setValue(name("left") as `rows.${number}.left`, !left, { shouldDirty: true });
              if (!left) setValue(name("checked") as `rows.${number}.checked`, false);
            }}
          >
            {left ? t("putBack") : t("leaveOut")}
          </Button>
        )}
      </ItemHeader>
      {!left && (
        <ItemContent className="w-full">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seasonOptions.length > 1 && (
              <SelectField
                control={control}
                name={name("seasonKey")}
                label={t("season")}
                placeholder={t("chooseSeason")}
                options={seasonOptions}
              />
            )}
            <TextField control={control} name={name("item")} label={t("item")} />
            <SelectField control={control} name={name("mealPlan")} label={t("mealPlan")} options={options.mealPlans} />
            <SelectField
              control={control}
              name={name("occupancy")}
              label={t("occupancy")}
              options={options.occupancies}
            />
            <SelectField
              control={control}
              name={name("unit")}
              label={t("unit")}
              placeholder={t("chooseUnit")}
              options={options.units}
            />
            <MoneyField control={control} name={name("price")} label={t("price")} />
            <TextField control={control} name={name("note")} label={t("note")} />
          </div>
        </ItemContent>
      )}
      <ItemFooter className="flex-wrap justify-start gap-x-4 gap-y-2">
        {row.source !== "" && (
          <p className="min-w-0 text-label text-muted-foreground">
            <span className="font-medium">{row.source}</span>
            {row.excerpt !== "" && <q className="ml-2 break-words">{row.excerpt}</q>}
          </p>
        )}
        <p className="text-label text-muted-foreground">{t("printed", { price: row.printedPrice })}</p>
        {canOpenSource && !row.already && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenSource(row.source);
            }}
          >
            <EyeIcon aria-hidden="true" />
            {t("showSource")}
          </Button>
        )}
        {!left && (
          <Controller
            control={control}
            name={name("checked") as `rows.${number}.checked`}
            render={({ field }) => (
              <Field orientation="horizontal" className="min-h-11 w-auto">
                <Checkbox
                  id={tickId}
                  checked={field.value}
                  onCheckedChange={(on) => {
                    field.onChange(on === true);
                  }}
                />
                <FieldLabel htmlFor={tickId} className="font-normal">
                  {t("checked", { item: row.item })}
                </FieldLabel>
              </Field>
            )}
          />
        )}
      </ItemFooter>
    </Item>
  );
}
