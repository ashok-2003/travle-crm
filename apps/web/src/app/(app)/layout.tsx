// Every signed-in screen: the session gate, then the shell (components/app-frame.tsx). On desktops the sidebar; on
// phones a bar above the page with the organization's name and the bell, and the bottom bar; the banners and the page,
// which the subscription may shut. The sidebar is always open: nothing offers to fold it away.
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { SessionGate } from "@/session/session-gate";
import { Banners } from "@/shell/banners";
import { BottomBar } from "@/shell/bottom-bar";
import { AppSidebar } from "@/shell/sidebar";
import { TopBar } from "@/shell/top-bar";
import { SubscriptionGate } from "@/subscription/subscription-gate";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppFrame
        sidebar={<AppSidebar />}
        above={
          <>
            <TopBar />
            <Banners />
          </>
        }
        bottomBar={<BottomBar />}
      >
        <SubscriptionGate>{children}</SubscriptionGate>
      </AppFrame>
    </SessionGate>
  );
}
