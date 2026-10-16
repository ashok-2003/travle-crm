"use client";

// What a screen shows when its data didn't load (DESIGN.md section 6): what failed, and a way to try again. Given the
// call's error, a refusal with a reason says that reason's sentence instead (a missing permission, a shut
// organization: spec 9.7), since trying again would get the same answer; anything else says `message`. The registry's
// Empty.
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";

export function ErrorState({
  message,
  error,
  retryLabel,
  onRetry,
}: {
  /** What didn't load, for a failure with no reason (offline, a fault). */
  message: string;
  /** The call's error, whose reason, if it has one, is said instead. */
  error?: unknown;
  retryLabel: string;
  onRetry: () => void;
}) {
  const { apiError } = useErrorMessage();
  const shown = refusalOf(error)?.reason ? apiError(error) : message;
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyMedia>
          <TriangleAlertIcon aria-hidden="true" className="size-10 text-status-bad-ink" strokeWidth={1.25} />
        </EmptyMedia>
        <EmptyTitle>{shown}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
