"use client";

// One part of a lead's page (spec 3.4) as the registry Card: a heading the card is named by, its one action at the
// right (Edit, Add follow-up), and its content. ChangeButton is that action: a change, so it is off while the
// subscription refuses changes, and says why (useWriteAccess).
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function LeadCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id}>
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function ChangeButton({
  label,
  accessibleLabel,
  onClick,
}: {
  label: string;
  /** A fuller name where the word alone is ambiguous on the page ("Edit the trip"). */
  accessibleLabel?: string;
  onClick: () => void;
}) {
  const write = useWriteAccess("change");
  const hintId = useId();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        aria-label={accessibleLabel}
        aria-describedby={write.hint === null ? undefined : hintId}
        disabled={!write.allowed}
        onClick={onClick}
      >
        {label}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
