"use client";

// The phone navigation (DESIGN.md section 6): a 56px bar at the bottom with up to four destinations and "More",
// labels always shown, above the home indicator. "More" opens a sheet with the rest, the account and sign-out.
import { EllipsisIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { BOTTOM_BAR_ITEMS, isCurrent } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { SignOutButton } from "./sign-out";
import { useNavigationItems } from "./use-navigation-items";

const tabClasses = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium";

export function BottomBar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const prefetch = usePrefetchDestination();
  const items = useNavigationItems();
  const inBar = items.slice(0, BOTTOM_BAR_ITEMS);
  const inMore = items.slice(BOTTOM_BAR_ITEMS);
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {inBar.map((item) => {
        const current = isCurrent(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            {...prefetchHandlers(() => {
              prefetch(item.key);
            })}
            className={cn(tabClasses, current ? "text-primary" : "text-muted-foreground")}
          >
            <item.icon aria-hidden="true" className="size-5" />
            {t(item.key)}
          </Link>
        );
      })}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={cn(tabClasses, "text-muted-foreground")}>
          <EllipsisIcon aria-hidden="true" className="size-5" />
          {t("more")}
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{me.organization.name}</SheetTitle>
            <SheetDescription>{me.user.name}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {[
              ...inMore.map((item) => ({ key: item.key, href: item.href, icon: item.icon, destination: item.key })),
              { key: "account" as const, href: routes.account, icon: UserIcon, destination: null },
            ].map(({ destination, ...entry }) => (
              <Link
                key={entry.key}
                href={entry.href}
                {...(destination === null
                  ? {}
                  : prefetchHandlers(() => {
                      prefetch(destination);
                    }))}
                onClick={() => {
                  setMoreOpen(false);
                }}
                className="flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-accent"
              >
                <entry.icon aria-hidden="true" className="size-5" />
                {t(entry.key)}
              </Link>
            ))}
            <SignOutButton className="justify-start px-3" />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
