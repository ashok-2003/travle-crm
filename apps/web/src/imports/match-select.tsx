"use client";

// The one Select both matchers use (spec 3.2 step 2): named by what it matches ("What Mobile No holds"), with a first
// choice that stands for nothing ("Don't import", or a value's default), and choices another column holds shown but
// not to be picked. The registry's 44px options; their words wrap.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The Select's value for the first choice: Radix keeps "" for "nothing chosen yet", and no target (a user id, a
 * stage, a role key, which is letters, digits and dashes) can be this (W4).
 */
const NONE = "__none__";

export interface MatchOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function MatchSelect({
  label,
  value,
  noneLabel,
  options,
  onChange,
  disabled = false,
}: {
  /** The Select's accessible name. */
  label: string;
  value: string | null;
  noneLabel: string;
  options: readonly MatchOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? NONE}
      disabled={disabled}
      onValueChange={(chosen) => {
        onChange(chosen === NONE ? null : chosen);
      }}
    >
      <SelectTrigger aria-label={label} className="h-auto w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={NONE} className="whitespace-normal">
          {noneLabel}
        </SelectItem>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled ?? false}
            className="whitespace-normal"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
