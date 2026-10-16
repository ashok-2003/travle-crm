"use client";

// A platform staff member's level, as two choices each saying what it allows: support works with organizations; a
// super admin also manages plans, platform staff and permanent deletion (ADR 0019).
import { platformStaffLevel, type PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function LevelField({
  value,
  onChange,
}: {
  value: PlatformStaffLevel;
  onChange: (level: PlatformStaffLevel) => void;
}) {
  const t = useTranslations("consolePlatform.staff");
  const tLevels = useTranslations("console.levels");
  const id = useId();
  return (
    <FieldSet>
      <FieldLegend variant="label">{t("addForm.level")}</FieldLegend>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          const parsed = platformStaffLevel.safeParse(next);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        {platformStaffLevel.options.map((level) => (
          <Field key={level} orientation="horizontal" className="min-h-11">
            <RadioGroupItem id={`${id}-${level}`} value={level} aria-describedby={`${id}-${level}-hint`} />
            <FieldContent>
              <FieldLabel htmlFor={`${id}-${level}`} className="font-normal">
                {tLevels(level)}
              </FieldLabel>
              <FieldDescription id={`${id}-${level}-hint`}>{t(`levelHints.${level}`)}</FieldDescription>
            </FieldContent>
          </Field>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
