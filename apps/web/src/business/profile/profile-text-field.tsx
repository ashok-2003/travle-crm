"use client";

// One labelled box of the business profile form (DESIGN.md section 6: the label above, the hint and any problem below
// it, linked by aria-describedby, the problem with an icon; ids and numbers mono; a phone after its +91, unless it is
// typed with its own country code).
import { CircleAlertIcon } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProfileField, ProfileValues } from "./profile-values";

export function ProfileTextField({
  form,
  name,
  label,
  hint,
  mono = false,
  prefix,
  multiline = false,
  autoComplete = "off",
  inputMode,
}: {
  form: UseFormReturn<ProfileValues>;
  name: Exclude<ProfileField, "gstStateCode">;
  label: string;
  hint?: string;
  /** GSTIN, IFSC, account numbers and phones: mono, tabular, and never respelt or capitalised by the keyboard. */
  mono?: boolean;
  /** Shown before the box, such as +91 before a phone number, unless what is typed starts with its own "+". */
  prefix?: string;
  multiline?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel";
}) {
  const id = `profile-${name}`;
  const typed = useWatch({ control: form.control, name });
  const error = form.formState.errors[name];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter((part) => part !== null);
  const box = {
    id,
    autoComplete,
    "aria-invalid": error !== undefined,
    // No attribute at all rather than an empty one, which points at nothing.
    "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
    ...form.register(name),
  };
  const line = {
    ...box,
    inputMode,
    spellCheck: mono ? false : undefined,
    autoCapitalize: mono ? "characters" : undefined,
    className: cn(mono && "numbers"),
  };
  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline && <Textarea rows={3} {...box} />}
      {!multiline && prefix !== undefined && (
        <InputGroup>
          {/* Left out, rather than the box swapped, so typing a "+" keeps the box and its place. */}
          {!typed.trimStart().startsWith("+") && (
            <InputGroupAddon>
              <InputGroupText className="numbers">{prefix}</InputGroupText>
            </InputGroupAddon>
          )}
          <InputGroupInput {...line} />
        </InputGroup>
      )}
      {!multiline && prefix === undefined && <Input {...line} />}
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error && (
        <FieldError id={`${id}-error`} className="flex items-start gap-1.5">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </FieldError>
      )}
    </Field>
  );
}
