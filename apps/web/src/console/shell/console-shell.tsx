"use client";

// The frame around every console screen, as the app's ((app)/layout.tsx): a skip link, the registry's sidebar on
// desktop, which stays put while the page scrolls, the page, and the bottom bar on phones. The page gutter is 16px on
// phones, 24px on tablets, 32px wide.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ConsoleBottomBar } from "./console-bottom-bar";
import { ConsoleSidebar } from "./console-sidebar";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <ConsoleSidebar />
      <SidebarInset id="main-content" tabIndex={-1} className="min-w-0">
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8">{children}</div>
      </SidebarInset>
      <ConsoleBottomBar />
    </SidebarProvider>
  );
}
