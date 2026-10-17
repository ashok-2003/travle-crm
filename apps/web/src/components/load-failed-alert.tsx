"use client";

// A part of a screen or a form that didn't load, said where it would be, with Try again: for what the rest works on
// without (the Leads chips' counts, a list of people to choose from). The registry Alert, its words beside the
// button. A refusal with a reason says that reason's sentence instead, as ErrorState does for a whole screen. Try
// again is never a form's submit, inside a form or not.
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";

export function LoadFailedAlert({
  message,
  error,
  onRetry,
}: {
  /** What didn't load, for a failure with no reason (offline, a fault). */
  message: string;
  error: unknown;
  onRetry: () => void;
}) {
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {refusalOf(error)?.reason ? apiError(error) : message}
        <Button type="button" variant="outline" onClick={onRetry}>
          {tCommon("tryAgain")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
