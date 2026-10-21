// Every signed-in screen: the session gate, then the shell (components/app-frame.tsx). On desktops the sidebar; on
// phones a bar above the page with the organization's name and the bell, and the bottom bar; the banners and the page,
// which the subscription may shut. The sidebar folds to its icons and opens again as it was left.
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { SessionGate } from "@/session/session-gate";
import { Banners } from "@/shell/banners";
import { BottomBar } from "@/shell/bottom-bar";
import { RefreshOnPush } from "@/shell/refresh-on-push";
import { AppSidebar } from "@/shell/sidebar";
import { TopBar } from "@/shell/top-bar";
import { SubscriptionGate } from "@/subscription/subscription-gate";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppFrame
        sidebar={<AppSidebar />}
        foldable
        above={
          <>
            <RefreshOnPush />
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
