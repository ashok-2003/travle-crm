"use client";

// Who travels: adults and children as steppers, and an age for each child (0 is "Under 1").
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FieldProblem } from "@/components/form-field";
import { SelectField } from "@/components/forms/select-field";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { MOST_ADULTS, MOST_CHILDREN, type FormValues } from "./form-values";

const ages = Array.from({ length: 18 }, (_, age) => String(age));

function Stepper({
  label,
  fewer,
  more,
  count,
  least,
  most,
  disabled,
  onChange,
}: {
  label: string;
  fewer: string;
  more: string;
  count: number;
  least: number;
  most: number;
  disabled: boolean;
  onChange: (count: number) => void;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={fewer}
          disabled={disabled || count <= least}
          onClick={() => {
            onChange(count - 1);
          }}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <output aria-labelledby={labelId} className="numbers min-w-8 text-center text-lg">
          {count}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={more}
          disabled={disabled || count >= most}
          onClick={() => {
            onChange(count + 1);
          }}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function TravellersField({ form, disabled }: { form: UseFormReturn<FormValues>; disabled: boolean }) {
  const t = useTranslations("websiteForm.form");
  const problemId = useId();
  const [adults, childrenAges] = form.watch(["adults", "childrenAges"]);
  const problem = form.formState.errors.childrenAges?.message ?? form.formState.errors.adults?.message;
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">{t("travellers")}</FieldLegend>
      <div className="grid grid-cols-2 gap-4">
        <Stepper
          label={t("adults")}
          fewer={t("fewerAdults")}
          more={t("moreAdults")}
          count={adults}
          least={1}
          most={MOST_ADULTS}
          disabled={disabled}
          onChange={(count) => {
            form.setValue("adults", count, { shouldDirty: true });
          }}
        />
        <Stepper
          label={t("children")}
          fewer={t("fewerChildren")}
          more={t("moreChildren")}
          count={childrenAges.length}
          least={0}
          most={MOST_CHILDREN}
          disabled={disabled}
          onChange={(count) => {
            form.setValue(
              "childrenAges",
              Array.from({ length: count }, (_, index) => childrenAges[index] ?? ""),
              {
                shouldDirty: true,
              },
            );
          }}
        />
      </div>
      {childrenAges.length > 0 && (
        <div className="grid grid-cols-2 gap-4 @sm:grid-cols-3">
          {childrenAges.map((_, index) => (
            <SelectField
              // A child is their place in the list: ages are kept as the count changes.
              key={index}
              control={form.control}
              name={`childrenAges.${String(index)}` as `childrenAges.${number}`}
              label={t("age", { number: index + 1 })}
              placeholder={t("chooseAge")}
              disabled={disabled}
              options={ages.map((age) => ({ value: age, label: age === "0" ? t("underOne") : age }))}
            />
          ))}
        </div>
      )}
      {problem !== undefined && <FieldProblem id={problemId}>{problem}</FieldProblem>}
    </FieldSet>
  );
}
