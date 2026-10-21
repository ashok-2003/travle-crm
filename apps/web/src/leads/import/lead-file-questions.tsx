"use client";

// What a lead file leaves open (spec 3.2 step 2, B12, B13, D17): the stage rows with none get, the owner rows whose
// owner isn't on the staff go to, and, only when a Budget column has no basis column, whether budgets are per person
// or for everyone. The stage question is also asked on the check, for an import that comes from a Google Sheet.
import { budgetBases, leadImportStages, type BudgetBasis, type LeadImportStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OwnersFailed } from "../owners-failed";
import type { useLeadOwners } from "../use-lead-owners";

/** The Select's value for the agency's Owner: a user id can't be this. */
const DEFAULT_OWNER = "__default__";

export function StageQuestion({
  stage,
  onChange,
  disabled = false,
}: {
  stage: LeadImportStage;
  onChange: (stage: LeadImportStage) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("leads.import.match");
  const tStages = useTranslations("leads.stages");
  return (
    <FormField label={t("stageQuestion")}>
      {(links) => (
        <Select
          value={stage}
          disabled={disabled}
          onValueChange={(chosen) => {
            const next = leadImportStages.find((candidate) => candidate === chosen);
            if (next !== undefined) onChange(next);
          }}
        >
          <SelectTrigger {...links} className="h-auto w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {leadImportStages.map((option) => (
              <SelectItem key={option} value={option} className="whitespace-normal">
                {tStages(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function LeadFileQuestions({
  stage,
  onStage,
  ownerUserId,
  onOwner,
  owners,
  basis,
  onBasis,
  asksBasis,
  disabled = false,
}: {
  stage: LeadImportStage;
  onStage: (stage: LeadImportStage) => void;
  /** The owner for rows with none we can use; null is the agency's Owner. */
  ownerUserId: string | null;
  onOwner: (ownerUserId: string | null) => void;
  owners: ReturnType<typeof useLeadOwners>;
  basis: BudgetBasis;
  onBasis: (basis: BudgetBasis) => void;
  /** A Budget column is matched and no Budget basis column is. */
  asksBasis: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("leads.import.match");
  return (
    <div className="flex flex-col gap-4">
      <StageQuestion stage={stage} onChange={onStage} disabled={disabled} />
      <FormField label={t("ownerQuestion")}>
        {(links) => (
          <>
            <Select
              value={ownerUserId ?? DEFAULT_OWNER}
              disabled={disabled}
              onValueChange={(chosen) => {
                onOwner(chosen === DEFAULT_OWNER ? null : chosen);
              }}
            >
              <SelectTrigger {...links} className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={DEFAULT_OWNER} className="whitespace-normal">
                  {t("ownerDefault")}
                </SelectItem>
                {(owners.data ?? []).map((owner) => (
                  <SelectItem key={owner.userId} value={owner.userId} className="whitespace-normal">
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <OwnersFailed owners={owners} />
          </>
        )}
      </FormField>
      {asksBasis && (
        <FieldSet>
          <FieldLegend variant="label">{t("basisQuestion")}</FieldLegend>
          <RadioGroup
            value={basis}
            disabled={disabled}
            onValueChange={(chosen) => {
              const next = budgetBases.find((candidate) => candidate === chosen);
              if (next !== undefined) onBasis(next);
            }}
            className="flex flex-wrap gap-x-6 gap-y-0"
          >
            {budgetBases.map((option) => (
              <Field key={option} orientation="horizontal" className="min-h-11 w-auto">
                <RadioGroupItem id={`basis-${option}`} value={option} />
                <FieldLabel htmlFor={`basis-${option}`} className="font-normal">
                  {t(option === "per_person" ? "perPerson" : "forEveryone")}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
    </div>
  );
}
