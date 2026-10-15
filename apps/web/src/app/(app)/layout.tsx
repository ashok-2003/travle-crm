// Every signed-in screen: the session gate, then the shell around the page.
import type { ReactNode } from "react";
import { SessionGate } from "@/session/session-gate";
import { AppShell } from "@/shell/app-shell";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
