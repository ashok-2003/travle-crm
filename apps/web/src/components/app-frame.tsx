// The frame around every signed-in screen, the app's and the console's (DESIGN.md sections 4 and 6): a skip link to the
// page, the desktop sidebar (the registry's, which stays put while the page scrolls), whatever sits above the page
// (the phone's top bar, the banners), the page with a 16px gutter on phones, 24px on tablets and 32px wide, and on
// phones the bottom bar.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/** The page's part of the frame, where the skip link takes the focus. */
const MAIN_CONTENT_ID = "main-content";

export function AppFrame({
  sidebar,
  above,
  bottomBar,
  children,
}: {
  sidebar: ReactNode;
  above?: ReactNode;
  bottomBar: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <SidebarProvider>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-tooltip)"
      >
        {t("skipToContent")}
      </a>
      {sidebar}
      <SidebarInset id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0">
        {above}
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 md:pb-8 lg:px-8">{children}</div>
      </SidebarInset>
      {bottomBar}
    </SidebarProvider>
  );
}
