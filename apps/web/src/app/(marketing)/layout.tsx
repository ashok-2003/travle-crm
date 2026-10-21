// The public pages (the landing page, privacy, terms): the product's header and footer around the page, with no
// session gate. They hold no organization's data, so the service worker may keep them as they are.
import type { ReactNode } from "react";
import { MarketingFooter } from "@/marketing/marketing-footer";
import { MarketingHeader } from "@/marketing/marketing-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
      <MarketingFooter />
    </div>
  );
}
