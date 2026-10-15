"use client";

// The desktop navigation (DESIGN.md section 6), the registry's Sidebar: fixed to the window at full height while the
// page scrolls, on the surface tone, with the organization's name, the destinations (the current page in the blue
// tint), and the person's account (a long name wraps) and sign-out at the bottom. Phones have the bottom bar instead.
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
import { usePageData } from "@/data/providers";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { isCurrent, visibleNavigationItems } from "./navigation";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";

export function AppSidebar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const page = usePageData();
  const pathname = usePathname();
  const prefetch = usePrefetchDestination();
  const onAccount = pathname === routes.account;
  return (
    <Sidebar>
      <SidebarHeader>
        <p className="p-2 text-section font-semibold">{me.organization.name}</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label={t("label")}>
            <SidebarMenu>
              {visibleNavigationItems(me).map((item) => {
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
            <SidebarMenuButton onClick={() => void page.signOut()}>
              <LogOutIcon aria-hidden="true" />
              {t("signOut")}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
