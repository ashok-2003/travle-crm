"use client";

// The phone's bar above the page: the organization's name and the bell, so the bottom bar keeps its destinations
// (DESIGN.md: 4-5, More included). Wide screens have both in the sidebar instead. Rendered once on every signed-in
// page, it also has the bell ask again whenever a push arrives.
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { useRefreshOnPush } from "@/notifications/bell/use-refresh-on-push";
import { useMe } from "@/session/me-context";

export function TopBar() {
  const me = useMe();
  useRefreshOnPush();
  return (
    <div className="md:hidden">
      <header className="flex min-h-14 items-center justify-between gap-2 py-1 pr-2 pl-4">
        <p className="script-leading min-w-0 text-section font-semibold break-words">{me.organization.name}</p>
        <NotificationBell opensAs="sheet" />
      </header>
      <Separator />
    </div>
  );
}
