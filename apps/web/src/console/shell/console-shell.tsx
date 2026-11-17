// The frame around every console screen, the app's own (components/app-frame.tsx): the console's sidebar on desktop,
// the page, and its bottom bar on phones.
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { ConsolePushOffer } from "../notifications/console-push-offer";
import { ConsoleBottomBar } from "./console-bottom-bar";
import { ConsoleSidebar } from "./console-sidebar";

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <AppFrame sidebar={<ConsoleSidebar />} bottomBar={<ConsoleBottomBar />} above={<ConsolePushOffer />}>
      {children}
    </AppFrame>
  );
}
