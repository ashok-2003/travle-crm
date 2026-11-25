"use client";

// A labelled box with its problem under it, for the calendar's small in-place edits (seats, an advance, a room's price).
import { useId } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  numeric = true,
  problem,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  problem?: string | undefined;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field data-invalid={problem !== undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        inputMode={numeric ? "decimal" : "text"}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={problem !== undefined}
        className="numbers"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {problem !== undefined && <FieldError>{problem}</FieldError>}
    </Field>
  );
}
