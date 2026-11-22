// Every signed-in screen: the session gate, then the shell (components/app-frame.tsx). On desktops the sidebar's rail,
// which opens over the page; on phones a bar above the page with the organization's name and the bell, and the bottom
// bar; the banners and the page, which the subscription may shut. Each page's use is counted for the platform
// console, a new member sees the welcome once, and the Inbox's live stream gives its alerts on every page.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { InboxLiveShell } from "@/inbox/inbox-live-shell";
import { AgencyPushOffer } from "@/notifications/push/agency-push-offer";
import { CallReturn } from "@/leads/call/call-return";
import { SessionGate } from "@/session/session-gate";
import { AiStatusPrefetch } from "@/shell/ai-status-prefetch";
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
          above={
            <>
              <AiStatusPrefetch />
              <InboxLiveShell />
              <RefreshOnPush />
              <CallReturn />
              <PageTracker />
              <WelcomeDialog />
              <AgencyPushOffer />
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
