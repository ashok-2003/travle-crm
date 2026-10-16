"use client";

// What a screen shows when its data didn't load (DESIGN.md section 6): what failed, and a way to try again. The
// registry's Empty.
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function ErrorState({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyMedia>
          <TriangleAlertIcon aria-hidden="true" className="size-10 text-status-bad-ink" strokeWidth={1.25} />
        </EmptyMedia>
        <EmptyTitle>{message}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
