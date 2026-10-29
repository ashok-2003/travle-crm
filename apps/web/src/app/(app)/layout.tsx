// Every signed-in screen: the session gate, then the shell (components/app-frame.tsx). On desktops the sidebar; on
// phones a bar above the page with the organization's name and the bell, and the bottom bar; the banners and the page,
// which the subscription may shut. The sidebar folds to its icons and opens again as it was left. Each page's use is
// counted for the platform console, and a new member sees the welcome once.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { CallReturn } from "@/leads/call/call-return";
import { SessionGate } from "@/session/session-gate";
import { Banners } from "@/shell/banners";
import { BottomBar } from "@/shell/bottom-bar";
import { RefreshOnPush } from "@/shell/refresh-on-push";
import { AppSidebar } from "@/shell/sidebar";
import { TopBar } from "@/shell/top-bar";
import { SubscriptionGate } from "@/subscription/subscription-gate";
import { PageTracker } from "@/usage/page-tracker";
import { WelcomeDialog } from "@/welcome/welcome-dialog";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider>
      <SessionGate>
        <AppFrame
          sidebar={<AppSidebar />}
          foldable
          above={
            <>
              <RefreshOnPush />
              <CallReturn />
              <PageTracker />
              <WelcomeDialog />
              <TopBar />
              <Banners />
            </>
          }
          bottomBar={<BottomBar />}
        >
          <SubscriptionGate>{children}</SubscriptionGate>
        </AppFrame>
      </SessionGate>
    </NextIntlClientProvider>
  );
}
