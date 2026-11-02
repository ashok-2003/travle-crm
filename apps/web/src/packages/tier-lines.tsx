"use client";

// A tier's lines (release 7b): what each is, how many a quote gets (a fixed number, or one for each traveller, night, room night
// or person night), and where its price comes from: a supplier's rate, priced for the quote's start date when a quote is made,
// or a fixed price. Whoever may see rates picks one; a rate already chosen is shown by name to everyone who edits the package.
import type { SupplierRateCatalog } from "@travel-crm/contracts/suppliers";
import { useQuery } from "@tanstack/react-query";
import { quantityRules } from "@travel-crm/contracts/quotes";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { ChoiceField } from "@/components/forms/choice-field";
import { MoneyField, rupees } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { NoteField } from "@/leads/form/note-field";
import { useTRPC } from "@/data/trpc";
import { SupplierField, type PickedSupplier } from "@/suppliers/supplier-field";

export interface LineValues {
  description: string;
  detail: string;
  /** "rate" prices from a supplier's rate; "fixed" from the price typed. */
  mode: string;
  rateId: string;
  rateLabel: string;
  supplier: PickedSupplier | null;
  quantityRule: string;
  quantity: string;
  price: string;
}

export interface TierValues {
  name: string;
  lines: LineValues[];
}

/** A line's field as react-hook-form names it ("lines.0.price"). */
const lineField = <Key extends keyof LineValues>(index: number, key: Key) =>
  `lines.${String(index)}.${key}` as `lines.${number}.${Key}`;

export const emptyLine = (): LineValues => ({
  description: "",
  detail: "",
  mode: "fixed",
  rateId: "",
  rateLabel: "",
  supplier: null,
  quantityRule: "per_traveller",
  quantity: "1",
  price: "",
});

type Catalog = SupplierRateCatalog;

/** The rates of a supplier as a picker's options: every season's, named by the season. */
function rateOptions(catalog: Catalog, supplierName: string, labels: (key: string) => string) {
  return catalog.seasons.flatMap((season) =>
    season.rates.map((rate) => ({
      value: rate.id,
      name: `${supplierName}: ${rate.item}`,
      label: [
        season.label,
        rate.item,
        rate.mealPlan,
        rate.occupancy === "" ? "" : labels(`occupancies.${rate.occupancy}`),
        labels(`units.${rate.unit}`),
        rupees(rate.costPaise),
      ]
        .filter((part) => part !== "")
        .join(" · "),
    })),
  );
}

function RatePicker({ form, index, mayPick }: { form: UseFormReturn<TierValues>; index: number; mayPick: boolean }) {
  const t = useTranslations("packages.tier");
  const tRates = useTranslations("suppliers.rates");
  const trpc = useTRPC();
  const supplier = useWatch({ control: form.control, name: lineField(index, "supplier") });
  const rateId = useWatch({ control: form.control, name: lineField(index, "rateId") });
  const rateLabel = useWatch({ control: form.control, name: lineField(index, "rateLabel") });
  const rates = useQuery(
    trpc.suppliers.rates.queryOptions({ supplierId: supplier?.id ?? "" }, { enabled: mayPick && supplier !== null }),
  );
  const options =
    rates.data === undefined || supplier === null
      ? []
      : rateOptions(rates.data, supplier.name, (key) => tRates(key as "units.per_trip"));
  return (
    <div className="flex flex-col gap-3">
      {rateId !== "" && rateLabel !== "" && (
        <p className="text-caption text-muted-foreground">{t("pricedFrom", { rate: rateLabel })}</p>
      )}
      {mayPick ? (
        <>
          <SupplierField control={form.control} name={lineField(index, "supplier")} kind="hotel" />
          {supplier !== null && (
            <SelectField
              control={form.control}
              name={lineField(index, "rateId")}
              label={t("rate")}
              hint={t("rateHint")}
              placeholder={t("chooseRate")}
              options={options.map(({ value, label }) => ({ value, label }))}
              onChosen={(value) => {
                form.setValue(
                  lineField(index, "rateLabel"),
                  options.find((option) => option.value === value)?.name ?? "",
                );
              }}
            />
          )}
        </>
      ) : (
        rateId === "" && <p className="text-muted-foreground">{t("noRatePermission")}</p>
      )}
    </div>
  );
}

export function TierLines({ form, mayPickRates }: { form: UseFormReturn<TierValues>; mayPickRates: boolean }) {
  const t = useTranslations("packages.tier");
  const lines = useFieldArray({ control: form.control, name: "lines" });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("lines")}</h3>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            lines.append(emptyLine());
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t("addLine")}
        </Button>
      </div>
      {lines.fields.length === 0 ? (
        <p className="text-muted-foreground">{t("noLines")}</p>
      ) : (
        <ItemGroup className="gap-3">
          {lines.fields.map((line, index) => (
            <Item key={line.id} variant="muted" role="listitem" className="items-start">
              <ItemContent className="gap-3">
                <TextField
                  control={form.control}
                  name={lineField(index, "description")}
                  label={t("description")}
                  hint={t("descriptionHint")}
                />
                <NoteField control={form.control} name={lineField(index, "detail")} label={t("detail")} />
                <SelectField
                  control={form.control}
                  name={lineField(index, "quantityRule")}
                  label={t("quantityRule")}
                  options={quantityRules.map((rule) => ({ value: rule, label: t(`rules.${rule}`) }))}
                />
                <FixedQuantity form={form} index={index} />
                <ChoiceField
                  control={form.control}
                  name={lineField(index, "mode")}
                  legend={t("priceFrom")}
                  inline
                  options={[
                    { value: "fixed", label: t("fixedPrice") },
                    { value: "rate", label: t("fromRate") },
                  ]}
                />
                <PriceOf form={form} index={index} mayPickRates={mayPickRates} />
              </ItemContent>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeLine", { number: index + 1 })}
                onClick={() => {
                  lines.remove(index);
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}

function FixedQuantity({ form, index }: { form: UseFormReturn<TierValues>; index: number }) {
  const t = useTranslations("packages.tier");
  const rule = useWatch({ control: form.control, name: lineField(index, "quantityRule") });
  if (rule !== "fixed") return null;
  return (
    <TextField
      control={form.control}
      name={lineField(index, "quantity")}
      label={t("quantity")}
      inputMode="numeric"
      className="numbers"
    />
  );
}

function PriceOf({
  form,
  index,
  mayPickRates,
}: {
  form: UseFormReturn<TierValues>;
  index: number;
  mayPickRates: boolean;
}) {
  const t = useTranslations("packages.tier");
  const mode = useWatch({ control: form.control, name: lineField(index, "mode") });
  if (mode === "rate") return <RatePicker form={form} index={index} mayPick={mayPickRates} />;
  return (
    <MoneyField control={form.control} name={lineField(index, "price")} label={t("price")} hint={t("priceHint")} />
  );
}
