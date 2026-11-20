"use client";

// The desktop navigation (DESIGN.md section 6, web revamp part 5): a 60px rail of icons on every page that opens as the
// full sidebar over the page on hover, keyboard focus or a touch screen's top button, and shuts when the pointer leaves,
// or stays open over the page while its pin is pressed (components/ui/aceternity-sidebar.tsx). Heroicons'
// outline icons, the solid one for the current page. At its top the agency's mark and name and the bell; the destinations in three
// groups split by a hairline, the current page marked, live counts where work waits (the Inbox's unread chats in the
// people violet, My tasks' work in red); at its foot the person, whose menu holds their account and sign-out.
// Phones have the top bar and the bottom bar instead.
import { ArrowRightStartOnRectangleIcon, BellIcon, UserIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TabCount } from "@/components/tab-count";
import {
  Sidebar,
  SidebarBody,
  SidebarButton,
  SidebarContent,
  SidebarDock,
  SidebarFooter,
  SidebarHeader,
  SidebarLink,
  SidebarRow,
  SidebarSeparator,
  SidebarToggle,
  useSidebar,
} from "@/components/ui/aceternity-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf, tintOf } from "@/inbox/chat-avatar";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useMe } from "@/session/me-context";
import { useTodaySummary } from "@/today/use-today";
import { isCurrent, navigationGroups, type NavigationItem } from "./navigation";
import { OrgAvatar } from "./org-mark";
import { prefetchHandlers, usePrefetchDestination } from "./prefetch";
import { useSignOut } from "./sign-out";
import { useNavigationItems } from "./use-navigation-items";

/** Work waiting at a destination: its pill (and its dot at rest), and the words a screen reader hears after its name. */
interface Waiting {
  count: number;
  tone: "waiting" | "people";
  words: string;
}

const dots = { waiting: "bg-status-bad-dot", people: "bg-people" } as const;

function Destination({ item, waiting }: { item: NavigationItem; waiting?: Waiting }) {
  const t = useTranslations("shell.navigation");
  const pathname = usePathname();
  const prefetch = usePrefetchDestination();
  const shown = waiting !== undefined && waiting.count > 0 ? waiting : undefined;
  const current = isCurrent(item, pathname);
  return (
    <SidebarLink
      href={item.href}
      icon={current ? <item.activeIcon /> : <item.icon />}
      label={t(item.key)}
      current={current}
      dot={shown && dots[shown.tone]}
      aside={shown && <TabCount count={shown.count} tone={shown.tone} />}
      description={shown?.words}
      {...prefetchHandlers(() => {
        prefetch(item.key);
      })}
    />
  );
}

function InboxDestination({ item }: { item: NavigationItem }) {
  const t = useTranslations("shell.navigation");
  const count = useInboxSummary().data?.unread ?? 0;
  return <Destination item={item} waiting={{ count, tone: "people", words: t("unread", { count }) }} />;
}

function TodayDestination({ item }: { item: NavigationItem }) {
  const t = useTranslations("shell.navigation");
  const counts = useTodaySummary().data?.counts;
  const count = counts === undefined ? 0 : counts.overdue + counts.dueToday + counts.newLeads;
  return <Destination item={item} waiting={{ count, tone: "waiting", words: t("toDo", { count }) }} />;
}

/** The destinations with a live count; only these ask for one, so a role without the Inbox never asks for its count. */
const counted: Partial<Record<NavigationItem["key"], (props: { item: NavigationItem }) => ReactNode>> = {
  inbox: InboxDestination,
  today: TodayDestination,
};

/** The bell as one of the sidebar's rows; the sidebar stays open while its notifications are. */
function BellRow() {
  const t = useTranslations("shell.navigation");
  const { hold } = useSidebar();
  return (
    <NotificationBell
      opensAs="popover"
      onOpenChange={(open) => {
        hold("bell", open);
      }}
      trigger={({ label, unread }) => (
        <SidebarButton
          icon={<BellIcon />}
          label={t("notifications")}
          aria-label={label}
          dot={unread > 0 ? dots.people : undefined}
          aside={unread > 0 ? <TabCount count={unread} tone="people" /> : undefined}
        />
      )}
    />
  );
}

/** The person at the foot: their initials and name, opening a menu with their account and sign-out. */
function PersonMenu() {
  const t = useTranslations("shell.navigation");
  const { user } = useMe();
  const signOut = useSignOut();
  const { hold, chose } = useSidebar();
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        hold("account", open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarButton
          icon={
            <Avatar className="size-8">
              <AvatarFallback className={cn("font-semibold", tintOf(user.id))}>{initialsOf(user.name)}</AvatarFallback>
            </Avatar>
          }
          label={user.name}
          aria-label={t("accountMenu", { name: user.name })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56">
        <DropdownMenuItem asChild>
          <Link href={routes.account} onClick={chose}>
            <UserIcon aria-hidden="true" />
            {t("account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <ArrowRightStartOnRectangleIcon aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const t = useTranslations("shell.navigation");
  const { organization } = useMe();
  const items = useNavigationItems();
  const groups = navigationGroups
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((group) => group.items.length > 0);
  return (
    <Sidebar>
      <SidebarBody>
        <SidebarHeader>
          <SidebarToggle openLabel={t("openSidebar")} closeLabel={t("closeSidebar")} />
          <SidebarRow icon={<OrgAvatar className="size-8" />} action={<SidebarDock label={t("pinSidebar")} />}>
            <span className="script-leading text-section font-semibold">{organization.name}</span>
          </SidebarRow>
          <BellRow />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <nav aria-label={t("label")}>
            {groups.map(({ group, items: inGroup }, index) => (
              <div key={group}>
                {index > 0 && <SidebarSeparator />}
                <ul className="flex flex-col gap-0.5">
                  {inGroup.map((item) => {
                    const Item = counted[item.key] ?? Destination;
                    return (
                      <li key={item.key}>
                        <Item item={item} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <PersonMenu />
        </SidebarFooter>
      </SidebarBody>
    </Sidebar>
  );
}
