"use client";

// Pieces of a group trip's fields (group packages): the toggles for its room types, days and months (Picks), and whether
// the trip is the only one a switched-on AI agent sells, so clearing its advance warns that the agent then answers no
// chat. Prices & dates' form (prices-editor.tsx), Add dates and the AI's drafts use them.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAgentSetup } from "@/ai/agent/use-agent";
import { useHolds } from "@/session/me-context";

export const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
export const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

/** A toggle group's chosen values: the field holds a list of text. */
const picked = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** A group of toggles bound to a field that holds a list of text (a package's room types, days or months). */
export function Picks<Values extends FieldValues>({
  control,
  name,
  legend,
  hint,
  options,
  disabled,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={1}
            disabled={disabled}
            className="flex-wrap"
            value={picked(field.value)}
            onValueChange={field.onChange}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </FieldSet>
  );
}

/**
 * Whether this package is the only one the switched-on agent may sell: without it the agent has nothing to sell and
 * answers no chat. Asked only for a package on sale, and of whoever may read the agent's setup.
 */
export function useOnlyPackageOnSale(detail: PackageDetail): boolean {
  const onSale = detail.kind === "group" && detail.sellable && detail.sellGaps.length === 0;
  const setup = useAgentSetup(useHolds("ai:manage") && onSale).data;
  return onSale && setup?.on === true && setup.steps.find((step) => step.key === "packages")?.count === 1;
}
