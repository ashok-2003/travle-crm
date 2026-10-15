"use client";

// /two-factor-setup: the setup, then on to whatever the api still asks, or home.
import { CurrentPersonGate, useContinueAfterStep } from "./current-person";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupScreen() {
  const continueAfterStep = useContinueAfterStep();
  return (
    <CurrentPersonGate>
      {(me) => <TwoFactorSetup pending={me.pendingStep === "SET_UP_TWO_FACTOR"} onDone={continueAfterStep} />}
    </CurrentPersonGate>
  );
}
