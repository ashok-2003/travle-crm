"use client";

// The frame around every console screen, as the app's (shell/app-shell.tsx): a skip link, the sidebar on desktop,
// the page, and the bottom bar on phones. The page gutter is 16px on phones, 24px on tablets, 32px wide.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/shell/app-shell";
import { ConsoleBottomBar } from "./console-bottom-bar";
import { ConsoleSidebar } from "./console-sidebar";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <ConsoleSidebar />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8"
      >
        {children}
      </main>
      <ConsoleBottomBar />
    </div>
  );
}
