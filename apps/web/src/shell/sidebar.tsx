"use client";

// The desktop navigation (DESIGN.md section 6), the registry's Sidebar: fixed to the window at full height while the
// page scrolls, on the surface tone, with the agency's logo (or name), the bell and the fold button, the destinations
// under their headings (the current page in the blue tint), and the person's account (a long name wraps) and sign-out
// at the bottom. Folded, it keeps the icons, each named in a tooltip, and opens again as it was left. Phones have the
// top bar and the bottom bar instead.
import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { routes } from "@/lib/routes";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { isAtOrUnder, isCurrent, navigationGroups } from "./navigation";
import { OrgMark } from "./org-mark";
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
  const { open } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1 pl-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:pl-0">
          <OrgMark className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden" />
          <NotificationBell opensAs="popover" />
          <SidebarTrigger label={open ? t("collapse") : t("expand")} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("label")}>
          {navigationGroups.map((group) => {
            const inGroup = items.filter((item) => item.group === group);
            if (inGroup.length === 0) return null;
            return (
              <SidebarGroup key={group}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                  {t(`groups.${group}`)}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {inGroup.map((item) => {
                    const current = isCurrent(item, pathname);
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton asChild isActive={current} tooltip={t(item.key)}>
                          <Link
                            href={item.href}
                            aria-current={current ? "page" : undefined}
                            {...prefetchHandlers(() => {
                              prefetch(item.key);
                            })}
                          >
                            <item.icon aria-hidden="true" />
                            <span className="group-data-[collapsible=icon]:hidden">{t(item.key)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={onAccount} tooltip={t("account")}>
              <Link href={routes.account} aria-current={onAccount ? "page" : undefined}>
                <UserIcon aria-hidden="true" />
                <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                  <span className="font-medium break-words">{me.user.name}</span>
                  <span className="text-caption text-muted-foreground">{t("account")}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip={t("signOut")}>
              <LogOutIcon aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">{t("signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
