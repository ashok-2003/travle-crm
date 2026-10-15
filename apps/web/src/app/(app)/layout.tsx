// Every signed-in screen: the session gate, then the shell (DESIGN.md sections 4 and 6). A skip link; on desktops the
// sidebar, which stays put while the page scrolls; the banners and the page, with a 16px gutter on phones, 24px on
// tablets and 32px wide; and on phones the bottom bar. The sidebar is always open: nothing offers to fold it away.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SessionGate } from "@/session/session-gate";
import { Banners } from "@/shell/banners";
import { BottomBar } from "@/shell/bottom-bar";
import { AppSidebar } from "@/shell/sidebar";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <SessionGate>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("skipToContent")}
        </a>
        <AppSidebar />
        <SidebarInset id="main-content" tabIndex={-1} className="min-w-0">
          <Banners />
          <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8">{children}</div>
        </SidebarInset>
        <BottomBar />
      </SidebarProvider>
    </SessionGate>
  );
}
