"use client";

// What a screen shows when its data didn't load (DESIGN.md section 6): what failed, and a way to try again.
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div role="alert" className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <TriangleAlertIcon aria-hidden="true" className="size-10 text-status-bad-ink" strokeWidth={1.25} />
      <p className="max-w-[40ch]">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
