"use client";

// What every labelled form control shares (DESIGN.md: a visible label above, never a placeholder alone; the hint and
// the error below, the error with an icon, both linked to the control by aria-describedby, and the control marked
// invalid while there is one). The caller renders the control itself, with the attributes that link it.
import { CircleAlertIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/** What a control spreads to be linked to its label, hint and error. */
export interface FieldLinks {
  id: string;
  "aria-invalid": boolean;
  /** No attribute at all rather than an empty one, which points at nothing. */
  "aria-describedby": string | undefined;
}

export function FormField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string | undefined;
  /** The problem's words, while there is one. */
  error?: string | undefined;
  className?: string | undefined;
  /** The control, given its links and the label's id (for a control named by more than its label). */
  children: (links: FieldLinks, labelId: string) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error === undefined ? null : `${id}-error`].filter(
    (part) => part !== null,
  );
  const links: FieldLinks = {
    id,
    "aria-invalid": error !== undefined,
    "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
  };
  return (
    <Field data-invalid={error !== undefined} className={className}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      {children(links, `${id}-label`)}
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error !== undefined && <FieldProblem id={`${id}-error`}>{error}</FieldProblem>}
    </Field>
  );
}

/** A field's problem in words after an icon, never colour alone. */
export function FieldProblem({ id, children }: { id: string; children: ReactNode }) {
  return (
    <FieldError id={id} className="flex items-start gap-1.5">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </FieldError>
  );
}
