"use client";

// One labelled box of the business profile form (FormField: the label above, the hint and any problem below it,
// linked by aria-describedby, the problem with an icon); ids and numbers mono; a phone after its +91, unless it is
// typed with its own country code.
import { useWatch, type UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/form-field";
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
  const typed = useWatch({ control: form.control, name });
  return (
    <FormField label={label} hint={hint} error={form.formState.errors[name]?.message}>
      {(links) => {
        const box = { ...links, autoComplete, ...form.register(name) };
        if (multiline) return <Textarea rows={3} {...box} />;
        const line = {
          ...box,
          inputMode,
          spellCheck: mono ? false : undefined,
          autoCapitalize: mono ? "characters" : undefined,
          className: cn(mono && "numbers"),
        };
        if (prefix === undefined) return <Input {...line} />;
        return (
          <InputGroup>
            {/* Left out, rather than the box swapped, so typing a "+" keeps the box and its place. */}
            {!typed.trimStart().startsWith("+") && (
              <InputGroupAddon>
                <InputGroupText className="numbers">{prefix}</InputGroupText>
              </InputGroupAddon>
            )}
            <InputGroupInput {...line} />
          </InputGroup>
        );
      }}
    </FormField>
  );
}
