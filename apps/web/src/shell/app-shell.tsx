"use client";

// The frame around every signed-in screen: a skip link, the sidebar on desktop, the banners, the page, and the
// bottom bar on phones (DESIGN.md sections 4 and 6). Phones get a bar above the page with the organization's name and
// the bell, so the bottom bar keeps its destinations. The page gutter is 16px on phones, 24px on tablets, 32px wide.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { Banners } from "./banners";
import { BottomBar } from "./bottom-bar";
import { Sidebar } from "./sidebar";

export const MAIN_CONTENT_ID = "main-content";

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const me = useMe();
  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-2 border-b py-1 pr-2 pl-4 md:hidden">
          <p className="script-leading min-w-0 text-section font-semibold break-words">{me.organization.name}</p>
          <NotificationBell opensAs="sheet" />
        </header>
        <Banners />
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8"
        >
          {children}
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
