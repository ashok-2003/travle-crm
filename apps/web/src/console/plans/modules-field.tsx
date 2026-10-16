"use client";

// The business modules a plan includes, one checkbox each in spec 1's build order. The Foundation's own features
// (staff, roles, settings, the audit log, documents) come with every plan, so they are not offered.
import { planModules, type PlanModule } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, type Control } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { PlanValues } from "./plan-values";

/** The modules ticked, in the catalog's order whatever order they were ticked in. */
function withModule(modules: PlanModule[], module: PlanModule, included: boolean): PlanModule[] {
  return planModules.filter((entry) => (entry === module ? included : modules.includes(entry)));
}

export function ModulesField({ control }: { control: Control<PlanValues> }) {
  const t = useTranslations("consolePlatform");
  const id = useId();
  return (
    <Controller
      control={control}
      name="modules"
      render={({ field }) => (
        <FieldSet>
          <FieldLegend variant="label">{t("planForm.modules")}</FieldLegend>
          <FieldDescription>{t("planForm.modulesHint")}</FieldDescription>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {planModules.map((module) => (
              <Field key={module} orientation="horizontal" className="min-h-11">
                <Checkbox
                  id={`${id}-${module}`}
                  checked={field.value.includes(module)}
                  onCheckedChange={(checked) => {
                    field.onChange(withModule(field.value, module, checked === true));
                  }}
                />
                <FieldLabel htmlFor={`${id}-${module}`} className="font-normal">
                  {t(`modules.${module}`)}
                </FieldLabel>
              </Field>
            ))}
          </div>
        </FieldSet>
      )}
    />
  );
}
