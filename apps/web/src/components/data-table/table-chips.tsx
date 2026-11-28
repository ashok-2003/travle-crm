"use client";

// A list's quick chips (a status, or a kind of work), one chosen at a time, the registry ToggleGroup: they scroll sideways
// in their own strip on a phone and wrap on a wider screen; the padding keeps their focus outline in view.
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function TableChips<Chip extends string>({
  chips,
  value,
  label,
  wordOf,
  onChoose,
}: {
  chips: readonly Chip[];
  value: Chip;
  /** The group's name: "Show". */
  label: string;
  wordOf: (chip: Chip) => string;
  onChoose: (chip: Chip) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(chosen) => {
        const chip = chips.find((one) => one === chosen);
        if (chip !== undefined) onChoose(chip);
      }}
      aria-label={label}
      className="-m-1 max-w-full justify-start overflow-x-auto p-1 md:flex-wrap md:overflow-visible"
    >
      {chips.map((chip) => (
        <ToggleGroupItem key={chip} value={chip} className="min-h-11 shrink-0 px-4">
          {wordOf(chip)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
