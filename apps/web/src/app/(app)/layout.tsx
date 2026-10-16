// Every signed-in screen: the session gate, then the shell around the page, which the subscription may shut.
import type { ReactNode } from "react";
import { SessionGate } from "@/session/session-gate";
import { AppShell } from "@/shell/app-shell";
import { SubscriptionGate } from "@/subscription/subscription-gate";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>
        <SubscriptionGate>{children}</SubscriptionGate>
      </AppShell>
    </SessionGate>
  );
}
