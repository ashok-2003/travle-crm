"use client";

// The two pieces every "this source stopped" alert is made of (the Sheets page, a Facebook Page's page): the frame, an
// info or problem Alert with its title, and the alert's one button, off with its reason while the subscription refuses it.
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess, type WriteKind } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

/**
 * The alert's one button, off with its reason while the subscription refuses it. Matching the columns again leaves the
 * page, so it is a link, drawn as the same outline button.
 */
export function AlertAction({
  kind,
  label,
  pending,
  pendingLabel,
  onClick,
  asLink,
  disabled = false,
}: {
  kind: WriteKind;
  label: string;
  pending?: boolean;
  /** What the button says while its request is out, when that is more than its label ("Checking…"). */
  pendingLabel?: string;
  onClick?: () => void;
  asLink?: string;
  disabled?: boolean;
}) {
  const write = useWriteAccess(kind);
  const hintId = useId();
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      {asLink !== undefined && write.allowed ? (
        <Button asChild variant="outline">
          <Link href={asLink}>{label}</Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={!write.allowed || disabled || pending === true}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={onClick}
        >
          {pending === true && <Spinner />}
          {pending === true && pendingLabel !== undefined ? pendingLabel : label}
        </Button>
      )}
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}

export function AlertFrame({
  tone,
  title,
  children,
}: {
  tone: "info" | "problem";
  title: string;
  children: ReactNode;
}) {
  const Icon = tone === "problem" ? CircleAlertIcon : InfoIcon;
  return (
    <Alert variant={tone === "problem" ? "destructive" : "default"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
