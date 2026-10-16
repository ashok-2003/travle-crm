"use client";

// What stops a console form's dialog from sending, above its button: the form's own problem (useCheckedForm's
// formProblem) or else the api's refusal.
import { CircleAlertIcon } from "lucide-react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormRefusal({ problem, error }: { problem: string | undefined; error: unknown }) {
  if (problem === undefined) return <RefusalAlert error={error} />;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{problem}</AlertDescription>
    </Alert>
  );
}
