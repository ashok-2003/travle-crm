// The app's destinations and who sees them (spec 11: navigation follows the caller's permissions and entitlements).
// Hiding is for convenience only; the api refuses whatever a role or the plan doesn't allow. An item's `module` is
// what the organization's plan must include for it to show (request check 3).
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import {
  CalendarCheckIcon,
  ChartColumnIcon,
  BriefcaseBusinessIcon,
  BusIcon,
  HandshakeIcon,
  FileTextIcon,
  HistoryIcon,
  HouseIcon,
  IndianRupeeIcon,
  InboxIcon,
  MessageCircleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { holds, type SignedInMember } from "@/session/me-context";
import { routes } from "@/lib/routes";

/** The sidebar's headings, in order; also message keys in "shell.navigation.groups". */
export const navigationGroups = ["work", "team", "manage"] as const;
export type NavigationGroup = (typeof navigationGroups)[number];

export interface NavigationItem {
  /** Also the message key in the "shell.navigation" namespace. */
  key:
    | "home"
    | "today"
    | "leads"
    | "inbox"
    | "quotes"
    | "bookings"
    | "departures"
    | "suppliers"
    | "reports"
    | "finance"
    | "staff"
    | "roles"
    | "settings"
    | "audit";
  /** The sidebar heading it sits under; phones list the items without headings. */
  group: NavigationGroup;
  href: string;
  icon: LucideIcon;
  /** The permission the item needs, if any. */
  requires: string | null;
  /** The module of the plan (spec 7.2) the item belongs to; null for the Foundation's own screens. */
  module: PlanModule | null;
}

export const navigationItems: readonly NavigationItem[] = [
  { key: "home", group: "work", href: routes.home, icon: HouseIcon, requires: null, module: null },
  { key: "today", group: "work", href: routes.today, icon: CalendarCheckIcon, requires: "leads:view", module: "crm" },
  { key: "leads", group: "work", href: routes.leads, icon: InboxIcon, requires: "leads:view", module: "crm" },
  { key: "inbox", group: "work", href: routes.inbox, icon: MessageCircleIcon, requires: "inbox:view", module: "inbox" },
  { key: "quotes", group: "work", href: routes.quotes, icon: FileTextIcon, requires: "quotes:view", module: "quotes" },
  {
    key: "bookings",
    group: "work",
    href: routes.bookings,
    icon: BriefcaseBusinessIcon,
    requires: "bookings:view",
    module: "bookings",
  },
  {
    key: "departures",
    group: "work",
    href: routes.departures,
    icon: BusIcon,
    requires: "departures:view",
    module: "departures",
  },
  {
    key: "suppliers",
    group: "work",
    href: routes.suppliers,
    icon: HandshakeIcon,
    requires: "suppliers:view",
    module: "suppliers",
  },
  {
    key: "reports",
    group: "work",
    href: routes.reports,
    icon: ChartColumnIcon,
    requires: "money:view_reports",
    module: "crm",
  },
  {
    key: "finance",
    group: "manage",
    href: routes.finance,
    icon: IndianRupeeIcon,
    requires: "accounts:view",
    module: "accounts",
  },
  { key: "staff", group: "team", href: routes.staff, icon: UsersIcon, requires: "staff:manage", module: null },
  { key: "roles", group: "team", href: routes.roles, icon: ShieldCheckIcon, requires: "roles:manage", module: null },
  {
    key: "settings",
    group: "manage",
    href: routes.settings,
    icon: SettingsIcon,
    requires: "settings:manage",
    module: null,
  },
  { key: "audit", group: "manage", href: routes.audit, icon: HistoryIcon, requires: "audit:view", module: null },
];

/** Whether the plan's modules (subscription.get's) include the item's; while they are unknown, every item shows. */
export function isOnPlan(item: Pick<NavigationItem, "module">, modules: readonly PlanModule[] | undefined): boolean {
  return item.module === null || modules === undefined || modules.some((module) => module === item.module);
}

/** The items this member may use, in order: their role holds the item's permission, their plan its module. */
export function visibleNavigationItems(me: SignedInMember, modules?: readonly PlanModule[]): NavigationItem[] {
  return navigationItems.filter(
    (item) => (item.requires === null || holds(me, item.requires)) && isOnPlan(item, modules),
  );
}

/** Whether the page at `pathname` is `href` or below it ("/account/notifications" is under "/account"). */
export function isAtOrUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Whether the item is the current page: the home item only on "/", the others on their path and below it, unless an
 * item deeper down is (the audit log, under /settings, is current on its page, not Settings). The setup checklist
 * counts as under Settings, which it leads back to.
 */
export function isCurrent(item: NavigationItem, pathname: string): boolean {
  if (item.href === routes.home) return pathname === routes.home;
  const isAt = (href: string) => isAtOrUnder(pathname, href);
  if (item.href === routes.settings && isAt(routes.setup)) return true;
  return (
    isAt(item.href) && !navigationItems.some((deeper) => deeper.href.startsWith(`${item.href}/`) && isAt(deeper.href))
  );
}
