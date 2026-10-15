"use client";

// /two-factor-setup: the setup, then on to whatever the api still asks, or back to the ?next= page, or home. The
// console sends platform staff here too, who are told it is the console that asks.
import { CurrentPersonGate, useContinueAfterStep, useReturnPath } from "./current-person";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupScreen() {
  const continueAfterStep = useContinueAfterStep();
  const sentHere = useReturnPath() !== null;
  return (
    <CurrentPersonGate>
      {(me) => (
        <TwoFactorSetup
          pending={me.pendingStep === "SET_UP_TWO_FACTOR" || sentHere}
          askedBy={me.isPlatformAdmin && me.organization === null ? "console" : "organization"}
          onDone={continueAfterStep}
        />
      )}
    </CurrentPersonGate>
  );
}
