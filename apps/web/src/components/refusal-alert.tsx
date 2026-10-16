"use client";

// Why the api refused what the person asked (spec 9.7), above the button they pressed: the registry's destructive
// Alert with its icon and the reason's sentence (lib/error-message.ts). Nothing at all without an error, so a form
// writes `<RefusalAlert error={mutation.error} />` and no condition around it.
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useErrorMessage } from "@/lib/error-message";

export function RefusalAlert({ error }: { error: unknown }) {
  const { apiError } = useErrorMessage();
  if (error === null || error === undefined) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{apiError(error)}</AlertDescription>
    </Alert>
  );
}
