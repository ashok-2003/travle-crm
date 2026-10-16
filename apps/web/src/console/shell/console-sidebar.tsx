"use client";

// The console's desktop navigation, as the app's sidebar (DESIGN.md section 6), the registry's Sidebar: fixed to the
// window at full height while the page scrolls, on the surface tone, with the console's name, the destinations for the
// person's level (the current page in the blue tint), and who is signed in with sign-out at the bottom.
import { LogOutIcon } from "lucide-react";
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
import { useStaff } from "../session/staff-context";
import { isCurrentConsoleItem, visibleConsoleItems } from "./console-navigation";
import { useConsoleSignOut } from "./console-sign-out";
import { SignedInStaff } from "./signed-in-staff";

export function ConsoleSidebar() {
  const t = useTranslations("console");
  const staff = useStaff();
  const pathname = usePathname();
  const signOut = useConsoleSignOut();
  return (
    <Sidebar>
      <SidebarHeader>
        <p className="p-2 text-section font-semibold">{t("title")}</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label={t("navigation.label")}>
            <SidebarMenu>
              {visibleConsoleItems(staff).map((item) => {
                const current = isCurrentConsoleItem(item, pathname);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={current}>
                      <Link href={item.href} aria-current={current ? "page" : undefined}>
                        <item.icon aria-hidden="true" />
                        {t(`navigation.${item.key}`)}
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
        <div className="p-2">
          <SignedInStaff />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOutIcon aria-hidden="true" />
              {t("navigation.signOut")}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
