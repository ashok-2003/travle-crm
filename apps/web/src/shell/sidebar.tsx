"use client";

// The desktop navigation (DESIGN.md section 6), the registry's Sidebar: fixed to the window at full height while the
// page scrolls, with the agency's logo (or name; folded, the logo small or the name's first letter), the bell and the fold
// button; the destinations under their headings, the current page marked, and live counts where work waits (the Inbox's
// unread chats, Today's due and overdue work); and at the bottom the person (their initials, name and role) opening a
// menu with their account, notifications and sign-out. Folded, it keeps the icons, each named in a tooltip, and opens
// again as it was left. Phones have the top bar and the bottom bar instead.
import { BellIcon, ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChatAvatar } from "@/inbox/chat-avatar";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { routes } from "@/lib/routes";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { useTodaySummary } from "@/today/use-today";
import { isAtOrUnder, isCurrent, navigationGroups, type NavigationItem } from "./navigation";
import { FoldedOrgMark, OrgMark } from "./org-mark";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { useSignOut } from "./sign-out";
import { useNavigationItems } from "./use-navigation-items";

/** A count beside a destination, past 99 as "99+"; nothing at zero. */
function CountBadge({ count, label }: { count: number | undefined; label: string }) {
  if (count === undefined || count === 0) return null;
  return (
    <SidebarMenuBadge aria-label={label} className="numbers">
      {count > 99 ? "99+" : count}
    </SidebarMenuBadge>
  );
}

function InboxCount() {
  const t = useTranslations("shell.navigation");
  const count = useInboxSummary().data?.unread;
  return <CountBadge count={count} label={t("unread", { count: count ?? 0 })} />;
}

function TodayCount() {
  const t = useTranslations("shell.navigation");
  const counts = useTodaySummary().data?.counts;
  const count = counts === undefined ? undefined : counts.overdue + counts.dueToday + counts.newLeads;
  return <CountBadge count={count} label={t("toDo", { count: count ?? 0 })} />;
}

const counts: Partial<Record<NavigationItem["key"], () => React.ReactNode>> = {
  inbox: () => <InboxCount />,
  today: () => <TodayCount />,
};

function PersonMenu() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const signOut = useSignOut();
  const pathname = usePathname();
  const onAccount = isAtOrUnder(pathname, routes.account);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          isActive={onAccount}
          tooltip={me.user.name}
          aria-label={t("personMenu", { name: me.user.name })}
        >
          <ChatAvatar name={me.user.name} seed={me.user.id} />
          <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{me.user.name}</span>
            <span className="truncate text-caption">{me.member.role.name}</span>
          </span>
          <ChevronsUpDownIcon aria-hidden="true" className="ml-auto group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{me.user.name}</span>
          <span className="truncate text-caption font-normal text-muted-foreground">{me.organization.name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.account}>
            <UserIcon aria-hidden="true" />
            {t("account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.notificationPreferences}>
            <BellIcon aria-hidden="true" />
            {t("notifications")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOutIcon aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const t = useTranslations("shell.navigation");
  const pathname = usePathname();
  const items = useNavigationItems();
  const prefetch = usePrefetchDestination();
  const { open } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 py-4">
        <div className="flex items-center gap-1 pl-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:pl-0">
          <OrgMark className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden" />
          <FoldedOrgMark />
          <NotificationBell opensAs="popover" />
          <SidebarTrigger label={open ? t("collapse") : t("expand")} />
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-1 py-2">
        <nav aria-label={t("label")}>
          {navigationGroups.map((group) => {
            const inGroup = items.filter((item) => item.group === group);
            if (inGroup.length === 0) return null;
            return (
              <SidebarGroup key={group}>
                <SidebarGroupLabel className="text-caption font-semibold tracking-wide uppercase group-data-[collapsible=icon]:hidden">
                  {t(`groups.${group}`)}
                </SidebarGroupLabel>
                <SidebarMenu className="gap-0.5">
                  {inGroup.map((item) => {
                    const current = isCurrent(item, pathname);
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton asChild isActive={current} tooltip={t(item.key)} className="font-medium">
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
                        {counts[item.key]?.()}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <PersonMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
