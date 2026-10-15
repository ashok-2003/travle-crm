"use client";

// /two-factor-setup: the setup, then on to whatever the api still asks, or home.
import { Delayed } from "@/components/delayed";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueAfterStep, useCurrentPerson } from "./current-person";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupScreen() {
  const me = useCurrentPerson();
  const continueAfterStep = useContinueAfterStep();
  if (!me.data) {
    return (
      <Delayed>
        <Skeleton className="h-64 w-full" />
      </Delayed>
    );
  }
  return <TwoFactorSetup pending={me.data.pendingStep === "SET_UP_TWO_FACTOR"} onDone={continueAfterStep} />;
}
