// The app's destinations and who sees them (spec 11: navigation follows the caller's permissions and entitlements).
// Hiding is for convenience only; the api refuses whatever a role or the plan doesn't allow. An item's `module` is
// what the organization's plan must include for it to show (request check 3).
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { HistoryIcon, HouseIcon, SettingsIcon, ShieldCheckIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { holds, type SignedInMember } from "@/session/me-context";
import { routes } from "@/lib/routes";

export interface NavigationItem {
  /** Also the message key in the "shell.navigation" namespace. */
  key: "home" | "staff" | "roles" | "settings" | "audit";
  href: string;
  icon: LucideIcon;
  /** The permission the item needs, if any. */
  requires: string | null;
  /** The module of the plan (spec 7.2) the item belongs to; null for the Foundation's own screens. */
  module: string | null;
}

export const navigationItems: readonly NavigationItem[] = [
  { key: "home", href: routes.home, icon: HouseIcon, requires: null, module: null },
  { key: "staff", href: routes.staff, icon: UsersIcon, requires: "staff:manage", module: null },
  { key: "roles", href: routes.roles, icon: ShieldCheckIcon, requires: "roles:manage", module: null },
  { key: "settings", href: routes.settings, icon: SettingsIcon, requires: "settings:manage", module: null },
  { key: "audit", href: routes.audit, icon: HistoryIcon, requires: "audit:view", module: null },
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

/**
 * Whether the item is the current page: the home item only on "/", the others on their path and below it, unless an
 * item deeper down is (the audit log, under /settings, is current on its page, not Settings).
 */
/** Whether the page at `pathname` is `href` or below it ("/account/notifications" is under "/account"). */
export function isAtOrUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isCurrent(item: NavigationItem, pathname: string): boolean {
  if (item.href === routes.home) return pathname === routes.home;
  const isAt = (href: string) => isAtOrUnder(pathname, href);
  return (
    isAt(item.href) && !navigationItems.some((deeper) => deeper.href.startsWith(`${item.href}/`) && isAt(deeper.href))
  );
}
