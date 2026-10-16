"use client";

// Who travels (spec 3.2, R47): the adults, typed, and the children, chosen as a count with each child's age from 0
// to 17. The count isn't a value of its own: it is how many ages there are, so choosing it adds or drops ages, and a
// new child's age waits to be chosen.
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadFormValues } from "./lead-form-values";

const MOST_CHILDREN = 10;
const OLDEST_CHILD = 17;

const counts = Array.from({ length: MOST_CHILDREN + 1 }, (_, count) => String(count));
const ages = Array.from({ length: OLDEST_CHILD + 1 }, (_, age) => String(age));

/** The form's path to one child's age. */
const ageField = (index: number) => `childrenAges.${String(index)}` as `childrenAges.${number}`;

export function TravellersField({ form, disabled }: { form: UseFormReturn<LeadFormValues>; disabled: boolean }) {
  const t = useTranslations("leads.form.trip");
  const { control } = form;
  const childrenAges = form.watch("childrenAges");
  const agesProblem = form.formState.errors.childrenAges?.message;
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <TextField control={control} name="adults" label={t("adults")} inputMode="numeric" autoComplete="off" />
        <FormField label={t("children")} error={agesProblem}>
          {(links) => (
            <Select
              disabled={disabled}
              value={String(childrenAges.length)}
              onValueChange={(count) => {
                const next = Array.from({ length: Number(count) }, (_, index) => childrenAges[index] ?? "");
                form.setValue("childrenAges", next, { shouldDirty: true });
              }}
            >
              <SelectTrigger {...links} className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {counts.map((count) => (
                  <SelectItem key={count} value={count}>
                    {count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      {childrenAges.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {childrenAges.map((_, index) => (
            <SelectField
              // A child is their place in the list: ages are kept as the count changes.
              key={index}
              control={control}
              name={ageField(index)}
              label={t("childAge", { number: index + 1 })}
              placeholder={t("chooseAge")}
              disabled={disabled}
              options={ages.map((age) => ({ value: age, label: age === "0" ? t("underOne") : age }))}
            />
          ))}
        </div>
      )}
    </>
  );
}
