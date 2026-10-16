// A step's outcome, shown in place of its form ("Your password is changed"). It is announced one way only: as a
// heading that takes focus, so a screen reader reads it once and the person carries on from there, not from a
// button that has just gone. The box is not role="alert" as well, which would read it a second time.
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { focusWhenShown } from "./focus";

export function OutcomeMessage({
  variant = "default",
  children,
}: {
  variant?: "default" | "destructive";
  children: ReactNode;
}) {
  return (
    <Alert variant={variant} role={undefined}>
      {/* Styled as the box's description, which the variant colours. */}
      <h2 data-slot="alert-description" ref={focusWhenShown} tabIndex={-1} className="text-sm text-pretty outline-none">
        {children}
      </h2>
    </Alert>
  );
}
