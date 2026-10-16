"use client";

// One labelled field of the plan form (DESIGN.md section 6: a label above, the problem below with an icon, linked by
// aria-describedby). Numbers are mono; a rupee amount has ₹ before it, sits right-aligned, and takes Indian grouping
// once the field is left, as text: plan-values.ts reads it into paise.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, type Control } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rupeesTextOf, type PlanField, type PlanValues } from "./plan-values";

export function PlanTextField({
  control,
  name,
  label,
  hint,
  kind = "text",
}: {
  control: Control<PlanValues>;
  name: PlanField;
  label: string;
  hint?: string;
  kind?: "text" | "code" | "number" | "rupees";
}) {
  const t = useTranslations("consolePlatform.planForm");
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [hint ? `${id}-hint` : null, fieldState.error ? `${id}-error` : null].filter(
          (part) => part !== null,
        );
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <div className="relative">
              {kind === "rupees" && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
                >
                  {t("rupeeSymbol")}
                </span>
              )}
              <Input
                id={id}
                {...field}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize={kind === "code" ? "none" : undefined}
                inputMode={kind === "number" || kind === "rupees" ? "decimal" : undefined}
                className={cn(kind !== "text" && "numbers", kind === "rupees" && "pl-7 text-right")}
                aria-invalid={fieldState.invalid}
                // No attribute at all rather than an empty one, which points at nothing.
                aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
                onBlur={() => {
                  const paise = kind === "rupees" ? paiseFromRupeesText(field.value) : null;
                  if (paise !== null && paise >= 0) field.onChange(rupeesTextOf(paise));
                  field.onBlur();
                }}
              />
            </div>
            {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
            {fieldState.error && (
              <FieldError id={`${id}-error`} className="flex items-start gap-1.5">
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {fieldState.error.message}
              </FieldError>
            )}
          </Field>
        );
      }}
    />
  );
}
