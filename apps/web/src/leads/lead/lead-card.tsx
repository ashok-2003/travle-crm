"use client";

// One part of a lead's page (spec 3.4) as the registry Card: a heading the card is named by, its one action at the
// right (Edit, Add follow-up), and its content; a tint where its colour says what it holds (the trip's sky, the AI's
// violet: components/card-tints.ts). ChangeButton is that action: a change, so it is off while the
// subscription refuses changes, and says why (useWriteAccess); its ref is its dialog's returnFocusTo, which takes the
// focus back when the dialog closes.
import { useId, type ReactNode, type Ref } from "react";
import { cardTints, type CardTint } from "@/components/card-tints";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function LeadCard({
  title,
  action,
  tint,
  fill = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  tint?: CardTint;
  /** It takes the height its column has left, its content what the heading leaves (the computer's timeline). */
  fill?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className={cn(tint !== undefined && cardTints[tint], fill && "min-h-80 flex-1")}
    >
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-4", fill && "min-h-0 flex-1")}>{children}</CardContent>
    </Card>
  );
}

export function ChangeButton({
  label,
  accessibleLabel,
  onClick,
  ref,
}: {
  label: string;
  /** A fuller name where the word alone is ambiguous on the page ("Edit the trip"). */
  accessibleLabel?: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const write = useWriteAccess("change");
  const hintId = useId();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={ref}
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
