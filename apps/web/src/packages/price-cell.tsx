"use client";

// One price in the price table: rupees typed in a box that says what empty means ("Not sold"), grouped Indian-style once
// the person moves on.
import { groupedRupees } from "@/components/forms/money-field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";

export function PriceCell({
  value,
  label,
  notSold,
  onChange,
}: {
  value: string;
  label: string;
  notSold: string;
  onChange: (text: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText aria-hidden="true">₹</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={label}
        value={value}
        placeholder={notSold}
        inputMode="decimal"
        autoComplete="off"
        className="numbers text-right"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={() => {
          onChange(groupedRupees(value));
        }}
      />
    </InputGroup>
  );
}
