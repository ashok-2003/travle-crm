"use client";

// The desktop navigation (DESIGN.md section 6): a 232px column on the surface tone, the organization's name with the
// bell beside it, the destinations, and the person's account and sign-out at the bottom. The current page has the
// blue tint.
import { UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { isCurrent, visibleNavigationItems } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { SignOutButton } from "./sign-out";

export function Sidebar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const pathname = usePathname();
  const prefetch = usePrefetchDestination();
  return (
    <aside className="hidden w-58 shrink-0 flex-col gap-6 border-r bg-surface px-3 py-5 md:flex">
      <div className="flex items-center justify-between gap-2 pl-3">
        <p className="script-leading min-w-0 text-section font-semibold break-words">{me.organization.name}</p>
        <NotificationBell opensAs="popover" />
      </div>
      <nav aria-label={t("label")} className="flex flex-1 flex-col gap-1">
        {visibleNavigationItems(me).map((item) => {
          const current = isCurrent(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              {...prefetchHandlers(() => {
                prefetch(item.key);
              })}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 font-medium text-foreground hover:bg-accent",
                current && "bg-accent text-accent-foreground",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t pt-4">
        <Link
          href={routes.account}
          aria-current={pathname === routes.account ? "page" : undefined}
          // At least 44px, growing when a long name wraps (names are never truncated).
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-1 hover:bg-accent"
        >
          <UserIcon aria-hidden="true" className="size-5" />
          <span className="min-w-0">
            <span className="block font-medium break-words">{me.user.name}</span>
            <span className="block text-caption text-muted-foreground">{t("account")}</span>
          </span>
        </Link>
        <SignOutButton className="justify-start px-3" />
      </div>
    </aside>
  );
}
