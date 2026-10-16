"use client";

// /two-factor-setup: the setup, then on to whatever the api still asks, or back to the ?next= page, or home. The
// console sends platform staff here too, who are told it is the console that asks. Who asks comes from me.get, never
// from ?next=; a setup the person was sent to has no way around.
import { isPlatformStaff } from "@/session/me-context";
import { CurrentPersonGate, isStepDue, useContinueAfterStep, useReturnPath } from "./current-person";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupScreen() {
  const continueAfterStep = useContinueAfterStep();
  const returnPath = useReturnPath();
  return (
    <CurrentPersonGate>
      {(me) => {
        const due = isStepDue(me, "SET_UP_TWO_FACTOR", returnPath);
        const asker = isPlatformStaff(me) ? "console" : "organization";
        return (
          <TwoFactorSetup
            askedBy={due ? asker : null}
            canLeave={!due && returnPath === null}
            onDone={continueAfterStep}
          />
        );
      }}
    </CurrentPersonGate>
  );
}
