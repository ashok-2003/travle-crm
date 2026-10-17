"use client";

// A refusal the api gives about one field, said on that field (its error under it, the control marked invalid and
// described by it) rather than at the end of the form: a due time already past on the time, a destination's name taken
// on the name. `fields` maps such reasons to their field. Returns the error FormAlert should still show: none once a
// field says it, so the sentence appears once.
import { useEffect } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";

export function useRefusalOnField<Values extends FieldValues>(
  form: UseFormReturn<Values>,
  error: unknown,
  fields: Partial<Record<string, FieldPath<Values>>>,
): unknown {
  const { apiError } = useErrorMessage();
  const reason = refusalOf(error)?.reason ?? null;
  const field = reason === null ? undefined : fields[reason];
  useEffect(() => {
    if (field !== undefined) form.setError(field, { message: apiError(error) });
  }, [field, error, form, apiError]);
  return field === undefined ? error : null;
}
