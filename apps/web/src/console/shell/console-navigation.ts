// The console's destinations and who sees them: support everything but Staff, which super admins manage alone
// (spec 5). Hiding is for convenience only; the console's api refuses support's calls there anyway.
import {
  ActivityIcon,
  CirclePlusIcon,
  GiftIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MessageCircleIcon,
  ScrollTextIcon,
  ServerCogIcon,
  UserCogIcon,
  type LucideIcon,
} from "lucide-react";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, type ConsoleStaff } from "../session/staff-context";

export interface ConsoleNavigationItem {
  /** Also the message key in the "console.navigation" namespace. */
  key: "home" | "onboard" | "invites" | "usage" | "plans" | "whatsapp" | "jobs" | "log" | "staff";
  href: string;
  icon: LucideIcon;
  /** Shown to super admins only. */
  superAdminOnly: boolean;
}

export const consoleNavigationItems: readonly ConsoleNavigationItem[] = [
  { key: "home", href: consoleRoutes.home, icon: LayoutDashboardIcon, superAdminOnly: false },
  { key: "onboard", href: consoleRoutes.onboard, icon: CirclePlusIcon, superAdminOnly: false },
  { key: "invites", href: consoleRoutes.invites, icon: GiftIcon, superAdminOnly: false },
  { key: "usage", href: consoleRoutes.usage, icon: ActivityIcon, superAdminOnly: false },
  { key: "plans", href: consoleRoutes.plans, icon: LayersIcon, superAdminOnly: false },
  { key: "whatsapp", href: consoleRoutes.whatsapp, icon: MessageCircleIcon, superAdminOnly: false },
  { key: "jobs", href: consoleRoutes.jobs, icon: ServerCogIcon, superAdminOnly: false },
  { key: "log", href: consoleRoutes.log, icon: ScrollTextIcon, superAdminOnly: false },
  { key: "staff", href: consoleRoutes.staff, icon: UserCogIcon, superAdminOnly: true },
];

/** The items this person may use, in order. */
export function visibleConsoleItems(staff: Pick<ConsoleStaff, "level">): ConsoleNavigationItem[] {
  return consoleNavigationItems.filter((item) => !item.superAdminOnly || isSuperAdmin(staff));
}

const isAt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Whether the item is the current page: the dashboard on its own page and on an organization's, which it leads to
 * (onboarding a new one is Onboard's), the others on their path and below.
 */
export function isCurrentConsoleItem(item: ConsoleNavigationItem, pathname: string): boolean {
  if (item.href !== consoleRoutes.home) return isAt(pathname, item.href);
  const onAnOrganization = isAt(pathname, consoleRoutes.organizations) && !isAt(pathname, consoleRoutes.onboard);
  return pathname === consoleRoutes.home || onAnOrganization;
}
