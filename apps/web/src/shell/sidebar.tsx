"use client";

// The desktop navigation (DESIGN.md section 6), the registry's Sidebar: fixed to the window at full height while the
// page scrolls, on the surface tone, with the organization's name and the bell beside it, the destinations (the
// current page in the blue tint), and the person's account (a long name wraps) and sign-out at the bottom. Phones have
// the top bar and the bottom bar instead.
import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { routes } from "@/lib/routes";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { isAtOrUnder, isCurrent } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { useSignOut } from "./sign-out";
import { useNavigationItems } from "./use-navigation-items";

export function AppSidebar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const signOut = useSignOut();
  const pathname = usePathname();
  const items = useNavigationItems();
  const prefetch = usePrefetchDestination();
  const onAccount = isAtOrUnder(pathname, routes.account);
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 pl-2">
          <p className="script-leading min-w-0 text-section font-semibold break-words">{me.organization.name}</p>
          <NotificationBell opensAs="popover" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label={t("label")}>
            <SidebarMenu>
              {items.map((item) => {
                const current = isCurrent(item, pathname);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={current}>
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        {...prefetchHandlers(() => {
                          prefetch(item.key);
                        })}
                      >
                        <item.icon aria-hidden="true" />
                        {t(item.key)}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={onAccount}>
              <Link href={routes.account} aria-current={onAccount ? "page" : undefined}>
                <UserIcon aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium break-words">{me.user.name}</span>
                  <span className="text-caption text-muted-foreground">{t("account")}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOutIcon aria-hidden="true" />
              {t("signOut")}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
